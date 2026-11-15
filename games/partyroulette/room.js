(() => {
  'use strict';
  let timer;
  function view(s) {
    const g=s.game, n=s.players.length;
    const done=s.phase==='done', preparing=s.phase==='prepare';
    const title=done?(g.fired?'팡!':'통과'):(preparing?'한 사람을 지목해 주세요':'함께 누를 시간');
    const result=done?' draw-result':'';
    const status=done?'<p>'+(g.fired?'내 휴대폰이 지목한 사람이 당첨이에요.':'팡!이 뜬 휴대폰이 지목한 사람이 당첨이에요.')+'</p>':
      '<p role="status" id="group-count">'+(preparing?'준비 ':'누른 사람 ')+g.count+'/'+n+'명</p>'+
      (g.mine?'<p>모두 '+(preparing?'준비하면 카운트다운이 시작돼요.':'누르면 결과가 나와요.')+'</p>':
        '<button type="button" class="action" id="group-press">'+(preparing?'준비':'너 마셔!')+'</button>');
    return '<section class="group-draw roulette-table'+result+'"'+(done?' data-fired="'+g.fired+'" role="status"':'')+'>'+
      '<div class="roulette-scene"><img src="/games/drinking/local/art/partyroulette-table.webp" alt="" draggable="false"></div>'+
      '<div class="roulette-panel"><h1>'+title+'</h1>'+status+'</div></section>';
  }
  function mount(s,ui){
    const button=document.getElementById('group-press');
    if(!button)return;
    const preparing=s.phase==='prepare';
    function update(){
      const seconds=preparing?0:Math.max(0,Math.ceil((s.game.opensAt-ui.now())/1000));
      button.disabled=seconds>0;
      button.textContent=seconds?seconds+'초 후 함께 눌러요':preparing?'준비':'너 마셔!';
      if(!seconds)clearInterval(timer);
    }
    if(!preparing)timer=setInterval(update,100);
    update();
    button.onclick=async()=>{
      if(button.disabled)return;
      button.disabled=true;
      const success=await ui.send(preparing?'roulette_ready':'roulette_press',{});
      if(!success && button.isConnected)update();
    };
  }
  window.PartyLiveGame={view,mount,unmount:()=>clearInterval(timer),messages:{countdown_running:'카운트다운이 끝나면 눌러 주세요.'}};
})();
