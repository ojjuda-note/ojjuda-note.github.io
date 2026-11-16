(() => {
  'use strict';
  let key,model,board,revealTimer,showTimer,effectKey,revealHost;
  const game=()=>window.PartyRouletteBoard;
  function view(s,ui) {
    if(s.phase!=='done')return game().markup();
    const g=s.game;
    if(!Number.isInteger(g.target)){
      return '<h1>'+(g.fired?'팡!':'통과')+'</h1><p>팡!이 뜬 휴대폰이 가리킨 사람이 당첨이에요.</p>';
    }
    const title=ui.esc(s.players[g.target])+' 당첨!';
    const detail=ui.esc(s.players[g.shooter])+' 휴대폰이 가리킨 사람이에요.';
    return '<div class="pr-reveal" aria-hidden="true">'+window.PartyRouletteArt.markup()+'</div>'+
      '<h1 class="pr-winner">'+title+'</h1><p class="pr-detail">'+detail+'</p>';
  }
  function mount(s,ui) {
    const id=[s.code,s.round,s.me].join('/');
    if(id!==key){model=game().model(s.players.length);key=id;}
    if(s.phase!=='done'){
      board=game().mount(document.querySelector('.roulette-table'),model,{room:s,...ui});return;
    }
    const g=s.game,stage=document.querySelector('.pr-reveal');
    if(!stage)return;
    const prop=stage.querySelector('.pr-prop');
    prop.querySelector('.pr-swipe').hidden=true;
    const wait=Math.max(0,(g.revealAt||0)-ui.now());
    const fresh=Number.isFinite(g.revealAt)&&ui.now()-g.revealAt<1600&&effectKey!==id;
    if(!fresh){stage.hidden=true;return;}
    revealHost=document.getElementById('access-content');
    revealHost.dataset.rouletteAngle=String(model.rotation??(innerWidth<innerHeight?90:0));
    prop.dataset.mirror=String((model.side||1)===1);
    stage.parentElement.classList.add('pr-revealing');
    revealTimer=setTimeout(()=>{
      effectKey=id;game().pulse(g.fired);
      if(g.fired)window.PartyRouletteArt.flash(prop);
    },wait);
    showTimer=setTimeout(()=>{
      stage.parentElement.classList.remove('pr-revealing');stage.hidden=true;
      clearRevealOrientation();
    },wait+290);
  }
  function clearRevealOrientation(){
    if(revealHost)delete revealHost.dataset.rouletteAngle;
    revealHost=null;
  }
  function unmount(){
    clearRevealOrientation();
    board?.destroy();board=null;clearTimeout(revealTimer);clearTimeout(showTimer);
  }
  window.PartyLiveGame={view,mount,unmount,messages:{
    invalid_target:'가리킬 상대를 선택해 주세요.',countdown_running:'카운트다운이 끝나면 눌러 주세요.'
  }};
})();
