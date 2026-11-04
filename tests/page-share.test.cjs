const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'page-share.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, page, options = {}) {
  const folder = page === 'festival' ? 'festival-schedule' : 'certified-restaurants';
  const html = fs.readFileSync(path.join(root, 'games', folder, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: `https://ojjuda.kr/games/${folder}/index.html?v=old&embedded=1&member-ratings=1&saved=1#private`,
    runScripts: 'outside-only'
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const shares = [], copies = [];
  if (options.share) window.navigator.share = payload => { shares.push(JSON.parse(JSON.stringify(payload))); return options.share(payload); };
  if (options.clipboard !== false) Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async url => {
    if (options.clipboardError) throw new Error('Clipboard blocked');
    copies.push(url);
  } } });
  window.eval(script);
  const button = window.document.querySelector('[data-share-page]');
  assert.equal(button.dataset.sharePage, page);
  assert.match(button.getAttribute('aria-label'), /페이지 공유/);
  assert.ok(window.document.querySelector('script[src^="/page-share.js?v="]'));
  assert.ok(window.document.querySelector('link[href^="/page-share.css?v="]'));
  return { window, document: window.document, button, shares, copies };
}

for (const page of ['festival', 'restaurants']) {
  test(`${page}: native sharing uses only the public direct-entry route`, async t => {
    let finish;
    const f = fixture(t, page, { share: () => new Promise(resolve => { finish = resolve; }) });
    f.button.click(); f.button.click();
    assert.equal(f.shares.length, 1, 'double taps do not open competing share sheets');
    assert.equal(f.shares[0].url, `https://ojjuda.kr/world.html?game=${page}`);
    assert.ok(f.shares[0].title && f.shares[0].text);
    assert.equal(f.button.disabled, true);
    finish(); await tick();
    assert.equal(f.button.disabled, false);
    assert.equal(f.copies.length, 0);
  });
  test(`${page}: unavailable native sharing copies a clean page link`, async t => {
    const f = fixture(t, page);
    f.button.click(); await tick();
    assert.deepEqual(f.copies, [`https://ojjuda.kr/world.html?game=${page}`]);
    assert.equal(f.document.querySelector('.page-share-notice').textContent, '페이지 링크를 복사했어요.');
    assert.equal(f.button.disabled, false);
  });
}

test('cancelling native sharing leaves the clipboard unchanged', async t => {
  const f = fixture(t, 'festival', { share: async () => { throw Object.assign(new Error('Cancelled'), { name: 'AbortError' }); } });
  f.button.click(); await tick();
  assert.deepEqual(f.copies, []);
  assert.equal(f.document.querySelector('.page-share-notice'), null);
  assert.equal(f.document.querySelector('.page-share-dialog'), null);
  assert.equal(f.button.disabled, false);
});

test('native permission failure falls back to copying', async t => {
  const f = fixture(t, 'restaurants', { share: async () => { throw new Error('Not allowed'); } });
  f.button.click(); await tick();
  assert.deepEqual(f.copies, ['https://ojjuda.kr/world.html?game=restaurants']);
});

for (const clipboard of [false, true]) {
  test(`manual copying works when clipboard is ${clipboard ? 'denied' : 'missing'}`, async t => {
    const f = fixture(t, 'restaurants', { clipboard, clipboardError: true });
    f.button.focus(); f.button.click(); await tick();
    const dialog = f.document.querySelector('.page-share-dialog');
    const field = dialog.querySelector('input');
    assert.equal(dialog.open, true);
    assert.equal(field.value, 'https://ojjuda.kr/world.html?game=restaurants');
    assert.equal(field.readOnly, true);
    assert.equal(field.selectionEnd, field.value.length);
    assert.equal(f.document.activeElement, field);
    assert.equal(f.document.querySelector('.page-share-notice'), null, 'never claim a failed copy succeeded');
    dialog.dispatchEvent(new f.window.Event('cancel', { cancelable: true }));
    assert.equal(dialog.isConnected, false);
    assert.equal(f.document.activeElement, f.button);
    f.button.click(); await tick();
    f.document.querySelector('.page-share-dialog button').click();
    assert.equal(f.document.querySelector('.page-share-dialog'), null);
  });
}

test('both embedded pages allow native sharing and clipboard writes', () => {
  for (const file of ['world-festival-schedule.js', 'world-restaurant-guide.js']) {
    const bridge = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(bridge, /allow="geolocation; clipboard-write; web-share"/);
  }
});
