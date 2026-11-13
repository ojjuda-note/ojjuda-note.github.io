const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { JSDOM } = require('jsdom');

const appDir = path.resolve(__dirname, '../features/biorhythm');
// It is still November 12 in UTC, but already November 13 in Korea.
const fixedNow = '2026-11-12T15:00:00.000Z';
const settle = () => new Promise(resolve => setImmediate(resolve));

async function page(t, options = {}) {
  const dom = new JSDOM(await fs.readFile(path.join(appDir, 'index.html'), 'utf8'), {
    url: 'https://ojjuda.kr/features/biorhythm/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const state = { network: [], storageWrites: [], copies: [], errors: [] };
  const NativeDate = window.Date;
  window.Date = class FixedDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [NativeDate.parse(options.now || fixedNow)])); }
    static now() { return NativeDate.parse(options.now || fixedNow); }
  };
  // Announcements need not keep a real timer alive in these interaction tests.
  let nextTimer = 0;
  const timers = new Map();
  window.setTimeout = (fn, delay) => { const id = ++nextTimer; timers.set(id, {fn, delay}); return id; };
  window.clearTimeout = id => timers.delete(id);
  window.matchMedia = () => ({matches: true, addEventListener() {}, removeEventListener() {}});
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.addEventListener('error', event => { state.errors.push(event.error || event.message); event.preventDefault(); });
  window.fetch = (...args) => { state.network.push(['fetch', ...args]); throw new Error('Birth information must stay in this page'); };
  window.XMLHttpRequest.prototype.open = function (...args) { state.network.push(['xhr', ...args]); throw new Error('Unexpected network request'); };
  Object.defineProperty(window.navigator, 'sendBeacon', {value: (...args) => { state.network.push(['beacon', ...args]); return false; }});
  const nativeSetItem = window.Storage.prototype.setItem;
  window.Storage.prototype.setItem = function (...args) { state.storageWrites.push(args); return nativeSetItem.apply(this, args); };
  if (options.clipboard !== false) Object.defineProperty(window.navigator, 'clipboard', {
    value: {writeText: options.writeText || (async text => { state.copies.push(text); })},
  });
  const context = dom.getInternalVMContext();
  const modules = new Map();
  async function load(identifier) {
    if (!modules.has(identifier)) modules.set(identifier, (async () => {
      const filename = fileURLToPath(identifier);
      assert.ok(filename.startsWith(appDir + path.sep), 'the fixture loads only this feature');
      return new vm.SourceTextModule(await fs.readFile(filename, 'utf8'), {context, identifier});
    })());
    return modules.get(identifier);
  }
  const entry = await load(pathToFileURL(path.join(appDir, 'app.mjs')).href);
  await entry.link((specifier, parent) => load(new URL(specifier, parent.identifier).href));
  await entry.evaluate();
  const $ = id => window.document.getElementById(id);
  function input(id, value) {
    $(id).value = value;
    $(id).dispatchEvent(new window.Event('input', {bubbles: true}));
  }
  function submit(birth, target) {
    if (birth !== undefined) input('birth-date', birth);
    if (target !== undefined) input('target-date', target);
    $('rhythm-form').dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true}));
    assert.deepEqual(state.errors, [], 'submitting should not throw a page error');
  }
  const click = id => $(id).click();
  t.after(() => {
    try {
      assert.deepEqual(state.errors, [], 'interactions should not throw page errors');
      assert.deepEqual(state.network, [], 'the calculator must not transmit input or analytics');
      assert.deepEqual(state.storageWrites, [], 'the calculator must not persist birth information');
      assert.equal(window.localStorage.length, 0);
      assert.equal(window.sessionStorage.length, 0);
      assert.equal(window.document.cookie, '');
      assert.equal(window.location.href, 'https://ojjuda.kr/features/biorhythm/');
    } finally { dom.window.close(); }
  });
  return {window, $, state, input, submit, click};
}

