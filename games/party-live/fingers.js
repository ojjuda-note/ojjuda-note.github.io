'use strict';
(() => {
  const picker = window.FingerConditions;
  let draftKey,draft,bankRequest;
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
      if (s.me !== g.current) body='<h1>'+ui.esc(s.players[g.current])+'님이 지시를 고르고 있어요</h1>';
      else body='<h1>접을 지시를 정해 주세요</h1><form id="pair-form">'+picker.markup()+
        '<button type="submit" class="action" disabled>지시 공개</button></form>';
    } else if (s.phase === 'answer') {
      body = '<p class="pair-caption suite-hint">' + ui.esc(s.players[g.current]) + '님의 조건</p><h1 class="suite-heading">' + ui.esc(g.question) + '</h1>' +
        (g.mine ? '<p class="suite-hint" data-submitted>선택을 마쳤어요. 다른 사람의 답을 기다려요.</p>' :
          '<p class="suite-hint">조건에 해당하면 하나 접어 주세요.</p><div class="pair-choices"><button type="button" class="action" data-fold="yes">하나 접기</button>' +
          '<button type="button" data-fold="no">안 접기 · 패스</button></div>') +
        '<p class="pair-status suite-hint">선택 완료 ' + g.submitted + ' / ' + s.players.length + '명</p>';
    } else if (s.phase === 'done') {
      body = '<h1 class="suite-heading" data-result>' + g.losers.map(seat=>ui.esc(s.players[seat])+'님').join(', ') + (g.losers.length > 1 ? ' 함께 걸렸어요!' : ' 걸렸어요!') +
        '</h1><p class="suite-hint">손가락 다섯 개를 모두 접었어요.</p>';
    }
    return body + (s.phase==='done'?'':'<p class="suite-hint">답하기 싫은 조건은 패스해도 돼요.</p>') + scoreboard(s, ui);
  }
  function mount(s, ui) {
    if (s.phase === 'prompt' && s.me === s.game.current) {
      const key=[s.code,s.round,s.game.turn,s.me].join('/');
      if(draftKey!==key){draftKey=key;draft=picker.draft();bankRequest=null;}
      const load=()=>{
        if(!bankRequest)bankRequest=window.DrinkingPrompts.fingerBank().then(lines=>{
          if(!lines.length && draftKey===key)bankRequest=null;
          return lines;
        });
        return bankRequest;
      };
      picker.mount(document.getElementById('pair-form'),draft,load,async(question,manual)=>{
        const accepted=await ui.send('finger_prompt',{turn:s.game.turn,question});
        if(accepted && manual)window.DrinkingPrompts.submit('fingers',question);
      });
    }
    if (s.phase === 'answer' && !s.game.mine) {
      document.querySelectorAll('#game [data-fold]').forEach(button => {
        button.onclick = () => ui.send('finger_answer', {turn:s.game.turn, fold:button.dataset.fold === 'yes'});
      });
    }
  }
  window.PartyLiveGame = {
    view, mount, messages:{
      invalid_question:'조건을 1~120자로 적어 주세요.',
      already_answered:'이번 조건에는 이미 답했어요.'
    }
  };
})();
