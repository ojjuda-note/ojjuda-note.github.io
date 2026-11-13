'use strict';
(() => {
  const prompt = window.PartyPrompt;
  const questions = [
    '오늘 안경을 쓴 사람 접어!', '오늘 커피 마신 사람 접어!',
    '알람을 두 번 이상 맞추는 사람 접어!', '오늘 운동화 신고 온 사람 접어!',
    '휴대폰 배터리가 절반 이하인 사람 접어!', '집에 아직 안 읽은 책이 있는 사람 접어!',
    '이번 주에 라면 먹은 사람 접어!', '여행 갈 때 짐을 전날 싸는 사람 접어!',
    '오늘 고양이나 강아지 사진을 본 사람 접어!', '사진 찍을 때 늘 같은 포즈를 하는 사람 접어!'
  ];
  function scoreboard(s, ui) {
    const rows = s.players.map((name, seat) => {
      const count = s.game.fingers[seat];
      const markers = Array.from({length:5}, (_,i) => '<i' + (i < count ? ' class="open"' : '') + '></i>').join('');
      return '<li><span>' + ui.esc(name) + (seat === s.me ? ' (나)' : '') + '</span>' +
        '<span class="pair-fingers" aria-hidden="true">' + markers + '</span><b>' + count + '개</b></li>';
    });
    return '<h2>남은 손가락</h2><ul class="pair-scores">' + rows.join('') + '</ul>';
  }
  function view(s, ui) {
    const g = s.game;
    let body;
    if (s.phase === 'prompt') {
      body = prompt.form(s, ui, {
        heading:'어떤 사람이 접을까요?', preparing:'조건을 정하고 있어요', label:'조건을 골라 보거나 직접 써 주세요.',
        another:'다른 조건', submit:'조건 공개', questions
      });
    } else if (s.phase === 'answer') {
      body = '<p class="pair-caption">' + ui.esc(s.players[g.current]) + '님의 조건</p><h1>' + ui.esc(g.question) + '</h1>' +
        (g.mine ? '<p data-submitted>응답했어요. 모두 답하면 손가락 수가 바뀌어요.</p>' :
          '<p>나도 해당하나요?</p><div class="pair-choices"><button type="button" class="action" data-fold="yes">하나 접기</button>' +
          '<button type="button" data-fold="no">그대로</button></div>') +
        '<p class="pair-status">응답 ' + g.submitted + ' / ' + s.players.length + '명</p>';
    } else if (s.phase === 'done') {
      body = '<h1 data-result>' + prompt.names(s, ui, g.losers) + (g.losers.length > 1 ? ' 함께 당첨!' : ' 당첨!') +
        '</h1><p>손가락 다섯 개를 모두 접었어요.</p>';
    }
    return body + scoreboard(s, ui);
  }
  function mount(s, ui) {
    if (s.phase === 'prompt') prompt.bind(s, ui, 'finger_prompt', questions);
    if (s.phase === 'answer' && !s.game.mine) {
      document.querySelectorAll('#game [data-fold]').forEach(button => {
        button.onclick = () => ui.send('finger_answer', {turn:s.game.turn, fold:button.dataset.fold === 'yes'});
      });
    }
  }
  window.PartyLiveGame = {
    view, mount, messages:{
      invalid_question:'조건을 1~120자로 적어 주세요.',
      already_answered:'이번 조건에 이미 답했어요.'
    }
  };
})();
