const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const {PGlite}=require('@electric-sql/pglite');
const {execFileSync}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const directory=path.join(root,'supabase/migrations');
const read=name=>fs.readFileSync(path.join(directory,name),'utf8');
const find=suffix=>fs.readdirSync(directory).find(name=>name.endsWith(suffix));
const migration=read(find('_pajang_relationship_questions.sql'));
const personalityMigration=read(find('_pajang_personality_questions.sql'));
const replacementMigration=read(find('_pajang_open_trip_question.sql'));
const seedNames=fs.readdirSync(directory).filter(name=>/^2026111709010[1-8]_pajang_/.test(name)).sort();
const categories=['attraction','communication','dates','affection','values','conflict'];
const source=[
  'relationship-attraction-dates.json',
  'relationship-contact-affection.json',
  'relationship-conflict-values.json'
].flatMap(name=>JSON.parse(fs.readFileSync(path.join(root,'features/pajang/content',name),'utf8')));
const byCategory=new Map(categories.map(category=>[category,source.filter(row=>row.category===category).sort((a,b)=>a.id-b.id)]));
const reviewed=Array.from({length:12},(_,index)=>categories.map(category=>byCategory.get(category)[index]))
  .flat().map((row,index)=>({...row,ordinal:index+1}));

async function fixture(t){
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('create role anon; create role authenticated; create schema pajang_private;');
  await db.exec(read('20261117090000_pajang_question_catalog.sql'));
  for(const name of seedNames)await db.exec(read(name));
  const delivery=read('20261117090200_pajang_question_delivery.sql');
  await db.exec(delivery.slice(0,delivery.indexOf('create or replace function public.pajang_member')));
  await db.exec(read('20261119160744_pajang_natural_question_copy.sql'));
  await db.exec(`create table pajang_private.answers(day date,slot text,question_prompt text,body text);
    insert into pajang_private.answers values('2026-11-21','am','회원이 답한 과거 질문 원문','회원이 쓴 과거 답변 원문');`);
  await db.exec(personalityMigration);
  await db.exec(replacementMigration);
  return db;
}

async function question(db,day,slot){
  return (await db.query('select pajang_private.question_for_window($1::date,$2) as q',[day,slot])).rows[0].q;
}
async function answer(db,day,slot,body){
  const current=await question(db,day,slot);
  await db.query('insert into pajang_private.answers values($1::date,$2,$3,$4)',[day,slot,current.q[0],body]);
  return current;
}
const answers=db=>db.query('select * from pajang_private.answers order by day,slot,body').then(result=>result.rows);
const personality=db=>db.query('select * from pajang_private.personality_question_catalog order by id').then(result=>result.rows);
const relationships=db=>db.query('select id,category,prompt,samples,ordinal from pajang_private.relationship_question_catalog order by ordinal').then(result=>result.rows);
const functionState=(db,signature)=>db.query(`select pg_get_functiondef($1::regprocedure) as definition,
  (select proacl from pg_proc where oid=$1::regprocedure) as privileges`,[signature]).then(result=>result.rows[0]);

test('relationship source, balanced catalog and stored history agree without changing the existing 936 questions',async t=>{
  execFileSync(process.execPath,['scripts/build-pajang-relationship-questions.mjs','--check'],{cwd:root});
  assert.equal(source.length,72);
  assert.deepEqual(source.map(row=>row.id).sort((a,b)=>a-b),Array.from({length:72},(_,i)=>50001+i));
  assert.equal(new Set(source.map(row=>row.prompt)).size,72);
  for(const category of categories)assert.equal(byCategory.get(category).length,12,category);
  for(const row of source){
    assert.equal(row.samples.length,3);
    assert.equal(new Set(row.samples).size,3);
    assert.ok(row.samples.every(sample=>typeof sample==='string'&&sample.trim()===sample&&sample.length>0));
  }
  const db=await fixture(t);
  await answer(db,'2026-11-22','am','현재 오전 질문에 쓴 답변');
  await answer(db,'2026-11-22','pm','새 여행 질문에 쓴 답변');
  const before=await personality(db);
  const legacy=(await db.query('select * from pajang_private.question_catalog order by id')).rows;
  const stored=await answers(db);
  const guard=await functionState(db,'pajang_private.validate_question_insert()');
  const historical=await db.query(`select day::date::text as day,slot,
    pajang_private.question_for_window(day::date,slot) as question
    from generate_series(date '2026-11-18',date '2026-11-22',interval '1 day') day
    cross join(values('am'),('pm'))slots(slot) order by day,slot`);

  await db.exec(migration);
  assert.deepEqual(await relationships(db),reviewed);
  assert.equal(before.length,936);
  assert.deepEqual(await personality(db),before,'all ordinary, seasonal and revised question rows are preserved');
  assert.deepEqual((await db.query('select * from pajang_private.question_catalog order by id')).rows,legacy);
  assert.deepEqual(await answers(db),stored,'saved prompt and answer text are unchanged');
  assert.deepEqual(await functionState(db,'pajang_private.validate_question_insert()'),guard);
  for(const window of historical.rows)assert.deepEqual(await question(db,window.day,window.slot),window.question);
  assert.equal((await question(db,'2026-11-22','pm')).id,40001);
});