test('initial view uses the Korean date, waits for an explicit birth input, and explains its limits', async t => {
  const p = await page(t);
  assert.equal(p.$('target-date').value, '2026-11-13');
  assert.equal(p.$('birth-date').max, '2026-11-13');
  assert.equal(p.$('birth-date').value, '');
  assert.equal(p.$('results').hidden, true);
  assert.equal(p.$('calculate-button').disabled, false);
  assert.equal(p.$('sample-button').disabled, false);
  assert.ok(p.$('faq-list').querySelectorAll('details').length >= 8);
  assert.ok(p.$('source-links').querySelectorAll('a').length >= 2);
  assert.match(p.window.document.querySelector('.intro-note').textContent, /재미용/);
  assert.match(p.window.document.querySelector('.privacy-note').textContent, /저장하지/);
});

test('missing birth or target dates produce focused, recoverable field errors', async t => {
  const p = await page(t);
  p.submit();
  assert.equal(p.$('form-error').hidden, false);
  assert.match(p.$('form-error').textContent, /생년월일/);
  assert.equal(p.$('birth-date').getAttribute('aria-invalid'), 'true');
  assert.equal(p.window.document.activeElement, p.$('birth-date'));
  p.input('birth-date', '1990-04-17');
  assert.equal(p.$('form-error').hidden, true);
  assert.equal(p.$('birth-date').hasAttribute('aria-invalid'), false);
  p.submit(undefined, '');
  assert.match(p.$('form-error').textContent, /날짜/);
  assert.equal(p.window.document.activeElement, p.$('target-date'));
  assert.equal(p.$('results').hidden, true);
});

test('future birth dates, dates before birth, and unsupported years do not create a reading', async t => {
  const p = await page(t);
  p.submit('2026-11-14', '2026-11-14');
  assert.match(p.$('form-error').textContent, /오늘 이후/);
  assert.equal(p.$('results').hidden, true);
  p.submit('1990-04-17', '1990-04-16');
  assert.match(p.$('form-error').textContent, /생년월일과 같거나 이후/);
  assert.equal(p.$('target-date').getAttribute('aria-invalid'), 'true');
  assert.equal(p.$('results').hidden, true);
  p.submit('1899-12-31', '2026-11-13');
  assert.match(p.$('form-error').textContent, /1900/);
  assert.equal(p.$('results').hidden, true);
});

test('a leap-day birthday renders the three known one-day readings with calculation evidence', async t => {
  const p = await page(t);
  p.submit('2000-02-29', '2000-03-01');
  assert.equal(p.$('results').hidden, false);
  assert.equal(p.$('sample-badge').hidden, true);
  assert.equal(p.window.document.activeElement, p.$('result-title'));
  assert.match(p.$('result-title').textContent, /3월 1일/);
  assert.deepEqual(Array.from(p.$('rhythm-cards').querySelectorAll('.rhythm-value'), element => element.textContent), ['+27', '+22', '+19']);
  assert.equal(p.$('rhythm-cards').querySelectorAll('article').length, 3);
  assert.equal(p.$('suggestion-cards').querySelectorAll('article').length, 3);
  assert.match(p.$('calculation-evidence').textContent, /1일이 지났어요/);
  assert.match(p.$('calculation-evidence').textContent, /2000년 2월 29일/);
  assert.equal(p.$('chart-table').rows[0].dataset.date, '2000-02-29');
  assert.equal(p.$('chart-table').querySelectorAll('[aria-current="date"]').length, 1);
});

test('sample readings remain clearly labelled when navigating and disappear for a personal calculation', async t => {
  const p = await page(t);
  p.click('sample-button');
  assert.equal(p.$('birth-date').value, '1990-01-01');
  assert.equal(p.$('sample-badge').hidden, false);
  assert.match(p.$('sample-badge').textContent, /샘플/);
  p.click('next-day');
  assert.equal(p.$('sample-badge').hidden, false);
  p.click('copy-result');
  await settle();
  assert.match(p.state.copies[0], /샘플/);
  p.submit('1984-07-23', '2026-11-13');
  assert.equal(p.$('sample-badge').hidden, true);
});

