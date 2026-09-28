(() => {
  'use strict';
  const sidebar = document.getElementById('note-sidebar');
  const main = document.getElementById('main');
  const myScreen = document.getElementById('note-my-screen');
  const myTitle = document.getElementById('note-my-title');
  const accountMenu = document.getElementById('note-account-menu');
  const sidebarSlot = document.getElementById('note-sidebar-menu-slot');
  const mySlot = document.getElementById('note-my-tools-slot');
  const tools = document.getElementById('side-tools');
  const bottomNavigation = document.querySelector('.bottomnav');
  if (!sidebar || !main || !myScreen || !myTitle || !accountMenu || !sidebarSlot || !mySlot) return;

  const desktop = window.matchMedia('(min-width:900px)');
  const navigationButtons = () => [...document.querySelectorAll('.nav-button[data-show], [data-note-my], .bottomnav [data-show]')];
  let previousNavigation = [];
  let previousScroll = 0;

  function placeAccountMenu() {
    // Move the original elements so actions, permission checks and badge state
    // are shared between My and the desktop sidebar without duplicate IDs.
    const destination = desktop.matches && !document.body.classList.contains('note-my-open') ? sidebarSlot : mySlot;
    if (accountMenu.parentElement === destination) return;
    const focused = document.activeElement;
    const keepFocus = accountMenu.contains(focused);
    destination.append(accountMenu);
    if (keepFocus && focused.getClientRects().length) focused.focus({ preventScroll: true });
  }

  function syncMyNavigation() {
    if (!document.body.classList.contains('note-my-open')) return;
    for (const button of navigationButtons()) {
      const selected = button.hasAttribute('data-note-my');
      if (button.classList.contains('on') !== selected) button.classList.toggle('on', selected);
      if (selected && button.getAttribute('aria-current') !== 'page') button.setAttribute('aria-current', 'page');
      else if (!selected && button.hasAttribute('aria-current')) button.removeAttribute('aria-current');
    }
  }

  function showMy(open, focus = false) {
    const wasOpen = document.body.classList.contains('note-my-open');
    if (open && !wasOpen) {
      previousScroll = window.scrollY;
      previousNavigation = navigationButtons().map(button => ({ button,
        selected: button.classList.contains('on'), current: button.getAttribute('aria-current') }));
    }
    // Keep the card viewer's hidden state and asynchronous loading untouched.
    document.body.classList.toggle('note-my-open', open);
    myScreen.hidden = !open;
    placeAccountMenu();
    if (open) {
      syncMyNavigation();
      window.scrollTo({ top: 0, behavior: 'auto' });
      if (focus) myTitle.focus({ preventScroll: true });
    } else if (wasOpen) {
      for (const { button, selected, current } of previousNavigation) {
        button.classList.toggle('on', selected);
        if (current === null) button.removeAttribute('aria-current'); else button.setAttribute('aria-current', current);
      }
      if (focus) main.focus({ preventScroll: true });
    }
  }

  document.addEventListener('click', event => {
    const myButton = event.target.closest('[data-note-my]');
    if (myButton) {
      event.preventDefault();
      if (!document.body.classList.contains('note-my-open')) {
        history.pushState({ ...history.state, noteMy: true }, '', location.href);
      }
      showMy(true, true);
      return;
    }
    if (!document.body.classList.contains('note-my-open')) return;
    const cardAction = event.target.closest('[data-show], [data-sort], [data-collection], [data-open], [data-compose], #event-start');
    if (!cardAction || cardAction.disabled) return;
    // Existing card handlers will perform the selected navigation after capture.
    history.replaceState({ ...history.state, noteMy: false }, '', location.href);
    showMy(false);
  }, true);

  window.addEventListener('popstate', event => {
    const wasOpen = document.body.classList.contains('note-my-open');
    const open = event.state?.noteMy === true;
    showMy(open, open);
    if (wasOpen && !open) requestAnimationFrame(() => {
      window.scrollTo({ top: previousScroll, behavior: 'auto' });
      main.focus({ preventScroll: true });
    });
  });

  const navigationObserver = new MutationObserver(syncMyNavigation);
  for (const navigation of [sidebar, bottomNavigation, myScreen].filter(Boolean)) {
    navigationObserver.observe(navigation, { attributes: true, attributeFilter: ['class', 'aria-current'], subtree: true });
  }

  function syncBadge() {
    const source = document.getElementById('note-notification-badge');
    const unread = source && !source.hidden ? source.textContent.trim() : '';
    for (const button of document.querySelectorAll('[data-note-my]')) {
      const badge = button.querySelector('[data-note-my-badge]');
      if (badge) { badge.hidden = !unread; badge.textContent = unread; }
      button.setAttribute('aria-label', unread ? `마이, 읽지 않은 알림 ${unread}개` : '마이');
    }
  }

  main.tabIndex = -1;
  desktop.addEventListener('change', placeAccountMenu);
  if (tools) new MutationObserver(syncBadge).observe(tools, {
    attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true
  });
  placeAccountMenu();
  syncBadge();
  if (history.state?.noteMy) showMy(true);
})();
