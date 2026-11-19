import { createGame, applyAction, chooseBotAction, projectState } from './engine.mjs';

const ORIGINS = new Set(['https://ojjuda.kr', 'https://www.ojjuda.kr', 'https://ojjuda-note.github.io']);
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const ACTIONS = new Set(['mine', 'list', 'create', 'join', 'read', 'start', 'move', 'leave']);
const ERRORS = new Set(['not_signed_in', 'banned', 'room_in_progress', 'room_rate_limit', 'room_full',
  'room_not_found', 'room_unavailable', 'not_room_owner', 'need_players', 'state_conflict',
  'not_your_turn', 'invalid_move', 'invalid_options', 'invalid_title', 'invalid_request', 'bad_request']);

function projectRoom(result, userId, now) {
  const r = result?.room;
  if (!r) return null;
  return {
    id: r.id, code: r.code, room_no: r.room_no, title: r.title, hostId: r.host_id, myId: userId,
    seat: r.state ? r.state.players.findIndex(player => player.id === userId) : r.members.indexOf(userId),
    capacity: 5, mode: r.mode === 'solo' ? 'solo' : 'multiplayer', status: r.status,
    version: r.version, round: r.round, deadline: r.deadline, serverTime: now,
    // Room membership survives losing a round, so eliminated members can rematch.
    players: r.members.map((id, i) => ({ id, name: r.names[i], active: !r.departed[i] })),
    game: r.state ? projectState(r.state, userId) : null,
    // A receipt comes only from the committed database result for this viewer.
    ranking: result.ranking?.recorded === true ? {
      recorded: true, won: result.ranking.won === true,
      currentStreak: result.ranking.currentStreak, bestStreak: result.ranking.bestStreak,
      month: result.ranking.month, achievedAt: result.ranking.achievedAt,
    } : null,
  };
}

