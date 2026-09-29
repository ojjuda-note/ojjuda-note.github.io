/* World menu history and gestures. Rooms and games keep their own controls. */
(function () {
  'use strict';
  window.OjjudaWorldNavigation = {
    install(options) {
      let initialized = false, returning = false, handling = false;
      let gesture = null, suppressClickUntil = 0;
      const state = page => ({...(history.state || {}), ojjudaWorld: page});
      const pushMenu = () => history.pushState(state('menu'), '', location.href);
      const back = () => {
        if (options.closeOverlay()) return true;
        if (options.isMain()) return false;
        if (options.canLeave()) options.toMain();
        return true;
      };
      const sync = () => {
        if (!initialized) {
          history.replaceState(state('main'), '', location.href);
          initialized = true;
        }
        if (returning || handling) return;
        if (!options.isMain()) {
          if (history.state?.ojjudaWorld !== 'menu') pushMenu();
        } else if (history.state?.ojjudaWorld === 'menu') {
          returning = true;
          history.back();
        }
      };
      window.addEventListener('popstate', () => {
        const programmatic = returning;
        returning = false;
        handling = true;
        try { if (!programmatic) back(); }
        finally { handling = false; }
        if (!options.isMain()) pushMenu();
        else history.replaceState(state('main'), '', location.href);
      });
      const reset = () => {
        if (gesture?.surface) gesture.surface.style.transform = '';
        gesture = null;
      };
      document.addEventListener('pointerdown', event => {
        if (event.isPrimary === false) { reset(); return; }
        if (event.button !== 0 || returning) return;
        const zone = event.target.closest?.('.world-main, .bottomnav');
        if (!zone || [...document.querySelectorAll('#modal-root:not(:empty), [role="dialog"], .gaming')]
          .some(element => element.getClientRects().length)) return;
        if (event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
        reset();
        gesture = {id: event.pointerId, x: event.clientX, y: event.clientY,
          time: performance.now(), horizontal: false,
          surface: zone.closest('.main') || document.querySelector('.main')};
      });
      document.addEventListener('pointermove', event => {
        const g = gesture;
        if (!g || event.pointerId !== g.id) return;
        const dx = event.clientX - g.x, dy = event.clientY - g.y;
        if (!g.horizontal) {
          if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) { reset(); return; }
          if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
          g.horizontal = true;
        }
        if (event.cancelable) event.preventDefault();
        if (g.surface) g.surface.style.transform = `translateX(${Math.max(-100, Math.min(100, dx * .55))}px)`;
      }, {passive: false});
      document.addEventListener('pointerup', event => {
        const g = gesture;
        if (!g || event.pointerId !== g.id) return;
        const dx = event.clientX - g.x, dy = event.clientY - g.y;
        reset();
        if (!g.horizontal) return;
        suppressClickUntil = performance.now() + 400;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || performance.now() - g.time > 1200) return;
        if (!options.canLeave()) return;
        const tabs = options.tabs, index = tabs.indexOf(options.currentTab());
        if (index < 0) return;
        options.changeTab(tabs[(index + (dx < 0 ? 1 : -1) + tabs.length) % tabs.length]);
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
          document.querySelector('.main')?.animate(
            [{transform: `translateX(${dx < 0 ? 35 : -35}px)`, opacity: .7}, {transform: 'translateX(0)', opacity: 1}],
            {duration: 180, easing: 'ease-out'});
        }
      });
      document.addEventListener('pointercancel', reset);
      document.addEventListener('dragstart', event => {
        if (event.target.closest?.('.world-main')) event.preventDefault();
      });
      document.addEventListener('click', event => {
        if (event.detail && performance.now() < suppressClickUntil) {
          suppressClickUntil = 0;
          event.preventDefault(); event.stopImmediatePropagation();
        }
      }, true);
      window.addEventListener('blur', reset);
      return {sync, back};
    }
  };
})();
