const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// The parent covers the iframe only until it is usable; returning to a cached
// Park does not reintroduce a loading delay.
{
  let inPark = true, created = 0, onMessage;
  const timers = [];
  const cover = { hidden: false }, compose = { hidden: false };
  const frame = { isConnected: true, dataset: {}, events: {},
    contentWindow: { location: new URL('https://fixture.test/park/'), postMessage() {}, OjjudaParkFull: { cardOpen: () => false, returnHome: () => true } },
    addEventListener(name, listener) { this.events[name] = listener; } };
  const slot = { replaceChildren(child) { assert.equal(child, frame); } };
  const panel = { hidden: false, isConnected: true,
    querySelector(selector) { return { '[data-park-loading]': cover, '.park-compose-fab': compose, '[data-park-app-slot]': slot }[selector] || null; },
    setAttribute() {}, removeAttribute() {} };
  const doc = { querySelector: () => panel, createElement: () => { created++; return frame; },
    documentElement: { classList: { toggle() {} } }, addEventListener() {} };
  const scope = { document: doc, URL, Set, location: new URL('https://fixture.test/world.html?place=park'),
    setTimeout: (_, delay) => { timers.push(delay); return 1; }, clearTimeout() {}, addEventListener(type, listener) { if (type === 'message') onMessage = listener; } };
  scope.window = scope;
  vm.runInNewContext(read('park/world-park-notes.js'), scope);
  const app = { place: () => ({ id: inPark ? 'park' : 'arcade' }), userId: () => 'member-1',
    enter() {}, onFrameReady: () => () => {} };
  const controller = scope.OjjudaParkNotes.install(app);
  const markup = controller.markup();
  assert.equal((markup.match(/class="park-skeleton-card"/g) || []).length, 3);
  assert.match(markup, /data-park-loading role="status"/);
  controller.sync();
  assert.equal(created, 1);
  assert.deepEqual(timers, [], 'cold opening adds no minimum display timer');
  assert.equal(cover.hidden, false, 'slow iframe keeps the preview visible');
  assert.equal(compose.hidden, true, 'composer cannot cover the preview before the frame is ready');
  frame.contentWindow.location = new URL('https://fixture.test/');
  frame.events.load();
  assert.equal(cover.hidden, false, 'an initial empty iframe must not dismiss the preview');
  frame.contentWindow.location = new URL('https://fixture.test/park/');
  onMessage({ origin: scope.location.origin, source: frame.contentWindow, data: { type: 'ojjuda:park-ready' } });
  assert.equal(cover.hidden, true, 'Park readiness removes the preview immediately');
  assert.equal(compose.hidden, false);
  frame.events.load();
  assert.equal(cover.hidden, true, 'load cannot restore an already finished preview');
  inPark = false; controller.sync();
  assert.equal(panel.hidden, true);
  assert.deepEqual(timers, [60_000], 'only idle frame retirement uses a timer');
  inPark = true; controller.sync();
  assert.equal(created, 1, 'cached re-entry reuses the existing iframe');
  assert.equal(cover.hidden, true, 'cached re-entry has no artificial loader');
}

// The embedded feed shows three cards while its first query is pending; the
// existing feed renderer replaces them as soon as actual data or an error arrives.
{
  const source = read('note/preview.js');
  const from = source.indexOf('function showFeedLoading() {');
  const to = source.indexOf('\nfunction banner(', from);
  assert.ok(from > 0 && to > from);
  const calls = [];
  const list = { replaceChildren(...children) { calls.push(children); } };
  const node = (tag, className, value) => ({ tag, className, value, children: [],
    append(...children) { this.children.push(...children); }, setAttribute(name, value) { this[name] = value; } });
  const scope = { parkEmbedded: true, list, node, state() { throw new Error('embedded Park should use card placeholders'); } };
  vm.runInNewContext(source.slice(from, to) + '\nshowFeedLoading();', scope);
  const [status, ...cards] = calls.at(-1);
  assert.equal(status.role, 'status');
  assert.equal(cards.length, 3);
  assert.ok(cards.every(card => card.className === 'park-skeleton-card' && card['aria-hidden'] === 'true'));
  assert.match(source, /if \(!quiet\) \{ showFeedLoading\(\); banner\('카드를 불러오는 중'\); \}/);
  assert.equal((read('park/index.html').match(/class="park-skeleton-card"/g) || []).length, 3,
    'the initial HTML shows cards even before scripts initialize');
  assert.match(read('park/design.css'), /prefers-reduced-motion:reduce/);
}

