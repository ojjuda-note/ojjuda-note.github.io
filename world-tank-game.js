/* Same-origin game bridge. Login tokens never leave the existing authenticated client. */
(()=>{
 'use strict';let active=null;
 window.OjjudaTankGame={
  open({owner=null,client=null,authorized=()=>true,onCoins=()=>{}}={}){
   if(active){active.dialog.focus();return;}
   const previous=document.activeElement,wasGaming=document.body.classList.contains('gaming');
   const dialog=document.createElement('dialog');dialog.className='tour-game-dialog tank-game-dialog';dialog.setAttribute('aria-label','탱크게임');
   dialog.innerHTML='<header class="tour-game-header"><button type="button">← 게임 목록</button><span>탱크게임 · 온라인 2~12명</span></header><iframe title="탱크게임 온라인 대전" src="/games/tank/index.html?v=20261018-tank2" allow="fullscreen; clipboard-write"></iframe>';
   const frame=dialog.querySelector('iframe');let requests=0;
   function close(){if(active?.dialog!==dialog)return;active=null;window.removeEventListener('message',receive);clearInterval(authTimer);dialog.close();dialog.remove();if(!wasGaming)document.body.classList.remove('gaming');if(previous?.isConnected)previous.focus({preventScroll:true});}
   async function online(m){
    if(typeof m.requestId!=='string'||! /^[a-f0-9-]{36}$/i.test(m.requestId)||!m.body||JSON.stringify(m.body).length>4096||!['list','mine','create','join','read','start','fire','surrender','leave'].includes(m.body.action)||requests>=4)return;
    requests++;let result={error:'not_signed_in'};
    try{
     if(owner&&client?.functions&&authorized()){
      const {data,error}=await client.functions.invoke('tank',{body:m.body});
      if(error){try{result=await error.context.json();}catch{result={error:'unavailable'};}}else result=data||{error:'unavailable'};
      const amount=result?.room?.coins??result?.coins;if(Number.isInteger(amount)&&amount>=0&&authorized())onCoins(amount);
     }
    }catch{result={error:'unavailable'};}
    finally{requests--;}
    if(active?.dialog===dialog&&authorized())frame.contentWindow.postMessage({source:'ojjuda-world',type:'tank-response',replyTo:m.requestId,result},location.origin);
   }
   function receive(e){
    if(e.origin!==location.origin||e.source!==frame.contentWindow||e.data?.source!=='ojjuda-tank'||!authorized())return;
    if(e.data.type==='ready')frame.contentWindow.postMessage({source:'ojjuda-world',type:'tank-init',available:!!(owner&&client?.functions)},location.origin);
    else if(e.data.type==='request')void online(e.data);
    else if(e.data.type==='exit')close();
   }
   const authTimer=setInterval(()=>{if(!authorized())close();},1000);
   active={dialog,close};window.addEventListener('message',receive);dialog.querySelector('button').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
   document.body.append(dialog);document.body.classList.add('gaming');dialog.showModal();dialog.querySelector('button').focus({preventScroll:true});
  },close(){active?.close();}
 };
})();
