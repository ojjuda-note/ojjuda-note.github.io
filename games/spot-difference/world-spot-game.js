(function(){
  'use strict';
  let active=null;
  window.OjjudaSpotGame={
    open({owner=null,authorized=()=>true,onClose,onClear}={}){
      if(active){active.focus();return;}
      const previous=document.activeElement;
      const dialog=document.createElement('dialog');
      dialog.className='spot-game-dialog arcade-game-view';dialog.setAttribute('aria-label','틀린그림찾기');
      dialog.innerHTML='<div class="spot-game-header"><button type="button" class="arcade-return">← 오쭈다 오락실</button><strong>🔎 틀린그림찾기</strong></div><iframe title="쭈다 틀린그림찾기" src="/games/spot-difference/index.html?v=20261127-coach1" allow="fullscreen; web-share"></iframe>';
      const frame=dialog.querySelector('iframe');
      frame.src+='&owner='+encodeURIComponent(owner||'guest');
      let guestFinished=false;
      const current=()=>active===dialog&&authorized();
      const retry=document.createElement('button');
      retry.type='button';retry.hidden=true;retry.textContent='완료 기록 다시 저장';
      const status=document.createElement('span');status.setAttribute('role','status');status.hidden=true;
      dialog.querySelector('.spot-game-header').append(status,retry);
      const clears=window.OjjudaPuzzleRecords.pictures({game:'spot',owner,
        active:()=>current()&&window.OjjudaAdminPreview?.isEnabled?.()!==true,
        submit:item=>onClear(item.stage,owner,item.completedAt),
        status:(state,result)=>{
          retry.hidden=state!=='failed';
          status.hidden=state!=='saved'||result?.previous_period!==true;
          if(!status.hidden)status.textContent='이전 달 완료 기록을 저장했어요.';
        }
      });
      retry.onclick=clears.flush;
      function onZoom(event){
        if(event.origin!==window.location.origin||event.source!==frame.contentWindow||!current())return;
        if(event.data?.type==='ojjuda:spot-home'){close();return;}
        if(event.data?.type==='ojjuda:spot-finished'){
          if(window.OjjudaAdminPreview?.isEnabled?.()===true)return;
          if(!owner&&!guestFinished){guestFinished=true;window.OjjudaGuestAccess?.finished();}
          return;
        }
        if(event.data?.type==='ojjuda:spot-clear'&&Number.isInteger(event.data.stage)&&event.data.stage>=1&&event.data.stage<=182&&(typeof event.data.owner==='string'||event.data.owner===null)){
          if(window.OjjudaAdminPreview?.isEnabled?.()===true)return;
          if(event.data.owner===owner)clears.add(event.data.stage,event.data.completedAt);return;
        }
        if(event.data?.type==='ojjuda:spot-zoom'&&typeof event.data.open==='boolean')dialog.classList.toggle('spot-game-zooming',event.data.open);
      }
      active=dialog;void clears.flush();document.body.append(dialog);document.body.classList.add('gaming');window.addEventListener('message',onZoom);
      function close(){if(active!==dialog)return;clears.dispose();active=null;window.removeEventListener('message',onZoom);dialog.close();dialog.remove();document.body.classList.remove('gaming');if(previous?.isConnected)previous.focus();Promise.resolve().then(()=>onClose?.()).catch(error=>console.warn('게임 잔액 확인 실패',error));}
      dialog.querySelector('.arcade-return').onclick=close;
      dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
      dialog.showModal();dialog.querySelector('button').focus();
    }
  };
})();
