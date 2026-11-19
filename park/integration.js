/* Card features use World's navigation and one content viewport. */
(() => {
  'use strict';
  let hosted = false;
  try { hosted = parent !== window && parent.location.origin === location.origin && parent.location.pathname === '/world.html'; } catch {}
  const send = data => { if (hosted) parent.postMessage(data, location.origin); };
  const originalCanLeave = window.canCloseParkNote;
  let pendingAction = null, previousOverlay = null, previousComposer = null, previousDetail = null, previousNavigation = null, previousBalance = null, reporting = false, hostVisible = true;
  let settingsContext = false;
  let adminAccess = null, syncAdminSettings = () => {};
  const canOpenAdmin = () => hosted && !!session?.user?.id && adminAccess?.allowed === true && adminAccess.userId === session.user.id;
  function setAdminAccess(access) {
    adminAccess = access?.allowed === true && typeof access.userId === 'string'
      ? {userId: access.userId, allowed: true} : null;
    syncAdminSettings();
  }
  const visible = selector => !!document.querySelector(selector);
  const overlayOpen = () => visible('.dialog-backdrop:not([hidden]), .nn-backdrop:not([hidden]), .note-photo-lightbox:not([hidden]), dialog[open]');
  const composerOpen = () => visible('#composer-backdrop:not([hidden])');

  function canLeave() {
    if (window.OjjudaNoteSupport?.canLeave?.() === false) return false;
    if (window.OjjudaCharge?.canLeave?.() === false) {
      flashMessage('충전 결과를 확인 중이에요. 잠시만 기다려 주세요.'); return false;
    }
    if (managementBusy) { managementMessage.textContent = '저장이 끝날 때까지 기다려 주세요.'; return false; }
    return originalCanLeave?.() !== false;
  }
  window.canCloseParkNote = canLeave;

  function navigationAction() {
    if (management.hidden) settingsContext = false;
    if (settingsContext) return 'settings';
    return feedMode === 'saved' ? 'saved' : ['mine', 'events'].includes(feedMode) ? 'mine' : 'feed';
  }

  function showParkSettings() {
    if (!canLeave()) return;
    showManagement('공원 설정');
    settingsContext = true;
    const owner = session?.user?.id || null;
    const settings = node('div', 'park-settings');
    settings.setAttribute('data-park-settings-root', '');
    const group = title => {
      const section = node('section', 'park-settings-group');
      section.setAttribute('aria-label', title);
      section.append(node('h3', '', title));
      const list = node('div', 'park-settings-list');
      section.append(list); settings.append(section);
      return list;
    };
    const row = (container, id, label, action, className = '') => {
      const button = managementButton('', () => {
        if (!canLeave()) return;
        if (owner !== (session?.user?.id || null)) { showParkSettings(); return; }
        action();
      });
      button.className = `park-settings-row ${className}`.trim();
      button.dataset.parkSettings = id;
      const arrow = node('span', 'park-settings-arrow', '›'); arrow.setAttribute('aria-hidden', 'true');
      button.append(node('span', '', label), arrow); container.append(button);
      return button;
    };
    const link = (container, id, label, href, newTab = false) => {
      const anchor = node('a', 'park-settings-row');
      anchor.dataset.parkSettings = id; anchor.href = href;
      anchor.target = newTab ? '_blank' : '_top';
      if (newTab) anchor.rel = 'noopener';
      const arrow = node('span', 'park-settings-arrow', newTab ? '↗' : '›'); arrow.setAttribute('aria-hidden', 'true');
      anchor.append(node('span', '', label), arrow); container.append(anchor);
      return anchor;
    };
    const home = row(settings, 'world', '아지트 가기', () => navigate('world'), 'park-settings-home');
    home.prepend(icon('home'));
    const account = group('내 계정');
    if (owner) {
      row(account, 'member-info', '개인정보 관리', () => void showMemberInfo());
      row(account, 'nickname', '닉네임 변경', () => void showNicknameChange());
      row(account, 'password', '비밀번호 변경', showPasswordChange);
      row(account, 'blocked', '차단 관리', () => void showBlocks());
    } else {
      link(account, 'login', '로그인 · 회원가입', '/?auth=login&next=note');
    }
    const help = group('이용 안내');
    row(help, 'support', '문의·의견', () => navigate('support'));
    link(help, 'terms', '이용약관', '/terms.html?from=park', true);
    link(help, 'privacy', '개인정보처리방침', '/privacy.html?from=park', true);
    const apps = group('앱 다운로드');
    apps.classList.add('app-store-downloads');
    const pending = node('div', 'park-settings-row app-store-pending');
    pending.dataset.storeApp = 'agit';
    pending.setAttribute('role', 'group');
    pending.setAttribute('aria-label', '오쭈다 아지트 앱 공개 준비 중');
    const agitLabel = node('span', 'ojjuda-settings-label', '오쭈다 아지트');
    agitLabel.append(node('small', '', '앱 공개 준비 중'));
    const agitLink = node('a', 'app-store-action', '웹으로 열기 ↗');
    agitLink.href = '/world.html?tab=hub'; agitLink.target = '_top';
    agitLink.setAttribute('aria-label', '오쭈다 아지트 웹으로 열기');
    pending.append(agitLabel, agitLink); apps.append(pending);
    for (const [app, name] of [['pajang', '오쭈다 파장'], ['park', '오쭈다 공원']]) {
      const storeLink = link(apps, `app-${app}`, name, `https://play.google.com/store/apps/details?id=kr.ojjuda.${app}`, true);
      storeLink.dataset.storeApp = app;
      storeLink.rel = 'noopener noreferrer';
      storeLink.setAttribute('aria-label', `${name} Google Play에서 보기 (새 창)`);
    }
    apps.parentElement.append(node('p', 'app-store-note', '스토어 공개 후 설치할 수 있어요.'));
    if (owner) {
      const access = group('계정 관리');
      row(access, 'logout', '로그아웃', showAccountLogout);
    }
    let adminGroup = null;
    syncAdminSettings = () => {
      if (!settings.isConnected) return;
      if (!canOpenAdmin() || owner !== session?.user?.id) { adminGroup?.remove(); adminGroup = null; return; }
      if (adminGroup) return;
      const admin = group('관리자');
      adminGroup = admin.parentElement;
      row(admin, 'admin', '공원 관리자모드', () => navigate('admin'));
    };
    managementBody.append(settings);
    syncAdminSettings();
    if (owner) send({type:'ojjuda:park-admin-refresh', userId:owner});
    syncSettingsBack();
  }

  function syncSettingsBack() {
    const current = managementHeader.querySelector('[data-park-settings-back]');
    const child = settingsContext && !management.hidden && !managementBody.querySelector('[data-park-settings-root]');
    if (!child) { current?.remove(); return; }
    if (current) { current.disabled = managementBusy; return; }
    const button = managementButton('', () => { if (canLeave()) showParkSettings(); });
    button.className = 'icon-button park-settings-back';
    button.setAttribute('data-park-settings-back', '');
    button.setAttribute('aria-label', '공원 설정으로 돌아가기');
    button.disabled = managementBusy; button.append(icon('arrow'));
    managementHeader.prepend(button);
  }

  function closeTopOverlay() {
    if (window.OjjudaCharge?.isOpen?.()) { window.OjjudaCharge.close(); return true; }
    if (photoLightbox && !photoLightbox.hidden) { closePhotoLightbox(); return true; }
    if (notificationController?.isOpen?.()) { notificationController.close(); return true; }
    if (window.OjjudaNoteSupport?.isOpen?.()) { window.OjjudaNoteSupport.close(); return true; }
    if (!management.hidden) {
      if (settingsContext && !managementBody.querySelector('[data-park-settings-root]')) {
        if (canLeave()) showParkSettings();
      } else closeManagement();
      return true;
    }
    if (!backdrop.hidden) {
      if (document.querySelector('.composer')?.ojjudaTools?.close()) return true;
      if (canLeave()) closeComposer();
      return true;
    }
    return false;
  }

  function back() {
    if (closeTopOverlay()) return true;
    if (document.body.classList.contains('note-my-open')) { window.OjjudaNoteNavigation?.leaveMy(); return true; }
    if (!detail.hidden) { goBack(); return true; }
    if (feedMode !== 'all') { selectCollection('all'); return true; }
    return false;
  }

  function returnHome() {
    if (!authKnown || overlayOpen() || pendingAction) return false;
    initialCardId = initialKeepId = null;
    initialParkCompose = false;
    composerRun++;
    const latestFeed = feedMode === 'all' && feedSort === 'latest' && !feedTerm;
    feedSort = 'latest'; feedTerm = ''; tagTabReset?.();
    window.OjjudaNoteNavigation?.leaveMy();
    if (latestFeed) returnToFeed();
    else void selectCollection('all');
    return true;
  }

  const actions = new Set(['feed', 'saved', 'mine', 'events', 'event-new', 'blocked', 'settings', 'member-info', 'compose', 'notifications', 'support', 'world', 'menu', 'board', 'library', 'glasses', 'admin']);
  function navigate(action) {
    if (!actions.has(action)) return false;
    if (action === 'admin' && !canOpenAdmin()) return false;
    if (!authKnown && client && !['world', 'menu', 'board', 'library', 'glasses'].includes(action)) { pendingAction = action; return true; }
    if (!canLeave()) return false;
    // Existing close methods retain their own saving guards.
    window.OjjudaNoteSupport?.close?.();
    if (window.OjjudaNoteSupport?.isOpen?.()) return false;
    notificationController?.close?.();
    window.OjjudaCharge?.close?.();
    closePhotoLightbox();
    if (!management.hidden) closeManagement();
    if (!backdrop.hidden) closeComposer();
    window.OjjudaNoteNavigation?.leaveMy();
    pendingAction = null;
    settingsContext = false;
    if (action === 'world' || action === 'menu' || action === 'board' || action === 'library' || action === 'admin') {
      if (hosted) send({ type: 'ojjuda:park-navigate', action, ...(action === 'admin' ? {userId:session.user.id} : {}) });
      else location.assign('/world.html');
    } else if (action === 'glasses') location.assign('/park/glasses.html?embedded=1');
    else if (action === 'compose' || action === 'event-new') void openComposer(action === 'event-new' ? 'event' : 'new');
    else if (action === 'blocked') { selectCollection('all'); void showBlocks(); }
    else if (action === 'settings') showParkSettings();
    else if (action === 'member-info') {
      if (session?.user) { settingsContext = true; void showMemberInfo(); }
      else showParkSettings();
    }
    else if (action === 'notifications') notificationController?.open?.();
    else if (action === 'support') window.OjjudaNoteSupport?.open?.();
    else void selectCollection(action === 'feed' ? 'all' : action);
    return true;
  }

  function refresh() {
    if (overlayOpen() || !canLeave()) return false;
    if (detail.hidden) return loadFeed(false, true);
    return refreshVisibleCard();
  }

  function reportState() {
    reporting = false;
    if (!hostVisible) return;
    const open = overlayOpen();
    const writing = composerOpen();
    const cardOpen = !detail.hidden;
    const navigation = navigationAction();
    syncAdminSettings();
    syncSettingsBack();
    const compose = document.querySelector('.write-fab');if(compose&&compose.hidden!==cardOpen)compose.hidden=cardOpen;
    if (open !== previousOverlay || writing !== previousComposer || cardOpen !== previousDetail || navigation !== previousNavigation) {
      previousOverlay = open; previousComposer = writing; previousDetail = cardOpen; previousNavigation = navigation;
      send({ type: 'ojjuda:park-state', overlayOpen: open, composerOpen: writing, cardOpen, navigationAction: navigation });
    }
    const userId = session?.user?.id;
    if (userId && Number.isSafeInteger(worldCoins) && worldCoins >= 0) {
      const key = `${userId}:${worldCoins}`;
      if (key !== previousBalance) { previousBalance = key; send({ type: 'ojjuda:park-balance', userId, coins: worldCoins }); }
    } else previousBalance = null;
    if (pendingAction && authKnown) { const action = pendingAction; pendingAction = null; navigate(action); }
  }
  function scheduleReport() { if (hostVisible && !reporting) { reporting = true; queueMicrotask(reportState); } }
  new MutationObserver(scheduleReport).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'open'] });

  // Touch and trackpads scroll natively. A mouse drag must not open the card on release.
  let drag = null, suppressReplyClick = false;
  replies.addEventListener('pointerdown', event => {
    suppressReplyClick = false;
    if (event.pointerType !== 'mouse' || event.button !== 0 || replies.scrollWidth <= replies.clientWidth) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: replies.scrollLeft };
  });
  replies.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    if (!suppressReplyClick) {
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(event.clientY - drag.y)) return;
      replies.setPointerCapture(event.pointerId);
      replies.classList.add('is-dragging');
      suppressReplyClick = true;
    }
    event.preventDefault();
    replies.scrollLeft = drag.left - dx;
  });
  function endReplyDrag() {
    drag = null;
    replies.classList.remove('is-dragging');
  }
  replies.addEventListener('pointerup', endReplyDrag);
  replies.addEventListener('pointercancel', endReplyDrag);
  replies.addEventListener('lostpointercapture', endReplyDrag);
  replies.addEventListener('pointerleave', () => { if (!suppressReplyClick) endReplyDrag(); });
  replies.addEventListener('dragstart', event => { if (drag) event.preventDefault(); });
  replies.addEventListener('click', event => {
    if (suppressReplyClick && event.detail) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressReplyClick = false;
    }
  }, true);
  replies.addEventListener('scroll', () => {
    const next = replies.lastElementChild;
    if (next?.hasAttribute('data-more-replies') && !next.disabled &&
        replies.scrollWidth - replies.scrollLeft - replies.clientWidth < replies.clientWidth / 2) next.click();
  }, { passive: true });

  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]'); if (!link) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    if (link.matches('.brand')) { event.preventDefault(); navigate('feed'); return; }
    if (url.pathname === '/world.html' && !url.search) { event.preventDefault(); navigate('world'); return; }
    if (url.pathname === '/world.html' || url.pathname === '/' || url.pathname === '/guide.html') {
      event.preventDefault();
      if (canLeave()) (hosted ? parent : window).location.assign(url.pathname + url.search + url.hash);
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !overlayOpen()) return;
    if (closeTopOverlay()) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  addEventListener('message', event => {
    if (!hosted || event.origin !== location.origin || event.source !== parent) return;
    if (event.data?.type === 'ojjuda:park-visibility') {
      hostVisible = event.data.visible === true;
      if (hostVisible) { previousOverlay = previousComposer = previousDetail = previousNavigation = previousBalance = null; scheduleReport(); }
      return;
    }
    if (event.data?.type === 'ojjuda:park-host-ready') { previousOverlay = previousComposer = previousDetail = previousNavigation = previousBalance = null; scheduleReport(); }
  });
  addEventListener('pagehide', () => {
    send({ type: 'ojjuda:park-state', overlayOpen: false, composerOpen: false, cardOpen: false, navigationAction: 'feed' });
    previousOverlay = previousComposer = previousDetail = previousNavigation = null;
  });
  addEventListener('pageshow', scheduleReport);

  // The parent Hub counts a mission only after the card RPC has succeeded.
  document.addEventListener('ojjuda:card-published', event => {
    const detail = event.detail;
    if (!hosted || !detail || detail.userId !== session?.user?.id || typeof detail.cardId !== 'string') return;
    send({ type: 'ojjuda:park-card-published', userId: detail.userId, cardId: detail.cardId });
  });

  window.OjjudaNoteNavigation?.leaveMy();
  window.OjjudaParkFull = Object.freeze({ embedded: hosted, navigate, navigationAction, returnHome, setAdminAccess, compose: () => navigate('compose'), back, canLeave, overlayOpen, composerOpen, cardOpen:()=>!detail.hidden,
    refresh,
    refreshBalance: () => loadWorldBalance(session?.user?.id) });
  reportState();
  send({ type: 'ojjuda:park-ready' });
})();
