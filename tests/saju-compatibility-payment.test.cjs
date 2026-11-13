const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, randomUUID, createHash } = require('node:crypto');
const root = path.join(__dirname, '..');
const parentSource = fs.readFileSync(path.join(root, 'games/starlit-saju/payment.js'), 'utf8').replace('export class SajuPayment', 'class SajuPayment');
const source = fs.readFileSync(path.join(root, 'games/starlit-saju/compatibility-payment.mjs'), 'utf8').replace('export class SajuCompatibilityPayment', 'class SajuCompatibilityPayment').replace('export const COMPATIBILITY_PRICE', 'const COMPATIBILITY_PRICE');
const previewSource = fs.readFileSync(path.join(root, 'shared/games/admin-preview.js'), 'utf8');
const ACCESS_MS = 86400000;
const plain = value => JSON.parse(JSON.stringify(value));
const birth = (overrides = {}) => ({ solar: { iso: '1990-05-17' }, timeKnown: true, input: { hour: 8, minute: 37 }, ...overrides });
const partner = (overrides = {}) => birth({ solar: { iso: '1992-06-02' }, input: { hour: 10, minute: 20 }, ...overrides });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function openQuoted(payment, first = birth(), second = partner()) {
  const status = await payment.status(first, second);
  return payment.start(first, second, { expectedCharge: status.adminPreview || status.entitlement ? 0 : 20 });
}

async function seedLegacyPurchase(server, payment, elapsed = 6 * 60 * 60 * 1000) {
  const quote = await payment.status(birth(), partner());
  const legacyPairKey = createHash('sha256').update(`ojjuda-saju-compatibility-v1|${server.a}|1990-05-17|8:37|KST-civil-v1||1992-06-02|10:20|KST-civil-v1`).digest('hex');
  assert.equal(quote.pair_key, legacyPairKey, 'the price change preserves the original member/pair fingerprint');
  const record = { owner: server.a, pair_key: legacyPairKey, request_id: randomUUID(), price: 10,
    paid_at: new Date(server.now - elapsed).toISOString(), expires_at: new Date(server.now - elapsed + ACCESS_MS).toISOString() };
  server.coins.set(server.a, 40);
  server.receipts.set(`${server.a}:${record.pair_key}`, record);
  server.ledger.set(record.request_id, record);
  return record;
}

