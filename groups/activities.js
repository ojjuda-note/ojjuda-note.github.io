(() => {
  'use strict';
  const labels = {poll:'투표', ladder:'사다리 타기', wheel:'돌림판'};
  const colors = ['#226c5d','#a34158','#315e96','#7f521b','#795290','#286973','#915037','#505a98','#546726','#8b4771'];

  function editor(activity, esc) {
    return `<section class="activity-editor" data-activity-fields hidden>
      <label class="field" data-names-field hidden>참가자 이름<textarea name="activity_names" rows="3" maxlength="420" placeholder="민지&#10;서준">${esc(activity?.names?.join('\n'))}</textarea></label>
      <label class="field"><span data-options-label></span><textarea name="activity_options" rows="3" maxlength="420">${esc(activity?.options.join('\n'))}</textarea></label>
      <p class="hint" data-activity-hint></p></section>`;
  }

  function syncEditor(form, kind, existing) {
    const active = Object.hasOwn(labels, kind), ladder = kind === 'ladder';
    form.querySelector('[data-activity-fields]').hidden = !active;
    form.querySelector('[data-names-field]').hidden = !ladder;
    const names = form.elements.activity_names, options = form.elements.activity_options;
    names.disabled = !ladder;
    options.disabled = !active;
    names.required = ladder;
    options.required = active;
    names.readOnly = options.readOnly = !!existing;
    if (!active) return;
    form.querySelector('[data-options-label]').textContent = ladder ? '도착할 결과' : kind === 'poll' ? '투표 항목' : '돌림판 항목';
    options.placeholder = ladder ? '설거지\n쉬기' : '떡볶이\n김밥';
    form.querySelector('[data-activity-hint]').textContent = existing ? '이미 올린 항목은 그대로 두고 제목과 내용을 수정할 수 있어요.' :
      (ladder ? '참가자와 결과를 같은 수로 입력하세요. ' : '') + '한 줄에 하나씩, 2~10개까지 쓸 수 있어요.';
  }

  function readEditor(form, kind) {
    function lines(field, unique) {
      const values = field.value.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
      if (values.length < 2 || values.length > 10) throw Error('한 줄에 하나씩, 항목을 2~10개 입력해 주세요.');
      if (values.some(v => [...v].length > 40)) throw Error('각 항목은 40자까지 쓸 수 있어요.');
      if (unique && new Set(values).size !== values.length) throw Error('같은 이름의 항목을 구분해 주세요.');
      return values;
    }
    const options = lines(form.elements.activity_options, kind !== 'ladder');
    if (kind !== 'ladder') return {kind, options};
    const names = lines(form.elements.activity_names, true);
    if (names.length !== options.length) throw Error('참가자와 결과의 수를 맞춰 주세요.');
    return {kind, options, names};
  }

  function wheel(options, winner) {
    const step = 360 / options.length;
    const angle = winner == null ? 0 : 360 - (winner + 0.5) * step;
    const stops = options.map((_,i) => colors[i]+' '+i*step+'deg '+(i+1)*step+'deg').join(',');
    const numbers = options.map((_,i) => {
      const a = (i+0.5)*step*Math.PI/180;
      return `<b style="left:${50+36*Math.sin(a)}%;top:${50-36*Math.cos(a)}%">${i+1}</b>`;
    }).join('');
    return `<div class="activity-wheel-frame" aria-hidden="true"><div class="activity-wheel" data-angle="${angle}" style="background:conic-gradient(${stops});transform:rotate(${angle}deg)">${numbers}</div></div>`;
  }

  function ladder(activity, rungs, selected, esc) {
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
    const path = track(selected);
    const rails = activity.names.map((_,i)=>`<line x1="${x(i)}" x2="${x(i)}" y1="2" y2="${height-2}"/>`).join('');
    const steps = rungs.map((col,i)=>`<line x1="${x(col)}" x2="${x(col+1)}" y1="${y(i)}" y2="${y(i)}"/>`).join('');
    return `<div class="ladder-scroll"><div class="ladder-board" style="min-width:${width}px;--lanes:${activity.names.length}">
      <div class="ladder-labels">${activity.names.map((name,i)=>`<button type="button" data-lane="${i}" aria-pressed="${i===selected}">${esc(name)}</button>`).join('')}</div>
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><g>${rails}${steps}</g><polyline points="${path.points}"/></svg>
      <div class="ladder-labels">${activity.options.map((option,i)=>`<span class="${i===path.col?'chosen':''}">${esc(option)}</span>`).join('')}</div></div></div>
      <p class="draw-result" role="status">${esc(activity.names[selected])} → ${esc(activity.options[path.col])}</p>`;
  }

  async function open(post, {dialog, api, esc, failure}) {
    const a = post.activity, options = a.options;
    const d = dialog(labels[a.kind], `<h3>${esc(post.title)}</h3><div data-panel aria-busy="true"><p class="muted">불러오는 중…</p></div><p class="error" role="alert"></p>`);
    const panel = d.querySelector('[data-panel]'), error = d.querySelector('.error');
    let state, busy = false, lane = 0;

    function render() {
      if (a.kind === 'poll') {
        const total = state.counts.reduce((sum,n)=>sum+n,0);
        panel.innerHTML = `<p class="hint">한 사람당 한 표예요. 다른 항목을 누르면 선택을 바꿀 수 있어요.</p>
          <div class="poll-options">${options.map((v,i)=>`<button type="button" data-choice="${i}" aria-pressed="${state.mine===i}">
            <span>${state.mine===i?'✓ ':''}${esc(v)}</span><b>${state.counts[i]}표</b>
            <i aria-hidden="true" style="width:${total?100*state.counts[i]/total:0}%"></i></button>`).join('')}</div>
          <div class="activity-summary"><span role="status">총 ${total}표</span><button type="button" data-reload>새로고침</button></div>`;
        return;
      }
      if (a.kind === 'ladder' && state.result) {
        panel.innerHTML = '<p class="hint">이름을 눌러 사다리를 따라가 보세요.</p>' + ladder(a,state.result.rungs,lane,esc);
        return;
      }
      const isWheel = a.kind === 'wheel', winner = state.result?.winner;
      const list = values => `<ol class="activity-legend">${values.map(v=>`<li>${esc(v)}</li>`).join('')}</ol>`;
      panel.innerHTML = isWheel ? wheel(options,winner) + list(options) :
        '<h4>참가자</h4>' + list(a.names) + '<h4>도착할 결과</h4>' + list(options);
      if (state.result) {
        panel.insertAdjacentHTML('beforeend',`<p class="draw-result" role="status">뽑힌 항목 · ${esc(options[winner])}</p>`);
      } else {
        panel.insertAdjacentHTML('beforeend',`<p class="hint">한 번 뽑으면 모든 그룹원이 같은 결과를 봐요.</p>
          <button class="primary" type="button" data-draw>${isWheel?'돌림판 돌리기':'사다리 타기'}</button>`);
      }
    }

    async function request(action, extra = {}) {
      if (busy) return;
      busy = true;
      error.textContent = '';
      panel.setAttribute('aria-busy','true');
      panel.querySelectorAll('button').forEach(b=>b.disabled=true);
      try {
        const next = await api(action,{id:post.id,...extra});
        if (!d.isConnected) return;
        if (a.kind==='wheel' && action==='activity_draw' && !state?.result) {
          const disc = panel.querySelector('.activity-wheel');
          if (disc?.animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            const angle = 1440-(next.result.winner+0.5)*360/options.length;
            await disc.animate([{transform:'rotate(0deg)'},{transform:`rotate(${angle}deg)`}],
              {duration:1350,easing:'cubic-bezier(.16,.65,.18,1)',fill:'forwards'}).finished;
          }
        }
        if (!d.isConnected) return;
        state = next;
        render();
        if (action==='activity_vote') panel.querySelector(`[data-choice="${state.mine}"]`)?.focus();
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
        panel.querySelectorAll('button').forEach(b=>b.disabled=false);
      }
    }
    panel.onclick = e => {
      const b = e.target.closest('button');
      if (!b || b.disabled || busy) return;
      if (b.hasAttribute('data-choice')) void request('activity_vote',{choice:Number(b.dataset.choice)});
      else if (b.hasAttribute('data-draw')) void request('activity_draw');
      else if (b.hasAttribute('data-reload')) void request('activity_state');
      else if (b.hasAttribute('data-lane')) {
        lane = Number(b.dataset.lane);
        render();
        panel.querySelector(`[data-lane="${lane}"]`).focus();
      }
    };
    await request('activity_state');
  }

  window.OjjudaGroupActivities = Object.freeze({labels,editor,syncEditor,readEditor,open});
})();
