const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const {PGlite}=require('@electric-sql/pglite');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const directory=path.join(root,'supabase/migrations');
const read=name=>fs.readFileSync(path.join(directory,name),'utf8');
const migrationName=fs.readdirSync(directory).find(name=>name.endsWith('_pajang_personality_questions.sql'));
const migration=read(migrationName);
const replacementMigration=read(fs.readdirSync(directory).find(name=>name.endsWith('_pajang_open_trip_question.sql')));
const replacementSource=JSON.parse(fs.readFileSync(path.join(root,'features/pajang/content/personality-revisions.json'),'utf8'))
  .find(row=>row.replaces===20245);
const seeds=fs.readdirSync(directory).filter(name=>/^2026111709010[1-8]_pajang_/.test(name)).sort();
async function fixture(t){
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('create role anon; create role authenticated; create schema pajang_private;');
  await db.exec(read('20261117090000_pajang_question_catalog.sql'));
  for(const name of seeds)await db.exec(read(name));
  const delivery=read('20261117090200_pajang_question_delivery.sql');
  await db.exec(delivery.slice(0,delivery.indexOf('create or replace function public.pajang_member')));
  await db.exec(read('20261119160744_pajang_natural_question_copy.sql'));
  await db.exec(`create table pajang_private.answers(day date,slot text,question_prompt text,body text);
    insert into pajang_private.answers values('2026-11-21','am','원래 질문을 그대로 보관해요.','회원이 쓴 답변 원문이에요.');`);
  return db;
}
async function question(db,day,slot){
  return (await db.query('select pajang_private.question_for_window($1::date,$2) as q',[day,slot])).rows[0].q;
}

test('reviewed content and migration match, with balanced alternating categories',async t=>{
  execFileSync(process.execPath,['scripts/build-pajang-personality-questions.mjs','--check'],{cwd:root});
  const db=await fixture(t);await db.exec(migration);
  const {rows}=await db.query('select * from pajang_private.personality_question_catalog order by ordinal nulls last,id');
  assert.equal(rows.length,936);
  const regular=rows.filter(row=>row.ordinal!==null),seasonal=rows.filter(row=>row.ordinal===null);
  assert.equal(regular.length,732);assert.equal(seasonal.length,204);
  assert.equal(new Set(rows.map(row=>row.prompt)).size,936);
  assert.equal(new Set(regular.map(row=>row.category)).size,12);
  for(let i=0;i<732;i++){
    assert.equal(regular[i].ordinal,i+1);
    if(i)assert.notEqual(regular[i].category,regular[i-1].category);
  }
  for(const row of rows){assert.equal(row.samples.length,3);assert.equal(new Set(row.samples).size,3);}
  assert.equal(regular[0].prompt,'친구에게 서운한 일이 생기면 어떻게 표현하나요?');
});

test('cutover uses distinct IDs, leaves historical prompts and answers unchanged, and rejects invalid slots',async t=>{
  const db=await fixture(t);
  const before=await question(db,'2026-11-21','am');
  const legacyCurrent=await question(db,'2026-11-22','am');
  const answers=(await db.query('select * from pajang_private.answers')).rows;
  const oldCatalog=(await db.query('select * from pajang_private.question_catalog order by id')).rows;
  await db.exec(migration);
  assert.deepEqual(await question(db,'2026-11-21','am'),before);
  const current=await question(db,'2026-11-22','am');
  assert.equal(current.id,20001);assert.notEqual(current.id,legacyCurrent.id);
  assert.deepEqual(current.q,['친구에게 서운한 일이 생기면 어떻게 표현하나요?']);
  assert.deepEqual((await db.query('select * from pajang_private.answers')).rows,answers);
  assert.deepEqual((await db.query('select * from pajang_private.question_catalog order by id')).rows,oldCatalog);
  assert.equal(await question(db,'2026-11-22','invalid'),null);
  assert.equal(await question(db,'2026-11-17','pm'),null);
  assert.equal(await question(db,null,'am'),null);
});

test('every AM/PM window for four years has a reviewed question, including calendar precedence and leap day',async t=>{
  const db=await fixture(t);await db.exec(migration);
  const {rows}=await db.query(`select d::date::text as day,s.slot,
    pajang_private.question_for_window(d::date,s.slot) as question
    from generate_series(date '2026-11-22',date '2030-11-21',interval '1 day') d
    cross join(values('am'),('pm'))s(slot) order by day,slot`);
  const catalog=new Map((await db.query('select * from pajang_private.personality_question_catalog')).rows.map(row=>[row.id,row]));
  for(const window of rows){
    assert.ok(window.question,`${window.day} ${window.slot}`);
    const row=catalog.get(window.question.id);assert.ok(row);
    assert.deepEqual(window.question.q,[row.prompt]);assert.deepEqual(window.question.answers,row.samples);
  }
  assert.ok(rows.some(row=>row.day==='2028-02-29'));
  assert.equal(catalog.get((await question(db,'2026-12-24','am')).id).occasion,'christmas');
  assert.equal(catalog.get((await question(db,'2027-02-07','pm')).id).occasion,'seollal');
  assert.equal(catalog.get((await question(db,'2027-09-15','am')).id).occasion,'chuseok');
  for(const [index,window]of rows.entries())if(index&&rows[index-1].day===window.day)assert.notEqual(window.question.id,rows[index-1].question.id);
  const repeated=await db.query(`select count(*)::int as n from (
    select pajang_private.question_for_window(d::date,s.slot)->>'id' as id
    from generate_series(date '2026-11-22',date '2027-11-22',interval '1 day')d
    cross join(values('am'),('pm'))s(slot)
    where not exists(select from pajang_private.question_occasion(d::date))
    group by id having count(*)>1)duplicates`);
  assert.equal(repeated.rows[0].n,0);
});

