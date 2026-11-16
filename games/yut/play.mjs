import {TEAMS,HOME,FINISH,YUT,newGame,position,moves,nodeName,act} from './rules.mjs?v=1';
import {createBoard} from './board.mjs?v=1';
import {openRoom} from './room.mjs?v=1';

const $=id=>document.getElementById(id), board=createBoard($('board'));
const dialog=$('sheet'), body=$('dialog-body'), reduced=matchMedia('(prefers-reduced-motion: reduce)');
let local=newGame(), shown=null, net=null, room=null, pendingRoom=false, attempt=0, busy=false, motion=0, panel='',game=local;
function element(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
function button(text,cls,fn,disabled=false){const b=element('button',text,cls);b.type='button';b.disabled=disabled;b.onclick=fn;return b;}
function dot(t){const badge=element('span',TEAMS[t].mark,'team-dot');badge.setAttribute('aria-hidden','true');badge.style.setProperty('--team',TEAMS[t].color);return badge;}
const layer=(s)=>s.pawns.flatMap((team,t)=>team.flatMap((trail,i)=>{
  const node=position(trail);return node===HOME||node===FINISH?[]:[{team:t,index:i,node}];
}));
function draw(s,override){board.setState({pieces:override??layer(s),activeTeam:s.team});}
function score(s){
  const rows=s.pawns.map((team,t)=>{
    const row=element('div',undefined,'score-card'+(t===s.team?' active':''));
    const top=element('div',undefined,'score-top');
    top.append(dot(t),document.createTextNode(TEAMS[t].name+' 팀'),element('small','골인 '+team.filter(p=>position(p)===FINISH).length+'/2'));
    row.append(top,element('div',team.map((p,i)=>(i+1)+'번 '+nodeName(position(p))).join('  ·  '),'pawns'));return row;
  });$('scoreboard').replaceChildren(...rows);
}
function sticks(s){
  const faces=s.sticks||[0,1,0,1];
  $('sticks').replaceChildren(...faces.map((face,i)=>{const el=element('i',undefined,'stick'+(face?'':' back'));el.style.setProperty('--r',['-17deg','-6deg','9deg','17deg'][i]);el.style.setProperty('--d',i*22+'ms');return el;}));
  $('sticks').setAttribute('aria-label',s.sticks?'평평한 면 '+faces.filter(Boolean).length+'개':'윷가락 네 개');
  $('outcome').textContent=s.sticks?YUT[s.steps]+' · '+s.steps+'칸':'첫 윷을 던져 볼까요?';
}
const delay=ms=>new Promise(done=>setTimeout(done,ms));
async function showState(s,animate=true){
  if(shown===s)return;
  const previous=shown;shown=s;game=s;const token=++motion;
  const changed=animate&&previous&&previous.revision+1===s.revision&&!reduced.matches;
  busy=!!changed;renderHUD();score(s);sticks(s);
  $('sticks').classList.remove('casting');
  if(changed&&s.phase==='move'){
    draw(s);void $('sticks').offsetWidth;$('sticks').classList.add('casting');
    await delay(650);
  }else if(changed&&previous.phase==='move'&&s.lastMove){
    const {team,indices,frames}=s.lastMove,base=layer(previous).filter(p=>p.team!==team||!indices.includes(p.index));
    for(const node of frames){
      if(token!==motion)return;
      draw(s,[...base,...(node===HOME||node===FINISH?[]:indices.map(index=>({team,index,node})))]);await delay(185);
    }
  }
  if(token!==motion)return;
  busy=false;draw(s);renderHUD();
}
function dispatch(action){
  if(busy||pendingRoom)return;
  if(net){if(net.seat===game.team&&net.connected)room?.action(action);}
  else{local=act(local,action);void showState(local);}
}
function renderHUD(){
  const s=game,lobby=net&&!net.game,team=s.team;
  $('map-mode').textContent=net?'온라인 · '+net.seats.length+'팀':'한 기기 · '+s.pawns.length+'팀';
  $('turn-no').textContent=lobby?'대기실':s.turn+'번째 차례';
  $('team-title').replaceChildren(...(lobby?[document.createTextNode('친구 모으기')]:[dot(team),document.createTextNode(TEAMS[team].name+' 팀'+(s.phase==='won'?' 승리!':''))]));
  $('note').textContent=lobby?(net.status||'초대 링크로 친구를 불러 주세요.'):(net?.status||s.note);
  const actions=$('actions');actions.replaceChildren();
  if(lobby){actions.append(button('온라인 대기실','primary',lobbyPanel));return;}
  if(s.phase==='won'){actions.append(button(net?'게임 설정':'다시 한 판','primary',()=>net?settings():resetLocal(s.pawns.length)));return;}
  const other=net&&net.seat!==team,disabled=busy||pendingRoom||!!(net&&!net.connected)||!!other;
  if(s.phase==='roll'){actions.append(button(other?TEAMS[team].name+' 팀 차례':'윷 던지기','primary',()=>dispatch({type:'roll'}),disabled));return;}
  const options=moves(s);
  for(const m of options){
    const current=position(s.pawns[team][m.index]);
    const stacked=current!==HOME&&s.pawns[team].every(p=>position(p)===current);
    const branches=options.some(o=>o.index===m.index&&o.shortcut!==m.shortcut);
    let label=stacked?'업힌 두 말':(m.index+1)+'번 말';
    label+=current===HOME?' 출발':branches?(m.shortcut?' · 지름길':' · 원래 길'):' 이동';
    const b=button(label,'choice',()=>dispatch({type:'move',index:m.index,shortcut:m.shortcut}),disabled);
    b.append(element('small','→ '+nodeName(m.to)));actions.append(b);
  }
}
function openPanel(title,name){
  panel=name;$('dialog-title').textContent=title;body.replaceChildren();if(!dialog.open)dialog.showModal();
}
function closePanel(){if(dialog.open)dialog.close();}
function message(text){const el=element('p',text,'message');el.setAttribute('role','status');return el;}
function rules(){
  openPanel('놀이 방법','help');
  const list=element('ol');
  ['팀마다 말이 두 개예요. 도·개·걸·윷·모가 나오면 1·2·3·4·5칸을 가요. 네 가락 중 평평한 면이 하나도 없으면 모예요.',
   '오른쪽 위나 왼쪽 위 모서리에 멈추면 다음 이동 때 지름길을 고를 수 있어요. 가운데 칸에서도 골인 쪽 길을 고를 수 있어요.',
   '같은 팀 말은 업어서 함께 가요. 상대 말을 잡으면 그 말은 대기로 돌아가요. 윷·모를 내거나 말을 잡으면 한 번 더 던져요.',
   '딱 멈춘 칸에서만 장애물이 작동해요. 바위턱은 한 칸, 소용돌이는 두 칸 뒤로 밀어요. 순풍은 두 칸 앞으로 보내요. 한 번 움직일 때 효과는 한 번만 받아요.',
   '출발점에 돌아와 한 칸 더 지나면 골인이에요. 두 말을 먼저 골인시키세요.'].forEach(t=>list.append(element('li',t)));
  body.append(list,button('알겠어요','primary',closePanel));
}
function resetLocal(count){
  closePanel();local=newGame(count);void showState(local,false);
}
function settings(){
  if(pendingRoom)return;
  openPanel('게임 설정','settings');
  if(net){
    body.append(message(net.game?'온라인 윷놀이를 진행 중이에요.':'친구들과 모이는 중이에요.'),
      button('온라인 대기실','secondary',lobbyPanel),
      button('방 나가기','secondary',()=>confirmPanel('온라인 방 나가기',net.isHost?'방장이 나가면 방이 닫혀요.':'현재 방에서 나갈까요?',()=>leaveRoom())));
    return;
  }
  const label=element('label','한 기기에서 함께할 팀 수');label.htmlFor='team-count';
  const select=element('select');select.id='team-count';
  [2,3,4].forEach(n=>{const o=element('option',n+'팀');o.value=n;o.selected=n===local.pawns.length;select.append(o);});
  const actions=element('div',undefined,'form-actions');actions.append(
    button('한 기기에서 새로 시작','primary',()=>{
      const n=Number(select.value);if(local.revision&&local.phase!=='won')confirmPanel('새 판을 시작할까요?','지금 진행 중인 한 기기 게임이 종료돼요.',()=>resetLocal(n));else resetLocal(n);
    }),button('친구 초대방 만들기','secondary',()=>connect(null)));
  body.append(label,select,actions,message('초대방에서는 각자 기기로 접속해요. 방장은 게임이 끝날 때까지 방을 열어 두세요.'));
}
function confirmPanel(title,copy,yes){
  openPanel(title,'confirm');const wrap=element('div',undefined,'form-actions');wrap.append(button('계속하기','primary',yes),button('취소','secondary',closePanel));body.append(message(copy),wrap);
}
function inviteUrl(){const u=new URL(location.href);u.hash='room='+net.host;return u.href;}
function lobbyPanel(){
  if(!net)return;
  openPanel('온라인 대기실','lobby');
  const seat=net.seat<0?'자리 확인 중':TEAMS[net.seat].name+' 팀';
  const summary=message('현재 '+net.seats.length+'/4팀 · 내 자리 '+seat);
  body.append(summary);
  if(net.isHost&&!net.game){
    const label=element('label','친구 초대 링크');label.htmlFor='invite';const link=element('input');link.id='invite';link.readOnly=true;link.value=inviteUrl();
    const actions=element('div',undefined,'form-actions');const copy=button('초대 링크 복사','secondary',async()=>{
      try{await navigator.clipboard.writeText(link.value);copy.textContent='복사했어요';}catch{link.select();copy.textContent='선택된 링크를 복사해 주세요';}
    });actions.append(copy,button('모인 팀으로 시작','primary',()=>{room?.start();if(net?.game)closePanel();},net.seats.length<2||!net.connected));
    body.append(label,link,actions);
  }else if(net.game)body.append(button('게임 보기','primary',closePanel));
  else body.append(message('방장이 게임을 시작하면 윷판이 열려요.'));
  if(net.status)body.append(message(net.status));
  body.append(button('방 나가기','secondary',()=>confirmPanel('방 나가기',net.isHost?'이 방의 게임을 끝낼까요?':'초대방에서 나갈까요?',()=>leaveRoom())));
}
let lastLobby='';
function networkUpdate(v){
  net=v;
  const signature=JSON.stringify([v.seats,v.status,!!v.game,v.seat,v.connected]);
  if(v.game&&(!shown||!roomGame||v.game.revision!==game.revision)){const first=!roomGame;roomGame=true;void showState(v.game,!first);if(first&&panel==='lobby')closePanel();}
  if(signature!==lastLobby){lastLobby=signature;if(panel==='lobby'&&dialog.open)lobbyPanel();}
  renderHUD();
}
let roomGame=false;
async function connect(host){
  if(pendingRoom||room)return;
  const id=++attempt;pendingRoom=true;openPanel('온라인 방 연결','loading');body.append(message('잠시만요. 방을 연결하고 있어요.'));
  try{
    const active=await openRoom(host,v=>{if(id===attempt)networkUpdate(v);});
    if(id!==attempt){await active.close();return;}
    room=active;pendingRoom=false;
    history.replaceState(null,'',inviteUrl());if(net.game)closePanel();else lobbyPanel();
  }catch(err){
    if(id!==attempt)return;
    pendingRoom=false;net=null;roomGame=false;renderHUD();openPanel('방 연결을 확인해 주세요','error');body.append(message(err.message||'온라인 연결이 어려워요.'),
      button('다시 연결','primary',()=>connect(host)),button('한 기기에서 하기','secondary',()=>leaveRoom()));
  }
}
async function leaveRoom(){
  ++attempt;pendingRoom=false;const old=room;room=null;net=null;roomGame=false;lastLobby='';history.replaceState(null,'',location.pathname+location.search);closePanel();void showState(local,false);renderHUD();
  if(old)await old.close().catch(()=>{});
}
$('rotate').onclick=()=>board.rotate(1);$('settings').onclick=settings;$('help').onclick=rules;$('close').onclick=closePanel;
dialog.addEventListener('close',()=>{panel='';});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePanel();}});
void showState(local,false);
const invite=new URLSearchParams(location.hash.slice(1));if(invite.has('room'))void connect(invite.get('room'));
