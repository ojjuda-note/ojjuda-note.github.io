const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(process.env.OJJUDA_RANKINGS_JS || path.join(__dirname, '../world-game-rankings.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const games = { tank: { name: '탱크게임', unit: '연승' }, chess: { name: '체스', unit: '연승' } };

function fixture(t) {
  const dom = new JSDOM('<main></main>', { url: 'https://fixture.test/world.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, requests = [];
  let now = Date.parse('2026-10-20T00:00:00Z'), actor = 'member-a';
  w.Date.now = () => now;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} disconnect() {} };
  const client = { rpc(name, args) {
    assert.equal(name, 'community_game_monthly_leaders');
    return new Promise((resolve, reject) => requests.push({ args, resolve, reject }));
  } };
  w.eval(source);
  t.after(() => { w.OjjudaGameRankings.mount(null); w.close(); });
  let host;
  const mount = (options = {}) => {
    host = w.document.createElement('section'); w.document.querySelector('main').replaceChildren(host);
    const owner = options.owner === undefined ? actor : options.owner;
    w.OjjudaGameRankings.mount(host, { client, owner, games, authorized: () => actor === owner, ...options });
    return host;
  };
  const reply = async (index, score, extra = {}) => {
    await tick();
    requests[index].resolve({ data: { tank: { nick: '회원 ' + score, score }, chess: null }, ...extra });
    await tick(); await tick();
  };
  return { w, client, requests, mount, reply,
    score: () => host.querySelector('[data-game=tank] .board-leader-score')?.textContent,
    clock: value => { now = value; }, advance: value => { now += value; }, actor: value => { actor = value; },
    host: () => host
  };
}

test('ten shell remounts share one in-flight ranking read and paint only the current shell', async t => {
  const f = fixture(t), old = [];
  for (let i = 0; i < 10; i++) old.push(f.mount());
  await tick();
  t.diagnostic('RPCs for ten ranking remounts: ' + f.requests.length);
  assert.equal(f.requests.length, 1);
  await f.reply(0, 9);
  assert.equal(f.score(), '9연승');
  assert.equal(f.host().querySelectorAll('.board-leader').length, 2);
  for (const host of old.slice(0, -1)) assert.equal(host.querySelector('.board-leader-score').textContent, '—');
});

test('passive remounts briefly reuse successful data; explicit refresh and expiry read fresh data', async t => {
  const f = fixture(t); f.mount(); await f.reply(0, 9);
  f.mount(); await tick(); assert.equal(f.requests.length, 1); assert.equal(f.score(), '9연승');
  const refresh = f.w.OjjudaGameRankings.refresh(); await tick(); assert.equal(f.requests.length, 2);
  await f.reply(1, 10); await refresh; assert.equal(f.score(), '10연승');
  f.advance(15001); f.mount(); await tick(); assert.equal(f.requests.length, 3);
  await f.reply(2, 11); assert.equal(f.score(), '11연승');
});

test('a forced refresh invalidates an older pending response and its cached result', async t => {
  const f = fixture(t); f.mount();
  const refresh = f.w.OjjudaGameRankings.refresh(); await tick(); assert.equal(f.requests.length, 2);
  await f.reply(1, 20); await refresh;
  await f.reply(0, 3); assert.equal(f.score(), '20연승');
  f.mount(); await tick(); assert.equal(f.requests.length, 2); assert.equal(f.score(), '20연승');
});

test('concurrent forced refreshes keep the newest response when they arrive in reverse order', async t => {
  const f = fixture(t); f.mount(); await f.reply(0, 1);
  const first = f.w.OjjudaGameRankings.refresh(), latest = f.w.OjjudaGameRankings.refresh();
  await tick(); assert.equal(f.requests.length, 3);
  await f.reply(2, 25); await latest; await f.reply(1, 5); await first;
  f.mount(); await tick(); assert.equal(f.requests.length, 3); assert.equal(f.score(), '25연승');
});

test('account, sign-out and client transitions never reuse an older session cache', async t => {
  const f = fixture(t); f.mount();
  f.actor('member-b'); f.mount(); await f.reply(1, 20);
  await f.reply(0, 3); assert.equal(f.score(), '20연승');
  f.actor('member-a'); f.mount(); await tick(); assert.equal(f.requests.length, 3);
  await f.reply(2, 30);
  f.mount({ owner: null }); assert.match(f.host().textContent, /로그인하면/);
  f.mount(); await tick(); assert.equal(f.requests.length, 4); await f.reply(3, 40);
  f.mount({ client: { rpc: f.client.rpc } }); await tick(); assert.equal(f.requests.length, 5);
  await f.reply(4, 50); assert.equal(f.score(), '50연승');
});

test('refresh keeps the guest login prompt and does no work for an unauthorized old view', async t => {
  const f = fixture(t); f.mount({ owner: null });
  assert.equal(await f.w.OjjudaGameRankings.refresh(), false);
  assert.equal(f.requests.length, 0); assert.match(f.host().textContent, /로그인하면/);
  f.mount(); await f.reply(0, 4);
  const row = f.host().querySelector('[data-game=tank]'); f.actor('member-b');
  assert.equal(await f.w.OjjudaGameRankings.refresh(), false);
  assert.equal(f.requests.length, 1); assert.equal(f.host().querySelector('[data-game=tank]'), row);
});

test('the game catalog and Korean calendar month are part of the cache key', async t => {
  const f = fixture(t); f.clock(Date.parse('2026-10-31T14:59:59.990Z'));
  f.mount(); await f.reply(0, 7);
  f.mount({ games: { chess: games.chess, tank: games.tank } }); await tick(); assert.equal(f.requests.length, 1, 'catalog order is not a different query');
  f.clock(Date.parse('2026-10-31T15:00:00.001Z')); f.mount(); await tick(); assert.equal(f.requests.length, 2, 'a new Korean month cannot reuse last month');
  await f.reply(1, 0);
  f.mount({ games: { ...games, matgo: { name: '맞고', unit: 'G' } } }); await tick(); assert.equal(f.requests.length, 3);
  assert.ok(f.requests[2].args.p_games.includes('matgo')); await f.reply(2, 1);
  assert.equal(f.host().querySelectorAll('.board-leader').length, 3);
});

test('failed reads are not cached and the visible retry button still loads an individual game', async t => {
  const f = fixture(t); f.mount(); await f.reply(0, null, { data: null, error: { message: 'offline' } });
  assert.equal(f.host().querySelectorAll('.board-leader-retry').length, 2);
  f.mount(); await tick(); assert.equal(f.requests.length, 2, 'a failed response is retried on re-entry');
  await f.reply(1, null, { data: null, error: { message: 'offline' } });
  f.host().querySelector('[data-game=tank] .board-leader-retry').click(); await tick();
  assert.deepEqual(Array.from(f.requests[2].args.p_games), ['tank']);
  await f.reply(2, 12); assert.equal(f.score(), '12연승');
});

test('a saved result and return from gameplay bypass the passive cache', async t => {
  const f = fixture(t); f.mount(); await f.reply(0, 9);
  f.w.dispatchEvent(new f.w.CustomEvent('ojjuda:game-record-saved', { detail: { owner: 'member-a', game: 'tank' } }));
  await tick(); assert.equal(f.requests.length, 2); await f.reply(1, 10); assert.equal(f.score(), '10연승');
  f.w.document.body.classList.add('gaming'); await tick();
  f.w.dispatchEvent(new f.w.CustomEvent('ojjuda:game-record-saved', { detail: { owner: 'member-a', game: 'tank' } }));
  await tick(); assert.equal(f.requests.length, 2, 'saving a result does not rebuild the hidden ranking while playing');
  f.w.document.body.classList.remove('gaming'); await tick(); assert.equal(f.requests.length, 3);
  await f.reply(2, 11); assert.equal(f.score(), '11연승');
});

test('a delayed adult-access result cannot add restricted rows to a different member view', async t => {
  const f = fixture(t); let allow;
  f.w.OjjudaMatgoAccess = { visible: () => true, check: () => new Promise(resolve => { allow = resolve; }) };
  f.mount(); const oldAllow = allow;
  f.actor('member-b'); f.mount();
  oldAllow({ userId: 'member-a' }); await tick();
  assert.equal(f.requests.length, 2); assert.equal(f.host().querySelector('[data-game=matgo]'), null);
  await f.reply(1, 6); await f.reply(0, 1); assert.equal(f.score(), '6연승');
});
