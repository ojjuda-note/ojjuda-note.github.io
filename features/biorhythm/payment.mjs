// Only a member-scoped birth fingerprint reaches billing; the raw birth date stays on this device.
import { isoToDay } from './engine.mjs?v=20261113-biorhythm1';

export const PRICE = 5;
const ACCESS_MS = 24 * 60 * 60 * 1000;
const HASH = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const messages = {
  not_signed_in: '아지트에 로그인한 뒤 내 리듬을 펼쳐 주세요.',
  member_required: '회원으로 로그인하면 내 리듬을 볼 수 있어요.',
  account_changed: '로그인한 계정이 바뀌었어요. 생일을 다시 입력해 주세요.',
  input_changed: '입력 정보가 바뀌었어요. 표시된 이용료를 확인하고 다시 눌러 주세요.',
  coins: '쭈가 부족해요. 아지트에서 보유한 쭈를 확인해 주세요.',
  banned: '현재 계정으로는 리듬을 펼칠 수 없어요.',
  profile_unavailable: '회원 정보를 확인하지 못했어요. 아지트에서 다시 로그인해 주세요.',
  wallet_unavailable: '보유한 쭈를 확인하지 못했어요. 잠시 뒤 다시 눌러 주세요.',
  access_expired: '24시간 이용이 끝났어요. 다시 펼치기를 눌러야 새로 5쭈를 사용해요.',
  price_changed: '이용 내역이 바뀌었어요. 표시된 이용료를 확인하고 다시 눌러 주세요.',
  request_conflict: '이용 내역이 달라졌어요. 새로고침한 뒤 다시 확인해 주세요.',
  receipt_unavailable: '결제 내역을 확인하지 못했어요. 다시 누르면 같은 결제를 확인해요.',
  invalid: '이용 정보를 확인하지 못했어요. 잠시 뒤 다시 눌러 주세요.',
  busy: '이용 내역을 확인하고 있어요. 잠시만 기다려 주세요.',
  network: '연결을 확인하지 못했어요. 다시 누르면 기존 결제부터 확인해요.'
};
function problem(code = 'network') { return Object.assign(new Error(messages[code] || messages.network), { code }); }
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
const monotonic = () => globalThis.performance?.now?.() ?? Date.now();
const validCoins = value => Number.isSafeInteger(value) && value >= 0;
const metadata = value => value?.access_version === 1 && value.entitlement_version === 1
  && value.access_hours === 24 && Number.isFinite(timestamp(value.server_now));

export async function birthFingerprint(birth, owner) {
  isoToDay(birth);
  if (!UUID.test(owner || '') || !globalThis.crypto?.subtle) throw problem('invalid');
  const bytes = new TextEncoder().encode(JSON.stringify(['ojjuda:biorhythm:v1', owner.toLowerCase(), birth]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validateReceipt(receipt, birthKey, expectedCharge = PRICE) {
  const server = timestamp(receipt?.server_now), paid = timestamp(receipt?.paid_at), expires = timestamp(receipt?.expires_at);
  if (!metadata(receipt) || receipt?.ok !== true || receipt.entitled !== true
    || receipt.birth_key !== birthKey || !HASH.test(birthKey) || !UUID.test(receipt.request_id || '')
    || receipt.product !== 'biorhythm' || receipt.topic !== 'rhythm' || receipt.price !== PRICE
    || !validCoins(receipt.coins) || ![0, PRICE].includes(receipt.charged) || receipt.charged > expectedCharge
    || typeof receipt.replayed !== 'boolean' || typeof receipt.entitlement_replayed !== 'boolean'
    || (receipt.replayed && receipt.charged !== 0)
    || !Number.isFinite(paid) || !Number.isFinite(expires) || paid > server || expires <= server
    || expires - paid !== ACCESS_MS) throw problem('invalid');
  return receipt;
}

function loadConfig() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => { clearTimeout(timer); script.remove(); reject(problem()); };
    const timer = setTimeout(fail, 15000);
    script.src = '/config.js?v=20261113-biorhythm-paid1';
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = fail;
    document.head.append(script);
  });
}

