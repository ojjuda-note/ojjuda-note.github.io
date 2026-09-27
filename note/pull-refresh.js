(() => {
  'use strict';

  const feed = document.getElementById('feed');
  if (!feed) return;

  const indicator = document.createElement('div');
  indicator.className = 'note-pull-indicator';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  indicator.hidden = true;
  indicator.innerHTML = '<span class="note-pull-spinner" aria-hidden="true"></span><span class="note-pull-text">당겨서 새로고침</span>';
  feed.prepend(indicator);
  const label = indicator.querySelector('.note-pull-text');
  const touchScreen = window.matchMedia('(max-width: 899px) and (pointer: coarse)');
  const threshold = 72;
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let armed = false;
  let refreshing = false;
  let hideTimer = 0;

  function pageAtTop() {
    return window.scrollY <= 2 && (document.scrollingElement?.scrollTop || 0) <= 2;
  }

  function hasInnerScroll(element) {
    for (let current = element; current && current !== feed; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (/auto|scroll/.test(style.overflowY) && current.scrollHeight > current.clientHeight + 2) return true;
    }
    return false;
  }

  function canStart(event) {
    if (!touchScreen.matches || event.touches.length !== 1 || feed.hidden || refreshing || !pageAtTop()) return false;
    if (document.body.style.overflow === 'hidden' || document.querySelector('.dialog-backdrop:not([hidden]), .nn-backdrop:not([hidden]), .mobile-nav-backdrop:not([hidden])')) return false;
    const target = event.target;
    if (!(target instanceof Element) || !feed.contains(target)) return false;
    if (target.closest('input,textarea,select,[contenteditable="true"],.note-map,.note-photo-gallery,[data-no-pull]')) return false;
    return !hasInnerScroll(target);
  }

  function reset() {
    tracking = false;
    armed = false;
    feed.classList.remove('note-pull-active');
    feed.style.removeProperty('--note-pull-offset');
    if (!refreshing) indicator.hidden = true;
  }

  async function refresh() {
    refreshing = true;
    feed.classList.add('note-pull-refreshing');
    indicator.hidden = false;
    label.textContent = '새로고침 중';
    try {
      if (typeof window.ojjudaRefreshFeed !== 'function') throw new Error('Feed refresh is unavailable');
      const refreshed = await window.ojjudaRefreshFeed();
      if (refreshed === false) throw new Error('Feed refresh failed');
      label.textContent = '새로고침 완료';
    } catch (error) {
      console.warn('Note pull refresh:', error);
      label.textContent = '새로고침에 실패했어요';
    } finally {
      refreshing = false;
      feed.classList.remove('note-pull-refreshing');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        indicator.hidden = true;
        label.textContent = '당겨서 새로고침';
      }, 900);
    }
  }

  feed.addEventListener('touchstart', event => {
    if (!canStart(event)) return;
    clearTimeout(hideTimer);
    indicator.hidden = true;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
    tracking = true;
    armed = false;
  }, { passive: true });

  feed.addEventListener('touchmove', event => {
    if (!tracking || event.touches.length !== 1) return;
    const dx = event.touches[0].clientX - startX;
    const dy = event.touches[0].clientY - startY;
    if (dy < -6 || Math.abs(dx) > Math.abs(dy) * 1.2 || !pageAtTop() || feed.hidden) {
      reset();
      return;
    }
    if (dy < 8) return;
    if (event.cancelable) event.preventDefault();
    armed = dy >= threshold;
    indicator.hidden = false;
    label.textContent = armed ? '놓으면 새로고침' : '아래로 더 당겨 주세요';
    feed.classList.add('note-pull-active');
    feed.style.setProperty('--note-pull-offset', `${Math.min(84, dy * 0.55)}px`);
  }, { passive: false });

  feed.addEventListener('touchend', () => {
    if (!tracking) return;
    const shouldRefresh = armed && pageAtTop() && !feed.hidden;
    reset();
    if (shouldRefresh) void refresh();
  }, { passive: true });
  feed.addEventListener('touchcancel', reset, { passive: true });
  window.addEventListener('blur', reset);
})();
