const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../app/world/world-themes.js'), 'utf8');
const document = {
  documentElement: {dataset: {}},
  querySelectorAll() { return []; },
  addEventListener() {}
};
const browser = {
  document,
  matchMedia() { return {matches: false, addEventListener() {}}; },
  localStorage: {removeItem() {}},
  addEventListener() {},
  dispatchEvent() {},
  setTimeout() { return 1; },
  clearTimeout() {},
  Event: class Event { constructor(type) { this.type = type; } }
};
browser.window = browser;
vm.runInNewContext(source, browser);

test('existing seasonal and holiday themes begin seven Korean calendar days early', () => {
  const themes = browser.OjjudaThemes;
  const at = day => themes.resolve(day + 'T03:00:00Z');
  assert.equal(themes.order.length, 19);
  const cases = [
    ['2026-10-01', 'autumn'], ['2026-10-02', 'hangeul'], ['2026-10-09', 'hangeul'], ['2026-10-10', 'autumn'],
    ['2026-11-03', 'autumn'], ['2026-11-04', 'pepero'], ['2026-11-10', 'pepero'], ['2026-11-11', 'pepero'], ['2026-11-12', 'autumn'],
    ['2026-02-10', 'valentine'], ['2026-02-14', 'valentine'], ['2026-02-15', 'seollal'], ['2026-02-17', 'seollal'], ['2026-02-18', 'seollal'], ['2026-02-19', 'winter'],
    ['2026-05-01', 'children'], ['2026-05-05', 'children'], ['2026-05-06', 'parents'], ['2026-05-08', 'parents'], ['2026-05-09', 'teachers'],
    ['2026-12-18', 'christmas'], ['2026-12-25', 'christmas'], ['2026-12-26', 'newyear'], ['2027-01-01', 'newyear'],
    ['2026-02-21', 'winter'], ['2026-02-22', 'spring'], ['2026-04-01', 'spring'],
    ['2026-05-24', 'buddha'], ['2026-05-25', 'summer'], ['2026-07-01', 'summer'],
    ['2026-08-24', 'summer'], ['2026-08-25', 'autumn'], ['2026-10-15', 'autumn'],
    ['2026-11-23', 'autumn'], ['2026-11-24', 'winter'], ['2027-01-10', 'winter']
  ];
  for (const [day, expected] of cases) assert.equal(at(day), expected, day);
  assert.equal(themes.eventsOn('2026-11-10T03:00:00Z').length, 0, 'previews do not change the holiday date itself');
});

test('each of 19 themes has its own short Ojjuda-style headline and copy', () => {
  const {order, catalog} = browser.OjjudaThemes;
  const headlines = new Set();
  for(const key of order){
    const item=catalog[key];
    assert.equal(item.headline?.length,2,key+' headline has two parts');
    assert.ok(item.headline.every(s=>s.length>0&&s.length<=8),key+' headline is compact');
    assert.ok(item.copy.includes('오쭈다'),key+' copy belongs to Ojjuda');
    assert.ok(item.copy.length<=36,key+' copy stays brief');
    headlines.add(item.headline.join(' '));
  }
  assert.equal(headlines.size,order.length,'each theme has its own headline');
  assert.deepEqual(Array.from(catalog.pepero.headline),['달콤한','안부 하나.']);
  assert.match(catalog.pepero.copy,/빼빼로.*오쭈다/);
});
