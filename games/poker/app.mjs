// unchanged production source at line 1
function nextHandButton(extraClass=''){
 const room=online?.room,waiting=!!room?.ready?.[room.seat],departed=!!room?.departed?.some(Boolean);
 const disabled=!room||waiting||departed||!wallet||wallet.gold<50;
 const label=departed?'새 방 필요':waiting?'상대 준비 중':'다음 게임';
 return `<button type="button" class="poker-next-game${extraClass?' '+extraClass:''}" data-action="online-ready" ${disabled?'disabled':''}>${label}${disabled?'':' →'}</button>`;
}
function nextHandPopup(){
 const net=game.result.net[0];
 return startPopup(window.OjjudaGameResults.markup({game:'poker',outcome:net>0?'gold-gain':net<0?'gold-loss':'gold-even',key:`poker:${roundKey()}`,metric:`${net>0?'+':''}${fmt(net)} G`,extra:refillButton(),actions:`<button data-action="inspect-result">패 보기</button><button data-action="online-leave">나가기</button>${nextHandButton()}`}));
}
function refillButton(){
 if(!canRefill())return '';
// unchanged production source at line 155
 if(!online?.room){exit();return;}
 const active=online.room.status==='active',handoff=active&&online.room.mode==='online'&&!game?.players[0]?.folded;
 document.querySelector('#exit-dialog p').textContent=handoff?'컴퓨터가 내 패와 골드를 이어받아요. 이번 판의 최종 골드 증감은 내 계정에 반영되고, 순위와 승률에는 포함되지 않아요. 정산이 끝나면 새 게임을 시작할 수 있어요.':active&&online.room.mode==='solo'?'진행 중인 컴퓨터 대전은 다이 처리돼요. 남은 골드는 정산하고, 다음에는 새 게임을 시작해요.':active?'이미 다이한 이번 판에서 나가요. 남은 골드를 정산하고, 다음에는 새 게임을 시작해요.':'방에서 나가요. 다음에는 새 게임을 시작해요.';
 document.querySelector('#confirm-exit').textContent=handoff?'컴퓨터에게 맡기고 나가기':'게임 목록으로';
 document.querySelector('#exit-dialog').showModal();
}
document.addEventListener('click',async event=>{
// unchanged production source at line 445
