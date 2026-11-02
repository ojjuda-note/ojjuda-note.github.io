/* Local archery play shares only server-approved event ammo with the arcade. */
(() => {
 'use strict';
 let active=null;
 const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
 const actions=new Set(['status','round-start','round-complete','spend','buy','receipt']);
 const receiptActions=new Set(['round-start','round-complete','spend','buy']);
 window.OjjudaArcheryGame={
  open({owner=null,authorized=()=>true,onAmmoStatus=null,onRoundStart=null,onRoundComplete=null,onAmmoSpend=null,onAmmoBuy=null,onAmmoReceipt=null}={}){
   if(!authorized())return;
   if(active){if(active.owner===owner&&active.current()){active.dialog.focus();return;}active.close();}
   const previous=document.activeElement;
   const wasGaming=document.body.classList.contains('gaming');
   const dialog=document.createElement('dialog');
   dialog.className='tour-game-dialog archery-game-dialog';
   dialog.setAttribute('aria-label','바람의 궁수 · 테스트게임');
   dialog.innerHTML='<header class="tour-game-header"><button type="button" aria-label="게임 목록으로 돌아가기">← 게임 목록</button><span>바람의 궁수 <small>테스트게임</small></span></header><iframe title="바람의 궁수" src="/games/forest-archer/index.html?v=20261102-archery-direct-aim1" allow="autoplay; fullscreen"></iframe>';
   const frame=dialog.querySelector('iframe');
   const sessionId=crypto.randomUUID(),requests=new Map(),deadlines=new Set();
   let inFlight=null;
   const current=()=>active?.dialog===dialog&&authorized();
   const callbacks={
    status:()=>onAmmoStatus?.(),
    'round-start':message=>onRoundStart?.(message.requestId,message.stage),
    'round-complete':message=>onRoundComplete?.(message.requestId,message.runId,message.stage),
    spend:message=>onAmmoSpend?.(message.requestId),
    buy:message=>onAmmoBuy?.(message.requestId),
    receipt:message=>onAmmoReceipt?.(message.receiptId,message.originalAction)
   };
   const available={status:onAmmoStatus,'round-start':onRoundStart,'round-complete':onRoundComplete,spend:onAmmoSpend,buy:onAmmoBuy,receipt:onAmmoReceipt};
   function send(message){if(current())frame.contentWindow.postMessage({source:'ojjuda-archery-world',owner,sessionId,...message},location.origin);}
   function initialize(){send({type:'init',available:!!owner&&Object.values(available).every(fn=>typeof fn==='function')});}
   function reply(message,result){send({type:'ammo-response',action:message.action,requestId:message.requestId,result});}
   function validRequest(message){
    if(!actions.has(message.action)||!uuid(message.requestId))return false;
    const allowed=new Set(['source','type','action','owner','sessionId','requestId']);
    if(message.action==='round-start'||message.action==='round-complete'){
     allowed.add('stage');if(!Number.isInteger(message.stage)||message.stage<1||message.stage>50)return false;
    }
    if(message.action==='round-complete'){allowed.add('runId');if(!uuid(message.runId))return false;}
    if(message.action==='receipt'){
     allowed.add('receiptId');allowed.add('originalAction');
     if(!uuid(message.receiptId)||!receiptActions.has(message.originalAction))return false;
    }
    return Object.keys(message).every(key=>allowed.has(key));
   }
   function trimRequests(){
    for(const [id,entry]of requests){if(requests.size<=100)break;if(!entry.promise)requests.delete(id);}
   }
   async function request(message){
    if(!validRequest(message)){if(uuid(message.requestId))reply(message,{ok:false,reason:'invalid'});return;}
    if(!owner){reply(message,{ok:false,reason:'sign_in'});return;}
    if(typeof available[message.action]!=='function'){reply(message,{ok:false,reason:'unavailable'});return;}
    const fingerprint=JSON.stringify([message.action,message.stage??null,message.runId??null,message.receiptId??null,message.originalAction??null]);
    let entry=requests.get(message.requestId);
    if(entry&&entry.fingerprint!==fingerprint){reply(message,{ok:false,reason:'request_conflict'});return;}
    if(inFlight&&inFlight!==message.requestId){reply(message,{ok:false,reason:'busy'});return;}
    if(!entry){entry={fingerprint,promise:null,result:null};requests.set(message.requestId,entry);}
    if(entry.result){reply(message,entry.result);return;}
    if(!entry.promise){
     inFlight=message.requestId;let deadline;
     const operation=Promise.resolve().then(()=>current()?callbacks[message.action](message):{ok:false,reason:'unavailable'})
      .then(result=>result&&typeof result==='object'&&typeof result.ok==='boolean'?result:{ok:false,reason:'pending'})
      .catch(()=>({ok:false,reason:'pending'}));
     entry.promise=Promise.race([operation,new Promise(resolve=>{deadline=setTimeout(()=>resolve({ok:false,reason:'pending'}),10000);deadlines.add(deadline);})])
      .then(result=>{if(result.ok)entry.result=result;return result;})
      .finally(()=>{clearTimeout(deadline);deadlines.delete(deadline);entry.promise=null;if(inFlight===message.requestId)inFlight=null;trimRequests();});
    }
    reply(message,await entry.promise);
   }
   function receive(event){
    if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.source!=='ojjuda-archery-game')return;
    if(!current()){if(active?.dialog===dialog)close();return;}
    const message=event.data;
    if(message.type==='ready'){initialize();return;}
    if(message.type!=='ammo-request'||message.owner!==owner||message.sessionId!==sessionId)return;
    void request(message);
   }
   function close(){
    if(active?.dialog!==dialog)return;
    active=null;
    window.removeEventListener('message',receive);
    frame.removeEventListener('load',loaded);
    for(const deadline of deadlines)clearTimeout(deadline);
    deadlines.clear();requests.clear();
    // Unload the document so animation, input and audio stop before re-entry.
    frame.src='about:blank';
    dialog.close();
    dialog.remove();
    if(!wasGaming)document.body.classList.remove('gaming');
    if(previous?.isConnected)previous.focus({preventScroll:true});
   }
   function loaded(){if(active?.dialog===dialog){if(!authorized())close();else initialize();}}
   active={dialog,owner,current,close};
   window.addEventListener('message',receive);
   frame.addEventListener('load',loaded);
   dialog.querySelector('button').addEventListener('click',close);
   dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
   document.body.append(dialog);
   document.body.classList.add('gaming');
   dialog.showModal();
   dialog.querySelector('button').focus({preventScroll:true});
  },
  close(){active?.close();}
 };
})();
