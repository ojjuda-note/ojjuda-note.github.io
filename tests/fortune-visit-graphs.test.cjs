const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const code = fs.readFileSync(path.join(__dirname, '../admin/visitors.js'), 'utf8');
const TODAY = '2026-11-13';
const days = () => Array.from({ length: 30 }, (_, i) => ({
  period: new Date(Date.parse(TODAY + 'T00:00:00Z') - (29 - i) * 86400000).toISOString().slice(0, 10), tarot: 0, saju: 0
}));
function fortune(extra = {}) { return { started_at: '2026-11-11T15:00:00Z', daily: days(), ...extra }; }
function statistics(value, features = [{ feature: 'arcade', uses: 2 }]) {
  return {
    started_at: '2026-11-01T00:00:00Z', today_date: TODAY, today: 8, month: 27, total: 27,
    daily: days().map(row => ({ period: row.period, visits: 1 })),
    hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, visits: 1 })),
    weekday: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, visits: 1 })),
    features,
    sources: ['direct', 'naver', 'google', 'search', 'social', 'external', 'internal', 'campaign'].map(source => ({ source, visits: 1 })),
    guest_games: [], guest_boards: [], agit_details: [], arcade_details: [], fortune_visits: value
  };
}
const legacy = { today: 2, month: 3, total: 4, started_at: '2026-10-01T00:00:00Z', daily: [], monthly: [] };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settled() { await tick(); await tick(); }
function fixture(t, value, { delayed = false, features } = {}) {
  const dom = new JSDOM('<main id="host"></main>', { runScripts: 'outside-only', url: 'https://ojjuda.kr/world.html?admin=visitors' });
  const host = dom.window.document.getElementById('host'), calls = [], pending = [];
  let actor = 'fixture-admin', stats = statistics(value, features), auth, unsubscribed = 0;
  const client = { rpc: async name => {
    calls.push(name);
    assert.ok(['admin_site_usage_stats', 'admin_guest_visit_stats'].includes(name));
    if (name === 'admin_guest_visit_stats') return { data: legacy };
    if (delayed) return new Promise(resolve => pending.push(resolve));
    return { data: stats };
  }, auth: { onAuthStateChange(fn) { auth = fn; return { data: { subscription: { unsubscribe() { unsubscribed++; } } } }; } } };
  dom.window.eval(code);
  const controller = dom.window.OjjudaAdminVisitors.mount({ container: host, client, getAdminId: () => actor });
  t.after(() => { controller.destroy(); dom.window.close(); });
  return { host, calls, pending, controller,
    q: selector => host.querySelector(selector), qa: selector => [...host.querySelectorAll(selector)],
    set(value) { stats = statistics(value, features); },
    signOut() { actor = null; auth('SIGNED_OUT', null); },
    changeActor() { actor = 'another-admin'; }, get unsubscribed() { return unsubscribed; }
  };
}

test('merges the two 30-day visit totals into the existing feature chart using one descending scale', async t => {
  const data = fortune(); data.daily[28].tarot = 4; data.daily[28].saju = 1; data.daily[29].tarot = 3; data.daily[29].saju = 5;
  const f = fixture(t, data); await settled();
  assert.equal(f.qa('.visitor-insights > .visitor-chart-grid > .visitor-chart-card').length, 9);
  assert.equal(f.qa('.visitor-chart-card').length, 9, 'no additional fortune chart cards');
  assert.equal(f.qa('.visitor-fortune,.visitor-fortune-grid,.visitor-fortune-cards').length, 0);
  assert.equal(f.qa('.visitor-chart-col').length, 61, 'only the existing date/hour/weekday columns remain');
  const chart = f.q('[data-chart="features"]');
  assert.equal(chart.querySelector('h4').textContent, '많이 선택한 기능');
  const rows = [...chart.querySelectorAll('.visitor-rank-row')];
  assert.deepEqual(rows.map(row => row.dataset.feature), ['tarot', 'saju', 'arcade']);
  assert.deepEqual(rows.map(row => row.querySelector('strong').textContent), ['7회', '6회', '2회']);
  for (const [index, count] of [7, 6, 2].entries()) {
    const width = parseFloat(rows[index].querySelector('.visitor-rank-fill').style.width);
    assert.ok(Math.abs(width - count / 7 * 100) < 0.001, 'all features use the same maximum');
  }
  assert.match(chart.querySelector('.visitor-feature-note').textContent, /타로·사주.*2026년 11월 12일/);
  assert.equal(f.calls.filter(name => name === 'admin_site_usage_stats').length, 1);
});

