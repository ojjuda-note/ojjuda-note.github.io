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
        historyTransition(action);
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
    link(help, 'terms', '이용약관', '/terms.html?from=park');
    link(help, 'privacy', '개인정보처리방침', '/privacy.html?from=park');
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
      row(access, 'delete-account', '회원 탈퇴', () => void showAccountDeletion(), 'park-settings-danger');
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
    const button = managementButton('', () => { if (canLeave() && !historyBack()) historyTransition(showParkSettings); });
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
    if (historyBack()) return true;
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

  // The iframe owns its cards, collections and settings history. The World shell
  // records only its own pages so one Back never consumes both histories.
  const historyKey = 'ojjudaParkRoute';
  let pendingHistoryRestore=history.state?.[historyKey] || null;
  const historyScope = pendingHistoryRestore?.scope || Math.random().toString(36).slice(2);
  const managementViews = {
    '공원 설정':'settings', '내 회원정보':'member-info', '닉네임 변경':'nickname',
    '비밀번호 변경':'password', '공원 차단 목록':'blocked', '로그아웃':'logout', '회원 탈퇴':'delete-account'
  };
  let historyDepth = 0, historyRestoring = false, historyPending = false, historyReverting = false, historyAllowed = false, historyDeparting = false, historySequence = pendingHistoryRestore?.index || 0;
  let historyQueued = null;
  const historyRoute = () => ({
    scope:historyScope, owner:session?.user?.id || null, index:historySequence,
    mode:feedMode, sort:feedSort, term:feedTerm,
    card:!detail.hidden ? stack.at(-1) || null : null,
    my:document.body.classList.contains('note-my-open'),
    view:window.OjjudaCharge?.isOpen?.() ? 'charge' : photoLightbox && !photoLightbox.hidden ? 'photo' :
      !management.hidden ? managementViews[managementTitle.textContent] || 'overlay' :
      !backdrop.hidden ? 'composer' : notificationController?.isOpen?.() ? 'notifications' :
      window.OjjudaNoteSupport?.isOpen?.() ? 'support' : visible('dialog[open]') ? 'dialog' : null,
    top:window.scrollY
  });
  const historyIdentity = route => JSON.stringify([route?.owner,route?.mode,route?.sort,route?.term,route?.card,route?.my,route?.view]);
  function historyState(route, state=history.state) {
    return {...state, noteMy:route.my, [historyKey]:route};
  }
  function historyTransition(action) {
    if (historyDeparting) return false;
    if (historyRestoring || historyDepth) return action();
    if (historyPending) { historyQueued=action; return true; }
    const previous=historyRoute(), oldHref=location.href;
    // My's capture listener has already hidden its DOM, while this history
    // entry still identifies the previous settings screen.
    if (history.state?.noteMy === true) previous.my=true;
    const oldState=historyState(previous);
    history.replaceState(oldState,'',oldHref);
    historyDepth++;
    let result;
    try { result=action(); } finally { historyDepth--; }
    const next=historyRoute(), nextHref=location.href, nextState=history.state;
    if (historyIdentity(previous)!==historyIdentity(next)) {
      history.replaceState(oldState,'',oldHref);
      next.index=++historySequence;
      history.pushState(historyState(next,nextState), '', nextHref);
    } else history.replaceState(historyState(next), '', nextHref);
    return result;
  }
  function historyBack() {
    if (historyDeparting) return true;
    const route=history.state?.[historyKey];
    if (!route || route.scope!==historyScope || route.index<1) return false;
    if (historyPending) return true;
    if (!canLeave()) return true;
    if (!backdrop.hidden && document.querySelector('.composer')?.ojjudaTools?.close()) return true;
    historyPending=true;historyAllowed=true;history.back();return true;
  }
  function restoreHistory(route) {
    historyRestoring=true;
    try {
      const sameOwner=route.owner===(session?.user?.id || null);
      const preserveComposer=sameOwner && route.view==='composer' && !backdrop.hidden;
      notificationController?.close?.();window.OjjudaNoteSupport?.close?.();window.OjjudaCharge?.close?.();
      closePhotoLightbox();if (!backdrop.hidden && !preserveComposer) closeComposer();
      for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
      if (!management.hidden) closeManagement();
      const mode=sameOwner&&['all','saved','mine','events'].includes(route.mode)?route.mode:'all';
      const sort=['latest','popular','nearby'].includes(route.sort)?route.sort:'latest';
      const term=sameOwner&&typeof route.term==='string'?route.term:'';
      const changed=feedMode!==mode || feedSort!==sort || feedTerm!==term;
      feedSort=sort;feedTerm=term;
      if (changed) void selectCollection(mode);
      const card=sameOwner&&validCardId(route.card)?route.card:null;
      if (card) {stack.splice(0,stack.length,card);void renderDetail();}
      else returnToFeed(false,feedReturnPoint);
      window.OjjudaNoteNavigation?.showMy?.(sameOwner&&route.my===true);
      settingsContext=sameOwner&&['settings','member-info','nickname','password','blocked','logout','delete-account'].includes(route.view);
      if (sameOwner) {
        const views={settings:showParkSettings,'member-info':showMemberInfo,nickname:showNicknameChange,password:showPasswordChange,blocked:showBlocks,logout:showAccountLogout,'delete-account':showAccountDeletion};
        if (Object.hasOwn(views,route.view)) void views[route.view]();
        else if (route.view==='notifications') notificationController?.open?.();
        else if (route.view==='support') window.OjjudaNoteSupport?.open?.();
        // Completed writes, payments and confirmations are never replayed.
      }
      historySequence=route.index;
      const restored={...route,scope:historyScope};
      if (['overlay','photo','charge','dialog'].includes(restored.view) || (restored.view==='composer'&&!preserveComposer)) restored.view=null;
      if (preserveComposer) lockPage(true);
      const url=new URL(location.href);if(card)url.searchParams.set('card',card);else url.searchParams.delete('card');
      history.replaceState(historyState(restored),'',url);
      requestAnimationFrame(()=>window.scrollTo({top:Math.max(0,Number(route.top)||0),behavior:'auto'}));
    } finally {historyRestoring=false;}
  }
  const originalSelectCollection=selectCollection,originalOpenCard=openCard;
  selectCollection=(...args)=>historyTransition(()=>originalSelectCollection(...args));
  openCard=(...args)=>historyTransition(()=>originalOpenCard(...args));
  window.OjjudaParkHistory=Object.freeze({
    isTransition:()=>historyDepth>0 || historyRestoring,
    handles:state=>!!state?.[historyKey],
    closeOverlay:()=>!management.hidden && historyBack(),
    snapshot:historyRoute, transition:historyTransition
  });
  history.replaceState(historyState(pendingHistoryRestore || historyRoute()),'',location.href);
  window.addEventListener('pagehide',()=>{
    historyDeparting=true;historyPending=false;historyReverting=false;historyAllowed=false;historyQueued=null;
  },{capture:true});
  window.addEventListener('pageshow',event=>{
    historyDeparting=false;historyPending=false;historyReverting=false;
    if(event.persisted)pendingHistoryRestore=history.state?.[historyKey] || null;
  },{capture:true});
  window.addEventListener('popstate',event=>{
    if (historyDeparting) return;
    const route=event.state?.[historyKey];
    if (!route) return;
    historyPending=false;
    if (historyReverting) {historyReverting=false;historyAllowed=false;return;}
    const allowed=historyAllowed;historyAllowed=false;
    if (!allowed && route.index<historySequence && !backdrop.hidden && document.querySelector('.composer')?.ojjudaTools?.close()) {
      historyPending=true;historyReverting=true;history.go(historySequence-route.index);return;
    }
    if (!allowed && !canLeave()) {
      historyPending=true;historyReverting=true;
      history.go(historySequence-route.index || 1);
      return;
    }
    restoreHistory(route);
    const action=historyQueued;historyQueued=null;
    if(action)historyTransition(action);
  },true);

  function restoreNavigation(route) {
    if (historyDeparting) return false;
    if (!route || typeof route!=='object') return false;
    const sameFrame=route.scope===historyScope;
    const index=sameFrame&&Number.isSafeInteger(route.index)&&route.index>=0?route.index:0;
    const next={...route,scope:historyScope,index};
    pendingHistoryRestore=next;historySequence=index;
    history.replaceState(historyState(next),'',location.href);
    if (authKnown) {pendingHistoryRestore=null;restoreHistory(next);}
    return true;
  }

  function observeHistory() {
    if (historyDeparting || !hostVisible) return;
    if (historyRestoring || historyDepth || historyPending) return;
    if (pendingHistoryRestore) {
      if (!authKnown) return;
      const route=pendingHistoryRestore;pendingHistoryRestore=null;
      restoreHistory(route);return;
    }
    const previous=history.state?.[historyKey],next=historyRoute();
    if (!previous || historyIdentity(previous)===historyIdentity(next)) return;
    if (previous.owner!==next.owner) {
      history.replaceState(historyState(next),'',location.href);return;
    }
    // Async account checks can open a composer after navigate() has returned.
    // Its entry is still recorded before Back may leave the iframe.
    if (next.view && next.view!==previous.view) {
      next.index=++historySequence;
      history.pushState(historyState(next),'',location.href);
    } else if (previous.view && !next.view && previous.card===next.card && previous.mode===next.mode) {
      if (!historyBack()) history.replaceState(historyState(next),'',location.href);
    } else history.replaceState(historyState(next),'',location.href);
  }

  const actions = new Set(['feed', 'saved', 'mine', 'events', 'event-new', 'blocked', 'settings', 'member-info', 'compose', 'notifications', 'support', 'world', 'menu', 'board', 'library', 'glasses', 'admin']);
  function navigate(action) { return historyTransition(() => performNavigate(action)); }
  function performNavigate(action) {
    if (!actions.has(action)) return false;
    if (action === 'admin' && !canOpenAdmin()) return false;
    if (!authKnown && client && !['world', 'menu', 'board', 'library', 'glasses'].includes(action)) { pendingAction = action; return true; }
    if (!canLeave()) return false;
    // The host records the screen being left. Keep the child route intact until
    // the host hides it, so Back from Agit/admin restores these same settings.
    if (['world','menu','board','library','admin'].includes(action)) {
      pendingAction=null;
      if (hosted) send({type:'ojjuda:park-navigate',action,...(action==='admin'?{userId:session.user.id}:{})});
      else location.assign('/world.html');
      return true;
    }
    if (action==='glasses') {pendingAction=null;location.assign('/park/glasses.html?embedded=1');return true;}
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
    if (action === 'compose' || action === 'event-new') void openComposer(action === 'event-new' ? 'event' : 'new');
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
    if (historyDeparting || !hostVisible) return;
    observeHistory();
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
    if (back()) { event.preventDefault(); event.stopImmediatePropagation(); }
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
    refresh, navigationSnapshot:historyRoute, restoreNavigation,
    refreshBalance: () => loadWorldBalance(session?.user?.id) });
  reportState();
  send({ type: 'ojjuda:park-ready' });
})();
