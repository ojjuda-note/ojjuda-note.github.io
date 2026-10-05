/* Refresh data in the current view, without leaving its route or reloading the app. */
(() => {
 'use strict';
 window.OjjudaWorldPullRefresh={install(options){
  let busy=false,gesture=null,hideTimer=0;
  const indicator=document.createElement('div');indicator.className='world-pull-indicator';indicator.hidden=true;indicator.setAttribute('role','status');indicator.setAttribute('aria-live','polite');document.body.append(indicator);
  const style=document.createElement('style');style.textContent='html{overscroll-behavior-y:contain}.world-pull-indicator{position:fixed;z-index:2000;top:calc(env(safe-area-inset-top,0px) + 54px);left:50%;transform:translateX(-50%);padding:10px 18px;border:1px solid #e6d9ed;border-radius:24px;background:#fffaf4;color:#725280;box-shadow:0 4px 18px #45324b18;font:13px/1.5 sans-serif;pointer-events:none;white-space:nowrap}.world-pull-indicator[hidden]{display:none}';document.head.append(style);
  const visible=doc=>[...doc.querySelectorAll('dialog[open],[role="dialog"],#modal-root:not(:empty),.gaming,.dialog-backdrop:not([hidden]),.nn-backdrop:not([hidden])')].some(el=>el.getClientRects().length);
  const same=key=>options.key()===key;
  function atTop(target,doc){
   if((doc.scrollingElement?.scrollTop||0)>2||window.scrollY>2)return false;
   for(let node=target;node;node=node.parentElement)if(node.scrollTop>2&&node.scrollHeight>node.clientHeight+2)return false;
   return true;
  }
  function eligible(target,doc,canStart){
   if(busy||!canStart()||options.canRefresh?.()===false||visible(document)||visible(doc))return false;
   if(!target?.closest||!target.closest(doc===document?'.main,.topbar':'body'))return false;
   return !target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),canvas,video,audio,[role="slider"],.stage:not(.place-art-stage),.note-map,.note-photo-gallery,[data-no-pull],[data-world-swipe="off"]');
  }
  function reset(){gesture=null;if(!busy)indicator.hidden=true;}
  async function refresh(doc,key){
   if(busy||!same(key))return;busy=true;indicator.hidden=false;indicator.textContent='↻ 새로고침 중';
   try{const result=await options.refresh(doc);if(result===false)throw Error('refresh unavailable');if(same(key))indicator.textContent='새로고침 완료';}
   catch(error){if(same(key))indicator.textContent=navigator.onLine?'새로고침하지 못했어요. 다시 당겨 주세요.':'인터넷 연결을 확인해 주세요.';}
   finally{busy=false;if(!same(key))indicator.hidden=true;clearTimeout(hideTimer);hideTimer=setTimeout(()=>indicator.hidden=true,1100);}
  }
  function attachDocument(doc,canStart=()=>true){
   const removers=[],listen=(name,fn,opts)=>{doc.addEventListener(name,fn,opts);removers.push(()=>doc.removeEventListener(name,fn,opts));};
   const root=doc.documentElement,oldOverscroll=root.style.overscrollBehaviorY;root.style.overscrollBehaviorY='contain';
   listen('touchstart',event=>{
    reset();if(event.touches.length!==1||!eligible(event.target,doc,canStart)||!atTop(event.target,doc))return;
    clearTimeout(hideTimer);const p=event.touches[0];gesture={doc,target:event.target,id:p.identifier,x:p.clientX,y:p.clientY,key:options.key(),armed:false,pulling:false};
   },{passive:true});
   listen('touchmove',event=>{
    const g=gesture;if(!g||g.doc!==doc)return;
    if(event.touches.length!==1||!same(g.key)||!canStart()||!atTop(g.target,doc)){reset();return;}
    const p=event.touches[0];if(p.identifier!==g.id){reset();return;}
    const dx=p.clientX-g.x,dy=p.clientY-g.y;
    if(dy< -6||Math.abs(dx)>Math.max(12,Math.abs(dy)*.8)){reset();return;}
    if(dy<12)return;if(event.cancelable)event.preventDefault();
    g.pulling=true;g.armed=dy>=80;indicator.hidden=false;indicator.textContent=g.armed?'놓으면 새로고침':'↓ 아래로 당겨 새로고침';
   },{passive:false});
   listen('touchend',event=>{const g=gesture;if(!g||g.doc!==doc)return;const go=!event.touches.length&&g.armed&&same(g.key)&&eligible(g.target,doc,canStart)&&atTop(g.target,doc);reset();if(go)void refresh(doc,g.key);},{passive:true});
   listen('touchcancel',reset,{passive:true});doc.defaultView?.addEventListener('blur',reset);
   return ()=>{if(gesture?.doc===doc)reset();removers.forEach(remove=>remove());root.style.overscrollBehaviorY=oldOverscroll;doc.defaultView?.removeEventListener('blur',reset);};
  }
  attachDocument(document);
  return {attachDocument};
 }};
})();
