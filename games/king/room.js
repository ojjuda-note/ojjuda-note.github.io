'use strict';
const view=document.querySelector('#view'),notice=document.querySelector('#notice');
const param=new URLSearchParams(location.search);
const codeInput=(param.get('room')||'').toUpperCase();
let mode=codeInput?'join':'create',room=null,busy=false,pendingPoll=false,timer=0,activeCode=/^[A-Z0-9]{6}$/.test(codeInput)?codeInput:'';
function read(key){try{return sessionStorage.getItem(key)}catch{return null}}
function save(key,value){try{sessionStorage.setItem(key,value)}catch{}}
let client, actor, createRequest, createFingerprint;
const key=(field)=>'oj.king.'+actor+'.'+field;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const control=(title,act,primary=false)=>'<button type="button" class="'+(primary?'action':'secondary')+'" data-do="'+act+'">'+title+'</button>';
const prompts=['좋아하는 노래 한 소절을 흥얼거려 주세요.','옆 사람의 장점을 하나 말해 주세요.','오늘의 기분을 표정으로 보여 주세요.','영화 주인공처럼 자기소개해 주세요.','두 손으로 하트를 만들어 주세요.','5초 동안 로봇처럼 움직여 주세요.','이 모임의 이름을 지어 주세요.'];
let revealed=false;
let draftNumber=1,draftSecond=null,draftMission='';
function numberOptions(count,selected,exclude){
  return Array.from({length:count},(_,i)=>i+1).filter(n=>n!==exclude)
    .map(n=>'<option value="'+n+'"'+(n===selected?' selected':'')+'>'+n+'번</option>').join('');
}
function secondOptions(count){
  return '<option value="">한 명에게만</option>'+numberOptions(count,draftSecond,draftNumber);
}
function entry(){
  room=null;clearTimeout(timer);revealed=false;
  const create=mode==='create';
  view.innerHTML='<section class="card"><div class="inside"><h1>왕게임</h1><p>한 사람은 왕, 나머지는 비밀 번호를 받아요. 왕이 한 명이나 두 명의 번호를 골라 미션을 내리면 주인공이 공개돼요.</p>'+
    '<div class="tabs"><button data-do="create-tab" aria-pressed="'+create+'">방 만들기</button><button data-do="join-tab" aria-pressed="'+!create+'">방 들어가기</button></div>'+
    '<form id="entry">'+
    (create?'<label>방 제목<input name="title" required maxlength="40" value="왕게임 같이 한 판 해요"></label><label>참여 인원<select name="capacity">'+Array.from({length:10},(_,i)=>'<option value="'+(i+3)+'" '+(i===1?'selected':'')+'>'+(i+3)+'명</option>').join('')+'</select></label>':
    '<label>방 코드<input name="code" required maxlength="6" minlength="6" autocapitalize="characters" spellcheck="false" value="'+esc(activeCode)+'"></label>')+
    '<label>방 비밀번호<input type="password" name="password" minlength="4" maxlength="32" required placeholder="'+(create?'4자 이상으로 정해 주세요':'방장이 정한 비밀번호')+'"></label><button class="action" type="submit">'+(create?'방 만들기':'입장하기')+'</button></form></div></section>';
}

