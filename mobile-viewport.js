/* Keep fixed controls inside the visible viewport, including browser/keyboard changes. */
(() => {
  'use strict';
  const root = document.documentElement;
  const viewport = window.visualViewport;
  let frame = 0, navigation = null;
  const set = (name, value) => {
    const pixels = `${Math.round(value * 100) / 100}px`;
    if (root.style.getPropertyValue(name) !== pixels) root.style.setProperty(name, pixels);
  };
  const observer = window.ResizeObserver ? new ResizeObserver(schedule) : null;

  function update() {
    frame = 0;
    // Pinch zoom must magnify the page without resizing or chasing its controls.
    if (viewport && Math.abs(viewport.scale - 1) > 0.02) return;
    const height = viewport?.height || window.innerHeight;
    const top = Math.max(0, viewport?.offsetTop || 0);
    set('--app-viewport-height', height);
    set('--app-viewport-top', top);
    set('--app-viewport-bottom', Math.max(0, window.innerHeight - height - top));
    const next = document.querySelector('.bottomnav');
    if (navigation !== next) {
      if (navigation) observer?.unobserve(navigation);
      navigation = next;
      if (navigation) observer?.observe(navigation);
    }
    set('--app-nav-height', navigation?.getBoundingClientRect().height || 0);
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  function start() {
    update();
    // World replaces its navigation when changing screens.
    new MutationObserver(() => {
      if (navigation !== document.querySelector('.bottomnav')) schedule();
    }).observe(document.body, { childList: true, subtree: true });
  }
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });
  window.addEventListener('pageshow', schedule);
  viewport?.addEventListener('resize', schedule, { passive: true });
  viewport?.addEventListener('scroll', schedule, { passive: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
