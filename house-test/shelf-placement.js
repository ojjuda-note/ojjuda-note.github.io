import {FURNITURE,itemSize,itemHeight} from './furniture-catalog.js?v=20261006-vine1';
import {normalizePlacement,canPlaceFurniture,canPlaceGroup} from './model.js?v=20261007-room1';

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
// Older rooms can have the desk lamp directly below the hanging leaves. Keep
// the shelf and fixed furniture where they are; preview fitting small desk
// accessories into free spots on the same tabletop, preserving positions first.
export function fitShelfPlantScene(others=[],preferred=null){
 const direct=fitShelfPair(plantId,others,preferred);
 if(direct)return {plant:direct,adjustments:[]};
 const desk=others.find(p=>p.id==='desk');if(!desk||!shelfPartner(plantId,others))return null;
 const deskSize=itemSize('desk',desk.direction,desk),height=(desk.elevation??0)+itemHeight('desk',desk);
 const onDesk=(p,contained=false)=>{const size=itemSize(p.id,p.direction,p);return size&&Math.abs((p.elevation??0)-height)<EPS&&
  (contained?p.x>=desk.x-EPS&&p.y>=desk.y-EPS&&p.x+size.w<=desk.x+deskSize.w+EPS&&p.y+size.d<=desk.y+deskSize.d+EPS:
   p.x<desk.x+deskSize.w-EPS&&p.y<desk.y+deskSize.d-EPS&&p.x+size.w>desk.x+EPS&&p.y+size.d>desk.y+EPS);};
 // A manually placed book may overhang the desk. It still belongs to this
 // tabletop and must not become a fixed obstacle when clearing the lamp.
 const movable=others.filter(p=>['desk-lamp','pencil-cup','open-book','item-desk-frame'].includes(p.id)&&onDesk(p));
 const ids=new Set(movable.map(p=>p.id)),plant=fitShelfPair(plantId,others.filter(p=>!ids.has(p.id)),preferred);
 if(!plant)return null;
 const fixed=[...others.filter(p=>!ids.has(p.id)),{id:plantId,...plant}],options=new Map();
 for(const prop of movable){
  const size=itemSize(prop.id,prop.direction,prop),axis=(low,high,original)=>high<low-EPS?[]:[...new Set([original,Number(high.toFixed(6)),...Array.from({length:Math.floor((high-low+EPS)/.1)+1},(_,i)=>Number((low+i*.1).toFixed(6)))])];
  const candidates=canPlaceFurniture(prop.id,prop,fixed)?[prop]:[];
  for(const x of axis(desk.x,desk.x+deskSize.w-size.w,prop.x))for(const y of axis(desk.y,desk.y+deskSize.d-size.d,prop.y)){
   const p=normalizePlacement(prop.id,{...prop,x,y});if(p&&onDesk({id:prop.id,...p},true)&&canPlaceFurniture(prop.id,p,fixed)&&!candidates.some(c=>c.x===p.x&&c.y===p.y))candidates.push({id:prop.id,...p});
  }
  candidates.sort((a,b)=>(a.x-prop.x)**2+(a.y-prop.y)**2-((b.x-prop.x)**2+(b.y-prop.y)**2)||a.y-b.y||a.x-b.x);
  if(!candidates.length)return null;options.set(prop.id,candidates);
 }
 // Try keeping all non-obstructing props first. If the tabletop is full, fit the
 // remaining small props together rather than moving the shelf off its wall.
 const blocking=movable.filter(p=>!canPlaceFurniture(plantId,plant,[p])),blockingIds=new Set(blocking.map(p=>p.id));
 const solve=(order,chosen)=>{
  let remaining=6000;
  const place=index=>{
   if(index===order.length)return [...chosen];
   const prop=order[index];
   for(const p of options.get(prop.id)){
    if(--remaining<0)return null;
    if(!canPlaceFurniture(prop.id,p,chosen))continue;
    chosen.push(p);const result=place(index+1);chosen.pop();if(result)return result;
   }
   return null;
  };
  return place(0);
 };
 const preserved=movable.filter(p=>!blockingIds.has(p.id));
 const fitted=solve(blocking,[...preserved])||solve([...blocking,...preserved].sort((a,b)=>Number(blockingIds.has(b.id))-Number(blockingIds.has(a.id))||options.get(a.id).length-options.get(b.id).length),[]);
 if(!fitted)return null;
 const adjustments=fitted.filter(p=>{const before=others.find(o=>o.id===p.id);return Math.abs(p.x-before.x)>EPS||Math.abs(p.y-before.y)>EPS;});
 const moved=new Set(adjustments.map(p=>p.id));
 return canPlaceGroup([{id:plantId,...plant},...adjustments],others.filter(p=>!moved.has(p.id)))?{plant,adjustments}:null;
}
