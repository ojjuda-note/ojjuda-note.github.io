const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../features/fanpages/fan.js'), 'utf8');

// Run the shipped event handlers against small DOM doubles; no network or media is loaded.
function fixture({ reducedMotion = false } = {}) {
  const timers = new Map();
  const storage = new Map();
  let nextTimer = 1;
  const document = { body: null, activeElement: null, hidden: false };
  function element(dataset = {}) {
    const attributes = new Map();
    const classes = new Set();
    const listeners = new Map();
    const selectors = new Map();
    const node = {
      dataset, hidden: false, style: {}, children: [], textContent: '', innerHTML: '',
      selectors,
      classList: {
        add(...names) { names.forEach(name => classes.add(name)); },
        remove(...names) { names.forEach(name => classes.delete(name)); },
        contains(name) { return classes.has(name); },
        toggle(name, force) {
          const selected = force === undefined ? !classes.has(name) : force;
          selected ? classes.add(name) : classes.delete(name);
          return selected;
        }
      },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) ?? null; },
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(callback);
      },
      emit(type, properties = {}) {
        const event = { type, target: node, preventDefault() {}, ...properties };
        return Promise.all((listeners.get(type) || []).map(callback => callback(event)));
      },
      querySelector(selector) { return selectors.get(selector) ?? null; },
      querySelectorAll(selector) { return selectors.get(selector) ?? []; },
      contains(child) { return node === child || node.children.includes(child); },
      matches() { return false; },
      focus() { document.activeElement = node; },
      select() { document.selected = node; node.focus(); },
      append(child) { node.children.push(child); child.parent = node; },
      replaceChildren(...children) { node.children = children; },
      remove() {
        if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node);
        if (document.activeElement === node) document.activeElement = null;
      },
      showModal() { node.open = true; },
      close() { node.open = false; node.emit('close'); }
    };
    return node;
  }
  document.body = element({ page: 'test' });
  document.createElement = () => element();
  document.querySelector = selector => document.body.querySelector(selector);
  const artists = Array.from({ length: 9 }, (_, index) => ({
    id: `artist-${index}`, korean: `가수${index}`, name: `ARTIST ${index}`,
    fan: `FAN ${index}`, light: '#fff', accent: '#000', shape: '✳', image: `photo-${index}.jpg`
  }));
  const navigator = {};
  const context = {
    document, navigator, console, URL, URLSearchParams,
    location: { href: 'https://ojjuda.test/features/fanpages/index.html' },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setTimeout(callback, delay) { const id = nextTimer++; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval() { return nextTimer++; },
    clearInterval() {},
    matchMedia() { return { matches: reducedMotion }; },
    OJJUDA_FAN_ARTISTS: artists
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source.replace("  if (page === 'hub') initHub();", `
    window.testHandlers = { initFeatured, initShareButton, initPhotoViewer, initVideoViewer, initProgressiveReveal };
    if (page === 'hub') initHub();`), context);
  return {
    document, navigator, element, context, handlers: context.testHandlers,
    runTransitions() {
      for (let remaining = 20; remaining > 0; remaining--) {
        const next = [...timers].find(([, timer]) => timer.delay === 900);
        if (!next) return;
        timers.delete(next[0]); next[1].callback();
      }
      assert.fail('carousel transition did not settle');
    }
  };
}

function carousel(options) {
  const f = fixture(options);
  const stage = f.element();
  const track = f.element();
  const cards = Array.from({ length: 11 }, () => f.element());
  const dots = Array.from({ length: 9 }, () => f.element());
  stage.selectors.set('.feature-track', track);
  stage.selectors.set('.feature-slide', cards);
  stage.selectors.set('.feature-dot', dots);
  f.document.body.selectors.set('#featured-carousel', stage);
  f.handlers.initFeatured();
  return { ...f, stage, track, cards, dots, selected: () => dots.findIndex(dot => dot.getAttribute('aria-pressed') === 'true') };
}

test('carousel honors the last dot pressed while a slide is moving', async () => {
  const f = carousel();
  await f.dots[2].emit('click');
  await f.dots[5].emit('click');
  await f.dots[7].emit('click');
  f.runTransitions();
  assert.equal(f.selected(), 7);
  assert.equal(f.cards.filter(card => card.getAttribute('aria-hidden') === 'false').length, 1);
  assert.equal(f.cards[8].tabIndex, 0);
});

test('queued carousel choices survive the last-to-first wrap', async () => {
  const f = carousel();
  await f.dots[8].emit('click');
  f.runTransitions();
  await f.dots[0].emit('click');
  await f.dots[4].emit('click');
  f.runTransitions();
  assert.equal(f.selected(), 4);
  assert.equal(f.track.style.transform, 'translate3d(-500%, 0, 0)');
});

test('all carousel dots select their slide with reduced motion', async () => {
  const f = carousel({ reducedMotion: true });
  for (let index = 0; index < f.dots.length; index++) {
    await f.dots[index].emit('click');
    assert.equal(f.selected(), index);
  }
});

function shareButton(f) {
  const button = f.element();
  const label = f.element(); label.textContent = '공유';
  button.selectors.set('.share-label', label);
  f.handlers.initShareButton(button, 'https://ojjuda.test/features/fanpages/artist.html?group=rescene', '리센느');
  return { button, label };
}

test('share copies the canonical fanpage URL through the clipboard API', async () => {
  const f = fixture();
  let copied;
  f.navigator.clipboard = { async writeText(value) { copied = value; } };
  const { button, label } = shareButton(f);
  await button.emit('click');
  assert.equal(copied, 'https://ojjuda.test/features/fanpages/artist.html?group=rescene');
  assert.equal(label.textContent, '링크 복사됨');
});

