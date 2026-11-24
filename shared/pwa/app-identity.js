/* Choose the installed app once, from trusted routes, before the install UI loads. */
(function () {
  'use strict';
  if (window.OjjudaAppIdentity) return;

  // Pages replaces only iconRevision. The installed manifest URL stays stable.
  const iconRevision = 'seasonal-v1-autumn-d0c431c01ed9';
  const manifestRevision = '20261119-illustrated-icons-1';
  const apps = {
    agit: {
      key: 'agit', name: '오쭈다 아지트', path: '/world.html',
      icons: '/', manifest: '/manifest.webmanifest',
      note: '아지트 기능을 이용하려면 인터넷 연결이 필요해요.'
    },
    park: {
      key: 'park', name: '오쭈다 공원', path: '/park/',
      icons: '/park/assets/', manifest: '/park/manifest.webmanifest',
      note: '공원 카드를 이용하려면 인터넷 연결이 필요해요.'
    },
    pajang: {
      key: 'pajang', name: '오쭈다 파장', path: '/features/pajang/',
      icons: '/features/pajang/assets/', manifest: '/features/pajang/manifest.webmanifest',
      note: '질문과 대화를 이용하려면 인터넷 연결이 필요해요.'
    }
  };
  const url = new URL(location.href);
  const playStoreKey = 'ojjuda:play-store:agit:v1';
  let playStoreAgit = url.searchParams.get('play_store') === '1';
  try {
    if (playStoreAgit) sessionStorage.setItem(playStoreKey, '1');
    else playStoreAgit = sessionStorage.getItem(playStoreKey) === '1';
  } catch (_) {}
  const playSafeDestinations = new Set([
    '/games/certified-restaurants/',
    '/games/festival-schedule/',
    '/games/moonlit-tarot/',
    '/games/starlit-saju/',
    '/games/starlit-saju/compatibility.html'
  ]);
  function isPlaySafeBlockedUrl(value) {
    let target;
    try { target = new URL(value || location.href, location.href); } catch (_) { return true; }
    if (target.origin !== location.origin) return false;
    if (target.searchParams.has('game') || target.searchParams.get('tab') === 'arcade' ||
        target.searchParams.get('place') === 'arcade') return true;
    if (/^\/(?:arcade|games\/)/.test(target.pathname)) {
      const path = target.pathname.replace(/index\.html$/, '');
      return !playSafeDestinations.has(path) && !playSafeDestinations.has(target.pathname);
    }
    return false;
  }
  if (playStoreAgit && isPlaySafeBlockedUrl(location.href)) {
    location.replace('/world.html?tab=hub&play_store=1');
    return;
  }
  const isPark = url.pathname === '/park' || url.pathname.startsWith('/park/') ||
    (url.pathname === '/world.html' && url.searchParams.getAll('game').length !== 1 &&
      (url.searchParams.get('place') === 'park' || url.searchParams.get('tab') === 'park'));
  const isPajang = url.pathname === '/features/pajang' || url.pathname.startsWith('/features/pajang/');
  const app = apps[isPajang ? 'pajang' : isPark ? 'park' : 'agit'];
  const versioned = (path) => path + '?v=' + iconRevision;

  function link(rel, href, type) {
    let element = document.head.querySelector('link[rel="' + rel + '"]');
    if (!element) {
      element = document.createElement('link');
      element.rel = rel;
      document.head.appendChild(element);
    }
    element.href = href;
    if (type) element.type = type;
  }

  function meta(name, content) {
    let element = document.head.querySelector('meta[name="' + name + '"]');
    if (!element) {
      element = document.createElement('meta');
      element.name = name;
      document.head.appendChild(element);
    }
    element.content = content;
  }

  if (playStoreAgit) {
    document.documentElement.dataset.playStoreAgit = 'true';
    const safeStyle = document.createElement('style');
    safeStyle.id = 'ojjuda-play-store-agit-safe-mode';
    safeStyle.textContent = `
      html[data-play-store-agit="true"] [data-tab="arcade"],
      html[data-play-store-agit="true"] [data-place="arcade"],
      html[data-play-store-agit="true"] [data-id="arcade"],
      html[data-play-store-agit="true"] .wd-arcade,
      html[data-play-store-agit="true"] a[href*="tab=arcade"],
      html[data-play-store-agit="true"] a[href*="place=arcade"],
      html[data-play-store-agit="true"] a[href*="/arcade/"],
      html[data-play-store-agit="true"] a[href*="/games/"]:not([href*="/games/certified-restaurants/"]):not([href*="/games/festival-schedule/"]):not([href*="/games/moonlit-tarot/"]):not([href*="/games/starlit-saju/"]),
      html[data-play-store-agit="true"] [data-act="game-open"],
      html[data-play-store-agit="true"] [data-game],
      html[data-play-store-agit="true"] [data-game-id] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }`;

    document.head.appendChild(safeStyle);
    document.title = document.title
      .replace('게임·타로·사주·익명카드', '일상·운세·익명카드')
      .replace('게임부터 일상 이야기까지', '일상 이야기부터 운세까지');

    const hidePlayStoreGameEntrances = root => {
      const controls = root.querySelectorAll?.('button,a,[role="button"],[data-tab],[data-place]');
      if (!controls) return;
      controls.forEach(control => {
        const label = [
          control.innerText,
          control.getAttribute('aria-label'),
          control.getAttribute('title'),
          control.getAttribute('aria-description'),
          control.dataset?.v
        ].filter(Boolean).join(' ');
        if (/오락실|추천\\s*게임|게임\\s*(시작|플레이)/i.test(label) && !control.hidden) {
          control.hidden = true;
          control.setAttribute('aria-hidden', 'true');
        }
      });
      const textWalker = document.createTreeWalker(root, 4);
      let textNode;
      while ((textNode = textWalker.nextNode())) {
        textNode.nodeValue = textNode.nodeValue.replace(
          '게임부터 일상 이야기까지, 한곳에서.',
          '일상 이야기부터 운세까지, 한곳에서.'
        );
      }
    };
    hidePlayStoreGameEntrances(document);
    const gameEntranceObserver = new MutationObserver(() => {
      hidePlayStoreGameEntrances(document);
    });
    gameEntranceObserver.observe(document.documentElement, { childList: true, subtree: true });

    const blockPlayStoreGameAction = event => {
      const control = event.target?.closest?.('a[href],button,[role="button"],[data-act],[data-tab],[data-place]');
      if (!control) return;
      const action = control.dataset?.act || '';
      const isArcadeControl = control.dataset?.tab === 'arcade' ||
        control.dataset?.place === 'arcade' ||
        control.dataset?.id === 'arcade' ||
        action === 'game-open' ||
        /오락실|게임 시작|게임 플레이|추천 게임/i.test((control.innerText || control.getAttribute('aria-label') || '').trim());
      const href = control.getAttribute('href');
      if (!isArcadeControl && !(href && isPlaySafeBlockedUrl(href))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener('click', blockPlayStoreGameAction, true);
    document.addEventListener('auxclick', blockPlayStoreGameAction, true);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      blockPlayStoreGameAction(event);
    }, true);

    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);
    history.pushState = function (state, title, url) {
      if (url && isPlaySafeBlockedUrl(url)) return;
      return originalPushState(state, title, url);
    };
    history.replaceState = function (state, title, url) {
      if (url && isPlaySafeBlockedUrl(url)) return;
      return originalReplaceState(state, title, url);
    };
  }

  // All URLs and names come from this allowlist; no login parameters are reused.
  window.OjjudaAppIdentity = Object.freeze({
    key: app.key, name: app.name, path: app.path, note: app.note, iconRevision,
    icon: versioned(app.icons + 'icon-192.png'),
    appleIcon: versioned(app.icons + 'apple-touch-icon.png'),
    manifest: app.manifest + '?v=' + manifestRevision
  });
  document.documentElement.dataset.pwaApp = app.key;
  link('icon', window.OjjudaAppIdentity.icon, 'image/png');
  link('apple-touch-icon', window.OjjudaAppIdentity.appleIcon);
  link('manifest', window.OjjudaAppIdentity.manifest);
  meta('apple-mobile-web-app-title', app.name);
  meta('apple-mobile-web-app-capable', 'yes');
  meta('mobile-web-app-capable', 'yes');
})();
