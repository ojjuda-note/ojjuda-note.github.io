const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const {JSDOM} = require('jsdom');

const root = path.resolve(__dirname, '..');
const loader = fs.readFileSync(path.join(root, 'shared/games/game-launch-loading.js'), 'utf8');
const world = fs.readFileSync(path.join(root, 'world.html'), 'utf8');
const matgo = fs.readFileSync(path.join(root, 'games/matgo/matgo-bridge.js'), 'utf8');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const flush = async () => {for (let i = 0; i < 12; i++) await Promise.resolve();};

function entrance() {
  const dom = new JSDOM('<button id="play">시작</button>', {
    url: 'https://fixture.test/world.html', runScripts: 'outside-only', pretendToBeVisual: true
  });
  dom.window.eval(loader);
  return {w: dom.window, close: () => dom.window.close()};
}

test('a quickly loaded game has no visible loading flash or forced wait', () => {
  const {w, close} = entrance();
  try {
    const session = w.OjjudaGameLaunch.show('mines');
    assert.equal(w.document.querySelector('.ogl-title').textContent, '지뢰찾기 준비 중!');
    assert.equal(w.document.querySelector('.ogl-game-icon').textContent, '💣');
    assert.equal(w.document.querySelector('.ojjuda-game-launch-loading.is-visible'), null);
    session.finish();
    assert.equal(w.document.querySelector('.ojjuda-game-launch-loading'), null);
    assert.equal(w.document.body.classList.contains('ojjuda-game-launch-open'), false);
  } finally {close();}
});

test('a slow game gets the playful entrance and an accessible way back', async () => {
  const {w, close} = entrance();
  try {
    let cancelled = 0;
    const session = w.OjjudaGameLaunch.show('screw', {onCancel: () => cancelled++});
    await pause(130);
    assert.ok(w.document.querySelector('.ojjuda-game-launch-loading.is-visible'));
    assert.match(w.document.querySelector('.ogl-caption').textContent, /나사/);
    assert.equal(w.document.querySelector('[role="dialog"]').getAttribute('aria-modal'), 'true');
    w.document.querySelector('.ogl-cancel').click();
    assert.equal(cancelled, 1);
    assert.equal(session.isCurrent(), false);
    assert.equal(w.document.querySelector('.ojjuda-game-launch-loading'), null);
  } finally {close();}
});

test('a retiring loader cannot unlock scrolling while another game is loading', async () => {
  const {w, close} = entrance();
  try {
    const old = w.OjjudaGameLaunch.show('spot');
    await pause(125);
    old.finish();
    const next = w.OjjudaGameLaunch.show('runner');
    assert.equal(w.document.querySelectorAll('.ojjuda-game-launch-loading').length, 1);
    assert.equal(w.document.body.classList.contains('ojjuda-game-launch-open'), true);
    await pause(560);
    assert.equal(next.isCurrent(), true);
    assert.equal(w.document.body.classList.contains('ojjuda-game-launch-open'), true);
    next.cancel({silent:true});
    assert.equal(w.document.body.classList.contains('ojjuda-game-launch-open'), false);
  } finally {close();}
});

test('cancelled iframe loading frees its pending listener and timeout immediately', async () => {
  const {w, close} = entrance();
  try {
    const host = w.document.createElement('section');
    host.id = 'photo-ttang-overlay';
    const frame = w.document.createElement('iframe');
    host.append(frame);w.document.body.append(host);
    const session = w.OjjudaGameLaunch.show('photo_ttang');
    const pending = session.finishAfterOpen();
    await pause(120);
    session.cancel({silent:true});
    const settled = await Promise.race([pending.then(() => true),pause(120).then(() => false)]);
    assert.equal(settled,true,'closing the game does not keep its 5-second iframe wait alive');
    assert.equal(w.document.querySelector('.ojjuda-game-launch-loading'),null);
  } finally {close();}
});

