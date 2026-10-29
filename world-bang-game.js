/* Authentication stays in the arcade; only redacted room views reach the game. */
(()=>{'use strict';let active=null;
 window.OjjudaBangGame={open({nickname='',owner=null,client=null,joinCode='',authorized=()=>true}={}){
  if(active){active.dialog.focus();return;}
  const previous=document.activeElement,wasGaming=document.body.classList.contains('gaming');
  const dialog=document.createElement('dialog');dialog.className='tour-game-dialog bang-game-dialog';dialog.setAttribute('aria-label','뱅!');
  dialog.innerHTML='<header class="tour-game-header"><button type="button" aria-label="게임 목록으로 돌아가기">← 게임 목록</button><span>뱅! · 최대 7명</span></header><iframe title="뱅! · 회원 대전과 연습" src="/games/bang/index.html?v=20261029-bang1" allow="fullscreen; clipboard-write"></iframe>';
  const frame=dialog.querySelector('iframe');let requests=0;
  const code=/^[A-F0-9]{8}$/i.test(joinCode)?joinCode.toUpperCase():'';
  function close(){if(active?.dialog!==dialog)return;active=null;window.removeEventListener('message',receive);dialog.close();dialog.remove();if(!wasGaming)document.body.classList.remove('gaming');previous?.isConnected&&previous.focus({preventScroll:true});window.dispatchEvent(new Event('ojjuda:arcade-rooms-changed'));}
  async function request(message){
   if(typeof message.requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(message.requestId)||!message.body||typeof message.body!=='object'||JSON.stringify(message.body).length>4096||!['mine','create','join','read','start','move','leave','surrender'].includes(message.body.action)||requests>=4)return;
   requests++;let result={ok:false,error:'not_signed_in'};
   try{
    if(owner&&authorized()&&client?.functions){
     const {data,error}=await client.functions.invoke('bang',{body:message.body});
     if(error){try{result=await error.context.json();}catch{result={ok:false,error:'unavailable'};}}
     else result=data||{ok:false,error:'unavailable'};
    }
   }catch{result={ok:false,error:'unavailable'};}finally{requests--;}
   if(active?.dialog===dialog&&authorized())frame.contentWindow.postMessage({source:'ojjuda-world',type:'ojjuda-bang-response',replyTo:message.requestId,result},location.origin);
  }
  function receive(event){
   if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.source!=='ojjuda-bang'||!authorized())return;
   const message=event.data;
   if(message.type==='ojjuda-game-ready')frame.contentWindow.postMessage({source:'ojjuda-world',type:'ojjuda-bang-init',nickname:String(nickname).slice(0,12),owner,onlineAvailable:!!(owner&&client?.functions),joinCode:code},location.origin);
   if(message.type==='ojjuda-bang-request')void request(message);
   if(message.type==='ojjuda-game-exit')close();
   if(message.type==='ojjuda-bang-rooms-changed')window.dispatchEvent(new Event('ojjuda:arcade-rooms-changed'));
   if(message.type==='ojjuda-bang-finished')window.dispatchEvent(new CustomEvent('ojjuda:game-record-saved',{detail:{owner,game:'bang'}}));
  }
  active={dialog,close};window.addEventListener('message',receive);dialog.querySelector('button').onclick=close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});document.body.append(dialog);document.body.classList.add('gaming');dialog.showModal();
 },close(){active?.close();}};
})();
