/* Member session stays in World; completed solo rounds use its normal score API. */
(()=>{
 'use strict';
 let overlay=null,frame=null,session=null,previousFocus=null,watcher=null;
 const bridge={client:null,open,close};window.OjjudaTtangBridge=bridge;
 function close(){
  if(!overlay)return;
  try{frame?.contentWindow?.OjjudaTtang?.menu();}catch{}
  clearInterval(watcher);overlay.remove();overlay=frame=session=null;bridge.client=null;
  document.body.classList.remove('ttang-open','gaming');
  if(previousFocus?.isConnected)previousFocus.focus();previousFocus=null;
 }
 function open({client,owner,authorized=()=>true,onScore=async()=>({ok:false})}={}){
  if(overlay||!authorized())return;
  previousFocus=document.activeElement;session={owner,authorized,onScore,round:null,submitted:new Set()};bridge.client=client;
  overlay=document.createElement('section');overlay.id='ttang-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','월드땅따먹기');
  overlay.style.cssText='position:fixed;inset:0;z-index:99999;height:100dvh;display:flex;flex-direction:column;background:#f3eafa;padding-top:env(safe-area-inset-top,0px)';
  const bar=document.createElement('header');bar.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 12px;flex:none;color:#684a8a;background:#fff9ee;border-bottom:1px solid #e5d5ef;font-size:12px';
  const status=document.createElement('span');status.id='ttang-save-status';status.setAttribute('role','status');status.textContent='월드땅따먹기';
  const done=document.createElement('button');done.type='button';done.textContent='오락실로 ✕';done.setAttribute('aria-label','월드땅따먹기 닫기');done.style.cssText='font:inherit;color:inherit;border:1px solid #ddccec;background:#eee2f8;border-radius:12px;min-height:36px;padding:0 12px;cursor:pointer';done.onclick=close;
  frame=document.createElement('iframe');frame.title='월드땅따먹기';frame.src='/games/ttang.html?v=20261006-world2';frame.style.cssText='width:100%;flex:1;min-height:0;border:0';
  bar.append(status,done);overlay.append(bar,frame);document.body.append(overlay);document.body.classList.add('gaming','ttang-open');done.focus();
  watcher=setInterval(()=>{if(session&&!session.authorized())close();},500);
 }
 addEventListener('keydown',e=>{if(overlay&&e.key==='Escape'){e.preventDefault();close();}});
 addEventListener('message',async e=>{
  if(!session||!frame||e.origin!==location.origin||e.source!==frame.contentWindow)return;
  if(!session.authorized()){close();return;}
  const d=e.data||{},current=session,status=overlay.querySelector('#ttang-save-status');
  if(d.type==='ojjuda:ttang:close'){close();return;}
  if(d.type==='ojjuda:ttang:start'&&typeof d.round==='string'&&d.round.length<=64){current.round=d.round;status.textContent='월드땅따먹기';return;}
  if(d.type!=='ojjuda:ttang:result'||d.mode!=='solo'||!d.round||d.round!==current.round||current.submitted.has(d.round))return;
  if(!Number.isInteger(d.score)||d.score<0||d.score>1000)return;
  current.submitted.add(d.round);
  if(!current.owner){status.textContent='로그인하면 순위에 기록돼요.';return;}
  status.textContent='점수를 저장하고 있어요…';
  try{
   const result=await current.onScore(d.score);
   if(session!==current||current.round!==d.round||!current.authorized())return;
   if(!result?.ok)throw Error('score');status.textContent=d.score+'점 · 기록했어요!';
  }catch{if(session===current&&current.round===d.round)status.textContent='점수를 저장하지 못했어요. 연결을 확인해 주세요.';}
 });
})();
