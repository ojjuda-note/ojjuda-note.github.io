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
    contentWindow: { location: new URL('https://fixture.test/park/'), postMessage() {}, OjjudaParkFull: { cardOpen: () => false } },
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