function harness() {
  const a = randomUUID(), b = randomUUID(), clocks = [];
  const server = {
    a, b, owner: a, anonymous: false, now: Date.parse('2026-11-13T03:00:00Z'),
    coins: new Map([[a, 50], [b, 50]]), receipts: new Map(), ledger: new Map(), requests: [], admins: new Set(),
    loseResponse: false, beforeToken: null, beforeBuy: null, beforeAdmin: null, mutateReceipt: null, mutateStatus: null,
    advance(ms) { this.now += ms; for (const clock of clocks) { clock.wall += ms; clock.monotonic += ms; } },
    active(value) { return value && Date.parse(value.expires_at) > this.now; },
    metadata() { return { server_now: new Date(this.now).toISOString(), access_hours: 24, access_version: 1, entitlement_version: 1 }; },
    error(reason, extra = {}) { return { data: { ok: false, reason, ...extra } }; },
    receipt(value, { charged = 0, replayed = true, entitlement_replayed = true } = {}) {
      return { ok: true, entitled: true, product: 'saju', topic: 'compatibility', title: '사주 궁합', price: value.price,
        request_id: value.request_id, pair_key: value.pair_key, paid_at: value.paid_at, expires_at: value.expires_at,
        coins: this.coins.get(value.owner), charged, replayed, entitlement_replayed, ...this.metadata() };
    },
    async rpc(name, args = {}) {
      if (name === 'saju_compatibility_buy_v1' && this.beforeToken) await this.beforeToken();
      const owner = this.owner;
      this.requests.push({ name, args: plain(args), owner });
      if (!owner) return { error: { code: '42501', message: 'not_signed_in' } };
      if (name === 'is_admin') {
        if (this.beforeAdmin) await this.beforeAdmin();
        return { data: this.admins.has(owner) };
      }
      if (name === 'saju_reading_status_v4') return { data: { ok: true, chart_key: null, coins: this.coins.get(owner),
        prices: { lifelong: 10, annual: 10, monthly: 10, all: 30 }, entitlements: [], bundle_entitlement: null,
        server_now: new Date(this.now).toISOString(), access_hours: 24, access_version: 4 } };
      const pair = `${owner}:${args.p_pair_key}`;
      if (name === 'saju_compatibility_status_v1') {
        const owned = this.receipts.get(pair);
        const result = { ok: true, pair_key: args.p_pair_key, price: 20, coins: this.coins.get(owner),
          entitlement: this.active(owned) ? this.receipt(owned) : null, ...this.metadata() };
        return { data: this.mutateStatus ? this.mutateStatus(plain(result)) : result };
      }
      assert.equal(name, 'saju_compatibility_buy_v1', 'compatibility never invokes an ordinary reading purchase');
      if (args.p_expected_user !== owner) return this.error('account_changed');
      if (this.beforeBuy) await this.beforeBuy();
      const previous = this.ledger.get(args.p_request_id);
      if (previous) {
        if (previous.owner !== owner || previous.pair_key !== args.p_pair_key) return this.error('request_conflict');
        if (!this.active(previous)) return this.error('access_expired', { coins: this.coins.get(owner) });
        const receipt = this.receipt(previous, { entitlement_replayed: false });
        return { data: this.mutateReceipt ? this.mutateReceipt(plain(receipt)) : receipt };
      }
      const owned = this.receipts.get(pair), required = this.active(owned) ? 0 : 20;
      if (args.p_expected_charge !== required) return this.error('price_changed', { required, coins: this.coins.get(owner) });
      if (this.coins.get(owner) < required) return this.error('coins', { price: 20, required, coins: this.coins.get(owner) });
      let record = owned;
      if (required) {
        this.coins.set(owner, this.coins.get(owner) - 20);
        record = { owner, pair_key: args.p_pair_key, request_id: args.p_request_id, price: 20,
          paid_at: new Date(this.now).toISOString(), expires_at: new Date(this.now + ACCESS_MS).toISOString() };
        this.receipts.set(pair, record); this.ledger.set(record.request_id, record);
      }
      const receipt = this.receipt(record, { charged: required, replayed: required === 0, entitlement_replayed: required === 0 });
      if (this.loseResponse) { this.loseResponse = false; return { error: { message: 'response lost after debit' } }; }
      return { data: this.mutateReceipt ? this.mutateReceipt(plain(receipt)) : receipt };
    }
  };
  function page(options = {}) {
    const storage = options.storage || new Map(), authListeners = [], listeners = new Map(), balances = [];
    const clock = { wall: server.now + (options.clockOffset || 0), monotonic: 0 }; clocks.push(clock);
    class PageDate extends Date { static now() { return clock.wall; } }
    const client = {
      auth: {
        getSession: async () => ({ data: { session: server.owner ? { user: { id: server.owner, is_anonymous: server.anonymous } } : null } }),
        getUser: async () => ({ data: { user: server.owner ? { id: server.owner } : null } }),
        onAuthStateChange: callback => { authListeners.push(callback); return { data: { subscription: { unsubscribe() {} } } }; }
      }, rpc: (...args) => server.rpc(...args)
    };
    const context = {
      window: { OJJUDA_CONFIG: { supabaseUrl: 'test', supabaseKey: 'test-publishable' }, ojjudaSupabase: client,
        addEventListener: (type, callback) => { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); },
        dispatchEvent: event => { for (const callback of listeners.get(event.type) || []) callback(event); }
      },
      document: { readyState: 'loading', addEventListener() {} },
      localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
      CustomEvent: class { constructor(type, value) { this.type = type; this.detail = value.detail; } },
      Date: PageDate, performance: { now: () => clock.monotonic }, crypto: options.crypto || webcrypto,
      TextEncoder, Uint8Array, AbortSignal, setTimeout, clearTimeout, queueMicrotask, console
    };
    vm.runInNewContext(previewSource, context);
    const Parent = vm.runInNewContext(`(()=>{${parentSource}; return SajuPayment;})()`, context);
    const Payment = vm.runInNewContext(`(()=>{${source}; return SajuCompatibilityPayment;})()`, context);
    const parent = new Parent({ onBalance: value => balances.push(value) }), payment = new Payment(parent);
    return { parent, payment, balances, clock, storage, context,
      changeAccount(owner) {
        server.owner = owner;
        const session = owner ? { user: { id: owner, is_anonymous: server.anonymous } } : null;
        for (const callback of authListeners) callback('SIGNED_IN', session);
      }
    };
  }
  return { server, page };
}

