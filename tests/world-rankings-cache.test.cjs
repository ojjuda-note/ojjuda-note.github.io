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
  const w = dom.window, requests = [], timers = new Map();
  let now = Date.parse('2026-10-20T00:00:00Z'), actor = 'member-a';
  let timerId = 0;
  w.Date.now = () => now;
  w.setTimeout = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; };
  w.clearTimeout = id => timers.delete(id);
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} disconnect() {} };
  const client = { rpc(name, args) {
    assert.ok(['community_game_monthly_leaders', 'community_game_monthly_history'].includes(name));
    return new Promise((resolve, reject) => requests.push({ name, args, resolve, reject }));
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
  const historyReply = async (index, data = {}, extra = {}) => {
    await tick();
    requests[index].resolve({ data: { month: '2026-10', currentMonth: '2026-10', startsAt: '2026-09-30T16:00:00Z', endsAt: '2026-10-31T16:00:00Z', closed: false,
      months: [{ month: '2026-10', hasRecords: true }, { month: '2026-09', hasRecords: true }, { month: '2026-08', hasRecords: false }],
      leaders: { tank: { nick: '월 우승자', score: 9 }, chess: null }, ...data }, ...extra });
    await tick(); await tick();
  };
  const pickMonth = async month => { const select = host.querySelector('.board-rank-month'); select.value = month; select.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(); };
  return { w, client, requests, mount, reply, historyReply, pickMonth,
    score: () => host.querySelector('[data-game=tank] .board-leader-score')?.textContent,
    clock: value => { now = value; }, advance: value => { now += value; }, actor: value => { actor = value; },
    fireTimers: () => { for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } },
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

test('the game catalog and ranking month at 01:00 Korean time are part of the cache key', async t => {
  const f = fixture(t); f.clock(Date.parse('2026-10-31T15:59:59.990Z'));
  f.mount(); await f.reply(0, 7);
  f.mount({ games: { chess: games.chess, tank: games.tank } }); await tick(); assert.equal(f.requests.length, 1, 'catalog order is not a different query');
  f.clock(Date.parse('2026-10-31T16:00:00.001Z')); f.mount(); await tick(); assert.equal(f.requests.length, 2, '01:00 starts a new ranking month');
  await f.reply(1, 0);
  assert.equal(f.score(), '—'); assert.equal(f.host().querySelector('[data-game=tank] .board-leader-nick').textContent, '이번 달 기록 없음');
  f.mount(); await tick(); assert.equal(f.requests.length, 2, 'cached zero results stay empty without an extra read'); assert.equal(f.score(), '—');
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

test('explicit refresh reads the current catalog after adult access recovers or is revoked', async t => {
  const f = fixture(t); let allowed = false;
  const adult = { matgo: { name: '맞고', unit: 'G' }, poker: { name: '세븐포커', unit: 'G' }, photo_ttang: { name: '포토땅따먹기', unit: '장' } };
  f.w.OjjudaMatgoAccess = { visible: () => allowed, check: async () => { throw Error('offline'); } };
  const getGames = () => ({ ...games, ...(allowed ? adult : {}) });
  f.mount({ getGames }); await f.reply(0, 5);
  allowed = true;
  const recovered = f.w.OjjudaGameRankings.refresh(); await tick();
  assert.deepEqual(Array.from(f.requests[1].args.p_games), Object.keys(getGames()));
  await f.reply(1, 6); await recovered;
  for (const id of Object.keys(getGames())) assert.ok(f.host().querySelector(`[data-game="${id}"]`), id + ' remains in the current catalog');
  allowed = false;
  const revoked = f.w.OjjudaGameRankings.refresh(); await tick();
  assert.deepEqual(Array.from(f.requests[2].args.p_games), Object.keys(games));
  await f.reply(2, 7); await revoked;
  for (const id of Object.keys(adult)) assert.equal(f.host().querySelector(`[data-game="${id}"]`), null);
  assert.equal(f.score(), '7연승');
});

test('access invalidation removes restricted rows and ignores their pending response', async t => {
  const f = fixture(t), listeners = new Set(); let allowed = true;
  const adult = { matgo: { name: '맞고', unit: 'G' }, poker: { name: '세븐포커', unit: 'G' }, photo_ttang: { name: '포토땅따먹기', unit: '장' } };
  const getGames = () => ({ ...games, ...(allowed ? adult : {}) });
  f.w.OjjudaMatgoAccess = { visible: () => allowed, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
  f.mount({ games: getGames(), getGames }); await tick();
  allowed = false; for (const fn of listeners) fn(Error('unavailable')); await tick();
  assert.equal(f.host().querySelector('[data-game=matgo]'), null, 'revocation removes the row before either read finishes');
  assert.equal(f.requests.length, 2);
  await f.reply(1, 8); await f.reply(0, 99, { data: { tank: { nick: 'old account data', score: 99 }, matgo: { nick: 'old winner', score: 1000 } } });
  assert.equal(f.score(), '8연승'); assert.equal(f.host().querySelector('[data-game=matgo]'), null);
  f.w.OjjudaGameRankings.mount(null); assert.equal(listeners.size, 0, 'disposing releases the access listener');
});

test('catalog synchronization ignores the wrong owner and callbacks from a disposed mount', async t => {
  const f = fixture(t), listeners = new Set(), checks = []; let allowed = false;
  const getGames = () => ({ ...games, ...(allowed ? { matgo: { name: '맞고', unit: 'G' } } : {}) });
  f.w.OjjudaMatgoAccess = {
    visible: () => allowed,
    check: () => new Promise(resolve => checks.push(resolve)),
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }
  };
  const oldHost = f.mount({ getGames }), oldListener = [...listeners][0];
  f.mount({ getGames }); await f.reply(0, 4);
  assert.equal(listeners.size, 1, 'remount replaces the old access subscription');
  const oldMarkup = oldHost.innerHTML;
  allowed = true; checks[0]({ userId: 'member-a' }); oldListener(); await tick();
  assert.equal(oldHost.innerHTML, oldMarkup, 'the disposed ranking remains untouched');
  assert.equal(f.host().querySelector('[data-game=matgo]'), null, 'old callbacks cannot change the replacement mount');
  assert.equal(await f.w.OjjudaGameRankings.syncCatalog('member-b'), false);
  assert.equal(f.requests.length, 1, 'wrong-owner synchronization makes no request');
  checks[1]({ userId: 'member-a' }); await tick();
  assert.equal(f.requests.length, 2); await f.reply(1, 5);
  assert.ok(f.host().querySelector('[data-game=matgo]'));
  const saved = f.host().innerHTML; f.actor('member-b'); allowed = false;
  assert.equal(await f.w.OjjudaGameRankings.syncCatalog('member-a'), false);
  for (const fn of listeners) fn(Error('signed_out')); await tick();
  assert.equal(f.host().innerHTML, saved, 'an unauthorized old view ignores access events');
  assert.equal(f.requests.length, 2);
});

test('the ranking title opens monthly winners and cached month changes preserve empty games and the carousel', async t => {
  const f = fixture(t); f.mount(); await f.reply(0, 4);
  const title = f.host().querySelector('.board-rank-history-open');
  assert.ok(title, 'the ranking heading is an accessible history button');
  assert.equal(title.tagName, 'BUTTON');
  title.click(); await tick();
  assert.equal(f.requests[1].name, 'community_game_monthly_history');
  assert.equal(f.requests[1].args.p_month, null);
  assert.deepEqual(Array.from(f.requests[1].args.p_games), Object.keys(games));
  await f.historyReply(1);
  assert.equal(f.w.OjjudaGameRankings.isHistoryOpen(), true);
  assert.equal(f.host().querySelector('.board-rank-help-button')?.getAttribute('aria-expanded'), 'false');
  assert.equal(f.host().querySelectorAll('[data-game]').length, 2);
  assert.match(f.host().querySelector('[data-game=chess]').textContent, /이번 달 기록 없음/);
  await f.pickMonth('2026-09');
  assert.equal(f.requests[2].args.p_month, '2026-09-01');
  await f.historyReply(2, { month: '2026-09', closed: true, leaders: { tank: { nick: '지난달 우승자', score: 15 }, chess: null } });
  assert.equal(f.score(), '15연승');
  assert.match(f.host().querySelector('[data-game=chess]').textContent, /기록 없음/);
  await f.pickMonth('2026-09');
  assert.equal(f.requests.length, 3, 'choosing the selected month does not read twice');
  await f.pickMonth('2026-10');
  assert.equal(f.requests.length, 3, 'returning to the current month reuses its recent result');
  assert.equal(f.score(), '9연승');
  assert.equal(f.w.OjjudaGameRankings.back(), true); await tick();
  assert.equal(f.w.OjjudaGameRankings.isHistoryOpen(), false);
  assert.ok(f.host().querySelector('.board-rank-track'));
  assert.equal(f.score(), '9연승');
  assert.equal(f.requests.length, 3, 'history shares the current-month result with the carousel');
  assert.equal(f.w.OjjudaGameRankings.back(), false);
});

test('midnight keeps the previous month and an open ranking rolls over once at 01:00 Korean time', async t => {
  const f = fixture(t); f.clock(Date.parse('2026-12-31T14:59:59.990Z'));
  f.mount(); await f.reply(0, 7);
  f.clock(Date.parse('2026-12-31T15:00:00.001Z')); f.mount(); await tick();
  assert.equal(f.requests.length, 1, 'midnight is not the ranking reset');
  f.clock(Date.parse('2026-12-31T16:00:00.001Z')); f.fireTimers(); await tick();
  assert.equal(f.requests.length, 2, 'the open December ranking refreshes at January 1, 01:00');
  f.w.dispatchEvent(new f.w.Event('focus'));
  f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow', { persisted: true }));
  await tick(); assert.equal(f.requests.length, 2, 'resume events do not duplicate the boundary read');
  await f.reply(1, null, { data: { tank: null, chess: null } });
  assert.equal(f.score(), '—');
  assert.match(f.host().querySelector('[data-game=tank]').textContent, /이번 달 기록 없음/);
});

test('month responses cannot overwrite a later selection or a restored carousel', async t => {
  const f = fixture(t); f.mount(); await f.reply(0, 4);
  f.host().querySelector('.board-rank-history-open').click(); await f.historyReply(1);
  await f.pickMonth('2026-09'); await f.pickMonth('2026-08');
  await f.historyReply(3, { month: '2026-08', closed: true, leaders: { tank: null, chess: null } });
  assert.equal(f.host().querySelector('.board-rank-month').value, '2026-08');
  assert.match(f.host().textContent, /이 달에는 등록된 기록이 없어요/);
  await f.historyReply(2, { month: '2026-09', closed: true, leaders: { tank: { nick: '늦은 9월 응답', score: 99 } } });
  assert.equal(f.host().querySelector('.board-rank-month').value, '2026-08'); assert.equal(f.score(), '—');
  const pending = f.w.OjjudaGameRankings.refresh(); await tick();
  assert.equal(f.requests[4].args.p_month, '2026-08-01');
  f.host().querySelector('.board-rank-back').click(); await tick();
  await f.reply(5, 12);
  await f.historyReply(4, { month: '2026-08', closed: true, leaders: { tank: { nick: '늦은 8월 응답', score: 88 } } }); await pending;
  assert.ok(f.host().querySelector('.board-rank-track')); assert.equal(f.score(), '12연승');
});

test('history retries failed reads and keeps its archived month on refresh and game return', async t => {
  const f = fixture(t); f.mount(); await f.reply(0, 3);
  f.host().querySelector('.board-rank-history-open').click(); await f.historyReply(1);
  await f.pickMonth('2026-09'); await f.historyReply(2, {}, { data: null, error: { message: 'offline' } });
  assert.match(f.host().textContent, /월별 순위를 불러오지 못했어요/);
  const retry = f.host().querySelector('.board-leader-retry'); retry.click(); retry.click(); await tick();
  assert.equal(f.requests.length, 4, 'one retry action cannot produce duplicate requests');
  assert.equal(f.requests[3].args.p_month, '2026-09-01');
  await f.historyReply(3, { month: '2026-09', closed: true, leaders: { tank: { nick: '9월 우승자', score: 20 }, chess: null } });
  const refreshed = f.w.OjjudaGameRankings.refresh(); await tick();
  assert.equal(f.requests[4].name, 'community_game_monthly_history'); assert.equal(f.requests[4].args.p_month, '2026-09-01');
  await f.historyReply(4, { month: '2026-09', closed: true, leaders: { tank: { nick: '9월 우승자', score: 20 } } }); await refreshed;
  f.w.document.body.classList.add('gaming'); await tick();
  f.w.dispatchEvent(new f.w.CustomEvent('ojjuda:game-record-saved', { detail: { owner: 'member-a', game: 'tank' } }));
  await tick(); assert.equal(f.requests.length, 5);
  f.w.document.body.classList.remove('gaming'); await tick();
  assert.equal(f.requests[5].args.p_month, '2026-09-01');
  await f.historyReply(5, { month: '2026-09', closed: true, leaders: { tank: { nick: '9월 우승자', score: 20 } } });
  assert.equal(f.score(), '20연승'); assert.equal(f.host().querySelector('.board-rank-month').value, '2026-09');
});

test('historical rows follow access changes without losing their month or accepting an old account response', async t => {
  const f = fixture(t), listeners = new Set(); let allowed = true;
  const adult = { matgo: { name: '맞고', unit: 'G' }, poker: { name: '세븐포커', unit: 'G' }, photo_ttang: { name: '포토땅따먹기', unit: '장' } };
  const getGames = () => ({ ...games, ...(allowed ? adult : {}) });
  f.w.OjjudaMatgoAccess = { visible: () => allowed, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
  f.mount({ getGames }); await f.reply(0, 4);
  f.host().querySelector('.board-rank-history-open').click(); await f.historyReply(1);
  await f.pickMonth('2026-09');
  allowed = false; for (const fn of listeners) fn(); await tick();
  assert.equal(f.host().querySelectorAll('[data-game]').length, 2, 'restricted rows disappear immediately');
  assert.equal(f.requests[3].args.p_month, '2026-09-01');
  assert.deepEqual(Array.from(f.requests[3].args.p_games), Object.keys(games));
  await f.historyReply(3, { month: '2026-09', closed: true });
  await f.historyReply(2, { month: '2026-09', closed: true, leaders: { tank: { nick: '9월 우승', score: 9 }, matgo: { nick: '맞고 우승', score: 100 } } });
  assert.equal(f.score(), '9연승'); assert.equal(f.host().querySelector('[data-game=matgo]'), null);
  allowed = true; await f.w.OjjudaGameRankings.syncCatalog('member-a'); await tick();
  assert.equal(f.requests.length, 4, 'restored access can reuse the same recently archived month for the same account and allowed catalog');
  assert.ok(f.host().querySelector('[data-game=matgo]')); assert.equal(f.host().querySelector('.board-rank-month').value, '2026-09');
  const oldHost = f.host(), late = f.w.OjjudaGameRankings.refresh(); await tick();
  const markup = oldHost.innerHTML; f.actor('member-b'); f.mount({ getGames }); await f.reply(5, 2);
  await f.historyReply(4, { month: '2026-09', closed: true, leaders: { tank: { nick: 'old account', score: 999 } } }); await late;
  assert.equal(oldHost.innerHTML, markup, 'the disposed historical view stays untouched'); assert.equal(f.score(), '2연승');
  f.host().querySelector('.board-rank-history-open').click(); await tick();
  assert.equal(f.requests.length, 7, 'the new account cannot reuse the previous account history');
  await f.historyReply(6, { leaders: { tank: { nick: '새 회원', score: 2 } } }); assert.equal(f.score(), '2연승');
});

test('rollover refreshes current history, preserves archived selections and ignores the prior month in flight', async t => {
  const f = fixture(t); f.clock(Date.parse('2026-10-31T15:59:59.990Z')); f.mount(); await f.reply(0, 7);
  f.host().querySelector('.board-rank-history-open').click(); await tick();
  f.clock(Date.parse('2026-10-31T16:00:00.001Z')); f.fireTimers(); await tick();
  assert.equal(f.requests[2].args.p_month, null);
  const november = { month: '2026-11', currentMonth: '2026-11', months: [{ month: '2026-11', hasRecords: false }, { month: '2026-10', hasRecords: true }], leaders: { tank: null, chess: null } };
  await f.historyReply(2, november); await f.historyReply(1);
  assert.equal(f.host().querySelector('.board-rank-month').value, '2026-11'); assert.equal(f.score(), '—');
  await f.pickMonth('2026-10'); await f.historyReply(3, { ...november, month: '2026-10', closed: true, leaders: { tank: { nick: '10월 우승', score: 7 } } });
  f.clock(Date.parse('2026-11-30T16:00:00.001Z')); f.w.dispatchEvent(new f.w.Event('focus')); await tick();
  assert.equal(f.requests[4].args.p_month, '2026-10-01', 'returning after rollover preserves the archived selection');
  await f.historyReply(4, { ...november, month: '2026-10', currentMonth: '2026-12', closed: true, months: [{ month: '2026-12', hasRecords: false }, { month: '2026-11', hasRecords: false }, { month: '2026-10', hasRecords: true }], leaders: { tank: { nick: '10월 우승', score: 7 } } });
  assert.equal(f.score(), '7연승'); assert.equal(f.host().querySelector('.board-rank-month').value, '2026-10');
  assert.equal(f.host().querySelector('.board-rank-month option').value, '2026-12');
});

test('an archive still being saved is distinct from a completed month with no records', async t => {
  const f = fixture(t); f.mount(); await f.reply(0, 7);
  f.host().querySelector('.board-rank-history-open').click(); await f.historyReply(1);
  await f.pickMonth('2026-09');
  await f.historyReply(2, { month: '2026-09', closed: true, pending: true, leaders: {} });
  assert.match(f.host().textContent, /이 달의 순위를 보관하고 있어요. 잠시 후 다시 불러와 주세요/);
  assert.equal(f.host().querySelector('.board-rank-history-table').hidden, true);
  assert.equal(f.host().querySelectorAll('.board-leader-empty').length, 0, 'a pending archive is never presented as empty');
  assert.equal(f.host().querySelector('.board-rank-month').value, '2026-09');
  f.host().querySelector('.board-leader-retry').click(); await tick();
  assert.equal(f.requests[3].args.p_month, '2026-09-01');
  await f.historyReply(3, { month: '2026-09', closed: true, leaders: { tank: null, chess: null } });
  assert.equal(f.host().querySelector('.board-rank-history-table').hidden, false);
  assert.equal(f.host().querySelectorAll('.board-leader-empty').length, 2);
  assert.match(f.host().textContent, /이 달에는 등록된 기록이 없어요/);
  assert.doesNotMatch(f.host().textContent, /보관하고 있어요/);
});
