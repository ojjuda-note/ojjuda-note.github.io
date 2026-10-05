// Animate only the public events returned to this seat; never reconstruct a deck.
const FLIGHT=520, COLLECT=620, LIMIT=3200;
export function createOnlineMotion({cardSVG,backSVG,sound,onEvent}){
  let current=null;
  const $=s=>document.querySelector(s);
  function cancel(){
    const job=current;if(!job)return;
    current=null;job.cancelled=true;
    for(const animation of job.animations)animation.cancel();
    for(const node of job.ghosts)node.remove();
    for(const node of job.hidden)node.style.visibility='';
    job.board.removeAttribute('aria-busy');
  }
  async function play(previous,next,events){
    cancel();
    const board=$('.board');
    if(!board||document.hidden)return;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Reconnecting/large batches must not spend another turn replaying history.
    const moves=events.filter(e=>['played','flip','flipBonus','bonusPlay','take','steal','draw'].includes(e.type));
    if(moves.length>12)return;
    if(Date.parse(next.deadline)-next.serverTime<5000){for(const ev of events)onEvent(ev);return;}
    const job={board,cancelled:false,animations:new Set(),ghosts:new Set(),hidden:new Set()};current=job;
    board.setAttribute('aria-busy','true');
    const scale=Math.min(1,LIMIT/Math.max(1,moves.reduce((n,e)=>n+(e.type==='take'?COLLECT:FLIGHT),0)));
    const mine=p=>p===next.seat;
    const hand=p=>mine(p)?$('#hand'):$('.op-hand');
    const cap=(p,c)=>{
      const group=c.k==='gwang'?0:c.k==='yul'&&!c.asPi?1:c.k==='tti'?2:3;
      return board.querySelectorAll(mine(p)?'.caps-own .cap':'.caps:not(.caps-own) .cap')[group];
    };
    const face=(root,c)=>root?.querySelector(`[data-face="${Number(c.id)}"]`);
    const hide=node=>{if(node){node.style.visibility='hidden';job.hidden.add(node);}};
    function floorStack(ev){
      const floor=$('.floor');
      for(const c of ev.stack||[]){if(c.id===ev.card?.id)continue;const found=face(floor,c)?.closest('.stack');if(found)return found;}
      const stack=document.createElement('button');stack.className='stack';stack.disabled=true;floor.append(stack);return stack;
    }
    function addFloor(stack,c){
      const span=document.createElement('span'),n=Math.min(3,stack.querySelectorAll('svg').length);
      span.style.cssText=`position:absolute;inset:0;transform:translate(${n*3}px,${-n*2}px) rotate(${n*2}deg)`;
      span.innerHTML=cardSVG(c);stack.append(span);
    }
    function removeFace(node){
      if(!node)return;const stack=node.closest('.stack');
      if(stack){node.closest('span')?.remove();if(!stack.querySelector('svg'))stack.remove();}
      else node.remove();
    }
    async function fly(c,from,to,duration=FLIGHT,offset=0){
      if(job.cancelled||!from||!to)return;
      const a=from.getBoundingClientRect(),b=to.getBoundingClientRect();
      if(!a.width||!b.width)return;
      const ghost=document.createElement('div');ghost.className='online-flying-card';ghost.setAttribute('aria-hidden','true');
      ghost.innerHTML=c?cardSVG(c):backSVG;
      const width=Math.min(52,Math.max(32,b.width)),height=width*1.5;
      ghost.style.cssText=`left:${a.x+a.width/2-width/2}px;top:${a.y+a.height/2-height/2}px;width:${width}px;height:${height}px`;
      document.body.append(ghost);job.ghosts.add(ghost);
      const dx=b.x+b.width/2-a.x-a.width/2+offset,dy=b.y+b.height/2-a.y-a.height/2;
      const animation=ghost.animate([
        {transform:'translate(0,0) scale(.9)',opacity:.85},
        {transform:`translate(${dx*.48}px,${dy*.48-24}px) scale(1.08)`,opacity:1,offset:.48},
        {transform:`translate(${dx}px,${dy}px) scale(1)`,opacity:1}
      ],{duration:duration*scale,easing:'ease-in-out',fill:'forwards'});
      job.animations.add(animation);
      try{await animation.finished;}catch{}
      animation.cancel();job.animations.delete(animation);ghost.remove();job.ghosts.delete(ghost);
    }
    try{
      for(const ev of events){
        if(job.cancelled||document.hidden)break;
        if(reduced){onEvent(ev);continue;}
        const c=ev.card;
        if(['played','bonusPlay','flip','flipBonus'].includes(ev.type)&&c){
          const fromHand=ev.type==='played'||ev.type==='bonusPlay';
          const source=fromHand?(mine(ev.p)?$(`#hand [data-card="${Number(c.id)}"]`):$('.op-hand svg:last-child')):$('.deck svg');
          const stack=floorStack(ev);
          const label=$('#turn-label');if(label)label.textContent=fromHand?'패를 내고 있어요':'더미에서 패를 뒤집고 있어요';
          if(fromHand)hide(source);
          await fly(c,source||hand(ev.p),stack);
          if(job.cancelled)break;
          addFloor(stack,c);sound.play('land',{onCards:(ev.stack?.length||0)>1});
          if(fromHand&&source?.closest('.op-hand'))source.remove();
        }else if(ev.type==='take'&&ev.cards?.length){
          const label=$('#turn-label');if(label)label.textContent='맞춘 패를 가져오고 있어요';
          const sources=ev.cards.map(c=>face($('.floor'),c));sources.forEach(hide);
          await Promise.all(ev.cards.map((c,i)=>fly(c,sources[i]||$('.floor'),cap(ev.p,c),COLLECT,(i%3)*3)));
          if(job.cancelled)break;
          sources.forEach(removeFace);
          for(const c of ev.cards)cap(ev.p,c)?.querySelector('.cap-cards').insertAdjacentHTML('beforeend',cardSVG(c));
          sound.play('take');
        }else if(ev.type==='steal'&&c){
          const source=face(cap(ev.from,c),c);hide(source);
          await fly(c,source||cap(ev.from,c),cap(ev.to,c));
          if(job.cancelled)break;
          removeFace(source);cap(ev.to,c)?.querySelector('.cap-cards').insertAdjacentHTML('beforeend',cardSVG(c));sound.play('steal');
        }else if(ev.type==='draw'){
          // Opponent bonus replacements deliberately contain no card in the RPC.
          await fly(mine(ev.p)?c:null,$('.deck svg'),hand(ev.p));
          if(job.cancelled)break;
        }
        onEvent(ev);
      }
    }finally{if(current===job)cancel();}
  }
  return {play,cancel};
}