async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error('bad_request');
  const chunks = []; let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 4096) { await reader.cancel(); throw Error('bad_request'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const body = JSON.parse(new TextDecoder().decode(bytes));
  if (!body || !ACTIONS.has(body.action)) throw Error('bad_request');
  if (['read', 'start', 'move', 'leave'].includes(body.action) && !UUID.test(body.room_id)) throw Error('bad_request');
  if (['create', 'start', 'move', 'leave'].includes(body.action) && !UUID.test(body.request_id)) throw Error('bad_request');
  if (['start', 'move', 'leave'].includes(body.action) && (!Number.isInteger(body.version) || body.version < 0)) throw Error('bad_request');
  // Older clients may still send 2–4. Every new table uses five seats.
  if (body.action === 'create' && body.options !== undefined &&
    (!body.options || typeof body.options !== 'object' || Array.isArray(body.options))) throw Error('bad_request');
  if (body.action === 'create' && body.options?.capacity !== undefined && ![1, 2, 3, 4, 5].includes(body.options.capacity)) throw Error('bad_request');
  if (body.action === 'create' && body.options?.title !== undefined && typeof body.options.title !== 'string') throw Error('bad_request');
  if (body.action === 'create' && body.options?.mode !== undefined && !['solo', 'multiplayer'].includes(body.options.mode)) throw Error('bad_request');
  if (body.action === 'join' && (typeof body.code !== 'string' || !/^[a-f0-9]{8}$/i.test(body.code))) throw Error('bad_request');
  if (body.action === 'move') {
    const command = body.command;
    if (!command || !['play', 'draw', 'declare'].includes(command.type)) throw Error('bad_request');
    if (command.type === 'play' && (typeof command.cardId !== 'string' || command.cardId.length > 5)) throw Error('bad_request');
    if (command.suit !== undefined && !['S', 'H', 'D', 'C'].includes(command.suit)) throw Error('bad_request');
    if (command.declare !== undefined && typeof command.declare !== 'boolean') throw Error('bad_request');
    // Do not forward extra client-supplied state or authority flags to the engine.
    body.command = { type: command.type, ...(command.type === 'play' ? { cardId: command.cardId,
      ...(command.suit ? { suit: command.suit } : {}), ...(command.declare !== undefined ? { declare: command.declare } : {}) } : {}) };
  }
  return body;
}

export function createHandler({ env, fetchImpl = fetch, now = Date.now,
  random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 }) {
  const url = env('SUPABASE_URL'), service = env('SUPABASE_SERVICE_ROLE_KEY'), anon = env('SUPABASE_ANON_KEY');
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Origin': ORIGINS.has(origin) ? origin : 'https://ojjuda.kr',
      'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    if (origin && !ORIGINS.has(origin)) return reply({ error: 'origin_not_allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return reply({ error: 'not_signed_in' }, 401);
    if (!url || !service || !anon) return reply({ error: 'unavailable' }, 503);
    let body;
    try { body = await readBody(request); } catch { return reply({ error: 'bad_request' }, 400); }
    const get = (path, options) => fetchImpl(url + path, { signal: AbortSignal.timeout(12000), ...options });
    try {
      const auth = await get('/auth/v1/user', { headers: { apikey: anon, authorization } });
      if (!auth.ok) return reply({ error: 'not_signed_in' }, 401);
      const user = await auth.json();
      if (!UUID.test(user.id) || user.is_anonymous) return reply({ error: 'not_signed_in' }, 401);
      const rpc = async (action, values = {}) => {
        const response = await get('/rest/v1/rpc/onecard_online_service', { method: 'POST',
          headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_actor: user.id, p_action: action, ...values }) });
        const data = await response.json();
        if (!response.ok) throw Error(ERRORS.has(data.message) ? data.message : 'unavailable');
        return data;
      };
      let automaticAttempted = false;
      const catchUp = async result => {
        const r = result?.room;
        if (automaticAttempted || !r || r.status !== 'active' || !r.deadline || Date.parse(r.deadline) > now()) return result;
        // One request advances at most one automatic action, even with a slow RPC
        // or several people polling the same table at once.
        automaticAttempted = true;
        const player = r.state.players[r.state.turn];
        const command = player.bot
          ? chooseBotAction(projectState(r.state, player.id), player.id, { random })
          : { type: 'draw' };
        if (!command) throw Error('invalid_move');
        const state = applyAction(r.state, player.id, command, { random });
        try { return await rpc('commit', { p_room: r.id, p_expected: r.version, p_request: crypto.randomUUID(),
          p_next: { state, kind: player.bot ? 'computer' : 'timeout', command: command.type } }); }
        catch (error) {
          if (error.message !== 'state_conflict') throw error;
          return rpc('read', { p_room: r.id });
        }
      };
      let result;
      if (['start', 'move', 'leave'].includes(body.action)) {
        result = await rpc('read', { p_room: body.room_id });
        if (!result.room.requests.includes(`${user.id}:${body.request_id}`)) {
          if (body.action === 'move') result = await catchUp(result);
          const r = result.room;
          if (body.action !== 'leave' && body.version !== r.version) throw Error('state_conflict');
          let state = null;
          if (body.action === 'start') {
            if (r.host_id !== user.id || !['waiting', 'finished'].includes(r.status)) throw Error('not_room_owner');
            const players = r.members.flatMap((id, i) => r.departed[i] ? [] : [{ id, name: r.names[i] }]);
            if (!players.length) throw Error('need_players');
            const computerCount = 5 - players.length;
            for (let i = 0; i < computerCount; i++) players.push({
              id: `onecard-bot:${r.id}:${r.round + 1}:${i}`, name: `컴퓨터 ${i + 1}`, bot: true,
            });
            // Membership order and host permissions are independent of game seats.
            // Reshuffle people and computers together on every fresh round.
            for (let i = players.length - 1; i > 0; i--) {
              const j = Math.floor(random() * (i + 1));
              [players[i], players[j]] = [players[j], players[i]];
            }
            state = createGame({ players, startIndex: 0 }, { random });
          } else if (body.action === 'move') {
            if (r.status !== 'active') throw Error('room_unavailable');
            state = applyAction(r.state, user.id, body.command, { random });
          } else if (r.status === 'active') {
            // Leaving transfers this exact hand to the computer. No cards are
            // removed, no eliminated seat revives, and no winner is fabricated.
            state = structuredClone(r.state);
            const player = state.players.find(candidate => candidate.id === user.id);
            if (!player) throw Error('invalid_move');
            player.bot = true;
            state.direction = state.direction === -1 ? -1 : 1;
            state.revision++;
            state.lastEvents = [{ id: `${state.revision}:0`, type: 'takeover', playerId: user.id }];
          }
          result = await rpc(body.action === 'move' ? 'commit' : body.action, {
            p_room: r.id, p_expected: r.version, p_request: body.request_id,
            p_next: { state, kind: body.action, command: body.command?.type || null } });
        }
      } else result = await rpc(body.action, { p_room: body.room_id ?? null, p_code: body.code ?? null,
        p_request: body.request_id ?? null, p_options: body.action === 'create' ? { capacity: 5,
          ...(body.options?.title !== undefined ? { title: body.options.title } : {}),
          ...(body.options?.mode !== undefined ? { mode: body.options.mode } : {}) } : {} });
      if (body.action === 'leave') return reply({ ok: true, userId: user.id, room: null });
      // Return a mutation's own event before any later computer action. Only a
      // subsequent read/resume/join advances the next due turn.
      if (['read', 'mine', 'join'].includes(body.action)) result = await catchUp(result);
      return reply({ ok: true, userId: user.id, room: projectRoom(result, user.id, now()),
        ...(result.rooms ? { rooms: result.rooms } : {}) });
    } catch (error) {
      // Engine messages are deliberately not exposed; only stable public error codes cross the boundary.
      const code = error.code === 'NOT_YOUR_TURN' ? 'not_your_turn' : ERRORS.has(error.code) ? error.code : ERRORS.has(error.message) ? error.message
        : error.name === 'OneCardError' ? 'invalid_move' : 'unavailable';
      return reply({ error: code }, code === 'unavailable' ? 503 : code === 'not_signed_in' ? 401 : code === 'banned' ? 403 : 409);
    }
  };
}
