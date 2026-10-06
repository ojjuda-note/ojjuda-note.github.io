/* One unrestricted guest round; full play uses the same 19+ member gate as Matgo. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const trialKey = 'ojjuda-photo-ttang-demo-v1';
  const gameUrl = '/games/photo-ttang.html?v=20261007-flow1';
  const access = window.OjjudaPhotoTtangAccess;
  const config = window.OJJUDA_CONFIG;
  const client = config?.supabaseUrl && config?.supabaseKey && window.supabase?.createClient
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null;
  let member = null, signedUser = null, ageCode = '', frame = null, loading = false, reserved = false, started = false;
  let authEpoch = 0, loadTimer = null, rankDispose = null;
  window.OjjudaPhotoTtangBridge = { client: null, nick: '' };
  access?.configure(client);

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
    $('header-login').hidden = Boolean(signedUser);
    $('trial-badge').textContent = member ? '솔로 게임' : used ? '체험 완료' : '로그인 없이 한 판';
    $('trial-title').textContent = used ? '체험이 끝났어요' : '포토땅따먹기';
    $('trial-intro').textContent = used ? '무료 체험은 1판이에요.' : '90%를 채우고 사진을 열어보세요.';
    $('start-demo').hidden = used;
    $('start-demo').disabled = loading;
    $('start-demo').textContent = member ? '게임 시작하기' : '한 판 체험하기';
    $('continue-login').hidden = !used || Boolean(signedUser && ageCode);
    $('complete-identity').hidden = !(used && signedUser && ageCode === 'identity');
    $('retry-age').hidden = !(used && signedUser && ageCode);
    $('signup-link').hidden = Boolean(signedUser);
    $('trial-note').hidden = Boolean(member);
    $('page-status').textContent = loading ? '불러오는 중…' : used && signedUser ? ({underage:'본게임은 만 19세 생일부터 이용할 수 있어요.',identity:'본게임을 하려면 생년월일을 등록해 주세요.',unavailable:'나이를 확인하지 못했어요. 다시 시도해 주세요.'}[ageCode] || '') : '';
  }
  function stopFrame() {
    clearTimeout(loadTimer);
    rankDispose?.(); rankDispose = null;
    frame?.remove(); $('photo-ranking-status')?.remove(); frame = null;
    reserved = started = loading = false;
  }
  function closeGame(force=false) { if(force!==true&&frame?.contentWindow?.OjjudaPhotoTtang?.canLeave?.()===false){$('page-status').textContent='구매 결과를 확인 중이에요.';return false;}stopFrame(); renderEntry(); }
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
    if (!demo && !access?.allowed()) { void verifyIdentity(); return; }
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
      } else if (!member || !access?.allowed()) { closeGame(true); return; }
      showGame(candidate);
    });
    candidate.addEventListener('error', () => loadFailure(candidate));
    candidate.src = gameUrl + (demo ? '&demo=1' : '');
    $('game-shell').append(candidate);
    if (!demo && member) {
      const owner = member.id, status = document.createElement('button');
      status.id = 'photo-ranking-status'; status.type = 'button'; status.disabled = true;
      status.textContent = '이번 달 완료 사진 수로 순위 집계';
      status.style.cssText = 'font:11px sans-serif;background:none;color:inherit;border:0;padding:0;min-width:0;flex:1';
      $('exit-game').before(status);
      rankDispose = window.OjjudaPhotoRanking?.bind({frame:candidate,client,owner,authorized:()=>member?.id===owner&&access.allowed(),status});
    }
    loadTimer = setTimeout(() => loadFailure(candidate), 20000);
  }
  window.OjjudaPhotoTtangDemo = {
    allowed() { return Boolean(frame?.dataset.demo === '1' && (reserved || started)); },
    beginRound() {
      if (!frame || frame.dataset.demo !== '1' || !reserved || started) return false;
      started = true; reserved = false; return true;
    }
  };

  async function verifyIdentity() {
    const epoch = ++authEpoch;
    let user = null, verified = null, code = '';
    try {
      const result = await client?.auth.getUser();
      if (!result?.error && result?.data?.user?.id && !result.data.user.is_anonymous) user = result.data.user;
    } catch { /* A public demo remains available when account lookup fails. */ }
    if (user) {
      try {
        if (!access) throw Object.assign(new Error(), {code:'unavailable'});
        const grant = await access.refresh();
        if (grant.userId === user.id) verified = user;
      } catch (error) { code = error?.code || 'unavailable'; }
    }
    if (epoch !== authEpoch) return;
    signedUser = user; ageCode = code;
    const oldId = member?.id;
    member = verified;
    window.OjjudaPhotoTtangBridge.client = member ? client : null;
    window.OjjudaPhotoTtangBridge.nick = String(member?.user_metadata?.nickname || '');
    if (member) {
      $('header-login').hidden = true;
      if (frame && frame.dataset.demo === '0' && oldId === member.id) return;
      stopFrame(); openGame(false);
    } else if (oldId) {
      closeGame(true);
    } else if (!frame) {
      renderEntry();
    }
  }
  access?.subscribe(error => {
    member = null; ageCode = error.code;
    window.OjjudaPhotoTtangBridge.client = null;
    window.OjjudaPhotoTtangBridge.nick = '';
    if (frame?.dataset.demo === '0') closeGame(true);
    else if (!frame) renderEntry();
  });
  $('retry-age').addEventListener('click', () => { void verifyIdentity(); });
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
  document.addEventListener('visibilitychange', () => { if (!document.hidden && member) void verifyIdentity(); });
  setInterval(() => { if (member) void verifyIdentity(); }, 30000);
  client?.auth.onAuthStateChange(event => {
    if (event === 'INITIAL_SESSION') return;
    if (event === 'SIGNED_OUT') {
      authEpoch++; member = signedUser = null; ageCode = '';
      window.OjjudaPhotoTtangBridge.client = null;
      window.OjjudaPhotoTtangBridge.nick = '';
      if (frame?.dataset.demo === '0') closeGame(true);
      else if (!frame) renderEntry();
    } else if (['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
      authEpoch++;
      setTimeout(() => { void verifyIdentity(); }, 0);
    }
  });
  renderEntry();
  void verifyIdentity();
})();
