const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { fixture } = require('./onecard-online-fixture.cjs');

async function run() {
  const f = await fixture(), { db, call, users } = f, [A, B, C, D, E, OUT] = users;
  const engine = await import('../games/onecard/engine.mjs');
  const ok = value => { assert.equal(value.httpStatus, 200, JSON.stringify(value)); return value.room; };
  const read = async (actor, id) => ok(await call(actor, { action: 'read', room_id: id }));
  const move = (actor, room, command, request = randomUUID()) => call(actor, {
    action: 'move', room_id: room.id, version: room.version, request_id: request, command,
  });
  const act = async (actor, room, action) => ok(await call(actor, {
    action, room_id: room.id, version: room.version, request_id: randomUUID(),
  }));
  const create = async (actor, mode = 'multiplayer', request = randomUUID()) => ok(await call(actor, {
    action: 'create', request_id: request, options: { mode, capacity: 5 },
  }));
  const raw = async id => (await db.query('select * from ojjuda_onecard_internal.rooms where id=$1', [id])).rows[0];
  const records = async () => (await db.query('select * from ojjuda_onecard_internal.results order by achieved_at,room_id,round,user_id')).rows;
  const memberRecords = async actor => (await records()).filter(row => row.user_id === actor);
  const rank = async actor => db.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [actor || '']);
    await tx.exec(`set local role ${actor ? 'authenticated' : 'anon'}`);
    return (await tx.query("select public.community_game_monthly_personal('onecard',null) value")).rows[0].value;
  });
  const history = async actor => db.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [actor || '']);
    await tx.exec(`set local role ${actor ? 'authenticated' : 'anon'}`);
    return (await tx.query("select public.community_game_monthly_history(array['onecard'],'2026-10-01') value")).rows[0].value;
  });
  const receipt = (room, won, currentStreak, bestStreak) => {
    assert.deepEqual(Object.keys(room.ranking).sort(), ['recorded', 'won', 'currentStreak', 'bestStreak', 'month', 'achievedAt'].sort());
    assert.deepEqual({ ...room.ranking, achievedAt: null }, { recorded: true, won, currentStreak, bestStreak, month: '2026-11', achievedAt: null });
    assert.ok(Number.isFinite(Date.parse(room.ranking.achievedAt)));
  };
  let minute = 0;
  const time = () => f.clock(`2026-11-05T12:${String(minute++).padStart(2, '0')}:00Z`);
  async function win(room, winnerId, reader) {
    await time(); await f.stageWin(room.id, winnerId);
    const position = await raw(room.id), winner = position.state.players.find(player => player.id === winnerId);
    if (winner.bot) {
      await db.query("update ojjuda_onecard_internal.rooms set deadline=clock_timestamp()-interval '1 second' where id=$1", [room.id]);
      room = await read(reader, room.id);
    } else {
      room = await read(winnerId, room.id);
      room = ok(await move(winnerId, room, { type: 'play', cardId: 'S-3' }));
      if (reader !== winnerId) room = await read(reader, room.id);
    }
    assert.equal(room.status, 'finished'); assert.equal(room.game.winnerId, winnerId);
    return room;
  }
  try {
    const catalog = (await db.query('select ojjuda_ranking_internal.catalog() games')).rows[0].games;
    assert.equal(catalog.filter(game => game === 'onecard').length, 1);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const row = (await db.query(`select has_table_privilege($1,'ojjuda_onecard_internal.results','select') read,
        has_table_privilege($1,'ojjuda_onecard_internal.results','insert') write,
        has_function_privilege($1,'ojjuda_onecard_internal.player_record(uuid,uuid,integer)','execute') receipt,
        has_function_privilege($1,'ojjuda_ranking_internal.onecard_participants(timestamptz,timestamptz)','execute') participants`, [role])).rows[0];
      assert.deepEqual(row, { read: false, write: false, receipt: false, participants: false });
    }
    for (const mode of ['practice', 'admin', null, { solo: true }])
      assert.equal((await call(A, { action: 'create', request_id: randomUUID(), options: { mode } })).httpStatus, 400);

    const request = randomUUID();
    let room = await create(A, 'solo', request);
    assert.equal(room.mode, 'solo'); assert.equal(room.capacity, 5); assert.equal(room.ranking, null);
    assert.equal((await create(A, 'solo', request)).id, room.id, 'a lost create response reuses the private room');
    assert.equal((await call(A, { action: 'create', request_id: request, options: { mode: 'multiplayer' } })).error, 'invalid_request');
    assert.equal((await call(B, { action: 'join', code: room.code })).error, 'room_unavailable');
    assert.equal((await call(B, { action: 'read', room_id: room.id })).error, 'room_not_found');
    for (const actor of [A, B]) {
      const listing = await call(actor, { action: 'list' });
      assert.equal(listing.httpStatus, 200);
      assert.ok(!listing.rooms.some(item => item.match_id === room.id || item.code === room.code || item.room_no === room.room_no));
    }
    await f.claim(A); await db.exec('set role authenticated');
    const directory = (await db.query('select public.arcade_general_extra_rooms() value')).rows[0].value;
    assert.ok(!directory.rooms.some(item => item.code === room.code || item.room_no === room.room_no));
    await db.exec('reset role');
    room = await act(A, room, 'start');
    assert.equal(room.game.players.length, 5); assert.equal(room.game.players.filter(player => player.bot).length, 4);
    assert.equal(room.game.deckSize, 58);
    assert.equal(room.ranking, null); assert.equal((await records()).length, 0);
    assert.equal((await call(A, { action: 'record', room_id: room.id, won: true, score: 999 })).httpStatus, 400);

    await time(); await f.stageWin(room.id, A); room = await read(A, room.id);
    let finish = { action: 'move', room_id: room.id, version: room.version, request_id: randomUUID(), command: { type: 'play', cardId: 'S-3' } };
    const finalMoves = [finish, { ...finish, request_id: randomUUID() }];
    const finalReplies = await Promise.all(finalMoves.map(body => call(A, body)));
    assert.equal(finalReplies.filter(reply => reply.httpStatus === 200).length, 1);
    assert.equal(finalReplies.find(reply => reply.httpStatus !== 200).error, 'state_conflict');
    const committed = finalReplies.findIndex(reply => reply.httpStatus === 200); finish = finalMoves[committed];
    room = ok(finalReplies[committed]); receipt(room, true, 1, 1);
    const firstRows = await records(); assert.equal(firstRows.length, 1); assert.equal(firstRows[0].mode, 'solo');
    assert.equal(firstRows[0].user_id, A); assert.equal(firstRows[0].won, true);
    receipt(ok(await call(A, finish)), true, 1, 1);
    await Promise.all(Array.from({ length: 5 }, () => read(A, room.id)));
    receipt((await call(A, { action: 'mine' })).room, true, 1, 1);
    assert.deepEqual(await records(), firstRows, 'retry, concurrent polls and refresh never duplicate a result');
    assert.equal((await call(A, { ...finish, request_id: randomUUID() })).error, 'state_conflict');

    room = await act(A, room, 'start'); assert.equal(room.ranking, null, 'a fresh round does not display the previous receipt');
    room = await win(room, A, A); receipt(room, true, 2, 2);
    room = await act(A, room, 'start');
    room = await win(room, room.game.players.find(player => player.bot).id, A); receipt(room, false, 0, 2);
    room = await act(A, room, 'start'); room = await win(room, A, A); receipt(room, true, 1, 2);
    assert.equal((await memberRecords(A)).length, 4);
    await act(A, room, 'leave');

    // A private computer win and a public multiplayer win form one run.
    room = await create(A); room = ok(await call(B, { action: 'join', code: room.code }));
    room = await act(A, room, 'start'); room = await win(room, A, A); receipt(room, true, 2, 2);
    receipt(await read(B, room.id), false, 0, 0);
    assert.equal((await rank(A)).leaders[0].score, 2);
    assert.ok(!(await rank(A)).leaders.some(row => row.nick === '두리'), 'zero-only records do not enter the ranking');
    await assert.rejects(rank(null), /not_signed_in/, 'member-only rankings disclose no member records to guests');

    // The departed player's actual hand continues as AI; its later victory is
    // neither a win nor a loss for the former human, but it is a loss for A.
    room = await act(A, room, 'start'); await act(B, await read(B, room.id), 'leave'); room = await read(A, room.id);
    assert.equal(room.game.players.find(player => player.id === B).bot, true);
    room = await win(room, B, A); receipt(room, false, 0, 2);
    assert.equal((await memberRecords(B)).length, 1);
    await act(A, room, 'leave');
    const beforeExit = await records();
    room = await create(A, 'solo'); room = await act(A, room, 'start'); await act(A, room, 'leave');
    assert.deepEqual(await records(), beforeExit, 'closing an unfinished all-computer room does not fabricate a loss');
    assert.equal((await rank(A)).leaders[0].score, 2, 'entry and exit preserve the completed best');

    room = await create(A); room = ok(await call(B, { action: 'join', code: room.code })); room = await act(A, room, 'start');
    let state = (await raw(room.id)).state;
    const remaining = engine.makeDeck().filter(id => id !== 'S-4');
    for (const player of state.players) {
      player.hand = remaining.splice(0, [A, B].includes(player.id) ? 2 : 16);
      player.calledOne = false;
    }
    // A 58-card dry deck still keeps every active hand below the 20-card limit.
    const computers = state.players.filter(player => player.bot);
    for (let i = 0; remaining.length; i++) computers[i % computers.length].hand.push(remaining.shift());
    assert.ok(state.players.every(player => player.hand.length < 20));
    Object.assign(state, { deck: [], discard: ['S-4'], currentSuit: 'S', pendingDraw: 0, pendingOneId: null,
      turn: state.players.findIndex(player => player.id === A), dryPasses: 4, lastEvents: [], revision: state.revision + 1 });
    await time(); await db.query("update ojjuda_onecard_internal.rooms set state=$2,version=version+1,deadline=clock_timestamp()+interval '1 minute' where id=$1", [room.id, state]);
    room = ok(await move(A, await read(A, room.id), { type: 'draw' }));
    assert.equal(room.game.winnerId, null); assert.deepEqual([...room.game.winnerIds].sort(), [A, B].sort());
    receipt(room, false, 0, 2); receipt(await read(B, room.id), false, 0, 0);

    // Reaching twenty cards is a real loss even though the eliminated hand is
    // returned to the deck before the completed state reaches the ledger.
    room = await act(A, room, 'start'); state = (await raw(room.id)).state;
    const deck = engine.makeDeck().filter(id => !['S-4', 'S-3', 'H-5'].includes(id));
    for (const player of state.players) {
      player.active = [A, B].includes(player.id); player.calledOne = false;
      player.hand = player.id === A ? deck.splice(0, 19) : player.id === B ? ['S-3', 'H-5'] : [];
    }
    Object.assign(state, { deck, discard: ['S-4'], currentSuit: 'S', pendingDraw: 2, pendingOneId: null,
      turn: state.players.findIndex(player => player.id === A), dryPasses: 0, lastEvents: [], revision: state.revision + 1 });
    await time(); await db.query("update ojjuda_onecard_internal.rooms set state=$2,version=version+1,deadline=clock_timestamp()+interval '1 minute' where id=$1", [room.id, state]);
    room = ok(await move(A, await read(A, room.id), { type: 'draw' }));
    assert.equal(room.game.players.find(player => player.id === A).eliminatedReason, 'too-many-cards');
    receipt(room, false, 0, 2); receipt(await read(B, room.id), true, 1, 1);
    await act(A, room, 'leave'); await act(B, await read(B, room.id), 'leave');

    // Isolated dates exercise the public readers at exactly 01:00 KST. They do
    // not bypass any result-writing test above; all lifecycle records came from Edge.
    const seed = (actor, won, at) => db.query('insert into ojjuda_onecard_internal.results values($1,1,$2,$3,$4,$5)', [randomUUID(), actor, won, 'solo', at]);
    await seed(C, true, '2026-10-31T15:59:59.999Z');
    await seed(C, true, '2026-10-31T16:00:00Z');
    await seed(C, true, '2026-10-31T16:00:01Z');
    await seed(D, true, '2026-10-31T16:00:00Z');
    await seed(D, true, '2026-10-31T16:00:02Z');
    await seed(C, false, '2026-10-31T16:00:03Z');
    await seed(E, false, '2026-10-31T16:00:04Z');
    await f.clock('2026-10-31T15:59:59.999Z');
    let ranking = await rank(C); assert.equal(ranking.month, '2026-10'); assert.equal(ranking.leaders[0].score, 1);
    await f.clock('2026-10-31T16:00:05Z');
    ranking = await rank(C); assert.equal(ranking.month, '2026-11');
    assert.deepEqual(ranking.leaders.map(row => [row.nick, row.score]), [['세나', 2], ['네로', 2]]);
    assert.equal(ranking.leaders[0].me, true, 'equal bests compare when the winning run was completed');
    assert.ok(!ranking.leaders.some(row => row.nick === '다온'));
    await db.query("select ojjuda_ranking_internal.close_month('2026-10-01')");
    const archived = await history(C);
    assert.equal(archived.closed, true); assert.equal(archived.leaders.onecard.score, 1);
    assert.equal(archived.leaders.onecard.nick, '세나', 'the 01:00 KST wins belong only to the next month');
    await db.query('insert into public.test_blocks values($1,$2)', [C, D]);
    assert.deepEqual((await rank(C)).leaders.map(row => row.nick), ['세나']);
    await db.query('insert into public.test_bans values($1)', [D]);
    assert.deepEqual((await rank(OUT)).leaders.map(row => row.nick), ['세나']);
    await db.query('delete from auth.users where id=$1', [C]);
    assert.equal((await memberRecords(C)).length, 0, 'deleting a member cascades private results');
    assert.equal((await rank(OUT)).leaders.length, 0);
    const deletedHistory = await history(OUT);
    assert.equal(deletedHistory.leaders.onecard.nick, '세나', 'the existing immutable archive contract retains its historical label after account deletion');
    assert.ok(!JSON.stringify(deletedHistory).includes('_userId') && !JSON.stringify(deletedHistory).includes(C));
    await db.query('insert into public.test_blocks values($1,$2)', [OUT, C]);
    assert.equal((await history(OUT)).leaders.onecard, null, 'the existing blocked-user policy also applies to One Card archives');
    console.log('PASS: private solo rooms; real Edge-only receipts; retries, concurrent reads, shared solo/multiplayer streaks, loss/draw/elimination, AI takeover exclusion, unfinished exits, monthly bests, KST month boundary, tie time, zero exclusion, moderation and private ledger ACLs');
  } finally { await f.close(); }
}

module.exports = run;
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
