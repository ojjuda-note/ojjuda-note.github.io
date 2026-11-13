'use strict';
(() => {
  function choose(questions, previous) {
    const available = questions.filter(question => question !== previous);
    return available[Math.floor(Math.random() * available.length)];
  }

  function form(s, ui, options) {
    if (s.me !== s.game.current) {
      return '<h1>' + ui.esc(s.players[s.game.current]) + '님이 ' + options.preparing + '</h1>';
    }
    return '<h1>' + options.heading + '</h1>' +
      '<form id="pair-form"><label for="pair-question">' + options.label + '</label>' +
      '<textarea id="pair-question" rows="2" required maxlength="120">' +
      ui.esc(choose(options.questions)) + '</textarea>' +
      '<div class="pair-prompt-actions"><button type="button" id="pair-suggest">' + options.another + '</button>' +
      '<button type="submit" class="action">' + options.submit + '</button></div></form>';
  }

  function bind(s, ui, action, questions) {
    const form = document.getElementById('pair-form');
    if (!form) return;
    const field = form.querySelector('#pair-question');
    field.oninput = () => field.setCustomValidity('');
    form.querySelector('#pair-suggest').onclick = () => {
      field.value = choose(questions, field.value.trim());
      field.setCustomValidity('');
    };
    form.onsubmit = event => {
      event.preventDefault();
      const question = field.value.trim();
      if (!question) {
        field.setCustomValidity('내용을 입력해 주세요.');
        field.reportValidity();
        return;
      }
      ui.send(action, {turn: s.game.turn, question});
    };
  }

  function names(s, ui, seats) {
    return seats.map(seat => ui.esc(s.players[seat]) + '님').join(', ');
  }
  window.PartyPrompt = {form, bind, names};
})();
