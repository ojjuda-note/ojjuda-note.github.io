const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '../features/fanpages');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const data = ['photo-manifest.js', 'artists.js', 'artists-extra.js', 'profiles.js', 'profiles-extra.js', 'videos.js', 'popularity.js'].map(read).join('\n');
const behavior = read('fan.js');
const savedKey = 'ojjuda-fanpages-saved-v1';

function page(kind = 'artist', { saved = [], blockedRead = false, blockedWrite = false } = {}) {
  const html = kind === 'hub' ? 'index.html' : 'artist.html';
  const dom = new JSDOM(read(html), {
    url: `https://ojjuda.test/features/fanpages/${html}${kind === 'artist' ? '?group=bts' : ''}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;
  window.matchMedia = () => ({ matches: true });
  const originalGet = window.Storage.prototype.getItem;
  const originalSet = window.Storage.prototype.setItem;
  const originalRemove = window.Storage.prototype.removeItem;
  originalSet.call(window.localStorage, savedKey, JSON.stringify(saved));
  const storage = { blockedRead, blockedWrite };
  window.Storage.prototype.getItem = function (key) {
    if (key === savedKey && storage.blockedRead) throw new window.DOMException('Storage blocked', 'SecurityError');
    return originalGet.call(this, key);
  };
  window.Storage.prototype.setItem = function (key, value) {
    if (key === savedKey && storage.blockedWrite) throw new window.DOMException('Storage full', 'QuotaExceededError');
    return originalSet.call(this, key, value);
  };
  window.eval(`${data}\n${behavior}`);
  return {
    window, document: window.document, storage,
    close: () => window.close(),
    stored: () => JSON.parse(originalGet.call(window.localStorage, savedKey) || '[]'),
    externallySave(next, { dispatch = true, key = savedKey } = {}) {
      const oldValue = originalGet.call(window.localStorage, savedKey);
      if (next === null) originalRemove.call(window.localStorage, savedKey);
      else originalSet.call(window.localStorage, savedKey, JSON.stringify(next));
      if (dispatch) window.dispatchEvent(new window.StorageEvent('storage', {
        key, oldValue, newValue: next === null ? null : JSON.stringify(next),
        storageArea: window.localStorage,
        url: 'https://ojjuda.test/features/fanpages/index.html'
      }));
    },
    showAgain() {
      window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted: true }));
    },
    visibility(state) {
      Object.defineProperty(window.document, 'visibilityState', { configurable: true, value: state });
      window.document.dispatchEvent(new window.Event('visibilitychange'));
    }
  };
}

const savedButton = (f, id = 'bts') => f.document.querySelector(f.document.body.dataset.page === 'artist' ? '#detail-save' : `[data-save="${id}"]`);
const notice = f => f.document.getElementById('fan-saved-status');
const filter = (f, value) => f.document.querySelector(`[data-category="${value}"]`);
const search = f => f.document.getElementById('artist-search');
const gridIds = f => [...f.document.querySelectorAll('#artist-grid [data-save]')].map(button => button.dataset.save);

test('the hub can register and remove a temporary favorite when storage writes fail', () => {
  const f = page('hub', { blockedWrite: true });
  try {
    savedButton(f).focus();
    savedButton(f).click();
    assert.equal(savedButton(f).getAttribute('aria-pressed'), 'true');
    assert.equal(f.document.activeElement, savedButton(f));
    assert.deepEqual(f.stored(), [], 'the failure must not be reported as durable storage');
    assert.match(notice(f).textContent, /이 화면에서만/);
    assert.equal(notice(f).getAttribute('role'), 'status');
    filter(f, 'saved').click();
    assert.deepEqual(gridIds(f), ['bts']);
    savedButton(f).click();
    assert.deepEqual(gridIds(f), []);
    assert.equal(f.document.activeElement, filter(f, 'saved'));
    assert.equal(f.document.getElementById('empty-content').hidden, false);
    assert.equal(notice(f), null, 'undoing the unsaved change restores the persistent state');
  } finally { f.close(); }
});

test('a saved artist can be temporarily removed and restored without losing existing favorites', () => {
  const f = page('artist', { saved: ['bts', 'twice'], blockedWrite: true });
  try {
    const button = savedButton(f);
    button.click();
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    assert.match(button.textContent, /관심 등록$/);
    assert.deepEqual(f.stored(), ['bts', 'twice']);
    assert.ok(notice(f));
    button.click();
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.match(button.textContent, /관심 등록됨/);
    assert.deepEqual(f.stored(), ['bts', 'twice']);
    assert.equal(notice(f), null);
  } finally { f.close(); }
});

test('blocked storage reads and writes still allow reversible choices in the current page', () => {
  const f = page('artist', { blockedRead: true, blockedWrite: true });
  try {
    const button = savedButton(f);
    button.click();
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.ok(notice(f));
    button.click();
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    button.click();
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.deepEqual(f.stored(), []);
  } finally { f.close(); }
});

test('storage recovery merges pending choices with favorites saved by another tab', () => {
  const f = page('artist', { blockedWrite: true });
  try {
    savedButton(f).click();
    assert.ok(notice(f));
    f.externallySave(['twice']);
    assert.equal(savedButton(f).getAttribute('aria-pressed'), 'true');
    assert.deepEqual(f.stored(), ['twice']);
    f.storage.blockedWrite = false;
    f.showAgain();
    assert.deepEqual(f.stored().sort(), ['bts', 'twice']);
    assert.equal(notice(f), null);
    savedButton(f).click();
    assert.deepEqual(f.stored(), ['twice']);
    assert.equal(savedButton(f).getAttribute('aria-pressed'), 'false');
    const restored = page('artist', { saved: f.stored() });
    try { assert.equal(savedButton(restored).getAttribute('aria-pressed'), 'false'); }
    finally { restored.close(); }
  } finally { f.close(); }
});

test('another tab updates the artist button before the next click, including cleared storage', () => {
  const f = page('artist');
  try {
    const button = savedButton(f);
    button.focus();
    f.externallySave(['bts']);
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.match(button.textContent, /관심 등록됨/);
    assert.equal(f.document.activeElement, button);
    button.click();
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    assert.deepEqual(f.stored(), []);
    f.externallySave(['bts']);
    f.externallySave(null, { key: null });
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    assert.equal(notice(f), null);
  } finally { f.close(); }
});

test('hub synchronization preserves search, active category and the focused artist link', () => {
  const f = page('hub');
  try {
    filter(f, 'boy').click();
    search(f).value = 'BTS';
    search(f).dispatchEvent(new f.window.Event('input', { bubbles: true }));
    const link = f.document.querySelector('#artist-grid .tile-cover');
    link.focus();
    f.externallySave(['bts', 'twice']);
    assert.equal(search(f).value, 'BTS');
    assert.equal(filter(f, 'boy').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(gridIds(f), ['bts']);
    assert.equal(savedButton(f).getAttribute('aria-pressed'), 'true');
    assert.equal(f.document.activeElement, f.document.querySelector('#artist-grid .tile-cover'));
    search(f).focus();
    f.externallySave([]);
    assert.equal(f.document.activeElement, search(f));
    assert.equal(savedButton(f).getAttribute('aria-pressed'), 'false');
    assert.equal(search(f).value, 'BTS');
  } finally { f.close(); }
});

test('external removals keep the saved filter and move focus to a remaining item or the filter', () => {
  const f = page('hub', { saved: ['bts', 'twice'] });
  try {
    filter(f, 'saved').click();
    const [first, second] = gridIds(f);
    savedButton(f, first).focus();
    f.externallySave([second]);
    assert.deepEqual(gridIds(f), [second]);
    assert.equal(f.document.activeElement, savedButton(f, second));
    assert.equal(filter(f, 'saved').getAttribute('aria-pressed'), 'true');
    f.externallySave([]);
    assert.deepEqual(gridIds(f), []);
    assert.equal(f.document.activeElement, filter(f, 'saved'));
    assert.equal(f.document.getElementById('empty-content').hidden, false);
  } finally { f.close(); }
});

test('returning from page history or another app refreshes favorites without a storage event', () => {
  const f = page('artist');
  try {
    const button = savedButton(f);
    button.focus();
    f.externallySave(['bts'], { dispatch: false });
    f.showAgain();
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    f.visibility('hidden');
    f.externallySave([], { dispatch: false });
    f.visibility('visible');
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    f.externallySave(['bts'], { dispatch: false });
    f.window.dispatchEvent(new f.window.Event('focus'));
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.equal(f.document.activeElement, button);
  } finally { f.close(); }
});

test('unrelated storage changes do not replace a focused card or change its state', () => {
  const f = page('hub');
  try {
    const button = savedButton(f);
    button.focus();
    f.window.dispatchEvent(new f.window.StorageEvent('storage', {
      key: 'another-feature', newValue: 'value', storageArea: f.window.localStorage
    }));
    assert.equal(savedButton(f), button);
    assert.equal(f.document.activeElement, button);
    assert.equal(button.getAttribute('aria-pressed'), 'false');
  } finally { f.close(); }
});
