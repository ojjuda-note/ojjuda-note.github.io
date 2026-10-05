import {madePoseValid} from './custom-furniture.js?v=20261005-sofaarm2';
import {sideTablePoseValid} from './side-table-art.js?v=20261005-sofaarm2';
import {sofaPoseValid} from './sofa-art.js?v=20261005-sofaarm2';
import {FURNITURE,itemSize,itemLayer,itemHeight,SOFA_ACCESSORIES} from './furniture-catalog.js?v=20261005-sofaarm2';
import {sofaAccessoryFromSofa,isBlanket,blanketMode,blanketSpec} from './sofa-accessory-placement.js?v=20261005-sofaarm2';
import {sofaAccessoryPoseValid} from './sofa-accessory-art.js?v=20261005-sofaarm2';
export const roomKey=r=>`${r.x}:${r.y}`;
export const validCell=r=>r&&Number.isInteger(r.x)&&Number.isInteger(r.y)&&Math.abs(r.x)<=2&&Math.abs(r.y)<=3;
export const neighbors=r=>[{x:r.x-1,y:r.y},{x:r.x+1,y:r.y},{x:r.x,y:r.y-1},{x:r.x,y:r.y+1}];
export function canAdd(rooms,cell){return validCell(cell)&&rooms.length<35&&!rooms.some(r=>roomKey(r)===roomKey(cell))&&neighbors(cell).some(n=>rooms.some(r=>roomKey(r)===roomKey(n)));}
export const defaultShelf=()=>({x:FLOOR.width-1,y:1.5,direction:'right'});
function migrateShelf(s,version){
 if(!s||version>=3)return normalizeShelf(s);
 const size=itemSize('bookshelf',s.direction);if(!size||!Number.isFinite(s.x))return null;
 // Preserve wall attachment, shift free-standing old placements to the center
 // of the wider room, and migrate only once when the v3 save is written.
 return normalizeShelf({...s,x:s.x===0?0:s.x===8-size.w?FLOOR.width-size.w:s.x+1});
}
export function furniturePlacements(room){
 return [...(room.shelf?[{id:'bookshelf',...room.shelf}]:[]),...Object.entries(room.furniture||{}).filter(([id,p])=>id!=='bookshelf'&&FURNITURE[id]&&p).map(([id,p])=>({id,...p}))];
}
export function findPlacement(id,others=[],preferred=FURNITURE[id]?.preferred){
 const candidate=normalizePlacement(id,preferred);if(candidate&&canPlaceFurniture(id,candidate,others))return candidate;
 if(FURNITURE[id]?.wallMounted){
  for(const direction of FURNITURE[id].directions){const {w,d}=itemSize(id,direction),limit=direction==='center'?FLOOR.width-w:FLOOR.depth-d;
   for(let n=0;n<=Math.ceil(limit*10);n++){const along=Math.min(limit,n/10),s=normalizePlacement(id,{direction,x:direction==='center'?along:0,y:direction==='center'?0:along,elevation:candidate?.elevation??preferred?.elevation??2.1});if(canPlaceFurniture(id,s,others))return s;}
  }
  return null;
 }
 for(const direction of FURNITURE[id]?.directions||[]){const {w,d}=itemSize(id,direction,candidate||preferred);
  for(let y=0;y<=FLOOR.depth-d;y+=FLOOR.step)for(let x=0;x<=FLOOR.width-w;x+=FLOOR.step){
   const s={direction,x,y,...(isBlanket(id)?{mode:blanketMode(id,candidate||preferred),elevation:candidate?.elevation??0}:itemLayer(id,candidate||preferred)==='surface'?{elevation:candidate?.elevation??preferred?.elevation??0}:{})};
   if(canPlaceFurniture(id,s,others))return normalizePlacement(id,s);
  }
 }
 return null;
}
// Explicit floor placement reserves a clear spot, including against standing
// furniture, while carpets and flat blankets remain usable underneath it.
export function canUseFloor(id){return !!FURNITURE[id]&&!FURNITURE[id].wallMounted&&FURNITURE[id].layer==='surface';}
export function findFloorPlacement(id,others=[],preferred=FURNITURE[id]?.preferred){
 if(!canUseFloor(id)||!preferred)return null;
 const floor=normalizePlacement(id,{...preferred,elevation:0,mode:'floor'});
 if(!floor)return null;
 if(canPlaceFurniture(id,floor,others))return floor;
 const {w,d}=itemSize(id,floor.direction,floor),candidates=[];
 for(let y=0;y<=FLOOR.depth-d;y+=FLOOR.step)for(let x=0;x<=FLOOR.width-w;x+=FLOOR.step)candidates.push({...floor,x,y});
 candidates.sort((a,b)=>(a.x-floor.x)**2+(a.y-floor.y)**2-((b.x-floor.x)**2+(b.y-floor.y)**2));
 return candidates.find(p=>canPlaceFurniture(id,p,others))||null;
}
const canonical=value=>Number(value.toFixed(6));
// Chair poses are derived from the desk's open knee space, not its full width.
// Only the parent snaps to the grid; these offsets reserve exactly half a cell
// beneath the desktop while preserving the approved 1.2-cell chair footprint.
export function chairForDesk(desk){
 if(!desk||!Number.isFinite(desk.x)||!Number.isFinite(desk.y))return null;
 const poses={
  right:{direction:'left',x:desk.x-.7,y:desk.y+1.325},
  left:{direction:'right',x:desk.x+.5,y:desk.y+.535},
  center:{direction:'center',x:desk.x+1.265,y:desk.y+.5}
 };
 const pose=poses[desk.direction];
 return pose?{...pose,x:canonical(pose.x),y:canonical(pose.y),attachedTo:'desk'}:null;
}
export function isDeskChairPair(desk,chair){
 const expected=chairForDesk(desk);
 return !!expected&&chair?.attachedTo==='desk'&&chair.direction===expected.direction&&chair.x===expected.x&&chair.y===expected.y;
}
export function canPlaceGroup(placements,others=[]){
 if(!Array.isArray(placements)||!placements.length||!Array.isArray(others))return false;
 const ids=placements.map(p=>p?.id);
 if(ids.some(id=>!FURNITURE[id])||new Set(ids).size!==ids.length||others.some(p=>ids.includes(p?.id)))return false;
 return placements.every((p,index)=>canPlaceFurniture(p.id,p,[...others,...placements.filter((_,i)=>i!==index)]));
}
export function findDeskChairPlacement(others=[],preferredDesk=FURNITURE.desk.preferred){
 const preferred=normalizePlacement('desk',preferredDesk);if(!preferred)return null;
 const attempt=desk=>{const chair=chairForDesk(desk);return chair&&canPlaceGroup([{id:'desk',...desk},{id:'chair',...chair}],others)?{desk,chair}:null;};
 const first=attempt(preferred);if(first)return first;
 const {w,d}=itemSize('desk',preferred.direction),candidates=[];
 for(let y=0;y<=FLOOR.depth-d;y+=FLOOR.step)for(let x=0;x<=FLOOR.width-w;x+=FLOOR.step){
  if(x===preferred.x&&y===preferred.y)continue;
  candidates.push({direction:preferred.direction,x,y});
 }
 candidates.sort((a,b)=>(a.x-preferred.x)**2+(a.y-preferred.y)**2-((b.x-preferred.x)**2+(b.y-preferred.y)**2)||a.y-b.y||a.x-b.x);
 for(const desk of candidates){const pair=attempt(desk);if(pair)return pair;}
 return null;
}
function roomFurniture(raw,shelf,version,addNew){
 const result={},others=shelf?[{id:'bookshelf',...shelf}]:[];
 const ids=Object.keys(FURNITURE).filter(id=>id!=='bookshelf').sort((a,b)=>Number(b==='desk')-Number(a==='desk')||FURNITURE[a].introduced-FURNITURE[b].introduced);
 if(raw&&typeof raw==='object'&&!Array.isArray(raw))for(const id of ids){
  // These IDs were reused for new artwork after the old models were retired.
  // Their pre-v8 poses must not restore the replacement furniture.
  if(version<8&&(id==='desk'||id==='side-table'||id==='chair'))continue;
  // Only an existing, explicitly linked child is restored. Its saved offset
  // cannot override the approved relationship to the restored parent desk.
  const saved=id==='chair'&&raw[id]?.attachedTo==='desk'?chairForDesk(result.desk):raw[id];
  const placed=normalizePlacement(id,saved);
  if(placed&&canPlaceFurniture(id,placed,others)){result[id]=placed;others.push({id,...placed});}
 }
 // Cushions split in v12; the attached blanket splits in v13.
 // Copy only its enabled drawings to independent world poses once. Their
 // fractional offsets and original elevations retain the existing appearance;
 // subsequent sofa movement/removal no longer changes these saved placements.
 if(version<13&&result.sofa&&raw?.sofa)for(const {id}of SOFA_ACCESSORIES){
  if(version>=(isBlanket(id)?13:12))continue;
  if(Object.hasOwn(raw,id)||raw.sofa.accessories?.[id]===false)continue;
  const placed=normalizePlacement(id,sofaAccessoryFromSofa(id,result.sofa));
  if(placed&&canPlaceFurniture(id,placed,others)){result[id]=placed;others.push({id,...placed});}
 }
 if(addNew)for(const id of ids)if(!result[id]&&FURNITURE[id].autoPlace!==false&&FURNITURE[id].introduced>version){
  const placed=findPlacement(id,others,FURNITURE[id].preferred);if(placed){result[id]=placed;others.push({id,...placed});}
 }
 return result;
}
export function normalize(data){
 const initialShelf=defaultShelf(),rooms=[{x:0,y:0,decor:true,curtains:true,shelf:initialShelf,furniture:roomFurniture(null,initialShelf,0,true)}],pending=new Map();
 if(Array.isArray(data?.rooms))for(const r of data.rooms.slice(0,100))if(validCell(r)){
  const shelf=data.version>=2?migrateShelf(r.shelf,data.version):(!r.x&&!r.y?defaultShelf():null);
  pending.set(roomKey(r),{x:r.x,y:r.y,decor:r.decor===true,curtains:r.curtains!==false,shelf,furniture:roomFurniture(r.furniture,shelf,Number(data.version)||0,!r.x&&!r.y)});
 }
 if(pending.has('0:0'))rooms[0]=pending.get('0:0');pending.delete('0:0');
 let progress=true;while(progress&&rooms.length<35){progress=false;for(const [key,r]of pending)if(canAdd(rooms,r)){rooms.push(r);pending.delete(key);progress=true;}}
 return {version:13,rooms,diary:typeof data?.diary==='string'?data.diary.slice(0,4000):''};
}