test('one separate 20-ju pair purchase survives reverse order, free reopening and page reload', async () => {
  const { server, page } = harness(), p = page();
  const first = await openQuoted(p.payment);
  assert.equal(first.charged, 20); assert.equal(p.parent.balance, 30);
  const reopened = await openQuoted(p.payment, partner(), birth());
  assert.equal(reopened.request_id, first.request_id); assert.equal(reopened.charged, 0);
  assert.equal(reopened.expires_at, first.expires_at);
  const restored = await openQuoted(page().payment);
  assert.equal(restored.request_id, first.request_id); assert.equal(server.coins.get(server.a), 30);
  assert.equal(server.ledger.size, 1);
  assert.equal(server.requests.filter(call => /saju_reading_buy/.test(call.name)).length, 0);
});

test('an active historical 10-ju receipt remains free with its original expiry after the price becomes 20', async () => {
  const { server, page } = harness(), p = page();
  const record = await seedLegacyPurchase(server, p.payment), original = plain(record);
  const quote = await p.payment.status(birth(), partner());
  assert.equal(quote.price, 20); assert.equal(quote.entitlement.price, 10); assert.equal(quote.entitlement.charged, 0);
  assert.equal(p.payment.remainingMs(quote.entitlement), 18 * 60 * 60 * 1000);
  const reopened = await openQuoted(p.payment, partner(), birth());
  const restored = await openQuoted(page().payment);
  for (const receipt of [reopened, restored]) {
    assert.equal(receipt.request_id, record.request_id); assert.equal(receipt.price, 10); assert.equal(receipt.charged, 0);
    assert.equal(receipt.paid_at, original.paid_at); assert.equal(receipt.expires_at, original.expires_at);
  }
  assert.deepEqual(server.ledger.get(record.request_id), original);
  assert.equal(server.coins.get(server.a), 40); assert.equal(server.ledger.size, 1);
  assert.ok(server.requests.filter(call => call.name === 'saju_compatibility_buy_v1').every(call => call.args.p_expected_charge === 0));
});

test('a legacy receipt expires at its original boundary and renews for 20 only after an explicit paid request', async () => {
  const { server, page } = harness(), p = page();
  const record = await seedLegacyPurchase(server, p.payment), original = plain(record);
  const first = await openQuoted(p.payment);
  server.advance(18 * 60 * 60 * 1000 - 1);
  assert.equal(p.payment.remainingMs(first), 1);
  server.advance(1);
  assert.equal(p.payment.isActive(first), false);
  assert.equal((await p.payment.status(birth(), partner())).entitlement, null);
  await assert.rejects(p.payment.start(birth(), partner(), { expectedCharge: 0 }),
    error => error.code === 'price_changed' && error.required === 20);
  assert.equal(server.coins.get(server.a), 40); assert.equal(server.ledger.size, 1);
  const renewed = await p.payment.start(birth(), partner(), { expectedCharge: 20 });
  assert.equal(renewed.price, 20); assert.equal(renewed.charged, 20); assert.notEqual(renewed.request_id, first.request_id);
  assert.equal(p.payment.remainingMs(renewed), ACCESS_MS); assert.equal(server.coins.get(server.a), 20);
  assert.equal(server.ledger.size, 2); assert.deepEqual(server.ledger.get(record.request_id), original);
});

