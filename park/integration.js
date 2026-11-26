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
  const guestEntry = document.getElementById('park-guest-entry');
  function syncGuestEntry() {
    if (!guestEntry) return;
    // Use the feed's resolved identity and route; never flash a guest gate while
    // Auth is loading or interrupt a card, account screen, or compose deep link.
    const show = authKnown && !session?.user && feedMode === 'all' && !feedTerm && !feed.hidden
      && detail.hidden && management.hidden && !document.body.classList.contains('note-my-open')
      && !initialCardId && !initialParkCompose && !composerOpen();
    if (guestEntry.hidden === show) guestEntry.hidden = !show;
  }
  document.getElementById('park-entry-browse')?.addEventListener('click', () => {
    if (!guestEntry || guestEntry.hidden || feed.hidden) return;
    list.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });

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
    const owner = session?.user?.is_anonymous ? null : session?.user?.id || null;
    const settings = node('div', 'park-settings ojjuda-settings');
    settings.setAttribute('data-park-settings-root', '');
    const serviceBanners = document.createElement('ojjuda-service-banners');
    serviceBanners.setAttribute('current', 'park');
    serviceBanners.addEventListener('click', event => {
      const anchor = event.target.closest?.('a[href]');
      if (!anchor) return;
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) { event.stopPropagation(); return; }
      if (!canLeave()) { event.preventDefault(); event.stopPropagation(); return; }
      const url = new URL(anchor.href, location.href);
      if (hosted && url.origin === location.origin && url.pathname === '/world.html' && url.searchParams.get('tab') === 'hub') {
        event.preventDefault(); event.stopPropagation(); navigate('world');
      }
    });
    const group = title => {
      const section = node('section', 'park-settings-group ojjuda-settings-group');
      section.setAttribute('aria-label', title);
      section.append(node('h3', 'ojjuda-settings-heading', title));
      const list = node('div', 'park-settings-list ojjuda-settings-list');
      section.append(list);
      settings.insertBefore(section, serviceBanners.parentNode === settings ? serviceBanners : null);
      return list;
    };
    const row = (container, id, label, action) => {
      const button = managementButton('', () => {
        if (!canLeave()) return;
        if (owner !== (session?.user?.id || null)) { showParkSettings(); return; }
        historyTransition(action);
      });
      button.className = 'park-settings-row ojjuda-settings-row';
      button.dataset.parkSettings = id;
      const arrow = node('span', 'park-settings-arrow ojjuda-settings-arrow', '›'); arrow.setAttribute('aria-hidden', 'true');
      button.append(node('span', 'ojjuda-settings-label', label), arrow); container.append(button);
      return button;
    };
    const link = (container, id, label, href, newTab = false) => {
      const anchor = node('a', 'park-settings-row ojjuda-settings-row');
      anchor.dataset.parkSettings = id; anchor.href = href;
      anchor.target = newTab ? '_blank' : '_top';
      if (newTab) anchor.rel = 'noopener';
      const arrow = node('span', 'park-settings-arrow ojjuda-settings-arrow', newTab ? '↗' : '›'); arrow.setAttribute('aria-hidden', 'true');
      anchor.append(node('span', 'ojjuda-settings-label', label), arrow); container.append(anchor);
      return anchor;
    };
    const disclosure = (container, title) => {
      const details = node('details', 'ojjuda-settings-details');
      const summary = node('summary', 'park-settings-row ojjuda-settings-row');
      const arrow = node('span', 'ojjuda-settings-arrow', '›');
      arrow.setAttribute('aria-hidden', 'true');
      summary.append(node('span', 'ojjuda-settings-label', title), arrow);
      const body = node('div', 'ojjuda-settings-body');
      details.append(summary, body);
      container.append(details);
      return body;
    };
    const account = group('내 정보');
    if (owner) {
      const profile = disclosure(account, '프로필·계정정보');
      if (!parkJunior()) row(profile, 'profile', '프로필 수정', () => void window.OjjudaParkAccount.profile());
      row(profile, 'member-info', '개인정보 관리', () => void showMemberInfo());
      if (!parkJunior()) row(profile, 'nickname', '닉네임 변경', () => void showNicknameChange());
      row(profile, 'password', '비밀번호 변경', showPasswordChange);
      row(profile, 'logout', '로그아웃', showAccountLogout);
      if (!parkJunior()) row(account, 'friends', '친구 관리', () => void window.OjjudaParkFriends.open());
    } else {
      account.className = 'ojjuda-guest-account';
      account.dataset.guestAccount = 'park';
      account.setAttribute('role', 'group');
      account.setAttribute('aria-label', '회원가입 및 로그인');
      const actions = node('div', 'ojjuda-guest-account-actions');
      for (const [mode, label] of [['signup', '회원가입'], ['login', '로그인']]) {
        const anchor = link(actions, mode, label, `/?auth=${mode}&next=note`);
        anchor.className = `ojjuda-guest-account-${mode}`;
        anchor.textContent = label;
      }
      account.append(actions);
    }
    const apps = group('앱 다운로드');
    apps.classList.add('app-store-downloads');
    const agitLink = link(apps, 'app-agit', '오쭈다 아지트 테스트 참여', 'https://play.google.com/apps/testing/kr.ojjuda.agit?hl=ko', true);
    agitLink.dataset.storeApp = 'agit';
    agitLink.rel = 'noopener noreferrer';
    agitLink.setAttribute('aria-label', '오쭈다 아지트 비공개 테스트 참여 (새 창)');
    
    for (const [app, name] of [['pajang', '오쭈다 파장'], ['park', '오쭈다 공원']]) {
      const storeLink = link(apps, `app-${app}`, `${name} 테스트 참여`, `https://play.google.com/apps/testing/kr.ojjuda.${app}?hl=ko`, true);
      storeLink.dataset.storeApp = app;
      storeLink.rel = 'noopener noreferrer';
      storeLink.setAttribute('aria-label', `${name} 비공개 테스트 참여 (새 창)`);
    }
    const appStoreNote = node('p', 'app-store-note');
    appStoreNote.append(document.createTextNode('앱 이름을 누르면 해당 앱의 비공개 테스트 참여 페이지가 열립니다. 참여를 완료한 뒤 Google Play에서 설치할 수 있습니다.'));
    apps.parentElement.append(appStoreNote);
    const preferences = group('이용 설정');
    if (owner) {
      if (!parkJunior()) row(preferences, 'friend-alert', '친구 신청 알림', () => window.OjjudaParkAccount.alerts());
      row(preferences, 'blocked', '차단 관리', () => void showBlocks());
    } else {
      preferences.append(node('p', 'management-help', '로그인하면 친구 신청 알림과 차단 목록을 관리할 수 있어요.'));
    }
    const help = group('활동·도움');
    const glasses = disclosure(help, '스마트 글라스');
    link(glasses, 'even-g2', '이븐리얼리티 G2', '/park/even-g2.html');
    link(glasses, 'rokid-glasses', '로키드 AI 글라스 1', '/park/rokid-glasses.html');
    if (!parkJunior()) {
      const charge = row(help, 'charge', '쭈 충전', () => window.OjjudaCharge?.open?.());
      charge.setAttribute('aria-haspopup', 'dialog');
      charge.setAttribute('aria-controls', 'ju-charge-dialog');
    }
    row(help, 'support', '문의·의견', () => navigate('support'));
    const helpBody = disclosure(help, '도움말');
    link(helpBody, 'guide', '사용법', '/guide.html?from=park');
    link(helpBody, 'creator', '제작자 소개', '/features/guide/creator.html?from=park');
    link(helpBody, 'organization', '조직도', '/features/organization/?from=park');
    link(help, 'terms', '이용약관', '/terms.html?from=park');
    link(help, 'privacy', '개인정보처리방침', '/privacy.html?from=park');
    const versions = disclosure(help, '버전 정보');
    versions.parentElement.addEventListener('toggle', async () => {
      if (!versions.parentElement.open) return;
      const releases = [['아지트', '/version.json'], ['오락실', '/features/arcade/version.json'], ['공원', '/park/version.json']];
      const lines = await Promise.all(releases.map(async ([name, path]) => {
        try {
          const response = await fetch(path, {cache: 'no-cache'});
          if (!response.ok) throw new Error();
          const {version} = await response.json();
          if (typeof version !== 'string' || !version) throw new Error();
          return node('p', '', name + ' ' + version);
        } catch { return node('p', '', name + ' 버전을 확인할 수 없어요.'); }
      }));
      versions.replaceChildren(...lines);
    });
    let adminGroup = null;
    syncAdminSettings = () => {
      if (!settings.isConnected) return;
      const standaloneModerator = !hosted && !!owner && moderator === true;
      if ((!canOpenAdmin() && !standaloneModerator) || owner !== session?.user?.id) { adminGroup?.remove(); adminGroup = null; return; }
      if (adminGroup) return;
      const admin = group('관리자');
      adminGroup = admin.parentElement;
      const entry = link(admin, 'admin', '공원 관리자모드', '/admin/?from=park&admin=cards');
      entry.addEventListener('click', event => {
        if (owner !== session?.user?.id || !(canOpenAdmin() || (!hosted && moderator === true)) || !canLeave()) event.preventDefault();
      });
    };
    settings.append(serviceBanners);
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
    if (window.OjjudaParkAccount?.dialogOpen()) { window.OjjudaParkAccount.closeDialog(); return true; }
    if (historyBack()) return true;
    if (closeTopOverlay()) return true;
    if (document.body.classList.contains('note-my-open')) { window.OjjudaNoteNavigation?.leaveMy(); return true; }
    if (!detail.hidden) { goBack(); return true; }
    if (feedMode !== 'all') { selectCollection('all'); return true; }
    return false;
  }

  function returnHome() {
    if (!authKnown || pendingAction || !canLeave() || window.OjjudaParkAccount?.closeDialog() === false) return false;
    initialCardId = initialKeepId = null;
    initialParkCompose = false;
    composerRun++;
    // An explicit new Park visit can reuse a frame with retained settings.
    // World records that visit; replace this child view without a ghost step.
    restoreHistory({...historyRoute(),mode:'all',sort:'latest',term:'',card:null,my:false,view:null});
    tagTabReset?.();
    return true;
  }

  // The iframe owns its cards, collections and settings history. The World shell
  // records only its own pages so one Back never consumes both histories.
  const historyKey = 'ojjudaParkRoute';
  let pendingHistoryRestore=history.state?.[historyKey] || null;
  const historyScope = pendingHistoryRestore?.scope || Math.random().toString(36).slice(2);
  const managementViews = {
    '프로필 수정':'profile', '친구 관리':'friends', '친구 신청 알림':'friend-alert',
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
    view:window.OjjudaParkAccount?.dialogOpen() ? 'account-dialog' : window.OjjudaCharge?.isOpen?.() ? 'charge' : photoLightbox && !photoLightbox.hidden ? 'photo' :
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
  function historyBack(alreadyClosed = false) {
    if (historyDeparting) return true;
    const route=history.state?.[historyKey];
    if (!route || route.scope!==historyScope || route.index<1) return false;
    if (historyPending) return true;
    if (!alreadyClosed && !canLeave()) return true;
    if (!backdrop.hidden && document.querySelector('.composer')?.ojjudaTools?.close()) return true;
    historyPending=true;historyAllowed=true;history.back();return true;
  }
  function restoreHistory(route) {
    if (window.OjjudaParkAccount?.closeDialog() === false) return;
    // Old standalone history entries must not reopen the retired My dashboard.
    if (!hosted && route.my) route={...route,my:false,view:route.view || 'settings'};
    historyRestoring=true;
    try {
      const sameOwner=route.owner===(session?.user?.id || null);
      // Returning from a photo or message dialog keeps the form and its unsaved text.
      if (sameOwner && !management.hidden && route.view === managementViews[managementTitle.textContent] && route.index < historySequence) {
        historySequence = route.index;
        return;
      }
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
      settingsContext=sameOwner&&['settings','profile','friends','friend-alert','member-info','nickname','password','blocked','logout'].includes(route.view);
      if (sameOwner) {
        const views={settings:showParkSettings,profile:window.OjjudaParkAccount?.profile,friends:window.OjjudaParkFriends?.open,'friend-alert':window.OjjudaParkAccount?.alerts,'member-info':showMemberInfo,nickname:showNicknameChange,password:showPasswordChange,blocked:showBlocks,logout:showAccountLogout,'delete-account':showAccountDeletion};
        if (parkJunior() && ['friends','friend-alert','profile','nickname'].includes(route.view)) showParkSettings();
        else if (Object.hasOwn(views,route.view) && typeof views[route.view] === 'function') void views[route.view]();
        else if (route.view==='notifications') notificationController?.open?.();
        else if (route.view==='support') window.OjjudaNoteSupport?.open?.();
        // Completed writes, payments and confirmations are never replayed.
      }
      historySequence=route.index;
      const restored={...route,scope:historyScope};
      if (['overlay','photo','charge','dialog','account-dialog'].includes(restored.view) || (restored.view==='composer'&&!preserveComposer)) restored.view=null;
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
    if ((!allowed && !canLeave()) || (window.OjjudaParkAccount?.dialogOpen() && !window.OjjudaParkAccount.closeDialog())) {
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
    if (!route || typeof route!=='object' || window.OjjudaParkAccount?.closeDialog() === false) return false;
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
    if (previous.view === 'account-dialog' && next.view !== previous.view) {
      if (!historyBack(true)) history.replaceState(historyState(next),'',location.href);
    } else if (next.view && next.view!==previous.view) {
      next.index=++historySequence;
      history.pushState(historyState(next),'',location.href);
    } else if (previous.view && !next.view && previous.card===next.card && previous.mode===next.mode) {
      // The popup's own close handler has already approved this dismissal.
      // In-flight charges may outlive their dialog; re-running their leave
      // guard here would repeatedly mutate the busy notice from this observer.
      if (!historyBack(true)) history.replaceState(historyState(next),'',location.href);
    } else history.replaceState(historyState(next),'',location.href);
  }

  const actions = new Set(['feed', 'saved', 'mine', 'events', 'event-new', 'blocked', 'settings', 'friends', 'member-info', 'compose', 'notifications', 'support', 'world', 'menu', 'board', 'library', 'glasses', 'admin']);
  function navigate(action) { return historyTransition(() => performNavigate(action)); }
  function performNavigate(action) {
    if (!actions.has(action) || window.OjjudaParkAccount?.closeDialog() === false) return false;
    if (action === 'admin') {
      if (!(canOpenAdmin() || (!hosted && session?.user && moderator === true)) || !canLeave()) return false;
      (hosted ? parent : window).location.assign('/admin/?from=park&admin=cards');
      return true;
    }
    if (['menu','board','library'].includes(action) && !hosted) action = 'feed';
    if (!authKnown && client && !['world', 'menu', 'board', 'library', 'glasses'].includes(action)) { pendingAction = action; return true; }
    if (!canLeave()) return false;
    // The host records the screen being left. Keep the child route intact until
    // the host hides it, so Back from Agit/admin restores these same settings.
    if (['world','menu','board','library'].includes(action)) {
      pendingAction=null;
      if (hosted) send({type:'ojjuda:park-navigate',action});
      else location.assign('/world.html?tab=hub');
      return true;
    }
    if (action==='glasses') {pendingAction=null;location.assign('/park/glasses.html'+(hosted?'?embedded=1':''));return true;}
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
    else if (action === 'friends') {
      if (session?.user && !parkJunior()) { settingsContext = true; void window.OjjudaParkFriends.open(); }
      else showParkSettings();
    }
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
    syncGuestEntry();
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
    if (event.defaultPrevented || link.closest('ojjuda-service-banners') || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (url.pathname === '/' || url.pathname === '/guide.html' || url.pathname === '/features/organization/') {
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
    if (!detail || detail.userId !== session?.user?.id || typeof detail.cardId !== 'string') return;
    if (!hosted) {
      // The standalone Park returns this one successful publication receipt to
      // the member's Agit mission on the next visit, without another feed read.
      try {
        const date = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
        sessionStorage.setItem('ojjuda:agit-park-card:' + detail.userId,
          JSON.stringify({cardId: detail.cardId, date}));
      } catch {}
      return;
    }
    send({ type: 'ojjuda:park-card-published', userId: detail.userId, cardId: detail.cardId });
  });

  window.OjjudaNoteNavigation?.leaveMy();
  window.OjjudaParkFull = Object.freeze({ embedded: hosted, navigate, navigationAction, returnHome, setAdminAccess, compose: () => navigate('compose'), back, canLeave, overlayOpen, composerOpen, cardOpen:()=>!detail.hidden,
    refresh, navigationSnapshot:historyRoute, restoreNavigation,
    refreshBalance: () => loadWorldBalance(session?.user?.id) });
  // Legacy bookmark into Park settings also works without the World host.
  if (!hosted && new URL(location.href).searchParams.get('view') === 'settings') pendingAction = 'settings';
  reportState();
  send({ type: 'ojjuda:park-ready' });
})();

