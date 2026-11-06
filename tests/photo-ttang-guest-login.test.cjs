const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'photo-ttang.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'games/photo-ttang/photo-ttang-page.js'), 'utf8');
const gameHtml = fs.readFileSync(path.join(root, 'games/photo-ttang.html'), 'utf8');
const trialKey = 'ojjuda-photo-ttang-demo-v1';
const origin = 'https://fixture.test';
const flush = () => new Promise(resolve => setImmediate(resolve));

async function fixture(t, { user = null, adult = true } = {}) {
  const dom = new JSDOM(html, { url: origin + '/photo-ttang.html', runScripts: 'outside-only' });
  const w = dom.window, timers = new Map(), navigations = [];
  let now = 0, nextTimer = 0, authChange, heldIdentity = false, releaseIdentity;
  w.OJJUDA_CONFIG = { supabaseUrl: 'https://fixture.invalid', supabaseKey: 'fixture' };
  w.supabase = { createClient: () => ({ auth: {
    getUser: () => heldIdentity
      ? new Promise(resolve => { releaseIdentity = () => resolve({ data: { user } }); })
      : Promise.resolve({ data: { user } }),
    onAuthStateChange(fn) { authChange = fn; }
  } }) };
  w.OjjudaPhotoTtangAccess = {
    configure() {}, subscribe() {}, allowed: () => Boolean(user && !user.is_anonymous && adult),
    async refresh() { if (!adult) throw Object.assign(new Error(), { code: 'underage' }); return { userId: user?.id }; }
  };
  const context = {
    window: w, document: w.document, navigator: w.navigator, localStorage: w.localStorage, crypto: w.crypto,
    location: { origin, assign(url) { navigations.push(url); } },
    Date: class extends Date { static now() { return now; } },
    setTimeout(callback, delay = 0) { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval() {},
    addEventListener: w.addEventListener.bind(w)
  };
  vm.runInNewContext(source, context);
  await flush();
  t.after(() => w.close());
  function advance(ms) {
    now += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.at > now) continue;
      timers.delete(id); timer.callback();
    }
  }
  async function start({ begin = true } = {}) {
    w.document.getElementById('start-demo').click();
    const frame = w.document.querySelector('iframe');
    assert.ok(frame);
    frame.contentWindow.focus = () => {};
    const round = { frame, id: null, result: null };
    frame.contentWindow.OjjudaPhotoTtang = {
      canLeave: () => true,
      demoResult: () => round.result,
      demo(id) { round.id = id; return begin ? w.OjjudaPhotoTtangDemo.beginRound(id) : true; }
    };
    frame.dispatchEvent(new w.Event('load'));
    await flush();
    return round;
  }
  function finish(round, overrides = {}, event = {}) {
    w.dispatchEvent(new w.MessageEvent('message', {
      origin, source: round.frame.contentWindow,
      data: { source: 'ojjuda-photo-ttang-game', type: 'ojjuda:photottang:demo-finished', runId: round.id, outcome: 'win', ...overrides },
      ...event
    }));
  }
  return {
    w, start, finish, advance, navigations,
    auth(event, nextUser, hold = false) { user = nextUser; heldIdentity = hold; authChange(event, user ? { user } : null); },
    async release() { heldIdentity = false; releaseIdentity?.(); await flush(); },
    close() { w.document.getElementById('exit-game').click(); }
  };
}

for (const outcome of ['win', 'loss']) test(`a guest photo demo ${outcome} automatically opens login after the result delay`, async t => {
  const f = await fixture(t), round = await f.start();
  assert.equal(f.w.localStorage.getItem(trialKey), '1', 'the existing lifetime reservation is preserved');
  f.finish(round, { outcome });
  f.advance(1599); assert.deepEqual(f.navigations, []);
  f.advance(1); assert.deepEqual(f.navigations, ['/?auth=login&next=photo']);
  f.finish(round); f.advance(5000); assert.equal(f.navigations.length, 1);
});

test('duplicate completions and closing the completed photo cannot postpone login', async t => {
  const f = await fixture(t), round = await f.start();
  f.finish(round); f.advance(1000); f.finish(round); f.close();
  assert.equal(f.w.document.querySelector('iframe'), null);
  f.advance(600); assert.deepEqual(f.navigations, ['/?auth=login&next=photo']);
});

test('closing a completed photo during its reveal still schedules login', async t => {
  const f = await fixture(t), round = await f.start();
  round.result = { runId: round.id, outcome: 'win' };
  f.close(); f.advance(1600);
  assert.deepEqual(f.navigations, ['/?auth=login&next=photo']);
});

test('foreign, forged, unstarted and closed photo frames cannot request guest login', async t => {
  const f = await fixture(t), round = await f.start({ begin: false });
  f.finish(round); f.advance(2000); assert.deepEqual(f.navigations, []);
  assert.equal(f.w.OjjudaPhotoTtangDemo.beginRound('wrong-round'), false);
  assert.equal(f.w.OjjudaPhotoTtangDemo.beginRound(round.id), true);
  f.finish(round, {}, { origin: 'https://other.test' });
  f.finish(round, {}, { source: f.w });
  f.finish(round, { source: 'other-game' });
  f.finish(round, { runId: '00000000-0000-4000-8000-000000000001' });
  f.finish(round, { outcome: 'pending' });
  f.advance(2000); assert.deepEqual(f.navigations, []);
  const oldWindow = round.frame.contentWindow;
  f.close(); f.finish(round, {}, { source: oldWindow }); f.advance(2000);
  assert.deepEqual(f.navigations, [], 'an unfinished close consumes no completion event');
});

