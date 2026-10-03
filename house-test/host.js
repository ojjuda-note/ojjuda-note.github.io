import {createHouseEntryLoading,waitForHousePaint} from './entry-loading.js?v=20261004-entry1';
let activeClose=null;
export function openHouseTest({owner,authorized,studioAuthorized=null,preview=null,studioItem=null,preserveWorldNavigation=false,onClose,onStudio}){
 if(typeof owner!=='string'||!owner||owner.length>180||typeof authorized!=='function'||!authorized())return;
 // Opening a member's home does not grant furniture authoring permission.
 const hasStudioAccess=()=>{try{return !!authorized()&&typeof studioAuthorized==='function'&&studioAuthorized()===true;}catch{return false;}};
 const studioOnly=preview!==null||studioItem!==null;
 let canUseStudio=hasStudioAccess();if(studioOnly&&!canUseStudio)return;
 activeClose?.();const oldOverflow=document.body.style.overflow,lastFocus=document.activeElement;
 const overlay=document.createElement('div');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','우리집');
 Object.assign(overlay.style,{position:'fixed',inset:'var(--app-viewport-top,0px) 0 auto',height:'var(--app-viewport-height,100dvh)',paddingBottom:'var(--app-safe-bottom,env(safe-area-inset-bottom,0px))',boxSizing:'border-box',zIndex:'10000',background:'#f8f2fc',display:'flex',flexDirection:'column'});
 const status=document.createElement('div');status.setAttribute('role','status');Object.assign(status.style,{padding:'calc(8px + env(safe-area-inset-top,0px)) 64px 8px 15px',flexShrink:'0',fontSize:'12px',color:'#65526f',background:'#fffaf4'});
 const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','우리집 닫기');close.title='우리집 닫기';close.style.cssText='position:absolute;right:10px;top:calc(8px + env(safe-area-inset-top,0px));z-index:2;border:1px solid #dbcee5;background:#fffaf4;color:#65526f;border-radius:14px;width:44px;height:44px;font-size:26px;line-height:1;cursor:pointer';
 const frame=document.createElement('iframe');frame.title='우리집';frame.src=new URL('./index.html?v=20261004-chairback1',import.meta.url).href;frame.style.cssText='width:100%;flex:1;border:0;min-height:0';
 const loading=createHouseEntryLoading();frame.style.visibility='hidden';frame.inert=true;overlay.setAttribute('aria-busy','true');
 overlay.append(status,frame,loading,close);document.body.append(overlay);document.body.style.overflow='hidden';close.focus();
 let channel=null,closed=false,navigation=null,navigationFrame=0,stopPaintWait=()=>{};
 function reveal(message){if(closed)return;stopPaintWait();stopPaintWait=()=>{};loading.remove();frame.style.visibility='';frame.inert=false;overlay.setAttribute('aria-busy','false');status.textContent=message;}
 const navigationObserver=preserveWorldNavigation&&!studioOnly&&window.ResizeObserver?new ResizeObserver(scheduleNavigationSpace):null;
 function updateNavigationSpace(){
  navigationFrame=0;if(closed||!preserveWorldNavigation||studioOnly)return;
  const viewport=window.visualViewport;if(viewport&&Math.abs(viewport.scale-1)>.02)return;
  const next=document.querySelector('.bottomnav');
  if(next!==navigation){if(navigation)navigationObserver?.unobserve(navigation);navigation=next;if(navigation)navigationObserver?.observe(navigation);}
  const rect=navigation?.getBoundingClientRect(),style=navigation&&getComputedStyle(navigation),top=Math.max(0,viewport?.offsetTop||0),height=viewport?.height||window.innerHeight;
  const visible=rect&&rect.width>0&&rect.height>0&&rect.top>=top&&rect.top<top+height&&style.display!=='none'&&style.visibility!=='hidden';
  const inset=visible?Math.max(0,top+height-rect.top):0;
  overlay.style.height=inset?`calc(var(--app-viewport-height,100dvh) - ${inset}px)`:'var(--app-viewport-height,100dvh)';
  overlay.style.paddingBottom=inset?'0px':'var(--app-safe-bottom,env(safe-area-inset-bottom,0px))';
  overlay.setAttribute('aria-modal',String(!inset));
 }
 function scheduleNavigationSpace(){if(!closed&&!navigationFrame)navigationFrame=requestAnimationFrame(updateNavigationSpace);}
 if(preserveWorldNavigation&&!studioOnly){updateNavigationSpace();window.addEventListener('resize',scheduleNavigationSpace);window.visualViewport?.addEventListener('resize',scheduleNavigationSpace);window.visualViewport?.addEventListener('scroll',scheduleNavigationSpace);}
 function cleanup(){if(closed)return;closed=true;clearInterval(watcher);clearTimeout(deadline);stopPaintWait();cancelAnimationFrame(navigationFrame);navigationObserver?.disconnect();window.removeEventListener('resize',scheduleNavigationSpace);window.visualViewport?.removeEventListener('resize',scheduleNavigationSpace);window.visualViewport?.removeEventListener('scroll',scheduleNavigationSpace);channel?.port1.postMessage({type:'dispose'});channel?.port1.close();overlay.remove();document.body.style.overflow=oldOverflow;window.removeEventListener('keydown',escape,true);if(lastFocus?.isConnected)lastFocus.focus();if(activeClose===cleanup)activeClose=null;onClose?.();}
 const escape=e=>{if(e.key==='Escape'){e.preventDefault();cleanup();}};window.addEventListener('keydown',escape,true);close.onclick=cleanup;activeClose=cleanup;
 const watcher=setInterval(()=>{
  if(!authorized()||!overlay.isConnected){cleanup();return;}
  if(preserveWorldNavigation&&!studioOnly)scheduleNavigationSpace();
  const allowed=hasStudioAccess();if(studioOnly&&!allowed){cleanup();return;}
  if(allowed!==canUseStudio){canUseStudio=allowed;channel?.port1.postMessage({type:'studio-access',canUseStudio});}
 },400);
 const deadline=setTimeout(()=>reveal('화면을 불러오지 못했어요. 닫은 뒤 다시 열어 주세요.'),20000);
 frame.addEventListener('load',()=>{
  if(closed||!authorized()||(studioOnly&&!hasStudioAccess())){cleanup();return;}
  canUseStudio=hasStudioAccess();channel?.port1.close();channel=new MessageChannel();
  channel.port1.onmessage=e=>{
   if(closed)return;if(!authorized()){cleanup();return;}
   if(e.data?.type==='ready'){stopPaintWait();stopPaintWait=waitForHousePaint(frame,()=>{if(closed)return;if(!authorized()){cleanup();return;}clearTimeout(deadline);reveal(preview?'제작 가구 미리보기 · 기존 배치는 저장하지 않습니다':'변경 내용은 이 기기에 저장됩니다');});}
   else if(e.data?.type==='failed'){clearTimeout(deadline);reveal('우리집을 불러오지 못했어요. 닫은 뒤 다시 열어 주세요.');}
   else if(e.data?.type==='close')cleanup();
   else if(e.data?.type==='studio'){
    if(!hasStudioAccess())return;
    cleanup();if(!hasStudioAccess())return;
    if(typeof onStudio==='function')onStudio();
    else import('./studio-host.js?v=20261004-studioperf2').then(({openFurnitureStudio})=>{if(hasStudioAccess())openFurnitureStudio({owner,authorized:hasStudioAccess});});
   }
  };
  frame.contentWindow.postMessage({type:'ojjuda-house-test-init',owner,preview,studioItem,canUseStudio},location.origin,[channel.port2]);
 });
 return cleanup;
}
