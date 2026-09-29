(() => {
  'use strict';

  // The live feed keeps its listeners; only the outgoing view is copied for
  // the transition. Dragging does not change the filter until release.
  function create({ root, tabs, viewport, page, getActive, select, enabled }) {
    const order = ['latest', 'popular', 'nearby', 'tag'];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let gesture = null, ghost = null, peek = null, animation = null;
    let finishTimer = 0, suppressClickUntil = 0, scrollShift = 0;
    const visible = () => enabled() && !root.hidden && !tabs.hidden
      && !document.body.classList.contains('note-my-open')
      && document.body.style.overflow !== 'hidden'
      && !root.matches('.note-pull-active, .note-pull-refreshing')
      && !document.querySelector('.dialog-backdrop:not([hidden]), .nn-backdrop:not([hidden])');
    const translate = (element, x, y = 0) => { element.style.transform = `translate3d(${x}px, ${y}px, 0)`; };

    function clean() {
      const nextScroll = Math.max(0, window.scrollY - scrollShift);
      clearTimeout(finishTimer); finishTimer = 0;
      animation?.cancel(); animation = null;
      ghost?.remove(); ghost = null;
      peek?.remove(); peek = null;
      page.style.removeProperty('transform');
      viewport.style.removeProperty('min-height');
      root.classList.remove('note-feed-dragging', 'note-feed-settling');
      if (scrollShift) window.scrollTo({ top: nextScroll, behavior: 'instant' });
      scrollShift = 0;
    }

    function animateTo(element, from, to) {
      return element.animate([{ transform: from }, { transform: to }], {
        duration: reducedMotion.matches ? 0 : 260,
        easing: 'cubic-bezier(.22,.75,.25,1)', fill: 'forwards'
      });
    }

    function settle() {
      gesture = null;
      root.classList.remove('note-feed-dragging');
      if (!page.style.transform || reducedMotion.matches) { clean(); return; }
      root.classList.add('note-feed-settling');
      peek?.remove(); peek = null;
      animation = animateTo(page, page.style.transform, 'translate3d(0,0,0)');
      animation.onfinish = clean;
      finishTimer = setTimeout(clean, 340);
    }

    function goTo(sort, options = {}, offset = 0) {
      if (!visible() || !order.includes(sort)) { settle(); return; }
      const previous = getActive();
      if (sort === previous) { clean(); select(sort, options); return; }
      // A new tab press can interrupt a transition without rolling back state.
      if (animation) clean();
      gesture = null;
      const direction = order.indexOf(sort) > order.indexOf(previous) ? 1 : -1;
      const width = viewport.clientWidth;
      if (reducedMotion.matches || !width) { clean(); select(sort, options); return; }
      const height = viewport.getBoundingClientRect().height;
      ghost = page.cloneNode(true);
      ghost.classList.add('note-feed-ghost'); ghost.inert = true;
      ghost.setAttribute('aria-hidden', 'true');
      for (const element of [ghost, ...ghost.querySelectorAll('[id], [aria-live]')]) {
        element.removeAttribute('id'); element.removeAttribute('aria-live');
      }
      viewport.append(ghost);
      peek?.remove(); peek = null;
      viewport.style.minHeight = `${height}px`;
      // Keep the next page visible when swiping further down the feed. Remove
      // the vertical offset and adjust scroll together at the end of the slide.
      scrollShift = Math.min(window.scrollY, Math.max(0, 16 - root.getBoundingClientRect().top));
      select(sort, options);
      root.classList.remove('note-feed-dragging');
      root.classList.add('note-feed-settling');
      translate(ghost, offset);
      translate(page, direction * width + offset, scrollShift);
      animateTo(ghost, ghost.style.transform, `translate3d(${-direction * width}px,0,0)`);
      animation = animateTo(page, page.style.transform, `translate3d(0,${scrollShift}px,0)`);
      animation.onfinish = clean;
      finishTimer = setTimeout(clean, 340);
    }

    function canStart(target) {
      if (!visible() || animation || !(target instanceof Element)) return false;
      if (target.closest('input, textarea, select, a, [contenteditable], [role="slider"], .oj-map-stage, .note-photo-gallery, [data-no-swipe]')) return false;
      const button = target.closest('button');
      return !button || button.matches('.photo-open, [data-sort]');
    }

    function start(x, y, target, pointerId = null) {
      suppressClickUntil = 0;
      if (!canStart(target)) return;
      gesture = { x, y, lastX: x, lastAt: performance.now(), velocity: 0,
        active: getActive(), pointerId, locked: false, offset: 0, next: null };
    }

    function move(x, y, event) {
      const g = gesture;
      if (!g) return;
      if (!visible() || getActive() !== g.active) { settle(); return; }
      const dx = x - g.x, dy = y - g.y;
      if (!g.locked) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
        if (Math.abs(dy) >= Math.abs(dx)) { gesture = null; return; }
        if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
        g.locked = true;
        root.classList.add('note-feed-dragging');
        if (g.pointerId !== null) root.setPointerCapture?.(g.pointerId);
      }
      if (event.cancelable) event.preventDefault();
      const now = performance.now(), elapsed = now - g.lastAt;
      if (elapsed > 0) g.velocity = (x - g.lastX) / elapsed;
      g.lastAt = now; g.lastX = x;
      const width = viewport.clientWidth;
      const direction = dx < 0 ? 1 : -1;
      g.next = order[order.indexOf(g.active) + direction] || null;
      g.offset = g.next ? Math.max(-width, Math.min(width, dx)) : Math.max(-60, Math.min(60, dx * .22));
      translate(page, g.offset);
      if (!g.next) { peek?.remove(); peek = null; return; }
      if (!peek) {
        peek = document.createElement('div'); peek.className = 'note-feed-peek';
        peek.setAttribute('aria-hidden', 'true'); peek.inert = true;
        viewport.append(peek);
      }
      peek.textContent = tabs.querySelector(`[data-sort="${g.next}"]`)?.textContent || '';
      translate(peek, direction * width + g.offset, Math.max(0, -viewport.getBoundingClientRect().top + 24));
    }

    function end(cancelled = false) {
      const g = gesture;
      if (!g) return;
      gesture = null;
      if (g.pointerId !== null && root.hasPointerCapture?.(g.pointerId)) root.releasePointerCapture(g.pointerId);
      if (!g.locked) return;
      suppressClickUntil = performance.now() + 450;
      const threshold = Math.min(100, Math.max(48, viewport.clientWidth * .2));
      const fast = performance.now() - g.lastAt < 100 && Math.abs(g.velocity) > .5
        && Math.sign(g.velocity) === Math.sign(g.offset) && Math.abs(g.offset) >= 28;
      if (!cancelled && g.next && (Math.abs(g.offset) >= threshold || fast)) goTo(g.next, {}, g.offset);
      else settle();
    }

    // Touch cooperates with vertical pull-to-refresh. Ignore touch pointers to
    // avoid processing the same gesture twice; pointer events serve mouse/pen.
    root.addEventListener('touchstart', event => {
      if (event.touches.length !== 1) { end(true); return; }
      const touch = event.touches[0]; start(touch.clientX, touch.clientY, event.target);
    }, { passive: true });
    root.addEventListener('touchmove', event => {
      if (event.touches.length !== 1) { end(true); return; }
      const touch = event.touches[0]; move(touch.clientX, touch.clientY, event);
    }, { passive: false });
    root.addEventListener('touchend', () => end(), { passive: true });
    root.addEventListener('touchcancel', () => end(true), { passive: true });
    root.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' || event.button !== 0 || !event.isPrimary) return;
      start(event.clientX, event.clientY, event.target, event.pointerId);
    });
    window.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch' || gesture?.pointerId !== event.pointerId) return;
      move(event.clientX, event.clientY, event);
    }, { passive: false });
    window.addEventListener('pointerup', event => {
      if (event.pointerType !== 'touch' && gesture?.pointerId === event.pointerId) end();
    });
    root.addEventListener('pointercancel', event => {
      if (event.pointerType !== 'touch' && gesture?.pointerId === event.pointerId) end(true);
    });
    root.addEventListener('lostpointercapture', event => {
      if (gesture?.pointerId === event.pointerId) end(true);
    });
    root.addEventListener('click', event => {
      if (event.detail && performance.now() < suppressClickUntil) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, true);
    root.addEventListener('dragstart', event => { if (gesture) event.preventDefault(); });
    root.addEventListener('selectstart', event => { if (gesture) event.preventDefault(); });
    window.addEventListener('blur', () => { end(true); clean(); });
    window.addEventListener('resize', () => { end(true); clean(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { end(true); clean(); } });
    root.classList.add('note-feed-swipe');
    return { goTo };
  }

  window.OjjudaFeedSwipe = Object.freeze({ create });
})();
