const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {createFixture} = require('./monthly-game-rankings-fixture.cjs');

const migration = fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261108140000_monthly_game_personal_rank.sql'),'utf8');

test('monthly leaderboard shows top ten and authenticated/guest rank below ten, then rolls over at 01:00 KST',async t=>{
 const {db,actor,claim,clock} = await createFixture();
 t.after(()=>db.close());
 await db.exec(migration.replace(/\b(?:clock_timestamp|statement_timestamp|now)\(\)/g,'fixture.clock()'));
 const ids=Array.from({length:12},(_,i)=>`a0000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
 for(let i=0;i<ids.length;i++){
  await actor(ids[i],`선수${i+1}`);
  await db.query('insert into public.game_scores(user_id,game,score,created_at) values($1,$2,$3,$4)',
   [ids[i],'runner',120-i*10,'2026-10-15T00:00:00Z']);
 }
 await clock('2026-10-31T15:59:59Z');
 const read=async(game='runner',guestToken=null)=>(await db.query('select public.community_game_monthly_personal($1,$2) value',[game,guestToken])).rows[0].value;

 await claim(ids[11]);
 let result=await read();
 assert.equal(result.month,'2026-10');
 assert.equal(result.leaders.length,10);
 assert.deepEqual(result.leaders.map(row=>row.nick),ids.slice(0,10).map((_,i)=>`선수${i+1}`));
 assert.equal(result.mine.rank,12);
 assert.equal(result.mine.score,10);
 assert.equal(result.mine.nick,'선수12');
 assert.equal(result.mine.me,true);
 assert.equal(result.mine.user_id,undefined,'private user IDs are never returned');
 assert.equal(Date.parse(result.endsAt),Date.parse('2026-10-31T16:00:00Z'));

 await claim(ids[0]);result=await read();
 assert.equal(result.mine,null,'the highlighted top-ten entry is not duplicated');
 assert.equal(result.leaders[0].me,true);
 assert.equal(result.leaders[1].me,false);

 const token='a'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
 await db.query('insert into ojjuda_ranking_internal.guest_peaks values($1,$2,$3,$4,$5)',
  ['2026-10-01','runner',hash,5,'2026-10-15T00:00:00Z']);
 await claim(null);
 result=await read('runner',token);
 assert.equal(result.mine.rank,13);
 assert.equal(result.mine.score,5);
 assert.equal(result.mine.nick,'손님');
 assert.equal(result.leaders.some(row=>row.me),false);
 assert.equal((await read('runner','b'.repeat(64))).mine,null,'a different guest cannot read another guest identity');
 assert.equal((await read('runner','invalid')).mine,null,'invalid guest tokens do not match');

 await assert.rejects(read('unknown'),/invalid_game/);
 await assert.rejects(read('bang'),/not_signed_in/);
 await db.exec('set role anon');
 assert.equal((await read('runner',token)).mine.rank,13,'guest RPC is callable by anon without private ledger access');
 await assert.rejects(db.query('select * from ojjuda_ranking_internal.guest_peaks'),/permission denied/);
 await db.exec('reset role');

 const nextToken='b'.repeat(64),nextHash=createHash('sha256').update(nextToken).digest('hex');
 await db.query('insert into ojjuda_ranking_internal.guest_peaks values($1,$2,$3,$4,$5)',
  ['2026-10-01','runner',nextHash,5,'2026-10-15T00:00:00Z']);
 const rankA=(await read('runner',token)).mine.rank,rankB=(await read('runner',nextToken)).mine.rank;
 assert.deepEqual([rankA,rankB].sort((a,b)=>a-b),[13,14]);
 assert.equal(rankA<rankB,hash<nextHash,'same score and timestamp use the same stable identity tie-breaker as top ten');

 await clock('2026-10-31T16:00:00Z');
 result=await read('runner',token);
 assert.equal(result.month,'2026-11');
 assert.deepEqual(result.leaders,[]);
 assert.equal(result.mine,null,'records are preserved but are not carried into the next ranking month');
 assert.equal(Date.parse(result.startsAt),Date.parse('2026-10-31T16:00:00Z'));
});
