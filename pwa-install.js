/* One installation flow for the browser site and the home-screen app. */
(function () {
  'use strict';
  if (window.OjjudaPWA) return;

  const root = document.documentElement;
  const displayMode = window.matchMedia('(display-mode: standalone)');
  const minimalMode = window.matchMedia('(display-mode: minimal-ui)');
  const promoKey = 'ojjuda:pwa:hide-banner';
  let deferredPrompt = null;
  let installed = false;
  let requested = false;
  let prompting = false;
  let dismissed = false;
  let dialog = null;
  let returnFocus = null;
  try { dismissed = sessionStorage.getItem(promoKey) === '1'; } catch (_) {}

  function isStandalone() {
    return displayMode.matches || minimalMode.matches || navigator.standalone === true;
  }

  function refresh() {
    const app = installed || isStandalone();
    root.dataset.pwaInstalled = String(app);
    root.dataset.pwaHideBanner = String(app || requested || dismissed);
    root.dataset.pwaPrompting = String(prompting);
    document.querySelectorAll('[data-pwa-install]').forEach((button) => {
      button.disabled = prompting;
      button.querySelectorAll('[data-pwa-label]').forEach((label) => {
        const text = app ? '설치된 앱' : requested ? '설치 확인' : '앱 설치';
        if (label.textContent !== text) label.textContent = text;
      });
      button.querySelectorAll('[data-pwa-caption]').forEach((caption) => {
        const text = app ? '홈 화면에서 오쭈다를 열어 주세요' : '홈 화면 아이콘으로 바로 열기';
        if (caption.textContent !== text) caption.textContent = text;
      });
    });
  }

  function close() {
    if (!dialog || !dialog.open) return false;
    if (typeof dialog.close === 'function') dialog.close();
    else { dialog.removeAttribute('open'); restoreFocus(); }
    return true;
  }

  function restoreFocus() {
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'pwa-install-dialog';
    dialog.id = 'pwa-install-dialog';
    dialog.setAttribute('aria-labelledby', 'pwa-install-title');
    dialog.setAttribute('aria-describedby', 'pwa-install-description');
    dialog.innerHTML = '<button type="button" class="pwa-dialog-close" data-pwa-close aria-label="설치 안내 닫기">×</button>' +
      '<img class="pwa-app-icon" src="/icon-192.png?v=20261022-agit-logo2" alt="" width="64" height="64">' +
      '<p class="pwa-eyebrow">오쭈다 아지트</p>' +
      '<h2 id="pwa-install-title"></h2>' +
      '<p id="pwa-install-description"></p>' +
      '<ol class="pwa-install-steps"></ol>' +
      '<p class="pwa-install-note">게임과 공원을 이용하려면 인터넷 연결이 필요해요.</p>' +
      '<div class="pwa-dialog-actions"><button type="button" class="pwa-copy-button" data-pwa-copy>주소 복사</button>' +
      '<button type="button" class="pwa-confirm-button" data-pwa-close>확인</button></div>' +
      '<p class="pwa-copy-status" role="status" aria-live="polite"></p>';
    dialog.addEventListener('close', restoreFocus);
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    });
    document.body.appendChild(dialog);
    return dialog;
  }

  function guide() {
    const agent = navigator.userAgent || '';
    const ios = /iPad|iPhone|iPod/i.test(agent) ||
      (/Macintosh/i.test(agent) && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(agent);
    const inApp = /KAKAOTALK|NAVER|DaumApps|Instagram|FBAN|FBAV|Line\/|; wv\)/i.test(agent);
    if (isStandalone()) return {
      title: '앱으로 사용 중이에요', description: '지금처럼 홈 화면의 오쭈다 아이콘을 눌러 바로 들어오세요.', steps: []
    };
    if (installed) return {
      title: '설치가 완료됐어요', description: '휴대폰 홈 화면이나 앱 목록에서 오쭈다 아지트를 열어 주세요.', steps: []
    };
    if (requested) return {
      title: '설치를 요청했어요', description: '설치가 끝나면 홈 화면이나 앱 목록에 오쭈다 아이콘이 생겨요.', steps: []
    };
    if (ios) return {
      title: '홈 화면에 오쭈다 추가하기',
      description: 'Safari에서 오쭈다를 열고 아래 순서로 추가해 주세요.',
      steps: ['공유 버튼을 눌러 주세요.', '‘홈 화면에 추가’를 선택해 주세요.', '‘추가’를 누르면 홈 화면에 아이콘이 생겨요.']
    };
    if (android) return {
      title: inApp ? 'Chrome에서 설치해 주세요' : '홈 화면에 오쭈다 설치하기',
      description: inApp ? '앱 안의 브라우저에서는 설치창이 뜨지 않을 수 있어요. 주소를 복사해 Chrome에서 열어 주세요.' :
        '설치창이 바로 뜨지 않으면 Chrome 메뉴에서 설치할 수 있어요.',
      steps: ['Chrome에서 오쭈다를 열고 메뉴(⋮)를 눌러 주세요.', '‘설치 및 바로가기 만들기’ 또는 ‘홈 화면에 추가’를 선택해 주세요.', '‘설치’를 눌러 마무리해 주세요. 이미 설치했다면 앱 목록에서 찾아 주세요.']
    };
    return {
      title: '오쭈다를 앱으로 설치하기', description: 'Chrome 또는 Edge에서 오쭈다를 열어 주세요.',
      steps: ['주소창의 설치 아이콘이나 브라우저 메뉴의 ‘앱 설치’를 선택해 주세요.', '설치를 확인하면 앱 목록에서 바로 실행할 수 있어요.']
    };
  }

  function showGuide(trigger) {
    const panel = ensureDialog();
    const content = guide();
    panel.querySelector('h2').textContent = content.title;
    panel.querySelector('#pwa-install-description').textContent = content.description;
    const list = panel.querySelector('ol');
    list.replaceChildren(...content.steps.map((step) => {
      const item = document.createElement('li');
      item.textContent = step;
      return item;
    }));
    list.hidden = content.steps.length === 0;
    panel.querySelector('[data-pwa-copy]').hidden = installed || isStandalone() || requested;
    panel.querySelector('.pwa-copy-status').textContent = '';
    if (!panel.open) {
      returnFocus = trigger || document.activeElement;
      if (typeof panel.showModal === 'function') panel.showModal();
      else { panel.setAttribute('open', ''); panel.setAttribute('aria-modal', 'true'); }
      panel.querySelector('[data-pwa-close]').focus();
    }
  }

  async function install(trigger) {
    if (prompting) return;
    if (installed || isStandalone() || requested || !deferredPrompt) { showGuide(trigger); return; }
    const prompt = deferredPrompt;
    deferredPrompt = null;
    prompting = true;
    refresh();
    try {
      // prompt() must run directly inside the user's click, before any await.
      const result = prompt.prompt();
      await result;
      const choice = await prompt.userChoice;
      if (choice?.outcome === 'accepted') requested = true;
    } catch (_) {
      showGuide(trigger);
    } finally {
      prompting = false;
      refresh();
    }
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    if (isStandalone() || installed) return;
    event.preventDefault();
    deferredPrompt = event;
    requested = false;
    refresh();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    requested = false;
    deferredPrompt = null;
    close();
    refresh();
  });
  for (const query of [displayMode, minimalMode]) {
    if (query.addEventListener) query.addEventListener('change', refresh);
    else query.addListener?.(refresh);
  }
  window.addEventListener('pageshow', refresh);

  document.addEventListener('click', (event) => {
    const target = event.target.closest?.('[data-pwa-install], [data-pwa-dismiss], [data-pwa-close], [data-pwa-copy]');
    if (!target) return;
    event.preventDefault();
    if (target.hasAttribute('data-pwa-install')) { void install(target); return; }
    if (target.hasAttribute('data-pwa-close')) { close(); return; }
    if (target.hasAttribute('data-pwa-dismiss')) {
      dismissed = true;
      try { sessionStorage.setItem(promoKey, '1'); } catch (_) {}
      refresh();
      return;
    }
    // Never copy the current URL: login callbacks may contain private tokens.
    const address = new URL('/world.html', location.origin).href;
    const status = dialog.querySelector('.pwa-copy-status');
    if (!navigator.clipboard?.writeText) { status.textContent = address; return; }
    navigator.clipboard.writeText(address).then(() => {
      status.textContent = '주소를 복사했어요. 브라우저 주소창에 붙여 넣어 주세요.';
    }).catch(() => { status.textContent = address; });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dialog?.open) { event.preventDefault(); close(); }
  });

  function registerWorker() {
    if (!window.isSecureContext || !('serviceWorker' in navigator)) return;
    // No unregister, account caches, reload, or worker changes under /star/.
    navigator.serviceWorker.register('/sw.js', {scope: '/', updateViaCache: 'none'}).catch(() => {});
  }
  if (document.readyState === 'complete') registerWorker();
  else window.addEventListener('load', registerWorker, {once: true});
  window.OjjudaPWA = Object.freeze({refresh, close});
  refresh();
})();
