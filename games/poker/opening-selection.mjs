// The opening chooser reuses the real hand and controls; no second card set.
export function createOpeningSelection({onFinish=()=>{}}={}){
  let current=null;
  function capture(root){
    const hand=root.querySelector('.my-cards');if(!hand)return null;
    return {raised:!!hand.closest('.opening-selection'),cards:new Map([...hand.querySelectorAll('[data-hand-card]')].map(node=>[node.dataset.handCard,node.getBoundingClientRect()]))};
  }
  function mount(root,{phase,selecting,notice=''}){
    const doc=root.ownerDocument,hand=root.querySelector('.my-cards'),actions=root.querySelector('.decision-panel');
    if(!hand||!actions)return;
    const overlay=doc.createElement('section');overlay.className='opening-selection';
    overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','opening-title');
    overlay.innerHTML=`<div class="opening-selection-panel"><header class="opening-heading"><div><span class="opening-step">${phase==='discard'?'1 / 2 · 버릴 카드':'2 / 2 · 공개할 카드'}</span><h2 id="opening-title">시작 패 고르기</h2></div><button class="small-button" data-action="exit" aria-label="게임 나가기">나가기</button></header><div class="opening-hand"></div></div>`;
    hand.closest('.player').classList.add('opening-home');
    overlay.querySelector('.opening-hand').append(hand);
    const message=doc.createElement('p');message.className='opening-notice online-connection';message.setAttribute('role','status');message.textContent=notice;
    overlay.querySelector('.opening-selection-panel').append(message,actions);
    for(const child of root.children)child.setAttribute('inert','');
    root.append(overlay);
    if(!selecting)hand.querySelectorAll('button').forEach(button=>button.disabled=true);
    const focus=hand.querySelector('.selected')||hand.querySelector('button:enabled')||overlay.querySelector('[data-action="exit"]');
    focus?.focus({preventScroll:true});
    overlay.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const buttons=[...overlay.querySelectorAll('button:not(:disabled)')];if(!buttons.length)return;
      const first=buttons[0],last=buttons.at(-1);
      if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}
    });
  }
  function cancel(){
    const run=current;if(!run)return false;current=null;
    for(const animation of run.animations)animation.cancel();
    for(const [button,disabled] of run.buttons)if(button.isConnected)button.disabled=disabled;
    run.root.classList.remove('is-opening-transfer');run.root.removeAttribute('aria-busy');
    return true;
  }
  function transfer(root,before){
    if(!before)return false;
    const doc=root.ownerDocument,win=doc.defaultView,hand=root.querySelector('.my-cards');
    if(!hand||before.raised===!!hand.closest('.opening-selection')||doc.hidden||win.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return false;
    const moves=[...hand.querySelectorAll('[data-hand-card]')].filter(node=>before.cards.has(node.dataset.handCard)&&!node.classList.contains('dealing')).map(node=>({node,from:before.cards.get(node.dataset.handCard),to:node.getBoundingClientRect()})).filter(({node,from,to})=>node.animate&&from.width&&from.height&&to.width&&to.height);
    if(!moves.length)return false;
    const run={root,animations:[],buttons:[]};current=run;
    const finish=()=>{if(current!==run)return;cancel();onFinish();};
    try{
      for(const {node,from,to} of moves){
        const x=from.left+from.width/2-to.left-to.width/2,y=from.top+from.height/2-to.top-to.height/2;
        const animation=node.animate([{translate:`${x}px ${y}px`,scale:`${from.width/to.width} ${from.height/to.height}`},{translate:'0 0',scale:'1 1'}],{duration:460,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
        run.animations.push(animation);
        if(!animation.finished?.then){cancel();return false;}
        animation.finished.catch(()=>{});
      }
      for(const button of root.querySelectorAll('.my-cards button,.actions button,.seat button')){run.buttons.push([button,button.disabled]);button.disabled=true;}
      root.classList.add('is-opening-transfer');root.setAttribute('aria-busy','true');
      Promise.all(run.animations.map(animation=>animation.finished)).then(finish,finish);
      return true;
    }catch{cancel();return false;}
  }
  return {capture,mount,transfer,cancel,active:()=>!!current};
}
