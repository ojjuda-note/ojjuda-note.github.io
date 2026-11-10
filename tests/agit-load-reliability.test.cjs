const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('Agit always paints an accessible loading screen before its main module starts', () => {
  const world = read('world.html');
  const firstModule = world.slice(0, world.indexOf('<script type="module">'));
  assert.match(firstModule, /id="app"><main class="world-boot-screen" role="status" aria-live="polite" aria-busy="true"/);
  assert.match(firstModule, /오쭈다 아지트/);
  assert.match(firstModule, /class="world-boot-spinner"/);
  assert.match(firstModule, /class="world-boot-retry" href=""/);
  assert.match(firstModule, /prefers-reduced-motion:reduce/);
  assert.match(world, /function yc\(t="불러오는 중이에요"\)[^]*?class="world-boot-spinner"/);
});

test('a slow cloud save shows an Agit leaving indicator, then clears it on navigation', async () => {
  const world = read('world.html');
  const start = world.indexOf('function navigateAgitPage(');
  const end = world.indexOf('function agitMissionStillCurrent(', start);
  assert.ok(start >= 0 && end > start);
  let triggerTimer, cleared = false, overlay, removed = false, resolveSave;
  const destinations = [];
  const document = {
    body: {appendChild(node) { overlay = node; }},
    getElementById() { return null; },
    createElement() { return {setAttribute() {}, remove() {removed = true;}}; }
  };
  const context = {
    document, location: {assign(url) {destinations.push(url);}},
    setTimeout(callback) {triggerTimer = callback; return 5;},
    clearTimeout(id) {assert.equal(id, 5); cleared = true;},
    Promise
  };
  vm.runInNewContext(world.slice(start, end), context);
  const pending = new Promise(resolve => {resolveSave = resolve;});
  context.navigateAgitPage('/groups/', pending);
  assert.equal(destinations.length, 0, 'waits for the pending save');
  assert.equal(overlay, undefined, 'does not flash a loader on instant transitions');
  triggerTimer();
  assert.equal(overlay.id, 'agit-navigation-loading');
  assert.match(overlay.innerHTML, /기록을 저장하고 이동하고 있어요/);
  resolveSave();
  await pending;
  await Promise.resolve();
  assert.deepEqual(destinations, ['/groups/']);
  assert.equal(cleared, true);
  assert.equal(removed, true);
});

test('Agit admin preview reuses the World auth client without a second GoTrue instance', async () => {
  const world = read('world.html');
  assert.match(world, /OjjudaMatgoAccess\?\.configure\(S\);window\.OjjudaAdminPreview\?\.configure\(S\)/);
  const listeners = {};
  let created = 0;
  const client = {auth: {
    onAuthStateChange() { return {data:{subscription:{unsubscribe() {}}}}; },
    getSession() {return Promise.resolve({data:{session:null}});}
  }};
  const context = {
    document: {readyState:'loading',addEventListener(name, fn) {listeners[name] = fn;}},
    window: {
      OJJUDA_CONFIG: {supabaseUrl:'https://fixture.example', supabaseKey:'public-anon-key'},
      supabase: {createClient() {created++; return client;}},
      addEventListener() {}, dispatchEvent() {}
    },
    localStorage: {getItem() {return null;}},
    CustomEvent: class {constructor(type, options) {this.type = type;this.detail = options.detail;}},
    setTimeout() {}
  };
  vm.runInNewContext(read('shared/games/admin-preview.js'), context);
  assert.equal(created, 0, 'the deferred loader must not create a second client during parsing');
  context.window.OjjudaAdminPreview.configure(client);
  listeners.DOMContentLoaded();
  await Promise.resolve();
  assert.equal(created, 0, 'shared client remains the only auth instance');
});

test('World reuses an already-started standalone auth client', async () => {
  const admin = read('shared/games/admin-preview.js'), world = read('world.html');
  const listeners = {};
  let creations = 0;
  const existing = {auth:{
    onAuthStateChange() {return {data:{subscription:{unsubscribe() {}}}};},
    getSession() {return Promise.resolve({data:{session:null}});}
  }};
  const sharedWindow = {
    OJJUDA_CONFIG:{supabaseUrl:'https://fixture.example',supabaseKey:'public-key'},
    supabase:{createClient() {creations++;return existing;}},
    addEventListener() {},dispatchEvent() {}
  };
  const context = {
    window:sharedWindow,
    document:{readyState:'loading',addEventListener(name, callback) {listeners[name]=callback;}},
    CustomEvent:class {constructor() {}},
    localStorage:{getItem() {return null;}},
    setTimeout() {}
  };
  vm.runInNewContext(admin,context);
  listeners.DOMContentLoaded();
  assert.equal(creations,1,'fallback creates one client only on a standalone page');
  assert.equal(sharedWindow.ojjudaSupabase,existing);
  const start=world.indexOf('function Oc('),end=world.indexOf('var Hc=',start);
  assert.ok(start>=0&&end>start);
  vm.runInNewContext(world.slice(start,end),context);
  assert.equal(context.Oc('https://fixture.example','public-key'),existing);
  assert.equal(creations,1,'World must never construct another auth client');
});

test('an early Matgo age check shares its auth client with World', () => {
  const world=read('world.html'),matgo=read('games/matgo/matgo-access.js');
  let creations=0;
  const instance={auth:{onAuthStateChange() {return {data:{subscription:{unsubscribe() {}}}};}}};
  const window={OJJUDA_CONFIG:{supabaseUrl:'https://fixture.example',supabaseKey:'public-key'},
    supabase:{createClient() {creations++;return instance;}}};
  window.parent=window;
  vm.runInNewContext(matgo,{window,setTimeout,clearTimeout,Set,Error});
  assert.equal(window.OjjudaMatgoAccess.getClient(),instance);
  assert.equal(window.ojjudaSupabase,instance);
  const start=world.indexOf('function Oc('),end=world.indexOf('var Hc=',start);
  assert.ok(start>=0&&end>start);
  const context={window};
  vm.runInNewContext(world.slice(start,end),context);
  assert.equal(context.Oc('https://fixture.example','public-key'),instance);
  assert.equal(creations,1,'age checks and World must use the same auth session');
});
