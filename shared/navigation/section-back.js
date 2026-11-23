/* Preserve visited pages; use the owning section only for a direct entry. */
(() => {
  'use strict';
  if (window !== window.top) return; // The World shell owns Back for embedded pages.
  if (window.OjjudaSectionNavigation) return;

  const script = document.currentScript;
  const from = new URLSearchParams(location.search).get('from');
  const destinations = {
    hub: '/world.html?tab=hub',
    arcade: '/world.html?tab=arcade',
    park: '/park/',
    my: '/world.html?tab=my',
    pajang: '/features/pajang/station.html?tab=profile',
    admin: '/world.html?admin=overview' + (['park','pajang'].includes(from) ? '&from=' + from : '')
  };
  const section = script?.dataset.returnTo === 'admin' ? 'admin' : Object.hasOwn(destinations, from) ? from : script?.dataset.returnTo;
  const destination = destinations[section] || destinations.hub;
  const labels = { hub: '아지트로', arcade: '오락실로', park: '공원으로', my: '설정으로', pajang: '내 파장으로', admin: '관리자 모드로' };
  function hasPreviousPage() {
    // Navigation entries, when available, distinguish a same-site new tab from
    // a real previous page. history.length alone can include external sites.
    try {
      const navigation = window.navigation;
      const index = navigation?.currentEntry?.index;
      if (Number.isInteger(index) && navigation.entries) {
        const previous = navigation.entries().find(entry => entry.index === index - 1);
        return !!previous?.url && new URL(previous.url).origin === new URL(location.href).origin;
      }
      return history.length > 1 && !!document.referrer &&
        new URL(document.referrer).origin === new URL(location.href).origin;
    } catch { return false; }
  }
  const previousPage = hasPreviousPage();
  for (const returnLink of document.querySelectorAll('[data-section-return]')) {
    returnLink.href = destination;
    const label = returnLink.querySelector('[data-section-return-label]');
    if (label) label.textContent = previousPage ? '이전 화면으로 돌아가기' : `${labels[section] || labels.hub} 돌아가기`;
  }
  const marker = 'ojjudaSectionBack';
  const exitMarker = 'ojjudaSectionExit';
  let guarded = !!history.state?.[marker];
  const dialogMarker = 'ojjudaPublicDialog';
  const dialogs = new Map(), watchedDialogs = new WeakSet();
  let dialogSequence = 0, activeDialog = null, restoringDialog = false, departing = false, discardingDialog = false;
  const back = () => {
    if (discardingDialog) return;
    if (previousPage || guarded) history.back();
    else location.replace(destination);
  };
  function discardClosedDialog() {
    const id = history.state?.[dialogMarker];
    if (!id || departing || discardingDialog || dialogs.get(id)?.dialog.open) return;
    // Reloads lose reopen callbacks, and pagehide can release a media viewer.
    // Consume only that marked overlay, retaining the real page and anchors.
    if (history.length > 1) {
      discardingDialog = true;
      history.back();
    } else {
      const clean = {...history.state};
      delete clean[dialogMarker];
      history.replaceState(clean, '', location.href);
      activeDialog = null;
    }
  }
  // Public photo/video viewers opt in with their own reopen callback so Back
  // closes the viewer and Forward can recreate released media correctly.
  function openDialog(dialog, reopen) {
    if (restoringDialog || !dialog.open || departing) return;
    if (dialogs.get(activeDialog)?.dialog === dialog) return;
    const id = `${Date.now().toString(36)}-${++dialogSequence}`;
    dialogs.set(id, {dialog, reopen});
    try {
      history.pushState({...history.state, [dialogMarker]: id}, '', location.href);
      activeDialog = id;
    } catch { dialogs.delete(id); return; }
    if (!watchedDialogs.has(dialog)) {
      watchedDialogs.add(dialog);
      dialog.addEventListener('close', () => {
        if (!departing && !dialog.open && dialogs.get(history.state?.[dialogMarker])?.dialog === dialog) discardClosedDialog();
      });
    }
  }
  window.OjjudaSectionNavigation = Object.freeze({ back, openDialog, hasPreviousPage: previousPage });
  window.addEventListener('pagehide', () => { departing = true; });
  window.addEventListener('pageshow', () => { departing = false; discardClosedDialog(); });
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (!event.target.closest?.('[data-section-return]')) return;
    event.preventDefault();
    back();
  });
  try {
    if (!previousPage && !history.state?.[marker]) {
      const originalState = history.state;
      const activeState = { ...(originalState || {}), [marker]: true };
      delete activeState[exitMarker];
      // Only direct entries need a safe fallback. Normal site navigation keeps
      // its real browser history without inserting duplicate pages.
      history.replaceState({ ...(originalState || {}), [exitMarker]: true }, '', location.href);
      try {
        history.pushState(activeState, '', location.href);
        guarded = true;
      } catch (error) {
        try { history.replaceState(originalState, '', location.href); } catch { /* Best-effort rollback. */ }
        throw error;
      }
    }
  } catch (error) {
    console.warn('페이지 뒤로가기를 준비하지 못했어요.', error);
  }

  window.addEventListener('popstate', event => {
    discardingDialog = false;
    // Null state, query changes and fragments can all belong to another local
    // screen. Only our explicit direct-entry boundary may use the fallback.
    if (event.state?.[exitMarker]) {
      event.stopImmediatePropagation?.();
      location.replace(destination);
      return;
    }
    const next = event.state?.[dialogMarker] || null;
    if (next === activeDialog) return;
    const previous = dialogs.get(activeDialog), target = dialogs.get(next);
    activeDialog = next;
    if (previous?.dialog.open) previous.dialog.close();
    if (next && !target) { discardClosedDialog(); return; }
    if (target?.dialog.isConnected) {
      restoringDialog = true;
      try { target.reopen(); }
      finally { restoringDialog = false; }
    }
  }, true);
  discardClosedDialog();
})();
