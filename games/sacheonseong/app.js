(() => {
  'use strict';
  const E=window.TileGarden, $=id=>document.getElementById(id);
  const KEY='ojjuda-sacheonseong-v1', RECORDS='ojjuda-sacheonseong-records-v1';
  const faces=window.GardenFaces,TOOL_PRICES=Object.freeze({hint:3,shuffle:10}),WRONG_PAIR_MS=10000;
  let state,records={},selected=null,locked=false,hints=[],toastTimer,moveTimer,customSize=null,overview=true,fitSize=1;
  const removalTimers=new Set(),REMOVE_MS=120;
  let purchaseBusy=false;
  let globalResult=null;
  let audioContext,saveAvailable=true,rankingStage=1;
  function read(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
  function write(key,data){try{localStorage.setItem(key,JSON.stringify(data));return true;}catch{saveAvailable=false;$('save-note').textContent='이 브라우저에서는 기록 저장을 사용할 수 없어요.';return false;}}
  function save(){return write(KEY,state);}
  const occupied=grid=>grid.flat().filter(v=>v!==E.EMPTY).length;
  const layers=()=>[state.grid,...(state.upcoming||[])];
  function activeCount(){return occupied(state.grid);}
  function count(){return activeCount()+(state.upcoming||[]).reduce((sum,grid)=>sum+occupied(grid),0);}
  function firstOccupiedLayer(){return layers().findIndex(grid=>occupied(grid)>0);}
  function availableMove(){return E.exposedMoves(layers());}
  function completedRound(){return state.finishedMs!=null&&count()===0;}
  function ms(){return state.startedAt?Math.max(0,Date.now()-state.startedAt)+(state.penaltyMs||0):0;}
  function time(value){const n=Math.floor(value/10),m=Math.floor(n/6000),s=Math.floor(n/100)%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(n%100).padStart(2,'0')}`;}
  function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2800);}
  function sound(kind){
    if(!state.sound)return;
    try{audioContext ||= new(window.AudioContext||window.webkitAudioContext)();audioContext.resume();const notes=kind==='win'?[523,659,784,1047]:kind==='match'?[659,880]:[440];notes.forEach((frequency,i)=>{const osc=audioContext.createOscillator(),gain=audioContext.createGain(),at=audioContext.currentTime+i*.08;osc.type='sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.055,at+.015);gain.gain.exponentialRampToValueAtTime(.001,at+.22);osc.connect(gain);gain.connect(audioContext.destination);osc.start(at);osc.stop(at+.24);});}catch{}
  }
  function begin(){if(!state.startedAt){prepareGlobalResult();state.startedAt=Date.now();save();}}
  const rankingMonth=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,7);
  function currentGlobalResult(result){return result===globalResult&&state.runId===result.runId&&state.stage===result.stage&&window.OjjudaSacheonseongOnline?.owner?.()===result.owner&&rankingMonth()===result.period;}
  function validSnapshot(snapshot,result){return snapshot?.ok===true&&snapshot.owner===result.owner&&snapshot.period===result.period&&Array.isArray(snapshot.rows);}
  function leader(snapshot){
    const row=snapshot?.rows?.[0],rules=window.OjjudaSacheonseongRanking;
    return row&&rules?.game(row.stage)&&rules.duration(row.score)!==null?row:null;
  }
  function prepareGlobalResult(){
    const online=window.OjjudaSacheonseongOnline;if(window.parent===window||!online?.leaderboard)return;
    const owner=online.owner();if(owner===undefined)return;
    const result={runId:state.runId,stage:state.stage,owner,period:rankingMonth(),before:null,finished:false,outcome:'success',encouragement:'',notice:''};globalResult=result;
    Promise.resolve(online.leaderboard()).then(snapshot=>{if(currentGlobalResult(result)&&!result.finished&&validSnapshot(snapshot,result))result.before=snapshot;}).catch(()=>{});
  }
  function showGlobalResult(result=globalResult){
    if(!result||!currentGlobalResult(result)||!completedRound()||$('completion').hidden)return;
    const notice=$('win-save-status');notice.textContent=result.notice;notice.hidden=!result.notice;
    window.OjjudaGameResults?.update($('completion'),{outcome:result.outcome,encouragement:result.encouragement,key:result.runId});
  }
  function compareGlobalResult(result,delivery){
    if(!currentGlobalResult(result)||!completedRound()||result.delivered)return;
    if(!delivery?.ok){result.notice='기록 저장 대기';showGlobalResult(result);return;}
    result.delivered=true;
    result.notice='';showGlobalResult(result);
    if(delivery.owner!==result.owner||delivery.period!==result.period||!result.before)return;
    const online=window.OjjudaSacheonseongOnline,rules=window.OjjudaSacheonseongRanking,before=leader(result.before);
    if(!before||before.stage!==result.stage)return;
    Promise.resolve(online.leaderboard()).then(snapshot=>{
      if(!currentGlobalResult(result)||!completedRound()||!validSnapshot(snapshot,result))return;
      const after=leader(snapshot);if(!after||after.stage!==result.stage)return;
      const score=rules.score(state.finishedMs),gap=rules.duration(score)-rules.duration(after.score);
      if(score>before.score&&after.me===true&&after.score===score){result.outcome='record';result.encouragement='이번 달 1등 기록을 새로 썼어요!';}
      else if(gap===0)result.encouragement='1등과 같은 시간이에요. 조금만 더 줄여봐요!';
      else if(gap>0){const seconds=(gap/1000).toFixed(2).replace(/\.?0+$/,'');result.encouragement=`1등과 ${seconds}초 차이 · 한 번 더 도전해요!`;}
      showGlobalResult(result);
    }).catch(()=>{});
  }
  function clearSelection(){selected=null;hints=[];$('connection').replaceChildren();document.querySelectorAll('.tile.selected,.tile.hinted').forEach(b=>{b.classList.remove('selected','hinted');b.setAttribute('aria-pressed','false');});}
  function cell(p){return document.querySelector(`[data-layer="${p.layer??0}"][data-r="${p.r}"][data-c="${p.c}"]`);}
  function fittingTile(rows,cols,width,height,gap,pad=8,layerCount=1){
    const extra=(layerCount-1)*E.LAYER_OFFSET;
    return Math.min((width-2*pad-(cols-1+extra)*gap)/(cols+extra),(height-2*pad-4-(rows-1+extra)*gap)/((rows+extra)*1.19));
  }
  function boardColumns(stage){
    const {size}=E.stageInfo(stage),viewport=$('board-scroll'),width=viewport.clientWidth,height=viewport.clientHeight;
    if(stage<=2)return size;
    const typical=E.stackInfo(stage),target=Math.max(...typical.floors.map(floor=>floor.total)),span=Math.sqrt(target/.66);
    if(width<=20||height<=24)return typical.cols;
    const choices=[];
    for(let cols=Math.max(3,Math.floor(span*.66));cols<=Math.ceil(span*1.43);cols++){
      const info=E.stackInfo(stage,cols);
      choices.push({cols,extra:info.rows*cols-target,tile:fittingTile(info.rows,cols,width,height,2,8+3*(info.layerCount-1),info.layerCount)});
    }
    const largest=Math.max(...choices.map(choice=>choice.tile));
    if(!(largest>0))return typical.cols;
    return choices.filter(choice=>choice.tile>=largest*.99).sort((a,b)=>a.extra-b.extra||b.tile-a.tile||b.cols-a.cols)[0].cols;
  }
  function sizeBoard(){
    if(!state)return;
    const n=E.stageInfo(state.stage).size,rows=state.grid.length,cols=state.grid[0].length,viewport=$('board-scroll'),available=viewport.clientWidth,height=viewport.clientHeight;
    if(!available||!height)return;
    const gap=n<=4?6:n<=10?3:2,pad=8+3*(state.layerCount-1);
    // Fit both axes, including the outside connection lane and tile shadows.
    const fit=Math.max(1,Math.floor(fittingTile(rows,cols,available,height,gap,pad,state.layerCount)*100)/100);
    fitSize=Math.min(n<=2?120:n<=4?100:Infinity,fit);
    const size=overview?fitSize:customSize||Math.max(42,fit);
    const el=$('board-canvas'),extra=(state.layerCount-1)*E.LAYER_OFFSET;
    el.style.setProperty('--tile',`${size}px`);el.style.setProperty('--gap',`${gap}px`);el.style.setProperty('--pad',`${pad}px`);el.style.setProperty('--n',cols);el.style.setProperty('--rows',rows);el.classList.toggle('overview',overview);el.classList.toggle('small-tiles',size<34);
    const board=$('board');board.style.width=`${(cols+extra)*size+(cols-1+extra)*gap}px`;board.style.height=`${(rows+extra)*size*1.19+(rows-1+extra)*gap}px`;
    board.querySelectorAll('.tile-layer').forEach(layer=>{
      const index=Number(layer.dataset.layer);
      layer.style.left=`${index*E.LAYER_OFFSET*(size+gap)}px`;
      layer.style.top=`${index*E.LAYER_OFFSET*(size*1.19+gap)}px`;
    });
    $('zoom-fit').setAttribute('aria-pressed',String(overview));
    $('connection').replaceChildren();
    if(hints.length){const route=E.path(layers()[hints[0].layer??0],hints[0],hints[1]);if(route)draw(route,true,hints[0].layer??0);}
  }
  function cancelRemovals(){for(const timer of removalTimers)clearTimeout(timer);removalTimers.clear();clearTimeout(moveTimer);}
  function refreshCoverage(){
    const grids=layers();
    $('board').querySelectorAll('.tile:not(.empty):not(.removing)').forEach(button=>{
      const point={layer:Number(button.dataset.layer),r:Number(button.dataset.r),c:Number(button.dataset.c)};
      const open=E.isExposed(grids,point);
      button.disabled=!open;button.classList.toggle('covered',!open);
      button.setAttribute('aria-label',`${state.layerCount-point.layer}층 ${point.r+1}행 ${point.c+1}열 ${faces[grids[point.layer][point.r][point.c]].name}${open?'':', 윗패에 가려짐'}`);
    });
  }
  function renderBoard(){
    cancelRemovals();
    $('board-stack').replaceChildren();
    $('board-canvas').classList.toggle('layered',state.layerCount>1);
    const grids=layers(),frag=document.createDocumentFragment();
    grids.forEach((grid,index)=>{
      const layer=document.createElement('div');layer.className='tile-layer';layer.dataset.layer=index;layer.style.zIndex=grids.length-index;layer.setAttribute('role','group');layer.setAttribute('aria-label',`${grids.length-index}층`);
      const tiles=document.createDocumentFragment();
      grid.forEach((row,r)=>row.forEach((value,c)=>{
        const empty=value===E.EMPTY,open=!empty&&E.isExposed(grids,{layer:index,r,c});
        const b=document.createElement('button');b.type='button';b.className='tile'+(empty?' empty':open?'':' covered');b.dataset.layer=index;b.dataset.r=r;b.dataset.c=c;b.disabled=!open;b.setAttribute('aria-pressed','false');
        b.setAttribute('aria-label',empty?'빈 칸':`${grids.length-index}층 ${r+1}행 ${c+1}열 ${faces[value].name}${open?'':', 윗패에 가려짐'}`);
        if(!empty){b.dataset.face=value;const face=faces[value];b.title=face.name;b.innerHTML=face.symbol?`<svg aria-hidden="true" viewBox="0 0 64 76"><use href="#${face.symbol}"/></svg>`:`<span class="tile-emoji" aria-hidden="true">${face.emoji}</span>`;}
        tiles.appendChild(b);
      }));layer.appendChild(tiles);frag.appendChild(layer);
    });$('board').replaceChildren(frag);sizeBoard();
  }
  function draw(route,soft=false,layer=0){
    const canvas=$('board-canvas'),style=canvas.style,pad=parseFloat(style.getPropertyValue('--pad')),gap=parseFloat(style.getPropertyValue('--gap')),w=parseFloat(style.getPropertyValue('--tile')),h=w*1.19,rows=state.grid.length,cols=state.grid[0].length,shift=layer*E.LAYER_OFFSET;
    const coords=route.map(p=>({x:pad+(p.c+shift)*(w+gap)+w/2,y:pad+(p.r+shift)*(h+gap)+h/2}));
    // The outside lane follows the board's visible padding, independent of tile size.
    coords.forEach((p,i)=>{const r=route[i].r,c=route[i].c;if(r<0)p.y=pad/2+shift*(h+gap);if(c<0)p.x=pad/2+shift*(w+gap);if(r>=rows)p.y=pad+(rows+shift)*h+(rows-1+shift)*gap+pad/2;if(c>=cols)p.x=pad+(cols+shift)*w+(cols-1+shift)*gap+pad/2;});
    const points=coords.map(p=>`${p.x},${p.y}`).join(' '),ends=[coords[0],coords[coords.length-1]];
    $('connection').innerHTML=`<polyline points="${points}" ${soft?'opacity=".6" stroke-dasharray="5 6"':''}/>${ends.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4"/>`).join('')}`;
  }
  function updateStats(){
    const left=count(),floorLeft=layers().filter(grid=>occupied(grid)>0).length;
    $('remaining').innerHTML=`${left} <small>/ ${state.totalTiles}</small>`;
    $('stage-label').textContent=`${state.stage}단계${state.layerCount>1?` · ${floorLeft}층 남음`:''}`;
    $('timer').textContent=time(state.finishedMs??ms());
  }
  function wrongPair(message){
    state.penaltyMs=(state.penaltyMs||0)+WRONG_PAIR_MS;save();updateStats();
    const notice=message+' (+10초)';$('status').textContent=notice;toast(notice);
  }
  function chooseStage(s){if(state.pendingPurchase){toast('먼저 구매 다시 확인을 눌러 주세요.');return;}if(s>state.unlocked)return;if($('modal').open)$('modal').close();if(s===state.stage&&count())return;if(state.startedAt&&count())confirmChange('다른 정원으로 갈까요?','현재 단계의 진행은 새로 시작하게 돼요.',()=>newStage(s));else newStage(s);}
  function openStages(){
    const cards=Array.from({length:E.MAX_STAGE},(_,i)=>{const s=i+1,info=E.stackInfo(s,s===state.stage?state.grid[0].length:boardColumns(s));return `<button class="stage-card${s===state.stage?' current':''}" data-stage="${s}" ${s>state.unlocked?'disabled':''} aria-label="${s}단계, ${info.layerCount}층, ${info.total}개의 패${s>state.unlocked?', 잠김':''}"><span>${String(s).padStart(2,'0')}단계 · ${info.layerCount}층</span><strong>${info.total}<small>개</small></strong><small>${info.typeCount}종 · 최대 ${s===1?2:4}개씩</small>${s>state.unlocked?'<svg class="icon"><use href="#i-lock"/></svg>':''}</button>`;}).join('');
    showModal(`<div class="eyebrow">층마다 새로운 모양</div><h2 id="modal-title">200개의 정원을 만나보세요.</h2><p>십자·계단·고리처럼 모양이 달라져요.<br>아랫패 네 장의 가운데에 윗패 한 장이 걸쳐요. 겹치지 않은 패부터 연결해요.</p><div class="all-stage-grid">${cards}</div>`);
    $('modal-content').querySelectorAll('[data-stage]').forEach(b=>b.addEventListener('click',()=>chooseStage(Number(b.dataset.stage))));
    $('modal-content').querySelector('.stage-card.current')?.scrollIntoView?.({block:'nearest'});
  }
  function recordRows(stage,limit){const list=(records[stage]||[]).slice(0,limit);return list.length?list.map((r,i)=>`<div class="rank-row${r.id===state.lastRecord?' recent':''}"><span class="rank-number">${i+1}</span><strong>${time(r.duration)}</strong><span class="rank-date">${new Date(r.at).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'})}</span></div>`).join(''):'<p class="rank-empty">정원을 비우면<br>첫 시간 기록이 남아요.</p>';}
  function render(){
    window.OjjudaSacheonseongOnline?.stage(state.stage);
    $('board-scroll').setAttribute('aria-label',`${state.stage}단계, 총 ${state.layerCount}층이 어긋나 쌓여 있어요. 윗패와 겹치지 않은 같은 그림을 연결하세요.`);
    $('status').textContent=state.layerCount>1?'윗패와 겹치지 않은 패만 누를 수 있어요. 같은 그림을 두 번까지 꺾어 연결하세요.':'가로·세로로 연결하고, 두 번까지만 꺾어요.';
    $('sound').innerHTML=`효과음 ${state.sound?'켬':'끔'} <svg class="icon"><use href="#i-${state.sound?'sound':'muted'}"/></svg>`;$('sound').setAttribute('aria-pressed',String(state.sound));$('sound').setAttribute('aria-label',`효과음 ${state.sound?'끄기':'켜기'}`);
    renderBoard();updateStats();restoreHint();syncTools();
  }
  function newStage(stage,pendingPurchase=null){
    globalResult=null;
    stage=Math.min(E.MAX_STAGE,Math.max(1,stage));cancelRemovals();clearSelection();$('completion').hidden=true;$('next').disabled=true;locked=false;customSize=null;overview=true;
    // Fix the shape for this attempt; rotation only changes the drawing size.
    const {grids,info}=E.generateStack(stage,Math.random,boardColumns(stage));
    state={runId:newPurchaseId(),rulesVersion:E.RULES_VERSION,stage,grid:grids[0],upcoming:grids.slice(1),floor:0,layerCount:info.layerCount,totalTiles:info.total,unlocked:Math.min(E.MAX_STAGE,Math.max(state?.unlocked||1,stage)),startedAt:null,finishedMs:null,penaltyMs:0,sound:state?.sound||false,hints:0,shuffles:0,lastRecord:null,...(pendingPurchase?{pendingPurchase}:{})};save();render();$('board-scroll').scrollTop=0;$('board-scroll').scrollLeft=0;
  }
  function ensureMove(){
    if(!count()||availableMove())return false;
    const top=firstOccupiedLayer();if(top<0)return false;
    clearSelection();const shuffled=E.reshuffle(layers()[top]).grid;
    if(top===0)state.grid=shuffled;else state.upcoming[top-1]=shuffled;
    state.hintPair=null;save();renderBoard();
    $('status').textContent='선택할 수 있는 짝이 없어 위쪽 패를 자동으로 다시 섞었어요.';toast('막힌 정원을 자동으로 다시 섞었어요.');return true;
  }
  function select(p){
    const grids=layers(),grid=grids[p.layer??0];
    if(locked||state.pendingPurchase||$('modal').open||$('options').open||!E.isExposed(grids,p))return;
    if(window.OjjudaGameResults?.canPlay?.()===false)return;
    begin();
    if(selected&&selected.layer===p.layer&&selected.r===p.r&&selected.c===p.c){clearSelection();return;}
    if(!selected){const suggested=hints.some(q=>q.layer===p.layer&&q.r===p.r&&q.c===p.c)?hints.slice():[];clearSelection();hints=suggested;hints.forEach(q=>cell(q).classList.add('hinted'));selected=p;cell(p).classList.add('selected');cell(p).setAttribute('aria-pressed','true');sound('tap');return;}
    const a=selected;
    if(a.layer!==p.layer||grids[a.layer][a.r][a.c]!==grid[p.r][p.c]){clearSelection();selected=p;cell(p).classList.add('selected');cell(p).setAttribute('aria-pressed','true');wrongPair('같은 그림의 패를 찾아주세요.');return;}
    const route=E.path(grid,a,p);
    if(!route){cell(p).classList.remove('wrong');void cell(p).offsetWidth;cell(p).classList.add('wrong');wrongPair('다른 패에 막혀 있어요. 두 번까지만 꺾어 연결해요.');return;}
    const floorCleared=occupied(grid)===2,willFinish=count()===2;
    const finishDuration=willFinish?ms():null;clearSelection();draw(route,false,p.layer);sound('match');
    const buttons=[cell(a),cell(p)],line=$('connection').firstElementChild;
    buttons.forEach(button=>{button.classList.add('removing');button.disabled=true;});
    // Save and queue completion before animation: leaving now must not lose a record.
    grid[a.r][a.c]=E.EMPTY;grid[p.r][p.c]=E.EMPTY;
    if(floorCleared)state.floor=firstOccupiedLayer();
    if(willFinish)finish(finishDuration,false);
    else{save();updateStats();$('status').textContent=floorCleared?'한 층을 비웠어요! 다른 층의 겹침도 살펴보세요.':'잘 연결했어요! 새로 드러난 패도 살펴보세요.';}
    refreshCoverage();
    clearTimeout(moveTimer);
    const runId=state.runId,timer=setTimeout(()=>{
      removalTimers.delete(timer);
      if(state.runId!==runId)return;
      // Keep the other tiles in place instead of rebuilding the whole board.
      for(const button of buttons){if(!button.isConnected)continue;button.className='tile empty';button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','빈 칸');button.removeAttribute('title');delete button.dataset.face;button.replaceChildren();}
      if($('connection').firstElementChild===line)$('connection').replaceChildren();
      if(willFinish){showCompletion(state.lastRank||1);sound('win');return;}
      const next=$('board').querySelector('.tile:not(:disabled)');if(next&&document.activeElement?.classList.contains('empty'))next.focus({preventScroll:true});
    },REMOVE_MS);
    removalTimers.add(timer);
    // Visual effects never block the next pair. Check for a dead end after them.
    if(!willFinish)moveTimer=setTimeout(()=>{if(state.runId===runId&&!state.pendingPurchase)ensureMove();},REMOVE_MS);
  }
  function finish(duration,present=true){
    if(state.finishedMs!=null||count()!==0)return;
    const comparison=globalResult;if(comparison)comparison.finished=true;
    locked=true;state.finishedMs=duration;state.unlocked=Math.min(E.MAX_STAGE,Math.max(state.unlocked,state.stage+1));
    const id=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;state.lastRecord=id;
    const record={id,duration:Math.max(1,duration),at:Date.now(),hints:state.hints,shuffles:state.shuffles,rulesVersion:E.RULES_VERSION};
    const list=[...(records[state.stage]||[]),record].sort((a,b)=>a.duration-b.duration||a.at-b.at);const rank=list.findIndex(r=>r.id===id)+1;state.lastRank=rank;records[state.stage]=list.slice(0,30);write(RECORDS,records);save();updateStats();if(present){showCompletion(rank);sound('win');}
    const delivery=window.OjjudaSacheonseongOnline?.record(state.stage,record);
    if(comparison)comparison.deliveryId=delivery?.id;
    if(comparison&&delivery?.then)delivery.then(result=>compareGlobalResult(comparison,result)).catch(()=>compareGlobalResult(comparison,{ok:false}));
    if(window.parent!==window)window.parent.postMessage({source:'ojjuda-sacheonseong-game',type:'ojjuda:sacheonseong-finished',runId:state.runId,stage:state.stage},location.origin);
  }
  function showCompletion(rank){
    if(!completedRound())return;
    locked=true;const final=state.stage===E.MAX_STAGE;
    const title=$('win-title');if(title)title.textContent=final?'200개의 정원을 모두 완성했어요!':`${state.stage}단계 정원 완성!`;
    $('win-desc').innerHTML=`${state.stage}단계 · <strong class="win-time">${time(state.finishedMs)}</strong>`;
    $('previous-level').disabled=state.stage===1;
    $('previous-level-detail').textContent=state.stage===1?'첫 레벨':`${state.stage-1}단계`;
    $('current-level-detail').textContent=`${state.stage}단계 다시 하기`;
    $('next').disabled=final;
    $('next-level-detail').textContent=final?'마지막 레벨':`${state.stage+1}단계`;
    const completion=$('completion');completion.hidden=false;
    $('win-save-status').textContent='';$('win-save-status').hidden=true;
    window.OjjudaGameResults?.decorate(completion.querySelector('.completion-card'),{game:'sacheonseong',outcome:'success',metric:$('win-desc'),key:state.runId,actions:[completion.querySelector('.completion-levels')],extra:[$('win-save-status')]});
    completion.removeAttribute('aria-labelledby');completion.setAttribute('aria-label','사천성 결과');
    showGlobalResult();
    $('current-level').focus({preventScroll:true});
  }
  function chooseCompletedLevel(offset){
    const stage=state.stage+offset;
    if(![-1,0,1].includes(offset)||$('completion').hidden||!completedRound()||state.pendingPurchase||stage<1||stage>E.MAX_STAGE)return;
    if(window.OjjudaGameResults?.canPlay?.()===false)return;
    newStage(stage);$('board-scroll').focus({preventScroll:true});
  }
  function showModal(html){if($('options').open)$('options').close();$('modal-content').innerHTML=html;$('modal').showModal();}
  function confirmChange(title,message,action){const runId=state.runId;showModal(`<div class="eyebrow">새로운 시작</div><h2 id="modal-title">${title}</h2><p>${message}</p><div class="modal-buttons"><button class="action-button" id="cancel-action">계속하기</button><button class="next-button" id="confirm-action">새로 시작</button></div>`);$('cancel-action').onclick=()=>$('modal').close();$('confirm-action').onclick=()=>{if(state.runId!==runId||state.pendingPurchase)return;$('modal').close();action();};}
  function openRanking(stage=state.stage){
    rankingStage=stage;
    const stages=[...new Set([state.stage,...Object.keys(records).map(Number)])].sort((a,b)=>a-b);
    const html=`<div class="eyebrow">빠른 클리어 순서</div><h2 id="modal-title">나의 시간 순위</h2><label class="rank-select-label" for="rank-select">단계 선택</label><select id="rank-select">${stages.map(s=>`<option value="${s}"${s===stage?' selected':''}>${s}단계</option>`).join('')}</select><div class="rank-table" id="rank-table">${recordRows(stage,10)}</div><p class="rank-explainer">같은 단계에서 더 빨리 끝낼수록 높은 순위예요. 첫 패를 누른 순간부터 시간을 재며, 힌트·섞기 시간도 포함해요. 오답마다 10초가 추가돼요.</p><small class="rank-local">이 브라우저에 저장된 내 기록 TOP 10</small>`;
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
    if(!Array.isArray(pair)||pair.length!==2||!pair.every(p=>Number.isInteger(p?.layer)&&Number.isInteger(p?.r)&&Number.isInteger(p?.c)&&E.isExposed(layers(),p)))return;
    if(pair[0].layer!==pair[1].layer||layers()[pair[0].layer][pair[0].r][pair[0].c]!==layers()[pair[1].layer][pair[1].r][pair[1].c])return;
    const route=E.path(layers()[pair[0].layer],pair[0],pair[1]);if(!route)return;
    hints=pair;hints.forEach(p=>cell(p).classList.add('hinted'));draw(route,true,pair[0].layer);
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
      ensureMove();if(kind==='hint'&&!availableMove())return;
      state.runId ||= newPurchaseId();
      item={id:newPurchaseId(),runId:state.runId,stage:state.stage,kind,owner,requestedAt:Date.now()};
      state.pendingPurchase=item;
      if(!save()){state.pendingPurchase=null;toast('구매 기록을 저장할 수 없어 실행하지 않았어요.');return;}
    }
    const activeRun=state.runId,recoveryStartedAt=Date.now();
    purchaseBusy=true;syncTools();
    let result;
    try{result=await online.buy(item);}catch{result={ok:false,reason:'pending'};}
    purchaseBusy=false;
    if(state.pendingPurchase?.id!==item.id||state.runId!==activeRun){syncTools();return;}
    if(result?.ok&&result.kind===kind&&result.run_id===item.runId&&result.stage===item.stage&&result.price===TOOL_PRICES[kind]){
      const requestedAt=item.runId!==activeRun?recoveryStartedAt:Number.isFinite(item.requestedAt)&&item.requestedAt>0?Math.min(item.requestedAt,Date.now()):Date.now();
      const next={...state,pendingPurchase:null,startedAt:state.startedAt||requestedAt};
      if(kind==='hint'){const move=availableMove();if(!move){syncTools();toast('구매 다시 확인을 눌러 주세요.');return;}next.hints=(state.hints||0)+1;next.hintPair=[move.a,move.b];}
      else{const remade=layers().map(grid=>occupied(grid)?E.reshuffle(grid).grid:E.copy(grid));next.grid=remade[0];next.upcoming=remade.slice(1);next.shuffles=(state.shuffles||0)+1;next.hintPair=null;}
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
  $('board').addEventListener('click',e=>{const b=e.target.closest('.tile');if(b)select({layer:Number(b.dataset.layer),r:Number(b.dataset.r),c:Number(b.dataset.c)});});
  $('board').addEventListener('keydown',e=>{const b=e.target.closest('.tile');if(!b||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const layer=Number(b.dataset.layer),grid=layers()[layer];let r=Number(b.dataset.r),c=Number(b.dataset.c);const [dr,dc]={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[e.key];while(true){r+=dr;c+=dc;if(r<0||c<0||r>=grid.length||c>=grid[0].length)break;if(E.isExposed(layers(),{layer,r,c})){cell({layer,r,c}).focus();break;}}});
  $('hint').onclick=()=>useTool('hint');
  $('shuffle').onclick=()=>useTool('shuffle');
  $('restart').onclick=()=>{if(locked||state.pendingPurchase)return;confirmChange('이 정원을 다시 시작할까요?','패와 시간이 새로 시작돼요. 이미 세운 순위 기록은 남아 있어요.',()=>newStage(state.stage));};
  $('previous-level').onclick=()=>chooseCompletedLevel(-1);
  $('current-level').onclick=()=>chooseCompletedLevel(0);
  $('next').onclick=()=>chooseCompletedLevel(1);
  $('all-stages').onclick=openStages;
  $('ranking').onclick=()=>openRanking();
  $('help').onclick=()=>{showModal('<div class="eyebrow">사천성</div><h2 id="modal-title">이렇게 연결해요.</h2><ol><li>같은 그림의 패 두 개를 누르세요.<small>같은 그림은 한 판에 최대 4개! 한 번 더 누르면 선택이 풀려요.</small></li><li>가로·세로로, 두 번까지만 꺾어요.<small>같은 층에서 다른 패를 통과할 수 없어요. 빈 칸과 바깥 여백을 이용할 수 있어요.</small></li><li>층이 반 칸씩 어긋나 쌓여요.<small>윗패 한 장이 아래의 네 장을 가릴 수 있어요. 윗패와 겹치지 않는 아랫패는 먼저 연결할 수 있고, 윗패를 치우면 가려진 패가 열려요.</small></li></ol><p>힌트는 한 번에 3쭈, 직접 섞기는 10쭈예요. 연결할 패가 없을 때 자동으로 섞는 것은 무료예요.</p><p>두 손가락으로 벌리거나 오므리면 게임판만 확대·축소돼요. 커진 판은 한 손가락으로 밀고, 전체를 누르면 다시 한눈에 볼 수 있어요. 전체 보기에서도 바로 패를 선택해 연결할 수 있어요.</p><p>첫 패를 누르면 시간 측정이 시작돼요. 그림이 다르거나 연결할 수 없는 짝을 고를 때마다 경과 시간과 완료 기록에 10초가 더해져요. 오락실 순위는 최고 완료 단계가 우선이고, 같은 단계는 가장 짧은 시간으로 정해요. 힌트·섞기를 누르거나 다른 탭을 보는 동안에도 시간은 흘러요. 마지막으로 하던 레벨은 자동 저장돼요. 게임을 나갔다 다시 열면 그 레벨에서 새 판을 시작해요.</p><button class="next-button" id="help-ok">알겠어요, 연결해볼게요</button>');$('help-ok').onclick=()=>$('modal').close();};
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
  function clearPressed(){for(const point of pointers.values())point.button?.classList.remove('pressed');}
  viewport.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'){ignoreClickUntil=0;return;}
    if(!['touch','pen'].includes(event.pointerType)||pointers.size>=2)return;
    const button=event.target.closest('.tile:not(:disabled)');
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,button});
    if(pointers.size===2){clearPressed();pinch={...pair(),size:tileSize()};dragging=true;for(const id of pointers.keys())capture(id);event.preventDefault();}
    else{dragging=false;if(!locked&&!state.pendingPurchase&&!$('modal').open&&!$('options').open)button?.classList.add('pressed');}
  });
  window.addEventListener('pointermove',event=>{
    const point=pointers.get(event.pointerId);if(!point)return;
    const dx=event.clientX-point.x,dy=event.clientY-point.y;point.x=event.clientX;point.y=event.clientY;
    if(pointers.size===2&&pinch){
      const next=pair();event.preventDefault();zoomBoard(pinch.size*next.distance/pinch.distance,pinch.x,pinch.y);
      viewport.scrollLeft+=pinch.x-next.x;viewport.scrollTop+=pinch.y-next.y;pinch.x=next.x;pinch.y=next.y;
    }else{
      if(!dragging&&Math.hypot(point.x-point.startX,point.y-point.startY)>6){dragging=true;clearPressed();capture(event.pointerId);}
      if(dragging){event.preventDefault();viewport.scrollLeft-=dx;viewport.scrollTop-=dy;}
    }
  },{passive:false});
  function endPointer(event){
    const point=pointers.get(event.pointerId);if(!point)return;
    const tap=event.type==='pointerup'&&!dragging&&!pinch&&Math.hypot(event.clientX-point.startX,event.clientY-point.startY)<=6;
    point.button?.classList.remove('pressed');ignoreClickUntil=Date.now()+700;
    pointers.delete(event.pointerId);pinch=null;if(!pointers.size)dragging=false;
    // Commit a tap on release, without waiting for the browser's compatibility click.
    if(tap&&point.button?.isConnected)select({layer:Number(point.button.dataset.layer),r:Number(point.button.dataset.r),c:Number(point.button.dataset.c)});
  }
  window.addEventListener('pointerup',endPointer);window.addEventListener('pointercancel',endPointer);
  // Ignore duplicate touch clicks; keyboard activation and fresh pointer taps stay immediate.
  viewport.addEventListener('click',event=>{if(dragging||pinch||(Date.now()<ignoreClickUntil&&(event.detail>0||['touch','pen'].includes(event.pointerType)))){event.preventDefault();event.stopImmediatePropagation();}},true);
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
  window.addEventListener('ojjuda:sacheonseong-record',event=>{if(globalResult?.deliveryId&&event.detail?.id===globalResult.deliveryId)compareGlobalResult(globalResult,event.detail);});
  function validPurchase(item){const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);return item&&uuid(item.id)&&uuid(item.runId)&&uuid(item.owner)&&Number.isInteger(item.stage)&&item.stage>=1&&item.stage<=E.MAX_STAGE&&['hint','shuffle'].includes(item.kind);}
  const saved=read(KEY),storedRecords=read(RECORDS);
  if(storedRecords&&typeof storedRecords==='object'&&!Array.isArray(storedRecords)){for(const [k,v]of Object.entries(storedRecords))if(/^\d+$/.test(k)&&Array.isArray(v))records[k]=v.filter(r=>r&&Number.isFinite(r.duration)&&r.duration>0&&Number.isFinite(r.at)).sort((a,b)=>a.duration-b.duration).slice(0,30);}
  // Start a fresh visit at the last played level, keeping achievements and
  // unresolved receipts without restoring the old board, result or clock.
  const pending=validPurchase(saved?.pendingPurchase)?saved.pendingPurchase:null;
  const lastStage=Number.isInteger(saved?.stage)&&saved.stage>=1&&saved.stage<=E.MAX_STAGE?saved.stage:1;
  state={unlocked:Number.isInteger(saved?.unlocked)?Math.min(E.MAX_STAGE,Math.max(1,saved.unlocked)):1,sound:!!saved?.sound};
  newStage(lastStage,pending);
  setInterval(()=>{
    if(state.finishedMs==null)$('timer').textContent=time(ms());
    else if(globalResult&&!currentGlobalResult(globalResult)){
      globalResult=null;$('win-save-status').hidden=true;
      window.OjjudaGameResults?.update($('completion'),{outcome:'success',encouragement:''});
    }
  },70);
})();
