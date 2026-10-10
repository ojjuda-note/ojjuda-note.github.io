import './matgo-captured-zoom.mjs?v=20261010-hold1';

// Both captured piles are public. Never infer a pair from the hidden deck/hand.
export function heldPairMonths(hand,caps){
  const held=new Map(),taken=new Map();
  for(const c of hand)if(c.m>=1&&c.m<=12)held.set(c.m,(held.get(c.m)||0)+1);
  for(const c of caps.flat())if(c.m>=1&&c.m<=12)taken.set(c.m,(taken.get(c.m)||0)+1);
  return new Set([...held].filter(([month,n])=>n===2&&taken.get(month)===2).map(([month])=>month));
}

// Both modes use the same card size and spacing at every viewport size.
export function floorLayout(width,height,count){
  const W=Math.max(60,width-94),H=Math.max(80,height-16),n=Math.max(12,count);
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
