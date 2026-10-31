/* The arcade entry and iframe share one close/focus lifecycle. */
(()=>{
 'use strict';
 let active=null;
 function close(){active?.close();}
 function open({owner=null,onScore=null,onRanking=null,onBuy=null,authorized=()=>true}={}){
  if(active){active.dialog.focus();return;}
  const previous=document.activeElement,dialog=document.createElement('dialog');
  dialog.className='tour-game-dialog sacheonseong-game-dialog';
  dialog.setAttribute('aria-label','사천성');
  dialog.innerHTML=`<div class="tour-game-header sacheonseong-game-header"><strong>사천성</strong><button type="button" class="sacheonseong-back">← 게임 목록</button></div>
   <div class="sacheonseong-entry-wrap"><section class="game-entry" data-entry-key="sacheonseong">
    <div class="ge-icon" aria-hidden="true">🀄</div><span class="ge-kicker">오쭈다 오락실 · 싱글 게임</span>
    <h2 class="ge-title">사천성</h2><p class="ge-copy">같은 그림을 잇는 작은 즐거움.<br>4개부터 900개까지, 15단계에 도전해요.</p>
    <button type="button" class="ge-primary">시작하기</button>
    <details class="ge-more"><summary>게임 방법</summary><p>같은 그림 두 개를 가로·세로로 연결하세요. 선은 두 번까지 꺾을 수 있고, 다른 패를 통과할 수 없어요.</p><p>같은 그림은 최대 4개이며, 패는 무작위로 놓여요. 막히면 자동으로 다시 섞어요. 힌트는 한 번에 3쭈, 직접 섞기는 10쭈예요.</p><p>첫 패를 누르면 시간이 시작돼요. 최고 완료 단계가 우선이고, 같은 단계에서는 빨리 끝낼수록 높은 순위! 완료 기록은 오락실의 이번 달 게임순위에 등록돼요. 다시 들어오면 1단계부터 새로 시작하며, 해금한 단계와 개인 기록은 유지돼요.</p></details>
   </section></div>`;
  const back=dialog.querySelector('.sacheonseong-back'),records=new Map(),purchases=new Map();let purchaseFlight=null;let frame=null,finished=false;
  const current=()=>active===session&&authorized();
  const send=data=>{if(frame&&current())frame.contentWindow.postMessage({source:'ojjuda-sacheonseong-world',...data},location.origin);};
  const initialize=()=>send({type:'init',owner:owner||'guest'});
  const session={dialog,close(){
   if(active!==session)return;active=null;
   window.removeEventListener('message',onMessage);
   dialog.close();dialog.remove();document.body.classList.remove('gaming');
   if(previous?.isConnected)previous.focus();
  }};
  async function purchase(message){
   const {id,runId,stage,kind}=message,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
   if(!uuid.test(id||'')||!uuid.test(runId||'')||!window.OjjudaSacheonseongRanking.game(stage)||!['hint','shuffle'].includes(kind)||message.owner!==owner)return;
   if(!owner||!onBuy){send({type:'purchase',id,owner:owner||'guest',result:{ok:false,reason:owner?'unavailable':'sign_in'}});return;}
   let pending=purchases.get(id);
   if(pending&&(pending.runId!==runId||pending.stage!==stage||pending.kind!==kind)){send({type:'purchase',id,owner,result:{ok:false,reason:'request_conflict'}});return;}
   if(purchaseFlight&&purchaseFlight!==id){send({type:'purchase',id,owner,result:{ok:false,reason:'busy'}});return;}
   if(!pending){
    purchaseFlight=id;let timer;
    const request=Promise.resolve().then(()=>current()?onBuy(kind,id,runId,stage):{ok:false,reason:'unavailable'}).catch(()=>({ok:false,reason:'pending'}));
    pending={runId,stage,kind,promise:Promise.race([request,new Promise(resolve=>{timer=setTimeout(()=>resolve({ok:false,reason:'pending'}),10000);})]).finally(()=>{clearTimeout(timer);if(purchaseFlight===id)purchaseFlight=null;})};purchases.set(id,pending);
   }
   const result=await pending.promise;
   // Only successful receipts can be cached. A declined request can be tried after a top-up.
   if(!result?.ok)purchases.delete(id);else if(purchases.size>100)purchases.delete(purchases.keys().next().value);
   send({type:'purchase',id,owner,result:result||{ok:false,reason:'pending'}});
  }
  function onMessage(event){
   if(!frame||event.origin!==location.origin||event.source!==frame.contentWindow)return;
   if(event.data?.type==='ojjuda:sacheonseong-home')session.close();
   if(event.data?.type==='ojjuda:sacheonseong-finished'&&!finished){finished=true;window.OjjudaGuestAccess?.finished();}
   if(!current()||event.data?.source!=='ojjuda-sacheonseong-game')return;
   const message=event.data,rules=window.OjjudaSacheonseongRanking;
   if(message.type==='ready')initialize();
   if(message.type==='purchase')void purchase(message);
   if(message.type==='record'&&message.owner===(owner||'guest')&&rules.game(message.stage)&&rules.score(message.duration)!==null&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(message.id||'')){
    const score=rules.score(message.duration),key=rules.game(message.stage);
    let pending=records.get(message.id);
    if(pending&&(pending.key!==key||pending.score!==score))return;
    if(!pending){pending={key,score,promise:Promise.resolve().then(()=>current()&&onScore?onScore(message.stage,score,message.id):{ok:false}).catch(()=>({ok:false}))};records.set(message.id,pending);}
    void pending.promise.then(result=>{if(!result?.ok)records.delete(message.id);else if(records.size>100)records.delete(records.keys().next().value);send({type:'record',id:message.id,ok:result?.ok===true});});
   }
   if(message.type==='ranking'&&(message.stage===0||rules.game(message.stage))&&typeof message.id==='string'){
    Promise.resolve().then(()=>current()&&onRanking?onRanking(message.stage):Promise.reject(Error('unavailable'))).then(rows=>send({type:'ranking',id:message.id,stage:message.stage,rows:Array.isArray(rows)?rows.slice(0,10):[]})).catch(()=>send({type:'ranking',id:message.id,error:true}));
   }
  }
  dialog.querySelector('.ge-primary').addEventListener('click',()=>{
   if(frame)return;
   frame=document.createElement('iframe');frame.title='사천성 게임판';
   frame.src='/games/sacheonseong/index.html?v=20261031-fresh-games1';
   frame.addEventListener('load',initialize);
   dialog.querySelector('.sacheonseong-entry-wrap').remove();dialog.append(frame);
   dialog.classList.add('sacheonseong-playing');frame.focus();
  });
  back.addEventListener('click',session.close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();session.close();});
  active=session;document.body.append(dialog);document.body.classList.add('gaming');
  window.addEventListener('message',onMessage);dialog.showModal();
  dialog.querySelector('.ge-primary').focus();
 }
 window.OjjudaSacheonseongGame={open,close};
})();
