/* One guest round, then the existing Ojjuda account flow. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const trialKey = 'ojjuda-photo-ttang-demo-v1';
  const gameUrl = '/games/photo-ttang.html?v=20261006-photo10';
  const config = window.OJJUDA_CONFIG;
  const client = config?.supabaseUrl && config?.supabaseKey && window.supabase?.createClient
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null;
  let member = null, frame = null, loading = false, reserved = false, started = false;
  let authEpoch = 0, loadTimer = null;
  window.OjjudaPhotoTtangBridge = { client: null, nick: '' };

  function usedTrial() {
    try { return localStorage.getItem(trialKey) === '1'; }
    catch { return true; }
  }
  async function reserveTrial() {
    const reserve = () => {
      if (usedTrial()) return false;
      try { localStorage.setItem(trialKey, '1'); return localStorage.getItem(trialKey) === '1'; }
      catch { return false; }
    };
    return navigator.locks?.request ? navigator.locks.request(trialKey, reserve) : reserve();
  }
  function renderEntry() {
    const used = !member && usedTrial();
    $('hero-wrap').hidden = false;
    $('game-shell').hidden = true;
    document.body.classList.remove('playing');
    $('exit-game').hidden = true;
    $('header-login').hidden = Boolean(member);
    $('trial-badge').textContent = member ? '솔로 게임' : used ? '체험 완료' : '로그인 없이 한 판';
    $('trial-title').textContent = used ? '체험이 끝났어요' : '포토땅따먹기';
    $('trial-intro').textContent = used ? '로그인하고 다음 판을 즐겨요.' : '90%를 채우고 사진을 열어보세요.';
    $('start-demo').hidden = used;
    $('start-demo').disabled = loading;
    $('start-demo').textContent = member ? '게임 시작하기' : '한 판 체험하기';
    $('continue-login').hidden = !used;
    $('signup-link').hidden = Boolean(member);
    $('trial-note').hidden = Boolean(member) || used;
    $('page-status').textContent = loading ? '불러오는 중…' : '';
  }
  function stopFrame() {
    clearTimeout(loadTimer);
    frame?.remove(); frame = null;
    reserved = started = loading = false;
  }
  function closeGame() { stopFrame(); renderEntry(); }
  function loadFailure(candidate) {
    if (candidate !== frame) return;
    stopFrame(); renderEntry();
    $('page-status').textContent = '게임을 불러오지 못했어요. 다시 눌러 주세요.';
  }
  function showGame(candidate) {
    if (candidate !== frame) return;
    clearTimeout(loadTimer); loading = false;
    $('hero-wrap').hidden = true;
    $('game-shell').hidden = false;
    $('exit-game').hidden = false;
    document.body.classList.add('playing');
    candidate.focus();
  }
  function openGame(demo) {
    if (loading || frame) return;
    loading = true;
    renderEntry();
    const candidate = document.createElement('iframe');
    candidate.title = demo ? '포토땅따먹기 한 판 체험' : '포토땅따먹기';
    candidate.dataset.demo = demo ? '1' : '0';
    candidate.allow = 'vibrate';
    frame = candidate;
    candidate.addEventListener('load', async () => {
      if (frame !== candidate) return;
      const api = candidate.contentWindow?.OjjudaPhotoTtang;
      if (!api) return loadFailure(candidate);
      if (demo) {
        const allowed = await reserveTrial();
        if (frame !== candidate) return;
        if (!allowed) { stopFrame(); renderEntry(); return; }
        reserved = true;
        showGame(candidate);
        if (!api.demo()) { stopFrame(); renderEntry(); return; }
      } else if (!member) { closeGame(); return; }
      showGame(candidate);
    });
    candidate.addEventListener('error', () => loadFailure(candidate));
    candidate.src = gameUrl + (demo ? '&demo=1' : '');
    $('game-shell').append(candidate);
    loadTimer = setTimeout(() => loadFailure(candidate), 20000);
  }
  window.OjjudaPhotoTtangDemo = {
    beginRound() {
      if (!frame || frame.dataset.demo !== '1' || !reserved || started) return false;
      started = true; reserved = false; return true;
    }
  };

  async function verifyIdentity() {
    const epoch = ++authEpoch;
    let user = null;
    try {
      const result = await client?.auth.getUser();
      if (!result?.error && result?.data?.user?.id && !result.data.user.is_anonymous) user = result.data.user;
    } catch { /* A public demo remains available when account lookup fails. */ }
    if (epoch !== authEpoch) return;
    const oldId = member?.id;
    member = user;
    window.OjjudaPhotoTtangBridge.client = member ? client : null;
    window.OjjudaPhotoTtangBridge.nick = String(member?.user_metadata?.nickname || '');
    if (member) {
      $('header-login').hidden = true;
      if (frame && frame.dataset.demo === '0' && oldId === member.id) return;
      stopFrame(); openGame(false);
    } else if (oldId) {
      closeGame();
    } else if (!frame) {
      renderEntry();
    }
  }
  $('start-demo').addEventListener('click', () => openGame(!member));
  $('exit-game').addEventListener('click', closeGame);
  addEventListener('message', event => {
    if (!frame || event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'ojjuda:photottang:close') closeGame();
  });
  addEventListener('storage', event => {
    if (event.key === trialKey && !frame && !member) renderEntry();
  });
  addEventListener('pageshow', event => { if (event.persisted) void verifyIdentity(); });
  client?.auth.onAuthStateChange(event => {
    if (event === 'INITIAL_SESSION') return;
    if (event === 'SIGNED_OUT') {
      authEpoch++; member = null;
      window.OjjudaPhotoTtangBridge.client = null;
      window.OjjudaPhotoTtangBridge.nick = '';
      closeGame();
    } else if (['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
      authEpoch++;
      setTimeout(() => { void verifyIdentity(); }, 0);
    }
  });
  void verifyIdentity();
})();
