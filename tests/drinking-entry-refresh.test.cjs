'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../games/drinking/entry-refresh.js'), 'utf8');
const current = '20261114-drinking-fit1', latest = '20261114-croc-design1';

function fixture({url = 'https://fixture.test/games/drinking/local/#menu', revision = latest, fetchReply} = {}) {
  let href = url, playing = false, dialog = false, timer = null;
  const calls = [], navigations = [], listeners = {};
  const window = {addEventListener(name, listener) { listeners[name] = listener; }};
  const location = {
    get href() { return href; },
    get pathname() { return new URL(href).pathname; },
    get origin() { return new URL(href).origin; },
    assign(target) { navigations.push(target); }
  };
  vm.runInNewContext(source, {
    window, location, URL, AbortController,
    document: {querySelector: () => playing || dialog ? {} : null},
    setTimeout(callback, duration) { assert.equal(duration, 2000); timer = callback; return 1; },
    clearTimeout() { timer = null; },
    fetch(request, options) {
      calls.push({request, options});
      return fetchReply ? fetchReply(request, options) : Promise.resolve({ok:true, json:async () => ({revision})});
    }
  });
  return {
    enter: kind => window.OjjudaDrinkingEntry.navigateLocal(kind, current), calls, navigations,
    playing(value) { playing = value; }, dialog(value) { dialog = value; },
    route(value) { href = new URL(value, href).href; }, timeout() { timer?.(); },
    restore() { listeners.pageshow({persisted:true}); }
  };
}

test('a menu choice fetches the latest document only when its revision changes', async () => {
  const f = fixture();
  assert.equal(f.calls.length, 0, 'loading the helper does not poll or reload');
  assert.equal(await f.enter('croc'), true);
  assert.equal(f.calls.length, 1);
  assert.match(f.calls[0].request, /^\/game-release\.json\?t=\d+$/);
  assert.equal(f.calls[0].options.cache, 'no-store');
  assert.deepEqual(f.navigations, ['https://fixture.test/games/drinking/local/?v=' + latest + '#croc']);
  const same = fixture({revision:current});
  assert.equal(await same.enter('croc'), false);
  assert.deepEqual(same.navigations, []);
});

test('the hub enters a versioned local menu even when the release is unchanged', async () => {
  const f = fixture({url:'https://fixture.test/games/drinking/', revision:current});
  assert.equal(await f.enter('menu'), true);
  assert.deepEqual(f.navigations, ['https://fixture.test/games/drinking/local/?v=' + current]);
});

test('failed, malformed and timed-out checks leave navigation to the existing menu', async () => {
  for (const fetchReply of [async () => {throw Error('offline');}, async () => ({ok:false}), async () => ({ok:true, json:async () => ({revision:'bad/revision'})})]) {
    const f = fixture({fetchReply});
    assert.equal(await f.enter('croc'), false);
    assert.deepEqual(f.navigations, []);
  }
  const f = fixture({fetchReply:(_request, {signal}) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Error('aborted')), {once:true});
  })});
  const pending = f.enter('croc'); f.timeout();
  assert.equal(await pending, false);
  assert.deepEqual(f.navigations, []);
});

test('an active game, an open dialog or a changed route cannot be refreshed', async () => {
  for (const block of ['playing', 'dialog']) {
    const f = fixture(); f[block](true);
    assert.equal(await f.enter('croc'), false);
    assert.equal(f.calls.length, 0);
    assert.deepEqual(f.navigations, []);
  }
  for (const block of ['playing', 'dialog', 'route']) {
    let resolve;
    const f = fixture({fetchReply:() => new Promise(done => {resolve = done;})});
    const pending = f.enter('croc');
    f[block](block === 'route' ? '#participants' : true);
    resolve({ok:true, json:async () => ({revision:latest})});
    assert.equal(await pending, false);
    assert.deepEqual(f.navigations, []);
  }
});

test('simultaneous choices share one release request and navigate once', async () => {
  let resolve;
  const f = fixture({fetchReply:() => new Promise(done => {resolve = done;})});
  const first = f.enter('croc'), second = f.enter('bottle');
  assert.equal(f.calls.length, 1);
  resolve({ok:true, json:async () => ({revision:latest})});
  assert.deepEqual(await Promise.all([first, second]), [true, false]);
  assert.equal(f.navigations.length, 1);
});

test('returning to a cached menu allows the next explicit entry check', async () => {
  const f = fixture({url:'https://fixture.test/games/drinking/'});
  assert.equal(await f.enter('menu'), true);
  f.restore();
  assert.equal(f.calls.length, 1, 'history restoration does not reload or poll');
  assert.equal(await f.enter('menu'), true);
  assert.equal(f.calls.length, 2);
});
