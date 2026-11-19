const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'world.html'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'app/world/world-navigation.js'), 'utf8');
const rewardNavigation = fs.readFileSync(path.join(root, 'admin/back-navigation.js'), 'utf8');
const serviceScope = fs.readFileSync(path.join(root, 'admin/service-scope.js'), 'utf8');
const registryStart = html.indexOf('adminAreas=['), registryEnd = html.indexOf(',Ku=',registryStart);
assert.ok(registryStart !== -1 && registryEnd > registryStart);
const registryCode = 'var '+html.slice(registryStart,registryEnd)+';';
const start = html.indexOf('function adminIsHome()');
const end = html.indexOf('document.addEventListener("DOMContentLoaded",mountAdminModule', start);
assert.ok(start !== -1 && end > start, 'extract the real admin Back functions');
const adminBackCode = html.slice(start, end);

function createFixture({service='agit',tab='messages'}={}) {
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
  const L = {area:'content', tab};
  let canLeave = true, renders = 0;
  const sr = {tab({tab}) { g.tab = tab; }};
  const context = vm.createContext({
    window, document, history, g, L, sr, worldAdminService:service,
    location:{href:'https://world.test/world.html',pathname:'/world.html'},
    MutationObserver: class { observe() {} },
    adminCanLeave:() => canLeave,
    syncAdminContentFilters() {},
    H() { renders++; context.worldNavigation.sync(); }
  });
  vm.runInContext(serviceScope, context);
  vm.runInContext(registryCode, context);
  vm.runInContext(adminBackCode, context);
  vm.runInContext(navigation, context);
  context.worldNavigation = window.OjjudaWorldNavigation.install({
    isMain:() => g.tab === 'hub',
    hasOverlay:() => false,
    closeOverlay:() => false,
    handleBack:() => g.tab === 'admin' && context.adminBack(),
    canLeave:() => true,
    toMain:() => { g.tab = 'hub'; },
    tabs:['hub','arcade','admin'], currentTab:() => g.tab
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

test('browser Back goes from an Agit section to its overview and stays in admin mode', () => {
  const f = createFixture();
  assert.equal(f.history.state.ojjudaWorld, 'menu');
  f.back();
  assert.deepEqual([f.g.tab,f.L.area,f.L.tab],['admin','account','overview']);
  assert.equal(f.history.state.ojjudaWorld, 'menu', 'keep a Back entry for the administrator dashboard');
  f.back();
  assert.deepEqual([f.g.tab,f.L.area,f.L.tab],['admin','account','overview']);
  assert.equal(f.history.state.ojjudaWorld, 'menu');
});

test('unsaved administrator work blocks Back without skipping its menu', () => {
  const f = createFixture();
  f.canLeave(false);f.back();
  assert.deepEqual([f.g.tab,f.L.area,f.L.tab],['admin','content','messages']);
  assert.equal(f.history.state.ojjudaWorld, 'menu');
  f.canLeave(true);f.back();
  assert.deepEqual([f.g.tab,f.L.area,f.L.tab],['admin','account','overview']);
});

test('the visible Back button returns to admin overview without leaving admin mode', () => {
  const f = createFixture();
  f.button();assert.deepEqual([f.L.area,f.L.tab],['account','overview']);
  f.button();assert.equal(f.g.tab,'admin');
  assert.ok(f.renders >= 1);
});

for(const [service,tab,home] of [['park','risk','cards'],['pajang','pajang-chats','pajang-answers']]){
  test(`${service} browser and visible Back stay inside that service's administrator mode`,()=>{
    for(const action of ['back','button']){
      const f=createFixture({service,tab});
      f.canLeave(false);f[action]();
      assert.deepEqual([f.g.tab,f.L.area,f.L.tab],['admin','content',tab]);
      f.canLeave(true);f[action]();
      assert.deepEqual([f.g.tab,f.L.area,f.L.tab],['admin','content',home]);
      f[action]();
      assert.deepEqual([f.g.tab,f.L.area,f.L.tab],['admin','content',home]);
      assert.equal(f.history.state.ojjudaWorld,'menu');
    }
  });
}

test('reward-registration buttons and browser Back retain the current administrator service', () => {
  for(const service of ['','park','pajang']){
    const listeners = new Map(), replacements = [];
    const history = {state:null,pushes:0,pushState(state) {this.state=state;this.pushes++;}};
    const location = {href:'https://world.test/admin/rewards.html'+(service?'?from='+service:''),replace(url) {replacements.push(url);}};
    const window = {addEventListener(name,fn) {listeners.set(name,fn);}};
    const link={href:'/world.html?admin=overview'};
    const document={querySelectorAll(selector){assert.equal(selector,'a[href="/world.html?admin=overview"]');return [link];}};
    vm.runInNewContext(rewardNavigation,{history,location,window,document,URL,console});
    const destination='/world.html?admin=overview'+(service?'&from='+service:'');
    assert.equal(history.pushes,1);assert.equal(link.href,destination);
    listeners.get('popstate')();
    assert.deepEqual(replacements,[destination]);
  }
  assert.match(fs.readFileSync(path.join(root,'admin/rewards.html'),'utf8'),/href="\/world\.html\?admin=overview"/);
});
