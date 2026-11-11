const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const welcome = require('../features/home/agit-welcome.js');
const library = require('../admin/asset-library.js');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('the administrator gallery reads the live theme and popup catalog and points to real files', () => {
  const keys = fs.readdirSync(path.join(root, 'features/home/theme-illustrations'))
    .filter(name => name.endsWith('.webp')).map(name => name.slice(0, -5));
  const themes = { order: keys, catalog: Object.fromEntries(keys.map(key => [key,
    { name: key, copy: key, period: '언제나' }])) };
  const items = library.catalog(themes, welcome);
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  assert.equal(items.filter(item => item.category === 'themes').length, keys.length * 2);
  assert.equal(items.filter(item => item.category === 'popups').length, welcome.previewCatalog().length);
  assert.ok(items.some(item => item.id === 'popup-join-benefits'));
  for (const item of items.filter(item => item.src)) {
    assert.ok(fs.existsSync(path.join(root, item.src.split('?')[0])), 'missing art: ' + item.src);
  }
});

test('the asset library is routed inside existing protected admin mode', () => {
  assert.equal(library.mount({container: {}, getAdminId: () => null, isCurrent: () => true}), null);
  const html = read('world.html');
  assert.match(html, /\["library","자료실"\]/);
  assert.match(html, /L\.area==="library"&&L\.tab==="assets"/);
  assert.match(html, /L\.area==="library"&&L\.tab==="assets"\?"asset-library"/);
  assert.match(html, /if\(!D\.online\|\|!D\.isAdmin\)return/);
  assert.match(read('admin/world-admin-loader.js'), /\/admin\/asset-library\.js\?v=/);
  assert.match(read('admin/app.js'), /'assets'/);
});

test('member daily welcome and per-entry guest benefits have separate paths', () => {
  const source = read('features/home/agit-welcome.js');
  assert.match(source, /if \(!session\.member\) \{ void greetGuest\(session\); return; \}/);
  assert.match(source, /if \(session\.state\.shownDay === today \|\| storageRead\(GLOBAL_DAY\) === today\) return;/);
  assert.match(source, /'\/\?auth=signup&next=world'/);
  assert.match(source, /previewOnly \? '관리자 미리보기/);
});
