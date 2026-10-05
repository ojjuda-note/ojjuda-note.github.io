import {CARDS,isPi,piVal,score} from './matgo-engine.mjs?v=20261005-g-unit1';
import {heldPairMonths} from './matgo-view.mjs?v=20261003-gukjin1';
import {cardSVG,backSVG} from './matgo-art.mjs?v=20261003-gukjin1';
import {createWallet} from './matgo-wallet.mjs?v=20261005-g-unit1';
const $=s=>document.querySelector(s),access=window.OjjudaMatgoAccess;
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>Number(v||0).toLocaleString(),signed=v=>(v>=0?'+':'')+number(v);
const messages={adult_required:'맞고는 만 19세 이상만 이용할 수 있어요.',member_identity_required:'생년월일을 등록한 뒤 입장해 주세요.',not_signed_in:'다시 로그인해 주세요.',banned:'이용이 제한된 계정이에요.',gold_empty:'골드를 충전한 뒤 시작해 주세요.',room_not_found:'방 코드를 다시 확인해 주세요.',room_unavailable:'이미 시작하거나 종료된 방이에요.',match_in_progress:'진행 중인 대결을 먼저 마쳐 주세요.',state_conflict:'차례가 바뀌었어요. 현재 판을 다시 확인할게요.',not_your_turn:'상대 차례이거나 자동 진행 중이에요.'};
let wallet,room=null,cursor=0,busy=false,polling=false,closed=false,pendingMove=null,viewKey='',promptKey='',pollTimer,accessTimer,token=null,clockOffset=0;
let dialog=null,dialogKey='',eventTimer,eventQueue=[],showingEvent=false;
let arcadeRoom=null;
const entryParams=new URLSearchParams(location.search);
function roomLabel(){const label=$('#room-label');if(!label)return;label.hidden=!arcadeRoom;label.textContent=arcadeRoom?`방 #${arcadeRoom.room_no} · ${arcadeRoom.title}`:'';}
async function arcadeRpc(action,params={}){
  const {data,error}=await access.getClient().rpc('arcade_room_service',{p_action:action,...params});
  if(error||!data?.ok){const code=Object.keys({...messages,room_full:1,room_in_progress:1,invalid_title:1,room_rate_limit:1}).find(k=>String(error?.message||'').includes(k));const e=Error(messages[code]||({room_full:'다른 사람이 먼저 참여했어요.',room_in_progress:'참여 중인 대전방을 먼저 마무리해 주세요.',invalid_title:'방 제목을 1~40자로 입력해 주세요.',room_rate_limit:'잠시 후 다시 방을 만들어 주세요.'})[code]||'방에 연결하지 못했어요. 다시 시도해 주세요.');e.code=code;throw e;}
  return data;
}
function createPublicRoom(){
  modal('<h2>공개 맞고방 만들기</h2><form id="public-room-form"><label for="public-room-title">방 제목</label><input id="public-room-title" maxlength="40" required value="맞고 같이 한 판 해요" autocomplete="off"><p class="fine">방번호가 자동으로 붙고 오락실 채팅창에 게시돼요.</p><p id="public-room-error" role="status"></p><div class="row"><button class="btn gold" type="submit">방 만들고 기다리기</button><button class="btn ghost" type="button" id="cancel-public">취소</button></div></form>',{'cancel-public':()=>{}});
  const form=$('#public-room-form');let request=null,lastTitle='';
  form.onsubmit=async event=>{
    event.preventDefault();if(busy)return;
    const title=$('#public-room-title').value.trim();
    if(!title||[...title].length>40){$('#public-room-error').textContent='방 제목을 1~40자로 입력해 주세요.';return;}
    if(title!==lastTitle){request=crypto.randomUUID();lastTitle=title;}
    busy=true;form.querySelectorAll('button,input').forEach(el=>el.disabled=true);
    try{
      arcadeRoom=(await arcadeRpc('create',{p_kind:'matgo',p_title:title,p_options:{request_id:request}})).room;
      accept((await rpc({action:'online_read',room_id:arcadeRoom.match_id})).room);roomLabel();connection();
    }catch(error){if(form.isConnected)$('#public-room-error').textContent=error.message;}
    finally{busy=false;form.querySelectorAll('button,input').forEach(el=>el.disabled=false);}
  };
  $('#public-room-title').focus();$('#public-room-title').select();
}
async function joinPublicRoom(number){
  if(busy)return;busy=true;
  try{arcadeRoom=(await arcadeRpc('join',{p_room:Number(number),p_kind:'matgo'})).room;accept((await rpc({action:'online_read',room_id:arcadeRoom.match_id})).room);roomLabel();connection();}
  catch(error){if(error.code==='room_unavailable'&&/^[0-9]{8}$/.test(number)){busy=false;await enter('join',number);}else toast(error.message);}
  finally{busy=false;}
}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,3500);}
function closeDialog(){dialog?.remove();dialog=null;dialogKey='';}
function modal(html,handlers={},key='manual'){
  if(dialogKey===key)return;
  closeDialog();dialog=document.createElement('div');dialog.className='dialog';dialog.role='dialog';dialog.setAttribute('aria-modal','true');dialog.innerHTML='<section'+(key.startsWith('result:')?' class="result-card"':'')+'>'+html+'</section>';dialogKey=key;document.body.appendChild(dialog);
  for(const [id,handler] of Object.entries(handlers)){const el=dialog.querySelector('#'+id);if(el)el.onclick=()=>{if((key.startsWith('turn:')||key==='pick')&&(busy||pendingMove))return;closeDialog();handler();};}
  dialog.querySelector('button,input')?.focus({preventScroll:true});
}
function connection(text=''){$('#connection').hidden=!text;$('#connection').textContent=text;}
async function rpc(body){
  const {data,error}=await access.getClient().functions.invoke('matgo',{body});let code=data?.error;
  if(error){try{code=(await error.context.json()).error;}catch{}}
  if(error||code||!data?.ok){const e=Error(messages[code]||'연결을 확인하고 있어요. 잠시만 기다려 주세요.');e.code=code||'unavailable';throw e;}
  return data;
}
function setGold(gold){$('#money').textContent=number(gold)+'G';}
function clearEvents(){clearTimeout(eventTimer);eventQueue=[];showingEvent=false;$('#event').hidden=true;}
function eventText(ev){
  const mine=ev.p===room.seat,who=mine?'':'상대 ';
  if(ev.type==='ppuk'&&ev.firstPpuk)return [who+'첫뻑!',(mine?'+300':'-300')+'G · 판 종료 시 정산'];
  if(ev.type==='ppuk')return [who+'쌌다!',`이번 판 ${ev.count}/3회${ev.bonusCount?' · 보너스도 함께 묶였어요':''}`];
  if(ev.type==='ppukget')return [mine?(ev.self?'자뻑 먹기!':'뻑 먹기!'):'아이고!!',mine?`상대 피 ${ev.count}장 가져오기`:`상대가 쌓인 패와 내 피 ${ev.count}장을 가져갔어요`];
  if(ev.type==='shake')return [who+'흔들기!','이기면 점수 ×2',ev.cards];
  if(ev.type==='bomb')return [who+(ev.handCount===2?'두 장 폭탄!':'폭탄!'),'점수 ×2 · 폭탄 뒤집기 '+(ev.flips??2)+'회'];
  if(ev.type==='go')return [who+ev.n+'고!','다음 점수를 기다려요'];
  if(ev.type==='jjok')return [who+'쪽!','상대 피 한 장'];
  if(ev.type==='ttadak')return [who+'따닥!','상대 피 한 장'];
  if(ev.type==='sweep')return [who+'싹쓸이!','상대 피 한 장'];
  if(ev.type==='combo'&&ev.names?.length)return [who+ev.names.join(' · '),''];
  return null;
}
function showNextEvent(){
  if(showingEvent||!eventQueue.length||closed)return;
  const [head,sub,cards]=eventQueue.shift();showingEvent=true;
  $('#event').innerHTML=`<strong>${escape(head)}</strong><span>${escape(sub)}</span>${cards?'<div class="cards">'+cards.map(cardSVG).join('')+'</div>':''}`;$('#event').hidden=false;
  eventTimer=setTimeout(()=>{$('#event').hidden=true;showingEvent=false;showNextEvent();},head.includes('첫뻑')?1800:1000);
}
function accept(next){
  if(closed)return;
  if(next.status==='cancelled'&&next.reason==='solo'){closed=true;location.replace('./matgo.html?v=20261005-g-unit1');return;}
  if(room&&room.id===next.id&&next.version<room.version)return;
  const changed=room?.id!==next.id||room?.round!==next.round;
  if(changed){cursor=0;promptKey='';closeDialog();clearEvents();}
  if(next.status==='active'&&dialogKey.startsWith('result:'))closeDialog();
  const oldBots=room?.bots,autoCount=room?.autoCount??0;room=next;clockOffset=(next.serverTime||Date.now())-Date.now();
  if(!changed&&next.autoCount>autoCount&&next.lastAuto?.reason==='timeout')toast('15초가 지나 '+(next.lastAuto.p===next.seat?'내 패를':'상대 패를')+' 자동으로 냈어요.');
  if(oldBots&&next.bots?.some((v,p)=>v&&!oldBots[p]))toast('나간 자리는 PC가 이어서 치고 있어요.');
  for(const ev of next.events||[]){if(!changed&&ev.id<cursor)continue;const text=eventText(ev);if(text)eventQueue.push(text);}
  cursor=next.eventCount??0;showNextEvent();
  setGold(next.gold?.[next.seat]);renderRoom();
}
async function refresh(){
  if(busy||polling||closed||!room)return;
  const requestedRoom=room.id;
  polling=true;const retrying=!!pendingMove;if(retrying){busy=true;updateEnabled();}
  try{
    if(pendingMove){const data=await rpc(pendingMove);pendingMove=null;if(room?.id===requestedRoom)accept(data.room);}
    else {const fallback=room.status==='waiting'&&room.mode==='quick'&&room.quickDeadline<=Date.now()+clockOffset;const data=await rpc({action:fallback?'online_fallback':'online_read',room_id:requestedRoom,cursor});if(room?.id===requestedRoom)accept(data.room);}
    connection();
  }catch(error){
    if(['state_conflict','not_your_turn','room_unavailable'].includes(error.code)){pendingMove=null;connection();}
    else if(['adult_required','not_signed_in','banned'].includes(error.code)){deny(error);return;}
    else connection(error.message);
  }finally{polling=false;if(retrying)busy=false;updateEnabled();}
}
async function send(command){
  if(busy||pendingMove||!room||room.status!=='active'||room.bots[room.seat])return;
  busy=true;updateEnabled();
  pendingMove={action:'online_move',room_id:room.id,version:room.version,request_id:crypto.randomUUID(),command,cursor};
  try{const data=await rpc(pendingMove);pendingMove=null;accept(data.room);connection();}
  catch(error){
    if(error.code!=='unavailable'){pendingMove=null;toast(error.message);promptKey='';}
    else connection('연결을 다시 확인하고 있어요. 같은 요청은 한 번만 처리돼요.');
  }finally{busy=false;updateEnabled();if(!pendingMove)void refresh();}
}
async function enter(action,code){
  if(busy||closed)return;busy=true;$('#content').querySelectorAll('button').forEach(b=>b.disabled=true);
  try{accept((await rpc({action:'online_'+action,...(code?{code}:{})})).room);connection();}
  catch(error){toast(error.message);if(error.code==='gold_empty')await refill();else showLobby();}
  finally{busy=false;}
}
function showLobby(){
  arcadeRoom=null;roomLabel();
  $('#my-score').textContent='';$('#gukjin').hidden=true;viewKey='lobby';room=null;cursor=0;promptKey='';pendingMove=null;closeDialog();clearEvents();
  $('#content').innerHTML=`<section class="lobby"><div class="fan" aria-hidden="true">${[CARDS[0],CARDS[8],CARDS[28]].map(cardSVG).join('')}</div><div class="eyebrow">MEMBER MATCH</div><h2>함께 치는 맞고</h2><p>다른 회원과 한 판 어때요?<br>친구와는 방 코드를 나눠 입장하세요.</p><div class="actions"><button id="quick" class="btn gold"><span>빠른 대결</span><small>상대가 없으면 컴퓨터 대결 →</small></button><button id="create" class="btn ghost"><span>방 만들기</span><small>친구와 둘이서 →</small></button></div><form class="join" id="join-form"><input id="room-code" aria-label="방 코드" placeholder="방 코드 8자리" autocomplete="off" maxlength="8" pattern="[A-Fa-f0-9]{8}" required><button class="btn" id="join">입장</button></form><button id="solo" class="text-button">컴퓨터와 대결하기</button><p class="fine">만 19세 이상 · 1점 = 100G<br>차례마다 15초, 시간이 지나면 자동으로 쳐요.<br>상대가 나가면 PC가 이어서 진행해요.</p></section>`;
  $('#quick').onclick=()=>enter('quick');$('#create').onclick=createPublicRoom;
  const input=$('#room-code');input.setAttribute('aria-label','방번호 또는 초대 코드');input.placeholder='방번호 또는 초대 코드';input.maxLength=16;input.removeAttribute('pattern');
  $('#create small').textContent='제목을 정하고 공개하기 →';
  $('.lobby>p').innerHTML='오락실에 방을 만들고 함께 한 판 해요.<br>방번호를 입력해서도 참여할 수 있어요.';
  $('#join-form').onsubmit=e=>{e.preventDefault();const code=input.value.trim().replace(/^#/,'').toUpperCase();if(/^[0-9]{4,16}$/.test(code)&&Number.isSafeInteger(Number(code)))void joinPublicRoom(code);else if(/^[A-F0-9]{8}$/.test(code))void enter('join',code);else toast('방번호 또는 초대 코드 8자리를 입력해 주세요.');};
  $('#solo').onclick=()=>{closed=true;location.replace('./matgo.html?v=20261005-g-unit1');};
}
function caps(cards,own=false){
  const groups=[['광',cards.filter(c=>c.k==='gwang')],['열끗',cards.filter(c=>c.k==='yul'&&!c.asPi)],['띠',cards.filter(c=>c.k==='tti')],['피',cards.filter(isPi)]];
  return '<div class="caps'+(own?' caps-own':'')+'">'+groups.map(([name,cs],i)=>`<div class="cap" ${own?'role="button" tabindex="0" data-cap="'+i+'" aria-label="'+name+' '+cs.length+'장 크게 보기"':''}><span>${name} ${name==='피'?cs.reduce((a,c)=>a+piVal(c),0):cs.length}</span><div class="cap-cards" data-count="${cs.length}">${cs.map(cardSVG).join('')}</div></div>`).join('')+'</div>';
}
function fitCaps(){document.querySelectorAll('.cap-cards').forEach(el=>{const n=Number(el.dataset.count),own=el.closest('.caps-own');el.style.setProperty('--step',Math.max(1,Math.min(own?18:9,(el.clientWidth-(own?32:19))/Math.max(1,n-1)))+'px');});}
function updateEnabled(){
  $('#exit').disabled=busy;
  if(!room?.game)return;
  const playable=room.status==='active'&&!room.bots[room.seat]&&room.game.prompt?.type==='play'&&!busy&&!pendingMove;
  document.querySelectorAll('#hand button,#flip,#gukjin,#shake').forEach(b=>b.disabled=!playable);
  document.querySelectorAll('.stack.pick').forEach(b=>b.disabled=busy||!!pendingMove);
  if(dialog&&(dialogKey.startsWith('turn:')||dialogKey==='pick'))dialog.querySelectorAll('button').forEach(b=>b.disabled=busy||!!pendingMove);
}
function tick(){
  if(!room)return;
  const quick=$('#quick-seconds');if(quick)quick.textContent=Math.max(0,Math.ceil((room.quickDeadline-Date.now()-clockOffset)/1000))+'초';
  const el=$('#turn-seconds');if(el)el.textContent=Math.max(0,Math.ceil((Date.parse(room.deadline)-Date.now()-clockOffset)/1000))+'초';
}
function renderRoom(){
  if(!room)return;
  if(room.status==='waiting'){
    if(viewKey===room.id+':waiting')return;viewKey=room.id+':waiting';
    $('#content').innerHTML=`<section class="lobby waiting"><div class="orbit" aria-hidden="true"></div><h2>${room.mode==='quick'?'상대를 찾고 있어요':'상대를 기다리고 있어요'}</h2><p>${room.mode==='quick'?'5초 안에 상대가 없으면<br>컴퓨터와 바로 시작해요. <b id="quick-seconds"></b>':'상대가 입장하면 바로 시작해요.<br>이 코드를 친구에게 알려주세요.'}</p><strong class="code" id="invite-code">${escape(room.code)}</strong><div class="row"><button id="copy-code" class="btn gold">코드 복사</button><button id="cancel-wait" class="btn ghost">대기 취소</button></div><p class="fine">대결은 두 사람 모두 입장한 뒤 시작해요.</p></section>`;
    if(arcadeRoom){$('.waiting h2').textContent=arcadeRoom.title;$('.waiting>p').textContent='오락실 채팅창에 게시됐어요. 상대가 참여하면 시작해요.';$('#invite-code').textContent='#'+arcadeRoom.room_no;$('#copy-code').textContent='방번호 복사';roomLabel();}
    $('#copy-code').onclick=async()=>{const code=String(arcadeRoom?.room_no||room.code);try{await navigator.clipboard.writeText(code);toast(arcadeRoom?'방번호를 복사했어요.':'방 코드를 복사했어요.');}catch{toast('방번호 / 코드: '+code);}};$('#cancel-wait').onclick=()=>leave(false);return;
  }
  if(room.status==='cancelled'){
    if(viewKey===room.id+':cancelled')return;viewKey=room.id+':cancelled';closeDialog();clearEvents();
    $('#content').innerHTML='<section class="lobby waiting"><h2>대결이 종료됐어요</h2><p>진행 중인 판은 정산되지 않았어요.</p><button class="btn gold" id="back-lobby">대기방으로</button></section>';$('#back-lobby').onclick=()=>lobby();return;
  }
  const g=room.game;if(!g)return;
  const me=room.seat,op=1-me,pr=g.prompt,myTurn=pr?.p===me&&!room.bots[me],selecting=pr?.type==='choose';
  $('#my-score').textContent=score(g.caps[me]).pts+'점';
  $('#goldPending').textContent=!g.over&&g.firstPpukGold[me]?'첫뻑 '+signed(g.firstPpukGold[me])+'G · 판 종료 시 정산':'';
  const gc=g.caps[me].find(c=>c.tag==='gukjin');$('#gukjin').hidden=!gc;if(gc)$('#gukjin').textContent='구쌍피 → '+(gc.asPi?'그림(열끗)':'쌍피');
  const key=room.id+':'+room.version;
  if(viewKey!==key){
    if(dialogKey.startsWith('turn:')||dialogKey==='pick')closeDialog();
    const scroll=$('#hand')?.scrollLeft||0;viewKey=key;
    const label=p=>escape(room.names[p])+(room.bots[p]?' · PC 대행':'');
    const badge=p=>`${g.go[p]?'<span class="go">'+g.go[p]+'고</span>':''}${g.ppukCount[p]?'<span>뻑 '+g.ppukCount[p]+'/3</span>':''}<span class="pts">${score(g.caps[p]).pts}점</span>`;
    const text=g.over?'판이 끝났어요':room.bots[me]?'PC가 내 자리를 이어서 진행 중이에요':selecting?'가져올 바닥 패를 골라주세요':myTurn?'내 차례 · 낼 패를 고르세요':room.bots[op]?'PC가 패를 고르고 있어요':'상대 차례예요';
    const floorMonths=new Set(g.floor.map(s=>s.cards[0].m)),pairs=heldPairMonths(g.hand,g.caps);
    $('#content').innerHTML=`<section class="board"><div class="who"><b id="op-name">${label(op)}</b><span>손패 ${g.otherCount}장</span>${badge(op)}</div><div class="op-hand" aria-label="상대 손패 뒷면">${Array(g.otherCount).fill(backSVG).join('')}</div>${caps(g.caps[op])}<div class="felt"><div class="floor">${g.floor.map((stack,i)=>`<button class="stack${selecting&&pr.indices.includes(i)?' pick':''}" data-index="${i}" aria-label="${stack.cards[0].m}월 바닥 패 ${stack.cards.length}장" ${selecting&&pr.indices.includes(i)?'':'disabled'}>${stack.cards.map((c,j)=>`<span style="position:absolute;inset:0;transform:translate(${Math.min(3,j)*3}px,${-Math.min(3,j)*2}px) rotate(${j*2}deg)">${cardSVG(c)}</span>`).join('')}${stack.ppuk?`<span class="ppuk">뻑${stack.cards.some(c=>c.k==='bonus')?' + 보너스':''}</span>`:''}</button>`).join('')}</div><div class="deck">${backSVG}<small>${g.deckCount}장</small></div></div><div class="turn compact-turn${myTurn?' my':''}" aria-live="polite">${selecting?cardSVG(pr.card):''}<span id="turn-label">${text}</span>${!g.over?'<time id="turn-seconds"></time>':''}</div>${caps(g.caps[me],true)}<div class="hand-row"><div id="hand" class="hand">${[...g.hand].sort((a,b)=>a.m-b.m||a.id-b.id).map(c=>`<button data-card="${c.id}" aria-label="${c.k==='bonus'?'보너스':c.m+'월'} 패 내기${pairs.has(c.m)?' · 짝패, 나머지 두 장은 이미 먹은 패':''}" class="${floorMonths.has(c.m)?'match':''}">${cardSVG(c)}${pairs.has(c.m)?'<span class="pair-mark">짝</span>':''}</button>`).join('')}</div>${g.bomb[me]>0&&g.deckCount?'<button id="flip" class="btn gold flipper">폭탄 뒤집기<b>'+g.bomb[me]+'회</b></button>':''}</div></section>`;
    $('#hand').scrollLeft=scroll;
    $('#hand').querySelectorAll('button').forEach(b=>b.onclick=()=>pick(Number(b.dataset.card)));
    document.querySelectorAll('.stack.pick').forEach(b=>b.onclick=()=>send({type:'choose',index:Number(b.dataset.index)}));
    if($('#flip'))$('#flip').onclick=()=>send({type:'play',card:null});
    if($('#gukjin'))$('#gukjin').onclick=()=>send({type:'gukjin'});
    document.querySelectorAll('.caps-own .cap').forEach((el,i)=>{const show=()=>{if(busy||room.game.prompt?.type!=='play')return;const cards=g.caps[me].filter([c=>c.k==='gwang',c=>c.k==='yul'&&!c.asPi,c=>c.k==='tti',isPi][i]);if(!cards.length)return;modal('<h2>내가 먹은 패</h2><div class="captured-expanded">'+cards.map(cardSVG).join('')+'</div><button id="captured-close" class="btn">닫기</button>',{'captured-close':()=>{promptKey='';renderRoom();}},'turn:captured');};el.onclick=show;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show();}};});
    fitCaps();
  }
  updateEnabled();tick();
  if(room.status==='finished'){showResult();return;}
  const pk=room.id+':'+room.version+':'+pr?.type;
  if(myTurn&&['chongtong','gostop','gukjin'].includes(pr?.type)&&promptKey!==pk){
    promptKey=pk;
    if(pr.type==='gukjin')modal(`<h2>구쌍피를 먹었어요</h2><p>어느 쪽으로 사용할까요?<br>차례의 15초가 지나면 자동으로 선택해요.</p><div class="cards">${cardSVG(pr.card)}</div><div class="row"><button id="gukjin-yul" class="btn ghost">그림(열끗)</button><button id="gukjin-pi" class="btn gold">쌍피(피 2장)</button></div>`,{'gukjin-yul':()=>send({type:'gukjin',choice:'yul'}),'gukjin-pi':()=>send({type:'gukjin',choice:'pi'})},'turn:'+pk);
    else if(pr.type==='chongtong')modal(`<h2>총통!</h2><p>같은 월 네 장이 모였어요.<br>7점으로 이기거나 계속할 수 있어요.</p><div class="cards">${g.hand.filter(c=>c.m===pr.months[0]).map(cardSVG).join('')}</div><div class="row"><button id="chongtong-win" class="btn gold">7점으로 승리</button><button id="chongtong-continue" class="btn ghost">계속하기</button></div>`,{'chongtong-win':()=>send({type:'chongtong',decision:'win'}),'chongtong-continue':()=>send({type:'chongtong',decision:'continue'})},'turn:'+pk);
    else modal(`<h2>${pr.points}점!</h2><p>고를 부른 뒤 상대가 이기면 고박이에요.<br>15초가 지나면 자동으로 선택해요.</p><div class="row"><button id="go" class="btn gold">고!</button><button id="stop" class="btn ghost">스톱</button></div>`,{go:()=>send({type:'gostop',decision:'go'}),stop:()=>send({type:'gostop',decision:'stop'})},'turn:'+pk);
  }
}
function pick(id){
  if(busy||!room||room.game.prompt?.type!=='play')return;
  const g=room.game,card=g.hand.find(c=>c.id===id);if(!card)return;
  const same=g.hand.filter(c=>c.m===card.m),matches=g.floor.filter(s=>s.cards[0].m===card.m);
  if([2,3].includes(same.length)&&!matches.some(s=>s.ppuk)&&matches.reduce((n,s)=>n+s.cards.length,0)===4-same.length){
    modal(`<h2>${same.length===2?'두 장 폭탄!':'폭탄!'}</h2><p>손패 ${same.length}장과 바닥 ${4-same.length}장을 함께 먹고 점수 ×2,<br>폭탄 뒤집기 ${same.length-1}회를 받아요.</p><div class="row"><button id="bomb" class="btn gold">폭탄 던지기</button><button id="single" class="btn ghost">한 장만</button></div>`,{bomb:()=>send({type:'play',card:id,bomb:same.filter(c=>c.id!==id).map(c=>c.id)}),single:()=>send({type:'play',card:id})},'pick');
  }else if(same.length>=3&&!g.shake[room.seat]){
    modal('<h2>흔들기?</h2><p>상대에게 세 장을 보여주고,<br>이겼을 때 점수 ×2를 받아요.</p><div class="row"><button id="shake" class="btn gold">흔들기</button><button id="single" class="btn ghost">그냥 내기</button></div>',{shake:()=>send({type:'shake',month:card.m}),single:()=>send({type:'play',card:id})},'pick');
  }else void send({type:'play',card:id});
}
function showResult(){
  const me=room.seat,r=room.result,key='result:'+room.id+':'+room.version;
  if(dialogKey===key)return;
  clearTimeout(toast.timer);$('#toast').hidden=true;
  const delta=r.paidDelta[me],draw=r.type==='nagari',won=r.winner===me;
  const canRematch=!room.departed.some(Boolean)&&room.gold.every(g=>g>0);
  modal(`<div class="result-details"><h2>${draw?'나가리':won?'내가 이겼어요!':'상대가 이겼어요'}</h2><div class="big${delta<0?' negative':''}"><span class="gold-amount">${signed(delta)}</span><small class="gold-unit">G</small></div>${r.det?'<table class="sc">'+r.det.map(([label,value])=>'<tr><td>'+escape(label)+'</td><td>'+escape(value)+(typeof value==='number'?'점':'')+'</td></tr>').join('')+'<tr><td><b>합계</b></td><td><b>'+r.total+'점</b></td></tr></table>':''}${draw?'<p>다음 판은 점수 ×'+r.nextCarry+'</p>':''}${r.firstPpukGold[me]?'<div class="gold-breakdown"><div><span>첫뻑 정산</span> <strong>'+signed(r.firstPpukGold[me])+'G</strong></div></div>':''}<p class="result-balance">내 골드 <strong>${number(room.gold[me])}</strong></p>${room.departed[me]?'<p class="result-note">중간에 나간 사람은 보상을 받지 않아요.</p>':''}<p class="result-note">정산은 상대의 보유 골드 한도 안에서 이뤄져요.</p></div><div class="row result-actions">${canRematch?'<button class="btn gold" id="rematch" '+(room.ready[me]?'disabled':'')+'>'+(room.ready[me]?'상대 준비 기다리는 중':room.ready[1-me]?'상대 준비 완료 · 다음 판':'한 판 더')+'</button>':''}<button class="btn ghost" id="result-lobby">대기방으로</button><button class="btn ghost" id="result-exit">나가기</button></div>`,{rematch:()=>ready(),'result-lobby':()=>leave(false),'result-exit':()=>leave(true)},key);
}
async function ready(){if(busy)return;busy=true;try{accept((await rpc({action:'online_ready',room_id:room.id,cursor:0})).room);}catch(e){toast(e.message);}finally{busy=false;updateEnabled();}}
async function leave(close){
  if(busy)return;busy=true;
  try{
    if(room){await rpc({action:'online_leave',room_id:room.id,cursor});room=null;}
    if(close){closed=true;closeApp();}else await lobby();
  }catch(e){toast('나가기를 완료하지 못했어요. 다시 눌러 주세요.');}
  finally{busy=false;}
}
function closeApp(){if(window.parent!==window)window.parent.postMessage({type:'ojjuda:matgo:close'},location.origin);else location.href='../world.html';}
function requestExit(close=true){
  if(room?.status==='active'&&!room.departed[room.seat])modal('<h2>대결에서 나갈까요?</h2><p>PC가 내 자리를 이어서 쳐요.<br>중간에 나가면 이겨도 골드를 받지 못해요.<br>패배 금액은 판이 끝난 뒤 정산돼요.</p><div class="row"><button id="stay" class="btn gold">계속하기</button><button id="leave" class="btn ghost">나가기</button></div>',{stay:()=>{promptKey='';renderRoom();},leave:()=>leave(close)});
  else void leave(close);
}
async function lobby(){const state=await wallet.status();setGold(state.gold);showLobby();}
async function refill(){
  if(room?.status==='active'||room?.status==='waiting'){toast('대결을 마친 뒤 충전할 수 있어요.');return;}
  try{
    const state=await wallet.status();setGold(state.gold);const paid=state.free_left===0;
    modal(`<h2>골드 충전</h2><p>보유 ${number(state.gold)}G · ${state.coins}쭈<br>오늘 무료 리필 ${state.free_left}회 남음<br>${state.gold===0?(paid?'5쭈로 5,000G를 충전해요.':'무료로 5,000G를 리필해요.'):'골드가 0일 때 충전할 수 있어요.'}</p><div class="row">${state.gold===0?'<button id="refill" class="btn gold">'+(paid?'5쭈 사용 · 5,000G':'무료 5,000G 리필')+'</button>':''}<button id="close-refill" class="btn ghost">닫기</button></div>`,{refill:async()=>{try{const s=await wallet.refill(paid);setGold(s.gold);toast('5,000G를 충전했어요.');}catch(e){toast(e.message);}},'close-refill':()=>{}});
  }catch(e){toast(e.message);}
}
function deny(error){closed=true;clearInterval(pollTimer);clearInterval(accessTimer);closeDialog();clearEvents();$('#app').hidden=true;$('#gate').hidden=false;$('#gate-message').textContent=error.message;$('#retry').hidden=false;}
// Cache only the current session token for a best-effort authenticated pagehide
// notification. A dropped connection is also detected by server heartbeats.
async function refreshToken(){try{token=(await access.getClient().auth.getSession()).data?.session?.access_token||null;}catch{}}
function departing(){
  if(closed||!room||!['waiting','active'].includes(room.status)||!token)return;
  const cfg=window.OJJUDA_CONFIG;
  if(cfg?.supabaseUrl&&cfg.supabaseKey)fetch(cfg.supabaseUrl+'/functions/v1/matgo',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json',apikey:cfg.supabaseKey,authorization:'Bearer '+token},body:JSON.stringify({action:'online_leave',room_id:room.id})}).catch(()=>{});
}
$('#retry').onclick=()=>location.reload();
try{
  if(!access)throw Error('맞고를 불러오지 못했어요. 새로고침해 주세요.');
  await access.check();wallet=createWallet(access);const state=await wallet.status();
  $('#gate').hidden=true;$('#app').hidden=false;setGold(state.gold);showLobby();
  document.querySelectorAll('.menu-options button').forEach(b=>b.addEventListener('click',()=>document.querySelector('.game-menu').open=false));
  $('#money').onclick=()=>refill();$('#exit').onclick=()=>requestExit();
  $('#rules').onclick=()=>modal('<h2>회원 대결 규칙</h2><p class="rules-copy">한 차례는 15초예요. 시간이 지나면 패·선택·고/스톱을 자동으로 처리해요. 상대가 나가면 PC가 남은 판을 이어서 쳐요.<br><br>7점부터 고/스톱 · 1점 100G · 피박·광박·멍박·고박·흔들기·폭탄 배수를 적용해요.<br>자뻑을 먹으면 상대 피 2장, 상대 뻑은 1장을 가져와요. 보너스는 표시된 피 점수만 얻고 상대 피를 가져오지 않아요. 뻑에 묶인 보너스도 추가 피를 가져오지 않아요.<br>손패 2장 + 바닥 2장은 두 장 폭탄으로 뒤집기 1회, 손패 3장 + 바닥 1장은 뒤집기 2회를 받아요.<br>구쌍피를 먹으면 그림(열끗) 또는 쌍피(피 2장)를 선택해요.<br>총통은 7점 승리 또는 계속 선택 · 한 판 뻑 3회는 7점 승리, 상대가 고를 했다면 고박 ×2예요.<br>첫뻑은 300G. 첫뻑을 포함한 모든 골드는 판이 끝난 뒤 한 번에 정산해요. 상대 보유 골드보다 많이 가져올 수 없어요.<br><br>중간에 나간 사람은 승리 보상을 받지 못해요. 패배 금액은 판 종료 시 정산해요.<br>처음 5,000G · 0G일 때 하루 2회 무료 리필, 이후 5쭈로 5,000G 충전.</p><p class="credit">화투: Marcus Richert · 원도안 Louie Mantia Jr.<br><a href="https://www.marcusrichert.com/images/hwatu/" target="_blank" rel="noopener">원본</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a> · 크기 조정·WebP 변환</p><button class="btn" id="close-rules">닫기</button>',{'close-rules':()=>{promptKey='';renderRoom();}});
  access.subscribe(deny);
  accessTimer=setInterval(()=>{access.check().then(refreshToken).catch(deny);},45000);
  pollTimer=setInterval(()=>{void refresh();},1200);setInterval(tick,250);void refreshToken();
  window.addEventListener('resize',fitCaps);
  window.addEventListener('pagehide',departing);
  window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
  window.addEventListener('keydown',e=>{if(e.key==='Escape')requestExit();});
  window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===window.parent&&e.data?.type==='ojjuda:matgo:request-close')requestExit();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){void access.check().then(()=>refresh()).catch(deny);}});
  if(window.parent!==window)window.parent.postMessage({type:'ojjuda:matgo:online-ready'},location.origin);
  const requested=entryParams.get('room_id');
  const resume=/^[0-9a-f-]{36}$/i.test(requested||'')?requested:state.online_room;
  if(resume){try{
    if(typeof access.getClient().rpc==='function'){try{const listed=await arcadeRpc('list');if(listed.mine?.match_id===resume)arcadeRoom=listed.mine;}catch{}}
    accept((await rpc({action:'online_read',room_id:resume})).room);roomLabel();
  }catch(e){toast(e.message);}}
}catch(error){deny(error);}
