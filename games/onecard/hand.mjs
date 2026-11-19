import {cardInfo} from './engine.mjs?v=20261120-onecard9';

const COLOR_ORDER={blue:0,red:1,yellow:2,green:3,wild:4};
const KIND_ORDER={number:0,attack:1,change:2,skip:3,reverse:4,again:5};

// The saved hand stays in its original order. Equal display values keep that order.
export function sortHand(cards,mode='number'){
  return cards.map((id,index)=>{
    const info=cardInfo(id);
    return {id,index,color:COLOR_ORDER[info.color],kind:info.joker?6:KIND_ORDER[info.displayKind],value:Number.parseInt(info.displayValue,10)||0};
  }).sort((a,b)=>(mode==='color'?a.color-b.color:0)||a.kind-b.kind||a.value-b.value||a.index-b.index).map(card=>card.id);
}

export function handLayout(count,viewportWidth,cardWidth){
  const width=Math.max(0,viewportWidth),card=Math.max(1,cardWidth),gaps=Math.max(0,count-1);
  const minimum=Math.max(32,card*.56),ideal=card*.72;
  const step=Math.min(ideal,Math.max(minimum,(width-card-64)/Math.max(1,gaps)));
  return {width:Math.max(width,64+card+gaps*step),step};
}

// A card outside the scroller can still receive a deal/draw without flying offscreen.
export function visibleHandRect(rect,viewport){
  if(!rect||!viewport)return rect||viewport;
  const width=Math.min(rect.width,viewport.width),height=Math.min(rect.height,viewport.height);
  const left=Math.max(viewport.left,Math.min(rect.left,viewport.right-width));
  const top=Math.max(viewport.top,Math.min(rect.top,viewport.bottom-height));
  return {x:left,y:top,left,top,width,height,right:left+width,bottom:top+height};
}
