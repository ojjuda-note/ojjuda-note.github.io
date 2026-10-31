const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const world = fs.readFileSync(path.join(__dirname, '../world.html'), 'utf8');
const start = world.indexOf('function installWorldFriendInvites()');
const end = world.indexOf('async function Q0()', start);
assert.ok(start >= 0 && end > start, 'World invitation router is present');
const router = world.slice(start, end);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
function fixture() {
  let installed;
  const calls = [], pending = deferred();
  const context = {D:{online:true, user:{id:'me'}}, S:{}, Fh() {}, ke() {}, M() {},
    Al:(game, options) => calls.push({game, options}), El:() => calls.push({close:true}),
    window:{
      OjjudaFriendInvites:{install(config) { installed = config; }},
      OjjudaGameAssets:{load:() => pending.promise},
      OjjudaTourGame:{open() {}}, OjjudaTankGame:{open() {}},
      OjjudaTtangBridge:{open:options => calls.push({game:'ttang', options}), close() {}},
      closeMatgo:() => calls.push({closeMatgo:true}),
      openMatgo:async options => { calls.push({game:'matgo', options}); return true; }
    }
  };
  vm.runInNewContext(router + '\ninstallWorldFriendInvites();', context);
  return {context, calls, pending, join:installed.onJoin};
}

for (const [kind, game] of [['marble', 'tour'], ['tank', 'tank'], ['ttang', 'ttang']]) {
  test(kind + ' invitation waits for its assets and preserves the join code', async () => {
    const f = fixture();
    const loading = f.join({kind, code:'A1B2C3D4'});
    assert.equal(f.calls.length, 0, 'no game opens before asset loading completes');
    f.pending.resolve(); await loading;
    const launched = f.calls.find(call => call.game === game);
    assert.ok(launched);
    assert.equal(launched.options.joinCode, 'A1B2C3D4');
  });
  test(kind + ' cancellation prevents a late game opening', async () => {
    const f = fixture(), controller = new AbortController();
    const loading = f.join({kind, code:'A1B2C3D4'}, {signal:controller.signal});
    controller.abort(); f.pending.resolve(); await loading;
    assert.equal(f.calls.length, 0);
  });
  test(kind + ' asset failure reaches invitation retry handling', async () => {
    const f = fixture(), problem = Error('game_asset_unavailable');
    const loading = f.join({kind, code:'A1B2C3D4'});
    f.pending.reject(problem);
    await assert.rejects(loading, error => error === problem);
    assert.equal(f.calls.length, 0);
  });
  test(kind + ' does not open for an account that changed during loading', async () => {
    const f = fixture();
    const loading = f.join({kind, code:'A1B2C3D4'});
    f.context.D.user = {id:'someone-else'}; f.pending.resolve(); await loading;
    assert.equal(f.calls.length, 0);
  });
}

test('Matgo invitation forwards cancellation and requests propagated failures', async () => {
  const f = fixture(), controller = new AbortController();
  await f.join({kind:'matgo', code:'A1B2C3D4'}, {signal:controller.signal});
  const launch = f.calls.find(call => call.game === 'matgo');
  assert.equal(launch.options.inviteCode, 'A1B2C3D4');
  assert.equal(launch.options.signal, controller.signal);
  assert.equal(launch.options.propagateError, true);
  const problem = Error('identity service unavailable');
  f.context.window.openMatgo = async () => { throw problem; };
  await assert.rejects(f.join({kind:'matgo', code:'A1B2C3D4'}), error => error === problem);
  f.context.window.openMatgo = async () => false;
  await assert.rejects(f.join({kind:'matgo', code:'A1B2C3D4'}), /game_asset_unavailable/);
});
