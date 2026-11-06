import {getPile,validSequence} from './engine.js?v=5';
export const HOLD_DELAY=500;
export function gestureSource(state,touched,grouped=false){
  const pile=getPile(state,touched);
  if(!pile?.length)return null;
  const top=pile.length-1;
  if(touched.type!=='tableau'||!grouped)return {...touched,index:top};
  let index=touched.index;
  // Holding the top card lifts its connected run. Holding an exposed middle
  // card lets the player choose a smaller, still valid run.
  if(index===top){while(index>0&&validSequence(pile.slice(index-1)))index--;}
  return validSequence(pile.slice(index))?{...touched,index}:null;
}
