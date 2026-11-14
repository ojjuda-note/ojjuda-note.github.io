'use strict';
(() => {
  const kind=document.documentElement.dataset.game;
  const recommend=window.DrinkingPrompts.recommendations(kind);
  let draft;
  function draftFor(s) {
    const round=s.code+'/'+s.round, key=round+'/'+s.game.turn;
    if (draft?.key!==key) draft={round,key,value:'',started:false,edit:0};
    return draft;
  }

  function form(s, ui, options) {
    if (s.me !== s.game.current) {
      return '<h1>' + ui.esc(s.players[s.game.current]) + '님이 ' + options.preparing + '</h1>';
    }
    return '<h1>' + options.heading + '</h1>' +
      '<form id="pair-form"><label for="pair-question">' + options.label + '</label>' +
      '<textarea id="pair-question" rows="2" required maxlength="120">' +
      ui.esc(draftFor(s).value) + '</textarea>' +
      '<p><small>직접 쓴 내용은 관리자 검토 후 공용 목록에 등록될 수 있어요.</small></p>'+
      '<div class="pair-prompt-actions"><button type="button" id="pair-suggest">' + options.another + '</button>' +
      '<button type="submit" class="action">' + options.submit + '</button></div></form>';
  }

  function bind(s, ui, action) {
    const form = document.getElementById('pair-form');
    if (!form) return;
    const field = form.querySelector('#pair-question');
    const current=draftFor(s);
    async function suggest() {
      const edit=++current.edit;
      const next=await recommend(current.round,current.value.trim());
      if (draft!==current || current.edit!==edit) return;
      const input=document.getElementById('pair-question');
      if (!input) return;
      if (next) {
        input.value=current.value=next;
        input.setCustomValidity('');
      } else {
        input.placeholder='추천할 내용이 없어요. 직접 적어 주세요.';
      }
    }
    field.oninput=()=>{
      current.edit++;
      current.value=field.value;
      field.setCustomValidity('');
    };
    form.querySelector('#pair-suggest').onclick=suggest;
    if (!current.started) {current.started=true;void suggest();}
    form.onsubmit = event => {
      event.preventDefault();
      const question = field.value.trim();
      if (!question) {
        field.setCustomValidity('내용을 입력해 주세요.');
        field.reportValidity();
        return;
      }
      ui.send(action, {turn: s.game.turn, question}).then(accepted => {
        if (accepted) window.DrinkingPrompts.submit(action === 'finger_prompt' ? 'fingers' : 'imagevote',question);
      });
    };
  }

  function names(s, ui, seats) {
    return seats.map(seat => ui.esc(s.players[seat]) + '님').join(', ');
  }
  window.PartyPrompt = {form, bind, names};
})();
