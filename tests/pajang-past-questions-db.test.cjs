const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const {fixture,signatures}=require('./fixtures/pajang-past-questions-fixture.cjs');

const directory=path.join(__dirname,'../supabase/migrations');
const migrationName=fs.readdirSync(directory).find(name=>name.endsWith('_pajang_past_questions.sql'));
assert.ok(migrationName,'past question migration exists');
const migration=fs.readFileSync(path.join(directory,migrationName),'utf8');
const rejects=(fn,code)=>assert.rejects(fn,error=>error.code===code);
const key=item=>`${item.day}/${item.slot}`;

test('past questions use official history and expire from the question date',async t=>{
  const f=await fixture(t,migration);
  const {db,value,as,seed,list,save,all,setNow,question,row,originalAnswer,feedFor,discoveryFor,like,mine}=f;

  await t.test('keeps existing rows and all five caller policies while limiting new RPC privileges',async()=>{
    assert.deepEqual(await row(f.legacyActor,f.legacyItem),f.beforeRow);
    assert.deepEqual(await row(f.lateActor,f.lateItem),f.beforeCorrectionRow);
    assert.deepEqual(f.afterDefinitions,f.beforeCorrectionDefinitions);
    assert.equal(await f.source('pajang_private.answer_is_visible(date,text,boolean,date,text,smallint)'),f.oldVisibility);
    for(const signature of signatures){
      const before=f.beforeDefinitions[signature],after=f.afterDefinitions[signature];
      const expected=before.definition.replace(/(pajang_private\.answer_is_visible\(a\.day,a\.slot,a\.archived,today,(?:current_slot|active_window\.slot),a\.publication_window_days)\)/,'$1,a.at)');
      assert.notEqual(expected,before.definition,signature);
      assert.deepEqual({...after,definition:expected},{...before,definition:expected});
      assert.equal(after.definition,expected);
    }
    const checks=await db.query(`select p.proname,p.prosecdef,p.proconfig,
      has_function_privilege('authenticated',p.oid,'execute') as member,
      has_function_privilege('anon',p.oid,'execute') as guest,
      has_function_privilege('service_role',p.oid,'execute') as service
      from pg_proc p where p.oid in ('public.pajang_past_questions(jsonb)'::regprocedure,
        'public.pajang_answer_past_question(date,text,text,text,uuid)'::regprocedure) order by proname`);
    for(const check of checks.rows){
      assert.equal(check.prosecdef,true);assert.deepEqual(check.proconfig,['search_path=""']);
      assert.equal(check.member,true);assert.equal(check.guest,false);assert.equal(check.service,false);
    }
    const actor=await seed();
    await rejects(()=>as(actor,()=>db.query("select pajang_private.published_question_prompt('2026-11-18','am')")),'42501');
    await rejects(()=>as(actor,()=>db.query("insert into pajang_private.answers(person,day,slot,body,at) values($1,'2026-11-18','am','위조',1)",[actor.person])),'42501');
    // The corrective migration is repeatable and changes no caller or saved answer.
    await db.exec(f.correction);
    assert.deepEqual(await f.definitions(),f.afterDefinitions);
    assert.deepEqual(await row(f.lateActor,f.lateItem),f.beforeCorrectionRow);
  });

  await t.test('lists unanswered questions, the Nov 17 original, and only windows already completed in Seoul',async()=>{
    const actor=await seed();
    await setNow('2026-11-17T01:00:00Z');assert.deepEqual((await list(actor)).items,[]);
    await setNow('2026-11-17T03:00:00Z');assert.deepEqual((await list(actor)).items,[]);
    await setNow('2026-11-17T15:00:00Z');
    let items=(await list(actor)).items;
    assert.equal(items.length,1);assert.equal(key(items[0]),'2026-11-17/pm');
    assert.equal(items[0].question,'둘이서 보내는 느긋한 오후, 무엇을 하고 싶나요?');
    assert.deepEqual({...items[0],day:undefined,slot:undefined,question:undefined},
      {day:undefined,slot:undefined,question:undefined,answered:false,body:null,canEdit:false});
    await setNow('2026-11-22T02:59:59Z');
    items=(await list(actor)).items;assert.equal(items.length,9);
    assert.equal(key(items[0]),'2026-11-21/pm');
    assert.ok(items.every(item=>item.answered===false&&item.question));
    await setNow('2026-11-22T03:00:00Z');
    items=(await list(actor)).items;assert.equal(items.length,10);
    assert.equal(key(items[0]),'2026-11-22/am');
    assert.equal(items[0].question,'친구에게 서운한 일이 생기면 어떻게 표현하나요?');
    await setNow('2026-11-22T15:00:00Z');
    assert.equal(key((await list(actor)).items[0]),'2026-11-22/pm');
  });

  await t.test('paginates 24 distinct windows through the exact 365-day question range',async()=>{
    const actor=await seed();await setNow('2028-01-01T03:00:00Z');
    const first=await list(actor);assert.equal(first.items.length,24);
    assert.deepEqual(first.nextCursor,{day:first.items.at(-1).day,slot:first.items.at(-1).slot});
    const items=await all(actor);
    assert.equal(items.length,729);assert.equal(new Set(items.map(key)).size,729);
    assert.equal(key(items[0]),'2028-01-01/am');
    assert.equal(key(items.at(-1)),'2027-01-02/am');
    assert.deepEqual(items.map(key),items.map(key).sort().reverse());
    for(const cursor of [[],1,{},{day:'bad',slot:'am'},{day:'2027-02-30',slot:'am'},
      {day:'2028-01-01',slot:'pm'},{day:'2028-01-02',slot:'am'},
      {day:'2027-01-01',slot:'pm'},{day:'2027-05-01',slot:'AM'}]){
      await rejects(()=>list(actor,cursor),'22023');
    }
    const oldest=items.at(-1);
    assert.equal((await save(actor,oldest,'범위 마지막 질문의 답변')).saved,true);
    await rejects(()=>save(actor,{...oldest,day:'2027-01-01'}),'22023');
  });

  await t.test('rejects current, future, prelaunch, invalid and stale-question writes',async()=>{
    const actor=await seed();await setNow('2026-11-22T01:00:00Z');
    const before=await value('select count(*)::int as value from pajang_private.answers where person=$1',[actor.person]);
    for(const [day,slot] of [[null,'am'],['2026-11-22','am'],['2026-11-22','pm'],
      ['2026-11-23','am'],['2026-11-17','am'],['2026-11-16','pm'],['infinity','am'],
      ['2026-11-21',null],['2026-11-21','noon']]){
      await rejects(()=>save(actor,{day,slot,question:'질문'}),'22023');
    }
    const item=(await list(actor)).items[0];
    await rejects(()=>save(actor,{...item,question:'위조한 질문'}),'22023');
    await rejects(()=>save(actor,{...item,question:null}),'22023');
    assert.equal(await value('select count(*)::int as value from pajang_private.answers where person=$1',[actor.person]),before);
  });

  await t.test('creates one answer, returns retries safely and never overwrites existing content or timestamps',async()=>{
    const actor=await seed();await setNow('2026-11-22T01:02:03.456Z');
    const item=(await list(actor)).items.find(item=>key(item)==='2026-11-20/pm');
    const before=await f.snapshot();
    const result=await save(actor,item,'  생각을 정리한 뒤 이야기해요.  ');
    assert.deepEqual(result,{day:item.day,slot:item.slot,question:item.question,
      body:'생각을 정리한 뒤 이야기해요.',at:Date.parse('2026-11-22T01:02:03.456Z'),saved:true,alreadyAnswered:false});
    const saved=await row(actor,item);
    assert.equal(saved.archived,true);assert.equal(saved.publication_window_days,365);
    const after=await f.snapshot();
    assert.deepEqual({...after,answers:before.answers},before);
    await setNow('2026-11-23T01:00:00Z');
    assert.equal((await save(actor,item,result.body)).alreadyAnswered,true);
    assert.deepEqual(await row(actor,item),saved);
    await rejects(()=>save(actor,item,'다른 답변으로 덮어쓰기'),'PT409');
    assert.deepEqual(await row(actor,item),saved);
    const listed=(await list(actor)).items.find(x=>key(x)===key(item));
    assert.equal(listed.answered,true);assert.equal(listed.canEdit,true);assert.equal(listed.body,result.body);
    await as(actor,()=>value("select public.pajang_member('edit-history-answer',$1) as value",[{
      expectedPerson:actor.person,day:item.day,slot:item.slot,previousBody:result.body,body:'수정한 내 답변'
    }]));
    const edited=await row(actor,item);
    assert.equal(edited.body,'수정한 내 답변');
    assert.deepEqual({...edited,body:saved.body},saved);

    // Overlapping retries use the one original key and preserve its creation time.
    const retryItem=(await list(actor)).items.find(x=>key(x)==='2026-11-19/pm');
    const dispatch=body=>value('select public.pajang_answer_past_question($1,$2,$3,$4,$5) as value',
      [retryItem.day,retryItem.slot,retryItem.question,body,actor.person]);
    const retries=await as(actor,()=>Promise.all([dispatch('같은 제출'),dispatch('같은 제출')]));
    assert.deepEqual(retries.map(x=>x.alreadyAnswered),[false,true]);
    assert.equal(retries[0].at,retries[1].at);
    assert.equal(await value('select count(*)::int as value from pajang_private.answers where person=$1 and day=$2 and slot=$3',
      [actor.person,retryItem.day,retryItem.slot]),1);
  });

  await t.test('masks prohibited spans and checks the saved effective 1–220 character length',async()=>{
    await setNow('2026-11-22T01:00:00Z');
    const target={day:'2026-11-21',slot:'am',question:await question('2026-11-21','am')};
    const actor=await seed();
    const raw='가'.repeat(219)+'검사용금칙어';
    const result=await save(actor,target,raw);
    assert.equal(result.body,'가'.repeat(219)+'❤️❤️');
    assert.equal((await save(actor,target,raw)).alreadyAnswered,true);
    assert.equal((await save(actor,target,result.body)).alreadyAnswered,true);
    for(const body of ['',' \n\t\r ','나'.repeat(221),'❤️❤️'.repeat(221),'😀'.repeat(221)]){
      const another=await seed();await rejects(()=>save(another,target,body),'22023');
      assert.equal(await row(another,target),undefined);
    }
    for(const body of ['❤️❤️'.repeat(220),'😀'.repeat(220),'검사용금칙어 허용문구']){
      const another=await seed();assert.equal((await save(another,target,body)).body,body);
    }
  });

  await t.test('keeps past official snapshots and retains the live-current insertion guard after copy edits',async()=>{
    await setNow('2026-11-24T01:00:00Z');
    const actor=await seed(),other=await seed();
    const target={day:'2026-11-23',slot:'pm',question:await question('2026-11-23','pm')};
    const id=await value("select (pajang_private.question_for_window($1::date,$2)->>'id')::int as value",[target.day,target.slot]);
    await db.query("update pajang_private.personality_question_catalog set prompt=prompt||' 교정' where id=$1",[id]);
    await rejects(()=>save(actor,target),'22023');
    const refreshed=(await list(actor)).items.find(x=>key(x)===key(target));
    assert.equal(refreshed.question,target.question+' 교정');
    await save(actor,refreshed,'처음 저장한 답변');
    const first=await row(actor,refreshed);
    await db.query("update pajang_private.personality_question_catalog set prompt=prompt||' 추가' where id=$1",[id]);
    const historical=(await list(other)).items.find(x=>key(x)===key(target));
    assert.equal(historical.question,refreshed.question);
    await save(other,historical,'뒤늦게 같은 원문에 답해요');
    assert.deepEqual(await row(actor,refreshed),first);
    assert.equal((await row(other,historical)).question_prompt,first.question_prompt);

    // The current round must still use the fresh catalog, even after one member answered.
    const current={day:'2026-11-24',slot:'am'};
    const original=await originalAnswer(actor,current.day,current.slot,'현재 질문 원래 답변');
    const currentId=await value("select (pajang_private.question_for_window($1::date,$2)->>'id')::int as value",[current.day,current.slot]);
    await db.query("update pajang_private.personality_question_catalog set prompt=prompt||' 정정' where id=$1",[currentId]);
    await rejects(()=>originalAnswer(other,current.day,current.slot,'옛 질문 제출',{question:original.question}),'PT409');
    const changed=await originalAnswer(other,current.day,current.slot,'바뀐 현재 질문 제출');
    assert.notEqual(changed.question,original.question);
    assert.equal((await row(actor,current)).question_prompt,original.question);
  });

  await t.test('reuses account/adult/join rules and rejects stale-account submissions',async()=>{
    await setNow('2026-11-22T01:00:00Z');
    const good=await seed();const item=(await list(good)).items[0];
    for(const options of [{anonymous:true},{banned:true},{pending:true},{minor:true},
      {deleted:true},{suspended:true},{noProfile:true},{unjoined:true}]){
      const actor=await seed(options);
      await rejects(()=>list(actor),'42501');await rejects(()=>save(actor,item),'42501');
    }
    await rejects(()=>list(null),'42501');await rejects(()=>save(null,item),'42501');
    await rejects(()=>list(good,null,'anon'),'42501');
    await rejects(()=>save(good,item,'익명 역할',{role:'anon'}),'42501');
    await rejects(()=>list(good,null,'authenticated',{is_anonymous:true}),'42501');
    await rejects(()=>save(good,item,'익명 토큰',{claims:{is_anonymous:true}}),'42501');
    const other=await seed();
    await rejects(()=>save(good,item,'계정이 바뀐 제출',{expectedPerson:other.person}),'42501');
    await rejects(()=>save(good,item,'계정이 없는 제출',{expectedPerson:null}),'42501');
    assert.equal(await row(good,item),undefined);
  });

  await t.test('a hidden old answer stays answered, uneditable and protected against recreation',async()=>{
    await setNow('2026-11-22T01:00:00Z');
    const actor=await seed();
    const item=await originalAnswer(actor,'2026-11-20','am','숨김 답변 원문',{hidden:true});
    const before=await row(actor,item);
    const listed=(await list(actor)).items.find(x=>key(x)===key(item));
    assert.equal(listed.answered,true);assert.equal(listed.canEdit,false);assert.equal(listed.body,null);
    await rejects(()=>save(actor,item,item.body),'PT409');
    await rejects(()=>save(actor,item,'새로 작성하려는 본문'),'PT409');
    assert.deepEqual(await row(actor,item),before);
  });

  await t.test('late answers expire 365 days from the question across feeds, likes, profiles and signals',async()=>{
    await setNow('2026-11-22T14:59:59Z');
    const owner=await seed(),viewer=await seed(),blocker=await seed(),lastDayOwner=await seed();
    const item=(await list(owner)).items.find(x=>key(x)==='2026-11-18/am');
    const result=await save(owner,item,'오래된 질문에 오늘 남기는 답변');
    const target={...item,peer:owner.person};
    await setNow('2027-11-17T14:59:59Z'); // Question day + 364 in Seoul.
    const lastDayResult=await save(lastDayOwner,item,'질문 공개 마지막 날에 작성한 답변');
    const lastDayTarget={...item,peer:lastDayOwner.person};
    assert.equal(lastDayResult.at,Date.parse('2027-11-17T14:59:59Z'));
    assert.notEqual(lastDayResult.at,result.at);
    for(const feed of [await feedFor(viewer),await discoveryFor(viewer)]){
      assert.ok(feed.items.some(x=>x.peer===owner.person&&key(x)===key(item)));
      assert.ok(feed.items.some(x=>x.peer===lastDayOwner.person&&key(x)===key(item)));
    }
    assert.equal((await like(viewer,target,true)).likeCount,1);
    assert.equal((await like(viewer,lastDayTarget,true)).likeCount,1);
    assert.equal((await mine(owner)).find(x=>key(x)===key(item)).likeCount,1);
    assert.equal((await as(viewer,()=>value('select public.pajang_profile_preferences($1) as value',[owner.person]))).person,owner.person);
    await as(viewer,()=>value("select public.pajang_member('signal',$1) as value",[{
      peer:owner.person,answerDay:item.day,answerSlot:item.slot,note:''
    }]));
    assert.equal(await value('select count(*)::int as value from pajang_private.signals where src=$1 and dst=$2',[viewer.person,owner.person]),1);
    await db.query('insert into pajang_private.blocks values($1,$2)',[owner.person,blocker.person]);
    assert.ok(!(await feedFor(blocker)).items.some(x=>x.peer===owner.person));
    await rejects(()=>like(blocker,target,true),'42501');
    await db.query('delete from pajang_private.blocks where src=$1 and dst=$2',[owner.person,blocker.person]);
    await db.query('insert into ojjuda_admin_internal.pajang_answer_moderation values($1,$2,$3)',[owner.person,item.day,item.slot]);
    assert.ok(!(await feedFor(viewer)).items.some(x=>x.peer===owner.person));
    await rejects(()=>like(viewer,target,false),'42501');
    await db.query('delete from ojjuda_admin_internal.pajang_answer_moderation where person=$1 and day=$2 and slot=$3',[owner.person,item.day,item.slot]);

    await setNow('2027-11-17T15:00:00Z'); // Question day + 365, Seoul Nov 18.
    assert.ok(!(await feedFor(viewer)).items.some(x=>x.peer===owner.person));
    assert.ok(!(await discoveryFor(viewer)).items.some(x=>x.peer===owner.person));
    assert.ok(!(await feedFor(viewer)).items.some(x=>x.peer===lastDayOwner.person));
    assert.ok(!(await discoveryFor(viewer)).items.some(x=>x.peer===lastDayOwner.person));
    await rejects(()=>like(viewer,target,false),'42501');
    await rejects(()=>like(viewer,lastDayTarget,false),'42501');
    await rejects(()=>as(blocker,()=>value('select public.pajang_profile_preferences($1) as value',[owner.person])),'42501');
    await rejects(()=>as(blocker,()=>value('select public.pajang_profile_preferences($1) as value',[lastDayOwner.person])),'42501');
    await rejects(()=>as(blocker,()=>value("select public.pajang_member('signal',$1) as value",[{
      peer:owner.person,answerDay:item.day,answerSlot:item.slot,note:''
    }])),'PT409');
    await rejects(()=>as(blocker,()=>value("select public.pajang_member('signal',$1) as value",[{
      peer:lastDayOwner.person,answerDay:item.day,answerSlot:item.slot,note:''
    }])),'PT409');
    await rejects(()=>save(blocker,item,'기한을 넘긴 작성'),'22023');
    const own=(await mine(owner)).find(x=>key(x)===key(item));assert.equal(own.body,result.body);
    assert.equal((await row(owner,item)).at,result.at);
    assert.equal((await mine(lastDayOwner)).find(x=>key(x)===key(item)).body,lastDayResult.body);
    assert.equal((await row(lastDayOwner,item)).at,lastDayResult.at);

    // Legacy 30-day and round-only publications do not acquire a new lifetime.
    const visible=(day,slot,archived,today,current,window,at)=>value(`select pajang_private.answer_is_visible(
      $1::date,$2,$3,$4::date,$5,$6::smallint,$7::bigint) as value`,[day,slot,archived,today,current,window,at]);
    assert.equal(await visible('2026-11-18','am',true,'2026-12-17','am',30,result.at),true);
    assert.equal(await visible('2026-11-18','am',true,'2026-12-18','am',30,result.at),false);
    assert.equal(await visible('2026-11-18','am',false,'2026-11-18','am',30,result.at),true);
    assert.equal(await visible('2026-11-18','am',false,'2026-11-18','pm',30,result.at),false);
    for(const writtenAt of [result.at,lastDayResult.at,Date.parse('2028-11-18T01:00:00Z'),null]){
      assert.equal(await visible('2026-11-18','am',true,'2027-11-17','pm',365,writtenAt),true);
      assert.equal(await visible('2026-11-18','am',true,'2027-11-18','am',365,writtenAt),false);
    }
  });
});
