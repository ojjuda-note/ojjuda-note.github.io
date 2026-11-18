import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = name => readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');

test('discovery filtering uses its own opt-in and keeps dated answers paginated within it', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create schema ojjuda_restaurants_internal; create schema ojjuda_account_internal;
    create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key, nickname text);
    create table ojjuda_account_internal.member_identity(user_id uuid primary key, birth_date date, gender text);
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(bucket_id text);
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    create function ojjuda_restaurants_internal.member_allowed() returns boolean language sql stable
      as $$select exists(select from auth.users where id=auth.uid())$$;
    create function ojjuda_restaurants_internal.require_member() returns uuid language plpgsql stable as $$
      begin
        if not ojjuda_restaurants_internal.member_allowed() then raise exception 'member required' using errcode='42501'; end if;
        return auth.uid();
      end; $$;
  `);
  const migrations = await readdir(new URL('../supabase/migrations/', import.meta.url));
  for (const file of migrations.filter(name => name.startsWith('20261117') && name.includes('_pajang_') &&
      name <= '20261117210000_pajang_discovery_gender.sql' && !name.includes('_exchange_photos')).sort()) {
    await db.exec(await migration(file));
  }
  await db.exec(await migration("20261117235000_pajang_my_answers.sql"));
  await db.exec(await migration("20261117235950_pajang_edit_current_answer.sql"));
  await db.exec(await migration("20261118052051_pajang_persistent_location.sql"));
  await db.exec(`create schema ojjuda_note_internal;
    create table ojjuda_note_internal.card_locations(card_id uuid primary key,author_id uuid,exact_lat double precision,exact_lon double precision);`);
  await db.exec(await migration("20261118084120_shared_park_pajang_location.sql"));
  const account = randomUUID();
  const writer = randomUUID();
  await db.query('insert into auth.users values ($1)', [account]);
  await db.query('insert into public.profiles values ($1,$2)', [account,'회원']);
  await db.query("insert into ojjuda_account_internal.member_identity values ($1,date '1990-02-01','female')", [account]);
  await db.query("insert into pajang_private.people(id,owner_id,name,region,interest) values ($1,$2,'회원','경기도','walk')", [writer,account]);
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:account})]);
  await t.test('location preference survives expiry, blocks late arrivals, and is scoped to its member',async()=>{
    const member=async(action,data={})=>(await db.query('select public.pajang_member($1,$2) as value',[action,data])).rows[0].value;
    const fresh=await member('entry');
    assert.equal(fresh.locationEnabled,true);
    assert.equal(fresh.locationVersion,0);
    const cell={latCell:3757,lonCell:12698,consent:true,shareBearing:true,accountId:account};
    let state=await member('radar-enable',{...cell,automatic:true,locationVersion:0});
    assert.equal(state.radarOn,true);
    assert.equal(state.locationVersion,0);
    state=await member('radar-disable',{locationVersion:0});
    assert.equal(state.locationEnabled,false);
    assert.equal(state.radarOn,false);
    assert.equal(state.locationVersion,1);
    state=await member('radar-enable',{...cell,automatic:true,locationVersion:0});
    assert.equal(state.locationEnabled,false,'a pending entry cannot turn sharing back on');
    assert.equal(state.radarOn,false);
    assert.equal((await member('entry')).locationEnabled,false,'re-entry preserves off');
    await assert.rejects(()=>member('radar-enable',{...cell,locationVersion:0}),{code:'PT412'});
    state=await member('radar-enable',{...cell,locationVersion:1});
    assert.equal(state.locationEnabled,true);
    assert.equal(state.locationVersion,2);
    await db.query("update pajang_private.locations set day=day-1 where person=$1",[writer]);
    state=await member('state');
    assert.equal(state.locationEnabled,true,'next-day coordinates expire independently of the preference');
    assert.equal(state.radarOn,false);
    state=await member('radar-enable',{...cell,automatic:true,locationVersion:2});
    assert.equal(state.radarOn,true);
    await assert.rejects(()=>member('radar-enable',{...cell,accountId:randomUUID(),automatic:true,locationVersion:2}),{code:'42501'});
    await assert.rejects(()=>member('radar-enable',{...cell,consent:false,locationVersion:2}));
    assert.equal((await member('state')).locationVersion,2,'failed saves roll back the preference too');
    await member('radar-disable',{locationVersion:2});
    assert.equal((await db.query('select count(*)::int n from pajang_private.locations where person=$1',[writer])).rows[0].n,0);
  });
  await t.test('Park and Pajang share the account switch and reject late location writes',async()=>{
    const preference=async(enabled=null,version=null,extra={})=>(await db.query(
      'select public.ojjuda_location_preference($1,$2,$3,$4) as value',
      [enabled,version,extra.account??account,extra.legacy??false])).rows[0].value;
    const member=async(action,data={})=>(await db.query('select public.pajang_member($1,$2) as value',[action,data])).rows[0].value;
    let choice=await preference();assert.equal(choice.enabled,false);
    choice=await preference(true,choice.version);
    assert.equal((await member('state')).locationEnabled,true,'Park on is reflected by Pajang');
    await db.query('insert into ojjuda_note_internal.card_locations values($1,$2,37.5,127)',[randomUUID(),account]);
    let state=await member('radar-disable',{locationVersion:choice.version});
    assert.equal((await preference()).enabled,false,'Pajang off is reflected by Park');
    await assert.rejects(()=>db.query('insert into ojjuda_note_internal.card_locations values($1,$2,37.5,127)',[randomUUID(),account]),{code:'42501'});
    await assert.rejects(()=>preference(true,choice.version),{code:'PT412'});
    choice=await preference(true,state.locationVersion);
    await member('radar-enable',{latCell:3750,lonCell:12700,consent:true,automatic:true,locationVersion:choice.version});
    choice=await preference(false,choice.version);
    state=await member('state');assert.equal(state.radarOn,false);assert.equal(state.locationEnabled,false);
    assert.equal((await db.query('select count(*)::int n from pajang_private.locations where person=$1',[writer])).rows[0].n,0);
    await assert.rejects(()=>preference(null,null,{account:randomUUID()}),{code:'42501'});
    choice=await preference(true,choice.version);
    assert.equal((await preference(null,null,{legacy:true})).enabled,true,'old Park settings cannot undo a newer explicit choice');
    const parkOnly=randomUUID();await db.query('insert into auth.users values($1)',[parkOnly]);
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:parkOnly})]);
    const initial=await preference(null,null,{account:parkOnly,legacy:true});assert.equal(initial.enabled,false);assert.equal(initial.version,1);
    assert.equal((await member('entry')).locationEnabled,false,'a future Pajang participant inherits Park off');
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:account})]);
  });
  await t.test('an answer becomes visible on the nearby radar once its delayed location is saved',async()=>{
    await db.exec('begin');
    try{
      const observer=randomUUID(),observerProfile=randomUUID();
      const member=async(action,data={})=>(await db.query('select public.pajang_member($1,$2) as value',[action,data])).rows[0].value;
      const login=async user=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user})]);
      await db.query('insert into auth.users values ($1)',[observer]);
      await db.query("insert into ojjuda_account_internal.member_identity values ($1,date '1991-01-01','male')",[observer]);
      await db.query("insert into pajang_private.people(id,owner_id,name,region,interest) values ($1,$2,'관찰자','경기도','walk')",[observerProfile,observer]);
      const entry=await member('entry');
      await member('answer',{body:'위치 확인 중에 저장한 답변',day:entry.day,slot:entry.slot,questionId:entry.question.id,archive:true});
      await login(observer);
      const before=await member('radar-enable',{latCell:3757,lonCell:12698,consent:true,automatic:true,locationVersion:0});
      assert.equal(before.people.find(person=>person.id===writer).range,undefined,'an answer without a saved location has no radar distance');
      await login(account);
      const choice=(await db.query('select public.ojjuda_location_preference(true,null,$1,false) as value',[account])).rows[0].value;
      await member('radar-enable',{latCell:3757,lonCell:12698,consent:true,automatic:true,locationVersion:choice.version});
      await login(observer);
      const visible=(await member('state')).people.find(person=>person.id===writer);
      assert.equal(visible.body,'위치 확인 중에 저장한 답변');assert.equal(visible.range,1);
    }finally{await db.exec('rollback');}
  });
  // The oldest answer falls outside the 30 calendar dates. Every other row has the same author.
  await db.query(`insert into pajang_private.answers(person,day,slot,at,body,question_prompt,archived)
    select $1,(now() at time zone 'Asia/Seoul')::date-n,'am',100-n,'답변 '||n,'질문 '||n,true
    from generate_series(0,30) n`, [writer]);
  const value = async (sql, params = []) => (await db.query(sql, params)).rows[0].v;
  const feed = (gender, cursor = null) => value("select public.pajang_discovery_feed($1,'walk','latest',$2) as v", [cursor,gender]);
  const preference = visible => value('select public.pajang_discovery_visibility($1) as v',[visible]);
  await value("select public.pajang_exchange('save',null,null,$1) as v", [{fields:{},showGender:true}]);
  assert.deepEqual(await preference(null), {visible:false,hasGender:true});
  assert.equal((await feed('female')).total, 0);
  assert.equal((await feed('all')).total, 30);

  const mine=()=>value("select public.pajang_my_answers() as v");
  assert.equal((await mine()).length,30);
  assert.equal((await mine())[0].body,"답변 0");
  await preference(true);
  const first = await feed('female');
  assert.equal(first.total, 30);
  assert.equal(first.items.length, 24);
  assert.equal(first.items.some(row => 'gender' in row || 'age' in row), false);
  assert.equal((await feed('female',first.nextCursor)).items.length, 6);
  await assert.rejects(() => feed('male',first.nextCursor), {code:'22023'});
  assert.equal((await feed('male')).total, 0);
  await preference(false);
  assert.equal((await feed('female',first.nextCursor)).total, 0);
  assert.equal((await value('select public.pajang_discovery_feed() as v')).total, 30);
  assert.equal((await value("select public.pajang_exchange('mine') as v")).showGender, true);
  const stranger=randomUUID();
  await db.query("insert into auth.users values ($1)",[stranger]);
  await db.query("insert into ojjuda_account_internal.member_identity values ($1,date '1990-02-01','male')",[stranger]);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:stranger})]);
  await assert.rejects(mine,{code:'42501'});
  await db.query("insert into pajang_private.people(id,owner_id,name,region,interest) values ($1,$2,'다른 회원','','')",[randomUUID(),stranger]);
  assert.deepEqual(await mine(),[]);

  await t.test('current answer edits keep the original row and reject stale drafts',async()=>{
    const member=(action,data={})=>value("select public.pajang_member($1,$2) as v",[action,data]);
    const entry=await member('entry');
    const round={day:entry.day,slot:entry.slot,questionId:entry.question?.id};
    const edit=(extra={})=>member('edit-answer',{...round,previousBody:'첫 답변',body:'수정한 답변',...extra});
    await assert.rejects(()=>edit({person:writer}),{code:'PT412'});
    const first=await member('answer',{...round,body:'첫 답변',archive:true});
    const saved=await edit();
    assert.equal(saved.me.body,'수정한 답변');
    assert.equal(saved.me.at,first.me.at);
    assert.equal((await mine()).length,1);
    assert.equal((await mine())[0].body,'수정한 답변');
    assert.equal((await edit()).me.body,'수정한 답변','a network retry is idempotent');
    await assert.rejects(()=>edit({body:'다른 탭의 답변'}),{code:'PT412'});
    await assert.rejects(()=>edit({slot:round.slot==='am'?'pm':'am'}),{code:'PT409'});
    if(round.questionId!=null)await assert.rejects(()=>edit({questionId:-1}),{code:'PT409'});
    await assert.rejects(()=>edit({body:' '}),{code:'P0001'});
    assert.equal((await member('answer',{...round,body:'이전 등록 재시도'})).me.body,'수정한 답변');
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:account})]);
    const board=await value("select public.pajang_discovery_feed() as v");
    const published=board.items.filter(a=>a.peer===saved.me.id);
    assert.equal(published.length,1);
    assert.equal(published[0].body,'수정한 답변');
  });

  await t.test('owners can read every past answer while other members see only published answers',async()=>{
    await db.exec(await migration('20261118012000_pajang_owner_answer_history.sql'));
    await db.exec(await migration('20261118012000_pajang_owner_answer_history.sql'));
    await db.query(`insert into pajang_private.answers(person,day,slot,at,body,question_prompt,archived)
      values ($1,(now() at time zone 'Asia/Seoul')::date-1,'pm',101,'이전 답변','그때의 질문',false),
        ($1,(now() at time zone 'Asia/Seoul')::date+1,'pm',102,'미래 답변','미래 질문',true)`,[writer]);
    const readAll=async request=>{
      const items=[];
      let cursor=null;
      do{
        const page=await request(cursor);
        items.push(...page.items);
        cursor=page.nextCursor;
      }while(cursor);
      return items;
    };
    const board=cursor=>value('select public.pajang_answer_feed($1) as v',[cursor]);
    const discovered=cursor=>feed('all',cursor);
    assert.equal((await mine()).length,32);
    assert.deepEqual((await mine()).find(row=>row.body==='이전 답변'),{
      day:(await value("select ((now() at time zone 'Asia/Seoul')::date-1)::text as v")),
      slot:'pm',question:'그때의 질문',body:'이전 답변'
    });
    for(const request of [board,discovered]){
      const own=(await readAll(request)).filter(row=>row.peer===writer);
      assert.equal(own.length,32);
      assert.equal(new Set(own.map(row=>row.day+'/'+row.slot)).size,32);
      assert.equal(own.some(row=>row.body==='미래 답변'),false);
      assert.equal(own.find(row=>row.body==='이전 답변').question,'그때의 질문');
    }
    assert.equal((await value('select public.pajang_discovery_feed() as v')).total,33);
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:stranger})]);
    assert.equal((await mine()).length,1);
    for(const request of [board,discovered]){
      const others=(await readAll(request)).filter(row=>row.peer===writer);
      assert.equal(others.length,30);
      assert.equal(others.some(row=>['이전 답변','미래 답변','답변 30'].includes(row.body)),false);
    }
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:account,is_anonymous:true})]);
    for(const request of [mine,()=>board(null),()=>discovered(null)])await assert.rejects(request,{code:'42501'});
  });

  await t.test('a full year stays paginated with matching signal limits and private-answer protection',async()=>{
    await db.exec(await migration('20261118093216_pajang_answer_history_one_year.sql'));
    const publicationMigrations=migrations.filter(file=>file.endsWith('_pajang_answer_publication_policy.sql'));
    assert.equal(publicationMigrations.length,1,'exactly one per-answer publication policy migration');
    await db.exec(await migration(publicationMigrations[0]));
    assert.equal((await db.query("select publication_window_days from pajang_private.answers where person=$1 and body='답변 30'",[writer])).rows[0].publication_window_days,30);
    await db.exec('begin');
    try {
      const call=(action,data={})=>value('select public.pajang_member($1,$2) as v',[action,data]);
      for(const [policy,archive,expected] of [[null,true,30],['year-v1',true,365],['year-v1',false,30],['unknown',true,30]]){
        const testAccount=randomUUID(),testPerson=randomUUID();
        await db.query('insert into auth.users values ($1)',[testAccount]);
        await db.query("insert into public.profiles values ($1,'검사회원')",[testAccount]);
        await db.query("insert into pajang_private.people(id,owner_id,name,region,interest) values ($1,$2,'검사회원','','')",[testPerson,testAccount]);
        await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:testAccount})]);
        const entry=await call('entry');
        const data={body:'새 공개 설정 검사',day:entry.day,slot:entry.slot,questionId:entry.question?.id,archive,publicationPolicy:policy};
        await call('answer',data);
        await call('answer',{...data,archive:true,publicationPolicy:'year-v1'});
        await call('edit-answer',{...data,body:'편집 후 공개 기간 확인',previousBody:data.body,archive:true,publicationPolicy:'year-v1'});
        const row=(await db.query('select archived,body,publication_window_days from pajang_private.answers where person=$1',[testPerson])).rows[0];
        assert.deepEqual(row,{archived:archive,body:'편집 후 공개 기간 확인',publication_window_days:expected});
      }
    } finally {await db.exec('rollback');}

    await db.exec(await readFile(new URL('./pajang-answer-history.sql',import.meta.url),'utf8'));
    await db.query(`insert into pajang_private.answers(person,day,slot,at,body,question_prompt,archived,publication_window_days)
      select $1,(now() at time zone 'Asia/Seoul')::date-n,case when n=30 then 'pm' else 'am' end,
          100-n,'새 공개 답변 '||n,'질문 '||n,true,365
      from generate_series(30,365) n`,[writer]);
    await db.query(`insert into pajang_private.answers(person,day,slot,at,body,question_prompt,archived)
      values($1,(now() at time zone 'Asia/Seoul')::date-200,'pm',-100,'공개하지 않은 예전 답변','비공개 질문',false)`,[writer]);
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:stranger})]);
    const board=cursor=>value('select public.pajang_answer_feed($1) as v',[cursor]);
    const discovered=cursor=>feed('all',cursor);
    for(const request of [board,discovered]){
      const items=[];let cursor=null,pages=0;
      do{
        const page=await request(cursor);assert.ok(page.items.length<=24);
        items.push(...page.items);cursor=page.nextCursor;
        assert.ok(++pages<=17,'the year finishes without a repeated cursor');
      }while(cursor);
      const others=items.filter(row=>row.peer===writer);
      assert.equal(others.length,365);
      assert.equal(new Set(others.map(row=>row.day+'/'+row.slot)).size,365);
      assert.equal(others.at(-1).body,'새 공개 답변 364');
      assert.equal(others.at(-1).question,'질문 364');
      assert.equal(others.some(row=>['이전 답변','미래 답변','답변 30','새 공개 답변 365','공개하지 않은 예전 답변'].includes(row.body)),false);
    }
    assert.equal((await feed('all')).total,365);
    assert.equal((await feed('female')).total,0,'the longer window does not reveal gender without opt-in');
    for(const order of ['recommend','local']){
      const page=await value("select public.pajang_discovery_feed(null,'walk',$1,'all') as v",[order]);
      assert.equal(page.total,365);assert.equal(page.items.length,24);assert.ok(page.nextCursor);
    }
    const member=(action,data={})=>value('select public.pajang_member($1,$2) as v',[action,data]);
    const date=days=>value("select ((now() at time zone 'Asia/Seoul')::date-$1::int)::text as v",[days]);
    await member('signal',{peer:writer,answerDay:await date(364),answerSlot:'am'});
    await assert.rejects(()=>member('signal',{peer:writer,answerDay:'2000-01-01',answerSlot:'am'}),{code:'PT409'});
    const expired=await date(365),legacyExpired=await date(30),privateDay=await date(200);
    await assert.rejects(()=>member('signal',{peer:writer,answerDay:legacyExpired,answerSlot:'am'}),{code:'PT409'});
    await assert.rejects(()=>member('signal',{peer:writer,answerDay:expired,answerSlot:'am'}),{code:'PT409'});
    await assert.rejects(()=>member('signal',{peer:writer,answerDay:privateDay,answerSlot:'pm'}),{code:'PT409'});
    await member('block',{peer:writer});
    assert.equal((await feed('all')).total,0,'blocking still hides the whole year');
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:account})]);
    const own=await mine();
    assert.ok(own.some(row=>row.body==='새 공개 답변 365'),'the owner keeps older saved answers');
    assert.ok(own.some(row=>row.body==='공개하지 않은 예전 답변'));
    assert.equal(own.some(row=>row.body==='미래 답변'),false);
  });
});
