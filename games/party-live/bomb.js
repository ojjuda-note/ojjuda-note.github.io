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
        if (!host) return '<h1>방장이 타이머를 고르고 있어요</h1><p>나라 이름, 음식 이름처럼 주제에 맞는 답을 바로 말하고 넘겨요.</p>';
        return '<h1>시간폭탄 타이머</h1><p>기준 시간을 정하거나 랜덤을 고르세요.</p>' +
          '<div class="bomb-control"><div class="bomb-setting"><label for="bomb-base">기준 시간 <output id="bomb-value" for="bomb-base">' +
          secondsLabel(g.baseSeconds) + '</output></label><button type="button" id="bomb-random">랜덤</button></div>' +
          '<input id="bomb-base" type="range" min="20" max="' + max + '" value="' + g.baseSeconds + '" step="1" aria-describedby="bomb-window"' +
          (max === 20 ? ' disabled' : '') + '><p id="bomb-window">' + timeWindow(g.baseSeconds, max) + '</p></div>' +
          '<button type="button" class="action" id="bomb-configure">시간 선택 완료</button>';
      case 'ready':
        return '<h1>' + (g.random ? '랜덤 타이머' : secondsLabel(g.baseSeconds) + ' 타이머') + '</h1>' +
          '<div class="bomb-launch"><img src="' + bombArt + '" alt="">' +
          (host ? '<button type="button" class="action" data-game-action="start">시작</button>' : '') + '</div>' +
          (host ? '<button type="button" data-game-action="adjust">시간 다시 선택</button>' : '<p>방장이 폭탄을 시작하면 게임이 열려요.</p>');
      case 'active':
        return '<h1>' + ui.esc(g.topic) + '</h1><img class="bomb-active" src="' + bombArt + '" alt="">' +
          (g.holder === s.me ? '<p>내 차례예요. 주제에 맞는 답을 하나 말하고 바로 넘기세요. 이미 나온 답은 안 돼요.</p><button type="button" class="action" id="bomb-pass">말했어요 · 다음 사람</button>' :
            '<p>' + ui.esc(s.players[g.holder]) + '님이 폭탄을 들고 있어요.</p>');
      case 'done':
        return '<h1>펑! ' + ui.esc(s.players[g.loser]) + '님 당첨!</h1><p>폭탄이 터지는 순간 폭탄을 들고 있었어요.</p>';
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
