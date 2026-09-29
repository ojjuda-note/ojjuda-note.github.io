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
      const swipeZone = target => {
        const zone = target.closest?.('.main, .topbar, .bottomnav');
        if (!zone || [...document.querySelectorAll('#modal-root:not(:empty), [role="dialog"], .gaming')]
          .some(element => element.getClientRects().length)) return null;
        // These surfaces already use drag, pinch, selection or media controls.
        if (target.closest('.stage,.av-preview,canvas,video,audio,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="slider"],[data-world-swipe="off"]')) return null;
        for (let node=target; node && node!==zone; node=node.parentElement) {
          if (node.scrollWidth > node.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(node).overflowX)) return null;
        }
        return zone;
      };
      const start = (event, point, kind) => {
        reset();
        suppressClickUntil = 0;
        if (returning) return;
        const zone=swipeZone(event.target);
        if (!zone) return;
        gesture = {id: kind==='touch' ? point.identifier : point.pointerId,
          x:point.clientX,y:point.clientY,kind,time:performance.now(),horizontal:false,
          surface: zone.closest('.main') || document.querySelector('.main')};
      };
      const move = (event, point) => {
        const g = gesture;
        if (!g) return;
        const dx = point.clientX - g.x, dy = point.clientY - g.y;
        if (!g.horizontal) {
          if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) { reset(); return; }
          if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
          g.horizontal = true;
        }
        if (event.cancelable) event.preventDefault();
        if (g.surface) g.surface.style.transform = `translateX(${Math.max(-100, Math.min(100, dx * .55))}px)`;
      };
      const finish = point => {
        const g = gesture;
        if (!g) return;
        const dx = point.clientX - g.x, dy = point.clientY - g.y;
        reset();
        if (!g.horizontal) return;
        suppressClickUntil = performance.now() + 400;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || performance.now() - g.time > 1200) return;
        if (!options.canLeave()) return;
        if (dx > 0 && options.isMain() && options.openNote) { options.openNote(); return; }
        const tabs = options.tabs;
        let index = tabs.indexOf(options.currentTab());
        if (index < 0) index=tabs.indexOf(document.querySelector('.bottomnav [aria-current="page"]')?.dataset.tab);
        if (index < 0) return;
        options.changeTab(tabs[(index + (dx < 0 ? 1 : -1) + tabs.length) % tabs.length]);
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
          document.querySelector('.main')?.animate(
            [{transform: `translateX(${dx < 0 ? 35 : -35}px)`, opacity: .7}, {transform: 'translateX(0)', opacity: 1}],
            {duration: 180, easing: 'ease-out'});
        }
      };
      // Touch listeners retain vertical scrolling and nested horizontal scrollers;
      // a blanket touch-action on .main would disable their native gestures.
      document.addEventListener('touchstart',event=>{
        if(event.touches.length!==1){reset();return}
        start(event,event.touches[0],'touch');
      },{passive:true});
      document.addEventListener('touchmove',event=>{
        if(event.touches.length!==1){reset();return}
        if(gesture?.kind==='touch' && event.touches[0].identifier===gesture.id)move(event,event.touches[0]);
      },{passive:false});
      document.addEventListener('touchend',event=>{
        if(event.touches.length){reset();return}
        const point=[...event.changedTouches].find(point=>point.identifier===gesture?.id);
        if(point && gesture?.kind==='touch')finish(point);
      },{passive:true});
      document.addEventListener('touchcancel',reset,{passive:true});
      document.addEventListener('pointerdown',event=>{
        if(event.pointerType==='touch')return;
        if(event.isPrimary===false){reset();return}
        if(event.button===0)start(event,event,'pointer');
      });
      document.addEventListener('pointermove',event=>{
        if(gesture?.kind==='pointer' && event.pointerId===gesture.id)move(event,event);
      },{passive:false});
      document.addEventListener('pointerup',event=>{
        if(gesture?.kind==='pointer' && event.pointerId===gesture.id)finish(event);
      });
      document.addEventListener('pointercancel',event=>{
        if(gesture?.kind==='pointer' && event.pointerId===gesture.id)reset();
      });
      document.addEventListener('dragstart', event => {
        if (swipeZone(event.target)) event.preventDefault();
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
