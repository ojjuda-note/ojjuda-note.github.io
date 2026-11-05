const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'world.html'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'world-navigation.js'), 'utf8');
const rewardNavigation = fs.readFileSync(path.join(root, 'admin/back-navigation.js'), 'utf8');
const start = html.indexOf('function adminIsHome()');
const end = html.indexOf('document.addEventListener("DOMContentLoaded",mountAdminModule', start);
assert.ok(start !== -1 && end > start, 'extract the real admin Back functions');
const adminBackCode = html.slice(start, end);

function createFixture() {
  const listeners = new Map();
  const window = {
    top: {},
    scrollTo() {},
    addEventListener(name, callback) { listeners.set(name, [...(listeners.get(name) || []), callback]); }
  };
  const document = {body:{}, defaultView:window, addEventListener() {}};
  const history = {
    state:null,
    pushState(value) { this.state = value; },
    replaceState(value) { this.state = value; },
    back() { this.backCalls = (this.backCalls || 0) + 1; }
  };
  const g = {tab:'admin'};
  const L = {area:'content', tab:'risk'};
  let canLeave = true, renders = 0;
  const sr = {tab({tab}) { g.tab = tab; }};
  const context = vm.createContext({
    window, document, history, g, L, sr,
    location:{href:'https://world.test/world.html',pathname:'/world.html'},
    MutationObserver: class { observe() {} },
    adminCanLeave:() => canLeave,
    syncAdminContentFilters() {},
    H() { renders++; context.worldNavigation.sync(); }
  });
  vm.runInContext(adminBackCode, context);
  vm.runInContext(navigation, context);
  context.worldNavigation = window.OjjudaWorldNavigation.install({
    isMain:() => g.tab === 'arcade',
    hasOverlay:() => false,
    closeOverlay:() => false,
    handleBack:() => g.tab === 'admin' && context.adminBack(),
    canLeave:() => true,
    toMain:() => { g.tab = 'arcade'; },
    tabs:['arcade','admin'], currentTab:() => g.tab
  });
  context.worldNavigation.sync();
  return {
    g,L,history,
    back:() => (listeners.get('popstate') || []).forEach(handler => handler()),
    button:() => context.adminBack(),
    canLeave(value) { canLeave = value; },
    get renders() { return renders; }
  };
}

test('browser Back goes directly from any administrator section to admin overview, then World', () => {
  const f = createFixture();
  assert.equal(f.history.state.ojjudaWorld, 'menu');
  f.back();
  assert.deepEqual([f.g.tab,f.L.area,f.L.tab],['admin','account','overview']);
  assert.equal(f.history.state.ojjudaWorld, 'menu', 'keep a Back entry for the administrator dashboard');
  f.back();
  assert.equal(f.g.tab, 'arcade');
  assert.equal(f.history.state.ojjudaWorld, 'main');
});

test('unsaved administrator work blocks Back without skipping its menu', () => {
  const f = createFixture();
  f.canLeave(false);f.back();
  assert.deepEqual([f.g.tab,f.L.area,f.L.tab],['admin','content','risk']);
  assert.equal(f.history.state.ojjudaWorld, 'menu');
  f.canLeave(true);f.back();
  assert.deepEqual([f.g.tab,f.L.area,f.L.tab],['admin','account','overview']);
});

test('the visible Back button uses the same two-stage navigation', () => {
  const f = createFixture();
  f.button();assert.deepEqual([f.L.area,f.L.tab],['account','overview']);
  f.button();assert.equal(f.g.tab,'arcade');
  assert.ok(f.renders >= 1);
});

test('the separate reward-registration page routes browser Back to admin overview', () => {
  const listeners = new Map(), replacements = [];
  const history = {state:null,pushes:0,pushState(state) {this.state=state;this.pushes++;}};
  const location = {href:'https://world.test/admin/rewards.html',replace(url) {replacements.push(url);}};
  const window = {addEventListener(name,fn) {listeners.set(name,fn);}};
  vm.runInNewContext(rewardNavigation,{history,location,window,console});
  assert.equal(history.pushes,1);
  listeners.get('popstate')();
  assert.deepEqual(replacements,['/world.html?admin=overview']);
  assert.match(fs.readFileSync(path.join(root,'admin/rewards.html'),'utf8'),/href="\/world\.html\?admin=overview"/);
});
