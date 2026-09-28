(() => {
  'use strict';
  const sidebar = document.getElementById('note-sidebar');
  const toggle = document.getElementById('mobile-menu-toggle');
  const closeButton = document.getElementById('side-close');
  const backdrop = document.getElementById('mobile-nav-backdrop');
  const column = document.querySelector('.col');
  const main = document.getElementById('main');
  if (!sidebar || !toggle || !closeButton || !backdrop || !column || !main) return;

  const desktop = window.matchMedia('(min-width:900px)');
  let previousOverflow = '';
  let previousInert = false;
  const notificationBadge = document.getElementById('note-notification-badge');
  const menuBadge = document.getElementById('mobile-menu-badge');
  const myScreen = document.getElementById('note-my-screen');
  const myTitle = document.getElementById('note-my-title');
  const navigationButtons = () => [...document.querySelectorAll('.side .nav-button, .bottomnav button')];
  let previousNavigation = [];
  let previousScroll = 0;

  function syncMyNavigation() {
    if (!document.body.classList.contains('note-my-open')) return;
    for (const button of navigationButtons()) {
      const selected = button.hasAttribute('data-note-my');
      button.classList.toggle('on', selected);
      if (selected && button.getAttribute('aria-current') !== 'page') button.setAttribute('aria-current', 'page');
      else if (!selected && button.hasAttribute('aria-current')) button.removeAttribute('aria-current');
    }
  }

  function showMy(open, focus = false) {
    if (!myScreen || !myTitle) return;
    const wasOpen = document.body.classList.contains('note-my-open');
    if (open && !wasOpen) {
      previousScroll = window.scrollY;
      previousNavigation = navigationButtons().map(button => ({ button,
        selected: button.classList.contains('on'), current: button.getAttribute('aria-current') }));
    }
    // Keep the card viewer's hidden state and asynchronous loading untouched.
    // The view class only changes which content is presented.
    document.body.classList.toggle('note-my-open', open);
    myScreen.hidden = !open;
    if (open) {
      closeMenu(false);
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
  for (const navigation of [sidebar, document.querySelector('.bottomnav')].filter(Boolean)) {
    navigationObserver.observe(navigation, { attributes: true, attributeFilter: ['class', 'aria-current'], subtree: true });
  }

  function syncBadge() {
    const unread = notificationBadge && !notificationBadge.hidden ? notificationBadge.textContent.trim() : '';
    menuBadge.hidden = !unread;
    menuBadge.textContent = unread;
    const label = sidebar.classList.contains('is-open') ? '노트 메뉴 닫기' : '노트 메뉴 열기';
    toggle.setAttribute('aria-label', unread ? `${label}, 읽지 않은 알림 ${unread}개` : label);
  }

  function closeMenu(restoreFocus = true) {
    if (!sidebar.classList.contains('is-open')) return;
    sidebar.classList.remove('is-open');
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
    backdrop.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    column.inert = previousInert;
    document.body.style.overflow = previousOverflow;
    syncBadge();
    if (restoreFocus && !desktop.matches) toggle.focus({ preventScroll: true });
  }

  function openMenu() {
    if (desktop.matches || sidebar.classList.contains('is-open')) return;
    previousOverflow = document.body.style.overflow;
    previousInert = column.inert;
    column.inert = true;
    document.body.style.overflow = 'hidden';
    sidebar.classList.add('is-open');
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    backdrop.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    syncBadge();
    closeButton.focus({ preventScroll: true });
  }

  toggle.addEventListener('click', () => sidebar.classList.contains('is-open') ? closeMenu() : openMenu());
  closeButton.addEventListener('click', () => closeMenu());
  backdrop.addEventListener('click', () => closeMenu());
  desktop.addEventListener('change', () => {
    const wasOpen = sidebar.classList.contains('is-open');
    closeMenu(false);
    if (wasOpen && desktop.matches) sidebar.querySelector('[data-show="feed"]')?.focus({ preventScroll: true });
  });

  sidebar.addEventListener('click', event => {
    if (!sidebar.classList.contains('is-open')) return;
    const action = event.target.closest('button,a[href]');
    if (!action || action === closeButton) return;
    if (!action.matches('[data-show], [data-sort], [data-collection], #event-start, .note-tools button, a[href]')) return;
    const feedAction = action.matches('[data-show], [data-sort], [data-collection]');
    closeMenu(false);
    (feedAction ? main : toggle).focus({ preventScroll: true });
  }, true);
  sidebar.addEventListener('keydown', event => {
    if (!sidebar.classList.contains('is-open')) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); closeMenu(); return;
    }
    if (event.key !== 'Tab') return;
    const items = [...sidebar.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)')]
      .filter(item => !item.hidden && item.getClientRects().length);
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  main.tabIndex = -1;
  if (notificationBadge) {
    new MutationObserver(syncBadge).observe(notificationBadge, { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true });
  }
  syncBadge();
  if (history.state?.noteMy) showMy(true);
})();
