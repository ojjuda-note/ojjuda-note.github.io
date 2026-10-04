/* World menu history and gestures. Rooms and games keep their own controls. */
(function () {
  'use strict';
  window.OjjudaWorldNavigation = {
    install(options) {
      let initialized = false, returning = false, handling = false;
      let gesture = null, suppressClickUntil = 0, edgeReturn = null;
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
        edgeReturn?.cancel();
        edgeReturn = null;
        if (gesture?.surface) gesture.surface.style.transform = '';
        gesture = null;
      };
      const currentIndex = () => {
        const index = options.tabs.indexOf(options.currentTab());
        return index < 0
          ? options.tabs.indexOf(document.querySelector('.bottomnav [aria-current="page"]')?.dataset.tab)
          : index;
      };
      const swipeZone = (target, doc=document, canStart=()=>true) => {
        if(!canStart())return null;
        const zone = doc===document?target.closest?.('.main, .topbar, .bottomnav'):document.querySelector('.main');
        if (!zone || [...new Set([document,doc])].flatMap(root=>[...root.querySelectorAll('#modal-root:not(:empty), [role="dialog"], .gaming')])
          .some(element => element.getClientRects().length)) return null;
        // These surfaces already use drag, pinch, selection or media controls.
        if (target.closest('.stage,.av-preview,canvas,video,audio,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="slider"],[data-world-swipe="off"]')) return null;
        for (let node=target; node && node!==zone; node=node.parentElement) {
          if (node.scrollWidth > node.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(node).overflowX)) return null;
        }
        return zone;
      };
      const start = (event, point, kind, doc, canStart) => {
        reset();
        suppressClickUntil = 0;
        if (returning) return;
        const zone=swipeZone(event.target,doc,canStart);
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
        if (dx < 0 && currentIndex() === options.tabs.length - 1) {
          if (g.surface) g.surface.style.transform = `translateX(${Math.max(-32, dx * .18)}px)`;
          return;
        }
        if (g.surface) g.surface.style.transform = `translateX(${Math.max(-100, Math.min(100, dx * .55))}px)`;
      };
      const finish = point => {
        const g = gesture;
        if (!g) return;
        const dx = point.clientX - g.x, dy = point.clientY - g.y;
        const draggedTransform = g.surface?.style.transform;
        reset();
        if (!g.horizontal) return;
        suppressClickUntil = performance.now() + 400;
        const tabs = options.tabs, index = currentIndex();
        // Give the final menu a little resistance, then return without changing tabs.
        if (dx < 0 && index === tabs.length - 1) {
          if (draggedTransform && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
            edgeReturn = g.surface.animate(
              [{transform: draggedTransform}, {transform: 'translateX(0)'}],
              {duration: 180, easing: 'ease-out'});
          }
          return;
        }
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || performance.now() - g.time > 1200) return;
        if (!options.canLeave()) return;
        if (dx > 0 && options.isMain() && options.openNote) { options.openNote(); return; }
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
      function attachDocument(doc,canStart=()=>true){
        const removers=[];const listen=(type,fn,options)=>{doc.addEventListener(type,fn,options);removers.push(()=>doc.removeEventListener(type,fn,options));};
      listen('touchstart',event=>{
        if(event.touches.length!==1){reset();return}
        start(event,event.touches[0],'touch',doc,canStart);
      },{passive:true});
      listen('touchmove',event=>{
        if(event.touches.length!==1){reset();return}
        if(gesture?.kind==='touch' && event.touches[0].identifier===gesture.id)move(event,event.touches[0]);
      },{passive:false});
      listen('touchend',event=>{
        if(event.touches.length){reset();return}
        const point=[...event.changedTouches].find(point=>point.identifier===gesture?.id);
        if(point && gesture?.kind==='touch')finish(point);
      },{passive:true});
      listen('touchcancel',reset,{passive:true});
      listen('pointerdown',event=>{
        if(event.pointerType==='touch')return;
        if(event.isPrimary===false){reset();return}
        if(event.button===0)start(event,event,'pointer',doc,canStart);
      });
      listen('pointermove',event=>{
        if(gesture?.kind==='pointer' && event.pointerId===gesture.id)move(event,event);
      },{passive:false});
      listen('pointerup',event=>{
        if(gesture?.kind==='pointer' && event.pointerId===gesture.id)finish(event);
      });
      listen('pointercancel',event=>{
        if(gesture?.kind==='pointer' && event.pointerId===gesture.id)reset();
      });
      listen('dragstart', event => {
        if (swipeZone(event.target,doc,canStart)) event.preventDefault();
      });
      listen('click', event => {
        if (event.detail && performance.now() < suppressClickUntil) {
          suppressClickUntil = 0;
          event.preventDefault(); event.stopImmediatePropagation();
        }
      }, true);

        doc.defaultView?.addEventListener('blur',reset);
        return ()=>{reset();for(const remove of removers)remove();doc.defaultView?.removeEventListener('blur',reset);};
      }
      attachDocument(document);
      return {sync, back, attachDocument};
    }
  };
})();
