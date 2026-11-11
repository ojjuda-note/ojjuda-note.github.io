/* Anonymous daily aggregates for site visits and selected features. No URLs or account IDs. */
(() => {
  'use strict';
  const KEY = 'ojjuda.site-usage.v1';
  const HOSTS = new Set(['ojjuda.kr','www.ojjuda.kr','ojjuda.com','www.ojjuda.com','ojjuda-note.github.io']);
  const GAMES = new Set(['chacha_rush','solitaire','archery','sacheonseong','mines','saetbyeol',
    'mole','runner','stacker','breakout','spot','screw','bang','tank','tour','ttang',
    'janggi','chess','billiards','matgo','poker','roulette','photo_ttang']);
  const FEATURES = new Set(['agit','arcade','park','settings','portal','group','fanpages',
    'restaurants','festival','game_other',...[...GAMES].map(game => 'game_' + game)]);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let client, running = false, clockOffset = 0, retryAfter = 0, retryTimer;
  const pending = new Map();
  const date = () => new Date(Date.now() + clockOffset + 9 * 3600000).toISOString().slice(0,10);
  const enabled = () => !!client && HOSTS.has(location.hostname) && !document.hidden
    && navigator.doNotTrack !== '1' && !navigator.globalPrivacyControl
    && window.OjjudaAdminPreview?.isEnabled?.() !== true;
  function source() {
    const params = new URL(location.href).searchParams;
    if (['utm_source','utm_medium','utm_campaign'].some(key => params.has(key))) return 'campaign';
    let host;
    try { host = new URL(document.referrer).hostname.toLowerCase(); } catch { return 'direct'; }
    if (HOSTS.has(host)) return 'internal';
    if (host === 'naver.com' || host.endsWith('.naver.com')) return 'naver';
    if (host === 'google.com' || host.startsWith('google.') || host.includes('.google.')) return 'google';
    if (/(^|\.)(daum|bing|yahoo)\./.test(host)) return 'search';
    if (/(^|\.)(kakao|instagram|facebook|tiktok|youtube|youtu|twitter|x|threads)\./.test(host)) return 'social';
    return 'external';
  }
  function dailyRecord() {
    try {
      let record = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (Number.isFinite(record?.clockOffset)) clockOffset = record.clockOffset;
      if (!record || record.day !== date() || !UUID.test(record.id) || !Array.isArray(record.sent)) {
        if (typeof crypto.randomUUID !== 'function') return null;
        record = { day:date(), id:crypto.randomUUID(), sent:[], source:source(), clockOffset };
        localStorage.setItem(KEY, JSON.stringify(record));
        record = JSON.parse(localStorage.getItem(KEY));
      }
      return record && UUID.test(record.id) && Array.isArray(record.sent) ? record : null;
    } catch { return null; } // No storage: do not send duplicate measurements.
  }
  async function deliver(entry) {
    if (!enabled()) return 'later';
    const record = dailyRecord();
    if (!record || entry.day !== date()) return record ? 'done' : 'later';
    if (record.sent.includes(entry.key)) return 'done';
    try {
      let rpc = client.rpc('record_site_usage', {
        p_visit_id: record.id, p_event: entry.event,
        p_feature: entry.feature || null, p_source: entry.event === 'visit' ? record.source : null
      });
      if (rpc?.abortSignal && typeof window.AbortSignal?.timeout === 'function') rpc = rpc.abortSignal(window.AbortSignal.timeout(5000));
      const { data, error } = await rpc;
      if (error || data?.ok !== true || !/^\d{4}-\d{2}-\d{2}$/.test(data.day)) return 'retry';
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved?.id === record.id) {
        const serverNow = Date.parse(data.server_now);
        if (Number.isFinite(serverNow)) clockOffset = serverNow - Date.now();
        saved.clockOffset = clockOffset;
        saved.day = data.day;
        saved.sent = [...new Set([...saved.sent,entry.key])].slice(-48);
        localStorage.setItem(KEY, JSON.stringify(saved));
      }
      return 'done';
    } catch { return 'retry'; }
  }
  async function flush() {
    if (running || !enabled() || Date.now() < retryAfter) return;
    running = true;
    try {
      while (pending.size && enabled()) {
        const [key,entry] = pending.entries().next().value;
        const send = () => deliver(entry);
        const outcome = navigator.locks?.request ? await navigator.locks.request(KEY,send) : await send();
        if (outcome === 'done') { if (pending.get(key) === entry) pending.delete(key); continue; }
        if (outcome === 'retry') {
          retryAfter = Date.now() + 60000;
          clearTimeout(retryTimer);
          retryTimer = setTimeout(() => void flush(),60000);
        }
        break;
      }
    } catch {} finally { running = false; }
  }
  function track(event,feature = '') {
    if (event !== 'visit' && (event !== 'feature' || !FEATURES.has(feature))) return;
    if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
    const key = event === 'visit' ? 'visit' : feature;
    const today = date();
    const queueKey = today + ':' + key;
    if (!pending.has(queueKey)) pending.set(queueKey,{key,event,feature,day:today});
    void flush();
  }
  function initialFeature() {
    const params = new URL(location.href).searchParams;
    if (!location.pathname.endsWith('/world.html')) return 'portal';
    const game = params.get('game');
    if (GAMES.has(game)) return 'game_' + game;
    if (game) return 'game_other';
    if (params.get('place') === 'park') return 'park';
    return ({ arcade:'arcade',park:'park',my:'settings',settings:'settings' })[params.get('tab')] || 'agit';
  }
  function clicked(event) {
    if (!event.target?.closest || event.target.closest('button:disabled,[aria-disabled="true"]')) return;
    const gameButton = event.target.closest('[data-arcade-games] .gbtn,[data-act="agit-play"]');
    if (gameButton) {
      const id = gameButton.dataset.v || ({'matgo-open':'matgo','bl-open':'billiards'})[gameButton.dataset.act];
      track('feature','game_' + (GAMES.has(id) ? id : 'other'));
      return;
    }
    const daily = event.target.closest('[data-act="agit-daily"]');
    if (daily && FEATURES.has(daily.dataset.v)) { track('feature',daily.dataset.v); return; }
    if (event.target.closest('[data-act="agit-fan"]')) { track('feature','fanpages'); return; }
    const tab = event.target.closest('[data-tab]')?.dataset.tab;
    const feature = ({hub:'agit',arcade:'arcade',park:'park',my:'settings'})[tab];
    if (feature) track('feature',feature);
  }
  document.addEventListener('click',clicked,true);
  addEventListener('online',() => { retryAfter = 0; void flush(); });
  addEventListener('pageshow',() => void flush());
  document.addEventListener('visibilitychange',() => void flush());
  window.OjjudaSiteUsage = Object.freeze({ configure(options = {}) {
    client = options.client;
    if (!client) return;
    track('visit'); track('feature',initialFeature());
  }, track });
})();
