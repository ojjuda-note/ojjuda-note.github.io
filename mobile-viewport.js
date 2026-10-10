/* Keep fixed controls inside the visible viewport, including browser/keyboard changes. */
(() => {
  'use strict';
  // Billiards handles table zoom itself; native page zoom would also enlarge
  // its score and shot controls. Leave ordinary taps and scrolling alone.
  function keepBilliardsViewport(event) {
    if (!event.target.closest?.('.bl-ov')) return;
    if (event.type === 'wheel' && !event.ctrlKey) return;
    if (event.type.startsWith('touch')) {
      if (event.touches.length < 2) return;
      // Let the canvas receive two-finger input without the page guard
      // cancelling it. Its pointer handlers own zoom; touch-action blocks
      // browser zoom, so the surrounding controls still keep their size.
      if (Array.from(event.touches).every(touch => touch.target?.closest?.('.bl-can'))) return;
    }
    event.preventDefault();
  }
  for (const type of ['touchstart', 'touchmove', 'gesturestart', 'gesturechange', 'wheel', 'dblclick']) {
    document.addEventListener(type, keepBilliardsViewport, {capture:true, passive:false});
  }
  const root = document.documentElement;
  const viewport = window.visualViewport;
  // The host already reserves system insets around game/house frames.
  if (window.parent !== window) root.dataset.viewportEmbedded = '';
  let frame = 0, navigation = null;
  const set = (name, value) => {
    const pixels = `${Math.round(value * 100) / 100}px`;
    if (root.style.getPropertyValue(name) !== pixels) root.style.setProperty(name, pixels);
  };
  const observer = window.ResizeObserver ? new ResizeObserver(schedule) : null;

  function bounds() {
    const style = getComputedStyle(root);
    const inset = name => parseFloat(style.getPropertyValue(name)) || 0;
    const top = Math.max(0, viewport?.offsetTop || 0);
    return {
      top: top + inset('--app-safe-top'),
      bottom: top + (viewport?.height || innerHeight) - inset('--app-safe-bottom'),
      left: Math.max(0, viewport?.offsetLeft || 0),
      right: (viewport?.offsetLeft || 0) + (viewport?.width || innerWidth)
    };
  }
  window.OjjudaViewport = Object.freeze({ bounds });

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
