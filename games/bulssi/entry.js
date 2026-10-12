/* Local progress is account-scoped; only normal play reaches public rankings. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const names = ['잿불','원시별','주계열성','적색거성','블랙홀'];
  const prefix = 'ojjuda.saetbyeol.save.v1:';
  let game, owner, ready = false, started = false, sent = 0, queued = null, flight = null, timer, timeout;
  let boost = null, boostTimer;
  function post(message) { parent.postMessage({source:'ojjuda-saetbyeol', ...message}, location.origin); }
  function sendBoost() {
    clearTimeout(boostTimer);
    if (!boost) return;
    post({type:'ojjuda-game-booster', requestId:boost.requestId, runId:boost.runId, stage:boost.stage, demo:false});
    // A lost response retries the same receipt, never a new charge.
    boostTimer = setTimeout(sendBoost, 12000);
  }
  function buyBooster(runId, requestId) {
    if (!ready || owner === 'guest') return Promise.resolve({ok:false, reason:'sign_in'});
    if (game.isDemo() || !game.isRunning() || boost) return Promise.resolve({ok:false, reason:'unavailable'});
    return new Promise(resolve => {
      boost = {runId, requestId, stage:game.getState().stage, resolve};
      sendBoost();
    });
  }
  function score(state) {
    const stage = Math.min(4, Math.max(0, Math.floor(Number(state.stage) || 0)));
    const levels = game.upgrades.reduce((sum, u) => sum + Math.min(u.mx, Math.max(0, Math.floor(Number(state.lv?.[u.id]) || 0))), 0);
    const memories = (state.mem || []).slice(0, 5).reduce((sum, n) => sum + Math.min(3, Math.max(0, Math.floor(Number(n) || 0))), 0);
    return stage * 10000 + levels * 10 + memories * 100 + (state.ended && stage === 4 ? 10000 : 0);
  }
  function status(text, retry = false) {
    $('#starRecordText').textContent = text;
    $('#starRetry').hidden = !retry;
  }
  function refresh() {
    const state = game.getState();
    const points = score(state);
    $('#starProgress').textContent = `${names[state.stage] || names[0]} · 성장 점수 ${points.toLocaleString('ko-KR')}점`;
    $('#starStart').textContent = state.intro ? '이어서 키우기' : '시작하기';
  }
  function flush() {
    clearTimeout(timer);
    if (!ready || !queued || flight) return;
    flight = queued; queued = null;
    status('성장 점수를 순위에 등록하는 중…');
    post({type:'ojjuda-game-result', runId:flight.id, score:flight.score, demo:false});
    timeout = setTimeout(() => {
      if (!flight) return;
      if (!queued || queued.score <= flight.score) queued = flight;
      flight = null;
      status('기록을 보관했어요. 연결되면 다시 등록해 주세요.', true);
    }, 15000);
  }
  function save(state) {
    if (!ready || game.isDemo()) return;
    try { localStorage.setItem(prefix + owner, JSON.stringify(state)); } catch {}
    const points = score(state);
    if (started && points > sent && points > (flight?.score || 0) && points > (queued?.score || 0)) {
      queued = {id:crypto.randomUUID(), score:points};
      clearTimeout(timer); timer = setTimeout(flush, 600);
    }
    refresh();
  }
  function init(id, admin) {
    if (ready || typeof id !== 'string' || !/^(guest|[a-f0-9-]{36})$/i.test(id)) return;
    owner = id;
    let raw = null;
    try {
      const saved = localStorage.getItem(prefix + owner);
      raw = JSON.parse(saved || (owner === 'guest' ? localStorage.getItem('bulssi-save-v1') : 'null'));
    } catch {}
    game.loadState(raw);
    game.allowDemo(admin === true && id !== 'guest');
    ready = true;
    $('#starStart').disabled = false;
    $('#starEntryHint').textContent = '진행 상황은 이 기기에 자동 저장돼요.';
    refresh();
  }
  function receive(event) {
    if (event.origin !== location.origin || event.source !== parent || event.data?.source !== 'ojjuda-world') return;
    const m = event.data;
    if (m.type === 'ojjuda-saetbyeol-init') init(m.owner, m.admin);
    if (!ready) return;
    if (m.type === 'ojjuda-saetbyeol-booster' && boost && boost.requestId === m.requestId && boost.runId === m.runId) {
      const result = m.result;
      if (!result || result.reason === 'pending') return;
      if (result.ok === true && (result.price !== 3 || result.seconds !== 5 || result.density !== 2 ||
          result.run_id !== boost.runId || result.stage !== boost.stage)) return;
      if (result.ok !== true && result.ok !== false) return;
      clearTimeout(boostTimer);
      const resolve = boost.resolve; boost = null; resolve(result);
    }
    if (m.type === 'ojjuda-saetbyeol-exit-request') {
      if (boost) { game.notice('부스터 결제를 확인하고 있어요. 잠시만 기다려 주세요.'); return; }
      if (game.isRunning() && !confirm('게임을 나갈까요?\n키운 별은 자동 저장돼요.')) return;
      save(game.getState()); flush(); post({type:'ojjuda-game-exit'});
    }
    if (m.type === 'ojjuda-saetbyeol-record' && flight?.id === m.runId) {
      clearTimeout(timeout);
      if (m.ok === true) {
        sent = Math.max(sent, flight.score); flight = null;
        status(`성장 ${sent.toLocaleString('ko-KR')}점 · 게임순위 등록 완료`);
        if (queued) timer = setTimeout(flush, 5500);
      } else {
        if (!queued || queued.score <= flight.score) queued = flight;
        flight = null; status('순위 등록을 다시 시도해 주세요.', true);
      }
    }
    if (m.type === 'ojjuda-saetbyeol-ranking') {
      const list = $('#starRanking'); list.replaceChildren();
      if (m.error) { list.textContent = '순위를 불러오지 못했어요. 다시 열어 주세요.'; return; }
      const rows = Array.isArray(m.rows) ? m.rows.slice(0, 5) : [];
      if (!rows.length) list.textContent = '아직 기록이 없어요. 첫 샛별을 키워 보세요.';
      for (const row of rows) {
        const li = document.createElement('li'), points = document.createElement('b');
        li.textContent = String(row.nick || '손님').slice(0, 20);
        points.textContent = `${Math.max(0, Number(row.score) || 0).toLocaleString('ko-KR')}점`;
        li.append(points); list.append(li);
      }
    }
  }
  window.OjjudaSaetbyeolEntry = {
    save, buyBooster,
    connect(controller) {
      game = controller;
      $('#starStart').onclick = () => {
        if (!ready) return;
        started = true; $('#starEntry').hidden = true;
        game.start(); save(game.getState());
      };
      $('#starExit').onclick = () => post({type:'ojjuda-game-exit'});
      $('#starRetry').onclick = flush;
      $('#starRankingDetails').ontoggle = () => {
        if (!$('#starRankingDetails').open) return;
        $('#starRanking').textContent = '순위를 불러오는 중…';
        post({type:'ojjuda-game-ranking'});
      };
      addEventListener('message', receive);
      addEventListener('online', flush);
      addEventListener('online', sendBoost);
      addEventListener('pagehide', () => save(game.getState()));
      if (parent === window) {
        location.replace('/world.html?game=saetbyeol');
      } else post({type:'ojjuda-game-ready'});
    }
  };
})();
