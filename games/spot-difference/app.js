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
  let autoStartToken=null;
  const celebration=$('celebration');
  let zoomNoticeTimer=null,loadToken=0,imagesReady=false,paymentBusy=false,keyboardPoint={x:50,y:50},answerReview=null;
  const puzzle=()=>puzzles[state.current];
  const found=()=>state.found[puzzle().id]||(state.found[puzzle().id]=[]);
  const round=()=>state.rounds[puzzle().id]||(state.rounds[puzzle().id]=core.freshRound());
  const position=()=>state.order.indexOf(state.current);
  function save(){
    try{localStorage.setItem(storageKey,JSON.stringify({version:2,...state}));storageWorks=true;}catch{storageWorks=false;}
    $('storage-note').textContent=storageWorks?'게임을 다시 열면 처음부터 시작하고 사진도 새로 섞여요.':'게임은 다시 열면 처음부터 시작해요. ZU를 쓰려면 브라우저 저장을 허용해 주세요.';
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
    if(isHint){
      // Pictures use a 3:2 ratio; fit the hint area inside a true circle.
      mark.style.width=`${Math.max(spot.rx,spot.ry*2/3)*2}%`;mark.style.height='auto';
    }else{const label=document.createElement('span');label.textContent=number;mark.append(label);if(spot.x+spot.rx>94)mark.classList.add('label-left');if(spot.y-spot.ry<5)mark.classList.add('label-below');}return mark;
  }
  function answerOrder(){return [...found(),...puzzle().spots.map((_,i)=>i).filter(i=>!found().includes(i))];}
  function renderMarks(){
    const order=answerReview?answerOrder():found();
    for(const surface of surfaces){
      const layer=surface.querySelector('.marks');
      for(const mark of [...layer.children])if(!mark.classList.contains('hint-mark'))mark.remove();
      layer.append(...order.map((spotIndex,index)=>{
        const mark=makeMark(puzzle().spots[spotIndex],index+1);
        if(answerReview&&!found().includes(spotIndex))mark.classList.add('answer-mark');
        return mark;
      }));
    }
    renderHintMarks();
  }
  function renderHintMarks(){
    const r=round(),active=!answerReview&&['playing','payment'].includes(r.status);
    const remaining=active?r.paid.filter(i=>!found().includes(i)):[];
    const keys=new Set(remaining.map(i=>`${puzzle().id}:${i}`));
    for(const surface of surfaces){
      const layer=surface.querySelector('.marks'),existing=new Set();
      for(const mark of layer.querySelectorAll('.hint-mark')){
        if(keys.has(mark.dataset.hintKey))existing.add(mark.dataset.hintKey);else mark.remove();
      }
      for(const i of remaining){
        const key=`${puzzle().id}:${i}`;if(existing.has(key))continue;
        const mark=makeMark(puzzle().spots[i],0,true);mark.dataset.hintKey=key;layer.append(mark);
      }
    }
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
    $('board-shell').classList.toggle('covered',!playing&&!won&&!answerReview);$('board-curtain').hidden=playing||won||!!answerReview;
    $('board-shell').classList.toggle('reviewing',!!answerReview);$('board-curtain').dataset.entry=!playing&&!won&&!lost&&!pending&&!answerReview?'menu':'round';
    $('gate-eyebrow').textContent=pending?'ZU 사용 확인':lost?'이번 도전 종료':'오쭈다 오락실';
    $('gate-title').textContent=pending?(paymentBusy?'잠깐만 기다려 주세요':'구매 결과를 확인해 주세요'):lost?(r.hearts===0?'하트를 모두 썼어요':'시간이 다 됐어요'):'틀린그림찾기';
    $('gate-copy').textContent=pending?'확인하는 동안 시간은 멈춰요. 같은 구매는 한 번만 차감돼요.':lost?'이전·현재·다음 레벨 중 골라 새로 시작하세요.':'두 그림에서 다른 곳 여섯 개를 찾아보세요. 여섯 곳을 모두 찾은 그림 장수로 순위를 정해요.';
    $('retry-level-choice').hidden=!lost||!!answerReview;
    if(lost)updateEndChoice($('retry-level'),0);
    $('gate-entry-hint').hidden=pending||lost;$('gate-entry-hint').textContent=`하트 ${r.hearts}개 · ${Math.ceil(r.remainingMs/1000)}초 도전`;
    $('start').textContent=!imagesReady?'그림 불러오는 중':pending?(paymentBusy?'확인 중…':'구매 다시 확인'):lost?'선택한 레벨 시작':'시작하기';
    $('start').disabled=!imagesReady||paymentBusy||!!answerReview;
    const showPreviousHint=r.hintIndex!==null&&!found().includes(r.hintIndex)&&$('hint-panel').hidden;
    const unpaidHint=puzzle().spots.some((_,i)=>!found().includes(i)&&!r.paid.includes(i));
    const hintLabel=showPreviousHint||!unpaidHint?'힌트 다시 보기':r.paid.length?'다음 힌트 · 1 ZU':'힌트 · 1 ZU';
    for(const id of ['hint','zoom-hint']){
      const label=pending?(paymentBusy?'확인 중…':'구매 다시 확인'):hintLabel;
      $(id).disabled=(!playing&&!pending)||paymentBusy||!!answerReview;
      $(id).textContent=pending?label:showPreviousHint||!unpaidHint?'힌트 보기':'힌트 · 1 ZU';
      $(id).setAttribute('aria-label',label);$(id).classList.toggle('ju-paid-action',!pending&&!showPreviousHint&&unpaidHint);
    }
    const extendable=!r.timeBought&&(playing||(lost&&r.hearts>0))&&!paymentBusy&&!answerReview;
    for(const id of ['extend','zoom-extend'])$(id).disabled=!extendable;
    $('zoom').disabled=(!playing&&!won&&!answerReview)||paymentBusy||!imagesReady;
    $('prev').disabled=position()===0||paymentBusy||pending;$('next').disabled=position()===puzzles.length-1||paymentBusy||pending;
    $('stage-picker').disabled=paymentBusy||pending;$('reset').disabled=paymentBusy||pending||!!answerReview;$('wallet-logout').disabled=paymentBusy;
    $('continue').disabled=paymentBusy||pending||!!answerReview;
    for(const id of ['game-home','zoom-home'])$(id).setAttribute('aria-disabled',String(paymentBusy));
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
    $('continue').textContent=position()===puzzles.length-1?'아직 안 푼 문제':'다음 문제';$('continue').hidden=solved===puzzles.length;
    $('zoom-status').textContent=answerReview?'정답 확인 중 · 시간 정지 · ZU 차감 없음':`${ids.length} / 6 찾았어요`;
    refreshControls();save();
  }
  function hideHint(clear=false){
    $('hint-panel').hidden=true;
    if(clear)round().hintIndex=null;
    renderHintMarks();
    refreshControls();
  }
  function showHint(){
    const i=round().hintIndex;if(i===null||!round().paid.includes(i))return;
    $('hint-text').textContent=puzzle().spots[i].text;$('hint-panel').hidden=false;
    renderHintMarks();speak(`힌트: ${puzzle().spots[i].text} · 점선 원 안을 찾아보세요.`);refreshControls();
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
    if(celebration.open)celebration.close();
  }
  function updateEndChoice(select,preferred){
    const stamp=`${loadToken}:${round().status}`;
    if(select.dataset.round===stamp)return;
    select.dataset.round=stamp;
    select.replaceChildren(...[-1,0,1].map((offset,i)=>{
      const option=document.createElement('option'),pos=position()+offset;
      option.value=offset;option.disabled=pos<0||pos>=state.order.length;
      option.textContent=`${['이전 레벨','현재 레벨','다음 레벨'][i]} · ${option.disabled?'없음':`${pos+1} / ${puzzles.length}`}`;
      return option;
    }));
    select.value=preferred===1&&position()<state.order.length-1?'1':'0';
  }
  function playChosenLevel(select){
    if(paymentBusy||round().pending||!['won','lost'].includes(round().status))return;
    const offset=Number(select.value);
    if(![-1,0,1].includes(offset))return;
    const index=state.order[position()+offset];
    if(index===undefined)return;
    const id=puzzles[index].id;
    if(state.rounds[id]?.pending){show(index);return;}
    state.found[id]=[];state.rounds[id]=core.freshRound();
    show(index,{autoStart:true});window.scrollTo({top:0,behavior:'instant'});
  }
  function celebrate(){
    clearCelebration();const allDone=puzzles.every(p=>(state.found[p.id]||[]).length===6);
    $('celebration-title').textContent=allDone?'모든 그림을 완성했어요!':'축하해요! 모두 찾았어요!';
    $('celebration-copy').textContent=allDone?`${puzzles.length}개의 그림을 모두 풀었어요. 원하는 레벨을 다시 즐겨보세요.`:'이전·현재·다음 레벨 중 골라 이어서 즐겨보세요.';
    updateEndChoice($('celebration-level'),1);
    const button=$('celebration-next');button.onclick=()=>playChosenLevel($('celebration-level'));
    $('celebration-confetti').replaceChildren(...Array.from({length:20},(_,i)=>{
      const piece=document.createElement('i');piece.style.setProperty('--piece',i);piece.style.setProperty('--color',['#ffb547','#8b7bd8','#ff789a','#57c6b0','#5a9de2'][i%5]);return piece;
    }));
    celebration.showModal();$('celebration-level').focus({preventScroll:true});
  }
  function startNextWhenReady(){
    if(autoStartToken!==loadToken||!imagesReady||document.hidden)return;
    autoStartToken=null;start();surfaces[0].focus({preventScroll:true});
  }
  window.addEventListener('pagehide',()=>{clearCelebration();autoStartToken=null;});
  function finish(reason){
    const r=round();if(r.status!=='playing')return;
    r.remainingMs=core.timeLeft(r);r.deadline=null;r.status=reason==='won'?'won':'lost';
    if(reason==='time')r.remainingMs=0;
    if(zoomDialog.open)zoomDialog.close();hideHint();refresh();
    speak(reason==='won'?'여섯 곳을 모두 찾았어요!':reason==='time'?'시간이 다 됐어요. 1 ZU로 30초를 연장할 수 있어요.':'하트를 모두 썼어요. 다시 도전해 보세요.',reason==='won');
    if(window.parent!==window)window.parent.postMessage({type:'ojjuda:spot-finished'},window.location.origin);
    if(reason==='won'&&found().length===6&&(r.rankOwner||window.parent!==window)){
      const stage=puzzle().id,owner=r.rankOwner;
      if(window.parent!==window)window.parent.postMessage({type:'ojjuda:spot-clear',stage,owner},window.location.origin);
      else Promise.resolve(wallet.recordClear?.(owner,stage)).then(result=>{if(!result?.ok)throw Error('save');}).catch(()=>speak('완료 기록을 저장하지 못했어요. 인터넷 연결을 확인해 주세요.'));
    }
    if(reason==='won')celebrate();
  }
  function tick(){if(round().status==='playing'&&core.timeLeft(round())<=0)finish('time');else renderTime();}
  function start(){
    if(!imagesReady||paymentBusy||answerReview)return;
    const r=round();if(r.status==='payment'){purchase();return;}if(r.status==='lost'){playChosenLevel($('retry-level'));return;}
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
    const p=puzzle();$('scene-title').textContent=p.title;$('stage-label').textContent=`문제 ${String(position()+1).padStart(2,'0')} / ${puzzles.length} · 무작위 순서${p.difficulty==='hard'?' · 어려움':''}`;
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
    const id=puzzle().id;
    state.found[id]=[];state.rounds[id]=core.freshRound();show(state.current);
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
      if(!confirm(kind==='hint'?'1 ZU로 힌트를 볼까요? (판당 2회)':'1 ZU로 30초를 추가할까요? (판당 1회)'))return;
      if(w.coins===null){speak('잔액을 먼저 확인해 주세요.');wallet.refresh().catch(()=>{});return;}
      if(w.coins<price){speak(`${price} ZU가 필요해요. 현재 ${w.coins} ZU예요.`);return;}
      if(!globalThis.crypto?.randomUUID){speak('ZU를 사용하려면 온라인 게임 링크에서 열어 주세요.');return;}
      r.remainingMs=core.timeLeft(r);r.pending={kind,spot,requestId:crypto.randomUUID(),userId:w.userId};r.deadline=null;r.status='payment';
      if(!save()){r.pending=null;r.status=r.remainingMs>0?'playing':'lost';r.deadline=r.status==='playing'?Date.now()+r.remainingMs:null;refreshControls();speak('ZU를 쓰려면 브라우저 저장을 허용해 주세요.');return;}
    }
    // Keep the active zoom dialog, scale and scroll position while verifying payment.
    const request=r.pending;paymentBusy=true;refreshControls();
    speak('ZU 사용을 확인하고 있어요. 확인하는 동안 시간은 멈춰요.');
    try{
      const result=await wallet.buy(request,p.id);
      if(result.ok){
        if(result.kind!==request.kind||result.stage!==p.id||result.spot!==request.spot||![1,...(request.kind==='time'?[3]:[])].includes(result.price))throw new Error('구매 결과를 다시 확인해 주세요.');
        r.assisted=true;
        if(request.kind==='time'){const extra=result.extend_ms||60000;r.remainingMs+=extra;r.totalMs+=extra;r.timeBought=true;}
        else{if(!r.paid.includes(request.spot))r.paid.push(request.spot);r.hintIndex=request.spot;}
        r.pending=null;r.status=r.remainingMs>0?'playing':'lost';r.deadline=r.status==='playing'?Date.now()+r.remainingMs:null;
        paymentBusy=false;refresh();
        if(request.kind==='hint'){showHint();speak(`1 ZU를 사용했어요. 힌트: ${p.spots[request.spot].text} · 찾을 때까지 점선 원이 표시돼요.`);}
        else speak(`${result.price} ZU를 사용하고 ${(result.extend_ms||60000)/1000}초를 더 받았어요!`,true);
      }else{
        r.pending=null;r.status=r.remainingMs>0?'playing':'lost';r.deadline=r.status==='playing'?Date.now()+r.remainingMs:null;
        paymentBusy=false;refresh();
        speak(result.reason==='coins'?'ZU가 부족해요. 차감되지 않았어요.':result.reason==='banned'?'이 계정은 지금 ZU를 사용할 수 없어요.':'구매하지 못했어요. 잔액과 계정을 확인해 주세요.');
      }
    }catch(error){paymentBusy=false;refresh();speak(error.message||'구매 확인을 다시 눌러주세요. 같은 구매는 한 번만 차감돼요.');}
  }
  function hint(){
    tick();const r=round();if(paymentBusy)return;
    if(r.pending){purchase();return;}
    if(r.status!=='playing')return;
    if(r.hintIndex!==null&&!found().includes(r.hintIndex)&&$('hint-panel').hidden){showHint();return;}
    const remaining=puzzle().spots.map((_,i)=>i).filter(i=>!found().includes(i)),unpaid=remaining.filter(i=>!r.paid.includes(i));
    if(unpaid.length&&r.paid.length>=2){speak('힌트는 한 판에 2번까지 사용할 수 있어요.');return;}
    if(unpaid.length)purchase('hint',unpaid[0]);
    else if(remaining.length){r.hintIndex=remaining[(remaining.indexOf(r.hintIndex)+1)%remaining.length];showHint();save();}
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
  $('stage-total').textContent=puzzles.length;
  for(const [category,label] of [['city','도시 풍경 · 어려움'],['mountain','사계절 산 · 어려움'],['daily','쭈다의 일상']]){
    const group=document.createElement('optgroup');group.label=label;
    for(const i of state.order.filter(i=>(puzzles[i].category||'daily')===category)){const option=document.createElement('option');option.value=i;option.textContent=puzzles[i].title;group.append(option);}
    if(group.children.length)$('stage-picker').append(group);
  }
  $('stage-picker').onchange=e=>{show(Number(e.target.value));closeWalletMenu();walletMenu.querySelector('summary').focus();};$('prev').onclick=()=>show(state.order[position()-1]);$('next').onclick=()=>show(state.order[position()+1]);
  $('retry').onclick=()=>show(state.current);$('hint').onclick=hint;$('zoom-hint').onclick=hint;$('hide-hint').onclick=()=>hideHint();
  $('start').onclick=start;$('reset').onclick=reset;$('extend').onclick=()=>purchase('time');$('zoom-extend').onclick=()=>purchase('time');
  $('reveal-answers').onclick=toggleAnswers;$('zoom-reveal-answers').onclick=()=>{toggleAnswers();closeZoomSettings();};$('close-answers').onclick=()=>closeAnswers(true);
  $('continue').onclick=()=>{const pos=position(),index=pos<puzzles.length-1?state.order[pos+1]:state.order.find(i=>(state.found[puzzles[i].id]||[]).length<6);if(index!==undefined)show(index);window.scrollTo({top:0,behavior:'smooth'});};
  const scrollA=$('zoom-scroll-a'),scrollB=$('zoom-scroll-b'),zoomPanes=[scrollA,scrollB];let zoomScale=1;
  const picturePointers=new Map();let pictureDrag=false,picturePinch=null,picturePane=null,ignorePictureClickUntil=0;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const zoomBase=()=>Math.max(850,scrollA.clientWidth,scrollB.clientWidth);
  const fitZoom=()=>Math.min(1,Math.max(...zoomPanes.map(p=>(p.clientWidth||850)/zoomBase())));
  function syncScroll(from,to){
    const x=from.scrollLeft/(from.scrollWidth-from.clientWidth||1),y=from.scrollTop/(from.scrollHeight-from.clientHeight||1);
    const nextX=x*Math.max(0,to.scrollWidth-to.clientWidth),nextY=y*Math.max(0,to.scrollHeight-to.clientHeight);
    if(Math.abs(to.scrollLeft-nextX)<1&&Math.abs(to.scrollTop-nextY)<1)return;
    to.scrollLeft=nextX;to.scrollTop=nextY;
  }
  scrollA.addEventListener('scroll',()=>syncScroll(scrollA,scrollB),{passive:true});scrollB.addEventListener('scroll',()=>syncScroll(scrollB,scrollA),{passive:true});
  function zoomAnchor(pane,x,y){
    const rect=pane.getBoundingClientRect(),picture=pane.querySelector('.zoom-picture').getBoundingClientRect();
    const left=Number.isFinite(x)?clamp(x-rect.left,0,pane.clientWidth):pane.clientWidth/2,top=Number.isFinite(y)?clamp(y-rect.top,0,pane.clientHeight):pane.clientHeight/2;
    return {u:(pane.scrollLeft+left)/(picture.width||pane.scrollWidth||1),v:(pane.scrollTop+top)/(picture.height||pane.scrollHeight||1),x:left/(pane.clientWidth||1),y:top/(pane.clientHeight||1)};
  }
  function resizeZoom(scale=zoomScale,anchor=zoomAnchor(scrollA)){
    zoomScale=clamp(Number.isFinite(scale)?scale:zoomScale,fitZoom(),3);
    const width=zoomBase()*zoomScale;
    for(const surface of document.querySelectorAll('.zoom-picture'))surface.style.width=`${width}px`;
    for(const pane of zoomPanes){const picture=pane.querySelector('.zoom-picture').getBoundingClientRect();pane.scrollLeft=anchor.u*(picture.width||pane.scrollWidth)-anchor.x*pane.clientWidth;pane.scrollTop=anchor.v*(picture.height||pane.scrollHeight)-anchor.y*pane.clientHeight;}
    const preset=[1,1.5,2].find(value=>Math.abs(value-zoomScale)<.001);let custom=$('zoom-custom-level');
    if(preset!==undefined){$('zoom-level').value=String(preset);custom?.remove();}
    else{if(!custom){custom=document.createElement('option');custom.id='zoom-custom-level';$('zoom-level').append(custom);}custom.value=String(zoomScale);custom.textContent=`${Math.round(zoomScale*100)}%`;$('zoom-level').value=custom.value;}
  }
  function notifyZoom(open){if(window.self!==window.top)window.parent.postMessage({type:'ojjuda:spot-zoom',open},window.location.origin);}
  function goHome(event){
    if(paymentBusy){event.preventDefault();speak('ZU 사용 확인이 끝나면 홈으로 이동할 수 있어요.');return;}
    if(window.self!==window.top){event.preventDefault();window.parent.postMessage({type:'ojjuda:spot-home'},window.location.origin);}
  }
  $('game-home').onclick=goHome;$('zoom-home').onclick=goHome;
  function closeZoomSettings(){zoomDialog.classList.remove('settings-open');$('zoom-more').setAttribute('aria-expanded','false');}
  $('zoom-more').onclick=()=>{const open=zoomDialog.classList.toggle('settings-open');$('zoom-more').setAttribute('aria-expanded',String(open));if(open)$('zoom-level').focus();};
  function openZoom(){
    if($('zoom').disabled)return false;
    closeZoomSettings();$('zoom-tools').classList.remove('has-message');zoomDialog.showModal();document.body.style.overflow='hidden';notifyZoom(true);resizeZoom(1);for(const pane of zoomPanes){pane.scrollLeft=0;pane.scrollTop=0;}refresh();return true;
  }
  $('zoom').onclick=openZoom;
  function clearPictureGesture(){if(picturePointers.size)ignorePictureClickUntil=Date.now()+400;picturePointers.clear();picturePinch=null;pictureDrag=false;picturePane=null;}
  $('close-zoom').onclick=()=>zoomDialog.close();zoomDialog.addEventListener('close',()=>{clearPictureGesture();clearTimeout(zoomNoticeTimer);$('zoom-tools').classList.remove('has-message');closeZoomSettings();notifyZoom(false);document.body.style.overflow='';$('zoom').focus();});
  $('zoom-level').onchange=()=>{resizeZoom(Number($('zoom-level').value));closeZoomSettings();};window.addEventListener('resize',()=>{if(zoomDialog.open)resizeZoom();});
  function pointerPair(){const [a,b]=picturePointers.values();return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};}
  function capturePicture(id,target){try{target.setPointerCapture(id);}catch{}}
  function enterPairedZoom(surface,x,y){
    const isZoom=surface.classList.contains('zoom-picture'),rect=surface.getBoundingClientRect();
    const original={u:clamp((x-rect.left)/(rect.width||1),0,1),v:clamp((y-rect.top)/(rect.height||1),0,1)};
    if(!isZoom&&!openZoom())return null;
    const pane=surface.dataset.side==='original'?scrollA:scrollB;
    if(!isZoom)resizeZoom(fitZoom(),{...original,x:.5,y:.5});
    return {pane,anchor:zoomAnchor(pane,x,y)};
  }
  for(const surface of surfaces){
    surface.addEventListener('pointerdown',event=>{
      if(!['touch','pen'].includes(event.pointerType)||picturePointers.size>=2||surface.classList.contains('loading'))return;
      picturePointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,surface});
      if(picturePointers.size===1){picturePane=surface.classList.contains('zoom-picture')?surface.parentElement:null;pictureDrag=false;return;}
      const pair=pointerPair(),first=picturePointers.values().next().value,ready=enterPairedZoom(first.surface,pair.x,pair.y);
      if(!ready){clearPictureGesture();return;}
      picturePane=ready.pane;picturePinch={distance:pair.distance,scale:zoomScale,anchor:ready.anchor};pictureDrag=true;
      for(const id of picturePointers.keys())capturePicture(id,picturePane);event.preventDefault();
    });
    surface.addEventListener('click',event=>{if(pictureDrag||picturePinch||Date.now()<ignorePictureClickUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
  }
  window.addEventListener('pointermove',event=>{
    const point=picturePointers.get(event.pointerId);if(!point)return;
    const dx=event.clientX-point.x,dy=event.clientY-point.y;point.x=event.clientX;point.y=event.clientY;
    if(picturePointers.size===2&&picturePinch){
      const pair=pointerPair(),rect=picturePane.getBoundingClientRect();event.preventDefault();
      resizeZoom(picturePinch.scale*pair.distance/picturePinch.distance,{...picturePinch.anchor,x:clamp((pair.x-rect.left)/(picturePane.clientWidth||1),0,1),y:clamp((pair.y-rect.top)/(picturePane.clientHeight||1),0,1)});
    }else{
      if(!pictureDrag&&Math.hypot(point.x-point.startX,point.y-point.startY)>9){pictureDrag=true;capturePicture(event.pointerId,picturePane||point.surface);}
      if(pictureDrag){event.preventDefault();if(picturePane){picturePane.scrollLeft-=dx;picturePane.scrollTop-=dy;syncScroll(picturePane,picturePane===scrollA?scrollB:scrollA);}else window.scrollBy(0,-dy);}
    }
  },{passive:false});
  function endPicturePointer(event){if(!picturePointers.has(event.pointerId))return;if(pictureDrag||picturePinch)ignorePictureClickUntil=Date.now()+400;picturePointers.delete(event.pointerId);picturePinch=null;if(!picturePointers.size){pictureDrag=false;picturePane=null;}}
  window.addEventListener('pointerup',endPicturePointer);window.addEventListener('pointercancel',endPicturePointer);window.addEventListener('blur',clearPictureGesture);
  document.addEventListener('wheel',event=>{
    const surface=event.target.closest?.('.picture');if(!event.ctrlKey||!surface||surface.classList.contains('loading'))return;
    const ready=enterPairedZoom(surface,event.clientX,event.clientY);if(!ready)return;event.preventDefault();resizeZoom(zoomScale*Math.exp(-event.deltaY*.01),ready.anchor);
  },{passive:false});
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
    $('wallet-balance').textContent=w.userId?(w.coins===null?'잔액 확인 중':`${w.coins.toLocaleString()} ZU`):'로그인 필요';
    $('wallet-login').hidden=!!w.userId;$('wallet-refresh').hidden=!w.userId;$('wallet-logout').hidden=!w.userId;
    $('wallet-note').textContent=w.error||`힌트 1개 1 ZU · 30초 연장 1 ZU${w.userId?'':' · 로그인 후 이용할 수 있어요.'}`;
    $('wallet-note').classList.toggle('error-note',!!w.error);refreshControls();
  });
  show(state.current);setInterval(tick,200);window.addEventListener('pageshow',event=>{if(event.persisted){location.reload();return;}tick();});document.addEventListener('visibilitychange',()=>{tick();startNextWhenReady();});
  if(document.modelContext?.registerTool){
    const lifecycle=new AbortController(),tools=[
      {name:'read_game_progress',title:'게임 진행 보기',description:'현재 장면, 하트와 남은 시간을 확인합니다.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>({stage:puzzle().id,position:position()+1,title:puzzle().title,found:found().length,hearts:round().hearts,seconds:Math.ceil(core.timeLeft(round())/1000),status:round().status,totalStages:puzzles.length})},
      {name:'open_game_stage',title:'게임 장면 선택',description:`1~${puzzles.length}번 중 지정한 장면을 엽니다. ZU를 사용하지 않습니다.`,inputSchema:{type:'object',properties:{stage:{type:'integer',minimum:1,maximum:puzzles.length}},required:['stage'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||!Number.isInteger(input.stage)||input.stage<1||input.stage>puzzles.length)throw new Error(`1~${puzzles.length} 사이 문제 번호가 필요해요.`);if(paymentBusy)throw new Error('구매 확인 중이에요.');show(input.stage-1);return {stage:puzzle().id,title:puzzle().title,found:found().length};}}
    ];
    for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  }
})();
