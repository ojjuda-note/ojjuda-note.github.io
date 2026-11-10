/* Administrator-only game previews. Never change real progress or server rewards. */
(() => {
  'use strict';
  const prefix = 'ojjuda.admin-preview.v1:';
  let client = null, subscription = null, request = 0;
  let state = {owner:null, authorized:false, enabled:false, ready:false};
  const read = owner => {
    try { return localStorage.getItem(prefix + owner) === 'on'; }
    catch { return false; }
  };
  function publish(next) {
    state = next;
    window.dispatchEvent(new CustomEvent('ojjuda:admin-preview', {detail:{...state}}));
  }
  async function verify(session) {
    const current = ++request, owner = session?.user?.id || null;
    publish({owner:null, authorized:false, enabled:false, ready:!owner});
    if (!owner || !client) return;
    try {
      // getUser validates the session with Auth; is_admin checks server-owned roles.
      const {data:identity, error:identityError} = await client.auth.getUser();
      if (current !== request) return;
      if (identityError || identity?.user?.id !== owner) throw Error('identity_changed');
      const {data:allowed, error} = await client.rpc('is_admin');
      if (current !== request) return;
      const authorized = !error && allowed === true;
      publish({owner, authorized, enabled:authorized && read(owner), ready:true});
    } catch {
      if (current === request) publish({owner:null, authorized:false, enabled:false, ready:true});
    }
  }
  function configure(nextClient) {
    if (!nextClient?.auth || client === nextClient) return;
    subscription?.unsubscribe?.();
    client = nextClient;
    const {data} = client.auth.onAuthStateChange((_event, session) => {
      // Auth callbacks must not await another Supabase request.
      setTimeout(() => void verify(session), 0);
    });
    subscription = data?.subscription || null;
    client.auth.getSession().then(({data:sessionData}) => verify(sessionData?.session))
      .catch(() => publish({owner:null, authorized:false, enabled:false, ready:true}));
  }
  const api = {
    configure,
    isAuthorized:() => state.authorized,
    isEnabled:() => state.authorized && state.enabled,
    isReady:() => state.ready,
    setEnabled(enabled) {
      if (!state.authorized || !state.owner) return false;
      try { localStorage.setItem(prefix + state.owner, enabled ? 'on' : 'off'); }
      catch { return false; }
      publish({...state, enabled:!!enabled});
      return true;
    },
    refresh() {
      if (!client) return Promise.resolve();
      return client.auth.getSession().then(({data}) => verify(data?.session));
    }
  };
  window.OjjudaAdminPreview = Object.freeze(api);
  window.addEventListener('storage', event => {
    if (state.authorized && event.key === prefix + state.owner)
      publish({...state, enabled:read(state.owner)});
  });
  // World passes its existing client from the main module before DOMContentLoaded.
  // Standalone pages still create a fallback client if none was supplied.
  function configureFallback() {
    if (client) return;
    if (window.ojjudaSupabase?.auth) {configure(window.ojjudaSupabase);return;}
    const config = window.OJJUDA_CONFIG;
    if (config?.supabaseUrl && config?.supabaseKey && window.supabase?.createClient) {
      window.ojjudaSupabase = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
      configure(window.ojjudaSupabase);
    }
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', configureFallback, {once:true});
  else queueMicrotask(configureFallback);
})();
