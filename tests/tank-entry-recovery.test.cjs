const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const {JSDOM} = require('jsdom');
const root = path.join(__dirname, '..');
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };

async function fixture({listError=null, mineError=null} = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'games/tank/index.html'), 'utf8'), {url:'https://fixture.test/games/tank/index.html', runScripts:'outside-only'});
  const w = dom.window, context = dom.getInternalVMContext(), calls = [];
  const transport = {listError, mineError, listPending:null, minePending:null};
  w.TankView = {resetInput() {}, resetHistory() {}, refresh() {}, use() {}, hasEffects:() => false, fullscreen:async () => {}};
  const engine = new vm.SourceTextModule(fs.readFileSync(path.join(root, 'games/tank/engine.mjs'), 'utf8'), {context});
  await engine.link(() => { throw Error('unexpected engine import'); }); await engine.evaluate();
  let room = null;
  const result = () => ({ok:true, coins:100, room});
  async function respond(body) {
    calls.push(body);
    if (body.action === 'mine') return transport.minePending ? transport.minePending.promise : transport.mineError ? {error:transport.mineError} : result();
    if (body.action === 'list') return transport.listPending ? transport.listPending.promise : transport.listError ? {error:transport.listError} : {ok:true, coins:100, rooms:[]};
    if (body.action === 'create') {
      room = {id:'00000000-0000-4000-8000-000000000001', mode:body.options.mode, title:'테스트 방', code:'A1B2C3D4', status:'waiting', seat:0, hostSeat:0, capacity:body.options.capacity, names:['나'], version:0, serverTime:Date.now()};
      return result();
    }
    if (body.action === 'start') {
      const names = Array.from({length:room.capacity}, (_, i) => '플레이어 ' + (i + 1));
      room = {...room, status:'active', version:1, game:engine.namespace.newGame(names, room.id, 123456), deadline:new Date(Date.now() + 45000).toISOString()};
      return result();
    }
    if (body.action === 'read') return result();
    throw Error('unexpected test action: ' + body.action);
  }
  const parent = {postMessage(message) {
    if (message.type === 'ready') queueMicrotask(() => w.dispatchEvent(new w.MessageEvent('message', {origin:'https://fixture.test', source:parent, data:{source:'ojjuda-world', type:'tank-init', available:true}})));
    if (message.type === 'request') void respond(message.body).then(response => w.dispatchEvent(new w.MessageEvent('message', {origin:'https://fixture.test', source:parent, data:{source:'ojjuda-world', type:'tank-response', replyTo:message.requestId, result:response}})));
  }};
  Object.defineProperty(w, 'parent', {value:parent});
  const online = new vm.SourceTextModule(fs.readFileSync(path.join(root, 'games/tank/online.mjs'), 'utf8'), {context});
  await online.link(() => engine); await online.evaluate(); await flush();
  return {w, calls, transport, el:id => w.document.getElementById(id),
    async click(id) { w.document.getElementById(id).click(); await flush(); },
    async refresh() { w.dispatchEvent(new w.Event('online')); await flush(); },
    close() { w.close(); }
  };
}

for (const mode of ['solo', 'local']) {
  test(mode + ' starts without depending on unavailable public room listings', async () => {
    const f = await fixture({listError:'unavailable'});
    try {
      assert.equal(f.el('startSolo').disabled, false);
      assert.equal(f.el('startLocal').disabled, false);
      assert.equal(f.calls.some(call => call.action === 'list'), false, 'private entry does not load a hidden public list');
      await f.click(mode + 'Mode'); await f.click(mode === 'solo' ? 'startSolo' : 'startLocal');
      assert.equal(f.w.document.body.classList.contains('in-match'), true);
      assert.equal(f.calls.find(call => call.action === 'create').options.mode, mode);
      assert.equal(f.calls.filter(call => call.action === 'start').length, 1);
    } finally { f.close(); }
  });
}

test('public list failure stays in its list and can recover on refresh', async () => {
  const f = await fixture({listError:'unavailable'});
  try {
    await f.click('onlineMode');
    assert.match(f.el('rooms').textContent, /불러오지 못/);
    assert.equal(f.el('startSolo').disabled, false);
    assert.equal(f.el('startLocal').disabled, false);
    f.transport.listError = null; await f.click('refreshRooms');
    assert.match(f.el('rooms').textContent, /아직 열린 방이 없/);
    await f.click('soloMode'); await f.click('startSolo');
    assert.equal(f.w.document.body.classList.contains('in-match'), true);
  } finally { f.close(); }
});

test('a failed own-match check still blocks starting and recovers after reconnection', async () => {
  const f = await fixture({mineError:'unavailable'});
  try {
    assert.equal(f.el('startSolo').disabled, true);
    assert.equal(f.el('startLocal').disabled, true);
    f.transport.mineError = null; await f.refresh();
    assert.equal(f.el('startSolo').disabled, false);
    assert.equal(f.el('startLocal').disabled, false);
  } finally { f.close(); }
});

for (const action of ['list', 'mine']) {
  test('late ' + action + ' failure cannot lock a newly started match', async () => {
    const f = await fixture();
    try {
      const old = deferred(), before = f.calls.filter(call => call.action === action).length;
      f.transport[action + 'Pending'] = old;
      if (action === 'list') await f.click('onlineMode');
      await f.refresh();
      assert.ok(f.calls.filter(call => call.action === action).length > before, 'the old request is in flight');
      await f.click('localMode'); await f.click('startLocal');
      assert.equal(f.w.document.body.classList.contains('in-match'), true);
      old.resolve({error:'unavailable'}); await flush();
      assert.equal(f.w.TankOnline.canAim(), true, 'a stale background request cannot make the current turn unusable');
      assert.equal(f.el('netNotice').textContent, '');
    } finally { f.close(); }
  });
}

for (const error of ['not_signed_in', 'banned']) {
  test('public listing ' + error + ' rejection retains the access restriction', async () => {
    const f = await fixture({listError:error});
    try {
      await f.click('onlineMode');
      assert.equal(f.el('startSolo').disabled, true);
      assert.equal(f.el('startLocal').disabled, true);
    } finally { f.close(); }
  });
}
