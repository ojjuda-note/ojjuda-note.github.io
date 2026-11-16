const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(process.env.OJJUDA_ROOMS_JS || path.join(__dirname, '../features/arcade/arcade-rooms.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const room = (patch = {}) => ({ room_no: 17, kind: 'chess', title: '친구와 체스', host_name: '회원', players: 1, capacity: 2, status: 'waiting', is_member: true, is_host: true, match_id: null, ...patch });

function fixture(t, overrides = {}) {
  const dom = new JSDOM('<main><section data-arcade-rooms></section></main><div id="modal-root"></div>', { url: 'https://fixture.test/world.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, calls = [], opened = [], freshOpened = [], notifications = [], timers = new Map();
  let now = 100000, nextTimer = 0, hidden = false, actor = 'member-a';
  const state = { data: { ok: true, rooms: [], mine: null, can_matgo: false }, extra: [], delayed: false, pending: [], error: null, openOverlay: false, freshPending: null };
  Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => hidden });
  w.Date.now = () => now;
  w.setTimeout = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id; };
  w.clearTimeout = id => timers.delete(id);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  const client = { rpc(name, params) {
    calls.push({ name, params, actor });
    if (state.delayed) return new Promise(resolve => state.pending.push(resolve));
    return Promise.resolve({ data: state.data, error: state.error });
  } };
  w.eval(source);
  const app = w.OjjudaArcadeRooms.create({
    client, getUserId: () => actor, notify: message => notifications.push(message), matgoAllowed: () => true,
    extraRooms: async () => { calls.push({ name: 'arcade_extra_rooms', actor }); return state.extra; },
    canOpen: () => !w.document.querySelector('#modal-root .modal,#gov,#matgo-overlay'),
    onOpen: async (value, owner) => { opened.push({ value, owner }); if (state.openOverlay) w.document.body.classList.add('gaming'); },
    onFreshGame: async (value, owner) => { freshOpened.push({ value, owner }); if (state.freshPending) await state.freshPending; },
    goArcade() {}, closeModal() { w.document.querySelector('#modal-root').replaceChildren(); }, renderModal() {},
    ...overrides
  });
  t.after(() => { app.dispose(); w.close(); });
  const advance = async duration => {
    const until = now + duration;
    for (;;) {
      const due = [...timers].filter(([, task]) => task.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at; timers.delete(due[0]); due[1].callback(); await tick(); await tick();
    }
    now = until;
  };
  const visibility = async value => { hidden = value; w.document.dispatchEvent(new w.Event('visibilitychange')); await tick(); await tick(); };
  const mount = async () => {
    w.document.querySelector('main').innerHTML = '<section data-arcade-rooms></section>';
    app.sync(); await tick(); await tick();
  };
  return { w, app, calls, opened, freshOpened, notifications, state, advance, visibility, mount, timers, actor: value => { actor = value; },
    list: () => w.document.querySelector('[data-arcade-rooms]'),
    async start() { app.sync(); await tick(); await tick(); },
    async reply(index, data) { state.pending[index]({ data, error: null }); await tick(); await tick(); }
  };
}

async function connection(f, online) {
  Object.defineProperty(f.w.navigator, 'onLine', { configurable: true, value: online });
  f.w.dispatchEvent(new f.w.Event(online ? 'online' : 'offline'));
  await tick();
}

test('offline rooms keep the last list, skip reads and refresh once on reconnect', async t => {
  const f = fixture(t);
  f.state.data.rooms = [room({ is_member: false })];
  await f.start();
  const before = f.calls.length;
  await connection(f, false);
  await f.advance(12000);
  t.diagnostic('room read attempts during 12 offline seconds: ' + (f.calls.length - before));
  assert.equal(f.calls.length, before);
  await f.app.refresh();
  assert.equal(f.calls.length, before);
  assert.match(f.list().querySelector('[data-room-issue]').textContent, /연결/);
  assert.ok(f.list().querySelector('.arcade-room-card'));
  f.state.data.rooms = [];
  await connection(f, true);
  await connection(f, true);
  assert.equal(f.calls.length, before + 2);
  assert.equal(f.list().querySelector('.arcade-room-card'), null);
  assert.equal(f.list().querySelector('[data-room-issue]').hidden, true);
  f.app.dispose();
  await connection(f, false);
  await connection(f, true);
  assert.equal(f.calls.length, before + 2);
});

test('a hidden tab makes no periodic room RPCs and refreshes immediately when visible again', async t => {
  const f = fixture(t); await f.start(); assert.equal(f.calls.length, 2);
  await f.visibility(true); const before = f.calls.length; await f.advance(12000);
  t.diagnostic('RPCs during twelve hidden seconds: ' + (f.calls.length - before));
  assert.equal(f.calls.length, before);
  f.state.data = { ...f.state.data, rooms: [room({ is_member: false })] };
  await f.visibility(false); assert.equal(f.calls.length, before + 2);
  assert.equal(f.list().querySelector('.arcade-room-copy h4').textContent, '친구와 체스');
});

test('a passive lobby reads every six seconds but manual refresh stays immediate', async t => {
  const f = fixture(t); await f.start(); assert.equal(f.calls.length, 2);
  await f.advance(4000); assert.equal(f.calls.length, 2, 'a visitor without a room does not poll every four seconds');
  await f.mount(); assert.equal(f.calls.length, 2, 'redrawing the lobby reuses recent room data');
  await f.advance(2000); assert.equal(f.calls.length, 4, 'the passive lobby discovers new rooms within six seconds');
  await f.app.refresh(); assert.equal(f.calls.length, 6, 'manual refresh still reads both sources immediately');
  await f.advance(4000); assert.equal(f.calls.length, 6);
});

for (const overlay of ['gaming', 'matgo-open', 'gov', 'matgo-overlay', 'ttang-overlay', 'tour-game-dialog', 'bd-root']) {
  test(overlay + ' pauses lobby polling and closing it immediately updates room cards', async t => {
    const f = fixture(t); await f.start();
    let node;
    if (overlay === 'gaming' || overlay === 'matgo-open') f.w.document.body.classList.add(overlay);
    else {
      node = f.w.document.createElement('div');
      if (overlay === 'tour-game-dialog') node.className = overlay; else node.id = overlay;
      (overlay === 'bd-root' ? f.w.document.querySelector('#modal-root') : f.w.document.body).append(node);
    }
    await tick(); const before = f.calls.length; await f.advance(12000);
    assert.equal(f.calls.length, before, 'the hidden room list does not compete with gameplay');
    f.state.data = { ...f.state.data, rooms: [room({ is_member: false })] };
    if (node) node.remove(); else f.w.document.body.classList.remove(overlay);
    await tick(); await tick();
    assert.equal(f.calls.length, before + 2, 'closing the game immediately fetches both room sources');
    assert.equal(f.list().querySelector('.arcade-room-copy h4').textContent, '친구와 체스');
  });
}

test('ten shell redraws keep room cards, filters and metadata without ten more list requests', async t => {
  const f = fixture(t); f.state.data = { ok: true, rooms: [room()], mine: room(), can_matgo: true }; await f.start();
  const search = f.list().querySelector('[data-room-search]'); search.value = '체스'; search.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  for (let i = 0; i < 10; i++) await f.mount();
  t.diagnostic('RPCs for initial load and ten room-list redraws: ' + f.calls.length);
  assert.equal(f.calls.length, 2);
  assert.equal(f.list().querySelector('[data-room-search]').value, '체스');
  assert.match(f.list().textContent, /내 방/); assert.ok(f.list().querySelector('option[value=matgo]'));
  await f.app.refresh(); assert.equal(f.calls.length, 4, 'manual refresh still reads both sources immediately');
  await f.advance(4000); assert.equal(f.calls.length, 6, 'ordinary visible polling retains its four-second interval');
});

test('a waiting room still detects its opponent away from the lobby and opens the match once', async t => {
  const f = fixture(t); const waiting = room(); f.state.data = { ...f.state.data, rooms: [waiting], mine: waiting }; await f.start();
  f.w.document.querySelector('main').replaceChildren(); f.app.sync();
  const playing = room({ status: 'playing', match_id: 'match-17', players: 2 }); f.state.data = { ...f.state.data, rooms: [playing], mine: playing };
  await f.advance(4000); assert.equal(f.opened.length, 1); assert.equal(f.opened[0].owner, 'member-a');
  await f.advance(4000); assert.equal(f.opened.length, 1, 'a later poll cannot open the same match twice');
});

test('an opponent joining while hidden is opened on return, never by a late hidden response', async t => {
  const f = fixture(t); f.state.data = { ...f.state.data, rooms: [room()], mine: room() }; await f.start();
  f.state.delayed = true; const pending = f.app.refresh(); await tick(); await f.visibility(true);
  const playing = room({ status: 'playing', match_id: 'match-17', players: 2 });
  await f.reply(0, { ...f.state.data, rooms: [playing], mine: playing }); await pending;
  assert.equal(f.opened.length, 0, 'hidden responses cannot launch an unsolicited game');
  f.state.delayed = false; f.state.data = { ...f.state.data, rooms: [playing], mine: playing };
  await f.visibility(false); assert.equal(f.opened.length, 1);
});

for (const interruption of ['visibility', 'game', 'network']) {
  test('return from ' + interruption + ' completes its fresh read before a superseded match can open', async t => {
    const f = fixture(t); f.state.data = { ...f.state.data, rooms: [room()], mine: room() }; f.state.openOverlay = true; await f.start();
    f.state.delayed = true; const pending = f.app.refresh(); await tick();
    if (interruption === 'visibility') { await f.visibility(true); await f.visibility(false); }
    else if (interruption === 'network') { await connection(f, false); await connection(f, true); }
    else { f.w.document.body.classList.add('gaming'); await tick(); f.w.document.body.classList.remove('gaming'); await tick(); }
    const stale = room({ status: 'playing', match_id: 'closed-match', players: 2 });
    await f.reply(0, { ...f.state.data, rooms: [stale], mine: stale }); await pending;
    assert.equal(f.opened.length, 0, 'the previous response cannot open an overlay and suppress the queued fresh read');
    assert.equal(f.state.pending.length, 2, 'the queued return refresh actually starts');
    assert.equal(f.list().querySelector('.arcade-room-state.playing'), null, 'superseded room metadata is not rendered');
    await f.reply(1, { ...f.state.data, rooms: [], mine: null });
    assert.equal(f.list().querySelector('.arcade-room-card'), null);
    const waitingRead = f.app.refresh(), waiting = room({ room_no: 18 });
    await f.reply(2, { ...f.state.data, rooms: [waiting], mine: waiting }); await waitingRead;
    const fresh = f.app.refresh(), playing = room({ room_no: 18, status: 'playing', match_id: 'current-match', players: 2 });
    await f.reply(3, { ...f.state.data, rooms: [playing], mine: playing }); await fresh;
    assert.deepEqual(f.opened.map(entry => entry.value.match_id), ['current-match'], 'a newly observed waiting room still starts when its opponent joins');
  });
}

test('a late account response is discarded and the new account gets its own immediate read', async t => {
  const f = fixture(t); f.state.delayed = true; await f.start();
  f.actor('member-b'); f.app.sync();
  await f.reply(0, { ok: true, rooms: [room()], mine: room(), can_matgo: true });
  assert.equal(f.list().querySelector('.arcade-room-card'), null); assert.equal(f.opened.length, 0);
  assert.equal(f.state.pending.length, 2, 'the new session is not left waiting for the periodic timer');
  await f.reply(1, { ok: true, rooms: [room({ title: '새 회원 방', is_member: false, is_host: false })], mine: null, can_matgo: false });
  assert.equal(f.list().querySelector('.arcade-room-copy h4').textContent, '새 회원 방');
});

test('failed list reads remain retryable and dispose removes wakeup listeners and timers', async t => {
  const f = fixture(t); f.state.error = { message: 'offline' }; await f.start();
  assert.equal(f.list().querySelector('[data-room-issue]').hidden, false);
  f.state.error = null; f.state.data = { ...f.state.data, rooms: [room({ is_member: false })] };
  f.list().querySelector('[data-arcade-action=refresh]').click(); await tick(); await tick();
  assert.equal(f.list().querySelector('[data-room-issue]').hidden, true); assert.ok(f.list().querySelector('.arcade-room-card'));
  const before = f.calls.length; f.app.dispose(); await f.visibility(true); await f.visibility(false); await f.advance(12000);
  assert.equal(f.calls.length, before); assert.equal(f.timers.size, 0);
});


test('an old playing room is never resumed on initial load or shell redraw, and its card requests a fresh game once', async t => {
  const f = fixture(t), playing = room({ status: 'playing', match_id: 'old-match', players: 2 });
  f.state.data = { ...f.state.data, rooms: [playing], mine: playing };
  await f.start(); await f.mount(); await f.advance(8000);
  assert.equal(f.opened.length, 0, 'previous-visit games never open automatically');
  let finish; f.state.freshPending = new Promise(resolve => { finish = resolve; });
  const button = f.list().querySelector('[data-arcade-action=join]');
  assert.equal(button.textContent, '새 게임');
  button.click(); button.click(); await tick();
  assert.equal(f.freshOpened.length, 1, 'double clicks share one cleanup and new-entry request');
  assert.equal(f.freshOpened[0].value.match_id, 'old-match');
  assert.equal(f.list().querySelector('[data-arcade-action=join]').disabled, true);
  finish(); await tick(); await tick();
  assert.equal(f.opened.length, 0, 'refresh after cleanup cannot resume the old match either');
});

test('a waiting room that disappears cannot arm a later unrelated playing room', async t => {
  const f = fixture(t); f.state.data = { ...f.state.data, rooms: [room()], mine: room() }; await f.start();
  f.state.data = { ...f.state.data, rooms: [], mine: null }; await f.app.refresh();
  const playing = room({ status: 'playing', match_id: 'old-match', players: 2 });
  f.state.data = { ...f.state.data, rooms: [playing], mine: playing }; await f.app.refresh();
  assert.equal(f.opened.length, 0);
});

test('rapid native room cancellations send one request and a failed attempt can be retried', async t => {
  let attempts = 0, resolveCancel, rejectCancel;
  const f = fixture(t, {
    onCancelNative() {
      attempts++;
      return new Promise((resolve, reject) => { resolveCancel = resolve; rejectCancel = reject; });
    }
  });
  const own = room({kind: 'tank', native: true});
  f.state.extra = [own];
  await f.start();
  const cancel = () => f.list().querySelector('[data-arcade-action="cancel"]').click();
  for (let i = 0; i < 5; i++) cancel();
  assert.equal(attempts, 1);
  rejectCancel(new Error('unavailable'));
  await tick();
  assert.equal(f.notifications.length, 1);
  cancel();
  assert.equal(attempts, 2);
  f.state.delayed = true;
  f.state.extra = [];
  resolveCancel();
  await tick();
  assert.equal(f.list().querySelector('[data-arcade-action="cancel"]'), null, 'a confirmed cancellation cannot be repeated while the list reloads');
  assert.equal(f.notifications.length, 2);
  await f.reply(0, f.state.data);
});

test('native room entry sends one request, can retry, and settles only its own account', async t => {
  const attempts = [];
  const f = fixture(t, {
    onOpen(value, actor) {
      return new Promise((resolve, reject) => attempts.push({ value, actor, resolve, reject }));
    }
  });
  const target = room({ kind: 'ttang', native: true, is_member: false, is_host: false });
  f.state.extra = [target];
  await f.start();
  const enter = () => f.list().querySelector('[data-arcade-action="join"]');
  for (let i = 0; i < 5; i++) enter().click();
  await tick();
  assert.equal(attempts.length, 1, 'repeated taps start only one entry');
  assert.equal(enter().disabled, true);
  assert.equal(enter().textContent, '입장 중…');
  attempts[0].reject(Error('room_full'));
  await tick();
  assert.equal(f.notifications.length, 1);
  assert.equal(enter().disabled, false);
  enter().click(); await tick();
  assert.equal(attempts.length, 2);

  f.actor('member-b'); f.app.sync(); await tick();
  assert.equal(enter().disabled, false, 'the next account can use its own room list');
  enter().click(); await tick();
  assert.deepEqual(attempts.map(a => a.actor), ['member-a', 'member-a', 'member-b']);
  attempts[1].reject(Error('room_unavailable')); await tick();
  assert.equal(f.notifications.length, 1, 'the previous account cannot post an entry error');
  assert.equal(enter().disabled, true, 'the previous response cannot release this entry');
  attempts[2].resolve(); await tick();
  assert.equal(enter().disabled, false);
});
