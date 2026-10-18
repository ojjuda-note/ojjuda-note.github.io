const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, dependencies, globals = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, Date, Set, Error, ...globals, require(name) {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  } }, { filename: file });
  return exports;
}
(async () => {
  const { validateSnapshot } = load('src/ojjuda/snapshot.ts', { '@/db': { db: {} } });
  const make = () => ({ version: 1, tables: { transactions: [{ id: 1, date: '2026-10-16', amount: 42, type: 'expense', memo: 'preserve' }], categories: [{ id: 1, name: 'Food' }] } });
  for (const date of ['2026-10-16', 0, new Date('2026-10-16')]) {
    const input = make(); input.tables.transactions[0].date = date;
    const output = validateSnapshot(input);
    assert.equal(output.tables.transactions[0].date.getTime(), new Date(date).getTime());
    assert.equal(output.tables.transactions[0].memo, 'preserve');
    assert.equal(output.tables.accounts.length, 0);
    assert.equal(input.tables.transactions[0].date, date, 'validation must not mutate the source');
  }
  for (const value of [null, [], {}, { version: 2, tables: {} }]) assert.throws(() => validateSnapshot(value));
  for (const date of [true, {}, 'not-a-date']) { const input = make(); input.tables.transactions[0].date = date; assert.throws(() => validateSnapshot(input)); }
  for (const amount of ['42', 0, Infinity, 1000000000000]) { const input = make(); input.tables.transactions[0].amount = amount; assert.throws(() => validateSnapshot(input)); }
  for (const id of ['1', 0, 1.5]) { const input = make(); input.tables.categories[0].id = id; assert.throws(() => validateSnapshot(input)); }
  const duplicate = make(); duplicate.tables.categories.push({ id: 1 }); assert.throws(() => validateSnapshot(duplicate));
  const hooks = new Map(); let active = true;
  const client = { from: () => ({ select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: null }; } }) };
  const sync = load('src/ojjuda/sync.ts', {
    '@/db': { db: { open: async () => {}, tables: [{ hook: (kind, callback) => hooks.set(kind, callback) }] }, seedCategories: async () => {} },
    '@/lib/defaultWallet': { ensureDefaultWallet: async () => {} },
    './snapshot': { snapshot: async () => {}, restore: async () => {} },
  }, {
    window: { ojjudaLedger: { owner: 'fixture', client, active: () => active }, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} }, clearTimeout() {}, setTimeout() {},
  });
  await sync.initialize();
  assert.deepEqual([...hooks.keys()], ['creating', 'updating', 'deleting']);
  for (const callback of hooks.values()) {
    const context = {}; callback.call(context);
    assert.equal(typeof context.onsuccess, 'function');
    active = false; assert.throws(() => callback.call({}), /로그인이 바뀌었어요/); active = true;
  }
  console.log('PASS: typed snapshot validation, valid date compatibility, immutable input, invalid records, and all mutation hook contexts');
})().catch(error => { console.error(error); process.exitCode = 1; });
