const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {JSDOM} = require('jsdom');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '44444444-4444-4444-8444-444444444444';
const AWARDS = ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const copy = value => JSON.parse(JSON.stringify(value));
const deferred = () => {let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject};};
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check, message) {
  for (let i = 0; i < 150; i++) {if (check()) return; await new Promise(resolve => setTimeout(resolve, 1));}
  assert.fail(message);
}

async function fixture(t, options = {}) {
  const dom = new JSDOM(read('admin/rewards.html'), {
    url: 'https://coupon.test/admin/rewards.html', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window, doc = w.document, errors = [];
  w.addEventListener('error', event => errors.push(event.error?.message || event.message));
  w.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
  const state = {
    user: OWNER, auth: null, reads: [], uploads: [], calls: [], summaries: 0, delivered: new Map(), revoked: [],
    pending: AWARDS.map((id, index) => ({id, nickname: '당첨자' + (index + 1), month_start: '2026-10-01', game: index ? 'chess' : 'tank', amount: 5000, blocked_reason: null})),
    sent: [], manager: null, readResults: options.readResults || null
  };
  w.fetch = async () => {throw new Error('Unexpected network access in the synthetic fixture');};
  w.URL.createObjectURL = file => 'blob:https://coupon.test/' + encodeURIComponent(file.name) + '/' + randomUUID();
  w.URL.revokeObjectURL = url => state.revoked.push(url);
  w.HTMLImageElement.prototype.decode = async function () {};
  if (!w.crypto.randomUUID) w.crypto.randomUUID = randomUUID;
  const policy = {observation_days: 14, active_days_required: 7, referral_group_size: 10, gift_label: '편의점 상품권 5,000원',
    referral_member_limit: 500, referral_amount: 5000, provider_status: 'not_connected', dispatch_enabled: false};
  const deliver = payload => {
    const previous = state.delivered.get(payload.p_award);
    if (previous) {
      assert.deepEqual(payload, previous, 'an idempotent replay must retain every original payload field');
      return {data: {ok: true, replayed: true, message_id: 'message-' + payload.p_award}};
    }
    state.delivered.set(payload.p_award, copy(payload));
    const award = state.pending.find(entry => entry.id === payload.p_award);
    state.pending = state.pending.filter(entry => entry.id !== payload.p_award);
    state.sent.push({...award, id: payload.p_award, title: payload.p_title, expires_on: payload.p_expires, delivered_at: '2026-11-01T01:00:00Z'});
    return {data: {ok: true, message_id: 'message-' + payload.p_award}};
  };
  const client = {
    auth: {
      getUser: async () => ({data: {user: state.user ? {id: state.user} : null}}),
      onAuthStateChange: callback => {state.auth = callback; return {data: {subscription: {unsubscribe() {}}}};}
    },
    storage: {from: bucket => {
      assert.equal(bucket, 'reward-coupons');
      return {upload: async (uploadPath, file, settings) => {
        state.uploads.push({path: uploadPath, file, settings: copy(settings)});
        return {data: {path: uploadPath}};
      }};
    }},
    rpc: async (name, args) => {
      if (name === 'admin_reward_summary') {
        state.summaries++;
        return {data: {policy, excluded_numbers: 0, qualified_members: 0, reserved_amount: 0, sent_amount: 0,
          referrers: [], awards: [], monthly_results: [], monthly_pending: copy(state.pending), monthly_sent: copy(state.sent)}};
      }
      assert.equal(name, 'admin_send_reward_coupon');
      const payload = copy(args); state.calls.push(payload);
      return options.send ? options.send(payload, state, deliver) : deliver(payload);
    }
  };
  w.OJJUDA_CONFIG = {supabaseUrl: 'https://mock.invalid', supabaseKey: 'synthetic-public-key'};
  w.supabase = {createClient: () => client};
  w.OjjudaCouponReader = {read(file, config) {
    const gate = deferred(), task = {file, ...config, ...gate};
    state.reads.push(task);
    if (!options.holdReads) {
      const result = state.readResults?.[file.name] || {code: file.name.includes('second') ? '222222222222' : '111111111111', expires: '2099-12-31', warnings: []};
      gate.resolve(result);
    }
    // Deliberately do not reject on abort: late worker completions must be
    // ignored by the actual manager even if a worker cannot stop immediately.
    return gate.promise;
  }};
  w.eval(read('admin/reward-coupon-parser.js'));
  w.eval(read('admin/reward-coupon-batch.js'));
  w.eval(read('admin/reward-coupon-manager.js'));
  const managerAPI = w.OjjudaCouponManager;
  w.OjjudaCouponManager = {mount(args) {state.manager = managerAPI.mount(args); return state.manager;}};
  w.eval(read('admin/rewards.js'));
  t.after(() => {state.manager?.reset(); w.close(); assert.deepEqual(errors, [], 'no script errors');});
  await until(() => !doc.getElementById('content').hidden, 'initial administrator summary did not load');
  const rows = () => [...doc.querySelectorAll('[data-coupon-item]')];
  const input = (row, name) => row.querySelector('[data-coupon-field="' + name + '"]');
  const file = (name = 'first.png') => new w.File([new Uint8Array(16)], name, {type: 'image/png'});
  const selectFiles = selected => {
    const picker = doc.getElementById('coupon-file');
    Object.defineProperty(picker, 'files', {configurable: true, value: selected});
    picker.dispatchEvent(new w.Event('change', {bubbles: true}));
  };
  const ready = count => until(() => rows().length === count && rows().every(row => row.dataset.status === 'ready'), 'OCR did not finish for all items');
  const edit = (row, key, value) => {const node = input(row, key); node.value = value; node.dispatchEvent(new w.Event('input', {bubbles: true}));};
  const submit = () => doc.getElementById('coupon-form').dispatchEvent(new w.Event('submit', {bubbles: true, cancelable: true}));
  const idle = () => until(() => !state.manager.isSending() && !doc.getElementById('refresh').disabled, 'send/summary refresh did not finish');
  const switchUser = user => {state.user = user; state.auth(user ? 'SIGNED_IN' : 'SIGNED_OUT', user ? {user: {id: user}} : null);};
  return {w, doc, state, rows, input, file, selectFiles, ready, edit, submit, idle, switchUser, deliver};
}

test('multiple files are recognized, assigned in order and sent once after one submit', async t => {
  const f = await fixture(t);
  f.selectFiles([f.file('first.png'), f.file('second.png')]); await f.ready(2);
  assert.deepEqual(f.rows().map(row => f.input(row, 'award').value), AWARDS);
  assert.equal(f.state.uploads.length, 0); assert.equal(f.state.calls.length, 0, 'adding images must not send anything');
  assert.equal(f.doc.getElementById('coupon-send').disabled, false);
  f.submit(); await until(() => f.state.calls.length === 2, 'both sends were not attempted'); await f.idle();
  assert.deepEqual(f.state.calls.map(call => call.p_award), AWARDS);
  assert.equal(f.state.uploads.length, 2); assert.equal(f.state.delivered.size, 2);
  assert.deepEqual(f.rows().map(row => row.dataset.status), ['sent', 'sent']);
  f.state.uploads.forEach((upload, i) => {
    assert.ok(upload.path.startsWith(OWNER + '/' + AWARDS[i] + '/'));
    assert.deepEqual(upload.settings, {contentType: 'image/png', cacheControl: '0', upsert: false});
  });
  f.submit(); await tick(); assert.equal(f.state.calls.length, 2, 'completed items are not sent a second time');
});

test('retry skips successful items and reuses the failed item upload and payload', async t => {
  let failed = false;
  const f = await fixture(t, {send(payload, _state, deliver) {
    if (payload.p_award === AWARDS[1] && !failed) {failed = true; return {error: {code: 'P0001', message: 'coupon_image_missing'}};}
    return deliver(payload);
  }});
  f.selectFiles([f.file('first.png'), f.file('second.png')]); await f.ready(2); f.submit();
  await until(() => f.state.calls.length === 2, 'initial batch did not finish'); await f.idle();
  assert.deepEqual(f.rows().map(row => row.dataset.status), ['sent', 'failed']);
  assert.equal(f.doc.getElementById('coupon-send').disabled, false);
  f.submit(); await until(() => f.state.calls.length === 3, 'failed item was not retried'); await f.idle();
  assert.deepEqual(f.state.calls.map(call => call.p_award), [AWARDS[0], AWARDS[1], AWARDS[1]]);
  assert.deepEqual(f.state.calls[2], f.state.calls[1]); assert.equal(f.state.uploads.length, 2);
  assert.equal(f.state.delivered.size, 2);
});

test('lost reply replays frozen data after the award disappears from pending', async t => {
  let lost = false;
  const f = await fixture(t, {send(payload, _state, deliver) {
    const result = deliver(payload);
    if (!lost) {lost = true; return {error: {message: 'network reply lost'}};}
    return result;
  }});
  f.selectFiles([f.file()]); await f.ready(1); f.submit();
  await until(() => f.state.calls.length === 1, 'first send was not attempted'); await f.idle();
  assert.equal(f.state.delivered.size, 1); assert.equal(f.state.pending.some(award => award.id === AWARDS[0]), false);
  assert.equal(f.rows()[0].dataset.status, 'failed');
  for (const key of ['award', 'title', 'code', 'expires']) assert.equal(f.input(f.rows()[0], key).disabled, true, key + ' is frozen');
  assert.equal(f.doc.getElementById('coupon-clear').disabled, true); assert.equal(f.doc.getElementById('coupon-send').disabled, false);
  f.submit(); await until(() => f.state.calls.length === 2, 'lost-reply send could not be replayed'); await f.idle();
  assert.deepEqual(f.state.calls[1], f.state.calls[0]); assert.equal(f.state.uploads.length, 1);
  assert.equal(f.state.delivered.size, 1); assert.equal(f.rows()[0].dataset.status, 'sent');
});

test('duplicate recognized codes disable submission until a manual correction', async t => {
  const duplicated = {code: '111111111111', expires: '2099-12-31'};
  const f = await fixture(t, {readResults: {'first.png': duplicated, 'second.png': duplicated}});
  f.selectFiles([f.file('first.png'), f.file('second.png')]); await f.ready(2);
  assert.equal(f.doc.getElementById('coupon-send').disabled, true);
  assert.match(f.doc.getElementById('coupon-items').textContent, /동일한 쿠폰번호/);
  f.submit(); await tick(); assert.equal(f.state.calls.length, 0); assert.equal(f.state.uploads.length, 0);
  f.edit(f.rows()[1], 'code', '2222-2222-2222');
  assert.equal(f.doc.getElementById('coupon-send').disabled, false);
});

test('manual fields edited while OCR runs survive its later completion', async t => {
  const f = await fixture(t, {holdReads: true}); f.selectFiles([f.file()]);
  await until(() => f.state.reads.length === 1, 'reader did not start');
  const row = f.rows()[0]; f.edit(row, 'code', 'MANUAL-123456'); f.edit(row, 'expires', '2098-12-31'); f.edit(row, 'title', '직접 고친 상품');
  f.state.reads[0].resolve({code: '999999999999', expires: '2099-01-01', warnings: []}); await f.ready(1);
  assert.equal(f.input(row, 'code').value, 'MANUAL-123456');
  assert.equal(f.input(row, 'expires').value, '2098-12-31'); assert.equal(f.input(row, 'title').value, '직접 고친 상품');
  assert.equal(f.doc.getElementById('coupon-send').disabled, false);
});

test('deleting a reading image discards late progress and results before the next file', async t => {
  const f = await fixture(t, {holdReads: true}); f.selectFiles([f.file('first.png')]);
  await until(() => f.state.reads.length === 1, 'first reader did not start');
  const old = f.state.reads[0]; [...f.rows()[0].querySelectorAll('button')].find(button => button.textContent === '목록에서 빼기').click();
  assert.equal(f.rows().length, 0); assert.equal(old.signal.aborted, true); assert.equal(f.state.revoked.length, 1);
  f.selectFiles([f.file('second.png')]); old.onProgress('폐기해야 하는 이전 작업');
  old.resolve({code: 'OLD111111111', expires: '2099-12-31'});
  await until(() => f.state.reads.length === 2, 'next reader did not start after cancellation');
  f.state.reads[1].resolve({code: 'NEW222222222', expires: '2099-12-31'}); await f.ready(1);
  assert.match(f.rows()[0].querySelector('h3').textContent, /second\.png/);
  assert.equal(f.input(f.rows()[0], 'code').value, 'NEW222222222');
  assert.equal(f.input(f.rows()[0], 'award').value, AWARDS[0]);
  assert.doesNotMatch(f.doc.getElementById('coupon-items').textContent, /폐기해야|OLD111/);
});

test('auth changes clear the image and discard a late OCR result', async t => {
  const f = await fixture(t, {holdReads: true}); f.selectFiles([f.file()]);
  await until(() => f.state.reads.length === 1, 'reader did not start'); const old = f.state.reads[0];
  f.switchUser(OTHER); assert.equal(f.rows().length, 0); assert.equal(old.signal.aborted, true);
  old.resolve({code: 'OLD111111111', expires: '2099-12-31'});
  await until(() => !f.doc.getElementById('content').hidden, 'new account did not finish loading'); await tick();
  assert.equal(f.rows().length, 0); assert.equal(f.state.uploads.length, 0); assert.equal(f.state.calls.length, 0);
  f.selectFiles([f.file('second.png')]); await until(() => f.state.reads.length === 2, 'new account reader did not start');
  f.state.reads[1].resolve({code: 'NEW222222222', expires: '2099-12-31'}); await f.ready(1);
  assert.equal(f.input(f.rows()[0], 'code').value, 'NEW222222222');
});

test('double submit does not duplicate the first call and auth change stops remaining sends', async t => {
  const gate = deferred();
  const f = await fixture(t, {async send(payload, _state, deliver) {await gate.promise; return deliver(payload);}});
  f.selectFiles([f.file('first.png'), f.file('second.png')]); await f.ready(2);
  f.submit(); f.submit(); await until(() => f.state.calls.length === 1, 'first request did not start');
  assert.equal(f.doc.getElementById('coupon-send').disabled, true);
  f.switchUser(OTHER); gate.resolve();
  await until(() => !f.doc.getElementById('content').hidden, 'new account did not finish loading'); await tick(); await tick();
  assert.equal(f.state.calls.length, 1, 'old batch cannot send its second coupon as the new account');
  assert.equal(f.state.uploads.length, 1); assert.equal(f.rows().length, 0);
  assert.equal(f.state.manager.isSending(), false);
  assert.doesNotMatch(f.doc.getElementById('coupon-status').textContent, /모두 보냈|완료/);
});

test('fresh eligibility changes stop the batch before upload or message creation', async t => {
  const f = await fixture(t); f.selectFiles([f.file()]); await f.ready(1);
  assert.equal(f.doc.getElementById('coupon-send').disabled, false);
  f.state.pending[0].blocked_reason = 'banned'; f.submit(); await f.idle();
  assert.equal(f.state.uploads.length, 0); assert.equal(f.state.calls.length, 0);
  assert.equal(f.input(f.rows()[0], 'award').value, AWARDS[0], 'a newly blocked award is not silently reassigned');
  assert.equal(f.doc.getElementById('coupon-send').disabled, true);
  assert.match(f.doc.getElementById('coupon-status').textContent, /상태가 바뀌었|확인할 항목/);
});
