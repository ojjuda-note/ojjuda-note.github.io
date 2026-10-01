(function(){
  'use strict';
  const pictures={
    cafe:{src:'/assets/world-places/cafe-20261001.webp',alt:'원목 테이블과 창가 좌석이 있는 따뜻한 카페'},
    library:{src:'/assets/world-places/library-20261001.webp',alt:'책장과 넓은 독서 테이블이 있는 아늑한 도서관'},
    park:{src:'/assets/world-places/park-20261001.webp',alt:'분수와 벤치, 꽃과 나무가 어우러진 공원'},
    arcade:{src:'/assets/world-places/arcade-20261001.webp',alt:'게임기와 당구대가 놓인 밝은 오락실'}
  };
  window.OjjudaPlaceArt={install(app){
    let stage=null,viewport=null,picture=null,status=null,retry=null,controls=null,events=null,observer=null;
    let placeId=null,scale=1,offsetX=0,offsetY=0,drag=null;
    const current=()=>stage?.isConnected&&picture?.isConnected;
    function render(){
      if(!current())return;
      const maxX=viewport.clientWidth*(scale-1)/2,maxY=viewport.clientHeight*(scale-1)/2;
      offsetX=Math.max(-maxX,Math.min(maxX,offsetX));offsetY=Math.max(-maxY,Math.min(maxY,offsetY));
      picture.style.transform='translate('+offsetX+'px,'+offsetY+'px) scale('+scale+')';
      viewport.classList.toggle('is-zoomed',scale>1);
      controls.querySelector('[aria-label="공간 축소"]').disabled=scale<=1;
      controls.querySelector('[aria-label="공간 확대"]').disabled=scale>=2;
    }
    function dispose(){
      events?.abort();observer?.disconnect();
      stage=viewport=picture=status=retry=controls=events=observer=null;placeId=null;drag=null;
    }
    function sync(){
      if(!current())return false;
      const place=app.snapshot(),art=pictures[place.id];
      if(!art)return false;
      if(placeId===place.id)return true;
      placeId=place.id;stage.dataset.placeId=placeId;scale=1;offsetX=offsetY=0;drag=null;
      stage.classList.remove('place-art-ready');status.textContent='공간을 불러오고 있어요…';retry.hidden=true;
      picture.alt=art.alt;picture.src=art.src;render();return true;
    }
    function mount(){
      const next=document.querySelector('#pstage');
      if(next&&next===stage){sync();return;}
      dispose();if(!next)return;
      stage=next;stage.classList.add('place-art-stage');stage.dataset.worldSwipe='off';
      events=new AbortController();const options={signal:events.signal};
      viewport=document.createElement('div');viewport.className='place-art-viewport';
      picture=document.createElement('img');picture.className='place-art-image';picture.width=1536;picture.height=1024;picture.draggable=false;picture.decoding='async';
      status=document.createElement('span');status.className='place-art-status';status.setAttribute('role','status');
      retry=document.createElement('button');retry.className='place-art-retry';retry.type='button';retry.textContent='다시 불러오기';retry.hidden=true;
      controls=document.createElement('div');controls.className='place-art-tools';controls.setAttribute('role','group');controls.setAttribute('aria-label','공간 보기');
      for(const [label,text,delta] of [['공간 축소','−',-.25],['공간 맞춤','전체 보기',0],['공간 확대','+',.25]]){
        const button=document.createElement('button');button.type='button';button.textContent=text;button.setAttribute('aria-label',label);
        button.addEventListener('click',()=>{scale=delta?Math.max(1,Math.min(2,scale+delta)):1;render();},options);controls.append(button);
      }
      const source=picture;
      picture.addEventListener('load',()=>{if(picture!==source||!current())return;stage.classList.add('place-art-ready');status.textContent='';retry.hidden=true;},options);
      picture.addEventListener('error',()=>{if(picture!==source||!current())return;stage.classList.remove('place-art-ready');status.textContent='공간을 불러오지 못했어요.';retry.hidden=false;},options);
      retry.addEventListener('click',()=>{status.textContent='공간을 불러오고 있어요…';retry.hidden=true;picture.src=pictures[placeId].src+'?retry='+Date.now();},options);
      viewport.addEventListener('pointerdown',event=>{if(scale<=1||!event.isPrimary||event.button!==0)return;drag={id:event.pointerId,x:event.clientX,y:event.clientY,offsetX,offsetY};viewport.setPointerCapture(event.pointerId);},options);
      viewport.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;offsetX=drag.offsetX+event.clientX-drag.x;offsetY=drag.offsetY+event.clientY-drag.y;render();},options);
      for(const type of ['pointerup','pointercancel','lostpointercapture'])viewport.addEventListener(type,()=>{drag=null;},options);
      viewport.append(picture);stage.replaceChildren(viewport,status,retry,controls);
      observer=new ResizeObserver(render);observer.observe(viewport);sync();
    }
    addEventListener('pagehide',dispose);addEventListener('pageshow',mount);
    return {mount,sync,dispose};
  }};
})();
