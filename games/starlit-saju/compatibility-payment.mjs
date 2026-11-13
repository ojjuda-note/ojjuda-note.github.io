// Compatibility is its own 10-ju product. Birth details stay in this page's
// memory; only a member-specific, order-independent pair fingerprint is sent.
const PRICE = 10;
const ACCESS_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const MESSAGES = Object.freeze({
  not_signed_in: '아지트에 로그인한 뒤 궁합을 펼쳐 주세요.',
  member_required: '아지트 회원으로 로그인하면 궁합을 볼 수 있어요.',
  banned: '현재 계정으로는 궁합을 펼칠 수 없어요.',
  coins: '쭈가 부족해요. 궁합을 새로 열려면 10쭈가 필요해요.',
  wallet_unavailable: '보유한 쭈를 확인하지 못했어요. 잠시 후 다시 눌러 주세요.',
  request_conflict: '궁합 이용 내역을 확인하지 못했어요. 새로고침한 뒤 다시 눌러 주세요.',
  receipt_unavailable: '궁합 구매 기록을 확인하지 못했어요. 잠시 후 다시 확인해 주세요.',
  invalid: '궁합 이용 정보를 확인하지 못했어요. 입력을 확인한 뒤 다시 눌러 주세요.',
  mode_changed: '이용 모드가 바뀌었어요. 표시된 이용료를 확인한 뒤 다시 눌러 주세요.',
  account_changed: '로그인한 계정이 바뀌었어요. 새로고침한 뒤 다시 펼쳐 주세요.',
  busy: '먼저 펼치던 궁합을 확인하고 있어요. 잠시만 기다려 주세요.',
  access_expired: '궁합의 24시간 이용이 끝났어요. 이용료를 확인한 뒤 다시 펼쳐 주세요.',
  price_changed: '궁합 이용 시간이 바뀌었어요. 표시된 이용료를 확인한 뒤 다시 눌러 주세요.',
  not_found: '이 두 사람의 궁합 구매 내역을 찾지 못했어요. 이용료를 확인해 주세요.',
  network: '연결을 확인한 뒤 다시 눌러 주세요. 같은 결제의 재시도로 중복 차감하지 않아요.'
});

function problem(code = 'network', details = {}) {
  const error = new Error(MESSAGES[code] || MESSAGES.network);
  error.name = 'SajuCompatibilityPaymentError';
  error.code = code;
  if ([0, PRICE].includes(details.required)) error.required = details.required;
  return error;
}

function validDay(year, month, day) {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
}

function profile(chart) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(chart?.solar?.iso || '');
  if (!match || typeof chart.timeKnown !== 'boolean') throw problem('invalid');
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1900 || year > 2050 || !validDay(year, month, day)) throw problem('invalid');
  const { hour, minute } = chart.input || {};
  if (chart.timeKnown && (!Number.isInteger(hour) || hour < 0 || hour > 23
      || !Number.isInteger(minute) || minute < 0 || minute > 59)) throw problem('invalid');
  return `${chart.solar.iso}|${chart.timeKnown ? `${hour}:${minute}` : 'unknown'}|KST-civil-v1`;
}

function pairProfile(chart, partner) {
  return [profile(chart), profile(partner)].sort().join('||');
}

