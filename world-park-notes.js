/* The complete card application lives in World Park, with one persistent frame. */
(() => {
  'use strict';
  window.OjjudaParkNotes = {install(app) {
    let frame = null, panel = null, owner = null, room = null, full = false, routed = false, initial = true;
    const active = () => app.place()?.id === 'park';
    const requested = new URL(location.href).searchParams.get('place') === 'park';
    function markup() {
      return '<section class="park-app" data-park-app><div class="park-app-tools"><button type="button" class="btn sm" data-park-expand aria-pressed="false">크게 보기</button></div><div class="park-app-slot" data-park-app-slot><p role="status">공원을 불러오는 중이에요…</p></div></section>';
    }
    function route() { if (requested && !routed) { routed = true; app.enter(); } }
    function sync() {
      const next = document.querySelector('[data-park-app]');
      if (!active() || !next) { frame = panel = room = null; owner = null; full = false; document.documentElement.classList.remove('park-app-expanded'); return; }
      if (frame?.isConnected && panel === next && owner === app.userId()) { room = app.place(); return; }
      panel = next; owner = app.userId(); room = app.place();
      const url = new URL(initial && new URL(location.href).searchParams.get('view')==='glasses' ? '/park/glasses.html' : '/park/',location.origin);url.searchParams.set('embedded','1');
      if (initial) { const source=new URL(location.href); for (const key of ['card','keep','compose']) if(source.searchParams.has(key))url.searchParams.set(key,source.searchParams.get(key)); initial=false; }
      frame=document.createElement('iframe');frame.title='공원 · 카드, 작성, 메모함, 메뉴';frame.allow='geolocation; clipboard-write; web-share';frame.src=url.pathname+url.search;
      panel.querySelector('[data-park-app-slot]').replaceChildren(frame);
      frame.addEventListener('load',()=>{ if(frame?.isConnected) frame.contentWindow.postMessage({type:'ojjuda:park-host-ready'},location.origin); });
    }
    function canLeave() {
      try { return frame?.contentWindow.canCloseParkNote?.() !== false; } catch { return true; }
    }
    function expand(value = !full) {
      if (!panel?.isConnected) return;
      full=value;panel.classList.toggle('park-app-full',full);document.documentElement.classList.toggle('park-app-expanded',full);
      const button=panel.querySelector('[data-park-expand]');button.textContent=full?'작게 보기':'크게 보기';button.setAttribute('aria-pressed',String(full));
    }
    function close() {
      try { if (frame?.contentWindow.OjjudaParkFull?.back?.()) return true; } catch {}
      if (full) { expand(false); return true; }
      return false;
    }
    function preserveShell(markup) {
      if (!active() || !frame?.isConnected || owner !== app.userId()) return false;
      const appNode=document.getElementById('app'),entry=appNode.querySelector('[data-park-entry]');
      const template=document.createElement('template');template.innerHTML=markup;
      const nextEntry=template.content.querySelector('[data-park-entry]');
      if(!entry||!nextEntry)return false;
      for(const selector of ['.side','.topbar','.bottomnav']){const old=appNode.querySelector(selector),next=template.content.querySelector(selector);if(old&&next)old.replaceWith(next);}
      // Replacing only the scene keeps the frame, editor, scroll and pending upload connected.
      entry.firstElementChild.replaceWith(nextEntry.firstElementChild);
      const main=entry.parentElement,nextMain=template.content.querySelector('main.main');
      for(const child of [...main.childNodes])if(child!==entry&&child!==panel)child.remove();
      for(const child of [...nextMain.childNodes])if(!child.matches?.('[data-park-entry],[data-park-app]'))main.insertBefore(child,entry);
      return true;
    }
    document.addEventListener('click',event=>{
      const target=event.target.closest?.('[data-park-expand],[data-act="pl-leave"],[data-act="tab"],[data-act="enter-place"],[data-act="house-open"]');
      if(!target||!active())return;
      if(target.hasAttribute('data-park-expand')){event.preventDefault();expand();return;}
      const stays=target.dataset.act==='enter-place'&&target.dataset.id==='park';
      if(!stays&&!canLeave()){event.preventDefault();event.stopImmediatePropagation();}
    },true);
    addEventListener('message',event=>{
      if(event.origin!==location.origin||event.source!==frame?.contentWindow)return;
      if(event.data?.type==='ojjuda:park-expand')expand();
    });
    return {markup,sync,route,canLeave,close,preserveShell,requested};
  }};
})();
