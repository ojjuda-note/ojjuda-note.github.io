'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  let roomKey = '', target = 50, started = null, held = null, frame = 0, interrupted = false;
  let currentMount = null;
  const seconds = value => (value / 100).toFixed(2);
  const storageKey = key => 'oj.party.live.watch.' + key;

  function updateLocal(s) {
    const key = [s.code, s.round, s.me].join('.');
    if (key !== roomKey) {
      roomKey = key; target = s.game.target ?? 50; started = null; held = null; interrupted = false;
      try {
        const saved = sessionStorage.getItem(storageKey(key));
        if (saved !== null && /^\d{1,8}$/.test(saved)) held = Number(saved);
      } catch {}
    }
    if (s.game.myScore != null || s.phase === 'done') {
      held = null; started = null;
      try { sessionStorage.removeItem(storageKey(roomKey)); } catch {}
    }
  }
  function clock(reading) {
    return '<div class="watch-board"><div class="watch-case"><span class="watch-crown"></span><span class="watch-bezel">' +
      '<span class="watch-scale"></span><span class="watch-lcd" id="watch-reading">' + reading +
      '</span><span class="watch-pin"></span></span></div></div>';
  }
  function finish(s,ui) {
    const goal = s.game.target * 10;
    const ordered = s.game.scores.map((score,i) => ({score, name:s.players[i], error:Math.abs(score-goal)}))
      .sort((a,b) => a.error-b.error);
    const winners = ordered.filter(row => row.error === ordered[0].error);
    const rows = ordered.map(row => '<tr><th scope="row">' + ui.esc(row.name) + '</th><td>' + seconds(row.score) +
      '초</td><td>' + seconds(row.error) + '초</td></tr>').join('');
    return '<h1>' + winners.map(row => ui.esc(row.name)).join(' · ') + (winners.length > 1 ? ' 공동 1등!' : ' 1등!') +
      '</h1><p>이 감이면 고백 타이밍도 놓치지 않겠는데요?</p><p>목표 ' + (s.game.target/10).toFixed(1) + '초</p><table class="watch-results">' +
      '<thead><tr><th>참가자</th><th>기록</th><th>목표와 차이</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  function view(s,ui) {
    updateLocal(s);
    if (s.phase === 'setup') {
      if (s.me !== 0) return '<h1>목표 시간을 정하고 있어요</h1><p>방장이 정하면 각자 시작할 수 있어요.</p>';
      return '<h1>목표 시간을 정하세요</h1><p>시작 후 1초가 지나면 숫자가 사라져요.</p>' +
        '<label for="watch-target">목표 시간</label><div class="watch-target"><button type="button" id="watch-minus" aria-label="0.1초 줄이기">−</button>' +
        '<output id="watch-setting" for="watch-target">' + (target/10).toFixed(1) + '초</output>' +
        '<button type="button" id="watch-plus" aria-label="0.1초 늘리기">＋</button></div>' +
        '<input id="watch-target" type="range" min="50" max="100" step="1" value="' + target + '">' +
        '<button type="button" id="watch-begin" class="action">이 시간으로 시작</button>';
    }
    if (s.phase === 'done') return finish(s,ui);
    if (s.game.myScore != null) return '<h1>내 기록 ' + seconds(s.game.myScore) + '초</h1>' +
      '<p>목표와 ' + seconds(Math.abs(s.game.target*10-s.game.myScore)) + '초 차이예요. 모두 멈추면 순위를 공개해요.</p>' +
      '<p>완료 ' + s.game.submitted + ' / ' + s.players.length + '명</p>';
    return '<h1>목표 ' + (s.game.target/10).toFixed(1) + '초</h1>' + clock(held == null ? '0.00' : seconds(held)) +
      '<p id="watch-hint"></p><button type="button" class="action" id="watch-start">시작</button>' +
      '<button type="button" class="action" id="watch-stop">멈추기</button>' +
      '<button type="button" class="action" id="watch-save">기록 보내기</button>';
  }
  function mount(s,ui) {
    if (s.phase === 'setup' && s.me === 0) {
      const set = n => {
        target = Math.max(50,Math.min(100,n));
        $('#watch-target').value = target; $('#watch-target').setAttribute('aria-valuetext',(target/10).toFixed(1)+'초');
        $('#watch-setting').textContent = (target/10).toFixed(1)+'초';
        $('#watch-minus').disabled = target === 50; $('#watch-plus').disabled = target === 100;
      };
      set(target);
      $('#watch-target').oninput = e => set(Number(e.target.value));
      $('#watch-minus').onclick = () => set(target-1); $('#watch-plus').onclick = () => set(target+1);
      $('#watch-begin').onclick = () => ui.send('watch_begin',{target});
      return;
    }
    if (s.phase !== 'measure' || s.game.myScore != null) return;
    function paint() {
      cancelAnimationFrame(frame);
      const face = $('#watch-reading');
      if (!face) return;
      if (started === null) { face.textContent = held == null ? '0.00' : seconds(held);return; }
      const elapsed = Math.max(0,performance.now()-started);
      face.textContent = elapsed >= 1000 ? '–.––' : seconds(Math.floor(elapsed/10));
      if (elapsed < 1000) frame = requestAnimationFrame(paint);
    }
    function sync() {
      $('#watch-start').hidden = held != null || started != null;
      $('#watch-stop').hidden = started == null;
      $('#watch-save').hidden = held == null;
      $('#watch-hint').textContent = held != null ? '멈춘 기록을 보낼 수 있어요.' : started != null ?
        '목표 시간이라고 느낄 때 멈추세요.' : interrupted ? '화면이 바뀌었어요. 준비되면 다시 시작하세요.' : '준비되면 내 휴대폰에서 시작을 누르세요.';
      paint();
    }
    currentMount = sync;
    $('#watch-start').onclick = () => {
      if (started != null || held != null || document.hidden) return;
      interrupted = false; started = performance.now();sync();$('#watch-stop').focus();
    };
    $('#watch-stop').onclick = () => {
      if (started === null) return;
      held = Math.max(0,Math.round((performance.now()-started)/10));
      started = null;
      try {sessionStorage.setItem(storageKey(roomKey),String(held));} catch {}
      sync(); ui.send('watch_score',{score:held});
    };
    $('#watch-save').onclick = () => {if (held != null) ui.send('watch_score',{score:held});};
    sync();
  }
  function unmount() {currentMount = null;cancelAnimationFrame(frame);}
  function interrupt() {
    if (started === null) return;
    started = null;interrupted = true;currentMount?.();
  }
  document.addEventListener('visibilitychange',() => {if (document.hidden) interrupt();});
  window.addEventListener('pagehide',interrupt);
  window.PartyLiveGame = {view,mount,unmount};
})();
