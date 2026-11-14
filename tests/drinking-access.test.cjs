'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {JSDOM, VirtualConsole} = require('jsdom');

const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const accessSource = source('games/drinking/access.js');
const memberSource = source('games/matgo/matgo-access.js');
const connectionSource = source('games/drinking/connection.js');
const turn = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };

async function harness({hold = []} = {}) {
  const virtualConsole = new VirtualConsole();
  let reloads = 0;
  virtualConsole.on('jsdomError', error => {
    if (/navigation/.test(error.message)) reloads++;
    else throw error;
  });
  const dom = new JSDOM(`<!doctype html><title>오쭈다</title>
    <section id="access-screen" data-state="pending"><p id="access-message"></p>
      <a id="access-login" hidden></a><button id="access-retry" hidden>다시 확인</button></section>
    <div id="access-content" hidden></div>
    <template id="access-page" data-title="술게임 테스트">
      <input id="draft" value=""><span data-module="/connection.js"></span><span data-module="/game.js"></span>
    </template>`, {url: 'https://fixture.invalid/games/drinking/', runScripts: 'outside-only', virtualConsole});
  const w = dom.window, document = w.document;
  const state = {id: 'member-a', age: 25, locked: true, online: true, hidden: false, authFailure: false, identityFailure: false};
  const timers = new Map(), authListeners = [], scripts = new Map(), counts = new Map();
  const held = new Set(hold);
  let nextTimer = 0, authCalls = 0, identityCalls = 0, pauses = 0, resumes = 0;
  Object.defineProperty(w.navigator, 'onLine', {get: () => state.online});
  Object.defineProperty(document, 'hidden', {get: () => state.hidden});
  Object.defineProperty(document, 'visibilityState', {get: () => state.hidden ? 'hidden' : 'visible'});
  w.setTimeout = (fn, delay = 0) => { const id = ++nextTimer; timers.set(id, {fn, delay}); return id; };
  w.clearTimeout = id => timers.delete(id);
  const user = () => ({id: state.id, is_anonymous: false});
  const service = {
    auth: {
      onAuthStateChange(fn) { authListeners.push(fn); return {data: {subscription: {unsubscribe() {}}}}; },
      async getUser() {
        authCalls++;
        return state.authFailure ? {data: {user: null}, error: {name: 'AuthRetryableFetchError', status: 503}} : {data: {user: user()}, error: null};
      }
    },
    async rpc(name) {
      assert.equal(name, 'get_my_member_identity');
      identityCalls++;
      return state.identityFailure ? {data: null, error: {message: 'temporarily unavailable'}} : {data: {locked: state.locked, age: state.age}, error: null};
    }
  };
  w.OjjudaGetClient = async () => service;
  const append = document.head.append.bind(document.head);
  function complete(module) {
    const script = scripts.get(module);
    assert.ok(script, 'Expected pending module ' + module);
    scripts.delete(module);
    counts.set(module, (counts.get(module) || 0) + 1);
    if (module === '/connection.js') w.eval(connectionSource);
    else if (module === '/game.js') {
      w.reviewConnection = w.OjjudaRoomConnection.create({onPause() {pauses++;}, onResume() {resumes++;}});
    }
    script.onload?.(new w.Event('load'));
  }
  document.head.append = (...nodes) => {
    append(...nodes);
    for (const node of nodes) {
      if (node.tagName !== 'SCRIPT') continue;
      const module = new URL(node.src).pathname;
      scripts.set(module, node);
      if (!held.has(module)) queueMicrotask(() => complete(module));
    }
  };
  async function tick(delay) {
    const pending = [...timers].filter(([, timer]) => timer.delay === delay);
    for (const [id, timer] of pending) { if (timers.delete(id)) timer.fn(); }
    await turn();
  }
  function auth(event, id) {
    state.id = id;
    for (const listener of [...authListeners]) listener(event, id ? {user: user()} : null);
  }
  const hidden = value => { state.hidden = value; document.dispatchEvent(new w.Event('visibilitychange')); };
  const online = value => { state.online = value; w.dispatchEvent(new w.Event(value ? 'online' : 'offline')); };
  const page = (event, persisted) => w.dispatchEvent(new w.PageTransitionEvent(event, {persisted}));
  w.eval(memberSource);
  w.eval(accessSource);
  await turn();
  await tick(0);
  return {
    w, document, state, timers, counts, scripts, complete, tick, auth, hidden, online, page,
    get authCalls() { return authCalls; }, get identityCalls() { return identityCalls; },
    get reloads() { return reloads; }, get pauses() { return pauses; }, get resumes() { return resumes; },
    get content() { return document.getElementById('access-content'); },
    get gate() { return document.getElementById('access-screen'); },
    close() { timers.clear(); dom.window.close(); }
  };
}

test('server-verified age gate preserves same-member drafts through transient failures', async t => {
  const f = await harness(); t.after(() => f.close());
  assert.equal(f.content.hidden, false);
  assert.equal(f.w.OjjudaDrinkingAccessReady, true);
  assert.equal(f.identityCalls, 1);
  const draft = f.document.getElementById('draft');
  draft.value = '작성하던 답변';
  f.state.identityFailure = true;
  await f.tick(55000);
  assert.equal(f.content.hidden, true);
  assert.equal(f.gate.dataset.state, 'unavailable');
  assert.equal(f.w.reviewConnection.active(), false);
  assert.equal(f.reloads, 0);
  assert.equal(f.document.getElementById('draft'), draft);
  f.state.identityFailure = false;
  await f.tick(1500);
  await f.tick(0);
  assert.equal(f.content.hidden, false);
  assert.equal(f.w.reviewConnection.active(), true);
  assert.equal(draft.value, '작성하던 답변');
  assert.equal(f.counts.get('/game.js'), 1);
  assert.equal(f.reloads, 0);
});

