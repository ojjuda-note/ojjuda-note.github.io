const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, randomUUID } = require('node:crypto');
const root = path.join(__dirname, '..');
const paymentSource = fs.readFileSync(path.join(root, 'games/starlit-saju/payment.js'), 'utf8').replace('export class SajuPayment', 'class SajuPayment');
const previewSource = fs.readFileSync(path.join(root, 'shared/games/admin-preview.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const birth = (overrides = {}) => ({ solar: { iso: '1991-07-18' }, timeKnown: true, input: { hour: 8, minute: 37 }, ...overrides });
const annual = { topic: 'annual', year: 2026 };
const all = { topic: 'all', year: 2026 };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function harness() {
  const a = randomUUID(), b = randomUUID();
  const server = {
    a, b, owner: a, anonymous: false, coins: new Map([[a, 50], [b, 50]]), receipts: new Map(), bundles: new Map(), allOrders: new Map(), requests: [],
    loseResponse: false, failStatus: false, beforeBuy: null, beforeToken: null, beforeAdmin: null, admins: new Set(), malformed: false,
    mutateAllReceipt: null,
    async rpc(name, args = {}) {
      if (['saju_reading_buy_v2', 'saju_reading_buy_all_v3'].includes(name) && this.beforeToken) await this.beforeToken();
      const owner = this.owner;
      this.requests.push({ name, args: plain(args), owner });
      if (!owner) return { error: { code: '42501', message: 'not_signed_in' } };
      if (name === 'is_admin') {
        if (this.beforeAdmin) await this.beforeAdmin();
        return { data: this.admins.has(owner) };
      }
      if (name === 'saju_reading_status_v3') {
        if (this.failStatus) { this.failStatus = false; return { error: { message: 'network' } }; }
        return { data: {
          ok: true, chart_key: args.p_chart_key, coins: this.coins.get(owner), prices: { lifelong: 10, annual: 10, monthly: 10, all: 30 },
          entitlements: [...this.receipts.entries()].filter(([key]) => key.startsWith(`${owner}:${args.p_chart_key}:`)).map(([,receipt]) => receipt),
          bundle_entitlement: this.bundles.get(`${owner}:${args.p_chart_key}`) || null
        } };
      }
      if (args.p_expected_user !== owner) return { data: { ok: false, reason: 'account_changed' } };
      if (this.beforeBuy) await this.beforeBuy();
      if (name === 'saju_reading_buy_all_v3') {
        const products = [{ topic: 'lifelong', year: 0 }, { topic: 'annual', year: args.p_year }, { topic: 'monthly', year: args.p_year }];
        const orderKey = `${owner}:${args.p_chart_key}:${args.p_year}`;
        const previous = this.allOrders.get(orderKey);
        const legacy = this.bundles.get(`${owner}:${args.p_chart_key}`);
        if (previous || legacy) {
          const items = products.map(product => {
            const item = legacy || this.receipts.get(`${owner}:${args.p_chart_key}:${product.topic}:${product.year}`);
            return { ...item, ...product, ok: true, entitled: true, chart_key: args.p_chart_key, coins: this.coins.get(owner), charged: 0, replayed: true, entitlement_version: 2 };
          });
          return { data: { ...(previous || legacy), topic: 'all', year: args.p_year, ok: true, entitled: true,
            chart_key: args.p_chart_key, coins: this.coins.get(owner), price: 30, charged: 0, replayed: true,
            entitlement_version: 3, legacy_bundle: !!legacy, items } };
        }
        const missing = products.filter(product => !this.receipts.has(`${owner}:${args.p_chart_key}:${product.topic}:${product.year}`));
        const required = missing.length * 10;
        if (this.coins.get(owner) < required) return { data: { ok: false, reason: 'coins', price: 30, required, coins: this.coins.get(owner) } };
        this.coins.set(owner, this.coins.get(owner) - required);
        const items = products.map(product => {
          const key = `${owner}:${args.p_chart_key}:${product.topic}:${product.year}`;
          const owned = this.receipts.get(key);
          if (owned) return { ...owned, coins: this.coins.get(owner), charged: 0, replayed: true };
          const item = { ok: true, entitled: true, request_id: randomUUID(), chart_key: args.p_chart_key,
            ...product, entitlement_version: 2, price: 10, coins: this.coins.get(owner), charged: 10, replayed: false };
          this.receipts.set(key, item);
          return item;
        });
        const receipt = { ok: true, entitled: true, request_id: args.p_request_id, chart_key: args.p_chart_key,
          topic: 'all', year: args.p_year, entitlement_version: 3, price: 30, coins: this.coins.get(owner), charged: required, replayed: false, items };
        this.allOrders.set(orderKey, receipt);
        if (this.loseResponse) { this.loseResponse = false; return { error: { message: 'response lost after purchase' } }; }
        return { data: this.mutateAllReceipt ? this.mutateAllReceipt(plain(receipt)) : receipt };
      }
      assert.equal(name, 'saju_reading_buy_v2');
      const key = `${owner}:${args.p_chart_key}:${args.p_topic}:${args.p_year}`;
      const previous = this.receipts.get(key);
      if (previous) return { data: { ...previous, coins: this.coins.get(owner), charged: 0, replayed: true } };
      const bundle = this.bundles.get(`${owner}:${args.p_chart_key}`);
      if (bundle) return { data: { ...bundle, chart_key: args.p_chart_key, ok: true, topic: args.p_topic, year: args.p_year, coins: this.coins.get(owner), charged: 0, replayed: true, legacy_bundle: true, entitlement_version: 2 } };
      if (this.coins.get(owner) < 10) return { data: { ok: false, reason: 'coins', coins: this.coins.get(owner) } };
      this.coins.set(owner, this.coins.get(owner) - 10);
      const receipt = { ok: true, entitled: true, request_id: args.p_request_id, chart_key: args.p_chart_key, topic: args.p_topic, year: args.p_year, entitlement_version: 2, price: 10, coins: this.coins.get(owner), charged: 10, replayed: false };
      this.receipts.set(key, receipt);
      if (this.loseResponse) { this.loseResponse = false; return { error: { message: 'response lost after purchase' } }; }
      return { data: this.malformed ? { ...receipt, chart_key: 'f'.repeat(64) } : receipt };
    }
  };
  function page(options = {}) {
    const storage = options.storage || new Map();
    const authListeners = [], listeners = new Map();
    const client = {
      auth: {
        getSession: async () => ({ data: { session: server.owner ? { user: { id: server.owner, is_anonymous: server.anonymous } } : null } }),
        getUser: async () => ({ data: { user: server.owner ? { id: server.owner } : null } }),
        onAuthStateChange: callback => { authListeners.push(callback); return { data: { subscription: { unsubscribe() {} } } }; }
      },
      rpc: (...args) => server.rpc(...args)
    };
    const context = {
      window: {
        OJJUDA_CONFIG: { supabaseUrl: 'test', supabaseKey: 'test-publishable' }, ojjudaSupabase: client,
        addEventListener: (type, listener) => { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
        dispatchEvent: event => { for (const listener of listeners.get(event.type) || []) listener(event); }
      },
      document: { readyState: 'loading', addEventListener() {} },
      localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
      CustomEvent: class { constructor(type, value) { this.type = type; this.detail = value.detail; } },
      crypto: webcrypto, TextEncoder, AbortSignal, Uint8Array, setTimeout, clearTimeout, queueMicrotask, console
    };
    vm.runInNewContext(previewSource, context);
    const Payment = vm.runInNewContext(paymentSource + '; SajuPayment', context);
    return {
      payment: new Payment(options), storage, context,
      changeAccount(owner) {
        server.owner = owner;
        const session = owner ? { user: { id: owner, is_anonymous: server.anonymous } } : null;
        for (const callback of authListeners) callback('SIGNED_IN', session);
      }
    };
  }
  return { server, page };
}

test('one 10-ju receipt survives lost responses, page reloads, and repeat reads', async () => {
  const { server, page } = harness();
  const first = page().payment;
  assert.equal((await first.init()).signedIn, true);
  assert.equal(server.coins.get(server.a), 50);
  server.loseResponse = true;
  await assert.rejects(first.start(birth(), annual), error => error.code === 'network');
  assert.equal(server.coins.get(server.a), 40);
  const initial = server.requests.find(item => item.name === 'saju_reading_buy_v2');
  const retried = await first.start(birth(), annual);
  assert.equal(retried.request_id, initial.args.p_request_id);
  assert.equal(retried.replayed, true);
  const reloaded = page().payment;
  assert.equal((await reloaded.start(birth(), annual)).request_id, retried.request_id);
  assert.equal(server.coins.get(server.a), 40, 'server profile entitlement also prevents a second charge with a new page UUID');
  assert.equal((await reloaded.start(birth({ input: { hour: 8, minute: 37, calendar: 'lunar', year: 1991, month: 6, day: 7 } }), annual)).replayed, true);
  assert.equal(server.coins.get(server.a), 40, 'equivalent lunar/solar inputs share the canonical solar profile');
  await reloaded.start(birth({ timeKnown: false, input: { hour: null, minute: 0 } }), annual);
  assert.equal(server.coins.get(server.a), 30, 'a different birth profile is a separate purchase');
});

test('raw birth details stay local when checking and buying a named report', async () => {
  const { server, page } = harness();
  const p = page();
  const result = await p.payment.start(birth(), annual);
  const request = server.requests.find(item => item.name === 'saju_reading_buy_v2').args;
  assert.deepEqual(Object.keys(request).sort(), ['p_chart_key', 'p_expected_user', 'p_request_id', 'p_topic', 'p_verify_only', 'p_year']);
  assert.equal(request.p_expected_user, server.a);
  assert.match(request.p_chart_key, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(request).includes('1991-07-18'));
  assert.equal(p.storage.size, 0, 'no birth data, reports, or fingerprints are persisted locally');
  p.changeAccount(server.b);
  const other = await p.payment.start(birth(), annual);
  assert.notEqual(other.chart_key, result.chart_key, 'profiles cannot be matched across members using an unsalted shared hash');
});

test('rapid clicks share a purchase and a different profile cannot replace it', async () => {
  const { server, page } = harness();
  const payment = page().payment;
  await payment.init();
  const gate = deferred(), entered = deferred();
  server.beforeBuy = async () => { entered.resolve(); await gate.promise; };
  const first = payment.start(birth(), annual);
  const second = payment.start(birth(), annual);
  await entered.promise;
  await assert.rejects(payment.start(birth({ solar: { iso: '1991-07-19' } }), annual), error => error.code === 'busy');
  gate.resolve();
  const results = await Promise.all([first, second]);
  assert.equal(results[0].request_id, results[1].request_id);
  assert.equal(server.requests.filter(item => item.name === 'saju_reading_buy_v2').length, 1);
  assert.equal(server.coins.get(server.a), 40);
});

test('signed-out, anonymous, insufficient-balance, and initialization failures are recoverable', async () => {
  const { server, page } = harness();
  server.owner = null;
  const p = page();
  assert.equal((await p.payment.init()).signedIn, false);
  await assert.rejects(p.payment.start(birth(), annual), error => error.code === 'not_signed_in');
  server.anonymous = true;
  p.changeAccount(server.a);
  assert.equal((await p.payment.init()).signedIn, false);
  await assert.rejects(p.payment.start(birth(), annual), error => error.code === 'member_required');
  server.anonymous = false;
  p.changeAccount(server.a);
  server.failStatus = true;
  await assert.rejects(p.payment.init(), error => error.code === 'network');
  assert.equal((await p.payment.init()).signedIn, true);
  server.coins.set(server.a, 9);
  await assert.rejects(p.payment.start(birth(), annual), error => error.code === 'coins');
  assert.equal(server.coins.get(server.a), 9);
  server.coins.set(server.a, 10);
  assert.equal((await p.payment.start(birth(), annual)).coins, 0);
});

test('account changes invalidate a response before the old report is revealed', async () => {
  const { server, page } = harness();
  let changed = 0;
  const p = page({ onAccountChange: () => { changed++; } });
  await p.payment.init();
  const gate = deferred(), entered = deferred();
  server.beforeBuy = async () => { entered.resolve(); await gate.promise; };
  const pending = p.payment.start(birth(), annual);
  await entered.promise;
  p.changeAccount(server.b);
  gate.resolve();
  await assert.rejects(pending, error => error.code === 'not_signed_in');
  assert.equal(changed, 1);
  assert.equal(p.payment.balance, null);
  assert.equal(server.coins.get(server.b), 50);
});

test('only the existing server-verified administrator mode bypasses charges', async () => {
  const { server, page } = harness();
  const storage = new Map([[`ojjuda.admin-preview.v1:${server.a}`, 'on']]);
  const regular = page({ storage });
  await regular.payment.init();
  assert.equal(regular.payment.adminPreview, false);
  assert.equal(regular.context.window.OjjudaAdminPreview.setEnabled(true), false);
  await regular.payment.start(birth(), annual);
  assert.equal(server.coins.get(server.a), 40);
  server.admins.add(server.a);
  const admin = page({ storage });
  assert.equal((await admin.payment.init()).adminPreview, true);
  assert.equal((await admin.payment.start(birth(), annual)).price, 0);
  assert.equal(server.coins.get(server.a), 40);
  const gate = deferred(), entered = deferred();
  server.beforeAdmin = async () => { entered.resolve(); await gate.promise; };
  const pending = admin.payment.start(birth(), annual);
  await entered.promise;
  storage.set(`ojjuda.admin-preview.v1:${server.a}`, 'off');
  gate.resolve();
  await assert.rejects(pending, error => error.code === 'mode_changed');
  assert.equal(server.coins.get(server.a), 40, 'a free-mode click must never become a paid click');
});

test('an account change while the SDK retrieves its token cannot charge the new account', async () => {
  const { server, page } = harness();
  const p = page();
  await p.payment.init();
  const gate = deferred(), entered = deferred();
  server.beforeToken = async () => { entered.resolve(); await gate.promise; };
  const pending = p.payment.start(birth(), annual);
  await entered.promise;
  p.changeAccount(server.b);
  gate.resolve();
  await assert.rejects(pending, error => error.code === 'not_signed_in');
  assert.equal(server.coins.get(server.a), 50);
  assert.equal(server.coins.get(server.b), 50, 'expected-member check occurs on the server before any wallet debit');
  assert.equal(server.receipts.size, 0);
});

test('malformed receipts and invalid profile input never reveal a report', async () => {
  const { server, page } = harness();
  const payment = page().payment;
  await assert.rejects(payment.start(birth({ input: { hour: 24, minute: 0 } }), annual), error => error.code === 'invalid');
  assert.equal(server.requests.length, 0);
  server.malformed = true;
  await assert.rejects(payment.start(birth(), annual), error => error.code === 'invalid');
});

test('each category and year costs 10 once, and status checks never buy', async () => {
  const { server, page } = harness();
  const payment = page().payment;
  let status = await payment.status(birth());
  assert.equal(status.entitlements.length, 0);
  assert.equal(server.coins.get(server.a), 50);
  assert.equal(server.requests.filter(call => call.name === 'saju_reading_buy_v2').length, 0);
  await payment.start(birth(), { topic: 'lifelong', year: 2026 });
  await payment.start(birth(), annual);
  await payment.start(birth(), { topic: 'monthly', year: 2026 });
  assert.equal(server.coins.get(server.a), 20, 'three separate products cost 30 in total');
  assert.equal((await payment.start(birth(), { topic: 'lifelong', year: 2027 })).charged, 0, 'lifelong is independent of the selected year');
  assert.equal((await payment.start(birth(), annual)).charged, 0);
  await payment.start(birth(), { topic: 'annual', year: 2027 });
  assert.equal(server.coins.get(server.a), 10, 'a different annual report has its own explicit purchase');
  status = await payment.inspect(birth());
  assert.equal(status.entitlements.length, 4);
  assert.equal(status.entitlements.filter(item => item.topic === 'monthly').length, 1, 'one monthly product contains all twelve months');
  const count = server.requests.filter(call => call.name === 'saju_reading_buy_v2').length;
  await assert.rejects(payment.start(birth(), { topic: 'unknown', year: 2026 }), error => error.code === 'invalid');
  await assert.rejects(payment.start(birth(), { topic: 'monthly', year: 2051 }), error => error.code === 'invalid');
  await assert.rejects(payment.start(birth()), error => error.code === 'invalid');
  assert.equal(server.requests.filter(call => call.name === 'saju_reading_buy_v2').length, count);
});

test('a legacy full-report purchase remains usable for all categories without another debit', async () => {
  const { server, page } = harness();
  const payment = page().payment;
  await payment.status(birth());
  const chartKey = server.requests.find(call => call.name === 'saju_reading_status_v3' && call.args.p_chart_key)?.args.p_chart_key;
  const receipt = { request_id: randomUUID(), price: 10, paid_at: '2026-11-12T00:00:00Z' };
  server.bundles.set(`${server.a}:${chartKey}`, receipt);
  assert.equal((await payment.status(birth())).bundle_entitlement.request_id, receipt.request_id);
  for (const product of [{topic:'lifelong'}, annual, {topic:'monthly',year:2027}, {topic:'all',year:2028}]) {
    const opened = await payment.start(birth(), product);
    assert.equal(opened.charged, 0);
    assert.equal(opened.legacy_bundle, true);
    assert.equal(opened.request_id, receipt.request_id);
  }
  assert.equal(server.coins.get(server.a), 50);
});

test('all three readings use one 30-ju purchase and remain individually free to reopen', async () => {
  const { server, page } = harness();
  const p = page();
  const status = await p.payment.inspect(birth());
  assert.equal(status.prices.all, 30);
  const result = await p.payment.start(birth(), all);
  assert.equal(result.price, 30);
  assert.equal(result.charged, 30);
  assert.deepEqual(plain(result.items.map(item => [item.topic, item.year])), [['lifelong', 0], ['annual', 2026], ['monthly', 2026]]);
  assert.equal(server.requests.filter(call => call.name === 'saju_reading_buy_all_v3').length, 1);
  assert.equal(server.requests.filter(call => call.name === 'saju_reading_buy_v2').length, 0, 'the client must not issue three separate purchases');
  const args = server.requests.find(call => call.name === 'saju_reading_buy_all_v3').args;
  assert.deepEqual(Object.keys(args).sort(), ['p_chart_key', 'p_expected_user', 'p_request_id', 'p_verify_only', 'p_year']);
  assert.equal(args.p_expected_user, server.a);
  assert.ok(!JSON.stringify(args).includes('1991-07-18'));
  assert.equal(p.storage.size, 0);
  for (const product of [{ topic: 'lifelong' }, annual, { topic: 'monthly', year: 2026 }, all]) {
    assert.equal((await p.payment.start(birth(), product)).charged, 0);
  }
  assert.equal(server.coins.get(server.a), 20);
  assert.equal((await p.payment.inspect(birth())).entitlements.length, 3);
});

test('all-reading receipts charge only missing topics and keep lifelong independent of the year', async () => {
  const { server, page } = harness();
  const payment = page().payment;
  await payment.start(birth(), annual);
  const partiallyOwned = await payment.start(birth(), all);
  assert.equal(partiallyOwned.charged, 20);
  assert.equal(partiallyOwned.items.find(item => item.topic === 'annual').charged, 0);
  const nextYear = await payment.start(birth(), { topic: 'all', year: 2027 });
  assert.equal(nextYear.price, 30);
  assert.equal(nextYear.charged, 20);
  const lifelong = nextYear.items.find(item => item.topic === 'lifelong');
  assert.equal(lifelong.year, 0);
  assert.equal(lifelong.charged, 0);
  assert.equal(server.coins.get(server.a), 0);
  assert.equal(server.receipts.size, 5);
});

test('finishing a partially or fully owned set costs only 10 or zero ju', async () => {
  for (const alreadyBought of [2, 3]) {
    const { server, page } = harness();
    const payment = page().payment;
    const products = [{ topic: 'lifelong' }, annual, { topic: 'monthly', year: 2026 }];
    for (const product of products.slice(0, alreadyBought)) await payment.start(birth(), product);
    const result = await payment.start(birth(), all);
    assert.equal(result.price, 30);
    assert.equal(result.charged, (3 - alreadyBought) * 10);
    assert.equal(server.coins.get(server.a), 20);
    assert.equal(server.receipts.size, 3);
    assert.equal(server.allOrders.size, 1);
  }
});

test('insufficient full-purchase balance reports the required total without unlocking any part', async () => {
  const { server, page } = harness();
  const payment = page().payment;
  server.coins.set(server.a, 29);
  await assert.rejects(payment.start(birth(), all), error => error.code === 'coins' && /30쭈/.test(error.message));
  assert.equal(server.coins.get(server.a), 29);
  assert.equal(server.receipts.size, 0);
  assert.equal(server.allOrders.size, 0);
  await payment.start(birth(), annual);
  await assert.rejects(payment.start(birth(), all), error => error.code === 'coins' && /20쭈/.test(error.message));
  assert.equal(server.coins.get(server.a), 19);
  assert.equal(server.receipts.size, 1);
  assert.equal(server.allOrders.size, 0);
});

test('lost full-purchase responses and page reloads recover the same order without another debit', async () => {
  const { server, page } = harness();
  const first = page().payment;
  server.loseResponse = true;
  await assert.rejects(first.start(birth(), all), error => error.code === 'network');
  const request = server.requests.find(call => call.name === 'saju_reading_buy_all_v3');
  assert.equal(server.coins.get(server.a), 20);
  const retried = await first.start(birth(), all);
  assert.equal(retried.request_id, request.args.p_request_id);
  assert.equal(retried.charged, 0);
  const reloaded = await page().payment.start(birth(), all);
  assert.equal(reloaded.request_id, retried.request_id);
  assert.equal(reloaded.charged, 0);
  assert.equal(server.coins.get(server.a), 20);
  assert.equal(server.allOrders.size, 1);
});

test('a full receipt must contain exactly the three matching product scopes and consistent charges', async () => {
  const mutations = [
    receipt => { receipt.items.pop(); return receipt; },
    receipt => { receipt.items[2] = { ...receipt.items[1] }; return receipt; },
    receipt => { receipt.items[1].year = 2027; return receipt; },
    receipt => { receipt.items[0].year = 2026; return receipt; },
    receipt => { receipt.items[0].chart_key = 'f'.repeat(64); return receipt; },
    receipt => { receipt.items[0].price = 30; return receipt; },
    receipt => { receipt.items[0].entitled = false; return receipt; },
    receipt => { receipt.items[0].coins++; return receipt; },
    receipt => { receipt.charged = 20; return receipt; },
    receipt => { receipt.price = 10; return receipt; },
  ];
  for (const mutate of mutations) {
    const { server, page } = harness();
    server.mutateAllReceipt = mutate;
    await assert.rejects(page().payment.start(birth(), all), error => error.code === 'invalid');
  }
});

test('full purchases retain account and verified administrator-mode protection', async () => {
  const { server, page } = harness();
  const p = page();
  await p.payment.init();
  const gate = deferred(), entered = deferred();
  server.beforeToken = async () => { entered.resolve(); await gate.promise; };
  const pending = p.payment.start(birth(), all);
  await entered.promise;
  p.changeAccount(server.b);
  gate.resolve();
  await assert.rejects(pending, error => error.code === 'not_signed_in');
  assert.equal(server.coins.get(server.a), 50);
  assert.equal(server.coins.get(server.b), 50);
  assert.equal(server.receipts.size, 0);
  server.beforeToken = null;
  server.admins.add(server.b);
  const admin = page({ storage: new Map([[`ojjuda.admin-preview.v1:${server.b}`, 'on']]) }).payment;
  assert.equal((await admin.inspect(birth())).prices.all, 30);
  const preview = await admin.start(birth(), all);
  assert.equal(preview.adminPreview, true);
  assert.equal(preview.charged, 0);
  assert.equal(preview.price, 0);
  assert.equal(preview.topic, 'all');
  assert.equal(server.coins.get(server.b), 50);
});
