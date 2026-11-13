// unchanged production source at line 1
    $('next-level-detail').textContent=final?'마지막 레벨':`${state.stage+1}단계`;
    const completion=$('completion');completion.hidden=false;
    $('win-save-status').textContent='';$('win-save-status').hidden=true;
    window.OjjudaGameResults?.decorate(completion.querySelector('.completion-card'),{game:'sacheonseong',outcome:'success',metric:$('win-desc'),key:state.runId,actions:[completion.querySelector('.completion-levels')],extra:[$('win-save-status')]});
    completion.removeAttribute('aria-labelledby');completion.setAttribute('aria-label','사천성 결과');
    showGlobalResult();
    $('current-level').focus({preventScroll:true});
// unchanged production source at line 277
    newStage(stage);$('board-scroll').focus({preventScroll:true});
  }
  function showModal(html){if($('options').open)$('options').close();$('modal-content').innerHTML=html;$('modal').showModal();}
  function confirmChange(title,message,action){const runId=state.runId;showModal(`<div class="eyebrow">새로운 시작</div><h2 id="modal-title">${title}</h2><p>${message}</p><div class="modal-buttons"><button class="action-button" id="cancel-action">계속하기</button><button class="next-button" id="confirm-action">새로 시작</button></div>`);$('cancel-action').onclick=()=>$('modal').close();$('confirm-action').onclick=()=>{if(state.runId!==runId||state.pendingPurchase)return;$('modal').close();action();};}
  function openRanking(stage=state.stage){
    rankingStage=stage;
    const stages=[...new Set([state.stage,...Object.keys(records).map(Number)])].sort((a,b)=>a-b);
// unchanged production source at line 289
  $('hint').onclick=()=>useTool('hint');
  $('shuffle').onclick=()=>useTool('shuffle');
  $('restart').onclick=()=>{if(locked||state.pendingPurchase)return;confirmChange('이 정원을 다시 시작할까요?','패와 시간이 새로 시작돼요. 이미 세운 순위 기록은 남아 있어요.',()=>newStage(state.stage));};
  $('previous-level').onclick=()=>chooseCompletedLevel(-1);
  $('current-level').onclick=()=>chooseCompletedLevel(0);
  $('next').onclick=()=>chooseCompletedLevel(1);
// unchanged production source at line 372
  $('zoom-out').onclick=()=>zoomBoard(tileSize()-Math.max(6,tileSize()*.2));
  window.addEventListener('resize',sizeBoard);
  if(window.ResizeObserver)new ResizeObserver(sizeBoard).observe($('board-scroll'));
  $('game-home').addEventListener('click',event=>{if(window.parent!==window){event.preventDefault();save();window.parent.postMessage({type:'ojjuda:sacheonseong-home'},location.origin);}});
  window.addEventListener('pagehide',save);
  window.addEventListener('ojjuda:sacheonseong-record',event=>{if(globalResult?.deliveryId&&event.detail?.id===globalResult.deliveryId)compareGlobalResult(globalResult,event.detail);});
  function validPurchase(item){const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);return item&&uuid(item.id)&&uuid(item.runId)&&uuid(item.owner)&&Number.isInteger(item.stage)&&item.stage>=1&&item.stage<=E.MAX_STAGE&&['hint','shuffle'].includes(item.kind);}
// unchanged production source at line 454
