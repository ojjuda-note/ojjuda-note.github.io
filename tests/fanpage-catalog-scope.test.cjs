const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = readFileSync(path.join(__dirname, '../features/fanpages/catalog.js'), 'utf8');

async function load(page, group) {
  let sectionReads = 0;
  const seeds = ['first', 'second'].map(id => ({
    id, name: id, korean: id, photos: [{label:'photo', image:'https://images.example/photo.jpg'}]
  }));
  const rows = [{artist_id:'new', identity:{name:'A & B', korean:'새 팀'}}];
  const query = {
    order() { return this; }, range() { return this; }, eq() { return this; }, single() { return this; },
    select(cols) { this.full = cols === 'sections'; if (this.full) sectionReads++; return this; },
    abortSignal() { return Promise.resolve({data: this.full ? {sections:{identity:rows[0].identity, news:[{title:'새 소식'}]}} : rows}); }
  };
  const window = {OJJUDA_FAN_ARTISTS:seeds, ojjudaSupabase:{from:() => query}};
  const location = new URL('https://example.org/features/fanpages/' + (page === 'hub' ? 'index' : 'artist') + '.html?group=' + group);
  vm.runInNewContext(source, {window, location, document:{body:{dataset:{page}}}, URL, URLSearchParams, AbortController, setTimeout, clearTimeout});
  await window.OjjudaFanCatalog.ready;
  assert.equal(window.OjjudaFanCatalog.available, true);
  return {window, sectionReads};
}

test('hub builds searchable identities for all artists and ignores stray group parameters', async () => {
  const {window, sectionReads} = await load('hub', 'new');
  assert.equal(sectionReads, 0);
  assert.equal(window.OJJUDA_FAN_ARTISTS.length, 3);
  assert.equal(window.OJJUDA_FAN_ARTISTS[2].name, 'A &amp; B');
  assert.equal(window.OjjudaFanCatalog.raw.get('new').artist.name, 'A & B');
  assert.equal(Object.keys(window.OJJUDA_FAN_PROFILES).length, 0);
});

test('detail prepares only the chosen artist and keeps packaged and edited details', async () => {
  const packaged = await load('artist', 'second');
  assert.deepEqual(Object.keys(packaged.window.OJJUDA_FAN_PROFILES), ['second']);
  assert.equal(packaged.window.OJJUDA_FAN_ARTISTS[1].photos[0].label, 'photo');
  const edited = await load('artist', 'new');
  assert.equal(edited.sectionReads, 1);
  assert.equal(edited.window.OjjudaFanCatalog.raw.get('new').artist.news[0].title, '새 소식');
  assert.deepEqual(Object.keys(edited.window.OJJUDA_FAN_PROFILES), ['new']);
  const unknown = await load('artist', 'missing');
  assert.deepEqual(Object.keys(unknown.window.OJJUDA_FAN_PROFILES), []);
  assert.equal(unknown.window.OJJUDA_FAN_ARTISTS.length, 3);
});
