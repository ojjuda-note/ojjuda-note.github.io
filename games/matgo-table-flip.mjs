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
const cardId=el=>{const marked=el.matches('[data-id],[data-face]')?el:el.querySelector('[data-id],[data-face]');return marked?.dataset.id??marked?.dataset.face;};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function pose(el){
  const rect=el.getBoundingClientRect(),style=window.getComputedStyle(el);
  const w=parseFloat(style.width)||el.clientWidth||rect.width,h=parseFloat(style.height)||el.clientHeight||rect.height;
  const matrix=style.transform.match(/^matrix\(([^)]+)\)$/)?.[1].split(',').map(Number);
  return {x:rect.left+rect.width/2-w/2,y:rect.top+rect.height/2-h/2,w,h,angle:matrix?Math.atan2(matrix[1],matrix[0])*180/Math.PI:0,style};
}
function copyCard(source,style){
  const copy=source.cloneNode(true);copy.setAttribute('class','vent-card-art');
  for(const el of [copy,...copy.querySelectorAll('*')]){
    for(const name of ['id','data-id','data-face','data-card','tabindex'])el.removeAttribute(name);
  }
  Object.assign(copy.style,{position:'absolute',inset:'0',left:'0',top:'0',width:'100%',height:'100%',margin:'0',padding:'0',transform:'none',visibility:'visible',opacity:'1',animation:'none',transition:'none',background:style.background,border:style.border,borderRadius:style.borderRadius,boxShadow:'none'});
  return copy;
}
function scatter(piece,p,index,rect){
  // Spread cards across the play area, with different paths, spins and return times.
  const vw=window.innerWidth,vh=window.innerHeight,scale=Math.min(3,Math.max(1.45,64/p.w)),pad=Math.hypot(p.w,p.h)*scale*.6+12;
  piece.style.setProperty('--air-scale',scale);
  const left=Math.max(pad,rect.left+pad),right=Math.max(left,Math.min(vw-pad,rect.right-pad));
  const top=Math.min(vh/2,Math.max(pad+20,rect.top-70)),bottom=Math.max(top,Math.min(vh-pad-35,rect.bottom+20));
  const cx=p.x+p.w/2,cy=p.y+p.h/2,dir=index%2?-1:1;
  const x=left+(right-left)*((index*.6180339+.17)%1),y=top+(bottom-top)*((index*.381966+.13)%1);
  const values={
    'fly-x':x-cx,'fly-y':y-cy,
    'drift-x':clamp(x+dir*(35+index%4*18),left,right)-cx,
    'drift-y':clamp(y-55+index%3*40,top,bottom)-cy,
    'gather-x':clamp(x-dir*(35+index%5*13),left,right)-cx,
    'gather-y':clamp(y+50-index%3*25,top,bottom)-cy
  };
  for(const [key,value] of Object.entries(values))piece.style.setProperty('--'+key,value+'px');
  for(const [key,value] of Object.entries({'rest-angle':p.angle,'spin-a':dir*(170+index*29),'spin-b':dir*(410+index*31),'spin-c':dir*(670+index*37),'land-angle':dir*1080+p.angle,'tilt':dir*(22+index%4*8)}))piece.style.setProperty('--'+key,value+'deg');
  piece.style.setProperty('--delay',(index%7*22)+'ms');
}
export function createTableFlipScene(layer,onRearrange,{reduced=false}={}){
  const floor=document.querySelector('#app .floor'),pieces=[],hiddenSources=[];let rearranged=false;
  if(!floor)return {rearrange(){},clear(){}};
  if(!reduced){
    const rect=floor.getBoundingClientRect(),board=floor.cloneNode(true),fragment=document.createDocumentFragment();
    board.classList.add('vent-board-copy');board.querySelectorAll('.fl,.deck').forEach(el=>el.remove());
    board.removeAttribute('id');board.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
    Object.assign(board.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',margin:'0'});
    fragment.appendChild(board);
    function add(source,kind,stackIndex=0){
      const p=pose(source),piece=document.createElement('div'),index=pieces.length;
      if(!p.w||!p.h)return;
      piece.className='vent-flying-card';piece.dataset.kind=kind;
      if(kind==='floor')piece.dataset.card=cardId(source);
      // Small offsets make the returning draw cards visibly stack one after another.
      const offset=kind==='deck'?Math.min(stackIndex,12)*.35:0;
      p.x-=offset;p.y-=offset;
      Object.assign(piece.style,{left:p.x+'px',top:p.y+'px',width:p.w+'px',height:p.h+'px',zIndex:String(10+index)});
      piece.appendChild(copyCard(source,p.style));scatter(piece,p,index,rect);fragment.appendChild(piece);
      pieces.push({el:piece,source,kind,id:cardId(source),x:p.x,y:p.y,index,offset});
    }
    // Each face-up floor card flies separately, including cards in the same pile.
    floor.querySelectorAll('.fl > .stack .c').forEach(card=>add(card,'floor'));
    const deck=floor.querySelector('.deck .back');
    const count=Number(floor.querySelector('.deck > small')?.textContent.replace(/\D/g,'')||0);
    if(deck)for(let i=0;i<Math.min(18,count);i++)add(deck,'deck',i);
    // An empty draw pile and a swept floor can still use already-public captured cards.
    if(!pieces.length){
      [...document.querySelectorAll('#app .cap .c,#app .cap-cards > svg')].slice(0,18).forEach(card=>{
        add(card,'captured');card.classList.add('vent-card-source');hiddenSources.push(card);
      });
    }
    document.body.classList.add('matgo-table-flipping');
    // Resolve destinations before attaching animated cards, so compositor keyframes
    // always contain their final positions and cleanup never causes a visible jump.
    rearrange();layer.appendChild(fragment);
  }
  function rearrange(){
    if(rearranged)return;rearranged=true;onRearrange();
    const cards=[...document.querySelectorAll('#app .floor .fl > .stack .c')];
    const publicCards=[...document.querySelectorAll('#app .cap .c,#app .cap-cards > svg')];
    for(const piece of pieces){
      const target=piece.kind==='deck'?document.querySelector('#app .floor .deck .back'):
        (piece.kind==='floor'?cards:publicCards).find(card=>cardId(card)===piece.id);
      if(!target){piece.el.style.visibility='hidden';continue;}
      const p=pose(target),dir=piece.index%2?-1:1;
      piece.el.style.setProperty('--land-x',(p.x-piece.offset-piece.x)+'px');
      piece.el.style.setProperty('--land-y',(p.y-piece.offset-piece.y)+'px');
      piece.el.style.setProperty('--land-angle',(dir*1080+p.angle)+'deg');
    }
  }
  return {rearrange,clear(){rearrange();hiddenSources.forEach(el=>el.classList.remove('vent-card-source'));document.body.classList.remove('matgo-table-flipping');}};
}
