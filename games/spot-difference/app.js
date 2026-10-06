(() => {
  'use strict';
  if(window.self!==window.top)document.body.classList.add('embedded');
  const $=id=>document.getElementById(id),puzzles=window.JJUDA_PUZZLES,core=window.JjudaGame,wallet=window.JjudaWallet;
  const storageKey='jjuda-spot-six-v1';let stored=null,storageWorks=true;
  try{stored=JSON.parse(localStorage.getItem(storageKey));}catch{storageWorks=false;}
  // Preserve an unresolved payment across reloads so its receipt can be recovered.
  const pendingStored=stored?.rounds?.[puzzles[stored.current]?.id]?.pending;
  const state=core.cleanProgress(pendingStored?stored:null,puzzles);
  if(!pendingStored&&puzzles.length>1&&state.current===stored?.current){
    const next=1+Math.floor(Math.random()*(state.order.length-1));
    [state.order[0],state.order[next]]=[state.order[next],state.order[0]];
    state.current=state.order[0];
  }
  const surfaces=[...document.querySelectorAll('.picture')],zoomDialog=$('zoom-dialog'),authDialog=$('auth-dialog');
  let celebrationTimer=null,autoStartToken=null;
  const timeoutRetries=new Set();
  const celebration=$('celebration');
  let hintTimer=null,zoomNoticeTimer=null,loadToken=0,imagesReady=false,paymentBusy=false,keyboardPoint={x:50,y:50},answerReview=null;
  const puzzle=()=>puzzles[state.current];
  const found=()=>state.found[puzzle().id]||(state.found[puzzle().id]=[]);
  const round=()=>state.rounds[puzzle().id]||(state.rounds[puzzle().id]=core.freshRound());
  const position=()=>state.order.indexOf(state.current);
  function save(){
    try{localStorage.setItem(storageKey,JSON.stringify({version:2,...state}));storageWorks=true;}catch{storageWorks=false;}
    $('storage-note').textContent=storageWorks?'게임을 다시 열면 처음부터 시작하고 사진도 새로 섞여요.':'게임은 다시 열면 처음부터 시작해요. 쭈를 쓰려면 브라우저 저장을 허용해 주세요.';
    return storageWorks;
  }
  function speak(message,good=false){
    $('message').textContent=message;$('message').classList.toggle('good',good);$('zoom-status').textContent=`${found().length} / 6 · ${message}`;
    clearTimeout(zoomNoticeTimer);
    if(zoomDialog.open){$('zoom-tools').classList.add('has-message');zoomNoticeTimer=setTimeout(()=>$('zoom-tools').classList.remove('has-message'),6500);}
  }
  function makeMark(spot,number,isHint=false){
    const mark=document.createElement('div');mark.className='mark'+(isHint?' hint-mark':'');
    Object.assign(mark.style,{left:`${spot.x}%`,top:`${spot.y}%`,width:`${spot.rx*2}%`,height:`${spot.ry*2}%`});
    if(!isHint){const label=document.createElement('span');label.textContent=number;mark.append(label);if(spot.x+spot.rx>94)mark.classList.add('label-left');if(spot.y-spot.ry<5)mark.classList.add('label-below');}return mark;
  }
  function answerOrder(){return [...found(),...puzzle().spots.map((_,i)=>i).filter(i=>!found().includes(i))];}
  function renderMarks(){
    const order=answerReview?answerOrder():found();
    for(const surface of surfaces)surface.querySelector('.marks').replaceChildren(...order.map((spotIndex,index)=>{
      const mark=makeMark(puzzle().spots[spotIndex],index+1);
      if(answerReview&&!found().includes(spotIndex))mark.classList.add('answer-mark');
      return mark;
    }));
  }
  function renderTime(){
    const r=round(),ms=core.timeLeft(r),seconds=Math.ceil(ms/1000),urgent=r.status==='playing'&&seconds>0&&seconds<=10,expired=r.status==='lost'&&r.hearts>0&&seconds===0,ratio=Math.max(0,Math.min(1,ms/r.totalMs));
    for(const id of ['time-left','zoom-time-left'])$(id).textContent=seconds;
    document.querySelectorAll('.picture-timer').forEach(el=>{el.classList.toggle('urgent',urgent);el.classList.toggle('expired',expired);el.style.setProperty('--time-ratio',String(ratio));});
    document.querySelectorAll('.time-progress').forEach(el=>{el.setAttribute('aria-valuenow',seconds);el.setAttribute('aria-valuemax',Math.ceil(r.totalMs/1000));el.setAttribute('aria-valuetext',`남은 시간 ${seconds}초`);});
    document.querySelectorAll('.time-fill').forEach(el=>el.style.width=`${ratio*100}%`);
    const showExtension=!answerReview&&r.hearts>0&&(urgent||expired||(r.status==='payment'&&ms<=10000));
    for(const id of ['extend','zoom-extend'])$(id).hidden=!showExtension;
  }
  function renderHearts(){
    for(const id of ['hearts','zoom-hearts']){
      const el=$(id);el.setAttribute('aria-label',`남은 하트 ${round().hearts}개`);
      el.replaceChildren(...Array.from({length:3},(_,i)=>{const heart=document.createElement('span');heart.textContent='♥';if(i>=round().hearts)heart.className='empty';return heart;}));
    }
  }
  function refreshControls(){
    const r=round(),playing=r.status==='playing',won=r.status==='won',lost=r.status==='lost',pending=r.status==='payment';
    const timedOut=lost&&r.hearts>0&&r.remainingMs===0,changePicture=timedOut&&timeoutRetries.has(puzzle().id);
    $('board-shell').classList.toggle('covered',!playing&&!won&&!answerReview);$('board-curtain').hidden=playing||won||!!answerReview;
    $('board-shell').classList.toggle('reviewing',!!answerReview);
    $('gate-eyebrow').textContent=pending?'쭈 사용 확인':lost?'이번 도전 종료':'1분 도전';
    $('gate-title').textContent=pending?(paymentBusy?'잠깐만 기다려 주세요':'구매 결과를 확인해 주세요'):lost?(r.hearts===0?'하트를 모두 썼어요':'시간이 다 됐어요'):'준비됐나요?';
    $('gate-copy').textContent=pending?'확인하는 동안 시간은 멈춰요. 같은 구매는 한 번만 차감돼요.':lost?(r.hearts===0?'다시 풀기를 누르면 하트 3개로 새로 시작해요.':changePicture?'같은 그림 재도전은 1번까지예요. 다른 그림을 풀거나 1쭈로 30초를 연장할 수 있어요.':'같은 그림으로 한 번 다시 풀 수 있어요. 1쭈로 30초 연장도 가능해요.'):`하트 ${r.hearts}개 · ${Math.ceil(r.remainingMs/1000)}초 안에 다른 곳 여섯 개를 찾아보세요.`;
    $('start').textContent=!imagesReady?'그림 불러오는 중':pending?(paymentBusy?'확인 중…':'구매 다시 확인'):lost?(changePicture?'다른 그림 풀기':'다시 풀기'):'시작하기';
    $('reset').textContent=changePicture?'다른 그림 풀기':'다시 풀기';$('reset').setAttribute('aria-label',changePicture?'다른 그림 풀기':'이 문제 다시 풀기');
    $('start').disabled=!imagesReady||paymentBusy||!!answerReview;
    const showPreviousHint=r.hintIndex!==null&&!found().includes(r.hintIndex)&&$('hint-panel').hidden;
    const unpaidHint=puzzle().spots.some((_,i)=>!found().includes(i)&&!r.paid.includes(i));
    const hintLabel=showPreviousHint||!unpaidHint?'힌트 다시 보기':r.paid.length?'다음 힌트 · 1쭈':'힌트 · 1쭈';
    for(const id of ['hint','zoom-hint']){$(id).disabled=!playing||paymentBusy||!!answerReview;$(id).textContent=showPreviousHint||!unpaidHint?'힌트 보기':'힌트 · 1쭈';$(id).setAttribute('aria-label',hintLabel);}
    const extendable=!r.timeBought&&(playing||(lost&&r.hearts>0))&&!paymentBusy&&!answerReview;
    for(const id of ['extend','zoom-extend'])$(id).disabled=!extendable;
    $('zoom').disabled=(!playing&&!won&&!answerReview)||paymentBusy||!imagesReady;
    $('prev').disabled=position()===0||paymentBusy||pending;$('next').disabled=position()===47||paymentBusy||pending;
    $('stage-picker').disabled=paymentBusy||pending;$('reset').disabled=paymentBusy||pending||!!answerReview;$('wallet-logout').disabled=paymentBusy;
    $('continue').disabled=paymentBusy||pending||!!answerReview;
    const canViewAnswers=wallet.getState().canViewAnswers===true;
    for(const id of ['reveal-answers','zoom-reveal-answers']){
      $(id).hidden=!canViewAnswers;$(id).disabled=!imagesReady||paymentBusy||pending;
      $(id).textContent=answerReview?'정답 닫기':'정답 보기';$(id).setAttribute('aria-pressed',String(!!answerReview));
    }
    $('answer-review').hidden=!answerReview;
    if(answerReview){
      $('review-answers').replaceChildren(...answerOrder().map((i,index)=>{const li=document.createElement('li');li.value=index+1;li.textContent=puzzle().spots[i].text;return li;}));
      $('found-details').hidden=true;
    }
    renderHearts();renderTime();
  }
  function refresh(){
    const ids=found();renderMarks();$('found-count').textContent=ids.length;
    $('dots').replaceChildren(...Array.from({length:6},(_,i)=>{const dot=document.createElement('span');dot.className='dot'+(i<ids.length?' found':'');return dot;}));
    const solved=puzzles.filter(p=>(state.found[p.id]||[]).length===6).length;$('solved-total').textContent=solved;
    for(const option of $('stage-picker').options){const p=puzzles[Number(option.value)];option.textContent=`${String(state.order.indexOf(Number(option.value))+1).padStart(2,'0')}. ${p.title}${(state.found[p.id]||[]).length===6?' ✓':''}`;}
    $('found-details').hidden=ids.length===0;$('found-summary').textContent=`${ids.length} / 6`;
    $('answers').replaceChildren(...ids.map((i,order)=>{const li=document.createElement('li');li.value=order+1;li.textContent=puzzle().spots[i].text;return li;}));
    $('continue').textContent=position()===47?'아직 안 푼 문제':'다음 문제';$('continue').hidden=solved===48;
    $('zoom-status').textContent=answerReview?'정답 확인 중 · 시간 정지 · 쭈 차감 없음':`${ids.length} / 6 찾았어요`;
    refreshControls();save();
  }
  function hideHint(clear=false){
    clearTimeout(hintTimer);$('hint-panel').hidden=true;
    if(clear)round().hintIndex=null;
    surfaces.forEach(s=>s.querySelectorAll('.hint-mark').forEach(m=>m.remove()));
    refreshControls();
  }
  function showHint(){
    const i=round().hintIndex;if(i===null||!round().paid.includes(i))return;
    $('hint-text').textContent=puzzle().spots[i].text;$('hint-panel').hidden=false;
    speak(`힌트: ${puzzle().spots[i].text}`);refreshControls();
  }
  function closeAnswers(announce=false){
    if(!answerReview)return;
    const wasPlaying=answerReview.wasPlaying;answerReview=null;
    if(wasPlaying&&round().status==='ready'){
      round().status='playing';round().deadline=Date.now()+round().remainingMs;
    }
    refresh();if(announce)speak(wasPlaying?'정답을 닫았어요. 이어서 찾아보세요.':'정답을 닫았어요.');
  }
  function toggleAnswers(){
    if(wallet.getState().canViewAnswers!==true||!imagesReady||paymentBusy||round().pending)return;
    if(answerReview){closeAnswers(true);return;}
    tick();const r=round();answerReview={wasPlaying:r.status==='playing'};
    if(answerReview.wasPlaying){r.remainingMs=core.timeLeft(r);r.deadline=null;r.status='ready';}
    hideHint();refresh();speak('정답 6곳을 표시했어요. 확인하는 동안 시간은 멈춰요.');
  }
  function clearCelebration(){
    clearTimeout(celebrationTimer);celebrationTimer=null;
    if(celebration.open)celebration.close();
  }
  function nextUnsolved(){
    const pos=position();
    return [...state.order.slice(pos+1),...state.order.slice(0,pos)].find(i=>(state.found[puzzles[i].id]||[]).length<6);
  }
  function celebrate(){
    clearCelebration();const completed=state.current,token=loadToken,next=nextUnsolved();
    $('celebration-title').textContent=next===undefined?'모든 그림을 완성했어요!':'축하해요! 모두 찾았어요!';
    $('celebration-copy').textContent=next===undefined?'48개의 그림을 모두 풀었어요. 정말 대단해요!':'여섯 곳 모두 정답! 잠시 후 다음 그림으로 넘어가요.';
    const advance=()=>{
      if(state.current!==completed||loadToken!==token||round().status!=='won')return;
      clearCelebration();
      if(next!==undefined){show(next,{autoStart:true});window.scrollTo({top:0,behavior:'instant'});}
    };
    const button=$('celebration-next');button.textContent=next===undefined?'완료':'다음 그림';button.onclick=advance;
    $('celebration-confetti').replaceChildren(...Array.from({length:20},(_,i)=>{
      const piece=document.createElement('i');piece.style.setProperty('--piece',i);piece.style.setProperty('--color',['#ffb547','#8b7bd8','#ff789a','#57c6b0','#5a9de2'][i%5]);return piece;
    }));
    celebration.showModal();button.focus({preventScroll:true});
    if(next!==undefined)celebrationTimer=setTimeout(advance,2400);
  }
  function startNextWhenReady(){
    if(autoStartToken!==loadToken||!imagesReady||document.hidden)return;
    autoStartToken=null;start();surfaces[0].focus({preventScroll:true});
  }
  celebration.addEventListener('cancel',()=>{clearTimeout(celebrationTimer);celebrationTimer=null;});
  window.addEventListener('pagehide',()=>{clearCelebration();autoStartToken=null;});
  function finish(reason){
    const r=round();if(r.status!=='playing')return;
    r.remainingMs=core.timeLeft(r);r.deadline=null;r.status=reason==='won'?'won':'lost';
    if(reason==='time')r.remainingMs=0;
    if(zoomDialog.open)zoomDialog.close();hideHint();refresh();
    speak(reason==='won'?'여섯 곳을 모두 찾았어요!':reason==='time'?'시간이 다 됐어요. 1쭈로 30초를 연장할 수 있어요.':'하트를 모두 썼어요. 다시 도전해 보세요.',reason==='won');
    if(!r.assisted&&r.rankOwner){
      const score=found().length,owner=r.rankOwner;
      if(window.parent!==window)window.parent.postMessage({type:'ojjuda:spot-score',score,owner},window.location.origin);
      else Promise.resolve(wallet.recordScore?.(owner,score)).catch(()=>speak('점수를 저장하지 못했어요. 인터넷 연결을 확인해 주세요.'));
    }
    if(r.assisted)speak('도움을 사용한 판은 순위에 반영하지 않아요.',reason==='won');
    if(reason==='won')celebrate();
  }
  function tick(){if(round().status==='playing'&&core.timeLeft(round())<=0)finish('time');else renderTime();}
  function start(){
    if(!imagesReady||paymentBusy||answerReview)return;
    const r=round();if(r.status==='payment'){purchase();return;}if(r.status==='lost'){reset();return;}
    if(r.status!=='ready')return;
    r.rankOwner=wallet.getState().userId;r.status='playing';r.deadline=Date.now()+r.remainingMs;refresh();
    speak('시작! 다른 곳 여섯 개를 찾아보세요.');
    if(r.hintIndex!==null)showHint();
  }
  function show(index,{autoStart=false}={}){
    if(!Number.isInteger(index)||index<0||index>=puzzles.length)throw new Error('문제 번호를 확인해 주세요.');
    if(paymentBusy)return;
    clearCelebration();autoStartToken=null;
    closeAnswers();if(zoomDialog.open)zoomDialog.close();hideHint();state.current=index;imagesReady=false;keyboardPoint={x:50,y:50};
    $('found-details').open=false;$('hint-panel').hidden=true;
    const p=puzzle();$('scene-title').textContent=p.title;$('stage-label').textContent=`문제 ${String(position()+1).padStart(2,'0')} / 48 · 무작위 순서`;
    const layers=p.layers||(p.contrast?[p.contrast]:[]);
    $('stage-picker').value=index;$('load-error').hidden=true;const token=++loadToken,loaded=new Set(),required=2+layers.length;autoStartToken=autoStart?token:null;
    surfaces.forEach(surface=>surface.querySelectorAll('.contrast-overlay').forEach(image=>image.remove()));
    function loadedSide(side){if(token!==loadToken)return;loaded.add(side);if($(side))$(side).parentElement.classList.remove('loading');if(loaded.size===required){imagesReady=true;$('load-error').hidden=true;refreshControls();startNextWhenReady();}}
    for(const side of ['original','difference']){
      const im=$(side);im.parentElement.classList.add('loading');im.onload=()=>loadedSide(side);
      im.onerror=()=>{if(token!==loadToken)return;imagesReady=false;$('load-error').hidden=false;im.parentElement.classList.add('loading');refreshControls();};
      im.alt=`${p.title} · ${side==='original'?'첫 번째':'두 번째'} 그림`;im.src=p[side];$('zoom-'+side).src=p[side];
      if(im.complete&&im.naturalWidth)loadedSide(side);
    }
    layers.forEach((layer,layerIndex)=>{
      const layerKey=`overlay-${layerIndex}`;
      const clips=layer.regions.map(region=>{
        if(region.shape!=='rect')return {image:`radial-gradient(ellipse ${region.rx}% ${region.ry}% at ${region.x}% ${region.y}%, #000 94%, transparent 100%)`,size:'100% 100%',position:'0% 0%'};
        const left=Math.max(0,region.x-region.rx),top=Math.max(0,region.y-region.ry),width=Math.min(100,region.x+region.rx)-left,height=Math.min(100,region.y+region.ry)-top;
        return {image:'linear-gradient(#000,#000)',size:`${width}% ${height}%`,position:`${width===100?0:left/(100-width)*100}% ${height===100?0:top/(100-height)*100}%`};
      });
      const mask=clips.map(clip=>clip.image).join(','),maskSize=clips.map(clip=>clip.size).join(','),maskPosition=clips.map(clip=>clip.position).join(',');
      for(const surface of surfaces.filter(surface=>surface.dataset.side==='difference')){
        const image=document.createElement('img');image.className='contrast-overlay';image.alt='';image.setAttribute('aria-hidden','true');image.draggable=false;
        image.style.maskImage=mask;image.style.webkitMaskImage=mask;
        image.style.maskSize=maskSize;image.style.webkitMaskSize=maskSize;image.style.maskPosition=maskPosition;image.style.webkitMaskPosition=maskPosition;
        const main=!surface.classList.contains('zoom-picture');
        if(main){image.onload=()=>loadedSide(layerKey);image.onerror=()=>{if(token!==loadToken)return;imagesReady=false;$('load-error').hidden=false;refreshControls();};}
        surface.insertBefore(image,surface.querySelector('.marks'));image.src=layer.image;
        if(main&&image.complete&&image.naturalWidth)loadedSide(layerKey);
      }
    });
    tick();refresh();
    startNextWhenReady();
    speak(round().status==='won'?'이 장면은 이미 완성했어요.':round().status==='playing'?'이어서 찾아보세요.':'시작을 누르면 시간이 흘러요.');
  }
  function reset(){
    if(paymentBusy||round().pending||answerReview)return;
    if(round().status==='playing'&&found().length&&!confirm('찾은 표시를 지우고 하트 3개, 1분으로 다시 풀까요?'))return;
    const r=round(),timedOut=r.status==='lost'&&r.hearts>0&&r.remainingMs===0;
    let index=state.current;
    if(timedOut){
      if(timeoutRetries.has(puzzle().id))index=nextUnsolved()??state.order[(position()+1)%state.order.length];
      else timeoutRetries.add(puzzle().id);
    }
    const id=puzzles[index].id;
    state.found[id]=[];state.rounds[id]=core.freshRound();show(index);
  }
  function guess(x,y,surface){
    tick();const r=round();if(r.status!=='playing'||paymentBusy||!imagesReady||answerReview)return;
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>100||y<0||y>100)return;
    const result=core.hitTest(puzzle(),x,y,found());
    if(!result){
      r.hearts--;if(r.hearts===0){finish('hearts');return;}
      refreshControls();save();speak(`아쉬워요. 하트가 ${r.hearts}개 남았어요.`);
      if(surface){const miss=document.createElement('span');miss.className='miss';miss.textContent='×';miss.setAttribute('aria-hidden','true');Object.assign(miss.style,{left:`${x}%`,top:`${y}%`});surface.querySelector('.marks').append(miss);setTimeout(()=>miss.remove(),800);}return;
    }
    if(result.alreadyFound){speak('이미 찾은 곳이에요.');return;}
    found().push(result.index);if(r.hintIndex===result.index)hideHint(true);
    if(found().length===6){finish('won');return;}refresh();speak(`맞았어요! ${found().length} / 6`,true);
  }
  function openAuth(){if(zoomDialog.open)zoomDialog.close();$('auth-error').textContent='';authDialog.showModal();}
  async function purchase(kind,spot=-1){
    if(paymentBusy||answerReview)return;tick();
    const r=round(),p=puzzle(),w=wallet.getState();
    if(!w.userId){openAuth();return;}
    if(r.pending&&r.pending.userId!==w.userId){speak('구매를 시작한 계정으로 다시 로그인해 주세요.');return;}
    if(!r.pending){
      if(kind==='hint'&&r.status!=='playing')return;
      if(kind==='time'&&(!['playing','lost'].includes(r.status)||r.hearts===0))return;
      const price=1;
      if((kind==='hint'&&r.paid.length>=2)||(kind==='time'&&r.timeBought)){speak('이번 판의 도움 횟수를 모두 사용했어요.');return;}
      if(!confirm(kind==='hint'?'1쭈로 힌트를 볼까요? (판당 2회)':'1쭈로 30초를 추가할까요? (판당 1회)'))return;
      if(w.coins===null){speak('잔액을 먼저 확인해 주세요.');wallet.refresh().catch(()=>{});return;}
      if(w.coins<price){speak(`${price}쭈가 필요해요. 현재 ${w.coins}쭈예요.`);return;}
      if(!globalThis.crypto?.randomUUID){speak('쭈를 사용하려면 온라인 게임 링크에서 열어 주세요.');return;}
      r.remainingMs=core.timeLeft(r);r.pending={kind,spot,requestId:crypto.randomUUID(),userId:w.userId};r.deadline=null;r.status='payment';
      if(!save()){r.pending=null;r.status=r.remainingMs>0?'playing':'lost';r.deadline=r.status==='playing'?Date.now()+r.remainingMs:null;refreshControls();speak('쭈를 쓰려면 브라우저 저장을 허용해 주세요.');return;}
    }
    const request=r.pending;paymentBusy=true;if(zoomDialog.open)zoomDialog.close();refreshControls();
    try{
      const result=await wallet.buy(request,p.id);
      if(result.ok){
        if(result.kind!==request.kind||result.stage!==p.id||result.spot!==request.spot||![1,...(request.kind==='time'?[3]:[])].includes(result.price))throw new Error('구매 결과를 다시 확인해 주세요.');
        r.assisted=true;
        if(request.kind==='time'){const extra=result.extend_ms||60000;r.remainingMs+=extra;r.totalMs+=extra;r.timeBought=true;}
        else{if(!r.paid.includes(request.spot))r.paid.push(request.spot);r.hintIndex=request.spot;}
        r.pending=null;r.status=r.remainingMs>0?'playing':'lost';r.deadline=r.status==='playing'?Date.now()+r.remainingMs:null;
        paymentBusy=false;refresh();
        if(request.kind==='hint'){showHint();speak(`1쭈를 사용했어요. 힌트: ${p.spots[request.spot].text}`);}
        else speak(`${result.price}쭈를 사용하고 ${(result.extend_ms||60000)/1000}초를 더 받았어요!`,true);
      }else{
        r.pending=null;r.status=r.remainingMs>0?'playing':'lost';r.deadline=r.status==='playing'?Date.now()+r.remainingMs:null;
        paymentBusy=false;refresh();
        speak(result.reason==='coins'?'쭈가 부족해요. 차감되지 않았어요.':result.reason==='banned'?'이 계정은 지금 쭈를 사용할 수 없어요.':'구매하지 못했어요. 잔액과 계정을 확인해 주세요.');
      }
    }catch(error){paymentBusy=false;refresh();speak(error.message||'구매 확인을 다시 눌러주세요. 같은 구매는 한 번만 차감돼요.');}
  }
  function hint(){
    tick();const r=round();if(r.status!=='playing'||paymentBusy)return;
    if(r.hintIndex!==null&&!found().includes(r.hintIndex)&&$('hint-panel').hidden){showHint();return;}
    const remaining=puzzle().spots.map((_,i)=>i).filter(i=>!found().includes(i)),unpaid=remaining.filter(i=>!r.paid.includes(i));
    if(unpaid.length&&r.paid.length>=2){speak('힌트는 한 판에 2번까지 사용할 수 있어요.');return;}
    if(unpaid.length)purchase('hint',unpaid[0]);
    else if(remaining.length){r.hintIndex=remaining[(remaining.indexOf(r.hintIndex)+1)%remaining.length];showHint();save();}
  }
  function locateHint(){
    const r=round();if(r.status!=='playing'||r.hintIndex===null||!r.paid.includes(r.hintIndex))return;
    surfaces.forEach(s=>s.querySelectorAll('.hint-mark').forEach(m=>m.remove()));
    for(const surface of surfaces)surface.querySelector('.marks').append(makeMark(puzzle().spots[r.hintIndex],0,true));
    clearTimeout(hintTimer);hintTimer=setTimeout(()=>surfaces.forEach(s=>s.querySelectorAll('.hint-mark').forEach(m=>m.remove())),3500);
  }
  for(const surface of surfaces){
    let down=null;
    surface.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,scrollX:surface.parentElement.scrollLeft,scrollY:surface.parentElement.scrollTop};});
    surface.addEventListener('click',e=>{if(surface.classList.contains('loading')||!down)return;const moved=Math.hypot(e.clientX-down.x,e.clientY-down.y)>9||Math.abs(surface.parentElement.scrollLeft-down.scrollX)>5||Math.abs(surface.parentElement.scrollTop-down.scrollY)>5;down=null;if(moved)return;const point=core.normalizedPoint(surface.getBoundingClientRect(),e.clientX,e.clientY);guess(point.x,point.y,surface);});
    surface.addEventListener('keydown',e=>{
      if(surface.classList.contains('loading')||round().status!=='playing')return;
      const step=e.shiftKey?.3:2,delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[e.key];
      if(delta){e.preventDefault();keyboardPoint.x=Math.max(0,Math.min(100,keyboardPoint.x+delta[0]));keyboardPoint.y=Math.max(0,Math.min(100,keyboardPoint.y+delta[1]));surface.querySelectorAll('.crosshair').forEach(m=>m.remove());const cursor=document.createElement('div');cursor.className='crosshair';cursor.style.left=keyboardPoint.x+'%';cursor.style.top=keyboardPoint.y+'%';surface.querySelector('.marks').append(cursor);}
      else if(e.key==='Enter'||e.key===' '){e.preventDefault();guess(keyboardPoint.x,keyboardPoint.y,surface);}
    });
  }
  for(const i of state.order){const option=document.createElement('option');option.value=i;option.textContent=puzzles[i].title;$('stage-picker').append(option);}
  $('stage-picker').onchange=e=>{show(Number(e.target.value));closeWalletMenu();walletMenu.querySelector('summary').focus();};$('prev').onclick=()=>show(state.order[position()-1]);$('next').onclick=()=>show(state.order[position()+1]);
  $('retry').onclick=()=>show(state.current);$('hint').onclick=hint;$('zoom-hint').onclick=hint;$('hide-hint').onclick=()=>hideHint();$('hint-location').onclick=locateHint;
  $('start').onclick=start;$('reset').onclick=reset;$('extend').onclick=()=>purchase('time');$('zoom-extend').onclick=()=>purchase('time');
  $('reveal-answers').onclick=toggleAnswers;$('zoom-reveal-answers').onclick=()=>{toggleAnswers();closeZoomSettings();};$('close-answers').onclick=()=>closeAnswers(true);
  $('continue').onclick=()=>{const pos=position(),index=pos<47?state.order[pos+1]:state.order.find(i=>(state.found[puzzles[i].id]||[]).length<6);if(index!==undefined)show(index);window.scrollTo({top:0,behavior:'smooth'});};
  const scrollA=$('zoom-scroll-a'),scrollB=$('zoom-scroll-b');let syncing=false;
  function syncScroll(from,to){if(syncing)return;const x=from.scrollLeft/(from.scrollWidth-from.clientWidth||1),y=from.scrollTop/(from.scrollHeight-from.clientHeight||1),nextX=x*(to.scrollWidth-to.clientWidth),nextY=y*(to.scrollHeight-to.clientHeight);if(Math.abs(to.scrollLeft-nextX)<1&&Math.abs(to.scrollTop-nextY)<1)return;syncing=true;to.scrollLeft=nextX;to.scrollTop=nextY;requestAnimationFrame(()=>{syncing=false;});}
  scrollA.addEventListener('scroll',()=>syncScroll(scrollA,scrollB),{passive:true});scrollB.addEventListener('scroll',()=>syncScroll(scrollB,scrollA),{passive:true});
  function resizeZoom(){const x=(scrollA.scrollLeft+scrollA.clientWidth/2)/(scrollA.scrollWidth||1),y=(scrollA.scrollTop+scrollA.clientHeight/2)/(scrollA.scrollHeight||1);for(const surface of document.querySelectorAll('.zoom-picture'))surface.style.width=`${Math.max(850,surface.parentElement.clientWidth)*Number($('zoom-level').value)}px`;for(const pane of [scrollA,scrollB]){pane.scrollLeft=x*pane.scrollWidth-pane.clientWidth/2;pane.scrollTop=y*pane.scrollHeight-pane.clientHeight/2;}}
  function notifyZoom(open){if(window.self!==window.top)window.parent.postMessage({type:'ojjuda:spot-zoom',open},window.location.origin);}
  function closeZoomSettings(){zoomDialog.classList.remove('settings-open');$('zoom-more').setAttribute('aria-expanded','false');}
  $('zoom-more').onclick=()=>{const open=zoomDialog.classList.toggle('settings-open');$('zoom-more').setAttribute('aria-expanded',String(open));if(open)$('zoom-level').focus();};
  $('zoom').onclick=()=>{if($('zoom').disabled)return;closeZoomSettings();$('zoom-tools').classList.remove('has-message');zoomDialog.showModal();document.body.style.overflow='hidden';notifyZoom(true);$('zoom-level').value='1';resizeZoom();for(const pane of [scrollA,scrollB]){pane.scrollLeft=0;pane.scrollTop=0;}refresh();};
  $('close-zoom').onclick=()=>zoomDialog.close();zoomDialog.addEventListener('close',()=>{clearTimeout(zoomNoticeTimer);$('zoom-tools').classList.remove('has-message');closeZoomSettings();notifyZoom(false);document.body.style.overflow='';$('zoom').focus();});$('zoom-level').onchange=()=>{resizeZoom();closeZoomSettings();};window.addEventListener('resize',()=>{if(zoomDialog.open)resizeZoom();});
  $('wallet-login').onclick=openAuth;$('close-auth').onclick=()=>authDialog.close();
  $('login-form').onsubmit=async e=>{e.preventDefault();$('login-submit').disabled=true;$('auth-error').textContent='';try{await wallet.signIn($('email').value.trim(),$('password').value);$('password').value='';authDialog.close();speak('오쭈다 계정으로 연결했어요.');}catch(error){$('auth-error').textContent=error.message;}finally{$('password').value='';$('login-submit').disabled=false;}};
  authDialog.addEventListener('close',()=>{$('password').value='';});
  const walletMenu=$('wallet-menu');
  function closeWalletMenu(){walletMenu.removeAttribute('open');}
  walletMenu.addEventListener('click',event=>{const button=event.target.closest('button');if(button&&!button.disabled){closeWalletMenu();if(walletMenu.contains(document.activeElement))walletMenu.querySelector('summary').focus();}});
  document.addEventListener('click',event=>{if(!walletMenu.contains(event.target))closeWalletMenu();});
  walletMenu.addEventListener('keydown',event=>{if(event.key==='Escape'&&walletMenu.hasAttribute('open')){event.preventDefault();event.stopPropagation();closeWalletMenu();walletMenu.querySelector('summary').focus();}});
  walletMenu.addEventListener('focusout',event=>{if(!walletMenu.contains(event.relatedTarget))closeWalletMenu();});
  $('wallet-refresh').onclick=()=>{closeWalletMenu();walletMenu.querySelector('summary').focus();return wallet.refresh().catch(()=>speak('인터넷 연결을 확인해 주세요.'));};
  $('wallet-logout').onclick=async()=>{if(paymentBusy)return;closeWalletMenu();walletMenu.querySelector('summary').focus();try{await wallet.signOut();$('wallet-login').focus();speak('로그아웃했어요.');}catch{speak('로그아웃하지 못했어요. 다시 시도해 주세요.');}};
  wallet.subscribe(w=>{
    if(w.canViewAnswers!==true&&answerReview)closeAnswers();
    $('wallet-balance').textContent=w.userId?(w.coins===null?'잔액 확인 중':`${w.coins.toLocaleString()}쭈`):'로그인 필요';
    $('wallet-login').hidden=!!w.userId;$('wallet-refresh').hidden=!w.userId;$('wallet-logout').hidden=!w.userId;
    $('wallet-note').textContent=w.error||`힌트 1개 1쭈 · 1분 연장 3쭈${w.userId?'':' · 로그인 후 이용할 수 있어요.'}`;
    $('wallet-note').classList.toggle('error-note',!!w.error);refreshControls();
  });
  show(state.current);setInterval(tick,200);window.addEventListener('pageshow',event=>{if(event.persisted){location.reload();return;}tick();});document.addEventListener('visibilitychange',()=>{tick();startNextWhenReady();});
  if(document.modelContext?.registerTool){
    const lifecycle=new AbortController(),tools=[
      {name:'read_game_progress',title:'게임 진행 보기',description:'현재 장면, 하트와 남은 시간을 확인합니다.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>({stage:puzzle().id,position:position()+1,title:puzzle().title,found:found().length,hearts:round().hearts,seconds:Math.ceil(core.timeLeft(round())/1000),status:round().status,totalStages:48})},
      {name:'open_game_stage',title:'게임 장면 선택',description:'1~48번 중 지정한 장면을 엽니다. 쭈를 사용하지 않습니다.',inputSchema:{type:'object',properties:{stage:{type:'integer',minimum:1,maximum:48}},required:['stage'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||!Number.isInteger(input.stage)||input.stage<1||input.stage>48)throw new Error('1~48 사이 문제 번호가 필요해요.');if(paymentBusy)throw new Error('구매 확인 중이에요.');show(input.stage-1);return {stage:puzzle().id,title:puzzle().title,found:found().length};}}
    ];
    for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  }
})();
