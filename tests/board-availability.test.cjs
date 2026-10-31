const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'world.html'), 'utf8');
const start = source.indexOf('async function Xs(');
const layoutStart = source.indexOf('async function jgOnlineReady(');
const availability = source.slice(start, source.indexOf('var Wa=', start)) +
  source.slice(layoutStart, source.indexOf('async function ln(', layoutStart));
const flush = async () => {await Promise.resolve(); await Promise.resolve();};

async function fixture(method) {
  const requests = [];
  const context = vm.createContext({D: {online: true, user: {id: 'member-a'}}});
  const makeClient = () => ({from(table) {
    assert.equal(table, 'board_games');
    return {select(column) {return {limit(count) {
      assert.equal(count, 1);
      return new Promise((resolve, reject) => requests.push({column, resolve, reject}));
    }};}};
  }});
  context.S = makeClient();
  vm.runInContext(availability, context);
  async function warmBoard() {
    const before = requests.length;
    const pending = context.Xs();
    await flush();
    if (requests.length > before) requests.at(-1).resolve({data: [], error: null});
    assert.equal(await pending, true);
  }
  if (method === 'xh') await warmBoard();
  requests.length = 0;
  return {context, requests, warmBoard, makeClient, run: () => context[method]()};
}

for (const [method, column] of [['Xs', 'id'], ['xh', 'turn'], ['jgOnlineReady', 'janggi_layout']]) {
  test(`${method}: a failed availability read can recover on the next entry`, async () => {
    const f = await fixture(method);
    const first = f.run();
    await flush();
    assert.equal(f.requests[0].column, column);
    f.requests[0].resolve({data: null, error: {message: 'temporary network error'}});
    assert.equal(await first, false);
    const retry = f.run();
    await flush();
    assert.equal(f.requests.length, 2, 'failure must not be cached permanently');
    f.requests[1].resolve({data: [], error: null});
    assert.equal(await retry, true);
    assert.equal(await f.run(), true);
    assert.equal(f.requests.length, 2, 'success is cached for this member and client');
  });

  test(`${method}: a rejected request is recoverable and does not reject the entrance`, async () => {
    const f = await fixture(method);
    const first = f.run();
    await flush();
    f.requests[0].reject(new Error('connection dropped'));
    assert.equal(await first, false);
    const retry = f.run();
    await flush();
    assert.equal(f.requests.length, 2);
    f.requests[1].resolve({data: [], error: null});
    assert.equal(await retry, true);
  });

  test(`${method}: concurrent callers share one availability request`, async () => {
    const f = await fixture(method);
    const pending = [f.run(), f.run(), f.run()];
    await flush();
    assert.equal(f.requests.length, 1);
    f.requests[0].resolve({data: [], error: null});
    assert.deepEqual(await Promise.all(pending), [true, true, true]);
  });

  for (const oldResult of ['success', 'failure']) {
    test(`${method}: a late ${oldResult} from another member cannot overwrite the current check`, async () => {
      const f = await fixture(method);
      const old = f.run();
      await flush();
      const previous = f.requests[0];
      f.context.D.user = {id: 'member-b'};
      if (method === 'xh') await f.warmBoard();
      const current = f.run();
      await flush();
      f.requests.at(-1).resolve({data: [], error: null});
      assert.equal(await current, true);
      previous.resolve({data: [], error: oldResult === 'failure' ? {message: 'old failure'} : null});
      assert.equal(await old, false, 'an abandoned caller must not continue into a game');
      const count = f.requests.length;
      assert.equal(await f.run(), true);
      assert.equal(f.requests.length, count, 'the current successful result survives');
    });
  }

  test(`${method}: losing the session discards an in-flight successful read`, async () => {
    const f = await fixture(method);
    const pending = f.run();
    await flush();
    f.context.D.online = false;
    f.requests[0].resolve({data: [], error: null});
    assert.equal(await pending, false);
    assert.equal(await f.run(), false);
    assert.equal(f.requests.length, 1, 'offline calls do not read the database');
    f.context.D.online = true;
    const retry = f.run();
    await flush();
    assert.equal(f.requests.length, 2);
    f.requests[1].resolve({data: [], error: null});
    assert.equal(await retry, true);
  });

  test(`${method}: a successful result is not reused by a replacement client`, async () => {
    const f = await fixture(method);
    const first = f.run();
    await flush();
    f.requests[0].resolve({data: [], error: null});
    assert.equal(await first, true);
    f.context.S = f.makeClient();
    if (method === 'xh') await f.warmBoard();
    const before = f.requests.length;
    const next = f.run();
    await flush();
    assert.equal(f.requests.length, before + 1);
    f.requests.at(-1).resolve({data: [], error: null});
    assert.equal(await next, true);
  });
}

test('billiards does not continue its prerequisite check after the member changes', async () => {
  const f = await fixture('Xs');
  const pending = f.context.xh();
  await flush();
  assert.equal(f.requests[0].column, 'id');
  f.context.D.user = {id: 'member-b'};
  f.requests[0].resolve({data: [], error: null});
  assert.equal(await pending, false);
  assert.equal(f.requests.length, 1, 'the old entrance must not start a new member request');
});

test('availability checks without a signed-in member do not access the database', async () => {
  const f = await fixture('Xs');
  f.context.D.user = null;
  assert.equal(await f.context.Xs(), false);
  assert.equal(await f.context.xh(), false);
  assert.equal(await f.context.jgOnlineReady(), false);
  assert.equal(f.requests.length, 0);
});
