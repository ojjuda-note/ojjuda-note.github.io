// Ojjuda's production entry enables billing. The private design preview never charges.
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOPICS = new Set(['overall', 'love', 'money', 'work']);
export function getTarotPrice(topic) {
  if (!TOPICS.has(topic)) throw problem('invalid');
  return topic === 'overall' ? 30 : 10;
}
const messages = {
  not_signed_in: '아지트에 로그인한 뒤 이용해 주세요.',
  member_required: '아지트 회원으로 로그인하면 이용할 수 있어요.',
  banned: '현재 계정으로는 운세를 시작할 수 없어요.',
  coins: '선택한 운세를 시작하는 데 필요한 쭈가 부족해요.',
  price_changed: '이용 금액이 바뀌었어요. 표시된 새 가격을 확인한 뒤 다시 시작해 주세요.',
  wallet_unavailable: '보유한 쭈를 확인하지 못했어요. 아지트로 돌아가 다시 열어 주세요.',
  request_conflict: '진행 중인 운세를 확인하지 못했어요. 아지트로 돌아가 다시 열어 주세요.',
  progress_conflict: '다른 화면에 저장된 오늘의 점괘를 불러왔어요.',
  progress_network: '선택을 저장하는 중 연결이 끊겼어요. 이어보기를 눌러 다시 확인해 주세요.',
  progress_missing: '이전 점괘를 이어서 볼 수 없어요. 주제를 다시 골라 주세요.',
  expired: '24시간이 지나 풀이가 만료됐어요. 다시 결제해 주세요.',
  mode_changed: '이용 모드가 바뀌었어요. 확인한 뒤 다시 시작해 주세요.',
  storage_unavailable: '진행 상황을 저장할 수 없어 운세를 시작하지 않았어요. 브라우저에서 이 사이트의 데이터 저장을 허용해 주세요.',
  invalid: '운세를 불러오지 못했어요. 아지트로 돌아가 다시 열어 주세요.',
  network: '연결이 잠시 끊겼어요. 시작 버튼을 다시 눌러 진행하던 운세를 이어서 확인해 주세요. 같은 운세의 이용 금액은 한 번만 차감돼요.'
};
function problem(code = 'network', price) {
  const text = code === 'coins' && Number.isInteger(price) && price > 0 ? `쭈가 부족해요. 선택한 운세는 ${price}쭈가 필요해요.` : messages[code] || messages.network;
  const error = new Error(text);
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
  if (!Array.isArray(value) || value.length > max || new Set(value).size !== value.length || value.some(i => !Number.isInteger(i) || i < 0 || i > 4)) return null;
  return [...value];
}
function progress(value) {
  const discarded = indices(value.discarded, 2);
  const openOrder = indices(value.open_order ?? value.openOrder, 3);
  if (!discarded || !openOrder || (openOrder.length && discarded.length !== 2) || openOrder.some(i => discarded.includes(i))) throw problem('invalid');
  return { discarded, openOrder };
}
function receipt(value) {
  if (!value?.ok || !UUID.test(value.request_id) || !TOPICS.has(value.topic) || !/^\d{4}-\d{2}-\d{2}$/.test(value.reading_day || '') || !Number.isFinite(Date.parse(value.reset_at)) || !Array.isArray(value.drawn) || value.drawn.length !== 5 || new Set(value.drawn).size !== 5 || value.drawn.some(id => typeof id !== 'string')) throw problem('invalid');
  return { ...value, ...progress(value) };
}
function sameProgress(a, b) {
  return JSON.stringify(a.discarded) === JSON.stringify(b.discarded) && JSON.stringify(a.openOrder) === JSON.stringify(b.openOrder);
}