export const ROOM={width:1507,height:1044,top:27,bottom:916,clip:'inset(27px 12px 128px 12px)',assetVersion:3,wallHeight:4.5};
export const FLOOR={width:10,depth:7,step:.5};
export const shelfSize=direction=>itemSize('bookshelf',direction);
export function normalizeAccessories(value){return Object.fromEntries(SOFA_ACCESSORIES.map(({id})=>[id,value?.[id]!==false]));}
export function normalizePlacement(id,s){
 if(!s||!Number.isFinite(s.x)||!Number.isFinite(s.y))return null;
 if(isBlanket(id)&&s.mode!==undefined&&!['floor','sofa'].includes(s.mode))return null;
 const size=itemSize(id,s.direction,s);if(!size)return null;const {w,d}=size;
 if(w>FLOOR.width||d>FLOOR.depth)return null;
 if(FURNITURE[id].wallMounted){
  const snap=value=>Math.round(value*10)/10,elevation=Number.isFinite(s.elevation)?s.elevation:FURNITURE[id].preferred.elevation;
  return {direction:s.direction,x:canonical(s.direction==='left'?0:s.direction==='right'?FLOOR.width-w:Math.max(0,Math.min(FLOOR.width-w,snap(s.x)))),
   y:canonical(s.direction==='center'?0:Math.max(0,Math.min(FLOOR.depth-d,snap(s.y)))),elevation:canonical(Math.max(0,Math.min(ROOM.wallHeight-itemHeight(id,s),elevation)))};
 }
 if(id==='chair'&&s.attachedTo!==undefined){
  if(s.attachedTo!=='desk')return null;
  const x=canonical(s.x),y=canonical(s.y);
  if(x<0||y<0||x+w>FLOOR.width||y+d>FLOOR.depth)return null;
  return {direction:s.direction,x,y,attachedTo:'desk'};
 }
 if(itemLayer(id,s)==='surface'||isBlanket(id)){
  const mode=isBlanket(id)?blanketMode(id,s):canUseFloor(id)&&s.mode==='floor'&&(s.elevation??0)===0?'floor':null;
  const elevation=mode==='floor'?0:Number.isFinite(s.elevation)?s.elevation:mode==='sofa'?blanketSpec('sofa').baseElevation:0;
  return {direction:s.direction,x:canonical(Math.max(0,Math.min(FLOOR.width-w,s.x))),y:canonical(Math.max(0,Math.min(FLOOR.depth-d,s.y))),
   elevation:canonical(Math.max(0,Math.min(ROOM.wallHeight-itemHeight(id,s),elevation))),...(mode?{mode}:{})};
 }
 const snap=value=>Math.round(value/FLOOR.step)*FLOOR.step;
 return {direction:s.direction,x:Math.max(0,Math.min(FLOOR.width-w,snap(s.x))),y:Math.max(0,Math.min(FLOOR.depth-d,snap(s.y)))};
}
export const normalizeShelf=s=>normalizePlacement('bookshelf',s);
export function canDrawFurniture(id,s){return !!s&&(FURNITURE[id]?.picture!=='made'||madePoseValid(id,s))&&(id!=='sofa'||sofaPoseValid(s,FURNITURE.sofa))&&(id!=='side-table'||sideTablePoseValid(s))&&(!['sofa-accessory','blanket'].includes(FURNITURE[id]?.picture)||sofaAccessoryPoseValid(id,s));}
export function canPlaceFurniture(id,s,others=[]){
 const placed=normalizePlacement(id,s);if(!placed||placed.x!==s.x||placed.y!==s.y||!canDrawFurniture(id,placed))return false;
 const layer=itemLayer(id,placed),elevation=s.elevation??(isBlanket(id)&&blanketMode(id,s)==='sofa'?blanketSpec('sofa').baseElevation:0);
 if((layer==='surface'||isBlanket(id))&&(!Number.isFinite(elevation)||Math.abs(elevation-placed.elevation)>1e-6))return false;
 // Reserve the rear window and curtains, leaving the two wall strips usable.
 if(FURNITURE[id].wallMounted&&s.direction==='center'&&s.x<8.7&&s.x+itemSize(id,s.direction,s).w>1.3)return false;
 if(id==='chair'&&placed.attachedTo==='desk'&&!others.some(other=>other.id==='desk'&&isDeskChairPair(other,placed)))return false;
 if(id==='desk'&&others.some(other=>other.id==='chair'&&other.attachedTo==='desk'&&!isDeskChairPair(placed,other)))return false;
 const size=itemSize(id,s.direction,placed);
 return others.every(other=>{const otherSize=itemSize(other.id,other.direction,other);if(!otherSize)return false;
  const separate=s.x+size.w<=other.x||other.x+otherSize.w<=s.x||s.y+size.d<=other.y||other.y+otherSize.d<=s.y;
  if(FURNITURE[id].wallMounted||FURNITURE[other.id].wallMounted){const low=placed.elevation??0,otherLow=other.elevation??0;return separate||low+itemHeight(id,placed)<=otherLow+1e-8||otherLow+itemHeight(other.id,other)<=low+1e-8;}
  if((canUseFloor(id)&&placed.mode==='floor')||(canUseFloor(other.id)&&other.mode==='floor')){
   if(layer==='floor'||itemLayer(other.id,other)==='floor')return true;
   const low=placed.elevation??0,otherLow=other.elevation??0;
   return separate||low+itemHeight(id,placed)<=otherLow+1e-8||otherLow+itemHeight(other.id,other)<=low+1e-8;
  }
  return (id==='desk'&&other.id==='chair'&&isDeskChairPair(placed,other))||(id==='chair'&&other.id==='desk'&&isDeskChairPair(other,placed))||layer!==itemLayer(other.id,other)||(layer==='surface'&&FURNITURE[id].allowOverlap===true&&FURNITURE[other.id].allowOverlap===true)||separate;
 });
}
// Calibrated to the inside corners where the skirting meets the floor.
// The 10 × 7 grid stops where the side walls meet the front floor corners.
// Any decorative apron in the source image is outside the playable room clip.
export const FLOOR_CORNERS=[{x:293,y:614},{x:1209,y:614},{x:1494,y:910},{x:12,y:910}];
export const CEILING_CORNERS=[{x:293,y:200},{x:1209,y:200},{x:1494,y:55},{x:12,y:55}];
const [p0,p1,p2,p3]=FLOOR_CORNERS;
const dx1=p1.x-p2.x,dx2=p3.x-p2.x,dx3=p0.x-p1.x+p2.x-p3.x;
const dy1=p1.y-p2.y,dy2=p3.y-p2.y,dy3=p0.y-p1.y+p2.y-p3.y;
const determinant=dx1*dy2-dx2*dy1;
const G=(dx3*dy2-dx2*dy3)/determinant,H=(dx1*dy3-dx3*dy1)/determinant;
const A=p1.x-p0.x+G*p1.x,B=p3.x-p0.x+H*p3.x,C=p0.x;
const D=p1.y-p0.y+G*p1.y,E=p3.y-p0.y+H*p3.y,F=p0.y;
export function floorPoint(x,y){
 const u=x/FLOOR.width,v=y/FLOOR.depth,w=G*u+H*v+1;
 return {x:(A*u+B*v+C)/w,y:(D*u+E*v+F)/w};
}
// The illustrated room's ceiling is independently calibrated; extrapolating
// only from its floor makes furniture tops slope away from the painted walls.
export function ceilingPoint(x,y){
 const u=x/FLOOR.width,v=y/FLOOR.depth,w=G*u+H*v+1;
 const [a,b,,d]=CEILING_CORNERS;
 return {x:((b.x-a.x+G*b.x)*u+(d.x-a.x+H*d.x)*v+a.x)/w,y:((b.y-a.y+G*b.y)*u+(d.y-a.y+H*d.y)*v+a.y)/w};
}
// All floor contacts, upright edges, wall guides and tops share this calibrated
// volume. A height is a fraction of the same floor-to-ceiling vertical at x,y.
export function roomPoint(x,y,z=0){
 const floor=floorPoint(x,y),ceiling=ceilingPoint(x,y),t=z/ROOM.wallHeight;
 return {x:floor.x+(ceiling.x-floor.x)*t,y:floor.y+(ceiling.y-floor.y)*t};
}
// Solve a picture drag in its own wall plane using the renderer's projection.
export function wallDragPlacement(id,p,dx,dy){
 if(!FURNITURE[id]?.wallMounted)return normalizePlacement(id,p);
 const item=FURNITURE[id],center=p.direction==='center',fixed=center?item.depth:p.direction==='left'?item.depth:FLOOR.width-item.depth;
 const project=(along,z)=>center?roomPoint(along,fixed,z):roomPoint(fixed,along,z);
 let along=(center?p.x:p.y)+item.width/2,z=p.elevation+item.height/2;
 const start=project(along,z),target={x:start.x+dx,y:start.y+dy};
 for(let i=0;i<10;i++){
  const q=project(along,z),qa=project(along+.0001,z),qz=project(along,z+.0001),a=(qa.x-q.x)/.0001,b=(qz.x-q.x)/.0001,c=(qa.y-q.y)/.0001,d=(qz.y-q.y)/.0001,det=a*d-b*c;
  if(!Number.isFinite(det)||Math.abs(det)<1e-8)return normalizePlacement(id,p);
  const ex=target.x-q.x,ey=target.y-q.y;along+=(ex*d-b*ey)/det;z+=(a*ey-ex*c)/det;
 }
 return normalizePlacement(id,{...p,[center?'x':'y']:along-item.width/2,elevation:z-item.height/2});
}
export function floorCell(x,y){
 const a=A-x*G,b=B-x*H,c=x-C,d=D-y*G,e=E-y*H,f=y-F,det=a*e-b*d;
 if(!Number.isFinite(det)||Math.abs(det)<1e-8)return {x:4,y:0};
 return {x:FLOOR.width*(c*e-b*f)/det,y:FLOOR.depth*(a*f-c*d)/det};
}
const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',hourCycle:'h23'});
export function roomPeriod(date=new Date()){
 const hour=Number(clock.format(date));
 return hour>=8&&hour<18?'day':hour>=6&&hour<8||hour>=18&&hour<20?'dusk':'night';
}
