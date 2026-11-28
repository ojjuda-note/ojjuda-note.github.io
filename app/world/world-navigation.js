/* Keep menus and game overlays inside World until the main screen is reached. */
(function () {
  'use strict';
  function installTabSwipes(options, blocked = () => false) {
    let gesture = null, suppressClickUntil = 0, edgeReturn = null;
    const surfaceSelector = options.surfaceSelector || '.main';
    const zoneSelector = options.zoneSelector || '.main, .topbar, .bottomnav';
    const reset = () => {
      edgeReturn?.cancel();
      edgeReturn = null;
      if (gesture?.surface) gesture.surface.style.transform = '';
      gesture = null;
    };
    const swipeRoute = () => {
      const place = options.currentPlace?.();
      if (place && options.places?.includes(place)) return {group:'places',items:options.places,current:place,select:options.changePlace};
      return {group:'main',items:options.tabs,current:options.currentTab(),select:options.changeTab};
    };
    const sameRoute = previous => {const next=swipeRoute();return next.group===previous.group&&next.current===previous.current;};
    const atEnd = (path, direction) => {const index=path.items.indexOf(path.current);return index<0||index+direction<0||index+direction>=path.items.length;};
    const step = direction => {
      if(direction!==1&&direction!==-1)return false;
      const path=swipeRoute();
      if(atEnd(path,direction)||options.canLeave?.() === false)return false;
      path.select(path.items[path.items.indexOf(path.current)+direction]);return true;
    };
    const swipeZone = (target, doc=document, canStart=()=>true) => {
      if(!canStart())return null;
      const panel = target.closest?.('[data-world-swipe-surface]') || target.getRootNode?.().host?.closest('[data-world-swipe-surface]');
      const zone = doc===document ? (panel || target.closest?.(zoneSelector)) : document.querySelector(surfaceSelector);
      if (!zone || [...new Set([document,doc,target.getRootNode?.() || doc])].flatMap(root=>[...root.querySelectorAll('#modal-root:not(:empty), dialog[open], [role="dialog"], .gaming')])
        .some(element => element.getClientRects().length)) return null;
      // These surfaces already use drag, pinch, selection or media controls.
      if (target.closest('.stage:not(.place-art-stage),.av-preview,canvas,video,audio,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="slider"],[data-world-swipe="off"],#feed.note-feed-swipe,.note-photo-gallery')) return null;
      for (let node=target; node && node!==zone; node=node.parentElement) {
        if (node.scrollWidth > node.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(node).overflowX)) return null;
      }
      return zone;
    };
    const start = (event, point, kind, doc, canStart) => {
      reset();
      suppressClickUntil = 0;
      if (blocked()) return;
      const zone=swipeZone(event.composedPath?.()[0] || event.target,doc,canStart);
      if (!zone) return;
      gesture = {id: kind==='touch' ? point.identifier : point.pointerId,
        x:point.clientX,y:point.clientY,kind,horizontal:false,
        route:swipeRoute(),surface: zone.matches('[data-world-swipe-surface]') ? zone : zone.closest(surfaceSelector) || document.querySelector(surfaceSelector)};
    };
    const move = (event, point) => {
      const g = gesture;
      if (!g) return;
      if(!sameRoute(g.route)){reset();return;}
      const dx = point.clientX - g.x, dy = point.clientY - g.y;
      if (!g.horizontal) {
        if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) { reset(); return; }
        if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
        g.horizontal = true;
      }
      if (event.cancelable) event.preventDefault();
      if (atEnd(g.route,dx < 0 ? 1 : -1)) {
        if (g.surface) g.surface.style.transform = `translateX(${Math.max(-32,Math.min(32,dx * .18))}px)`;
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
      if (!g.horizontal||blocked()||!sameRoute(g.route)) return;
      suppressClickUntil = performance.now() + 400;
      const direction=dx < 0 ? 1 : -1;
      // Both ends resist a little and settle without leaving their sequence.
      if (atEnd(g.route,direction)) {
        if (draggedTransform && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          edgeReturn = g.surface.animate(
            [{transform: draggedTransform}, {transform: 'translateX(0)'}],
            {duration: 180, easing: 'ease-out'});
        }
        return;
      }
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (!step(direction)) return;
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        (document.querySelector('[data-world-swipe-surface]:not([hidden])') || document.querySelector(surfaceSelector))?.animate(
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
        if (swipeZone(event.composedPath?.()[0] || event.target,doc,canStart)) event.preventDefault();
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
    window.addEventListener('pagehide',reset,{capture:true});
    return {step,attachDocument};
  }

  window.OjjudaWorldNavigation = {
    installTabSwipes,
    install(options) {
      let initialized = false, returning = false, handling = false, departing = false;
      const marker = 'ojjudaWorldHistory';
      const valid = entry => entry?.version === 1 && typeof entry.session === 'string' &&
        Number.isInteger(entry.index) && entry.route && typeof entry.route.tab === 'string';
      const route = () => options.captureRoute?.() || {tab:options.currentTab()};
      const routeKey = value => JSON.stringify(options.routeKey?.(value) || value);
      const clone = value => JSON.parse(JSON.stringify(value));
      const saved = valid(history.state?.[marker]) ? history.state[marker] : null;
      const session = saved?.session || Date.now().toString(36) + Math.random().toString(36).slice(2);
      let current = null, bouncing = false, requested = false, scrollTimer = null, pendingEntry = false;
      const scroll = () => ({x:window.scrollX || 0,y:window.scrollY || 0});
      const hrefFor = value => options.routeUrl?.(value) || location.href;
      const state = entry => ({...(history.state || {}),
        ojjudaWorld:entry.route.tab === 'hub' && !entry.overlay ? 'main' : 'menu', [marker]:entry});
      function write(entry, href, push = false) {
        try {
          history[push ? 'pushState' : 'replaceState'](state(entry), '', href);
          current = entry;
          return true;
        } catch (error) {
          console.warn('화면 이동 기록을 저장하지 못했어요.', error);
          return false;
        }
      }
      function makeEntry(value, index, overlay = false) {
        return {version:1,session,index,route:clone(value),overlay,scroll:{x:0,y:0},
          previousInternal:current?.previousInternal || false};
      }
      function internalReferrer() {
        if (history.length <= 1) return false;
        try {
          const entries=window.navigation?.entries?.(), index=window.navigation?.currentEntry?.index;
          if(Array.isArray(entries)&&Number.isInteger(index)){
            if(index<=0)return false;
            const previous=entries.find(entry=>entry.index===index-1);
            if(previous)return !!previous.url&&new URL(previous.url).origin===new URL(location.href).origin;
          }
          return !!document.referrer&&new URL(document.referrer).origin===new URL(location.href).origin;
        } catch { return false; }
      }
      function restore(entry) {
        handling = true;
        try {
          if (JSON.stringify(route()) !== JSON.stringify(entry.route)) {
            if (options.restoreRoute) options.restoreRoute(clone(entry.route));
            else options.changeTab?.(entry.route.tab);
          }
        } finally { handling = false; }
        const done = () => { if (current?.session === entry.session && current?.index === entry.index)
          window.scrollTo?.(entry.scroll?.x || 0,entry.scroll?.y || 0); };
        if (window.requestAnimationFrame) window.requestAnimationFrame(done); else done();
      }
      function initialize() {
        if (initialized) return;
        initialized = true;
        if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
        const existing = history.state?.[marker];
        if (valid(existing) && existing.session === session && !existing.guard) {
          current = existing;
          restore(existing);
          const active=!!options.hasOverlay?.();
          pendingEntry=existing.overlay&&!active&&options.entryOverlayPending?.()===true;
          if(existing.overlay&&!active&&!pendingEntry&&existing.index>0&&history.length>1){
            // Reloading a transient window leaves no window to close. Consume
            // its proven same-document entry now, not on the user's next Back.
            returning=true;history.back();return;
          }
          write({...existing,route:clone(route()),overlay:active||pendingEntry},location.href);
          return;
        }
        const initial = clone(route()), originalHref = location.href;
        const home = options.homeRoute?.(initial) || {tab:initial.tab === 'park' ? 'park' : 'hub'};
        if (internalReferrer()) {
          write({...makeEntry(initial,0),previousInternal:true},originalHref);
          return;
        }
        // An unlinked entry needs a real service home before its child view.
        // The boundary is separate from that home, so ordinary Back/Forward
        // traverses the visited screens instead of continually replacing them.
        write({...makeEntry(home,-1),guard:true},hrefFor(home));
        write(makeEntry(home,0),hrefFor(home),true);
        if (routeKey(home) !== routeKey(initial)) write(makeEntry(initial,1),originalHref,true);
        else write({...current,route:initial},originalHref);
      }
      function saveScroll() {
        scrollTimer = null;
        if (!initialized || departing || handling || returning || !current || current.guard) return;
        if (history.state?.[marker]?.session !== session || history.state[marker].index !== current.index) return;
        write({...current,route:options.rememberRoute?.(clone(current.route))||current.route,scroll:scroll()},location.href);
      }
      function traverseBack() {
        if (returning || bouncing || departing) return true;
        requested = true;
        history.back();
        return true;
      }
      function bounce(from, target) {
        current = from;
        const delta = from.index - target.index;
        if (delta && typeof history.go === 'function') {
          bouncing = true;
          history.go(delta);
        } else write(from,hrefFor(from.route),true);
      }
      let exitChoice = null, exitingGame = null;
      function requestGameExit() {
        if (exitChoice) return true;
        const game = options.playingGame?.();
        if (!game || game === exitingGame) return false;
        const dialog = document.createElement('dialog');
        dialog.className = 'arcade-exit-choice';
        dialog.setAttribute('aria-labelledby', 'arcade-exit-title');
        dialog.innerHTML = '<h2 id="arcade-exit-title">오락실로 갈까요?</h2><div><button type="button" data-exit-leave>오락실로 나가기</button><button type="button" data-exit-stay autofocus>게임 계속하기</button></div>';
        const resume = options.pauseGame?.(game);
        function finish(leave = false) {
          if (exitChoice?.dialog !== dialog) return;
          exitChoice = null;
          dialog.close();
          dialog.remove();
          if (leave && game.isConnected) {
            exitingGame = game;
            try { options.exitGame(game); }
            finally { exitingGame = null; }
          } else resume?.();
        }
        exitChoice = {game, dialog, finish};
        dialog.querySelector('[data-exit-stay]').onclick = () => finish();
        dialog.querySelector('[data-exit-leave]').onclick = () => finish(true);
        dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
        document.body.append(dialog);
        dialog.showModal();
        return true;
      }
      const back = () => {
        if (departing || returning || bouncing) return true;
        initialize();
        pendingEntry=false;
        if(returning)return true;
        if (exitChoice) { exitChoice.finish(); return true; }
        if (requestGameExit()) return true;
        // Child documents own their own history (Park cards and replies).
        // Their Back must run before traversing the parent's route entries.
        if (options.closeOverlay?.()) return true;
        if (options.canLeave?.() === false) return true;
        if (current.index > 0 || current.previousInternal) return traverseBack();
        options.onRootBack?.();
        return true;
      };
      const sync = () => {
        if (departing || handling) return;
        initialize();
        if (returning || bouncing) return;
        const next = clone(route()), overlay = !!options.hasOverlay?.();
        if(pendingEntry&&!overlay)return;
        if(overlay)pendingEntry=false;
        if (routeKey(next) !== routeKey(current.route)) {
          const remembered=options.rememberRoute?.(clone(current.route));
          if(remembered)write({...current,route:remembered},location.href);
          // A menu selection is a visit even when neither screen is the hub.
          const entry = makeEntry(next,current.index + (current.overlay && !overlay ? 0 : 1),overlay);
          write(entry,hrefFor(next),!(current.overlay && !overlay));
          return;
        }
        if (overlay && !current.overlay) {
          const href = location.href;
          // Removing a deep game's query from its return entry prevents replay
          // on refresh, while the open game's entry keeps the original link.
          write({...current,scroll:scroll()},hrefFor(next));
          write(makeEntry(next,current.index + 1,true),href,true);
        } else if (!overlay && current.overlay) {
          returning = true;
          history.back();
        } else if (JSON.stringify(next)!==JSON.stringify(current.route) ||
          history.state?.[marker]?.session!==session || history.state[marker].index!==current.index) {
          // Child-document state is a payload of this visit, not another parent
          // visit. Also retain the marker when legacy boot code clears state.
          write({...current,route:next,overlay},location.href);
        }
      };
      window.addEventListener('popstate', event => {
        if (departing) return;
        const target = event?.state?.[marker] || history.state?.[marker];
        if (!valid(target) || target.session !== session) return;
        if (bouncing) { bouncing = false; current = target; sync(); return; }
        const from = current, programmatic = returning, approved = requested;
        returning = requested = pendingEntry = false;
        if (!from) { current = target; restore(target); return; }
        if (target.index === from.index && target.guard === from.guard) return;
        const backwards = target.index < from.index;
        if (backwards && from.overlay && !programmatic) {
          handling = true;
          let consumed = false;
          try {
            consumed = requestGameExit() || !!options.closeOverlay?.();
          } finally { handling = false; }
          if (exitChoice || (consumed && options.hasOverlay?.())) { bounce(from,target); return; }
        }
        if (!programmatic && !approved && options.canLeave?.() === false) { bounce(from,target); return; }
        if (target.guard) {
          const home={...target,index:0,overlay:false,guard:undefined};
          write(home,hrefFor(home.route),true);
          restore(home);
          if(from.index===0)options.onRootBack?.();
          return;
        }
        current = target;
        restore(target);
        const active = !!options.hasOverlay?.();
        // Forward can restore a route, but never restart a game or submit a form.
        const actual=clone(route()), normalized=routeKey(actual)!==routeKey(target.route);
        if (programmatic && active && !target.overlay && !normalized) {
          // A new window may open while the previous close is traversing Back.
          // Give it its own entry instead of overwriting the underlying screen.
          sync();
          return;
        }
        if (target.overlay !== active || normalized)
          write({...target,route:actual,overlay:active},normalized?hrefFor(actual):location.href);
      });
      window.addEventListener('pagehide', () => {
        saveScroll();
        departing = true; returning = requested = bouncing = pendingEntry = false;
        if (scrollTimer !== null) clearTimeout(scrollTimer);
      }, { capture: true });
      window.addEventListener('pageshow', event => {
        departing = false; returning = requested = bouncing = false;
        const entry = history.state?.[marker];
        if (initialized && valid(entry) && entry.session === session && !entry.guard) {
          current = entry;
          if (event.persisted) { restore(entry); sync(); }
        }
      });
      window.addEventListener('scroll', () => {
        if (scrollTimer !== null) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(saveScroll,120);
      }, {passive:true});
      document.addEventListener('toggle', event => {
        if (event.target.matches?.('.my-hub details[data-my-group]')) sync();
      }, true);
      // DOM changes only concern the parent overlays. Park's iframe records
      // card/detail routes itself, avoiding a second Back for the same action.
      let overlayActive = !!options.hasOverlay?.();
      let gamingActive = document.body.classList?.contains('gaming') === true;
      new MutationObserver(() => {
        if (exitChoice && !exitChoice.game.isConnected) exitChoice.finish();
        const wasGaming = gamingActive;
        gamingActive = document.body.classList?.contains('gaming') === true;
        if (wasGaming && !gamingActive && !departing && !returning && !bouncing && !handling &&
          history.state?.[marker]?.session===session && history.state[marker].index===current?.index &&
          options.currentTab() === 'arcade') {
          // An asynchronous game close can finish while Back is bouncing to
          // its overlay entry. Never overwrite the underlying target visit.
          const arcadeUrl = options.gameCloseUrl?.();
          if (arcadeUrl && current) write(current,arcadeUrl);
        }
        const active = !!options.hasOverlay?.();
        if (active === overlayActive) return;
        overlayActive = active;
        sync();
      }).observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['class','open','hidden']});
      const {step, attachDocument} = installTabSwipes(options, () => returning || departing);
      // Handle the embedded game's own arcade-exit controls before they discard the round.
      const childExitControls = {
        '/games/mines/index.html': '#face2',
        '/games/sacheonseong/index.html': '#game-home',
        '/games/spot-difference/index.html': '#game-home',
        '/games/ojjuda-tour/index.html': '#exitBtn',
        '/games/matgo.html': '#exit',
        '/games/matgo-online.html': '#exit'
      };
      document.addEventListener('load', event => {
        const frame = event.target;
        if (frame.tagName !== 'IFRAME') return;
        const child = frame.contentDocument;
        const selector = child && childExitControls[child.location.pathname];
        if (!selector) return;
        child.addEventListener('click', click => {
          if (click.button !== 0 || click.ctrlKey || click.metaKey || click.shiftKey || click.altKey) return;
          if (click.target.closest?.(selector) && options.playingGame?.()?.contains(frame) && requestGameExit()) {
            click.preventDefault(); click.stopImmediatePropagation();
          }
        }, true);
      }, true);
      document.addEventListener('cancel', event => {
        if (!exitingGame && event.target === options.playingGame?.() && requestGameExit()) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && exitChoice) {
          event.preventDefault(); event.stopImmediatePropagation(); exitChoice.finish();
        }
      }, true);
      document.addEventListener('click', event => {
        const button = event.target.closest?.('.ghead [data-g="close"],[data-bl="close"],[data-bd="close"],.tour-game-header button,.roulette-game-dialog>header button,.spot-game-header button,#matgo-overlay [aria-label="맞고 닫기"],#ttang-overlay [aria-label="월드땅따먹기 닫기"],#photo-ttang-overlay .arcade-return');
        if (button && options.playingGame?.()?.contains(button) && requestGameExit()) {
          event.preventDefault(); event.stopImmediatePropagation();
        }
      }, true);
      document.addEventListener('click', event => {
        if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        if (!options.isMain() || !event.target.closest?.('.festival-schedule-dialog .agit-home-link,.restaurant-guide-dialog .agit-home-link')) return;
        event.preventDefault();
        back();
      });
      return {sync, back, attachDocument, step, requestGameExit, isRestoring:()=>handling};
    }
  };
})();

/* World-only ambient audio; navigation remains independent if audio fails. */
(() => {
  if (window.top !== window || !/(?:^|\/)world(?:\.html)?\/?$/.test(location.pathname) ||
      document.getElementById('world-bgm-loader') || window.OjjudaWorldBgm) return;
  const script = document.createElement('script');
  script.id = 'world-bgm-loader';
  script.src = '/app/world/world-bgm.js?v=20261106-source-folders1';
  script.async = true;
  document.head.append(script);
})();
