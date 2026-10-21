(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const prefix = 'ojjuda.mines.save.v1:';
  const rules = window.OjjudaMinesRules;
  let game, owner, ready = false, pending = null, flight = null, timeout;
  function post(message) { parent.postMessage({source:'ojjuda-mines', ...message}, location.origin); }
  function status(text, retry = false) {
    $('#minesRecordText').textContent = text; $('#minesRetry').hidden = !retry;
  }
  function progress() {
    const saved = game.getState(), d = Number($('#minesLevel').value);
    const level = d === 8 ? saved.custom : game.levels[d];
    const best = d === 8 ? saved.cb[`${level.c}x${level.r}x${level.m}`] : saved.best[d];
    $('#minesProgress').textContent = `${level.c}×${level.r} · 지뢰 ${level.m}개 · 개인 최고 ${best ? best + '초' : '기록 없음'}`;
  }
  function save(state) {
    if (!ready) return;
    try { localStorage.setItem(prefix + owner, JSON.stringify(state)); } catch {}
  }
  function flush() {
    if (!ready || !pending || flight) return;
    flight = pending; pending = null;
    status(`${flight.score.toLocaleString('ko-KR')}점 · 순위 등록 중…`);
    post({type:'ojjuda-game-result', ...flight, completed:true});
    timeout = setTimeout(() => {
      if (!flight) return;
      if (!pending || pending.score <= flight.score) pending = flight;
      flight = null; status('순위 등록을 다시 시도해 주세요.', true);
    }, 15000);
  }
  function completed(difficulty, seconds, runId) {
    const score = rules.score(difficulty, seconds);
    if (score === null) {
      if (!pending && !flight) status('커스텀은 개인 최고 기록만 남겨요.');
      return;
    }
    if (!ready) return;
    if (!pending || pending.score <= score) pending = {runId, difficulty, seconds, score};
    flush();
  }
  function requestExit() {
    if (game.isPlaying() && !confirm('게임을 나갈까요?\n진행 중인 판은 종료돼요.')) return;
    save(game.getState()); flush(); post({type:'ojjuda-game-exit'});
  }
  function receive(event) {
    if (event.origin !== location.origin || event.source !== parent || event.data?.source !== 'ojjuda-world') return;
    const m = event.data;
    if (m.type === 'ojjuda-mines-init' && !ready && typeof m.owner === 'string' && /^(guest|[a-f0-9-]{36})$/i.test(m.owner)) {
      owner = m.owner;
      let raw;
      try { raw = JSON.parse(localStorage.getItem(prefix + owner) || (owner === 'guest' ? localStorage.getItem('ojjuda-mines-v1') : 'null')); } catch {}
      game.loadState(rules.progress(raw));
      ready = true;
      $('#minesLevel').value = game.getState().d;
      $('#minesStart').disabled = false;
      $('#minesEntryHint').textContent = '완료한 기록은 게임순위에 자동 등록돼요.';
      progress();
    }
    if (!ready) return;
    if (m.type === 'ojjuda-mines-exit-request') requestExit();
    if (m.type === 'ojjuda-mines-record' && flight?.runId === m.runId) {
      clearTimeout(timeout);
      if (m.ok === true) {
        status(`${flight.score.toLocaleString('ko-KR')}점 · 게임순위 등록 완료`);
        flight = null;
        if (pending) setTimeout(flush, 5500);
      } else {
        if (!pending || pending.score <= flight.score) pending = flight;
        flight = null; status('순위 등록을 다시 시도해 주세요.', true);
      }
    }
    if (m.type === 'ojjuda-mines-ranking') {
      const list = $('#minesRanking'); list.replaceChildren();
      if (m.error) { list.textContent = '순위를 불러오지 못했어요. 다시 열어 주세요.'; return; }
      const rows = Array.isArray(m.rows) ? m.rows.slice(0, 5) : [];
      if (!rows.length) list.textContent = '아직 기록이 없어요. 첫 기록을 남겨 보세요.';
      for (const row of rows) {
        const li = document.createElement('li'), points = document.createElement('b');
        li.textContent = String(row.nick || '손님').slice(0, 20);
        points.textContent = `${Math.max(0, Number(row.score) || 0).toLocaleString('ko-KR')}점`;
        li.append(points); list.append(li);
      }
    }
  }
  window.OjjudaMinesEntry = {
    save, completed, requestExit,
    ended(runId) { if (ready) post({type:'ojjuda-game-finished', runId}); },
    connect(controller) {
      game = controller;
      $('#minesLevel').innerHTML = game.levels.map((level, i) => `<option value="${i}">${level.name}</option>`).join('') + '<option value="8">커스텀 · 개인 기록</option>';
      $('#minesLevel').onchange = () => { if (ready) progress(); };
      $('#minesStart').onclick = () => {
        if (!ready) return;
        $('#minesEntry').hidden = true; $('#app').hidden = false;
        game.start(Number($('#minesLevel').value));
      };
      $('#minesExit').onclick = requestExit;
      $('#minesRetry').onclick = flush;
      $('#minesRankingDetails').ontoggle = () => {
        if (!$('#minesRankingDetails').open) return;
        $('#minesRanking').textContent = '순위를 불러오는 중…';
        post({type:'ojjuda-game-ranking'});
      };
      addEventListener('message', receive);
      addEventListener('online', flush);
      addEventListener('keydown', event => {
        if (event.key === 'Escape' && !event.target.closest('#cust')) { event.preventDefault(); requestExit(); }
      });
      if (parent === window) location.replace('/world.html?game=mines');
      else post({type:'ojjuda-game-ready'});
    }
  };
})();