test('date navigation crosses February 29 and disables the birth-date boundary', async t => {
  const p = await page(t);
  p.submit('2000-02-28', '2000-02-28');
  assert.equal(p.$('previous-day').disabled, true);
  p.click('previous-day');
  assert.equal(p.$('target-date').value, '2000-02-28');
  p.click('next-day');
  assert.equal(p.$('target-date').value, '2000-02-29');
  assert.equal(p.$('previous-day').disabled, false);
  p.click('next-day');
  assert.equal(p.$('target-date').value, '2000-03-01');
  p.click('previous-day');
  assert.equal(p.$('target-date').value, '2000-02-29');
  p.click('result-today');
  assert.equal(p.$('target-date').value, '2026-11-13');
  p.submit('2000-02-28', '2100-12-31');
  assert.equal(p.$('next-day').disabled, true);
});

test('slider, date table, and graph clicks select the same date and keep table focus intact', async t => {
  const p = await page(t);
  p.submit('2000-01-01', '2000-03-20');
  assert.equal(p.$('chart-table').rows.length, 31);
  assert.equal(p.$('chart-slider').value, '15');
  const firstValues = Array.from(p.$('chart-table').rows[0].cells).slice(1, 4).map(cell => cell.textContent);
  p.input('chart-slider', '0');
  assert.equal(p.$('target-date').value, '2000-03-05');
  assert.match(p.$('chart-slider').getAttribute('aria-valuetext'), /3월 5일/);
  assert.deepEqual(Array.from(p.$('rhythm-cards').querySelectorAll('.rhythm-value'), element => element.textContent), firstValues);
  const dateButton = p.$('chart-table').querySelector('button[data-date="2000-03-12"]');
  dateButton.focus();
  dateButton.click();
  assert.equal(p.$('target-date').value, '2000-03-12');
  assert.equal(p.window.document.activeElement, dateButton);
  assert.equal(p.$('chart-table').querySelector('[aria-current="date"]').dataset.date, '2000-03-12');
  const svg = p.$('chart-holder').querySelector('svg');
  svg.getBoundingClientRect = () => ({left: 0, width: 900});
  svg.dispatchEvent(new p.window.MouseEvent('click', {bubbles: true, clientX: 875}));
  assert.equal(p.$('target-date').value, '2000-04-04');
  assert.equal(p.$('chart-slider').value, '30');
});

test('legend controls hide individual graph lines while keeping one visible and all readings available', async t => {
  const p = await page(t);
  p.submit('1990-04-17', '2026-11-13');
  const count = () => p.$('chart-holder').querySelectorAll('.chart-path').length;
  const toggle = id => p.window.document.querySelector(`button[data-cycle="${id}"]`).click();
  assert.equal(count(), 3);
  toggle('physical');
  assert.equal(count(), 2);
  assert.equal(p.window.document.querySelector('button[data-cycle="physical"]').getAttribute('aria-pressed'), 'false');
  toggle('emotional');
  assert.equal(count(), 1);
  toggle('intellectual');
  assert.equal(count(), 1);
  assert.match(p.$('status').textContent, /선 하나/);
  toggle('physical');
  assert.equal(count(), 2);
  assert.equal(p.$('rhythm-cards').querySelectorAll('article').length, 3);
});

test('editing either input removes the old reading until explicitly recalculated', async t => {
  const p = await page(t);
  p.submit('1984-07-23', '2026-11-13');
  p.input('birth-date', '1985-07-23');
  assert.equal(p.$('results').hidden, true);
  assert.equal(p.$('calculation-evidence').textContent, '');
  assert.equal(p.$('chart-table').rows.length, 0);
  assert.equal(p.$('rhythm-cards').children.length, 0);
  p.submit();
  assert.equal(p.$('results').hidden, false);
  p.input('target-date', '2026-11-14');
  assert.equal(p.$('results').hidden, true);
  p.click('input-today');
  assert.equal(p.$('target-date').value, '2026-11-13');
  assert.equal(p.$('results').hidden, true);
});

