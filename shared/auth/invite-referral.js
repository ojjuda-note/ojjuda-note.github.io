/* A public member ID is an invitation reference, never an authentication token. */
(() => {
  'use strict';
  if (window.OjjudaInvite) return;
  const storageKey = 'ojjuda:signup-referral';
  const normalize = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : null;
  let referral = null;
  try { referral = normalize(sessionStorage.getItem(storageKey)); } catch { /* The URL also carries invitations to signup. */ }
  const incoming = new URL(location.href).searchParams;
  if (incoming.has('ref')) referral = incoming.getAll('ref').length === 1 ? normalize(incoming.get('ref')) : null;
  else if (!referral && window.parent !== window) {
    try {
      if (parent.location.origin === location.origin) referral = normalize(parent.OjjudaInvite?.pending());
    } catch { /* Only the same-origin service host can share an invitation. */ }
  }
  function persist() {
    try {
      if (referral) sessionStorage.setItem(storageKey, referral);
      else sessionStorage.removeItem(storageKey);
    } catch { /* Keeping the code in memory still supports this page's signup links. */ }
  }
  persist();
  function withReferral(path) {
    const url = new URL(path, location.href);
    if (url.origin !== location.origin) return path;
    if (referral) url.searchParams.set('ref', referral);
    else url.searchParams.delete('ref');
    return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')
      ? url.pathname + url.search + url.hash : url.href;
  }
  function decorateLink(link) {
    try {
      const url = new URL(link.getAttribute('href'), location.href);
      if (url.origin !== location.origin || !['/', '/index.html'].includes(url.pathname) ||
          !['signup', 'login', 'forgot'].includes(url.searchParams.get('auth'))) return;
      const href = withReferral(url.pathname + url.search + url.hash);
      if (link.getAttribute('href') !== href) link.setAttribute('href', href);
    } catch { /* Non-navigation links do not carry referrals. */ }
  }
  function decorate(root) {
    if (root.matches?.('a[href]')) decorateLink(root);
    root.querySelectorAll?.('a[href]').forEach(decorateLink);
  }
  function clear() {
    referral = null;
    persist();
    try {
      const url = new URL(location.href);
      if (url.searchParams.has('ref')) {
        url.searchParams.delete('ref');
        history.replaceState(history.state, '', url.pathname + url.search + url.hash);
      }
    } catch { /* Signup still succeeds if the browser cannot update history. */ }
    decorate(document);
  }

  let owner = null, state = 'loading', pending = null, client = null, subscription = null, epoch = 0, generation = 0;
  function accept(session) {
    owner = session?.user && !session.user.is_anonymous ? normalize(session.user.id) : null;
    state = 'ready';
    // A link opened by an existing member never changes that member's referrer.
    if (owner) clear();
  }
  async function prepare(request) {
    let requestEpoch = epoch;
    try {
      const db = await window.OjjudaGetClient?.();
      if (request !== generation) return false;
      if (!db?.auth?.getSession || !db.auth.onAuthStateChange) throw Error('auth_unavailable');
      if (client !== db) {
        subscription?.unsubscribe?.();
        client = db;
        epoch++;
        requestEpoch = epoch;
        const listener = db.auth.onAuthStateChange((_event, session) => {
          if (client !== db) return;
          epoch++;
          accept(session);
        });
        subscription = listener?.data?.subscription;
      }
      requestEpoch = epoch;
      const { data, error } = await db.auth.getSession();
      if (request !== generation) return false;
      if (error) throw error;
      if (!data || !Object.hasOwn(data, 'session')) throw Error('invalid_session_response');
      if (requestEpoch === epoch) accept(data?.session);
    } catch {
      if (request === generation && requestEpoch === epoch && state !== 'ready') { owner = null; state = 'error'; }
    }
    return state === 'ready';
  }
  function ready() {
    if (state === 'ready') return Promise.resolve(true);
    if (pending) return pending;
    state = 'loading';
    const promise = prepare(++generation).finally(() => { if (pending === promise) pending = null; });
    pending = promise;
    return pending;
  }
  function shareUrl(path) {
    if (state !== 'ready') {
      const message = state === 'error'
        ? '초대 링크를 불러오지 못했어요. 잠시 후 다시 눌러 주세요.'
        : '초대 링크를 준비하고 있어요. 잠시 후 다시 눌러 주세요.';
      void ready();
      throw Error(message);
    }
    const url = new URL(path, location.origin);
    if (url.origin !== location.origin) throw Error('초대할 페이지를 확인해 주세요.');
    url.searchParams.delete('ref');
    if (owner) url.searchParams.set('ref', owner);
    return url.href;
  }
  window.OjjudaInvite = Object.freeze({ pending: () => referral, clear, withReferral, shareUrl, ready });
  decorate(document);
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) decorate(node);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  // Capture a just-created link even if a user activates it before the observer runs.
  for (const type of ['click', 'auxclick']) document.addEventListener(type, event => {
    const target = event.target?.closest ? event.target : event.target?.parentElement;
    const link = target?.closest('a[href]');
    if (link) decorateLink(link);
  }, true);
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      // Restoring a frozen page requires a fresh session, even if an earlier
      // request is still pending. Its late reply/finally cannot replace this one.
      generation++; epoch++; pending = null; owner = null; state = 'loading';
      void ready();
    }
  });
  void ready();
})();
