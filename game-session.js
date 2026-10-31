/* A game visit ends through the existing server rules before its frame is removed. */
(()=>{'use strict';
 function create({kind,dialog,frame,authorized,available,invoke,dispose,keepCode=''}){
  let alive=true,ready=false,entering=null,leaving=null,closing=false;
  const operations=new Set();
  const status=document.createElement('div');status.className='game-session-status';status.setAttribute('role','status');status.hidden=true;
  status.style.cssText='padding:12px 16px;background:#fff3d5;color:#312717;display:none;align-items:center;gap:12px;flex-wrap:wrap';
  const copy=document.createElement('span'),retry=document.createElement('button');retry.type='button';retry.textContent='다시 시도';status.append(copy,retry);dialog.insertBefore(status,frame);
  function notice(text,action){status.hidden=!text;status.style.display=text?'flex':'none';copy.textContent=text;retry.hidden=!action;retry.onclick=action||null;}
  function block(value){frame.inert=value;frame.setAttribute('aria-busy',String(value));}
  function remove(){if(!alive)return true;alive=false;ready=false;window.removeEventListener('pagehide',pageHide);notice('');dispose();return true;}
  function pageHide(event){if(!event.persisted)void close();}
  window.addEventListener('pagehide',pageHide);
  async function call(body){
   if(!alive||!authorized())throw Error('not_signed_in');
   const result=await invoke(body);
   if(!alive||!authorized())throw Error('not_signed_in');
   if(!result?.ok)throw Error(result?.error||'unavailable');
   return result;
  }
  function needsSurrender(room){
   // Ranked Bang solo still uses its existing loss settlement. Multiplayer
   // leave hands the unchanged seat to a computer through the server.
   return kind==='bang'&&room.mode==='solo'&&room.status==='active'&&room.state?.players?.[room.seat]?.alive===true;
  }
  async function finishPrevious(code=''){
   if(!available())return;
   let room=(await call({action:'mine'})).room;
   for(let attempt=0;room&&attempt<5;attempt++){
    // A just-created public room or an accepted invitation is an explicit target.
    if(code&&room.code?.toUpperCase()===code.toUpperCase())return;
    const settlingSolo=kind==='bang'&&room.mode==='solo'&&room.status==='active'&&room.state?.players?.[room.seat]?.alive===false&&!room.state?.forfeited?.includes(room.seat);
    const action=needsSurrender(room)?'surrender':settlingSolo?'read':'leave';
    try{
     const result=await call({action,room_id:room.id,version:room.version,request_id:crypto.randomUUID()});
     if(action==='leave'){
      if(result.room)throw Error('state_conflict');
      return;
     }
     room=result.room;
    }catch(error){
     if(!['state_conflict','already_eliminated','room_not_found','room_unavailable','game_finished'].includes(error.message))throw error;
     room=(await call({action:'mine'})).room;
    }
   }
   if(room)throw Error('state_conflict');
  }
  function enter(sendInit){
   if(!alive||closing||ready)return entering||Promise.resolve(ready);
   if(entering)return entering;
   block(true);notice('새 게임을 준비하고 있어요…');
   entering=(async()=>{
    try{
     await finishPrevious(keepCode);
     if(!alive||closing||!authorized())return false;
     ready=true;block(false);notice('');sendInit();return true;
    }catch{
     if(alive&&!closing){
      if(!authorized())return remove();
      notice('이전 게임에서 나오지 못했어요. 연결을 확인하고 다시 시도해 주세요.',()=>void enter(sendInit));
     }
     return false;
    }finally{entering=null;}
   })();
   return entering;
  }
  function run(operation){
   if(!alive||!ready||closing||!authorized())return Promise.resolve(false);
   const task=Promise.resolve().then(()=>alive&&!closing&&authorized()?operation():false);
   operations.add(task);task.then(()=>operations.delete(task),()=>operations.delete(task));return task;
  }
  function close(){
   if(!alive)return true;
   if(!authorized())return remove();
   if(leaving)return leaving;
   if(!available()&&!entering&&!operations.size)return remove();
   closing=true;block(true);notice('게임에서 나가고 있어요…');
   leaving=(async()=>{
    try{
     if(entering)await entering;
     while(operations.size)await Promise.allSettled([...operations]);
     if(!alive)return true;
     if(!authorized())return remove();
     await finishPrevious();return remove();
    }catch{
     if(!alive||!authorized())return remove();
     closing=false;block(!ready);notice('게임에서 나오지 못했어요. 연결을 확인하고 다시 나가 주세요.',()=>void close());return false;
    }finally{leaving=null;}
   })();
   return leaving;
  }
  return {enter,run,close,get closing(){return closing;},get ready(){return ready;}};
 }
 window.OjjudaGameSession={create};
})();
