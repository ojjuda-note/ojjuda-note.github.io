/* Park supplies content and actions; World owns the only application chrome. */
(() => {
  'use strict';
  const actions = new Set(['feed','saved','mine','events','event-new','blocked','settings','compose','glasses']);
  function menuMarkup() {
    return `<details class="my-menu-group" data-my-group="park"><summary class="my-menu-summary"><span class="my-menu-icon" aria-hidden="true">▤</span><span class="my-menu-copy"><span class="my-menu-title">공원 활동</span></span></summary><div class="my-menu-body park-menu-actions">${[['feed','공원 카드'],['saved','메모함'],['mine','내 카드'],['events','내 이벤트'],['event-new','이벤트 만들기'],['settings','회원정보'],['blocked','공원 차단 목록'],['glasses','스마트 글래스 미리보기']].map(([action,label])=>`<button type="button" class="btn" data-park-action="${action}">${label}</button>`).join('')}</div></details>`;
  }
  window.OjjudaParkNotes = {menuMarkup,install(app) {
    let frame=null,panel=null,owner=null,routed=false,initial=true,pending=null,overlayOpen=false,stopFrameNavigation=()=>{};
    const active=()=>app.place()?.id==='park';
    const requested=new URL(location.href).searchParams.get('place')==='park';
    const api=()=>{try{return frame?.contentWindow.OjjudaParkFull;}catch{return null;}};
    function markup() {
      return '<section class="park-app" data-park-app aria-label="공원 카드"><div class="park-app-slot" data-park-app-slot><p role="status">공원을 불러오는 중이에요…</p></div><button type="button" class="park-compose-fab" data-park-action="compose" aria-label="새 카드 쓰기"><span aria-hidden="true">＋</span> 카드 쓰기</button></section>';
    }
    function route(){if(requested&&!routed){routed=true;app.enter();}}
    function syncFab(){const button=panel?.querySelector('.park-compose-fab');if(button)button.hidden=overlayOpen||frame?.dataset.view==='glasses';}
    function flush(){
      if(!pending||!api()?.navigate)return;
      const action=pending;pending=null;api().navigate(action);
    }
    function sync(){
      const next=document.querySelector('[data-park-app]');
      document.documentElement.classList.toggle('world-park-active',active()&&!!next);
      if(!active()||!next){stopFrameNavigation();stopFrameNavigation=()=>{};frame=panel=null;owner=null;overlayOpen=false;return;}
      if(frame?.isConnected&&panel===next&&owner===app.userId()){syncFab();flush();return;}
      stopFrameNavigation();stopFrameNavigation=()=>{};
      panel=next;owner=app.userId();overlayOpen=false;
      const view=initial&&new URL(location.href).searchParams.get('view')==='glasses'?'glasses':'cards';
      const url=new URL(view==='glasses'?'/park/glasses.html':'/park/',location.origin);url.searchParams.set('embedded','1');url.searchParams.set('v','20261004-folder-kind1');
      if(initial){const source=new URL(location.href);for(const key of ['card','keep','compose'])if(source.searchParams.has(key))url.searchParams.set(key,source.searchParams.get(key));initial=false;}
      frame=document.createElement('iframe');frame.title='공원 카드';frame.allow='geolocation; clipboard-write; web-share';frame.dataset.view=view;frame.src=url.pathname+url.search;
      panel.querySelector('[data-park-app-slot]').replaceChildren(frame);syncFab();
      const currentFrame=frame;
      frame.addEventListener('load',()=>{
        if(frame!==currentFrame||!frame?.isConnected)return;
        stopFrameNavigation();stopFrameNavigation=app.onFrameReady?.(frame)||(()=>{});
        try{frame.dataset.view=frame.contentWindow.location.pathname.endsWith('/glasses.html')?'glasses':'cards';}catch{}
        syncFab();flush();
      });
    }
    function canLeave(){try{return frame?.contentWindow.canCloseParkNote?.()!==false;}catch{return true;}}
    function close(){try{if(api()?.back?.())return true;}catch{}return false;}
    function open(action='feed'){
      if(!actions.has(action))return;
      pending=action;
      if(!active()){app.enter();return;}
      if(frame?.dataset.view==='glasses'&&action!=='glasses'){frame.src='/park/?embedded=1&v=20261004-folder-kind1';return;}
      flush();
    }
    function refreshBalance(){api()?.refreshBalance?.();}
    function preserveShell(markup){
      if(!active()||!frame?.isConnected||owner!==app.userId())return false;
      const appNode=document.getElementById('app'),main=panel.parentElement;
      const template=document.createElement('template');template.innerHTML=markup;
      const nextPanel=template.content.querySelector('[data-park-app]'),nextMain=template.content.querySelector('main.main');
      if(!nextPanel||!nextMain||!main?.matches('main.main'))return false;
      for(const selector of ['.side','.topbar','.bottomnav']){const old=appNode.querySelector(selector),next=template.content.querySelector(selector);if(old&&next)old.replaceWith(next);}
      // Do not disconnect the card app while badges/balance/World menus repaint.
      for(const child of [...main.childNodes])if(child!==panel)child.remove();
      for(const child of [...nextMain.childNodes])if(!child.matches?.('[data-park-app]'))main.insertBefore(child,panel);
      return true;
    }
    document.addEventListener('click',event=>{
      const shortcut=event.target.closest?.('[data-park-action]');
      if(shortcut){event.preventDefault();open(shortcut.dataset.parkAction);return;}
      const target=event.target.closest?.('[data-act="pl-leave"],[data-act="tab"],[data-act="enter-place"],[data-act="house-open"]');
      if(!target||!active())return;
      const stays=target.dataset.act==='enter-place'&&target.dataset.id==='park';
      if(!stays&&!canLeave()){event.preventDefault();event.stopImmediatePropagation();}
    },true);
    addEventListener('message',event=>{
      if(event.origin!==location.origin||event.source!==frame?.contentWindow)return;
      if(event.data?.type==='ojjuda:park-ready'){syncFab();flush();}
      if(event.data?.type==='ojjuda:park-state'){overlayOpen=event.data.overlayOpen===true;syncFab();}
      if(event.data?.type==='ojjuda:park-navigate'&&canLeave()){
        if(event.data.action==='world')app.toWorld?.();
        if(event.data.action==='menu')app.toMenu?.();
        if(event.data.action==='library')app.previousPlace?.();
      }
      if(event.data?.type==='ojjuda:park-balance'&&event.data.userId===owner&&owner&&Number.isSafeInteger(event.data.coins)&&event.data.coins>=0)app.onBalance?.(event.data.coins,owner);
    });
    return {refresh:()=>api()?.refresh?.()??false,markup,sync,route,canLeave,close,open,refreshBalance,preserveShell,requested};
  }};
})();
