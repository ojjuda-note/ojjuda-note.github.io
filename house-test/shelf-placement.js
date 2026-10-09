import {FURNITURE,itemSize,itemHeight} from './furniture-catalog.js?v=20261006-vine1';
import {normalizePlacement,canPlaceFurniture} from './model.js?v=20261007-room1';

const plantId='item-shelf-plant',shelfId='item-oak-wall-shelf',EPS=1e-6;
// The pot rests on the board; its hanging leaves keep their own collision checks.
// Offsets follow the approved views, with the right pot clear of desk accessories.
const offsets={left:{x:.02,y:.4},center:{x:.62,y:.02},right:{x:.02,y:.84}};
export function shelfPartner(id,others=[]){
 const partner=id===plantId?shelfId:id===shelfId?plantId:null;
 return partner?others.find(p=>p.id===partner):null;
}
export function isShelfSupported(plant,shelf){
 if(!plant||!shelf)return false;
 const p=itemSize(plantId,plant.direction),s=itemSize(shelfId,shelf.direction);
 return p&&s&&plant.direction===shelf.direction&&plant.x>=shelf.x-EPS&&plant.y>=shelf.y-EPS&&
  plant.x+p.w<=shelf.x+s.w+EPS&&plant.y+p.d<=shelf.y+s.d+EPS&&
  Math.abs(plant.elevation-shelf.elevation-itemHeight(shelfId,shelf))<EPS;
}
export function fitShelfPair(id,others=[],preferred=null){
 const partner=shelfPartner(id,others),offset=offsets[partner?.direction];
 if(!partner||!offset||!FURNITURE[id])return null;
 const plant=id===plantId,elevation=partner.elevation+(plant?1:-1)*itemHeight(shelfId,partner);
 const accept=value=>{
  const p=normalizePlacement(id,value);
  return p&&isShelfSupported(plant?p:partner,plant?partner:p)&&canPlaceFurniture(id,p,others)?p:null;
 };
 // Keep a chosen position on the board when only the contact height needs fixing.
 if(preferred?.direction===partner.direction){const kept=accept({...preferred,elevation});if(kept)return kept;}
 const axis=partner.direction==='center'?'x':'y',span=FURNITURE[shelfId].width-FURNITURE[plantId].width;
 const along=[offset[axis],...Array.from({length:Math.floor(span*10)+1},(_,i)=>i/10),span];
 along.sort((a,b)=>Math.abs(a-offset[axis])-Math.abs(b-offset[axis]));
 for(const value of new Set(along)){
  const delta={...offset,[axis]:value},p=accept({direction:partner.direction,
   x:partner.x+(plant?delta.x:-delta.x),y:partner.y+(plant?delta.y:-delta.y),elevation});
  if(p)return p;
 }
 return null;
}
export function snapShelfContact(id,pose,others=[]){
 const partner=shelfPartner(id,others);
 if(!pose||!partner||pose.direction!==partner.direction)return pose;
 const plant=id===plantId,top=plant?partner.elevation+itemHeight(shelfId,partner):partner.elevation-itemHeight(shelfId,pose);
 // Correct a small contact-height error during placement, never a distant object.
 if(Math.abs(pose.elevation-top)>.18+EPS)return pose;
 const candidate=normalizePlacement(id,{...pose,elevation:top});
 if(!candidate||!isShelfSupported(plant?candidate:partner,plant?partner:candidate))return pose;
 return canPlaceFurniture(id,candidate,others)?candidate:pose;
}
export function plantFollowingShelf(shelf,anchor,others=[]){
 const same=shelf.direction===anchor.shelf.direction,offset=offsets[shelf.direction];
 const preferred=normalizePlacement(plantId,{...anchor.plant,direction:shelf.direction,
  x:shelf.x+(same?anchor.plant.x-anchor.shelf.x:offset.x),
  y:shelf.y+(same?anchor.plant.y-anchor.shelf.y:offset.y),
  elevation:shelf.elevation+itemHeight(shelfId,shelf)});
 return fitShelfPair(plantId,[...others,{id:shelfId,...shelf}],preferred)||(isShelfSupported(preferred,shelf)?preferred:null);
}
