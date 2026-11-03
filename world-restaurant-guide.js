/* Open the restaurant directory in an isolated, accessible test-page shell. */
(() => {
 'use strict';
 let active=null;
 window.OjjudaRestaurantGuide={
  open({owner=null,authorized=()=>true}={}){
   if(!authorized())return;
   if(active){if(active.owner===owner&&active.current()){active.dialog.focus();return;}active.close();}
   const previous=document.activeElement,wasGaming=document.body.classList.contains('gaming');
   const dialog=document.createElement('dialog');
   dialog.className='restaurant-guide-dialog';
   dialog.setAttribute('aria-label','인증맛집 · 테스트');
   dialog.innerHTML='<header class="restaurant-guide-header"><button type="button" aria-label="오락실 목록으로 돌아가기">← 오락실</button><span>인증맛집 <small>테스트</small></span></header><iframe title="인증맛집 · 가이드 선정과 우체국 추천 지도" src="/games/certified-restaurants/index.html?v=20261103-restaurant-guide1&amp;embedded=1" allow="geolocation"></iframe>';
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