console.log('PASS: Park preview during cold iframe and card fetch, immediate readiness, no cached re-entry delay and reduced-motion placeholders');

const { test } = require('node:test');
const { JSDOM } = require('jsdom');

for (const member of [false, true]) {
  test(`cold Park entry requests the first page once for a ${member ? 'member' : 'guest'}`, async () => {
    const dom = new JSDOM(read('park/index.html'), {
      url: 'https://fixture.test/park/', runScripts: 'outside-only', pretendToBeVisual: true
    });
    try {
      const window = dom.window;
      window.scrollTo = () => {};
      window.matchMedia = () => ({ matches: false });
      const session = member ? { user: { id: 'member' } } : null;
      const requested = [];
      const cards = Array.from({ length: 20 }, (_, index) => ({
        id: '12345678-1234-4123-8123-' + String(index + 1).padStart(12, '0'), kind: 'memo',
        body: '공원 이야기', background_key: String(10 + index), tags: [], created_at: '2026-11-10T00:00:00Z'
      }));
      let onAuth, intersect;
      const observed = new Set();
      window.IntersectionObserver = class {
        constructor(callback) { intersect = callback; }
        observe(photo) { observed.add(photo); }
        unobserve(photo) { observed.delete(photo); }
      };
      const client = {
        auth: {
          onAuthStateChange(callback) { onAuth = callback; },
          async getSession() { return { data: { session } }; }
        },
        rpc: async () => ({ data: {} }),
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
        schema: () => ({ rpc: async name => {
          if (name === 'list_cards') requested.push(name);
          if (name === 'list_cards') return { data: cards };
          return { data: name === 'get_note_state' ? {} : [] };
        } })
      };
      window.OJJUDA_CONFIG = { supabaseUrl: 'https://fixture.test', supabaseKey: 'test' };
      window.supabase = { createClient: () => client };
      window.eval(read('note/preview.js'));
      onAuth('INITIAL_SESSION', session);
      const settle = () => new Promise(resolve => window.setTimeout(resolve, 0));
      await settle();
      assert.equal(requested.length, 1);
      const photos = [...window.document.querySelectorAll('#feed-list article .photo')];
      assert.equal(photos.length, 20);
      assert.equal(photos.filter(photo => photo.style.backgroundImage).length, 3);
      assert.equal(observed.size, 17);
      intersect([{ target: photos[3], isIntersecting: true }]);
      assert.match(photos[3].style.backgroundImage, /13\.jpg/);
      assert.equal(observed.has(photos[3]), false);
      onAuth('TOKEN_REFRESHED', session);
      await settle();
      assert.equal(requested.length, 1);
      onAuth('SIGNED_IN', { user: { id: 'another-member' } });
      await settle();
      assert.equal(requested.length, 2);
    } finally {
      dom.window.close();
    }
  });
}

