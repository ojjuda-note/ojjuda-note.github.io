// unchanged production source at line 1
 const alive=local?current.game.tanks.some(t=>t.hp>0):current.game.tanks[current.seat]?.hp>0,remaining=Math.max(0,Math.ceil((Date.parse(current.deadline)-Date.now()-offset)/1000));
 $('netTurn').textContent=animation?flightLabel():current.status==='finished'?'전투 종료':!alive?'탈락 · 관전 중':`${current.game.names[current.game.turn]}${!local&&current.game.turn===current.seat?' (나)':''} 차례${local?' · 번갈아 조작해 주세요':solo?'':' · '+remaining+'초'}`;
 $('surrender').textContent=privateMatch?'그만하기':'항복';$('surrender').hidden=!alive||current.status!=='active';$('surrender').disabled=busy||animation;
 $('bAgain').title=privateMatch?'다시 하기':'대기실로';$('bMenu').title=privateMatch?'처음 화면으로':'게임 목록';
 if(current.status==='finished'&&!animation&&!view.hasEffects()){
  eliminationPopup?.close();eliminationPopup=null;
  const winner=current.game.tanks.find(t=>t.hp>0),outcome=!winner?'draw':local?'success':alive?'success':'failure';
  window.showTankResult(outcome,winner?`남은 체력 ${winner.hp}`:'동시 탈락',`tank:${current.id}`);
 }else{
  $('over').classList.add('hidden');
  if(!local&&!alive&&current.status==='active'&&!animation&&!view.hasEffects()&&eliminationRoom!==current.id){
   eliminationRoom=current.id;
   eliminationPopup=window.OjjudaGameResults.show({game:'tank',outcome:'failure',key:`tank-out:${current.id}`,metric:'내 탱크 탈락',dismissible:true,actions:[{label:'나가기',onClick:()=>{exit();return false;}},{label:'계속하기',autofocus:true,onClick:()=>{eliminationPopup=null;}}]});
  }
 }
 view.refresh();queueComputer();
// unchanged production source at line 100
 finally{render();}
};
$('copyCode').onclick=async()=>{try{await navigator.clipboard.writeText(current.code);notify('방 번호를 복사했어요.');}catch{notify('방 번호 '+current.code+'를 알려 주세요.');}};
$('surrender').onclick=async()=>{
 if(busy||!current||current.status!=='active')return;
 const {id,mode}=current,online=mode==='online';
 const message=online?'항복하고 관전할까요?':'이번 게임을 끝내고 처음 화면으로 갈까요?';
 const confirmed=await (window.OjjudaGameResults?.confirmExit?.(message,{exitLabel:online?'항복하고 관전':'나가기'})??confirm(message));
 if(confirmed&&!busy&&current?.id===id&&current.status==='active')void perform({action:online?'surrender':'leave',room_id:id,version:current.version,request_id:crypto.randomUUID()});
};
$('bAgain').onclick=async()=>{if(!current||busy)return;const mode=current.mode;if(mode==='solo')$('soloOpponents').value=String(current.capacity-1);if(mode==='local')$('localPlayers').value=String(current.capacity);const left=await perform({action:'leave',room_id:current.id});if(left&&mode!=='online')await startPrivate(mode);};
const exit=()=>parent.postMessage({source:'ojjuda-tank',type:'exit'},origin);
$('bMenu').onclick=()=>current&&current.mode!=='online'&&!busy?perform({action:'leave',room_id:current.id}):exit();$('exitEntry').onclick=exit;
// unchanged production source at line 240
