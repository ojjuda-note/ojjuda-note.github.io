(() => {
  'use strict';
  const labels = {poll:'투표', ladder:'사다리 타기', wheel:'돌림판'};
  const colors = ['#963b51','#236963','#3a518c','#905517','#674680','#166077','#923b35','#4e548e','#5b652d','#833c68'];

  const fields = {
    poll: {title:'질문', example:'이번 모임에서 무엇을 먹을까요?', items:'보기', item:'보기', add:'보기 추가'},
    ladder: {title:'사다리 제목', example:'오늘 설거지는 누가 할까요?', items:'참가자와 도착 결과', item:'도착 결과', add:'참가자와 결과 추가'},
    wheel: {title:'추첨 주제', example:'이번 주 모임 장소는?', items:'돌림판 항목', item:'항목', add:'항목 추가'}
  };

  function row(kind, index, esc, activity) {
    const meta = fields[kind], n = index + 1, locked = activity ? 'readonly' : '';
    const input = (name, label, value) => `<label class="field">
      <span class="entry-label" data-row-label="${label}">${label} ${n}</span>
      <input type="text" name="${name}" placeholder="${label} ${n}" maxlength="80" required value="${esc(value)}" ${locked}>
    </label>`;
    return `<div class="activity-row" data-entry-row><span class="entry-index" aria-hidden="true">${n}</span>
      ${kind==='ladder' ? input('activity_name','참가자',activity?.names[index]) : ''}
      ${input('activity_option',meta.item,activity?.options[index])}
      ${locked ? '' : '<button type="button" class="row-remove" data-remove-row>×</button>'}
    </div>`;
  }

  function editor(activity, esc) {
    const kinds = activity ? [activity.kind] : Object.keys(fields);
    return kinds.map(kind => {
      const meta = fields[kind], count = activity?.options.length || 2;
      return `<fieldset class="activity-editor" data-editor="${kind}" disabled hidden>
        <legend>${meta.items} <span class="entry-count" data-count></span></legend>
        ${kind==='ladder'&&!activity?`<button type="button" class="roster-toggle" data-pick-members aria-expanded="false">그룹원 선택</button>
          <div data-members-picker hidden><div data-member-list></div><p role="status"></p><div class="roster-actions"><button type="button" data-close-picker>닫기</button><button type="button" class="primary" data-use-members disabled>선택한 이름 넣기</button></div></div>`:''}
        ${kind==='ladder'?'<div class="ladder-columns" aria-hidden="true"><span>참가자</span><span>도착 결과</span></div>':''}
        <div data-entry-list>${Array.from({length:count},(_,i)=>row(kind,i,esc,activity)).join('')}</div>
        ${activity ? '' : `<button type="button" data-add-row>＋ ${meta.add}</button>`}
        <p class="hint">${activity ? '게시한 항목은 고정돼요.' : '여러 줄 붙여넣기 가능 · 한 칸에 40자까지'}</p><p class="input-status" role="status" data-paste-status></p>
      </fieldset>`;
    }).join('');
  }

  function updateRows(group) {
    const rows = group.querySelectorAll('[data-entry-row]');
    group.querySelector('[data-count]').textContent=rows.length+' / 10';
    rows.forEach((item,i) => {
      item.querySelector('.entry-index').textContent=i+1;
      item.querySelectorAll('[data-row-label]').forEach(label=>{
        label.textContent=label.dataset.rowLabel+' '+(i+1);
        label.nextElementSibling.placeholder=label.textContent;
      });
      const remove = item.querySelector('[data-remove-row]');
      if (remove) {
        remove.hidden = rows.length<=2;
        remove.setAttribute('aria-label', (i+1)+'번째 줄 삭제');
      }
    });
    const add = group.querySelector('[data-add-row]');
    if (add) add.disabled = rows.length>=10;
  }

  // Multiline paste fills empty cells in the same column. Limit checks run
  // before growing the list, so pasting cannot partially replace a draft.
  function pasteItems(event, esc) {
    const input=event.target, group=input.closest('[data-editor]');
    if (!group || group.disabled || input.readOnly || input.disabled || !input.matches('input')) return;
    const text=event.clipboardData?.getData('text/plain') || '';
    if (!/[\r\n]/.test(text.trim())) return;
    event.preventDefault();
    const feedback=group.querySelector('[data-paste-status]');
    const lines=text.split(/\r\n|[\r\n]/).map(s=>s.trim()).filter(Boolean);
    if (lines.some(s=>[...s].length>40 || /[\u0000-\u001f]/.test(s))) {
      feedback.textContent='한 줄에 항목 하나씩, 40자 이내로 붙여넣어 주세요.';return;
    }
    const list=group.querySelector('[data-entry-list]');
    const inputs=Array.from(list.querySelectorAll(`input[name="${input.name}"]`));
    const start=inputs.indexOf(input);
    const whole=input.selectionStart===0 && input.selectionEnd===input.value.length;
    const free=inputs.slice(start).filter(el=>!el.value.trim() || (el===input && whole));
    const needed=Math.max(0,lines.length-free.length);
    if (inputs.length+needed>10) {
      feedback.textContent='기존 입력을 포함해 최대 10칸까지 사용할 수 있어요.';return;
    }
    for(let i=0;i<needed;i++){
      list.insertAdjacentHTML('beforeend',row(group.dataset.editor,list.children.length,esc));
      free.push(list.lastElementChild.querySelector(`[name="${input.name}"]`));
    }
    lines.forEach((value,i)=>{free[i].value=value;});
    updateRows(group);
    free[lines.length-1].focus();
    feedback.textContent=lines.length+'개를 입력했어요.';
  }

  function bindRoster(form, api) {
    const group=form.querySelector('[data-editor=ladder]'),open=group?.querySelector('[data-pick-members]');
    if(!open)return;
    const picker=group.querySelector('[data-members-picker]'),choices=picker.querySelector('[data-member-list]');
    const apply=picker.querySelector('[data-use-members]'),status=picker.querySelector('[role=status]');
    const room=form.elements.room_id;
    let ticket=0;
    function close(){
      ticket++;picker.hidden=true;choices.replaceChildren();open.disabled=false;open.setAttribute('aria-expanded','false');
    }
    open.addEventListener('click',async()=>{
      if(!picker.hidden){close();return;}
      const request=++ticket,roomId=room.value;
      picker.hidden=false;open.setAttribute('aria-expanded','true');choices.replaceChildren();
      status.textContent='그룹원을 불러오는 중…';apply.disabled=true;
      try{
        const members=await api('members',{room_id:roomId});
        if(request!==ticket || !form.isConnected || room.value!==roomId)return;
        const taken=new Set(Array.from(group.querySelectorAll('input[name=activity_name]'),el=>el.value.trim()).filter(Boolean));
        const listed=new Set();
        for(const {nickname} of members){
          const name=nickname?.trim();
          if(!name || listed.has(name))continue;
          listed.add(name);
          const label=document.createElement('label'),check=document.createElement('input');
          check.type='checkbox';check.value=name;check.disabled=taken.has(name)||[...name].length>40;
          label.append(check,document.createTextNode(name));choices.append(label);
        }
        status.textContent=listed.size?'':'선택할 그룹원이 없어요.';
        choices.querySelector('input:not(:disabled)')?.focus();
      }catch(err){
        if(request!==ticket || !form.isConnected)return;
        status.textContent=err?.code==='42501'?'그룹원 목록을 볼 권한이 없어요.':'그룹원 목록을 불러오지 못했어요. 닫았다가 다시 열어 주세요.';
      }
    });
    choices.addEventListener('change',()=>{apply.disabled=!choices.querySelector(':checked');status.textContent='';});
    picker.querySelector('[data-close-picker]').onclick=()=>{close();open.focus();};
    apply.onclick=()=>{
      const names=Array.from(choices.querySelectorAll(':checked'),el=>el.value);
      const inputs=Array.from(group.querySelectorAll('input[name=activity_name]')),used=new Set(inputs.map(el=>el.value.trim()).filter(Boolean));
      const incoming=names.filter(name=>!used.has(name)),empty=inputs.filter(el=>!el.value.trim());
      if(inputs.length+Math.max(0,incoming.length-empty.length)>10){status.textContent='참가자는 10명까지예요. 선택한 인원을 줄여 주세요.';return;}
      for(const name of incoming){
        let input=empty.shift();
        if(!input){
          group.querySelector('[data-add-row]').click();
          input=group.querySelector('[data-entry-row]:last-child [name=activity_name]');
        }
        input.value=name;
      }
      close();
      const next=Array.from(group.querySelectorAll('input[name=activity_option]')).find(el=>!el.value.trim());
      (next||open).focus();
    };
    room.addEventListener('change',close);
    form.addEventListener('submit',close);
    form.addEventListener('change',e=>{if(e.target===form.elements.kind&&e.target.value!=='ladder')close();});
  }

  function bindEditor(form, esc, api) {
    bindRoster(form,api);
    form.addEventListener('paste',e=>pasteItems(e,esc));
    form.addEventListener('click', e => {
      const control = e.target.closest('[data-add-row],[data-remove-row]');
      if (!control || control.disabled) return;
      const group = control.closest('[data-editor]'), list = group.querySelector('[data-entry-list]');
      if (group.disabled) return;
      if (control.hasAttribute('data-add-row') && list.children.length<10) {
        list.insertAdjacentHTML('beforeend',row(group.dataset.editor,list.children.length,esc));
        list.lastElementChild.querySelector('input').focus();
      } else if (control.hasAttribute('data-remove-row') && list.children.length>2) {
        const item = control.closest('[data-entry-row]'), next = item.nextElementSibling || item.previousElementSibling;
        item.remove();
        next.querySelector('input').focus();
      }
      updateRows(group);
    });
  }

  function syncEditor(form, kind) {
    const meta = fields[kind];
    form.querySelector('[data-title-label]').textContent = meta?.title || '제목';
    form.querySelector('[data-body-label]').textContent = meta ? '추가 설명 (선택)' : '내용';
    form.elements.title.placeholder = meta?.example || '제목';
    form.querySelector('[data-kind-fields]').classList.toggle('activity-heading',!!meta);
    for (const group of form.querySelectorAll('[data-editor]')) {
      const active = group.dataset.editor===kind;
      group.hidden = group.disabled = !active;
      if (active) updateRows(group);
    }
  }

  function readEditor(form, kind) {
    const group = form.querySelector(`[data-editor="${kind}"]`);
    function read(name, label, unique) {
      const values = Array.from(group.querySelectorAll(`[name="${name}"]`),input=>input.value.trim());
      if (values.length<2 || values.length>10 || values.some(v=>!v)) throw Error(label+' 입력칸을 모두 채워 주세요.');
      if (values.some(v=>[...v].length>40)) throw Error('각 항목은 40자까지 쓸 수 있어요.');
      if (unique && new Set(values).size!==values.length) throw Error('같은 이름의 '+label+' 항목을 구분해 주세요.');
      return values;
    }
    const options = read('activity_option',fields[kind].item,kind!=='ladder');
    return kind==='ladder' ? {kind,options,names:read('activity_name','참가자',true)} : {kind,options};
  }

  function ballot(options, mine, esc) {
    return `<fieldset class="poll-ballot"><legend>보기 하나를 골라 주세요.</legend>
      ${options.map((value,i)=>`<label><input type="radio" name="poll_choice" value="${i}" ${mine===i?'checked':''}><span>${esc(value)}</span></label>`).join('')}
      </fieldset><div class="activity-summary ballot-actions">
        <button type="button" class="primary" data-cast disabled>${mine==null?'투표하기':'변경한 표 저장'}</button>
        ${mine==null?'':'<button type="button" data-show-results>취소</button>'}
      </div>`;
  }

  function pollResults(options, state, esc) {
    const total = state.counts.reduce((sum,n)=>sum+n,0);
    const max=Math.max(...state.counts), tied=state.counts.filter(n=>n===max).length>1;
    const rows = options.map((value,i)=>{
      const count = state.counts[i], percent = total ? 100*count/total : 0;
      const leader=count>0 && count===max;
      return `<li class="${leader?'poll-leader':''}"><div class="poll-result-label"><span>${esc(value)} ${leader?`<small>${tied?'공동 1위':'1위'}</small>`:''} ${state.mine===i?'<small>내 선택</small>':''}</span>
        <strong>${count}표 · ${Number(percent.toFixed(1))}%</strong></div>
        <div class="poll-track" aria-hidden="true"><span style="width:${percent}%"></span></div></li>`;
    }).join('');
    return `<section class="poll-results" aria-label="투표 결과"><div class="poll-result-heading">
      <h4 tabindex="-1" data-results-heading>투표 결과</h4><span>총 ${total}표</span></div><ul>${rows}</ul></section>
      <div class="activity-summary ballot-actions"><button type="button" data-change-vote>다시 선택</button>
      <button type="button" data-reload>결과 새로고침</button></div>`;
  }

  function wheel(options, winner, esc) {
    const step = 360 / options.length;
    const angle = winner == null ? 0 : 360 - (winner + 0.5) * step;
    const stops = options.map((_,i) => {
      const start = i * step, end = (i + 1) * step;
      return `#f5d6a4 ${start}deg ${start + .65}deg, ${colors[i]} ${start + .65}deg ${end}deg`;
    }).join(',');
    const numbers = options.map((value,i) => {
      const chars=Array.from(value),limit=options.length<=4?6:options.length<=6?4:0;
      const caption=limit ? esc(chars.slice(0,limit).join(''))+(chars.length>limit?'…':'') : '';
      const a = (i+0.5)*step*Math.PI/180;
      return `<span class="wheel-label" style="left:${50+36*Math.sin(a)}%;top:${50-36*Math.cos(a)}%;transform:translate(-50%,-50%) rotate(${-angle}deg)"><b class="${winner===i?'wheel-hit':''}">${i+1}</b>${caption?`<small>${caption}</small>`:''}</span>`;
    }).join('');
    return `<div class="activity-wheel-frame" aria-hidden="true"><div class="activity-wheel" data-angle="${angle}" style="background:conic-gradient(${stops});transform:rotate(${angle}deg)">${numbers}</div><span class="wheel-center"></span><span class="wheel-pointer"></span></div>`;
  }

  function ladderRoutes(activity, rungs) {
    const width = activity.names.length * 50, height = 36 + rungs.length * 9;
    const x = i => 25 + i*50, y = i => 18 + i*9;
    const track = start => {
      let col = start, points = [[x(col),2]];
      rungs.forEach((left,i) => {
        if (col !== left && col !== left+1) return;
        points.push([x(col),y(i)]);
        col = col === left ? left+1 : left;
        points.push([x(col),y(i)]);
      });
      points.push([x(col),height-2]);
      return {col, points:points.map(p=>p.join(',')).join(' ')};
    };
    const routes = activity.names.map((_,i)=>track(i));
    return {routes,width,height,x,y};
  }

  function ladder(activity, savedRungs, selected, esc) {
    // Two adjacent crossings cancel each other, preserving the saved draw.
    // Distribute these pairs throughout the board, including for old posts.
    const laneCount = activity.names.length;
    const minimumRungs = Math.max(12, laneCount * 2);
    const extraPairs = Math.max(0, Math.ceil((minimumRungs - savedRungs.length) / 2));
    const gapCount = savedRungs.length + 1;
    const rungs = [];
    let pair = 0;
    const seed = savedRungs.reduce((sum, col, i) => sum + (col + 1) * (i + 1), 0);
    for (let gap = 0; gap < gapCount; gap++) {
      const pairLimit = Math.floor((gap + 1) * extraPairs / gapCount);
      for (; pair < pairLimit; pair++) {
        const col = (seed + pair + gap) % (laneCount - 1);
        rungs.push(col, col);
      }
      if (gap < savedRungs.length) rungs.push(savedRungs[gap]);
    }
    const {routes,width,height,x,y}=ladderRoutes(activity,rungs), path=routes[selected];
    const rails = activity.names.map((_,i)=>`<line x1="${x(i)}" x2="${x(i)}" y1="2" y2="${height-2}"/>`).join('');
    const steps = rungs.map((col,i)=>`<line x1="${x(col)}" x2="${x(col+1)}" y1="${y(i)}" y2="${y(i)}"/>`).join('');
    return `<div class="ladder-scroll"><div class="ladder-board" style="min-width:${width}px;--lanes:${activity.names.length}">
      <div class="ladder-labels">${activity.names.map((name,i)=>`<button type="button" data-lane="${i}" aria-pressed="${i===selected}">${esc(name)}</button>`).join('')}</div>
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><g>${rails}${steps}</g>${path ? `<polyline points="${path.points}"/><ellipse/>` : ''}</svg>
      <div class="ladder-labels ladder-finish">${activity.options.map((_,i)=>`<span data-finish="${i}" aria-label="도착 칸 ${i+1}"><i aria-hidden="true"></i>${i+1}</span>`).join('')}</div></div></div>`;
  }

  function drawStage(kind, board, action) {
    return `<section class="draw-stage" data-stage="${kind}">
      ${board}
      <div class="draw-display"><p data-draw-status role="status"></p><span class="draw-progress" aria-hidden="true"></span></div>
      ${action ? `<button type="button" class="primary draw-action" data-draw>${action}</button>` : ''}
    </section>`;
  }

  function traceLadder(board, dialog) {
    const path = board.querySelector('polyline'), dot = board.querySelector('ellipse');
    if (!path?.getTotalLength || !window.requestAnimationFrame) return Promise.resolve();
    const length = path.getTotalLength(), scroll = board.closest('.ladder-scroll');
    const svg = path.ownerSVGElement;
    const duration = Math.min(5500, 2100 + length * 3);
    const viewBox = svg.viewBox.baseVal;
    dot.setAttribute('rx', 5 * viewBox.width / Math.max(1, svg.clientWidth));
    dot.setAttribute('ry', 5 * viewBox.height / Math.max(1, svg.clientHeight));
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;
    return new Promise(resolve => {
      let start;
      function step(time) {
        if (!dialog.isConnected || !dialog.open) { resolve(); return; }
        start ??= time;
        const progress = Math.min(1, (time - start) / duration);
        const distance = length * (1 - Math.pow(1 - progress, 1.5));
        const point = path.getPointAtLength(distance);
        path.style.strokeDashoffset = length - distance;
        dot.setAttribute('cx', point.x);
        dot.setAttribute('cy', point.y);
        const x = point.x * svg.clientWidth / viewBox.width;
        const maxScroll = scroll.scrollWidth - scroll.clientWidth;
        if (maxScroll > 0) scroll.scrollLeft = Math.max(0, Math.min(maxScroll, x - scroll.clientWidth / 2));
        if (progress < 1) window.requestAnimationFrame(step);
        else resolve();
      }
      window.requestAnimationFrame(step);
    });
  }

  async function open(post, {dialog, api, esc, failure}) {
    const a = post.activity, options = a.options;
    const d = dialog(labels[a.kind], `<h3 class="activity-subject">${esc(post.title)}</h3><div data-panel aria-busy="true"><p class="muted">불러오는 중…</p></div><p class="error" role="alert"></p>`);
    d.dataset.activityKind=a.kind;
    const panel = d.querySelector('[data-panel]'), error = d.querySelector('.error');
    let state, busy = false, lane = null, changingVote = false;

    function copyText() {
      let lines;
      if(a.kind==='poll'){
        const total=state.counts.reduce((sum,n)=>sum+n,0);
        lines=options.map((name,i)=>name+' · '+state.counts[i]+'표 ('+(total?Number((100*state.counts[i]/total).toFixed(1)):0)+'%)');
        lines.push('총 '+total+'표');
      }else if(a.kind==='ladder'){
        const {routes}=ladderRoutes(a,state.result.rungs);
        lines=routes.map((r,i)=>a.names[i]+' → '+options[r.col]);
      }else lines=['당첨 · '+options[state.result.winner]];
      return [post.title,...lines].join('\n');
    }

    function resultTools() {
      panel.insertAdjacentHTML('beforeend','<div class="result-tools"><button type="button" data-copy-result>결과 복사</button><span role="status" data-copy-status></span></div>');
    }

    function render() {
      if (a.kind === 'poll') {
        panel.innerHTML = state.mine==null || changingVote ? ballot(options,state.mine,esc) : pollResults(options,state,esc);
        if(state.mine!=null && !changingVote)resultTools();
        return;
      }
      const isWheel = a.kind === 'wheel';
      const list = values => `<ol class="activity-legend">${values.map(v=>`<li>${esc(v)}</li>`).join('')}</ol>`;
      if (isWheel) {
        panel.innerHTML = drawStage('wheel', wheel(options,null,esc),
          state.result ? '저장된 추첨 보기' : '돌림판 돌리기') +
          `<ol class="activity-legend wheel-options">${options.map((value,i)=>`<li><span aria-hidden="true" style="--option-color:${colors[i]}">${i+1}</span><div>${esc(value)}</div></li>`).join('')}</ol>`;
      } else if (state.result) {
        panel.innerHTML = drawStage('ladder',ladder(a,state.result.rungs,lane,esc));
        panel.querySelector('[data-draw-status]').textContent = '출발할 참가자를 선택하세요.';
      } else {
        panel.innerHTML = drawStage('ladder','<h4>참가자</h4>'+list(a.names)+'<h4>도착할 결과</h4>'+list(options),'사다리 타기');
      }
      if (!state.result) panel.insertAdjacentHTML('beforeend','<p class="hint">모든 그룹원이 같은 결과를 봐요.</p>');
    }

    async function reveal(selected) {
      const isWheel = a.kind === 'wheel', result = state.result;
      const winner = result.winner;
      lane = selected;
      const previousScroll = panel.querySelector('.ladder-scroll')?.scrollLeft || 0;
      const expanded = panel.querySelector('.draw-all')?.open || false;
      render();
      const stage = panel.querySelector('[data-stage]'), status = stage.querySelector('[data-draw-status]');
      const button = stage.querySelector('[data-draw]');
      const controls = [...stage.querySelectorAll('button')];
      const scroll = stage.querySelector('.ladder-scroll');
      if (scroll) scroll.scrollLeft = previousScroll;
      controls.forEach(control=>{ control.disabled = true; });
      stage.dataset.phase = 'running';
      status.textContent = isWheel ? '돌림판이 돌아가는 중…' : a.names[lane]+' · 내려가는 중…';
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (!reduceMotion) {
        if (isWheel) {
          const disc = stage.querySelector('.activity-wheel');
          const angle = 2160 - (winner + 0.5) * 360 / options.length;
          const rotation = disc.animate?.([
            {transform:'rotate(0deg)',offset:0,easing:'cubic-bezier(.16,.58,.42,1)'},
            {transform:`rotate(${angle - 72}deg)`,offset:.72,easing:'cubic-bezier(.25,.62,.24,1)'},
            {transform:`rotate(${angle}deg)`,offset:1}
          ], {duration:4250,fill:'forwards'});
          if (rotation) {
            const stop = () => rotation.cancel();
            d.addEventListener('close',stop,{once:true});
            await rotation.finished.catch(()=>{});
            d.removeEventListener('close',stop);
            stop();
          }
        } else {
          await traceLadder(stage.querySelector('.ladder-board'),d);
        }
      }
      if (!d.isConnected || !d.open) return;
      stage.dataset.phase = 'revealed';
      controls.forEach(control=>{ control.disabled = false; });
      if (isWheel) {
        stage.querySelector('.activity-wheel-frame').outerHTML = wheel(options,winner,esc);
        const item = panel.querySelector('.activity-legend').children[winner];
        item.classList.add('wheel-winner');
        item.insertAdjacentHTML('beforeend',' <b>당첨</b>');
        button.textContent = '다시 보기';
        status.innerHTML = `<span>당첨</span><strong>${esc(options[winner])}</strong>`;
      } else {
        const {routes} = ladderRoutes(a,result.rungs), finish = routes[lane].col;
        stage.querySelector(`[data-finish="${finish}"]`).classList.add('chosen');
        status.innerHTML = `<span>${esc(a.names[lane])} 도착</span><strong>${esc(options[finish])}</strong>`;
        panel.insertAdjacentHTML('beforeend',`<details class="draw-all" ${expanded?'open':''}><summary>참가자별 결과</summary><dl class="ladder-results">${routes.map((route,i)=>
          `<div><dt>${esc(a.names[i])}</dt><dd>${esc(options[route.col])}</dd></div>`).join('')}</dl></details>`);
      }
      resultTools();
      // Keep focus in the dialog after replacing the clicked control.
      const focus = isWheel ? button : stage.querySelector(`[data-lane="${lane}"]`);
      if (document.activeElement === document.body || document.activeElement === d) {
        focus.focus({preventScroll:true});
      }
    }

    async function request(action, extra = {}) {
      if (busy) return;
      busy = true;
      error.textContent = '';
      panel.setAttribute('aria-busy','true');
      const controls = [...panel.querySelectorAll('button,input')].map(el=>[el,el.disabled]);
      controls.forEach(([el])=>el.disabled=true);
      try {
        const next = await api(action,{id:post.id,...extra});
        if (!d.isConnected) return;
        state = next;
        changingVote = false;
        if (action==='activity_draw') await reveal(0);
        else render();
        if (action==='activity_vote') panel.querySelector('[data-results-heading]')?.focus();
      } catch (err) {
        if (!d.isConnected) return;
        error.textContent = failure(err);
        if (!state || err?.code==='42501') {
          state = null;
          panel.innerHTML = '<button type="button" data-reload>다시 불러오기</button>';
        }
      } finally {
        busy = false;
        panel.setAttribute('aria-busy','false');
        controls.forEach(([el,disabled])=>{ if (el.isConnected) el.disabled=disabled; });
      }
    }
    panel.onchange = e => {
      if (e.target.name==='poll_choice' && !busy) {
        panel.querySelector('[data-cast]').disabled = state.mine===Number(e.target.value);
      }
    };
    panel.onclick = async e => {
      const b = e.target.closest('button');
      if (!b || b.disabled || busy) return;
      if (b.hasAttribute('data-copy-result')) {
        const text=copyText(),status=panel.querySelector('[data-copy-status]');
        try{
          await navigator.clipboard.writeText(text);
          status.textContent='복사했어요.';
        }catch{
          if(!status.isConnected)return;
          const fallback=document.createElement('textarea');
          fallback.readOnly=true;fallback.value=text;fallback.setAttribute('aria-label','복사할 결과');
          status.replaceChildren(document.createTextNode('선택된 결과를 복사해 주세요.'),fallback);
          fallback.focus();fallback.select();
        }
      } else if (b.hasAttribute('data-cast')) {
        const choice = panel.querySelector('input[name="poll_choice"]:checked');
        if (choice) void request('activity_vote',{choice:Number(choice.value)});
      } else if (b.hasAttribute('data-change-vote') || b.hasAttribute('data-show-results')) {
        changingVote = b.hasAttribute('data-change-vote');
        render();
        panel.querySelector(changingVote?'input:checked':'[data-results-heading]')?.focus();
      } else if (b.hasAttribute('data-draw') && !state.result) void request('activity_draw');
      else if (b.hasAttribute('data-reload')) void request('activity_state');
      else if (b.hasAttribute('data-lane') || b.hasAttribute('data-draw')) {
        busy = true;
        try {
          await reveal(Number(b.dataset.lane ?? 0));
        } finally {
          busy = false;
        }
      }
    };
    await request('activity_state');
  }

  window.OjjudaGroupActivities = Object.freeze({labels,fields,editor,bindEditor,syncEditor,readEditor,open});
})();
