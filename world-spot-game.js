(function(){
  'use strict';
  let active=null;
  window.OjjudaSpotGame={
    open({onClose,onScore}={}){
      if(active){active.focus();return;}
      const previous=document.activeElement;
      const dialog=document.createElement('dialog');
      dialog.className='spot-game-dialog';dialog.setAttribute('aria-label','틀린그림찾기');
      dialog.innerHTML='<div class="spot-game-header"><strong>🔎 틀린그림찾기</strong><button type="button" aria-label="오락실로 돌아가기">닫기</button></div><iframe title="쭈다 틀린그림찾기" src="/games/spot-difference/index.html?v=20261007-guest1" allow="fullscreen"></iframe>';
      const frame=dialog.querySelector('iframe');
      let scoreQueue=Promise.resolve();
      function onZoom(event){
        if(event.origin!==window.location.origin||event.source!==frame.contentWindow)return;
        if(event.data?.type==='ojjuda:spot-score'&&Number.isInteger(event.data.score)&&event.data.score>=0&&event.data.score<=6&&(typeof event.data.owner==='string'||event.data.owner===null)){
          const {score,owner}=event.data;
          const save=()=>Promise.resolve(onScore?.(score,owner)).catch(error=>{
            console.warn('게임 기록 저장 실패',error);
            if(active!==dialog)return;
            const retry=document.createElement('button');retry.type='button';retry.textContent='점수 다시 저장';retry.onclick=()=>{retry.remove();scoreQueue=scoreQueue.then(save)};dialog.querySelector('.spot-game-header').append(retry);
          });
          scoreQueue=scoreQueue.then(save);return;
        }
        if(event.data?.type==='ojjuda:spot-zoom'&&typeof event.data.open==='boolean')dialog.classList.toggle('spot-game-zooming',event.data.open);
      }
      active=dialog;document.body.append(dialog);document.body.classList.add('gaming');window.addEventListener('message',onZoom);
      function close(){if(active!==dialog)return;active=null;window.removeEventListener('message',onZoom);dialog.close();dialog.remove();document.body.classList.remove('gaming');if(previous?.isConnected)previous.focus();Promise.resolve().then(()=>onClose?.()).catch(error=>console.warn('게임 잔액 확인 실패',error));}
      dialog.querySelector('button').onclick=close;
      dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
      dialog.showModal();dialog.querySelector('button').focus();
    }
  };
})();