test('a shared card starts before the feed and fetches reply backgrounds near the rail', async () => {
  const id = '12345678-1234-4123-8123-000000000001';
  const dom = new JSDOM(read('park/index.html'), {
    url: 'https://fixture.test/park/?card=' + id, runScripts: 'outside-only', pretendToBeVisual: true
  });
  const observers = [];
  try {
    const w = dom.window, doc = w.document, calls = [], watches = new Map();
    w.MutationObserver = class extends w.MutationObserver {
      constructor(callback) { super(callback); observers.push(this); }
    };
    w.scrollTo = () => {};
    w.matchMedia = () => ({ matches: false });
    doc.documentElement.setAttribute('data-park-webp', '');
    w.IntersectionObserver = class {
      constructor(callback, options) { this.root = options.root; this.callback = callback; }
      observe(photo) { watches.set(photo, this); }
      unobserve(photo) { watches.delete(photo); }
    };
    const parent = { id, kind: 'memo', body: '원글', tags: [], background_key: '10', created_at: '2026-11-12T00:00:00Z' };
    const rows = Array.from({length: 30}, (_, i) => ({...parent, id: id.slice(0,-3) + String(i+2).padStart(3,'0'), kind: 'comment'}));
    const replyQuery = { select(){return this;}, eq(){return this;}, not(){return this;}, order(){return this;},
      limit(){calls.push('replies');return Promise.resolve({data: rows});} };
    w.OJJUDA_CONFIG = { supabaseUrl: 'https://fixture.test', supabaseKey: 'test' };
    w.supabase = { createClient: () => ({
      auth: { onAuthStateChange(){}, getSession: async () => ({ data:{session:null} }) },
      schema: () => ({ from: () => replyQuery, rpc: async name => {
        if(name==='get_card') {calls.push(name);return {data: parent};}
        if(name==='list_cards') {calls.push(name);return {data:[parent]};}
        return {data:[]};
      } })
    }) };
    w.eval(read('note/preview.js') + '\n' + read('park/integration.js'));
    const settle = () => new Promise(resolve => w.setTimeout(resolve, 0));
    await settle(); await settle();
    assert.deepEqual(calls, ['get_card','replies']);
    assert.equal(doc.querySelectorAll('#feed-list article').length, 0);
    const photos = [...doc.querySelectorAll('#reply-list .photo')];
    assert.equal(photos.length, 30);
    assert.equal(photos.filter(p=>p.querySelector('img.park-card-background')).length, 2);
    const observer = watches.get(photos[2]);
    assert.equal(observer.root, doc.querySelector('#reply-list'));
    observer.callback([{target: photos[2], isIntersecting:true}]);
    const img = photos[2].querySelector('img.park-card-background');
    assert.match(img.srcset,/480w, .*800w, .*1200w$/);
    img.dispatchEvent(new w.Event('error'));
    assert.equal(img.srcset,'');
    assert.match(img.src,/\/10\.jpg$/);
    doc.querySelector('.back-button').click();
    await settle();
    assert.deepEqual(calls, ['get_card','replies','list_cards']);
    assert.equal(doc.querySelectorAll('#feed-list article').length, 1);
    doc.querySelector('#feed-list article .photo').click();
    await settle();
    assert.equal(doc.querySelector('#detail').hidden,false);
    const feedRequests = () => calls.filter(name=>name==='list_cards').length;
    assert.equal(w.OjjudaParkFull.returnHome(),true);
    assert.equal(doc.querySelector('#detail').hidden,true);
    assert.equal(doc.querySelector('#feed').hidden,false);
    assert.equal(new URL(w.location.href).searchParams.has('card'),false);
    assert.equal(feedRequests(),1,'returning from a card reuses the default feed');
    doc.querySelector('[data-sort="popular"]').click();
    await settle();
    assert.equal(w.OjjudaParkFull.returnHome(),true);
    await settle();
    assert.equal(doc.querySelector('[data-sort="latest"]').getAttribute('aria-pressed'),'true');
    assert.equal(feedRequests(),3,'switching back from Popular loads the Latest feed once');
    doc.querySelector('#composer-backdrop').hidden=false;
    assert.equal(w.OjjudaParkFull.returnHome(),false,'an open dialog requires a clean document on re-entry');
    await settle();
  } finally {
    for (const observer of observers) observer.disconnect();
    dom.window.close();
  }
});
