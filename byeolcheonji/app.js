(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const DEFAULTS = Object.freeze({ dateMode: 'all', guests: 'all' });
  const API = 'https://ziezbdjofcugznowiuda.supabase.co/functions/v1/byeolcheonji';
  const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
  const DATE_LABELS = { all: '전체 날짜', weekend: '주말', weekday: '평일' };
  const config = window.OJJUDA_CONFIG;
  const client = config?.supabaseUrl && config?.supabaseKey && window.supabase?.createClient
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null;
  const form = $('preferences-form');
  const content = $('member-content');
  const gate = $('member-gate');
  const alarmPanel = document.querySelector('.alarm-panel');
  const state = { member: null, identity: 0, filters: { ...DEFAULTS }, saved: null, enabled: false,
    alarmReady: false, alarmBusy: false, settings: null, request: 0, abort: null, data: null, limit: 24 };
  let authTimer;

  class ClientError extends Error {
    constructor(message, code = '', status = 0, retryAfter = 0) {
      super(message); this.code = code; this.status = status; this.retryAfter = retryAfter;
    }
  }
  function readStorage(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function writeStorage(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
  function removeStorage(key) { try { localStorage.removeItem(key); } catch { /* The server state remains authoritative. */ } }
  const deviceKey = () => `ojjuda-byeolcheonji-device:${state.member}`;
  const preferenceKey = () => `ojjuda-byeolcheonji-preferences:${state.member}`;
  const deviceToken = () => {
    const value = state.member ? readStorage(deviceKey()) : null;
    return /^[A-Za-z0-9_-]{43}$/.test(value || '') ? value : null;
  };
  const isMember = user => Boolean(user?.id && user.is_anonymous !== true);
  const context = () => ({ member: state.member, identity: state.identity });
  const current = ctx => Boolean(ctx.member && ctx.member === state.member && ctx.identity === state.identity);
  const sameFilters = (a, b) => Boolean(a && b && a.dateMode === b.dateMode && a.guests === b.guests);

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
  }
  function filtersOf(value) {
    const guests = value?.guests === 'all' ? 'all' : Number(value?.guests);
    return { dateMode: ['all', 'weekend', 'weekday'].includes(value?.dateMode) ? value.dateMode : 'all',
      guests: guests === 'all' || [2, 4, 6, 8].includes(guests) ? guests : 'all' };
  }
  function landing() {
    const params = new URLSearchParams(location.search);
    const date = params.getAll('date').length === 1 && validDate(params.get('date')) ? params.get('date') : '';
    const room = params.getAll('room').length === 1 && /^[1-9]\d{0,19}$/.test(params.get('room') || '') ? params.get('room') : '';
    const guestText = params.getAll('guests').length === 1 ? params.get('guests') : null;
    return { date, room, guests: /^(all|2|4|6|8)$/.test(guestText || '') ? guestText : null };
  }
  const target = landing();
  for (const [id, mode] of [['login-link', 'login'], ['signup-link', 'signup']]) {
    const url = new URL(`/?auth=${mode}&next=byeolcheonji`, location.origin);
    if (target.date) url.searchParams.set('date', target.date);
    if (target.room) url.searchParams.set('room', target.room);
    if (target.guests !== null) url.searchParams.set('guests', target.guests);
    $(id).href = url.pathname + url.search;
  }
  function dateLabel(date) {
    return validDate(date) ? `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일 (${DAY_LABELS[new Date(date + 'T00:00:00Z').getUTCDay()]})` : '';
  }
  function shortDate(date) { return validDate(date) ? `${Number(date.slice(5, 7))}.${Number(date.slice(8))}` : ''; }
  function timeLabel(date) {
    const value = new Date(date);
    if (!Number.isFinite(value.getTime())) return '';
    return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(value);
  }
  function filterLabel(value) { return `${DATE_LABELS[value.dateMode]} · ${value.guests === 'all' ? '인원 전체' : `${value.guests}인`}`; }
  function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }
  function within(promise, milliseconds = 12000) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new ClientError('연결이 늦어지고 있어요. 다시 확인해 주세요.', 'timeout')), milliseconds);
    })]).finally(() => clearTimeout(timer));
  }
  function showGate(mode, message) {
    state.identity++;
    state.member = null;
    state.request++;
    state.abort?.abort();
    state.abort = null;
    state.data = null;
    state.enabled = false;
    state.saved = null;
    state.settings = null;
    state.alarmReady = false;
    state.alarmBusy = false;
    content.hidden = true;
    $('results').replaceChildren();
    $('alarm-feedback').textContent = '';
    gate.hidden = false;
    gate.setAttribute('aria-busy', String(mode === 'loading'));
    $('gate-symbol').textContent = mode === 'loading' ? '○' : mode === 'error' ? '↻' : '↗';
    $('gate-title').textContent = mode === 'loading' ? '회원 정보를 확인하고 있어요'
      : mode === 'error' ? '연결을 확인해 주세요' : '로그인하면 이용할 수 있어요';
    $('gate-message').textContent = message || (mode === 'loading' ? '잠시만 기다려 주세요.' : '별천지 빈방 알림은 오쭈다 회원만 이용할 수 있어요.');
    $('gate-actions').hidden = mode === 'loading';
    $('gate-retry').hidden = mode !== 'error';
  }
  async function api(path, { method = 'GET', body, signal, timeout = 35000 } = {}, ctx = context()) {
    if (!current(ctx)) throw new ClientError('다시 로그인해 주세요.', 'identity_changed');
    const { data, error } = await within(client.auth.getSession());
    if (!current(ctx)) throw new ClientError('회원 정보가 바뀌었어요.', 'identity_changed');
    if (error) throw new ClientError('로그인 상태를 확인하지 못했어요. 다시 시도해 주세요.');
    if (!isMember(data?.session?.user) || data.session.user.id !== ctx.member || !data.session.access_token) {
      showGate('login'); throw new ClientError('다시 로그인해 주세요.', 'identity_changed');
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeout);
    try {
      const token = deviceToken();
      const response = await fetch(API + path, {
        method, mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${data.session.access_token}`, Accept: 'application/json',
          ...(token ? { 'X-Device-Token': token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      let result;
      try { result = await response.json(); } catch { throw new ClientError('서버 응답을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.'); }
      if (!current(ctx)) throw new ClientError('회원 정보가 바뀌었어요.', 'identity_changed');
      if (!response.ok) {
        let message = typeof result?.error === 'string' ? result.error : '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
        if (response.status === 410 && result?.code === 'device_expired') {
          state.enabled = false; state.saved = null;
          removeStorage(deviceKey());
          if (readStorage('ojjuda-byeolcheonji-push-owner') === state.member) removeStorage('ojjuda-byeolcheonji-push-owner');
          message = '알림 연결이 만료됐어요. 빈방 알림 켜기를 눌러 다시 연결해 주세요.';
          renderAlarm();
        }
        if (response.status === 401 || response.status === 403) showGate('login', message);
        throw new ClientError(message, result?.code, response.status, Number(result?.retryAfter) || 0);
      }
      return result;
    } catch (error) {
      if (error instanceof ClientError) throw error;
      throw new ClientError(signal?.aborted ? '조회가 취소됐어요.' : controller.signal.aborted
        ? '연결이 늦어지고 있어요. 잠시 뒤 새로 확인해 주세요.' : '연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 눌러 주세요.', signal?.aborted ? 'cancelled' : 'network');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  function syncControls() {
    for (const input of form.querySelectorAll('input')) input.checked = String(state.filters[input.name]) === input.value;
  }
  function alarmFeedback(message = '', error = false) {
    $('alarm-feedback').textContent = message;
    $('alarm-feedback').classList.toggle('is-error', error);
    $('alarm-feedback').setAttribute('role', error ? 'alert' : 'status');
  }
  function renderAlarm() {
    const dirty = state.enabled && !sameFilters(state.saved, state.filters);
    alarmPanel.classList.toggle('is-on', state.enabled);
    const permissionOff = state.enabled && 'Notification' in window && Notification.permission !== 'granted';
    $('alarm-status').textContent = !state.alarmReady ? '알림 상태를 확인하고 있어요.'
      : permissionOff ? '브라우저의 알림 권한이 꺼져 있어요.'
        : state.enabled ? '이 기기에 알림이 켜져 있어요.' : '알림을 켜면 이 기기로 알려드려요.';
    $('alarm-saved').hidden = !state.enabled || !state.saved;
    $('alarm-saved').textContent = state.saved ? `알림 조건: ${filterLabel(state.saved)}` : '';
    $('alarm-dirty').hidden = !dirty;
    $('alarm-enable').hidden = state.enabled;
    $('alarm-save').hidden = !dirty;
    $('alarm-tools').hidden = !state.enabled;
    for (const id of ['alarm-enable', 'alarm-save', 'alarm-disable', 'alarm-test']) $(id).disabled = state.alarmBusy || !state.alarmReady;
    alarmPanel.setAttribute('aria-busy', String(state.alarmBusy));
    $('alarm-enable').textContent = state.alarmBusy && !state.enabled ? '알림을 연결하고 있어요…' : '빈방 알림 켜기';
    $('alarm-save').textContent = state.alarmBusy && dirty ? '조건을 저장하고 있어요…' : '변경한 조건 저장';
  }
  async function loadStatus(ctx) {
    try {
      const result = await api('/status', {}, ctx);
      if (!current(ctx)) return;
      state.settings = result;
      state.enabled = result.subscription?.enabled === true;
      state.saved = state.enabled ? filtersOf(result.subscription.filters) : null;
      if (state.saved && !readStorage(preferenceKey()) && !target.date) state.filters = { ...state.saved };
      if (result.lastError) alarmFeedback(result.lastError, true);
    } catch (error) {
      if (current(ctx)) alarmFeedback('알림 상태를 확인하지 못했어요. 알림 켜기를 누르면 다시 연결해요.', true);
    } finally {
      if (current(ctx)) { state.alarmReady = true; syncControls(); renderAlarm(); }
    }
  }
  function resultState(kind, title, message) {
    const box = node('div', `result-state ${kind}`);
    if (kind === 'loading') box.append(node('span', 'loading-dot'));
    else {
      const symbol = node('span', 'gate-symbol', kind === 'error' ? '↻' : '☆');
      symbol.setAttribute('aria-hidden', 'true'); box.append(symbol);
    }
    box.append(node('h3', '', title), node('p', '', message));
    if (kind === 'error') {
      const retry = node('button', 'state-retry', '다시 확인하기'); retry.type = 'button';
      retry.addEventListener('click', () => void refresh()); box.append(retry);
    }
    $('results').replaceChildren(box);
  }
  function safeBookingUrl(match) {
    try {
      const url = new URL(match.bookingUrl);
      if (url.origin !== 'https://booking.naver.com' || url.username || url.password || url.hash
        || url.pathname !== `/booking/3/bizes/1627625/items/${match.roomId}`) return null;
      for (const key of ['startDate', 'endDate', 'startDateTime', 'endDateTime', 'guests']) if (url.searchParams.getAll(key).length > 1) return null;
      const start = url.searchParams.get('startDateTime') || url.searchParams.get('startDate');
      const end = url.searchParams.get('endDateTime') || url.searchParams.get('endDate');
      if (start?.slice(0, 10) !== match.date || end?.slice(0, 10) !== match.endDate) return null;
      // Open Naver's business-level booking page instead of a potentially closed item deep link.
      // The guest selects the room and date again on Naver.
      return `https://booking.naver.com/booking/3/bizes/1627625`;
    } catch { return null; }
  }
  function validMatch(match) {
    return match && validDate(match.date) && validDate(match.endDate) && /^[1-9]\d{0,19}$/.test(String(match.roomId))
      && typeof match.roomName === 'string' && match.roomName.length > 0 && match.roomName.length <= 120
      && Date.parse(match.endDate + 'T00:00:00Z') - Date.parse(match.date + 'T00:00:00Z') === 86400000;
  }
  function roomCard(match) {
    const isTarget = target.date === match.date && (!target.room || target.room === String(match.roomId));
    const card = node('article', 'room-card' + (isTarget ? ' target-room' : ''));
    card.dataset.room = String(match.roomId); card.dataset.date = match.date;
    const main = node('div', 'room-card-main');
    const details = node('div', 'room-details'), topline = node('div', 'room-topline');
    topline.append(node('h4', 'room-name', match.roomName));
    if (isTarget) topline.append(node('span', 'room-tag', '알림 받은 방'));
    details.append(topline);
    const capacity = Number.isInteger(match.capacity) && match.capacity > 0 ? `최대 ${match.capacity}인` : '정원은 예약처에서 확인';
    const standard = Number.isInteger(match.standard) && match.standard > 0 ? `기준 ${match.standard}인 · ` : '';
    details.append(node('p', 'room-capacity', standard + capacity));
    details.append(node('p', 'room-stay', `${shortDate(match.date)} 입실 → ${shortDate(match.endDate)} 퇴실`));
    const price = node('div', 'room-price', Number.isFinite(match.price) && match.price >= 0 ? `${match.price.toLocaleString('ko-KR')}원` : '요금 확인');
    price.append(node('small', '', '1박 · 추가요금 별도'));
    main.append(details, price);
    const bottom = node('div', 'room-card-bottom');
    bottom.append(node('p', '', '예약 페이지 작동 여부 미확인 · 실제 예약 가능 여부를 확인해 주세요'));
    const href = safeBookingUrl(match);
    if (href) {
      const link = node('a', 'booking-link', '네이버에서 예약 상태 확인 ↗');
      link.href = 'https://search.naver.com/search.naver?query=%ED%95%9C%EC%9A%B0%EC%82%B0%EB%B3%84%EC%B2%9C%EC%A7%80'; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `${dateLabel(match.date)} ${match.roomName} 네이버에서 예약 상태 확인`);
      bottom.append(link);
    } else bottom.append(node('span', 'booking-unavailable', '예약 주소를 확인하지 못했어요'));
    card.append(main, bottom);
    return card;
  }
  function renderMatches() {
    const data = state.data;
    if (!data) return;
    // Temporarily suppress room 205 until its Naver booking page is independently verified.
    const matches = data.matches.filter(match => !/^205호(?:\s|$)/.test(match.roomName.trim()));
    $('match-count').hidden = false;
    $('match-count').textContent = `${matches.length}건 · 예약 미확인`;
    $('results-caption').textContent = `${filterLabel(state.filters)} · ${shortDate(data.window?.from)}~${shortDate(data.window?.to)} 입실${timeLabel(data.checkedAt) ? ` · ${timeLabel(data.checkedAt)} 확인` : ''}`;
    const partial = data.partial || Number(data.unknownDates) > 0;
    $('partial-note').hidden = !partial;
    $('partial-note').textContent = '예약처에서 일부 날짜·객실을 확인하지 못했어요. 예약처의 잔여 수량만 조회한 결과이며 실제 예약 페이지는 검증되지 않았어요. 미확인 날짜는 매진으로 판단하지 않아요.';
    $('show-more').hidden = matches.length <= state.limit;
    const targetNote = $('notification-target');
    targetNote.replaceChildren(); targetNote.hidden = !target.date;
    if (target.date) {
      const found = matches.some(match => match.date === target.date && (!target.room || String(match.roomId) === target.room));
      targetNote.append(node('span', '', found ? `${dateLabel(target.date)} 알림 받은 빈방을 위쪽에 표시했어요.` : `${dateLabel(target.date)} 알림 받은 방이 현재 목록에서 확인되지 않아요.`));
      if (!found && (state.filters.dateMode !== 'all' || state.filters.guests !== 'all')) {
        const all = node('button', '', '전체 조건에서 다시 확인'); all.type = 'button';
        all.addEventListener('click', () => changeFilters({ ...DEFAULTS })); targetNote.append(all);
      }
    }
    if (!matches.length) {
      resultState('empty', partial ? '확인된 빈방이 아직 없어요' : '지금은 맞는 빈방이 없어요',
        '알림을 켜두면 선택한 조건에 맞는 새 빈방이 생겼을 때 알려드려요.'); return;
    }
    const ordered = [...matches].sort((a, b) => {
      const at = a.date === target.date && (!target.room || String(a.roomId) === target.room);
      const bt = b.date === target.date && (!target.room || String(b.roomId) === target.room);
      return Number(b.date === target.date) - Number(a.date === target.date) || a.date.localeCompare(b.date)
        || Number(bt) - Number(at) || a.roomName.localeCompare(b.roomName, 'ko', { numeric: true });
    });
    const fragment = document.createDocumentFragment();
    let date = '', roomList;
    for (const match of ordered.slice(0, state.limit)) {
      if (match.date !== date) {
        date = match.date;
        const group = node('section', 'date-group');
        const heading = node('h3', 'date-heading', dateLabel(date)); heading.append(node('small', '', '입실'));
        roomList = node('div', 'room-cards'); group.append(heading, roomList); fragment.append(group);
      }
      roomList.append(roomCard(match));
    }
    $('results').replaceChildren(fragment);
  }
  function waitForRetry(milliseconds, signal) {
    return new Promise((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(new ClientError('조회가 취소됐어요.', 'cancelled')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, milliseconds);
      if (signal.aborted) cancel(); else signal.addEventListener('abort', cancel, { once: true });
    });
  }
  async function refresh() {
    if (!state.member) return;
    const ctx = context(), number = ++state.request;
    state.abort?.abort(); state.abort = new AbortController();
    const signal = state.abort.signal;
    state.data = null; state.limit = 24;
    $('results').setAttribute('aria-busy', 'true');
    $('refresh').disabled = true;
    $('show-more').hidden = true;
    $('match-count').hidden = true;
    $('partial-note').hidden = true;
    $('notification-target').hidden = true;
    $('results-caption').textContent = `${filterLabel(state.filters)} · 앞으로 60일의 빈방을 확인해요.`;
    resultState('loading', '빈방을 확인하고 있어요', '예약처의 현재 객실 정보를 가져옵니다.');
    const params = new URLSearchParams({ dateMode: state.filters.dateMode, guests: String(state.filters.guests) });
    try {
      let data;
      try { data = await api(`/availability?${params}`, { signal }, ctx); }
      catch (error) {
        if (error.code !== 'inventory_loading' || !current(ctx) || number !== state.request) throw error;
        await waitForRetry(Math.max(1000, Math.min(10000, (error.retryAfter || 5) * 1000)), signal);
        data = await api(`/availability?${params}`, { signal }, ctx);
      }
      if (!current(ctx) || number !== state.request) return;
      if (!Array.isArray(data?.matches) || data.matches.some(match => !validMatch(match)))
        throw new ClientError('객실 정보를 확인하지 못했어요. 잠시 후 새로 확인해 주세요.');
      // Show the matching inventory confirmed by the reservation provider.
      state.data = data; renderMatches();
    } catch (error) {
      if (!current(ctx) || number !== state.request || error.code === 'cancelled') return;
      $('results-caption').textContent = `${filterLabel(state.filters)} · 조회를 완료하지 못했어요.`;
      resultState('error', '빈방을 확인하지 못했어요', error.message);
    } finally {
      if (current(ctx) && number === state.request) {
        $('results').setAttribute('aria-busy', 'false'); $('refresh').disabled = false;
      }
    }
  }
  function changeFilters(value) {
    if (!state.member || state.alarmBusy) { syncControls(); return; }
    state.filters = filtersOf(value);
    writeStorage(preferenceKey(), JSON.stringify(state.filters));
    syncControls(); renderAlarm(); alarmFeedback(); void refresh();
  }
  function needsHomeScreen() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return ios && !window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone;
  }
  function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext; }
  function showDeviceHelp() {
    $('device-help').textContent = needsHomeScreen() ? '아이폰은 Safari → 공유 → 홈 화면에 추가 후, 오쭈다의 테스트 메뉴에서 다시 열어 주세요.'
      : !pushSupported() ? '휴대폰 알림은 알림을 지원하는 Chrome·Safari 브라우저에서 켤 수 있어요.'
        : '알림을 받을 휴대폰에서 한 번만 켜 주세요. 알림 소리는 휴대폰 설정을 따라요.';
  }
  async function pushRegistration() {
    const registration = await navigator.serviceWorker.register('/byeolcheonji/sw.js?v=20261104-byeolcheonji1', { scope: '/byeolcheonji/', updateViaCache: 'none' });
    if (registration.active) return registration;
    await new Promise((resolve, reject) => {
      const worker = registration.installing || registration.waiting;
      if (!worker) { reject(new ClientError('알림을 준비하지 못했어요. 다시 눌러 주세요.')); return; }
      const cleanup = () => { clearTimeout(timer); worker.removeEventListener('statechange', changed); };
      const changed = () => {
        if (worker.state === 'activated') { cleanup(); resolve(); }
        else if (worker.state === 'redundant') { cleanup(); reject(new ClientError('알림 준비가 중단됐어요. 다시 눌러 주세요.')); }
      };
      const timer = setTimeout(() => { cleanup(); reject(new ClientError('알림 준비가 늦어지고 있어요. 다시 눌러 주세요.')); }, 15000);
      worker.addEventListener('statechange', changed); changed();
    });
    return registration;
  }
  function publicKeyBytes(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(value)) throw new ClientError('알림 서버를 준비하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
    return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
  }
  function sameKey(value, expected) {
    if (!value) return false;
    const bytes = new Uint8Array(value);
    return bytes.length === expected.length && bytes.every((byte, index) => byte === expected[index]);
  }
  function createToken() {
    const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    if (!writeStorage(deviceKey(), token)) throw new ClientError('이 브라우저에 알림 설정을 저장할 수 없어요. 일반 브라우저 창에서 다시 열어 주세요.');
    return token;
  }
  async function subscribe(registration, key, ctx, replace = false) {
    let existing = await registration.pushManager.getSubscription();
    if (!current(ctx)) throw new ClientError('회원 정보가 바뀌었어요.', 'identity_changed');
    const owner = readStorage('ojjuda-byeolcheonji-push-owner');
    if (existing && (replace || !deviceToken() || (owner && owner !== state.member) || !sameKey(existing.options?.applicationServerKey, key))) {
      if (!await existing.unsubscribe()) throw new ClientError('이전 기기 알림을 정리하지 못했어요. 다시 눌러 주세요.');
      existing = null;
    }
    if (!current(ctx)) throw new ClientError('회원 정보가 바뀌었어요.', 'identity_changed');
    if (replace || !deviceToken()) createToken();
    const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    return await api('/subscription', { method: 'POST', body: { subscription: subscription.toJSON(), filters: { ...state.filters } } }, ctx);
  }
  async function withAlarmAction(action) {
    if (!state.member || state.alarmBusy) return;
    const ctx = context();
    state.alarmBusy = true; alarmFeedback(); renderAlarm();
    for (const input of form.querySelectorAll('input')) input.disabled = true;
    try { await action(ctx); }
    catch (error) { if (current(ctx)) alarmFeedback(error.message || '알림 설정을 바꾸지 못했어요. 다시 눌러 주세요.', true); }
    finally {
      if (current(ctx)) {
        state.alarmBusy = false; renderAlarm();
        for (const input of form.querySelectorAll('input')) input.disabled = false;
      }
    }
  }
  function enableAlarm() {
    if (!state.member || state.alarmBusy || !state.alarmReady) return;
    if (needsHomeScreen()) { alarmFeedback('Safari에서 홈 화면에 추가한 오쭈다로 열어 주세요.', true); return; }
    if (!pushSupported()) { alarmFeedback('알림을 지원하는 Chrome·Safari 브라우저에서 열어 주세요.', true); return; }
    if (Notification.permission === 'denied') { alarmFeedback('브라우저의 사이트 설정에서 알림을 허용한 뒤 다시 눌러 주세요.', true); return; }
    // Keep the browser permission request inside this explicit button gesture.
    let permission;
    try { permission = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission(); }
    catch { alarmFeedback('브라우저에서 알림 권한을 요청하지 못했어요.', true); return; }
    void withAlarmAction(async ctx => {
      if (await permission !== 'granted') throw new ClientError('알림을 허용하면 화면을 닫아도 빈방 소식을 받을 수 있어요.');
      if (!current(ctx)) return;
      const settings = await api('/status', {}, ctx); state.settings = settings;
      if (!current(ctx)) return;
      const key = publicKeyBytes(settings.vapidPublicKey);
      const registration = await pushRegistration();
      if (!current(ctx)) return;
      let result;
      try { result = await subscribe(registration, key, ctx); }
      catch (error) {
        if (error.code !== 'device_conflict' || !current(ctx)) throw error;
        result = await subscribe(registration, key, ctx, true);
      }
      if (!current(ctx)) return;
      state.enabled = result.enabled === true; state.saved = filtersOf(result.filters);
      if (!state.enabled) throw new ClientError('알림 등록을 확인하지 못했어요. 다시 눌러 주세요.');
      writeStorage('ojjuda-byeolcheonji-push-owner', state.member);
      renderAlarm();
      try {
        const test = await api('/test', { method: 'POST' }, ctx);
        if (current(ctx)) alarmFeedback(test.accepted === true
          ? '알림을 켰어요. 테스트 알림이 휴대폰에 도착했는지 확인해 주세요.'
          : '알림을 켰어요. 테스트 알림 전송을 요청했어요.');
      } catch (error) {
        if (current(ctx)) alarmFeedback(error.code === 'device_expired' ? error.message
          : '알림은 켜졌어요. 테스트 알림은 아래 버튼으로 다시 확인해 주세요.', true);
      }
    });
  }
  function saveAlarm() {
    void withAlarmAction(async ctx => {
      const registration = await pushRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription || !deviceToken()) throw new ClientError('이 기기의 알림 연결이 없어요. 알림을 껐다가 다시 켜 주세요.');
      const result = await api('/subscription', { method: 'POST', body: { subscription: subscription.toJSON(), filters: { ...state.filters } } }, ctx);
      if (!current(ctx)) return;
      state.enabled = result.enabled === true; state.saved = filtersOf(result.filters);
      alarmFeedback('선택한 조건으로 빈방 알림을 바꿨어요.');
    });
  }
  function disableAlarm() {
    void withAlarmAction(async ctx => {
      await api('/subscription', { method: 'DELETE' }, ctx);
      if (!current(ctx)) return;
      state.enabled = false; state.saved = null;
      removeStorage(deviceKey());
      if (readStorage('ojjuda-byeolcheonji-push-owner') === state.member) removeStorage('ojjuda-byeolcheonji-push-owner');
      try {
        const registration = await navigator.serviceWorker.getRegistration('/byeolcheonji/');
        if (current(ctx) && registration?.scope === location.origin + '/byeolcheonji/') {
          const subscription = await registration.pushManager.getSubscription();
          if (current(ctx)) await subscription?.unsubscribe();
        }
      } catch { /* The server registration is already disabled. */ }
      if (current(ctx)) alarmFeedback('이 기기의 빈방 알림을 껐어요.');
    });
  }
  function testAlarm() {
    void withAlarmAction(async ctx => {
      const result = await api('/test', { method: 'POST' }, ctx);
      if (current(ctx)) alarmFeedback(result.accepted === true ? '테스트 알림을 보냈어요. 휴대폰 알림을 확인해 주세요.' : '테스트 알림 전송을 요청했어요.');
    });
  }
  async function verifyMember() {
    showGate('loading');
    const version = state.identity;
    if (!client) { showGate('error', '회원 연결을 준비하지 못했어요. 인터넷 연결을 확인한 뒤 다시 눌러 주세요.'); return; }
    try {
      const session = await within(client.auth.getSession());
      if (version !== state.identity) return;
      if (session.error) throw new ClientError('로그인 상태를 확인하지 못했어요. 다시 눌러 주세요.');
      if (!isMember(session.data?.session?.user)) { showGate('login'); return; }
      const verified = await within(client.auth.getUser());
      if (version !== state.identity) return;
      if (verified.error) {
        if (verified.error.status === 401 || verified.error.status === 403) { showGate('login'); return; }
        throw new ClientError('회원 정보를 확인하지 못했어요. 다시 눌러 주세요.');
      }
      if (!isMember(verified.data?.user) || verified.data.user.id !== session.data.session.user.id) { showGate('login'); return; }
      state.member = verified.data.user.id;
      let preferences = null;
      try { preferences = JSON.parse(readStorage(preferenceKey()) || 'null'); } catch { /* Use safe defaults. */ }
      state.filters = filtersOf(preferences || DEFAULTS);
      if (target.date) state.filters.dateMode = 'all';
      if (target.guests !== null) state.filters.guests = target.guests === 'all' ? 'all' : Number(target.guests);
      syncControls(); showDeviceHelp(); renderAlarm();
      for (const input of form.querySelectorAll('input')) input.disabled = false;
      gate.hidden = true; content.hidden = false;
      const ctx = context();
      await loadStatus(ctx);
      if (current(ctx)) void refresh();
    } catch (error) {
      if (version === state.identity) showGate('error', error.message || '회원 정보를 확인하지 못했어요. 다시 눌러 주세요.');
    }
  }
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('change', () => {
    const values = new FormData(form);
    changeFilters({ dateMode: values.get('dateMode'), guests: values.get('guests') });
  });
  $('refresh').addEventListener('click', () => void refresh());
  $('show-more').addEventListener('click', () => { state.limit += 24; renderMatches(); });
  $('alarm-enable').addEventListener('click', enableAlarm);
  $('alarm-save').addEventListener('click', saveAlarm);
  $('alarm-disable').addEventListener('click', disableAlarm);
  $('alarm-test').addEventListener('click', testAlarm);
  $('gate-retry').addEventListener('click', () => void verifyMember());
  client?.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') return;
    if (!isMember(session?.user)) { clearTimeout(authTimer); showGate('login'); return; }
    if (state.member && session.user.id === state.member) return;
    showGate('loading');
    clearTimeout(authTimer);
    authTimer = setTimeout(() => void verifyMember(), 0);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.member) {
      // Recheck identity after returning from the reservation site or a long sleep.
      const ctx = context();
      void within(client.auth.getUser()).then(({ data, error }) => {
        if (current(ctx) && (!isMember(data?.user) || data.user.id !== ctx.member)
          && (!error || error.status === 401 || error.status === 403)) showGate('login');
      }).catch(() => {});
    }
  });
  window.addEventListener('pagehide', () => state.abort?.abort());
  window.addEventListener('pageshow', event => { if (event.persisted) void verifyMember(); });
  void verifyMember();
})();