test('offline, hidden and BFCache return revalidate without replacing mounted input', async t => {
  const f = await harness(); t.after(() => f.close());
  const draft = f.document.getElementById('draft'); draft.value = '복귀할 답변';
  for (const [leave, resume] of [
    [() => f.online(false), () => f.online(true)],
    [() => f.hidden(true), () => f.hidden(false)],
    [() => f.page('pagehide', true), () => f.page('pageshow', true)]
  ]) {
    const previousChecks = f.identityCalls;
    leave(); await turn();
    assert.equal(f.content.hidden, true);
    assert.equal(f.w.reviewConnection.active(), false);
    resume(); await turn(); await f.tick(0);
    assert.ok(f.identityCalls > previousChecks, 'return is verified with the server');
    assert.equal(f.content.hidden, false);
    assert.equal(f.w.reviewConnection.active(), true);
    assert.equal(f.document.getElementById('draft'), draft);
    assert.equal(draft.value, '복귀할 답변');
  }
  assert.equal(f.counts.get('/game.js'), 1);
  assert.equal(f.reloads, 0);
});

test('different account and server underage denial conceal content and block room requests', async t => {
  for (const cause of ['account', 'underage', 'unlocked']) {
    const f = await harness();
    try {
      f.document.getElementById('draft').value = '이전 회원의 답변';
      f.document.documentElement.setAttribute('data-ojjuda-adult', 'true');
      if (cause === 'account') f.auth('SIGNED_IN', 'member-b');
      else {
        if (cause === 'underage') f.state.age = 18;
        else f.state.locked = false;
        await f.tick(55000);
      }
      await turn(); await f.tick(0);
      assert.equal(f.content.hidden, true, cause);
      assert.equal(f.w.OjjudaDrinkingAccessReady, false, cause);
      assert.equal(f.w.reviewConnection.active(), false, cause);
      let requests = 0;
      await assert.rejects(f.w.reviewConnection.request(() => { requests++; return Promise.resolve({}); }), {code: 'superseded'});
      assert.equal(requests, 0);
      if (cause === 'account' || cause === 'underage') assert.ok(f.reloads > 0, 'old member runtime is discarded');
    } finally { f.close(); }
  }
});

test('hiding during initial module loading resumes each module exactly once', async t => {
  const f = await harness({hold: ['/connection.js']}); t.after(() => f.close());
  assert.equal(f.content.hidden, true);
  f.hidden(true);
  f.complete('/connection.js');
  await turn();
  assert.equal(f.counts.get('/game.js') || 0, 0);
  assert.equal(f.content.hidden, true);
  f.hidden(false); await turn(); await f.tick(0);
  assert.equal(f.content.hidden, false);
  assert.equal(f.counts.get('/connection.js'), 1);
  assert.equal(f.counts.get('/game.js'), 1);
  assert.equal(f.w.reviewConnection.active(), true);
});

test('an unavailable event during module loading cannot expose stale approved content', async t => {
  const f = await harness({hold: ['/game.js']}); t.after(() => f.close());
  assert.equal(f.content.hidden, true);
  f.state.identityFailure = true;
  await assert.rejects(f.w.OjjudaMatgoAccess.check(), {code: 'unavailable'});
  assert.equal(f.w.OjjudaDrinkingAccessReady, false);
  f.complete('/game.js');
  await turn();
  assert.equal(f.content.hidden, true, 'a completed old loader must not override a new denial');
  assert.equal(f.gate.hidden, false);
  assert.equal(f.w.reviewConnection.active(), false);
  f.state.identityFailure = false;
  await f.tick(1500); await f.tick(0);
  assert.equal(f.content.hidden, false);
  assert.equal(f.w.reviewConnection.active(), true);
  assert.equal(f.counts.get('/game.js'), 1);
});

test('a module timeout while hidden cannot append a duplicate module on return', async t => {
  const f = await harness({hold: ['/game.js']}); t.after(() => f.close());
  const initialNode = f.scripts.get('/game.js');
  assert.ok(initialNode);
  f.hidden(true);
  await f.tick(15000);
  assert.equal(f.content.hidden, true);
  assert.equal(f.w.OjjudaDrinkingAccessReady, false);
  f.hidden(false); await turn(); await f.tick(0);
  const gameScripts = [...f.document.scripts].filter(script => new URL(script.src).pathname === '/game.js');
  assert.equal(gameScripts.length, 1, 'timed-out modules require a clean reload, not another script in the same page');
  // A transport can complete after the timeout. Even then the expired loader
  // must not expose the page or start a second copy of the game runtime.
  f.complete('/game.js'); await turn(); await f.tick(0);
  assert.equal(f.content.hidden, true);
  assert.equal(f.w.OjjudaDrinkingAccessReady, false);
  assert.equal(f.w.reviewConnection.active(), false);
  assert.equal(f.document.getElementById('access-retry').hidden, false);
  f.document.getElementById('access-retry').click();
  assert.ok(f.reloads > 0, 'retry starts with a clean document');
});
