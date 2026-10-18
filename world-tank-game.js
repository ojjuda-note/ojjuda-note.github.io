/* Same-origin game bridge. Login tokens never leave the existing authenticated client. */
(()=>{
 'use strict';let active=null;
 window.OjjudaTankGame={
  open({owner=null,client=null,joinCode='',authorized=()=>true,onCoins=()=>{}}={}){
   if(active){active.dialog.focus();return;}
   const previous=document.activeElement,wasGaming=document.body.classList.contains('gaming');
   const dialog=document.createElement('dialog');dialog.className='tour-game-dialog tank-game-dialog';dialog.setAttribute('aria-label','탱크게임');
   dialog.innerHTML='<header class="tour-game-header"><button type="button">← 게임 목록</button><span>탱크게임 · 혼자 / 같은 기기 / 온라인</span></header><iframe title="탱크게임" src="/games/tank/index.html?v=20261018-manual-aim1" allow="fullscreen; clipboard-write"></iframe>';
   const frame=dialog.querySelector('iframe'),invitation=new AbortController();let requests=0,rankedRoom=null;
   function close(){if(active?.dialog!==dialog)return;active=null;invitation.abort();window.removeEventListener('message',receive);clearInterval(authTimer);dialog.close();dialog.remove();if(!wasGaming)document.body.classList.remove('gaming');if(previous?.isConnected)previous.focus({preventScroll:true});}
   async function invite(body){
    if(!window.OjjudaFriendInvites?.available())return {error:'invites_unavailable'};
    async function prepare(){
     if(invitation.signal.aborted||!authorized())throw Error('room_unavailable');
     const {data,error}=await client.functions.invoke('tank',{body:{action:'read',room_id:body.room_id}}),room=data?.room;
     if(error||!data?.ok||room?.mode!=='online'||room.status!=='waiting'||room.seat!==room.hostSeat)throw Error('room_unavailable');
     if(room.names.length>=room.capacity)throw Error('room_full');
     return {code:room.code};
    }
    try{
     await prepare();if(invitation.signal.aborted||!authorized())return {error:'room_unavailable'};
     const opened=await window.OjjudaFriendInvites.pick({kind:'tank',container:dialog,signal:invitation.signal,prepare,
      onSent:()=>frame.contentWindow.postMessage({source:'ojjuda-world',type:'tank-invite-sent'},location.origin)});
     return opened?{ok:true}:{error:'invites_unavailable'};
    }catch(error){return {error:error.message==='room_full'?'room_full':'room_unavailable'};}
   }
   async function online(m){
    if(typeof m.requestId!=='string'||! /^[a-f0-9-]{36}$/i.test(m.requestId)||!m.body||JSON.stringify(m.body).length>4096||!['list','mine','create','join','read','start','fire','cpu','surrender','leave','invite'].includes(m.body.action)||requests>=4)return;
    requests++;let result={error:'not_signed_in'};
    try{
     if(owner&&client?.functions&&authorized()){
      if(m.body.action==='invite')result=await invite(m.body);
      else{
       const {data,error}=await client.functions.invoke('tank',{body:m.body});
       if(error){try{result=await error.context.json();}catch{result={error:'unavailable'};}}else result=data||{error:'unavailable'};
       if(result?.ok&&['create','join','start','leave','surrender'].includes(m.body.action))window.dispatchEvent(new Event('ojjuda:arcade-rooms-changed'));
      }
      const amount=result?.room?.coins??result?.coins;if(Number.isInteger(amount)&&amount>=0&&authorized())onCoins(amount);
      if(authorized()&&result?.room?.status==='finished'&&result.room.mode!=='local'&&rankedRoom!==result.room.id){rankedRoom=result.room.id;window.dispatchEvent(new CustomEvent('ojjuda:game-record-saved',{detail:{game:'tank',owner}}));}
     }
    }catch{result={error:'unavailable'};}
    finally{requests--;}
    if(active?.dialog===dialog&&authorized())frame.contentWindow.postMessage({source:'ojjuda-world',type:'tank-response',replyTo:m.requestId,result},location.origin);
   }
   function receive(e){
    if(e.origin!==location.origin||e.source!==frame.contentWindow||e.data?.source!=='ojjuda-tank'||!authorized())return;
    if(e.data.type==='ready')frame.contentWindow.postMessage({source:'ojjuda-world',type:'tank-init',available:!!(owner&&client?.functions),joinCode:/^[A-F0-9]{8}$/i.test(joinCode)?joinCode.toUpperCase():''},location.origin);
    else if(e.data.type==='request')void online(e.data);
    else if(e.data.type==='exit')close();
   }
   const authTimer=setInterval(()=>{if(!authorized())close();},1000);
   active={dialog,close};window.addEventListener('message',receive);dialog.querySelector('button').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
   document.body.append(dialog);document.body.classList.add('gaming');dialog.showModal();dialog.querySelector('button').focus({preventScroll:true});
  },close(){active?.close();}
 };
})();
