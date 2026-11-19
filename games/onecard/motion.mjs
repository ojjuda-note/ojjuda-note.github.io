/* One shared browser timeline: cards overlap in flight without per-card network waits. */
export function createCardMotion({layer,createCard,sound,reduced=()=>false}) {
  let generation=0;
  const live=new Set(),timers=new Set();
  function later(fn,delay){const id=setTimeout(()=>{timers.delete(id);fn();},delay);timers.add(id);return id;}
  function cancel(){generation++;for(const item of [...live])item.finish(false);for(const id of timers)clearTimeout(id);timers.clear();}
  async function run(flights){
    const epoch=generation;
    if(!flights.length)return;
    if(reduced()||typeof Element.prototype.animate!=='function'||document.hidden){for(const f of flights)f.onLand?.();return;}
    const start=(document.timeline?.currentTime??performance.now())+24;
    const completed=[],items=[];
    // Read coordinates before this call. This loop only writes compositor transforms.
    try{for(const flight of flights){
      const {from,to,cardId,faceDown=true,onLand}=flight;
      if(!from||!to){onLand?.();continue;}
      const delay=flight.delay||0,duration=flight.duration||380;
      const wrap=document.createElement('div');wrap.className='flying-card';
      const node=createCard(cardId,{faceDown,interactive:false});node.classList.add('flight-face');wrap.append(node);
      const width=78,height=112;
      wrap.style.cssText=`position:fixed;left:0;top:0;width:${width}px;height:${height}px;pointer-events:none;will-change:transform,opacity;`;
      node.style.setProperty('--card-w',`${width}px`);node.style.setProperty('--card-h',`${height}px`);
      const tx=r=>r.left+r.width/2-width/2,ty=r=>r.top+r.height/2-height/2;
      const scaleFrom=flight.fromScale||from.width/width,scaleTo=flight.toScale||to.width/width;
      const turnFrom=flight.fromAngle||0,turnTo=flight.toAngle||0;
      const transform=(x,y,r,s)=>`translate3d(${x}px,${y}px,0) rotate(${r}deg) scale(${s})`;
      const a=transform(tx(from),ty(from),turnFrom,scaleFrom),b=transform(tx(to),ty(to),turnTo,scaleTo);
      wrap.style.transform=a;wrap.style.opacity='0';layer.append(wrap);
      let resolve,settled=false;
      completed.push(new Promise(done=>{resolve=done;}));
      const item={node:wrap,animations:[],timer:null,finish(land){
        if(settled)return;settled=true;
        try{if(land&&epoch===generation)onLand?.();}finally{
          if(item.timer!==null){clearTimeout(item.timer);timers.delete(item.timer);}
          for(const animation of item.animations){try{animation.cancel();}catch{}}
          live.delete(item);wrap.remove();resolve();
        }
      }};
      live.add(item);items.push(item);
      const track=animation=>{item.animations.push(animation);animation.finished.catch(()=>{});animation.startTime=start;return animation;};
      const animation=track(wrap.animate([
        {transform:a,opacity:1,offset:0},
        {transform:transform(tx(from)+(tx(to)-tx(from))*.52,ty(from)+(ty(to)-ty(from))*.52-22,(turnFrom+turnTo)/2-5,(scaleFrom+scaleTo)/2*1.04),opacity:1,offset:.5},
        {transform:b,opacity:1,offset:1}
      ],{duration,delay,easing:'cubic-bezier(.25,.65,.3,1)',fill:'both'}));
      animation.finished.then(()=>item.finish(true),()=>item.finish(false)).catch(()=>{});
      if(flight.sound!==false)item.timer=later(()=>{if(epoch===generation)sound?.play(flight.sound||'deal');},delay+24);
      // A real front/back flip happens within the same moving element.
      if(faceDown&&flight.reveal&&cardId){
        const front=createCard(cardId,{faceDown:false,interactive:false});front.classList.add('flight-front');
        node.classList.add('flight-back');wrap.append(front);
        front.style.setProperty('--card-w',`${width}px`);front.style.setProperty('--card-h',`${height}px`);
        front.style.cssText+=';position:absolute;inset:0;backface-visibility:hidden;';
        node.style.backfaceVisibility='hidden';
        const flipStart=delay+duration*.45,flipDuration=duration*.55;
        track(front.animate([{transform:'rotateY(-180deg)'},{transform:'rotateY(0deg)'}],{duration:flipDuration,delay:flipStart,fill:'both',easing:'ease-out'}));
        track(node.animate([{transform:'rotateY(0deg)'},{transform:'rotateY(180deg)'}],{duration:flipDuration,delay:flipStart,fill:'both',easing:'ease-out'}));
      }
    }}catch(error){for(const item of items)item.finish(false);throw error;}
    await Promise.all(completed);
  }
  return {run,cancel,get active(){return live.size>0;}};
}