async function fingerprint(value, owner) {
  if (!UUID.test(owner || '') || !globalThis.crypto?.subtle || typeof globalThis.crypto.randomUUID !== 'function') throw problem('invalid');
  let digest;
  try {
    digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ojjuda-saju-compatibility-v1|${owner}|${value}`));
  } catch { throw problem('invalid'); }
  const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (!HASH.test(key)) throw problem('invalid');
  return key;
}

function timestamp(value) {
  if (typeof value !== 'string') return NaN;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !validDay(...match.slice(1, 4).map(Number))
      || Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59) return NaN;
  return Date.parse(value);
}

function monotonicNow() {
  return typeof globalThis.performance?.now === 'function' ? performance.now() : Date.now();
}

function validMetadata(value) {
  return value?.access_version === 1 && value.access_hours === 24 && value.entitlement_version === 1
    && Number.isFinite(timestamp(value.server_now));
}

function validBalance(value) { return Number.isSafeInteger(value) && value >= 0; }

function validateReceipt(receipt, pairKey, serverNow, expectedCharge = 0, requestId = null) {
  const paid = timestamp(receipt?.paid_at), expires = timestamp(receipt?.expires_at);
  if (receipt?.ok !== true || receipt.entitled !== true || !validMetadata(receipt)
      || receipt.product !== 'saju' || receipt.topic !== 'compatibility' || receipt.pair_key !== pairKey
      || !HASH.test(pairKey || '') || !UUID.test(receipt.request_id || '') || receipt.price !== PRICE
      || !validBalance(receipt.coins) || ![0, PRICE].includes(receipt.charged)
      || receipt.charged > expectedCharge || typeof receipt.replayed !== 'boolean'
      || typeof receipt.entitlement_replayed !== 'boolean' || receipt.replayed !== (receipt.charged === 0)
      || (receipt.charged === PRICE && receipt.request_id !== requestId)
      || !Number.isFinite(paid) || !Number.isFinite(expires) || paid > serverNow || expires <= serverNow
      || expires - paid !== ACCESS_MS) throw problem('invalid');
}

function failure(result) {
  if (result?.ok !== false || !Object.hasOwn(MESSAGES, result.reason)
      || (Object.hasOwn(result, 'coins') && !validBalance(result.coins))
      || (Object.hasOwn(result, 'price') && result.price !== PRICE)
      || (Object.hasOwn(result, 'required') && ![0, PRICE].includes(result.required))
      || (result.reason === 'price_changed' && ![0, PRICE].includes(result.required))) throw problem('invalid');
  return problem(result.reason, result);
}

export class SajuCompatibilityPayment {
  constructor(parentBilling) {
    if (!parentBilling || ['init', 'refreshAdminMode', 'check', 'setBalance'].some(name => typeof parentBilling[name] !== 'function')) {
      throw problem('invalid');
    }
    this.parent = parentBilling;
    this.owner = null;
    this.modeVersion = null;
    this.client = null;
    this.clock = null;
    this.requests = new Map();
    this.grants = new Map();
    this.pending = null;
    this.pendingPair = null;
  }

  currentIdentity() {
    return !!this.owner && this.owner === this.parent.user && this.modeVersion === this.parent.modeVersion
      && this.client === this.parent.client && !this.parent.anonymous;
  }

  serverTime() {
    if (!this.currentIdentity() || !this.clock) return NaN;
    const elapsed = Math.max(this.clock.elapsed, 0, Date.now() - this.clock.wall, monotonicNow() - this.clock.monotonic);
    this.clock.elapsed = elapsed;
    return this.clock.server + elapsed;
  }

  remainingMs(access) {
    if (!this.currentIdentity() || !access || typeof access !== 'object') return 0;
    const grant = this.grants.get(access.request_id);
    if (!grant || access.pair_key !== grant.pairKey) return 0;
    if (grant.preview) return access.adminPreview === true && this.parent.adminPreview ? Infinity : 0;
    if (access.adminPreview || access.paid_at !== grant.paidAt || access.expires_at !== grant.expiresAt) return 0;
    const now = this.serverTime(), expires = timestamp(access.expires_at);
    return Number.isFinite(now) && Number.isFinite(expires) ? Math.max(0, Math.min(ACCESS_MS, expires - now)) : 0;
  }

  isActive(access) { return this.remainingMs(access) > 0; }

  snapshot() {
    return { owner: this.parent.user || null, version: this.parent.modeVersion, client: this.parent.client };
  }

  check(context) {
    this.parent.check(context.owner, context.version);
    if (this.parent.anonymous) throw problem('member_required');
    if (context.client !== this.parent.client) throw problem('account_changed');
  }

  async prepare(initial) {
    await this.parent.init();
    if (initial.owner) this.check(initial);
    if (!this.parent.user || !this.parent.client) throw problem('not_signed_in');
    if (this.parent.anonymous) throw problem('member_required');
    const context = this.snapshot();
    await this.parent.refreshAdminMode();
    this.check(context);
    if (this.owner !== context.owner || this.modeVersion !== context.version || this.client !== context.client) {
      this.owner = context.owner;
      this.modeVersion = context.version;
      this.client = context.client;
      this.requests.clear();
      this.grants.clear();
      this.clock = null;
    }
    return context;
  }

  async rpc(name, args, context) {
    this.check(context);
    const started = { wall: Date.now(), monotonic: monotonicNow() };
    let response;
    try {
      const request = context.client.rpc(name, args);
      response = await (typeof request?.abortSignal === 'function' && typeof globalThis.AbortSignal?.timeout === 'function'
        ? request.abortSignal(AbortSignal.timeout(15000)) : request);
    } catch {
      this.check(context);
      throw problem();
    }
    this.check(context);
    if (response?.error) {
      if (response.error.code === '42501' || /not_signed_in|JWT expired/i.test(response.error.message || '')) throw problem('not_signed_in');
      throw problem();
    }
    return { result: response?.data, started };
  }

  updateClock(result, started) {
    const server = timestamp(result.server_now);
    const elapsed = Math.max(0, Date.now() - started.wall, monotonicNow() - started.monotonic);
    // Count the full request delay. Ignore older server snapshots, but allow
    // a fresh verified response to correct an inaccurate device-clock jump.
    if (!this.clock || server >= this.clock.server) this.clock = { server, ...started, elapsed };
  }

  remember(access) {
    this.grants.set(access.request_id, { pairKey: access.pair_key, paidAt: access.paid_at, expiresAt: access.expires_at, preview: access.adminPreview === true });
  }

  async status(chart = null, partner = null) {
    const value = chart == null && partner == null ? null : pairProfile(chart, partner);
    const context = await this.prepare(this.snapshot());
    const pairKey = value === null ? null : await fingerprint(value, context.owner);
    this.check(context);
    if (this.parent.adminPreview) return { ok: true, coins: this.parent.balance, price: PRICE, pair_key: pairKey, entitlement: null, adminPreview: true };
    const { result, started } = await this.rpc('saju_compatibility_status_v1', { p_pair_key: pairKey }, context);
    if (result?.ok !== true) {
      const error = failure(result);
      if (validBalance(result.coins)) this.parent.setBalance(result.coins);
      throw error;
    }
    if (!validMetadata(result) || result.pair_key !== pairKey || result.price !== PRICE || !validBalance(result.coins)
        || (result.entitlement !== null && (typeof result.entitlement !== 'object' || !result.entitlement || !pairKey))) throw problem('invalid');
    if (result.entitlement !== null) {
      validateReceipt(result.entitlement, pairKey, timestamp(result.server_now));
      if (result.entitlement.coins !== result.coins) throw problem('invalid');
    }
    this.updateClock(result, started);
    if (result.entitlement) {
      this.remember(result.entitlement);
      if (!this.isActive(result.entitlement)) result.entitlement = null;
    }
    this.check(context);
    this.parent.setBalance(result.coins);
    return result;
  }

  async start(chart, partner, { expectedCharge } = {}) {
    const value = pairProfile(chart, partner);
    if (![0, PRICE].includes(expectedCharge)) throw problem('invalid');
    const initial = this.snapshot();
    const pendingPair = `${initial.owner}|${initial.version}|${expectedCharge}|${value}`;
    if (this.pending) {
      if (this.pendingPair !== pendingPair) throw problem('busy');
      return this.pending;
    }
    this.pendingPair = pendingPair;
    const task = (async () => {
      const context = await this.prepare(initial);
      const pairKey = await fingerprint(value, context.owner);
      this.check(context);
      if (this.parent.adminPreview) {
        const result = { ok: true, entitled: true, product: 'saju', topic: 'compatibility', pair_key: pairKey,
          request_id: crypto.randomUUID(), price: 0, charged: 0, replayed: false, adminPreview: true };
        this.remember(result);
        return result;
      }
      const previous = this.requests.get(pairKey);
      if (previous?.expires_at && !this.isActive(previous)) this.requests.delete(pairKey);
      if (!this.requests.has(pairKey)) this.requests.set(pairKey, { request_id: crypto.randomUUID() });
      const requestId = this.requests.get(pairKey).request_id;
      if (!UUID.test(requestId || '')) throw problem('invalid');
      const { result, started } = await this.rpc('saju_compatibility_buy_v1', {
        p_request_id: requestId, p_pair_key: pairKey, p_expected_user: context.owner,
        p_expected_charge: expectedCharge, p_verify_only: false
      }, context);
      if (result?.ok !== true) {
        const error = failure(result);
        if (validBalance(result.coins)) this.parent.setBalance(result.coins);
        // An expired ambiguous request stops here. Only the next explicit
        // button press may create a new UUID and authorize another charge.
        if (result.reason === 'access_expired') this.requests.delete(pairKey);
        throw error;
      }
      validateReceipt(result, pairKey, timestamp(result.server_now), expectedCharge, requestId);
      this.updateClock(result, started);
      this.remember(result);
      this.requests.set(pairKey, { request_id: result.request_id, pair_key: pairKey, paid_at: result.paid_at, expires_at: result.expires_at });
      this.check(context);
      this.parent.setBalance(result.coins);
      if (!this.isActive(result)) throw problem('access_expired');
      return result;
    })();
    this.pending = task;
    try { return await task; }
    finally {
      if (this.pending === task) { this.pending = null; this.pendingPair = null; }
    }
  }
}
