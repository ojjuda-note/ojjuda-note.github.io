(() => {
  'use strict';
  window.OjjudaSaetbyeolTreeControls={install({canvas,active,view,geometry,select}){
    const pointers=new Map();let dragged=false;
    const clear=()=>{pointers.clear();dragged=false;};
    function zoom(factor,x,y){
      const before=geometry(),next=Math.max(1,Math.min(10,view.zoom*factor));
      const ratio=next/view.zoom;
      view.x+=(x-before.cx)*(1-ratio);view.y+=(y-before.cy)*(1-ratio);view.zoom=next;
    }
    function centerZoom(factor){const g=geometry();zoom(factor,g.centerX,g.centerY);}
    function reset(){clear();view.zoom=1;view.x=view.y=0;}
    function focus(point){
      const g=geometry();view.zoom=Math.max(view.zoom,Math.min(10,30/g.baseK));
      view.x=-point.x*g.baseK*view.zoom;view.y=-point.y*g.baseK*view.zoom;
    }
    const midpoint=points=>({x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2});
    const distance=points=>Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
    canvas.addEventListener('pointerdown',event=>{
      if(!active()||event.button>0)return;
      event.preventDefault();
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY});
      if(pointers.size>1)dragged=true;
      try{canvas.setPointerCapture(event.pointerId);}catch{}
    });
    canvas.addEventListener('pointermove',event=>{
      if(!active()){clear();return;}
      const previous=pointers.get(event.pointerId);if(!previous)return;
      event.preventDefault();
      const before=[...pointers.values()];
      const current={...previous,x:event.clientX,y:event.clientY};pointers.set(event.pointerId,current);
      if(pointers.size===1){
        if(Math.hypot(current.x-current.startX,current.y-current.startY)>6)dragged=true;
        if(dragged){view.x+=current.x-previous.x;view.y+=current.y-previous.y;}
      }else{
        const after=[...pointers.values()],a=midpoint(before),b=midpoint(after);
        view.x+=b.x-a.x;view.y+=b.y-a.y;
        const d=distance(before);if(d>0)zoom(distance(after)/d,b.x,b.y);
      }
    },{passive:false});
    canvas.addEventListener('pointerup',event=>{
      if(!pointers.has(event.pointerId))return;
      const tap=active()&&pointers.size===1&&!dragged;
      pointers.delete(event.pointerId);
      try{canvas.releasePointerCapture(event.pointerId);}catch{}
      if(tap)select(event.clientX,event.clientY);
      if(!pointers.size)dragged=false;
    });
    canvas.addEventListener('pointercancel',clear);
    canvas.addEventListener('lostpointercapture',event=>{if(pointers.has(event.pointerId))clear();});
    canvas.addEventListener('wheel',event=>{
      if(!active())return;event.preventDefault();zoom(Math.exp(-event.deltaY*.0015),event.clientX,event.clientY);
    },{passive:false});
    window.addEventListener('blur',clear);
    document.getElementById('treeIn').onclick=()=>centerZoom(1.4);
    document.getElementById('treeOut').onclick=()=>centerZoom(1/1.4);
    document.getElementById('treeFit').onclick=reset;
    return {reset,focus,zoom};
  }};
})();
