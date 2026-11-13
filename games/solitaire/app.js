import './rules.js?v=20261106-solitaire-ranking1';
import {SUITS,red,copy,createGame,getPile,canMove,move,draw,isWon,canFinish,legalMoves,suggest,validateState,visibleWasteCount,restoreWastePackets} from './engine.js?v=20261106-solitaire-ranking1';
import {cardFace,CARD_RATIO} from './cards.js?v=20261106-solitaire-images1';
import {gestureSource,HOLD_DELAY} from './gestures.js?v=20261107-solitaire-hold250-1';
import {playWinAnimation} from './celebration.js?v=20261106-solitaire-images1';
import {overlappingTarget} from './drop-targets.js?v=20261106-solitaire-ranking1';
import {createViewport} from './viewport.js?v=20261106-solitaire-ranking1';
const $=s=>document.querySelector(s);
// unchanged production source at line 6
function openDialog(html){
  const now=Date.now();if(started&&!isWon(state)&&!document.hidden&&!dialog.open&&!entryDialog.open&&!externalPaused)elapsed+=Math.max(0,now-lastTick);
  $('#dialog-content').innerHTML=html;lastTick=now;if(!dialog.open)dialog.showModal();
  $('#dialog-content').querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>dialog.close());
}
dialog.addEventListener('close',()=>{lastTick=Date.now();});
// unchanged production source at line 266
  if(locked)return;
}
function pause(){if(locked||isWon(state))return;openDialog('<div class="dialog-icon">Ⅱ</div><div class="dialog-kicker">TAKE YOUR TIME</div><h2 class="dialog-title">잠깐 쉬어 가요</h2><p class="dialog-text">카드도 시간도 잠시 멈췄어요.<br>준비되면 이어서 즐겨 주세요.</p><div class="dialog-buttons"><button class="primary" data-close>게임 계속하기</button></div>');save();}
function win(){
  const now=Date.now();
  if(started&&!document.hidden&&!dialog.open&&!entryDialog.open&&!externalPaused)elapsed+=Math.max(0,now-lastTick);
// unchanged production source at line 290
  save();submitCompletion();
  winPlaying=true;locked=true;updateStats();
  const complete=()=>{if(!winPlaying)return;stopWinAnimation=null;winPlaying=false;locked=false;updateStats();showWinResult();};
  try{const stop=playWinAnimation(complete,{onRestart:()=>{notifyArcade('ojjuda-game-finished');startNewGame();}});if(winPlaying)stopWinAnimation=stop;}
  catch{complete();}
}
function showWinResult(){
  notifyArcade('ojjuda-game-finished');
  openDialog(`<div class="dialog-icon">♛</div><div class="dialog-kicker">BEAUTIFULLY DONE</div><h2 class="dialog-title">멋지게 완성했어요!</h2><p class="dialog-text">52장의 카드가 모두 제자리를 찾았네요.</p><div class="win-stats"><div><small>시간</small><strong>${formatTime((completion?.seconds||Math.ceil(elapsed/1000))*1000)}</strong></div><div><small>이동</small><strong>${state.moves}</strong></div><div><small>난이도</small><strong>${state.drawCount===3?'보통':'초보'}</strong></div></div><a class="dialog-monthly-shortcut" href="/features/arcade/monthly-ranking.html?game=solitaire" target="_blank" rel="noopener noreferrer">🏆 이번 달 1~10위 · 내 순위</a><p id="ranking-status" class="dialog-text"></p><button id="retry-ranking" hidden>순위 저장 다시 시도</button><div class="dialog-buttons"><button data-close>카드 보기</button><button class="primary" id="play-again">다시 시작</button></div>`);
  updateRankingStatus();
  $('#retry-ranking').onclick=submitCompletion;
  $('#play-again').onclick=()=>startNewGame();
// unchanged production source at line 307
render();save();showEntry();

function notifyArcade(type,data={}){if(window.parent!==window)window.parent.postMessage({source:'ojjuda-solitaire',type,...data},location.origin);}
function requestExit(){
  save();
  if(window.parent!==window){notifyArcade('ojjuda-game-exit-request');return;}
  if(entryDialog.open){location.assign('/world.html?tab=arcade');return;}
  openDialog('<h2 class="dialog-title">오락실로 돌아갈까요?</h2><div class="dialog-buttons"><button data-close>게임 계속하기</button><button class="primary" id="leave-arcade">오락실로</button></div>');
  $('#leave-arcade').onclick=()=>location.assign('/world.html?tab=arcade');
}
$('#game-home').onclick=requestExit;
window.OjjudaSolitaireControls={save,pause(){
// unchanged production source at line 332
