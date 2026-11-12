const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const code = fs.readFileSync(path.join(__dirname, '../admin/fortune-purchases.js'), 'utf8');
const ADMIN = '10000000-0000-4000-8000-000000000001';
const MEMBER = '20000000-0000-4000-8000-000000000002';
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settled() { await tick(); await tick(); }
function receipt(index = 0, extra = {}) {
  return { request_id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    user_id: MEMBER, nickname: '결제한 회원', product: 'tarot', topic: 'overall', topic_title: '전체운세',
    year: null, coins: 30, created_at: '2026-11-12T23:59:00Z', ...extra };
}
function page(args, total = 65) {
  const amount = Math.min(args.p_limit, Math.max(0, total - args.p_offset));
  return { data: { items: Array.from({ length: amount }, (_,i) => receipt(args.p_offset + i)),
    total_count: total, total_ju: total * 30, tarot_count: total, saju_count: 0 } };
}
function fixture(t, { responder = args => page(args), actor = ADMIN, initialState = null } = {}) {
  const dom = new JSDOM('<!doctype html><main><div id="host"></div></main>', {
    url: 'https://ojjuda.kr/world.html?admin=fortune-purchases', runScripts: 'outside-only'
  });
  const { window } = dom, host = window.document.getElementById('host');
  const calls = [];
  let handler = responder, authChange, unsubscribeCount = 0, current = true, controller;
  const client = {
    rpc: async (name, args) => {
      assert.equal(name, 'admin_fortune_purchases', 'the module must only call its read-only RPC');
      const copy = JSON.parse(JSON.stringify(args)); calls.push(copy); return handler(copy);
    },
    auth: { onAuthStateChange(fn) { authChange = fn; return { data: { subscription: { unsubscribe() { unsubscribeCount++; } } } }; } }
  };
  window.eval(code);
  function mount(state) { controller = window.OjjudaAdminFortunePurchases.mount({
    container: host, client, getAdminId: () => actor, isCurrent: () => current, initialState: state
  }); return controller; }
  mount(initialState);
  t.after(() => { controller.destroy(); window.close(); });
  return {
    window, host, calls, get controller() { return controller; },
    q: selector => host.querySelector(selector), qa: selector => [...host.querySelectorAll(selector)],
    button: text => [...host.querySelectorAll('button')].find(node => node.textContent === text),
    setResponder(fn) { handler = fn; }, setActor(value) { actor = value; }, setCurrent(value) { current = value; },
    signOut() { actor = null; authChange('SIGNED_OUT', null); },
    get unsubscribed() { return unsubscribeCount; },
    submit(values = {}) {
      for (const [name, value] of Object.entries(values)) host.querySelector(`[name="${name}"]`).value = value;
      host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    },
    remount(state) { controller.destroy(); return mount(state); }
  };
}

test('loads real receipt fields, full-filter totals and Korean payment time through one read-only RPC', async t => {
  const f = fixture(t); await settled();
  assert.deepEqual(f.calls[0], { p_product: 'all', p_query: '', p_from: null, p_to: null, p_limit: 30, p_offset: 0 });
  assert.equal(f.qa('.afp-purchase').length, 30);
  assert.deepEqual(f.qa('.afp-metric dd').map(x => x.textContent), ['65건', '1,950쭈', '65건', '0건']);
  assert.match(f.q('.afp-time').textContent, /2026.*11.*13.*08:59/);
  assert.equal(f.q('.afp-time').title, '한국시간 (Asia/Seoul)');
  assert.match(f.q('.afp-status').textContent, /65건 중 1–30건/);
  assert.equal(f.q('.afp-member-id').title, MEMBER);
  assert.match(f.q('.afp-identifiers').textContent, new RegExp(MEMBER));
  assert.match(f.host.textContent, /무료 미리보기는 포함되지 않습니다/);
});

