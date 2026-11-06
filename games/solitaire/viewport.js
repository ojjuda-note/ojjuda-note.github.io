export function createViewport({cancelDrag, suppressClick, canInteract, relayout}) {
  const viewport=document.querySelector('#board-viewport');
  const canvas=document.querySelector('#board-canvas');
  const board=document.querySelector('#board');
  const label=document.querySelector('#zoom-fit');
  const points=new Map();
  let zoom=1, pinch=null, pan=null, gesture=false;
  const clamp=value=>Math.min(2.5,Math.max(.75,value));
  const middle=()=>{const [a,b]=[...points.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y)};};
  function prepare(){board.style.width=`${viewport.clientWidth}px`;}
  function updateSize(){
    board.style.transform=`scale(${zoom})`;
    canvas.style.width=`${board.offsetWidth*zoom}px`;
    canvas.style.height=`${board.offsetHeight*zoom}px`;
    label.textContent=`${Math.round(zoom*100)}%`;
    label.setAttribute('aria-label',`현재 ${Math.round(zoom*100)}%, 누르면 화면 맞춤`);
    document.querySelector('#zoom-out').disabled=zoom<=.75;
    document.querySelector('#zoom-in').disabled=zoom>=2.5;
  }
  function anchor(x,y){const r=board.getBoundingClientRect();return {x:(x-r.left)/zoom,y:(y-r.top)/zoom};}
  function place(point,x,y){const r=board.getBoundingClientRect();viewport.scrollLeft+=r.left+point.x*zoom-x;viewport.scrollTop+=r.top+point.y*zoom-y;}
  function setZoom(value,x,y){
    const r=viewport.getBoundingClientRect();x??=r.left+r.width/2;y??=r.top+r.height/2;
    const point=anchor(x,y);zoom=clamp(value);updateSize();place(point,x,y);
  }
  document.querySelector('#zoom-in').onclick=()=>setZoom(zoom+.25);
  document.querySelector('#zoom-out').onclick=()=>setZoom(zoom-.25);
  label.onclick=()=>{zoom=1;prepare();updateSize();viewport.scrollTo(0,0);};
  viewport.addEventListener('pointerdown',e=>{
    if(!canInteract() || e.button!==0)return;
    points.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(points.size===2){
      cancelDrag();gesture=true;pan=null;
      const m=middle();pinch={zoom,distance:Math.max(1,m.distance),anchor:anchor(m.x,m.y)};
      for(const id of points.keys())viewport.setPointerCapture(id);
      e.preventDefault();e.stopPropagation();
    }else if(gesture){viewport.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();}
    else if(!e.target.closest('.card,#stock')){
      pan={id:e.pointerId,x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,moved:false};
    }
  },true);
  viewport.addEventListener('pointermove',e=>{
    if(!points.has(e.pointerId))return;
    points.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(gesture){
      e.preventDefault();e.stopPropagation();
      if(points.size>=2 && pinch){const m=middle();zoom=clamp(pinch.zoom*m.distance/pinch.distance);updateSize();place(pinch.anchor,m.x,m.y);}
    }else if(pan?.id===e.pointerId){
      const dx=e.clientX-pan.x,dy=e.clientY-pan.y;
      if(Math.hypot(dx,dy)>7)pan.moved=true;
      if(pan.moved){viewport.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();viewport.scrollTo(pan.left-dx,pan.top-dy);}
    }
  },true);
  function end(e){
    if(!points.has(e.pointerId))return;
    points.delete(e.pointerId);
    if(gesture || pan?.moved){e.preventDefault();e.stopPropagation();suppressClick();}
    if(pan?.id===e.pointerId)pan=null;
    if(!points.size){pinch=null;gesture=false;}
    else if(points.size<2)pinch=null;
  }
  // Also clear a pointer released outside the board before capture starts.
  window.addEventListener('pointerup',end,true);
  window.addEventListener('pointercancel',end,true);
  viewport.addEventListener('wheel',e=>{
    if(!e.ctrlKey&&!e.metaKey)return;
    e.preventDefault();setZoom(zoom*Math.exp(-e.deltaY*.005),e.clientX,e.clientY);
  },{passive:false});
  new ResizeObserver(()=>relayout()).observe(viewport);
  return {prepare,updateSize};
}