test('retrying a historical successful UUID returns its 10-ju receipt without a new debit', async () => {
  const { server, page } = harness(), p = page();
  const record = await seedLegacyPurchase(server, p.payment), original = plain(record);
  p.payment.requests.set(record.pair_key, { request_id: record.request_id });
  const recovered = await p.payment.start(partner(), birth(), { expectedCharge: 20 });
  assert.equal(recovered.request_id, record.request_id); assert.equal(recovered.price, 10);
  assert.equal(recovered.charged, 0); assert.equal(recovered.replayed, true); assert.equal(recovered.entitlement_replayed, false);
  assert.equal(recovered.expires_at, original.expires_at);
  assert.equal(server.coins.get(server.a), 40); assert.equal(server.ledger.size, 1);
  assert.deepEqual(server.ledger.get(record.request_id), original);
});

test('a stale 10-ju status cannot authorize a purchase from the updated client', async () => {
  const { server, page } = harness(), p = page();
  server.mutateStatus = value => ({ ...value, price: 10 });
  await assert.rejects(openQuoted(p.payment), error => error.code === 'invalid');
  assert.equal(server.requests.filter(call => call.name === 'saju_compatibility_buy_v1').length, 0);
  assert.equal(server.coins.get(server.a), 50); assert.equal(server.ledger.size, 0);
});

test('pair keys use canonical local profiles, are symmetric and owner-specific, and never transmit raw input', async () => {
  const { server, page } = harness(), p = page();
  const first = await p.payment.status(birth(), partner());
  const swapped = await p.payment.status(partner(), birth({ input: { hour: 8, minute: 37, calendar: 'lunar', year: 1990, month: 4, day: 23 }, name: '비공개 이름' }));
  assert.match(first.pair_key, /^[0-9a-f]{64}$/); assert.equal(first.pair_key, swapped.pair_key);
  const unknown = await p.payment.status(birth({ timeKnown: false, input: { hour: null, minute: 0 } }), partner());
  assert.notEqual(unknown.pair_key, first.pair_key);
  assert.equal((await p.payment.status(partner(), birth({ timeKnown: false, input: { minute: 45 } }))).pair_key, unknown.pair_key);
  await p.payment.start(birth(), partner(), { expectedCharge: 20 });
  for (const call of server.requests.filter(call => call.name.startsWith('saju_compatibility_'))) {
    assert.doesNotMatch(JSON.stringify(call.args), /1990-05-17|1992-06-02|8:37|10:20|비공개|KST|unknown/);
    assert.deepEqual(Object.keys(call.args).sort(), call.name.includes('_status_') ? ['p_pair_key']
      : ['p_expected_charge', 'p_expected_user', 'p_pair_key', 'p_request_id', 'p_verify_only']);
  }
  assert.equal(p.storage.size, 0);
  p.changeAccount(server.b);
  assert.notEqual((await p.payment.status(birth(), partner())).pair_key, first.pair_key);
});

test('invalid dates, missing partners and invalid displayed prices fail before any RPC', async () => {
  const { server, page } = harness(), p = page();
  for (const chart of [null, birth({ solar: { iso: '1990-02-30' } }), birth({ solar: { iso: '1800-05-17' } }),
    birth({ timeKnown: 'true' }), birth({ input: { hour: 24, minute: 0 } }), birth({ input: { hour: 0, minute: 60 } })]) {
    await assert.rejects(p.payment.start(chart, partner(), { expectedCharge: 20 }), error => error.code === 'invalid');
  }
  for (const expectedCharge of [undefined, null, '20', -20, 1, 10, NaN, Infinity]) {
    await assert.rejects(p.payment.start(birth(), partner(), { expectedCharge }), error => error.code === 'invalid');
  }
  await assert.rejects(p.payment.status(birth()), error => error.code === 'invalid');
  assert.equal(server.requests.length, 0);
  const initial = await p.payment.status();
  assert.equal(initial.pair_key, null); assert.equal(initial.entitlement, null); assert.equal(initial.price, 20);
});