test('product, literal member search and inclusive date inputs are sent together; filters reset pagination', async t => {
  const f = fixture(t); await settled();
  f.button('다음').click(); await settled();
  assert.equal(f.calls.at(-1).p_offset, 30);
  f.submit({ product: 'saju', query: '  회원%_이름  ', from: '2026-11-01', to: '2026-11-13' });
  await settled();
  assert.deepEqual(f.calls.at(-1), { p_product: 'saju', p_query: '회원%_이름', p_from: '2026-11-01', p_to: '2026-11-13', p_limit: 30, p_offset: 0 });
  f.button('다음').click(); await settled();
  assert.equal(f.calls.at(-1).p_offset, 30);
  assert.equal(f.calls.at(-1).p_query, '회원%_이름');
  f.button('초기화').click(); await settled();
  assert.deepEqual(f.calls.at(-1), f.calls[0]);
  assert.equal(f.q('[name="query"]').maxLength, 100);
});

test('invalid date ranges cannot send a request or replace the applied filters', async t => {
  const f = fixture(t); await settled();
  const before = f.calls.length;
  f.submit({ from: '2026-11-14', to: '2026-11-13' });
  await settled();
  assert.equal(f.calls.length, before);
  assert.match(f.q('.afp-filter-error').textContent, /시작일.*종료일/);
  assert.equal(f.controller.getState().from, '');
  f.submit({ from: '2026-11-13' }); await settled();
  assert.equal(f.calls.at(-1).p_from, '2026-11-13');
  assert.equal(f.calls.at(-1).p_to, '2026-11-13');
  assert.equal(f.q('.afp-filter-error').textContent, '');
});

test('pagination reaches the last page and restoring the view keeps applied filters, page and unfinished search', async t => {
  const f = fixture(t); await settled();
  f.submit({ product: 'tarot', query: '결제한', from: '2026-11-01' }); await settled();
  f.button('다음').click(); await settled(); f.button('다음').click(); await settled();
  assert.equal(f.calls.at(-1).p_offset, 60);
  assert.equal(f.qa('.afp-purchase').length, 5);
  assert.equal(f.button('다음').disabled, true);
  f.q('[name="query"]').value = '아직 조회하지 않은 검색';
  const state = f.controller.getState();
  f.remount(state); await settled();
  assert.equal(f.calls.at(-1).p_offset, 60);
  assert.equal(f.calls.at(-1).p_query, '결제한');
  assert.equal(f.q('[name="query"]').value, '아직 조회하지 않은 검색');
  f.button('새로고침').click(); await settled();
  assert.equal(f.calls.at(-1).p_query, '결제한');
  assert.equal(f.calls.at(-1).p_offset, 60);
  f.button('첫 페이지').click(); await settled();
  assert.equal(f.calls.at(-1).p_offset, 0);
});

test('server strings render as text and unrelated private fields are never displayed', async t => {
  const row = receipt(0, { product: 'saju', nickname: '<img src=x onerror="alert(1)">',
    topic_title: '<script>fake()</script>', year: 2027, coins: 10,
    birth_date: 'private-birth-date', reading: 'private-reading-content' });
  const f = fixture(t, { responder: () => ({ data: { items: [row], total_count: 1, total_ju: 10, tarot_count: 0, saju_count: 1 } }) });
  await settled();
  assert.equal(f.qa('img,script,iframe').length, 0);
  assert.match(f.host.textContent, /<img src=x/);
  assert.match(f.host.textContent, /<script>fake/);
  assert.match(f.host.textContent, /대상 연도 2027년/);
  assert.match(f.q('.afp-charge').textContent, /실제 차감10쭈/);
  assert.doesNotMatch(f.host.textContent, /private-birth-date|private-reading-content/);
  assert.equal(f.qa('button').some(node => /환불|쭈 수정|지급/.test(node.textContent)), false);
});

