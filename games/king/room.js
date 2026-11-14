'use strict';
const party=window.DrinkingChild;
const view=document.querySelector('#view'),notice=document.querySelector('#notice');
const param=new URLSearchParams(location.search);
const codeInput=(param.get('room')||'').toUpperCase();
let mode=codeInput?'join':'create',room=null,busy=false,pendingPoll=false,timer=0,activeCode=/^[A-Z0-9]{6}$/.test(codeInput)?codeInput:'';
function read(key){try{return sessionStorage.getItem(key)}catch{return null}}
function save(key,value){try{sessionStorage.setItem(key,value)}catch{}}
let client, actor, createRequest, createFingerprint;
let initialized=false, initializing=false, authSubscribed=false;
const connection=window.OjjudaRoomConnection.create({
  onPause:()=>{clearTimeout(timer);
   if(room&&navigator.onLine===false){notice.textContent='연결이 잠시 끊겼어요. 다시 연결하고 있어요.';notice.dataset.network='1';}
   cover();},
  onResume:()=>{if(room){render(room,true);void sync();}else if(!initialized)void init();}
});
const key=(field)=>'oj.king.'+actor+'.'+field;
function saveStandalone(code){if(!party)save(key('last'),code)}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const control=(title,act,primary=false)=>party?.control(act)??'<button type="button" class="'+(primary?'action':'secondary')+'" data-do="'+act+'">'+title+'</button>';
const recommend=window.DrinkingPrompts.recommendations('king');
let missionStarted=false, missionEdit=0,missionCustom=false;
async function suggestMission(){
  const key=room.code+'/'+room.round, edit=++missionEdit;
  const text=await recommend(key,draftMission.trim(),draftSecond!=null);
  const field=view.querySelector('#order [name="mission"]');
  if(!room||room.code+'/'+room.round!==key||edit!==missionEdit||!field)return;
  missionCustom=false;field.value=draftMission=text;
  if(!text)field.placeholder='추천할 미션이 없어요. 직접 적어 주세요.';
}
let revealed=false, composing=false, deferredState=null;
view.addEventListener('compositionstart',e=>{
 if(e.target.matches('input,textarea'))composing=true;
});
view.addEventListener('compositionend',()=>{
 composing=false;
 const next=deferredState;deferredState=null;
 if(next)render(next,true);
});
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
  if(party)return party.missing();
  const create=mode==='create';
  view.innerHTML='<section class="card"><div class="inside"><h1>왕게임</h1><p>한 사람은 왕, 나머지는 비밀 번호를 받아요. 왕이 한 명이나 두 명의 번호를 골라 미션을 내리면 주인공이 공개돼요.</p>'+
    '<div class="tabs"><button data-do="create-tab" aria-pressed="'+create+'">방 만들기</button><button data-do="join-tab" aria-pressed="'+!create+'">방 들어가기</button></div>'+
    '<form id="entry">'+
    (create?'<label>방 제목<input name="title" required maxlength="40" value="왕게임 같이 한 판 해요"></label><label>참여 인원<select name="capacity">'+Array.from({length:10},(_,i)=>'<option value="'+(i+3)+'" '+(i===1?'selected':'')+'>'+(i+3)+'명</option>').join('')+'</select></label>':
    '<label>방 코드<input name="code" required maxlength="6" minlength="6" autocapitalize="characters" spellcheck="false" value="'+esc(activeCode)+'"></label>')+
    '<label>방 비밀번호<input type="password" name="password" minlength="4" maxlength="32" required placeholder="'+(create?'4자 이상으로 정해 주세요':'방장이 정한 비밀번호')+'"></label><button class="action" type="submit">'+(create?'방 만들기':'입장하기')+'</button></form></div></section>';
}

