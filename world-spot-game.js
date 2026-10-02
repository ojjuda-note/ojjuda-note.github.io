(function(){
  'use strict';
  let active=null;
  window.OjjudaSpotGame={
    open({onClose}={}){
      if(active){active.focus();return;}
      const previous=document.activeElement;
      const dialog=document.createElement('dialog');
      dialog.className='spot-game-dialog';dialog.setAttribute('aria-label','틀린그림찾기');
      dialog.innerHTML='<div class="spot-game-header"><strong>🔎 틀린그림찾기</strong><button type="button" aria-label="오락실로 돌아가기">닫기</button></div><iframe title="쭈다 틀린그림찾기" src="/games/spot-difference/index.html?v=20261003-contrast1" allow="fullscreen"></iframe>';
      active=dialog;document.body.append(dialog);document.body.classList.add('gaming');
      function close(){if(active!==dialog)return;active=null;dialog.close();dialog.remove();document.body.classList.remove('gaming');if(previous?.isConnected)previous.focus();Promise.resolve().then(()=>onClose?.()).catch(error=>console.warn('게임 잔액 확인 실패',error));}
      dialog.querySelector('button').onclick=close;
      dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
      dialog.showModal();dialog.querySelector('button').focus();
    }
  };
})();
