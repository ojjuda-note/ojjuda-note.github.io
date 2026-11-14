const DURATION=280,RETURN_DURATION=180,EASING='cubic-bezier(.22,.7,.2,1)';
const MARKERS=/^data-(?:reader-(?:current|page|branch|paged)|compatibility-(?:current|page))$/;
const bindings=new WeakMap();

/** Visual effects never own navigation or extend the lifetime of a reading. */
export function createReadingMotion(container,{getCurrentPage}) {
  bindings.get(container)?.dispose();
  const doc=container.ownerDocument,win=doc.defaultView;
  const preference=win?.matchMedia?.('(prefers-reduced-motion: reduce)');
  let active=null,disposed=false;
  const reduced=()=>{
    const override=doc.documentElement.dataset.reducedMotion;
    return override==='true'||(override!=='false'&&Boolean(preference?.matches));
  };
  const visible=page=>Boolean(page&&container.isConnected&&container.contains(page)
    &&!page.closest('[hidden],[aria-hidden="true"]')&&getCurrentPage()===page);
  const enabled=page=>!disposed&&!reduced()&&visible(page)&&typeof page.animate==='function'
    &&page.getBoundingClientRect().width>0;
  const translate=x=>`translate3d(${Math.round(x*100)/100}px,0,0)`;

  function cancel() {
    const state=active;if(!state)return;
    active=null;
    state.observer?.disconnect();
    win?.removeEventListener('blur',cancel);win?.removeEventListener('resize',cancel);
    doc.removeEventListener('visibilitychange',cancel);
    preference?.removeEventListener?.('change',changedPreference);
    for(const animation of state.animations)animation.cancel();
    for(const [page,saved] of state.saved) {
      page.style.transform=saved.transform;page.style.willChange=saved.willChange;
      page.classList.remove('reading-slide-dragging','reading-slide-incoming');
    }
    for(const ghost of state.ghosts)ghost.remove();
    container.removeAttribute('data-reading-motion');
  }
  function changedPreference() {if(reduced())cancel();}
  function start(page,kind) {
    const state={page,kind,offset:0,saved:new Map(),animations:[],ghosts:[]};
    active=state;container.dataset.readingMotion=kind;
    if(win?.MutationObserver) {
      state.observer=new win.MutationObserver(()=>{
        if(active===state&&(!visible(state.page)||reduced()))cancel();
      });
      state.observer.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,
        attributeFilter:['hidden','aria-hidden','data-reduced-motion']});
    }
    win?.addEventListener('blur',cancel);win?.addEventListener('resize',cancel);
    doc.addEventListener('visibilitychange',cancel);
    preference?.addEventListener?.('change',changedPreference);
    return state;
  }
  function save(state,page) {
    if(!state.saved.has(page))state.saved.set(page,{transform:page.style.transform,willChange:page.style.willChange});
    page.style.willChange='transform';
  }
  function animate(state,page,from,to,duration=DURATION) {
    const animation=page.animate([{transform:translate(from)},{transform:translate(to)}],
      {duration,easing:EASING,fill:'both'});
    state.animations.push(animation);
  }
  function finishAnimations(state) {
    Promise.all(state.animations.map(animation=>animation.finished.catch(()=>{}))).then(()=>{
      if(active===state)cancel();
    });
  }
  function drag(page,offset,{bounded=false}={}) {
    if(!enabled(page)) {cancel();return;}
    if(!active||active.page!==page||active.kind!=='drag') {cancel();start(page,'drag');}
    const state=active,width=Math.max(1,container.getBoundingClientRect().width);
    save(state,page);
    // At either end, give a small resisted movement instead of an empty page.
    state.offset=bounded?Math.sign(offset)*Math.min(32,Math.abs(offset)*.2)
      :Math.max(-width*.9,Math.min(width*.9,offset));
    page.classList.add('reading-slide-dragging');page.style.transform=translate(state.offset);
  }
  function settle() {
    const page=active?.page,offset=active?.offset||0;
    if(!offset||!enabled(page)) {cancel();return;}
    cancel();const state=start(page,'return');save(state,page);
    page.classList.add('reading-slide-incoming');
    try {animate(state,page,offset,0,RETURN_DURATION);finishAnimations(state);}
    catch {cancel();}
  }
  function prepare(direction) {
    const page=getCurrentPage();
    if(!direction||!enabled(page)) {cancel();return null;}
    const rect=page.getBoundingClientRect(),style=win.getComputedStyle(page),ghost=page.cloneNode(true);
    cancel();
    const restingRect=page.getBoundingClientRect(),hostRect=container.getBoundingClientRect();
    // Read the real visual offset before cancelling, including a previous
    // button transition that has not finished yet.
    const offset=rect.left-restingRect.left;
    const left=restingRect.left-hostRect.left-container.clientLeft+container.scrollLeft;
    for(const hidden of ghost.querySelectorAll('[hidden]'))hidden.remove();
    for(const element of [ghost,...ghost.querySelectorAll('*')]) {
      for(const attribute of [...element.attributes]) {
        if(attribute.name==='id'||MARKERS.test(attribute.name)
          ||['aria-labelledby','aria-describedby','aria-controls','aria-owns','aria-activedescendant','for'].includes(attribute.name)) {
          element.removeAttribute(attribute.name);
        }
      }
      element.classList.remove('reading-slide-dragging','reading-slide-incoming');
      if(element.matches('a,button,input,select,textarea,summary,[tabindex]'))element.tabIndex=-1;
    }
    ghost.setAttribute('aria-hidden','true');ghost.setAttribute('inert','');ghost.classList.add('reading-slide-outgoing');
    for(const property of ['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing',
      'color','textAlign','padding','border','borderRadius','background','boxSizing','display'])ghost.style[property]=style[property];
    Object.assign(ghost.style,{position:'absolute',boxSizing:'border-box',margin:'0',width:`${rect.width}px`,height:`${rect.height}px`,
      pointerEvents:'none',transform:translate(offset),willChange:'transform'});
    return {page,ghost,left,offset,direction:Math.sign(direction)};
  }
  function finish(ticket,page) {
    if(!ticket)return;
    if(ticket.page===page||!enabled(page)) {ticket.ghost.remove();cancel();return;}
    cancel();
    const state=start(page,'slide'),hostRect=container.getBoundingClientRect(),rect=page.getBoundingClientRect();
    const distance=Math.max(hostRect.width,rect.width),{ghost,direction,offset}=ticket;
    // Keep the old horizontal alignment when adjacent pages have different
    // widths. Vertical anchoring follows the new item after the pager scrolls.
    ghost.style.left=`${ticket.left}px`;
    ghost.style.top=`${rect.top-hostRect.top-container.clientTop+container.scrollTop}px`;
    state.ghosts.push(ghost);container.append(ghost);save(state,page);
    page.classList.add('reading-slide-incoming');
    try {
      animate(state,ghost,offset,-direction*distance);
      animate(state,page,direction*distance+offset,0);
      finishAnimations(state);
    } catch {cancel();}
  }
  container.classList.add('reading-motion-enabled');
  const controller={drag,settle,cancel,prepare,finish,dispose(){
    if(disposed)return;disposed=true;cancel();
    if(bindings.get(container)===controller) {
      container.classList.remove('reading-motion-enabled');bindings.delete(container);
    }
  }};
  bindings.set(container,controller);return controller;
}
