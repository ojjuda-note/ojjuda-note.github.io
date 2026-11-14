(() => {
  'use strict';
  const controls=window.SecretCountControls;
  let current;
  function view(s,ui){
    const g=s.game;
    if(s.phase==='setup')return s.me===0?controls.setup(s.players.length):'<h1>방장이 비밀 숫자를 정하고 있어요</h1>';
    if(s.phase==='done')return '<h1 data-result>'+ui.esc(s.players[g.winner])+'님 당첨!</h1><p>비밀 숫자는 '+g.answer+'였어요.</p>';
    return controls.controls(s.me===g.current,g.used||0,g.current,ui.esc(s.players[g.current]));
  }
  function mount(s,ui){
    const root=document.getElementById('game');
    if(s.phase!=='press'){current=null;controls.bindSetup(root,s.players.length,target=>ui.send('sc_start',{target}));return;}
    if(s.me!==s.game.current){current=null;return;}
    const key=[s.code,s.round,s.game.turn].join('/');
    if(current?.key!==key)current={key,queue:[],busy:false,used:s.game.used,passing:false,pressedUntil:0};
    const turn=current;
    turn.send=ui.send;turn.root=root;turn.serverUsed=s.game.used;
    if(!turn.busy)turn.used=s.game.used;
    const press=root.querySelector('[data-sc-press]'),pass=root.querySelector('[data-sc-pass]');
    function update(){
      press.toggleAttribute('data-sc-held',turn.used>=3);
      press.disabled=turn.passing||turn.used>=3;
      pass.disabled=turn.passing||turn.used===0;
    }
    turn.update=update;update();
    controls.showPress(press,turn.pressedUntil);
    async function drain(){
      if(turn.busy)return;
      turn.busy=true;
      try{
        while(turn.queue.length&&current===turn){
          const action=turn.queue.shift();
          if(!await turn.send(action,{turn:s.game.turn})){turn.queue.length=0;break;}
        }
      }finally{
        turn.busy=false;
        if(current===turn){turn.used=turn.serverUsed;turn.passing=false;turn.update();}
      }
    }
    press.onclick=()=>{
      if(current!==turn||turn.passing||turn.used>=3)return;
      turn.pressedUntil=controls.pressFeedback(press);
      turn.used++;turn.queue.push('sc_press');update();void drain();
    };
    pass.onclick=()=>{
      if(current!==turn||turn.passing||!turn.used)return;
      turn.passing=true;turn.queue.push('sc_pass');update();void drain();
    };
  }
  function beforeResult(){
    const remaining=(current?.pressedUntil||0)-performance.now();
    if(remaining>0)return new Promise(resolve=>setTimeout(resolve,remaining));
  }
  window.PartyLiveGame={view,mount,beforeResult,messages:{invalid_target_number:'참가 인원에 맞는 범위 안에서 숫자를 골라 주세요.',turn_limit:'턴을 넘겨 주세요.',press_first:'버튼을 먼저 눌러 주세요.'}};
})();
