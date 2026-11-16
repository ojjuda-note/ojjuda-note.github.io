'use strict';
(() => {
  const menu=window.DrinkingQuestionMenu;
  let turnKey,draft;
  function form(s,ui){
    if(s.me!==s.game.current)return '<h1>'+ui.esc(s.players[s.game.current])+'님이 질문을 정하고 있어요</h1>';
    return '<h1>지목할 질문을 정해 주세요</h1><form id="pair-form">'+menu.markup('imagevote','투표 시작')+'</form>';
  }
  function bind(s,ui,action){
    const form=document.getElementById('pair-form');
    if(!form)return;
    const key=[s.code,s.round,s.game.turn,s.me].join('/');
    if(turnKey!==key){turnKey=key;draft=menu.draft();}
    menu.mount(form,{kind:'imagevote',state:draft,load:()=>menu.catalog('imagevote'),apply:async(question,manual)=>{
      const ok=await ui.send(action,{turn:s.game.turn,question});
      if(ok&&manual)window.DrinkingPrompts.submit('imagevote',question);
      return ok;
    }});
  }
  function names(s,ui,seats){return seats.map(seat=>ui.esc(s.players[seat])+'님').join(', ');}
  window.PartyPrompt={form,bind,names};
})();