function render(s,force=false){
  const first=!room||room.code!==s.code;
  if(!first&&(s.revision<room.revision||(!force&&s.revision===room.revision)))return;
  if(first||s.round!==room.round){
    draftNumber=1;draftSecond=null;draftMission=prompts[Math.floor(Math.random()*prompts.length)];
  }
  if(first||s.round!==room.round||s.phase!==room.phase)revealed=false;
  if(first){
    save(key('last'),s.code);
    const url=new URL(location.href);url.searchParams.set('room',s.code);history.replaceState(null,'',url);
  }
  room=s;activeCode=s.code;
  const members='<ol class="members">'+s.players.map((n,i)=>'<li class="'+(i===s.me?'me':'')+'">'+esc(n)+(i===s.me?' (나)':'')+'</li>').join('')+'</ol>';
  const heading='<div class="topline"><span>방 '+s.code+'</span><span>'+s.round+'번째 판 · '+s.players.length+'/'+s.capacity+'명</span></div>';
  let content='';
  if(s.phase==='waiting'){
    content='<h1>'+esc(s.title)+'</h1><p>모두 모이면 시작해요. 초대 링크와 방 비밀번호를 친구에게 알려 주세요.</p>'+members+control('초대 링크 복사','copy',true);
  }else if(s.phase==='done'){
    const recipients=[[s.number,s.recipient]];
    if(s.second!=null)recipients.push([s.second,s.secondRecipient]);
    const rows=recipients.map(([number,player])=>'<div><dt>카드 '+esc(number)+'번</dt><dd>'+esc(s.players[player])+'</dd></div>').join('');
    content='<section class="king-order"><span class="king-order-label">왕의 명령 · '+esc(s.players[s.king])+'</span>'+
      '<h1>'+esc(s.mission)+'</h1><dl class="king-recipients" aria-label="명령을 받은 사람">'+rows+'</dl></section>'+
      (s.me===0?control('한 판 더','again',true):'<p>방장이 다음 판을 시작할 수 있어요.</p>');
  }else{
    const role=s.card===0?'당신은 왕이에요.':'내 번호는 '+s.card+'번이에요.';
    const card='<section class="role">'+control(revealed?'내 카드 가리기':'내 카드 보기','reveal')+
      (revealed?'<p class="secret">'+role+'</p>':'')+'</section>';
    if(s.phase==='cards'){
      content='<h1>내 카드를 확인하세요</h1>'+card+'<p>카드 확인 '+s.readyCount+' / '+s.players.length+'명</p>'+
        (s.ready?'<p>다른 참가자의 확인을 기다려요.</p>':revealed?control('확인했어요','ready',true):'');
    }else if(s.me===s.king){
      const count=s.players.length-1;
      content='<h1>왕의 미션을 정하세요</h1>'+card+'<form id="order"><label>첫 번째 번호<select name="number">'+numberOptions(count,draftNumber)+'</select></label>'+
        '<label>두 번째 번호 (선택)<select name="second">'+secondOptions(count)+'</select></label>'+
        '<label>미션<input name="mission" maxlength="80" required value="'+esc(draftMission)+'"></label>'+
        control('다른 미션 추천','suggest')+'<div class="actions"><button class="action" type="submit">번호 주인공 공개</button></div></form>';
    }else{
      content='<h1>'+esc(s.players[s.king])+'님이 왕이에요</h1>'+card+'<p>왕이 번호와 미션을 고르고 있어요.</p>';
    }
  }
  view.innerHTML='<section class="card"><div class="inside">'+heading+content+'<div class="actions">'+control('방 나가기','leave')+'</div></div></section>';
}
const messages={
 not_signed_in:'오쭈다 로그인이 필요해요.', banned:'지금은 대전방을 이용할 수 없어요.',
 not_room_member:'방 비밀번호를 입력해 주세요.', room_unavailable:'방이 닫혔거나 시간이 만료됐어요.',
 room_full:'이미 게임을 시작했거나 자리가 없어요.', room_in_progress:'참여 중인 왕게임 방에서 먼저 나와 주세요.',
 join_rate_limit:'비밀번호를 여러 번 틀렸어요. 1분 뒤 다시 입력해 주세요.', wrong_password:'방 비밀번호가 맞지 않아요.', invalid_password:'비밀번호는 4~32자, 한글은 24자까지 가능해요.',
 stale_round:'새 판이 시작됐어요.', king_only:'이번 판의 왕만 미션을 정할 수 있어요.', invalid_number:'참가자의 번호를 골라 주세요.', invalid_mission:'미션은 1~80자로 입력해 주세요.', order_closed:'이미 미션을 정했어요.'
};
async function api(action,code='',options={}){
 const {data,error}=await client.rpc('king_multiplayer',{p_action:action,p_code:code,p_options:options}).abortSignal(AbortSignal.timeout(12000));
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
  catch(e){if(room?.code===code){notice.textContent=errorText(e);notice.dataset.network='1';if(['room_unavailable','not_room_member'].includes(e.code)){save(key('last'),'');entry();}}}
  finally{pendingPoll=false;later();}
}
async function run(task){
  if(busy)return;busy=true;notice.textContent='';notice.dataset.network='';
  try{await task()}catch(e){notice.textContent=errorText(e)}
  finally{busy=false;later()}
}
view.addEventListener('input',e=>{
  if(e.target.name==='mission')draftMission=e.target.value;
});
view.addEventListener('change',e=>{
  if(e.target.name==='number'){
    draftNumber=Number(e.target.value);
    if(draftSecond===draftNumber)draftSecond=null;
    e.target.form.elements.second.innerHTML=secondOptions(room.players.length-1);
  }
  if(e.target.name==='second')draftSecond=Number(e.target.value)||null;
});
view.addEventListener('submit',e=>{
  e.preventDefault();
  const form=new FormData(e.target);
  if(e.target.id==='order'){
    const mission=String(form.get('mission')||'').trim(),number=Number(form.get('number'));
    if(!mission||room?.phase!=='order'||room.me!==room.king)return;
    const order={round:room.round,mission,number};
    if(form.get('second'))order.second=Number(form.get('second'));
    run(async()=>render(await api('order',room.code,order)));return;
  }
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
  if(act==='reveal'){revealed=!revealed;render(room,true);return}
  if(act==='copy'){
    navigator.clipboard?.writeText(location.href).then(()=>{notice.textContent='초대 링크를 복사했어요.'},()=>{notice.textContent=location.href});
    if(!navigator.clipboard)notice.textContent=location.href;
    return;
  }
  if(act==='leave'){if((room.me===0||room.phase!=='waiting')&&!window.confirm('나가면 이 방이 모든 참가자에게서 닫혀요. 나갈까요?'))return;run(async()=>{await api('leave',room.code);save(key('last'),'');history.replaceState(null,'',location.pathname);activeCode='';entry()});return}
  if(act==='suggest'){
    const other=prompts.filter(p=>p!==draftMission);
    draftMission=other[Math.floor(Math.random()*other.length)];render(room,true);return;
  }
  if(act==='ready'||act==='again'){
    const current=room;
    run(async()=>{const updated=await api(act,current.code,{round:current.round});revealed=false;render(updated,true)});
  }
});
function cover(){
  clearTimeout(timer);
  if(room&&revealed){revealed=false;render(room,true)}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)cover();else if(room)sync()});
window.addEventListener('pagehide',cover);
window.addEventListener('pageshow',()=>{if(room)sync()});
function signedOut(){
 clearTimeout(timer);revealed=false;room=null;
 view.innerHTML='<section class="card"><div class="inside"><h1>왕게임</h1><p>오쭈다에 로그인한 뒤 이 화면으로 돌아와 주세요.</p><a href="/?auth=login&amp;next=world" target="_blank" rel="noopener">오쭈다 로그인</a></div></section>';
}
async function init(){
 try{
  client=await window.OjjudaGetClient();
  const {data,error}=await client.auth.getSession();if(error)throw error;
  if(!data.session||data.session.user.is_anonymous){signedOut();return}
  actor=data.session.user.id;
  const last=activeCode||read(key('last'));
  if(last){
   try{render(await api('state',last));later();return}catch(e){
    if(e.code==='room_unavailable'){save(key('last'),'');notice.textContent=errorText(e);}
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
