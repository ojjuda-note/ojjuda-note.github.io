/* Keep the directory alive while its member recommendation dialog is open. */
(() => {
 'use strict';
 const MESSAGE='ojjuda:restaurants:recommendations';
 let active=null;
 window.OjjudaRestaurantGuide={
  open({owner=null,authorized=()=>true,recommendations=null,openRecommendations=false}={}){
   const allowed=()=>{try{return authorized()===true;}catch{return false;}};
   if(!allowed())return false;
   if(active){
    if(active.owner===owner&&active.current()){
     if(openRecommendations)return active.openRecommendations();
     if(!active.childOpen())active.dialog.focus();
     return true;
    }
    active.close(true);
   }
   const previous=document.activeElement,wasGaming=document.body.classList.contains('gaming');
   const dialog=document.createElement('dialog');
   dialog.className='restaurant-guide-dialog';
   dialog.setAttribute('aria-label','인증맛집 · 테스트');
   dialog.innerHTML='<header class="restaurant-guide-header"><button type="button" aria-label="오락실 목록으로 돌아가기">← 오락실</button><span>인증맛집 <small>테스트</small></span></header><p class="restaurant-guide-message" role="status" hidden></p><iframe title="인증맛집 · 가이드 선정과 우체국 추천 지도" allow="geolocation"></iframe>';
   const frame=dialog.querySelector('iframe');
   const hasMemberMenu=typeof recommendations?.open==='function';
   frame.src='/games/certified-restaurants/index.html?v=20261103-restaurants-map50-2&embedded=1'+(hasMemberMenu?'&member-menu=1':'');
   const status=dialog.querySelector('.restaurant-guide-message');
   let disposed=false,closing=null,authTimer=null;
   const current=()=>!disposed&&active?.dialog===dialog&&allowed();
   const childOpen=()=>recommendations?.isOpen?.()===true;
   function finish(){
    if(disposed)return true;
    disposed=true;
    if(active?.dialog===dialog)active=null;
    clearInterval(authTimer);
    frame.removeEventListener('load',loaded);window.removeEventListener('message',receive);
    frame.src='about:blank';dialog.close();dialog.remove();
    if(!wasGaming)document.body.classList.remove('gaming');
    if(previous?.isConnected)previous.focus({preventScroll:true});
    return true;
   }
   function close(force=false){
    if(disposed)return true;
    if(force===true||!allowed()){
     try{const result=recommendations?.close?.(true);if(result?.then)Promise.resolve(result).catch(()=>{});}catch{}
     return finish();
    }
    if(closing)return closing;
    let result=true;
    try{if(childOpen())result=recommendations.close();}catch{return false;}
    const complete=value=>{
     if(disposed)return true;
     if(!allowed())return close(true);
     if(value===false||childOpen())return false;
     return finish();
    };
    if(result?.then){
     const pending=Promise.resolve(result).then(complete,()=>false).finally(()=>{if(closing===pending)closing=null;});
     closing=pending;return pending;
    }
    return complete(result);
   }
   function showRecommendations(){
    if(!current()){close(true);return false;}
    if(closing||!hasMemberMenu)return false;
    status.hidden=true;
    const failed=()=>{if(current()){status.textContent='추천맛집을 열지 못했어요. 잠시 후 다시 눌러 주세요.';status.hidden=false;}return false;};
    try{const result=recommendations.open();return result?.then?Promise.resolve(result).then(value=>value===false?failed():value,failed):result===false?failed():true;}catch{return failed();}
   }
   function back(){
    if(!current())return close(true);
    if(childOpen())return typeof recommendations.back==='function'?recommendations.back():recommendations.close();
    return close();
   }
   function receive(event){
    if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!==MESSAGE)return;
    void showRecommendations();
   }
   function loaded(){if(!disposed&&!allowed())close(true);}
   active={dialog,owner,current,close,back,childOpen,openRecommendations:showRecommendations};
   frame.addEventListener('load',loaded);
   window.addEventListener('message',receive);
   dialog.querySelector('button').addEventListener('click',()=>{void close();});
   dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
   authTimer=setInterval(()=>{if(!disposed&&!allowed())close(true);},750);
   document.body.append(dialog);document.body.classList.add('gaming');
   dialog.showModal();dialog.querySelector('button').focus({preventScroll:true});
   if(openRecommendations)return showRecommendations();
   return true;
  },
  close(force=false){return active?.close(force)??true;},
  openRecommendations(){return active?.openRecommendations()??false;},
  back(){return active?.back()??true;},
  isOpen(){if(active&&!active.current()){active.close(true);return false;}return!!active;}
 };
})();