test('retains all twelve legacy features plus low-frequency and zero fortune rows without duplicates', async t => {
  const keys = ['arcade', 'park', 'settings', 'portal', 'group', 'fanpages', 'restaurants', 'festival', 'game_stacker', 'game_mole', 'game_runner', 'agit'];
  const features = keys.map((feature, index) => ({ feature, uses: 100 - index }));
  const data = fortune(); data.daily[29].tarot = 1;
  const f = fixture(t, data, { features: features.slice().reverse() }); await settled();
  const rows = f.qa('[data-chart="features"] .visitor-rank-row');
  assert.equal(rows.length, 14, 'fortune rows are appended before sorting and are not trimmed from the top twelve');
  assert.deepEqual(rows.map(row => row.dataset.feature), [...keys, 'tarot', 'saju']);
  assert.equal(new Set(rows.map(row => row.dataset.feature)).size, 14);
  assert.equal(f.q('[data-feature="tarot"] strong').textContent, '1회');
  assert.equal(f.q('[data-feature="saju"] strong').textContent, '0회');
  assert.equal(f.q('[data-feature="tarot"] .visitor-rank-fill').style.width, '1%');
  assert.equal(f.q('[data-feature="saju"] .visitor-rank-fill').style.width, '0%');
  const duplicate = fixture(t, fortune(), { features: [{ feature: 'arcade', uses: 2 }, { feature: 'arcade', uses: 2 }] });
  await settled();
  assert.equal(duplicate.qa('[data-chart="features"] [data-feature="arcade"]').length, 1);
  assert.equal(duplicate.q('[data-chart="features"] [data-feature="arcade"] strong').textContent, '2회', 'duplicate input rows are not added twice');
  assert.equal(duplicate.qa('[data-chart="features"] .visitor-rank-row').length, 3);
});

test('collection-start footnote uses the Korean date and valid zero totals remain visible', async t => {
  const data = fortune({ started_at: '2026-11-12T15:00:00Z' });
  const f = fixture(t, data, { features: [] }); await settled();
  const chart = f.q('[data-chart="features"]');
  assert.match(chart.querySelector('.visitor-feature-note').textContent, /2026년 11월 13일/);
  assert.match(chart.querySelector('.visitor-feature-note').textContent, /이전 방문 제외/);
  assert.equal(chart.querySelectorAll('.visitor-rank-row').length, 2, 'an all-zero chart still shows both measured service totals');
  for (const feature of ['tarot', 'saju']) {
    assert.equal(chart.querySelector(`[data-feature="${feature}"] strong`).textContent, '0회');
    assert.equal(chart.querySelector(`[data-feature="${feature}"] .visitor-rank-fill`).style.width, '0%');
  }
  assert.doesNotMatch(chart.textContent, /불러오지 못/);
  assert.equal(f.qa('.is-uncollected,.visitor-fortune').length, 0);
});

test('an older server without the optional field keeps all existing graphs and reports no product totals', async t => {
  const f = fixture(t, undefined); f.set(undefined); await settled();
  assert.equal(f.qa('.visitor-chart-card').length, 9);
  const chart = f.q('[data-chart="features"]');
  assert.equal(chart.querySelectorAll('[data-feature="tarot"],[data-feature="saju"]').length, 0);
  assert.equal(chart.querySelector('[data-feature="arcade"] strong').textContent, '2회');
  assert.match(chart.querySelector('.visitor-feature-note').textContent, /집계를 아직 불러오지 못했어요/);
  assert.doesNotMatch(chart.textContent, /0회/);
});