export class BiorhythmPayment {
  constructor({ onAccountChange = () => {}, onBalance = () => {} } = {}) {
    this.onAccountChange = onAccountChange;
    this.onBalance = onBalance;
    this.client = null;
    this.user = null;
    this.anonymous = false;
    this.balance = null;
    this.ready = false;
    this.hasSession = false;
    this.revision = 0;
    this.requests = new Map();
    this.clock = null;
    this.initializing = null;
    this.pending = null;
    this.bound = false;
  }
  get signedIn() { return !!this.user && !this.anonymous; }
  accept(session) {
    const user = session?.user?.id || null, anonymous = session?.user?.is_anonymous === true;
    const changed = user !== this.user || anonymous !== this.anonymous;
    const notify = this.hasSession && changed;
    this.hasSession = true;
    if (!changed) return;
    this.user = user; this.anonymous = anonymous; this.revision++;
    this.balance = null; this.clock = null; this.requests.clear();
    if (notify) this.onAccountChange();
  }
  async init() {
    if (this.ready) return this;
    if (this.initializing) return this.initializing;
    const task = (async () => {
      if (!window.ojjudaSupabase?.auth && !window.OjjudaGetClient) await loadConfig();
      this.client = window.ojjudaSupabase?.auth ? window.ojjudaSupabase : await window.OjjudaGetClient?.();
      if (!this.client?.auth) throw problem();
      window.ojjudaSupabase = this.client;
      if (!this.bound) {
        this.client.auth.onAuthStateChange((_event, session) => this.accept(session));
        this.bound = true;
      }
      const revision = this.revision;
      const { data, error } = await this.client.auth.getSession();
      if (error) throw problem();
      if (revision === this.revision) this.accept(data?.session);
      this.ready = true;
      return this;
    })();
    this.initializing = task;
    try { return await task; }
    finally { if (this.initializing === task) this.initializing = null; }
  }
  check(owner, revision, isCurrent = () => true) {
    if (!this.signedIn) throw problem(this.anonymous ? 'member_required' : 'not_signed_in');
    if (this.user !== owner || this.revision !== revision) throw problem('account_changed');
    if (!isCurrent()) throw problem('input_changed');
  }
  setBalance(value) {
    if (!validCoins(value)) return;
    this.balance = value; this.onBalance(value);
  }
  serverTime() {
    if (!this.clock) return NaN;
    this.clock.elapsed = Math.max(this.clock.elapsed, 0, Date.now() - this.clock.wall, monotonic() - this.clock.monotonic);
    return this.clock.server + this.clock.elapsed;
  }
  remainingMs(receipt) {
    const expires = timestamp(receipt?.expires_at), now = this.serverTime();
    return Number.isFinite(expires) && Number.isFinite(now) ? Math.max(0, Math.min(ACCESS_MS, expires - now)) : 0;
  }
  isActive(receipt) { return this.remainingMs(receipt) > 0; }
  async rpc(name, args, owner, revision) {
    this.check(owner, revision);
    const started = {wall:Date.now(),monotonic:monotonic()};
    let response;
    try {
      const request = this.client.rpc(name, args);
      response = await (typeof request?.abortSignal === 'function' && typeof globalThis.AbortSignal?.timeout === 'function'
        ? request.abortSignal(globalThis.AbortSignal.timeout(15000)) : request);
    } catch { throw problem(); }
    this.check(owner, revision);
    if (response?.error) throw problem(/JWT|not_signed_in/i.test(response.error.message || '') ? 'not_signed_in' : 'network');
    const result = response?.data;
    if (result?.ok === true) {
      if (!metadata(result)) throw problem('invalid');
      const server = timestamp(result.server_now);
      if (!this.clock || server >= this.clock.server) this.clock = {server,...started,elapsed:0};
    }
    return result;
  }
  async status(birth = null, { isCurrent = () => true } = {}) {
    await this.init();
    const owner = this.user, revision = this.revision;
    this.check(owner, revision, isCurrent);
    const key = birth === null ? null : await birthFingerprint(birth, owner);
    this.check(owner, revision, isCurrent);
    const result = await this.rpc('biorhythm_status_v1', { p_birth_key:key }, owner, revision);
    this.check(owner, revision, isCurrent);
    if (result?.ok !== true) throw problem(result?.reason || 'invalid');
    if (result.birth_key !== key || result.price !== PRICE || !validCoins(result.coins)
      || !Object.hasOwn(result, 'entitlement')) throw problem('invalid');
    if (result.entitlement !== null) validateReceipt(result.entitlement, key);
    if (result.entitlement && !this.isActive(result.entitlement)) result.entitlement = null;
    this.setBalance(result.coins);
    return result;
  }
  async buy(birth, { expectedCharge, isCurrent = () => true } = {}) {
    if (![0, PRICE].includes(expectedCharge)) throw problem('invalid');
    if (this.pending) throw problem('busy');
    const task = (async () => {
      await this.init();
      const owner = this.user, revision = this.revision;
      this.check(owner, revision, isCurrent);
      const key = await birthFingerprint(birth, owner);
      this.check(owner, revision, isCurrent);
      const previous = this.requests.get(key);
      if (previous?.expires_at && !this.isActive(previous)) this.requests.delete(key);
      if (!this.requests.has(key)) this.requests.set(key, { request_id:crypto.randomUUID() });
      const result = await this.rpc('biorhythm_buy_v1', {
        p_request_id:this.requests.get(key).request_id, p_birth_key:key,
        p_expected_user:owner, p_expected_charge:expectedCharge, p_verify_only:false
      }, owner, revision);
      this.check(owner, revision, isCurrent);
      this.setBalance(result?.coins);
      if (result?.ok !== true) {
        if (result?.reason === 'access_expired') this.requests.delete(key);
        throw problem(result?.reason || 'invalid');
      }
      validateReceipt(result, key, expectedCharge);
      this.requests.set(key, { request_id:result.request_id, expires_at:result.expires_at });
      if (!this.isActive(result)) throw problem('access_expired');
      return result;
    })();
    this.pending = task;
    try { return await task; }
    finally { if (this.pending === task) this.pending = null; }
  }
}
