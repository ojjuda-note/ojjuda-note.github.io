const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(process.env.OJJUDA_ROOMS_JS || path.join(__dirname, '../arcade-rooms.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const room = (patch = {}) => ({ room_no: 17, kind: 'chess', title: '친구와 체스', host_name: '회원', players: 1, capacity: 2, status: 'waiting', is_member: true, is_host: true, match_id: null, ...patch });

function fixture(t) {
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
    goArcade() {}, closeModal() { w.document.querySelector('#modal-root').replaceChildren(); }, renderModal() {}
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

test('a hidden tab makes no periodic room RPCs and refreshes immediately when visible again', async t => {
  const f = fixture(t); await f.start(); assert.equal(f.calls.length, 2);
  await f.visibility(true); const before = f.calls.length; await f.advance(12000);
  t.diagnostic('RPCs during twelve hidden seconds: ' + (f.calls.length - before));
  assert.equal(f.calls.length, before);
  f.state.data = { ...f.state.data, rooms: [room({ is_member: false })] };
  await f.visibility(false); assert.equal(f.calls.length, before + 2);
  assert.equal(f.list().querySelector('.arcade-room-copy h4').textContent, '친구와 체스');
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

for (const interruption of ['visibility', 'game']) {
  test('return from ' + interruption + ' completes its fresh read before a superseded match can open', async t => {
    const f = fixture(t); f.state.data = { ...f.state.data, rooms: [room()], mine: room() }; f.state.openOverlay = true; await f.start();
    f.state.delayed = true; const pending = f.app.refresh(); await tick();
    if (interruption === 'visibility') { await f.visibility(true); await f.visibility(false); }
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
