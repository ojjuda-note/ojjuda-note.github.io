const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createFixture, definition, read } = require('./monthly-game-rankings-fixture.cjs');

const migration = read('20261108064126_preserve_streak_across_game_exits.sql');
function block(name) {
 const marker = `$${name}$`, start = migration.indexOf('do ' + marker), end = migration.indexOf('end;\n' + marker + ';', start);
 assert.ok(start >= 0 && end > start, name + ' is in the actual migration');
 return migration.slice(start, end + ('end;\n' + marker + ';').length);
}

test('saved wins from different visits survive unfinished room closures; real losses still break streaks', async () => {
 const { db, clock, claim, actor } = await createFixture();
 try {
  await db.exec(`
   create schema ojjuda_tank_internal;
   create table ojjuda_tank_internal.rooms(id uuid primary key,status text,state jsonb,rank_excluded integer[] default '{}',members uuid[]);
   create table ojjuda_bang_internal.rooms(id uuid primary key,mode text,status text,state jsonb,expires_at timestamptz,members uuid[]);
  `);
  await clock('2026-10-31T12:00:00Z');
  const user = randomUUID(); await actor(user, '다시 접속한 회원'); await claim(user);
  const at = minute => `2026-10-31T10:0${minute}:00Z`;
  const tank = async (won, minute, { unfinished = false } = {}) => {
   const id = randomUUID();
   await db.query('insert into ojjuda_tank_internal.rooms(id,status,state,members) values($1,$2,$3,array[$4::uuid])',
    [id, unfinished ? 'closed' : 'finished', { over: !unfinished }, user]);
   await db.query(`insert into ojjuda_guest_internal.round_records(game,actor_key,user_id,round_id,value,source,achieved_at,opponents)
    values('tank','member:'||$1,$1::uuid,$2,$3,'solo',$4,3)`, [user, id, Number(won), at(minute)]);
   return id;
  };
  const bang = async (won, minute, { unfinished = false, forfeit = false } = {}) => {
   const id = randomUUID(), time = at(minute);
   await db.query(`insert into ojjuda_bang_internal.rooms(id,mode,status,state,expires_at,members)
    values($1,'solo',$2,$3,$4,array[$5::uuid])`,
    [id, unfinished ? 'closed' : 'finished', { players: [{ alive: true }], forfeited: forfeit ? [0] : [], winner: unfinished ? undefined : 'sheriff' }, time, user]);
   await db.query('insert into ojjuda_bang_internal.results values($1,$2,$3,$4)', [id, user, won, time]);
   return id;
  };
  const score = async game => (await db.query('select public.community_game_monthly_ranking($1) v', [game])).rows[0].v[0]?.score ?? 0;

  await tank(true, 0); await bang(true, 0);
  const tankUnfinished = await tank(false, 1, { unfinished: true });
  const bangUnfinished = await bang(false, 1, { unfinished: true });
  await tank(true, 2); const latestBangWin = await bang(true, 2);
  assert.equal(await score('tank'), 1, 'old ranking mistook a closed unfinished tank room for a loss');
  assert.equal(await score('bang'), 1, 'old ranking mistook an expired solo room for a loss');

  for (const name of ['ojjuda_ranking_internal.tank_participants', 'ojjuda_guest_internal.tank_candidates', 'ojjuda_ranking_internal.bang_participants']) {
   await db.exec(definition(migration, name));
  }
  await db.exec(block('streak_bang_receipt'));
  assert.equal(await score('tank'), 2, 'completed wins from different visits are consecutive');
  assert.equal(await score('bang'), 2, 'the expired unfinished round does not interrupt prior wins');
  const record = async id => (await db.query('select ojjuda_bang_internal.player_record($1,$2) v', [user,id])).rows[0].v;
  assert.equal((await record(latestBangWin)).streak, 2);
  assert.equal(await record(bangUnfinished), null, 'the synthetic expired receipt must not appear as a scored loss');

  await tank(false, 3); await bang(false, 3, { forfeit: true });
  const finalTankWin = await tank(true, 4), finalBangWin = await bang(true, 4);
  assert.equal(await score('tank'), 2, 'the monthly best remains after a genuine tank loss');
  assert.equal(await score('bang'), 2, 'the monthly best remains after surrender');
  assert.equal((await record(finalBangWin)).streak, 1, 'a true Bang surrender resets only the current run');
  const currentTank = (await db.query("select score from ojjuda_guest_internal.tank_candidates('-infinity','infinity') where user_id=$1", [user])).rows[0];
  assert.equal(Number(currentTank.score), 1, 'the current Tank run restarts after a completed loss');
  assert.equal((await db.query('select count(*)::int n from ojjuda_guest_internal.round_records where round_id in ($1,$2)', [tankUnfinished,finalTankWin])).rows[0].n, 2, 'existing records are left untouched');
 } finally { await db.close(); }
});

test('closing an active tank room creates no loss; a completed surrender is recorded', async () => {
 const { fixture, ids } = require('./multiplayer-session-fixture.cjs');
 const f = await fixture();
 try {
  await f.db.exec(block('streak_tank_exit'));
  const call = async (actor, body) => {
   const result = await f.callGame('tank', actor, body);
   assert.equal(result.ok, true, JSON.stringify(result));
   return result.room;
  };
  const [a, b] = ids;
  const create = async () => {
   let room = await call(a, { action: 'create', request_id: randomUUID(), options: { capacity: 2, title: '연승 확인' } });
   room = await call(b, { action: 'join', code: room.code });
   return call(a, { action: 'start', room_id: room.id, version: room.version, request_id: randomUUID() });
  };
  const abandoned = await create();
  await f.db.query("update ojjuda_tank_internal.rooms set status='closed' where id=$1", [abandoned.id]);
  assert.equal((await f.db.query('select count(*)::int n from ojjuda_guest_internal.round_records where round_id=$1', [abandoned.id])).rows[0].n, 0);
  const finished = await create();
  await call(a, { action: 'surrender', room_id: finished.id, version: finished.version, request_id: randomUUID() });
  const recorded = (await f.db.query('select value from ojjuda_guest_internal.round_records where round_id=$1 and user_id=$2', [finished.id,a])).rows;
  assert.deepEqual(recorded.map(r => Number(r.value)), [0], 'explicit surrender remains a completed loss');
 } finally { await f.close(); }
});
