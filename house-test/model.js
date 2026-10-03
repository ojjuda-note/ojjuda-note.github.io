import {madePoseValid} from './custom-furniture.js?v=20261003-carpet1';
import {sideTablePoseValid} from './side-table-art.js?v=20261003-carpet1';
import {sofaPoseValid} from './sofa-art.js?v=20261003-carpet1';
import {FURNITURE,itemSize,SOFA_ACCESSORIES} from './furniture-catalog.js?v=20261003-carpet1';
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
 for(const direction of FURNITURE[id]?.directions||[]){const {w,d}=itemSize(id,direction);
  for(let y=0;y<=FLOOR.depth-d;y+=FLOOR.step)for(let x=0;x<=FLOOR.width-w;x+=FLOOR.step){const s={direction,x,y};if(canPlaceFurniture(id,s,others))return normalizePlacement(id,s);}
 }
 return null;
}
function roomFurniture(raw,shelf,version,addNew){
 const result={},others=shelf?[{id:'bookshelf',...shelf}]:[];
 const ids=Object.keys(FURNITURE).filter(id=>id!=='bookshelf').sort((a,b)=>FURNITURE[a].introduced-FURNITURE[b].introduced);
 if(raw&&typeof raw==='object'&&!Array.isArray(raw))for(const id of ids){
  // These IDs were reused for new artwork after the old models were retired.
  // Their pre-v8 poses must not restore the replacement furniture.
  if(version<8&&(id==='desk'||id==='side-table'))continue;
  const placed=normalizePlacement(id,raw[id]);
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
 return {version:11,rooms,diary:typeof data?.diary==='string'?data.diary.slice(0,4000):''};
}

export const ROOM={width:1507,height:1044,top:27,bottom:916,clip:'inset(27px 12px 128px 12px)',assetVersion:3,wallHeight:4.5};
export const FLOOR={width:10,depth:7,step:.5};
export const shelfSize=direction=>itemSize('bookshelf',direction);
export function normalizeAccessories(value){return Object.fromEntries(SOFA_ACCESSORIES.map(({id})=>[id,value?.[id]!==false]));}
export function normalizePlacement(id,s){
 if(!s||!Number.isFinite(s.x)||!Number.isFinite(s.y))return null;
 const size=itemSize(id,s.direction);if(!size)return null;const {w,d}=size;
 if(w>FLOOR.width||d>FLOOR.depth)return null;
 const snap=value=>Math.round(value/FLOOR.step)*FLOOR.step;
 return {direction:s.direction,x:Math.max(0,Math.min(FLOOR.width-w,snap(s.x))),y:Math.max(0,Math.min(FLOOR.depth-d,snap(s.y))),...(id==='sofa'?{accessories:normalizeAccessories(s.accessories)}:{})};
}
export const normalizeShelf=s=>normalizePlacement('bookshelf',s);
export function canDrawFurniture(id,s){return !!s&&(FURNITURE[id]?.picture!=='made'||madePoseValid(id,s))&&(id!=='sofa'||sofaPoseValid(s,FURNITURE.sofa))&&(id!=='side-table'||sideTablePoseValid(s));}
export function canPlaceFurniture(id,s,others=[]){
 const placed=normalizePlacement(id,s);if(!placed||placed.x!==s.x||placed.y!==s.y||!canDrawFurniture(id,placed))return false;
 const size=itemSize(id,s.direction);
 return others.every(other=>{const otherSize=itemSize(other.id,other.direction);return otherSize&&(!(FURNITURE[id].layer===FURNITURE[other.id].layer)||s.x+size.w<=other.x||other.x+otherSize.w<=s.x||s.y+size.d<=other.y||other.y+otherSize.d<=s.y);});
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
