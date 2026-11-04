from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


index_path = Path("byeolcheonji/index.html")
html = index_path.read_text(encoding="utf-8")
old_controls = '''    <p id="browser-guide-feedback" class="browser-guide-feedback" role="status" aria-live="polite"></p>
    <button id="browser-guide-confirm" class="browser-guide-confirm" type="button" autofocus>닫기</button>'''
new_controls = '''    <p id="browser-guide-feedback" class="browser-guide-feedback" role="status" aria-live="polite"></p>
    <label class="browser-guide-skip" for="browser-guide-dont-show">
      <input id="browser-guide-dont-show" type="checkbox">
      <span>다시 안 보기</span>
    </label>
    <button id="browser-guide-confirm" class="browser-guide-confirm" type="button" autofocus>닫기</button>'''
if html.count(old_controls) != 1:
    raise SystemExit("byeolcheonji/index.html: browser guide controls changed unexpectedly")
html = html.replace(old_controls, new_controls, 1)
for old, new in {
    "/byeolcheonji/styles.css?v=20261104-browser-emphasis1": "/byeolcheonji/styles.css?v=20261104-dontshow1",
    "/byeolcheonji/browser-guide.js?v=20261104-compact1": "/byeolcheonji/browser-guide.js?v=20261104-dontshow1",
}.items():
    if html.count(old) != 1:
        raise SystemExit(f"byeolcheonji/index.html: expected one asset reference {old!r}")
    html = html.replace(old, new, 1)
index_path.write_text(html, encoding="utf-8")

Path("byeolcheonji/browser-guide.js").write_text(
    """(() => {
  'use strict';
  const dialog = document.getElementById('browser-guide');
  const openButton = document.getElementById('browser-guide-open');
  const confirmButton = document.getElementById('browser-guide-confirm');
  const copyButton = document.getElementById('browser-guide-copy');
  const address = document.getElementById('browser-guide-address');
  const feedback = document.getElementById('browser-guide-feedback');
  const dontShowCheckbox = document.getElementById('browser-guide-dont-show');
  const shell = document.querySelector('.page-shell');
  const storageKey = 'ojjuda-byeolcheonji-browser-guide-v3';
  let previousFocus = null;
  let previousOverflow = '';

  function isHidden() {
    try { return localStorage.getItem(storageKey) === 'hidden'; }
    catch { return false; }
  }
  function savePreference() {
    try {
      if (dontShowCheckbox.checked) localStorage.setItem(storageKey, 'hidden');
      else localStorage.removeItem(storageKey);
    } catch { /* keep showing the guide when storage is unavailable */ }
  }
  function open() {
    if (dialog.open) return;
    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    feedback.textContent = '';
    dontShowCheckbox.checked = isHidden();
    document.body.style.overflow = 'hidden';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else { dialog.setAttribute('open', ''); dialog.classList.add('is-fallback'); shell.inert = true; }
    confirmButton.focus({ preventScroll: true });
  }
  function finish() {
    savePreference();
    document.body.style.overflow = previousOverflow;
    shell.inert = false;
    dialog.classList.remove('is-fallback');
    const focusTarget = previousFocus instanceof HTMLElement && previousFocus !== document.body ? previousFocus : openButton;
    focusTarget.focus({ preventScroll: true });
  }
  function close() {
    if (typeof dialog.close === 'function') dialog.close();
    else { dialog.removeAttribute('open'); finish(); }
  }

  openButton.addEventListener('click', open);
  confirmButton.addEventListener('click', close);
  dialog.addEventListener('close', finish);
  dialog.addEventListener('keydown', event => {
    if (!dialog.classList.contains('is-fallback')) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      if (event.shiftKey && document.activeElement === address) { event.preventDefault(); confirmButton.focus(); }
      else if (!event.shiftKey && document.activeElement === confirmButton) { event.preventDefault(); address.focus(); }
    }
  });
  copyButton.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText('https://ojjuda.kr/star'); feedback.textContent = '주소를 복사했어요.'; }
    catch { address.focus(); address.select(); feedback.textContent = '주소를 길게 눌러 복사해 주세요.'; }
  });

  if (!isHidden()) open();
})();
""",
    encoding="utf-8",
)

styles_path = Path("byeolcheonji/styles.css")
styles = styles_path.read_text(encoding="utf-8")
if ".browser-guide-skip{" in styles:
    raise SystemExit("byeolcheonji/styles.css: skip styles already exist")
styles += "\n.browser-guide-skip{display:flex;align-items:center;justify-content:center;gap:9px;width:max-content;max-width:100%;margin:14px auto 0;color:var(--green);font-size:13px;font-weight:700;cursor:pointer;user-select:none}.browser-guide-skip input{width:18px;height:18px;margin:0;accent-color:var(--green);cursor:pointer}.browser-guide-skip span{line-height:1.2}\n"
styles_path.write_text(styles, encoding="utf-8")

Path("tests/byeolcheonji-browser-guide.test.cjs").write_text(
    r'''const assert = require('node:assert/strict');
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
''',
    encoding="utf-8",
)
