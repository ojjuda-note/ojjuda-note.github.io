const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const {fixture:pastFixture,clock}=require('./fixtures/pajang-past-questions-fixture.cjs');

const directory=path.join(__dirname,'../supabase/migrations');
const read=suffix=>fs.readFileSync(path.join(directory,fs.readdirSync(directory).find(name=>name.endsWith(suffix))),'utf8');
const migration=read('_pajang_nearby_recent_answers.sql');
const key=answer=>`${answer.day}/${answer.slot}`;
const denied=fn=>assert.rejects(fn,error=>error.code==='42501');

test('nearby radar uses the current and previous two question rounds without changing the current feed',async t=>{
  const f=await pastFixture(t,read('_pajang_past_questions.sql'));
  const {db,value,as,seed,setNow,originalAnswer,like,snapshot}=f;
  const shared=read('_shared_park_pajang_location.sql');
  await db.exec('drop function public.ojjuda_location_preference(boolean,bigint,uuid)');
  await db.exec(shared.slice(0,shared.indexOf('CREATE OR REPLACE FUNCTION public.pajang_member')));
  await db.exec(`
    alter table public.user_private add column banned_until timestamptz;
    create table ojjuda_account_deletion.requests(user_id uuid primary key);
  `);
  const state=(actor,action='state',data={},role='authenticated',claims={})=>as(actor,
    ()=>value('select public.pajang_member($1,$2) as value',[action,data]),role,claims);
  const locate=async(actor,day='2026-11-22',options={})=>{
    await db.query(`insert into ojjuda_account_internal.location_preferences(user_id,enabled,version)
      values($1,$2,0) on conflict(user_id) do update set enabled=excluded.enabled`,[actor.id,options.enabled??true]);
    await db.query('update pajang_private.people set location_enabled=$2 where id=$1',[actor.person,options.enabled??true]);
    await db.query(`insert into pajang_private.locations(person,day,lat,lon,direction)
      values($1,$2,$3,$4,$5) on conflict(person) do update
      set day=excluded.day,lat=excluded.lat,lon=excluded.lon,direction=excluded.direction`,
    [actor.person,day,options.lat??3750,options.lon??12700,options.direction??true]);
  };
  const prefs=(actor,enabled)=>as(actor,()=>value('select public.ojjuda_location_preference($1) as value',[enabled]));
  const find=(result,actor)=>result.nearbyPeople.find(person=>person.id===actor.person);
  const viewer=await seed(),peer=await seed();
  await locate(viewer);await locate(peer);
  await originalAnswer(peer,'2026-11-22','am','현재 답변');
  const beforeState=await state(viewer),beforeData=await snapshot();
  const beforeDefinitions=await f.definitions();
  await db.exec(clock(migration));

  await t.test('only adds nearbyPeople and keeps stored data, callers, permissions and private helpers isolated',async()=>{
    const afterState=await state(viewer);
    const {nearbyPeople,...unchanged}=afterState;
    assert.deepEqual(unchanged,beforeState);
    assert.equal(nearbyPeople.length,1);assert.equal(nearbyPeople[0].id,peer.person);
    assert.deepEqual(await snapshot(),beforeData);
    const afterDefinitions=await f.definitions();
    for(const signature of Object.keys(beforeDefinitions)){
      const before=beforeDefinitions[signature],after=afterDefinitions[signature];
      if(signature==='public.pajang_member(text,jsonb)'){
        assert.deepEqual({...after,definition:undefined},{...before,definition:undefined});
        const restored=after.definition.replace(/ return result\|\|pajang_private\.signal_quota\(u,today\)\|\|jsonb_build_object\([\s\S]*?else '\[\]'::jsonb end\);/,
          ' return result||pajang_private.signal_quota(u,today);');
        assert.equal(restored,before.definition);
      }else assert.deepEqual(after,before);
    }
    const permission=await value(`select jsonb_build_object('definer',p.prosecdef,'config',p.proconfig,
      'member',has_function_privilege('authenticated',p.oid,'execute'),
      'guest',has_function_privilege('anon',p.oid,'execute'),
      'service',has_function_privilege('service_role',p.oid,'execute')) as value
      from pg_proc p where p.oid='pajang_private.nearby_people(uuid,date,text,pajang_private.locations)'::regprocedure`);
    assert.deepEqual(permission,{definer:false,config:['search_path=""'],member:false,guest:false,service:false});
    await denied(()=>as(viewer,()=>db.query("select pajang_private.nearby_people($1,'2026-11-22','am',null)",[viewer.person])));
    assert.equal(Object.hasOwn(await state(viewer,'entry'),'nearbyPeople'),false);
    await denied(()=>state(null));await denied(()=>state(viewer,'state',{},'anon'));
    for(const options of [{anonymous:true},{minor:true},{deleted:true},{banned:true},{pending:true},{suspended:true},{noProfile:true},{unjoined:true}]){
      const actor=await seed(options);await denied(()=>state(actor));
    }
  });

  await t.test('returns one person with up to three dated original answers, even with no current answer',async()=>{
    await setNow('2026-11-22T01:00:00Z');
    const owner=await seed(),previousOnly=await seed(),oldOnly=await seed(),futureOnly=await seed();
    for(const actor of [owner,previousOnly,oldOnly,futureOnly])await locate(actor);
    const current=await originalAnswer(owner,'2026-11-22','am','현재 질문 답변',{at:100});
    await originalAnswer(owner,'2026-11-21','pm','직전 질문 답변',{at:900});
    const second=await originalAnswer(owner,'2026-11-21','am','두 번째 지난 질문 답변',{at:800});
    await originalAnswer(owner,'2026-11-20','pm','너무 오래된 질문에 방금 작성',{at:Date.parse('2026-11-22T01:00:00Z')});
    await originalAnswer(owner,'2026-11-22','pm','미래 질문 답변');
    await originalAnswer(previousOnly,'2026-11-21','pm','오늘 답하지 않은 회원');
    await originalAnswer(oldOnly,'2026-11-20','pm','범위 밖 질문에 오늘 작성',{at:Date.parse('2026-11-22T01:00:00Z')});
    await originalAnswer(futureOnly,'2026-11-22','pm','다음 질문');
    await originalAnswer(viewer,'2026-11-22','am','내 답변은 위치표시에 넣지 않아요');
    await like(viewer,current,true);await like(viewer,second,true);
    const result=await state(viewer),card=find(result,owner);
    assert.equal(result.nearbyPeople.filter(p=>p.id===owner.person).length,1);
    assert.deepEqual(card.answers.map(key),['2026-11-22/am','2026-11-21/pm','2026-11-21/am']);
    assert.equal(card.body,current.body);assert.equal(card.at,100);
    assert.equal(card.answers[0].question,current.question);
    assert.deepEqual(card.answers.map(a=>[a.likeCount,a.liked]),[[1,true],[0,false],[1,true]]);
    assert.deepEqual(find(result,previousOnly).answers.map(key),['2026-11-21/pm']);
    assert.equal(result.people.some(p=>p.id===previousOnly.person),false,'home people remains current-round only');
    assert.equal(find(result,oldOnly),undefined);assert.equal(find(result,futureOnly),undefined);
    assert.equal(find(result,viewer),undefined);
    for(const card of result.nearbyPeople){
      assert.equal(card.answers.length<=3,true);
      assert.equal(['lat','lon','latCell','lonCell','owner_id','gender','age'].some(field=>field in card),false);
    }
  });

  await t.test('advances at Seoul noon and midnight, including year and month boundaries',async()=>{
    for(const scenario of [
      {now:'2026-12-31T14:59:59Z',day:'2026-12-31',expected:['2026-12-31/pm','2026-12-31/am','2026-12-30/pm']},
      {now:'2026-12-31T15:00:00Z',day:'2027-01-01',expected:['2027-01-01/am','2026-12-31/pm','2026-12-31/am']},
      {now:'2027-01-01T02:59:59Z',day:'2027-01-01',expected:['2027-01-01/am','2026-12-31/pm','2026-12-31/am']},
      {now:'2027-01-01T03:00:00Z',day:'2027-01-01',expected:['2027-01-01/pm','2027-01-01/am','2026-12-31/pm']}
    ]){
      await setNow(scenario.now);
      const actor=await seed(),author=await seed();await locate(actor,scenario.day);await locate(author,scenario.day);
      for(const entry of ['2026-12-30/am','2026-12-30/pm','2026-12-31/am','2026-12-31/pm','2027-01-01/am','2027-01-01/pm']){
        const [day,slot]=entry.split('/');await originalAnswer(author,day,slot,'경계 확인 '+entry);
      }
      const result=await state(actor);
      assert.deepEqual(find(result,author).answers.map(key),scenario.expected,scenario.now);
    }
    await setNow('2026-11-22T01:00:00Z');
  });

  await t.test('never resurrects hidden, unshared, blocked or pre-launch answers',async()=>{
    const owner=await seed(),actor=await seed();await locate(owner);await locate(actor);
    await originalAnswer(owner,'2026-11-22','am','현재 질문만 공개',{archived:false,window:30});
    await originalAnswer(owner,'2026-11-21','pm','이전 질문 비공개',{archived:false,window:30});
    await originalAnswer(owner,'2026-11-21','am','관리자 숨김',{hidden:true});
    assert.deepEqual(find(await state(actor),owner).answers.map(key),['2026-11-22/am']);
    await setNow('2026-11-22T03:00:00Z');assert.equal(find(await state(actor),owner),undefined);
    await setNow('2026-11-22T01:00:00Z');
    for(const [src,dst] of [[actor.person,owner.person],[owner.person,actor.person]]){
      await db.query('insert into pajang_private.blocks values($1,$2)',[src,dst]);
      assert.equal(find(await state(actor),owner),undefined);
      await db.query('delete from pajang_private.blocks where src=$1 and dst=$2',[src,dst]);
    }
    await setNow('2026-11-17T03:00:00Z');
    const firstViewer=await seed(),firstAuthor=await seed();await locate(firstViewer,'2026-11-17');await locate(firstAuthor,'2026-11-17');
    await originalAnswer(firstAuthor,'2026-11-17','pm','첫 공식 질문');
    await originalAnswer(firstAuthor,'2026-11-17','am','출시 전 오전',{question:'출시 전 질문'});
    await originalAnswer(firstAuthor,'2026-11-16','pm','출시 전 오후',{question:'출시 전 질문'});
    assert.deepEqual(find(await state(firstViewer),firstAuthor).answers.map(key),['2026-11-17/pm']);
    await setNow('2026-11-17T02:59:59Z');assert.deepEqual((await state(firstViewer)).nearbyPeople,[]);
    await setNow('2026-11-22T01:00:00Z');
  });

  await t.test('respects shared opt-out, fresh-day locations, 15km and direction consent',async()=>{
    const actor=await seed(),author=await seed();await locate(actor);await locate(author);
    await originalAnswer(author,'2026-11-21','pm','주변 답변');
    let card=find(await state(actor),author);assert.equal(card.range,1);assert.equal(card.sameCell,true);assert.equal(card.bearing,undefined);
    await locate(author,'2026-11-22',{lon:12701});
    card=find(await state(actor),author);assert.equal(card.bearing,90);assert.equal(card.range,1);
    await locate(author,'2026-11-22',{lon:12701,direction:false});
    card=find(await state(actor),author);assert.equal(card.bearing,undefined);assert.equal(card.range,1);
    await locate(author,'2026-11-22',{lon:12800});assert.equal(find(await state(actor),author),undefined);
    await locate(author,'2026-11-21');assert.equal(find(await state(actor),author),undefined);
    await locate(author);
    await prefs(author,false);assert.equal(find(await state(actor),author),undefined);
    // A stale old location row and legacy per-product flag must not override shared opt-out.
    await locate(author);await db.query('update ojjuda_account_internal.location_preferences set enabled=false where user_id=$1',[author.id]);
    assert.equal(find(await state(actor),author),undefined);
    await locate(author);await prefs(actor,false);assert.deepEqual((await state(actor)).nearbyPeople,[]);
    await locate(actor);await db.query('update ojjuda_account_internal.location_preferences set enabled=false where user_id=$1',[actor.id]);
    assert.deepEqual((await state(actor)).nearbyPeople,[]);
    await locate(actor,'2026-11-21');assert.deepEqual((await state(actor)).nearbyPeople,[]);
    await locate(actor);await db.query('delete from pajang_private.locations where person=$1',[actor.person]);
    assert.deepEqual((await state(actor)).nearbyPeople,[]);
    const version=(await state(actor)).locationVersion;
    const enabled=await state(actor,'radar-enable',{
      accountId:actor.id,locationVersion:version,consent:true,shareBearing:true,latCell:3750,lonCell:12700
    });
    assert.ok(find(enabled,author),'saving the location returns the recent answers immediately');
    const blocked=await state(actor,'block',{peer:author.person});
    assert.equal(find(blocked,author),undefined,'blocking takes effect in the same member response');
  });

  await t.test('does not display inactive, suspended, anonymous, underage or deleted peers',async()=>{
    const actor=await seed();await locate(actor);
    for(const options of [{anonymous:true},{minor:true},{deleted:true},{suspended:true},{noProfile:true},{banned:true},{pending:true}]){
      const author=await seed(options);await locate(author);
      if(options.banned)await db.query("update public.user_private set banned_until=now()+interval '1 year' where user_id=$1",[author.id]);
      if(options.pending)await db.query('insert into ojjuda_account_deletion.requests values($1)',[author.id]);
      await originalAnswer(author,'2026-11-21','pm','표시하면 안 되는 회원');
      assert.equal(find(await state(actor),author),undefined,JSON.stringify(options));
    }
  });
});
