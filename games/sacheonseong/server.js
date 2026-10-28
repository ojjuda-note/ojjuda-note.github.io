/* Durable, account-bound delivery of completed rounds and monthly time ranks. */
(()=>{
 'use strict';
 const rules=window.OjjudaSacheonseongRanking,KEY='ojjuda-sacheonseong-pending-v1',$=id=>document.getElementById(id);
 const embedded=parent!==window,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 function newId(){const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,n=>n.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
 const purchases=new Map();
 let owner,stage=1,queue=[],waiting=[],busy=null,deliveryTimer,rankingTimer,rankingId=null,rankStage=0;
 try{const saved=JSON.parse(localStorage.getItem(KEY));if(Array.isArray(saved))queue=saved.filter(r=>r&&uuid.test(r.id)&&rules.game(r.stage)&&rules.score(r.duration)!==null&&(r.owner==='guest'||uuid.test(r.owner))).slice(-100);}catch{}
 function persist(){try{localStorage.setItem(KEY,JSON.stringify(queue));}catch{note('순위 전송 대기 기록을 저장할 수 없어요. 이 화면에서 다시 등록해 주세요.',true);}}
 function note(message,retry=false){$('server-note').textContent=message;$('retry-records').hidden=!retry;}
 function send(message){if(embedded)parent.postMessage({source:'ojjuda-sacheonseong-game',...message},location.origin);}
 function flush(){
  if(!embedded||owner===undefined||busy)return;
  const next=queue.find(r=>r.owner===owner);if(!next)return;
  busy=next.id;note(`${next.stage}단계 기록을 오락실 순위에 등록하고 있어요…`);
  send({type:'record',...next});
  clearTimeout(deliveryTimer);deliveryTimer=setTimeout(()=>{busy=null;note('기록은 보관했어요. 연결되면 다시 등록해 주세요.',true);},20000);
 }
 function enqueue(item){
  if(queue.some(r=>r.id===item.id))return;
  queue.push({...item,owner});queue=queue.slice(-100);persist();flush();
 }
 function record(nextStage,result){
  if(!embedded)return;
  const item={id:newId(),stage:nextStage,duration:result.duration};
  if(!rules.game(nextStage)||rules.score(item.duration)===null)return;
  if(owner===undefined){waiting.push(item);return;}
  enqueue(item);
 }
 function buy(item){
  if(!embedded||owner==='guest')return Promise.resolve({ok:false,reason:'sign_in'});
  if(owner===undefined)return Promise.resolve({ok:false,reason:'connecting'});
  if(item.owner!==owner)return Promise.resolve({ok:false,reason:'owner_changed'});
  if(purchases.has(item.id))return purchases.get(item.id).promise;
  let finish,timer;const promise=new Promise(resolve=>{finish=resolve;});
  timer=setTimeout(()=>{purchases.delete(item.id);finish({ok:false,reason:'pending'});},12000);
  purchases.set(item.id,{promise,finish:result=>{clearTimeout(timer);purchases.delete(item.id);finish(result);}});
  send({type:'purchase',...item});return promise;
 }
 function renderRows(rows){
  const host=$('online-rows');if(!host)return;host.replaceChildren();
  const valid=rows.filter(r=>r&&rules.game(Number(r.stage))&&rules.duration(Number(r.score))!==null).slice(0,10);
  if(!valid.length){host.textContent='이번 달 기록이 아직 없어요. 첫 기록에 도전해 보세요.';return;}
  valid.forEach((r,i)=>{const row=document.createElement('div');row.className='rank-row'+(r.me?' recent':'');
   const position=document.createElement('span'),name=document.createElement('span'),value=document.createElement('strong');
   position.className='rank-number';position.textContent=i+1;name.className='online-rank-name';name.textContent=String(r.nick||'익명')+(r.me?' · 나':'');value.className='online-rank-result';value.textContent=rules.format(Number(r.score));const level=document.createElement('small');level.textContent=Number(r.stage)+'단계 ';value.prepend(level);row.append(position,name,value);host.append(row);
  });
 }
 function loadRanking(){
  if(!$('online-rows'))return;
  rankStage=0;rankingId=newId();$('online-rows').textContent='시간 순위를 불러오는 중이에요…';$('online-retry').hidden=true;
  send({type:'ranking',id:rankingId,stage:rankStage});
  clearTimeout(rankingTimer);rankingTimer=setTimeout(rankFailed,12000);
 }
 function rankFailed(){if(!$('online-rows'))return;$('online-rows').textContent='순위를 불러오지 못했어요. 다시 눌러 주세요.';$('online-retry').hidden=false;}
 function open(){
  if(!embedded){location.assign('/world.html?game=sacheonseong');return;}
  const modal=$('modal');if($('options')?.open)$('options').close();rankStage=0;
  $('modal-content').innerHTML='<div class="eyebrow">이번 달 · 최고 완료 단계 우선</div><h2 id="modal-title">오락실 게임순위</h2><div class="rank-table" id="online-rows" role="status"></div><button class="action-button" id="online-retry" hidden>다시 불러오기</button><p class="rank-explainer">더 높은 단계를 완료할수록 높은 순위예요. 같은 단계는 가장 짧은 시간, 같은 시간은 먼저 달성한 기록이 앞서요.</p><small class="rank-local">회원과 손님의 이번 달 최고 기록 TOP 10 · 한 사람당 하나 · 힌트·섞기 시간 포함</small>';
  $('online-retry').onclick=loadRanking;
  if(!modal.open)modal.showModal();loadRanking();
 }
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==parent||event.data?.source!=='ojjuda-sacheonseong-world')return;
  const message=event.data;
  if(message.type==='init'&&(message.owner==='guest'||uuid.test(message.owner))){
   // A live game stays bound to the identity that opened it.
   if(owner!==undefined&&owner!==message.owner)return;
   owner=message.owner;
   note('완료 기록은 오락실의 종합 게임순위에 등록돼요.');
   const initial=waiting;waiting=[];initial.forEach(enqueue);flush();
  }
  if(message.type==='purchase'&&message.owner===owner&&purchases.has(message.id)){purchases.get(message.id).finish(message.result||{ok:false,reason:'pending'});}
  if(message.type==='record'&&message.id===busy){
   clearTimeout(deliveryTimer);const saved=queue.find(r=>r.id===busy);busy=null;
   if(message.ok){queue=queue.filter(r=>r.id!==message.id);persist();note(`${saved?.stage||stage}단계 기록을 오락실 순위에 등록했어요.`);flush();}
   else note('기록은 보관했어요. 다시 등록해 주세요.',true);
  }
  if(message.type==='ranking'&&message.id===rankingId&&$('online-rows')){
   clearTimeout(rankingTimer);if(message.error||!Array.isArray(message.rows))rankFailed();else renderRows(message.rows);
  }
 });
 $('online-ranking').onclick=open;$('retry-records').onclick=flush;
 window.addEventListener('online',flush);
 window.OjjudaSacheonseongOnline={record,buy,newId,owner:()=>embedded?owner:'guest',stage:value=>{stage=value;}};
 if(embedded){note('오락실 게임순위에 연결하고 있어요…');send({type:'ready'});}
 else note('오락실에서 시작하면 완료 기록이 게임순위에 등록돼요.');
})();
