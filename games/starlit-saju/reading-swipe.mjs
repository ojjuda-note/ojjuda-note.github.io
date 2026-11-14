const bindings=new WeakMap();
const INTERACTIVE='a,button,input,select,textarea,label,summary,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="link"],[role="slider"],[role="combobox"],[role="textbox"],[draggable="true"],img,video,audio,canvas,.reading-pager,.reading-controls,.reading-tools';
const AXIS_DISTANCE=12,MIN_DISTANCE=56,HORIZONTAL_RATIO=1.5,HOLD_LIMIT=500;

/** A swipe follows the existing entitled reading's previous/next controls. */
export function attachReadingSwipe(container,{previous,next,motion=null}) {
  bindings.get(container)?.();
  const doc=container.ownerDocument;
  let gesture=null,blockedClickUntil=0,disposed=false;
  const selection=()=>doc.defaultView?.getSelection?.();
  const currentPage=()=>container.querySelector('[data-reader-current],[data-compatibility-current]');
  const visible=()=>container.isConnected&&!container.closest('[hidden],[aria-hidden="true"]');
  function reset({settle=false,keepMotion=false}={}) {
    const previousGesture=gesture;gesture=null;
    doc.defaultView?.removeEventListener('blur',reset);
    doc.defaultView?.removeEventListener('pointerup',cancel);
    doc.defaultView?.removeEventListener('pointercancel',cancel);
    doc.removeEventListener('visibilitychange',reset);
    container.classList.remove('reading-swipe-dragging');
    if(!keepMotion) {
      if(settle)motion?.settle();else motion?.cancel();
    }
    if(previousGesture?.captured) {
      try {
        if(container.hasPointerCapture?.(previousGesture.id))container.releasePointerCapture(previousGesture.id);
      } catch { /* The browser may already have canceled the pointer. */ }
    }
  }
  function continuing(event) {
    return gesture&&event.pointerId===gesture.id&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey
      &&visible()&&currentPage()===gesture.page;
  }
  function clearGestureSelection() {
    const selected=selection();
    if(!selected||selected.isCollapsed)return true;
    // Never clear an older selection or one outside this reading. The gesture
    // started collapsed, so these endpoints belong to this quick text drag.
    if(!container.contains(selected.anchorNode)||!container.contains(selected.focusNode))return false;
    selected.removeAllRanges();return true;
  }
  function down(event) {
    if(gesture&&event.pointerId!==gesture.id) {reset();return;}
    const target=event.target?.nodeType===1?event.target:event.target?.parentElement;
    const interactive=Boolean(target?.closest(INTERACTIVE));
    // Buttons keep a running transition until their click can continue from
    // its actual position. Starting a new reading drag still cancels it.
    reset({keepMotion:!gesture&&interactive});blockedClickUntil=0;
    if(event.defaultPrevented||event.isPrimary===false||event.button!==0
      ||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey
      ||!visible()||!target||interactive||selection()?.isCollapsed===false)return;
    gesture={id:event.pointerId,type:event.pointerType||'mouse',x:event.clientX,y:event.clientY,
      time:event.timeStamp,page:currentPage(),horizontal:false,captured:false};
    // Listen outside the reading only while this pointer is held. Returning
    // from another tab/window must not finish an interrupted old gesture.
    doc.defaultView?.addEventListener('blur',reset);
    // Bubble-only cleanup catches a release retargeted after the host is
    // removed. Normal in-reading navigation has already run at the root.
    doc.defaultView?.addEventListener('pointerup',cancel);
    doc.defaultView?.addEventListener('pointercancel',cancel);
    doc.addEventListener('visibilitychange',reset);
  }
  function move(event) {
    if(!gesture||event.pointerId!==gesture.id)return;
    if(!continuing(event)||(gesture.type==='mouse'&&event.buttons!==1)) {reset();return;}
    const x=Math.abs(event.clientX-gesture.x),y=Math.abs(event.clientY-gesture.y);
    if(!gesture.horizontal) {
      // Holding or starting vertically belongs to selection/scrolling, even
      // if a finger or mouse later moves sideways.
      if(event.timeStamp-gesture.time>HOLD_LIMIT) {reset();return;}
      if(Math.max(x,y)<AXIS_DISTANCE)return;
      if(x<y*HORIZONTAL_RATIO) {reset();return;}
      if(!clearGestureSelection()) {reset();return;}
      gesture.horizontal=true;
      container.classList.add('reading-swipe-dragging');
      try {container.setPointerCapture?.(gesture.id);gesture.captured=Boolean(container.hasPointerCapture?.(gesture.id));}
      catch { /* A pointer released between events needs no capture. */ }
    }
    if(!clearGestureSelection()) {reset();return;}
    const offset=event.clientX-gesture.x,button=offset<0?next:previous;
    motion?.drag(gesture.page,offset,{bounded:!button||button.disabled});
    if(event.cancelable)event.preventDefault();
  }
  function up(event) {
    if(!gesture||event.pointerId!==gesture.id)return;
    const ended=gesture,x=event.clientX-ended.x,y=event.clientY-ended.y;
    const canMove=continuing(event)&&ended.horizontal&&Math.abs(x)>=MIN_DISTANCE
      &&Math.abs(x)>=Math.abs(y)*HORIZONTAL_RATIO&&clearGestureSelection();
    // Suppress only the click generated by this claimed drag, including at an
    // end of the reading. A fresh pointerdown or keyboard click is unaffected.
    if(ended.horizontal)blockedClickUntil=event.timeStamp+400;
    const button=x<0?next:previous;
    const turn=canMove&&button&&!button.disabled;
    reset({keepMotion:Boolean(turn),settle:!turn&&ended.horizontal});
    if(turn)button.click();
  }
  function cancel(event) {
    if(gesture&&event.pointerId===gesture.id)reset();
  }
  function lostCapture(event) {
    if(!gesture||event.pointerId!==gesture.id)return;
    // Touch implicitly captures its paragraph first. Transferring capture to
    // this container emits a bubbling loss from that previous target.
    if(event.target!==container&&container.hasPointerCapture?.(gesture.id))return;
    reset();
  }
  function leave(event) {
    if(gesture?.type==='mouse'&&!gesture.captured&&event.pointerId===gesture.id)reset();
  }
  function mouseDown(event) {
    // Double/triple clicks retain the browser's word/paragraph selection.
    if(event.detail>1&&gesture)reset();
  }
  function selectStart(event) {
    if(gesture?.horizontal&&event.cancelable)event.preventDefault();
  }
  function click(event) {
    if(event.detail>0&&blockedClickUntil&&event.timeStamp<=blockedClickUntil) {
      blockedClickUntil=0;event.preventDefault();event.stopPropagation();
    }
  }
  const listeners=[['pointerdown',down],['pointermove',move],['pointerup',up],
    ['pointercancel',cancel],['lostpointercapture',lostCapture],['pointerleave',leave],
    ['mousedown',mouseDown],['selectstart',selectStart],['click',click],
    ['contextmenu',reset],['dragstart',reset]];
  for(const [name,handler] of listeners)container.addEventListener(name,handler,{capture:true,passive:false});
  container.classList.add('reading-swipe-enabled');
  const cleanup=()=>{
    if(disposed)return;
    disposed=true;
    reset();
    motion?.dispose();
    for(const [name,handler] of listeners)container.removeEventListener(name,handler,true);
    container.classList.remove('reading-swipe-enabled');bindings.delete(container);
  };
  bindings.set(container,cleanup);
  return cleanup;
}