test('rollout is repeatable, refuses conflicting copy and refuses changing an answered legacy window',async t=>{
  const db=await fixture(t);await db.exec(migration);await db.exec(migration);
  await db.query(`insert into pajang_private.answers values('2026-11-22','am',$1,'새 질문에 대한 답변이에요.')`,[(await question(db,'2026-11-22','am')).q[0]]);
  await db.exec(migration);
  await db.exec(`update pajang_private.personality_question_catalog set prompt='다른 편집자가 검토 중인 질문인가요?' where id=20001`);
  await assert.rejects(db.exec(migration),/catalog changed/);await db.exec('rollback');
  assert.equal((await question(db,'2026-11-22','am')).q[0],'다른 편집자가 검토 중인 질문인가요?');
  const other=await fixture(t);
  await other.exec(`insert into pajang_private.answers values('2026-11-22','am','둘 다 마지막 한 조각을 슬쩍 보고 있다면 어떻게 나눌까요?','기존 답변을 지켜요.')`);
  await assert.rejects(other.exec(migration),/legacy Pajang answer/);await other.exec('rollback');
  assert.equal((await question(other,'2026-11-22','am')).id,9);
  assert.equal((await other.query(`select count(*)::int as n from pajang_private.answers`)).rows[0].n,2);
});

test('new private question data stays closed to browser roles',async t=>{
  const db=await fixture(t);await db.exec(migration);
  const {rows}=await db.query(`select r.rolname,
    has_table_privilege(r.rolname,'pajang_private.personality_question_catalog','select') as can_read,
    has_table_privilege(r.rolname,'pajang_private.personality_question_catalog','insert') as can_write,
    has_function_privilege(r.rolname,'pajang_private.question_for_window(date,text)','execute') as can_execute
    from pg_roles r where r.rolname in('anon','authenticated')`);
  for(const row of rows){assert.equal(row.can_read,false);assert.equal(row.can_write,false);assert.equal(row.can_execute,false);}
  assert.equal((await db.query(`select relrowsecurity from pg_class where oid='pajang_private.personality_question_catalog'::regclass`)).rows[0].relrowsecurity,true);
});


test('an old request cannot insert its old prompt after waiting for the rollout lock',async t=>{
  const db=await fixture(t);await db.exec(migration);
  await assert.rejects(db.query(`insert into pajang_private.answers values('2026-11-22','am',$1,'옛 화면에서 작성한 답변')`,
    ['둘 다 마지막 한 조각을 슬쩍 보고 있다면 어떻게 나눌까요?']),error=>error.code==='PT409');
  assert.equal((await db.query(`select count(*)::int as n from pajang_private.answers where day='2026-11-22'`)).rows[0].n,0);
  const current=await question(db,'2026-11-22','am');
  await db.query(`insert into pajang_private.answers values('2026-11-22','am',$1,'새 질문을 읽고 작성한 답변')`,[current.q[0]]);
  assert.equal((await db.query(`select count(*)::int as n from pajang_private.answers where day='2026-11-22'`)).rows[0].n,1);
  // Editing the body of a historical answer never replaces its saved question.
  await db.exec(`update pajang_private.answers set body='본인이 수정한 과거 답변' where day='2026-11-21'`);
  assert.equal((await db.query(`select question_prompt from pajang_private.answers where day='2026-11-21'`)).rows[0].question_prompt,'원래 질문을 그대로 보관해요.');
});

test('incomplete regular and calendar assignments are rejected rather than creating silent schedule gaps',async t=>{
  const db=await fixture(t);await db.exec(migration);
  for(const values of [
    `(40001,null,'test','빠진 번호가 있는 질문인가요?',null,null,null,array['첫 답변','두 번째','세 번째'])`,
    `(40002,null,'test','판본이 빠진 질문인가요?','spring',null,12,array['첫 답변','두 번째','세 번째'])`
  ])await assert.rejects(db.exec(`insert into pajang_private.personality_question_catalog(id,ordinal,category,prompt,occasion,edition,turn,samples) values ${values}`),error=>error.code==='23514');
});

