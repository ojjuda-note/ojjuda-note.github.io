/* Standalone Photo Ttang: the same signed-in, 19+ member gate as Matgo. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const access = window.OjjudaPhotoTtangAccess;
  const config = window.OJJUDA_CONFIG;
  const client = config?.supabaseUrl && config?.supabaseKey && window.supabase?.createClient
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null;
  let memberId = null, displayUser = null, frame = null, checking = true, authEpoch = 0, loadTimer = null;
  const bridge = window.OjjudaPhotoTtangBridge = { client: null, nick: '' };
  access?.configure(client);

  function renderEntry(code = '') {
    $('hero-wrap').hidden = false;
    $('game-shell').hidden = true;
    document.body.classList.remove('playing');
    $('exit-game').hidden = true;
    $('header-login').hidden = Boolean(memberId) || ['underage', 'identity'].includes(code);
    $('start-game').hidden = !memberId;
    $('start-game').disabled = checking;
    $('continue-login').hidden = checking || Boolean(memberId) || code !== 'login';
    $('complete-identity').hidden = code !== 'identity';
    $('retry-age').hidden = checking || !['unavailable', 'underage', 'identity'].includes(code);
    $('signup-link').hidden = checking || code !== 'login';
    $('page-status').textContent = checking ? '나이 확인 중…' : ({
      underage: '만 19세 생일부터 이용할 수 있어요.',
      identity: '생년월일을 등록해 주세요.',
      unavailable: '나이를 확인하지 못했어요. 다시 시도해 주세요.'
    }[code] || '');
  }
  function stopFrame() { clearTimeout(loadTimer); frame?.remove(); frame = null; }
  function revoke(code = 'login') {
    memberId = null; bridge.client = null; bridge.nick = '';
    stopFrame(); checking = false; renderEntry(code);
  }
  function closeGame() { stopFrame(); renderEntry(memberId ? '' : 'login'); }
  function openGame() {
    if (frame || !memberId || !access?.allowed()) return;
    const candidate = document.createElement('iframe');
    candidate.title = '포토땅따먹기'; candidate.allow = 'vibrate'; frame = candidate;
    const failed = () => {
      if (candidate !== frame) return;
      closeGame(); $('page-status').textContent = '게임을 불러오지 못했어요. 다시 눌러 주세요.';
    };
    candidate.addEventListener('load', () => {
      if (candidate !== frame) return;
      if (!memberId || !access?.allowed()) return revoke();
      if (!candidate.contentWindow?.OjjudaPhotoTtang) return failed();
      clearTimeout(loadTimer);
      $('hero-wrap').hidden = true; $('game-shell').hidden = false; $('exit-game').hidden = false;
      document.body.classList.add('playing'); candidate.focus();
    });
    candidate.addEventListener('error', failed);
    candidate.src = '/games/photo-ttang.html?v=20261006-age19';
    $('game-shell').append(candidate);
    loadTimer = setTimeout(failed, 20000);
  }
  async function verifyIdentity(autoOpen = true) {
    const epoch = ++authEpoch;
    checking = true;
    if (!frame) renderEntry();
    try {
      if (!access) throw Object.assign(new Error(), { code: 'unavailable' });
      const result = await access.refresh();
      if (epoch !== authEpoch) return;
      if (memberId && memberId !== result.userId) stopFrame();
      memberId = result.userId; bridge.client = client; checking = false;
      bridge.nick = displayUser?.id === memberId ? String(displayUser.user_metadata?.nickname || '') : '';
      if (!frame) { renderEntry(); if (autoOpen) openGame(); }
    } catch (error) { if (epoch === authEpoch) revoke(error?.code || 'unavailable'); }
  }
  access?.subscribe(error => revoke(error.code));
  $('start-game').addEventListener('click', () => { void verifyIdentity(); });
  $('retry-age').addEventListener('click', () => { void verifyIdentity(); });
  $('exit-game').addEventListener('click', closeGame);
  addEventListener('message', event => {
    if (frame && event.origin === location.origin && event.source === frame.contentWindow && event.data?.type === 'ojjuda:photottang:close') closeGame();
  });
  addEventListener('pageshow', event => { if (event.persisted) void verifyIdentity(false); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void verifyIdentity(false); });
  setInterval(() => { if (memberId) void verifyIdentity(false); }, 30000);
  client?.auth.onAuthStateChange((event, session) => {
    displayUser = session?.user || null;
    if (event === 'INITIAL_SESSION') return;
    authEpoch++;
    if (event === 'SIGNED_OUT') revoke();
    else if (['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
      setTimeout(() => { void verifyIdentity(); }, 0);
    }
  });
  void verifyIdentity();
})();
