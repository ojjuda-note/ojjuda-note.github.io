const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {test} = require('node:test');
const {createFixture, definition, read} = require('./monthly-game-rankings-fixture.cjs');

test('six Janggi tiers, legacy clients, receipts and monthly rankings', async () => {
 const {db, actor, claim} = await createFixture();
 try {
  const old = read('20261005053032_current_game_win_streaks.sql');
  await db.exec(`alter table ojjuda_game_internal.practice_results
   add primary key(user_id,round_id), alter column created_at set default clock_timestamp(),
   add constraint practice_results_difficulty_check check(difficulty in ('easy','normal','hard'));
   grant usage on schema ojjuda_game_internal to authenticated;`);
  await db.exec(definition(old,'ojjuda_game_internal.record_practice_game_result'));
  await db.exec(definition(old,'public.record_practice_game_result'));
  const player = randomUUID(), other = randomUUID();
  await actor(player,'A'); await actor(other,'B'); await claim(player);
  const one = async (sql,args=[]) => (await db.query(sql,args)).rows[0].v;
  const save = (level,outcome='win',round=randomUUID(),game='janggi') =>
   one('select public.record_practice_game_result($1,$2,$3,$4) v',[game,round,outcome,level]);
  const summary = () => one('select public.janggi_streak_summary() v');
  const oldRound = randomUUID();
  await save('hard','win',oldRound);
  await db.exec(read('20261115105216_janggi_difficulty_streaks.sql'));
  await db.exec('set role authenticated');
  const levels=['easy','normal','hard_exact','pro','master','grandmaster'];
  assert.equal((await summary()).hard_exact.best,null);
  assert.deepEqual((await save('hard','win',oldRound)).streak,{current:1,best:1});
  for(const level of levels) assert.deepEqual((await save(level)).streak,{current:1,best:1});
  const replay = randomUUID();
  assert.deepEqual((await save('master','win',replay)).streak,{current:2,best:2});
  assert.deepEqual((await save('master','win',replay)).streak,{current:2,best:2});
  await assert.rejects(save('pro','win',replay),/result_already_recorded/);
  await assert.rejects(save('pro','win',randomUUID(),'chess'),/invalid_difficulty/);
  assert.deepEqual((await save('pro','draw')).streak,{current:0,best:1});
  assert.deepEqual((await save('hard_exact','loss')).streak,{current:0,best:1});
  assert.deepEqual((await save('master')).streak,{current:3,best:3});
  await save('hard');
  const stats = await summary();
  assert.deepEqual(stats.hard,{current:2,best:2,monthly_best:2});
  assert.deepEqual(stats.hard_exact,{current:0,best:1,monthly_best:1});
  assert.deepEqual(stats.master,{current:3,best:3,monthly_best:3});
  assert.equal(stats.grandmaster.current,1);
  await claim(other);
  assert.deepEqual((await summary()).master,{current:null,best:null,monthly_best:3});
  await db.exec('reset role');
  for(const fn of ['ojjuda_ranking_internal.board_participants','ojjuda_guest_internal.streak_candidates']) {
   assert.equal(await one(`select difficulty v from ${fn}('janggi','-infinity','infinity') where user_id=$1`,[player]),'grandmaster');
  }
  await db.exec('set role anon');
  await assert.rejects(summary(),/permission denied/);
 } finally { await db.close(); }
});
