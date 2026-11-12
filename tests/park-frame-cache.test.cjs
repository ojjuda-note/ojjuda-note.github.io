const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {JSDOM} = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../park/world-park-notes.js'), 'utf8');

function fixture(search = '') {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    url: 'https://fixture.test/world.html'+search, runScripts: 'outside-only'
  });
  const {window} = dom;
  const timers = new Map();
  let nextTimer = 0, place = {id: 'park'}, owner = 'member-a', gestureAttach = 0, gestureDetach = 0;
  window.setTimeout = (fn, delay) => {const id = ++nextTimer;timers.set(id, {fn, delay});return id;};
  window.clearTimeout = id => timers.delete(id);
  window.eval(source);
  const app = window.OjjudaParkNotes.install({
    place: () => place,
    userId: () => owner,
    enter: () => {place = {id: 'park'};render('park');},
    onFrameReady: () => {gestureAttach++;return () => {gestureDetach++;};}
  });
  function markup(tab) {
    const main = tab === 'park' ? app.markup() : `<section data-view="${tab}">${tab}</section>`;
    return `<div class="shell"><aside class="side">${tab}</aside><div class="col"><header class="topbar">${tab}</header><main class="main">${main}</main></div></div><nav class="bottomnav">${tab}</nav>`;
  }
  function render(tab) {
    place = tab === 'park' ? {id: 'park'} : tab === 'arcade' ? {id: 'arcade'} : null;
    if (!app.preserveShell(markup(tab))) window.document.querySelector('#app').innerHTML = markup(tab);
    app.sync();
  }
  const frame = () => window.document.querySelector('[data-park-app] iframe');
  return {window, dom, app, render, frame, timers, setOwner: id => {owner = id;}, gestures: () => ({gestureAttach, gestureDetach})};
}

test('Park iframe survives a short visit to Arcade and returns without reloading', () => {
  const f = fixture();
  try {
    f.render('park');
    const first = f.frame();
    assert.ok(first?.isConnected);
    const calls = [];
    first.contentWindow.OjjudaParkFull = {returnHome() {calls.push('home'); return true;}, navigate(action) {calls.push(action);}};
    f.render('park');
    assert.deepEqual(calls, [], 'a repaint preserves the current card');
    f.render('arcade');
    assert.equal(f.frame(), first);
    assert.equal(first.closest('[data-park-app]').hidden, true);
    assert.equal(f.app.canLeave(), true, 'a hidden Park cannot block Arcade navigation');
    assert.equal(f.app.close(), false, 'a hidden Park cannot intercept Arcade Back');
    assert.equal(f.timers.size, 1, 'inactive frame has one retirement timer');
    f.render('park');
    assert.equal(f.frame(), first, 'the original browsing context remains connected');
    assert.equal(first.closest('[data-park-app]').hidden, false);
    assert.equal(f.timers.size, 0, 'returning cancels retirement');
    assert.equal(f.window.document.querySelector('.topbar').textContent, 'park');
    assert.deepEqual(calls, ['home']);
    f.render('my'); f.app.open('saved');
    assert.deepEqual(calls, ['home','home','saved'], 'an explicit shortcut still opens its target');
    f.window.dispatchEvent(new f.window.PageTransitionEvent('pageshow', {persisted:true}));
    assert.equal(calls.at(-1),'home','browser history restoration returns to the main feed');
  } finally {f.dom.window.close();}
});

test('Park cache is retired after inactivity and never reused for another account', () => {
  const f = fixture();
  try {
    f.render('park');
    const first = f.frame();
    f.render('my');
    const [{fn, delay}] = [...f.timers.values()];
    assert.equal(delay, 60_000);
    fn();
    assert.equal(first.isConnected, false, 'expired Park is removed to release memory');
    f.render('park');
    const second = f.frame();
    assert.notEqual(second, first);
    f.setOwner('member-b');
    f.render('park');
    assert.notEqual(f.frame(), second, 'account change destroys the previous account frame');
    assert.equal(second.isConnected, false);
  } finally {f.dom.window.close();}
});

test('leaving a shared card before startup completes never reopens the old link', () => {
  const f = fixture('?place=park&card=test-card&keep=memo&source=link');
  try {
    f.render('park');
    const shared = f.frame();
    assert.equal(new URL(shared.src).searchParams.get('card'),'test-card');
    f.render('my'); f.render('park');
    assert.notEqual(f.frame(),shared);
    assert.equal(new URL(f.frame().src).searchParams.has('card'),false);
    assert.equal(f.window.location.search,'?place=park&source=link');
  } finally {f.dom.window.close();}
});
