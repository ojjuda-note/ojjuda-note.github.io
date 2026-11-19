const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fixture } = require('./onecard-online-fixture.cjs');

async function verifyWorldCallbacks(f, directory) {
  const html = fs.readFileSync(path.join(__dirname, '../world.html'), 'utf8');
  const routeStart = html.indexOf('function openWorldOnecard('), routeEnd = html.indexOf('function openWorldGameLink(', routeStart);
  const lobbyStart = html.indexOf('var worldArcadeRooms=null'), lobbyEnd = html.indexOf('window.OjjudaArcadeRoomCreated=', lobbyStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart && lobbyStart >= 0 && lobbyEnd > lobbyStart, 'shipped World room callbacks remain extractable');
  const actor = f.users[4], navigations = [], calls = [];
  let callbacks, closeCount = 0;
  const context = vm.createContext({
    URL, crypto, worldGameAssetRequest: 0,
    location: { origin: 'https://ojjuda.kr', assign: target => navigations.push(target) },
    document: { getElementById: () => null, querySelector: () => null },
    window: { OjjudaArcadeRooms: { create(options) { callbacks = options; return { sync() {} }; } } },
    D: { online: true, user: { id: actor } }, g: { tab: 'place', place: { id: 'arcade' } },
    adminGamePreviewActive: () => false, M() {}, ct() {}, dt() { closeCount++; }, xf() {},
    Al() { assert.fail('One Card must use its real URL entry, not another game launcher'); },
    S: {
      rpc: async name => { assert.equal(name, 'arcade_general_extra_rooms'); return { data: { ok: true, rooms: await directory(actor) } }; },
      functions: { invoke: async (name, { body }) => {
        assert.equal(name, 'onecard');
        const result = await f.call(actor, body); calls.push({ body: structuredClone(body), result });
        return { data: result, error: result.error ? { context: { json: async () => result } } : null };
      } },
    },
  });
  vm.runInContext(html.slice(routeStart, routeEnd) + '\n' + html.slice(lobbyStart, lobbyEnd) + '\nsyncWorldArcadeRooms();', context);
  assert.ok(callbacks); assert.equal(callbacks.getUserId(), actor);
  const request = crypto.randomUUID(), title = '오락실 badword 모임';
  await callbacks.onCreateNative('onecard', { title, capacity: 2, request_id: request });
  assert.deepEqual(calls[0].body, { action: 'create', clientVersion: '1.4.0', request_id: request, options: { title, capacity: 5 } });
  assert.equal(calls[0].result.httpStatus, 200);
  const room = calls[0].result.room;
  assert.equal(room.title, '오락실 ❤️❤️ 모임'); assert.equal(room.capacity, 5);
  const item = (await callbacks.extraRooms()).find(candidate => candidate.kind === 'onecard' && candidate.match_id === room.id);
  assert.ok(item, 'the actual World extra-room callback loads the newly created room through shared SQL');
  assert.equal(item.native, true); assert.equal(item.room_no, room.room_no);
  await callbacks.onOpen(item, actor);
  await callbacks.onFreshGame({ ...item, status: 'playing' }, actor);
  assert.equal(navigations.length, 3); assert.equal(new Set(navigations).size, 1, 'create, join and resume all navigate to the same One Card room');
  const target = new URL(navigations[0], 'https://ojjuda.kr');
  assert.equal(target.pathname, '/games/onecard/'); assert.equal(target.searchParams.get('room'), room.code);
  assert.ok(target.searchParams.get('v'), 'World includes its current asset revision');
  assert.equal(calls.length, 1, 'opening or resuming a room does not create another game');
  await callbacks.onCancelNative(item);
  assert.deepEqual(calls.map(call => call.body.action), ['create', 'read', 'leave']);
  assert.ok(calls.every(call => call.body.clientVersion === '1.4.0'), 'World advertises the same extended-deck support for create, read and leave');
  assert.equal(calls[2].body.room_id, room.id);
  assert.equal(calls[2].body.version, calls[1].result.room.version, 'World leaves using the freshly read authoritative version');
  assert.match(calls[2].body.request_id, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);
  assert.equal(calls[2].result.httpStatus, 200); assert.equal(calls[2].result.room, null);
  assert.equal((await f.db.query('select status from ojjuda_onecard_internal.rooms where id=$1', [room.id])).rows[0].status, 'closed');
  assert.equal((await f.call(actor, { action: 'mine' })).room, null);
  assert.ok(closeCount >= 3, 'World closes its menu before each handoff');
}