test('malformed product statistics are isolated from valid site graphs instead of becoming zero counts', async t => {
  const cases = [null, { started_at: 'invalid', daily: days() }, fortune({ daily: [] })];
  for (const value of [-1, 1.5, '3', null, Number.MAX_SAFE_INTEGER + 1]) {
    const data = fortune(); data.daily[29].tarot = value; cases.push(data);
  }
  const duplicate = fortune(); duplicate.daily[28].period = TODAY; cases.push(duplicate);
  const missingToday = fortune(); missingToday.daily[29].period = '2026-11-14'; cases.push(missingToday);
  const beforeStart = fortune(); beforeStart.daily[0].saju = 7; cases.push(beforeStart);
  const overflow = fortune({ started_at: '2026-10-01T00:00:00Z' }); overflow.daily[28].tarot = Number.MAX_SAFE_INTEGER; overflow.daily[29].tarot = 1; cases.push(overflow);
  for (const data of cases) {
    const f = fixture(t, data); await settled();
    assert.equal(f.qa('.visitor-chart-card').length, 9);
    const chart = f.q('[data-chart="features"]');
    assert.equal(chart.querySelectorAll('[data-feature="tarot"],[data-feature="saju"]').length, 0);
    assert.equal(chart.querySelector('[data-feature="arcade"] strong').textContent, '2회');
    assert.match(chart.querySelector('.visitor-feature-note').textContent, /집계를 아직 불러오지 못했어요/);
    assert.doesNotMatch(chart.textContent, /0회/);
  }
});

test('refresh updates the merged chart without duplicate rows or unrelated personal fields', async t => {
  const f = fixture(t, fortune()); await settled();
  const updated = fortune(); updated.daily[29].saju = 9;
  updated.user_id = 'private-user-identifier'; updated.daily[29].nickname = '<img src=x onerror=alert(1)>';
  f.set(updated); await f.controller.refresh();
  assert.equal(f.qa('[data-chart="features"]').length, 1);
  assert.equal(f.qa('[data-chart="features"] .visitor-rank-row').length, 3);
  assert.deepEqual(f.qa('[data-chart="features"] .visitor-rank-row').map(row => row.dataset.feature), ['saju', 'arcade', 'tarot']);
  assert.equal(f.q('[data-feature="saju"] strong').textContent, '9회');
  assert.equal(f.q('[data-feature="tarot"] strong').textContent, '0회');
  assert.equal(f.qa('.visitor-chart-card').length, 9);
  assert.equal(f.qa('.visitor-fortune').length, 0);
  assert.doesNotMatch(f.host.textContent, /private-user-identifier|onerror/);
  assert.equal(f.qa('img,iframe').length, 0);
  assert.equal(f.calls.filter(name => name === 'admin_site_usage_stats').length, 2);
});

test('sign-out clears product data and discards an outstanding product statistics response', async t => {
  const f = fixture(t, fortune(), { delayed: true }); await settled();
  assert.equal(f.pending.length, 1);
  f.signOut(); f.pending[0]({ data: statistics(fortune()) }); await settled();
  assert.equal(f.qa('.visitor-fortune,.visitor-chart-card').length, 0);
  assert.match(f.host.textContent, /관리자로 다시 로그인/);
});

test('another account or a destroyed view cannot receive the prior request results', async t => {
  for (const mode of ['actor', 'destroy']) {
    const f = fixture(t, fortune(), { delayed: true }); await settled();
    if (mode === 'actor') f.changeActor(); else f.controller.destroy();
    f.pending[0]({ data: statistics(fortune()) }); await settled();
    assert.equal(f.qa('.visitor-fortune,.visitor-chart-card').length, 0);
    if (mode === 'destroy') { assert.equal(f.unsubscribed, 1); assert.equal(f.host.textContent, ''); }
  }
});
