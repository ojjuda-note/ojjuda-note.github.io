/* App-level swipes leave feed filters, editors and maps their own gestures. */
(() => {
  'use strict';
  let gesture = null, suppressClickUntil = 0;
  const blocked = () => document.body.style.overflow === 'hidden'
    || [...document.querySelectorAll('[role="dialog"], .dialog-backdrop, .nn-backdrop')]
      .some(element => element.getClientRects().length);
  function start(event, point, kind) {
    gesture = null; suppressClickUntil = 0;
    const target = event.target;
    if (!(target instanceof Element) || blocked()) return;
    const zone = target.closest('#main, .mobile-top, .bottomnav, .note-side-header');
    if (!zone || target.closest('#feed.note-feed-swipe, input, textarea, select, [contenteditable], [role="slider"], .oj-map-stage, .note-photo-gallery, [data-no-swipe]')) return;
    for (let node = target; node && node !== zone; node = node.parentElement) {
      if (node.scrollWidth > node.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(node).overflowX)) return;
    }
    gesture = { x: point.clientX, y: point.clientY, kind,
      id: kind === 'touch' ? point.identifier : point.pointerId,
      time: performance.now(), horizontal: false };
  }
  function move(event, point) {
    const g = gesture;
    if (!g) return;
    const dx = point.clientX - g.x, dy = point.clientY - g.y;
    if (!g.horizontal) {
      if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) { gesture = null; return; }
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      g.horizontal = true;
    }
    if (event.cancelable) event.preventDefault();
  }
  function end(point) {
    const g = gesture; gesture = null;
    if (!g?.horizontal) return;
    suppressClickUntil = performance.now() + 400;
    const dx = point.clientX - g.x, dy = point.clientY - g.y;
    if (dx <= -60 && Math.abs(dx) >= Math.abs(dy) * 1.5 && performance.now() - g.time <= 1200 && !blocked()) location.assign('/world.html');
  }
  document.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) { gesture = null; return; }
    start(event, event.touches[0], 'touch');
  }, { passive: true });
  document.addEventListener('touchmove', event => {
    if (event.touches.length !== 1) { gesture = null; return; }
    if (gesture?.kind === 'touch' && event.touches[0].identifier === gesture.id) move(event, event.touches[0]);
  }, { passive: false });
  document.addEventListener('touchend', event => {
    if (event.touches.length) { gesture = null; return; }
    const point = [...event.changedTouches].find(point => point.identifier === gesture?.id);
    if (point && gesture?.kind === 'touch') end(point);
  }, { passive: true });
  document.addEventListener('touchcancel', () => { gesture = null; }, { passive: true });
  document.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') return;
    if (event.isPrimary === false) { gesture = null; return; }
    if (event.button === 0) start(event, event, 'pointer');
  });
  window.addEventListener('pointermove', event => {
    if (gesture?.kind === 'pointer' && event.pointerId === gesture.id) move(event, event);
  }, { passive: false });
  window.addEventListener('pointerup', event => {
    if (gesture?.kind === 'pointer' && event.pointerId === gesture.id) end(event);
  });
  document.addEventListener('pointercancel', event => {
    if (gesture?.kind === 'pointer' && event.pointerId === gesture.id) gesture = null;
  });
  document.addEventListener('dragstart', event => { if (gesture) event.preventDefault(); });
  document.addEventListener('click', event => {
    if (event.detail && performance.now() < suppressClickUntil) {
      suppressClickUntil = 0; event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener('blur', () => { gesture = null; });
})();
