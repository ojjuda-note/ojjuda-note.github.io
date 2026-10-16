const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.argv[2] || path.join(__dirname, '..');
const invites = fs.readFileSync(path.join(root, 'game-friend-invites.js'), 'utf8');
const extract = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
let failures = 0;
async function test(name, run) {
  try { await run(); console.log('PASS:', name); }
  catch (error) { failures++; console.error('FAIL:', name, error.message); }
}
(async () => {
  await test('accepted invitation retries game opening without repeating acceptance', async () => {
    let rpcCalls = 0, joinCalls = 0;
    const status = {hidden: true, textContent: ''}, accept = {dataset: {answer: 'accept'}}, decline = {dataset: {answer: 'decline'}}, seconds = {parentElement: {hidden: false}};
    const node = {_busy: false, isConnected: true, querySelectorAll: () => [accept, decline], querySelector: selector => selector === '[data-seconds]' ? seconds : selector === '[data-answer=accept]' ? accept : selector === '[data-answer=decline]' ? decline : status};
    const context = {node, version: 1, generation: 1, invite: {id: 'x'}, item: {id: 'x'}, current: () => true,
      deadlines: new Map([['x', Date.now() + 60000]]), refreshSequence: 0,
      rpc: async () => { rpcCalls++; return {ok: true, kind: 'ttang', code: 'abc'}; },
      handled: new Set(), popup: node, expiryTimer: null, countdownTimer: null, clearTimeout, clearInterval, AbortController,
      closePopup() {node.isConnected = false; context.popup = null; node._joinController?.abort();},
      options: {onJoin: async () => {if (++joinCalls === 1) throw Error('game_asset_unavailable');}},
      render() {}, refresh() {}, message: () => 'join failed', expire() {throw Error('accepted invitation must not expire');}
    };
    vm.createContext(context);
    vm.runInContext(extract(invites, 'node.onclick=async event=>', '\n    if(invite)mountIncoming();'), context);
    await node.onclick({target: {closest: () => accept}});
    assert.equal(node.isConnected, true, 'failure must stay visible'); assert.equal(status.textContent, 'join failed');
    assert.equal(accept.textContent, '다시 시도'); assert.equal(decline.textContent, '닫기');
    assert.equal(seconds.parentElement.hidden, true);
    // Inbox refreshes no longer include accepted invitations; preserve the local retry UI.
    let mounted = 0;
    context.mountIncoming = () => {mounted++;}; context.incoming = []; context.responses = [];
    vm.runInContext(extract(invites, 'function render() {', '  async function refresh()'), context);
    context.render(); assert.equal(context.popup, node); assert.equal(mounted, 1);
    context.deadlines.set('x', 0);
    await node.onclick({target: {closest: () => accept}});
    assert.equal(rpcCalls, 1); assert.equal(joinCalls, 2); assert.equal(node.isConnected, false);
    // A stalled game opening keeps dismissal enabled, aborts its signal, and cannot
    // overwrite a newer popup when it eventually resolves or rejects.
    for (const reject of [false, true]) {
      node.isConnected = true; context.popup = node; status.textContent = 'current status';
      let settle, signal;
      context.options.onJoin = (_data, options) => {signal = options.signal; return new Promise((resolve, fail) => {settle = reject ? () => fail(Error('late failure')) : resolve;});};
      const stalled = node.onclick({target: {closest: () => accept}});
      assert.equal(node._busy, true); assert.equal(decline.disabled, false);
      assert.equal(decline.textContent, '닫기');
      await node.onclick({target: {closest: () => decline}});
      assert.equal(signal.aborted, true); assert.equal(node.isConnected, false);
      assert.equal(rpcCalls, 1, 'local dismissal must never reverse acceptance');
      const newer = {}; context.popup = newer;
      settle(); await stalled;
      assert.equal(context.popup, newer); assert.equal(status.textContent, 'current status');
    }
    // Acceptance itself can stall before any join payload exists. Dismissal is
    // local only; the late RPC may settle server-side but cannot launch a game.
    for (const mode of ['resolve', 'reject', 'expire']) {
      const reject = mode === 'reject';
      delete node._accepted; delete node._joinController;
      node.isConnected = true; context.popup = node; status.textContent = 'new status';
      context.deadlines.set('x', Date.now() + 60000);
      let settle, unexpectedJoin = 0;
      context.options.onJoin = () => {unexpectedJoin++;};
      context.rpc = () => new Promise((resolve, fail) => {settle = reject ? () => fail(Error('late RPC failure')) : () => resolve({ok: true, kind: 'ttang', code: 'abc'});});
      const stalled = node.onclick({target: {closest: () => accept}});
      assert.equal(node._accepted, undefined); assert.equal(node._busy, true);
      assert.equal(decline.disabled, false); assert.equal(decline.textContent, '닫기');
      if(mode==='expire'){
        vm.runInContext(extract(invites, 'const expire=()=>', '    node.onclick=').replace('const expire=', 'globalThis.expire='), context);
        context.expire();
      } else await node.onclick({target: {closest: () => decline}});
      assert.equal(node.isConnected, false);
      const newer = {}; context.popup = newer;
      settle(); await stalled;
      assert.equal(unexpectedJoin, 0); assert.equal(context.popup, newer);
      assert.equal(status.textContent, 'new status');
    }

  });
  process.exitCode = failures ? 1 : 0;
})();
