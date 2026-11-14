'use strict';
(() => {
  const hints = {
    up: ['↑ UP', '더 큰 숫자예요.'],
    down: ['↓ DOWN', '더 작은 숫자예요.'],
    hit: ['정답', '']
  };

  function lastGuess(s, ui) {
    const g = s.game;
    if (!Object.hasOwn(hints, g.hint)) return '';
    const [label, description] = hints[g.hint];
    return '<div class="updown-hint" data-hint="' + g.hint + '">' +
      '<span>' + ui.esc(s.players[g.lastSeat]) + '님의 선택 <b>' + g.lastGuess + '</b></span>' +
      '<strong>' + label + '</strong>' +
      (description ? '<span>' + description + '</span>' : '') + '</div>';
  }

  function view(s, ui) {
    const g = s.game;
    if (s.phase === 'done') {
      return '<h1 data-result>' + ui.esc(s.players[g.winner]) + '님이 맞혔어요!</h1>' +
        '<div class="updown-range"><span>정답</span><strong>' + g.answer + '</strong></div><p>숫자 읽는 눈치로 썸 신호도 맞히겠는데요?</p>' + lastGuess(s, ui);
    }
    const mine = s.me === g.current;
    const heading = mine ? '내 차례예요' : ui.esc(s.players[g.current]) + '님 차례예요';
    const range = g.low === g.high ? String(g.low) : g.low + ' ~ ' + g.high;
    const form = '<form id="updown-form"><label for="updown-guess">내가 고른 숫자</label>' +
      '<div class="updown-entry"><input id="updown-guess" inputmode="numeric" type="number" step="1" min="' +
      g.low + '" max="' + g.high + '" autocomplete="off" aria-describedby="updown-range" required>' +
      '<button class="action" type="submit">숫자 맞히기</button></div></form>';
    return '<h1 data-current>' + heading + '</h1>' +
      '<div class="updown-range"><span>가능한 숫자</span><strong id="updown-range">' + range + '</strong></div>' +
      lastGuess(s, ui) + (mine ? form : '');
  }

  function mount(s, ui) {
    const form = document.getElementById('updown-form');
    if (!form) return;
    const field = form.querySelector('#updown-guess');
    field.oninput = () => field.setCustomValidity('');
    form.onsubmit = event => {
      event.preventDefault();
      const guess = field.valueAsNumber;
      if (!Number.isInteger(guess) || guess < s.game.low || guess > s.game.high) {
        field.setCustomValidity('가능한 숫자 중 하나를 입력해 주세요.');
        field.reportValidity();
        return;
      }
      ui.send('updown_guess', {turn: s.game.turn, guess});
    };
  }

  window.PartyLiveGame = {
    view, mount, messages:{invalid_guess:'남은 범위 안의 정수를 입력해 주세요.'}
  };
})();