export class TarotPayment {
  constructor({ enabled = false, onBalance = () => {}, onAccountChange = () => {}, onModeChange = () => {} } = {}) {
    this.enabled = enabled;
    this.onBalance = onBalance;
    this.onAccountChange = onAccountChange;
    this.onModeChange = onModeChange;
    this.client = null;
    this.user = null;
    this.record = null;
    this.pending = null;
    this.balance = null;
    this.day = null;
    this.resetAt = null;
    this.clockAnchor = null;
    this.readings = new Map();
    this.todayRequest = null;
    this.saveQueue = Promise.resolve();
    this.previewOwner = null;
    this.previewEnabled = false;
    this.modeVersion = 0;
    this.previewBound = false;
    this.modeRequest = null;
    this.previewRun = false;
  }
  get key() { return this.user ? `ojjuda.tarot.session.v1.${this.user}` : null; }
  get adminPreview() { return !!this.user && this.previewOwner === this.user && this.previewEnabled; }
  setAdminMode(owner, enabled, notify = true) {
    const previous = this.adminPreview;
    this.previewOwner = owner;
    this.previewEnabled = !!enabled && owner === this.user;
    if (previous === this.adminPreview) return;
    this.modeVersion++;
    if (notify) this.onModeChange({ adminPreview: this.adminPreview });
  }
  async refreshAdminMode() {
    if (!this.enabled || !this.client || !this.user) return false;
    if (this.modeRequest) return this.modeRequest;
    const preview = window.OjjudaAdminPreview;
    if (!preview?.configure || !preview?.refresh) {
      this.setAdminMode(null, false);
      return false;
    }
    if (!this.previewBound) {
      window.addEventListener('ojjuda:admin-preview', event => {
        const value = event.detail;
        // Verification briefly publishes ready:false. Keep the last confirmed
        // display mode until it completes, so a recheck cannot cancel itself.
        if (value?.ready !== true) return;
        const allowed = value.owner === this.user && value.authorized === true
          && value.enabled === true && preview.isAuthorized() && preview.isEnabled();
        this.setAdminMode(value.owner, allowed);
      });
      this.previewBound = true;
    }
    const owner = this.user;
    preview.configure(this.client);
    const task = (async () => {
      try { await preview.refresh(); }
      catch (error) {
        this.setAdminMode(null, false);
        throw problem();
      }
      if (owner !== this.user) throw problem('not_signed_in');
      // Another auth refresh may supersede this verification. Never proceed
      // on the previously confirmed mode while that newer check is pending.
      if (!preview.isReady()) throw problem('mode_changed');
      return this.adminPreview;
    })();
    this.modeRequest = task;
    try { return await task; }
    finally { if (this.modeRequest === task) this.modeRequest = null; }
  }
  checkMode(owner, version) {
    if (owner !== this.user) throw problem('not_signed_in');
    if (version !== this.modeVersion) throw problem('mode_changed');
  }
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
  now() {
    if (!this.clockAnchor) return Date.now();
    const monotonic = globalThis.performance?.now?.();
    const elapsed = Number.isFinite(monotonic) && Number.isFinite(this.clockAnchor.monotonic)
      ? monotonic - this.clockAnchor.monotonic : Date.now() - this.clockAnchor.local;
    return this.clockAnchor.server + Math.max(0, elapsed);
  }
  syncClock(value) {
    const server = Date.parse(value?.server_now);
    if (!Number.isFinite(server)) return;
    // A delayed older response cannot rewind the clock and revive an expired result.
    this.clockAnchor = { server: this.clockAnchor ? Math.max(server, this.now()) : server,
      local: Date.now(), monotonic: globalThis.performance?.now?.() };
  }
  isExpired(value = this.record) {
    const expiry = Date.parse(value?.reset_at ?? value?.resetAt);
    return Number.isFinite(expiry) && this.now() >= expiry;
  }
  updateResetAt(fallback = this.resetAt) {
    const expiries = [...this.readings.values()].map(item => Date.parse(item.reset_at)).filter(time => time > this.now());
    this.resetAt = expiries.length ? new Date(Math.min(...expiries)).toISOString()
      : Date.parse(fallback) > this.now() ? fallback : null;
  }
  expireRecord(value = this.record) {
    if (!value) return;
    const id = value.request_id ?? value.requestId;
    if (this.readings.get(value.topic)?.request_id === id) this.readings.delete(value.topic);
    if (this.record?.requestId === id) this.clearRecord();
    this.updateResetAt();
  }
  receiptFor(topic) {
    if (this.adminPreview) return null;
    const value = this.readings.get(topic);
    return value && !this.isExpired(value) ? value : null;
  }
  async rpc(name, args = {}) {
    if (!this.client || !this.user) throw problem('not_signed_in');
    const owner = this.user;
    const { data, error } = await this.client.rpc(name, args);
    if (owner !== this.user) throw problem('not_signed_in');
    if (error) {
      if (error.code === '42501' || /not_signed_in|JWT expired/i.test(error.message || '')) throw problem('not_signed_in');
      throw problem();
    }
    this.syncClock(data?.server_now ? data : data?.receipt);
    return data;
  }
  async refreshToday() {
    if (!this.enabled || !this.user || this.adminPreview) return null;
    if (this.todayRequest) return this.todayRequest;
    this.todayRequest = (async () => {
      const data = await this.rpc('tarot_reading_today_v1');
      if (!data?.ok) throw problem(data?.reason);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.reading_day || '') || !Number.isFinite(Date.parse(data.reset_at)) || !Array.isArray(data.readings)) throw problem('invalid');
      const readings = data.readings.map(receipt);
      if (new Set(readings.map(item => item.topic)).size !== readings.length) throw problem('invalid');
      this.day = data.reading_day;
      this.resetAt = data.reset_at;
      this.readings = new Map(readings.filter(item => !this.isExpired(item)).map(item => [item.topic, item]));
      this.updateResetAt(data.reset_at);
      this.setBalance(data.coins);
      return data;
    })();
    try { return await this.todayRequest; }
    finally { this.todayRequest = null; }
  }
  adopt(value) {
    const result = receipt(value);
    if (this.isExpired(result)) {
      this.expireRecord(result);
      throw problem('expired');
    }
    if (!this.day || result.reading_day > this.day) this.day = result.reading_day;
    const record = {
      owner: this.user, requestId: result.request_id, topic: result.topic,
      readingDay: result.reading_day, resetAt: result.reset_at, paid: true, serverProgress: true,
      discarded: [...result.discarded], openOrder: [...result.openOrder]
    };
    // A confirmed receipt is recoverable from the server even if storage fills later.
    try { this.write(record); } catch { this.record = record; }
    this.readings.set(result.topic, result);
    this.updateResetAt(result.reset_at);
    this.setBalance(result.coins);
    return result;
  }
  async resume(value, draft) {
    // Keep the active canonical receipt instead of retrying a legacy duplicate.
    const canonical = this.receiptFor(value.topic);
    let result = this.adopt(canonical && canonical.request_id !== value.request_id ? canonical : value);
    // Preserve an interrupted save or progress from the pre-daily-limit client.
    if (draft?.requestId === result.request_id && (draft.unsynced || !draft.serverProgress)) {
      let saved;
      try { saved = progress(draft); } catch { return result; }
      if (saved.discarded.length || saved.openOrder.length) {
        try { result = await this.save(saved); }
        catch (error) {
          if (!error.receipt) throw error;
          result = { ...error.receipt, progressChanged: true };
        }
      }
    }
    return result;
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
      this.setAdminMode(null, false, false);
      this.modeVersion++;
      this.modeRequest = null;
      this.previewRun = false;
      this.user = owner;
      this.record = null;
      this.balance = null;
      this.day = null;
      this.resetAt = null;
      this.clockAnchor = null;
      this.readings.clear();
      this.onAccountChange();
    });
    if (!this.user) return { signedIn: false };
    this.record = this.read();
    await this.refreshAdminMode();
    if (this.adminPreview) return { signedIn: true, preview: true, adminPreview: true };
    const owner = this.user, version = this.modeVersion;
    await this.refreshToday();
    this.checkMode(owner, version);
    const draft = this.record;
    if (!draft) return { signedIn: true };
    // The server verifies old local dates and expiry metadata before restoration.
    const result = await this.request(draft, true);
    this.checkMode(owner, version);
    if (result?.reason === 'expired') {
      this.expireRecord(draft);
      this.setBalance(result.coins);
      return { signedIn: true, expired: true };
    }
    // A missing uncertain payment may still be in transit. Keep its UUID.
    if (result?.reason === 'not_found') {
      if (draft.paid) { this.clearRecord(); return { signedIn: true }; }
      return { signedIn: true, pending: draft };
    }
    if (!result?.ok) throw problem(result?.reason);
    try {
      const restored = await this.resume(receipt(result), draft);
      this.checkMode(owner, version);
      return { signedIn: true, resume: restored };
    } catch (error) {
      if (error.code !== 'expired') throw error;
      this.expireRecord(draft);
      return { signedIn: true, expired: true };
    }
  }
  request(record, verifyOnly) {
    return this.rpc('tarot_reading_buy_v2', {
      p_request_id: record.requestId, p_topic: record.topic, p_expected_price: record.quotedPrice ?? 10, p_verify_only: verifyOnly
    });
  }
  async start(topic) {
    if (!this.enabled) return null;
    if (this.pending) return this.pending;
    if (!this.user) throw problem('not_signed_in');
    if (!TOPICS.has(topic)) throw problem('invalid');
    const owner = this.user, version = this.modeVersion;
    const reopening = this.receiptFor(topic);
    this.pending = (async () => {
      await this.refreshAdminMode();
      // A click on the free preview must never turn into a paid request when
      // the switch, account, or administrator permission changes meanwhile.
      this.checkMode(owner, version);
      if (this.adminPreview) { this.previewRun = true; return null; }
      await this.refreshToday();
      this.checkMode(owner, version);
      const draft = this.record || this.read();
      const uncertain = draft && (!draft.paid || draft.unsynced);
      const previous = this.receiptFor(topic);
      // A free reopen that expires during verification must not become a charge.
      if (!previous && (reopening || (!uncertain && draft?.paid && draft.topic === topic && this.isExpired(draft)))) {
        this.expireRecord(reopening || draft);
        throw problem('expired');
      }
      const record = uncertain ? draft : previous ? {
        owner: this.user, requestId: previous.request_id, topic: previous.topic,
        paid: true, readingDay: previous.reading_day, resetAt: previous.reset_at, discarded: previous.discarded, openOrder: previous.openOrder
      } : { owner: this.user, requestId: crypto.randomUUID(), topic, quotedPrice: getTarotPrice(topic), paid: false, discarded: [], openOrder: [] };
      // Persist a new request BEFORE sending it, so retries can never buy twice.
      if (!record.paid) this.write(record);
      const result = await this.request(record, !!record.paid);
      // The original UUID remains in storage if the mode changed during a
      // purchase. Turning preview off recovers that receipt without repaying.
      this.checkMode(owner, version);
      if (!result?.ok) {
        if (result?.reason === 'expired') this.expireRecord(record);
        if (['coins', 'price_changed', 'banned', 'member_required', 'wallet_unavailable', 'invalid'].includes(result?.reason)) this.clearRecord();
        if (Number.isInteger(result?.coins)) this.setBalance(result.coins);
        throw problem(result?.reason, result?.price ?? getTarotPrice(record.topic));
      }
      this.previewRun = false;
      const restored = await this.resume(result, draft);
      this.checkMode(owner, version);
      return restored;
    })();
    try { return await this.pending; }
    finally { this.pending = null; }
  }
  save(value) {
    if (!this.enabled || this.adminPreview || !this.record) return Promise.resolve(null);
    if (this.previewRun) return Promise.reject(problem('mode_changed'));
    if (this.isExpired()) { this.expireRecord(); return Promise.reject(problem('expired')); }
    let next;
    try { next = progress({ discarded: [...value.discarded], openOrder: [...value.openOrder] }); }
    catch (error) { return Promise.reject(error); }
    const owner = this.user;
    const version = this.modeVersion;
    const requestId = this.record.requestId;
    const draft = { ...this.record, ...next, unsynced: true };
    // Keep the exact user's choice locally until the server acknowledges it.
    try { this.write(draft); } catch { this.record = draft; }
    const task = this.saveQueue.catch(() => {}).then(async () => {
      this.checkMode(owner, version);
      if (this.record?.requestId !== requestId) throw problem(this.isExpired(draft) ? 'expired' : 'progress_missing');
      let result;
      try {
        result = await this.rpc('tarot_reading_save_v1', {
          p_request_id: requestId, p_discarded: next.discarded, p_open_order: next.openOrder
        });
      } catch (error) {
        if (error.code === 'network') throw problem('progress_network');
        throw error;
      }
      // Keep the unsynced paid draft if the preview switch changed while this
      // save was in flight. Preview choices can never overwrite its progress.
      this.checkMode(owner, version);
      if (this.record?.requestId !== requestId) throw problem(this.isExpired(draft) ? 'expired' : 'progress_missing');
      if (!result?.ok) {
        if (result?.reason === 'expired') {
          this.expireRecord(draft);
          this.setBalance(result.coins);
          throw problem('expired');
        }
        if (result?.reason === 'not_found') {
          // A pre-limit receipt may no longer be the canonical daily reading.
          // Resolve the server's current choice before releasing the stale draft.
          await this.refreshToday();
          this.checkMode(owner, version);
          if (this.record?.requestId !== requestId) throw problem(this.isExpired(draft) ? 'expired' : 'progress_missing');
          const canonical = this.receiptFor(draft.topic);
          this.clearRecord();
          const error = problem(canonical ? 'progress_conflict' : 'progress_missing');
          if (canonical) error.receipt = this.adopt(canonical);
          throw error;
        }
        const error = problem(result?.reason);
        if (result?.receipt) error.receipt = this.adopt(result.receipt);
        throw error;
      }
      const saved = this.adopt(result);
      if (!sameProgress(saved, next)) {
        const error = problem('progress_conflict');
        error.receipt = saved;
        throw error;
      }
      return saved;
    });
    this.saveQueue = task;
    return task;
  }
  clearRecord() {
    try { if (this.key) localStorage.removeItem(this.key); } catch { /* Server receipts remain intact. */ }
    this.record = null;
  }
  newReading() {
    if (!this.enabled || this.adminPreview || this.pending || this.record?.unsynced || (this.record && !this.record.paid)) return;
    this.clearRecord();
  }
}
