'use strict';

const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const test = require('node:test');
const {fixture} = require('./drinking-room-fixture.cjs');

const kinds = ['croc','bottle','bomb','stopwatch','liar','king','truth','initial','minority','mission','fingers','imagevote','updown'];
const roomTables = ['drinking_rooms','croc_rooms','liar_rooms','king_rooms','party_vote_rooms'];

test('drinking rooms retain consistent state through overlapping account requests', {timeout: 120_000}, async t => {
  const f = await fixture();
  t.after(() => f.close());
  const {db, users, names, publicRpc} = f;
  const room = (actor, action, code = '', options = {}) => publicRpc(actor, 'drinking_room', [action, code, options]);
  const native = (actor, kind, action, code = '', options = {}) => {
    if (['croc','liar','king'].includes(kind)) return publicRpc(actor, kind + '_multiplayer', [action, code, options]);
    return publicRpc(actor, ['mission','minority'].includes(kind) ? 'party_vote_multiplayer' : 'party_live_multiplayer', [kind, action, code, options]);
  };
  const reset = () => db.exec(`truncate ${roomTables.map(table => 'ojjuda_arcade_internal.' + table).join(',')},
    ojjuda_arcade_internal.drinking_ops,ojjuda_arcade_internal.drinking_attempts cascade`);
  const createOptions = (capacity = 12) => ({title: '연결 안정화 테스트', capacity, password: 'test-pass', request_id: randomUUID()});
  async function sharedRoom(count = 12) {
    const created = await room(users[0], 'create', '', createOptions(count));
    await Promise.all(users.slice(1, count).map(actor => room(actor, 'join', created.code, {password: 'test-pass'})));
    return room(users[0], 'state', created.code);
  }
  async function directRoom(kind, count = 3) {
    const created = await native(users[0], kind, 'create', '', createOptions(count));
    await Promise.all(users.slice(1, count).map(actor => native(actor, kind, 'join', created.code, {password: 'test-pass'})));
    return native(users[0], kind, 'state', created.code);
  }

  await t.test('12 seats, overlapping joins, overflow, duplicate create and join', async () => {
    const options = createOptions();
    const [first, retry] = await Promise.all([
      room(users[0], 'create', '', options), room(users[0], 'create', '', options)
    ]);
    assert.equal(first.code, retry.code);
    assert.equal(first.revision, retry.revision);
    // PGlite serializes these transactions. Overlapping promises verify account
    // isolation and legal request orderings, not simultaneous database sessions.
    const joining = await Promise.allSettled(users.slice(1, 13).map(actor => room(actor, 'join', first.code, {password: 'test-pass'})));
    assert.equal(joining.filter(result => result.status === 'fulfilled').length, 11);
    assert.equal(joining.filter(result => result.status === 'rejected').length, 1);
    assert.match(joining.find(result => result.status === 'rejected').reason.message, /room_full/);
    const accepted = users.slice(1, 13).filter((_, i) => joining[i].status === 'fulfilled');
    const state = await room(users[0], 'state', first.code);
    assert.equal(state.players.length, 12);
    assert.equal(new Set(state.players).size, 12);
    const snapshots = await Promise.all([users[0], ...accepted].map(actor => room(actor, 'state', first.code)));
    for (const [i, snapshot] of snapshots.entries()) {
      assert.deepEqual(snapshot.players, state.players);
      assert.equal(snapshot.revision, state.revision);
      assert.equal(snapshot.players[snapshot.me], names[users.indexOf([users[0], ...accepted][i])]);
    }
    const repeatJoin = await room(accepted[0], 'join', first.code, {password: 'test-pass'});
    assert.equal(repeatJoin.revision, state.revision);
    assert.deepEqual(repeatJoin.players, state.players);
    await assert.rejects(room(users[0], 'create', '', createOptions()), /room_in_progress/);
    assert.equal((await db.query('select count(*)::int n from ojjuda_arcade_internal.drinking_rooms')).rows[0].n, 1);
  });

  await t.test('all 13 games preserve the same 12 accounts across start, retry and return', async () => {
    await reset();
    let parent = await sharedRoom();
    const originalPlayers = parent.players;
    const originalCode = parent.code;
    let previousChild;
    for (const kind of kinds) {
      const start = {kind, revision: parent.revision, request_id: randomUUID()};
      parent = await room(users[0], 'start', originalCode, start);
      const retried = await room(users[0], 'start', originalCode, start);
      assert.equal(retried.child, parent.child, kind + ' start is idempotent');
      assert.equal(retried.revision, parent.revision);
      assert.equal(parent.phase, 'playing');
      assert.deepEqual(parent.players, originalPlayers);
      if (previousChild) await assert.rejects(native(users[0], previousChild.kind, 'state', previousChild.code), /room_unavailable/);
      const snapshots = await Promise.all(users.slice(0, 12).map(actor => native(actor, kind, 'state', parent.child)));
      for (const [i, snapshot] of snapshots.entries()) {
        assert.equal(snapshot.players[snapshot.me], names[i], kind + ' private seat');
        assert.deepEqual(snapshot.players, originalPlayers, kind + ' roster');
        assert.equal(snapshot.revision, snapshots[0].revision, kind + ' revision');
        assert.notEqual(snapshot.phase, 'waiting', kind + ' starts once');
        assert.equal('password_hash' in snapshot, false);
        assert.equal('members' in snapshot, false);
        assert.equal('cards' in snapshot, false, 'the complete private deal is never returned');
      }
      if (kind === 'croc') assert.equal(snapshots[0].trap, null);
      await assert.rejects(native(users[13], kind, 'state', parent.child), /not_room_member/);
      await assert.rejects(native(users[0], kind, 'leave', parent.child), /managed_room/);
      previousChild = {kind, code: parent.child};
      parent = await room(users[0], 'return', originalCode, {revision: parent.revision, request_id: randomUUID()});
      assert.equal(parent.phase, 'lobby');
      assert.equal(parent.code, originalCode);
      assert.deepEqual(parent.players, originalPlayers);
    }
    const childCount = await db.query(`select ${roomTables.slice(1).map(table => `(select count(*) from ojjuda_arcade_internal.${table} where drinking_code=$1)`).join('+')} as n`, [originalCode]);
    assert.equal(Number(childCount.rows[0].n), 0);
  });

  await t.test('12 overlapping stopwatch scores survive shared revisions and lost replies', async () => {
    await reset();
    let parent = await sharedRoom();
    parent = await room(users[0], 'start', parent.code, {kind: 'stopwatch', revision: parent.revision, request_id: randomUUID()});
    let game = await native(users[0], 'stopwatch', 'state', parent.child);
    game = await native(users[0], 'stopwatch', 'watch_begin', game.code, {target: 50, round: game.round, revision: game.revision, request_id: randomUUID()});
    const expected = users.slice(0, 12).map((_, i) => 4900 + i * 25);
    const requests = expected.map(score => ({score, round: game.round, revision: game.revision, request_id: randomUUID()}));
    const submitted = await Promise.all(users.slice(0, 12).map((actor, i) => native(actor, 'stopwatch', 'watch_score', game.code, requests[i])));
    assert.equal(submitted.length, 12);
    const final = await native(users[0], 'stopwatch', 'state', game.code);
    assert.equal(final.phase, 'done');
    assert.equal(final.game.submitted, 12);
    assert.deepEqual(final.game.scores, expected);
    const retry = await native(users[0], 'stopwatch', 'watch_score', game.code, requests[0]);
    assert.equal(retry.revision, final.revision);
    assert.deepEqual(retry.game.scores, expected);
    await assert.rejects(native(users[0], 'stopwatch', 'watch_score', game.code, {...requests[0], score: 9999, request_id: randomUUID()}), /stale_state|already_scored|unavailable/);
    assert.deepEqual((await native(users[1], 'stopwatch', 'state', game.code)).game.scores, expected);
  });

  await t.test('overlapping votes count once and an old round cannot alter the next round', async () => {
    await reset();
    const game = await directRoom('minority', 12);
    assert.equal(game.phase, 'vote');
    const ballot = users.slice(0, 12).map((actor, i) => native(actor, 'minority', 'vote', game.code, {round: game.round, target: i % 2}));
    await Promise.all(ballot);
    const final = await native(users[0], 'minority', 'state', game.code);
    assert.equal(final.phase, 'done');
    assert.equal(final.voteCount, 12);
    assert.deepEqual(final.votes, Array.from({length: 12}, (_, i) => i % 2));
    const retry = await native(users[0], 'minority', 'vote', game.code, {round: game.round, target: 0});
    assert.equal(retry.revision, final.revision);
    const next = await native(users[0], 'minority', 'again', game.code, {round: final.round});
    assert.equal(next.round, final.round + 1);
    await assert.rejects(native(users[1], 'minority', 'vote', game.code, {round: game.round, target: 0}), /stale_round/);
    await assert.rejects(native(users[0], 'minority', 'again', game.code, {round: final.round}), /stale_round/);
    assert.equal((await native(users[0], 'minority', 'state', game.code)).voteCount, 0);
  });

  await t.test('host handoff preserves the room and a lost leave response is safe to retry', async () => {
    await reset();
    let parent = await sharedRoom();
    parent = await room(users[0], 'start', parent.code, {kind: 'liar', revision: parent.revision, request_id: randomUUID()});
    const leave = {revision: parent.revision, request_id: randomUUID()};
    assert.deepEqual(await room(users[0], 'leave', parent.code, leave), {left: true});
    assert.deepEqual(await room(users[0], 'leave', parent.code, leave), {left: true});
    const remaining = await Promise.all(users.slice(1, 12).map(actor => room(actor, 'state', parent.code)));
    const state = remaining[0];
    assert.equal(state.phase, 'lobby');
    assert.equal(state.players.length, 11);
    assert.equal(state.players.includes(names[0]), false);
    assert.equal(remaining.filter(snapshot => snapshot.me === 0).length, 1);
    for (const [i, snapshot] of remaining.entries()) {
      assert.equal(snapshot.code, parent.code);
      assert.deepEqual(snapshot.players, state.players);
      assert.equal(snapshot.players[snapshot.me], names[i + 1]);
    }
    await assert.rejects(native(users[1], 'liar', 'state', parent.child), /room_unavailable/);
    await assert.rejects(room(users[0], 'state', parent.code), /not_room_member/);
    const newHost = users[names.indexOf(state.players[0])];
    const restarted = await room(newHost, 'start', parent.code, {kind: 'croc', revision: state.revision, request_id: randomUUID()});
    assert.equal(restarted.phase, 'playing');
    assert.equal(restarted.players.length, 11);
  });

  await t.test('all four native engines retain correct seats when the host leaves', async () => {
    for (const kind of ['croc', 'liar', 'king', 'minority']) {
      await reset();
      const original = await directRoom(kind);
      assert.deepEqual(await native(users[0], kind, 'leave', original.code, {round: original.round, waiting: false, host: true}), {left: true});
      const a = await native(users[1], kind, 'state', original.code);
      const b = await native(users[2], kind, 'state', original.code);
      assert.equal(a.phase, 'waiting', kind);
      assert.equal(a.round, original.round + 1);
      assert.deepEqual(new Set(a.players), new Set(names.slice(1, 3)));
      assert.deepEqual(a.players, b.players);
      assert.deepEqual(new Set([a.me, b.me]), new Set([0, 1]));
      const rejoined = await native(users[3], kind, 'join', original.code, {password: 'test-pass'});
      assert.equal(rejoined.players.length, 3);
      assert.equal(rejoined.round, a.round);
      assert.notEqual(rejoined.phase, 'waiting');
    }
  });

  await t.test('stale shared-room actions and unauthorized reads leave data unchanged', async () => {
    await reset();
    const created = await room(users[0], 'create', '', createOptions(3));
    const joined = await room(users[1], 'join', created.code, {password: 'test-pass'});
    await assert.rejects(room(users[0], 'start', created.code, {kind: 'croc', revision: created.revision, request_id: randomUUID()}), /stale_state/);
    await assert.rejects(room(users[1], 'select', created.code, {kind: 'croc', revision: joined.revision, request_id: randomUUID()}), /host_only/);
    await assert.rejects(room(users[13], 'state', created.code), /not_room_member/);
    assert.deepEqual(await room(users[12], 'join', created.code, {password: 'wrong-pass'}), {error: 'wrong_password'});
    await assert.rejects(room(users[14], 'join', created.code, {password: 'test-pass'}), /adult_required/);
    await assert.rejects(room(users[15], 'join', created.code, {password: 'test-pass'}), /not_signed_in/);
    await assert.rejects(publicRpc('', 'drinking_room', ['state', created.code], 'anon'), /permission denied/);
    await assert.rejects(db.transaction(async tx => {
      await tx.exec('set local role authenticated');
      return tx.query('select password_hash from ojjuda_arcade_internal.drinking_rooms');
    }), /permission denied/);
    const after = await room(users[0], 'state', created.code);
    assert.equal(after.revision, joined.revision);
    assert.deepEqual(after.players, joined.players);
    assert.equal(after.phase, 'lobby');
    assert.equal(after.child, null);
  });

  await t.test('the last departure closes once and its receipt remains retryable', async () => {
    await reset();
    const parent = await room(users[0], 'create', '', createOptions(2));
    const leave = {revision: parent.revision, request_id: randomUUID()};
    const replies = await Promise.all([room(users[0], 'leave', parent.code, leave), room(users[0], 'leave', parent.code, leave)]);
    assert.deepEqual(replies, [{left: true}, {left: true}]);
    await assert.rejects(room(users[0], 'state', parent.code), /room_unavailable/);
    assert.deepEqual(await room(users[0], 'mine'), {room: null});
  });
});
