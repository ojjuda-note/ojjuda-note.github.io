const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {JSDOM} = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../matgo-bridge.js'), 'utf8');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
function fixture(check) {
  const dom = new JSDOM('<div id="toast"></div><button id="entry">맞고</button>', {url:'https://fixture.test/world.html', runScripts:'outside-only'});
  const w = dom.window;
  w.matchMedia = () => ({matches:false});
  w.OjjudaMatgoAccess = {check, subscribe:() => () => {}};
  w.eval(source);
  return {w, overlay:() => w.document.querySelector('#matgo-overlay'), close() { w.closeMatgo(); w.close(); }};
}

test('invitation launch propagates access failure while regular entry retains its toast', async () => {
  const problem = Error('temporary access failure');
  const f = fixture(async () => { throw problem; });
  try {
    await assert.rejects(f.w.openMatgo({inviteCode:'A1B2C3D4', propagateError:true}), error => error === problem);
    assert.equal(f.overlay(), null);
    assert.equal(f.w.document.querySelector('#toast').textContent, '');
    assert.equal(await f.w.openMatgo(), false);
    assert.equal(f.w.document.querySelector('#toast').textContent, problem.message);
    f.w.OjjudaMatgoAccess.check = async () => {};
    assert.equal(await f.w.openMatgo({inviteCode:'A1B2C3D4', propagateError:true}), true);
    assert.equal(new URL(f.overlay().querySelector('iframe').src).searchParams.get('friend_code'), 'A1B2C3D4');
  } finally { f.close(); }
});

for (const reject of [false, true]) {
  test('cancelled access check cannot reopen or close a newer game after late ' + (reject ? 'failure' : 'success'), async () => {
    const old = deferred(), fresh = deferred(); let checks = 0;
    const f = fixture(() => ++checks === 1 ? old.promise : fresh.promise);
    try {
      const controller = new f.w.AbortController();
      const first = f.w.openMatgo({signal:controller.signal, propagateError:true});
      controller.abort();
      const second = f.w.openMatgo({inviteCode:'B2C3D4E5', propagateError:true});
      assert.equal(checks, 2, 'cancellation immediately releases the opening guard');
      fresh.resolve(); assert.equal(await second, true);
      const overlay = f.overlay();
      if (reject) old.reject(Error('late failure')); else old.resolve();
      assert.equal(await first, false);
      assert.equal(f.overlay(), overlay, 'old completion must not disturb current game');
      assert.equal(f.w.document.querySelector('#toast').textContent, '');
    } finally { f.close(); }
  });
}

test('closing a pending regular entry permits reopening without waiting for its check', async () => {
  const old = deferred(); let checks = 0;
  const f = fixture(() => ++checks === 1 ? old.promise : Promise.resolve());
  try {
    const first = f.w.openMatgo();
    f.w.closeMatgo();
    assert.equal(await f.w.openMatgo(), true);
    const overlay = f.overlay();
    old.resolve(); assert.equal(await first, false);
    assert.equal(f.overlay(), overlay);
  } finally { f.close(); }
});
