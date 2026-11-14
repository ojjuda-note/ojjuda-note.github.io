(() => {
  'use strict';
  function limits(players) { return {min:players+1,max:players*9}; }
  function setup(players) {
    const {min,max}=limits(players);
    return '<form class="sc-setup"><h2>비밀 숫자 정하기</h2><fieldset><legend>정하는 방법</legend>' +
      '<label><input type="radio" name="method" value="random" checked>랜덤</label>' +
      '<label><input type="radio" name="method" value="manual">직접 입력</label></fieldset>' +
      '<p class="sc-range">목표 범위 '+min+'~'+max+'</p>' +
      '<label class="sc-field" hidden>비밀 숫자<input name="target" type="password" inputmode="numeric" autocomplete="off" placeholder="'+min+'~'+max+'" maxlength="3" disabled></label>' +
      '<button type="submit" class="action start">게임 시작</button></form>';
  }
  function bindSetup(root, players, start) {
    const form=root.querySelector('.sc-setup');
    if(!form)return;
    const target=form.elements.target;
    const {min,max}=limits(players);
    form.onchange=()=>{
      const manual=form.elements.method.value==='manual';
      target.parentElement.hidden=!manual;target.disabled=!manual;target.required=manual;
      target.setCustomValidity('');
      if(manual)target.focus();else target.value='';
    };
    target.oninput=()=>target.setCustomValidity('');
    form.onsubmit=async event=>{
      event.preventDefault();
      const manual=form.elements.method.value==='manual';
      if(manual&&(!/^[1-9]\d{0,2}$/.test(target.value)||Number(target.value)<min||Number(target.value)>max)){
        target.setCustomValidity(min+'부터 '+max+' 사이의 숫자를 입력해 주세요.');
        target.reportValidity();return;
      }
      const submit=form.querySelector('[type=submit]');
      if(submit.disabled)return;
      submit.disabled=true;
      try{await start(manual?Number(target.value):null);}
      finally{if(submit.isConnected)submit.disabled=false;}
    };
  }
  function controls(mine, used) {
    return '<div class="sc-controls"><div class="sc-machine'+(mine?'':' sc-closed')+'">' +
      '<button type="button" data-sc-press aria-label="비밀 버튼 누르기"'+(!mine||used>=3?' disabled':'')+'></button>' +
      '<span class="sc-lid" aria-hidden="true"></span></div>' +
      (mine?'<button class="sc-pass" type="button" data-sc-pass'+(used===0?' disabled':'')+'>턴 넘기기</button>':
        '<span class="sc-reader">다른 참가자 차례예요.</span>')+'</div>';
  }
  window.SecretCountControls=Object.freeze({limits,setup,bindSetup,controls});
})();
