/* Records verified member game visits and foreground playtime (no daily cap). */
(() => {
  'use strict';
  if (window.OjjudaStockTelemetryLoaded) return;
  window.OjjudaStockTelemetryLoaded = true;

  const supported = new Set(['mole','runner','stacker','screw','ttang','billiards',
    'breakout','janggi','photo_ttang','spot','tour','mines','saetbyeol',
    'tank','chess','matgo','poker','sacheonseong','bang','roulette',
    'archery','solitaire','chacha_rush']);
  const alias = {screw_box:'screw',screw_flat:'screw',carom3:'billiards',
    carom4:'billiards',pool8:'billiards'};
  const normalize = game => alias[game] || (/^sacheonseong_\d+$/.test(game) ? 'sacheonseong' : game);
  const config = window.OJJUDA_CONFIG;
  if (!config?.supabaseUrl || !config?.supabaseKey || !window.supabase?.createClient) return;
  const api = window.supabase.createClient(config.supabaseUrl,config.supabaseKey);
  let candidate = null, active = null, starting = false, heartbeat = 0, lastInteraction = 0;

  function gameVisible() {
    if (document.hidden) return false;
    return document.body.classList.contains('gaming') ||
      document.body.classList.contains('matgo-open') ||
      !!document.querySelector('#gov,#matgo-overlay,#ttang-overlay,.tour-game-dialog,.roulette-game-dialog,#bd-root');
  }

  async function ping(action, state) {
    try {
      const {data,error} = await api.rpc('community_game_stock_presence', {
        p_action:action,p_game:state.game,p_session:state.session
      });
      return !error && data?.ok === true;
    } catch { return false; }
  }

  async function finish() {
    const session = active;
    active = null; clearInterval(heartbeat); heartbeat = 0;
    if (session && candidate === session.game) candidate = null;
    if (session) await ping('stop',session);
  }

  async function start(game) {
    if (active || starting || !gameVisible() || !supported.has(game)) return;
    starting = true;
    try {
      const {data:{user},error} = await api.auth.getUser();
      if (error || !user || !gameVisible() || candidate !== game) return;
      const session = {game,session:crypto.randomUUID()};
      if (!await ping('start',session)) return;
      if (candidate !== game || !gameVisible()) { void ping('stop',session); return; }
      active = session;
      lastInteraction = Date.now();
      heartbeat = setInterval(() => {
        if (!gameVisible() || Date.now() - lastInteraction > 90000) { void finish(); return; }
        void ping('tick',session);
      },20000);
    } finally {
      starting = false;
      if (!active && candidate === game) candidate = null;
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-arcade-games] .gbtn');
    if (!button) return;
    const game = normalize(button.dataset.act === 'matgo-open' ? 'matgo' : button.dataset.v);
    if (!supported.has(game)) return;
    candidate = game;
    if (active) void finish();
    setTimeout(() => void start(game),350);
    setTimeout(() => void start(game),1100);
  },true);

  // Foreground time stops after 90 seconds without actual game input.
  const noteInput = event => {
    if (!active || !gameVisible()) return;
    if (document.body.classList.contains('gaming') ||
      event.target.closest?.('#gov,#matgo-overlay,#ttang-overlay,.tour-game-dialog,.roulette-game-dialog,#bd-root'))
      lastInteraction = Date.now();
  };
  document.addEventListener('pointerdown',noteInput,true);
  document.addEventListener('keydown',noteInput,true);

  // A game may close without navigating away from the arcade tab.
  const activityChanged = () => {
    if (active && !gameVisible()) void finish();
    if (!active && candidate && gameVisible()) void start(candidate);
  };
  // Game shells are mounted/unmounted; body classes cover the canvas games.
  new MutationObserver(activityChanged).observe(document.body,{childList:true,subtree:true});
  new MutationObserver(activityChanged).observe(document.body,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { candidate = null; void finish(); }
  });
  window.addEventListener('pagehide', () => { candidate = null; void finish(); });
})();
