// unchanged production source at line 1
}
async function joinRoom(code){selectMode('online',{refresh:false});const value=String(code||'').trim().toUpperCase();if(!/^[A-F0-9]{8}$/.test(value)){notice('8자리 방 코드를 입력해 주세요.');$('joinCode').focus();return}sound.unlock().catch(()=>{});await command('join',{code:value})}
async function leaveRoom({exit=false}={}){
  if(commandBusy)return false;const data=room?await command('leave',{roundId:room.spin?.id}):{};
  if(data){room=null;state.pending=null;state.bets={};state.betChips={};undo=[];animating=false;resultReadyId=null;settling=false;sound.stopRoll();await closeWheelPopup(null,{instant:true});setScreen('lobby');render();if(exit){closed=true;clearTimeout(pollTimer);clearTimeout(bettingClockTimer);clearTimeout(draftTimer);send({type:'exit'})}}
  return !!data;
}
window.addEventListener('message',async event=>{
  if(event.origin!==location.origin||event.source!==window.parent||event.data?.source!=='ojjuda-world')return;
// unchanged production source at line 272
  cancelBetFlights();
  winEffects.clear();
  $('wheel').setAttribute('aria-label','룰렛 공이 돌고 있습니다. 원판이 완전히 멈춘 뒤 공이 들어간 칸과 숫자를 확대해 보여줍니다.');
  const modal=$('wheelDialog');resultReadyId=null;$('leaveResultButton').hidden=true;$('confirmResultButton').hidden=true;$('confirmResultButton').disabled=true;modal.dataset.spin=spin.id;modal.dataset.phase='spinning';modal.classList.remove('closing');
  $('wheelOutcome').hidden=true;$('wheelFootnote').hidden=false;$('wheelDialogTitle').textContent='공이 멈추는 순간.';$('wheelDialogHint').textContent=totalBets(spin.bets)?`베팅 마감 · ${fmt(totalBets(spin.bets))} G`:'관람 · 베팅 없음';
  if($('helpDialog').open)$('helpDialog').close();
  if($('refillDialog').open)$('refillDialog').close();
// unchanged production source at line 525
  // Only an acknowledged server settlement reaches this popup. The stake is
  // subtracted from the payout; gross return is never labelled as gold gained.
  const net=result.net;
  settledResultPopup=window.OjjudaGameResults.show({game:'roulette',outcome:net>0?'gold-gain':net<0?'gold-loss':'gold-even',key:`roulette:${id}`,metric:`${net>0?'+':''}${fmt(net)} G`,extra:`<p>${result.number}번${state.balance<1000?' · 보유 '+fmt(state.balance)+' G':''}</p>`,dismissible:true,actions:[{label:'나가기',onClick:()=>leaveRoom({exit:window.parent!==window})},{label:'계속하기',autofocus:true,onClick:()=>{settledResultPopup=null;}}]});
}
function showSpinResult(id){
  sound.stopRoll();
// unchanged production source at line 564
  animating=false;resultReadyId=id;wheel.showResult(result.number);
  render();revealResult(result,{pending:true});
  if(room?.mode==='solo'&&computerOutcome?.id!==id)schedulePoll(0);
  $('leaveResultButton').hidden=false;$('leaveResultButton').disabled=false;
  $('confirmResultButton').hidden=false;$('confirmResultButton').disabled=false;
  $('confirmResultButton').textContent='계속하기';$('confirmResultButton').focus({preventScroll:true});
}
async function confirmResult(leaveAfterSettlement=false){
  const id=resultReadyId,roomId=room?.id;if(!id||settling)return;
  settling=true;resultReadyId=null;$('leaveResultButton').disabled=true;$('confirmResultButton').disabled=true;
  $('confirmResultButton').textContent='정산하는 중';let result,oldBalance;
  const spin=state.pending;if(!spin||spin.id!==id){settling=false;render();return}
  const calculated=payout(spin.bets,spin.number);result={...calculated,number:spin.number,net:calculated.total-calculated.stake,bets:{...spin.bets}};oldBalance=state.balance;
  try{
    if(room?.mode==='solo'&&computerOutcome?.id!==id)applySnapshot(await rpc('read',{code:room.code}));
    const data=await rpc('confirm',{code:room.code,roundId:id});state.lastSettled=id;recordHistory(spin);state.pending=null;state.bets={};state.betChips={};undo=[];applySnapshot(data);
  }
  catch(error){settling=false;resultReadyId=id;$('leaveResultButton').disabled=false;$('confirmResultButton').disabled=false;$('confirmResultButton').textContent='계속하기';notice(errorText(error));render();if(exitRequested){exitRequested=false;void leaveRoom({exit:true})}else schedulePoll(200);return}

  if(!result){await closeWheelPopup(id,{instant:true});settling=false;render();return}
  if(leaveAfterSettlement){
    await closeWheelPopup(id,{instant:true});settling=false;render();renderHistory();
    if(!await leaveRoom({exit:window.parent!==window}))showSettledResult(id,result,roomId);
    return;
  }
  render({bets:false,balance:false});revealResult(result);renderHistory();
  if(result.net>0)sound.win();
  await closeWheelPopup(id,{instant:document.hidden});
// unchanged production source at line 589
$('cancelReady').addEventListener('click',async()=>{if(bettingExpired())return;const data=await command('ready',{ready:false});if(data&&room?.status==='betting'&&!ownReady())queueDraft()});
$('copyCode').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(room.code);notice('방 코드를 복사했어요.')}catch{notice('방 코드: '+(room?.code||''))}});
$('spinButton').addEventListener('click',startSpin);
$('confirmResultButton').addEventListener('click',()=>confirmResult());
$('leaveResultButton').addEventListener('click',()=>confirmResult(true));
$('refillButton').addEventListener('click',openRefill);$('lobbyRefillButton').addEventListener('click',openRefill);
$('confirmRefillButton').addEventListener('click',()=>{if($('refillDialog').open)void submitRefill(true)});
for(const id of ['closeRefillButton','cancelRefillButton'])$(id).addEventListener('click',()=>{if(!refillBusy)$('refillDialog').close()});
// unchanged production source at line 636
