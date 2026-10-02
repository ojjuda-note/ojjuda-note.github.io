/* Matgo uses the immutable member birth date and Korea-time age from the server.
 * This is a registered-birth-date restriction, not identity-provider verification.
 */
(function (root) {
  'use strict';
  try {
    if (root.parent !== root && root.parent.location.origin === root.location.origin && root.parent.OjjudaMatgoAccess) {
      root.OjjudaMatgoAccess = root.parent.OjjudaMatgoAccess;
      return;
    }
  } catch (_) {}
  let client = null, subscription = null, pending = null, revision = 0;
  let memberId = null, checkedAt = 0;
  const listeners = new Set();
  const messages = {
    login: '맞고는 로그인한 만 19세 이상 회원만 이용할 수 있어요.',
    identity: '내 정보에서 생년월일을 등록한 뒤 다시 입장해 주세요.',
    underage: '맞고는 만 19세 생일부터 이용할 수 있어요.',
    unavailable: '나이를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'
  };
  function reject(code) {
    const error = new Error(messages[code] || messages.unavailable);
    error.code = code;
    return error;
  }
  function invalidate(code = 'login') {
    revision++;
    memberId = null;
    checkedAt = 0;
    root.document?.querySelectorAll('[data-act="matgo-open"]').forEach(button => button.remove());
    for (const listener of listeners) { try { listener(reject(code)); } catch (_) {} }
  }
  function configure(value) {
    if (client === value) return;
    if (subscription) subscription.unsubscribe();
    invalidate();
    client = value;
    subscription = client?.auth?.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && session?.user?.id !== memberId)
          || (memberId && session?.user?.id !== memberId)) invalidate();
    })?.data?.subscription || null;
  }
  function getClient() {
    if (client) return client;
    const shared = root.ojjudaSupabase || root.supabaseClient || root.sb;
    if (shared) configure(shared);
    else {
      const config = root.OJJUDA_CONFIG;
      if (!config?.supabaseUrl || !config.supabaseKey || !root.supabase?.createClient) throw reject('unavailable');
      configure(root.supabase.createClient(config.supabaseUrl, config.supabaseKey));
    }
    return client;
  }
  function timed(promise) {
    let timer;
    return Promise.race([promise, new Promise((_, fail) => { timer = setTimeout(() => fail(reject('unavailable')), 10000); })])
      .finally(() => clearTimeout(timer));
  }
  function check() {
    if (pending) return pending;
    pending = (async () => {
      try {
        const service = getClient(), attempt = revision;
        // getUser validates with Auth; editable user_metadata and local age flags are never used.
        const auth = await timed(service.auth.getUser());
        if (auth.error || !auth.data?.user?.id || auth.data.user.is_anonymous) throw reject('login');
        const userId = auth.data.user.id;
        const result = await timed(service.rpc('get_my_member_identity'));
        if (result.error) throw reject('unavailable');
        if (!result.data) throw reject('identity');
        if (result.data.locked !== true || !Number.isInteger(result.data.age) || result.data.age < 0 || result.data.age > 150) throw reject('unavailable');
        if (result.data.age < 19) throw reject('underage');
        if (attempt !== revision) throw reject('login');
        memberId = userId;
        checkedAt = Date.now();
        return { userId };
      } catch (error) {
        const code = Object.hasOwn(messages, error?.code) ? error.code : 'unavailable';
        invalidate(code);
        throw reject(code);
      }
    })().finally(() => { pending = null; });
    return pending;
  }
  function allowed() { return !!memberId && Date.now() - checkedAt < 65000; }
  root.OjjudaMatgoAccess = Object.freeze({
    configure, check, allowed, visible: () => !!memberId, getClient,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  });
})(window);
