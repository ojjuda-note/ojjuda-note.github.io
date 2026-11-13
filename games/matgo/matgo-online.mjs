import {shuffledFloorSlots,floorStackIds} from './matgo-table-flip.mjs?v=20261106-source-folders3';
import {CARDS,isPi,piVal,score} from './matgo-engine.mjs?v=20261112-matgo-gold-tiers';
import {floorLayout,heldPairMonths,piClaimMessage,positionGoStopPrompt} from './matgo-view.mjs?v=20261106-source-folders3';
import {cardSVG as baseCardSVG,backSVG} from './matgo-art.mjs?v=20261106-source-folders3';
import {createWallet,invokeMatgo} from './matgo-wallet.mjs?v=20261112-matgo-gold-tiers';
import {openMatgoSolo} from './matgo-start.mjs?v=20261112-matgo-gold-tiers';
import {createOnlineMotion} from './matgo-online-motion.mjs?v=20261106-source-folders3';
import {createOnlineSound} from './matgo-online-sound.mjs?v=20261112-arcade-entry-return1';
import {cpuPortraitHTML} from './matgo-opponent.mjs?v=20261106-source-folders3';
import {createVentControls} from './matgo-deck-tools.mjs?v=20261106-source-folders3';
const cardSVG=c=>baseCardSVG(c).replace('<svg',`<svg data-face="${Number(c.id)}"`);
// unchanged production source at line 9
  if(dialogKey===key)return;
  closeDialog();dialog=document.createElement('div');dialog.className='dialog';dialog.role='dialog';dialog.setAttribute('aria-modal','true');dialog.innerHTML='<section class="card'+(key.startsWith('result:')?' result-card':'')+'">'+html+'</section>';dialogKey=key;document.body.appendChild(dialog);if(goStop)positionGoStopPrompt(dialog);
  for(const [id,handler] of Object.entries(handlers)){const el=dialog.querySelector('#'+id);if(el)el.onclick=()=>{if((key.startsWith('turn:')||key==='pick')&&(busy||pendingMove||animating))return;closeDialog();handler();};}
  dialog.querySelector('button,input')?.focus({preventScroll:true});
}
function connection(text=''){$('#connection').hidden=!text;$('#connection').textContent=text;}
async function rpc(body){
// unchanged production source at line 74
  }
  if(room.status==='cancelled'){
    if(viewKey===room.id+':cancelled')return;viewKey=room.id+':cancelled';closeDialog();clearEvents();
    $('#content').innerHTML='<section class="lobby waiting"><h2>대결이 종료됐어요</h2><p>진행 중인 판은 정산되지 않았어요.</p><button class="btn gold" id="back-lobby">대기방으로</button></section>';$('#back-lobby').onclick=()=>lobby();return;
  }
  const g=room.game;if(!g)return;
  const me=room.seat,op=1-me,pr=g.prompt,myTurn=pr?.p===me&&!room.bots[me],selecting=pr?.type==='choose';
// unchanged production source at line 313
  clearTimeout(toast.timer);$('#toast').hidden=true;
  const delta=r.paidDelta[me],draw=r.type==='nagari',won=r.winner===me;
  const canRematch=!room.departed.some(Boolean),empty=room.gold[me]===0,waitingRefill=!empty&&room.gold[1-me]===0;
  const actions=`${canRematch?'<button id="rematch" '+(room.ready[me]||waitingRefill?'disabled':'')+'>'+(empty?'골드 충전':waitingRefill?'상대 충전 중':room.ready[me]?'상대 준비 중':'다음 판')+'</button>':''}<button id="result-exit">나가기</button>`;
  const extra=`${draw?'<p>다음 판 ×'+r.nextCarry+'</p>':''}${room.gold[me]<1000?'<p>보유 '+number(room.gold[me])+' G</p>':''}${room.rankExcluded?.[me]?'<p role="status">순위 제외 · 정산 완료</p>':''}`;
  modal(window.OjjudaGameResults.markup({game:'matgo',outcome:draw?'draw':won?'success':'failure',metric:`${signed(delta)} G`,key,actions,extra}),{rematch:()=>ready(),'result-lobby':()=>leave(false),'result-exit':()=>leave(true)},key);
}
// unchanged production source at line 364
}
function closeApp(){if(window.parent!==window)window.parent.postMessage({type:'ojjuda:matgo:close'},location.origin);else location.href='../world.html';}
function requestExit(close=true){
  if(room?.status==='active'&&!room.departed[room.seat])modal('<h2>대결에서 나갈까요?</h2><p>PC가 내 자리를 이어서 쳐요.<br>판이 끝나면 승패에 따른 골드가 내 지갑에 정산돼요.<br>이번 판은 내 순위 기록에 반영하지 않아요.</p><div class="row"><button id="stay" class="btn gold">계속하기</button><button id="leave" class="btn ghost">나가기</button></div>',{stay:()=>{promptKey='';renderRoom();},leave:()=>leave(close)});
  else void leave(close);
}
async function lobby(){const state=await wallet.status();if(closed)return;retiringRoom=state.online_room||null;retireLeave=!!retiringRoom;setGold(state.gold);showLobby();}
// unchanged production source at line 380