test('ordinary scheduling spreads all 72 relationship questions evenly through 732 existing questions',async t=>{
  const db=await fixture(t);await db.exec(migration);
  // Isolate the ordinary schedule here; the next test exercises the real calendar.
  await db.exec(`create or replace function pajang_private.question_occasion(on_day date)
    returns table(kind text,day_no integer) language sql stable strict set search_path='' as $$
    select null::text,null::integer where false
    $$;`);
  const {rows}=await db.query(`select n,
    pajang_private.question_for_window(date '2026-11-23'+n/2,case when n%2=0 then 'am' else 'pm' end) as question
    from generate_series(0,805) n order by n`);
  const cycle=rows.slice(0,804);
  const relationshipIds=new Set(reviewed.map(row=>row.id));
  const relationshipWindows=cycle.filter(row=>relationshipIds.has(row.question.id));
  const ordinaryWindows=cycle.filter(row=>!relationshipIds.has(row.question.id));
  assert.equal(new Set(cycle.map(row=>row.question.id)).size,804,'every question appears once in a full ordinary cycle');
  assert.equal(relationshipWindows.length,72);
  assert.equal(ordinaryWindows.length,732);
  assert.deepEqual(relationshipWindows.map(row=>row.question.id),reviewed.map(row=>row.id));
  assert.deepEqual(relationshipWindows.slice(0,7).map(row=>row.n),[0,11,22,33,44,55,67]);
  for(let i=0;i<relationshipWindows.length;i++){
    const next=i+1<relationshipWindows.length?relationshipWindows[i+1].n:804;
    assert.ok([11,12].includes(next-relationshipWindows[i].n),'new relationship questions remain evenly distributed');
    assert.equal(reviewed[i].category,categories[i%categories.length]);
  }
  const ordinary=(await personality(db)).filter(row=>row.ordinal!==null).sort((a,b)=>a.ordinal-b.ordinal);
  const expectedOrdinary=[...ordinary.slice(2),...ordinary.slice(0,2)];
  assert.deepEqual(ordinaryWindows.map(row=>row.question.id),expectedOrdinary.map(row=>row.id),
    'the existing pool continues after the two questions already used on November 22');
  assert.equal(rows[0].question.id,reviewed[0].id);
  assert.equal(rows[1].question.id,ordinary[2].id);
  assert.equal(rows[803].question.id,40001);
  assert.equal(rows[804].question.id,reviewed[0].id);
  assert.equal(rows[805].question.id,ordinary[2].id);
});

test('four years of real AM/PM windows retain calendar priority and never repeat a question within 365 days',async t=>{
  const db=await fixture(t);await db.exec(migration);
  const all=[...await personality(db),...await relationships(db)];
  const catalog=new Map(all.map(row=>[row.id,row]));
  const seasonal=new Map(all.filter(row=>row.occasion).map(row=>[`${row.occasion}/${row.edition}/${row.turn}`,row]));
  const {rows}=await db.query(`select d::date::text as day,s.slot,extract(year from d)::int%2 as edition,
    e.kind,e.day_no,pajang_private.question_for_window(d::date,s.slot) as question
    from generate_series(date '2026-11-22',date '2030-11-22',interval '1 day') d
    cross join(values('am'),('pm'))s(slot)
    left join lateral pajang_private.question_occasion(d::date) e on true order by day,slot`);
  const lastSeen=new Map();
  let calendarWindows=0;
  for(const [index,window]of rows.entries()){
    const label=`${window.day} ${window.slot}`;
    assert.ok(window.question,`missing question at ${label}`);
    const row=catalog.get(window.question.id);assert.ok(row,`unreviewed question at ${label}`);
    assert.deepEqual(window.question.q,[row.prompt]);
    assert.deepEqual(window.question.answers,row.samples);
    if(window.kind){
      calendarWindows++;
      const expected=seasonal.get(`${window.kind}/${window.edition}/${2*window.day_no+(window.slot==='pm'?1:0)}`);
      assert.ok(expected,`missing calendar catalog row at ${label}`);
      assert.equal(window.question.id,expected.id,`calendar precedence at ${label}`);
    }
    if(index&&rows[index-1].day===window.day)assert.notEqual(window.question.id,rows[index-1].question.id,label);
    if(lastSeen.has(window.question.id))assert.ok(index-lastSeen.get(window.question.id)>=730,
      `question ${window.question.id} repeats within 365 days at ${label}`);
    lastSeen.set(window.question.id,index);
  }
  assert.ok(calendarWindows>0);
  assert.ok(rows.some(row=>row.day==='2028-02-29'),'leap day is covered');
  assert.equal(catalog.get((await question(db,'2026-12-24','am')).id).occasion,'christmas');
  assert.equal(catalog.get((await question(db,'2027-02-07','pm')).id).occasion,'seollal');
  assert.equal(catalog.get((await question(db,'2027-09-15','am')).id).occasion,'chuseok');
  assert.equal(await question(db,'2026-11-23','invalid'),null);
  assert.equal(await question(db,'2026-11-17','pm'),null);
  assert.equal(await question(db,null,'am'),null);
});