test('signing in during the result delay cancels login before async identity checking finishes', async t => {
  const f = await fixture(t), round = await f.start();
  f.finish(round);
  f.auth('SIGNED_IN', { id: 'member-one' }, true); f.advance(0); await flush();
  f.advance(2000); assert.deepEqual(f.navigations, []);
  await f.release(); f.advance(2000); assert.deepEqual(f.navigations, []);
  assert.equal(f.w.document.querySelector('iframe').dataset.demo, '0');
});

test('anonymous session refresh waits for identity confirmation without losing the completed guest login', async t => {
  const f = await fixture(t), round = await f.start();
  f.finish(round);
  f.auth('TOKEN_REFRESHED', { id: 'anonymous', is_anonymous: true }, true); f.advance(0); await flush();
  f.advance(2000); assert.deepEqual(f.navigations, [], 'identity verification blocks navigation');
  await f.release(); f.advance(0);
  assert.deepEqual(f.navigations, ['/?auth=login&next=photo']);
});

test('a signed-in public demo and a full member game never trigger guest login', async t => {
  const minor = await fixture(t, { user: { id: 'minor' }, adult: false }), trial = await minor.start();
  minor.finish(trial); minor.advance(3000); assert.deepEqual(minor.navigations, []);
  const member = await fixture(t, { user: { id: 'adult' } }), full = member.w.document.querySelector('iframe');
  member.finish({ frame: full, id: '00000000-0000-4000-8000-000000000001' });
  member.advance(3000); assert.deepEqual(member.navigations, []);
  assert.equal(member.w.localStorage.getItem(trialKey), null);
});

test('a guest frame from before an account change cannot consume the new guest identity', async t => {
  const f = await fixture(t, { adult: false }), round = await f.start();
  f.auth('SIGNED_IN', { id: 'minor' }); f.advance(0); await flush();
  f.auth('SIGNED_OUT', null); f.finish(round); f.advance(3000);
  assert.deepEqual(f.navigations, []);
});

function childFixture(t) {
  const dom = new JSDOM(gameHtml, { url: origin + '/games/photo-ttang.html?demo=1', runScripts: 'outside-only' });
  const w = dom.window, timers = new Map(), messages = [];
  const runId = '00000000-0000-4000-8000-000000000001', noop = () => {};
  let nextTimer = 0, begun = false;
  Object.defineProperty(w, 'parent', { value: {
    OjjudaPhotoTtangDemo: { allowed: () => true, beginRound(id) { if (begun || id !== runId) return false; begun = true; return true; } },
    postMessage(message, target) { messages.push({ message, target }); }
  } });
  w.requestAnimationFrame = noop;
  w.setTimeout = (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; };
  w.clearTimeout = id => timers.delete(id);
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({ createImageData: (x, y) => ({ data: new Uint8ClampedArray(x * y * 4) }), measureText: () => ({ width: 10 }) }, { get: (object, key) => object[key] || noop });
  require('./game-results-fixture.cjs')(w);
  w.eval(fs.readFileSync(path.join(root, 'assets/photo-ttang/men-stages-v2.js'), 'utf8'));
  for (const match of gameHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(match[1], dom.getInternalVMContext());
  w.eval('sound=false;');
  t.after(() => w.close());
  return { w, messages, runId, tick(ms) { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); } } };
}

for (const outcome of ['win', 'timeout', 'death']) test(`the actual photo demo ${outcome} reports its begun round once`, t => {
  const f = childFixture(t), { w } = f;
  assert.equal(w.OjjudaPhotoTtang.demo('forged'), false);
  assert.equal(w.OjjudaPhotoTtang.demo(f.runId), true);
  assert.equal(w.OjjudaPhotoTtang.demoResult(), null);
  if (outcome === 'win') w.eval('mySil=silTotal*GOAL;win();');
  else if (outcome === 'timeout') w.timeUp();
  else w.eval("lives=1;world.events=[{t:'death',p:me,why:'mob'}];handleEvents();");
  const result = w.OjjudaPhotoTtang.demoResult();
  assert.equal(result.runId, f.runId, 'the parent can read a completed round before its delayed result popup');
  assert.equal(result.outcome, outcome === 'win' ? 'win' : 'loss');
  f.tick(outcome === 'win' ? 3000 : outcome === 'timeout' ? 500 : 800);
  w.endDemo();
  const completions = f.messages.filter(({ message }) => message.type === 'ojjuda:photottang:demo-finished');
  assert.equal(completions.length, 1);
  assert.equal(completions[0].message.runId, f.runId);
  assert.equal(completions[0].message.outcome, outcome === 'win' ? 'win' : 'loss');
  assert.equal(completions[0].target, origin);
});
