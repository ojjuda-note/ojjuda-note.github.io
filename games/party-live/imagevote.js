'use strict';
(() => {
  const prompt = window.PartyPrompt;
  const questions = [
    '무인도에서도 제일 잘 살아남을 사람은?', '갑자기 여행을 떠나자고 할 사람은?',
    '처음 만난 고양이와 금세 친해질 사람은?', '노래방에서 첫 곡을 부를 사람은?',
    '맛집을 물어보면 바로 세 곳을 알려 줄 사람은?', '친구 생일에 깜짝 파티를 준비할 사람은?',
    '영화 결말을 가장 먼저 알아챌 사람은?', '모두 길을 잃었을 때 나서서 길을 찾을 사람은?',
    '휴대폰 사진첩에 음식 사진이 가장 많을 사람은?', '처음 해 본 보드게임에서 바로 이길 사람은?'
  ];
  function view(s, ui) {
    const g = s.game;
    if (s.phase === 'prompt') {
      return prompt.form(s, ui, {
        heading:'어떤 사람을 찾아볼까요?', preparing:'질문을 정하고 있어요', label:'질문을 골라 보거나 직접 써 주세요.',
        another:'다른 질문', submit:'투표 시작', questions
      });
    }
    if (s.phase === 'vote') {
      const pair = s.players.length === 2;
      const choices = s.players.map((name, seat) => !pair && seat === s.me ? '' :
        '<button type="button" data-seat="' + seat + '">' + ui.esc(name) + (seat === s.me ? ' (나)' : '') + '</button>').join('');
      return '<h1>' + ui.esc(g.question) + '</h1>' +
        (g.mine ? '<p data-submitted>투표했어요. 모두 고르면 결과가 공개돼요.</p>' :
          '<p>' + (pair ? '한 명을 골라 주세요. 둘이 할 때는 나도 고를 수 있어요.' : '질문에 가장 잘 어울리는 다른 사람 한 명을 골라 주세요.') +
          '</p><div class="pair-choices">' + choices + '</div>') +
        '<p class="pair-status">투표 ' + g.submitted + ' / ' + s.players.length + '명</p>';
    }
    if (s.phase === 'done') {
      const scores = s.players.map((name, seat) => ({name, seat, count:g.counts[seat]}))
        .sort((a, b) => b.count - a.count);
      const rows = scores.map(({name, seat, count}) =>
        '<li><span>' + ui.esc(name) + (seat === s.me ? ' (나)' : '') + '</span><b>' + count + '표</b></li>');
      return '<p class="pair-caption">' + ui.esc(g.question) + '</p><h1 data-result>' + prompt.names(s, ui, g.winners) +
        (g.winners.length > 1 ? ' 공동 1위!' : ' 당첨!') + '</h1><ul class="pair-scores">' + rows.join('') + '</ul>';
    }
  }
  function mount(s, ui) {
    if (s.phase === 'prompt') prompt.bind(s, ui, 'image_prompt', questions);
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
