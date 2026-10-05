/* Reuse World's signed-in client for the single-player photo game. */
(()=>{
 'use strict';
 let overlay=null,frame=null,watcher=null,previousFocus=null;
 const bridge={client:null,nick:'',open,close};window.OjjudaPhotoTtangBridge=bridge;
 window.openPhotoTtang=options=>open(options);
 function close(){
  if(!overlay)return;
  try{frame?.contentWindow?.OjjudaPhotoTtang?.menu();}catch{}
  clearInterval(watcher);overlay.remove();overlay=frame=null;bridge.client=null;bridge.nick='';
  document.body.classList.remove('gaming','photo-ttang-open');
  if(previousFocus?.isConnected)previousFocus.focus();previousFocus=null;
 }
 function open({client,owner,nick='',authorized=()=>true}={}){
  if(overlay||!authorized())return;
  previousFocus=document.activeElement;bridge.client=client;bridge.nick=nick;
  overlay=document.createElement('section');overlay.id='photo-ttang-overlay';
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','포토땅따먹기');
  overlay.style.cssText='position:fixed;inset:0;z-index:99999;height:100dvh;display:flex;flex-direction:column;background:#1c1730;padding-top:env(safe-area-inset-top,0px)';
  const bar=document.createElement('header');bar.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 12px;flex:none;background:#1c1730;color:#fff;font-size:12px';
  const title=document.createElement('span');title.textContent='포토땅따먹기 · 솔로';
  const done=document.createElement('button');done.type='button';done.textContent='오락실로 ✕';done.setAttribute('aria-label','포토땅따먹기 닫기');done.onclick=close;
  done.style.cssText='font:inherit;color:inherit;border:1px solid #ffffff40;background:#ffffff22;border-radius:12px;min-height:36px;padding:0 12px;cursor:pointer';
  frame=document.createElement('iframe');frame.title='포토땅따먹기';frame.src='/games/photo-ttang.html?v=20261006-photo2';frame.allow='vibrate';frame.style.cssText='width:100%;flex:1;min-height:0;border:0';
  bar.append(title,done);overlay.append(bar,frame);document.body.append(overlay);document.body.classList.add('gaming','photo-ttang-open');done.focus();
  watcher=setInterval(()=>{if(!authorized())close();},500);
 }
 addEventListener('keydown',e=>{if(overlay&&e.key==='Escape'){e.preventDefault();close();}});
 addEventListener('message',e=>{if(overlay&&e.origin===location.origin&&e.source===frame?.contentWindow&&e.data?.type==='ojjuda:photottang:close')close();});
})();