async function verifyNativeRooms() {
  const f = await fixture(), { db, call, users } = f, [A, B, C, D, E, OUT, BANNED, ANON] = users;
  const engine = await import('../games/onecard/engine.mjs');
  const ok = result => { assert.equal(result.httpStatus, 200, JSON.stringify(result)); return result.room; };
  const create = (id, title, request = crypto.randomUUID()) => call(id, { action: 'create', request_id: request, ...(title === undefined ? {} : { options: { title } }) });
  const move = (id, room, action, extra = {}) => call(id, { action, room_id: room.id, version: room.version, request_id: crypto.randomUUID(), ...extra });
  const read = async (id, room) => ok(await call(id, { action: 'read', room_id: room.id }));
  const directory = async (actor, role = 'authenticated') => db.transaction(async tx => {
    assert.ok(['authenticated', 'anon'].includes(role));
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [actor || '']);
    return (await tx.query('select public.arcade_general_extra_rooms() value')).rows[0].value.rooms;
  });
  const onecard = async actor => (await directory(actor)).filter(room => room.kind === 'onecard');
  const listed = async (actor, room) => (await onecard(actor)).find(item => item.match_id === room.id);
  const allocator = async () => Number((await db.query("select nextval('ojjuda_arcade_internal.rooms_room_no_seq') number")).rows[0].number);
  try {
    const previousGameNumber = await allocator(); assert.equal(previousGameNumber, 1001);
    const request = crypto.randomUUID();
    let roomA = ok(await create(A, '  badword \t 함께 \n 즐겨요  ', request));
    assert.equal(roomA.title, '❤️❤️ 함께 즐겨요'); assert.equal(roomA.room_no, 1002);
    const duplicate = ok(await create(A, '다른 제목', request));
    assert.equal(duplicate.id, roomA.id); assert.equal(duplicate.room_no, roomA.room_no);
    assert.equal(duplicate.title, roomA.title, 'lost create responses cannot change or remask the stored title');
    assert.equal(await allocator(), 1003, 'another game and a One Card room share the same sequence without duplicate allocations');
    for (const title of ['', ' \t\n ', '가'.repeat(41), '가'.repeat(40) + 'badword', '문자\u0007제목'])
      assert.equal((await create(B, title)).error, 'invalid_title', `invalid displayed title length/content: ${JSON.stringify(title)}`);
    assert.equal((await create(B, 42)).httpStatus, 400);
    let roomB = ok(await create(B, '가'.repeat(39) + 'badword'));
    assert.equal(roomB.title, '가'.repeat(39) + '❤️❤️', 'the mask occupies one displayed character at the forty-character limit');
    assert.equal(roomB.room_no, 1004);
    let roomC = ok(await create(C)); assert.equal(roomC.title, '원카드 같이 한 판 해요');

    // The real common directory wrapper must preserve every pre-existing provider.
    for (const [i, game] of ['poker', 'bang', 'roulette'].entries()) await db.exec(`
      create or replace function ojjuda_${game}_internal.arcade_rooms() returns jsonb language sql stable
      as $$select '{"ok":true,"rooms":[{"kind":"${game}","room_no":${900001 + i}}]}'::jsonb$$;
    `);
    const common = await directory(OUT);
    assert.deepEqual(common.filter(room => room.kind !== 'onecard').map(room => room.kind), ['poker', 'bang', 'roulette']);
    assert.equal(common.filter(room => room.kind === 'onecard').length, 3);
    const publicKeys = ['room_no', 'kind', 'native', 'title', 'status', 'host_name', 'players', 'capacity', 'is_host', 'is_member', 'match_id', 'code', 'created_at'].sort();
    for (const room of await onecard(OUT)) {
      assert.deepEqual(Object.keys(room).sort(), publicKeys, 'directory records contain only explicit public metadata');
      assert.equal(room.native, true); assert.equal(room.capacity, 5); assert.equal(room.players, 1);
      assert.equal(room.status, 'waiting'); assert.equal(room.is_member, false); assert.equal(room.is_host, false);
    }
    const own = await listed(A, roomA); assert.equal(own.is_member, true); assert.equal(own.is_host, true);
    const edgeList = await call(OUT, { action: 'list' }); assert.equal(edgeList.httpStatus, 200);
    assert.deepEqual(edgeList.rooms, await onecard(OUT), 'the native provider and Edge list use the same metadata projection');
    for (const role of ['anon', 'authenticated']) {
      const privilege = (await db.query(`select
        has_schema_privilege($1,'ojjuda_onecard_internal','usage') private_schema,
        has_table_privilege($1,'ojjuda_onecard_internal.rooms','select') private_table,
        has_function_privilege($1,'public.onecard_online_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb)','execute') mutating_rpc,
        has_sequence_privilege($1,'ojjuda_arcade_internal.rooms_room_no_seq','usage') allocator,
        has_function_privilege($1,'ojjuda_arcade_internal.onecard_rooms()','execute') directory`, [role])).rows[0];
      assert.deepEqual(privilege, { private_schema: false, private_table: false, mutating_rpc: false, allocator: false, directory: role === 'authenticated' });
    }
    await assert.rejects(directory(null), /not_signed_in/);
    await assert.rejects(directory(ANON), /not_signed_in/);
    await assert.rejects(directory(BANNED), /banned/);
    await assert.rejects(directory(A, 'anon'), /permission denied/);

    await db.query('insert into public.test_blocks values($1,$2)', [B, OUT]);
    assert.equal(await listed(OUT, roomB), undefined, 'blocked humans hide their room from the directory');
    assert.ok(await listed(OUT, roomA), 'unrelated rooms remain visible');
    await db.query('delete from public.test_blocks where a=$1 and b=$2', [B, OUT]);
    await db.query('insert into public.test_bans values($1)', [B]);
    assert.equal(await listed(OUT, roomB), undefined, 'a banned participant prevents directory exposure');
    await db.query('delete from public.test_bans where id=$1', [B]);
    roomA = ok(await call(D, { action: 'join', code: roomA.code }));
    roomA = ok(await move(A, roomA, 'start'));
    assert.equal(roomA.game.players.length, 5); assert.equal(roomA.game.players.filter(player => player.bot).length, 3);
    const active = await listed(OUT, roomA); assert.equal(active.status, 'playing'); assert.equal(active.players, 2, 'computers do not inflate the human occupancy count');
    assert.equal((await call(OUT, { action: 'join', code: roomA.code })).error, 'room_unavailable');
    assert.equal(ok(await move(A, roomA, 'leave')), null);
    roomA = await read(D, roomA);
    const afterDeparture = await listed(A, roomA);
    assert.equal(afterDeparture.players, 1); assert.equal(afterDeparture.host_name, '네로');
    assert.equal(afterDeparture.is_member, false); assert.equal(afterDeparture.is_host, false);
    assert.equal((await listed(D, roomA)).is_host, true, 'directory host permissions follow human handover');
    assert.equal((await call(A, { action: 'mine' })).room, null);
    assert.equal((await call(A, { action: 'read', room_id: roomA.id })).error, 'room_unavailable');

    // Produce a real server-confirmed win in a full, card-conserving five-seat state.
    const state = (await db.query('select state from ojjuda_onecard_internal.rooms where id=$1', [roomA.id])).rows[0].state;
    const cards = engine.makeDeck().filter(id => !['S-4', 'S-3'].includes(id));
    for (const player of state.players) { player.hand = player.id === D ? ['S-3'] : cards.splice(0, 2); player.calledOne = false; }
    Object.assign(state, { deck: cards, discard: ['S-4'], currentSuit: 'S', pendingDraw: 0, pendingOneId: null, turn: state.players.findIndex(player => player.id === D), lastEvents: [] });
    assert.equal(new Set([...state.deck, ...state.discard, ...state.players.flatMap(player => player.hand)]).size, 58);
    await db.query("update ojjuda_onecard_internal.rooms set state=$2,version=version+1,deadline=clock_timestamp()+interval '30 seconds' where id=$1", [roomA.id, state]);
    roomA = ok(await move(D, await read(D, roomA), 'move', { command: { type: 'play', cardId: 'S-3' } }));
    assert.equal(roomA.status, 'finished');
    const finished = await listed(D, roomA); assert.equal(finished.status, 'waiting'); assert.equal(finished.players, 1);
    assert.equal(await listed(OUT, roomA), undefined); assert.equal(await listed(A, roomA), undefined, 'departed people cannot see a finished private rematch room');
    await db.query("update ojjuda_onecard_internal.rooms set expires_at=clock_timestamp()-interval '1 second' where id=$1", [roomB.id]);
    assert.equal(await listed(B, roomB), undefined); assert.equal(await listed(OUT, roomB), undefined);
    assert.equal((await call(B, { action: 'mine' })).room, null);
    assert.equal(ok(await move(C, roomC, 'leave')), null);
    assert.equal(await listed(OUT, roomC), undefined, 'closed rooms disappear');
    assert.equal(ok(await move(D, roomA, 'leave')), null);
    assert.deepEqual(await onecard(OUT), []);
    const masks = ok(await create(B, 'badword'.repeat(40)));
    assert.equal(masks.title, '❤️❤️'.repeat(40), 'forty masks remain accepted as forty displayed characters');
    assert.equal(ok(await move(B, masks, 'leave')), null);
    await verifyWorldCallbacks(f, directory);
    console.log('PASS: native shared arcade directory; title normalization/masking/limits, shared sequence, create retries, existing providers, public metadata, role grants, blocked/banned/anonymous users, active occupancy, host transfer, finished-member visibility, leave and expiry');
    console.log('PASS: actual World create/open/resume/cancel callbacks connect to the real Edge and SQL, preserve five seats/title, share the room URL, and close with a freshly read version');
  } finally { await f.close(); }
}

module.exports = verifyNativeRooms;
if (require.main === module) verifyNativeRooms().catch(error => { console.error(error); process.exitCode = 1; });
