/* Verify the shared Ojjuda account before loading the reservation application. */
(() => {
  'use strict';
  const panel = document.getElementById('star-member-access');
  const root = document.getElementById('root');
  if (!panel || !root) return;
  const title = document.getElementById('star-access-title');
  const message = document.getElementById('star-access-message');
  const actions = document.getElementById('star-access-actions');
  const retry = document.getElementById('star-access-retry');
  const release = '20261104-star-reliability1';
  const helper = 'https://hanusan-booking-helper.mj830417686850.chatgpt.site';
  const params = new URLSearchParams(location.search);
  // The account page validates the booking values again before returning here.
  for (const link of panel.querySelectorAll('[data-star-auth]')) {
    const url = new URL('/?auth=' + link.dataset.starAuth + '&next=star', location.origin);
    for (const key of ['startDate', 'endDate', 'guests', 'room']) {
      if (params.getAll(key).length === 1) url.searchParams.set(key, params.get(key));
    }
    link.href = url.pathname + url.search;
  }

  let client = null, verifiedOwner = null, observedOwner, epoch = 0;
  let pending = null, rerun = false, timer = null, appRequested = false, appInvalidated = false;
  const memberId = user => user?.id && user.is_anonymous !== true ? user.id : null;
  function closeApp() {
    verifiedOwner = null;
    if (appRequested) appInvalidated = true;
    window.OjjudaStarApp?.destroy();
    root.hidden = true;
    root.replaceChildren();
    const guide = document.getElementById('star-browser-guide');
    if (guide?.open) guide.close();
    document.body.classList.remove('star-browser-guide-open');
  }
  function show(mode, text) {
    panel.hidden = false;
    panel.setAttribute('aria-busy', String(mode === 'loading'));
    title.textContent = mode === 'loading' ? '회원 정보를 확인하고 있어요'
      : mode === 'error' ? '연결을 다시 확인해 주세요' : '회원만 이용할 수 있어요';
    message.textContent = text;
    actions.hidden = mode === 'loading';
    retry.hidden = mode !== 'error';
  }
  function requireLogin() {
    epoch++;
    closeApp();
    show('login', '오쭈다 아지트에 로그인하면 별천지 예약 도우미를 이용할 수 있어요.');
  }
  function connectionError() {
    epoch++;
    closeApp();
    show('error', '회원 정보를 확인하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
  }
  function withTimeout(operation) {
    let timeout;
    return Promise.race([operation, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('member_check_timeout')), 12000);
    })]).finally(() => clearTimeout(timeout));
  }
  function queueCheck() {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void verifyMember(); }, 0);
  }
  async function getAccessToken() {
    const owner = verifiedOwner, version = epoch;
    if (!owner || !client) throw new Error('member_login_required');
    const { data, error } = await withTimeout(client.auth.getSession());
    if (version !== epoch || owner !== verifiedOwner) throw new Error('member_login_required');
    if (error) throw new Error('member_connection_failed');
    if (memberId(data?.session?.user) !== owner || !data.session.access_token) {
      requireLogin();
      throw new Error('member_login_required');
    }
    return data.session.access_token;
  }
  function loadApp() {
    if (appRequested) {
      // A new account gets a clean React tree and no previous account's timers.
      if (appInvalidated) location.reload();
      return;
    }
    appRequested = true;
    const script = document.createElement('script');
    script.src = helper + '/star-client/star-app.js?v=' + release;
    script.onerror = () => {
      if (!verifiedOwner) return;
      closeApp();
      show('error', '예약 도우미를 불러오지 못했어요. 다시 시도해 주세요.');
    };
    document.head.append(script);
    document.dispatchEvent(new Event('ojjuda:star:member-ready'));
  }
  async function verifyMember() {
    if (!client) { connectionError(); return; }
    if (pending) { rerun = true; return pending; }
    const version = epoch;
    if (!verifiedOwner) show('loading', '로그인한 회원인지 확인한 뒤 예약 도우미를 열어 드릴게요.');
    pending = (async () => {
      try {
        const { data: sessionData, error: sessionError } = await withTimeout(client.auth.getSession());
        if (version !== epoch) return;
        if (sessionError) { connectionError(); return; }
        const session = sessionData?.session, owner = memberId(session?.user);
        if (!owner || !session.access_token) { requireLogin(); return; }
        const { data, error } = await withTimeout(client.auth.getUser());
        if (version !== epoch) return;
        if (error) {
          if ([400, 401, 403, 404].includes(error.status) || error.name === 'AuthSessionMissingError') requireLogin();
          else connectionError();
          return;
        }
        if (memberId(data?.user) !== owner) { requireLogin(); return; }
        verifiedOwner = owner;
        panel.hidden = true;
        panel.setAttribute('aria-busy', 'false');
        root.hidden = false;
        loadApp();
      } catch {
        if (version === epoch) connectionError();
      }
    })().finally(() => {
      pending = null;
      if (rerun) { rerun = false; queueCheck(); }
    });
    return pending;
  }
  retry.addEventListener('click', () => {
    if (!client || appRequested) location.reload();
    else void verifyMember();
  });
  const config = window.OJJUDA_CONFIG;
  try {
    if (!config?.supabaseUrl || !config?.supabaseKey || !window.supabase?.createClient) throw new Error('auth_unavailable');
    client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
    window.OjjudaStarAuth = Object.freeze({ getAccessToken, requireLogin, isMember: () => Boolean(verifiedOwner) });
    client.auth.onAuthStateChange((event, session) => {
      const owner = memberId(session?.user);
      if (event === 'SIGNED_OUT' || owner !== observedOwner) {
        observedOwner = owner;
        epoch++;
        if (verifiedOwner && verifiedOwner !== owner) closeApp();
        if (!owner) requireLogin();
        else queueCheck();
      }
    });
    window.addEventListener('pageshow', event => {
      if (!event.persisted) return;
      root.hidden = true;
      queueCheck();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') queueCheck();
    });
    void verifyMember();
  } catch { connectionError(); }
})();
