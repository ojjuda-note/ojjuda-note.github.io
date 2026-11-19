/* One shared browser timeline: cards overlap in flight without per-card network waits. */
export function createCardMotion({layer,createCard,sound,reduced=()=>false}) {
  let generation=0;
  const live=new Set(),timers=new Set();
  function later(fn,delay){const id=setTimeout(()=>{timers.delete(id);fn();},delay);timers.add(id);}
  function cancel(){generation++;for(const item of live){item.animation?.cancel();item.flip?.cancel();item.node.remove();}live.clear();for(const id of timers)clearTimeout(id);timers.clear();}
  async function run(flights){
    const epoch=generation;
    if(!flights.length)return;
    if(reduced()||typeof Element.prototype.animate!=='function'||document.hidden){for(const f of flights)f.onLand?.();return;}
    const start=document.timeline.currentTime+24;
    const completed=[];
    // Read coordinates before this call. This loop only writes compositor transforms.
    for(const flight of flights){
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
      const animation=wrap.animate([
        {transform:a,opacity:1,offset:0},
        {transform:transform(tx(from)+(tx(to)-tx(from))*.52,ty(from)+(ty(to)-ty(from))*.52-22,(turnFrom+turnTo)/2-5,(scaleFrom+scaleTo)/2*1.04),opacity:1,offset:.5},
        {transform:b,opacity:1,offset:1}
      ],{duration,delay,easing:'cubic-bezier(.25,.65,.3,1)',fill:'both'});
      animation.startTime=start;
      const item={animation,node:wrap,flip:null};live.add(item);
      if(flight.sound!==false)later(()=>{if(epoch===generation)sound?.play(flight.sound||'deal');},delay+24);
      // A real front/back flip happens within the same moving element.
      if(faceDown&&flight.reveal&&cardId){
        const front=createCard(cardId,{faceDown:false,interactive:false});front.classList.add('flight-front');
        node.classList.add('flight-back');wrap.append(front);
        front.style.setProperty('--card-w',`${width}px`);front.style.setProperty('--card-h',`${height}px`);
        front.style.cssText+=';position:absolute;inset:0;backface-visibility:hidden;';
        node.style.backfaceVisibility='hidden';
        const flipStart=delay+duration*.45,flipDuration=duration*.55;
        const fa=front.animate([{transform:'rotateY(-180deg)'},{transform:'rotateY(0deg)'}],{duration:flipDuration,delay:flipStart,fill:'both',easing:'ease-out'});
        fa.startTime=start;item.flip=fa;
        const ba=node.animate([{transform:'rotateY(0deg)'},{transform:'rotateY(180deg)'}],{duration:flipDuration,delay:flipStart,fill:'both',easing:'ease-out'});ba.startTime=start;
      }
      completed.push(animation.finished.then(()=>{if(epoch===generation)onLand?.();}).catch(()=>{}).finally(()=>{live.delete(item);wrap.remove();}));
    }
    await Promise.all(completed);
  }
  return {run,cancel,get active(){return live.size>0;}};
}
