import {createHouseEntryLoading,waitForHousePaint} from './entry-loading.js?v=20261004-entry1';
let activeClose=null;
export function openHouseTest({owner,authorized,studioAuthorized=null,preview=null,studioItem=null,preserveWorldNavigation=false,mountTarget=null,records=null,profile=null,room=null,readOnly=false,onProfilePhoto=null,onFrameReady=null,onClose,onStudio}){
 if(typeof owner!=='string'||!owner||owner.length>180||typeof authorized!=='function'||!authorized())return;
 // Opening a member's home does not grant furniture authoring permission.
 const hasStudioAccess=()=>{try{return !!authorized()&&typeof studioAuthorized==='function'&&studioAuthorized()===true;}catch{return false;}};
 const studioOnly=preview!==null||studioItem!==null;
 const inline=mountTarget instanceof HTMLElement&&mountTarget.isConnected&&!studioOnly;
 let canUseStudio=!readOnly&&hasStudioAccess();if(studioOnly&&!canUseStudio)return;
 activeClose?.();const oldOverflow=document.body.style.overflow,lastFocus=document.activeElement;
 const overlay=document.createElement('div');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','우리집');
 Object.assign(overlay.style,{position:'fixed',inset:'var(--app-viewport-top,0px) 0 auto',height:'var(--app-viewport-height,100dvh)',paddingBottom:'var(--app-safe-bottom,env(safe-area-inset-bottom,0px))',boxSizing:'border-box',zIndex:'10000',background:'#f8f2fc',display:'flex',flexDirection:'column'});
 if(inline){overlay.setAttribute('role','region');overlay.removeAttribute('aria-modal');overlay.dataset.houseInline='';Object.assign(overlay.style,{position:'relative',inset:'auto',zIndex:'auto',paddingBottom:'0',width:'100%',overflow:'hidden',borderRadius:'16px'});}
 const status=document.createElement('div');status.setAttribute('role','status');Object.assign(status.style,{padding:'calc(8px + env(safe-area-inset-top,0px)) 64px 8px 15px',flexShrink:'0',fontSize:'12px',color:'#65526f',background:'#fffaf4'});
 const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','우리집 닫기');close.title='우리집 닫기';close.style.cssText='position:absolute;right:10px;top:calc(8px + env(safe-area-inset-top,0px));z-index:2;border:1px solid #dbcee5;background:#fffaf4;color:#65526f;border-radius:14px;width:44px;height:44px;font-size:26px;line-height:1;cursor:pointer';
 if(inline){status.style.padding='10px 82px 10px 12px';status.style.minHeight='48px';close.textContent='나가기';Object.assign(close.style,{top:'4px',right:'8px',width:'66px',height:'40px',fontSize:'13px'});}
 const frame=document.createElement('iframe');frame.title=readOnly?String(profile?.nick||'이웃')+'님의 집':'우리집';frame.src=new URL('./index.html?v=20261004-refresh1',import.meta.url).href;frame.style.cssText='width:100%;flex:1;border:0;min-height:0';
 const loading=inline?document.createElement('div'):createHouseEntryLoading();
 if(inline){status.textContent=readOnly?'방을 불러오는 중이에요…':'우리집을 불러오는 중이에요…';loading.hidden=true;}
 frame.style.visibility='hidden';frame.inert=true;overlay.setAttribute('aria-busy','true');
 const retry=document.createElement('button');retry.textContent='다시 시도';retry.hidden=true;retry.style.cssText='position:absolute;right:84px;top:8px;z-index:3;min-height:36px;border:1px solid #dbcee5;border-radius:10px;background:#fffaf4;color:#65526f';
 overlay.append(status,frame,loading,retry,close);
 if(inline)mountTarget.replaceChildren(overlay);else{document.body.append(overlay);document.body.style.overflow='hidden';}
 close.focus({preventScroll:true});
 const localKey='ojjuda-house-playtest-v1:'+encodeURIComponent(owner),dirtyKey=localKey+':pending-cloud';
 const markDirty=()=>{if(readOnly)return;try{localStorage.setItem(dirtyKey,JSON.stringify({revision}));}catch{}};
 const clearDirty=()=>{if(readOnly)return;try{const current=JSON.parse(localStorage.getItem(localKey));if(current&&JSON.stringify({version:current.version,rooms:current.rooms})!==lastSnapshot){markDirty();return;}localStorage.removeItem(dirtyKey);}catch{}};
 let channel=null,closed=false,navigation=null,navigationFrame=0,stopPaintWait=()=>{},stopFrameNavigation=()=>{},loadRun=0,revision=null,lastSnapshot='',pendingSnapshot=null,saving=false,savePaused=false,memberProfile=null,flightSnapshot=null,visitorHeight=null;
 const timeout=promise=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('연결이 늦어지고 있어요. 다시 시도해 주세요.')),20000);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
 const reload=()=>{retry.hidden=true;savePaused=false;status.hidden=false;status.textContent=readOnly?'방을 불러오는 중이에요…':'우리집을 불러오는 중이에요…';frame.style.visibility='hidden';frame.inert=true;overlay.setAttribute('aria-busy','true');clearTimeout(deadline);deadline=setTimeout(()=>showFailure('화면을 불러오지 못했어요. 다시 시도해 주세요.',reload),20000);frame.src=frame.src;};
 function showFailure(message,again){loading.remove();retry.textContent='다시 시도';status.hidden=false;status.textContent=message;status.style.paddingRight='170px';retry.hidden=false;retry.onclick=again;close.hidden=false;overlay.setAttribute('aria-busy','false');}
 async function saveRoom(){if(saving||savePaused||closed||readOnly||!room||!pendingSnapshot)return;saving=true;
  try{while(pendingSnapshot&&!closed&&authorized()){const next=pendingSnapshot,serial=JSON.stringify(next);pendingSnapshot=null;if(serial===lastSnapshot){if(!pendingSnapshot)clearDirty();continue;}flightSnapshot=next;const result=await timeout(room('save',{snapshot:next,revision}));if(closed)return;if(result?.ok===false){pendingSnapshot=pendingSnapshot||next;savePaused=true;showFailure('다른 곳에서 방이 바뀌었어요. 이 기기의 배치는 보관했어요. 다시 열어 확인해 주세요.',reload);return;}revision=result.revision;lastSnapshot=serial;flightSnapshot=null;if(pendingSnapshot)markDirty();else clearDirty();}if(!closed){status.hidden=true;retry.hidden=true;}}
  catch(error){if(closed)return;pendingSnapshot=pendingSnapshot||flightSnapshot;savePaused=true;showFailure(error.message||'방을 계정에 저장하지 못했어요. 이 기기의 배치는 보관했어요.',()=>{savePaused=false;retry.hidden=true;void saveRoom();});}
  finally{saving=false;}
 }
 function reveal(message,ready=false){if(closed)return;stopPaintWait();stopPaintWait=()=>{};loading.remove();frame.style.visibility='';frame.inert=false;overlay.setAttribute('aria-busy','false');status.textContent=message;status.hidden=ready&&!message;if(inline&&ready){close.hidden=true;if(document.activeElement===close)frame.focus({preventScroll:true});}}
 const trackNavigation=(inline||preserveWorldNavigation)&&!studioOnly;
 const navigationObserver=trackNavigation&&window.ResizeObserver?new ResizeObserver(scheduleNavigationSpace):null;
 if(inline){navigationObserver?.observe(mountTarget);const main=mountTarget.closest('main');if(main)navigationObserver?.observe(main);}
 function updateNavigationSpace(){
  navigationFrame=0;if(closed||!trackNavigation)return;
  const viewport=window.visualViewport;if(viewport&&Math.abs(viewport.scale-1)>.02)return;
  const next=document.querySelector('.bottomnav');
  if(next!==navigation){if(navigation)navigationObserver?.unobserve(navigation);navigation=next;if(navigation)navigationObserver?.observe(navigation);}
  const rect=navigation?.getBoundingClientRect(),style=navigation&&getComputedStyle(navigation),top=Math.max(0,viewport?.offsetTop||0),height=viewport?.height||window.innerHeight;
  const visible=rect&&rect.width>0&&rect.height>0&&rect.top>=top&&rect.top<top+height&&style.display!=='none'&&style.visibility!=='hidden';
  const inset=visible?Math.max(0,top+height-rect.top):0;
  if(inline){
   // Fit the normal World content column, leaving its header/sidebar/menu usable.
   // Use document coordinates so scrolling does not keep growing the room.
   const contentTop=overlay.getBoundingClientRect().top+window.scrollY;
   const bottom=visible?rect.top:top+height;
   overlay.style.height=(readOnly?(visitorHeight||160):Math.max(180,Math.floor(bottom-contentTop)))+'px';
   return;
  }
  overlay.style.height=inset?`calc(var(--app-viewport-height,100dvh) - ${inset}px)`:'var(--app-viewport-height,100dvh)';
  overlay.style.paddingBottom=inset?'0px':'var(--app-safe-bottom,env(safe-area-inset-bottom,0px))';
  overlay.setAttribute('aria-modal',String(!inset));
 }
 function scheduleNavigationSpace(){if(!closed&&!navigationFrame)navigationFrame=requestAnimationFrame(updateNavigationSpace);}
 if(trackNavigation){updateNavigationSpace();window.addEventListener('resize',scheduleNavigationSpace);window.visualViewport?.addEventListener('resize',scheduleNavigationSpace);window.visualViewport?.addEventListener('scroll',scheduleNavigationSpace);}
 function cleanup(){if(closed)return;closed=true;clearInterval(watcher);clearTimeout(deadline);stopPaintWait();stopFrameNavigation();cancelAnimationFrame(navigationFrame);navigationObserver?.disconnect();window.removeEventListener('resize',scheduleNavigationSpace);window.visualViewport?.removeEventListener('resize',scheduleNavigationSpace);window.visualViewport?.removeEventListener('scroll',scheduleNavigationSpace);channel?.port1.postMessage({type:'dispose'});channel?.port1.close();overlay.remove();if(!inline)document.body.style.overflow=oldOverflow;window.removeEventListener('keydown',escape,true);if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});if(activeClose===cleanup)activeClose=null;onClose?.();}
 const escape=e=>{if(e.key==='Escape'&&document.querySelector('dialog[open]'))return;if(e.key==='Escape'){e.preventDefault();cleanup();}};window.addEventListener('keydown',escape,true);close.onclick=cleanup;activeClose=cleanup;
 const watcher=setInterval(()=>{
  if(!authorized()||!overlay.isConnected){cleanup();return;}
  if(trackNavigation)scheduleNavigationSpace();
  const allowed=hasStudioAccess();if(studioOnly&&!allowed){cleanup();return;}
  if(allowed!==canUseStudio){canUseStudio=allowed;channel?.port1.postMessage({type:'studio-access',canUseStudio});}
 },400);
 let deadline=setTimeout(()=>showFailure('화면을 불러오지 못했어요. 다시 시도해 주세요.',reload),20000);
 frame.addEventListener('load',async()=>{
  const run=++loadRun;
  if(closed||!authorized()||(studioOnly&&!hasStudioAccess())){cleanup();return;}
  stopFrameNavigation();stopFrameNavigation=onFrameReady?.(frame)||(()=>{});
  canUseStudio=!readOnly&&hasStudioAccess();channel?.port1.close();channel=new MessageChannel();
  channel.port1.onmessage=async e=>{
   if(closed)return;if(!authorized()){cleanup();return;}
   if(e.data?.type==='room-size'){if(readOnly&&Number.isFinite(e.data.height)){visitorHeight=Math.min(600,Math.max(110,e.data.height));scheduleNavigationSpace();}return;}
   if(e.data?.type==='room-save'){if(!readOnly&&!studioOnly&&typeof room==='function'&&e.data.snapshot){pendingSnapshot=e.data.snapshot;markDirty();void saveRoom();}return;}
   if(e.data?.type==='profile-photo'){if(readOnly||studioOnly||typeof onProfilePhoto!=='function')return;try{const next=await onProfilePhoto();if(next&&!closed&&authorized()){memberProfile={...memberProfile,...next};channel.port1.postMessage({type:'profile-update',profile:memberProfile});}}catch(error){if(!closed)showFailure(error.message||'사진을 바꾸지 못했어요.',()=>{retry.hidden=true;status.hidden=true;});}return;}
   if(e.data?.type==='records-request'){
    if(readOnly||studioOnly||typeof records!=='function'||!Number.isSafeInteger(e.data.id))return;
    const reply=channel.port1;try{const result=await records(e.data.action,e.data.args);if(!closed&&authorized()&&channel.port1===reply)reply.postMessage({type:'records-result',id:e.data.id,result});}
    catch(error){if(!closed&&authorized()&&channel.port1===reply)reply.postMessage({type:'records-result',id:e.data.id,error:error.message||'앨범을 불러오지 못했어요.'});}return;
   }
   if(e.data?.type==='ready'){if(pendingSnapshot&&!savePaused)void saveRoom();stopPaintWait();stopPaintWait=waitForHousePaint(frame,()=>{if(closed)return;if(!authorized()){cleanup();return;}clearTimeout(deadline);if(savePaused){loading.remove();frame.style.visibility='';frame.inert=false;overlay.setAttribute('aria-busy','false');return;}reveal(preview?'제작 가구 미리보기 · 기존 배치는 저장하지 않습니다':'',true);});}
   else if(e.data?.type==='failed'){clearTimeout(deadline);reveal('우리집을 불러오지 못했어요. 다시 시도해 주세요.');showFailure('우리집을 불러오지 못했어요. 다시 시도해 주세요.',reload);}
   else if(e.data?.type==='close')cleanup();
   else if(e.data?.type==='studio'){
    if(readOnly||!hasStudioAccess())return;
    cleanup();if(!hasStudioAccess())return;
    if(typeof onStudio==='function')onStudio();
    else import('./studio-host.js?v=20261004-refresh2').then(({openFurnitureStudio})=>{if(hasStudioAccess())openFurnitureStudio({owner,authorized:hasStudioAccess});});
   }
  };
  memberProfile=!studioOnly&&profile&&typeof profile==='object'?{nick:String(profile.nick||'').slice(0,80),bio:String(profile.bio||'').slice(0,200),avatar_url:String(profile.avatar_url||'')}:null;
  let roomSnapshot=null;
  try{if(!studioOnly&&typeof room==='function'){const result=await timeout(room('load'));if(closed||run!==loadRun||!authorized())return;if(!result||result.ok===false)throw new Error('방을 불러오지 못했어요. 다시 시도해 주세요.');roomSnapshot=result.found?result.snapshot:null;revision=result.found?result.revision:null;lastSnapshot=roomSnapshot?JSON.stringify(roomSnapshot):'';pendingSnapshot=null;savePaused=false;
    if(!readOnly){let pending,local;try{pending=JSON.parse(localStorage.getItem(dirtyKey));local=JSON.parse(localStorage.getItem(localKey));}catch{}
     if(pending&&Array.isArray(local?.rooms)&&local.rooms.length){const recovered={version:local.version,rooms:local.rooms},serial=JSON.stringify(recovered);
      if(serial===lastSnapshot)clearDirty();else{roomSnapshot=recovered;pendingSnapshot=recovered;
       if(pending.revision!==revision){savePaused=true;showFailure('이 기기의 최근 배치를 복구했어요. 계정 배치가 달라 자동 저장하지 않았어요.',()=>{savePaused=false;retry.hidden=true;void saveRoom();});retry.textContent='이 배치 저장';}
      }
     }
    }
   }}
  catch(error){if(!closed&&run===loadRun){clearTimeout(deadline);showFailure(error.message||'방을 불러오지 못했어요.',reload);}return;}
  if(closed||run!==loadRun||!authorized())return;
  frame.contentWindow.postMessage({type:'ojjuda-house-test-init',owner,preview,studioItem,canUseStudio,profile:memberProfile,readOnly,roomSnapshot,hasRoom:!studioOnly&&typeof room==='function',canEditProfile:!readOnly&&typeof onProfilePhoto==='function',hasRecords:!readOnly&&!studioOnly&&typeof records==='function'},location.origin,[channel.port2]);
 });
 cleanup.refresh=async()=>{
  const current=()=>!closed&&authorized()&&!saving&&!pendingSnapshot&&!savePaused;
  if(!current()||!frame.contentDocument?.querySelector('#app.records-home'))return false;
  const result=typeof room==='function'?await timeout(room('load')):null;
  if(!current()||result?.ok===false)return false;
  const refreshed=await frame.contentWindow.OjjudaHouseRefresh?.(result?.found?result.snapshot:null,current);
  if(refreshed!==false&&current()&&result?.found){revision=result.revision;lastSnapshot=JSON.stringify(result.snapshot);}
  return refreshed??false;
 };
 return cleanup;
}
