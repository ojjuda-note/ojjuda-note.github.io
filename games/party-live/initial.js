'use strict';
(() => {
  let timer;
  function unmount() {
    clearInterval(timer);
    timer = undefined;
  }
  function view(s, ui) {
    const g = s.game;
    if (s.phase === 'done') {
      return '<h1>' + ui.esc(s.players[g.winner]) + '님 승리!</h1><p>' + ui.esc(s.players[g.lastOut]) +
        '님이 ' + ui.esc(g.reason) + '로 탈락했어요.</p>';
    }
    const mine = s.me === g.current;
    const whose = mine ? '내 차례예요' : ui.esc(s.players[g.current]) + '님 차례예요';
    const start = '<button type="button" id="initial-start" class="action">5초 시작</button>';
    switch (s.phase) {
      case 'ready':
        return '<h1>' + whose + '</h1><p>초성에 맞는 새 단어를 말해요. 이 초성에서 이미 나온 단어는 다시 쓸 수 없어요.</p>' +
          '<div class="initial-word" aria-label="초성">' + ui.esc(g.initial) + '</div><p>남은 사람 ' + g.alive.length + '명</p>' +
          (mine ? start : '');
      case 'active':
        return '<h1>' + whose + '</h1><div class="initial-word">' + ui.esc(g.initial) + '</div>' +
          '<p>남은 시간 <strong class="initial-time"><span id="initial-seconds">5</span>초</strong></p>' +
          (mine ? '<div class="actions"><button type="button" id="initial-answer" class="action">말했어요</button>' +
            '<button type="button" id="initial-out">중복·오답</button></div>' : '');
      case 'intermission':
        return '<h1>' + ui.esc(s.players[g.lastOut]) + '님 탈락</h1><p>' + ui.esc(g.reason) + ' · 남은 사람 ' + g.alive.length + '명</p>' +
          '<p>다음은 ' + ui.esc(s.players[g.current]) + '님 차례예요.</p>' +
          (mine ? '<button type="button" id="initial-next" class="action">다음 차례</button>' : '');
    }
  }
  function mount(s, ui) {
    unmount();
    const root = document.getElementById('game');
    const g = s.game;
    if (s.me === g.current) {
      for (const action of ['start','answer','out','next']) {
        const button = root.querySelector('#initial-' + action);
        if (button) button.onclick = () => ui.send(action, {turn:g.turn});
      }
    }
    if (s.phase === 'active') {
      const counter = root.querySelector('#initial-seconds');
      const tick = () => {
        const remaining = Math.min(5,Math.max(0,Math.ceil((g.endsAt - ui.now()) / 1000)));
        counter.textContent = String(remaining);
        if (!remaining) {
          root.querySelectorAll('#initial-answer,#initial-out').forEach(button => { button.disabled = true; });
          unmount();
        }
        return remaining;
      };
      if (tick()) timer = setInterval(tick, 100);
    }
  }
  window.PartyLiveGame = {view, mount, unmount};
})();
