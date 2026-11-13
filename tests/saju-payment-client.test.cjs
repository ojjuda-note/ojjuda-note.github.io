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

const ACCESS_MS = 24 * 60 * 60 * 1000;
async function startQuoted(payment, chart, product) {
  const status = await payment.status(chart);
  const targets = product?.topic === 'all'
    ? [{ topic: 'lifelong', year: 0 }, { topic: 'annual', year: product.year }, { topic: 'monthly', year: product.year }]
    : [{ ...product, year: product?.topic === 'lifelong' ? 0 : product?.year }];
  const expectedCharge = status.adminPreview || status.bundle_entitlement ? 0 : targets.reduce((price, target) => price +
    (status.entitlements.some(item => item.topic === target.topic && item.year === target.year) ? 0 : 10), 0);
  return payment.start(chart, { ...product, expectedCharge });
}
function harness() {
  const a = randomUUID(), b = randomUUID(), clocks = [];
  const server = {
    a, b, owner: a, anonymous: false, now: Date.parse('2026-11-12T12:00:00Z'),
    coins: new Map([[a, 50], [b, 50]]), receipts: new Map(), bundles: new Map(), allOrders: new Map(), ledger: new Map(), requests: [],
    loseResponse: false, failStatus: false, failSession: false, beforeSession: null, beforeStatus: null, beforeBuy: null, beforeToken: null, beforeAdmin: null, admins: new Set(), malformed: false,
    mutateAllReceipt: null, mutateReceipt: null, mutateStatus: null,
    advance(ms) { this.now += ms; for (const clock of clocks) { clock.wall += ms; clock.monotonic += ms; } },
    active(receipt) { return receipt && Date.parse(receipt.expires_at) > this.now; },
    times(paid = this.now) { return { paid_at: new Date(paid).toISOString(), expires_at: new Date(paid + ACCESS_MS).toISOString() }; },
    data(value) { return { data: { ...value, access_version: 4, access_hours: 24, server_now: new Date(this.now).toISOString() } }; },
    async rpc(name, args = {}) {
      if (['saju_reading_buy_v4', 'saju_reading_buy_all_v4'].includes(name) && this.beforeToken) await this.beforeToken();
      const owner = this.owner;
      this.requests.push({ name, args: plain(args), owner });
      if (!owner) return { error: { code: '42501', message: 'not_signed_in' } };
      if (name === 'is_admin') {
        if (this.beforeAdmin) await this.beforeAdmin();
        return { data: this.admins.has(owner) };
      }
      if (name === 'saju_reading_status_v4') {
        if (this.beforeStatus) await this.beforeStatus();
        if (this.failStatus) { this.failStatus = false; return { error: { message: 'network' } }; }
        const legacy = this.bundles.get(`${owner}:${args.p_chart_key}`);
        const result = {
          ok: true, chart_key: args.p_chart_key, coins: this.coins.get(owner), prices: { lifelong: 10, annual: 10, monthly: 10, all: 30 },
          entitlements: [...this.receipts.entries()].filter(([key, receipt]) => key.startsWith(`${owner}:${args.p_chart_key}:`) && this.active(receipt)).map(([,receipt]) => ({ ...receipt })),
          bundle_entitlement: this.active(legacy) ? { ...legacy } : null
        };
        return this.data(this.mutateStatus ? this.mutateStatus(result) : result);
      }
      if (args.p_expected_user !== owner) return { data: { ok: false, reason: 'account_changed' } };
      if (this.beforeBuy) await this.beforeBuy();
      const isAll = name === 'saju_reading_buy_all_v4';
      if (!isAll) assert.equal(name, 'saju_reading_buy_v4');
      const replay = this.ledger.get(args.p_request_id);
      if (replay) {
        if (!this.active(replay)) return this.data({ ok: false, reason: 'access_expired' });
        return this.data({ ...replay, coins: this.coins.get(owner), charged: 0, replayed: true,
          ...(isAll ? { items: replay.items.map(item => ({ ...item, coins: this.coins.get(owner), charged: 0, replayed: true })) } : {}) });
      }
      const legacy = this.bundles.get(`${owner}:${args.p_chart_key}`);
      const activeLegacy = this.active(legacy);
      const products = isAll ? [{ topic: 'lifelong', year: 0 }, { topic: 'annual', year: args.p_year }, { topic: 'monthly', year: args.p_year }]
        : [{ topic: args.p_topic, year: args.p_year }];
      const itemKey = product => `${owner}:${args.p_chart_key}:${product.topic}:${product.year}`;
      const missing = activeLegacy ? [] : products.filter(product => !this.active(this.receipts.get(itemKey(product))));
      const required = missing.length * 10;
      if (args.p_expected_charge !== required) return this.data({ ok: false, reason: 'price_changed', required });
      if (this.coins.get(owner) < required) return this.data({ ok: false, reason: 'coins', price: isAll ? 30 : 10, required, coins: this.coins.get(owner) });
      this.coins.set(owner, this.coins.get(owner) - required);
      const items = products.map(product => {
        const key = itemKey(product), owned = activeLegacy ? legacy : this.receipts.get(key);
        if (this.active(owned)) return { ...owned, ...product, ok: true, entitled: true, chart_key: args.p_chart_key,
          coins: this.coins.get(owner), charged: 0, replayed: true, legacy_bundle: !!activeLegacy, entitlement_version: 2 };
        const item = { ok: true, entitled: true, request_id: isAll ? randomUUID() : args.p_request_id, chart_key: args.p_chart_key,
          ...product, ...this.times(), entitlement_version: 2, price: 10, coins: this.coins.get(owner), charged: 10, replayed: false };
        this.receipts.set(key, item);
        this.ledger.set(item.request_id, item);
        return item;
      });
      let receipt;
      if (isAll) {
        const orderKey = `${owner}:${args.p_chart_key}:${args.p_year}`;
        const previous = this.allOrders.get(orderKey);
        const activeOrder = this.active(previous) && previous.items.every((item, i) => item.request_id === items[i].request_id);
        receipt = { ok: true, entitled: true, request_id: activeLegacy ? legacy.request_id : activeOrder ? previous.request_id : args.p_request_id,
          chart_key: args.p_chart_key, topic: 'all', year: args.p_year, ...this.times(),
          expires_at: new Date(Math.min(...items.map(item => Date.parse(item.expires_at)))).toISOString(),
          entitlement_version: 3, price: 30, coins: this.coins.get(owner), charged: required, replayed: required === 0,
          legacy_bundle: !!activeLegacy, items };
        if (!activeLegacy) {
          this.allOrders.set(orderKey, receipt);
          this.ledger.set(receipt.request_id, receipt);
        }
      } else receipt = items[0];
      if (this.loseResponse) { this.loseResponse = false; return { error: { message: 'response lost after purchase' } }; }
      const result = this.malformed ? { ...receipt, chart_key: 'f'.repeat(64) } : receipt;
      return this.data(isAll && this.mutateAllReceipt ? this.mutateAllReceipt(plain(result)) : this.mutateReceipt ? this.mutateReceipt(plain(result)) : result);
    }
  };
  function page(options = {}) {
    const storage = options.storage || new Map();
    const authListeners = [], listeners = new Map();
    const clock = { wall: server.now + (options.clockOffset || 0), monotonic: 0 };
    clocks.push(clock);
    class PageDate extends Date { static now() { return clock.wall; } }
    const client = {
      auth: {
        getSession: async () => {
          const session = server.owner ? { user: { id: server.owner, is_anonymous: server.anonymous } } : null;
          if (server.beforeSession) await server.beforeSession();
          if (server.failSession) { server.failSession=false; return { data: { session: null }, error: { message:'session unavailable' } }; }
          return { data: { session } };
        },
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
      Date: PageDate, performance: { now: () => clock.monotonic },
      crypto: webcrypto, TextEncoder, AbortSignal, Uint8Array, setTimeout, clearTimeout, queueMicrotask, console
    };
    vm.runInNewContext(previewSource, context);
    const Payment = vm.runInNewContext(paymentSource + '; SajuPayment', context);
    return {
      payment: new Payment(options), storage, context, clock,
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
  await assert.rejects(startQuoted(first, birth(), annual), error => error.code === 'network');
  assert.equal(server.coins.get(server.a), 40);
  const initial = server.requests.find(item => item.name === 'saju_reading_buy_v4');
  const retried = await startQuoted(first, birth(), annual);
  assert.equal(retried.request_id, initial.args.p_request_id);
  assert.equal(retried.replayed, true);
  const reloaded = page().payment;
  assert.equal((await startQuoted(reloaded, birth(), annual)).request_id, retried.request_id);
  assert.equal(server.coins.get(server.a), 40, 'server profile entitlement also prevents a second charge with a new page UUID');
  assert.equal((await startQuoted(reloaded, birth({ input: { hour: 8, minute: 37, calendar: 'lunar', year: 1991, month: 6, day: 7 } }), annual)).replayed, true);
  assert.equal(server.coins.get(server.a), 40, 'equivalent lunar/solar inputs share the canonical solar profile');
  await startQuoted(reloaded, birth({ timeKnown: false, input: { hour: null, minute: 0 } }), annual);
  assert.equal(server.coins.get(server.a), 30, 'a different birth profile is a separate purchase');
});

test('raw birth details stay local when checking and buying a named report', async () => {
  const { server, page } = harness();
  const p = page();
  const result = await startQuoted(p.payment, birth(), annual);
  const request = server.requests.find(item => item.name === 'saju_reading_buy_v4').args;
  assert.deepEqual(Object.keys(request).sort(), ['p_chart_key', 'p_expected_charge', 'p_expected_user', 'p_request_id', 'p_topic', 'p_verify_only', 'p_year']);
  assert.equal(request.p_expected_user, server.a);
  assert.match(request.p_chart_key, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(request).includes('1991-07-18'));
  assert.equal(p.storage.size, 0, 'no birth data, reports, or fingerprints are persisted locally');
  p.changeAccount(server.b);
  const other = await startQuoted(p.payment, birth(), annual);
  assert.notEqual(other.chart_key, result.chart_key, 'profiles cannot be matched across members using an unsalted shared hash');
});

test('rapid clicks share a purchase and a different profile cannot replace it', async () => {
  const { server, page } = harness();
  const payment = page().payment;
  await payment.init();
  const gate = deferred(), entered = deferred();
  server.beforeBuy = async () => { entered.resolve(); await gate.promise; };
  const first = startQuoted(payment, birth(), annual);
  const second = startQuoted(payment, birth(), annual);
  await entered.promise;
  await assert.rejects(startQuoted(payment, birth({ solar: { iso: '1991-07-19' } }), annual), error => error.code === 'busy');
  gate.resolve();
  const results = await Promise.all([first, second]);
  assert.equal(results[0].request_id, results[1].request_id);
  assert.equal(server.requests.filter(item => item.name === 'saju_reading_buy_v4').length, 1);
  assert.equal(server.coins.get(server.a), 40);
});

test('signed-out, anonymous, insufficient-balance, and initialization failures are recoverable', async () => {
  const { server, page } = harness();
  server.owner = null;
  const p = page();
  assert.equal((await p.payment.init()).signedIn, false);
  await assert.rejects(startQuoted(p.payment, birth(), annual), error => error.code === 'not_signed_in');
  server.anonymous = true;
  p.changeAccount(server.a);
  assert.equal((await p.payment.init()).signedIn, false);
  await assert.rejects(startQuoted(p.payment, birth(), annual), error => error.code === 'member_required');
  server.anonymous = false;
  p.changeAccount(server.a);
  server.failStatus = true;
  await assert.rejects(p.payment.init(), error => error.code === 'network');
  assert.equal((await p.payment.init()).signedIn, true);
  server.coins.set(server.a, 9);
  await assert.rejects(startQuoted(p.payment, birth(), annual), error => error.code === 'coins');
  assert.equal(server.coins.get(server.a), 9);
  server.coins.set(server.a, 10);
  assert.equal((await startQuoted(p.payment, birth(), annual)).coins, 0);
});

test('identity is available before the wallet and real owner changes notify cleanup before the new local identity', async () => {
  const {server,page}=harness(),events=[],gate=deferred(),entered=deferred();
  server.beforeAdmin=async()=>{entered.resolve();await gate.promise;};
  const p=page({onAccountChange:()=>events.push(['account',p.payment.user,p.payment.anonymous]),
    onIdentityReady:value=>events.push(['identity',value.user,value.anonymous])});
  assert.equal(p.payment.identityReady,false);
  const pending=p.payment.init();await entered.promise;
  assert.equal(p.payment.identityReady,true);assert.equal(p.payment.user,server.a);
  assert.equal(p.payment.ready,false);assert.equal(p.payment.balance,null);
  assert.deepEqual(events,[['identity',server.a,false]],'the first confirmation does not reset a typed birth');
  server.failStatus=true;gate.resolve();
  await assert.rejects(pending,error=>error.code==='network');
  assert.equal(p.payment.identityReady,true,'a wallet failure leaves confirmed local identity available');
  assert.equal(p.payment.ready,false);
  p.changeAccount(server.a);
  assert.equal(events.length,1,'a repeated sign-in or token refresh for the same owner is not an account change');
  p.changeAccount(server.b);
  assert.deepEqual(events.slice(-2),[['account',server.b,false],['identity',server.b,false]]);
  server.anonymous=true;p.changeAccount(server.b);
  assert.deepEqual(events.slice(-2),[['account',server.b,true],['identity',server.b,true]]);
  p.changeAccount(null);
  assert.equal(p.payment.identityReady,true);assert.equal(p.payment.user,null);
  assert.ok(server.requests.every(request=>!request.name.startsWith('saju_reading_buy')));
});

test('failed session reads revoke local identity and stale reads never restore an old account', async () => {
  const {server,page}=harness(),events=[];
  const p=page({onAccountChange:()=>events.push('changed'),onIdentityReady:({user})=>events.push(user)});
  server.failStatus=true;await assert.rejects(p.payment.init(),error=>error.code==='network');
  assert.equal(p.payment.identityReady,true);
  server.failSession=true;await assert.rejects(p.payment.init(),error=>error.code==='network');
  assert.equal(p.payment.identityReady,false);assert.equal(p.payment.user,null);
  assert.equal(p.payment.ready,false);assert.equal(p.payment.balance,null);
  assert.deepEqual(events,[server.a,'changed'],'an unverified session cannot keep the old local profile owner');
  const gate=deferred(),entered=deferred();
  server.beforeSession=async()=>{entered.resolve();await gate.promise;};
  const pending=p.payment.init();await entered.promise;
  p.changeAccount(server.b);gate.resolve();
  await assert.rejects(pending,error=>error.code==='not_signed_in');
  assert.equal(p.payment.identityReady,true);assert.equal(p.payment.user,server.b);
  assert.equal(p.payment.ready,false);assert.equal(events.at(-1),server.b);
  assert.ok(server.requests.every(request=>!request.name.startsWith('saju_reading_buy')));
});

test('a rapid account round trip invalidates the old wallet response even when the final owner is the same', async () => {
  const {server,page}=harness(),p=page();
  await p.payment.init();p.payment.ready=false;
  const gate=deferred(),entered=deferred();
  server.beforeStatus=async()=>{entered.resolve();await gate.promise;};
  const pending=p.payment.init();await entered.promise;
  p.changeAccount(server.b);p.changeAccount(server.a);gate.resolve();
  await assert.rejects(pending,error=>error.code==='not_signed_in');
  assert.equal(p.payment.user,server.a);assert.equal(p.payment.identityReady,true);
  assert.equal(p.payment.ready,false);assert.equal(p.payment.balance,null);
  assert.equal(p.payment.clock,null,'an old reply cannot reinstall the previous account clock');
  assert.ok(server.requests.every(request=>!request.name.startsWith('saju_reading_buy')));
});

test('account changes invalidate a response before the old report is revealed', async () => {
  const { server, page } = harness();
  let changed = 0;
  const p = page({ onAccountChange: () => { changed++; } });
  await p.payment.init();
  const gate = deferred(), entered = deferred();
  server.beforeBuy = async () => { entered.resolve(); await gate.promise; };
  const pending = startQuoted(p.payment, birth(), annual);
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
  await startQuoted(regular.payment, birth(), annual);
  assert.equal(server.coins.get(server.a), 40);
  server.admins.add(server.a);
  const admin = page({ storage });
  assert.equal((await admin.payment.init()).adminPreview, true);
  assert.equal((await startQuoted(admin.payment, birth(), annual)).price, 0);
  assert.equal(server.coins.get(server.a), 40);
  const gate = deferred(), entered = deferred();
  server.beforeAdmin = async () => { entered.resolve(); await gate.promise; };
  const pending = startQuoted(admin.payment, birth(), annual);
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
  const pending = startQuoted(p.payment, birth(), annual);
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
  await assert.rejects(startQuoted(payment, birth({ input: { hour: 24, minute: 0 } }), annual), error => error.code === 'invalid');
  assert.equal(server.requests.length, 0);
  server.malformed = true;
  await assert.rejects(startQuoted(payment, birth(), annual), error => error.code === 'invalid');
});

test('each category and year costs 10 within its 24-hour window, and status checks never buy', async () => {
  const { server, page } = harness();
  const payment = page().payment;
  let status = await payment.status(birth());
  assert.equal(status.entitlements.length, 0);
  assert.equal(server.coins.get(server.a), 50);
  assert.equal(server.requests.filter(call => call.name === 'saju_reading_buy_v4').length, 0);
  await startQuoted(payment, birth(), { topic: 'lifelong', year: 2026 });
  await startQuoted(payment, birth(), annual);
  await startQuoted(payment, birth(), { topic: 'monthly', year: 2026 });
  assert.equal(server.coins.get(server.a), 20, 'three separate products cost 30 in total');
  assert.equal((await startQuoted(payment, birth(), { topic: 'lifelong', year: 2027 })).charged, 0, 'lifelong is independent of the selected year');
  assert.equal((await startQuoted(payment, birth(), annual)).charged, 0);
  await startQuoted(payment, birth(), { topic: 'annual', year: 2027 });
  assert.equal(server.coins.get(server.a), 10, 'a different annual report has its own explicit purchase');
  status = await payment.inspect(birth());
  assert.equal(status.entitlements.length, 4);
  assert.equal(status.entitlements.filter(item => item.topic === 'monthly').length, 1, 'one monthly product contains all twelve months');
  const count = server.requests.filter(call => call.name === 'saju_reading_buy_v4').length;
  await assert.rejects(startQuoted(payment, birth(), { topic: 'unknown', year: 2026 }), error => error.code === 'invalid');
  await assert.rejects(startQuoted(payment, birth(), { topic: 'monthly', year: 2051 }), error => error.code === 'invalid');
  await assert.rejects(startQuoted(payment, birth()), error => error.code === 'invalid');
  assert.equal(server.requests.filter(call => call.name === 'saju_reading_buy_v4').length, count);
});

test('an active legacy full-report purchase remains usable across categories without another debit', async () => {
  const { server, page } = harness();
  const payment = page().payment;
  await payment.status(birth());
  const chartKey = server.requests.find(call => call.name === 'saju_reading_status_v4' && call.args.p_chart_key)?.args.p_chart_key;
  const receipt = { request_id: randomUUID(), price: 10, ...server.times(server.now - 1000) };
  server.bundles.set(`${server.a}:${chartKey}`, receipt);
  assert.equal((await payment.status(birth())).bundle_entitlement.request_id, receipt.request_id);
  for (const product of [{topic:'lifelong'}, annual, {topic:'monthly',year:2027}, {topic:'all',year:2028}]) {
    const opened = await startQuoted(payment, birth(), product);
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
  const result = await startQuoted(p.payment, birth(), all);
  assert.equal(result.price, 30);
  assert.equal(result.charged, 30);
  assert.deepEqual(plain(result.items.map(item => [item.topic, item.year])), [['lifelong', 0], ['annual', 2026], ['monthly', 2026]]);
  assert.equal(server.requests.filter(call => call.name === 'saju_reading_buy_all_v4').length, 1);
  assert.equal(server.requests.filter(call => call.name === 'saju_reading_buy_v4').length, 0, 'the client must not issue three separate purchases');
  const args = server.requests.find(call => call.name === 'saju_reading_buy_all_v4').args;
  assert.deepEqual(Object.keys(args).sort(), ['p_chart_key', 'p_expected_charge', 'p_expected_user', 'p_request_id', 'p_verify_only', 'p_year']);
  assert.equal(args.p_expected_user, server.a);
  assert.ok(!JSON.stringify(args).includes('1991-07-18'));
  assert.equal(p.storage.size, 0);
  for (const product of [{ topic: 'lifelong' }, annual, { topic: 'monthly', year: 2026 }, all]) {
    assert.equal((await startQuoted(p.payment, birth(), product)).charged, 0);
  }
  assert.equal(server.coins.get(server.a), 20);
  assert.equal((await p.payment.inspect(birth())).entitlements.length, 3);
});

test('all-reading receipts charge only missing topics and keep lifelong independent of the year', async () => {
  const { server, page } = harness();
  const payment = page().payment;
  await startQuoted(payment, birth(), annual);
  const partiallyOwned = await startQuoted(payment, birth(), all);
  assert.equal(partiallyOwned.charged, 20);
  assert.equal(partiallyOwned.items.find(item => item.topic === 'annual').charged, 0);
  const nextYear = await startQuoted(payment, birth(), { topic: 'all', year: 2027 });
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
    for (const product of products.slice(0, alreadyBought)) await startQuoted(payment, birth(), product);
    const result = await startQuoted(payment, birth(), all);
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
  await assert.rejects(startQuoted(payment, birth(), all), error => error.code === 'coins' && /30쭈/.test(error.message));
  assert.equal(server.coins.get(server.a), 29);
  assert.equal(server.receipts.size, 0);
  assert.equal(server.allOrders.size, 0);
  await startQuoted(payment, birth(), annual);
  await assert.rejects(startQuoted(payment, birth(), all), error => error.code === 'coins' && /20쭈/.test(error.message));
  assert.equal(server.coins.get(server.a), 19);
  assert.equal(server.receipts.size, 1);
  assert.equal(server.allOrders.size, 0);
});

test('lost full-purchase responses and page reloads recover the same order without another debit', async () => {
  const { server, page } = harness();
  const first = page().payment;
  server.loseResponse = true;
  await assert.rejects(startQuoted(first, birth(), all), error => error.code === 'network');
  const request = server.requests.find(call => call.name === 'saju_reading_buy_all_v4');
  assert.equal(server.coins.get(server.a), 20);
  const retried = await startQuoted(first, birth(), all);
  assert.equal(retried.request_id, request.args.p_request_id);
  assert.equal(retried.charged, 0);
  const reloaded = await startQuoted(page().payment, birth(), all);
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
    await assert.rejects(startQuoted(page().payment, birth(), all), error => error.code === 'invalid');
  }
});

test('full purchases retain account and verified administrator-mode protection', async () => {
  const { server, page } = harness();
  const p = page();
  await p.payment.init();
  const gate = deferred(), entered = deferred();
  server.beforeToken = async () => { entered.resolve(); await gate.promise; };
  const pending = startQuoted(p.payment, birth(), all);
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
  const preview = await startQuoted(admin, birth(), all);
  assert.equal(preview.adminPreview, true);
  assert.equal(preview.charged, 0);
  assert.equal(preview.price, 0);
  assert.equal(preview.topic, 'all');
  assert.equal(server.coins.get(server.b), 50);
});

test('access ends at exactly 24 hours and only a new explicit purchase renews it', async () => {
  const { server, page } = harness();
  const payment = page().payment;
  const first = await startQuoted(payment, birth(), annual);
  assert.equal(payment.remainingMs(first), ACCESS_MS);
  server.advance(ACCESS_MS - 1);
  const reopened = await startQuoted(payment, birth(), annual);
  assert.equal(reopened.charged, 0);
  assert.equal(reopened.paid_at, first.paid_at);
  assert.equal(reopened.expires_at, first.expires_at, 'reopening must not reset the 24-hour clock');
  assert.equal(payment.remainingMs(reopened), 1);
  server.advance(1);
  assert.equal(payment.isActive(first), false);
  const status = await payment.status(birth());
  assert.equal(status.entitlements.length, 0);
  assert.equal(server.coins.get(server.a), 40, 'expiry and status do not charge or renew');
  const renewed = await payment.start(birth(), { ...annual, expectedCharge: 10 });
  assert.notEqual(renewed.request_id, first.request_id);
  assert.equal(renewed.charged, 10);
  assert.equal(server.coins.get(server.a), 30);
  assert.equal(payment.remainingMs(renewed), ACCESS_MS);
  assert.equal(server.ledger.size, 2, 'the old payment record remains intact');
});

test('an ambiguous lost response followed by expiry requires another explicit click, without automatic debit', async () => {
  const { server, page } = harness();
  const payment = page().payment;
  server.loseResponse = true;
  await assert.rejects(startQuoted(payment, birth(), annual), error => error.code === 'network');
  const firstId = server.requests.find(call => call.name === 'saju_reading_buy_v4').args.p_request_id;
  server.advance(ACCESS_MS);
  const requestCount = server.requests.filter(call => call.name === 'saju_reading_buy_v4').length;
  await assert.rejects(startQuoted(payment, birth(), annual), error => error.code === 'access_expired');
  assert.equal(server.coins.get(server.a), 40);
  assert.equal(server.requests.filter(call => call.name === 'saju_reading_buy_v4').length, requestCount + 1,
    'an expired replay must not trigger another purchase RPC automatically');
  assert.equal(server.requests.at(-1).args.p_request_id, firstId);
  const renewed = await startQuoted(payment, birth(), annual);
  assert.notEqual(renewed.request_id, firstId);
  assert.equal(renewed.charged, 10);
  assert.equal(server.coins.get(server.a), 30);
});

test('a displayed free quote cannot become a charge when access expires before the server receives the click', async () => {
  const { server, page } = harness();
  const payment = page().payment;
  await startQuoted(payment, birth(), annual);
  server.advance(ACCESS_MS - 1);
  assert.equal((await payment.status(birth())).entitlements.length, 1);
  server.beforeBuy = async () => { server.beforeBuy = null; server.advance(1); };
  const before = server.requests.filter(call => call.name === 'saju_reading_buy_v4').length;
  await assert.rejects(payment.start(birth(), { ...annual, expectedCharge: 0 }), error => error.code === 'access_expired' || error.code === 'price_changed');
  assert.equal(server.coins.get(server.a), 40);
  assert.equal(server.requests.filter(call => call.name === 'saju_reading_buy_v4').length, before + 1);
  const renewed = await startQuoted(payment, birth(), annual);
  assert.equal(renewed.charged, 10);
  assert.equal(server.coins.get(server.a), 30);
});

test('new requests submit exactly the displayed price and reject omitted or invalid quotes before calling the server', async () => {
  const { server, page } = harness();
  const payment = page().payment;
  for (const expectedCharge of [undefined, null, '10', -10, 20, 11]) {
    await assert.rejects(payment.start(birth(), { ...annual, expectedCharge }), error => error.code === 'invalid');
  }
  assert.equal(server.requests.length, 0);
  await assert.rejects(payment.start(birth(), { ...annual, expectedCharge: 0 }), error => error.code === 'price_changed' && error.required === 10);
  assert.equal(server.coins.get(server.a), 50);
  const request = server.requests.find(call => call.name === 'saju_reading_buy_v4');
  assert.equal(request.args.p_expected_charge, 0, 'the client must not replace the displayed price with a fresh higher quote');
  assert.equal(server.requests.filter(call => call.name === 'saju_reading_buy_v4').length, 1);
});

test('remaining time follows server time despite initial device-clock skew, clock rollback, or sleeping timers', async () => {
  const { server, page } = harness();
  const p = page({ clockOffset: -30 * ACCESS_MS });
  const receipt = await startQuoted(p.payment, birth(), annual);
  assert.equal(p.payment.remainingMs(receipt), ACCESS_MS);
  server.advance(ACCESS_MS - 1000);
  p.clock.wall -= 10 * ACCESS_MS;
  assert.equal(p.payment.remainingMs(receipt), 1000, 'monotonic elapsed time defeats rolling the device clock backward');
  p.clock.monotonic += 1000;
  assert.equal(p.payment.isActive(receipt), false);

  const other = page({ clockOffset: 30 * ACCESS_MS });
  const fresh = await startQuoted(other.payment, birth({ solar: { iso: '1991-07-19' } }), annual);
  assert.equal(other.payment.remainingMs(fresh), ACCESS_MS);
  other.clock.wall += ACCESS_MS;
  assert.equal(other.payment.isActive(fresh), false, 'wall-clock elapsed time catches sleep when monotonic timers pause');
});

test('whole access ends at its earliest component deadline and renews only expired parts', async () => {
  const { server, page } = harness();
  const payment = page().payment;
  const earlier = await startQuoted(payment, birth(), annual);
  server.advance(60 * 60 * 1000);
  const whole = await startQuoted(payment, birth(), all);
  assert.equal(whole.charged, 20);
  assert.equal(whole.expires_at, earlier.expires_at);
  assert.equal(payment.remainingMs(whole), ACCESS_MS - 60 * 60 * 1000);
  const lifelong = whole.items.find(item => item.topic === 'lifelong');
  server.advance(ACCESS_MS - 60 * 60 * 1000);
  const status = await payment.status(birth());
  assert.equal(status.entitlements.length, 2);
  assert.equal(payment.isActive(whole), false);
  assert.equal(payment.isActive(lifelong), true);
  const renewed = await startQuoted(payment, birth(), all);
  assert.equal(renewed.charged, 10);
  assert.equal(renewed.items.find(item => item.topic === 'lifelong').expires_at, lifelong.expires_at,
    'a remaining component never gets a free extension when another part is renewed');
  assert.equal(renewed.expires_at, lifelong.expires_at);
  assert.notEqual(renewed.request_id, whole.request_id);
  assert.equal(server.coins.get(server.a), 10);
});

test('an individual renewal after whole expiry does not reuse the old whole-order UUID', async () => {
  const { server, page } = harness();
  const payment = page().payment;
  server.coins.set(server.a, 100);
  const first = await startQuoted(payment, birth(), all);
  server.advance(ACCESS_MS);
  const individual = await startQuoted(payment, birth(), annual);
  const whole = await startQuoted(payment, birth(), all);
  assert.equal(whole.charged, 20);
  assert.notEqual(whole.request_id, first.request_id);
  assert.equal(whole.items.find(item => item.topic === 'annual').request_id, individual.request_id);
  assert.equal(server.coins.get(server.a), 40);
});

test('legacy bundle access expires 24 hours after its original purchase', async () => {
  const { server, page } = harness();
  const payment = page().payment;
  const status = await payment.status(birth());
  const old = { request_id: randomUUID(), price: 10, ...server.times(server.now - ACCESS_MS + 1) };
  server.bundles.set(`${server.a}:${status.chart_key}`, old);
  const reopened = await startQuoted(payment, birth(), all);
  assert.equal(reopened.charged, 0);
  assert.equal(payment.remainingMs(reopened), 1);
  server.advance(1);
  assert.equal((await payment.status(birth())).bundle_entitlement, null);
  const renewed = await startQuoted(payment, birth(), all);
  assert.equal(renewed.charged, 30);
  assert.equal(renewed.legacy_bundle, false);
  assert.equal(server.coins.get(server.a), 20);
});

test('malformed, extended, expired, or wrongly scoped access receipts fail closed', async () => {
  const mutations = [
    receipt => { receipt.ok = 'true'; return receipt; },
    receipt => { delete receipt.expires_at; return receipt; },
    receipt => { receipt.paid_at = 'not-a-date'; return receipt; },
    receipt => { receipt.expires_at = receipt.paid_at; return receipt; },
    receipt => { receipt.expires_at = new Date(Date.parse(receipt.expires_at) + 1).toISOString(); return receipt; },
    receipt => { receipt.paid_at = new Date(Date.parse(receipt.paid_at) + 1).toISOString(); return receipt; },
    receipt => { receipt.entitled = false; return receipt; },
  ];
  for (const mutate of mutations) {
    const { server, page } = harness();
    server.mutateReceipt = mutate;
    await assert.rejects(startQuoted(page().payment, birth(), annual), error => error.code === 'invalid');
  }
  const { server, page } = harness();
  server.mutateAllReceipt = receipt => ({ ...receipt, expires_at: new Date(Date.parse(receipt.expires_at) + 1).toISOString() });
  await assert.rejects(startQuoted(page().payment, birth(), all), error => error.code === 'invalid');
});

test('status rejects duplicate scopes or false permanent access instead of quoting a free opening', async () => {
  for (const mutate of [
    status => ({ ...status, entitlements: [...status.entitlements, status.entitlements[0]] }),
    status => ({ ...status, entitlements: status.entitlements.map(item => ({ ...item, expires_at: null })) }),
    status => ({ ...status, bundle_entitlement: { request_id: randomUUID(), price: 10 } })
  ]) {
    const { server, page } = harness();
    const payment = page().payment;
    await startQuoted(payment, birth(), annual);
    server.mutateStatus = mutate;
    await assert.rejects(payment.status(birth()), error => error.code === 'invalid');
    assert.equal(server.coins.get(server.a), 40);
  }
});

test('a response delayed beyond its deadline does not reveal or extend the purchased reading', async () => {
  const { server, page } = harness();
  const p = page();
  await startQuoted(p.payment, birth(), annual);
  server.advance(ACCESS_MS - 1000);
  const originalRpc = server.rpc.bind(server);
  server.rpc = async (name, args) => {
    const result = await originalRpc(name, args);
    if (name === 'saju_reading_buy_v4') {
      p.clock.wall += 1000;
      p.clock.monotonic += 1000;
    }
    return result;
  };
  await assert.rejects(p.payment.start(birth(), { ...annual, expectedCharge: 0 }), error => error.code === 'access_expired');
  assert.equal(server.coins.get(server.a), 40);
});
