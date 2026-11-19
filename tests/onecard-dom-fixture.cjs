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
async function screen({ server = null, actor = null, saved = null, animate = false, width = 750, height = 750, query = '' } = {}) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'games/onecard/index.html'), 'utf8'), {
    url: `https://ojjuda.kr/games/onecard/${query}`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole,
  });
  const w = dom.window, sounds = [], animations = [], requests = [], responses = [], clients = [];
  let currentActor = actor, authChange, hidden = false;
  w.structuredClone = structuredClone;
  Object.defineProperty(w.crypto, 'randomUUID', { value: () => crypto.randomUUID() });
  w.matchMedia = () => ({ matches: !animate, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
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
  Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return ['onecard-app', 'hand'].includes(this.id) ? width : this.classList.contains('playing-card') ? cardWidth : 100; } });
  Object.defineProperty(w.HTMLElement.prototype, 'offsetWidth', { get() { return this.classList.contains('playing-card') ? cardWidth : this.clientWidth; } });
  const rectangle = (left, top, boxWidth, boxHeight) => ({ x: left, y: top, left, top, width: boxWidth, height: boxHeight, right: left + boxWidth, bottom: top + boxHeight });
  w.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.id === 'onecard-app') return rectangle(0, 0, width, height);
    if (this.id === 'hand') return rectangle(12, height - 200, width - 24, 140);
    if (this.matches('#stock-card > .playing-card')) return rectangle(width / 2 - 100, height * .4, cardWidth, cardHeight);
    if (this.matches('#discard-card > .playing-card')) return rectangle(width / 2 + 20, height * .4, cardWidth, cardHeight);
    const seat = this.closest('.seat');
    if (seat) {
      if (this.classList.contains('seat-fan') && height <= 640) return rectangle(0, 0, 0, 0);
      const positions = { top: [.5, .1], 'top-left': [.3, .1], 'top-right': [.7, .1], left: [.1, .3], right: [.9, .3] };
      const [x, y] = positions[seat.dataset.position] || [.5, .1];
      return rectangle(width * x - 20, height * y, this.classList.contains('avatar') ? 36 : 58, this.classList.contains('avatar') ? 36 : 32);
    }
    if (this.classList.contains('hand-card')) return rectangle(width / 2 - cardWidth / 2 + parseFloat(this.style.getPropertyValue('--x') || '0'), height - 190, cardWidth, cardHeight);
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
    const code = fs.readFileSync(path.join(ROOT, `games/onecard/${file}`), 'utf8').replace(/^export /gm, '');
    w.eval(`(function(){${code}\nwindow.${namespace}={${names}};})();`);
  }
  load('cards.mjs', 'createCard,cardLabel', '__cards');
  load('motion.mjs', 'createCardMotion', '__motion');
  load('online.mjs', 'createOnlineClient,pollDelay', '__onlineModule');
  w.__online = { createOnlineClient(options) { const client = w.__onlineModule.createOnlineClient(options); clients.push(client); return client; } };
  if (saved) w.localStorage.setItem(STORAGE, JSON.stringify(saved));
  const imports = { engine: '__rules', cards: '__cards', sound: '__audio', motion: '__motion', online: '__online' };
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
