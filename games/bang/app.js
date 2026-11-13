// unchanged production source at line 1
function result(){
 const s=game.s,p=game.p(me()),won=!(s.forfeited||[]).includes(me())&&(s.winner===p.role||(s.winner==='sheriff'&&p.role==='deputy'));
 const status=online.playing?(online.room.rankExcluded?.includes(me())?'순위 제외':online.room.record?.saved?`${online.room.record.streak}연승 · 저장 완료`:'기록 저장 중'):'연습 결과 · 순위 제외';
 return wrap(window.OjjudaGameResults.markup({game:'bang',outcome:won?'success':'failure',key:`bang:${online.room?.id||'practice-'+resultRun}:${s.turn}:${s.winner}`,metric:`${s.turn}턴 · ${ROLES[s.winner].name}${s.winner==='sheriff'?'·부관':''} 승리`,extra:status?`<p role="status">${status}</p>`:'',actions:`<button ${online.playing?'':'data-game-result-play'} data-action="${online.playing?'online-leave':'start'}">${online.playing?'대기실':'다시 하기'}</button><button data-action="close">테이블 보기</button>`}),{cls:'response-modal result-modal'});
}
function tutorialComplete(){return wrap(`<div class="result-star">★</div><div class="eyebrow">PRACTICE COMPLETE</div><h2 id="dialog-title">첫 총격전 연습, 완료!</h2><p>이제 한 판을 시작할 준비가 됐어요.</p><div class="lesson-recap"><div><img src="${art('bang')}" alt="뱅!"><strong>공격</strong><span>카드 선택 → 사용하기 → 상대</span></div><div><img src="${art('mancato')}" alt="빗나감!"><strong>방어</strong><span>공격받으면 빗나감!</span></div><div><img src="${art('birra')}" alt="맥주"><strong>회복</strong><span>맥주 선택 → 사용하기</span></div></div><p class="recap-turn"><b>내 턴 순서</b><br>2장 자동 받기 → 카드 사용 → 턴 종료<br><small>남은 손패는 현재 체력 수까지만 보유해요.</small></p><div class="modal-actions"><button class="primary" data-action="tutorial-play">새 실전 시작</button><button class="secondary" data-action="catalog">카드 안내</button><button class="secondary" data-action="characterCatalog">캐릭터 안내</button>${saved&&!saved.winner?'<button class="secondary" data-action="tutorial-resume">저장된 게임 이어하기</button>':'<button class="secondary" data-action="tutorial-exit">처음 화면으로</button>'}<button class="secondary" data-action="tutorial-restart">한 번 더 연습</button></div><p class="source-note">연습은 여기서 끝나요. 실전은 새로운 카드로 시작합니다.</p>`,{close:false,cls:'response-modal tutorial-complete'});}

function beginTutorial(){
 if(online.playing){toast('대전을 마친 뒤 연습할 수 있어요.');return;}
// unchanged production source at line 160
 else if(modal?.type==='player')html=inspectPlayer(modal.id);
 else if(modal?.type==='sid')html=sidModal();
 else if(modal?.type==='logs')html=wrap(`<div class="eyebrow">SALOON LOG</div><h2 id="dialog-title">살롱의 기록</h2><div>${logsHTML()}</div>`);
 else if(modal?.type==='online-exit')html=wrap(online.room?.mode==='solo'?'<h2 id="dialog-title">컴퓨터 대전을 끝낼까요?</h2><p>진행 중인 컴퓨터 대전을 끝내면 기권 패배로 기록돼요.</p><div class="modal-actions"><button class="secondary" data-action="close">계속 플레이</button><button class="primary" data-action="online-surrender">기권하고 끝내기</button></div>':'<h2 id="dialog-title">대전에서 나갈까요?</h2><p>컴퓨터가 내 패와 체력을 그대로 이어받아요.<br>나는 다음에 새 게임을 시작하며, 이 판은 내 순위와 연승에 반영되지 않아요.</p><div class="modal-actions"><button class="secondary" data-action="close">계속 플레이</button><button class="primary" data-action="online-leave">컴퓨터에게 맡기고 나가기</button><button class="secondary" data-action="online-surrender">기권하기 · 패배 기록</button></div>');
 else if(modal?.type==='new')html=wrap('<div class="eyebrow">A NEW TABLE</div><h2 id="dialog-title">새 테이블을 준비할까요?</h2><p>현재 진행 중인 게임 대신 새 게임을 시작합니다.</p><div class="modal-actions"><button class="primary" data-action="goLobby">새 게임 준비</button><button class="secondary" data-action="close">계속 플레이</button></div>');
 else if(modal?.type==='result')html=result();
 else if(modal?.type==='eliminated')html=wrap(window.OjjudaGameResults.markup({game:'bang',outcome:'failure',key:`bang-out:${online.room?.id||'practice-'+resultRun}:${game.s.turn}`,metric:'탈락 · 팀 결과는 진행 중',actions:`<button data-action="close">관전하기</button>${online.playing?'':'<button data-action="goLobby" data-game-result-play>새 게임</button>'}`}),{cls:'response-modal'});
 else if(page==='game'&&game.s.pending?.player===me())html=response(game.s.pending);
 const overlay=$('#overlay');overlay.innerHTML=html;overlay.hidden=!html;document.body.style.overflow=html?'hidden':'';
 if(html){$('#app').inert=true;requestAnimationFrame(()=>overlay.querySelector('button:not(:disabled)')?.focus({preventScroll:true}));}else $('#app').inert=false;
}
function render(){
 clearTimeout(botTimer);
// unchanged production source at line 231
 let action=b.dataset.action;const value=b.dataset.value,n=Number(value);
 if(action==='hint'&&!tutorial){
  void buyHint();
  return;
 }
 if(action==='online-create'){const title=$('#online-title')?.value.trim(),capacity=Number($('#online-capacity')?.value);void online.run('create',{options:{title,capacity}});return;}
// unchanged production source at line 296
