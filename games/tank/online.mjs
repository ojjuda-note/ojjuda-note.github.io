import {createEngine} from './engine.mjs?v=20261018-tank1';
const $=id=>document.getElementById(id),view=window.TankView;
const pending=new Map(),origin=location.origin;
let ready=false,available=false,current=null,engine=null,busy=false,uncertain=false,animation=false,moves=[],timer=0,polling=false,offset=0,coins=0,noticeTimer=0,epoch=0;
const messages={not_signed_in:'오쭈다에 로그인한 뒤 이용해 주세요.',banned:'지금은 대전방을 이용할 수 없어요.',room_in_progress:'참여 중인 방을 먼저 마무리해 주세요.',room_rate_limit:'잠시 후 방을 다시 만들어 주세요.',room_full:'방 인원이 꽉 찼어요.',room_not_found:'방 번호를 확인해 주세요.',room_unavailable:'이미 닫힌 방이에요.',room_already_started:'이미 전투가 시작됐어요.',not_room_owner:'방장만 시작할 수 있어요.',need_players:'두 명 이상 모이면 시작할 수 있어요.',state_conflict:'다른 기기에서 진행됐어요. 최신 화면으로 맞추고 있어요.',not_your_turn:'내 차례에 발사해 주세요.',coins:'쭈가 부족해요. 무료 기본탄을 선택할 수 있어요.',wallet_unavailable:'쭈 잔액을 확인하지 못했어요.',already_eliminated:'이미 탈락해 관전 중이에요.',unavailable:'연결이 원활하지 않아요. 다시 연결하고 있어요.'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notify(text){$('netMessage').textContent=text;$('netNotice').textContent=current?.game?text:'';clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{$('netNotice').textContent='';},6000);}
function rpc(body){
 if(!available)return Promise.reject(Error('not_signed_in'));
 const requestId=crypto.randomUUID();
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('unavailable'));},20000);
  pending.set(requestId,{resolve,reject,timer});
  parent.postMessage({source:'ojjuda-tank',type:'request',requestId,body},origin);
 });
}
async function request(body){
 for(let attempt=0;attempt<2;attempt++){
  try{const result=await rpc(body);if(!result?.ok)throw Error(result?.error||'unavailable');return result;}
  catch(e){if(e.message!=='unavailable'||attempt)throw e;}
 }
}
function canAim(){return !!(current?.status==='active'&&engine&&!animation&&!busy&&!uncertain&&current.seat===current.game.turn&&engine.view().tanks[current.seat]?.hp>0&&Date.parse(current.deadline)>Date.now()+offset);}
function lobby(){
 document.body.classList.remove('in-match');$('menu').classList.remove('hidden');$('over').classList.add('hidden');$('netHud').hidden=true;
 $('lobbyHome').hidden=!!current||!available;$('waitingRoom').hidden=!current||current.status!=='waiting';
 if(current?.status==='waiting'){
  $('waitingTitle').textContent=current.title;$('waitingCode').textContent=current.code;$('waitingCount').textContent=`${current.names.length} / ${current.capacity}명`;
  $('waitingNames').innerHTML=current.names.map((name,i)=>`<span class="seatBadge${i===current.seat?' me':''}">${esc(name)}${i===current.hostSeat?' · 방장':''}${i===current.seat?' · 나':''}</span>`).join('');
  $('startMatch').hidden=current.seat!==current.hostSeat;$('startMatch').disabled=busy||current.names.length<2;
 }
}
function render(){
 if(!current?.game){lobby();return;}
 document.body.classList.add('in-match');$('menu').classList.add('hidden');$('netHud').hidden=false;
 $('netCoins').textContent=`보유 ${coins}쭈`;
 const alive=current.game.tanks[current.seat]?.hp>0,remaining=Math.max(0,Math.ceil((Date.parse(current.deadline)-Date.now()-offset)/1000));
 $('netTurn').textContent=animation?'포탄 비행 중':current.status==='finished'?'전투 종료':!alive?'탈락 · 관전 중':`${current.game.names[current.game.turn]}${current.game.turn===current.seat?' (나)':''} 차례 · ${remaining}초`;
 $('surrender').hidden=!alive||current.status!=='active';$('surrender').disabled=busy||animation;
 if(current.status==='finished'&&!animation){
  const winner=current.game.tanks.find(t=>t.hp>0);$('winTxt').textContent=winner?winner.name+' 승리':'무승부';$('winSub').textContent=winner?'남은 체력 '+winner.hp:'모든 탱크가 파괴됐어요.';$('over').classList.remove('hidden');
 }else $('over').classList.add('hidden');
 view.refresh();
}
function accept(result,animate=true){
 if(Number.isInteger(result.coins))coins=result.coins;
 const next=result.room;
 if(next&&Number.isInteger(next.coins))coins=next.coins;
 if(next&&current?.id===next.id&&next.version<current.version)return;
 if(next){offset=next.serverTime-Date.now();}
 if(next&&current?.id===next.id&&next.version===current.version){current=next;render();return;}
 const prior=current;current=next;moves=[];uncertain=false;view.resetInput();
 if(!next?.game){engine=null;animation=false;view.resetHistory();render();return;}
 const replay=animate&&!document.hidden&&!animation&&prior?.id===next.id&&prior.game&&next.event?.type==='fire'&&next.event.fromVersion===prior.version&&next.game.shotNo>prior.game.shotNo;
 if(prior?.id!==next.id)view.resetHistory();
 if(replay){engine=createEngine(prior.game);engine.begin(next.event.command);animation=true;view.sound('fire');}
 else{engine=createEngine(next.game);animation=false;}
 view.use(engine,canAim());render();
}
async function list(){
 const result=await request({action:'list'});if(current)return;
 if(Number.isInteger(result.coins))coins=result.coins;
 $('rooms').innerHTML=result.rooms?.length?result.rooms.map(r=>`<div class="roomRow"><div class="roomInfo">${esc(r.title)}<small>${esc(r.code)} · ${r.players}/${r.capacity}명</small></div><button class="go alt" data-code="${esc(r.code)}"${r.players>=r.capacity?' disabled':''}>참여</button></div>`).join(''):'<p>아직 열린 방이 없어요. 첫 방을 만들어 보세요.</p>';
}
function schedule(){clearTimeout(timer);if(ready&&available)timer=setTimeout(refresh,current?2000:6000);}
async function refresh(){
 if(busy||polling){schedule();return;}
 polling=true;const revision=epoch;
 try{
  const result=await request(current?{action:'read',room_id:current.id}:{action:'mine'});
  if(revision!==epoch)return;
  uncertain=false;accept(result);if(!current)await list();
  if(!$('netNotice').textContent)$('netMessage').textContent=current?.status==='waiting'?'방 번호를 알려 주고 친구를 기다려 주세요.':current?'':'방을 만들거나 열린 방에 참여하세요.';
 }catch(e){
  if(['room_not_found','room_unavailable'].includes(e.message)){accept({room:null});}
  else if(e.message==='not_signed_in'){available=false;uncertain=true;}
  else uncertain=true;
  notify(messages[e.message]||messages.unavailable);render();
 }finally{polling=false;schedule();}
}
async function perform(body){
 if(busy)return;busy=true;epoch++;clearTimeout(timer);view.refresh();render();
 try{
  const result=await request(body);accept(result);notify(body.action==='create'?'방을 만들었어요. 방 번호로 모여 주세요.':'');return result;
 }catch(e){
  uncertain=['state_conflict','not_your_turn','unavailable'].includes(e.message);
  notify(messages[e.message]||messages.unavailable);view.resetInput();
 }finally{busy=false;render();schedule();if(uncertain)void refresh();}
}
async function fire(){
 if(!canAim())return;
 const body={action:'fire',room_id:current.id,version:current.version,request_id:crypto.randomUUID(),command:{...view.input(),moves:[...moves]}};
 await perform(body);
}
window.TankOnline={hasGame:()=>!!engine,canAim,balance:()=>coins,fire,
 tick(){
  if(!engine)return;
  if(animation){
   engine.step();
   if(!['fly','settle'].includes(engine.view().state)){
    view.finishAnimation(engine);engine=createEngine(current.game);animation=false;view.resetInput();render();
   }
  }else{
   view.tickInput(engine,dir=>{if(moves.length>=250)return false;moves.push(dir);return true;});
   // Falling during movement can eliminate the current tank; commit that movement without charging ammo.
   if(!busy&&!uncertain&&current?.status==='active'&&current.seat===current.game.turn&&current.game.tanks[current.seat].hp>0&&engine.view().tanks[current.seat].hp<=0){
    void perform({action:'fire',room_id:current.id,version:current.version,request_id:crypto.randomUUID(),command:{...view.input(),moves:[...moves]}});
   }
  }
  view.use(engine,canAim());
 }
};
$('createRoom').onsubmit=e=>{e.preventDefault();void perform({action:'create',request_id:crypto.randomUUID(),options:{title:$('roomTitle').value.trim(),capacity:Number($('roomCapacity').value)}});};
$('joinRoom').onsubmit=e=>{e.preventDefault();void perform({action:'join',code:$('roomCode').value.trim().toUpperCase()});};
$('rooms').onclick=e=>{const b=e.target.closest('[data-code]');if(b&&!b.disabled)void perform({action:'join',code:b.dataset.code});};
$('refreshRooms').onclick=()=>{if(!busy&&!polling)void refresh();};
$('startMatch').onclick=async()=>{if(!current||busy)return;void view.landscape();await perform({action:'start',room_id:current.id,version:current.version,request_id:crypto.randomUUID()});};
$('leaveRoom').onclick=()=>current&&!busy&&perform({action:'leave',room_id:current.id});
$('copyCode').onclick=async()=>{try{await navigator.clipboard.writeText(current.code);notify('방 번호를 복사했어요.');}catch{notify('방 번호 '+current.code+'를 알려 주세요.');}};
$('surrender').onclick=()=>{if(!busy&&current&&confirm('항복하고 관전할까요?'))void perform({action:'surrender',room_id:current.id,version:current.version,request_id:crypto.randomUUID()});};
$('bAgain').onclick=()=>current&&!busy&&perform({action:'leave',room_id:current.id});
$('bMenu').onclick=()=>parent.postMessage({source:'ojjuda-tank',type:'exit'},origin);
addEventListener('message',e=>{
 if(e.source!==parent||e.origin!==origin||e.data?.source!=='ojjuda-world')return;
 const m=e.data;
 if(m.type==='tank-response'){
  const p=pending.get(m.replyTo);if(!p)return;clearTimeout(p.timer);pending.delete(m.replyTo);p.resolve(m.result);
 }else if(m.type==='tank-init'&&!ready){
  ready=true;available=m.available===true;
  if(available)void refresh();else{notify(messages.not_signed_in);lobby();}
 }
});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){view.resetInput();return;}
 if(animation&&current?.game){animation=false;engine=createEngine(current.game);view.use(engine,false);}
 uncertain=true;void refresh();
});
addEventListener('online',()=>void refresh());
setInterval(()=>{if(current)render();},1000);
parent.postMessage({source:'ojjuda-tank',type:'ready'},origin);
if(parent===window){notify('오쭈다 오락실에서 탱크게임을 열어 주세요.');const link=document.createElement('a');link.href='/world.html?game=tank';link.textContent='오쭈다 탱크게임으로 이동';link.style.color='#f6c27a';$('menu').append(link);}
