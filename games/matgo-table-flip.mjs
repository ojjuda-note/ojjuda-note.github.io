// Presentation-only positions. Card identities, pile order and game actions never change.
export function shuffledFloorSlots(current,available,random=Math.random){
  if(!current.length)return [];
  if(current.length===1){const choices=available.filter(slot=>slot!==current[0]);return [choices[Math.floor(random()*choices.length)]??current[0]];}
  const order=current.map((_,i)=>i);
  for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  const next=current.slice();order.forEach((index,i)=>{next[index]=current[order[(i+1)%order.length]];});return next;
}
export function floorStackIds(stack){
  return [...new Set([...stack.querySelectorAll('[data-id],[data-face]')].map(c=>c.dataset.id??c.dataset.face).filter(id=>id!==''))].sort((a,b)=>Number(a)-Number(b));
}
export function createTableFlipScene(layer,onRearrange,{reduced=false}={}){
  const floor=document.querySelector('#app .floor'),pieces=[];let rearranged=false;
  if(!floor)return {rearrange(){},clear(){}};
  if(!reduced){
    const rect=floor.getBoundingClientRect(),style=window.getComputedStyle(floor),board=floor.cloneNode(true);
    board.classList.add('vent-board-copy');board.querySelectorAll('.fl,.deck').forEach(el=>el.remove());
    board.removeAttribute('id');board.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
    Object.assign(board.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',margin:'0'});
    layer.style.setProperty('--cw',style.getPropertyValue('--cw'));layer.style.setProperty('--ch',style.getPropertyValue('--ch'));
    layer.appendChild(board);
    floor.querySelectorAll('.fl > .stack').forEach((stack,i)=>{
      const r=stack.getBoundingClientRect(),piece=document.createElement('div'),copy=stack.cloneNode(true);
      piece.className='vent-loose-stack';piece.dataset.cards=floorStackIds(stack).join(',');
      Object.assign(piece.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
      piece.style.setProperty('--lift-x',((i%3)-1)*42+'px');piece.style.setProperty('--lift-y',-Math.min(130,Math.max(42,r.top-40))+'px');piece.style.setProperty('--tumble',((i%2?-1:1)*(22+i%4*13))+'deg');
      copy.removeAttribute('id');copy.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));copy.style.left='0';copy.style.top='0';
      piece.appendChild(copy);layer.appendChild(piece);pieces.push({el:piece,ids:floorStackIds(stack),x:r.left,y:r.top});
    });
    document.body.classList.add('matgo-table-flipping');
  }
  function rearrange(){
    if(rearranged)return;rearranged=true;onRearrange();
    const stacks=[...document.querySelectorAll('#app .floor .fl > .stack')];
    for(const piece of pieces){
      const target=stacks.find(s=>floorStackIds(s).join(',')===piece.ids.join(','));
      if(!target){piece.el.style.visibility='hidden';continue;}
      const r=target.getBoundingClientRect();piece.el.style.setProperty('--land-x',(r.left-piece.x)+'px');piece.el.style.setProperty('--land-y',(r.top-piece.y)+'px');
    }
  }
  return {rearrange,clear(){rearrange();document.body.classList.remove('matgo-table-flipping');}};
}
