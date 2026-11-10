/* Lightweight member-only page and game entry history for the administrator directory. */
(() => {
  'use strict';
  if (window.OjjudaMemberNavigation || !['ojjuda.kr', 'www.ojjuda.kr'].includes(location.hostname.toLowerCase())) return;
  const config = window.OJJUDA_CONFIG;
  if (!config?.supabaseUrl || !config?.supabaseKey) return;

  const gameTitles = Object.freeze({
    archery: '바람의 궁수', bang: '뱅!', billiards: '당구', breakout: '벽돌깨기',
    carom3: '3구 당구', carom4: '4구 당구', pocket: '8볼 당구',
    chacha_rush: '차차 러시', chess: '체스', janggi: '장기', matgo: '맞고',
    mines: '지뢰찾기', mole: '두더지 팡!', photo_ttang: '포토땅따먹기',
    poker: '세븐포커', roulette: '룰렛', runner: '쭈달리기',
    sacheonseong: '사천성', saetbyeol: '새별', screw: '나사 풀기',
    screw_box: '나사 풀기 (박스형)', screw_flat: '나사 풀기 (평면형)',
    solitaire: '솔리테어', spot: '틀린그림 찾기', stacker: '탑 쌓기',
    tank: '탱크게임', tour: '오쭈다 투어', ttang: '월드땅따먹기',
    trivia: '상식 퀴즈', baseball: '야구 퀴즈', chosung: '초성 퀴즈',
    snake: '스네이크', group: '그룹', festival: '축제·공연',
    restaurants: '맛집 지도', recommendations: '추천 맛집'
  });
  const tabs = Object.freeze({
    hub: '아지트 홈', arcade: '오락실', park: '공원', my: '내 정보',
    home: '우리집', friends: '동네 친구', shop: '상점', admin: '관리자 모드',
    agit: '아지트 홈', settings: '내 정보', library: '도서관'
  });
  const pages = Object.freeze({
    '/': '오쭈다 대문', '/index.html': '오쭈다 대문',
    '/note/': '익명카드', '/note/index.html': '익명카드',
    '/guide.html': '이용 안내', '/gift.html': '선물',
    '/admin/': '관리자 모드', '/admin/index.html': '관리자 모드',
    '/features/fanpages/': '팬페이지 목록',
    '/features/fanpages/index.html': '팬페이지 목록',
    '/features/fanpages/artist.html': '아티스트 팬페이지',
    '/photo-ttang.html': '포토땅따먹기'
  });
  const gameActions = new Set(['game-open', 'bd-open', 'bl-open', 'matgo-open', 'agit-play', 'agit-daily']);
  const recent = new Map();
  const pending = [];
  let session = null, authReady = false;

  const tidy = value => String(value || '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const safeKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9_./:-]/g, '-').slice(0, 120) || 'page';
  const game = id => ({ kind: 'game', key: safeKey(id), title: gameTitles[id] || tidy(id) });
  const page = (id, title) => ({ kind: 'page', key: safeKey(id), title: tidy(title) });

  function route(url) {
    if (url.origin !== location.origin) return null;
    const pathname = url.pathname.replace(/\/{2,}/g, '/');
    const standalone = pathname.match(/^\/games\/([^/]+)\//);
    if (standalone) {
      const directory = standalone[1];
      const names = { 'forest-archer': 'archery', 'spot-difference': 'spot', 'screw': 'screw', 'ojjuda-tour': 'tour' };
      return game(names[directory] || directory);
    }
    if (pathname === '/world.html') {
      const requestedGame = url.searchParams.get('game');
      if (requestedGame && /^[a-z0-9_]{1,50}$/.test(requestedGame)) return game(requestedGame);
      const tab = url.searchParams.has('admin') ? 'admin' : (url.searchParams.get('tab') || 'hub');
      const id = Object.hasOwn(tabs, tab) ? tab : 'hub';
      return page('world:' + id, tabs[id]);
    }
    if (pathname === '/features/fanpages/artist.html') {
      const artist = url.searchParams.get('group');
      if (artist === 'rescene') return page('fanpage:rescene', '리센느 팬페이지');
    }
    const title = pages[pathname] || tidy(document.title.split(/[|｜]/)[0]) || '방문 페이지';
    return page(pathname, title);
  }

  function dispatch(event) {
    if (!session?.access_token) {
      if (!authReady && pending.length < 8) pending.push(event);
      return;
    }
    const body = JSON.stringify({ p_kind: event.kind, p_key: event.key, p_title: event.title });
    void fetch(config.supabaseUrl + '/rest/v1/rpc/record_member_navigation', {
      method: 'POST', keepalive: true,
      headers: { apikey: config.supabaseKey, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
      body
    }).catch(() => {});
  }

  function record(event) {
    if (!event?.title || !event.key) return;
    const signature = event.kind + ':' + event.key;
    const now = Date.now();
    if (now - (recent.get(signature) || 0) < 8000) return;
    recent.set(signature, now);
    if (recent.size > 40) recent.delete(recent.keys().next().value);
    dispatch(event);
  }

  window.OjjudaMemberNavigation = Object.freeze({ game: id => record(game(id)), page: (id, title) => record(page(id, title)) });
  document.addEventListener('click', event => {
    const trigger = event.target.closest?.('[data-act]');
    if (trigger && !trigger.disabled && trigger.getAttribute('aria-disabled') !== 'true') {
      const action = trigger.dataset.act;
      if (gameActions.has(action)) {
        const id = action === 'matgo-open' ? 'matgo' : trigger.dataset.v;
        if (id) record(game(id));
      } else if (action === 'tab') {
        const id = trigger.dataset.tab;
        if (id && Object.hasOwn(tabs, id)) record(page('world:' + id, tabs[id]));
      } else if (action === 'enter-place') {
        const id = trigger.dataset.id;
        if (id && Object.hasOwn(tabs, id)) record(page('world:' + id, tabs[id]));
      } else if (action === 'house-open') record(page('world:home', '우리집'));
    }
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    let target;
    try { target = new URL(link.href, location.href); } catch { return; }
    if (target.origin === location.origin && target.href !== location.href) record(route(target));
    else if (/chacharush-arcade/.test(target.hostname)) record(game('chacha_rush'));
  }, true);

  async function start() {
    if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    // Reuse the page's member session. A second default-key GoTrueClient
    // can race the main login client and produce duplicate-auth warnings.
    if (!window.ojjudaSupabase?.auth && !window.supabase?.createClient) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2';
          script.onload = resolve; script.onerror = reject;
          document.head.append(script);
        });
      } catch { return; }
    }
    const client = window.ojjudaSupabase?.auth
      ? window.ojjudaSupabase
      : window.supabase?.createClient?.(config.supabaseUrl, config.supabaseKey);
    if (!client?.auth) return;
    window.ojjudaSupabase = client;
    function accept(next) {
      const previous = session?.user?.id;
      session = next?.user?.id ? next : null;
      authReady = true;
      if (!session) { pending.length = 0; return; }
      if (previous !== session.user.id) record(route(new URL(location.href)));
      for (const entry of pending.splice(0)) dispatch(entry);
    }
    client.auth.onAuthStateChange((_event, next) => setTimeout(() => accept(next), 0));
    const { data } = await client.auth.getSession();
    accept(data?.session);
  }
  void start().catch(() => {});
})();
