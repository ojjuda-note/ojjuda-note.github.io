const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app/world/world-navigation.js'), 'utf8');

function fixture({tab='hub', gameUrl=null}={}) {
  let overlay = false, gaming = false, mutations, backCalls = 0, closeCalls = 0, mainCalls = 0;
  const events = new Map();
  const window = {
    addEventListener(type, callback) {
      if (!events.has(type)) events.set(type, []);
      events.get(type).push(callback);
    }
  };
  window.top = {};
  const history = {
    state: null, replacements: [],
    replaceState(state, title, url) { this.state = state; if (url) this.replacements.push(url); },
    pushState(state, title, url) { this.state = state; this.menuUrl = url; },
    back() { backCalls++; }
  };
  const document = { body: {classList:{contains(name) {return name==='gaming'&&gaming;}}}, addEventListener() {}, defaultView: window };
  vm.runInNewContext(source, {
    window, document, history, location: { href: 'https://world.test/world.html'+(gameUrl?'?game='+gameUrl:'') },
    MutationObserver: class {
      constructor(callback) { mutations = callback; }
      observe() {}
    }
  });
  const navigation = window.OjjudaWorldNavigation.install({
    isMain: () => tab==='hub', hasOverlay: () => overlay,
    isSectionRoot: () => ['park','my'].includes(tab),
    arcadeReturnUrl: () => gameUrl && 'https://world.test/world.html?tab=hub',
    gameCloseUrl: () => gameUrl && 'https://world.test/world.html?tab=arcade',
    closeOverlay() { closeCalls++; const wasOpen=overlay; overlay=false; return wasOpen; },
    canLeave: () => true, toMain() { mainCalls++; tab='hub'; },
    tabs: ['hub','arcade','park','my'], currentTab: () => tab
  });
  navigation.sync();
  return {
    history, navigation,
    show() { overlay = true; mutations(); },
    remove() { overlay = false; mutations(); },
    showGame() { overlay = true; gaming = true; mutations(); },
    closeGame() { overlay = false; gaming = false; mutations(); },
    emit(type) { for (const callback of events.get(type) || []) callback(); },
    get backCalls() { return backCalls; },
    get closeCalls() { return closeCalls; },
    get mainCalls() { return mainCalls; },
    get tab() { return tab; }
  };
}

test('closing a game normally still consumes its menu history entry', () => {
  const f = fixture();
  f.show(); assert.equal(f.history.state.ojjudaWorld, 'menu');
  f.remove(); assert.equal(f.backCalls, 1);
});

test('pagehide game cleanup cannot replace an in-progress login navigation with Back', () => {
  const f = fixture();
  f.show();
  f.emit('pagehide');
  f.remove();
  f.navigation.sync();
  f.emit('popstate');
  assert.equal(f.backCalls, 0, 'teardown does not navigate the old document');
  assert.equal(f.closeCalls, 0, 'a departing document does not handle Back');
});

test('a restored page handles ordinary game closing again', () => {
  const f = fixture();
  f.show(); f.emit('pagehide'); f.remove();
  f.emit('pageshow'); f.show(); f.remove();
  assert.equal(f.backCalls, 1, 'pageshow restores navigation after BFCache');
});

test('departure during an unfinished return cannot leave restored navigation stuck', () => {
  const f = fixture();
  f.show(); f.remove();
  assert.equal(f.backCalls, 1);
  f.emit('pagehide'); f.emit('popstate'); f.emit('pageshow');
  f.show(); f.remove();
  assert.equal(f.backCalls, 2, 'a later game can close after an interrupted return');
});

test('closing an arcade game with its own exit button stays in the arcade', () => {
  const f = fixture({tab:'arcade'});
  f.showGame(); f.closeGame();
  assert.equal(f.tab,'arcade');
  assert.equal(f.mainCalls,0);
  assert.equal(f.history.state.ojjudaWorld,'menu');
});

test('Back from the arcade menu itself returns to the Agit hub', () => {
  const f=fixture({tab:'arcade'});
  f.emit('popstate');
  assert.equal(f.tab,'hub');
  assert.equal(f.mainCalls,1);
});

test('park and settings Back stay in their own main sections', () => {
  for (const tab of ['park','my']) {
    const f = fixture({tab});
    f.emit('popstate');
    assert.equal(f.tab,tab);
    assert.equal(f.mainCalls,0);
    assert.equal(f.history.state.ojjudaWorld,'menu');
  }
});

test('a direct game link creates a hub return history entry', () => {
  const f = fixture({tab:'arcade',gameUrl:'mines'});
  assert.equal(f.history.replacements.at(-1),'https://world.test/world.html?tab=hub');
  f.showGame();f.closeGame();
  assert.equal(f.history.replacements.at(-1),'https://world.test/world.html?tab=arcade');
  assert.equal(f.tab,'arcade');
});
