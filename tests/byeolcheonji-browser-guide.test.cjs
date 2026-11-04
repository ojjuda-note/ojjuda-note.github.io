const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('byeolcheonji/browser-guide.js', 'utf8');
const index = fs.readFileSync('byeolcheonji/index.html', 'utf8');
const styles = fs.readFileSync('byeolcheonji/styles.css', 'utf8');
const KEY = 'ojjuda-byeolcheonji-browser-guide-v3';

class ClassList {
  constructor() { this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
}

class HTMLElementMock {
  constructor(id, document) {
    this.id = id;
    this.document = document;
    this.listeners = new Map();
    this.classList = new ClassList();
    this.style = {};
    this.checked = false;
    this.open = false;
    this.inert = false;
    this.textContent = '';
  }
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }
  emit(type, event = {}) {
    event.target ??= this;
    event.preventDefault ??= () => { event.defaultPrevented = true; };
    for (const handler of this.listeners.get(type) || []) handler(event);
    return event;
  }
  click() { this.emit('click'); }
  focus() { this.document.activeElement = this; }
  select() { this.selected = true; }
  showModal() { this.open = true; }
  close() { this.open = false; this.emit('close'); }
  setAttribute(name) { if (name === 'open') this.open = true; }
  removeAttribute(name) { if (name === 'open') this.open = false; }
}

function createHarness(initial = {}) {
  const values = new Map(Object.entries(initial));
  const document = { activeElement: null };
  const body = new HTMLElementMock('body', document);
  const shell = new HTMLElementMock('shell', document);
  document.body = body;
  const ids = [
    'browser-guide', 'browser-guide-open', 'browser-guide-confirm',
    'browser-guide-copy', 'browser-guide-address', 'browser-guide-feedback',
    'browser-guide-dont-show'
  ];
  const elements = Object.fromEntries(ids.map(id => [id, new HTMLElementMock(id, document)]));
  document.getElementById = id => elements[id] || null;
  document.querySelector = selector => selector === '.page-shell' ? shell : null;
  const localStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  const navigator = { clipboard: { writeText: async () => {} } };
  vm.runInNewContext(source, {
    document, localStorage, navigator, HTMLElement: HTMLElementMock,
    window: { matchMedia: () => ({ matches: false }) },
  });
  return { ...elements, body, shell, localStorage, document };
}

assert.match(index, /id="browser-guide-dont-show"[^>]*type="checkbox"/);
assert.match(index, /다시 안 보기/);
assert.match(index, /browser-guide\.js\?v=20261104-dontshow1/);
assert.match(styles, /\.browser-guide-skip\{/);

const first = createHarness();
assert.equal(first['browser-guide'].open, true, 'entry opens the browser guide');
assert.equal(first['browser-guide-dont-show'].checked, false);
first['browser-guide-confirm'].click();
assert.equal(first['browser-guide'].open, false);
assert.equal(first.localStorage.getItem(KEY), null, 'unchecked close does not suppress future visits');

const nextVisit = createHarness();
assert.equal(nextVisit['browser-guide'].open, true, 'unchecked close shows again next visit');
nextVisit['browser-guide-dont-show'].checked = true;
nextVisit['browser-guide-confirm'].click();
assert.equal(nextVisit.localStorage.getItem(KEY), 'hidden', 'checked close saves preference');

const hidden = createHarness({ [KEY]: 'hidden' });
assert.equal(hidden['browser-guide'].open, false, 'saved preference suppresses automatic popup');
hidden['browser-guide-open'].click();
assert.equal(hidden['browser-guide'].open, true, 'help button reopens popup');
assert.equal(hidden['browser-guide-dont-show'].checked, true, 'checkbox reflects saved preference');
hidden['browser-guide-dont-show'].checked = false;
hidden['browser-guide-confirm'].click();
assert.equal(hidden.localStorage.getItem(KEY), null, 'unchecking removes saved preference');

const afterReset = createHarness();
assert.equal(afterReset['browser-guide'].open, true, 'popup returns after removing preference');

console.log('byeolcheonji browser guide preference checks passed');
