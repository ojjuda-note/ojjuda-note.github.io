// Ojjuda's production entry enables billing. The private design preview never charges.
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOPICS = new Set(['overall', 'love', 'money', 'work']);
const messages = {
  not_signed_in: '아지트에 로그인한 뒤 이용해 주세요.',
  member_required: '아지트 회원으로 로그인하면 이용할 수 있어요.',
  banned: '현재 계정으로는 운세를 시작할 수 없어요.',
  coins: '쭈가 부족해요. 운세를 한 번 보려면 10쭈가 필요해요.',
  wallet_unavailable: '보유한 쭈를 확인하지 못했어요. 아지트로 돌아가 다시 열어 주세요.',
  request_conflict: '진행 중인 운세를 확인하지 못했어요. 아지트로 돌아가 다시 열어 주세요.',
  storage_unavailable: '진행 상황을 저장할 수 없어 운세를 시작하지 않았어요. 브라우저에서 이 사이트의 데이터 저장을 허용해 주세요.',
  invalid: '운세를 불러오지 못했어요. 아지트로 돌아가 다시 열어 주세요.',
  network: '연결이 잠시 끊겼어요. 다시 누르면 시작하던 운세를 이어서 확인해요. 같은 운세로 쭈가 두 번 사용되지는 않아요.'
};
function problem(code = 'network') {
  const error = new Error(messages[code] || messages.network);
  error.code = code;
  return error;
}
function script(src) {
  return new Promise((resolve, reject) => {
    const node = document.createElement('script');
    node.src = src;
    node.onload = resolve;
    node.onerror = () => { node.remove(); reject(problem()); };
    document.head.append(node);
  });
}
function indices(value, max) {
  if (!Array.isArray(value) || value.length > max || new Set(value).size !== value.length || value.some(i => !Number.isInteger(i) || i < 0 || i > 4)) return [];
  return value;
}

export class TarotPayment {
  constructor({ enabled = false, onBalance = () => {}, onAccountChange = () => {} } = {}) {
    this.enabled = enabled;
    this.onBalance = onBalance;
    this.onAccountChange = onAccountChange;
    this.client = null;
    this.user = null;
    this.record = null;
    this.pending = null;
    this.balance = null;
  }
  get key() { return this.user ? `ojjuda.tarot.session.v1.${this.user}` : null; }
  read() {
    try {
      const data = JSON.parse(localStorage.getItem(this.key) || 'null');
      if (data?.owner === this.user && UUID.test(data.requestId) && TOPICS.has(data.topic)) return data;
    } catch { /* Invalid or inaccessible local progress cannot authorize a purchase. */ }
    return null;
  }
  write(record) {
    try { localStorage.setItem(this.key, JSON.stringify(record)); }
    catch { throw problem('storage_unavailable'); }
    this.record = record;
  }
  setBalance(value) {
    if (!Number.isInteger(value) || value < 0) return;
    this.balance = value;
    this.onBalance(value);
  }
  async init() {
    if (!this.enabled) return { preview: true };
    if (!window.OJJUDA_CONFIG) await script('/config.js?v=20261111-shared-member-auth1');
    if (!window.supabase?.createClient && !window.ojjudaSupabase?.auth) await script(SDK_URL);
    const config = window.OJJUDA_CONFIG;
    if (!config?.supabaseUrl || !config?.supabaseKey) throw problem();
    this.client = window.ojjudaSupabase || window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
    window.ojjudaSupabase = this.client;
    const { data, error } = await this.client.auth.getSession();
    if (error) throw problem();
    this.user = data.session?.user?.id || null;
    this.client.auth.onAuthStateChange((_event, next) => {
      const owner = next?.user?.id || null;
      if (owner === this.user) return;
      this.user = owner;
      this.record = null;
      this.balance = null;
      this.onAccountChange();
    });
    if (!this.user) return { signedIn: false };
    this.record = this.read();
    const wallet = await this.client.rpc('ju_shop_state');
    if (!wallet.error) this.setBalance(wallet.data?.coins);
    if (!this.record) return { signedIn: true };
    const result = await this.request(this.record, true);
    // An earlier purchase can still be in transit. Absence is not proof it failed.
    if (result?.reason === 'not_found') return { signedIn: true, pending: this.record };
    if (!result?.ok) throw problem(result?.reason);
    this.setBalance(result.coins);
    const discarded = indices(this.record.discarded, 2);
    const opened = indices(this.record.openOrder, 3);
    const openOrder = discarded.length === 2 && opened.every(i => !discarded.includes(i)) ? opened : [];
    return { signedIn: true, resume: { ...result, discarded, openOrder } };
  }
  async request(record, verifyOnly) {
    if (!this.client || !this.user) throw problem('not_signed_in');
    const owner = this.user;
    const { data, error } = await this.client.rpc('tarot_reading_buy_v1', {
      p_request_id: record.requestId, p_topic: record.topic, p_verify_only: verifyOnly
    });
    if (owner !== this.user) throw problem('not_signed_in');
    if (error) {
      if (error.code === '42501' || /not_signed_in|JWT expired/i.test(error.message || '')) throw problem('not_signed_in');
      throw problem();
    }
    return data;
  }
  async start(topic) {
    if (!this.enabled) return null;
    if (this.pending) return this.pending;
    if (!this.user) throw problem('not_signed_in');
    if (!TOPICS.has(topic)) throw problem('invalid');
    const record = this.record || this.read() || {
      owner: this.user, requestId: crypto.randomUUID(), topic, discarded: [], openOrder: []
    };
    // Persist the request BEFORE sending it. A retry always uses this same receipt ID.
    this.write(record);
    this.pending = (async () => {
      const result = await this.request(record, false);
      if (!result?.ok) {
        if (['coins', 'banned', 'member_required', 'wallet_unavailable', 'invalid'].includes(result?.reason)) this.newReading();
        if (Number.isInteger(result?.coins)) this.setBalance(result.coins);
        throw problem(result?.reason);
      }
      this.setBalance(result.coins);
      const discarded = indices(record.discarded, 2);
      const opened = indices(record.openOrder, 3);
      const openOrder = discarded.length === 2 && opened.every(i => !discarded.includes(i)) ? opened : [];
      return { ...result, discarded, openOrder };
    })();
    try { return await this.pending; }
    finally { this.pending = null; }
  }
  save({ discarded, openOrder }) {
    if (!this.enabled || !this.record) return;
    try { this.write({ ...this.record, discarded: [...discarded], openOrder: [...openOrder] }); }
    catch { /* The paid receipt remains recoverable even if later storage fills. */ }
  }
  newReading() {
    if (!this.enabled) return;
    try { if (this.key) localStorage.removeItem(this.key); } catch { /* Keep an in-memory reset usable. */ }
    this.record = null;
  }
}
