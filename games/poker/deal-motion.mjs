// Fly card backs from the actual deck to the responsive seat positions.
// Presentation never changes the saved hand or exposes an opponent's cards.
export function createDealMotion({play=()=>{},onFinish=()=>{}}={}){
  let current=null;
  function cancel(){
    const run=current;if(!run)return false;
    current=null;
    for(const timer of run.timers)run.win.clearTimeout(timer);
    for(const animation of run.animations)animation.cancel();
    for(const card of run.cards){card.classList.remove('dealing');card.removeAttribute('aria-hidden');}
    for(const [button,disabled] of run.buttons)button.disabled=disabled;
    run.actions?.removeAttribute('inert');
    run.root.removeAttribute('aria-busy');run.root.classList.remove('is-dealing');
    run.layer.remove();return true;
  }
  function start(root,{dealer=0,seats=4}={}){
    cancel();
    const cards=[...root.querySelectorAll('.card.dealing')],doc=root.ownerDocument,win=doc.defaultView;
    const deck=root.querySelector('.deal-deck'),source=deck?.getBoundingClientRect();
    if(!cards.length)return false;
    if(doc.hidden||win.matchMedia?.('(prefers-reduced-motion: reduce)').matches||!cards[0].animate||!source?.width){
      cards.forEach(card=>card.classList.remove('dealing'));return false;
    }
    // Deal one card around the table before starting the next round.
    const order=card=>(Number(card.dataset.dealSeat)-dealer-1+seats)%seats;
    cards.sort((a,b)=>Number(a.dataset.dealOrder)-Number(b.dataset.dealOrder)||order(a)-order(b));
    const layer=doc.createElement('div');layer.className='deal-layer';layer.setAttribute('aria-hidden','true');
    root.querySelector('.felt').append(layer);
    const layerBox=layer.getBoundingClientRect(),actions=root.querySelector('.actions');
    const run={root,cards,win,layer,actions,timers:new Set(),animations:new Set(),buttons:[]};current=run;
    for(const button of root.querySelectorAll('.actions button,.my-cards button,.seat button')){
      run.buttons.push([button,button.disabled]);button.disabled=true;
    }
    actions?.setAttribute('inert','');root.setAttribute('aria-busy','true');root.classList.add('is-dealing');
    cards.forEach(card=>card.setAttribute('aria-hidden','true'));
    const later=(fn,ms)=>{
      const id=win.setTimeout(()=>{run.timers.delete(id);if(current===run)fn();},ms);
      run.timers.add(id);
    };
    const animate=(node,frames,options)=>{
      const animation=node.animate(frames,options);run.animations.add(animation);return animation;
    };
    const duration=430,interval=cards.length>4?115:180;
    const status=root.querySelector('#status');if(status)status.textContent='카드를 나누고 있어요';
    cards.forEach((target,index)=>{
      // Read all positions before writing any flying card into the DOM.
      const box=target.getBoundingClientRect(),width=target.offsetWidth||box.width,height=target.offsetHeight||box.height;
      const x=box.left+box.width/2,y=box.top+box.height/2;
      const dx=source.left+source.width/2-x,dy=source.top+source.height/2-y;
      const fan=Number.parseFloat(target.style.getPropertyValue('--fan'))||0;
      later(()=>{
        const flyer=doc.createElement('span');flyer.className='card back flying-card';
        flyer.innerHTML='<span class="back-border"><span class="back-emblem">♠</span></span>';
        Object.assign(flyer.style,{width:width+'px',height:height+'px',left:(x-layerBox.left-width/2)+'px',top:(y-layerBox.top-height/2)+'px'});
        layer.append(flyer);
        try{
          animate(flyer,[
            {transform:`translate(${dx}px,${dy}px) rotate(-12deg) scale(${source.width/width},${source.height/height})`,opacity:1},
            {transform:`translate(${dx*.28}px,${dy*.28-14}px) rotate(${fan+(dx>0?-7:7)}deg) scale(1.04)`,offset:.7,opacity:1},
            {transform:`translate(0,0) rotate(${fan}deg) scale(1)`,opacity:1}
          ],{duration,easing:'cubic-bezier(.2,.65,.25,1)',fill:'both'});
          animate(deck,[{transform:'translateY(-50%) rotate(-7deg)'},{transform:'translateY(calc(-50% - 2px)) rotate(-9deg)'},{transform:'translateY(-50%) rotate(-7deg)'}],{duration:150});
          play();
        }catch{
          cancel();onFinish();return;
        }
        later(()=>{
          flyer.remove();target.classList.remove('dealing');target.removeAttribute('aria-hidden');
          if(!target.classList.contains('back')){
            try{animate(target,[{rotate:'y -85deg',filter:'brightness(.7)'},{rotate:'y 0deg',filter:'brightness(1)'}],{duration:170,easing:'ease-out'});}catch{}
          }
        },duration);
      },index*interval);
    });
    later(()=>{cancel();onFinish();},(cards.length-1)*interval+duration+180);
    return true;
  }
  return {start,cancel,active:()=>!!current};
}
