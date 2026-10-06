/* Card features use World's navigation and one content viewport. */
(() => {
  'use strict';
  let hosted = false;
  try { hosted = parent !== window && parent.location.origin === location.origin && parent.location.pathname === '/world.html'; } catch {}
  const send = data => { if (hosted) parent.postMessage(data, location.origin); };
  const originalCanLeave = window.canCloseParkNote;
  let pendingAction = null, pendingDecoration = null, previousOverlay = null, previousBalance = null, reporting = false;
  const visible = selector => !!document.querySelector(selector);
  const overlayOpen = () => visible('.dialog-backdrop:not([hidden]), .nn-backdrop:not([hidden]), .note-photo-lightbox:not([hidden]), .world-picker:not([hidden]), .photo-source-menu, dialog[open]');

  function canLeave() {
    if (window.OjjudaShop?.canLeave?.() === false) { flashMessage('구매 결과를 확인 중이에요. 잠시만 기다려 주세요.'); return false; }
    if (window.OjjudaNoteSupport?.canLeave?.() === false) return false;
    if (window.OjjudaCharge?.canLeave?.() === false) {
      flashMessage('충전 결과를 확인 중이에요. 잠시만 기다려 주세요.'); return false;
    }
    if (managementBusy) { managementMessage.textContent = '저장이 끝날 때까지 기다려 주세요.'; return false; }
    return originalCanLeave?.() !== false;
  }
  window.canCloseParkNote = canLeave;

  function closeTopOverlay() {
    if (window.OjjudaShop?.isOpen?.()) { window.OjjudaShop.close(); return true; }
    if (window.OjjudaCharge?.isOpen?.()) { window.OjjudaCharge.close(); return true; }
    if (photoLightbox && !photoLightbox.hidden) { closePhotoLightbox(); return true; }
    if (worldPicker && !worldPicker.hidden) { closeWorldPicker(); return true; }
    if (sourceMenu) { closePhotoSourceMenu(true); return true; }
    if (notificationController?.isOpen?.()) { notificationController.close(); return true; }
    if (window.OjjudaNoteSupport?.isOpen?.()) { window.OjjudaNoteSupport.close(); return true; }
    if (!management.hidden) { closeManagement(); return true; }
    if (!backdrop.hidden) { if (canLeave()) closeComposer(); return true; }
    return false;
  }

  function back() {
    if (closeTopOverlay()) return true;
    if (document.body.classList.contains('note-my-open')) { window.OjjudaNoteNavigation?.leaveMy(); return true; }
    if (!detail.hidden) { goBack(); return true; }
    if (feedMode !== 'all') { selectCollection('all'); return true; }
    return false;
  }

  const actions = new Set(['feed', 'saved', 'mine', 'events', 'event-new', 'blocked', 'settings', 'member-info', 'compose', 'notifications', 'support', 'world', 'menu', 'board', 'library', 'glasses']);
  function navigate(action) {
    if (!actions.has(action)) return false;
    if (!authKnown && client && !['world', 'menu', 'board', 'library', 'glasses'].includes(action)) { pendingAction = action; return true; }
    if (!canLeave()) return false;
    // Existing close methods retain their own saving guards.
    window.OjjudaNoteSupport?.close?.();
    if (window.OjjudaNoteSupport?.isOpen?.()) return false;
    notificationController?.close?.();
    window.OjjudaCharge?.close?.();
    window.OjjudaShop?.close?.();
    closePhotoSourceMenu(); closeWorldPicker(null, false); closePhotoLightbox();
    if (!management.hidden) closeManagement();
    if (!backdrop.hidden) closeComposer();
    window.OjjudaNoteNavigation?.leaveMy();
    pendingAction = null;
    if (action === 'world' || action === 'menu' || action === 'board' || action === 'library') {
      if (hosted) send({ type: 'ojjuda:park-navigate', action });
      else location.assign('/world.html');
    } else if (action === 'glasses') location.assign('/park/glasses.html?embedded=1');
    else if (action === 'compose' || action === 'event-new') void openComposer(action === 'event-new' ? 'event' : 'new');
    else if (action === 'blocked') { selectCollection('all'); void showBlocks(); }
    else if (action === 'settings' || action === 'member-info') { selectCollection('all'); void showMemberInfo(); }
    else if (action === 'notifications') notificationController?.open?.();
    else if (action === 'support') window.OjjudaNoteSupport?.open?.();
    else void selectCollection(action === 'feed' ? 'all' : action);
    return true;
  }

  function useDecoration(key, userId) {
    if (!['card_stickers','card_fonts','card_foil'].includes(key) || !userId) return false;
    if (!authKnown && client) { pendingDecoration = {key,userId}; return true; }
    void useCardDecoration(key, userId).then(used => {
      if (!used) flashMessage('꾸미기를 적용하지 못했어요. 상점에서 다시 확인해 주세요.');
    }).catch(() => flashMessage('카드 작성창을 불러오지 못했어요. 다시 시도해 주세요.'));
    return true;
  }

  function reportState() {
    reporting = false;
    const open = overlayOpen();
    if (open !== previousOverlay) { previousOverlay = open; send({ type: 'ojjuda:park-state', overlayOpen: open }); }
    const userId = session?.user?.id;
    if (userId && Number.isSafeInteger(worldCoins) && worldCoins >= 0) {
      const key = `${userId}:${worldCoins}`;
      if (key !== previousBalance) { previousBalance = key; send({ type: 'ojjuda:park-balance', userId, coins: worldCoins }); }
    } else previousBalance = null;
    if (pendingAction && authKnown) { const action = pendingAction; pendingAction = null; navigate(action); }
    if (pendingDecoration && authKnown) { const next = pendingDecoration; pendingDecoration = null; useDecoration(next.key, next.userId); }
  }
  function scheduleReport() { if (!reporting) { reporting = true; queueMicrotask(reportState); } }
  new MutationObserver(scheduleReport).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'open'] });

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
    if (event.data?.type === 'ojjuda:park-host-ready') { previousOverlay = previousBalance = null; scheduleReport(); }
  });

  window.OjjudaNoteNavigation?.leaveMy();
  window.OjjudaParkFull = Object.freeze({ embedded: hosted, navigate, useDecoration, compose: () => navigate('compose'), back, canLeave, overlayOpen,
    refresh: () => overlayOpen()||!canLeave()?false:detail.hidden?loadFeed(false,true):refreshCards(true),
    refreshBalance: () => loadWorldBalance(session?.user?.id) });
  reportState();
  send({ type: 'ojjuda:park-ready' });
})();
