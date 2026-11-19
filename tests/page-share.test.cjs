const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'shared/share/page-share.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const services = {
  agit: { label: '아지트', path: '/world.html?tab=hub' },
  park: { label: '공원', path: '/world.html?place=park' },
  pajang: { label: '파장', path: '/features/pajang/' }
};

function fixture(t, page, options = {}) {
  const folder = page === 'festival' ? 'festival-schedule' : 'certified-restaurants';
  const service = services[page];
  const html = service
    ? `<main><button type="button" data-share-page="${page}" aria-label="${service.label} 초대 링크 공유"><span>초대</span></button></main>`
    : fs.readFileSync(path.join(root, 'games', folder, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: service
      ? 'https://ojjuda.kr/features/pajang/station.html?embed=1&member=private&ref=old&code=secret#messages'
      : `https://ojjuda.kr/games/${folder}/index.html?v=old&embedded=1&member-ratings=1&saved=1#private`,
    runScripts: 'outside-only'
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const shares = [], copies = [], copyAttempts = [];
  if (options.share) window.navigator.share = payload => { shares.push(JSON.parse(JSON.stringify(payload))); return options.share(payload); };
  if (options.clipboard !== false) Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async url => {
    copyAttempts.push(url);
    if (options.clipboardError) throw new Error('Clipboard blocked');
    copies.push(url);
  } } });
  window.eval(script);
  const button = window.document.querySelector('[data-share-page]');
  assert.equal(button.dataset.sharePage, page);
  if (!service) {
    assert.match(button.getAttribute('aria-label'), /페이지 공유/);
    assert.ok(window.document.querySelector('script[src^="/shared/share/page-share.js?v="]'));
    assert.ok(window.document.querySelector('link[href^="/shared/share/page-share.css?v="]'));
  }
  return { window, document: window.document, button, shares, copies, copyAttempts };
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
  for (const file of ['games/festival-schedule/world-festival-schedule.js', 'games/certified-restaurants/world-restaurant-guide.js']) {
    const bridge = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(bridge, /allow="geolocation; clipboard-write; web-share"/);
  }
});

for (const [page, service] of Object.entries(services)) {
  test(`${page}: an invitation shares its public entrance without account or iframe parameters`, async t => {
    const f = fixture(t, page, { share: async () => {} });
    f.button.querySelector('span').click(); await tick();
    assert.equal(f.shares.length, 1);
    assert.equal(f.shares[0].url, 'https://ojjuda.kr' + service.path);
    assert.match(f.shares[0].title, new RegExp(service.label));
    assert.ok(f.shares[0].text);
    assert.deepEqual(f.copyAttempts, []);
    assert.equal(f.button.disabled, false);
  });

  test(`${page}: an unavailable share sheet copies only the invitation link`, async t => {
    const f = fixture(t, page);
    f.button.click(); await tick();
    assert.deepEqual(f.copies, ['https://ojjuda.kr' + service.path]);
    assert.match(f.document.querySelector('.page-share-notice')?.textContent || '', /초대.*복사/);
    assert.equal(f.button.disabled, false);
  });
}

test('cancelling an invitation does not copy or open a fallback and permits a later retry', async t => {
  let cancelled = true;
  const f = fixture(t, 'agit', { share: async () => {
    if (cancelled) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
  } });
  f.button.click(); await tick();
  assert.deepEqual(f.copyAttempts, []);
  assert.equal(f.document.querySelector('.page-share-notice'), null);
  assert.equal(f.document.querySelector('.page-share-dialog'), null);
  assert.equal(f.button.disabled, false);
  cancelled = false;
  f.button.click(); await tick();
  assert.equal(f.shares.length, 2);
  assert.deepEqual(f.copyAttempts, []);
});

test('an invitation falls back from failed sharing through clipboard to an accessible manual link', async t => {
  const f = fixture(t, 'pajang', {
    share: async () => { throw new Error('Share blocked'); }, clipboardError: true
  });
  f.button.focus(); f.button.click(); await tick();
  assert.equal(f.shares.length, 1);
  assert.deepEqual(f.copyAttempts, ['https://ojjuda.kr/features/pajang/']);
  assert.deepEqual(f.copies, []);
  assert.equal(f.document.querySelector('.page-share-notice'), null);
  const dialog = f.document.querySelector('.page-share-dialog');
  assert.equal(dialog?.open, true);
  assert.match(dialog.getAttribute('aria-label'), /초대/);
  assert.match(dialog.querySelector('h2').textContent, /초대/);
  const field = dialog.querySelector('input');
  assert.equal(field.value, 'https://ojjuda.kr/features/pajang/');
  assert.equal(field.readOnly, true);
  assert.equal(f.document.activeElement, field);
  assert.equal(field.selectionEnd, field.value.length);
  dialog.dispatchEvent(new f.window.Event('cancel', { cancelable: true }));
  assert.equal(dialog.isConnected, false);
  assert.equal(f.document.activeElement, f.button);
  assert.equal(f.button.disabled, false);
});

test('dynamic service headers and duplicate helper loads never launch competing invitations', async t => {
  let finish;
  const f = fixture(t, 'agit', { share: () => new Promise(resolve => { finish = resolve; }) });
  f.window.eval(script);
  f.button.click();
  assert.equal(f.shares.length, 1, 'reloading the helper must not install a second click handler');
  assert.equal(f.button.disabled, true);
  f.window.eval(script);
  const replacement = f.document.createElement('button');
  replacement.type = 'button'; replacement.dataset.sharePage = 'park';
  replacement.innerHTML = '<span>초대</span>';
  f.document.querySelector('main').replaceChildren(replacement);
  replacement.querySelector('span').click();
  assert.equal(f.shares.length, 1, 'a new header must share the in-flight lock with the removed header');
  finish(); await tick();
  replacement.querySelector('span').click();
  assert.equal(f.shares.length, 2, 'a dynamically rendered button works after the first share finishes');
  assert.equal(f.shares[1].url, 'https://ojjuda.kr/world.html?place=park');
  finish(); await tick();
  assert.equal(replacement.disabled, false);
  assert.deepEqual(f.copyAttempts, []);
});

test('manual invitation stays single through rerenders and restores focus to the current header', async t => {
  const f = fixture(t, 'park', { clipboard: false });
  f.button.click(); await tick();
  const dialog = f.document.querySelector('.page-share-dialog');
  assert.equal(dialog?.open, true);
  assert.equal(dialog.querySelector('input').value, 'https://ojjuda.kr/world.html?place=park');
  const replacement = f.document.createElement('button');
  replacement.type = 'button'; replacement.dataset.sharePage = 'park'; replacement.textContent = '초대';
  f.document.querySelector('main').replaceChildren(replacement);
  f.window.eval(script);
  replacement.click(); await tick();
  assert.equal(f.document.querySelectorAll('.page-share-dialog').length, 1);
  dialog.querySelector('button').click();
  assert.equal(f.document.querySelector('.page-share-dialog'), null);
  assert.equal(f.document.activeElement, replacement, 'closing the fallback focuses the current header, not the removed node');
  replacement.click(); await tick();
  assert.equal(f.document.querySelectorAll('.page-share-dialog').length, 1, 'a later manual invitation can be opened normally');
  f.document.querySelector('.page-share-dialog button').click();
});
