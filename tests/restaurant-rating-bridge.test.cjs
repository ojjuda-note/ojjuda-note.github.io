/* The parent authenticates rating requests; the directory never receives a session. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const code = fs.readFileSync(path.join(__dirname, '../world-restaurant-guide.js'), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function fixture(owner = 'member-a') {
  const errors = [], console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<button id="entry">맛집</button>', { url: 'https://fixture.test/world.html', runScripts: 'outside-only', virtualConsole: console });
  const w = dom.window, calls = [], replies = [];
  let account = owner, poll, defer = null;
  w.setInterval = callback => { poll = callback; return 1; }; w.clearInterval = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const empty = id => ({ id, average: null, count: 0, my_rating: null });
  const ratings = {
    async getSummaries(kind, ids) { calls.push({ action: 'summary', kind, ids: [...ids] }); return defer ? defer() : ids.map(empty); },
    async setRating(kind, id, score) { calls.push({ action: 'save', kind, id, score }); return { id, average: score, count: 1, my_rating: score }; }
  };
  w.eval(code);
  w.OjjudaRestaurantGuide.open({ owner, authorized: () => account === owner, recommendations: { ratings, open() {}, close() {}, isOpen: () => false } });
  const frame = w.document.querySelector('iframe'), source = frame.contentWindow;
  source.postMessage = (data, origin) => replies.push({ data: JSON.parse(JSON.stringify(data)), origin });
  function send(data, options = {}) {
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'ojjuda:restaurants:ratings', ...data }, origin: options.origin || w.location.origin, source: options.source || source }));
  }
  return { w, frame, calls, replies, send, defer: fn => { defer = fn; }, changeAccount() { account = 'member-b'; poll(); }, close() { w.OjjudaRestaurantGuide.close(true); w.close(); assert.deepEqual(errors, []); } };
}

(async () => {
  const f = fixture();
  try {
    assert.equal(new URL(f.frame.src).searchParams.get('member-ratings'), '1');
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
      { action: 'save', id: 'm-one', score: 1.25 },
      { action: 'save', id: 'm-one', score: 0.5 },
      { action: 'save', id: 'm-one', score: 5.5 },
      { action: 'save', id: 'm-one', score: '1.5' },
      { action: 'unexpected', id: 'm-one', score: 3 }
    ].entries()) f.send({ requestId: 'invalid-' + index, ...bad });
    await tick(); assert.equal(f.calls.length, before, 'invalid targets, oversized batches and unsupported scores do not reach RPCs');
    assert.ok(f.replies.slice(1).every(reply => typeof reply.data.error === 'string'));
    f.send({ requestId: 'write-1', action: 'save', id: 'm-one', score: 1.5, kind: 'recommended', owner: 'another-member' });
    await tick();
    assert.deepEqual(f.calls.at(-1), { action: 'save', kind: 'certified', id: 'm-one', score: 1.5 }, 'the frame cannot choose an owner or switch restaurant kind');
    assert.equal(f.replies.at(-1).data.data.my_rating, 1.5);
    let release;
    f.defer(() => new Promise(resolve => { release = resolve; }));
    const delayed = { requestId: 'delayed-read', action: 'summary', ids: ['m-one'] };
    f.send(delayed); const requestCount = f.calls.length;
    f.send(delayed); assert.equal(f.calls.length, requestCount, 'the same in-flight correlation id runs once');
    const responseCount = f.replies.length;
    f.changeAccount();
    assert.equal(f.w.document.querySelector('iframe'), null, 'account changes close the old directory');
    release([{ id: 'm-one', average: 5, count: 1, my_rating: 5 }]); await tick();
    assert.equal(f.replies.length, responseCount, 'old account results never reach a later or detached view');
  } finally { f.close(); }
  const guest = fixture(null);
  try {
    assert.equal(new URL(guest.frame.src).searchParams.has('member-ratings'), false);
    guest.send({ requestId: 'guest-read', action: 'summary', ids: ['m-one'] }); await tick();
    assert.equal(guest.calls.length, 0, 'guests cannot invoke member rating RPCs through the bridge');
  } finally { guest.close(); }
  console.log('PASS: restaurant rating bridge origin/source, payload bounds, half-step scores, fixed kind, guest and stale-account guards');
})().catch(error => { console.error(error); process.exitCode = 1; });
