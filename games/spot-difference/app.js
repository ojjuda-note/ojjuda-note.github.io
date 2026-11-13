// unchanged production source at line 1
    $('prev').disabled=previousIndex===undefined||!canOpen(previousIndex)||paymentBusy||(!adminPreview()&&pending);$('next').disabled=nextIndex===undefined||!canPlay(nextIndex)||paymentBusy||(!adminPreview()&&pending)||(!adminPreview()&&!clearedRound());
    $('stage-picker').disabled=paymentBusy||(!adminPreview()&&pending);$('reset').disabled=paymentBusy||pending||!!answerReview;$('wallet-logout').disabled=paymentBusy;
    $('continue').disabled=paymentBusy||(!adminPreview()&&pending)||!!answerReview||(!adminPreview()&&!clearedRound())||(nextIndex!==undefined&&!canPlay(nextIndex));
    for(const id of ['game-home','zoom-home'])$(id).setAttribute('aria-disabled',String(paymentBusy));
    const canViewAnswers=wallet.getState().canViewAnswers===true;
    for(const id of ['reveal-answers','zoom-reveal-answers']){
      $(id).hidden=!canViewAnswers;$(id).disabled=!imagesReady||paymentBusy||pending;
// unchanged production source at line 162
      button.disabled=(outside&&!crossCollection)||needsClear||locked||paymentBusy||!!round().pending;
      button.querySelector('small').textContent=crossCollection?'새 컬렉션 열기':outside?'없음':needsClear?'이번 그림 완료 후':locked?'앞선 그림 완료 후':`${pos+1} / ${order.length} · ${difficultyLabels[core.puzzleDifficulty(puzzles[order[pos]])]}`;
    }
  }
  function playChosenLevel(offset){
    if(paymentBusy||round().pending||!['won','lost'].includes(round().status))return;
// unchanged production source at line 233
    $('celebration-confetti')?.replaceChildren(...Array.from({length:20},(_,i)=>{
      const piece=document.createElement('i');piece.style.setProperty('--piece',i);piece.style.setProperty('--color',['#ffb547','#8b7bd8','#ff789a','#57c6b0','#5a9de2'][i%5]);return piece;
    }));
    window.OjjudaGameResults?.decorate(celebration,{game:'spot',outcome:'success',metric:$('celebration-count'),key:`spot:${puzzle().id}:${loadToken}:won`,actions:[celebration.querySelector('.end-picture-choices')]});
    celebration.removeAttribute('aria-labelledby');celebration.removeAttribute('aria-describedby');celebration.setAttribute('aria-label','틀린그림찾기 성공');
    celebration.showModal();$(position()<collectionOrder().length-1||lastClassicCleared()?'celebration-next':'celebration-current').focus({preventScroll:true});
  }
  function showFailure(){
    $('retry-count').textContent=`${found().length} / ${targetCount()} · ${round().hearts?'시간 종료':'하트 0'}`;
    $('retry-status').textContent='';updateEndChoices('retry');
    window.OjjudaGameResults?.decorate(failure,{game:'spot',outcome:'failure',metric:$('retry-count'),key:`spot:${puzzle().id}:${loadToken}:lost:${round().timeBought}`,actions:[$('retry-level-choice')],extra:[$('retry-tools')]});
    if(!failure.open)failure.showModal();$('retry-current').focus({preventScroll:true});
  }
  function startNextWhenReady(){
// unchanged production source at line 266
    if(paymentBusy){event.preventDefault();speak('ZU 사용 확인이 끝나면 홈으로 이동할 수 있어요.');return;}
    if(window.self!==window.top){event.preventDefault();window.parent.postMessage({type:'ojjuda:spot-home'},window.location.origin);}
  }
  $('game-home').onclick=goHome;$('zoom-home').onclick=goHome;
  function closeZoomSettings(){zoomDialog.classList.remove('settings-open');$('zoom-more').setAttribute('aria-expanded','false');}
  $('zoom-more').onclick=()=>{const open=zoomDialog.classList.toggle('settings-open');$('zoom-more').setAttribute('aria-expanded',String(open));if(open)$('zoom-level').focus();};
  function openZoom(){
// unchanged production source at line 609
