import './matgo-captured-zoom.mjs?v=20261010-hold1';

// Keep required go/stop choices over the felt, clear of both players' cards.
export function positionGoStopPrompt(element) {
  const doc=element.ownerDocument,win=doc.defaultView;
  const floor=doc.querySelector('#app .floor'),card=element.firstElementChild;
  element.classList.add('go-stop-prompt');
  element.setAttribute('role','dialog');element.setAttribute('aria-modal','true');
  element.setAttribute('aria-labelledby','go-stop-title');
  let resizeObserver,removalObserver;
  const cleanup=()=>{
    resizeObserver?.disconnect();removalObserver?.disconnect();
    win.removeEventListener('resize',sync);doc.removeEventListener('scroll',sync,true);
    win.visualViewport?.removeEventListener('resize',sync);
  };
  const sync=()=>{
    if(!element.isConnected){cleanup();return;}
    const bounds=floor?.getBoundingClientRect(),height=win.visualViewport?.height||win.innerHeight;
    const half=(card?.getBoundingClientRect().height||80)/2;
    const middle=bounds?.height?bounds.top+bounds.height/2:height/2;
    element.style.setProperty('--go-stop-y',Math.max(half+8,Math.min(height-half-8,middle))+'px');
  };
  if(win.ResizeObserver){resizeObserver=new win.ResizeObserver(sync);if(floor)resizeObserver.observe(floor);if(card)resizeObserver.observe(card);}
  removalObserver=new win.MutationObserver(()=>{if(!element.isConnected)cleanup();});
  removalObserver.observe(doc.body,{childList:true});
  win.addEventListener('resize',sync);doc.addEventListener('scroll',sync,true);
  win.visualViewport?.addEventListener('resize',sync);
  sync();return cleanup;
}

// This describes a claim, not a completed transfer. The steal event shows the
// actual card/value, including a whole double/triple pi used to pay one pi.
export function piClaimMessage({p,count=1,availablePi},viewer){
  const mine=p===viewer,owner=mine?'상대':'내';
  if(availablePi===0)return `${owner} 쪽에 가져올 피가 없어요`;
  if(Number.isFinite(availablePi)&&availablePi<count)return `${owner} 피가 부족해 남은 ${availablePi}피만 ${mine?'가져와요':'내줘요'}`;
  return `${owner} 피 ${count}장 ${mine?'가져오기':'내주기'}`;
}

// Both captured piles are public. Never infer a pair from the hidden deck/hand.
export function heldPairMonths(hand,caps){
  const held=new Map(),taken=new Map();
  for(const c of hand)if(c.m>=1&&c.m<=12)held.set(c.m,(held.get(c.m)||0)+1);
  for(const c of caps.flat())if(c.m>=1&&c.m<=12)taken.set(c.m,(taken.get(c.m)||0)+1);
  return new Set([...held].filter(([month,n])=>n===2&&taken.get(month)===2).map(([month])=>month));
}

// Both modes use the same card size and spacing at every viewport size.
export function floorLayout(width,height,count){
  const W=Math.max(60,width-108),H=Math.max(80,height-16),n=Math.max(12,count);
  let best=null;
  for(let cols=3;cols<=6;cols++){
    const rows=Math.max(2,Math.ceil(n/cols));if(rows>6)continue;
    let cw=52;
    for(;cw>19;cw--){
      if(cols*(cw+7*(cw/52)*3+14)<=W&&rows*(cw*1.5+4*(cw/52)*3+14)<=H)break;
    }
    if(!best||cw>best.cw||(cw===best.cw&&rows<best.rows))best={cols,rows,cw};
  }
  const {cols,rows,cw}=best,ch=Math.round(cw*1.5);
  const order=Array.from({length:cols*rows},(_,i)=>({i,d:Math.abs(i%cols-(cols-1)/2)+Math.abs(Math.floor(i/cols)-(rows-1)/2)*1.3})).sort((a,b)=>a.d-b.d).map(x=>x.i);
  return {...best,ch,order,position(slot){return {x:12+(slot%cols)*W/cols+(W/cols-cw-21*cw/52)/2,y:8+Math.floor(slot/cols)*H/rows+(H/rows-ch+12*cw/52)/2};}};
}
