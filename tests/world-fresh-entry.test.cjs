const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../world.html'), 'utf8');
const lifecycle = source.slice(source.indexOf('var worldClosingGames=null;'), source.indexOf('var Cl=', source.indexOf('var worldClosingGames=null;')));
assert.ok(lifecycle.includes('function endWorldBoardSession('));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t) {
  const dom = new JSDOM('<div id="modal-root"></div>', { runScripts: 'outside-only' });
  const w = dom.window, calls = [], notices = [], saves = [];
  w.rpc = (name, params) => { const pending = deferred(); calls.push({ name, params, ...pending }); return pending.promise; };
  w.notice = message => notices.push(message);
  w.saved = owner => saves.push(owner);
  w.eval(`
    var D={online:true,user:{id:'member-a'}},S={rpc:(...args)=>window.rpc(...args)},g={tab:'arcade',place:'arcade'};
    var E=null,k=null,R=null,worldGameAssetRequest=0;
    function dt(){document.getElementById('modal-root').replaceChildren();}
    function Uo(){} function mn(){document.getElementById('gov')?.remove();}
    function notifyStreakSaved(owner){window.saved(owner);} function M(message){window.notice(message);}
    ${lifecycle}
  `);
  const session = (kind = 'board') => {
    const value = { owner: 'member-a', mode: 'online', online: { id: 'match-a' }, over: null, st: { over: null } };
    if (kind === 'board') { w.E = value; w.document.getElementById('modal-root').innerHTML = '<div id="bd-root"></div>'; }
    else { w.k = value; w.document.body.insertAdjacentHTML('beforeend', '<div id="gov" class="bl-ov"></div>'); }
    return value;
  };
  t.after(() => w.close());
  return { w, calls, notices, saves, session };
}

for (const kind of ['board', 'billiards']) {
  test(kind + ' finishes the pending move before leaving and starts the next visit without retained state', async t => {
    const f = fixture(t), state = f.session(kind), action = deferred(); state.pendingAction = action.promise;
    // A winning move may already be displayed locally while its authoritative
    // commit is still in flight. Closing must not overtake that commit.
    if (kind === 'board') state.over = { winner: 'w' }; else state.st.over = { winner: 'p1' };
    const close = kind === 'board' ? f.w.closeWorldGameModal : f.w.exitWorldBilliards;
    const pending = close();
    assert.equal(state.closing, true); assert.equal(f.calls.length, 0);
    assert.equal(close(), pending, 'double close shares one ordered cleanup');
    action.resolve(); await tick();
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].name, 'game_leave', 'normal exit hands control over instead of surrendering'); assert.equal(f.calls[0].params.p_id, 'match-a');
    f.calls[0].resolve({ error: null }); assert.equal(await pending, true);
    assert.equal(kind === 'board' ? f.w.E : f.w.k, null);
    assert.equal(f.w.document.querySelector('#bd-root,#gov'), null);
  });

  test(kind + ' failed leave retains the same game and allows a single retry', async t => {
    const f = fixture(t), state = f.session(kind);
    const close = kind === 'board' ? f.w.closeWorldGameModal : f.w.exitWorldBilliards;
    const pending = close(); await tick(); f.calls[0].resolve({ error: new Error('offline') });
    assert.equal(await pending, false); assert.equal(state.closing, false);
    assert.equal(kind === 'board' ? f.w.E : f.w.k, state);
    assert.ok(f.w.document.querySelector('#bd-root,#gov'));
    assert.match(f.notices[0], /다시 나가/);
    const retry = close(); await tick(); f.calls[1].resolve({ error: null });
    assert.equal(await retry, true); assert.equal(kind === 'board' ? f.w.E : f.w.k, null);
  });
}

test('an account change during a move cannot leave another account\'s game', async t => {
  const f = fixture(t), state = f.session(), action = deferred(); state.pendingAction = action.promise;
  const pending = f.w.closeWorldGameModal();
  f.w.D.user.id = 'member-b'; action.resolve();
  assert.equal(await pending, true); assert.equal(f.calls.length, 0); assert.equal(f.w.E, null);
});

