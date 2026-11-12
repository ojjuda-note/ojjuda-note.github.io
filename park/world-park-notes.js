/* Park supplies content and actions; World owns the only application chrome. */
(() => {
  'use strict';
  const actions = new Set(['feed','saved','mine','events','event-new','blocked','settings','compose','glasses']);
  const loadingCards=Array.from({length:3},()=>'<div class="park-skeleton-card"><div class="park-skeleton-photo"><span class="park-skeleton-quote"></span><span class="park-skeleton-quote short"></span></div><div class="park-skeleton-meta"><span></span><span></span></div></div>').join('');
  function menuMarkup() {
    return `<details class="my-menu-group" data-my-group="park"><summary class="my-menu-summary"><span class="my-menu-icon" aria-hidden="true">▤</span><span class="my-menu-copy"><span class="my-menu-title">공원 활동</span></span></summary><div class="my-menu-body park-menu-actions">${[['feed','공원 카드'],['saved','메모함'],['mine','내 카드'],['events','내 이벤트'],['event-new','이벤트 만들기'],['settings','회원정보'],['blocked','공원 차단 목록'],['glasses','스마트 글래스 미리보기']].map(([action,label])=>`<button type="button" class="btn" data-park-action="${action}">${label}</button>`).join('')}</div></details>`;
  }
  window.OjjudaParkNotes = {menuMarkup,install(app) {
    let frame=null,panel=null,owner=null,routed=false,initial=true,pending=null,overlayOpen=false,cardOpen=false,stopFrameNavigation=()=>{};
    let cacheTimer=null,frameVisible=false;
    // Short menu visits should not parse the entire Park app again. Retire an
    // inactive iframe so its feed, scripts and connections do not live forever.
    const cacheLifetime=60_000;
    const active=()=>app.place()?.id==='park';
    const requested=new URL(location.href).searchParams.get('place')==='park';
    const api=()=>{try{return frame?.contentWindow.OjjudaParkFull;}catch{return null;}};
    function markup() {
      return `<section class="park-app" data-park-app aria-label="공원 카드"><div class="park-app-slot" data-park-app-slot></div><div class="park-load-cover" data-park-loading role="status"><p>🌷 쭈가 오늘의 카드를 모으는 중…</p><div class="park-skeleton-grid" aria-hidden="true">${loadingCards}</div></div><button type="button" class="park-compose-fab" data-park-action="compose" aria-label="새 카드 쓰기"><span aria-hidden="true">＋</span> 카드 쓰기</button></section>`;
    }
    function route(){if(requested&&!routed){routed=true;app.enter();}}
    function syncFab(){const button=panel?.querySelector('.park-compose-fab'),cover=panel?.querySelector('[data-park-loading]');if(button)button.hidden=overlayOpen||cardOpen||frame?.dataset.view==='glasses'||cover?.hidden===false;}
    function loading(visible){const cover=panel?.querySelector('[data-park-loading]');if(cover)cover.hidden=!visible;syncFab();}
    function flush(){
      if(!active()||!pending||!api()?.navigate)return;
      const action=pending;pending=null;api().navigate(action);
    }
    function stopGestures(){stopFrameNavigation();stopFrameNavigation=()=>{};}
    function notifyVisibility(visible){
      try{frame?.contentWindow?.postMessage({type:'ojjuda:park-visibility',visible},location.origin);}catch{}
    }
    function setVisible(visible){
      if(frameVisible===visible)return;
      frameVisible=visible;notifyVisibility(visible);
    }
    function clearRetirement(){if(cacheTimer!==null){clearTimeout(cacheTimer);cacheTimer=null;}}
    function retire(){
      cacheTimer=null;
      if(active()||!panel?.hidden)return;
      stopGestures();panel.remove();frame=panel=null;owner=null;frameVisible=false;overlayOpen=cardOpen=false;
    }
    function forget(){
      clearRetirement();stopGestures();frame=panel=null;owner=null;frameVisible=false;overlayOpen=cardOpen=false;
    }
    function sync(){
      const next=document.querySelector('[data-park-app]');
      document.documentElement.classList.toggle('world-park-active',active()&&!!next);
      if(!active()||!next){
        if(frame?.isConnected&&panel===next&&owner===app.userId()){
          panel.hidden=true;panel.setAttribute('aria-hidden','true');
          stopGestures();setVisible(false);
          if(cacheTimer===null)cacheTimer=setTimeout(retire,cacheLifetime);
          return;
        }
        forget();return;
      }
      if(frame?.isConnected&&panel===next&&owner===app.userId()){
        const wasHidden=panel.hidden;
        clearRetirement();panel.hidden=false;panel.removeAttribute('aria-hidden');
        if(wasHidden){stopGestures();stopFrameNavigation=app.onFrameReady?.(frame)||(()=>{});}
        setVisible(true);syncFab();flush();return;
      }
      forget();
      panel=next;owner=app.userId();overlayOpen=false;cardOpen=false;
      const view=initial&&new URL(location.href).searchParams.get('view')==='glasses'?'glasses':'cards';
      const url=new URL(view==='glasses'?'/park/glasses.html':'/park/',location.origin);url.searchParams.set('embedded','1');url.searchParams.set('v','20261112-reply-overlay1');
      if(initial){const source=new URL(location.href);for(const key of ['card','keep','compose'])if(source.searchParams.has(key))url.searchParams.set(key,source.searchParams.get(key));initial=false;}
      frame=document.createElement('iframe');frame.title='공원 카드';frame.allow='geolocation; clipboard-write; web-share';frame.dataset.view=view;frame.src=url.pathname+url.search;
      frameVisible=true;
      panel.querySelector('[data-park-app-slot]').replaceChildren(frame);loading(true);
      const currentFrame=frame;
      frame.addEventListener('load',()=>{
        if(frame!==currentFrame||!frame?.isConnected)return;
        let path='';try{path=frame.contentWindow.location.pathname;}catch{}
        if(path!=='/park/'&&path!=='/park/glasses.html')return;
        frame.dataset.view=path.endsWith('/glasses.html')?'glasses':'cards';
        loading(false);
        if(!active()||panel.hidden){notifyVisibility(false);return;}
        stopGestures();stopFrameNavigation=app.onFrameReady?.(frame)||(()=>{});
        notifyVisibility(true);cardOpen=api()?.cardOpen?.()===true;syncFab();flush();
      });
    }
    function canLeave(){if(!active())return true;try{return frame?.contentWindow.canCloseParkNote?.()!==false;}catch{return true;}}
    function close(){if(!active())return false;try{if(api()?.back?.())return true;}catch{}return false;}
    function open(action='feed'){
      if(!actions.has(action))return;
      pending=action;
      if(!active()){app.enter();return;}
      if(frame?.dataset.view==='glasses'&&action!=='glasses'){loading(true);frame.src='/park/?embedded=1&v=20261112-reply-overlay1';return;}
      flush();
    }
    function refreshBalance(){api()?.refreshBalance?.();}
    function preserveShell(markup){
      if(!frame?.isConnected||owner!==app.userId())return false;
      const appNode=document.getElementById('app'),main=panel.parentElement;
      const template=document.createElement('template');template.innerHTML=markup;
      const nextPanel=template.content.querySelector('[data-park-app]'),nextMain=template.content.querySelector('main.main');
      if((active()&&!nextPanel)||!nextMain||!main?.matches('main.main'))return false;
      for(const selector of ['.side','.topbar','.bottomnav']){const old=appNode.querySelector(selector),next=template.content.querySelector(selector);if(old&&next)old.replaceWith(next);}
      // Keep the iframe connected (reparenting it would reload the document).
      // Rebuild the surrounding menu, but leave the Park panel in its place.
      for(const child of [...main.childNodes])if(child!==panel)child.remove();
      let afterPanel=false;
      for(const child of [...nextMain.childNodes]){
        if(child.matches?.('[data-park-app]')){afterPanel=true;continue;}
        if(afterPanel)main.append(child);else main.insertBefore(child,panel);
      }
      return true;
    }
    document.addEventListener('click',event=>{
      const shortcut=event.target.closest?.('[data-park-action]');
      if(shortcut){event.preventDefault();open(shortcut.dataset.parkAction);return;}
      const target=event.target.closest?.('[data-act="pl-leave"],[data-act="tab"],[data-act="enter-place"],[data-act="house-open"]');
      if(!target||!active())return;
      const stays=(target.dataset.act==='enter-place'&&target.dataset.id==='park')||(target.dataset.act==='tab'&&target.dataset.tab==='park');
      if(!stays&&!canLeave()){event.preventDefault();event.stopImmediatePropagation();}
    },true);
    addEventListener('message',event=>{
      if(event.origin!==location.origin||event.source!==frame?.contentWindow)return;
      if(event.data?.type==='ojjuda:park-ready'){loading(false);flush();}
      if(event.data?.type==='ojjuda:park-state'){overlayOpen=event.data.overlayOpen===true;cardOpen=event.data.cardOpen===true;syncFab();}
      if(event.data?.type==='ojjuda:park-navigate'&&canLeave()){
        if(event.data.action==='world')app.toWorld?.();
        if(event.data.action==='menu')app.toMenu?.();
        if(event.data.action==='board')app.toBoard?.();
        if(event.data.action==='library')app.previousPlace?.();
      }
      if(event.data?.type==='ojjuda:park-balance'&&event.data.userId===owner&&owner&&Number.isSafeInteger(event.data.coins)&&event.data.coins>=0)app.onBalance?.(event.data.coins,owner);
      if(event.data?.type==='ojjuda:park-card-published'&&event.data.userId===owner&&owner&&typeof event.data.cardId==='string'&&/^[0-9a-f-]{36}$/i.test(event.data.cardId))app.onCardPublished?.(event.data.cardId);
    });
    return {refresh:()=>active()?(api()?.refresh?.()??false):false,markup,sync,route,canLeave,close,open,refreshBalance,preserveShell,requested};
  }};
})();
