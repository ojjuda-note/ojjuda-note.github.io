/* Festival information opens in the same isolated, full-screen shell as test games. */
(() => {
 'use strict';
 let active=null;
 window.OjjudaFestivalSchedule={
  open({owner=null,authorized=()=>true}={}){
   if(!authorized())return;
   if(active){if(active.owner===owner&&active.current()){active.dialog.focus();return;}active.close();}
   const previous=document.activeElement,wasGaming=document.body.classList.contains('gaming');
   const dialog=document.createElement('dialog');
   dialog.className='tour-game-dialog festival-schedule-dialog';
   dialog.setAttribute('aria-label','축제일정 · 테스트');
   dialog.innerHTML='<header class="tour-game-header"><button type="button" aria-label="게임 목록으로 돌아가기">← 게임 목록</button><span>축제일정 <small>테스트</small></span></header><iframe title="축제일정 · 전국 행사 지도와 캘린더" src="/games/festival-schedule/index.html?v=20261104-directory-share1&embedded=1" allow="geolocation; clipboard-write; web-share"></iframe>';
   const frame=dialog.querySelector('iframe');
   const current=()=>active?.dialog===dialog&&authorized();
   function close(){
    if(active?.dialog!==dialog)return;
    active=null;frame.removeEventListener('load',loaded);
    frame.src='about:blank';dialog.close();dialog.remove();
    if(!wasGaming)document.body.classList.remove('gaming');
    if(previous?.isConnected)previous.focus({preventScroll:true});
   }
   function loaded(){if(active?.dialog===dialog&&!authorized())close();}
   active={dialog,owner,current,close};
   frame.addEventListener('load',loaded);
   dialog.querySelector('button').addEventListener('click',close);
   dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
   document.body.append(dialog);document.body.classList.add('gaming');
   dialog.showModal();dialog.querySelector('button').focus({preventScroll:true});
  },
  close(){active?.close();}
 };
})();
