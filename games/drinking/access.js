'use strict';
(() => {
  const gate = document.getElementById('access-screen');
  const message = document.getElementById('access-message');
  const retry = document.getElementById('access-retry');
  const login = document.getElementById('access-login');
  const content = document.getElementById('access-content');
  const page = document.getElementById('access-page');
  const titles = {login:'오쭈다에 로그인한 뒤 이 화면으로 돌아와 주세요.',
    identity:'내 정보에서 생년월일을 등록한 뒤 다시 확인해 주세요.',
    underage:'이 페이지는 만 19세부터 이용할 수 있어요.',
    unavailable:'회원 정보를 확인할 수 없어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.'};
  let access, ready, approvedUser, authenticatedUser, exposed = false, running = false;
  let checkId = 0, timer, lastTitle, checking = false, failedModule = false, failures = 0;
  let sources, moduleCursor = 0, loading;

  function signal(allowed) {
    if (window.OjjudaDrinkingAccessReady === allowed) return;
    window.OjjudaDrinkingAccessReady = allowed;
    document.dispatchEvent(new CustomEvent('ojjuda:drinking-access', {detail:{allowed}}));
  }
  function retryLater() {
    clearTimeout(timer);
    if (!document.hidden && navigator.onLine && !failedModule) {
      timer = setTimeout(verify, Math.min(15000, 1500 * 2 ** Math.min(failures++, 4)));
    }
  }

  function conceal(code = 'pending') {
    signal(false);
    if (exposed) lastTitle = document.title;
    for (const dialog of content.querySelectorAll('dialog[open]')) dialog.close();
    exposed = false; content.hidden = true; gate.hidden = false;
    document.title = '오쭈다';
    gate.dataset.state = code;
    message.textContent = titles[code] || '회원 정보를 확인하고 있어요…';
    login.hidden = code !== 'login';
    retry.hidden = code === 'pending';
    clearTimeout(timer);
  }

  function invalidate(code) {
    ++checkId;checking = false;conceal(code);
    // Existing game clients hold their own timers and the previous member's room.
    // A new document drops those together before a different member can enter.
    if (running && code !== 'unavailable') location.reload();
  }

  async function prepare() {
    const service = await window.OjjudaGetClient();
    access = window.OjjudaMatgoAccess;
    access.configure(service);
    service.auth.onAuthStateChange((event, session) => {
      const user = session?.user;
      const id = user && !user.is_anonymous ? user.id : null;
      if (authenticatedUser !== undefined && authenticatedUser !== id) {
        authenticatedUser = id;
        invalidate(id ? 'pending' : 'login');
        if (!running && id) setTimeout(verify,0);
        return;
      }
      authenticatedUser = id;
      if (event === 'SIGNED_OUT') invalidate('login');
      else if (event === 'SIGNED_IN' && !exposed && !running && id) setTimeout(verify,0);
    });
    access.subscribe(error => {
      // check() reports denials here too, before its promise rejects.
      const code = error?.code || 'unavailable';
      if (code === 'unavailable') {
        // Preserve the mounted room and drafts through a temporary network
        // failure. It stays concealed until the same member is verified again.
        invalidate(code);
        retryLater();
      } else invalidate(code);
    });
    return access;
  }

  async function start(ticket) {
    if (loading) return loading;
    if (!running) {
      if (page.dataset.kind) document.documentElement.dataset.game = page.dataset.kind;
      content.dataset.member = approvedUser;
      content.replaceChildren(page.content.cloneNode(true));
      sources = Array.from(content.querySelectorAll('[data-module]'), node => node.dataset.module);
      content.querySelectorAll('[data-module]').forEach(node => node.remove());
      running = true;
    }
    loading = (async () => {
      while (moduleCursor < sources.length) {
        if (ticket !== checkId || document.hidden || !navigator.onLine) return false;
        await new Promise((resolve,reject) => {
          const script = document.createElement('script');
          const fail = () => {
            // A timed-out script may still execute later. Never insert it a
            // second time in this document, even if its access ticket expired.
            failedModule = true;
            conceal('unavailable');
            reject(Error('module_failure'));
          };
          const timeout = setTimeout(fail, 15000);
          script.async = false; script.src = sources[moduleCursor];
          script.onload = () => { clearTimeout(timeout);resolve(); };
          script.onerror = () => { clearTimeout(timeout);fail(); };
          document.head.append(script);
        });
        moduleCursor++;
      }
      return true;
    })().finally(() => { loading = null; });
    return loading;
  }

  async function verify() {
    if (checking || document.hidden || failedModule) return;
    clearTimeout(timer);
    if (!navigator.onLine) { invalidate('unavailable');return; }
    const ticket = ++checkId;
    checking = true;
    try {
      if (!ready) ready = prepare().catch(err => { ready = null; throw err; });
      const access = await ready;
      if (ticket !== checkId) return;
      const identity = await access.check();
      if (ticket !== checkId || document.hidden || !navigator.onLine) return;
      if (!identity?.userId || !Number.isInteger(identity.age) || identity.age < 19 ||
          (authenticatedUser !== undefined && authenticatedUser !== identity.userId)) throw Error('identity_mismatch');
      if (approvedUser && approvedUser !== identity.userId) { invalidate('pending');return; }
      authenticatedUser = approvedUser = identity.userId;
      signal(true);
      if ((!running || moduleCursor < sources.length) && !await start(ticket)) {
        if (ticket === checkId) retryLater();
        return;
      }
      if (ticket !== checkId || document.hidden || !navigator.onLine) return;
      document.title = lastTitle || page.dataset.title;
      gate.hidden = true; content.hidden = false; exposed = true;
      failures = 0;
      timer = setTimeout(verify,55000);
    } catch (err) {
      if (ticket === checkId) {
        // Leave partially-loaded game modules concealed; retry in a clean document.
        failedModule = err?.message === 'module_failure';
        conceal(Object.hasOwn(titles,err?.code) ? err.code : 'unavailable');
        if (!failedModule && (!err?.code || err.code === 'unavailable')) retryLater();
      }
    } finally { if (ticket === checkId) checking = false; }
  }

  function suspend() { ++checkId;checking = false;conceal(); }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspend();
    else void verify();
  });
  window.addEventListener('pagehide',suspend);
  window.addEventListener('pageshow',e => { if (e.persisted) { suspend(); void verify(); } });
  window.addEventListener('offline',() => invalidate('unavailable'));
  window.addEventListener('online',() => { if (!document.hidden) void verify(); });
  window.addEventListener('focus',() => { if (!exposed && !document.hidden) void verify(); });
  retry.onclick=()=> { if (failedModule) location.reload();else void verify(); };
  verify();
})();
