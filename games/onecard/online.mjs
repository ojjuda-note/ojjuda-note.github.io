const MESSAGES = {
  not_signed_in: '함께 하려면 먼저 로그인해 주세요.',
  banned: '이용이 제한된 계정이에요.',
  room_in_progress: '참여 중인 방으로 돌아갈게요.',
  room_rate_limit: '잠시 후 다시 방을 만들어 주세요.',
  room_full: '다섯 자리가 모두 찼어요.',
  room_not_found: '방 코드를 다시 확인해 주세요.',
  room_unavailable: '이미 끝났거나 참여할 수 없는 방이에요.',
  not_room_owner: '방장만 시작할 수 있어요.',
  need_players: '두 명 이상 모이면 시작할 수 있어요.',
  state_conflict: '차례가 바뀌었어요. 현재 판을 불러왔습니다.',
  not_your_turn: '내 차례를 기다려 주세요.',
  invalid_move: '지금 낼 수 있는 카드를 골라 주세요.',
  bad_request: '선택한 내용을 다시 확인해 주세요.',
  unavailable: '연결을 확인하고 있어요. 잠시 후 다시 시도해 주세요.',
  closed: '연결이 종료되었어요.',
};

function problem(code) {
  const error = new Error(MESSAGES[code] || MESSAGES.unavailable);
  error.code = code || 'unavailable';
  return error;
}

export function pollDelay(room, { hidden = false, failures = 0, now = Date.now() } = {}) {
  if (hidden) return 5000;
  if (failures) return Math.min(10000, 1200 * 2 ** Math.min(failures, 3));
  if (room?.status === 'active' && room.deadline) {
    const serverNow = (room.serverTime || now) + now - (room.receivedAt || now);
    const remaining = Date.parse(room.deadline) - serverNow;
    if (Number.isFinite(remaining) && remaining > 0 && remaining < 1000) return Math.max(120, remaining + 40);
  }
  return room?.status === 'waiting' ? 1500 : 1000;
}