test('lazy entry opens the game after assets load and ignores a cancelled request', async () => {
  const start = world.indexOf('function Al(');
  const end = world.indexOf('// User-requested exits ask first;', start);
  assert.ok(start >= 0 && end > start);
  for (const cancel of [false, true]) {
    let resolveLoad, activeLoading, loaded = false, opened = 0, cancelled = 0, finished = 0;
    const state = {
      window: {
        OjjudaGameAssets: {
          ready: () => loaded,
          load: () => new Promise(resolve => {resolveLoad = () => {loaded = true; resolve();};})
        },
        OjjudaFestivalSchedule: {open: () => {opened++;}},
        OjjudaGameLaunch: {show: (game, {onCancel}) => {
          assert.equal(game, 'festival');
          let current = true;
          activeLoading = {
            cancel: ({silent = false} = {}) => {current = false;if (!silent) {cancelled++;onCancel();}},
            beforeOpen: async () => current,
            isCurrent: () => current,
            finishAfterOpen: async () => {finished++;}
          };
          return activeLoading;
        }}
      },
      D: {online: true, user: {id: 'alice'}},
      g: {tab: 'place', place: {id: 'arcade'}},
      worldGameAssetRequest: 0,
      worldGameEntryGate: () => true,
      markAgitPageVisit: () => null,
      M: () => assert.fail('no error toast expected')
    };
    vm.runInNewContext(world.slice(start, end), state);
    state.Al('festival');
    assert.equal(opened, 0, 'the game stays closed while downloading');
    if (cancel) activeLoading.cancel();
    resolveLoad();await flush();
    assert.equal(opened, cancel ? 0 : 1, 'stale downloads never open a game');
    assert.equal(finished, cancel ? 0 : 1);
    assert.equal(cancelled, cancel ? 1 : 0);
    if (!cancel) {state.Al('festival');assert.equal(opened, 2, 'warm game opens immediately');}
  }
});

test('age-gated game frames keep the entrance until their async access check finishes', async () => {
  const start = world.indexOf('function Al(');
  const end = world.indexOf('// User-requested exits ask first;', start);
  for (const game of ['photo_ttang', 'roulette']) {
    let assetDone, bridgeDone, loaded = false, started = 0, finished = 0;
    const bridge = new Promise(resolve => {bridgeDone = resolve;});
    const state = {
      window: {
        OjjudaGameAssets: {
          ready: () => loaded,
          load: () => new Promise(resolve => {assetDone = () => {loaded = true; resolve();};})
        },
        OjjudaGameLaunch: {show: () => ({
          isCurrent: () => true, beforeOpen: async () => true,
          cancel: () => {}, finishAfterOpen: async () => {finished++;}
        })},
        OjjudaPhotoTtangBridge: {open: () => {started++;return bridge;}},
        OjjudaRouletteBridge: {open: () => {started++;return bridge;}}
      },
      D: {online: true, user: {id: 'alice'}},
      g: {tab: 'place', place: {id: 'arcade'}},
      $: {me: {nick: 'alice'}, coins: 0}, S: {}, qf: () => {},
      worldGameAssetRequest: 0, worldGameEntryGate: () => true,
      M: () => assert.fail('unexpected error')
    };
    vm.runInNewContext(world.slice(start, end), state);
    state.Al(game);
    assetDone();await flush();
    assert.equal(started, 1);
    assert.equal(finished, 0, game + ' must keep the screen through age verification');
    bridgeDone();await flush();
    assert.equal(finished, 1, game + ' completes only after its bridge opens');
  }
});

test('Matgo uses the shared entrance through access check and frame readiness', async () => {
  const dom = new JSDOM('<div id="toast"></div><button id="entry">맞고</button>', {
    url: 'https://fixture.test/world.html', runScripts: 'outside-only'
  });
  const w = dom.window;
  w.matchMedia = () => ({matches: false});
  w.OjjudaMatgoAccess = {check: async () => ({userId: 'alice'}), subscribe: () => () => {}};
  let finish = 0, cancel = 0;
  w.OjjudaGameLaunch = {show(game, options) {
    assert.equal(game, 'matgo');
    assert.equal(typeof options.onCancel, 'function');
    return {finish: () => finish++, cancel: () => cancel++};
  }};
  w.eval(matgo);
  try {
    assert.equal(await w.openMatgo(), true);
    assert.equal(finish, 0, 'wait until the frame reports readiness');
    const iframe = w.document.querySelector('#matgo-overlay iframe');
    w.dispatchEvent(new w.MessageEvent('message', {
      origin: w.location.origin, source: iframe.contentWindow,
      data: {type: 'ojjuda:matgo:ready'}
    }));
    assert.equal(finish, 1);
    w.closeMatgo();
    assert.equal(cancel, 0, 'finished entrance is not cancelled twice');
    assert.equal(await w.openMatgo(), true);
    w.closeMatgo();
    assert.equal(cancel, 1, 'closing an unfinished frame dismisses the loader');
  } finally {w.closeMatgo();w.close();}
});
