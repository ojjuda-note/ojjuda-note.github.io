const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {test}=require('node:test');
const {fixture}=require('./fixtures/pajang-answer-likes-fixture.cjs');

const directory=path.join(__dirname,'../supabase/migrations');
const migrationName=fs.readdirSync(directory).find(name=>name.endsWith('_pajang_answer_likes.sql'));
assert.ok(migrationName,'the likes migration exists');
const migration=fs.readFileSync(path.join(directory,migrationName),'utf8');
const today='2026-11-19';
const rejects=(operation,code='42501')=>assert.rejects(operation,error=>error.code===code);
const withoutLikes=item=>{
  const {liked,likeCount,...rest}=item;
  return rest;
};

test('answer likes persist independently and preserve every existing feed boundary',async t=>{
  const f=await fixture(t,migration);
  const {db,value,as,seed,answer,like,mine,feedFor,discoveryFor,snapshot}=f;

  await t.test('patches only the three answer projections and preserves owner, ACL and security settings',async()=>{
    const patches=[...migration.matchAll(/\('([^']+)',\s*\$old\$([\s\S]*?)\$old\$,\s*\$new\$([\s\S]*?)\$new\$\)/g)];
    assert.equal(patches.length,3);
    for(const [,signature,oldText,newText] of patches){
      const before=f.beforeDefinitions[signature],after=f.afterDefinitions[signature];
      assert.deepEqual({...after,definition:before.definition},{...before});
      assert.equal(after.definition,before.definition.replace(oldText,newText));
      assert.equal(after.prosecdef,true);
      assert.match(after.definition,/pajang_private\.visible_answers/);
    }
    const security=await db.query(`select p.prosecdef,p.proconfig,
      has_function_privilege('authenticated',p.oid,'execute') as member,
      has_function_privilege('anon',p.oid,'execute') as guest,
      has_function_privilege('service_role',p.oid,'execute') as service
      from pg_proc p where p.oid='public.pajang_answer_like(uuid,date,text,boolean,uuid)'::regprocedure`);
    assert.deepEqual(security.rows,[{prosecdef:true,proconfig:['search_path=""'],member:true,guest:false,service:false}]);
    assert.equal(await value("select relrowsecurity as value from pg_class where oid='pajang_private.answer_likes'::regclass"),true);
  });

  await t.test('starts at zero, sets and unsets idempotently, allows self likes, and never touches coins or signals',async()=>{
    const owner=await seed(),alice=await seed(),bob=await seed();
    const item=await answer(owner,today,'am','검사용 공개 답변',{archived:false,at:5000});
    await db.query('insert into pajang_private.signals values($1,$2,$3,$4,987)',[alice.person,owner.person,today,'기존 신호']);
    await db.query('insert into pajang_private.messages values($1,$2,$3,$4,989)',[randomUUID(),alice.person,owner.person,'기존 대화']);
    await db.query('insert into pajang_private.signal_balances values($1,5)',[alice.id]);
    const before=await snapshot();
    const legacyDiscovery=await as(alice,()=>value('select public.pajang_discovery_feed(null,\'all\',\'latest\') as value'));
    for(const feed of [await feedFor(alice),await discoveryFor(alice),legacyDiscovery]){
      const card=feed.items.find(a=>a.peer===owner.person);
      assert.equal(card.liked,false);assert.equal(card.likeCount,0);
    }
    const reply=await like(alice,item);
    assert.deepEqual(reply,{peer:owner.person,day:today,slot:'am',liked:true,likeCount:1});
    const retries=await as(alice,()=>Promise.all(Array.from({length:12},()=>value(
      'select public.pajang_answer_like($1,$2,$3,true,$4) as value',[item.peer,item.day,item.slot,alice.person]))));
    assert.ok(retries.every(r=>r.liked&&r.likeCount===1));
    assert.equal((await like(bob,item)).likeCount,2);
    assert.equal((await like(owner,item)).likeCount,3);
    assert.equal((await mine(owner)).find(a=>a.day===today).likeCount,3);
    assert.equal((await mine(owner)).find(a=>a.day===today).liked,true);
    assert.deepEqual(await like(alice,item,false),{...reply,liked:false,likeCount:2});
    assert.equal((await like(alice,item,false)).likeCount,2);
    assert.equal((await feedFor(bob)).items.find(a=>a.peer===owner.person).liked,true);
    assert.equal((await discoveryFor(alice)).items.find(a=>a.peer===owner.person).liked,false);
    assert.equal((await like(owner,item,false)).likeCount,1);
    assert.equal((await like(bob,item,false)).likeCount,0);
    const alternating=await as(alice,()=>Promise.all([true,false,true,false].map(wanted=>value(
      'select public.pajang_answer_like($1,$2,$3,$4,$5) as value',[item.peer,item.day,item.slot,wanted,alice.person]))));
    assert.deepEqual(alternating.map(r=>r.likeCount),[1,0,1,0]);
    assert.equal((await feedFor(alice)).items.find(a=>a.peer===owner.person).likeCount,0);
    assert.deepEqual(await snapshot(),before,'answer bytes, people, wallet, signal quota, messages and preferences are unchanged');
  });

  await t.test('keeps each person/day/slot separate and exposes only the viewer own like state',async()=>{
    const owner=await seed(),reader=await seed(),other=await seed();
    const first=await answer(owner,'2026-11-18','am');
    const second=await answer(owner,'2026-11-18','pm');
    const third=await answer(owner,today,'am');
    const fourth=await answer(other,'2026-11-18','am');
    await like(reader,second);
    await like(owner,second);
    for(const item of [first,third,fourth]){
      const reply=await like(reader,item,false);
      assert.equal(reply.likeCount,0);
      assert.equal(reply.liked,false);
    }
    const visible=(await feedFor(reader)).items.filter(a=>a.peer===owner.person);
    assert.equal(visible.find(a=>a.slot==='pm').likeCount,2);
    assert.equal(visible.find(a=>a.slot==='pm').liked,true);
    assert.ok(visible.filter(a=>a.slot==='am').every(a=>a.likeCount===0&&!a.liked));
    const independent=(await feedFor(other)).items.find(a=>a.peer===owner.person&&a.slot==='pm');
    assert.equal(independent.likeCount,2);assert.equal(independent.liked,false);
    assert.equal((await like(other,second,false)).likeCount,2,'one account cannot cancel another account like');
  });

  await t.test('uses the same publication, owner history, moderation and block rules as the feeds',async()=>{
    const owner=await seed(),viewer=await seed();
    const current=await answer(owner,today,'am','공개 중',{archived:false});
    const expired=await answer(owner,'2026-09-01','am','공개 만료',{window:30});
    const year=await answer(owner,'2026-09-01','pm','1년 공개',{window:365});
    const privatePast=await answer(owner,'2026-11-18','am','해당 회차만 공개',{archived:false});
    const hidden=await answer(owner,'2026-11-18','pm','숨긴 답변',{hidden:true});
    const futureSlot=await answer(owner,today,'pm');
    const futureDay=await answer(owner,'2026-11-20','am');
    const noQuestion=await answer(owner,'2026-11-17','am','옛 질문 없음',{question:null});
    const missing={peer:owner.person,day:'2026-11-16',slot:'am'};
    assert.equal((await like(viewer,current)).likeCount,1);
    assert.equal((await like(viewer,year)).likeCount,1);
    for(const item of [expired,privatePast,hidden,futureSlot,futureDay,noQuestion,missing]){
      await rejects(()=>like(viewer,item));
      await rejects(()=>like(viewer,item,false));
    }
    assert.equal((await like(owner,expired)).likeCount,1,'owners can like their own visible history');
    assert.equal((await like(owner,privatePast)).likeCount,1);
    for(const item of [hidden,futureSlot,futureDay,noQuestion])await rejects(()=>like(owner,item));
    await db.query('insert into pajang_private.blocks values($1,$2)',[viewer.person,owner.person]);
    await rejects(()=>like(viewer,current));
    await rejects(()=>like(viewer,current,false));
    assert.ok((await feedFor(viewer)).items.every(a=>a.peer!==owner.person));
    await db.query('delete from pajang_private.blocks where src=$1',[viewer.person]);
    await db.query('insert into pajang_private.blocks values($1,$2)',[owner.person,viewer.person]);
    await rejects(()=>like(viewer,current));
    await db.query('delete from pajang_private.blocks where src=$1',[owner.person]);
    assert.equal((await like(viewer,current,false)).likeCount,0);
    await db.query('insert into ojjuda_admin_internal.pajang_answer_moderation values($1,$2,$3)',[owner.person,year.day,year.slot]);
    await rejects(()=>like(viewer,year,false));
    assert.ok((await discoveryFor(viewer)).items.every(a=>!(a.peer===owner.person&&a.day===year.day&&a.slot===year.slot)));
  });

  await t.test('rejects guests, invalid accounts, minors and people who have not joined Pajang',async()=>{
    const owner=await seed();
    const item=await answer(owner,today,'am');
    for(const options of [{anonymous:true},{banned:true},{pending:true},{minor:true},{unjoined:true},
      {deleted:true},{suspended:true},{noProfile:true}]){
      const actor=await seed(options);
      await rejects(()=>like(actor,item));
    }
    await rejects(()=>like(null,item,true,'anon'));
    await rejects(()=>like(null,item));
    await rejects(()=>like({id:randomUUID()},item));
    const valid=await seed();
    await rejects(()=>like(valid,item,true,'authenticated',{is_anonymous:true}));
    await rejects(()=>like(valid,{...item,peer:null,person:null}), '22023');
    await rejects(()=>like(valid,{...item,day:null}), '22023');
    await rejects(()=>like(valid,{...item,slot:'night'}), '22023');
    await rejects(()=>like(valid,item,null), '22023');
  });

  await t.test('rejects a stale account view and requires the displayed member identity',async()=>{
    const owner=await seed(),previous=await seed(),current=await seed();
    const item=await answer(owner,today,'am');
    await rejects(()=>like(current,item,true,'authenticated',{},previous.person));
    await rejects(()=>like(current,item,true,'authenticated',{},null));
    assert.equal(await value('select count(*)::integer as value from pajang_private.answer_likes where person=$1',[owner.person]),0);
    assert.equal((await like(current,item)).likeCount,1);
    await rejects(()=>like(current,item,false,'authenticated',{},previous.person));
    assert.equal((await like(current,item)).likeCount,1);
    await rejects(()=>as(current,()=>value('select public.pajang_answer_like($1,$2,$3,true) as value',
      [item.peer,item.day,item.slot])),'42883');
  });

  await t.test('prevents direct table access even with permissive default privileges',async()=>{
    const actor=await seed();
    const privileges=(await db.query(`select r.rolname,
      has_table_privilege(r.rolname,'pajang_private.answer_likes','select,insert,update,delete') as allowed
      from pg_roles r where r.rolname in ('anon','authenticated','service_role') order by r.rolname`)).rows;
    assert.ok(privileges.every(r=>!r.allowed));
    await rejects(()=>as(actor,()=>db.query('select * from pajang_private.answer_likes')));
    await db.exec('grant usage on schema pajang_private to authenticated');
    await rejects(()=>as(actor,()=>db.query('select * from pajang_private.answer_likes')));
    await rejects(()=>as(actor,()=>db.query('delete from pajang_private.answer_likes')));
    await db.exec('revoke usage on schema pajang_private from authenticated');
  });

  await t.test('cascades answer deletion, liker departure and answer-owner departure',async()=>{
    const owner=await seed(),first=await seed(),second=await seed();
    const item=await answer(owner,today,'am');
    await like(first,item);await like(second,item);
    await db.query('delete from pajang_private.people where id=$1',[first.person]);
    assert.equal((await like(second,item)).likeCount,1);
    await db.query('delete from pajang_private.answers where (person,day,slot)=($1,$2,$3)',[item.peer,item.day,item.slot]);
    assert.equal(await value('select count(*)::integer as value from pajang_private.answer_likes where person=$1',[owner.person]),0);
    await rejects(()=>like(second,item));
    const again=await answer(owner,today,'am');
    await like(second,again);
    await db.query('delete from auth.users where id=$1',[owner.id]);
    assert.equal(await value('select count(*)::integer as value from pajang_private.answer_likes where person=$1',[owner.person]),0);
  });

  await t.test('keeps feed filters, ordering, cursors, quotas and all preexisting fields identical',async()=>{
    const viewer=await seed(),owner=await seed();
    await db.query("update pajang_private.people set interest='coffee' where id=$1",[owner.person]);
    await db.query("insert into pajang_private.public_profile_preferences(person,preferences) values($1,'{\"relationship_intents\":[\"dating\"]}')",[owner.person]);
    await db.query("update ojjuda_account_internal.member_identity set gender='female' where user_id=$1",[owner.id]);
    await db.query('insert into pajang_private.discovery_gender_opt_ins values($1)',[owner.person]);
    for(let n=1;n<=29;n++)await answer(owner,`2026-11-${String(n<=18?n:n-18).padStart(2,'0')}`,n<=18?'am':'pm',`페이지 검사용 ${n}`,{at:10000+n,window:365});
    const top={peer:owner.person,day:'2026-11-11',slot:'pm'};
    await like(viewer,top);
    const collect=async()=>{
      const feed=await feedFor(viewer);
      const next=await feedFor(viewer,feed.nextCursor);
      const filtered=await discoveryFor(viewer,null,'dating','latest','female');
      const filteredNext=await discoveryFor(viewer,filtered.nextCursor,'dating','latest','female');
      const recommended=await discoveryFor(viewer,null,'coffee','recommend');
      return {feed,next,filtered,filteredNext,recommended,mine:await mine(owner)};
    };
    const actual=await collect();
    assert.equal(actual.filtered.items.length,24);
    assert.ok(actual.filtered.nextCursor);
    assert.equal(actual.filteredNext.items.length,5);
    assert.equal(new Set([...actual.filtered.items,...actual.filteredNext.items].map(a=>`${a.peer}/${a.day}/${a.slot}`)).size,29);
    for(const before of Object.values(f.beforeDefinitions))await db.exec(before.definition);
    const baseline=await collect();
    for(const after of Object.values(f.afterDefinitions))await db.exec(after.definition);
    for(const key of ['feed','next','filtered','filteredNext','recommended']){
      assert.deepEqual({...actual[key],items:actual[key].items.map(withoutLikes)},baseline[key]);
    }
    assert.deepEqual(actual.mine.map(withoutLikes),baseline.mine);
    assert.ok(actual.filtered.items.some(a=>a.liked&&a.likeCount===1));
  });
});
