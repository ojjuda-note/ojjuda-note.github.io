/* The parent authenticates rating requests; the directory never receives a session. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const code = fs.readFileSync(path.join(__dirname, '../games/certified-restaurants/world-restaurant-guide.js'), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function fixture(owner = 'member-a') {
  const errors = [], console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<button id="entry">맛집</button>', { url: 'https://fixture.test/world.html', runScripts: 'outside-only', virtualConsole: console });
  const w = dom.window, calls = [], replies = [], mapCalls = [], detailCalls = [], listeners = new Set();
  let account = owner, poll, defer = null, mapDefer = null, childOpen = false, cancelled = 0;
  w.setInterval = callback => { poll = callback; return 1; }; w.clearInterval = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const empty = id => ({ id, average: null, count: 0, my_rating: null });
  const ratings = {
    async getSummaries(kind, ids) { calls.push({ action: 'summary', kind, ids: [...ids] }); return defer ? defer() : ids.map(empty); },
    async setRating(kind, id, score) { calls.push({ action: 'save', kind, id, score }); return { id, average: score, count: 1, my_rating: score }; }
  };
  const recommendations = {
    ratings, open() { childOpen = true; return true; }, close() { childOpen = false; return true; }, isOpen: () => childOpen,
    openDetail(id) { detailCalls.push(id); childOpen = true; return true; },
    async getMapPage(options) { mapCalls.push({ ...options }); return mapDefer ? mapDefer() : { rows: [], total: 0, offset: options.offset, limit: options.limit, hasMore: false }; },
    subscribeChanges(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    cancelMapReads() { cancelled++; }
  };
  w.eval(code);
  w.OjjudaRestaurantGuide.open({ owner, authorized: () => account === owner, recommendations });
  const frame = w.document.querySelector('iframe'), source = frame.contentWindow;
  source.postMessage = (data, origin) => replies.push({ data: JSON.parse(JSON.stringify(data)), origin });
  function send(data, options = {}) {
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'ojjuda:restaurants:ratings', ...data }, origin: options.origin || w.location.origin, source: options.source || source }));
  }
  return { w, frame, calls, replies, mapCalls, detailCalls, listeners, send, defer: fn => { defer = fn; }, deferMap: fn => { mapDefer = fn; }, changed() { for (const listener of listeners) listener(); }, returnToMap() { childOpen = false; poll(); }, get cancelled() { return cancelled; }, changeAccount() { account = 'member-b'; poll(); }, close() { w.OjjudaRestaurantGuide.close(true); w.close(); assert.deepEqual(errors, []); } };
}

(async () => {
  const f = fixture();
  try {
    assert.equal(new URL(f.frame.src).searchParams.get('member-ratings'), '1');
    assert.equal(new URL(f.frame.src).searchParams.get('member-recommendations'), '1');
    const summary = { requestId: 'read-1', action: 'summary', ids: ['blue-add-벽제갈비더청담'] };
    f.send(summary, { origin: 'https://foreign.test' });
    f.send(summary, { source: f.w });
    f.send({ ...summary, type: 'unknown-type' });
    await tick();
    assert.equal(f.calls.length, 0, 'only the current same-origin directory can request member ratings');
    f.send(summary); await tick();
    assert.deepEqual(f.calls[0], { action: 'summary', kind: 'certified', ids: ['blue-add-벽제갈비더청담'] });
    assert.equal(f.replies[0].origin, 'https://fixture.test');
    assert.equal(f.replies[0].data.data[0].count, 0);
    assert.deepEqual(Object.keys(f.replies[0].data).sort(), ['data', 'requestId', 'type'], 'the frame gets rating data only, never authentication material');
    const before = f.calls.length;
    for (const [index, bad] of [
      { action: 'summary', ids: Array.from({ length: 101 }, (_, i) => 'item-' + i) },
      { action: 'summary', ids: ['../private'] },
      { action: 'summary', ids: ['x'.repeat(81)] },
      { action: 'summary', ids: [] },
      { action: 'summary', ids: ['m-one'], kind: 'recommended' },
      { action: 'summary', ids: ['m-one'], kind: 'private' },
      { action: 'save', id: 'm-one', score: 1.25 },
      { action: 'save', id: 'm-one', score: 0.5 },
      { action: 'save', id: 'm-one', score: 5.5 },
      { action: 'save', id: 'm-one', score: '1.5' },
      { action: 'unexpected', id: 'm-one', score: 3 }
    ].entries()) f.send({ requestId: 'invalid-' + index, ...bad });
    await tick(); assert.equal(f.calls.length, before, 'invalid targets, oversized batches and unsupported scores do not reach RPCs');
    assert.ok(f.replies.slice(1).every(reply => typeof reply.data.error === 'string'));
    f.send({ requestId: 'write-1', action: 'save', id: 'm-one', score: 1.5, owner: 'another-member' });
    await tick();
    assert.deepEqual(f.calls.at(-1), { action: 'save', kind: 'certified', id: 'm-one', score: 1.5 }, 'omitted kind preserves certified ratings and the frame cannot choose an owner');
    assert.equal(f.replies.at(-1).data.data.my_rating, 1.5);
    const recommendationId = '20000000-0000-4000-8000-000000000001';
    f.send({ requestId: 'recommended-summary', action: 'summary', kind: 'recommended', ids: [recommendationId, recommendationId] }); await tick();
    assert.deepEqual(f.calls.at(-1), { action: 'summary', kind: 'recommended', ids: [recommendationId] });
    f.send({ requestId: 'recommended-save', action: 'save', kind: 'recommended', id: recommendationId, score: 4.5 }); await tick();
    assert.deepEqual(f.calls.at(-1), { action: 'save', kind: 'recommended', id: recommendationId, score: 4.5 });

    const page = { type: 'ojjuda:restaurants:recommendation-data', requestId: 'map-1', action: 'page', offset: 50, limit: 50 };
    f.send(page, { origin: 'https://foreign.test' }); f.send(page, { source: f.w }); await tick();
    assert.equal(f.mapCalls.length, 0);
    f.send(page); await tick();
    assert.deepEqual(f.mapCalls, [{ offset: 50, limit: 50 }]);
    assert.equal(f.replies.at(-1).data.type, 'ojjuda:restaurants:recommendation-data-result');
    assert.deepEqual(Object.keys(f.replies.at(-1).data).sort(), ['data', 'requestId', 'type']);
    for (const [index, invalid] of [{ offset: -1 }, { offset: 10001 }, { limit: 51 }, { action: 'delete' }].entries()) f.send({ ...page, requestId: 'invalid-map-' + index, ...invalid });
    await tick(); assert.equal(f.mapCalls.length, 1, 'only bounded read-only map page requests are forwarded');
    f.send({ type: 'ojjuda:restaurants:recommendations', id: '../private' });
    assert.equal(f.detailCalls.length, 0);
    f.send({ type: 'ojjuda:restaurants:recommendations', id: recommendationId }); await tick();
    assert.deepEqual(f.detailCalls, [recommendationId], 'a marker opens the original recommendation detail by UUID');
    f.changed(); assert.equal(f.replies.at(-1).data.type, 'ojjuda:restaurants:recommendations-changed');
    const beforeReturn = f.replies.length; f.returnToMap();
    assert.equal(f.replies.length, beforeReturn + 1, 'returning from recommendation detail refreshes its directory data');

    let release;
    f.defer(() => new Promise(resolve => { release = resolve; }));
    const delayed = { requestId: 'delayed-read', action: 'summary', ids: ['m-one'] };
    f.send(delayed); const requestCount = f.calls.length;
    f.send(delayed); assert.equal(f.calls.length, requestCount, 'the same in-flight correlation id runs once');
    const mapReleases = [];
    f.deferMap(() => new Promise(resolve => { mapReleases.push(resolve); }));
    f.send({ ...page, requestId: 'map-delayed-1' }); f.send({ ...page, requestId: 'map-delayed-1' });
    f.send({ ...page, requestId: 'map-delayed-2' }); f.send({ ...page, requestId: 'map-delayed-3' }); f.send({ ...page, requestId: 'map-delayed-4' });
    assert.equal(mapReleases.length, 3, 'map reads deduplicate request IDs and bound concurrent work');
    const responseCount = f.replies.length;
    f.changeAccount();
    assert.equal(f.w.document.querySelector('iframe'), null, 'account changes close the old directory');
    assert.equal(f.listeners.size, 0); assert.equal(f.cancelled, 1, 'closing releases subscriptions and pending member map reads');
    for (const resolve of mapReleases) resolve({ rows: [], total: 0, offset: 50, limit: 50, hasMore: false });
    release([{ id: 'm-one', average: 5, count: 1, my_rating: 5 }]); await tick();
    assert.equal(f.replies.length, responseCount, 'old account results never reach a later or detached view');
  } finally { f.close(); }
  const guest = fixture(null);
  try {
    assert.equal(new URL(guest.frame.src).searchParams.has('member-ratings'), false);
    assert.equal(new URL(guest.frame.src).searchParams.has('member-recommendations'), false);
    guest.send({ requestId: 'guest-read', action: 'summary', ids: ['m-one'] }); await tick();
    guest.send({ type: 'ojjuda:restaurants:recommendation-data', requestId: 'guest-map', action: 'page', offset: 0, limit: 50 });
    guest.send({ type: 'ojjuda:restaurants:recommendations', id: '20000000-0000-4000-8000-000000000001' }); await tick();
    assert.equal(guest.calls.length, 0, 'guests cannot invoke member rating RPCs through the bridge');
    assert.equal(guest.mapCalls.length, 0); assert.equal(guest.detailCalls.length, 0);
  } finally { guest.close(); }
  console.log('PASS: restaurant bridge typed ratings, member map pages, original detail, invalidation, guest and stale-account guards');
})().catch(error => { console.error(error); process.exitCode = 1; });
