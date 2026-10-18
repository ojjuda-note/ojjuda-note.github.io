import {createEngine,WEAPONS} from './engine.mjs?v=20261018-side-ground1';
const $=id=>document.getElementById(id),view=window.TankView;
const pending=new Map(),origin=location.origin;
let ready=false,available=false,current=null,engine=null,busy=false,uncertain=false,animation=false,moves=[],timer=0,polling=false,offset=0,coins=0,noticeTimer=0,epoch=0,selectedMode='solo',cpuTimer=0,cpuVersion='';
let restoreCheck=true,resumeOnEntry=false;
const messages={not_signed_in:'오쭈다에 로그인한 뒤 이용해 주세요.',banned:'지금은 대전방을 이용할 수 없어요.',room_in_progress:'참여 중인 방을 먼저 마무리해 주세요.',room_rate_limit:'잠시 후 방을 다시 만들어 주세요.',room_full:'방 인원이 꽉 찼어요.',room_not_found:'방 번호를 확인해 주세요.',room_unavailable:'이미 닫힌 방이에요.',room_already_started:'이미 전투가 시작됐어요.',not_room_owner:'방장만 시작할 수 있어요.',need_players:'두 명 이상 모이면 시작할 수 있어요.',state_conflict:'다른 기기에서 진행됐어요. 최신 화면으로 맞추고 있어요.',not_your_turn:'내 차례에 발사해 주세요.',coins:'쭈가 부족해요. 무료 기본탄을 선택할 수 있어요.',wallet_unavailable:'쭈 잔액을 확인하지 못했어요.',already_eliminated:'이미 탈락해 관전 중이에요.',unavailable:'연결이 원활하지 않아요. 다시 연결하고 있어요.'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notify(text){$('netMessage').textContent=text;$('netNotice').textContent=current?.game&&!resumeOnEntry?text:'';clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{$('netNotice').textContent='';},6000);}
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
function playerSeat(){return current?.mode==='local'?(engine?.view().turn??current.game?.turn??0):current?.seat??-1;}
function canAim(){const seat=playerSeat();return !!(!resumeOnEntry&&current?.status==='active'&&engine&&!animation&&!busy&&!uncertain&&seat===current.game.turn&&engine.view().tanks[seat]?.hp>0&&(current.mode!=='online'||Date.parse(current.deadline)>Date.now()+offset));}
function chooseMode(mode){
 selectedMode=mode;
 lobby();
}
function lobby(){
 clearTimeout(cpuTimer);cpuTimer=0;cpuVersion='';
 for(const id of ['solo','local','online']){$(id+'Mode').classList.toggle('on',id===selectedMode);$(id+'Mode').setAttribute('aria-pressed',String(id===selectedMode));}
 $('entryCopy').innerHTML=selectedMode==='solo'?'바람을 읽고, 각도를 맞춰 한 발!<br>컴퓨터와 가볍게 한 판 즐겨요.':selectedMode==='local'?'한 기기로 둘러앉아 한 판!<br>차례대로 번갈아 조작해요 · 2~12명':'바람을 읽고, 각도를 맞춰 한 발!<br>각자의 기기에서 함께해요 · 2~12명';
 document.body.classList.remove('in-match');$('menu').classList.remove('hidden');$('over').classList.add('hidden');$('netHud').hidden=true;
 $('entryHome').hidden=!!current;$('soloSetup').hidden=selectedMode!=='solo';$('localSetup').hidden=selectedMode!=='local';$('lobbyHome').hidden=!!current||selectedMode!=='online';$('waitingRoom').hidden=!current||current.status!=='waiting';
 $('resumeHome').hidden=!resumeOnEntry||!current?.game;
 if(resumeOnEntry&&current?.game){
  const online=current.mode==='online',finished=current.status==='finished';
  $('entryCopy').textContent=online&&!finished?'참여 중인 온라인 대전이 있어요. 이어서 참여해 주세요.':'하던 게임이 있어요. 이어서 하거나 새로 시작해 보세요.';
  $('resumeInfo').textContent=current.mode==='solo'?`혼자 하기 · 컴퓨터 ${current.capacity-1}명`:current.mode==='local'?`같은 기기 · ${current.capacity}명`:`온라인 대전 · ${current.names.length}명`;
  $('resumeMatch').textContent=finished?'게임 결과 보기':'하던 게임 이어서 하기';
  $('resumeMatch').disabled=$('newMatch').disabled=busy||!ready||!available||uncertain;
  $('newMatch').hidden=online&&!finished;
  $('resumeHint').textContent=online&&!finished?'온라인 대전은 계속 진행돼요. 이어서 참여해 주세요.':'체력·지형·차례가 저장되어 있어요. 마지막 진행 후 24시간까지 이어 할 수 있어요.';
 }
 $('startSolo').disabled=$('startLocal').disabled=busy||!ready||!available||uncertain;
 for(const button of document.querySelectorAll('#lobbyHome button'))button.disabled=busy||!available;
 $('soloMode').disabled=$('localMode').disabled=$('onlineMode').disabled=busy;
 if(current?.status==='waiting'){
  const solo=current.mode==='solo',local=current.mode==='local',privateMatch=solo||local;
  $('waitingTitle').textContent=current.title;$('waitingCode').textContent=current.code;$('waitingCount').textContent=`${current.names.length} / ${current.capacity}명`;
  $('waitingCodeRow').hidden=privateMatch;$('waitingCount').textContent=local?`${current.capacity}명이 같은 기기에서 대전`:solo?`나 1명 + 컴퓨터 ${current.capacity-1}명`:$('waitingCount').textContent;
  $('waitingHint').textContent=local?'준비됐어요. 차례대로 번갈아 조작해 주세요.':solo?'준비됐어요. 혼자 시작해 보세요.':'방장이 시작하면 모두 함께 전투에 들어가요.';
  const names=local?Array.from({length:current.capacity},(_,i)=>`플레이어 ${i+1}`):current.names;
  $('waitingNames').innerHTML=names.map((name,i)=>`<span class="seatBadge${!local&&i===current.seat?' me':''}">${esc(name)}${!local&&i===current.hostSeat?' · 방장':''}${!local&&i===current.seat?' · 나':''}</span>`).join('');
  $('inviteFriends').hidden=privateMatch||current.seat!==current.hostSeat;$('inviteFriends').disabled=busy||current.names.length>=current.capacity;
  $('startMatch').hidden=current.seat!==current.hostSeat;$('startMatch').disabled=busy||(!privateMatch&&current.names.length<2);
 }
}
function render(){
 if(!current?.game||resumeOnEntry){lobby();return;}
 document.body.classList.add('in-match');$('menu').classList.add('hidden');$('netHud').hidden=false;
 $('netCoins').textContent=`보유 ${coins}쭈`;
 const solo=current.mode==='solo',local=current.mode==='local',privateMatch=solo||local;
 const alive=local?current.game.tanks.some(t=>t.hp>0):current.game.tanks[current.seat]?.hp>0,remaining=Math.max(0,Math.ceil((Date.parse(current.deadline)-Date.now()-offset)/1000));
 $('netTurn').textContent=animation?`${WEAPONS[current.event?.command?.weapon]?.name||'포탄'} 비행 중`:current.status==='finished'?'전투 종료':!alive?'탈락 · 관전 중':`${current.game.names[current.game.turn]}${!local&&current.game.turn===current.seat?' (나)':''} 차례${local?' · 번갈아 조작해 주세요':solo?'':' · '+remaining+'초'}`;
 $('surrender').textContent=privateMatch?'그만하기':'항복';$('surrender').hidden=!alive||current.status!=='active';$('surrender').disabled=busy||animation;
 $('bAgain').textContent=privateMatch?'다시 하기':'대기실로';$('bMenu').textContent=privateMatch?'처음 화면으로':'게임 목록';
 if(current.status==='finished'&&!animation&&!view.hasEffects()){
  const winner=current.game.tanks.find(t=>t.hp>0);$('winTxt').textContent=solo&&!alive?'내 탱크가 파괴됐어요':winner?winner.name+' 승리':'무승부';$('winSub').textContent=solo&&!alive?'컴퓨터와 다시 도전해 보세요.':winner?'남은 체력 '+winner.hp:'모든 탱크가 파괴됐어요.';$('over').classList.remove('hidden');
 }else $('over').classList.add('hidden');
 view.refresh();queueComputer();
}
function queueComputer(){
 const eligible=!resumeOnEntry&&current?.mode==='solo'&&current.status==='active'&&current.game.turn!==current.seat&&!animation&&!busy&&!uncertain&&!document.hidden;
 const key=eligible?current.id+':'+current.version:'';
 if(!key){clearTimeout(cpuTimer);cpuTimer=0;cpuVersion='';return;}
 if(cpuTimer&&cpuVersion===key)return;
 clearTimeout(cpuTimer);cpuVersion=key;
 cpuTimer=setTimeout(()=>{cpuTimer=0;if(current?.id+':'+current?.version!==key)return;void perform({action:'cpu',room_id:current.id,version:current.version,request_id:crypto.randomUUID()});},900);
}
function accept(result,animate=true){
 if(Number.isInteger(result.coins))coins=result.coins;
 const next=result.room;
 if(next&&Number.isInteger(next.coins))coins=next.coins;
 if(next&&current?.id===next.id&&next.version<current.version)return;
 if(next){offset=next.serverTime-Date.now();selectedMode=next.mode||'online';}
 if(next&&current?.id===next.id&&next.version===current.version){current=next;render();return;}
 const prior=current;current=next;moves=[];uncertain=false;view.resetInput();
 if(!next?.game){resumeOnEntry=false;engine=null;animation=false;view.resetHistory();render();return;}
 const replay=animate&&!resumeOnEntry&&!document.hidden&&!animation&&prior?.id===next.id&&prior.game&&next.event?.type==='fire'&&next.event.fromVersion===prior.version&&next.game.shotNo>prior.game.shotNo;
 if(prior?.id!==next.id)view.resetHistory();
 if(replay){engine=createEngine(prior.game);engine.begin(next.event.command);animation=true;view.sound('fire');view.notify(WEAPONS[next.event.command.weapon].name+' 발사');}
 else{engine=createEngine(next.game);animation=false;}
 view.use(engine,canAim());render();
}
async function list(){
 const result=await request({action:'list'});if(current)return;
 if(Number.isInteger(result.coins))coins=result.coins;
 $('rooms').innerHTML=result.rooms?.length?result.rooms.map(r=>`<div class="roomRow"><div class="roomInfo">${esc(r.title)}<small>${esc(r.code)} · ${r.players}/${r.capacity}명</small></div><button class="ge-secondary" data-code="${esc(r.code)}"${r.players>=r.capacity?' disabled':''}>참여</button></div>`).join(''):'<p>아직 열린 방이 없어요. 첫 방을 만들어 보세요.</p>';
}
function schedule(){clearTimeout(timer);if(ready&&available)timer=setTimeout(refresh,current?2000:6000);}
async function refresh(){
 if(busy||polling){schedule();return;}
 polling=true;const revision=epoch;
 try{
  const result=await request(current?{action:'read',room_id:current.id}:{action:'mine'});
  if(revision!==epoch)return;
  if(restoreCheck){restoreCheck=false;resumeOnEntry=!!result.room?.game;}
  uncertain=false;accept(result);if(!current)await list();
  if(!$('netNotice').textContent)$('netMessage').textContent=current?.status==='waiting'?(current.mode==='solo'?'준비되면 전투를 시작하세요.':'방 번호를 알려 주고 친구를 기다려 주세요.'):current?'':`보유 ${coins}쭈 · 기본탄 3종은 무료예요`;
 }catch(e){
  if(['room_not_found','room_unavailable'].includes(e.message)){accept({room:null});}
  else if(e.message==='not_signed_in'){available=false;uncertain=true;}
  else uncertain=true;
  notify(messages[e.message]||messages.unavailable);render();
 }finally{polling=false;schedule();}
}
async function perform(body){
 if(busy)return;restoreCheck=false;busy=true;epoch++;clearTimeout(timer);view.refresh();render();
 try{
  const result=await request(body);accept(result);notify(body.action==='create'&&body.options?.mode!=='solo'?'방을 만들었어요. 방 번호로 모여 주세요.':'');return result;
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
window.TankOnline={hasGame:()=>!!engine,seat:playerSeat,canAim,balance:()=>coins,fire,
 tick(){
  if(!engine||resumeOnEntry)return;
  if(animation){
   engine.step();
   if(!['fly','settle'].includes(engine.view().state)){
    view.finishAnimation(engine);engine=createEngine(current.game);animation=false;view.resetInput();render();
   }
  }else{
   engine.setWindTime(Date.now()+offset);
   view.tickInput(engine,dir=>{if(moves.length>=250)return false;moves.push(dir);return true;});
   // Falling during movement can eliminate the current tank; commit that movement without charging ammo.
   const seat=playerSeat();
   if(!busy&&!uncertain&&current?.status==='active'&&seat===current.game.turn&&current.game.tanks[seat].hp>0&&engine.view().tanks[seat].hp<=0){
    void perform({action:'fire',room_id:current.id,version:current.version,request_id:crypto.randomUUID(),command:{...view.input(),moves:[...moves]}});
   }
  }
  view.use(engine,canAim());
  if(view.tickEffects())render();
 }
};
async function startPrivate(mode){
 if(busy||!available)return;
 void view.landscape();
 const capacity=mode==='local'?Number($('localPlayers').value):Number($('soloOpponents').value)+1;
 const created=await perform({action:'create',request_id:crypto.randomUUID(),options:{mode,title:mode==='local'?'같은 기기에서 탱크 한 판':'컴퓨터와 탱크 한 판',capacity}});
 if(created?.room?.status==='waiting')await perform({action:'start',room_id:created.room.id,version:created.room.version,request_id:crypto.randomUUID()});
}
$('soloMode').onclick=()=>chooseMode('solo');$('localMode').onclick=()=>chooseMode('local');$('onlineMode').onclick=()=>chooseMode('online');$('startSolo').onclick=()=>startPrivate('solo');$('startLocal').onclick=()=>startPrivate('local');
$('resumeMatch').onclick=()=>{if(!current?.game||busy||uncertain)return;resumeOnEntry=false;void view.landscape();render();};
$('newMatch').onclick=async()=>{
 if(!current||busy||uncertain||(current.mode==='online'&&current.status==='active'))return;
 if(!confirm('새 게임을 준비하면 하던 게임이 끝나요. 새로 시작할까요?'))return;
 if(current.mode==='solo')$('soloOpponents').value=String(current.capacity-1);
 if(current.mode==='local')$('localPlayers').value=String(current.capacity);
 await perform({action:'leave',room_id:current.id});
};
$('createRoom').onsubmit=e=>{e.preventDefault();void perform({action:'create',request_id:crypto.randomUUID(),options:{title:$('roomTitle').value.trim(),capacity:Number($('roomCapacity').value)}});};
$('joinRoom').onsubmit=e=>{e.preventDefault();void perform({action:'join',code:$('roomCode').value.trim().toUpperCase()});};
$('rooms').onclick=e=>{const b=e.target.closest('[data-code]');if(b&&!b.disabled)void perform({action:'join',code:b.dataset.code});};
$('refreshRooms').onclick=()=>{if(!busy&&!polling)void refresh();};
$('startMatch').onclick=async()=>{if(!current||busy)return;void view.landscape();await perform({action:'start',room_id:current.id,version:current.version,request_id:crypto.randomUUID()});};
$('leaveRoom').onclick=()=>current&&!busy&&perform({action:'leave',room_id:current.id});
$('inviteFriends').onclick=async()=>{
 if(busy||current?.status!=='waiting'||current.mode!=='online'||current.seat!==current.hostSeat)return;
 const room=current.id;$('inviteFriends').disabled=true;
 try{await request({action:'invite',room_id:room});}catch(e){notify(messages[e.message]||'친구 초대를 열지 못했어요. 다시 시도해 주세요.');}
 finally{render();}
};
$('copyCode').onclick=async()=>{try{await navigator.clipboard.writeText(current.code);notify('방 번호를 복사했어요.');}catch{notify('방 번호 '+current.code+'를 알려 주세요.');}};
$('surrender').onclick=()=>{if(!busy&&current&&confirm(current.mode!=='online'?'이번 게임을 끝내고 처음 화면으로 갈까요?':'항복하고 관전할까요?'))void perform({action:current.mode!=='online'?'leave':'surrender',room_id:current.id,version:current.version,request_id:crypto.randomUUID()});};
$('bAgain').onclick=async()=>{if(!current||busy)return;const mode=current.mode;if(mode==='solo')$('soloOpponents').value=String(current.capacity-1);if(mode==='local')$('localPlayers').value=String(current.capacity);const left=await perform({action:'leave',room_id:current.id});if(left&&mode!=='online')await startPrivate(mode);};
const exit=()=>parent.postMessage({source:'ojjuda-tank',type:'exit'},origin);
$('bMenu').onclick=()=>current&&current.mode!=='online'&&!busy?perform({action:'leave',room_id:current.id}):exit();$('exitEntry').onclick=exit;
addEventListener('message',e=>{
 if(e.source!==parent||e.origin!==origin||e.data?.source!=='ojjuda-world')return;
 const m=e.data;
 if(m.type==='tank-invite-sent'){notify('친구를 초대했어요. 친구가 받으면 이 방으로 들어와요.');}
 else if(m.type==='tank-response'){
  const p=pending.get(m.replyTo);if(!p)return;clearTimeout(p.timer);pending.delete(m.replyTo);p.resolve(m.result);
 }else if(m.type==='tank-init'&&!ready){
  ready=true;available=m.available===true;
  if(available){
   if(typeof m.joinCode==='string'&&/^[A-F0-9]{8}$/.test(m.joinCode)){selectedMode='online';void perform({action:'join',code:m.joinCode});}
   else void refresh();
  }else{notify(messages.not_signed_in);lobby();}
 }
});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){view.resetInput();queueComputer();return;}
 if(animation&&current?.game){animation=false;engine=createEngine(current.game);view.use(engine,false);}
 uncertain=true;void refresh();
});
addEventListener('online',()=>void refresh());
setInterval(()=>{if(current)render();},1000);
parent.postMessage({source:'ojjuda-tank',type:'ready'},origin);
if(parent===window){notify('오쭈다 오락실에서 탱크게임을 열어 주세요.');const link=document.createElement('a');link.href='/world.html?game=tank';link.textContent='오쭈다 탱크게임으로 이동';link.style.color='#f6c27a';$('menu').append(link);}
