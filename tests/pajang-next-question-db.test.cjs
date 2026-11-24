const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const {fixture:pastFixture}=require('./fixtures/pajang-past-questions-fixture.cjs');

const directory=path.join(__dirname,'../supabase/migrations');
const read=suffix=>fs.readFileSync(path.join(directory,fs.readdirSync(directory).find(name=>name.endsWith(suffix))),'utf8');
const migration=read('_pajang_next_question_preview.sql');
const denied=fn=>assert.rejects(fn,error=>error.code==='42501');

test('the next question preview shares publication timing and member access without exposing answers',async t=>{
  const f=await pastFixture(t,read('_pajang_past_questions.sql'));
  const {db,value,as,seed,setNow,question,originalAnswer,snapshot}=f;
  const member=await seed();
  const preview=(actor=member,role='authenticated',claims={})=>as(actor,
    ()=>value('select public.pajang_next_question() as value'),role,claims);
  const entry=()=>as(member,()=>value("select public.pajang_member('entry') as value"));
  const deliverySignatures=['public.pajang_member(text,jsonb)',
    'pajang_private.answer_window(timestamptz)','pajang_private.question_for_window(date,text)'];
  const delivery=()=>db.query(`select p.oid::regprocedure::text as signature,
    pg_get_functiondef(p.oid) as definition,p.proacl,p.provolatile,p.prosecdef,p.proconfig
    from pg_proc p where p.oid=any($1::regprocedure[]) order by signature`,[deliverySignatures]);
  const beforeDelivery=(await delivery()).rows,beforeDefinitions=await f.definitions(),beforeData=await snapshot();
  await db.exec(migration);

  await t.test('adds one parameterless member RPC while keeping publication functions and data unchanged',async()=>{
    assert.deepEqual((await delivery()).rows,beforeDelivery);
    assert.deepEqual(await f.definitions(),beforeDefinitions);
    assert.deepEqual(await snapshot(),beforeData);
    const access=await value(`select jsonb_build_object('definer',p.prosecdef,'volatility',p.provolatile,
      'arguments',p.pronargs,'config',p.proconfig,
      'member',has_function_privilege('authenticated',p.oid,'execute'),
      'guest',has_function_privilege('anon',p.oid,'execute'),
      'service',has_function_privilege('service_role',p.oid,'execute')) as value
      from pg_proc p where p.oid='public.pajang_next_question()'::regprocedure`);
    assert.deepEqual(access,{definer:true,volatility:'v',arguments:0,config:['search_path=""'],
      member:true,guest:false,service:false});
  });

  await t.test('moves across Seoul noon, midnight, month/year changes and leap day using the real question catalog',async()=>{
    const cases=[
      ['2026-11-22T02:59:59.999Z','2026-11-22','pm','2026-11-22T03:00:00Z'],
      ['2026-11-22T03:00:00Z','2026-11-23','am','2026-11-22T15:00:00Z'],
      ['2026-11-22T14:59:59.999Z','2026-11-23','am','2026-11-22T15:00:00Z'],
      ['2026-11-22T15:00:00Z','2026-11-23','pm','2026-11-23T03:00:00Z'],
      ['2026-11-30T14:59:59.999Z','2026-12-01','am','2026-11-30T15:00:00Z'],
      ['2026-12-31T14:59:59.999Z','2027-01-01','am','2026-12-31T15:00:00Z'],
      ['2028-02-28T14:59:59.999Z','2028-02-29','am','2028-02-28T15:00:00Z'],
      ['2028-02-29T14:59:59.999Z','2028-03-01','am','2028-02-29T15:00:00Z'],
      ['2026-12-23T14:59:59.999Z','2026-12-24','am','2026-12-23T15:00:00Z'],
      ['2027-02-06T14:59:59.999Z','2027-02-07','am','2027-02-06T15:00:00Z'],
    ];
    // Session timezone must not alter the Seoul schedule.
    await db.exec("set time zone 'America/Los_Angeles'");
    try{
      for(const [instant,day,slot,startsAt] of cases){
        await setNow(instant);
        const next=await preview();
        assert.deepEqual(Object.keys(next).sort(),['day','prompt','slot','startsAt']);
        assert.equal(next.day,day,instant);assert.equal(next.slot,slot,instant);
        assert.equal(Date.parse(next.startsAt),Date.parse(startsAt),instant);
        assert.equal(next.prompt,await question(day,slot),instant);
        // At its advertised opening time, the real member endpoint publishes
        // exactly the text that the preview showed, including calendar editions.
        await setNow(startsAt);
        const published=await entry();
        assert.equal(published.day,next.day);assert.equal(published.slot,next.slot);
        assert.equal(published.question.q[0],next.prompt);
      }
    }finally{await db.exec("set time zone 'UTC'");await setNow('2026-11-22T01:00:00Z');}
  });

  await t.test('retains anonymous, adult, account restriction and first-participation checks',async()=>{
    await denied(()=>preview(null));
    await denied(()=>preview(member,'anon'));
    await denied(()=>preview(member,'service_role'));
    await denied(()=>preview(member,'authenticated',{is_anonymous:true}));
    for(const options of [{anonymous:true},{unjoined:true},{minor:true},{deleted:true},
      {banned:true},{pending:true},{suspended:true},{noProfile:true}]){
      const actor=await seed(options);
      await denied(()=>preview(actor));
    }
  });

  await t.test('returns only the next prompt without changing or leaking future answers and private catalogs',async()=>{
    const peer=await seed();
    await originalAnswer(peer,'2026-11-22','pm','공개되기 전 회원의 답변 원문');
    const before=await snapshot(),next=await preview();
    assert.deepEqual(Object.keys(next).sort(),['day','prompt','slot','startsAt']);
    assert.equal(next.prompt,await question('2026-11-22','pm'));
    assert.equal(JSON.stringify(next).includes('공개되기 전 회원의 답변 원문'),false);
    assert.deepEqual(await snapshot(),before);
    await denied(()=>as(member,()=>db.query('select * from pajang_private.personality_question_catalog')));
    await denied(()=>as(member,()=>db.query("select pajang_private.question_for_window('2027-01-01','am')")));
    await assert.rejects(()=>as(member,()=>db.query("select public.pajang_next_question('2027-01-01'::date)")),
      error=>error.code==='42883','callers cannot pick arbitrary future rounds');
    const page=await f.list(member);
    assert.equal(page.items.some(item=>item.day===next.day&&item.slot===next.slot),false,
      'the preview does not add the upcoming round to answerable past questions');
  });

  await t.test('knowing the next prompt does not permit an early answer through either writing endpoint',async()=>{
    const next=await preview(),before=await snapshot();
    await assert.rejects(()=>f.save(member,{day:next.day,slot:next.slot,question:next.prompt}),
      error=>error.code==='22023');
    const nextId=await value('select pajang_private.question_for_window($1::date,$2)->>\'id\' as value',[next.day,next.slot]);
    await assert.rejects(()=>as(member,()=>value('select public.pajang_member($1,$2) as value',[
      'answer',{day:next.day,slot:next.slot,questionId:nextId,body:'다음 질문에 미리 답변',archive:true,publicationPolicy:'year-v1'}])),
      error=>error.code==='PT409');
    assert.deepEqual(await snapshot(),before);
  });

  await t.test('a missing scheduled question fails instead of substituting a sample or an old answer',async()=>{
    const scheduled=await value(`select to_jsonb(q) as value from pajang_private.personality_question_catalog q
      where id=(pajang_private.question_for_window('2026-11-22','pm')->>'id')::integer`);
    await db.query('delete from pajang_private.personality_question_catalog where id=$1',[scheduled.id]);
    try{
      await assert.rejects(()=>preview(),error=>error.code==='PT503');
    }finally{
      await db.query(`insert into pajang_private.personality_question_catalog
        select * from jsonb_populate_record(null::pajang_private.personality_question_catalog,$1)`,[scheduled]);
    }
    assert.equal((await preview()).prompt,await question('2026-11-22','pm'));
  });
});
