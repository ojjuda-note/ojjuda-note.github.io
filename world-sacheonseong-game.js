/* The arcade entry and iframe share one close/focus lifecycle. */
(()=>{
 'use strict';
 let active=null;
 function close(){active?.close();}
 function open(){
  if(active){active.dialog.focus();return;}
  const previous=document.activeElement,dialog=document.createElement('dialog');
  dialog.className='tour-game-dialog sacheonseong-game-dialog';
  dialog.setAttribute('aria-label','오쭈다 사천성');
  dialog.innerHTML=`<div class="tour-game-header sacheonseong-game-header"><strong>오쭈다 사천성</strong><button type="button" class="sacheonseong-back">← 게임 목록</button></div>
   <div class="sacheonseong-entry-wrap"><section class="game-entry" data-entry-key="sacheonseong">
    <div class="ge-icon" aria-hidden="true">🀄</div><span class="ge-kicker">오쭈다 오락실 · 싱글 게임</span>
    <h2 class="ge-title">오쭈다 사천성</h2><p class="ge-copy">같은 그림을 잇는 작은 즐거움.<br>4개부터 900개까지, 15단계에 도전해요.</p>
    <button type="button" class="ge-primary">시작하기</button>
    <details class="ge-more"><summary>게임 방법</summary><p>같은 그림 두 개를 가로·세로로 연결하세요. 선은 두 번까지 꺾을 수 있고, 다른 패를 통과할 수 없어요.</p><p>같은 그림은 최대 4개이며, 패는 무작위로 놓여요. 막히면 자동으로 다시 섞어요.</p><p>첫 패를 누르면 시간이 시작돼요. 같은 단계에서 빨리 끝낼수록 높은 순위! 진행과 시간 순위는 이 브라우저에 저장돼요.</p></details>
   </section></div>`;
  const back=dialog.querySelector('.sacheonseong-back');let frame=null,finished=false;
  const session={dialog,close(){
   if(active!==session)return;active=null;
   window.removeEventListener('message',onMessage);
   dialog.close();dialog.remove();document.body.classList.remove('gaming');
   if(previous?.isConnected)previous.focus();
  }};
  function onMessage(event){
   if(!frame||event.origin!==location.origin||event.source!==frame.contentWindow)return;
   if(event.data?.type==='ojjuda:sacheonseong-home')session.close();
   if(event.data?.type==='ojjuda:sacheonseong-finished'&&!finished){finished=true;window.OjjudaGuestAccess?.finished();}
  }
  dialog.querySelector('.ge-primary').addEventListener('click',()=>{
   if(frame)return;
   frame=document.createElement('iframe');frame.title='오쭈다 사천성 게임판';
   frame.src='/games/sacheonseong/index.html?v=20261028-sacheonseong-launch1';
   dialog.querySelector('.sacheonseong-entry-wrap').remove();dialog.append(frame);
   dialog.classList.add('sacheonseong-playing');frame.focus();
  });
  back.addEventListener('click',session.close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();session.close();});
  active=session;document.body.append(dialog);document.body.classList.add('gaming');
  window.addEventListener('message',onMessage);dialog.showModal();
  dialog.querySelector('.ge-primary').focus();
 }
 window.OjjudaSacheonseongGame={open,close};
})();
