(() => {
  'use strict';
  const E=window.TileGarden, $=id=>document.getElementById(id);
  const KEY='ojjuda-sacheonseong-v1', RECORDS='ojjuda-sacheonseong-records-v1';
  const faces=window.GardenFaces,TOOL_PRICES=Object.freeze({hint:3,shuffle:10});
  let state,records={},selected=null,locked=false,hints=[],toastTimer,autoTimer,flashTimer,customSize=null,overview=true,fitSize=1;
  let purchaseBusy=false;
  let audioContext,saveAvailable=true,countdown=3,rankingStage=1;
  function read(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
  function write(key,data){try{localStorage.setItem(key,JSON.stringify(data));return true;}catch{saveAvailable=false;$('save-note').textContent='이 브라우저에서는 기록 저장을 사용할 수 없어요.';return false;}}
  function save(){return write(KEY,state);}
  function count(){return state.grid.flat().filter(v=>v!==E.EMPTY).length;}
  function ms(){return state.startedAt?Math.max(0,Date.now()-state.startedAt):0;}
  function time(value){const n=Math.floor(value/10),m=Math.floor(n/6000),s=Math.floor(n/100)%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(n%100).padStart(2,'0')}`;}
  function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2800);}
  function sound(kind){
    if(!state.sound)return;
    try{audioContext ||= new(window.AudioContext||window.webkitAudioContext)();audioContext.resume();const notes=kind==='win'?[523,659,784,1047]:kind==='match'?[659,880]:[440];notes.forEach((frequency,i)=>{const osc=audioContext.createOscillator(),gain=audioContext.createGain(),at=audioContext.currentTime+i*.08;osc.type='sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.055,at+.015);gain.gain.exponentialRampToValueAtTime(.001,at+.22);osc.connect(gain);gain.connect(audioContext.destination);osc.start(at);osc.stop(at+.24);});}catch{}
  }
  function begin(){if(!state.startedAt){state.startedAt=Date.now();save();}}
  function clearSelection(){selected=null;hints=[];$('connection').replaceChildren();document.querySelectorAll('.tile.selected,.tile.hinted').forEach(b=>{b.classList.remove('selected','hinted');b.setAttribute('aria-pressed','false');});}
  function cell(p){return document.querySelector(`[data-r="${p.r}"][data-c="${p.c}"]`);}
  function sizeBoard(){
    if(!state)return;
    const n=state.stage*2,viewport=$('board-scroll'),available=viewport.clientWidth,height=viewport.clientHeight;
    if(!available||!height)return;
    const gap=n<=4?6:n<=10?3:2,pad=8;
    // Fit both axes, including the outside connection lane and tile shadows.
    const fit=Math.max(1,Math.floor(Math.min((available-2*pad-(n-1)*gap)/n,(height-2*pad-4-(n-1)*gap)/(n*1.19))*100)/100);
    fitSize=Math.min(n<=2?120:n<=4?100:Infinity,fit);
    const size=overview?fitSize:customSize||Math.max(42,fit);
    const el=$('board-canvas');el.style.setProperty('--tile',`${size}px`);el.style.setProperty('--gap',`${gap}px`);el.style.setProperty('--pad',`${pad}px`);el.style.setProperty('--n',n);el.classList.toggle('overview',overview);el.classList.toggle('small-tiles',size<34);
    $('zoom-fit').setAttribute('aria-pressed',String(overview));
    $('connection').replaceChildren();
    if(hints.length){const route=E.path(state.grid,hints[0],hints[1]);if(route)draw(route,true);}
  }
  function renderBoard(){
    const frag=document.createDocumentFragment();
    state.grid.forEach((row,r)=>row.forEach((value,c)=>{
      const b=document.createElement('button');b.type='button';b.className='tile'+(value===E.EMPTY?' empty':'');b.dataset.r=r;b.dataset.c=c;b.disabled=value===E.EMPTY;b.setAttribute('aria-pressed','false');
      b.setAttribute('aria-label',value===E.EMPTY?'빈 칸':`${r+1}행 ${c+1}열 ${faces[value].name}`);
      if(value!==E.EMPTY){b.dataset.face=value;const face=faces[value];b.title=face.name;b.innerHTML=face.symbol?`<svg aria-hidden="true" viewBox="0 0 64 76"><use href="#${face.symbol}"/></svg>`:`<span class="tile-emoji" aria-hidden="true">${face.emoji}</span>`;}
      frag.appendChild(b);
    }));$('board').replaceChildren(frag);sizeBoard();
  }
  function draw(route,soft=false){
    const canvas=$('board-canvas'),style=canvas.style,pad=parseFloat(style.getPropertyValue('--pad')),gap=parseFloat(style.getPropertyValue('--gap')),w=parseFloat(style.getPropertyValue('--tile')),h=w*1.19,n=state.grid.length,width=n*w+(n-1)*gap+2*pad,height=n*h+(n-1)*gap+2*pad+4;
    const coords=route.map(p=>({x:pad+p.c*(w+gap)+w/2,y:pad+p.r*(h+gap)+h/2}));
    // The outside lane follows the board's visible padding, independent of tile size.
    coords.forEach((p,i)=>{const r=route[i].r,c=route[i].c;if(r<0)p.y=pad/2;if(c<0)p.x=pad/2;if(r>=n)p.y=height-pad/2;if(c>=n)p.x=width-pad/2;});
    const points=coords.map(p=>`${p.x},${p.y}`).join(' '),ends=[coords[0],coords[coords.length-1]];
    $('connection').innerHTML=`<polyline points="${points}" ${soft?'opacity=".6" stroke-dasharray="5 6"':''}/>${ends.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4"/>`).join('')}`;
  }
  function updateStats(){const total=4*state.stage*state.stage,left=count();$('remaining').innerHTML=`${left} <small>/ ${total}</small>`;$('timer').textContent=time(state.finishedMs??ms());}
  function chooseStage(s){if(state.pendingPurchase){toast('먼저 구매 다시 확인을 눌러 주세요.');return;}if(s>state.unlocked)return;if($('modal').open)$('modal').close();if(s===state.stage&&count())return;if(state.startedAt&&count())confirmChange('다른 정원으로 갈까요?','현재 단계의 진행은 새로 시작하게 돼요.',()=>newStage(s));else newStage(s);}
  function openStages(){
    const cards=Array.from({length:E.MAX_STAGE},(_,i)=>{const s=i+1,info=E.stageInfo(s);return `<button class="stage-card${s===state.stage?' current':''}" data-stage="${s}" ${s>state.unlocked?'disabled':''} aria-label="${s}단계, ${info.total}개의 패${s>state.unlocked?', 잠김':''}"><span>${String(s).padStart(2,'0')}단계</span><strong>${info.total}<small>개</small></strong><small>${info.typeCount}종 · 최대 ${s===1?2:4}개씩</small>${s>state.unlocked?'<svg class="icon"><use href="#i-lock"/></svg>':''}</button>`;}).join('');
    showModal(`<div class="eyebrow">같은 그림은 최대 4개</div><h2 id="modal-title">15개의 정원을 만나보세요.</h2><p>64개 이후에도 11판이 더 있어요.<br>하나를 완성하면 다음 단계가 열려요.</p><div class="all-stage-grid">${cards}</div>`);
    $('modal-content').querySelectorAll('[data-stage]').forEach(b=>b.addEventListener('click',()=>chooseStage(Number(b.dataset.stage))));
  }
  function recordRows(stage,limit){const list=(records[stage]||[]).slice(0,limit);return list.length?list.map((r,i)=>`<div class="rank-row${r.id===state.lastRecord?' recent':''}"><span class="rank-number">${i+1}</span><strong>${time(r.duration)}</strong><span class="rank-date">${new Date(r.at).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'})}</span></div>`).join(''):'<p class="rank-empty">정원을 비우면<br>첫 시간 기록이 남아요.</p>';}
  function render(){
    window.OjjudaSacheonseongOnline?.stage(state.stage);
    $('stage-label').textContent=`${state.stage}단계`;
    $('status').textContent='가로·세로로 연결하고, 두 번까지만 꺾어요.';
    $('sound').innerHTML=`효과음 ${state.sound?'켬':'끔'} <svg class="icon"><use href="#i-${state.sound?'sound':'muted'}"/></svg>`;$('sound').setAttribute('aria-pressed',String(state.sound));$('sound').setAttribute('aria-label',`효과음 ${state.sound?'끄기':'켜기'}`);
    renderBoard();updateStats();restoreHint();syncTools();
  }
  function newStage(stage){
    stage=Math.min(E.MAX_STAGE,Math.max(1,stage));clearTimeout(autoTimer);clearTimeout(flashTimer);clearSelection();$('completion').hidden=true;locked=false;customSize=null;overview=true;
    state={runId:newPurchaseId(),rulesVersion:E.RULES_VERSION,stage,grid:E.generate(stage).grid,unlocked:Math.min(E.MAX_STAGE,Math.max(state?.unlocked||1,stage)),startedAt:null,finishedMs:null,sound:state?.sound||false,hints:0,shuffles:0,lastRecord:null};save();render();$('board-scroll').scrollTop=0;$('board-scroll').scrollLeft=0;
  }
  function ensureMove(){if(count()&&!E.moves(state.grid)){state.grid=E.reshuffle(state.grid).grid;save();renderBoard();$('status').textContent='연결할 패가 없어 자동으로 다시 섞었어요.';toast('막힌 정원을 자동으로 다시 섞었어요.');return true;}return false;}
  function select(p){
    if(locked||state.pendingPurchase||$('modal').open||$('options').open||state.grid[p.r][p.c]===E.EMPTY)return;begin();
    if(selected&&selected.r===p.r&&selected.c===p.c){clearSelection();return;}
    if(!selected){const suggested=hints.some(q=>q.r===p.r&&q.c===p.c)?hints.slice():[];clearSelection();hints=suggested;hints.forEach(q=>cell(q).classList.add('hinted'));selected=p;cell(p).classList.add('selected');cell(p).setAttribute('aria-pressed','true');sound('tap');return;}
    const a=selected;
    if(state.grid[a.r][a.c]!==state.grid[p.r][p.c]){clearSelection();selected=p;cell(p).classList.add('selected');cell(p).setAttribute('aria-pressed','true');$('status').textContent='같은 그림의 패를 찾아주세요.';return;}
    const route=E.path(state.grid,a,p);
    if(!route){cell(p).classList.remove('wrong');void cell(p).offsetWidth;cell(p).classList.add('wrong');$('status').textContent='다른 패에 막혀 있어요. 두 번까지만 꺾어 연결해요.';toast('다른 패에 막혀 있어요. 두 번까지만 꺾어 연결해요.');return;}
    locked=true;const willFinish=count()===2,finishDuration=willFinish?ms():null;clearSelection();draw(route);sound('match');cell(a).classList.add('removing');cell(p).classList.add('removing');
    // Save and queue completion before animation: leaving now must not lose a record.
    state.grid[a.r][a.c]=E.EMPTY;state.grid[p.r][p.c]=E.EMPTY;
    if(willFinish)finish(finishDuration,false);else save();
    flashTimer=setTimeout(()=>{
      // Keep the other tiles in place instead of rebuilding up to 900 buttons.
      for(const point of [a,p]){const button=cell(point);button.className='tile empty';button.disabled=true;button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','빈 칸');button.removeAttribute('title');delete button.dataset.face;button.replaceChildren();}
      $('connection').replaceChildren();updateStats();if(willFinish){showCompletion(state.lastRank||1);sound('win');return;}locked=false;if(!ensureMove())$('status').textContent='잘 연결했어요! 다음 짝을 찾아보세요.';
      const next=$('board').querySelector('.tile:not(.empty)');if(next&&document.activeElement?.classList.contains('empty'))next.focus({preventScroll:true});
    },280);
  }
  function finish(duration,present=true){
    locked=true;state.finishedMs=duration;state.unlocked=Math.min(E.MAX_STAGE,Math.max(state.unlocked,state.stage+1));
    const id=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;state.lastRecord=id;
    const record={id,duration:Math.max(1,duration),at:Date.now(),hints:state.hints,shuffles:state.shuffles,rulesVersion:E.RULES_VERSION};
    const list=[...(records[state.stage]||[]),record].sort((a,b)=>a.duration-b.duration||a.at-b.at);const rank=list.findIndex(r=>r.id===id)+1;state.lastRank=rank;records[state.stage]=list.slice(0,30);write(RECORDS,records);save();updateStats();if(present){showCompletion(rank);sound('win');}
    window.OjjudaSacheonseongOnline?.record(state.stage,record);
    if(state.stage===E.MAX_STAGE&&window.parent!==window)window.parent.postMessage({type:'ojjuda:sacheonseong-finished'},location.origin);
  }
  function showCompletion(rank){
    locked=true;const final=state.stage===E.MAX_STAGE;
    $('win-title').textContent=final?'15개의 정원을 모두 완성했어요!':`${state.stage}단계 정원 완성!`;
    $('win-desc').innerHTML=`<strong class="win-time">${time(state.finishedMs)}</strong><span class="win-rank">이 기기 ${state.stage}단계 ${rank}위${rank===1?' · 최고 기록!':''}</span>${final?'4개에서 900개까지, 멋진 도전이었어요.':`다음은 ${4*(state.stage+1)**2}개의 패가 기다려요.`}`;
    $('next').innerHTML=`${final?'단계 골라 다시 도전':'다음 단계로'} <svg class="icon"><use href="#i-arrow"/></svg>`;$('completion').hidden=false;$('next').focus({preventScroll:true});
    if(final){clearTimeout(autoTimer);$('countdown').textContent='원하는 단계에서 더 빠른 기록에 도전해보세요.';}else{countdown=4;advanceCountdown();}
  }
  function advanceCountdown(){clearTimeout(autoTimer);$('countdown').textContent=`${countdown}초 뒤에 다음 정원으로 이동해요.`;autoTimer=setTimeout(()=>{if(document.hidden||$('modal').open||$('options').open){advanceCountdown();return;}countdown--;if(countdown<=0)newStage(state.stage+1);else advanceCountdown();},1000);}
  function showModal(html){if($('options').open)$('options').close();$('modal-content').innerHTML=html;$('modal').showModal();}
  function confirmChange(title,message,action){showModal(`<div class="eyebrow">새로운 시작</div><h2 id="modal-title">${title}</h2><p>${message}</p><div class="modal-buttons"><button class="action-button" id="cancel-action">계속하기</button><button class="next-button" id="confirm-action">새로 시작</button></div>`);$('cancel-action').onclick=()=>$('modal').close();$('confirm-action').onclick=()=>{$('modal').close();action();};}
  function openRanking(stage=state.stage){
    rankingStage=stage;
    const stages=[...new Set([state.stage,...Object.keys(records).map(Number)])].sort((a,b)=>a-b);
    const html=`<div class="eyebrow">빠른 클리어 순서</div><h2 id="modal-title">나의 시간 순위</h2><label class="rank-select-label" for="rank-select">단계 선택</label><select id="rank-select">${stages.map(s=>`<option value="${s}"${s===stage?' selected':''}>${s}단계 · ${4*s*s}개의 패</option>`).join('')}</select><div class="rank-table" id="rank-table">${recordRows(stage,10)}</div><p class="rank-explainer">같은 단계에서 더 빨리 끝낼수록 높은 순위예요. 첫 패를 누른 순간부터 시간을 재며, 힌트·섞기 시간도 포함해요.</p><small class="rank-local">이 브라우저에 저장된 내 기록 TOP 10</small>`;
    if($('modal').open)$('modal-content').innerHTML=html;else showModal(html);
    $('rank-select').addEventListener('change',e=>{rankingStage=Number(e.target.value);$('rank-table').innerHTML=recordRows(rankingStage,10);});
  }
  function newPurchaseId(){return window.OjjudaSacheonseongOnline?.newId?.()||crypto.randomUUID();}
  function syncTools(){
    for(const kind of ['hint','shuffle']){
      const button=$(kind),pending=state.pendingPurchase?.kind===kind,label=kind==='hint'?'힌트':'섞기';
      button.disabled=purchaseBusy||!!(state.pendingPurchase&&!pending);
      button.innerHTML=`<svg class="icon"><use href="#i-${kind}"/></svg><span>${pending?(purchaseBusy?'확인 중':'다시 확인'):label}<small>${pending?'구매 확인':TOOL_PRICES[kind]+'쭈'}</small></span>`;
      button.setAttribute('aria-label',pending?`${label} 구매 ${purchaseBusy?'확인 중':'다시 확인'}`:`${label} ${TOOL_PRICES[kind]}쭈`);
    }
    $('all-stages').disabled=!!state.pendingPurchase;$('restart').disabled=!!state.pendingPurchase;
    $('board').setAttribute('aria-busy',String(purchaseBusy));
  }
  function restoreHint(){
    const pair=state.hintPair;
    if(!Array.isArray(pair)||pair.length!==2||!pair.every(p=>Number.isInteger(p?.r)&&Number.isInteger(p?.c)&&state.grid[p.r]?.[p.c]>=0))return;
    if(state.grid[pair[0].r][pair[0].c]!==state.grid[pair[1].r][pair[1].c])return;
    const route=E.path(state.grid,pair[0],pair[1]);if(!route)return;
    hints=pair;hints.forEach(p=>cell(p).classList.add('hinted'));draw(route,true);
  }
  async function useTool(kind){
    if(locked||purchaseBusy||!count())return;
    const online=window.OjjudaSacheonseongOnline,owner=online?.owner?.();
    if(!online||owner==='guest'){toast('로그인 후 힌트 3쭈, 섞기 10쭈로 이용할 수 있어요.');return;}
    if(!owner){toast('오락실 연결을 확인하고 있어요. 잠시 뒤 다시 눌러 주세요.');return;}
    let item=state.pendingPurchase;
    if(item&&item.owner!==owner){toast('구매를 시작한 계정으로 로그인해 주세요.');return;}
    if(item&&item.kind!==kind){toast('먼저 구매 다시 확인을 눌러 주세요.');return;}
    if(!item){
      ensureMove();if(kind==='hint'&&!E.moves(state.grid))return;
      state.runId ||= newPurchaseId();
      item={id:newPurchaseId(),runId:state.runId,stage:state.stage,kind,owner,requestedAt:Date.now()};
      state.pendingPurchase=item;
      if(!save()){state.pendingPurchase=null;toast('구매 기록을 저장할 수 없어 실행하지 않았어요.');return;}
    }
    purchaseBusy=true;syncTools();
    let result;
    try{result=await online.buy(item);}catch{result={ok:false,reason:'pending'};}
    purchaseBusy=false;
    if(state.pendingPurchase?.id!==item.id||state.runId!==item.runId){syncTools();return;}
    if(result?.ok&&result.kind===kind&&result.run_id===item.runId&&result.stage===item.stage&&result.price===TOOL_PRICES[kind]){
      const requestedAt=Number.isFinite(item.requestedAt)&&item.requestedAt>0?Math.min(item.requestedAt,Date.now()):Date.now();
      const next={...state,pendingPurchase:null,startedAt:state.startedAt||requestedAt};
      if(kind==='hint'){const move=E.moves(state.grid);if(!move){syncTools();toast('구매 다시 확인을 눌러 주세요.');return;}next.hints=(state.hints||0)+1;next.hintPair=[move.a,move.b];}
      else{next.grid=E.reshuffle(state.grid).grid;next.shuffles=(state.shuffles||0)+1;next.hintPair=null;}
      // Save the consumed receipt and its effect together, so reloading cannot charge twice.
      if(!write(KEY,next)){syncTools();toast('저장 공간을 확인한 뒤 구매 다시 확인을 눌러 주세요.');return;}
      state=next;clearSelection();renderBoard();restoreHint();updateStats();
      if(kind==='hint'){cell(hints[0]).scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});$('status').textContent='반짝이는 두 패를 연결해보세요.';}
      else{$('board-canvas').classList.remove('shuffling');void $('board-canvas').offsetWidth;$('board-canvas').classList.add('shuffling');$('status').textContent='패를 새로 섞었어요.';}
      toast(`${kind==='hint'?'힌트':'섞기'} · ${TOOL_PRICES[kind]}쭈를 사용했어요.`);
    }else if(!result||result.ok||!['coins','sign_in','wallet_unavailable','banned','invalid','request_conflict','unavailable'].includes(result.reason)){
      toast('결과를 확인하지 못했어요. 같은 버튼의 다시 확인을 눌러 주세요.');
    }else{
      state.pendingPurchase=null;save();
      toast(result.reason==='coins'?`${TOOL_PRICES[kind]}쭈가 필요해요. 보유 쭈를 확인해 주세요.`:result.reason==='sign_in'?'로그인 후 이용해 주세요.':'이용할 수 없어요. 잠시 뒤 다시 눌러 주세요.');
    }
    syncTools();
  }
  $('board').addEventListener('click',e=>{const b=e.target.closest('.tile');if(b)select({r:Number(b.dataset.r),c:Number(b.dataset.c)});});
  $('board').addEventListener('keydown',e=>{const b=e.target.closest('.tile');if(!b||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();let r=Number(b.dataset.r),c=Number(b.dataset.c);const [dr,dc]={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[e.key];while(true){r+=dr;c+=dc;if(r<0||c<0||r>=state.grid.length||c>=state.grid.length)break;if(state.grid[r][c]!==E.EMPTY){cell({r,c}).focus();break;}}});
  $('hint').onclick=()=>useTool('hint');
  $('shuffle').onclick=()=>useTool('shuffle');
  $('restart').onclick=()=>{if(locked||state.pendingPurchase)return;confirmChange('이 정원을 다시 시작할까요?','패와 시간이 새로 시작돼요. 이미 세운 순위 기록은 남아 있어요.',()=>newStage(state.stage));};
  $('next').onclick=()=>state.stage===E.MAX_STAGE?openStages():newStage(state.stage+1);
  $('all-stages').onclick=openStages;
  $('ranking').onclick=()=>openRanking();
  $('help').onclick=()=>{showModal('<div class="eyebrow">사천성</div><h2 id="modal-title">이렇게 연결해요.</h2><ol><li>같은 그림의 패 두 개를 누르세요.<small>같은 그림은 한 판에 최대 4개! 한 번 더 누르면 선택이 풀려요.</small></li><li>가로·세로로, 두 번까지만 꺾어요.<small>다른 패를 통과할 수 없어요. 바깥 여백은 이용할 수 있어요.</small></li><li>4개부터 900개까지, 총 15단계예요.<small>64개 이후에도 100·144·196개… 11판을 더 즐겨요.</small></li></ol><p>힌트는 한 번에 3쭈, 직접 섞기는 10쭈예요. 연결할 패가 없을 때 자동으로 섞는 것은 무료예요.</p><p>두 손가락으로 벌리거나 오므리면 게임판만 확대·축소돼요. 커진 판은 한 손가락으로 밀고, 전체를 누르면 다시 한눈에 볼 수 있어요. 전체 보기에서도 바로 패를 선택해 연결할 수 있어요.</p><p>첫 패를 누르면 시간 측정이 시작돼요. 오락실 순위는 최고 완료 단계가 우선이고, 같은 단계는 가장 짧은 시간으로 정해요. 힌트·섞기를 누르거나 화면을 나가도 시간은 흘러요.</p><button class="next-button" id="help-ok">알겠어요, 연결해볼게요</button>');$('help-ok').onclick=()=>$('modal').close();};
  $('sound').onclick=()=>{state.sound=!state.sound;save();$('sound').innerHTML=`효과음 ${state.sound?'켬':'끔'} <svg class="icon"><use href="#i-${state.sound?'sound':'muted'}"/></svg>`;$('sound').setAttribute('aria-pressed',String(state.sound));$('sound').setAttribute('aria-label',`효과음 ${state.sound?'끄기':'켜기'}`);if(state.sound)sound('tap');};
  $('modal-close').onclick=()=>$('modal').close();$('modal').addEventListener('click',e=>{if(e.target===$('modal')){const rect=$('modal').getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)$('modal').close();}});
  $('options-open').onclick=()=>$('options').showModal();
  $('options-close').onclick=()=>$('options').close();
  const viewport=$('board-scroll'),pointers=new Map();let pinch=null,dragging=false,ignoreClickUntil=0;
  function tileSize(){return parseFloat(getComputedStyle($('board-canvas')).getPropertyValue('--tile'));}
  function zoomBoard(requested,x,y){
    const rect=viewport.getBoundingClientRect(),canvas=$('board-canvas'),before=canvas.getBoundingClientRect();
    x=Number.isFinite(x)?Math.max(rect.left,Math.min(rect.right,x)):rect.left+rect.width/2;
    y=Number.isFinite(y)?Math.max(rect.top,Math.min(rect.bottom,y)):rect.top+rect.height/2;
    const anchorX=before.width?(x-before.left)/before.width:.5,anchorY=before.height?(y-before.top)/before.height:.5;
    customSize=Math.max(fitSize,Math.min(Math.max(160,fitSize*4),requested));overview=customSize<=fitSize+.01;if(overview)customSize=null;
    sizeBoard();const after=canvas.getBoundingClientRect();
    viewport.scrollLeft+=after.left+anchorX*after.width-x;viewport.scrollTop+=after.top+anchorY*after.height-y;
  }
  function pair(){const [a,b]=[...pointers.values()];return {distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
  function capture(id){try{viewport.setPointerCapture(id);}catch{}}
  viewport.addEventListener('pointerdown',event=>{
    if(!['touch','pen'].includes(event.pointerType)||pointers.size>=2)return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY});
    if(pointers.size===2){pinch={...pair(),size:tileSize()};dragging=true;for(const id of pointers.keys())capture(id);event.preventDefault();}
    else dragging=false;
  });
  window.addEventListener('pointermove',event=>{
    const point=pointers.get(event.pointerId);if(!point)return;
    const dx=event.clientX-point.x,dy=event.clientY-point.y;point.x=event.clientX;point.y=event.clientY;
    if(pointers.size===2&&pinch){
      const next=pair();event.preventDefault();zoomBoard(pinch.size*next.distance/pinch.distance,pinch.x,pinch.y);
      viewport.scrollLeft+=pinch.x-next.x;viewport.scrollTop+=pinch.y-next.y;pinch.x=next.x;pinch.y=next.y;
    }else{
      if(!dragging&&Math.hypot(point.x-point.startX,point.y-point.startY)>6){dragging=true;capture(event.pointerId);}
      if(dragging){event.preventDefault();viewport.scrollLeft-=dx;viewport.scrollTop-=dy;}
    }
  },{passive:false});
  function endPointer(event){
    if(!pointers.has(event.pointerId))return;
    if(dragging||pinch)ignoreClickUntil=Date.now()+400;
    pointers.delete(event.pointerId);pinch=null;if(!pointers.size)dragging=false;
  }
  window.addEventListener('pointerup',endPointer);window.addEventListener('pointercancel',endPointer);
  // A completed drag/pinch must never become an accidental tile selection.
  viewport.addEventListener('click',event=>{if(dragging||pinch||Date.now()<ignoreClickUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
  document.addEventListener('wheel',event=>{
    if(!event.ctrlKey||$('modal').open||$('options').open)return;
    event.preventDefault();zoomBoard(tileSize()*Math.exp(-event.deltaY*.01),event.clientX,event.clientY);
  },{passive:false});
  $('zoom-fit').onclick=()=>{overview=true;customSize=null;sizeBoard();viewport.scrollLeft=0;viewport.scrollTop=0;};
  $('zoom-in').onclick=()=>zoomBoard(tileSize()+Math.max(6,tileSize()*.2));
  $('zoom-out').onclick=()=>zoomBoard(tileSize()-Math.max(6,tileSize()*.2));
  window.addEventListener('resize',sizeBoard);
  if(window.ResizeObserver)new ResizeObserver(sizeBoard).observe($('board-scroll'));
  $('game-home').addEventListener('click',event=>{if(window.parent!==window){event.preventDefault();save();window.parent.postMessage({type:'ojjuda:sacheonseong-home'},location.origin);}});
  window.addEventListener('pagehide',save);
  function valid(s){return s&&Number.isInteger(s.stage)&&s.stage>=1&&s.stage<=E.MAX_STAGE&&Number.isInteger(s.unlocked)&&s.unlocked>=s.stage&&Array.isArray(s.grid)&&s.grid.length===s.stage*2&&s.grid.every(row=>Array.isArray(row)&&row.length===s.stage*2&&row.every(v=>Number.isInteger(v)&&v>=-1&&v<faces.length))&&(!s.startedAt||(Number.isFinite(s.startedAt)&&s.startedAt>0));}
  const saved=read(KEY),storedRecords=read(RECORDS);
  if(storedRecords&&typeof storedRecords==='object'&&!Array.isArray(storedRecords)){for(const [k,v]of Object.entries(storedRecords))if(/^\d+$/.test(k)&&Array.isArray(v))records[k]=v.filter(r=>r&&Number.isFinite(r.duration)&&r.duration>0&&Number.isFinite(r.at)).sort((a,b)=>a.duration-b.duration).slice(0,30);}
  if(valid(saved)){const needsRandomLayout=saved.rulesVersion!==E.RULES_VERSION;state=saved;state.runId ||= newPurchaseId();state.unlocked=Math.min(E.MAX_STAGE,state.unlocked);state.rulesVersion=E.RULES_VERSION;if(!E.withinCopyLimit(state.grid)){newStage(state.stage);toast('같은 그림은 최대 4개! 현재 단계의 패를 새로 준비했어요.');}else if(count()===0){if(state.finishedMs!=null&&!Object.values(records).flat().some(r=>r.id===state.lastRecord)){render();finish(state.finishedMs);}else if(state.stage===E.MAX_STAGE){render();showCompletion(state.lastRank||1);}else newStage(state.stage+1);}else{if(needsRandomLayout){state.grid=E.reshuffle(state.grid).grid;toast('남은 패를 무작위로 골고루 섞었어요.');}render();ensureMove();save();}}else{if(saved&&Number.isInteger(saved.unlocked))state={unlocked:Math.min(E.MAX_STAGE,Math.max(1,saved.unlocked)),sound:!!saved.sound};newStage(saved&&Number.isInteger(saved.stage)?Math.min(E.MAX_STAGE,Math.max(1,saved.stage)):1);}
  setInterval(()=>{if(state.finishedMs==null)$('timer').textContent=time(ms());},70);
})();
