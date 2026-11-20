/* First-party campaign cohorts. No URL, referrer, email, phone or account ID is sent. */
(() => {
  'use strict';
  if (window.OjjudaGrowthAttribution) return;
  const KEY = 'ojjuda.campaign-session.v1';
  const TTL = 24 * 3600000;
  const HOSTS = new Set(['ojjuda.kr','www.ojjuda.kr','ojjuda.com','www.ojjuda.com','ojjuda-note.github.io']);
  const SOURCES = new Set(['threads','naver','instagram','facebook','youtube','tiktok','kakao','x','google','other']);
  const MEDIA = new Set(['social','blog','video','search','referral','organic','paid','other']);
  const SLUG = /^[a-z][a-z0-9_-]{0,63}$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let client, active = null, flight = null, subscription, expiryTimer;
  const allowed = () => HOSTS.has(location.hostname) && window.top === window
    && navigator.doNotTrack !== '1' && !navigator.globalPrivacyControl
    && window.OjjudaAdminPreview?.isEnabled?.() !== true;
  function clear() {
    clearTimeout(expiryTimer);
    active = null;
    try { sessionStorage.removeItem(KEY); } catch {}
  }
  function expire() {
    if (active && active.expiresAt <= Date.now()) clear();
    return !!active;
  }
  function armExpiry() {
    clearTimeout(expiryTimer);
    if (active) expiryTimer=setTimeout(() => { if (expire()) armExpiry(); },Math.max(0,active.expiresAt-Date.now()));
  }
  function validTags(value) {
    return value && SOURCES.has(value.source) && MEDIA.has(value.medium)
      && SLUG.test(value.campaign || '') && SLUG.test(value.content || '');
  }
  function save() {
    if (!active) return false;
    try { sessionStorage.setItem(KEY, JSON.stringify(active)); armExpiry(); return true; }
    catch { clear(); return false; }
  }
  function capture() {
    if (!allowed()) { clear(); return; }
    try {
      const stored = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (validTags(stored) && UUID.test(stored.id || '') && Number.isFinite(stored.expiresAt)
          && stored.expiresAt > Date.now() && stored.expiresAt <= Date.now() + TTL) { active = stored; armExpiry(); }
      else clear();
      const params = new URL(location.href).searchParams;
      const keys = ['utm_source','utm_medium','utm_campaign','utm_content'];
      if (!keys.some(key => params.has(key))) return; // Internal/direct navigation keeps a valid touch.
      const incoming = {
        source:params.get('utm_source'), medium:params.get('utm_medium') || 'other',
        campaign:params.get('utm_campaign'), content:params.get('utm_content') || 'unlabeled'
      };
      if (keys.some(key => params.getAll(key).length > 1) || !validTags(incoming)) { clear(); return; }
      if (active && Object.keys(incoming).every(key => active[key] === incoming[key])) return;
      if (typeof crypto.randomUUID !== 'function') { clear(); return; }
      active = {...incoming,id:crypto.randomUUID(),expiresAt:Date.now()+TTL,visited:false,started:false};
      save();
    } catch { clear(); } // Storage refusal never changes signup or navigation.
  }
  async function send(event) {
    if (!allowed()) { clear(); return false; }
    if (!expire() || !client || document.hidden) return false;
    const touch = active;
    if (touch[event === 'visit' ? 'visited' : 'started'] === true) return true;
    try {
      const {data:sessionData,error:sessionError} = await client.auth.getSession();
      if (sessionError) return false;
      // Existing members are not acquisition visits. Auth also enforces this on the server.
      if (sessionData?.session?.user) { clear(); return false; }
      if (!allowed() || active !== touch) return false;
      let request = client.rpc('record_campaign_event', {
        p_visit_id:touch.id,p_event:event,p_source:touch.source,p_medium:touch.medium,
        p_campaign:touch.campaign,p_content:touch.content
      });
      if (request?.abortSignal && typeof AbortSignal?.timeout === 'function') request = request.abortSignal(AbortSignal.timeout(1500));
      const result = await request;
      if (!allowed() || active !== touch || result.error || result.data?.ok !== true || result.data?.accepted !== true) return false;
      touch[event === 'visit' ? 'visited' : 'started'] = true;
      return save();
    } catch { return false; }
  }
  async function prepare(start = false) {
    if (!allowed()) { clear(); return false; }
    if (!expire()) return false;
    if (flight) await flight;
    const work = (async () => {
      if (!await send('visit')) return false;
      return start ? send('signup_start') : true;
    })();
    flight = work;
    try { return await work; } finally { if (flight === work) flight = null; }
  }
  function configure(options = {}) {
    if (!options.client || client === options.client) return;
    try { subscription?.unsubscribe?.(); } catch {}
    client = options.client;
    try {
      subscription = client.auth?.onAuthStateChange?.((_event, session) => {
        if (session?.user) clear();
      })?.data?.subscription;
    } catch {} // Optional measurement must never break the existing auth client.
    void prepare();
  }
  async function signupMetadata() {
    // Analytics must not hold the form or make registration fail when unavailable.
    let timer;
    try {
      const ok = await Promise.race([prepare(true),new Promise(resolve => { timer = setTimeout(() => resolve(false),800); })]);
      return ok && allowed() && active?.started && active.expiresAt > Date.now()
        ? {campaign_visit_token:active.id} : {};
    } catch { return {}; } finally { clearTimeout(timer); }
  }
  capture();
  window.OjjudaGrowthAttribution = Object.freeze({configure,startSignup:() => { void prepare(true); },signupMetadata});
  async function autoStart() {
    if (!expire() || !allowed()) return;
    try { configure({client:await window.OjjudaGetClient?.()}); } catch {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',autoStart,{once:true});
  else void autoStart();
  addEventListener('online',() => void prepare());
  addEventListener('pageshow',() => { if (expire()) void autoStart(); });
  addEventListener('ojjuda:admin-preview',() => { if (!allowed()) clear(); });
  document.addEventListener('visibilitychange',() => { if (active) void prepare(); });
})();
