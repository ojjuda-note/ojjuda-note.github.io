/** Authenticated parent bridge. This module never calculates grants or wallet prices. */
const CHILD = 'ojjuda-archery-game', PARENT = 'ojjuda-archery-world';
const STORAGE_PREFIX = 'forest-archer-ammo-pending-v2:';
const TIMEOUT = 12000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MUTATIONS = new Set(['round-start', 'round-complete', 'spend', 'buy', 'coach-buy']);
const SNAPSHOT_FIELDS = ['remaining', 'free_remaining', 'paid_remaining', 'coins', 'revision', 'main_rounds', 'milestones_granted', 'daily_eligible', 'day', 'daily_checked', 'pack_ammo', 'pack_price', 'server_now', 'coach_expires_at', 'coach_active', 'coach_price', 'coach_duration_seconds'];
const SNAPSHOT_DECLINES = new Set(['coins', 'coach_active', 'coach_basic', 'ammo_empty', 'limit', 'request_conflict', 'run_not_found', 'run_conflict', 'round_too_soon', 'invalid']);
const COUNTER_FIELDS = ['remaining', 'free_remaining', 'paid_remaining', 'coins', 'main_rounds', 'milestones_granted'];
const validStage = stage => Number.isInteger(stage) && stage >= 1 && stage <= 120;
const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });

