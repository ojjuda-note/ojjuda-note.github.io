/* Choose the installed app once, from trusted routes, before the install UI loads. */
(function () {
  'use strict';
  if (window.OjjudaAppIdentity) return;

  // Pages replaces only iconRevision. The installed manifest URL stays stable.
  const iconRevision = 'seasonal-v1-autumn-a93ca4a62190';
  const manifestRevision = '20261119-illustrated-icons-1';
  const apps = {
    agit: {
      key: 'agit', name: '오쭈다 아지트', path: '/world.html',
      icons: '/', manifest: '/manifest.webmanifest',
      note: '게임과 공원을 이용하려면 인터넷 연결이 필요해요.'
    },
    park: {
      key: 'park', name: '오쭈다 공원', path: '/world.html?place=park',
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
