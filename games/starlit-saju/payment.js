// Each report category/year has its own fixed-price, recoverable server receipt.
// Birth dates, times, and report text stay in this page's memory.
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const SINGLE_TOPICS = ['lifelong', 'annual', 'monthly'];
const PRICES = Object.freeze({ lifelong: 10, annual: 10, monthly: 10, all: 30 });
const TOPICS = new Set(Object.keys(PRICES));
const messages = {
  not_signed_in: '아지트에 로그인한 뒤 사주를 펼쳐 주세요.',
  member_required: '아지트 회원으로 로그인하면 사주를 볼 수 있어요.',
  banned: '현재 계정으로는 사주를 펼칠 수 없어요.',
  coins: '쭈가 부족해요. 표시된 이용료와 보유한 쭈를 확인해 주세요.',
  wallet_unavailable: '보유한 쭈를 확인하지 못했어요. 잠시 후 다시 눌러 주세요.',
  request_conflict: '사주 이용 내역을 확인하지 못했어요. 새로고침한 뒤 다시 눌러 주세요.',
  invalid: '사주 이용 정보를 확인하지 못했어요. 입력을 확인한 뒤 다시 눌러 주세요.',
  mode_changed: '이용 모드가 바뀌었어요. 표시된 이용료를 확인한 뒤 다시 눌러 주세요.',
  account_changed: '로그인한 계정이 바뀌었어요. 새로고침한 뒤 다시 펼쳐 주세요.',
  busy: '먼저 펼치던 사주를 확인하고 있어요. 잠시만 기다려 주세요.',
  network: '연결을 확인한 뒤 다시 눌러 주세요. 같은 사주의 같은 항목·연도에는 쭈가 두 번 차감되지 않아요.'
};
function problem(code = 'network', details = {}) {
  const required = details.required ?? details.price;
  const message = code === 'coins' && [10, 20, 30].includes(required)
    ? `쭈가 부족해요. 아직 구매하지 않은 풀이를 열려면 ${required}쭈가 필요해요.`
    : messages[code] || messages.network;
  const error = new Error(message);
  error.name = 'SajuPaymentError';
  error.code = code;
  return error;
}
const scripts = new Map();
function script(src) {
  if (scripts.has(src)) return scripts.get(src);
  const task = new Promise((resolve, reject) => {
    const node = document.createElement('script');
    const timer = setTimeout(() => fail(), 15000);
    function fail() { clearTimeout(timer); node.remove(); reject(problem()); }
    node.src = src;
    node.onload = () => { clearTimeout(timer); resolve(); };
    node.onerror = fail;
    document.head.append(node);
  }).catch(error => { scripts.delete(src); throw error; });
  scripts.set(src, task);
  return task;
}
function profile(chart) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(chart?.solar?.iso || '') || typeof chart.timeKnown !== 'boolean') throw problem('invalid');
  const { hour, minute } = chart.input || {};
  if (chart.timeKnown && (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59)) throw problem('invalid');
  return `${chart.solar.iso}|${chart.timeKnown ? `${hour}:${minute}` : 'unknown'}|KST-civil-v1`;
}
function purchaseOptions(options) {
  if (!TOPICS.has(options?.topic)) throw problem('invalid');
  const year = options.topic === 'lifelong' ? 0 : options.year;
  if (options.topic !== 'lifelong' && (!Number.isInteger(year) || year < 1900 || year > 2050)) throw problem('invalid');
  return { topic: options.topic, year };
}
function validSingleReceipt(receipt, product, chartKey) {
  return receipt?.ok === true && UUID.test(receipt.request_id || '') && receipt.chart_key === chartKey
    && receipt.topic === product.topic && receipt.year === product.year && receipt.price === 10
    && receipt.entitlement_version === 2 && typeof receipt.replayed === 'boolean'
    && [0, 10].includes(receipt.charged) && Number.isSafeInteger(receipt.coins) && receipt.coins >= 0;
}
function validateReceipt(receipt, product, chartKey) {
  if (!HASH.test(chartKey) || !receipt || receipt.chart_key !== chartKey) throw problem('invalid');
  if (product.topic !== 'all') {
    if (!validSingleReceipt(receipt, product, chartKey)) throw problem('invalid');
    return;
  }
  if (!UUID.test(receipt.request_id || '') || receipt.topic !== 'all' || receipt.year !== product.year
    || receipt.price !== 30 || receipt.entitlement_version !== 3 || receipt.entitled !== true
    || typeof receipt.replayed !== 'boolean' || ![0, 10, 20, 30].includes(receipt.charged)
    || !Number.isSafeInteger(receipt.coins) || receipt.coins < 0
    || !Array.isArray(receipt.items) || receipt.items.length !== 3) throw problem('invalid');
  for (const topic of SINGLE_TOPICS) {
    const items = receipt.items.filter(item => item?.topic === topic);
    if (items.length !== 1 || !validSingleReceipt(items[0], { topic, year: topic === 'lifelong' ? 0 : product.year }, chartKey)
      || items[0].entitled !== true || items[0].coins !== receipt.coins) throw problem('invalid');
  }
  if (receipt.items.reduce((sum, item) => sum + item.charged, 0) !== receipt.charged
    || (receipt.replayed && receipt.charged !== 0)) throw problem('invalid');
}
async function fingerprint(value, owner) {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.randomUUID) throw problem('invalid');
  const bytes = new TextEncoder().encode(`ojjuda-saju-profile-v1|${owner}|${value}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export class SajuPayment {
  constructor({ onBalance = () => {}, onAccountChange = () => {}, onModeChange = () => {} } = {}) {
    this.onBalance = onBalance;
    this.onAccountChange = onAccountChange;
    this.onModeChange = onModeChange;
    this.client = null;
    this.user = null;
    this.anonymous = false;
    this.balance = null;
    this.ready = false;
    this.initializing = null;
    this.pending = null;
    this.pendingProfile = null;
    this.requests = new Map();
    this.previewOwner = null;
    this.previewEnabled = false;
    this.previewBound = false;
    this.modeVersion = 0;
    this.modeRequest = null;
    this.authBound = false;
  }
  get adminPreview() { return !!this.user && this.previewOwner === this.user && this.previewEnabled; }
  setBalance(value) {
    if (!Number.isSafeInteger(value) || value < 0) return;
    this.balance = value;
    this.onBalance(value);
  }
  setMode(owner, enabled, notify = true) {
    const previous = this.adminPreview;
    this.previewOwner = owner;
    this.previewEnabled = enabled === true && owner === this.user;
    if (previous === this.adminPreview) return;
    this.modeVersion++;
    if (notify) this.onModeChange({ adminPreview: this.adminPreview });
  }
  check(owner, version) {
    if (!owner || owner !== this.user) throw problem('not_signed_in');
    if (version !== this.modeVersion) throw problem('mode_changed');
  }
  async rpc(name, args = {}) {
    if (!this.client || !this.user) throw problem('not_signed_in');
    const owner = this.user;
    let response;
    try {
      const request = this.client.rpc(name, args);
      response = await (typeof request.abortSignal === 'function' && typeof globalThis.AbortSignal?.timeout === 'function'
        ? request.abortSignal(AbortSignal.timeout(15000)) : request);
    } catch { throw problem(); }
    if (owner !== this.user) throw problem('not_signed_in');
    if (response?.error) {
      if (response.error.code === '42501' || /not_signed_in|JWT expired/i.test(response.error.message || '')) throw problem('not_signed_in');
      throw problem();
    }
    return response?.data;
  }
  async refreshAdminMode() {
    if (!this.user || this.anonymous) return false;
    if (this.modeRequest) return this.modeRequest;
    const preview = window.OjjudaAdminPreview;
    if (!preview?.configure || !preview?.refresh) throw problem();
    if (!this.previewBound) {
      window.addEventListener('ojjuda:admin-preview', event => {
        const value = event.detail;
        if (value?.ready !== true) return;
        const allowed = value.owner === this.user && value.authorized === true
          && value.enabled === true && preview.isAuthorized() && preview.isEnabled();
        this.setMode(value.owner, allowed);
      });
      this.previewBound = true;
    }
    const owner = this.user;
    preview.configure(this.client);
    const task = (async () => {
      try { await preview.refresh(); } catch { throw problem(); }
      if (owner !== this.user) throw problem('not_signed_in');
      if (!preview.isReady()) throw problem('mode_changed');
      return this.adminPreview;
    })();
    this.modeRequest = task;
    try { return await task; }
    finally { if (this.modeRequest === task) this.modeRequest = null; }
  }
  async init() {
    if (this.ready) return { signedIn: !!this.user && !this.anonymous, adminPreview: this.adminPreview };
    if (this.initializing) return this.initializing;
    const task = (async () => {
      if (!window.OJJUDA_CONFIG) await script('/config.js?v=20261111-shared-member-auth1');
      if (!window.supabase?.createClient && !window.ojjudaSupabase?.auth) await script(SDK_URL);
      const config = window.OJJUDA_CONFIG;
      if (!config?.supabaseUrl || !config?.supabaseKey) throw problem();
      this.client = window.ojjudaSupabase || window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
      window.ojjudaSupabase = this.client;
      if (!window.OjjudaAdminPreview) await script('/shared/games/admin-preview.js?v=20261111-shared-auth3');
      const { data, error } = await this.client.auth.getSession();
      if (error) throw problem();
      this.user = data.session?.user?.id || null;
      this.anonymous = data.session?.user?.is_anonymous === true;
      if (!this.authBound) {
        this.client.auth.onAuthStateChange((_event, next) => {
          const owner = next?.user?.id || null;
          const anonymous = next?.user?.is_anonymous === true;
          if (owner === this.user && anonymous === this.anonymous) return;
          this.setMode(null, false, false);
          this.modeVersion++;
          this.modeRequest = null;
          this.user = owner;
          this.anonymous = anonymous;
          this.balance = null;
          this.ready = false;
          this.requests.clear();
          this.onAccountChange();
        });
        this.authBound = true;
      }
      if (this.user && !this.anonymous) {
        const owner = this.user;
        await this.refreshAdminMode();
        if (owner !== this.user) throw problem('not_signed_in');
        if (!this.adminPreview) {
          const status = await this.rpc('saju_reading_status_v3', { p_chart_key: null });
          if (!status?.ok) throw problem(status?.reason);
          this.setBalance(status.coins);
        }
      }
      this.ready = true;
      return { signedIn: !!this.user && !this.anonymous, adminPreview: this.adminPreview };
    })();
    this.initializing = task;
    try { return await task; }
    finally { if (this.initializing === task) this.initializing = null; }
  }
  async status(chart) {
    const value = profile(chart);
    await this.init();
    if (!this.user) throw problem('not_signed_in');
    if (this.anonymous) throw problem('member_required');
    const owner = this.user, version = this.modeVersion;
    await this.refreshAdminMode();
    this.check(owner, version);
    if (this.adminPreview) return {
      ok: true, coins: this.balance, prices: { ...PRICES },
      entitlements: [], bundle_entitlement: null, adminPreview: true
    };
    const chartKey = await fingerprint(value, owner);
    this.check(owner, version);
    const result = await this.rpc('saju_reading_status_v3', { p_chart_key: chartKey });
    this.check(owner, version);
    if (!result?.ok) throw problem(result?.reason);
    if (result.chart_key !== chartKey || !Number.isSafeInteger(result.coins) || result.coins < 0
      || !Array.isArray(result.entitlements) || [...TOPICS].some(topic => result.prices?.[topic] !== PRICES[topic])) throw problem('invalid');
    for (const item of result.entitlements) {
      const product = purchaseOptions(item);
      if (!SINGLE_TOPICS.includes(product.topic) || product.year !== item.year || !UUID.test(item.request_id || '') || item.price !== 10) throw problem('invalid');
    }
    if (result.bundle_entitlement && (!UUID.test(result.bundle_entitlement.request_id || '') || result.bundle_entitlement.price !== 10)) throw problem('invalid');
    this.setBalance(result.coins);
    return result;
  }
  inspect(chart) { return this.status(chart); }
  async start(chart, options) {
    const value = profile(chart);
    const product = purchaseOptions(options);
    const pendingKey = `${value}|${product.topic}|${product.year}`;
    if (this.pending) {
      if (pendingKey !== this.pendingProfile) throw problem('busy');
      return this.pending;
    }
    this.pendingProfile = pendingKey;
    const task = (async () => {
      await this.init();
      if (!this.user) throw problem('not_signed_in');
      if (this.anonymous) throw problem('member_required');
      const owner = this.user, version = this.modeVersion;
      await this.refreshAdminMode();
      this.check(owner, version);
      if (this.adminPreview) return { ok: true, price: 0, charged: 0, replayed: false, adminPreview: true, ...product };
      // A member-specific fingerprint lets the server recover an interrupted
      // purchase without receiving or persisting the original birth information.
      const chartKey = await fingerprint(value, owner);
      this.check(owner, version);
      const requestKey = `${chartKey}|${product.topic}|${product.year}`;
      if (!this.requests.has(requestKey)) this.requests.set(requestKey, crypto.randomUUID());
      const args = {
        p_request_id: this.requests.get(requestKey), p_chart_key: chartKey,
        p_year: product.year, p_expected_user: owner, p_verify_only: false
      };
      if (product.topic !== 'all') args.p_topic = product.topic;
      const result = await this.rpc(product.topic === 'all' ? 'saju_reading_buy_all_v3' : 'saju_reading_buy_v2', args);
      this.check(owner, version);
      this.setBalance(result?.coins);
      if (!result?.ok) throw problem(result?.reason, { price: PRICES[product.topic], ...result });
      validateReceipt(result, product, chartKey);
      this.requests.set(requestKey, result.request_id);
      if (product.topic === 'all') {
        for (const item of result.items) this.requests.set(`${chartKey}|${item.topic}|${item.year}`, item.request_id);
      }
      return result;
    })();
    this.pending = task;
    try { return await task; }
    finally {
      if (this.pending === task) { this.pending = null; this.pendingProfile = null; }
    }
  }
}
