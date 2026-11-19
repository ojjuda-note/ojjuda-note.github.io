const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./onecard-online-fixture.cjs');

(async () => {
  const f = await fixture(), { db, call, users } = f, [A, B, C, D, E, OUT, BANNED, ANON] = users;
  const engine = await import('../games/onecard/engine.mjs');
  const action = (actor, room, type, extra = {}) => call(actor, {
    action: type, room_id: room.id, version: room.version, request_id: crypto.randomUUID(), ...extra,
  });
  const ok = result => { assert.equal(result.httpStatus, 200, JSON.stringify(result)); return result.room; };
  const read = async (actor, id) => ok(await call(actor, { action: 'read', room_id: id }));
  const create = async (actor = A, capacity = 5) => ok(await call(actor, { action: 'create', request_id: crypto.randomUUID(), options: { capacity } }));
  const join = async (actor, room) => ok(await call(actor, { action: 'join', code: room.code }));
  const raw = async id => (await db.query('select * from ojjuda_onecard_internal.rooms where id=$1', [id])).rows[0];
  const expireTurn = id => db.query("update ojjuda_onecard_internal.rooms set deadline=clock_timestamp()-interval '1 second' where id=$1", [id]);
  function conserved(state, seats = 5) {
    assert.equal(state.players.length, seats); assert.ok([1, -1].includes(state.direction));
    assert.deepEqual([...state.deck, ...state.discard, ...state.players.flatMap(p => p.hand)].sort(), engine.makeDeck().sort(), 'all 54 card identities remain conserved');
  }
  function privateView(room, actor, handSize) {
    const wire = JSON.stringify(room);
    assert.equal(room.myId, actor); assert.equal(room.game.viewerId, actor);
    assert.equal(room.seat, room.game.players.findIndex(player => player.id === actor), 'seat follows shuffled game order');
    for (const secret of ['deck', 'discard', 'state', 'requests', 'rng', 'seed', 'create_request'])
      assert.ok(!wire.includes(`"${secret}":`), `${secret} never crosses the server boundary`);
    for (const player of room.game.players) {
      if (player.id === actor) { assert.ok(Array.isArray(player.hand)); if (handSize !== undefined) assert.equal(player.hand.length, handSize); }
      else assert.equal(player.hand, undefined, 'opponent and computer face identities remain private');
    }
    for (const event of room.game.lastEvents) if (event.type === 'deal' && event.playerId !== actor)
      assert.equal(event.cardId, undefined, 'deal animation cannot reveal a private card');
  }
  async function closeRoom(ids, room) {
    for (const actor of ids) { room = await read(actor, room.id); assert.equal(ok(await action(actor, room, 'leave')), null); }
    assert.equal((await raw(room.id)).status, 'closed', 'no abandoned all-computer room remains after the last person leaves');
  }
  let turns = 0, computerTurns = 0;
  try {
    assert.equal(fs.readFileSync(path.join(__dirname, '../games/onecard/engine.mjs'), 'utf8'),
      fs.readFileSync(path.join(__dirname, '../supabase/functions/onecard/engine.mjs'), 'utf8'), 'solo and server use byte-identical rules');
    const serviceDefinition = (await db.query("select pg_get_functiondef('ojjuda_onecard_internal.room_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb)'::regprocedure) body")).rows[0].body;
    assert.match(serviceDefinition, /where id = existing and members @> array\[p_actor\]\s+and not departed\[array_position\(members, p_actor\)\]\s+and status in \('waiting', 'active', 'finished'\) and expires_at > clock_timestamp\(\)\s+for update/i,
      'resume rechecks current membership and locks after finding the room ID, before exposing a private hand');
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
    assert.equal((await call(A, { action: 'create', request_id: crypto.randomUUID(), options: { capacity: 2 } })).error, 'room_in_progress');
    for (const actor of [B, C, D, E]) room = await join(actor, room);
    assert.equal((await call(OUT, { action: 'join', code: room.code })).error, 'room_full');
    assert.equal((await call(OUT, { action: 'read', room_id: room.id })).error, 'room_not_found');
    assert.equal((await action(B, room, 'start')).error, 'not_room_owner');
    room = ok(await action(A, room, 'start'));
    assert.equal(room.game.players.length, 5); assert.equal(room.status, 'active'); assert.equal(room.game.turn, 0);
    assert.equal(room.game.players.filter(p => p.bot).length, 0);
    const firstOrder = room.game.players.map(p => p.id);
    assert.notDeepEqual(firstOrder, [A, B, C, D, E], 'injected deterministic random source shuffles member order');
    for (const actor of [A, B, C, D, E]) privateView(await read(actor, room.id), actor, 7);
    const starter = room.game.players[room.game.turn].id, other = [A, B, C, D, E].find(id => id !== starter);
    assert.equal((await action(other, room, 'move', { command: { type: 'draw' }, userId: starter })).error, 'not_your_turn', 'a client cannot impersonate the randomly selected starter');
    const request = { action: 'move', room_id: room.id, version: room.version, request_id: crypto.randomUUID(), command: { type: 'draw' } };
    const moved = ok(await call(starter, request));
    assert.equal(ok(await call(starter, request)).version, moved.version, 'lost response retries stay idempotent');
    assert.equal((await call(starter, { ...request, request_id: crypto.randomUUID() })).error, 'state_conflict');
    room = moved;
    const actor = room.game.players[room.game.turn].id;
    const race = await Promise.all([action(actor, room, 'move', { command: { type: 'draw' } }), action(actor, room, 'move', { command: { type: 'draw' } })]);
    assert.equal(race.filter(r => r.httpStatus === 200).length, 1, 'only one concurrent move commits');
    assert.equal(race.find(r => r.httpStatus !== 200).error, 'state_conflict');
    room = await read(A, room.id);
    const beforeTimeout = room.version;
    await expireTurn(room.id); await Promise.all([A, B, C, D, E].map(id => read(id, room.id)));
    room = await read(A, room.id);
    assert.equal(room.version, beforeTimeout + 1, 'concurrent polls apply a human timeout exactly once');
    assert.equal((await call(C, { action: 'mine' })).room.id, room.id, 'refresh resumes membership');

    const position = (await raw(room.id)).state, nearLimit = position.players[position.turn], eliminatedId = nearLimit.id;
    nearLimit.hand.push(...position.deck.splice(0, 19 - nearLimit.hand.length)); position.pendingDraw = 2;
    conserved(position);
    await db.query('update ojjuda_onecard_internal.rooms set state=$2,version=version+1 where id=$1', [room.id, position]);
    room = ok(await action(eliminatedId, await read(eliminatedId, room.id), 'move', { command: { type: 'draw' } }));
    assert.equal(room.game.players.find(p => p.id === eliminatedId).active, false);
    assert.equal(room.players.find(p => p.id === eliminatedId).active, true, 'elimination retains lobby membership');
    while (room.status === 'active') {
      assert.ok(turns++ < 2000, 'five-person game finishes');
      const currentId = room.game.players[room.game.turn].id, own = await read(currentId, room.id);
      room = ok(await action(currentId, own, 'move', { command: engine.chooseBotAction(own.game, currentId) }));
      assert.ok([1, -1].includes(room.game.direction));
      assert.deepEqual(room.game.players.map(p => p.id), firstOrder, 'seating is stable within a round');
    }
    conserved((await raw(room.id)).state);
    assert.ok(room.game.winnerId || room.game.winnerIds?.length);
    const departing = eliminatedId === C ? D : C;
    assert.equal(ok(await action(departing, await read(departing, room.id), 'leave')), null);
    room = ok(await action(A, await read(A, room.id), 'start'));
    assert.equal(room.round, 2); assert.equal(room.game.players.length, 5);
    assert.equal(room.game.players.filter(p => p.bot).length, 1);
    assert.equal(room.game.players.some(p => p.id === departing), false);
    assert.equal(room.game.players.find(p => p.id === eliminatedId).active, true, 'eliminated members get fresh hands on rematch');
    assert.notDeepEqual(room.game.players.filter(p => !p.bot).map(p => p.id), firstOrder.filter(id => id !== departing), 'fresh round shuffles the remaining people with the computer');
    const beforeLeave = (await raw(room.id)).state, hostHand = beforeLeave.players.find(p => p.id === A).hand;
    assert.equal(ok(await action(A, room, 'leave')), null);
    const afterLeave = await raw(room.id), takeover = afterLeave.state.players.find(p => p.id === A);
    assert.equal(takeover.bot, true); assert.equal(takeover.active, true);
    assert.deepEqual(takeover.hand, hostHand, 'departure transfers the existing hand without redealing');
    assert.deepEqual(afterLeave.state.players.map(p => p.id), beforeLeave.players.map(p => p.id), 'departure does not change seat identities');
    conserved(afterLeave.state);
    room = await read(B, room.id); assert.equal(room.hostId, B);
    assert.equal((await call(A, { action: 'mine' })).room, null);
    assert.equal((await call(A, { action: 'read', room_id: room.id })).error, 'room_unavailable');
    await closeRoom([B, C, D, E].filter(id => id !== departing), room);

    for (const count of [1, 2, 3, 4]) {
      const humans = users.slice(0, count), owner = humans[0];
      room = await create(owner, count);
      assert.equal(room.capacity, 5, 'legacy smaller capacity options still create five seats');
      for (const id of humans.slice(1)) room = await join(id, room);
      room = ok(await action(owner, room, 'start'));
      assert.equal(room.players.length, count, 'membership describes humans only');
      assert.equal(room.game.players.length, 5); assert.equal(room.game.players.filter(p => p.bot).length, 5 - count);
      assert.equal(room.game.turn, 0); privateView(room, owner, 7); conserved((await raw(room.id)).state);
      for (const bot of room.game.players.filter(p => p.bot)) assert.match(bot.id, new RegExp(`^onecard-bot:${room.id}:1:[0-4]$`));
      const firstDeadline = Date.parse(room.deadline) - room.serverTime;
      assert.ok(firstDeadline > (room.game.players[0].bot ? 3000 : 33000), 'initial deal has a separate grace period');
      while (!room.game.players[room.game.turn].bot) {
        const id = room.game.players[room.game.turn].id;
        room = ok(await action(id, await read(id, room.id), 'move', { command: { type: 'draw' } }));
      }
      const beforeBot = await raw(room.id), botId = beforeBot.state.players[beforeBot.state.turn].id;
      assert.equal((await read(owner, room.id)).version, beforeBot.version, 'computers wait for their server deadline');
      assert.equal((await action(owner, room, 'move', { command: { type: 'draw', bot: true }, playerId: botId })).error, 'not_your_turn', 'members cannot submit computer moves');
      await expireTurn(room.id);
      const polls = await Promise.all(Array.from({ length: 5 }, (_, i) => read(humans[i % humans.length], room.id)));
      const afterBot = await raw(room.id); conserved(afterBot.state);
      assert.equal(afterBot.version, beforeBot.version + 1, 'five simultaneous readers cause exactly one computer move');
      assert.equal(afterBot.state.revision, beforeBot.state.revision + 1);
      assert.ok(afterBot.state.lastEvents.some(event => event.playerId === botId && ['play', 'draw'].includes(event.type)));
      room = polls.sort((a, b) => b.version - a.version)[0]; computerTurns++;
      privateView(await read(owner, room.id), owner);
      const nextDelay = Date.parse(afterBot.deadline) - Date.now();
      assert.ok(nextDelay <= (afterBot.state.players[afterBot.state.turn].bot ? 1600 : 30000) + 100, 'computer cadence differs from human time limits');
      if (count === 1) {
        let mixedTurns = 0;
        while (room.status === 'active') {
          assert.ok(mixedTurns++ < 2000, 'one human plus four computers completes a round');
          const before = await raw(room.id), current = before.state.players[before.state.turn];
          if (current.bot) { await expireTurn(room.id); room = await read(owner, room.id); computerTurns++; }
          else {
            const own = await read(owner, room.id);
            room = ok(await action(owner, own, 'move', { command: engine.chooseBotAction(own.game, owner) }));
          }
          assert.ok([1, -1].includes(room.game.direction));
        }
        conserved((await raw(room.id)).state);
        const next = ok(await action(owner, room, 'start'));
        assert.equal(next.round, 2); assert.equal(next.game.players.filter(p => p.bot).length, 4);
        assert.ok(next.game.players.filter(p => p.bot).every(p => p.id.includes(':2:')), 'rematch gives computers fresh round identities');
        room = next;
      }
      await closeRoom(humans, room);
    }

    // A forged client move is rejected by the authoritative engine as well as
    // omitted from the UI's legal-card list. Failed attempts never commit.
    room = await create(B);
    room = ok(await action(B, room, 'start'));
    const attackPosition = (await raw(room.id)).state;
    const attackHand = ['H-2', 'H-A', 'X-R', 'S-4'];
    const remaining = engine.makeDeck().filter(id => !attackHand.includes(id) && id !== 'X-B');
    for (const player of attackPosition.players) {
      player.hand = player.id === B ? [...attackHand] : remaining.splice(0, 2);
      player.calledOne = false; player.active = true; player.eliminatedReason = null;
    }
    Object.assign(attackPosition, { deck: remaining, discard: ['X-B'], currentSuit: 'H',
      pendingDraw: 10, pendingOneId: null, turn: attackPosition.players.findIndex(player => player.id === B),
      lastEvents: [], revision: attackPosition.revision + 1 });
    conserved(attackPosition);
    await db.query("update ojjuda_onecard_internal.rooms set state=$2,version=version+1,deadline=clock_timestamp()+interval '1 minute' where id=$1", [room.id, attackPosition]);
    room = await read(B, room.id);
    assert.deepEqual(room.game.legalCardIds, ['X-R']);
    const beforeRejectedAttack = await raw(room.id);
    for (const cardId of ['H-2', 'H-A']) {
      assert.equal((await action(B, room, 'move', { command: { type: 'play', cardId } })).error, 'invalid_move');
      const unchanged = await raw(room.id);
      assert.equal(unchanged.version, beforeRejectedAttack.version);
      assert.deepEqual(unchanged.state, beforeRejectedAttack.state, 'a weaker attack cannot change the stored game');
    }
    room = ok(await action(B, room, 'move', { command: { type: 'play', cardId: 'X-R', suit: 'S' } }));
    assert.equal(room.game.pendingDraw, 17, 'a stronger +7 adds to the outstanding draw debt');
    conserved((await raw(room.id)).state);
    await closeRoom([B], room);

    // Both directions are authoritative, including the two-survivor case:
    // reversing changes direction but never grants a second consecutive turn.
    room = await create(B); room = await join(C, room);
    room = ok(await action(B, room, 'start'));
    for (const activeCount of [5, 2]) {
      const position = (await raw(room.id)).state;
      const hands = new Map([[B, ['S-Q', 'D-5']], [C, ['H-Q', 'S-6']]]);
      const remaining = engine.makeDeck().filter(id => !['S-4', ...hands.values()].flat().includes(id));
      for (const player of position.players) {
        player.active = activeCount === 5 || [B, C].includes(player.id);
        player.hand = hands.get(player.id) || (player.active ? remaining.splice(0, 2) : []);
        player.calledOne = false;
      }
      Object.assign(position, { deck: remaining, discard: ['S-4'], currentSuit: 'S', pendingDraw: 0,
        pendingOneId: null, turn: position.players.findIndex(player => player.id === B), direction: 1,
        status: 'playing', winnerId: null, winnerIds: [], lastEvents: [], revision: position.revision + 1 });
      conserved(position);
      await db.query("update ojjuda_onecard_internal.rooms set state=$2,version=version+1,deadline=clock_timestamp()+interval '1 minute' where id=$1", [room.id, position]);
      room = await read(B, room.id);
      room = ok(await action(B, room, 'move', { command: { type: 'play', cardId: 'S-Q', declare: true } }));
      assert.equal(room.game.direction, -1);
      const active = position.players.map((player, i) => player.active ? i : -1).filter(i => i >= 0);
      assert.equal(room.game.turn, active[(active.indexOf(position.turn) + active.length - 1) % active.length]);
      assert.ok(room.game.lastEvents.some(event => event.type === 'reverse'));
      if (activeCount === 2) {
        assert.equal(room.game.players[room.game.turn].id, C, 'two survivors pass to the other seat');
        room = ok(await action(C, await read(C, room.id), 'move', { command: { type: 'play', cardId: 'H-Q', declare: true } }));
        assert.equal(room.game.direction, 1);
        assert.equal(room.game.players[room.game.turn].id, B, 'a second reverse restores clockwise order');
      }
      conserved((await raw(room.id)).state);
    }
    await closeRoom([B, C], room);

    room = await create(OUT, 2);
    for (const id of [C, D, E]) room = await join(id, room);
    const lastSeat = await Promise.all([call(A, { action: 'join', code: room.code }), call(B, { action: 'join', code: room.code })]);
    assert.equal(lastSeat.filter(r => r.httpStatus === 200).length, 1, 'the fifth human seat is allocated atomically');
    assert.equal(lastSeat.find(r => r.httpStatus !== 200).error, 'room_full');
    const guest = lastSeat[0].httpStatus === 200 ? A : B;
    room = await read(OUT, room.id); await action(OUT, room, 'leave'); room = await read(C, room.id);
    assert.equal(room.hostId, C); assert.equal(room.players.length, 4, 'waiting membership removes departed humans');
    await closeRoom([C, D, E, guest], room);
    room = await create(C);
    await db.query('insert into public.test_blocks values($1,$2)', [C, OUT]);
    assert.equal((await call(OUT, { action: 'join', code: room.code })).error, 'room_unavailable');
    await db.query("update ojjuda_onecard_internal.rooms set expires_at=clock_timestamp()-interval '1 second' where id=$1", [room.id]);
    assert.equal((await call(C, { action: 'mine' })).room, null);
    assert.equal((await call(OUT, { action: 'join', code: room.code })).error, 'room_unavailable');
    console.log(`PASS: ${turns} five-person turns, ${computerTurns} server computer turns; fixed five seats for 1–5 people, shuffled seats, reverse directions with two or five survivors, stronger-attack enforcement, private hands, authentication, races, retries, timeout, takeover, rematch, expiry and SQL permissions`);
  } finally { await f.close(); }
  await require('./onecard-native-rooms.test.cjs')();
})().catch(error => { console.error(error); process.exitCode = 1; });
