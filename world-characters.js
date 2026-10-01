(function(){
  'use strict';
  const escape=value=>JSON.stringify(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  window.OjjudaCharacters={
    portraitMarkup(config,fallback,self){return `<span class="world-avatar"${self?' data-avatar-self="true"':''} data-avatar-portrait="${escape(config)}">${fallback}</span>`;},
    install(app){
      const entries=new Map(),cache=new Map(),pending=new Set(),observed=new Set(),attempts=new WeakMap();let standby=null,scheduled=0,busy=false,suspended=false,retry=0,retries=0;
      const root=document.body;
      const visible=new IntersectionObserver(changes=>{for(const item of changes)if(item.isIntersecting){pending.add(item.target);visible.unobserve(item.target);}pump();},{rootMargin:'80px'});
      function engine(){for(const entry of entries.values())if(entry.api&&entry.host.isConnected&&!entry.failed)return entry.api;const room=document.querySelector('#stage .room3d-frame, #pstage .place3d-frame');return room?.contentWindow?.Ojjuda3D||standby?.api;}
      function create(host,kind){
        const frame=document.createElement('iframe');frame.className='character-frame';frame.title=kind==='pet'?'나와 펫의 교감 공간':'내 아바타 입체 미리보기';frame.src='/room3d/index.html?view='+kind+'&v=20261001-1';
        const entry={host,kind,frame,api:null,key:app.identity(),failed:false};entries.set(host,entry);host.append(frame);
        entry.timeout=setTimeout(()=>fail(entry),18000);
        return entry;
      }
      function fail(entry){entry.failed=true;delete entry.host.dataset.characterReady;entry.frame.hidden=true;entry.api?.setActive(false);clearTimeout(entry.timeout);}
      function payload(entry){return entry.kind==='pet'?app.pet(entry.host.closest('[data-pet]')?.dataset.pet):{kind:'avatar',avatar:app.avatar()};}
      function syncEntry(entry){if(!entry.api||entry.failed)return;const data=payload(entry);if(!data)return fail(entry);try{entry.api.applyCharacter(data);entry.host.dataset.characterReady='true';}catch(error){console.warn('Character preview unavailable',error);fail(entry);}}
      function scan(){
        scheduled=0;if(suspended)return;
        for(const [host,entry] of entries)if(!host.isConnected||entry.key!==app.identity()){entry.api?.dispose();clearTimeout(entry.timeout);entry.frame.remove();entries.delete(host);}
        for(const [selector,kind] of [['#av-preview','avatar'],['#modal-root #petscene','pet']]){const host=document.querySelector(selector);if(host){const entry=entries.get(host)||create(host,kind);syncEntry(entry);}}
        for(const node of observed)if(!node.isConnected){visible.unobserve(node);pending.delete(node);observed.delete(node);}
        for(const node of document.querySelectorAll('[data-avatar-self]')){const key=JSON.stringify(app.savedAvatar());if(node.dataset.avatarPortrait!==key){node.dataset.avatarPortrait=key;delete node.dataset.portraitReady;observed.delete(node);}}
        for(const node of document.querySelectorAll('[data-avatar-portrait]:not([data-portrait-ready]),[data-item-preview]:not([data-portrait-ready])'))if(!observed.has(node)){observed.add(node);visible.observe(node);}
        const roomFrame=document.querySelector('#stage .room3d-frame, #pstage .place3d-frame'),room=roomFrame?.contentWindow?.Ojjuda3D,rect=roomFrame?.getBoundingClientRect();room?.setActive(!roomFrame.hidden&&!document.hidden&&!document.querySelector('#gov, #modal-root .modal')&&rect.bottom>=-80&&rect.top<=innerHeight+80);
        pump();
      }
      function schedule(){if(!scheduled&&!suspended)scheduled=requestAnimationFrame(scan);}
      function draw(node,url,key){if(!node.isConnected)return;const image=document.createElement('img');image.alt='';image.src=url;image.onload=()=>{if(node.isConnected&&(node.dataset.itemPreview?'item:'+node.dataset.itemPreview:node.dataset.avatarPortrait)===key){node.replaceChildren(image);node.dataset.portraitReady='true';}};}
      function ensureStandby(){if(standby||entries.size||document.querySelector('#stage .room3d-frame, #pstage .place3d-frame'))return;const frame=document.createElement('iframe');frame.className='character-service';frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');frame.src='/room3d/index.html?view=portrait&v=20261001-1';standby={frame,api:null};root.append(frame);}
      function pump(){
        if(busy||suspended||!pending.size)return;const api=engine();if(!api?.portrait){if(++retries>32){pending.clear();return;}ensureStandby();clearTimeout(retry);retry=setTimeout(pump,250);return;}retries=0;
        busy=true;const work=()=>{try{const node=pending.values().next().value;pending.delete(node);if(node?.isConnected){const item=node.dataset.itemPreview,key=item?'item:'+item:node.dataset.avatarPortrait;let url=cache.get(key);if(!url){url=item?engine()?.itemPortrait(app.itemDefinition(item)):engine()?.portrait(JSON.parse(key));if(!url){const tries=(attempts.get(node)||0)+1;attempts.set(node,tries);if(tries<12)pending.add(node);return;}cache.set(key,url);if(cache.size>192)cache.delete(cache.keys().next().value);}draw(node,url,key);}}catch(error){console.warn('Portrait unavailable',error);}finally{busy=false;if(pending.size)setTimeout(pump,80);}};
        if(window.requestIdleCallback)requestIdleCallback(work,{timeout:900});else setTimeout(work,50);
      }
      window.addEventListener('message',event=>{
        if(event.origin!==location.origin||suspended)return;
        const entry=[...entries.values()].find(x=>event.source===x.frame.contentWindow);
        if(event.data?.type==='ojjuda-room-ready'&&standby&&event.source!==standby.frame.contentWindow){standby.api?.dispose();standby.frame.remove();standby=null;}
        if(entry){if(event.data?.type==='ojjuda-room-error')return fail(entry);if(event.data?.type==='ojjuda-room-ready'){entry.api=entry.frame.contentWindow.Ojjuda3D;entry.api.hooks.onError=()=>fail(entry);clearTimeout(entry.timeout);syncEntry(entry);pump();}}
        else if(standby&&event.source===standby.frame.contentWindow&&event.data?.type==='ojjuda-room-ready'){standby.api=standby.frame.contentWindow.Ojjuda3D;standby.api.setActive(false);pump();}
        else if(event.data?.type==='ojjuda-room-ready')pump();
      });
      new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
      window.addEventListener('pagehide',()=>{suspended=true;for(const entry of entries.values()){entry.api?.dispose();clearTimeout(entry.timeout);entry.frame.remove();}entries.clear();standby?.api?.dispose();standby?.frame.remove();standby=null;clearTimeout(retry);});
      window.addEventListener('pageshow',()=>{suspended=false;schedule();});
      schedule();
      return {sync:schedule,react(name){const entry=[...entries.values()].find(x=>x.kind==='pet'&&x.host.isConnected);entry?.api?.reactCharacter(name);},rotate(delta){for(const entry of entries.values())if(entry.kind==='avatar')entry.api?.rotateCharacter(delta);}};
    }
  };
})();
