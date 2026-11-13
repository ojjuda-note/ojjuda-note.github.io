// unchanged production source at line 1
 function open(){
  if(busy||!world||mode!=='play'||revealT>=0||!photoLoaded())return;paused=true;closePanels();
  quickControls();
  const html='<h2>ZU로 도움받기</h2><p>시간 연장은 진행 중에도 가능해요. 적 감속은 살아 있을 때 5초간 적용되고, 끝나면 다시 쓸 수 있어요.</p>'+(over?'<button class="big a" id="help-again">무료로 다시 도전</button><button class="big g" id="help-list">사진 목록</button>':'<button class="big a" id="help-back">계속하기</button>');
  panel(html,{'help-back':()=>{paused=false;},'help-again':()=>{lives=LIVES;startStage(stage);},'help-list':()=>toMenu()});
 }

// unchanged production source at line 58
