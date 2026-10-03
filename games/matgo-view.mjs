// Both captured piles are public. Never infer a pair from the hidden deck/hand.
export function heldPairMonths(hand,caps){
  const held=new Map(),taken=new Map();
  for(const c of hand)if(c.m>=1&&c.m<=12)held.set(c.m,(held.get(c.m)||0)+1);
  for(const c of caps.flat())if(c.m>=1&&c.m<=12)taken.set(c.m,(taken.get(c.m)||0)+1);
  return new Set([...held].filter(([month,n])=>n===2&&taken.get(month)===2).map(([month])=>month));
}
