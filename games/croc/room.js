'use strict';
const party=window.DrinkingChild;
const crocGum=[
  {x:12.2, upper:55.1, lower:62.3, width:8.0, height:5.1, angle:57},
  {x:12.5, upper:49.6, lower:67.7, width:8.0, height:5.4, angle:32},
  {x:19.6, upper:47.3, lower:69.2, width:6.2, height:8.6, angle:15},
  {x:27.5, upper:46.1, lower:70.3, width:8.9, height:6.0, angle:8},
  {x:36.3, upper:45.7, lower:70.2, width:8.6, height:5.7, angle:4},
  {x:45.35, upper:45.6, lower:70.1, width:9.2, height:5.5, angle:2}
];
const jawCount=crocGum.length*2;
const CROC_TOOTH_COUNT=jawCount*2;
function board(s,canPress){
  const snap=s.phase==='done';
  const teeth=Array.from({length:CROC_TOOTH_COUNT},(_,i)=>{
    const pressed=s.pressed.includes(i);
    const state=snap&&i===s.trap?' trap':pressed?' sunk':'';
    const lower=i>=jawCount, slot=i%jawCount, right=slot>=crocGum.length;
    const tooth=crocGum[right?jawCount-1-slot:slot];
    const x=right?100-tooth.x:tooth.x, y=lower?tooth.lower:tooth.upper;
    const tilt=tooth.angle*(right?1:-1)*(lower?-1:1);
    const style='left:'+x+'%;top:'+y+'%;width:'+tooth.width+'%;height:'+tooth.height+'%;--tilt:'+tilt+'deg';
    const label=(lower?'아랫니 ':'윗니 ')+(i+1)+'번'+(state===' trap'?', 당첨':pressed?', 이미 눌렀어요':'');
    return '<button class="tooth'+state+'" data-jaw="'+(lower?'lower':'upper')+'" style="'+style+'" data-action="tooth" data-value="'+i+'" aria-label="'+label+'" '+(pressed||!canPress?'disabled':'')+'>'+
      '<span class="tooth-crown">'+(i+1)+'</span></button>';
  }).join('');
  return '<div class="croc-toy"><img class="croc-board" src="./art/croc-board.webp" alt="악어 입"><div class="teeth">'+teeth+'</div></div>';
}
const view=document.querySelector('#view'),notice=document.querySelector('#notice'),fx=window.PartyFX;
const param=new URLSearchParams(location.search);
const codeInput=(param.get('room')||'').toUpperCase();
let mode=codeInput?'join':'create',room=null,busy=false,pendingPoll=false,timer=0,lastBite='',activeCode=/^[A-Z0-9]{6}$/.test(codeInput)?codeInput:'';
function read(key){try{return sessionStorage.getItem(key)}catch{return null}}
function save(key,value){try{sessionStorage.setItem(key,value)}catch{}}
let client, actor, createRequest, createFingerprint;
const key=(field)=>'oj.croc.'+actor+'.'+field;
function saveStandalone(code){if(!party)save(key('last'),code)}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const control=(title,act,primary=false)=>party?.control(act)??'<button type="button" class="'+(primary?'action':'secondary')+'" data-do="'+act+'">'+title+'</button>';
function entry(){
  room=null;clearTimeout(timer);fx.quiet();
  if(party)return party.missing();
  const create=mode==='create';
  view.innerHTML='<section class="card"><img class="hero" src="./art/croc.webp" alt=""><div class="inside"><h1>악어 이빨</h1><p>각자 휴대폰으로 같은 방에 모여 이빨을 하나씩 눌러요.</p>'+
    '<div class="tabs"><button data-do="create-tab" aria-pressed="'+create+'">방 만들기</button><button data-do="join-tab" aria-pressed="'+!create+'">방 들어가기</button></div>'+
    '<form id="entry">'+
    (create?'<label>방 제목<input name="title" required maxlength="40" value="악어 이빨 같이 한 판 해요"></label><label>참여 인원<select name="capacity">'+Array.from({length:11},(_,i)=>'<option value="'+(i+2)+'" '+(i===2?'selected':'')+'>'+(i+2)+'명</option>').join('')+'</select></label>':
    '<label>방 코드<input name="code" required maxlength="6" minlength="6" autocapitalize="characters" spellcheck="false" value="'+esc(activeCode)+'"></label>')+
    '<label>방 비밀번호<input type="password" name="password" minlength="4" maxlength="32" required placeholder="'+(create?'4자 이상으로 정해 주세요':'방장이 정한 비밀번호')+'"></label><button class="action" type="submit">'+(create?'방 만들기':'입장하기')+'</button></form></div></section>';
}
function roomId(s){return s.code+'/'+s.round}
function render(s){
  const old=room,first=!old||old.code!==s.code;
  if(!first&&s.revision<=old.revision)return;
  party?.setPhase(s.phase);room=s;activeCode=s.code;
  if(first){
    saveStandalone(s.code);
    const url=new URL(location.href);url.searchParams.set('room',s.code);history.replaceState(null,'',url);
  }
  const mine=s.turn===s.me;
  const code='<div class="topline"><strong class="code">'+(party?.code||s.code)+'</strong><span>방 코드</span></div>';
  const members='<ol class="members">'+s.players.map((n,i)=>'<li class="'+(i===s.me?'me':'')+'">'+(i+1)+'. '+esc(n)+(i===0?' · 방장':'')+(i===s.me?' (나)':'')+'</li>').join('')+'</ol>';
  let content;
  if(s.phase==='waiting'){
    content=code+'<h1>참가자를 기다려요</h1><p>현재 '+s.players.length+' / '+s.capacity+'명 · 모두 모이면 시작해요.</p>'+members+
      '<div class="actions">'+control('초대 링크 복사','copy',true)+control('방 나가기','leave')+'</div><p class="sub">친구에게 링크와 방 비밀번호를 알려 주세요.</p>';
  }else{
    const lost=s.phase==='done';
    const biteId=roomId(s),ack=read(key('ack'))===biteId;
    let title=lost?esc(s.players[s.loser])+'님 당첨!':mine?'내 차례예요':esc(s.players[s.turn])+'님 차례';
    let hint=lost?'아픈 이빨은 '+(s.trap+1)+'번이었어요.':'남은 이빨 '+(24-s.pressed.length)+'개 · '+(mine?'이빨 하나를 골라 주세요.':'다른 참가자가 고르고 있어요.');
    const controls=lost?'<div class="actions">'+(s.me===s.loser&&!ack?control('확인','ack',true):'')+(s.me===0?control('한 판 더','again',true):'')+control('방 나가기','leave')+'</div>':'<div class="actions">'+control('방 나가기','leave')+'</div>';
    content='<div class="topline"><span>방 '+(party?.code||s.code)+'</span><span>'+s.round+'번째 판 · '+s.players.length+'명</span></div><h1>'+title+'</h1><p aria-live="polite">'+hint+'</p>'+controls+board(s,!lost&&mine)+members;
    if(old&&s.round===old.round&&s.pressed.length>old.pressed.length)fx.play('tooth');
    if(lost&&s.me===s.loser&&!ack&&!document.hidden&&lastBite!==biteId){lastBite=biteId;fx.startBite();}
  }
  if(old&&old.phase==='done'&&(old.round!==s.round||s.phase!=='done')){fx.quiet();lastBite='';}
  view.innerHTML='<section class="card"><div class="inside">'+content+'</div></section>';
}
const messages={
 not_signed_in:'오쭈다 로그인이 필요해요.', banned:'지금은 대전방을 이용할 수 없어요.',
 not_room_member:'방 비밀번호를 입력해 주세요.', room_unavailable:'방이 닫혔거나 시간이 만료됐어요.',
 room_full:'이미 게임을 시작했거나 자리가 없어요.', room_in_progress:'참여 중인 악어 방에서 먼저 나와 주세요.',
 join_rate_limit:'비밀번호를 여러 번 틀렸어요. 1분 뒤 다시 입력해 주세요.', wrong_password:'방 비밀번호가 맞지 않아요.', invalid_password:'비밀번호는 4~32자, 한글은 24자까지 가능해요.',
 stale_round:'방 상태가 바뀌었어요. 화면을 확인하고 다시 눌러 주세요.',stale_turn:'차례가 바뀌었어요. 게임판을 확인해 주세요.'
};
async function api(action,code='',options={}){
 const {data,error}=await client.rpc('croc_multiplayer',{p_action:action,p_code:code,p_options:options}).abortSignal(AbortSignal.timeout(12000));
 if(error||data?.error){const tag=error?.message||data.error;const e=new Error(messages[tag]||'연결을 확인한 뒤 다시 시도해 주세요.');e.code=tag;throw e;}
 return data;
}
function errorText(e){return e.message||'연결을 확인해 주세요.';}
function later(){clearTimeout(timer);if(room&&!document.hidden)timer=setTimeout(sync,1100)}
async function sync(){
  if(!room||busy||pendingPoll||document.hidden){later();return}
  const code=room.code;
  pendingPoll=true;
  try{const s=await api('state',code);if(room?.code===code){render(s);if(notice.dataset.network==='1'){notice.textContent='';notice.dataset.network='';}}}
  catch(e){if(room?.code===code){notice.textContent=errorText(e);notice.dataset.network='1';if(['room_unavailable','not_room_member'].includes(e.code)){saveStandalone('');entry();}}}
  finally{pendingPoll=false;later();}
}
async function run(task){
  if(busy)return;busy=true;notice.textContent='';notice.dataset.network='';
  try{await task()}catch(e){notice.textContent=errorText(e)}
  finally{busy=false;later()}
}
view.addEventListener('submit',e=>{
  e.preventDefault();
  const form=new FormData(e.target);
  const title=String(form.get('title')||'').trim(),password=form.get('password');
  const code=String(form.get('code')||'').trim().toUpperCase();
  if(mode==='join'&&!/^[A-Z0-9]{6}$/.test(code)){notice.textContent='방 코드 6자리를 확인해 주세요.';return}
  const button=e.target.querySelector('[type=submit]');button.disabled=true;
  run(async()=>{try{
    const capacity=Number(form.get('capacity')),fingerprint=JSON.stringify([title,capacity,password]);
    if(createFingerprint!==fingerprint){createFingerprint=fingerprint;createRequest=crypto.randomUUID();}
    const s=mode==='create'?await api('create','',{title,password,capacity,request_id:createRequest}):await api('join',code,{password});
    createFingerprint=null;render(s);
  }finally{button.disabled=false}});
});
view.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled||busy)return;
  const act=b.dataset.do;
  if(act==='create-tab'||act==='join-tab'){mode=act==='create-tab'?'create':'join';notice.textContent='';entry();return}
  if(!room)return;
  if(act==='ack'){save(key('ack'),roomId(room));fx.quiet();b.remove();return}
  if(act==='copy'){
    navigator.clipboard?.writeText(location.href).then(()=>{notice.textContent='초대 링크를 복사했어요.'},()=>{notice.textContent=location.href});
    if(!navigator.clipboard)notice.textContent=location.href;
    return;
  }
  if(act==='leave'){if(!window.DrinkingStandaloneExit.confirm(room))return;run(async()=>{await api('leave',room.code, window.DrinkingStandaloneExit.options(room));saveStandalone('');history.replaceState(null,'',location.pathname);activeCode='';entry()});return}
  if(act==='again'||b.dataset.action==='tooth'){
    const path=act==='again'?'again':'tooth',code=room.code;
    run(async()=>{try{render(await api(path,code,{tooth:Number(b.dataset.value),revision:room.revision}))}
      catch(e){if(e.code==='stale_turn')render(await api('state',code));throw e}});
  }
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){clearTimeout(timer);fx.quiet();}
  else if(room){
    if(room.phase==='done'&&room.me===room.loser&&read(key('ack'))!==roomId(room))fx.startBite();
    sync();
  }
});
window.addEventListener('pagehide',()=>{clearTimeout(timer);fx.quiet()});
window.addEventListener('pageshow',()=>{if(room)sync()});
function signedOut(){
 if(party)return party.signedOut();
 clearTimeout(timer);fx.quiet();room=null;
 view.innerHTML='<section class="card"><div class="inside"><h1>악어 이빨</h1><p>오쭈다에 로그인한 뒤 이 화면으로 돌아와 주세요.</p><a href="/?auth=login&amp;next=world" target="_blank" rel="noopener">오쭈다 로그인</a></div></section>';
}
async function init(){
 try{
  client=await window.OjjudaGetClient();
  const {data,error}=await client.auth.getSession();if(error)throw error;
  if(!data.session||data.session.user.is_anonymous){signedOut();return}
  actor=data.session.user.id;
  if(party&&!(await party.connect(client)))return;
  const last=activeCode||read(key('last'));
  if(last){
   try{render(await api('state',last));later();return}catch(e){
    if(e.code==='room_unavailable'){saveStandalone('');notice.textContent=errorText(e);}
    else if(e.code!=='not_room_member')throw e;
   }
  }
  entry();
 }catch(e){notice.textContent=errorText(e);view.innerHTML='<button class="secondary" data-do="retry">다시 연결</button>';}
}
view.addEventListener('click',event=>{if(event.target.closest('[data-do="retry"]'))location.reload()});
async function checkAccount(){
 if(!client)return;
 const {data}=await client.auth.getSession();
 if((data.session?.user?.id||null)!==(actor||null))location.reload();
}
window.addEventListener('focus',()=>void checkAccount());
init().then(()=>client?.auth.onAuthStateChange((_event,session)=>{
 if((session?.user?.id||null)!==(actor||null))location.reload();
}));