test('the latest requested game alone opens after an asynchronous exit', async t => {
  const f = fixture(t); f.session(); const opened = [];
  const first = f.w.worldGameEntryGate(() => opened.push('chess'));
  const second = f.w.worldGameEntryGate(() => opened.push('tank'));
  await tick(); assert.equal(f.calls.length, 1); assert.deepEqual(opened, []);
  f.calls[0].resolve({ error: null }); await Promise.all([first, second]);
  assert.deepEqual(opened, ['tank']);
});

for (const change of ['account', 'tab', 'place', 'failed-close']) {
  test(change + ' prevents an obsolete game request from opening after cleanup', async t => {
    const f = fixture(t); f.session(); const opened = [];
    const pending = f.w.worldGameEntryGate(() => opened.push('chess'));
    await tick();
    if (change === 'account') f.w.D.user.id = 'member-b';
    if (change === 'tab') f.w.g.tab = 'my';
    if (change === 'place') f.w.g.place = 'park';
    f.calls[0].resolve({ error: change === 'failed-close' ? new Error('offline') : null });
    assert.equal(await pending, false); assert.deepEqual(opened, []);
  });
}

test('a late failed shot read cannot restore billiards during exit', async t => {
  const f = fixture(t), state = f.session('billiards'), shot = deferred(), read = deferred();
  state.st.balls = []; f.w.shotPromise = shot.promise; f.w.readPromise = read.promise; f.w.restored = 0;
  const start = source.indexOf('async function rl('), end = source.indexOf('function ', start + 20);
  f.w.eval(`
    function ta(){return {events:[],frames:[]};} function ea(){return {};}
    function Gh(){return window.shotPromise;} function Wa(e){return e.message;}
    function Yo(){return window.readPromise;} function dp(){window.restored++; k={};}
    ${source.slice(start, end)}
  `);
  const moving = f.w.rl({}, null); shot.reject(new Error('offline')); await moving;
  const closing = f.w.exitWorldBilliards(); await tick();
  read.resolve({ id: 'match-a' }); await tick();
  assert.equal(f.w.restored, 0, 'late recovery cannot replace the closing owner');
  f.calls[0].resolve({ error: null }); assert.equal(await closing, true); assert.equal(f.w.k, null);
});

test('a late fresh-room response cannot reopen a game after a newer navigation', async t => {
  const f = fixture(t), opened = [];
  f.w.opened = opened;
  const start = source.indexOf('onFreshGame:async(room,owner)=>{'), end = source.indexOf('\n  onOpen:', start);
  const callback = source.slice(start, end).trim().replace(/,$/, '');
  f.w.eval(`var worldArcadeMatch=null; function vn(kind){window.opened.push(kind);} function xn(kind){window.opened.push(kind);} var roomCallbacks={${callback}};`);
  const pending = f.w.roomCallbacks.onFreshGame({ kind: 'chess', match_id: 'old-match' }, 'member-a');
  f.w.worldGameAssetRequest++; f.w.g.tab = 'my';
  f.calls[0].resolve({ error: null }); await pending;
  assert.deepEqual(opened, []);
});


test('finishing an old board exit does not dismiss a newer unrelated modal', async t => {
  const f = fixture(t); f.session();
  const closing = f.w.closeWorldGameModal(); await tick();
  f.w.document.getElementById('modal-root').innerHTML = '<section id="member-profile">다른 화면</section>';
  f.calls[0].resolve({ error: null }); await closing;
  assert.equal(f.w.E, null);
  assert.equal(f.w.document.getElementById('member-profile').textContent, '다른 화면');
});


test('an inactive bridge with an async close does not create an entry recursion loop', async t => {
  const f = fixture(t); let closes=0,opened=0;
  f.w.OjjudaTtangBridge={close(){assert.ok(++closes<=2,'a completed cleanup must not recursively close again');return Promise.resolve(true);}};
  function open(){const gate=f.w.worldGameEntryGate(open);if(gate!==true)return gate;opened++;return true;}
  assert.equal(await open(),true);assert.equal(opened,1);assert.equal(closes,1);
});
