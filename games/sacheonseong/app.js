(() => {
  'use strict';
  const E=window.TileGarden, $=id=>document.getElementById(id);
  const KEY='ojjuda-sacheonseong-v1', RECORDS='ojjuda-sacheonseong-records-v1';
  const faces=window.GardenFaces;
  const titles=['첫 번째 연결','조금 더 넓은 정원','차근차근 피어나는','연결의 즐거움','새로운 친구들','숲속의 산책','작은 보물찾기','넓어지는 세상','꽃길을 따라서','열 번째 정원','끝없는 발견','초록빛 도전','느긋한 오후','마지막 한 걸음','가장 큰 정원'];
  let state,records={},selected=null,locked=false,hints=[],toastTimer,autoTimer,flashTimer,customSize=null,overview=false;
  let audioContext,saveAvailable=true,countdown=3,rankingStage=1;
  function read(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
  function write(key,data){try{localStorage.setItem(key,JSON.stringify(data));}catch{saveAvailable=false;$('save-note').textContent='이 브라우저에서는 기록 저장을 사용할 수 없어요.';}}
  function save(){write(KEY,state);}
  function count(){return state.grid.flat().filter(v=>v!==E.EMPTY).length;}
  function ms(){return state.startedAt?Math.max(0,Date.now()-state.startedAt):0;}
  function time(value){const n=Math.floor(value/10),m=Math.floor(n/6000),s=Math.floor(n/100)%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(n%100).padStart(2,'0')}`;}
  function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2800);}
  function sound(kind){
    if(!state.sound)return;
    try{audioContext ||= new(window.AudioContext||window.webkitAudioContext)();audioContext.resume();const notes=kind==='win'?[523,659,784,1047]:kind==='match'?[659,880]:[440];notes.forEach((frequency,i)=>{const osc=audioContext.createOscillator(),gain=audioContext.createGain(),at=audioContext.currentTime+i*.08;osc.type='sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.055,at+.015);gain.gain.exponentialRampToValueAtTime(.001,at+.22);osc.connect(gain);gain.connect(audioContext.destination);osc.start(at);osc.stop(at+.24);});}catch{}
  }
  function begin(){if(!state.startedAt){state.startedAt=Date.now();$('board-caption').textContent='좋아요. 이제 같은 패를 하나씩 연결해요.';save();}}
  function clearSelection(){selected=null;hints=[];$('connection').replaceChildren();document.querySelectorAll('.tile.selected,.tile.hinted').forEach(b=>{b.classList.remove('selected','hinted');b.setAttribute('aria-pressed','false');});}
  function cell(p){return document.querySelector(`[data-r="${p.r}"][data-c="${p.c}"]`);}
  function sizeBoard(){
    const n=state.stage*2,available=$('board-scroll').clientWidth,pad=n<=2?28:22,gap=n<=2?12:n<=4?9:5;
    const useGap=overview?2:gap,usePad=overview?12:pad;
    const fit=Math.max(5,Math.floor((available-2*usePad-(n-1)*useGap)/n));
    const size=overview?fit:customSize||Math.max(42,Math.min(n===2?88:70,fit));
    const el=$('board-canvas');el.style.setProperty('--tile',`${size}px`);el.style.setProperty('--gap',`${useGap}px`);el.style.setProperty('--pad',`${usePad}px`);el.style.setProperty('--n',n);el.classList.toggle('overview',overview);
    $('zoom-controls').hidden=n<6;
    $('zoom-fit').setAttribute('aria-pressed',String(overview));$('zoom-fit').textContent=overview?'확대':'전체';$('zoom-fit').setAttribute('aria-label',overview?'큰 패로 돌아가기':'게임판 전체 보기');
    if(overview)$('board-caption').textContent='전체 보기에서도 같은 패를 눌러 연결하세요.';
    else if(n*size+(n-1)*useGap+2*usePad>available+1)$('board-caption').textContent='큰 정원은 상하좌우로 밀어서 볼 수 있어요.';
    else $('board-caption').textContent=state.startedAt?'같은 그림 두 개를 연결해보세요.':'첫 패를 누르면 시간이 시작돼요.';
    $('connection').replaceChildren();
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
    const first=$('board').firstElementChild,canvas=$('board-canvas'),style=getComputedStyle(canvas),pad=parseFloat(style.getPropertyValue('--pad')),gap=parseFloat(style.getPropertyValue('--gap')),w=first.offsetWidth,h=first.offsetHeight;
    const coords=route.map(p=>({x:pad+p.c*(w+gap)+w/2,y:pad+p.r*(h+gap)+h/2}));
    // The outside lane follows the board's visible padding, independent of tile size.
    coords.forEach((p,i)=>{const r=route[i].r,c=route[i].c,n=state.grid.length;if(r<0)p.y=pad/2;if(c<0)p.x=pad/2;if(r>=n)p.y=canvas.clientHeight-pad/2;if(c>=n)p.x=canvas.clientWidth-pad/2;});
    const points=coords.map(p=>`${p.x},${p.y}`).join(' '),ends=[coords[0],coords[coords.length-1]];
    $('connection').innerHTML=`<polyline points="${points}" ${soft?'opacity=".6" stroke-dasharray="5 6"':''}/>${ends.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4"/>`).join('')}`;
  }
  function updateStats(){const total=4*state.stage*state.stage,left=count();$('remaining').innerHTML=`${left} <small>/ ${total}</small>`;$('pairs').innerHTML=`${(total-left)/2} <small>/ ${total/2}</small>`;$('progress').style.width=`${100*(total-left)/total}%`;$('timer').textContent=time(state.finishedMs??ms());}
  function renderJourney(){
    const first=Math.min(E.MAX_STAGE-4,Math.max(1,state.stage-2));$('stage-list').replaceChildren();
    for(let s=first;s<first+5;s++){
      const b=document.createElement('button'),done=s<state.unlocked,active=s===state.stage;
      b.className='stage-item'+(active?' active':done?' done':'');b.disabled=s>state.unlocked;b.setAttribute('aria-label',`${s}단계, ${4*s*s}개의 패${active?', 현재 단계':s>state.unlocked?', 잠김':''}`);if(active)b.setAttribute('aria-current','step');
      b.innerHTML=`<span class="stage-dot">${active?s:done?'<svg class="icon"><use href="#i-check"/></svg>':'<svg class="icon"><use href="#i-lock"/></svg>'}</span><span class="stage-name">${4*s*s}개의 패<small>${s}단계 · ${s*2} × ${s*2}</small></span>`;
      b.addEventListener('click',()=>chooseStage(s));$('stage-list').append(b);
    }
    const info=E.stageInfo(state.stage);$('face-count').textContent=`이번 정원: 그림 ${info.typeCount}종 · 최대 ${state.stage===1?2:4}개씩`;
  }
  function chooseStage(s){if(s>state.unlocked)return;if($('modal').open)$('modal').close();if(s===state.stage&&count())return;if(state.startedAt&&count())confirmChange('다른 정원으로 갈까요?','현재 단계의 진행은 새로 시작하게 돼요.',()=>newStage(s));else newStage(s);}
  function openStages(){
    const cards=Array.from({length:E.MAX_STAGE},(_,i)=>{const s=i+1,info=E.stageInfo(s);return `<button class="stage-card${s===state.stage?' current':''}" data-stage="${s}" ${s>state.unlocked?'disabled':''} aria-label="${s}단계, ${info.total}개의 패${s>state.unlocked?', 잠김':''}"><span>${String(s).padStart(2,'0')}단계</span><strong>${info.total}<small>개</small></strong><small>${info.typeCount}종 · 최대 ${s===1?2:4}개씩</small>${s>state.unlocked?'<svg class="icon"><use href="#i-lock"/></svg>':''}</button>`;}).join('');
    showModal(`<div class="eyebrow">같은 그림은 최대 4개</div><h2 id="modal-title">15개의 정원을 만나보세요.</h2><p>64개 이후에도 11판이 더 있어요.<br>하나를 완성하면 다음 단계가 열려요.</p><div class="all-stage-grid">${cards}</div>`);
    $('modal-content').querySelectorAll('[data-stage]').forEach(b=>b.addEventListener('click',()=>chooseStage(Number(b.dataset.stage))));
  }
  function recordRows(stage,limit){const list=(records[stage]||[]).slice(0,limit);return list.length?list.map((r,i)=>`<div class="rank-row${r.id===state.lastRecord?' recent':''}"><span class="rank-number">${i+1}</span><strong>${time(r.duration)}</strong><span class="rank-date">${new Date(r.at).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'})}</span></div>`).join(''):'<p class="rank-empty">정원을 비우면<br>첫 시간 기록이 남아요.</p>';}
  function renderRanking(){$('rank-stage').textContent=`${state.stage}단계 · ${4*state.stage*state.stage}개의 패`;$('rank-preview').innerHTML=recordRows(state.stage,3);}
  function render(){
    window.OjjudaSacheonseongOnline?.stage(state.stage);
    $('stage-label').textContent=`STAGE ${String(state.stage).padStart(2,'0')}`;$('stage-title').textContent=titles[state.stage-1]||`${state.stage}번째 정원`;$('dimensions').textContent=`${state.stage*2} × ${state.stage*2}`;
    $('board-caption').textContent=state.startedAt?'같은 그림 두 개를 연결해보세요.':'첫 패를 누르면 시간이 시작돼요.';
    $('status').textContent='가로·세로로 연결하고, 두 번까지만 꺾어요.';
    $('sound').innerHTML=`<svg class="icon"><use href="#i-${state.sound?'sound':'muted'}"/></svg>`;$('sound').setAttribute('aria-pressed',String(state.sound));$('sound').setAttribute('aria-label',`효과음 ${state.sound?'끄기':'켜기'}`);
    renderBoard();updateStats();renderJourney();renderRanking();
  }
  function newStage(stage){
    stage=Math.min(E.MAX_STAGE,Math.max(1,stage));clearTimeout(autoTimer);clearTimeout(flashTimer);clearSelection();$('completion').hidden=true;locked=false;customSize=null;overview=false;
    state={rulesVersion:E.RULES_VERSION,stage,grid:E.generate(stage).grid,unlocked:Math.min(E.MAX_STAGE,Math.max(state?.unlocked||1,stage)),startedAt:null,finishedMs:null,sound:state?.sound||false,hints:0,shuffles:0,lastRecord:null};save();render();$('board-scroll').scrollTop=0;$('board-scroll').scrollLeft=0;
  }
  function ensureMove(){if(count()&&!E.moves(state.grid)){state.grid=E.reshuffle(state.grid).grid;save();renderBoard();$('status').textContent='연결할 패가 없어 자동으로 다시 섞었어요.';toast('막힌 정원을 자동으로 다시 섞었어요.');return true;}return false;}
  function select(p){
    if(locked||$('modal').open||state.grid[p.r][p.c]===E.EMPTY)return;begin();
    if(selected&&selected.r===p.r&&selected.c===p.c){clearSelection();return;}
    if(!selected){const suggested=hints.some(q=>q.r===p.r&&q.c===p.c)?hints.slice():[];clearSelection();hints=suggested;hints.forEach(q=>cell(q).classList.add('hinted'));selected=p;cell(p).classList.add('selected');cell(p).setAttribute('aria-pressed','true');sound('tap');return;}
    const a=selected;
    if(state.grid[a.r][a.c]!==state.grid[p.r][p.c]){clearSelection();selected=p;cell(p).classList.add('selected');cell(p).setAttribute('aria-pressed','true');$('status').textContent='같은 그림의 패를 찾아주세요.';return;}
    const route=E.path(state.grid,a,p);
    if(!route){cell(p).classList.remove('wrong');void cell(p).offsetWidth;cell(p).classList.add('wrong');$('status').textContent='다른 패에 막혀 있어요. 두 번까지만 꺾어 연결해요.';return;}
    locked=true;const willFinish=count()===2,finishDuration=willFinish?ms():null;clearSelection();draw(route);sound('match');cell(a).classList.add('removing');cell(p).classList.add('removing');
    // Persist the move immediately, before animation, so reloads cannot undo it.
    state.grid[a.r][a.c]=E.EMPTY;state.grid[p.r][p.c]=E.EMPTY;if(willFinish)state.finishedMs=finishDuration;save();
    flashTimer=setTimeout(()=>{
      renderBoard();updateStats();if(willFinish){finish(finishDuration);return;}locked=false;if(!ensureMove())$('status').textContent='잘 연결했어요! 다음 짝을 찾아보세요.';
      const next=$('board').querySelector('.tile:not(.empty)');if(next&&document.activeElement?.classList.contains('tile'))next.focus({preventScroll:true});
    },280);
  }
  function finish(duration){
    locked=true;state.finishedMs=duration;state.unlocked=Math.min(E.MAX_STAGE,Math.max(state.unlocked,state.stage+1));
    const id=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;state.lastRecord=id;
    const record={id,duration:Math.max(1,duration),at:Date.now(),hints:state.hints,shuffles:state.shuffles,rulesVersion:E.RULES_VERSION};
    const list=[...(records[state.stage]||[]),record].sort((a,b)=>a.duration-b.duration||a.at-b.at);const rank=list.findIndex(r=>r.id===id)+1;state.lastRank=rank;records[state.stage]=list.slice(0,30);write(RECORDS,records);save();renderJourney();renderRanking();updateStats();showCompletion(rank);sound('win');
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
  function advanceCountdown(){clearTimeout(autoTimer);$('countdown').textContent=`${countdown}초 뒤에 다음 정원으로 이동해요.`;autoTimer=setTimeout(()=>{if(document.hidden||$('modal').open){advanceCountdown();return;}countdown--;if(countdown<=0)newStage(state.stage+1);else advanceCountdown();},1000);}
  function showModal(html){$('modal-content').innerHTML=html;$('modal').showModal();}
  function confirmChange(title,message,action){showModal(`<div class="eyebrow">새로운 시작</div><h2 id="modal-title">${title}</h2><p>${message}</p><div class="modal-buttons"><button class="action-button" id="cancel-action">계속하기</button><button class="next-button" id="confirm-action">새로 시작</button></div>`);$('cancel-action').onclick=()=>$('modal').close();$('confirm-action').onclick=()=>{$('modal').close();action();};}
  function openRanking(stage=state.stage){
    rankingStage=stage;
    const stages=[...new Set([state.stage,...Object.keys(records).map(Number)])].sort((a,b)=>a-b);
    const html=`<div class="eyebrow">빠른 클리어 순서</div><h2 id="modal-title">나의 시간 순위</h2><label class="rank-select-label" for="rank-select">단계 선택</label><select id="rank-select">${stages.map(s=>`<option value="${s}"${s===stage?' selected':''}>${s}단계 · ${4*s*s}개의 패</option>`).join('')}</select><div class="rank-table" id="rank-table">${recordRows(stage,10)}</div><p class="rank-explainer">같은 단계에서 더 빨리 끝낼수록 높은 순위예요. 첫 패를 누른 순간부터 시간을 재며, 힌트·섞기 시간도 포함해요.</p><small class="rank-local">이 브라우저에 저장된 내 기록 TOP 10</small>`;
    if($('modal').open)$('modal-content').innerHTML=html;else showModal(html);
    $('rank-select').addEventListener('change',e=>{rankingStage=Number(e.target.value);$('rank-table').innerHTML=recordRows(rankingStage,10);});
  }
  $('board').addEventListener('click',e=>{const b=e.target.closest('.tile');if(b)select({r:Number(b.dataset.r),c:Number(b.dataset.c)});});
  $('board').addEventListener('keydown',e=>{const b=e.target.closest('.tile');if(!b||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();let r=Number(b.dataset.r),c=Number(b.dataset.c);const [dr,dc]={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[e.key];while(true){r+=dr;c+=dc;if(r<0||c<0||r>=state.grid.length||c>=state.grid.length)break;if(state.grid[r][c]!==E.EMPTY){cell({r,c}).focus();break;}}});
  $('hint').onclick=()=>{if(locked)return;begin();clearSelection();ensureMove();const move=E.moves(state.grid);if(!move)return;state.hints++;save();hints=[move.a,move.b];hints.forEach(p=>cell(p).classList.add('hinted'));draw(move.path,true);cell(move.a).scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});$('status').textContent='반짝이는 두 패를 연결해보세요.';};
  $('shuffle').onclick=()=>{if(locked)return;begin();clearSelection();state.grid=E.reshuffle(state.grid).grid;state.shuffles++;save();renderBoard();$('board-canvas').classList.remove('shuffling');void $('board-canvas').offsetWidth;$('board-canvas').classList.add('shuffling');$('status').textContent='패를 새로 섞었어요. 다시 연결해볼까요?';};
  $('restart').onclick=()=>{if(locked)return;confirmChange('이 정원을 다시 시작할까요?','패와 시간이 새로 시작돼요. 이미 세운 순위 기록은 남아 있어요.',()=>newStage(state.stage));};
  $('next').onclick=()=>state.stage===E.MAX_STAGE?openStages():newStage(state.stage+1);
  $('all-stages').onclick=openStages;
  $('ranking').onclick=()=>openRanking();
  $('help').onclick=()=>{showModal('<div class="eyebrow">사천성</div><h2 id="modal-title">이렇게 연결해요.</h2><ol><li>같은 그림의 패 두 개를 누르세요.<small>같은 그림은 한 판에 최대 4개! 한 번 더 누르면 선택이 풀려요.</small></li><li>가로·세로로, 두 번까지만 꺾어요.<small>다른 패를 통과할 수 없어요. 바깥 여백은 이용할 수 있어요.</small></li><li>4개부터 900개까지, 총 15단계예요.<small>64개 이후에도 100·144·196개… 11판을 더 즐겨요.</small></li></ol><p>큰 판은 상하좌우로 밀어볼 수 있어요. 전체 보기에서도 바로 패를 선택해 연결할 수 있어요.</p><p>첫 패를 누르면 시간 측정이 시작돼요. 오락실 순위는 최고 완료 단계가 우선이고, 같은 단계는 가장 짧은 시간으로 정해요. 힌트·섞기를 누르거나 화면을 나가도 시간은 흘러요.</p><button class="next-button" id="help-ok">알겠어요, 연결해볼게요</button>');$('help-ok').onclick=()=>$('modal').close();};
  $('sound').onclick=()=>{state.sound=!state.sound;save();$('sound').innerHTML=`<svg class="icon"><use href="#i-${state.sound?'sound':'muted'}"/></svg>`;$('sound').setAttribute('aria-pressed',String(state.sound));$('sound').setAttribute('aria-label',`효과음 ${state.sound?'끄기':'켜기'}`);if(state.sound)sound('tap');};
  $('modal-close').onclick=()=>$('modal').close();$('modal').addEventListener('click',e=>{if(e.target===$('modal')){const rect=$('modal').getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)$('modal').close();}});
  $('zoom-fit').onclick=()=>{overview=!overview;sizeBoard();$('board-scroll').scrollLeft=0;$('board-scroll').scrollTop=0;};
  $('zoom-in').onclick=()=>{overview=false;customSize=Math.min(92,Math.max(42,customSize||parseFloat(getComputedStyle($('board-canvas')).getPropertyValue('--tile')))+8);sizeBoard();};
  $('zoom-out').onclick=()=>{overview=false;customSize=Math.max(36,(customSize||parseFloat(getComputedStyle($('board-canvas')).getPropertyValue('--tile')))-8);sizeBoard();};
  window.addEventListener('resize',()=>{sizeBoard();if(hints.length){const p=E.path(state.grid,hints[0],hints[1]);if(p)draw(p,true);}});
  $('game-home').addEventListener('click',event=>{if(window.parent!==window){event.preventDefault();save();window.parent.postMessage({type:'ojjuda:sacheonseong-home'},location.origin);}});
  window.addEventListener('pagehide',save);
  function valid(s){return s&&Number.isInteger(s.stage)&&s.stage>=1&&s.stage<=E.MAX_STAGE&&Number.isInteger(s.unlocked)&&s.unlocked>=s.stage&&Array.isArray(s.grid)&&s.grid.length===s.stage*2&&s.grid.every(row=>Array.isArray(row)&&row.length===s.stage*2&&row.every(v=>Number.isInteger(v)&&v>=-1&&v<faces.length))&&(!s.startedAt||(Number.isFinite(s.startedAt)&&s.startedAt>0));}
  const saved=read(KEY),storedRecords=read(RECORDS);
  if(storedRecords&&typeof storedRecords==='object'&&!Array.isArray(storedRecords)){for(const [k,v]of Object.entries(storedRecords))if(/^\d+$/.test(k)&&Array.isArray(v))records[k]=v.filter(r=>r&&Number.isFinite(r.duration)&&r.duration>0&&Number.isFinite(r.at)).sort((a,b)=>a.duration-b.duration).slice(0,30);}
  if(valid(saved)){const needsRandomLayout=saved.rulesVersion!==E.RULES_VERSION;state=saved;state.unlocked=Math.min(E.MAX_STAGE,state.unlocked);state.rulesVersion=E.RULES_VERSION;if(!E.withinCopyLimit(state.grid)){newStage(state.stage);toast('같은 그림은 최대 4개! 현재 단계의 패를 새로 준비했어요.');}else if(count()===0){if(state.finishedMs!=null&&!Object.values(records).flat().some(r=>r.id===state.lastRecord)){render();finish(state.finishedMs);}else if(state.stage===E.MAX_STAGE){render();showCompletion(state.lastRank||1);}else newStage(state.stage+1);}else{if(needsRandomLayout){state.grid=E.reshuffle(state.grid).grid;toast('남은 패를 무작위로 골고루 섞었어요.');}render();ensureMove();save();}}else{if(saved&&Number.isInteger(saved.unlocked))state={unlocked:Math.min(E.MAX_STAGE,Math.max(1,saved.unlocked)),sound:!!saved.sound};newStage(saved&&Number.isInteger(saved.stage)?Math.min(E.MAX_STAGE,Math.max(1,saved.stage)):1);}
  setInterval(()=>{if(state.finishedMs==null)$('timer').textContent=time(ms());},70);
})();
