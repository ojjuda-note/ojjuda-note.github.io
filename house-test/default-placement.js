import {FURNITURE,itemSize,SOFA_ACCESSORIES} from './furniture-catalog.js?v=20261006-vine1';
import {FLOOR,normalizePlacement,canPlaceFurniture,findPlacement,defaultShelf} from './model.js?v=20261006-vine1';
import {sofaAccessoryFromSofa} from './sofa-accessory-placement.js?v=20261006-vine1';

// Starting places from references/home-style.png. These are drafts for a newly
// selected item, never a migration or a reason to reset a saved arrangement.
const reference={
  sofa:{direction:'left',x:0,y:2},
  'side-table':{direction:'left',x:0,y:5.5},
  'floor-lamp':{direction:'left',x:0,y:.5},
  'window-plant':{direction:'right',x:7,y:.5},
  desk:{direction:'right',x:9,y:3.5},
  'coffee-table':{direction:'left',x:2,y:4},
  carpet:{direction:'center',x:1,y:3},
  'table-plant':{direction:'left',x:.03,y:5.7,elevation:.9},
  'table-books':{direction:'left',x:2.2,y:4.85,elevation:.6},
  'clover-mug':{direction:'left',x:2.05,y:4.2,elevation:.6},
  'table-succulent':{direction:'left',x:2.8,y:4.05,elevation:.6},
  'desk-lamp':{direction:'right',x:9.05,y:5.55,elevation:1.4},
  'open-book':{direction:'right',x:9.1,y:4.25,elevation:1.4},
  'pencil-cup':{direction:'right',x:9.05,y:3.6,elevation:1.4},
  'botanical-frame':{direction:'left',x:0,y:3,elevation:2.1},
  'item-oak-wall-shelf':{direction:'right',x:9.6,y:3.5,elevation:2.65},
  'item-shelf-plant':{direction:'right',x:9.62,y:3.9,elevation:2.77},
  'item-desk-frame':{direction:'right',x:9.73,y:3.6,elevation:1.4},
};
const sofaItems=new Set(SOFA_ACCESSORIES.map(({id})=>id).concat('blanket-floor'));

export function initialPlacement(id,others=[]){
  if(id==='bookshelf')return defaultShelf();
  if(sofaItems.has(id)){
    const sofa=others.find(p=>p.id==='sofa');
    if(sofa)return sofaAccessoryFromSofa(id,sofa);
  }
  return {...(reference[id]||FURNITURE[id]?.preferred)};
}

export function findInitialPlacement(id,others=[]){
  const preferred=initialPlacement(id,others),start=normalizePlacement(id,preferred);
  if(!start)return null;
  if(canPlaceFurniture(id,start,others))return start;
  // Keep the picture's direction and height when the starting place is busy.
  // Search nearby first, instead of jumping to the back-left corner of a room.
  const item=FURNITURE[id],{w,d}=itemSize(id,start.direction,start);
  const step=(item.wallMounted||item.layer==='surface')?0.1:FLOOR.step;
  const candidates=[],seen=new Set();
  for(let y=-Math.ceil(FLOOR.depth/step);y<=Math.ceil(FLOOR.depth/step);y++){
    for(let x=-Math.ceil(FLOOR.width/step);x<=Math.ceil(FLOOR.width/step);x++){
      if(item.wallMounted&&(start.direction==='center'?y!==0:x!==0))continue;
      const p=normalizePlacement(id,{...start,x:start.x+x*step,y:start.y+y*step});
      if(!p||p.x<0||p.y<0||p.x+w>FLOOR.width+1e-6||p.y+d>FLOOR.depth+1e-6)continue;
      const key=p.x+':'+p.y;if(seen.has(key))continue;seen.add(key);candidates.push(p);
    }
  }
  candidates.sort((a,b)=>(a.x-start.x)**2+(a.y-start.y)**2-((b.x-start.x)**2+(b.y-start.y)**2)||a.y-b.y||a.x-b.x);
  return candidates.find(p=>canPlaceFurniture(id,p,others))||findPlacement(id,others,start);
}