export function createRequestId() {
  const crypto = globalThis.crypto || globalThis.window?.crypto;
  if (crypto?.randomUUID) return crypto.randomUUID();
  if (!crypto?.getRandomValues) throw new Error('Secure request identifiers are unavailable');
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function createAmmoClient({ onChange } = {}) {
  const host = globalThis.window, parent = host?.parent;
  const origin = host?.location?.origin || globalThis.location?.origin;
  const usable = !!(host?.addEventListener && parent && parent !== host && origin && origin !== 'null');
  let identity = null, snapshot = null, revision = null, connection = usable ? 'connecting' : 'unavailable';
  let serverAnchor = null, monotonicAnchor = null, lastServerTimestamp = null;
  let pending = null, disposed = false, notifyQueued = false, initTimer = null, readySettled = false;
  let wireTail = Promise.resolve();
  let settleReady;
  const ready = new Promise(resolve => { settleReady = value => { if (!readySettled) { readySettled = true;resolve(value); } }; });
  const requests = new Map();
  const defer = fn => Promise.resolve().then(fn);
  const monotonicNow = () => {
    const clock = globalThis.performance || host?.performance;
    const value = clock?.now?.();
    return Number.isFinite(value) ? value : null;
  };
  const serverNow = (now = monotonicNow()) => {
    return identity && serverAnchor !== null && monotonicAnchor !== null && now !== null ? serverAnchor + Math.max(0, now - monotonicAnchor) : null;
  };
  const keyFor = owner => STORAGE_PREFIX + encodeURIComponent(owner);
  const describePending = () => pending ? Object.freeze({ action: pending.action, requestId: pending.requestId, runId: pending.localRunId || pending.payload.runId, stage: pending.payload.stage, status: pending.status, recovered: pending.recovered }) : null;
  const notify = () => {
    if (notifyQueued || disposed) return;
    notifyQueued = true;
    defer(() => { notifyQueued = false;if (!disposed) { try { onChange?.(client); } catch { /* UI listeners cannot interrupt receipt handling. */ } } });
  };
  function storage() { return globalThis.localStorage || host?.localStorage; }
  function persist(operation) {
    const record = { version: 1, owner: operation.owner, action: operation.action, requestId: operation.requestId, payload: operation.payload, localRunId: operation.localRunId || null };
    try {
      const value = JSON.stringify(record), target = storage();
      target.setItem(keyFor(operation.owner), value);
      return target.getItem(keyFor(operation.owner)) === value;
    } catch { return false; }
  }
  function forget(operation) {
    try {
      const target = storage(), record = JSON.parse(target.getItem(keyFor(operation.owner)) || 'null');
      if (record?.requestId === operation.requestId) target.removeItem(keyFor(operation.owner));
    } catch { /* A committed receipt may safely be checked again on the next visit. */ }
  }
  function archiveSpend(operation, confirmed) {
    try {
      const target = storage(), key = 'forest-archer-ammo-recovery-v2:' + encodeURIComponent(operation.owner);
      const previous = JSON.parse(target.getItem(key) || '[]');
      const history = Array.isArray(previous) ? previous.filter(item => item?.requestId !== operation.requestId) : [];
      target.setItem(key, JSON.stringify([...history, { requestId: operation.requestId, action: 'spend', confirmed }].slice(-8)));
    } catch { /* History is advisory; future balances always come from the server. */ }
  }
  function restore(owner) {
    try {
      const record = JSON.parse(storage().getItem(keyFor(owner)) || 'null');
      if (record?.version !== 1 || record.owner !== owner || !MUTATIONS.has(record.action) || !UUID.test(record.requestId)) return null;
      const source = record.payload || {}, payload = {};
      if (record.action === 'round-start' || record.action === 'round-complete') {
        if (!validStage(source.stage)) return null;
        payload.stage = source.stage;
      }
      if (record.action === 'round-complete') {
        if (!UUID.test(source.runId)) return null;
        payload.runId = source.runId;
      }
      return { owner, action: record.action, requestId: record.requestId, payload, localRunId: typeof record.localRunId === 'string' ? record.localRunId : null, status: 'unknown', recovered: true, settled: null, promise: null };
    } catch { return null; }
  }
  function applySnapshot(result) {
    // A definitive business decline still contains the account's authoritative
    // state. Generic transport errors and incomplete snapshots do not.
    if (!result || !(result.ok === true || result.ok === false && SNAPSHOT_DECLINES.has(result.reason)) ||
      !SNAPSHOT_FIELDS.every(field => Object.prototype.hasOwnProperty.call(result, field)) ||
      !COUNTER_FIELDS.every(field => Number.isSafeInteger(result[field]) && result[field] >= 0) ||
      !['pack_ammo', 'pack_price', 'coach_price', 'coach_duration_seconds'].every(field => Number.isSafeInteger(result[field]) && result[field] > 0) ||
      !['daily_eligible', 'daily_checked', 'coach_active'].every(field => typeof result[field] === 'boolean') || typeof result.day !== 'string') return;
    const timestamp = typeof result.server_now === 'string' ? Date.parse(result.server_now) : NaN;
    const expiry = result.coach_expires_at === null ? null : typeof result.coach_expires_at === 'string' ? Date.parse(result.coach_expires_at) : NaN;
    if (!Number.isFinite(timestamp) || expiry !== null && !Number.isFinite(expiry) ||
      result.coach_active && !(expiry !== null && expiry > timestamp)) return;
    let nextRevision;
    try {
      if (!(Number.isSafeInteger(result.revision) && result.revision >= 0) && !(typeof result.revision === 'string' && /^\d+$/.test(result.revision))) return;
      nextRevision = BigInt(result.revision);
    } catch { return; }
    if (revision !== null && nextRevision < revision) return;
    if (revision !== null && nextRevision === revision && lastServerTimestamp !== null && timestamp < lastServerTimestamp) return;
    const next = {};
    for (const field of SNAPSHOT_FIELDS) if (field in result) next[field] = result[field];
    const now = monotonicNow(), current = serverNow(now);
    if (now !== null) {
      // Equal-time cached replies cannot rewind elapsed rental time. The user's
      // adjustable wall clock is never part of this account-time estimate.
      serverAnchor = Math.max(timestamp, current ?? timestamp);monotonicAnchor = now;
    }
    lastServerTimestamp = timestamp;
    snapshot = Object.freeze(next);revision = nextRevision;connection = 'ready';
  }
  function finishRequest(entry, result, keepLate = false) {
    clearTimeout(entry.timer);entry.timer = null;
    const resolve = entry.resolve;entry.resolve = null;
    if (!keepLate) requests.delete(entry.requestId);
    resolve?.(result);
  }
  function originalResult(operation, result, extra = {}) {
    return { ...result, requestId: operation.requestId, recovered: operation.recovered, ...extra };
  }
  function acceptMutation(entry, result) {
    const operation = entry.operation;
    if (pending !== operation) { finishRequest(entry, fail('stale'));return; }
    if (typeof result?.ok !== 'boolean' || result.reason === 'pending') {
      operation.status = 'unknown';operation.promise = null;
      finishRequest(entry, fail('pending', { requestId: operation.requestId }), true);notify();return;
    }
    const answer = originalResult(operation, result);
    if (!entry.resolve) {
      // A late receipt is acknowledged by an explicit retry. This prevents an
      // abandoned await from silently consuming a shot or creating a new buy.
      operation.status = 'confirmed';operation.settled = answer;operation.promise = null;
      requests.delete(entry.requestId);notify();return;
    }
    pending = null;forget(operation);finishRequest(entry, answer);notify();
  }
  function send(action, payload = {}, requestId, operation = null) {
    if (!identity || !usable || disposed) return Promise.resolve(fail('unavailable'));
    let id;
    try { id = requestId || createRequestId(); } catch { return Promise.resolve(fail('unavailable')); }
    const current = requests.get(id);
    if (current?.resolve) return current.promise;
    const context = identity;
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    const entry = { action, requestId: id, owner: context.owner, sessionId: context.sessionId, operation, resolve, promise, timer: null };
    requests.set(id, entry);
    const prior = wireTail;wireTail = promise.then(() => {}, () => {});
    prior.then(() => {
      if (!entry.resolve || disposed || identity?.owner !== context.owner || identity?.sessionId !== context.sessionId) { finishRequest(entry, fail('identity_changed'));return; }
      entry.timer = setTimeout(() => {
        if (requests.get(id) !== entry) return;
        if (operation && pending === operation) { operation.status = 'unknown';operation.promise = null;finishRequest(entry, fail('pending', { requestId: id }), true); }
        else { connection = 'unavailable';finishRequest(entry, fail('unavailable')); }
        notify();
      }, TIMEOUT);
      try { parent.postMessage({ source: CHILD, type: 'ammo-request', action, owner: context.owner, sessionId: context.sessionId, requestId: id, ...payload }, origin); }
      catch {
        if (operation && pending === operation) { operation.status = 'unknown';operation.promise = null;finishRequest(entry, fail('pending', { requestId: id }), true); }
        else finishRequest(entry, fail('unavailable'));
        notify();
      }
    });
    return promise;
  }
  async function ensureIdentity() {
    if (identity && !disposed) return true;
    await ready;
    return !!identity && !disposed;
  }
  async function refresh() {
    if (!await ensureIdentity()) return fail('unavailable');
    const existing = [...requests.values()].find(entry => entry.action === 'status' && entry.resolve && entry.owner === identity.owner && entry.sessionId === identity.sessionId);
    return existing ? existing.promise : send('status');
  }
  function dispatch(operation) {
    operation.status = 'waiting';operation.settled = null;
    const promise = send(operation.action, operation.payload, operation.requestId, operation);
    operation.promise = promise;notify();return promise;
  }
  async function mutate(action, payload, requestId, localRunId) {
    if (!await ensureIdentity()) return fail('unavailable');
    if (pending) {
      const same = pending.action === action && JSON.stringify(pending.payload) === JSON.stringify(payload) && (!requestId || pending.requestId === requestId) && (action !== 'spend' || pending.localRunId === localRunId);
      if (same && pending.status === 'waiting' && pending.promise) return pending.promise;
      return fail(same ? 'pending' : 'busy', { requestId: pending.requestId });
    }
    let id;
    try { id = requestId || createRequestId(); } catch { return fail('unavailable'); }
    const operation = { owner: identity.owner, action, requestId: id, payload, localRunId, status: 'waiting', recovered: false, settled: null, promise: null };
    if (!persist(operation)) return fail('storage_unavailable');
    pending = operation;return dispatch(operation);
  }
  async function lookup(operation, automatic = false) {
    if (pending !== operation) return fail('stale');
    const response = await send('receipt', { receiptId: operation.requestId, originalAction: operation.action });
    if (pending !== operation) return fail('stale');
    if (operation.recovered && operation.action === 'spend' && response.ok === true && response.found === false) {
      // Never replay an abandoned shot. An old authorized RPC may still finish;
      // every future operation refreshes the authoritative balance regardless.
      archiveSpend(operation, false);pending = null;forget(operation);notify();
      return originalResult(operation, fail('recovered_spend', { confirmed: false, archived: true }), { receiptOnly: true });
    }
    if (!response.ok || response.found !== true || typeof response.receipt?.ok !== 'boolean' || response.receipt.reason === 'pending') {
      operation.status = 'unknown';notify();
      return fail('pending', { requestId: operation.requestId, recovered: operation.recovered, found: response.found === true });
    }
    const result = { ...response.receipt };
    for (const field of SNAPSHOT_FIELDS) {
      // A stored purchase describes its original moment. Only the current
      // outer snapshot may provide balances, clock or rental entitlement.
      delete result[field];
      if (field in response) result[field] = response[field];
    }
    const answer = originalResult(operation, result, { receiptOnly: true });
    if (automatic && operation.action !== 'spend') {
      operation.status = 'confirmed';operation.settled = answer;notify();return answer;
    }
    pending = null;forget(operation);notify();
    if (operation.recovered && operation.action === 'spend') {
      archiveSpend(operation, response.receipt.ok);
      return originalResult(operation, fail('recovered_spend', { ...result, ok: false, reason: 'recovered_spend', confirmed: response.receipt.ok, receipt: response.receipt }), { receiptOnly: true });
    }
    return answer;
  }
  async function retryPending() {
    if (!await ensureIdentity()) return fail('unavailable');
    const operation = pending;
    if (!operation) return fail('nothing_pending');
    if (operation.status === 'waiting' && operation.promise) return operation.promise;
    if (operation.settled) { const result = operation.settled;pending = null;forget(operation);notify();return result; }
    if (operation.recovered && operation.action === 'spend') return lookup(operation);
    // This is an explicit user retry, never an automatic purchase on handshake.
    return dispatch(operation);
  }
  function onMessage(event) {
    if (disposed || event.source !== parent || event.origin !== origin) return;
    const data = event.data;
    if (!data || data.source !== PARENT) return;
    if (data.type === 'init') {
      if (!UUID.test(data.sessionId) || (data.owner !== null && (typeof data.owner !== 'string' || !data.owner))) return;
      if (identity?.sessionId === data.sessionId && identity.owner === data.owner && data.available === true) return;
      for (const entry of requests.values()) finishRequest(entry, fail('identity_changed'));
      if (pending) persist(pending);
      pending = null;snapshot = null;revision = null;serverAnchor = null;monotonicAnchor = null;lastServerTimestamp = null;
      clearTimeout(initTimer);
      if (data.available !== true || !data.owner) { identity = null;connection = 'unavailable';settleReady(false);notify();return; }
      identity = { owner: data.owner, sessionId: data.sessionId };connection = 'connecting';pending = restore(data.owner);
      settleReady(true);notify();
      const initializedIdentity = identity;
      defer(async () => {
        if (disposed || identity !== initializedIdentity) return;
        await refresh();
        if (!disposed && identity === initializedIdentity && pending?.recovered) lookup(pending, true);
      });
      return;
    }
    if (data.type !== 'ammo-response' || !identity || data.owner !== identity.owner || data.sessionId !== identity.sessionId) return;
    const entry = requests.get(data.requestId);
    if (!entry || entry.owner !== data.owner || entry.sessionId !== data.sessionId || entry.action !== data.action) return;
    const result = data.result;
    applySnapshot(result);
    if (entry.operation) acceptMutation(entry, result);
    else { finishRequest(entry, typeof result?.ok === 'boolean' ? result : fail('unavailable'));if (!snapshot && result?.ok !== true) connection = 'unavailable';notify(); }
  }
  const client = {
    get snapshot() { return snapshot; },
    get serverNow() { return serverNow(); },
    get connection() { return connection; },
    get pending() { return describePending(); },
    refresh,
    startRound(requestId, stage) { return UUID.test(requestId) && validStage(stage) ? mutate('round-start', { stage }, requestId) : Promise.resolve(fail('invalid')); },
    completeRound(runId, stage) { return UUID.test(runId) && validStage(stage) ? mutate('round-complete', { stage, runId }) : Promise.resolve(fail('invalid')); },
    spend(runId) { return typeof runId === 'string' && runId ? mutate('spend', {}, undefined, runId) : Promise.resolve(fail('invalid')); },
    buy() { return mutate('buy', {}); },
    buyCoach() { return mutate('coach-buy', {}); },
    retryPending,
    dispose() {
      if (disposed) return;disposed = true;clearTimeout(initTimer);host?.removeEventListener?.('message', onMessage);
      for (const entry of requests.values()) finishRequest(entry, fail('closed'));
      settleReady(false);
    }
  };
  if (usable) {
    host.addEventListener('message', onMessage);
    initTimer = setTimeout(() => { if (!identity) { connection = 'unavailable';settleReady(false);notify(); } }, TIMEOUT);
    defer(() => { if (!disposed) { try { parent.postMessage({ source: CHILD, type: 'ready' }, origin); } catch { connection = 'unavailable';settleReady(false);notify(); } } });
  } else settleReady(false);
  notify();return client;
}