test('rapid reversed-pair clicks share one purchase while changed pairs or prices are blocked', async () => {
  const { server, page } = harness(), p = page(); await p.parent.init();
  const entered = deferred(), gate = deferred(); server.beforeBuy = async () => { entered.resolve(); await gate.promise; };
  const first = p.payment.start(birth(), partner(), { expectedCharge: 20 });
  const second = p.payment.start(partner(), birth(), { expectedCharge: 20 });
  await entered.promise;
  await assert.rejects(p.payment.start(birth(), partner({ solar: { iso: '1992-06-03' } }), { expectedCharge: 20 }), error => error.code === 'busy');
  await assert.rejects(p.payment.start(birth(), partner(), { expectedCharge: 0 }), error => error.code === 'busy');
  gate.resolve(); const results = await Promise.all([first, second]);
  assert.equal(results[0].request_id, results[1].request_id); assert.equal(server.ledger.size, 1);
  assert.equal(server.requests.filter(call => call.name === 'saju_compatibility_buy_v1').length, 1);
});

test('displayed zero stays zero and a changed quote requires another explicit click', async () => {
  const { server, page } = harness(), p = page();
  await assert.rejects(p.payment.start(birth(), partner(), { expectedCharge: 0 }), error => error.code === 'price_changed' && error.required === 20);
  assert.equal(server.coins.get(server.a), 50); assert.equal(server.ledger.size, 0);
  const calls = server.requests.filter(call => call.name === 'saju_compatibility_buy_v1');
  assert.equal(calls.length, 1); assert.equal(calls[0].args.p_expected_charge, 0);
  const result = await p.payment.start(birth(), partner(), { expectedCharge: 20 });
  assert.equal(result.charged, 20); assert.equal(server.ledger.size, 1);
});

test('24-hour access ends exactly at the boundary and neither status nor reopening extends it', async () => {
  const { server, page } = harness(), p = page();
  const first = await openQuoted(p.payment); assert.equal(p.payment.remainingMs(first), ACCESS_MS);
  server.advance(ACCESS_MS - 1);
  const again = await openQuoted(p.payment); assert.equal(again.charged, 0); assert.equal(again.expires_at, first.expires_at);
  assert.equal(p.payment.remainingMs(again), 1); server.advance(1);
  assert.equal(p.payment.isActive(first), false); assert.equal((await p.payment.status(birth(), partner())).entitlement, null);
  assert.equal(server.coins.get(server.a), 30); assert.equal(server.ledger.size, 1);
  const renewed = await p.payment.start(birth(), partner(), { expectedCharge: 20 });
  assert.notEqual(renewed.request_id, first.request_id); assert.equal(renewed.charged, 20);
  assert.equal(p.payment.remainingMs(renewed), ACCESS_MS); assert.equal(server.ledger.size, 2);
});

test('a free quote expiring in flight cannot trigger an automatic debit', async () => {
  const { server, page } = harness(), p = page(); await openQuoted(p.payment);
  server.advance(ACCESS_MS - 1); assert.ok((await p.payment.status(birth(), partner())).entitlement);
  server.beforeBuy = async () => { server.beforeBuy = null; server.advance(1); };
  const before = server.requests.filter(call => call.name === 'saju_compatibility_buy_v1').length;
  await assert.rejects(p.payment.start(birth(), partner(), { expectedCharge: 0 }), error => ['price_changed', 'access_expired'].includes(error.code));
  assert.equal(server.coins.get(server.a), 30);
  assert.equal(server.requests.filter(call => call.name === 'saju_compatibility_buy_v1').length, before + 1);
  assert.equal((await openQuoted(p.payment)).charged, 20);
});

