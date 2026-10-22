/* Member session stays in World; completed solo rounds use its normal score API. */
(()=>{
 'use strict';
 let overlay=null,frame=null,session=null,previousFocus=null,watcher=null;
 const bridge={client:null,open,close,createPublicRoom};window.OjjudaTtangBridge=bridge;
 function close(){
  if(!overlay)return;
  void leavePublicRoom();
  try{frame?.contentWindow?.OjjudaTtang?.menu();}catch{}
  clearInterval(watcher);overlay.remove();overlay=frame=session=null;bridge.client=null;
  document.body.classList.remove('ttang-open','gaming');
  if(previousFocus?.isConnected)previousFocus.focus();previousFocus=null;
 }
 async function leavePublicRoom(){
  const room=session?.arcadeRoom;if(!room)return;
  session.arcadeRoom=null;
  try{await bridge.client?.rpc('arcade_ttang_room',{p_action:'leave',p_room:room});}catch{}
  window.dispatchEvent(new Event('ojjuda:arcade-rooms-changed'));
 }
 async function createPublicRoom(){
  const current=session,client=bridge.client,game=frame?.contentWindow?.OjjudaTtang;
  if(!current?.owner||!current.authorized()||!client?.rpc||!game)throw Error('not_signed_in');
  if(current.creating||current.arcadeRoom)return false;
  current.creating=true;current.createRequest ||= crypto.randomUUID();
  try{
   const {data,error}=await client.rpc('arcade_ttang_room',{p_action:'create',p_title:'월드땅따먹기 한 판 같이 해요',p_request:current.createRequest});
   if(error||!data?.ok)throw Error('unavailable');
   if(session!==current||!current.authorized()){
    await client.rpc('arcade_ttang_room',{p_action:'leave',p_room:data.room.id});return false;
   }
   current.arcadeRoom=data.room.id;current.nextHeartbeat=0;current.createRequest=null;
   const code=await game.host(data.room.code,{publicRoom:true});
   if(session!==current)return false;
   if(!code){await leavePublicRoom();return false;}
   current.hosting=true;
   if(!await heartbeat(current)){game.menu();return false;}
   statusMessage('공개 대전방 · 상대가 들어오면 바로 시작해요.');return true;
  }catch(error){if(session===current)await leavePublicRoom();throw error;}
  finally{current.creating=false;}
 }
 function open({client,owner,authorized=()=>true,onScore=async()=>({ok:false}),joinCode,hostCode,arcadeRoom}={}){
  if(overlay||!authorized())return;
  previousFocus=document.activeElement;session={owner,authorized,onScore,round:null,submitted:new Set(),arcadeRoom,hostCode,nextHeartbeat:0,heartbeatBusy:false,hosting:false};bridge.client=client;
  overlay=document.createElement('section');overlay.id='ttang-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','월드땅따먹기');
  overlay.style.cssText='position:fixed;inset:0;z-index:99999;height:100dvh;display:flex;flex-direction:column;background:#f3eafa;padding-top:env(safe-area-inset-top,0px)';
  const bar=document.createElement('header');bar.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 12px;flex:none;color:#684a8a;background:#fff9ee;border-bottom:1px solid #e5d5ef;font-size:12px';
  const status=document.createElement('span');status.id='ttang-save-status';status.setAttribute('role','status');status.textContent='월드땅따먹기';
  const done=document.createElement('button');done.type='button';done.textContent='오락실로 ✕';done.setAttribute('aria-label','월드땅따먹기 닫기');done.style.cssText='font:inherit;color:inherit;border:1px solid #ddccec;background:#eee2f8;border-radius:12px;min-height:36px;padding:0 12px;cursor:pointer';done.onclick=close;
  frame=document.createElement('iframe');frame.title='월드땅따먹기';frame.src='/games/ttang.html?v=20261018-arcade-entry1';frame.style.cssText='width:100%;flex:1;min-height:0;border:0';
  if(/^[a-f0-9]{24}$/.test(hostCode||''))frame.addEventListener('load',async()=>{
   const current=session;if(!current?.authorized())return;
   try{const code=await frame?.contentWindow?.OjjudaTtang?.host(hostCode,{publicRoom:!!arcadeRoom});if(session!==current)return;
    if(!code){await leavePublicRoom();return;}current.hosting=true;await heartbeat(current);
   }catch{if(session===current)await leavePublicRoom();}
  },{once:true});
  if(/^[a-f0-9]{24}$/.test(joinCode||''))frame.addEventListener('load',()=>{if(session?.authorized())frame?.contentWindow?.OjjudaTtang?.join(joinCode);},{once:true});bar.append(status,done);overlay.append(bar,frame);document.body.append(overlay);document.body.classList.add('gaming','ttang-open');done.focus();
  watcher=setInterval(()=>{if(session&&!session.authorized())close();else if(session?.hosting)void heartbeat(session);},500);
 }
 async function heartbeat(current){
  if(!current.arcadeRoom||current.heartbeatBusy||Date.now()<current.nextHeartbeat)return;
  current.heartbeatBusy=true;current.nextHeartbeat=Date.now()+20000;
  try{const {data,error}=await bridge.client.rpc('arcade_ttang_room',{p_action:'heartbeat',p_room:current.arcadeRoom});
   if(session!==current)return;if(error||!data?.ok){await leavePublicRoom();statusMessage('대전방 연결을 확인해 주세요.');}
   else{window.dispatchEvent(new Event('ojjuda:arcade-rooms-changed'));return true;}
  }catch{current.nextHeartbeat=Date.now()+5000;}finally{current.heartbeatBusy=false;}
 }
 function statusMessage(text){const status=overlay?.querySelector('#ttang-save-status');if(status)status.textContent=text;}
 addEventListener('keydown',e=>{if(overlay&&e.key==='Escape'){e.preventDefault();close();}});
 addEventListener('message',async e=>{
  if(!session||!frame||e.origin!==location.origin||e.source!==frame.contentWindow)return;
  if(!session.authorized()){close();return;}
  const d=e.data||{},current=session,status=overlay.querySelector('#ttang-save-status');
  if(d.type==='ojjuda:ttang:network-end'||d.type==='ojjuda:ttang:menu'){void leavePublicRoom();return;}
  if(d.type==='ojjuda:ttang:close'){close();return;}
  if(d.type==='ojjuda:ttang:start'&&typeof d.round==='string'&&d.round.length<=64){current.round=d.round;status.textContent='월드땅따먹기';return;}
  if(d.type!=='ojjuda:ttang:result'||d.mode!=='solo'||!d.round||d.round!==current.round||current.submitted.has(d.round))return;
  if(!Number.isInteger(d.score)||d.score<0||d.score>1000)return;
  current.submitted.add(d.round);
  window.OjjudaGuestAccess?.finished();
  status.textContent='점수를 저장하고 있어요…';
  try{
   const result=await current.onScore(d.score);
   if(session!==current||current.round!==d.round||!current.authorized())return;
   if(!result?.ok)throw Error('score');status.textContent=d.score+'점 · '+(current.owner?'기록했어요!':'손님으로 기록했어요!');
  }catch{if(session===current&&current.round===d.round)status.textContent='점수를 저장하지 못했어요. 연결을 확인해 주세요.';}
 });
})();
