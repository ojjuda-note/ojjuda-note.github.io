const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.argv[2] || path.join(__dirname, '..');
const world = fs.readFileSync(path.join(root, 'world.html'), 'utf8');
const extract = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
let failures = 0;
async function test(name, run) {
  try { await run(); console.log('PASS:', name); }
  catch (error) { failures++; console.error('FAIL:', name, error.message); }
}
(async () => {
  await test('board menu completion respects dismissal, newer menus and account changes', async () => {
    let node = null, opened = 0;
    const waiting = [];
    const context = {
      Ui() {}, Uo() {}, dn() {}, k2() {}, g: {}, D: {user: {id: 'a'}},
      Xe: {chess: {name: 'Chess', emoji: ''}, janggi: {name: 'Janggi', emoji: ''}},
      ct(html) { opened++; node = {innerHTML: html}; },
      Hp: () => new Promise(resolve => waiting.push(resolve)),
      document: {getElementById: () => node}
    };
    vm.createContext(context);
    vm.runInContext(extract(world, 'async function vn(', 'async function k2('), context);
    const first = context.vn('chess'); node = null; waiting.shift()('closed response'); await first;
    assert.equal(node, null, 'a dismissed menu must not reopen'); assert.equal(opened, 1);
    const old = context.vn('chess'), recent = context.vn('janggi'), current = node;
    waiting[1]('new response'); await recent; waiting[0]('old response'); await old;
    assert.equal(node, current); assert.equal(node.innerHTML, 'new response'); waiting.length = 0;
    const signedOut = context.vn('chess'); context.D.user = null;
    waiting.shift()('previous account response'); await signedOut;
    assert.notEqual(node.innerHTML, 'previous account response');
  });
  await test('board availability retries errors/rejections and caches success', async () => {
    for (const [name, key, column] of [['Xs', 'boardReady', 'id'], ['xh', 'billiardsReady', 'turn'], ['jgOnlineReady', 'janggiLayoutReady', 'janggi_layout']]) {
      for (const reject of [false, true]) {
        let calls = 0;
        const context = {D: {online: true}, Xs: async () => true, S: {from: () => ({select: selected => {
          assert.equal(selected, column);
          return {limit: async () => { calls++; if (calls === 1) { if (reject) throw Error('offline'); return {error: {message: 'Failed to fetch'}}; } return {error: null}; }};
        }})}};
        vm.createContext(context);
        const start = world.indexOf('async function ' + name + '(');
        const end = world.indexOf(name === 'xh' ? 'var Wa=' : 'async function ', start + 15);
        vm.runInContext(world.slice(start, end), context);
        if (reject) await assert.rejects(context[name](), /offline/); else assert.equal(await context[name](), false);
        assert.equal(await context[name](), true); assert.equal(await context[name](), true);
        assert.equal(calls, 2); assert.equal(context.D[key], true);
      }
    }
  });
  await test('invitation routing awaits Marble assets and respects cancellation', async () => {
    let installed, resolve, reject, opened = 0;
    const context = {D: {online: true, user: {id: 'a'}}, S: {}, Fh() {}, ke() {}, M() {}, El() {}, Al: () => {opened++;},
      window: {OjjudaFriendInvites: {install: options => {installed = options;}},
        OjjudaGameAssets: {load: () => new Promise((yes, no) => {resolve = yes; reject = no;})}}};
    vm.createContext(context);
    vm.runInContext(extract(world, 'function installWorldFriendInvites()', 'async function Q0('), context);
    context.installWorldFriendInvites();
    const first = installed.onJoin({kind: 'marble', code: 'ABCDEF12'});
    assert.equal(opened, 0); reject(Error('offline')); await assert.rejects(first, /offline/);
    const controller = new AbortController();
    const cancelled = installed.onJoin({kind: 'marble', code: 'ABCDEF12'}, {signal: controller.signal});
    controller.abort(); resolve(); await cancelled; assert.equal(opened, 0);
    const retry = installed.onJoin({kind: 'marble', code: 'ABCDEF12'});
    resolve(); await retry; assert.equal(opened, 1);
    const switched = installed.onJoin({kind: 'marble', code: 'ABCDEF12'});
    context.D.user = {id: 'b'}; resolve(); await switched; assert.equal(opened, 1);
    context.D.user = {id: 'a'};
    let ttangOpened = 0;
    context.window.OjjudaTtangBridge = {close() {}, open() {ttangOpened++;}};
    const ttangAbort = new AbortController();
    const ttang = installed.onJoin({kind: 'ttang', code: 'abc'}, {signal: ttangAbort.signal});
    ttangAbort.abort(); resolve(); await ttang; assert.equal(ttangOpened, 0);
    let matgoClosed = 0, finish;
    context.window.closeMatgo = () => {matgoClosed++;};
    context.window.openMatgo = () => new Promise(done => {finish = done;});
    const matgoAbort = new AbortController();
    const matgo = installed.onJoin({kind: 'matgo', code: 'ABCDEF12'}, {signal: matgoAbort.signal});
    assert.equal(matgoClosed, 1); matgoAbort.abort(); assert.equal(matgoClosed, 2);
    finish(); await matgo;

  });
  process.exitCode = failures ? 1 : 0;
})();