test('lost responses reuse the same UUID even when the pair order changes', async () => {
  const { server, page } = harness(), p = page(); server.loseResponse = true;
  await assert.rejects(p.payment.start(birth(), partner(), { expectedCharge: 20 }), error => error.code === 'network');
  const id = server.requests.find(call => call.name === 'saju_compatibility_buy_v1').args.p_request_id;
  const recovered = await p.payment.start(partner(), birth(), { expectedCharge: 20 });
  assert.equal(recovered.request_id, id); assert.equal(recovered.charged, 0); assert.equal(recovered.replayed, true);
  assert.equal(server.ledger.size, 1); assert.equal(server.coins.get(server.a), 30);
});

test('an expired ambiguous UUID stops once; only a later click can create a fresh purchase', async () => {
  const { server, page } = harness(), p = page(); server.loseResponse = true;
  await assert.rejects(openQuoted(p.payment), error => error.code === 'network');
  const id = server.requests.find(call => call.name === 'saju_compatibility_buy_v1').args.p_request_id;
  server.advance(ACCESS_MS);
  await assert.rejects(openQuoted(p.payment), error => error.code === 'access_expired');
  assert.equal(server.requests.at(-1).args.p_request_id, id); assert.equal(server.ledger.size, 1); assert.equal(server.coins.get(server.a), 30);
  const renewed = await openQuoted(p.payment); assert.notEqual(renewed.request_id, id); assert.equal(renewed.charged, 20);
  assert.equal(server.ledger.size, 2);
});

test('an account changing while the SDK obtains a token cannot charge the new member', async () => {
  const { server, page } = harness(), p = page(); await p.parent.init();
  const gate = deferred(), entered = deferred(); server.beforeToken = async () => { entered.resolve(); await gate.promise; };
  const task = p.payment.start(birth(), partner(), { expectedCharge: 20 }); await entered.promise;
  p.changeAccount(server.b); gate.resolve();
  await assert.rejects(task, error => error.code === 'not_signed_in');
  assert.equal(server.coins.get(server.a), 50); assert.equal(server.coins.get(server.b), 50); assert.equal(server.ledger.size, 0);
  assert.equal(p.parent.balance, null);
});

test('old-account responses and a leave-and-return account switch cannot reveal a paid receipt or update balance', async () => {
  for (const returnToOriginal of [false, true]) {
    const { server, page } = harness(), p = page(); await p.parent.init();
    const gate = deferred(), entered = deferred(); server.beforeBuy = async () => { entered.resolve(); await gate.promise; };
    const task = p.payment.start(birth(), partner(), { expectedCharge: 20 }); await entered.promise;
    p.changeAccount(server.b); if (returnToOriginal) p.changeAccount(server.a); gate.resolve();
    await assert.rejects(task, error => ['not_signed_in', 'mode_changed'].includes(error.code));
    assert.equal(p.parent.balance, null); assert.equal(server.coins.get(server.b), 50);
  }
});

test('grants stay bound to validated receipts and the current account and mode', async () => {
  const { server, page } = harness(), p = page(); const receipt = await openQuoted(p.payment);
  assert.equal(p.payment.isActive({ ...receipt }), true);
  assert.equal(p.payment.isActive({ ...receipt, expires_at: new Date(server.now + 2 * ACCESS_MS).toISOString() }), false);
  assert.equal(p.payment.isActive({ ...receipt, pair_key: 'f'.repeat(64) }), false);
  assert.equal(p.payment.isActive({ expires_at: receipt.expires_at }), false);
  assert.equal(p.payment.isActive({ ...receipt, adminPreview: true }), false);
  p.changeAccount(server.b); assert.equal(p.payment.isActive(receipt), false);
  await p.payment.status(birth(), partner()); assert.equal(p.payment.isActive(receipt), false);
  p.changeAccount(server.a); assert.equal(p.payment.isActive(receipt), false);
  const restored = await p.payment.status(birth(), partner()); assert.equal(p.payment.isActive(restored.entitlement), true);
});

