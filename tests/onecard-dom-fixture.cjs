const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.resolve(__dirname, '..');
const STORAGE = 'ojjuda-onecard-solo-v1';
const pause = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 7000) {
  const start = Date.now();
  while (!fn()) { if (Date.now() - start > timeout) throw Error(`timeout: ${label}`); await pause(); }
}

/** Browser APIs are mocked; game/app/client/Edge/SQL code stays real. Not a layout/FPS test. */
async function screen({ server = null, actor = null, saved = null, animate = false, width = 750, height = 750, query = '', seatRolls = [.999999], sortMode } = {}) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'games/onecard/index.html'), 'utf8'), {
    url: `https://ojjuda.kr/games/onecard/${query}`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole,
  });
  const w = dom.window, sounds = [], animations = [], requests = [], responses = [], clients = [];
  let seatRoll = 0;
  // App seating uses the browser RNG; the imported rules keep their own real RNG.
  w.Math.random = () => seatRolls[Math.min(seatRoll++, seatRolls.length - 1)];
  let currentActor = actor, authChange, hidden = false;
  w.structuredClone = structuredClone;
  Object.defineProperty(w.crypto, 'randomUUID', { value: () => crypto.randomUUID() });
  w.matchMedia = () => ({ matches: !animate, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.PointerEvent = class extends w.MouseEvent {
    constructor(type, options = {}) {
      super(type, options);
      for (const [key, value] of Object.entries({ pointerId: 1, pointerType: 'mouse', isPrimary: true, ...options }))
        if (['pointerId', 'pointerType', 'isPrimary'].includes(key)) Object.defineProperty(this, key, { value });
    }
  };
  const captured = new WeakMap(), scrollPositions = new WeakMap();
  w.HTMLElement.prototype.setPointerCapture = function (id) { captured.set(this, id); };
  w.HTMLElement.prototype.hasPointerCapture = function (id) { return captured.get(this) === id; };
  w.HTMLElement.prototype.releasePointerCapture = function (id) { if (captured.get(this) === id) captured.delete(this); };
  Object.defineProperty(w.HTMLElement.prototype, 'scrollLeft', {
    get() { return scrollPositions.get(this) || 0; },
    set(value) {
      const next = this.id === 'hand-scroll' ? Math.max(0, Math.min(Number(value), this.scrollWidth - this.clientWidth)) : Number(value);
      if (next === this.scrollLeft) return;
      scrollPositions.set(this, next); this.dispatchEvent(new w.Event('scroll'));
    },
  });
  w.HTMLElement.prototype.scrollTo = function (options, y) { this.scrollLeft = typeof options === 'number' ? options : options.left ?? this.scrollLeft; };
  w.HTMLElement.prototype.scrollBy = function (options, y) { this.scrollLeft += typeof options === 'number' ? options : options.left || 0; };
  Object.defineProperty(w.document, 'hidden', { get: () => hidden });
  Object.defineProperty(w.document, 'visibilityState', { get: () => hidden ? 'hidden' : 'visible' });
  Object.defineProperty(w.document, 'timeline', { value: { currentTime: 1000 } });
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () {
    if (!this.open) return;
    this.removeAttribute('open');
    w.setTimeout(() => this.dispatchEvent(new w.Event('close')), 0);
  };
  const normalTimeout = w.setTimeout.bind(w);
  w.setTimeout = (fn, ms, ...args) => normalTimeout(fn, ms === 720 ? 100 : ms, ...args);
  const cardWidth = height <= 640 ? 61 : width <= 520 ? 69 : 78, cardHeight = height <= 640 ? 88 : width <= 520 ? 100 : 112;
  const originalStyle = w.getComputedStyle.bind(w);
  w.getComputedStyle = element => {
    const style = originalStyle(element), originalGet = style.getPropertyValue.bind(style);
    style.getPropertyValue = name => name === '--card-w' ? `${cardWidth}px` : name === '--card-h' ? `${cardHeight}px` : originalGet(name);
    return style;
  };
  Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() {
    if (this.id === 'onecard-app') return width;
    if (this.id === 'hand-scroll') return width - 24;
    if (this.id === 'hand') return parseFloat(this.style.width) || width - 24;
    return this.classList.contains('playing-card') ? cardWidth : 100;
  } });
  Object.defineProperty(w.HTMLElement.prototype, 'scrollWidth', { get() {
    return this.id === 'hand-scroll' ? Math.max(this.clientWidth, w.document.getElementById('hand').clientWidth) : this.clientWidth;
  } });
  Object.defineProperty(w.HTMLElement.prototype, 'offsetWidth', { get() { return this.classList.contains('playing-card') ? cardWidth : this.clientWidth; } });
  const rectangle = (left, top, boxWidth, boxHeight) => ({ x: left, y: top, left, top, width: boxWidth, height: boxHeight, right: left + boxWidth, bottom: top + boxHeight });
  w.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.id === 'onecard-app') return rectangle(0, 0, width, height);
    if (this.id === 'hand-scroll') return rectangle(12, height - 200, width - 24, 140);
    if (this.id === 'hand') return rectangle(12 - (this.parentElement?.scrollLeft || 0), height - 200, this.clientWidth, 140);
    if (this.matches('#stock-card > .playing-card')) return rectangle(width / 2 - 100, height * .4, cardWidth, cardHeight);
    if (this.matches('#discard-card > .playing-card')) return rectangle(width / 2 + 20, height * .4, cardWidth, cardHeight);
    const seat = this.closest('.seat');
    if (seat) {
      if (this.classList.contains('seat-fan') && height <= 640) return rectangle(0, 0, 0, 0);
      const positions = { top: [.5, .1], 'top-left': [.3, .1], 'top-right': [.7, .1], left: [.1, .3], right: [.9, .3] };
      const [x, y] = positions[seat.dataset.position] || [.5, .1];
      return rectangle(width * x - 20, height * y, this.classList.contains('avatar') ? 36 : 58, this.classList.contains('avatar') ? 36 : 32);
    }
    if (this.classList.contains('hand-card')) {
      const hand = w.document.getElementById('hand'), scroll = w.document.getElementById('hand-scroll');
      return rectangle(12 + hand.clientWidth / 2 - cardWidth / 2 + parseFloat(this.style.getPropertyValue('--x') || '0') - (scroll?.scrollLeft || 0),
        height - 200 + parseFloat(this.style.getPropertyValue('--y') || '0'), cardWidth, cardHeight);
    }
    return rectangle(0, 0, 100, 40);
  };
  w.Element.prototype.animate = function (frames, options) {
    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    const animation = { node: this, frames, options, finished, startTime: null, complete: false,
      finish() { if (!this.complete) { this.complete = true; finish(); } }, cancel() { this.finish(); } };
    animations.push(animation); return animation;
  };
  w.OjjudaGetClient = async () => ({
    auth: {
      getSession: async () => ({ data: { session: currentActor ? { access_token: 'fixture', user: { id: currentActor, is_anonymous: false } } : null } }),
      onAuthStateChange: callback => { authChange = callback; return { data: { subscription: { unsubscribe() { authChange = null; } } } }; },
    },
    functions: { invoke: async (name, { body }) => {
      assert.equal(name, 'onecard'); requests.push(structuredClone(body));
      const response = await server.call(currentActor, body); responses.push(response);
      return { data: response, error: response.ok ? null : { context: { json: async () => response } } };
    } },
  });
  w.__rules = await import('../games/onecard/engine.mjs');
  const audio = { enabled: true };
  w.__audio = { createOnecardSound: () => ({
    get enabled() { return audio.enabled; }, setEnabled(value) { audio.enabled = !!value; },
    unlock: async () => true, play(kind) { sounds.push(kind); return true; }, stop() {}, dispose() {},
  }) };
  function load(file, names, namespace) {
    const source = fs.readFileSync(path.join(ROOT, `games/onecard/${file}`), 'utf8');
    if (!names) names = [...source.matchAll(/^export (?:async )?(?:function|const|let|class)\s+(\w+)/gm)].map(match => match[1]).join(',');
    const code = source
      .replace(/^import \{([^}]+)\} from '\.\/engine\.mjs[^']*';/gm, (_, imported) => `const {${imported}}=window.__rules;`)
      .replace(/^export /gm, '');
    w.eval(`(function(){${code}\nwindow.${namespace}={${names}};})();`);
  }
  load('cards.mjs', 'createCard,cardLabel', '__cards');
  load('motion.mjs', 'createCardMotion', '__motion');
  load('hand.mjs', null, '__hand');
  load('online.mjs', 'createOnlineClient,pollDelay', '__onlineModule');
  w.__online = { createOnlineClient(options) { const client = w.__onlineModule.createOnlineClient(options); clients.push(client); return client; } };
  for (const file of ['shared/games/game-entry.js', 'features/arcade/arcade-rooms.js'])
    w.eval(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  if (saved) w.localStorage.setItem(STORAGE, JSON.stringify(saved));
  if (sortMode) w.localStorage.setItem('ojjuda-onecard-hand-sort-v1', sortMode);
  const imports = { engine: '__rules', cards: '__cards', sound: '__audio', motion: '__motion', online: '__online', hand: '__hand' };
  const code = fs.readFileSync(path.join(ROOT, 'games/onecard/app.mjs'), 'utf8').replace(/^import \{([^}]+)\} from '\.\/([^/.]+)\.mjs[^']*';/gm, (_, names, file) => `const {${names}}=window.${imports[file]};`);
  w.eval(`(function(){${code}\n})();`);
  const find = selector => w.document.querySelector(selector);
  const click = selector => {
    const node = find(selector); assert.ok(node, `element exists: ${selector}`);
    assert.equal(node.disabled, false, `element enabled: ${selector}`); node.click();
  };
  return {
    w, errors, sounds, animations, requests, responses, find, click,
    all: selector => [...w.document.querySelectorAll(selector)],
    button(text) { const node = [...w.document.querySelectorAll('button')].find(button => button.textContent.trim() === text); assert.ok(node, `button ${text}`); assert.equal(node.disabled, false); node.click(); },
    get saved() { return JSON.parse(w.localStorage.getItem(STORAGE) || 'null')?.state; },
    get client() { return clients.at(-1); },
    async poll() { await clients.at(-1)?.read(); await pause(); },
    async settle() { await pause(); },
    pointer(selector, type, options = {}) {
      const node = find(selector); assert.ok(node, `pointer target exists: ${selector}`);
      const event = new w.PointerEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, ...options });
      node.dispatchEvent(event); return event;
    },
    async finishAnimations() {
      for (const animation of animations) animation.finish();
      await until(() => !find('.flying-card'), 'all motion resolves'); await pause();
    },
    escape() { const dialog = find('#sheet'), event = new w.Event('cancel', { cancelable: true }); if (dialog.dispatchEvent(event)) dialog.close(); },
    visibility(value) { hidden = value; w.document.dispatchEvent(new w.Event('visibilitychange')); },
    changeActor(id) { currentActor = id; authChange?.('SIGNED_OUT', id ? { user: { id } } : null); },
    close() { w.dispatchEvent(new w.Event('pagehide')); for (const client of clients) client.close(); dom.window.close(); },
  };
}

module.exports = { screen, until, pause };
