import {saveMadeItem,listMadeItems} from './custom-store.js?v=20261004-chairfarrear1';
import {validateRuntime} from './anchor-editor/runtime.js?v=20261004-chairfarrear1';
import {openHouseTest} from './host.js?v=20261004-refresh2';
let activeClose=null;
export function openFurnitureStudio({owner,authorized}){
 if(typeof owner!=='string'||!owner||owner.length>180||typeof authorized!=='function'||!authorized())return;
 activeClose?.();const oldOverflow=document.body.style.overflow,lastFocus=document.activeElement;
 const overlay=document.createElement('div');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','가구 제작실');
 overlay.style.cssText='position:fixed;inset:var(--app-viewport-top,0px) 0 auto;height:var(--app-viewport-height,100dvh);padding-bottom:var(--app-safe-bottom,env(safe-area-inset-bottom,0px));box-sizing:border-box;z-index:10000;background:#fffaf4;display:flex;flex-direction:column';
 const top=document.createElement('div');top.style.cssText='display:flex;gap:10px;align-items:center;padding:calc(8px + env(safe-area-inset-top,0px)) 12px 8px;flex-shrink:0;background:#fffaf4;color:#65526f;font-size:12px';
 const status=document.createElement('span');status.textContent='가구 제작실을 준비하고 있어요…';status.style.flex='1';
 const close=document.createElement('button');close.textContent='제작실 닫기';close.style.cssText='min-height:36px;border:1px solid #dbcee5;border-radius:10px;padding:6px 10px;background:#fffaf4;color:#65526f;cursor:pointer';
 const frame=document.createElement('iframe');frame.title='관리자 가구 제작실';frame.src=new URL('./anchor-editor/index.html?v=20261004-home3',import.meta.url).href;frame.style.cssText='width:100%;flex:1;min-height:0;border:0';
 top.append(status,close);overlay.append(top,frame);document.body.append(overlay);document.body.style.overflow='hidden';close.focus();
 let channel,closed=false,nestedClose=null,busy=false,closing=null;
 function cleanup(){if(closed)return;closed=true;nestedClose?.();clearInterval(watcher);clearTimeout(deadline);clearTimeout(closing?.timer);channel?.port1.postMessage({type:'dispose'});channel?.port1.close();overlay.remove();document.body.style.overflow=oldOverflow;window.removeEventListener('keydown',escape,true);if(lastFocus?.isConnected)lastFocus.focus();if(activeClose===cleanup)activeClose=null;}
 function requestClose(){
  if(closed||closing)return;if(!channel)return cleanup();
  close.disabled=true;status.textContent='마지막 변경을 저장하고 있어요…';
  const id=crypto.randomUUID();closing={id,timer:setTimeout(()=>{closing=null;close.disabled=false;channel?.port1.postMessage({type:'close-cancel',requestId:id});status.textContent='저장 확인이 늦어지고 있어요. 작업 파일을 저장하거나 닫기를 다시 눌러 주세요.';},15000)};
  channel.port1.postMessage({type:'before-close',requestId:id});
 }
 const escape=e=>{if(e.key==='Escape'&&!nestedClose){e.preventDefault();requestClose();}};window.addEventListener('keydown',escape,true);close.onclick=requestClose;activeClose=cleanup;
 const watcher=setInterval(()=>{if(!authorized()||!overlay.isConnected)cleanup();},400);
 const deadline=setTimeout(()=>{status.textContent='제작실을 불러오지 못했어요. 닫은 뒤 다시 열어 주세요.';},25000);
 const showHome=options=>{if(closed||!authorized())return;nestedClose?.();nestedClose=openHouseTest({owner,authorized,...options,studioAuthorized:authorized,onClose:()=>{nestedClose=null;},onStudio:()=>frame.focus()});};
 frame.addEventListener('load',()=>{
  if(closed||!authorized())return cleanup();channel?.port1.close();channel=new MessageChannel();
  channel.port1.onmessage=async e=>{
   if(closed)return;if(!authorized())return cleanup();const data=e.data;
   if(data?.type==='ready'){clearTimeout(deadline);status.textContent='관리자 제작실 · 작업과 적용 아이템은 이 기기에 저장됩니다';return;}
   if(data?.type==='close-ready'||data?.type==='close-failed'){
    if(!closing||data.requestId!==closing.id)return;clearTimeout(closing.timer);closing=null;
    if(data.type==='close-ready')cleanup();else{close.disabled=false;status.textContent=data.error||'저장하지 못했어요. 작업 파일을 먼저 저장해 주세요.';}return;
   }
   if(typeof data?.requestId!=='string'||data.requestId.length>80)return;
   const reply=value=>{if(!closed&&authorized())channel.port1.postMessage({requestId:data.requestId,...value});};
   if(busy)return reply({error:'앞선 작업이 끝난 뒤 다시 눌러 주세요.'});busy=true;
   try{
    if(data.type==='list'){const records=await listMadeItems(owner);reply({items:records.map(r=>({id:r.id,name:r.runtime.name}))});}
    else if(data.type==='project'){const record=(await listMadeItems(owner)).find(r=>r.id===data.id);if(!record)throw new Error('등록한 작업을 찾지 못했어요.');reply({project:record.project});}
    else if(data.type==='home'){if(authorized())showHome({});reply({ok:true});}
    else if(data.type==='apply'||data.type==='preview'){
     validateRuntime(data.runtime);
     if(data.project?.format!=='ojjuda-furniture-set'||data.project.complete!==true)throw new Error('세 방향 작업을 완성한 뒤 적용해 주세요.');
     if(data.type==='apply'){const record=await saveMadeItem(owner,data.runtime,data.project);if(authorized())showHome({studioItem:record.id});reply({id:record.id});}
     else {if(authorized())showHome({preview:{id:'made-000000000000000000000000',runtime:data.runtime}});reply({ok:true});}
    }else reply({error:'지원하지 않는 제작실 작업이에요.'});
   }catch(error){reply({error:error.message||'작업을 완료하지 못했어요.'});}finally{busy=false;}
  };
  frame.contentWindow.postMessage({type:'ojjuda-furniture-studio-init',owner},location.origin,[channel.port2]);
 });return cleanup;
}
