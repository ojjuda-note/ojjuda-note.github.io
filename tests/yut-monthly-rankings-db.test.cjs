const assert=require('node:assert/strict');
const test=require('node:test');
const {randomUUID}=require('node:crypto');
const {createFixture,installYutRankings}=require('./monthly-game-rankings-fixture.cjs');

test('completed Yut rounds rank guests and members by monthly best winning streak',async t=>{
  const {db,actor,claim,clock}=await createFixture();
  t.after(()=>db.close());
  await installYutRankings(db);
  const member=randomUUID(),token='f'.repeat(64),first=randomUUID();
  const save=async(id,won,guest=null)=>(await db.query('select public.record_yut_result($1,$2,$3) r',[id,won,guest])).rows[0].r;
  const rank=async guest=>(await db.query("select public.community_game_monthly_personal('yut',$1) r",[guest])).rows[0].r;
  await actor(member,'윷친구');await claim(member);
  await db.exec('set role authenticated');
  assert.equal((await save(first,true)).ok,true);
  assert.equal((await save(first,true)).duplicate,true);
  assert.equal((await save(first,false)).reason,'request_conflict');
  await claim(null);await db.exec('set role anon');
  // Two different people can record their own outcomes for the same room.
  assert.equal((await save(first,false,token)).ok,true);
  assert.equal((await save(randomUUID(),true,'invalid')).reason,'invalid');
  assert.equal((await rank(token)).leaders.length,1);
  for(const [minute,won] of [[1,true],[2,true],[3,false],[4,true]]){
    await db.exec('reset role');await clock('2026-10-31T12:0'+minute+':00Z');
    await db.exec('set role anon');assert.equal((await save(randomUUID(),won,token)).ok,true);
  }
  const {leaders}=await rank(token);
  assert.deepEqual(leaders.map(r=>[r.nick,r.score,r.me]),[['손님',2,true],['윷친구',1,false]]);
  assert.equal(leaders[0].source,'best_streak');
  assert.equal((await db.query("select public.community_game_monthly_ranking('yut') r")).rows[0].r[0].score,2);
  await db.exec('reset role');await claim(member);
  assert.equal((await rank(null)).leaders[1].me,true);
  const catalog=(await db.query('select ojjuda_ranking_internal.catalog() ids')).rows[0].ids;
  assert.equal(catalog.filter(id=>id==='yut').length,1);
  const archived=await db.query("select score from ojjuda_ranking_internal.candidates('yut','2026-10-31 00:00Z','2026-11-01 00:00Z') order by score desc");
  assert.deepEqual(archived.rows.map(row=>Number(row.score)),[2,1]);
});
