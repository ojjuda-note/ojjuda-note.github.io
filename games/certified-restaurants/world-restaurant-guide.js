/* Keep the directory alive while its member recommendation dialog is open. */
(() => {
 'use strict';
 const MESSAGE='ojjuda:restaurants:recommendations';
 const MAP_MESSAGE='ojjuda:restaurants:recommendation-data',MAP_RESULT='ojjuda:restaurants:recommendation-data-result',MAP_CHANGED='ojjuda:restaurants:recommendations-changed';
 const RATING_MESSAGE='ojjuda:restaurants:ratings',RATING_RESULT='ojjuda:restaurants:rating-result';
 const validRatingId=id=>typeof id==='string'&&id.length<=80&&/^[a-z0-9가-힣]+(?:-[a-z0-9가-힣]+)*$/.test(id);
 const validRecommendedId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
 const validRequestId=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(id);
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
   dialog.setAttribute('aria-label','인증맛집 · 일상');
   dialog.innerHTML='<header class="restaurant-guide-header"><a class="agit-home-link" href="/world.html" aria-label="오쭈다 아지트 홈으로 이동"><img src="/favicon.svg?v=20261022-agit-logo2" alt="" width="24" height="24"><span>오쭈다 <strong>아지트</strong></span></a><span>인증맛집 <small>일상</small></span><button type="button" aria-label="오락실로 돌아가기">← 오락실</button></header><p class="restaurant-guide-message" role="status" hidden></p><iframe title="인증맛집 · 가이드 선정과 우체국 추천 지도" allow="geolocation; clipboard-write; web-share"></iframe>';
   const frame=dialog.querySelector('iframe');
   const hasMemberMenu=typeof recommendations?.open==='function';
   const ratings=recommendations?.ratings;
   const hasRatings=!!owner&&typeof ratings?.getSummaries==='function'&&typeof ratings?.setRating==='function';
   const hasMemberData=!!owner&&typeof recommendations?.getMapPage==='function';
   const ratingRequests=new Set(),mapRequests=new Set();
   frame.src='/games/certified-restaurants/index.html?v=20261108-restaurants-slot69-chungbuk17&embedded=1'+(hasMemberMenu?'&member-menu=1':'')+(hasRatings?'&member-ratings=1':'')+(hasMemberData?'&member-recommendations=1':'');
   const status=dialog.querySelector('.restaurant-guide-message');
   let disposed=false,closing=null,authTimer=null,unsubscribeChanges=null,childWasOpen=false;
   const current=()=>!disposed&&active?.dialog===dialog&&allowed();
   const childOpen=()=>recommendations?.isOpen?.()===true;
   const mapChanged=()=>{if(current()&&hasMemberData)frame.contentWindow.postMessage({type:MAP_CHANGED},location.origin);};
   function finish(){
    if(disposed)return true;
    disposed=true;
    if(active?.dialog===dialog)active=null;
    clearInterval(authTimer);
    unsubscribeChanges?.();unsubscribeChanges=null;
    if(hasMemberData)recommendations.cancelMapReads?.();
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
   function showRecommendations(id){
    if(!current()){close(true);return false;}
    if(closing||!hasMemberMenu)return false;
    if(id!==undefined&&(!owner||!validRecommendedId(id)||typeof recommendations.openDetail!=='function'))return false;
    status.hidden=true;
    const failed=()=>{if(current()){status.textContent='추천맛집을 열지 못했어요. 잠시 후 다시 눌러 주세요.';status.hidden=false;}return false;};
    try{const result=id===undefined?recommendations.open():recommendations.openDetail(id);childWasOpen=childOpen();return result?.then?Promise.resolve(result).then(value=>{childWasOpen=childOpen();return value===false?failed():value;},failed):result===false?failed():true;}catch{return failed();}
   }
   function back(){
    if(!current())return close(true);
    if(childOpen())return typeof recommendations.back==='function'?recommendations.back():recommendations.close();
    return close();
   }
   async function handleRating(message){
    if(!current()){close(true);return;}
    if(!hasRatings||!validRequestId(message.requestId)||ratingRequests.has(message.requestId)||ratingRequests.size>=10)return;
    const requestId=message.requestId;
    const reply=payload=>{if(current())frame.contentWindow.postMessage({type:RATING_RESULT,requestId,...payload},location.origin);};
    const ids=message.ids,kind=message.kind===undefined?'certified':message.kind;
    const validId=kind==='recommended'?validRecommendedId:validRatingId;
    const valid=(kind==='certified'||kind==='recommended')&&(message.action==='summary'?Array.isArray(ids)&&ids.length>0&&ids.length<=100&&ids.every(validId)
     :message.action==='save'&&validId(message.id)&&typeof message.score==='number'&&Number.isFinite(message.score)&&message.score>=1&&message.score<=5&&Number.isInteger(message.score*2));
    if(!valid){reply({error:'별점 요청을 확인해 주세요.'});return;}
    ratingRequests.add(requestId);
    try{
     const data=message.action==='summary'?await ratings.getSummaries(kind,[...new Set(ids)]):await ratings.setRating(kind,message.id,message.score);
     reply({data});
    }catch{
     reply({error:message.action==='save'?'별점을 저장하지 못했어요. 다시 시도해 주세요.':'별점을 불러오지 못했어요. 다시 시도해 주세요.'});
    }finally{ratingRequests.delete(requestId);}
   }
   async function handleMapPage(message){
    if(!current()){close(true);return;}
    if(!hasMemberData||!validRequestId(message.requestId)||mapRequests.has(message.requestId)||mapRequests.size>=3)return;
    const requestId=message.requestId,offset=message.offset??0,limit=message.limit??50;
    const reply=payload=>{if(current())frame.contentWindow.postMessage({type:MAP_RESULT,requestId,...payload},location.origin);};
    if(message.action!=='page'||!Number.isSafeInteger(offset)||offset<0||offset>10000||!Number.isSafeInteger(limit)||limit<1||limit>50){reply({error:'추천맛집 요청을 확인해 주세요.'});return;}
    mapRequests.add(requestId);
    try{reply({data:await recommendations.getMapPage({offset,limit})});}
    catch(error){reply({error:error?.message==='recommendation_map_limit'?'추천맛집 수가 지도 조회 범위를 넘었어요. 추천맛집 목록에서 확인해 주세요.':'추천맛집을 불러오지 못했어요. 다시 시도해 주세요.'});}
    finally{mapRequests.delete(requestId);}
   }
   function receive(event){
    if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
    if(event.data?.type===MESSAGE)void showRecommendations(event.data.id);
    else if(event.data?.type===RATING_MESSAGE)void handleRating(event.data);
    else if(event.data?.type===MAP_MESSAGE)void handleMapPage(event.data);
   }
   function loaded(){if(!disposed&&!allowed())close(true);}
   active={dialog,owner,current,close,back,childOpen,openRecommendations:showRecommendations};
   frame.addEventListener('load',loaded);
   window.addEventListener('message',receive);
   dialog.querySelector('header button').addEventListener('click',()=>close());
   dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
   if(hasMemberData&&typeof recommendations.subscribeChanges==='function')unsubscribeChanges=recommendations.subscribeChanges(mapChanged);
   authTimer=setInterval(()=>{if(disposed)return;if(!allowed()){close(true);return;}const childIsOpen=childOpen();if(childWasOpen&&!childIsOpen)mapChanged();childWasOpen=childIsOpen;},750);
   document.body.append(dialog);document.body.classList.add('gaming');
   dialog.showModal();dialog.querySelector('.agit-home-link').focus({preventScroll:true});
   if(openRecommendations)return showRecommendations();
   return true;
  },
  close(force=false){return active?.close(force)??true;},
  openRecommendations(){return active?.openRecommendations()??false;},
  back(){return active?.back()??true;},
  isOpen(){if(active&&!active.current()){active.close(true);return false;}return!!active;}
 };
})();
