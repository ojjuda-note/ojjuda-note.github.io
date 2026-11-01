/* Single-player test game: progress and equipment coins stay in the game. */
(() => {
 'use strict';
 let active=null;
 window.OjjudaArcheryGame={
  open({authorized=()=>true}={}){
   if(!authorized())return;
   if(active){active.dialog.focus();return;}
   const previous=document.activeElement;
   const wasGaming=document.body.classList.contains('gaming');
   const dialog=document.createElement('dialog');
   dialog.className='tour-game-dialog archery-game-dialog';
   dialog.setAttribute('aria-label','바람의 궁수 · 테스트게임');
   dialog.innerHTML='<header class="tour-game-header"><button type="button" aria-label="게임 목록으로 돌아가기">← 게임 목록</button><span>바람의 궁수 <small>테스트게임</small></span></header><iframe title="바람의 궁수" src="/games/forest-archer/index.html?v=20261102-archery-flight1" allow="autoplay; fullscreen"></iframe>';
   const frame=dialog.querySelector('iframe');
   function close(){
    if(active?.dialog!==dialog)return;
    active=null;
    frame.removeEventListener('load',loaded);
    // Unload the document so animation, input and audio stop before re-entry.
    frame.src='about:blank';
    dialog.close();
    dialog.remove();
    if(!wasGaming)document.body.classList.remove('gaming');
    if(previous?.isConnected)previous.focus({preventScroll:true});
   }
   function loaded(){if(active?.dialog===dialog&&!authorized())close();}
   active={dialog,close};
   frame.addEventListener('load',loaded);
   dialog.querySelector('button').addEventListener('click',close);
   dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
   document.body.append(dialog);
   document.body.classList.add('gaming');
   dialog.showModal();
   dialog.querySelector('button').focus({preventScroll:true});
  },
  close(){active?.close();}
 };
})();
