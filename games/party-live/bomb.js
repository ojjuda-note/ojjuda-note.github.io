'use strict';
(() => {
  const bombArt = '/games/assets/matgo-vent/bomb.png';
  const secondsLabel = s => [s >= 60 ? Math.floor(s / 60) + '분' : '', s % 60 ? s % 60 + '초' : ''].filter(Boolean).join(' ');
  const timeWindow = (base, max) => secondsLabel(base - 15) + ' ~ ' + secondsLabel(Math.min(max, base + 15)) + ' 사이에 터져요.';

  function view(s, ui) {
    const g = s.game, host = s.me === 0;
    const max = 30 + (s.capacity - 4) * 5;
    switch (s.phase) {
      case 'setup':
        if (!host) return '<h1 class="suite-heading">방장이 시간을 정하고 있어요</h1><p class="suite-hint">나라·음식 이름처럼 바로 떠오르는 답을 이어 가요.</p>';
        return '<h1 class="suite-heading">폭탄 시간을 정해요</h1><p class="suite-hint">나라·음식 이름처럼 바로 떠오르는 답을 이어 가요.</p>' +
          '<div class="bomb-control"><div class="bomb-setting"><label for="bomb-base">기준 시간 <output id="bomb-value" for="bomb-base">' +
          secondsLabel(g.baseSeconds) + '</output></label><button type="button" id="bomb-random">랜덤</button></div>' +
          '<input id="bomb-base" type="range" min="20" max="' + max + '" value="' + g.baseSeconds + '" step="1" aria-describedby="bomb-window"' +
          (max === 20 ? ' disabled' : '') + '><p id="bomb-window">' + timeWindow(g.baseSeconds, max) + '</p></div>' +
          '<button type="button" class="action" id="bomb-configure">이 시간으로 준비하기</button>';
      case 'ready':
        return '<h1 class="suite-heading">' + (g.random ? '랜덤 타이머' : secondsLabel(g.baseSeconds) + ' 타이머') + '</h1>' +
          '<div class="bomb-launch"><img src="' + bombArt + '" alt="">' +
          (host ? '<button type="button" class="action" data-game-action="start">폭탄 시작</button>' : '') + '</div>' +
          (host ? '<button type="button" data-game-action="adjust">시간 다시 정하기</button>' : '<p class="suite-hint">방장이 시작하면 바로 답을 이어 가요.</p>');
      case 'active':
        return '<h1 class="suite-heading">' + ui.esc(g.topic) + '</h1><img class="bomb-active" src="' + bombArt + '" alt="">' +
          (g.holder === s.me ? '<p class="suite-hint">내 차례예요. 아직 안 나온 답을 말하고 바로 넘겨요.</p><button type="button" class="action" id="bomb-pass">말했어요 · 넘기기</button>' :
            '<p class="suite-hint">' + ui.esc(s.players[g.holder]) + '님이 답할 차례예요.</p>');
      case 'done':
        return '<h1 class="suite-heading">펑! ' + ui.esc(s.players[g.loser]) + '님 당첨!</h1><p class="suite-hint">넘기기 전에 폭탄이 터졌어요.</p>';
    }
  }

  function mount(s, ui) {
    const root = document.getElementById('game');
    if (s.phase === 'setup' && s.me === 0) {
      const slider = root.querySelector('#bomb-base');
      const update = () => {
        const base = Number(slider.value);
        root.querySelector('#bomb-value').textContent = secondsLabel(base);
        root.querySelector('#bomb-window').textContent = timeWindow(base, Number(slider.max));
        slider.setAttribute('aria-valuetext', secondsLabel(base));
      };
      slider.oninput = update;
      update();
      root.querySelector('#bomb-random').onclick = () => ui.send('configure', {random:true});
      root.querySelector('#bomb-configure').onclick = () => ui.send('configure', {baseSeconds:Number(slider.value)});
    }
    if (s.phase === 'active' && s.game.holder === s.me) {
      root.querySelector('#bomb-pass').onclick = () => ui.send('pass', {turn:s.game.turn});
    }
  }

  window.PartyLiveGame = {view, mount};
})();
