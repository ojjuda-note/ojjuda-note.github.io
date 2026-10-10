// Read only the face-up captured piles; neither mode exposes a hidden hand here.
export function installCapturedZoom(doc = document) {
  if(doc.documentElement.dataset.capturedZoom)return;
  doc.documentElement.dataset.capturedZoom='ready';
  const win=doc.defaultView;
  const style=doc.createElement('style');
  style.textContent=`
    .caps .cap{cursor:zoom-in;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:manipulation}
    .caps .cap:focus-visible{outline:3px solid #f2c14e;outline-offset:2px}
    dialog.captured-zoom{box-sizing:border-box;width:min(92vw,560px);max-height:calc(100dvh - 40px);margin:auto;padding:20px;border:1px solid #d4c9ec;border-radius:22px;background:#fffdf7;color:#302443;box-shadow:0 20px 70px #0007;overflow:auto;overscroll-behavior:contain}
    .captured-zoom::backdrop{background:#120e2499;backdrop-filter:blur(5px)}
    .captured-zoom h2{margin:0;font-size:21px;text-align:center;word-break:keep-all}
    .captured-zoom p{margin:7px 0;text-align:center;font-size:14px;color:#6b577b}
    .captured-zoom .captured-expanded{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin:18px 0}
    .captured-zoom .captured-expanded>svg{display:block;flex:0 0 clamp(64px,19vw,88px);width:clamp(64px,19vw,88px);height:auto;aspect-ratio:2/3;border-radius:4px;box-shadow:0 3px 7px #0003}
    .captured-zoom #captured-close{display:block;width:100%;min-height:46px;border:0;border-radius:12px;background:#543982;color:white;font:inherit;cursor:pointer}
  `;
  doc.head.appendChild(style);
  let pending=null,dialog=null,returnFocus=null,suppressClickUntil=0;
  const pile=target=>target?.closest?.('.zone .caps .cap')||null;
  const faces=el=>[...el.querySelectorAll(':scope > .c > svg, :scope > .cap-cards > svg')];
  const owner=el=>el.closest('.zone')?.classList.contains('me')?'내가 먹은 패':'상대가 먹은 패';
  const group=el=>el.dataset.g||el.querySelector('.lb')?.textContent.trim().split(/\s/)[0]||'먹은 패';
  const cancel=()=>{if(pending)win.clearTimeout(pending.timer);pending=null;};
  const close=()=>{
    cancel();const old=dialog;dialog=null;
    if(old){old.close();old.remove();}
    if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
    returnFocus=null;
  };
  const show=el=>{
    if(dialog||!el.isConnected||doc.querySelector('.modal,.dialog'))return;
    const cards=faces(el);if(!cards.length)return;
    returnFocus=el;dialog=doc.createElement('dialog');dialog.className='captured-zoom';
    dialog.setAttribute('aria-labelledby','captured-title');
    const title=doc.createElement('h2');title.id='captured-title';title.textContent=owner(el);
    const label=doc.createElement('p');label.textContent=group(el);
    const list=doc.createElement('div');list.className='captured-expanded';
    for(const card of cards)list.appendChild(card.cloneNode(true));
    const button=doc.createElement('button');button.id='captured-close';button.type='button';button.textContent='닫기';button.onclick=close;
    dialog.append(title,label,list,button);doc.body.appendChild(dialog);
    let backdropDown=false;
    dialog.addEventListener('pointerdown',e=>{backdropDown=e.target===dialog;});
    dialog.addEventListener('click',e=>{if(backdropDown&&e.target===dialog)close();});
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.showModal();button.focus({preventScroll:true});
  };
  doc.addEventListener('pointerdown',e=>{
    cancel();
    if(e.isPrimary===false||e.button>0)return;
    const el=pile(e.target);if(!el||!faces(el).length)return;
    const held={el,id:e.pointerId,x:e.clientX,y:e.clientY,timer:null};pending=held;
    held.timer=win.setTimeout(()=>{
      if(pending!==held)return;
      pending=null;suppressClickUntil=Date.now()+1000;show(el);
    },450);
  },true);
  doc.addEventListener('pointermove',e=>{
    if(pending&&e.pointerId===pending.id&&Math.hypot(e.clientX-pending.x,e.clientY-pending.y)>12){suppressClickUntil=Date.now()+1000;cancel();}
  },true);
  doc.addEventListener('pointerup',cancel,true);
  const abandon=()=>{if(pending)suppressClickUntil=Date.now()+1000;cancel();};
  for(const type of ['pointercancel','lostpointercapture','scroll'])doc.addEventListener(type,abandon,true);
  win.addEventListener('blur',abandon);
  doc.addEventListener('contextmenu',e=>{if(pile(e.target))e.preventDefault();},true);
  // Keep the existing quick-tap behavior and suppress the release-click after a hold.
  doc.addEventListener('click',e=>{
    const el=pile(e.target);if(!el)return;
    e.preventDefault();e.stopImmediatePropagation();cancel();
    if(Date.now()>=suppressClickUntil)show(el);
  },true);
  doc.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&dialog){e.preventDefault();e.stopImmediatePropagation();close();return;}
    const el=pile(e.target);
    if(el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopImmediatePropagation();show(el);}
  },true);
  const annotate=()=>{
    // Mandatory choices/results take precedence while play continues behind the viewer.
    if(doc.querySelector('.modal,.dialog')){if(dialog)close();cancel();}
    for(const el of doc.querySelectorAll('.zone .caps .cap')){
      const hasCards=faces(el).length>0;
      el.setAttribute('role','button');el.tabIndex=hasCards?0:-1;
      el.setAttribute('aria-disabled',String(!hasCards));
      el.setAttribute('aria-label',owner(el)+' · '+group(el)+' · 길게 눌러 크게 보기');
      el.title='길게 누르면 크게 볼 수 있어요';
    }
  };
  const observer=new win.MutationObserver(annotate);
  observer.observe(doc.documentElement,{childList:true,subtree:true});annotate();
  return {close};
}
if(typeof document!=='undefined')installCapturedZoom(document);
