/* Browser Back from standalone pages returns to their owning Agit section. */
(() => {
  'use strict';
  if (window !== window.top) return; // The World shell owns Back for embedded pages.

  const script = document.currentScript;
  const from = new URLSearchParams(location.search).get('from');
  const destinations = {
    hub: '/world.html?tab=hub',
    arcade: '/world.html?tab=hub',
    park: '/world.html?tab=park',
    my: '/world.html?tab=my',
    admin: '/world.html?admin=overview'
  };
  const section = Object.hasOwn(destinations, from) ? from : script?.dataset.returnTo;
  const destination = destinations[section] || destinations.hub;
  const labels = { hub: '아지트로', arcade: '아지트로', park: '공원으로', my: '설정으로', admin: '관리자 모드로' };
  const returnLink = document.querySelector('[data-section-return]');
  if (returnLink) {
    returnLink.href = destination;
    const label = returnLink.querySelector('[data-section-return-label]');
    if (label) label.textContent = `${labels[section] || labels.hub} 돌아가기`;
  }
  const marker = 'ojjudaSectionBack';
  const exitMarker = 'ojjudaSectionExit';
  try {
    if (!history.state?.[marker]) {
      const originalState = history.state;
      const activeState = { ...(originalState || {}), [marker]: true };
      delete activeState[exitMarker];
      // Mark the entry being left so multi-step Back cannot mistake it for an anchor.
      history.replaceState({ ...(originalState || {}), [exitMarker]: true }, '', location.href);
      try {
        history.pushState(activeState, '', location.href);
      } catch (error) {
        try { history.replaceState(originalState, '', location.href); } catch { /* Best-effort rollback. */ }
        throw error;
      }
    }
  } catch (error) {
    console.warn('페이지 뒤로가기를 준비하지 못했어요.', error);
  }

  let previousHref = location.href;
  window.addEventListener('popstate', event => {
    const href = location.href;
    // Activating the current fragment again can emit a null-state popstate
    // without changing the URL. Delayed/duplicate events can also arrive after
    // hashchange. These are still local anchors, not the marked Back boundary.
    const sameDocument = href.split('#')[0] === previousHref.split('#')[0];
    const fragmentNavigation = sameDocument && (href !== previousHref || href.includes('#'));
    previousHref = href;
    if (event.state?.[exitMarker] || (!event.state?.[marker] && !fragmentNavigation)) location.replace(destination);
  });
  // Some fragment changes emit only hashchange, so keep the comparison current.
  window.addEventListener('hashchange', () => { previousHref = location.href; });
})();