/** The server owns all multiplayer state. Animation stays entirely in the view. */
export function createOnlineClient({ onRoom = () => {}, onError = () => {}, onConnection = () => {}, invoke, timeoutMs = 18000 } = {}) {
  let room = null, userId = null, closed = false, busy = false, reading = null, pollTimer = null;
  let failures = 0, retry = null, authSubscription = null, authClient = null, sessionEpoch = 0;

  function accept(data, force = false) {
    if (closed || !data) return;
    if (authClient && data.userId && data.userId !== userId) return;
    if (data.userId) userId = data.userId;
    if (Object.hasOwn(data, 'room')) {
      const next = data.room;
      if (next && room?.id === next.id && next.version < room.version) return;
      const changed = force || room?.id !== next?.id || room?.version !== next?.version;
      if (next) next.receivedAt = Date.now();
      room = next;
      if (changed) onRoom(room);
    }
    failures = 0;
    onConnection('');
  }

  async function rpc(body) {
    if (closed) throw problem('closed');
    const epoch = sessionEpoch;
    let cancelled = false, timer;
    const verify = () => {
      if (closed) throw problem('closed');
      if (cancelled) throw problem('unavailable');
      if (epoch !== sessionEpoch) throw problem('not_signed_in');
    };
    const task = (async () => {
      let data;
      if (invoke) data = await invoke(body);
      else {
        const getClient = globalThis.OjjudaGetClient;
        if (typeof getClient !== 'function') throw problem('unavailable');
        const client = await getClient();
        verify();
        if (!authClient) {
          authClient = client;
          authSubscription = client.auth.onAuthStateChange((_event, session) => {
            const nextUser = session?.user?.id || null;
            if (userId && nextUser !== userId) {
              sessionEpoch++;
              clearTimeout(pollTimer); room = null; userId = nextUser; retry = null;
              onRoom(null); onConnection(MESSAGES.not_signed_in);
            }
          }).data?.subscription;
        }
        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        verify();
        const session = sessionData?.session;
        if (sessionError || !session?.access_token || !session.user?.id || session.user.is_anonymous) throw problem('not_signed_in');
        if (userId && userId !== session.user.id) {
          sessionEpoch++; room = null; userId = session.user.id; onRoom(null); throw problem('not_signed_in');
        }
        userId = session.user.id;
        const result = await client.functions.invoke('onecard', { body });
        verify();
        data = result.data;
        if (result.error) {
          let code = data?.error;
          try { code = (await result.error.context.json()).error || code; } catch {}
          throw problem(code || 'unavailable');
        }
      }
      verify();
      if (data?.error) throw problem(data.error);
      if (!data?.ok) throw problem('unavailable');
      return data;
    })();
    try {
      const data = await Promise.race([task, new Promise((_, reject) => {
        timer = setTimeout(() => { cancelled = true; reject(problem('unavailable')); }, timeoutMs);
      })]);
      verify(); return data;
    } catch (error) { throw error.code ? error : problem('unavailable'); }
    finally { clearTimeout(timer); }
  }

  function schedule() {
    clearTimeout(pollTimer);
    if (!closed && room) pollTimer = setTimeout(() => { void read(); },
      pollDelay(room, { hidden: globalThis.document?.hidden, failures }));
  }

  async function read() {
    if (closed || !room || busy) { schedule(); return room; }
    if (reading) return reading;
    const id = room.id;
    reading = (async () => {
      try { const data = await rpc({ action: 'read', room_id: id }); if (room?.id === id) accept(data); }
      catch (error) {
        if (closed) return room;
        failures++;
        onConnection(error.message || MESSAGES.unavailable);
        if (['room_not_found', 'room_unavailable', 'not_signed_in', 'banned'].includes(error.code)) {
          accept({ room: null }); onError(error);
        }
      } finally { reading = null; schedule(); }
      return room;
    })();
    return reading;
  }

  async function enter() {
    if (closed) throw problem('closed');
    if (busy) return room;
    busy = true; clearTimeout(pollTimer);
    if (reading) await reading;
    try {
      const data = await rpc({ action: 'mine' });
      accept(data, true); return room;
    } finally { busy = false; schedule(); }
  }

  async function act(action, values = {}) {
    if (closed || busy) return false;
    busy = true; clearTimeout(pollTimer);
    if (reading) await reading;
    const prior = room;
    try {
      if (['start', 'move', 'leave'].includes(action) && !room) throw problem('room_not_found');
      const fingerprint = JSON.stringify([action, room?.id || null, values]);
      const requestId = retry?.fingerprint === fingerprint ? retry.id : crypto.randomUUID();
      retry = { fingerprint, id: requestId };
      const data = await rpc({ action, ...(room ? { room_id: room.id, version: room.version } : {}),
        ...values, request_id: requestId });
      retry = null; accept(data); return true;
    } catch (error) {
      if (closed) return false;
      if (error.code !== 'unavailable') retry = null;
      if (action === 'leave' && ['room_not_found', 'room_unavailable'].includes(error.code)) {
        accept({ room: null }); return true;
      }
      onError(error.code ? error : problem('unavailable'));
      if (error.code === 'room_in_progress') {
        try { accept(await rpc({ action: 'mine' }), true); } catch (recovery) { onConnection(recovery.message); }
      } else if (prior && ['state_conflict', 'not_your_turn', 'unavailable'].includes(error.code)) {
        try {
          accept(await rpc({ action: 'read', room_id: prior.id }));
          // Leave is safe to retry against a newer revision; card moves are never guessed.
          if (action === 'leave' && room) {
            accept(await rpc({ action: 'leave', room_id: room.id, version: room.version, request_id: crypto.randomUUID() }));
            return true;
          }
        } catch (recovery) { onConnection(recovery.message); }
      }
      return false;
    } finally { busy = false; schedule(); }
  }

  function visible() { if (!globalThis.document?.hidden) void read(); else schedule(); }
  globalThis.document?.addEventListener('visibilitychange', visible);
  globalThis.addEventListener?.('online', visible);
  function close() {
    closed = true; sessionEpoch++; clearTimeout(pollTimer); authSubscription?.unsubscribe();
    globalThis.document?.removeEventListener('visibilitychange', visible);
    globalThis.removeEventListener?.('online', visible);
  }
  return {
    enter, read, close,
    create: ({ capacity = 5 } = {}) => act('create', { options: { capacity } }),
    join: code => act('join', { code: String(code).replace(/[\s-]/g, '').toUpperCase() }),
    start: () => act('start'),
    move: command => act('move', { command }),
    leave: () => act('leave'),
    list: async () => (await rpc({ action: 'list' })).rooms || [],
    get room() { return room; }, get userId() { return userId; }, get busy() { return busy; },
  };
}