test('clear removes birth input, calculated values, and clipboard fallback while keeping the Korean today default', async t => {
  const p = await page(t, {clipboard: false});
  p.submit('1984-07-23', '2026-11-13');
  p.click('copy-result');
  await settle();
  assert.equal(p.$('copy-fallback').hidden, false);
  p.click('clear-button');
  assert.equal(p.$('birth-date').value, '');
  assert.equal(p.$('target-date').value, '2026-11-13');
  assert.equal(p.$('results').hidden, true);
  assert.equal(p.$('copy-fallback').hidden, true);
  assert.equal(p.$('copy-text').value, '');
  assert.equal(p.$('calculation-evidence').textContent, '');
  assert.equal(p.$('chart-holder').textContent, '');
  assert.equal(p.window.document.activeElement, p.$('birth-date'));
});

test('copying includes only the selected-day results, the feature link, and the entertainment notice', async t => {
  const p = await page(t);
  p.submit('1984-07-23', '2026-11-13');
  p.click('copy-result');
  await settle();
  assert.equal(p.state.copies.length, 1);
  const copy = p.state.copies[0];
  assert.match(copy, /2026년 11월 13일/);
  for (const axis of ['신체', '감정', '지성']) assert.ok(copy.includes(axis));
  assert.match(copy, /재미로/);
  assert.match(copy, /https:\/\/ojjuda\.kr\/features\/biorhythm\/$/);
  assert.doesNotMatch(copy, /1984|7월 23일|birth|생년월일|[?&]/);
  assert.equal(p.$('copy-fallback').hidden, true);
  assert.match(p.$('status').textContent, /복사했어요/);
});

test('clipboard denial offers selectable text without the birth date', async t => {
  const p = await page(t, {writeText: async () => { throw new Error('permission denied'); }});
  p.submit('1984-07-23', '2026-11-13');
  p.click('copy-result');
  await settle();
  assert.equal(p.$('copy-fallback').hidden, false);
  assert.equal(p.$('copy-text').readOnly, true);
  assert.equal(p.window.document.activeElement, p.$('copy-text'));
  assert.equal(p.$('copy-text').selectionStart, 0);
  assert.equal(p.$('copy-text').selectionEnd, p.$('copy-text').value.length);
  assert.match(p.$('copy-text').value, /2026년 11월 13일/);
  assert.doesNotMatch(p.$('copy-text').value, /1984|7월 23일/);
});

test('a late clipboard rejection cannot recreate a reading after the user clears the page', async t => {
  let rejectCopy;
  const pendingCopy = new Promise((resolve, reject) => { rejectCopy = reject; });
  const p = await page(t, {writeText: () => pendingCopy});
  p.submit('1984-07-23', '2026-11-13');
  p.click('copy-result');
  p.click('clear-button');
  rejectCopy(new Error('late clipboard denial'));
  await settle();
  assert.equal(p.$('results').hidden, true);
  assert.equal(p.$('copy-fallback').hidden, true);
  assert.equal(p.$('copy-text').value, '');
  assert.equal(p.window.document.activeElement, p.$('birth-date'));
});

test('a late clipboard rejection cannot replace the currently selected date with an older copy', async t => {
  let rejectCopy;
  const pendingCopy = new Promise((resolve, reject) => { rejectCopy = reject; });
  const p = await page(t, {writeText: () => pendingCopy});
  p.submit('1984-07-23', '2026-11-13');
  p.click('copy-result');
  p.click('next-day');
  rejectCopy(new Error('late clipboard denial'));
  await settle();
  assert.equal(p.$('results').hidden, false);
  assert.equal(p.$('target-date').value, '2026-11-14');
  assert.equal(p.$('copy-fallback').hidden, true);
  assert.equal(p.$('copy-text').value, '');
});
