/* The arcade entry and iframe share one close/focus lifecycle. */
(()=>{
 'use strict';
 let active=null;
 const monthKey=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,7);
 function close(){active?.close();}
 function open({owner=null,onScore=null,onRanking=null,onBuy=null,authorized=()=>true}={}){
  if(active){active.dialog.focus();return;}
  const previous=document.activeElement,dialog=document.createElement('dialog');
  dialog.className='tour-game-dialog sacheonseong-game-dialog arcade-game-view';
  dialog.setAttribute('aria-label','사천성');
  dialog.innerHTML=`<div class="tour-game-header sacheonseong-game-header"><strong>사천성</strong><button type="button" class="sacheonseong-back">← 게임 목록</button></div>
   <div class="sacheonseong-entry-wrap"><section class="game-entry" data-entry-key="sacheonseong">
    <div class="ge-icon" aria-hidden="true">🀄</div><span class="ge-kicker">오쭈다 오락실 · 싱글 게임</span>
    <h2 class="ge-title">사천성</h2><p class="ge-copy">같은 그림을 잇는 작은 즐거움.<br>200단계, 여러 모양과 층으로 도전해요!</p>
    <button type="button" class="ge-primary">시작하기</button>
    <details class="ge-more"><summary>게임 방법</summary><p>같은 그림 두 개를 가로·세로로 연결하세요. 선은 두 번까지 꺾을 수 있고, 다른 패를 통과할 수 없어요. 그림이 다르거나 연결할 수 없는 짝을 고를 때마다 경과 시간에 10초가 더해져요.</p><p>같은 그림이 2장 또는 4장인 종류가 섞여 있고, 패는 무작위로 놓여요. 십자·계단·고리 등 배치도 매번 달라져요. 6단계는 2층, 12단계는 3층, 18단계는 4층이고, 윗층을 비우면 아래층이 열려요. 막히면 자동으로 다시 섞어요. 힌트는 3쭈, 직접 섞기는 10쭈예요.</p><p>첫 패를 누르면 시간이 시작돼요. 최고 완료 단계가 우선이고, 같은 단계에서는 빨리 끝낼수록 높은 순위! 완료 기록은 오락실의 이번 달 게임순위에 등록돼요. 다시 들어오면 마지막으로 하던 레벨에서 새 판을 시작해요. 해금한 단계와 개인 기록은 유지돼요.</p></details>
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
   if(!frame||event.origin!==location.origin||event.source!==frame.contentWindow||!current())return;
   if(event.data?.type==='ojjuda:sacheonseong-home')session.close();
   if(event.data?.source!=='ojjuda-sacheonseong-game')return;
   const message=event.data,rules=window.OjjudaSacheonseongRanking;
   if(message.type==='ojjuda:sacheonseong-finished'&&!owner&&!finished&&rules.game(message.stage)&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(message.runId||'')){
    finished=true;window.OjjudaGuestAccess?.finished();
   }
   if(message.type==='ready')initialize();
   if(message.type==='purchase')void purchase(message);
   if(message.type==='record'&&message.owner===(owner||'guest')&&rules.game(message.stage)&&rules.score(message.duration)!==null&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(message.id||'')){
    const score=rules.score(message.duration),key=rules.game(message.stage);
    let pending=records.get(message.id);
    if(pending&&(pending.key!==key||pending.score!==score))return;
    if(!pending){pending={key,score,promise:Promise.resolve().then(()=>current()&&onScore?onScore(message.stage,score,message.id):{ok:false}).catch(()=>({ok:false}))};records.set(message.id,pending);}
    void pending.promise.then(result=>{if(!result?.ok)records.delete(message.id);else if(records.size>100)records.delete(records.keys().next().value);send({type:'record',id:message.id,ok:result?.ok===true,owner:owner||'guest',period:monthKey()});});
   }
   if(message.type==='ranking'&&(message.stage===0||rules.game(message.stage))&&typeof message.id==='string'){
    const period=monthKey();
    Promise.resolve().then(()=>current()&&onRanking?onRanking(message.stage):Promise.reject(Error('unavailable'))).then(rows=>send({type:'ranking',id:message.id,stage:message.stage,owner:owner||'guest',period,error:period!==monthKey(),rows:Array.isArray(rows)?rows.slice(0,10):[]})).catch(()=>send({type:'ranking',id:message.id,error:true}));
   }
  }
  dialog.querySelector('.ge-primary').addEventListener('click',()=>{
   if(frame)return;
   frame=document.createElement('iframe');frame.title='사천성 게임판';frame.allow='web-share';
   frame.src='/games/sacheonseong/index.html?v=20261108-sacheonseong-zoom-controls1';
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
