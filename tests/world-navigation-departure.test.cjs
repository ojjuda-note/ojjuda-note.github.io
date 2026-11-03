const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../world-navigation.js'), 'utf8');

function fixture() {
  let overlay = false, mutations, backCalls = 0, closeCalls = 0;
  const events = new Map();
  const window = {
    addEventListener(type, callback) {
      if (!events.has(type)) events.set(type, []);
      events.get(type).push(callback);
    }
  };
  window.top = {};
  const history = {
    state: null,
    replaceState(state) { this.state = state; },
    pushState(state) { this.state = state; },
    back() { backCalls++; }
  };
  const document = { body: {}, addEventListener() {}, defaultView: window };
  vm.runInNewContext(source, {
    window, document, history, location: { href: 'https://world.test/world.html' },
    MutationObserver: class {
      constructor(callback) { mutations = callback; }
      observe() {}
    }
  });
  const navigation = window.OjjudaWorldNavigation.install({
    isMain: () => true, hasOverlay: () => overlay,
    closeOverlay() { closeCalls++; overlay = false; return true; },
    canLeave: () => true, toMain() {}, tabs: ['arcade'], currentTab: () => 'arcade'
  });
  navigation.sync();
  return {
    history, navigation,
    show() { overlay = true; mutations(); },
    remove() { overlay = false; mutations(); },
    emit(type) { for (const callback of events.get(type) || []) callback(); },
    get backCalls() { return backCalls; },
    get closeCalls() { return closeCalls; }
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
