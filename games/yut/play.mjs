import {TEAMS,HOME,FINISH,YUT,newGame,position,moves,nodeName,act,lastThrowSeed} from './rules.mjs?v=3';
import {createBoard} from './board.mjs?v=6';
import {createToss,drawRack} from './toss.mjs?v=6';
import {openRoom} from './room.mjs?v=3';
import {ANIMALS,animalFor,drawZodiac} from './zodiac.mjs?v=1';

const $=id=>document.getElementById(id), board=createBoard($('board'),chooseTile,choosePawn,dropPawn), toss=createToss($('toss-canvas'));
const dialog=$('sheet'), body=$('dialog-body'), reduced=matchMedia('(prefers-reduced-motion: reduce)');
let local=newGame(), shown=null, net=null, room=null, pendingRoom=false, attempt=0, busy=false, motion=0, panel='',game=local;
let casting=false,selectedPawn=null,placement=null;
const rack=$('rack-canvas'),rackContext=rack.getContext('2d');
let rackFaces=null,rackSeed=null,paintedFaces='',roomOffset=2;
function paintRack(){
  if(!rackContext)return;
  const rect=rack.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2);
  const w=Math.round(rect.width*ratio),h=Math.round(rect.height*ratio);
  if(!w||!h)return;
  const key=rackFaces?rackFaces.join('')+'-'+rackSeed:'ready';
  if(w===rack.width&&h===rack.height&&key===paintedFaces)return;
  if(w!==rack.width)rack.width=w;
  if(h!==rack.height)rack.height=h;
  drawRack(rackContext,w,h,rackFaces,rackSeed);
  paintedFaces=key;
}
if(typeof ResizeObserver==='function')new ResizeObserver(paintRack).observe(rack);
else window.addEventListener('resize',paintRack);
function element(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
function button(text,cls,fn,disabled=false){const b=element('button',text,cls);b.type='button';b.disabled=disabled;b.onclick=fn;return b;}
function dot(t){const badge=element('span',TEAMS[t].mark,'team-dot');badge.setAttribute('aria-hidden','true');badge.style.setProperty('--team',TEAMS[t].color);return badge;}
function pieceName(s,team,index){
  return (index+1)+'번 말 · '+ANIMALS[animalFor(team,index,s.zodiacOffset)];
}
function animalIcon(team,index,offset){
  const canvas=element('canvas',undefined,'animal-icon');
  canvas.width=100;canvas.height=88;canvas.setAttribute('aria-hidden','true');
  const ctx=canvas.getContext('2d');
  const project=([x,y,z])=>[50+(x*.966+z*.259)*58,73+(-x*.259+z*.966)*30-y*50];
  if(ctx)drawZodiac(ctx,project,0,0,0,1,animalFor(team,index,offset),TEAMS[team].color,index);
  return canvas;
}
const layer=(s)=>s.pawns.flatMap((team,t)=>team.flatMap((trail,i)=>{
  const node=position(trail);return node===HOME||node===FINISH?[]:[{team:t,index:i,node}];
}));
function draw(s,override,snap=false){
  const pieces=override??layer(s);
  const waiting=s.pawns.flatMap((team,t)=>team.flatMap((trail,i)=>
    position(trail)===HOME&&!pieces.some(p=>p.team===t&&p.index===i)?[{team:t,index:i}]:[]));
  const withAnimal=p=>({...p,animal:animalFor(p.team,p.index,s.zodiacOffset)});
  board.setState({pieces:pieces.map(withAnimal),activeTeam:s.team,waiting:waiting.map(withAnimal),snap});
}
function standings(){
  openPanel('말 현황','scores');const s=game;
  const rows=s.pawns.map((team,t)=>{
    const row=element('div',undefined,'score-card'+(t===s.team?' active':''));
    const top=element('div',undefined,'score-top');
    top.append(dot(t),document.createTextNode(TEAMS[t].name+' 팀'),element('small','골인 '+team.filter(p=>position(p)===FINISH).length+'/2'));
    const pawns=element('div',undefined,'score-pieces');
    team.forEach((trail,i)=>{
      const info=element('span',undefined,'score-piece'),copy=element('span');
      copy.append(element('b',pieceName(s,t,i)),element('small',nodeName(position(trail))));
      info.append(animalIcon(t,i,s.zodiacOffset),copy);pawns.append(info);
    });
    row.append(top,pawns);return row;
  });const scoreboard=element('div',undefined,'scoreboard');scoreboard.append(...rows);body.append(scoreboard);
}
const delay=ms=>new Promise(done=>setTimeout(done,ms));
const targetTile=m=>m.to===FINISH?0:m.to;
function canMovePiece(){
  return game.phase==='move'&&!busy&&!pendingRoom&&!dialog.open&&
    (!net||!!(room&&net.game&&net.connected&&net.seat===game.team));
}
function choosePawn(index){
  if(!canMovePiece()||!moves(game).some(m=>m.index===index))return;
  selectedPawn=index;
  renderHUD();
}
function place(move){
  placement={state:game,move};
  dispatch({type:'move',index:move.index,shortcut:move.shortcut});
}
function dropPawn(index,tile){
  if(!canMovePiece())return;
  const move=moves(game).find(m=>m.index===index&&targetTile(m)===tile);
  if(move)place(move);
}
function chooseTile(tile){
  if(!canMovePiece())return;
  const picks=moves(game).filter(m=>targetTile(m)===tile&&(selectedPawn===null||m.index===selectedPawn));
  if(picks.length===1)place(picks[0]);
  else if(picks.length>1)moveChoices(picks);
}
function result(s){return s.sticks?YUT[s.steps]+' · '+s.steps+'칸':'';}
function reveal(s){
  rackFaces=s.sticks??null;
  rackSeed=lastThrowSeed(s);
  $('outcome').textContent=result(s);
  $('rack-title').textContent=rackFaces?'던진 윷':'던질 윷';
  rack.setAttribute('aria-label',rackFaces?'던진 윷 네 가락 · '+result(s):'던질 윷 네 가락');
  paintRack();
}
async function showState(s,animate=true){
  if(shown===s)return;
  const previous=shown;shown=s;game=s;const token=++motion;
  const placed=placement?.state===previous?placement.move:null;
  placement=null;selectedPawn=null;
  toss.cancel();$('toss-layer').hidden=true;
  if(panel==='moves')closePanel();
  const changed=animate&&previous&&previous.revision+1===s.revision&&!reduced.matches;
  casting=!!(changed&&s.phase==='move');busy=!!changed;
  if(casting)$('outcome').textContent='';else reveal(s);
  renderHUD();
  if(panel==='scores'&&dialog.open)standings();
  if(casting){
    draw(s);
    $('toss-label').textContent=TEAMS[s.team].name+' 팀 · 윷 던지기';
    $('toss-layer').hidden=false;
    await toss.play(s.sticks,lastThrowSeed(s),()=>{
      if(motion!==token)return;
      $('toss-label').textContent=result(s);reveal(s);
    });
  }else if(changed&&previous.phase==='move'&&s.lastMove){
    const {team,indices,frames}=s.lastMove,base=layer(previous).filter(p=>p.team!==team||!indices.includes(p.index));
    const dropAt=placed&&team===previous.team&&indices.includes(placed.index)?frames.indexOf(placed.to):-1;
    const remaining=dropAt<0?frames:frames.slice(dropAt+1);
    const movingAt=node=>[...base,...(node===HOME||node===FINISH?[]:indices.map(index=>({team,index,node})))];
    if(dropAt>=0){
      if(remaining.length){draw(s,movingAt(placed.to),true);await delay(170);}
      else draw(s,undefined,true);
    }
    for(const node of remaining){
      if(token!==motion)return;
      draw(s,movingAt(node));await delay(235);
    }
  }
  if(token!==motion)return;
  casting=false;busy=false;$('toss-layer').hidden=true;reveal(s);draw(s);renderHUD();
}
function dispatch(action){
  if(busy||pendingRoom)return;
  if(net){if(net.seat===game.team&&net.connected)room?.action(action);}
  else{local=act(local,action);void showState(local);}
}
function renderHUD(){
  const s=game,lobby=net&&!net.game,team=s.team;
  $('team-title').replaceChildren(...(lobby?[document.createTextNode('온라인 대기실')]:
    [dot(team),document.createTextNode(TEAMS[team].name+' 팀'+(s.phase==='won'?' 승리!':' 차례'))]));
  $('goals').textContent=lobby?'':'골인 '+s.pawns[team].filter(p=>position(p)===FINISH).length+'/2';
  $('note').textContent=lobby?(net.status||'초대 링크로 친구를 불러 주세요.'):
    (net?.status||(casting?'윷가락이 멈추기를 기다려요.':s.note));
  const actions=$('actions');actions.replaceChildren();
  const options=canMovePiece()?moves(s):[];
  board.setMoves(options.map(m=>({team,index:m.index,from:position(s.pawns[team][m.index]),to:targetTile(m)})),selectedPawn);
  if(lobby){actions.append(button('대기실 열기','primary',lobbyPanel));return;}
  if(s.phase==='won'){actions.append(button(net?'게임 메뉴':'다시 한 판','primary',()=>net?settings():resetLocal(s.pawns.length)));return;}
  const other=net&&net.seat!==team,disabled=busy||pendingRoom||!!(net&&!net.connected)||!!other;
  if(casting||busy||s.phase==='roll'||other){
    const label=casting?'윷 던지는 중…':busy?'말 이동 중…':other?'상대 팀 차례':'윷 던지기';
    const cls=!disabled&&s.phase==='roll'?'primary cast-btn':'primary';
    actions.append(button(label,cls,()=>dispatch({type:'roll'}),disabled));return;
  }
  if(!net?.status)$('note').textContent=selectedPawn===null?'내 말을 밝은 칸으로 끌어 놓으세요.':pieceName(s,team,selectedPawn)+' · 놓을 칸을 누르세요.';
  const alternate=button('이동 선택','secondary',()=>moveChoices(moves(game)),disabled);
  alternate.setAttribute('aria-haspopup','dialog');actions.append(alternate);
}
function moveChoices(picks){
  if(!canMovePiece()||!picks.length)return;
  const state=game,team=state.pawns[state.team],options=moves(state);
  openPanel('말 옮기기','moves');
  const choices=element('div',undefined,'form-actions');
  for(const m of picks){
    const current=position(team[m.index]);
    const stacked=current!==HOME&&team.every(p=>position(p)===current);
    const branches=options.some(o=>o.index===m.index&&o.shortcut!==m.shortcut);
    let label=stacked?'업힌 두 말':pieceName(state,state.team,m.index);
    label+=current===HOME?' 출발':branches?(m.shortcut?' · 지름길':' · 원래 길'):' 이동';
    const b=button(label,'choice',()=>{
      closePanel();
      if(state===game&&canMovePiece())place(m);
    });
    b.append(element('small','→ '+nodeName(m.to)));choices.append(b);
  }
  body.append(choices);
}
function openPanel(title,name){
  panel=name;board.setMoves([],null);$('dialog-title').textContent=title;body.replaceChildren();if(!dialog.open)dialog.showModal();
}
function closePanel(){if(dialog.open)dialog.close();}
function message(text){const el=element('p',text,'message');el.setAttribute('role','status');return el;}
function rules(){
  openPanel('놀이 방법','help');
  const list=element('ol');
  ['윷을 던진 뒤 내 말을 밝은 칸으로 끌어 놓으세요. 말과 칸을 차례로 눌러도 돼요. 버튼으로 고르려면 ‘이동 선택’을 누르세요.',
   '팀마다 말이 두 개예요. 도·개·걸·윷·모가 나오면 1·2·3·4·5칸을 가요. 네 가락 중 평평한 면이 하나도 없으면 모예요.',
   '오른쪽 위나 왼쪽 위 모서리에 멈추면 다음 이동 때 지름길을 고를 수 있어요. 가운데 칸에서도 골인 쪽 길을 고를 수 있어요.',
   '같은 팀 말은 업어서 함께 가요. 상대 말을 잡으면 그 말은 대기로 돌아가요. 윷·모를 내거나 말을 잡으면 한 번 더 던져요.',
   '특수 칸에 딱 멈추면 아래 효과를 한 번 받아요.',
   '출발점에 돌아와 한 칸 더 지나면 골인이에요. 두 말을 먼저 골인시키세요.'].forEach(t=>list.append(element('li',t)));
  const effects=element('div',undefined,'effects');
  for(const [symbol,name,effect,tint] of [['▲','바위턱','한 칸 뒤로','#efb59e'],['◎','소용돌이','두 칸 뒤로','#b6c9f0'],['»','순풍','두 칸 앞으로','#a2e6d0']]){
    const row=element('div',undefined,'effect-row'), icon=element('span',symbol,'effect-icon');
    icon.style.setProperty('--tint',tint);icon.setAttribute('aria-hidden','true');
    row.append(icon,element('b',name),element('span',effect));effects.append(row);
  }
  body.append(list,effects,button('알겠어요','primary',closePanel));
}
function resetLocal(count,offset=local.zodiacOffset){
  closePanel();local=newGame(count,offset);void showState(local,false);
}
function pairPicker(current,onChange){
  const box=element('div',undefined,'pair-picker'),label=element('label','산호 팀의 십이지 말');
  const select=element('select'),preview=element('div',undefined,'pair-preview');
  select.id='zodiac-pair';label.htmlFor=select.id;
  ANIMALS.forEach((name,i)=>{
    const option=element('option',name+' · '+ANIMALS[(i+1)%ANIMALS.length]);
    option.value=i;select.append(option);
  });
  select.value=current??2;
  function paint(){const offset=Number(select.value);preview.replaceChildren(animalIcon(0,0,offset),animalIcon(0,1,offset));}
  select.onchange=()=>{paint();onChange?.(Number(select.value));};paint();
  box.append(label,select,preview);
  return {box,select};
}
function settings(){
  if(pendingRoom)return;
  openPanel('게임 메뉴','settings');
  const menu=element('div',undefined,'menu-grid');
  menu.append(button('놀이 방법','secondary',rules),button('말 현황','secondary',standings),
    button('윷판 돌리기','secondary',()=>{board.rotate(1);closePanel();}));
  body.append(menu);
  if(net){
    body.append(message(net.game?'온라인 윷놀이를 진행 중이에요.':'친구들과 모이는 중이에요.'),
      button('온라인 대기실','secondary',lobbyPanel),
      button('방 나가기','secondary',()=>confirmPanel('온라인 방 나가기',net.isHost?'방장이 나가면 방이 닫혀요.':'현재 방에서 나갈까요?',()=>leaveRoom())));
    return;
  }
  const label=element('label','한 기기에서 함께할 팀 수');label.htmlFor='team-count';
  const select=element('select');select.id='team-count';
  [2,3,4].forEach(n=>{const o=element('option',n+'팀');o.value=n;o.selected=n===local.pawns.length;select.append(o);});
  const pair=pairPicker(local.zodiacOffset);
  const actions=element('div',undefined,'form-actions');actions.append(
    button('한 기기에서 새로 시작','primary',()=>{
      const n=Number(select.value),offset=Number(pair.select.value);
      if(local.revision&&local.phase!=='won')confirmPanel('새 판을 시작할까요?','지금 진행 중인 한 기기 게임이 종료돼요.',()=>resetLocal(n,offset));else resetLocal(n,offset);
    }),button('친구 초대방 만들기','secondary',()=>{roomOffset=Number(pair.select.value);connect(null);}));
  body.append(label,select,pair.box,actions,message('초대방에서는 각자 기기로 접속해요. 방장은 게임이 끝날 때까지 방을 열어 두세요.'));
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
    });actions.append(copy,button('모인 팀으로 시작','primary',()=>{room?.start(roomOffset);if(net?.game)closePanel();},net.seats.length<2||!net.connected));
    body.append(label,link,pairPicker(roomOffset,offset=>{roomOffset=offset;}).box,actions);
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
    room=active;pendingRoom=false;renderHUD();
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
$('settings').onclick=settings;$('team-title').onclick=standings;$('close').onclick=closePanel;
dialog.addEventListener('close',()=>{panel='';renderHUD();});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePanel();}});
reduced.addEventListener?.('change',()=>{if(reduced.matches&&casting)toss.cancel();});
void showState(local,false);
const invite=new URLSearchParams(location.hash.slice(1));if(invite.has('room'))void connect(invite.get('room'));
