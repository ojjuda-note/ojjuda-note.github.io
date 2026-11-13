const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const moduleUrl = pathToFileURL(path.join(__dirname, '../features/fanpages/changed-group.mjs')).href;
const before = new Map([['rescene', 'same'], ['kissoflife', 'old'], ['stayc', 'old']]);

test('single artist updates retain the original one-group output', async () => {
  const { selectChangedGroups } = await import(moduleUrl);
  const after = new Map(before); after.set('stayc', 'new');
  assert.deepEqual(selectChangedGroups(before, after), ['stayc']);
  assert.deepEqual(selectChangedGroups(before, after, true), ['stayc']);
});
test('multi-group recovery verifies every changed group, never a branch-name placeholder', async () => {
  const { selectChangedGroups } = await import(moduleUrl);
  const after = new Map(before); after.set('kissoflife', 'new'); after.set('stayc', 'new');
  assert.deepEqual(selectChangedGroups(before, after), []);
  assert.deepEqual(selectChangedGroups(before, after, true), ['kissoflife', 'stayc']);
});
test('shared changes verify the whole catalogue instead of silently skipping', async () => {
  const { selectChangedGroups } = await import(moduleUrl);
  assert.deepEqual(selectChangedGroups(before, new Map(before)), []);
  assert.deepEqual(selectChangedGroups(before, new Map(before), true), [...before.keys()]);
});
test('new artists are included and unrelated artists are not selected', async () => {
  const { selectChangedGroups } = await import(moduleUrl);
  const after = new Map(before); after.set('newartist', 'new');
  assert.deepEqual(selectChangedGroups(before, after, true), ['newartist']);
  assert.deepEqual([...before.keys()], ['rescene', 'kissoflife', 'stayc']);
});