test('empty results and network failures are distinguished; failed reload never leaves stale totals or receipts', async t => {
  const f = fixture(t); await settled();
  f.setResponder(() => ({ error: { code: '503', message: 'network unavailable' } }));
  await f.controller.refresh();
  assert.equal(f.qa('.afp-purchase').length, 0);
  assert.equal(f.qa('.afp-metric').length, 0);
  assert.match(f.q('.afp-status').textContent, /불러오지 못했어요/);
  f.setResponder(args => page(args, 0));
  f.button('다시 불러오기').click(); await settled();
  assert.match(f.q('.afp-status').textContent, /조건에 맞는 구매내역이 없어요/);
  assert.deepEqual(f.qa('.afp-metric dd').map(x => x.textContent), ['0건', '0쭈', '0건', '0건']);
  assert.equal(f.qa('.afp-pager button').length, 0);
});

test('malformed receipts are an error instead of invented rows or a misleading zero result', async t => {
  const f = fixture(t, { responder: () => ({ data: { items: [receipt(0, { coins: -10 })],
    total_count: 1, total_ju: 10, tarot_count: 1, saju_count: 0 } }) });
  await settled();
  assert.equal(f.qa('.afp-purchase').length, 0);
  assert.equal(f.qa('.afp-metric').length, 0);
  assert.match(f.q('.afp-status').textContent, /불러오지 못했어요/);
});

test('older pending responses cannot replace the newest query result', async t => {
  const pending = [];
  const f = fixture(t, { responder: args => new Promise(resolve => pending.push({ args, resolve })) });
  await settled();
  const latest = f.controller.refresh(); await settled();
  assert.equal(pending.length, 2);
  const second = page(pending[1].args, 1); second.data.items[0].nickname = '최신 결과';
  pending[1].resolve(second); await latest;
  const first = page(pending[0].args, 1); first.data.items[0].nickname = '이전 응답';
  pending[0].resolve(first); await settled();
  assert.match(f.host.textContent, /최신 결과/);
  assert.doesNotMatch(f.host.textContent, /이전 응답/);
});

test('permission loss clears all previously displayed receipt data and ends the subscription', async t => {
  const f = fixture(t); await settled();
  f.setResponder(() => ({ error: { code: '42501', message: 'admin_required' } }));
  await f.controller.refresh();
  assert.equal(f.qa('.afp-purchase,form,.afp-summary').length, 0);
  assert.match(f.host.textContent, /관리자 권한/);
  assert.equal(f.unsubscribed, 1);
  const before = f.calls.length; await f.controller.refresh();
  assert.equal(f.calls.length, before);
});

test('sign-out clears the screen and a late response from the previous account is discarded', async t => {
  let resolve;
  const f = fixture(t, { responder: () => new Promise(done => { resolve = done; }) });
  await settled(); f.signOut();
  resolve(page(f.calls[0], 1)); await settled();
  assert.equal(f.qa('.afp-purchase,form,.afp-summary').length, 0);
  assert.match(f.host.textContent, /관리자 계정으로 다시/);
  assert.equal(f.unsubscribed, 1);
});

test('changed actor and destroyed view reject late results even without an auth notification', async t => {
  for (const change of ['actor', 'destroy']) {
    let resolve;
    const f = fixture(t, { responder: () => new Promise(done => { resolve = done; }) });
    await settled();
    if (change === 'actor') f.setActor(MEMBER); else f.controller.destroy();
    resolve(page(f.calls[0], 1)); await settled();
    assert.equal(f.qa('.afp-purchase').length, 0);
    assert.equal(f.unsubscribed, 1);
    if (change === 'actor') assert.match(f.host.textContent, /관리자 계정으로 다시/);
    else assert.equal(f.host.textContent, '');
  }
});

test('missing administrator identity cannot start a read', async t => {
  const f = fixture(t, { actor: null }); await settled();
  assert.equal(f.calls.length, 0);
  assert.match(f.host.textContent, /관리자 계정만 구매내역/);
});
