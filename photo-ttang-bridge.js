/* World's Photo Ttang entry uses the same 19+ member gate as Matgo. */
(() => {
 'use strict';
 let overlay=null,frame=null,watcher=null,refreshTimer=null,unsubscribe=null,previousFocus=null,opening=false,generation=0,rankDispose=null;
 const bridge={client:null,nick:'',open,close};window.OjjudaPhotoTtangBridge=bridge;
 window.openPhotoTtang=options=>open(options);
 function message(error){
  const text=error?.message||'나이를 확인하지 못했어요. 다시 시도해 주세요.',target=document.getElementById('toast');
  if(!target)return alert(text);
  target.textContent=text;target.classList.add('show');clearTimeout(message.timer);message.timer=setTimeout(()=>target.classList.remove('show'),4500);
 }
 function close(force=false){
  if(force!==true&&frame?.contentWindow?.OjjudaPhotoTtang?.canLeave?.()===false){message(new Error('구매 결과를 확인 중이에요. 잠시만 기다려 주세요.'));return false;}
  generation++;rankDispose?.();rankDispose=null;unsubscribe?.();unsubscribe=null;clearInterval(watcher);clearInterval(refreshTimer);
  if(!overlay)return;
  try{frame?.contentWindow?.OjjudaPhotoTtang?.menu();}catch{}
  overlay.remove();overlay=frame=null;bridge.client=null;bridge.nick='';
  document.body.classList.remove('gaming','photo-ttang-open');
  if(previousFocus?.isConnected)previousFocus.focus();previousFocus=null;
 }
 async function open({client,owner,nick='',authorized=()=>true}={}){
  if(opening||overlay||!authorized())return;
  opening=true;const attempt=generation,access=window.OjjudaPhotoTtangAccess;
  try{
   if(!access)throw Error('나이를 확인하지 못했어요. 다시 시도해 주세요.');
   if(client)access.configure(client);
   const member=await access.check();
   if(attempt!==generation||!authorized())return;
   if(!owner||member.userId!==owner)throw Error('포토땅따먹기는 로그인한 만 19세 이상 회원만 이용할 수 있어요.');
   previousFocus=document.activeElement;bridge.client=client;bridge.nick=nick;
   overlay=document.createElement('section');overlay.id='photo-ttang-overlay';
   overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','포토땅따먹기 · 만 19세 이상');
   overlay.style.cssText='position:fixed;inset:0;z-index:99999;height:100dvh;display:flex;flex-direction:column;background:#1c1730;padding-top:env(safe-area-inset-top,0px)';
   const bar=document.createElement('header');bar.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 12px;flex:none;background:#1c1730;color:#fff;font-size:12px';
   const title=document.createElement('span');title.textContent='포토땅따먹기 · 솔로 · 19+';
   const done=document.createElement('button');done.type='button';done.textContent='오락실로 ✕';done.setAttribute('aria-label','포토땅따먹기 닫기');done.onclick=close;
   done.style.cssText='font:inherit;color:inherit;border:1px solid #ffffff40;background:#ffffff22;border-radius:12px;min-height:36px;padding:0 12px;cursor:pointer';
   frame=document.createElement('iframe');frame.title='포토땅따먹기';frame.src='/games/photo-ttang.html?v=20261006-red1';frame.allow='vibrate';frame.style.cssText='width:100%;flex:1;min-height:0;border:0';
   const rank=document.createElement('button');rank.type='button';rank.disabled=true;rank.textContent='이번 달 완료 사진 수로 순위 집계';rank.style.cssText='font:inherit;color:inherit;background:none;border:0';
   rankDispose=window.OjjudaPhotoRanking?.bind({frame,client,owner,authorized:()=>authorized()&&access.allowed(),status:rank});
   bar.append(title,rank,done);overlay.append(bar,frame);document.body.append(overlay);document.body.classList.add('gaming','photo-ttang-open');done.focus();
   unsubscribe=access.subscribe(error=>{close(true);message(error);});
   watcher=setInterval(()=>{if(!authorized()||!access.allowed())close(true);},500);
   refreshTimer=setInterval(()=>{void access.refresh().catch(()=>{});},30000);
  }catch(error){message(error);}finally{opening=false;}
 }
 addEventListener('keydown',e=>{if(overlay&&e.key==='Escape'){e.preventDefault();close();}});
 addEventListener('message',e=>{if(overlay&&e.origin===location.origin&&e.source===frame?.contentWindow&&e.data?.type==='ojjuda:photottang:close')close();});
})();
