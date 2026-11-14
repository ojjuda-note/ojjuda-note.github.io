'use strict';
(() => {
  const prompt = window.PartyPrompt;
  function view(s, ui) {
    const g = s.game;
    if (s.phase === 'prompt') {
      return prompt.form(s, ui, {
        heading:'누가 떠오르나요?', preparing:'질문을 정하고 있어요', label:'질문을 고르거나 직접 써 주세요.',
        another:'다른 질문', submit:'투표 시작'
      });
    }
    if (s.phase === 'vote') {
      const pair = s.players.length === 2;
      const choices = s.players.map((name, seat) => !pair && seat === s.me ? '' :
        '<button type="button" data-seat="' + seat + '">' + ui.esc(name) + (seat === s.me ? ' (나)' : '') + '</button>').join('');
      return '<p class="pair-caption suite-hint">가장 잘 어울리는 사람에게 몰래 투표해요.</p><h1 class="suite-heading">' + ui.esc(g.question) + '</h1>' +
        (g.mine ? '<p class="suite-hint" data-submitted>투표를 마쳤어요. 모두 고르면 결과가 공개돼요.</p>' :
          '<p class="suite-hint">' + (pair ? '둘이 할 때는 나도 고를 수 있어요.' : '나를 제외한 한 명을 골라 주세요.') +
          '</p><div class="pair-choices">' + choices + '</div>') +
        '<p class="pair-status suite-hint">투표 완료 ' + g.submitted + ' / ' + s.players.length + '명</p>';
    }
    if (s.phase === 'done') {
      const scores = s.players.map((name, seat) => ({name, seat, count:g.counts[seat]}))
        .sort((a, b) => b.count - a.count);
      const rows = scores.map(({name, seat, count}) =>
        '<li><span>' + ui.esc(name) + (seat === s.me ? ' (나)' : '') + '</span><b>' + count + '표</b></li>');
      return '<p class="pair-caption suite-hint">' + ui.esc(g.question) + '</p><h1 class="suite-heading" data-result>' + prompt.names(s, ui, g.winners) +
        (g.winners.length > 1 ? ' 공동 1위!' : ' 당첨!') + '</h1><ul class="pair-scores">' + rows.join('') + '</ul>';
    }
  }
  function mount(s, ui) {
    if (s.phase === 'prompt') prompt.bind(s, ui, 'image_prompt');
    if (s.phase === 'vote' && !s.game.mine) {
      document.querySelectorAll('#game [data-seat]').forEach(button => {
        button.onclick = () => ui.send('image_vote', {turn:s.game.turn, target:Number(button.dataset.seat)});
      });
    }
  }
  window.PartyLiveGame = {
    view, mount, messages:{
      invalid_question:'질문을 1~120자로 적어 주세요.',
      already_answered:'이번 질문에 이미 투표했어요.'
    }
  };
})();
