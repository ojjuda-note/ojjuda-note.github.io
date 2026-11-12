const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

const folder = path.join(__dirname, '../features/fanpages');
const source = name => fs.readFileSync(path.join(folder, name), 'utf8');
const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise(resolve => setTimeout(resolve, 0));
};

function fixture(page, failCatalog = false) {
  const filename = page === 'hub' ? 'index.html' : 'artist.html';
  const suffix = page === 'hub' ? '' : '?group=rescene';
  const dom = new JSDOM(source(filename).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''), {
    url: 'https://fan.test/features/fanpages/' + filename + suffix,
    runScripts: 'outside-only', pretendToBeVisual: true
  });
  const window = dom.window, context = dom.getInternalVMContext(), copies = [];
  window.matchMedia = () => ({ matches: true });
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async value => { copies.push(value); } } });
  for (const file of ['photo-manifest.js', 'artists.js', 'artists-extra.js', 'profiles.js', 'profiles-extra.js', 'videos.js', 'popularity.js']) {
    vm.runInContext(source(file), context);
  }
  let finish;
  if (failCatalog) {
    window.ojjudaSupabase = { from() { throw Error('Mocked catalogue outage'); } };
    vm.runInContext(source('catalog.js'), context);
  } else {
    const catalog = { raw: new Map(), available: false };
    catalog.ready = new Promise(resolve => { finish = () => { catalog.available = true; resolve(); }; });
    window.OjjudaFanCatalog = catalog;
  }
  vm.runInContext(source('fan.js'), context);
  return { window, document: window.document, copies, finish, close: () => window.close() };
}

test('hub explains pending loading and enables its controls only after handlers are ready', async () => {
  const f = fixture('hub');
  try {
    const controls = [...f.document.querySelectorAll('#hub-share, #artist-search, [data-category]')];
    const main = f.document.querySelector('main'), status = f.document.getElementById('catalog-status');
    assert.equal(controls.length, 6);
    assert.ok(controls.every(control => control.disabled), 'Visible controls must not accept clicks before initialization');
    assert.equal(main.getAttribute('aria-busy'), 'true');
    assert.equal(status.hidden, false);
    assert.equal(status.textContent, '팬페이지를 불러오는 중이에요.');
    f.document.getElementById('hub-share').click();
    assert.equal(f.copies.length, 0);

    f.finish();
    await settle();
    assert.equal(f.document.querySelectorAll('.artist-tile').length, 30);
    assert.ok(controls.every(control => !control.disabled));
    assert.equal(main.getAttribute('aria-busy'), 'false');
    assert.equal(status.hidden, true);
    f.document.querySelector('[data-category="girl"]').click();
    assert.equal(f.document.querySelectorAll('.artist-tile').length, 16);
    const search = f.document.getElementById('artist-search');
    search.value = 'NMIXX';
    search.dispatchEvent(new f.window.Event('input'));
    assert.equal(f.document.querySelectorAll('.artist-tile').length, 1);
    f.document.getElementById('hub-share').click();
    await settle();
    assert.deepEqual(f.copies, ['https://fan.test/features/fanpages/index.html']);
  } finally { f.close(); }
});

test('artist loading remains explicit until its content and share button are ready', async () => {
  const f = fixture('artist');
  try {
    const main = f.document.getElementById('artist-root');
    assert.equal(main.getAttribute('aria-busy'), 'true');
    assert.equal(main.querySelector('.loading-card').textContent, '팬페이지를 불러오는 중이에요.');
    assert.equal(f.document.getElementById('detail-share'), null);
    f.finish();
    await settle();
    assert.equal(main.getAttribute('aria-busy'), 'false');
    assert.equal(main.querySelector('.loading-card'), null);
    assert.equal(main.querySelector('h1').textContent, 'RESCENE');
    const share = f.document.getElementById('detail-share');
    assert.equal(share.disabled, false);
    share.click();
    await settle();
    assert.deepEqual(f.copies, ['https://fan.test/features/fanpages/artist.html?group=rescene']);
  } finally { f.close(); }
});

test('a catalogue outage still enables packaged fanpages and preserves its error notice', async () => {
  const f = fixture('hub', true);
  try {
    await f.window.OjjudaFanCatalog.ready;
    await settle();
    const status = f.document.getElementById('catalog-status');
    assert.equal(f.document.querySelector('main').getAttribute('aria-busy'), 'false');
    assert.equal(f.document.querySelectorAll('.artist-tile').length, 30);
    assert.equal(f.document.getElementById('hub-share').disabled, false);
    assert.equal(f.document.getElementById('artist-search').disabled, false);
    assert.equal(status.hidden, false);
    assert.match(status.textContent, /최신 자료를 불러오지 못했어요/);
    f.document.querySelector('[data-category="boy"]').click();
    assert.equal(f.document.querySelectorAll('.artist-tile').length, 14);
  } finally { f.close(); }
});