function render(s,force=false){
  if(!connection.active())return;
  if(!s||!/^[A-Z0-9]{6}$/.test(s.code)||!Number.isInteger(s.revision)||!Array.isArray(s.players)||
     !Number.isInteger(s.me)||s.me<0||s.me>=s.players.length)throw Error('방 상태를 다시 확인하고 있어요.');
  const first=!room||room.code!==s.code;
  if(!first&&(s.revision<room.revision||(!force&&s.revision===room.revision)))return;
  const sameTurn=!first&&s.round===room.round&&s.phase===room.phase&&s.turn===room.turn;
  if(composing&&sameTurn){
   if(!deferredState||s.revision>=deferredState.revision)deferredState=s;
   return;
  }
  deferredState=null;
  if(!sameTurn)composing=false;
  if(first||s.round!==room.round){
    draftNumber=1;draftSecond=null;draftMission='';missionStarted=false;missionCustom=false;missionEdit++;
  }
  if(first||s.round!==room.round||s.phase!==room.phase)revealed=false;
  if(first){
    saveStandalone(s.code);
    const url=new URL(location.href);url.searchParams.set('room',s.code);history.replaceState(null,'',url);
  }
  const focused=document.activeElement;
  const focus=sameTurn&&view.contains(focused)&&focused.name?{
   name:focused.name,start:focused.selectionStart,end:focused.selectionEnd,direction:focused.selectionDirection
  }:null;
  party?.setPhase(s.phase);room=s;activeCode=s.code;
  const members='<ol class="members">'+s.players.map((n,i)=>'<li class="'+(i===s.me?'me':'')+'">'+esc(n)+(i===0?' · 방장':'')+(i===s.me?' (나)':'')+'</li>').join('')+'</ol>';
  const heading='<div class="topline"><span>방 '+(party?.code||s.code)+'</span><span>'+s.round+'번째 판 · '+s.players.length+'/'+s.capacity+'명</span></div>';
  let content='';
  if(s.phase==='waiting'){
    content='<h1>'+esc(s.title)+'</h1><p>모두 모이면 시작해요. 초대 링크와 방 비밀번호를 친구에게 알려 주세요.</p>'+members+control('초대 링크 복사','copy',true);
  }else if(s.phase==='done'||s.phase==='response'){
    const recipients=[[s.number,s.recipient]];
    if(s.second!=null)recipients.push([s.second,s.secondRecipient]);
    const rows=recipients.map(([number,player])=>'<div><dt>카드 '+esc(number)+'번</dt><dd>'+esc(s.players[player])+'</dd></div>').join('');
    content='<section class="king-order"><span class="king-order-label">왕의 명령 · '+esc(s.players[s.king])+'</span>'+
      '<h1>'+esc(s.mission)+'</h1><dl class="king-recipients" aria-label="명령을 받은 사람">'+rows+'</dl></section>';
    if(s.phase==='response'){
      if(!recipients.some(([,p])=>p===s.me))content+='<p>두 사람이 각자 휴대폰에서 선택하고 있어요.</p>';
      else {
        const accepted=s.accepted.includes(s.card);
        content+='<p>'+(accepted?'동의했어요. 상대의 선택을 기다려요.':'이 미션을 할까요?')+'</p><div class="actions">'+
          (accepted?'':control('동의','accept',true))+control('거절 · 술 한 모금','decline')+'</div>';
      }
    }else{
      if(s.declined!=null)content+='<p>'+esc(s.players[s.declined])+'님은 술 한 모금. 이번 미션은 끝이에요.</p>';
      else if(s.accepted?.length===2)content+='<p>두 사람 모두 동의했어요. 미션을 진행하세요.</p>';
      content+=party?'':s.me===0?control('한 판 더','again',true):'<p>방장이 다음 판을 시작할 수 있어요.</p>';
    }
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
        '<p><small>직접 쓴 내용은 관리자 검토 후 공용 목록에 등록될 수 있어요.</small></p>'+
      control('다른 미션 추천','suggest')+'<div class="actions"><button class="action" type="submit">번호 주인공 공개</button></div></form>';
    }else{
      content='<h1>'+esc(s.players[s.king])+'님이 왕이에요</h1>'+card+'<p>왕이 번호와 미션을 고르고 있어요.</p>';
    }
  }
  view.innerHTML='<section class="card"><div class="inside">'+heading+content+'<div class="actions">'+control('방 나가기','leave')+'</div></div></section>';
  if(focus){
   const field=Array.from(view.querySelectorAll('input,select,textarea')).find(node=>node.name===focus.name);
   if(field){
    field.focus({preventScroll:true});
    if(focus.start!=null&&field.setSelectionRange)field.setSelectionRange(focus.start,focus.end,focus.direction);
   }
  }
  if(!missionStarted&&s.phase==='order'&&s.me===s.king){missionStarted=true;void suggestMission();}

}
const messages={
 not_signed_in:'오쭈다 로그인이 필요해요.', banned:'지금은 대전방을 이용할 수 없어요.',
 not_room_member:'방 비밀번호를 입력해 주세요.', room_unavailable:'방이 닫혔거나 시간이 만료됐어요.',
 room_full:'이미 게임을 시작했거나 자리가 없어요.', room_in_progress:'참여 중인 왕게임 방에서 먼저 나와 주세요.',
 join_rate_limit:'비밀번호를 여러 번 틀렸어요. 1분 뒤 다시 입력해 주세요.', wrong_password:'방 비밀번호가 맞지 않아요.', invalid_password:'비밀번호는 4~32자, 한글은 24자까지 가능해요.',
 stale_round:'새 판이 시작됐어요.', king_only:'이번 판의 왕만 미션을 정할 수 있어요.', invalid_number:'참가자의 번호를 골라 주세요.', invalid_mission:'미션은 1~80자로 입력해 주세요.', order_closed:'이미 미션을 정했어요.'
};
async function api(action,code='',options={}){
 let result;
 try{result=await connection.request(signal=>client.rpc('king_multiplayer',{
  p_action:action,p_code:code,p_options:options
 }).abortSignal(signal),{read:action==='state'});}
 catch(e){if(!connection.cancelled(e)){connection.failed();e.roomConnectionCounted=true;}throw e;}
 const {data,error}=result;
 if(error||data?.error){
  const tag=error?.message||data.error;
  if(messages[tag])connection.succeeded();else connection.failed();
  const e=new Error(messages[tag]||'연결을 확인한 뒤 다시 시도해 주세요.');e.code=tag;e.roomConnectionCounted=true;throw e;
 }
 connection.succeeded();return data;
}
function errorText(e){return e.message||'연결을 확인해 주세요.';}
function later(){clearTimeout(timer);if(room&&connection.active()&&!busy)timer=setTimeout(sync,connection.delay(1100))}
async function sync(){
  if(!connection.active())return;
  if(!room||busy||pendingPoll){later();return}
  const code=room.code;
  pendingPoll=true;
  try{const s=await api('state',code);if(room?.code===code){render(s);if(notice.dataset.network==='1'){notice.textContent='';notice.dataset.network='';}}}
  catch(e){if(!connection.cancelled(e)&&connection.active()&&room?.code===code){notice.textContent=errorText(e);notice.dataset.network='1';if(['room_unavailable','not_room_member'].includes(e.code)){saveStandalone('');entry();}}}
  finally{pendingPoll=false;later();}
}
async function run(task){
  if(busy||!connection.active())return;
  busy=true;clearTimeout(timer);connection.cancelReads();notice.textContent='';notice.dataset.network='';
  try{await task()}catch(e){if(!connection.cancelled(e)&&connection.active())notice.textContent=errorText(e)}
  finally{
   busy=false;
   if(room&&connection.active())void sync();
   else if(!initialized&&connection.active())timer=setTimeout(init,connection.delay(1100));
   else later();
  }
}
view.addEventListener('input',e=>{
  if(e.target.name==='mission'){missionCustom=true;missionEdit++;draftMission=e.target.value;}
});
view.addEventListener('change',e=>{
  if(e.target.name==='number'){
    draftNumber=Number(e.target.value);
    if(draftSecond===draftNumber){draftSecond=null;if(!missionCustom)void suggestMission();}
    e.target.form.elements.second.innerHTML=secondOptions(room.players.length-1);
  }
  if(e.target.name==='second'){draftSecond=Number(e.target.value)||null;if(!missionCustom)void suggestMission();}
});
view.addEventListener('submit',e=>{
  e.preventDefault();
  if(busy||!connection.active())return;
  const form=new FormData(e.target);
  if(e.target.id==='order'){
    const mission=String(form.get('mission')||'').trim(),number=Number(form.get('number'));
    if(!mission||room?.phase!=='order'||room.me!==room.king)return;
    const order={round:room.round,mission,number};
    if(form.get('second'))order.second=Number(form.get('second'));
    run(async()=>{
      const next=await api('order',room.code,order);
      window.DrinkingPrompts.submit('king',mission);
      render(next);
    });return;
  }
  const title=String(form.get('title')||'').trim(),password=form.get('password');
  const code=String(form.get('code')||'').trim().toUpperCase();
  if(mode==='join'&&!/^[A-Z0-9]{6}$/.test(code)){notice.textContent='방 코드 6자리를 확인해 주세요.';return}
  const button=e.target.querySelector('[type=submit]');button.disabled=true;
  run(async()=>{try{
    const capacity=Number(form.get('capacity')),fingerprint=JSON.stringify([title,capacity,password]);
    if(createFingerprint!==fingerprint){createFingerprint=fingerprint;createRequest=crypto.randomUUID();}
    if(mode==='join'){activeCode=code;initialized=false;}
    const s=mode==='create'?await api('create','',{title,password,capacity,request_id:createRequest}):await api('join',code,{password});
    createFingerprint=null;render(s);initialized=true;
  }catch(e){
    // A join may have committed before its response was interrupted. Recover
    // membership with state; never repeat an uncertain join automatically.
    if(mode==='join'&&messages[e.code])initialized=true;
    throw e;
  }finally{button.disabled=false}});
});
view.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled||busy||!connection.active())return;
  const act=b.dataset.do;
  if(act==='create-tab'||act==='join-tab'){mode=act==='create-tab'?'create':'join';notice.textContent='';entry();return}
  if(!room)return;
  if(act==='accept'||act==='decline'){
    if(room.phase==='response')run(async()=>render(await api(act,room.code,{round:room.round})));
    return;
  }
  if(act==='reveal'){revealed=!revealed;render(room,true);return}
  if(act==='copy'){
    navigator.clipboard?.writeText(location.href).then(()=>{notice.textContent='초대 링크를 복사했어요.'},()=>{notice.textContent=location.href});
    if(!navigator.clipboard)notice.textContent=location.href;
    return;
  }
  if(act==='leave'){if(!window.DrinkingStandaloneExit.confirm(room))return;run(async()=>{await api('leave',room.code, window.DrinkingStandaloneExit.options(room));saveStandalone('');history.replaceState(null,'',location.pathname);activeCode='';entry()});return}
  if(act==='suggest'){void suggestMission();return;}
  if(act==='ready'||act==='again'){
    const current=room;
    run(async()=>{const updated=await api(act,current.code,{round:current.round});revealed=false;render(updated,true)});
  }
});
function cover(){
 clearTimeout(timer);
 if(room&&revealed){
  revealed=false;
  view.querySelectorAll('.secret').forEach(node=>node.remove());
 }
}
function signedOut(){
 if(party)return party.signedOut();
 clearTimeout(timer);revealed=false;room=null;
 view.innerHTML='<section class="card"><div class="inside"><h1>왕게임</h1><p>오쭈다에 로그인한 뒤 이 화면으로 돌아와 주세요.</p><a href="/?auth=login&amp;next=world" target="_blank" rel="noopener">오쭈다 로그인</a></div></section>';
}
function accountChanged(session){
 const id=session?.user&&!session.user.is_anonymous?session.user.id:null;
 if(id!==(actor||null)){connection.pause();room=null;view.replaceChildren();location.reload();}
}
async function init(){
 if(initializing||!connection.active())return;
 initializing=true;initialized=false;clearTimeout(timer);
 try{
  client=await connection.request(()=>window.OjjudaGetClient(),{read:true});
  if(!connection.active())return;
  const {data,error}=await connection.request(() => client.auth.getSession(), {read:true});if(error)throw error;
  if(!connection.active())return;
  const user=data.session?.user;
  actor=user&&!user.is_anonymous?user.id:null;
  if(!authSubscribed){authSubscribed=true;client.auth.onAuthStateChange((_event,session)=>accountChanged(session));}
  if(!actor){initialized=true;signedOut();return;}
  if(party&&!(await party.connect(client))){initialized=true;connection.pause();return;}
  if(!connection.active())return;
  const last=activeCode||read(key('last'));
  if(last){
   try{const next=await api('state',last);notice.textContent='';render(next);initialized=true;later();return;}catch(e){
    if(e.code==='room_unavailable'){saveStandalone('');notice.textContent=errorText(e);}
    else if(e.code!=='not_room_member')throw e;
   }
  }
  initialized=true;entry();
 }catch(e){
  if(!connection.cancelled(e)&&connection.active()){
   if(!e.roomConnectionCounted)connection.failed();notice.textContent=errorText(e);
   if(['not_signed_in','banned'].includes(e.code))initialized=true;
   if(!room)view.innerHTML='<button class="secondary" data-do="retry">다시 연결</button>';
  }
 }finally{
  initializing=false;
  if(!initialized&&connection.active())timer=setTimeout(init,connection.delay(1100));
 }
}
view.addEventListener('click',event=>{
 if(event.target.closest('[data-do="retry"]')){if(room)void sync();else void init();}
});
async function checkAccount(){
 if(!client||!connection.active())return;
 try{const {data,error}=await connection.request(() => client.auth.getSession(), {read:true});if(!error&&connection.active())accountChanged(data.session);}catch{}
}
window.addEventListener('focus',()=>void checkAccount());
init();