test('failed clipboard writes use the fallback and return keyboard focus', async () => {
  const f = fixture();
  let copied;
  f.navigator.clipboard = { async writeText() { throw new Error('Permission denied'); } };
  f.document.execCommand = command => { assert.equal(command, 'copy'); copied = f.document.selected.value; return true; };
  const { button, label } = shareButton(f);
  button.focus();
  await button.emit('click');
  assert.equal(copied, 'https://ojjuda.test/features/fanpages/artist.html?group=rescene');
  assert.equal(label.textContent, '링크 복사됨');
  assert.equal(f.document.activeElement, button);
  assert.equal(f.document.body.children.length, 0);
});

test('unavailable clipboard reports a useful fallback instead of false success', async () => {
  const f = fixture();
  f.document.execCommand = () => false;
  const { button, label } = shareButton(f);
  await button.emit('click');
  assert.equal(label.textContent, '주소창에서 복사해 주세요');
});

test('cancelling native sharing does not silently copy to the clipboard', async () => {
  const f = fixture();
  f.navigator.share = async () => { throw Object.assign(new Error('Cancelled'), { name: 'AbortError' }); };
  f.navigator.clipboard = { writeText() { assert.fail('cancelled share must not copy'); } };
  const { button, label } = shareButton(f);
  await button.emit('click');
  assert.equal(label.textContent, '공유');
});

test('progressive reveal expands and collapses the controlled content and label', async () => {
  const f = fixture();
  const root = f.element();
  const target = f.element();
  const button = f.element({ revealTarget: 'photos', labelOpen: '사진 간단히 보기', labelClosed: '사진 5장 모두 보기' });
  const label = f.element();
  button.setAttribute('aria-expanded', 'false');
  button.selectors.set('.content-reveal-text', label);
  root.selectors.set('[data-reveal-target]', [button]);
  root.selectors.set('#photos', target);
  f.handlers.initProgressiveReveal(root);
  await button.emit('click');
  assert.equal(target.classList.contains('is-expanded'), true);
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(label.textContent, '사진 간단히 보기');
  await button.emit('click');
  assert.equal(target.classList.contains('is-expanded'), false);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(label.textContent, '사진 5장 모두 보기');
});

test('photo viewer navigation, failed image recovery and close restore the page', async () => {
  const f = fixture();
  const root = f.element(), dialog = f.element();
  const nodes = {};
  for (const selector of ['#photo-viewer-image', '#photo-viewer-missing', '#photo-viewer-number', '#photo-viewer-title', '#photo-viewer-credit', '#photo-viewer-source', '#photo-viewer-license', '.photo-viewer-close', '.photo-viewer-stage', '.photo-viewer-prev', '.photo-viewer-next']) {
    nodes[selector] = f.element(); dialog.selectors.set(selector, nodes[selector]);
  }
  const buttons = [f.element({ photoIndex: '0' }), f.element({ photoIndex: '1' })];
  root.selectors.set('#photo-viewer', dialog);
  root.selectors.set('[data-photo-index]', buttons);
  const artist = { korean: '테스트', photos: [
    { label: '첫 사진', meta: '2026', credit: 'A', image: '/a.jpg', full: '/a-full.jpg', href: 'https://example.test/a' },
    { label: '다음 사진', meta: '2026', credit: 'B', image: '/b.jpg', href: 'https://example.test/b', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' }
  ] };
  f.handlers.initPhotoViewer(root, artist);
  await buttons[0].emit('click');
  assert.equal(dialog.open, true);
  assert.equal(nodes['#photo-viewer-image'].src, '/a-full.jpg');
  nodes['#photo-viewer-image'].onerror();
  assert.equal(nodes['#photo-viewer-missing'].hidden, false);
  await dialog.emit('keydown', { key: 'ArrowRight' });
  assert.equal(nodes['#photo-viewer-image'].src, '/b.jpg');
  assert.equal(nodes['#photo-viewer-missing'].hidden, true);
  assert.equal(nodes['#photo-viewer-source'].href, 'https://example.test/b');
  assert.equal(nodes['#photo-viewer-license'].hidden, false);
  await nodes['.photo-viewer-prev'].emit('click');
  assert.equal(nodes['#photo-viewer-number'].textContent, '01 / 02');
  await nodes['.photo-viewer-close'].emit('click');
  assert.equal(dialog.open, false);
  assert.equal(f.document.body.classList.contains('photo-viewing'), false);
  assert.equal(f.document.activeElement, buttons[0]);
});

test('closing the video viewer releases the iframe and returns focus', async () => {
  const f = fixture();
  const root = f.element(), dialog = f.element();
  const player = f.element(), close = f.element(), original = f.element();
  dialog.selectors.set('#video-viewer-player', player);
  dialog.selectors.set('#video-viewer-title', f.element());
  dialog.selectors.set('#video-viewer-source', f.element());
  dialog.selectors.set('#video-viewer-original', original);
  dialog.selectors.set('.video-viewer-close', close);
  const button = f.element({ videoIndex: '0' });
  root.selectors.set('#video-viewer', dialog);
  root.selectors.set('[data-video-index]', [button]);
  f.handlers.initVideoViewer(root, [{ id: 'abcdefghijk', title: '공식 영상', kind: '뮤직비디오', source: '공식' }]);
  await button.emit('click');
  assert.equal(dialog.open, true);
  assert.equal(player.children.length, 1);
  assert.equal(player.children[0].src, 'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&rel=0');
  assert.equal(original.href, 'https://www.youtube.com/watch?v=abcdefghijk');
  await close.emit('click');
  assert.equal(dialog.open, false);
  assert.equal(player.children.length, 0);
  assert.equal(f.document.activeElement, button);
});