test('the open travel question replaces only the unanswered planning slot and matches its source',async t=>{
  const db=await fixture(t);await db.exec(migration);
  assert.ok(replacementSource,'the replacement has a reviewed source entry');
  assert.equal(replacementSource.id,40001);
  const today=await question(db,'2026-11-22','am');
  await db.query(`insert into pajang_private.answers values('2026-11-22','am',$1,'현재 오전 질문에 쓴 답변')`,[today.q[0]]);
  const before=(await db.query('select * from pajang_private.personality_question_catalog order by id')).rows;
  const answers=(await db.query('select * from pajang_private.answers order by day,slot')).rows;
  const definitions=()=>db.query(`select p.oid::regprocedure::text as signature,pg_get_functiondef(p.oid) as definition,p.proacl
    from pg_proc p where p.oid in ('pajang_private.question_for_window(date,text)'::regprocedure,
      'pajang_private.validate_question_insert()'::regprocedure) order by signature`);
  const functions=(await definitions()).rows;
  const retired=before.find(row=>row.id===replacementSource.replaces);
  await db.exec(replacementMigration);
  const after=(await db.query('select * from pajang_private.personality_question_catalog order by id')).rows;
  assert.equal(after.length,936);
  assert.equal(new Set(after.map(row=>row.prompt)).size,936);
  assert.deepEqual(after.filter(row=>row.id!==replacementSource.id),before.filter(row=>row.id!==replacementSource.replaces),
    'every other regular and seasonal question is unchanged');
  assert.deepEqual(after.find(row=>row.id===replacementSource.id),{
    ...retired,id:replacementSource.id,ordinal:replacementSource.ordinal,category:replacementSource.category,
    prompt:replacementSource.prompt,samples:replacementSource.samples
  });
  assert.equal(after.some(row=>row.id===replacementSource.replaces),false);
  assert.deepEqual(await question(db,'2026-11-22','am'),today);
  assert.deepEqual(await question(db,'2026-11-22','pm'),{
    id:replacementSource.id,q:[replacementSource.prompt],answers:replacementSource.samples
  },'the actual publication selector serves the revised afternoon question');
  assert.deepEqual((await db.query('select * from pajang_private.answers order by day,slot')).rows,answers);
  assert.deepEqual((await definitions()).rows,functions,'publication and stale-write guards keep their definitions and privileges');
});

test('replaying the replacement preserves new answers and a retired prompt cannot be saved by an old form',async t=>{
  const db=await fixture(t);await db.exec(migration);
  const retired=await question(db,'2026-11-22','pm');
  await db.exec(replacementMigration);
  const next=await question(db,'2026-11-22','pm');
  assert.notEqual(next.id,retired.id,'the changed meaning has a different question identity');
  await assert.rejects(db.query(`insert into pajang_private.answers values('2026-11-22','pm',$1,'바뀌기 전 질문에 쓴 답변')`,
    [retired.q[0]]),error=>error.code==='PT409');
  await db.query(`insert into pajang_private.answers values('2026-11-22','pm',$1,'새 질문을 읽고 쓴 답변')`,[next.q[0]]);
  const answers=(await db.query('select * from pajang_private.answers order by day,slot')).rows;
  const catalog=(await db.query('select * from pajang_private.personality_question_catalog order by id')).rows;
  await db.exec(replacementMigration);
  assert.deepEqual((await db.query('select * from pajang_private.answers order by day,slot')).rows,answers);
  assert.deepEqual((await db.query('select * from pajang_private.personality_question_catalog order by id')).rows,catalog);
});

test('the replacement refuses concurrent copy changes and never relabels an already answered prompt',async t=>{
  await t.test('a different editor changed the planning question',async t=>{
    const db=await fixture(t);await db.exec(migration);
    await db.query(`update pajang_private.personality_question_catalog set samples=$1 where id=20245`,
      [['다른 편집자가 검토한 첫 답변','다른 편집자가 검토한 두 번째 답변','다른 편집자가 검토한 세 번째 답변']]);
    const before=(await db.query('select * from pajang_private.personality_question_catalog order by id')).rows;
    await assert.rejects(db.exec(replacementMigration),/planning question changed/);await db.exec('rollback');
    assert.deepEqual((await db.query('select * from pajang_private.personality_question_catalog order by id')).rows,before);
  });
  await t.test('the original prompt already received a member answer',async t=>{
    const db=await fixture(t);await db.exec(migration);
    const original=await question(db,'2026-11-22','pm');
    await db.query(`insert into pajang_private.answers values('2026-11-22','pm',$1,'먼저 작성된 회원 답변 원문')`,[original.q[0]]);
    const answers=(await db.query('select * from pajang_private.answers order by day,slot')).rows;
    await assert.rejects(db.exec(replacementMigration),/already has answers/);await db.exec('rollback');
    assert.deepEqual(await question(db,'2026-11-22','pm'),original);
    assert.deepEqual((await db.query('select * from pajang_private.answers order by day,slot')).rows,answers);
  });
});
