(() => {
  'use strict';
  function limits(players) { return {min:players+1,max:players*9}; }
  function setup(players) {
    const {min,max}=limits(players);
    const initial=Math.round((min+max)/2);
    return '<form class="sc-setup"><span class="sc-emblem sc-setup-art" aria-hidden="true"></span><h2>비밀 숫자 정하기</h2><fieldset><legend>정하는 방법</legend>' +
      '<label><input type="radio" name="method" value="random" checked>랜덤</label>' +
      '<label><input type="radio" name="method" value="manual">직접 정하기</label></fieldset>' +
      '<p class="sc-range">목표 범위 '+min+'~'+max+'</p>' +
      '<div class="sc-field" hidden><div class="sc-range-head"><label for="sc-target">비밀 숫자</label><output for="sc-target">'+initial+'</output></div>' +
      '<input id="sc-target" name="target" type="range" min="'+min+'" max="'+max+'" step="1" value="'+initial+'" disabled>' +
      '<div class="sc-range-ends" aria-hidden="true"><span>'+min+'</span><span>'+max+'</span></div></div>' +
      '<button type="submit" class="action start">게임 시작</button></form>';
  }
  function bindSetup(root, players, start) {
    const form=root.querySelector('.sc-setup');
    if(!form)return;
    const target=form.elements.target;
    const {min,max}=limits(players);
    for(const radio of form.querySelectorAll('[name=method]'))radio.onchange=()=>{
      const manual=form.elements.method.value==='manual';
      form.querySelector('.sc-field').hidden=!manual;
      form.querySelector('.sc-range').hidden=manual;
      target.disabled=!manual;
    };
    target.oninput=()=>{form.querySelector('output').value=target.value;};
    form.onsubmit=async event=>{
      event.preventDefault();
      const manual=form.elements.method.value==='manual';
      const value=target.valueAsNumber;
      if(manual&&(!Number.isInteger(value)||value<min||value>max))return;
      const submit=form.querySelector('[type=submit]');
      if(submit.disabled)return;
      submit.disabled=true;
      try{await start(manual?value:null);}
      finally{if(submit.isConnected)submit.disabled=false;}
    };
  }
  const pressDuration=160;
  function showPress(button,until){
    const remaining=until-performance.now();
    if(remaining<=0)return;
    button.classList.add('sc-pressed');
    clearTimeout(button.scRelease);
    button.scRelease=setTimeout(()=>button.classList.remove('sc-pressed'),remaining);
  }
  function pressFeedback(button){
    const pulse=35;
    if(window.PartyFX)window.PartyFX.play('tap',pulse);
    else if(!document.hidden){
      let enabled=true;
      try{enabled=localStorage.getItem('oj.party.vibration')!=='off';}catch{}
      if(enabled){try{navigator.vibrate?.(pulse);}catch{}}
    }
    const until=performance.now()+pressDuration;
    showPress(button,until);
    return until;
  }
  function controls(mine, used, seat, escapedName) {
    return '<div class="sc-controls"><p class="turn-tag sc-turn" role="status">'+(seat+1)+'번 · '+escapedName+'님 차례</p><div class="sc-machine'+(mine?'':' sc-closed')+'">' +
      '<button type="button" data-sc-press aria-label="비밀 버튼 누르기"'+(mine&&used>=3?' data-sc-held':'')+(!mine||used>=3?' disabled':'')+'></button>' +
      '<span class="sc-lid" aria-hidden="true"></span></div>' +
      (mine?'<button class="sc-pass" type="button" data-sc-pass'+(used===0?' disabled':'')+'>턴 넘기기</button>':
        '<span class="sc-reader">다른 참가자 차례예요.</span>')+'</div>';
  }
  window.SecretCountControls=Object.freeze({limits,setup,bindSetup,controls,pressFeedback,showPress});
})();
