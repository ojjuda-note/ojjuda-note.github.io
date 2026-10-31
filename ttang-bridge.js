/* Member session stays in the parent; complete solo/online outcomes count once. */
(()=>{
 'use strict';
 let overlay=null,frame=null,session=null,previousFocus=null,watcher=null;
 const retired=new Set();
 const bridge={client:null,open,close,createPublicRoom};window.OjjudaTtangBridge=bridge;
 function close(){
  if(!overlay){if(!retired.size)return true;const pending=finishRetired();pending.catch(()=>{});return pending;}
  const current=session;current.closed=true;let networkClose,roomClose;
  try{const game=frame?.contentWindow?.OjjudaTtang,result=game?.result?.();if(result?.round===current.round&&typeof result.win==='boolean')current.outcomes.set(result.round,result.win);if(game?.dispose)networkClose=game.dispose();else game?.menu();}catch{}
  // A live multiplayer exit hands this seat to AI; it is neither a win nor a
  // loss in this member's streak. An already finished result may still retry.
  if(current.round&&!current.submitted.has(current.round)&&!current.excluded.has(current.round)&&(current.mode==='solo'||current.outcomes.has(current.round)))void saveResult(current,current.outcomes.get(current.round)??false,current.round);
  if(current.arcadeRoom||current.createRpc){retired.add(current);roomClose=leavePublicRoom(current);roomClose.catch(()=>{});}
  clearInterval(watcher);overlay.remove();overlay=frame=session=null;bridge.client=null;
  document.body.classList.remove('ttang-open','gaming');
  if(previousFocus?.isConnected)previousFocus.focus();previousFocus=null;
  const pending=Promise.all([networkClose,roomClose]);pending.catch(()=>{});return pending;
 }
 async function leavePublicRoom(current=session){
  if(!current)return;if(current.leaving)return current.leaving;
  current.leaving=(async()=>{
   if(current.createRpc){const {data,error}=await current.createRpc;if(!error&&data?.ok&&data.room?.id)current.arcadeRoom=data.room.id;}
   const room=current.arcadeRoom;if(!room){retired.delete(current);return;}
   if(!current.authorized()){current.arcadeRoom=null;retired.delete(current);return;}
   const {data,error}=await current.client.rpc('arcade_ttang_room',{p_action:'leave',p_room:room});
   if(error||data?.ok===false)throw Error('unavailable');
   if(current.arcadeRoom===room)current.arcadeRoom=null;retired.delete(current);
   window.dispatchEvent(new Event('ojjuda:arcade-rooms-changed'));
  })();
  try{return await current.leaving;}finally{current.leaving=null;}
 }
 async function finishRetired(){for(const previous of retired)await leavePublicRoom(previous);}
 async function createPublicRoom(){
  const current=session,client=bridge.client,game=frame?.contentWindow?.OjjudaTtang;
  if(!current?.owner||!current.authorized()||!client?.rpc||!game)throw Error('not_signed_in');
  if(current.creating||current.arcadeRoom)return false;
  current.creating=true;current.createRequest ||= crypto.randomUUID();
  try{
   await finishRetired();if(session!==current||!current.authorized())return false;
   current.createRpc=client.rpc('arcade_ttang_room',{p_action:'create',p_title:'월드땅따먹기 한 판 같이 해요',p_request:current.createRequest});
   const {data,error}=await current.createRpc;
   if(error||!data?.ok)throw Error('unavailable');
   current.arcadeRoom=data.room.id;
   if(session!==current||!current.authorized()){
    retired.add(current);await leavePublicRoom(current);return false;
   }
   current.arcadeRoom=data.room.id;current.nextHeartbeat=0;current.createRequest=null;
   const code=await game.host(data.room.code,{publicRoom:true});
   if(session!==current)return false;
   if(!code){await leavePublicRoom();return false;}
   current.hosting=true;
   if(!await heartbeat(current)){game.menu();return false;}
   statusMessage('공개 대전방 · 상대가 들어오면 바로 시작해요.');return true;
  }catch(error){if(session===current)await leavePublicRoom(current);throw error;}
  finally{current.creating=false;current.createRpc=null;}
 }
 function open({client,owner,authorized=()=>true,onResult=async()=>({ok:false}),joinCode,hostCode,arcadeRoom}={}){
  if(overlay||!authorized())return;
  previousFocus=document.activeElement;session={owner,authorized,onResult,client,round:null,mode:null,submitted:new Set(),excluded:new Set(),outcomes:new Map(),arcadeRoom,hostCode,nextHeartbeat:0,heartbeatBusy:false,hosting:false};bridge.client=client;
  overlay=document.createElement('section');overlay.id='ttang-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','월드땅따먹기');
  overlay.style.cssText='position:fixed;inset:0;z-index:99999;height:100dvh;display:flex;flex-direction:column;background:#f3eafa;padding-top:env(safe-area-inset-top,0px)';
  const bar=document.createElement('header');bar.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 12px;flex:none;color:#684a8a;background:#fff9ee;border-bottom:1px solid #e5d5ef;font-size:12px';
  const status=document.createElement('span');status.id='ttang-save-status';status.setAttribute('role','status');status.textContent='월드땅따먹기';
  const done=document.createElement('button');done.type='button';done.textContent='오락실로 ✕';done.setAttribute('aria-label','월드땅따먹기 닫기');done.style.cssText='font:inherit;color:inherit;border:1px solid #ddccec;background:#eee2f8;border-radius:12px;min-height:36px;padding:0 12px;cursor:pointer';done.onclick=close;
  frame=document.createElement('iframe');frame.title='월드땅따먹기';frame.src='/games/ttang.html?v=20261031-best-streak-rankings1';frame.style.cssText='width:100%;flex:1;min-height:0;border:0';
  const current=session,openedFrame=frame;
  if(/^[a-f0-9]{24}$/.test(hostCode||''))frame.addEventListener('load',async()=>{
   if(session!==current||!current.authorized())return;
   try{await finishRetired();if(session!==current||!current.authorized())return;const code=await openedFrame.contentWindow?.OjjudaTtang?.host(hostCode,{publicRoom:!!arcadeRoom});if(session!==current)return;
    if(!code){await leavePublicRoom();return;}current.hosting=true;await heartbeat(current);
   }catch{if(session===current)await leavePublicRoom();}
  },{once:true});
  if(/^[a-f0-9]{24}$/.test(joinCode||''))frame.addEventListener('load',async()=>{try{await finishRetired();if(session===current&&current.authorized())await openedFrame.contentWindow?.OjjudaTtang?.join(joinCode);}catch{if(session===current)statusMessage('이전 대전방 정리를 완료하지 못했어요. 닫고 다시 들어와 주세요.');}},{once:true});bar.append(status,done);overlay.append(bar,frame);document.body.append(overlay);document.body.classList.add('gaming','ttang-open');done.focus();
  watcher=setInterval(()=>{if(session&&!session.authorized())close();else if(session?.hosting)void heartbeat(session);},500);
  if(retired.size){statusMessage('이전 대전방을 정리하고 있어요…');void finishRetired().then(()=>{if(session===current)statusMessage('월드땅따먹기');}).catch(()=>{if(session===current)statusMessage('이전 대전방 정리를 완료하지 못했어요. 방 만들기를 누르면 다시 시도해요.');});}
 }
 async function heartbeat(current){
  if(!current.arcadeRoom||current.heartbeatBusy||Date.now()<current.nextHeartbeat)return;
  current.heartbeatBusy=true;current.nextHeartbeat=Date.now()+20000;
  try{const {data,error}=await current.client.rpc('arcade_ttang_room',{p_action:'heartbeat',p_room:current.arcadeRoom});
   if(session!==current)return;if(error||!data?.ok){await leavePublicRoom();statusMessage('대전방 연결을 확인해 주세요.');}
   else{window.dispatchEvent(new Event('ojjuda:arcade-rooms-changed'));return true;}
  }catch{current.nextHeartbeat=Date.now()+5000;}finally{current.heartbeatBusy=false;}
 }
 async function saveResult(current,won,round){
  if(!current.authorized()||current.excluded.has(round)||current.submitted.has(round))return;
  current.outcomes.set(round,won);current.submitted.add(round);
  if(session===current)statusMessage('승패 기록을 저장하고 있어요…');
  try{
   const result=await current.onResult(won,round);
   if(!result?.ok)throw Error('record');
   if(session===current&&current.round===round&&current.authorized())statusMessage((won?'승리':'패배·무승부')+' · '+(current.owner?'기록했어요!':'손님으로 기록했어요!'));
  }catch{
   current.submitted.delete(round);
   if(session!==current||current.round!==round)return;
   statusMessage('승패 기록을 저장하지 못했어요. ');
   const retry=document.createElement('button');retry.type='button';retry.textContent='다시 저장';
   retry.onclick=()=>{retry.remove();void saveResult(current,won,round)};overlay.querySelector('#ttang-save-status').append(retry);
  }
 }
 function statusMessage(text){const status=overlay?.querySelector('#ttang-save-status');if(status)status.textContent=text;}
 addEventListener('keydown',e=>{if(overlay&&e.key==='Escape'){e.preventDefault();close();}});
 addEventListener('message',async e=>{
  if(!session||!frame||e.origin!==location.origin||e.source!==frame.contentWindow)return;
  if(!session.authorized()){close();return;}
  const d=e.data||{},current=session,status=overlay.querySelector('#ttang-save-status');
  if(d.type==='ojjuda:ttang:network-end'||d.type==='ojjuda:ttang:menu'||d.type==='ojjuda:ttang:opponent-bot'){current.hosting=false;void leavePublicRoom(current).catch(()=>{statusMessage('대전방 정리를 다시 시도해 주세요.');});return;}
  if(d.type==='ojjuda:ttang:excluded'&&d.round===current.round){current.excluded.add(d.round);current.outcomes.delete(d.round);return;}
  if(d.type==='ojjuda:ttang:close'){close();return;}
  if(d.type==='ojjuda:ttang:start'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(d.round||'')&&['solo','duo'].includes(d.mode)){current.round=d.round;current.mode=d.mode;status.textContent='월드땅따먹기';return;}
  if(d.type!=='ojjuda:ttang:result'||d.mode!==current.mode||!d.round||d.round!==current.round||typeof d.win!=='boolean'||current.submitted.has(d.round)||current.excluded.has(d.round))return;
  window.OjjudaGuestAccess?.finished();
  await saveResult(current,d.win,d.round);
 });
})();