test('a stale form is rejected after rollout and replay preserves newly saved answers',async t=>{
  const db=await fixture(t);
  const retired=await question(db,'2026-11-23','am');
  await db.exec(migration);
  const current=await question(db,'2026-11-23','am');
  assert.notEqual(current.id,retired.id);
  await assert.rejects(db.query(`insert into pajang_private.answers values('2026-11-23','am',$1,'옛 화면의 답변')`,
    [retired.q[0]]),error=>error.code==='PT409');
  assert.equal((await db.query(`select count(*)::int as n from pajang_private.answers where day='2026-11-23'`)).rows[0].n,0);
  await answer(db,'2026-11-23','am','새 연애 질문에 쓴 답변');
  await answer(db,'2026-11-23','pm','기존 일반 질문에 쓴 답변');
  await db.exec(`update pajang_private.answers set body='내가 고친 과거 답변' where day='2026-11-21'`);
  const stored=await answers(db),catalog=await relationships(db),original=await personality(db);
  await db.exec(migration);
  assert.deepEqual(await answers(db),stored);
  assert.deepEqual(await relationships(db),catalog);
  assert.deepEqual(await personality(db),original);
  assert.equal((await db.query(`select question_prompt from pajang_private.answers where day='2026-11-21'`)).rows[0].question_prompt,
    '회원이 답한 과거 질문 원문');
});

test('a concurrent relationship-copy edit aborts replay instead of overwriting it',async t=>{
  const db=await fixture(t);await db.exec(migration);
  await db.query('update pajang_private.relationship_question_catalog set samples=$1 where id=50001',
    [['다른 편집자의 첫 번째 예시','다른 편집자의 두 번째 예시','다른 편집자의 세 번째 예시']]);
  const catalog=await relationships(db),original=await personality(db),stored=await answers(db);
  const selector=await functionState(db,'pajang_private.question_for_window(date,text)');
  await assert.rejects(db.exec(migration),/relationship catalog changed/);await db.exec('rollback');
  assert.deepEqual(await relationships(db),catalog);
  assert.deepEqual(await personality(db),original);
  assert.deepEqual(await answers(db),stored);
  assert.deepEqual(await functionState(db,'pajang_private.question_for_window(date,text)'),selector);
});

test('rollout checks the exact saved window and rolls back all changes when its prompt would change',async t=>{
  await t.test('an already answered ordinary cutover window prevents the rollout',async t=>{
    const db=await fixture(t);
    const current=await answer(db,'2026-11-23','am','전환 전에 작성한 회원 답변');
    const stored=await answers(db),original=await personality(db);
    const selector=await functionState(db,'pajang_private.question_for_window(date,text)');
    await assert.rejects(db.exec(migration),/answered Pajang window would change/);await db.exec('rollback');
    assert.equal((await db.query(`select to_regclass('pajang_private.relationship_question_catalog') as catalog`)).rows[0].catalog,null,
      'a rejected initial rollout does not leave behind partial catalog data');
    assert.deepEqual(await question(db,'2026-11-23','am'),current);
    assert.deepEqual(await answers(db),stored);
    assert.deepEqual(await personality(db),original);
    assert.deepEqual(await functionState(db,'pajang_private.question_for_window(date,text)'),selector);
  });
  await t.test('an answered calendar window remains valid and does not block rollout',async t=>{
    const db=await fixture(t);
    const current=await answer(db,'2026-12-24','am','기념일 질문에 작성한 회원 답변');
    const stored=await answers(db);
    await db.exec(migration);
    assert.deepEqual(await question(db,'2026-12-24','am'),current);
    assert.deepEqual(await answers(db),stored);
    assert.equal((await relationships(db)).length,72);
  });
});

test('the relationship catalog remains private, with RLS and no browser-role writes or selector execution',async t=>{
  const db=await fixture(t);await db.exec(migration);
  const {rows}=await db.query(`select r.rolname,
    has_table_privilege(r.rolname,'pajang_private.relationship_question_catalog','select') as can_read,
    has_table_privilege(r.rolname,'pajang_private.relationship_question_catalog','insert') as can_insert,
    has_table_privilege(r.rolname,'pajang_private.relationship_question_catalog','update') as can_update,
    has_table_privilege(r.rolname,'pajang_private.relationship_question_catalog','delete') as can_delete,
    has_function_privilege(r.rolname,'pajang_private.question_for_window(date,text)','execute') as can_execute
    from pg_roles r where r.rolname in('anon','authenticated')`);
  assert.equal(rows.length,2);
  for(const row of rows)for(const key of ['can_read','can_insert','can_update','can_delete','can_execute'])assert.equal(row[key],false,`${row.rolname} ${key}`);
  assert.equal((await db.query(`select relrowsecurity from pg_class where oid='pajang_private.relationship_question_catalog'::regclass`)).rows[0].relrowsecurity,true);
});
