const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./onecard-online-fixture.cjs');

(async () => {
  const f = await fixture(), { db, call, users } = f, [A, B, C, D, E, OUT, BANNED, ANON] = users;
  const { chooseBotAction } = await import('../games/onecard/engine.mjs');
  const action = (actor, room, type, extra = {}) => call(actor, {
    action: type, room_id: room.id, version: room.version, request_id: crypto.randomUUID(), ...extra,
  });
  const read = async (actor, id) => { const result = await call(actor, { action: 'read', room_id: id }); assert.equal(result.httpStatus, 200, JSON.stringify(result)); return result.room; };
  const create = async (actor = A, capacity = 5) => {
    const result = await call(actor, { action: 'create', request_id: crypto.randomUUID(), options: { capacity } });
    assert.equal(result.httpStatus, 200, JSON.stringify(result)); return result.room;
  };
  const join = async (actor, room) => { const result = await call(actor, { action: 'join', code: room.code }); assert.equal(result.httpStatus, 200, JSON.stringify(result)); return result.room; };
  try {
    assert.equal(fs.readFileSync(path.join(__dirname, '../games/onecard/engine.mjs'), 'utf8'),
      fs.readFileSync(path.join(__dirname, '../supabase/functions/onecard/engine.mjs'), 'utf8'), 'solo and server use byte-identical rules');
    for (const role of ['anon', 'authenticated']) {
      const { rows: [privileges] } = await db.query(`select
        has_schema_privilege($1,'ojjuda_onecard_internal','usage') as schema,
        has_table_privilege($1,'ojjuda_onecard_internal.rooms','select') as table_read,
        has_function_privilege($1,'public.onecard_online_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb)','execute') as rpc`, [role]);
      assert.deepEqual(privileges, { schema: false, table_read: false, rpc: false });
    }
    assert.equal((await call('invalid', { action: 'mine' })).httpStatus, 401);
    assert.equal((await call(ANON, { action: 'mine' })).httpStatus, 401);
    assert.equal((await call(BANNED, { action: 'mine' })).error, 'banned');
    assert.equal((await call(A, { action: 'mine' }, { headers: { origin: 'https://other.invalid' } })).httpStatus, 403);
    assert.equal((await call(A, { action: 'create', options: { capacity: 6 }, request_id: crypto.randomUUID() })).httpStatus, 400);
    let room = await create();
    assert.equal(room.capacity, 5); assert.equal(room.game, null);
    assert.equal((await action(A, room, 'start')).error, 'need_players');
    assert.equal((await call(A, { action: 'create', request_id: crypto.randomUUID(), options: { capacity: 2 } })).error, 'room_in_progress');
    for (const actor of [B, C, D, E]) room = await join(actor, room);
    assert.equal((await call(OUT, { action: 'join', code: room.code })).error, 'room_full');
    assert.equal((await call(OUT, { action: 'read', room_id: room.id })).error, 'room_not_found');
    assert.equal((await action(B, room, 'start')).error, 'not_room_owner');
    const started = await action(A, room, 'start'); assert.equal(started.httpStatus, 200, JSON.stringify(started)); room = started.room;
    assert.equal(room.game.players.length, 5); assert.equal(room.status, 'active');
    for (const actor of [A, B, C, D, E]) {
      const own = await read(actor, room.id), wire = JSON.stringify(own);
      assert.equal(own.myId, actor); assert.equal(own.game.viewerId, actor);
      for (const secret of ['deck', 'discard', 'state', 'requests', 'rng', 'seed', 'create_request'])
        assert.ok(!wire.includes(`"${secret}":`), `${secret} never crosses the server boundary`);
      for (const player of own.game.players) {
        if (player.id === actor) assert.equal(player.hand.length, 7);
        else assert.equal(player.hand, undefined, 'opponents never receive face identities');
      }
      for (const event of own.game.lastEvents) if (event.type === 'deal' && event.playerId !== actor)
        assert.equal(event.cardId, undefined, 'deal animation does not leak card identities');
    }
    assert.equal((await action(C, room, 'move', { command: { type: 'draw' }, userId: A })).error, 'not_your_turn', 'client cannot impersonate the current player');
    const request = { action: 'move', room_id: room.id, version: room.version, request_id: crypto.randomUUID(), command: { type: 'draw' } };
    const moved = await call(A, request); assert.equal(moved.httpStatus, 200, JSON.stringify(moved));
    const duplicate = await call(A, request); assert.equal(duplicate.room.version, moved.room.version, 'lost response retry is idempotent');
    assert.equal((await call(A, { ...request, request_id: crypto.randomUUID() })).error, 'state_conflict');
    room = moved.room;
    const actor = room.game.players[room.game.turn].id;
    const race = await Promise.all([action(actor, room, 'move', { command: { type: 'draw' } }), action(actor, room, 'move', { command: { type: 'draw' } })]);
    assert.equal(race.filter(r => r.httpStatus === 200).length, 1, 'only one concurrent move commits');
    assert.equal(race.find(r => r.httpStatus !== 200).error, 'state_conflict');
    room = await read(A, room.id);
    const beforeTimeout = room.version;
    await db.query("update ojjuda_onecard_internal.rooms set deadline=clock_timestamp()-interval '1 second' where id=$1", [room.id]);
    await Promise.all([A, B, C, D, E].map(id => read(id, room.id)));
    room = await read(A, room.id);
    assert.equal(room.version, beforeTimeout + 1, 'concurrent polls apply a timeout exactly once');
    assert.equal((await call(C, { action: 'mine' })).room.id, room.id, 'refresh resumes membership');
    // A valid 19-card position exercises elimination through the real HTTP and SQL
    // boundary. Preserve all 54 identities while moving cards out of the stock.
    const raw = (await db.query('select state from ojjuda_onecard_internal.rooms where id=$1', [room.id])).rows[0].state;
    const nearLimit = raw.players[raw.turn], eliminatedId = nearLimit.id;
    nearLimit.hand.push(...raw.deck.splice(0, 19 - nearLimit.hand.length));
    raw.pendingDraw = 2;
    await db.query('update ojjuda_onecard_internal.rooms set state=$2,version=version+1 where id=$1', [room.id, raw]);
    room = (await action(eliminatedId, await read(eliminatedId, room.id), 'move', { command: { type: 'draw' } })).room;
    assert.equal(room.game.players.find(p => p.id === eliminatedId).active, false);
    assert.equal(room.players.find(p => p.id === eliminatedId).active, true, 'elimination retains lobby membership for rematch');
    let turns = 0;
    while (room.status === 'active') {
      assert.ok(turns++ < 2000, 'five-player game must finish');
      const currentId = room.game.players[room.game.turn].id;
      const own = await read(currentId, room.id);
      const command = chooseBotAction(own.game, currentId);
      const result = await action(currentId, own, 'move', { command });
      assert.equal(result.httpStatus, 200, JSON.stringify({ result, command }));
      room = result.room;
    }
    assert.equal(room.status, 'finished');
    assert.ok(room.game.winnerId || room.game.winnerIds?.length, 'server determines a winner');
    assert.equal((await action(C, await read(C, room.id), 'leave')).room, null);
    room = await read(A, room.id);
    const rematch = await action(A, room, 'start'); assert.equal(rematch.httpStatus, 200, JSON.stringify(rematch)); room = rematch.room;
    assert.equal(room.round, 2); assert.equal(room.game.players.length, 4); assert.equal(room.game.players.some(p => p.id === C), false);
    assert.equal(room.game.players.find(p => p.id === eliminatedId).active, true, 'eliminated members receive a fresh hand in the next round');
    assert.equal((await action(A, room, 'leave')).room, null);
    room = await read(B, room.id); assert.equal(room.hostId, B, 'host leaves without abandoning the room');
    assert.equal(room.game.players.find(p => p.id === A).active, false);
    assert.equal((await call(A, { action: 'mine' })).room, null);
    assert.equal((await call(A, { action: 'read', room_id: room.id })).error, 'room_unavailable');
    for (const id of [B, D, E]) assert.equal((await action(id, await read(id, room.id), 'leave')).room, null);
    assert.equal((await call(E, { action: 'mine' })).room, null);

    room = await create(OUT, 2);
    const lastSeat = await Promise.all([call(A, { action: 'join', code: room.code }), call(B, { action: 'join', code: room.code })]);
    assert.equal(lastSeat.filter(r => r.httpStatus === 200).length, 1, 'last seat is allocated atomically');
    assert.equal(lastSeat.find(r => r.httpStatus !== 200).error, 'room_full');
    const guest = lastSeat[0].httpStatus === 200 ? A : B;
    room = await read(OUT, room.id);
    await action(OUT, room, 'leave'); room = await read(guest, room.id);
    assert.equal(room.hostId, guest); assert.equal(room.players.length, 1, 'waiting seats are removed cleanly');
    await action(guest, room, 'leave');
    room = await create(C);
    await db.query('insert into public.test_blocks values($1,$2)', [C, OUT]);
    assert.equal((await call(OUT, { action: 'join', code: room.code })).error, 'room_unavailable');
    await db.query("update ojjuda_onecard_internal.rooms set expires_at=clock_timestamp()-interval '1 second' where id=$1", [room.id]);
    assert.equal((await call(C, { action: 'mine' })).room, null);
    assert.equal((await call(OUT, { action: 'join', code: room.code })).error, 'room_unavailable');
    console.log(`PASS: ${turns} full-game turns; 5-player server flow, hidden hands, auth, blocked users, races, idempotency, timeout, reconnect, rematch, host transfer, leave, expiry and SQL permissions`);
  } finally { await f.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