test('only the existing server-verified administrator preview bypasses compatibility purchases', async () => {
  const { server, page } = harness(), storage = new Map([[`ojjuda.admin-preview.v1:${server.a}`, 'on']]);
  const ordinary = page({ storage }); const paid = await openQuoted(ordinary.payment);
  assert.equal(paid.price, 20); assert.equal(ordinary.parent.adminPreview, false);
  server.admins.add(server.a); const admin = page({ storage });
  const count = server.requests.filter(call => call.name.startsWith('saju_compatibility_')).length;
  const preview = await openQuoted(admin.payment);
  assert.equal(preview.adminPreview, true); assert.equal(preview.charged, 0); assert.equal(preview.price, 0);
  assert.equal(admin.payment.remainingMs({ ...preview }), Infinity);
  assert.equal(server.requests.filter(call => call.name.startsWith('saju_compatibility_')).length, count);
  const entered = deferred(), gate = deferred(); server.beforeAdmin = async () => { entered.resolve(); await gate.promise; };
  const task = admin.payment.start(birth(), partner(), { expectedCharge: 0 }); await entered.promise;
  storage.set(`ojjuda.admin-preview.v1:${server.a}`, 'off'); gate.resolve();
  await assert.rejects(task, error => error.code === 'mode_changed');
  assert.equal(admin.payment.isActive(preview), false); assert.equal(server.coins.get(server.a), 30);
});

test('malformed, wrong-scope, overcharged and extended receipts fail closed before updating the wallet', async () => {
  const mutations = [
    value => ({ ...value, ok: 'true' }), value => ({ ...value, entitled: false }),
    value => ({ ...value, pair_key: 'f'.repeat(64) }), value => ({ ...value, topic: 'lifelong' }),
    value => ({ ...value, product: 'tarot' }), value => ({ ...value, price: 0 }), value => ({ ...value, charged: 30 }),
    value => ({ ...value, price: 10 }), value => ({ ...value, price: 10, charged: 10 }), value => ({ ...value, price: 20, charged: 10 }),
    value => ({ ...value, request_id: randomUUID() }), value => ({ ...value, request_id: 'invalid' }),
    value => ({ ...value, coins: -1 }), value => ({ ...value, coins: 40.5 }), value => ({ ...value, coins: Number.MAX_SAFE_INTEGER + 1 }),
    value => ({ ...value, replayed: true }), value => ({ ...value, entitlement_replayed: undefined }),
    value => ({ ...value, access_version: 4 }), value => ({ ...value, entitlement_version: 2 }), value => ({ ...value, access_hours: 48 }),
    value => ({ ...value, server_now: 'invalid' }), value => ({ ...value, server_now: '2026-02-30T00:00:00Z' }),
    value => ({ ...value, paid_at: 'invalid' }), value => ({ ...value, expires_at: value.paid_at }),
    value => ({ ...value, expires_at: new Date(Date.parse(value.expires_at) + 1).toISOString() }),
    value => ({ ...value, paid_at: new Date(Date.parse(value.paid_at) + 1).toISOString() })
  ];
  for (const mutate of mutations) {
    const { server, page } = harness(), p = page(); await p.parent.init(); const before = p.balances.length;
    server.mutateReceipt = mutate;
    await assert.rejects(p.payment.start(birth(), partner(), { expectedCharge: 20 }), error => error.code === 'invalid');
    assert.equal(p.balances.length, before); assert.equal(p.payment.grants.size, 0);
  }
});

test('status rejects malformed prices, balance, metadata or an entitlement for another pair', async () => {
  const mutations = [
    value => ({ ...value, price: 30 }), value => ({ ...value, coins: '40' }), value => ({ ...value, access_version: 4 }),
    value => ({ ...value, entitlement: [] }), value => ({ ...value, entitlement: undefined }),
    value => ({ ...value, pair_key: null }), value => ({ ...value, entitlement: { ...value.entitlement, pair_key: 'a'.repeat(64) } }),
    value => ({ ...value, entitlement: { ...value.entitlement, coins: value.coins + 1 } }),
    value => ({ ...value, entitlement: { ...value.entitlement, expires_at: null } }),
    value => ({ ...value, entitlement: { ...value.entitlement, price: 15 } }),
    value => ({ ...value, entitlement: { ...value.entitlement, price: 10, charged: 10, replayed: false } })
  ];
  for (const mutate of mutations) {
    const { server, page } = harness(), p = page(); await openQuoted(p.payment); const before = p.balances.length;
    server.mutateStatus = mutate;
    await assert.rejects(p.payment.status(birth(), partner()), error => error.code === 'invalid');
    assert.equal(p.balances.length, before); assert.equal(server.ledger.size, 1);
  }
});

test('server time defeats initial clock skew, rollback and suspended monotonic timers', async () => {
  const { server, page } = harness(), p = page({ clockOffset: -30 * ACCESS_MS });
  const first = await openQuoted(p.payment); assert.equal(p.payment.remainingMs(first), ACCESS_MS);
  server.advance(ACCESS_MS - 1000); p.clock.wall -= 10 * ACCESS_MS;
  assert.equal(p.payment.remainingMs(first), 1000); p.clock.monotonic += 1000;
  assert.equal(p.payment.isActive(first), false);
  const other = page({ clockOffset: 30 * ACCESS_MS });
  const fresh = await openQuoted(other.payment, birth(), partner({ solar: { iso: '1992-06-03' } }));
  other.clock.wall += ACCESS_MS;
  assert.equal(other.payment.isActive(fresh), false);
});

test('late status and purchase responses cannot reveal access that expired in flight', async () => {
  const { server, page } = harness(), p = page(); await openQuoted(p.payment); server.advance(ACCESS_MS - 1000);
  const rpc = server.rpc.bind(server);
  server.rpc = async (name, args) => {
    const result = await rpc(name, args);
    if (name === 'saju_compatibility_status_v1') server.advance(1000);
    return result;
  };
  assert.equal((await p.payment.status(birth(), partner())).entitlement, null);
  assert.equal(server.coins.get(server.a), 30);
  server.rpc = async (name, args) => {
    const result = await rpc(name, args);
    if (name === 'saju_compatibility_buy_v1') server.advance(ACCESS_MS);
    return result;
  };
  await assert.rejects(p.payment.start(birth(), partner(), { expectedCharge: 20 }), error => error.code === 'access_expired');
  assert.equal(server.ledger.size, 2); assert.equal(p.parent.balance, 10);
});

test('a new verified server quote recovers a device-clock jump without renewing the paid interval', async () => {
  const { server, page } = harness(), p = page(); const first = await openQuoted(p.payment);
  p.clock.wall += 7 * ACCESS_MS; assert.equal(p.payment.isActive(first), false);
  const verified = await p.payment.status(birth(), partner());
  assert.ok(verified.entitlement); assert.equal(verified.entitlement.expires_at, first.expires_at);
  assert.equal(p.payment.remainingMs(verified.entitlement), ACCESS_MS);
  assert.equal(server.ledger.size, 1); assert.equal(server.coins.get(server.a), 30);
  server.advance(ACCESS_MS);
  assert.equal((await p.payment.status(birth(), partner())).entitlement, null);
});

test('signed-out and anonymous accounts cannot buy, while insufficient balance is recoverable', async () => {
  const { server, page } = harness(); server.owner = null; const p = page();
  await assert.rejects(p.payment.start(birth(), partner(), { expectedCharge: 20 }), error => error.code === 'not_signed_in');
  server.anonymous = true; p.changeAccount(server.a);
  await assert.rejects(p.payment.status(birth(), partner()), error => error.code === 'member_required');
  server.anonymous = false; p.changeAccount(server.a); server.coins.set(server.a, 19);
  await assert.rejects(openQuoted(p.payment), error => error.code === 'coins');
  assert.equal(p.parent.balance, 19); assert.equal(server.ledger.size, 0);
  server.coins.set(server.a, 20); const receipt = await openQuoted(p.payment);
  assert.equal(receipt.coins, 0); assert.equal(p.parent.balance, 0);
});
