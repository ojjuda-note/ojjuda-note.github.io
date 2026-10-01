export const roomKey=r=>`${r.x}:${r.y}`;
export const validCell=r=>r&&Number.isInteger(r.x)&&Number.isInteger(r.y)&&Math.abs(r.x)<=2&&Math.abs(r.y)<=3;
export const neighbors=r=>[{x:r.x-1,y:r.y},{x:r.x+1,y:r.y},{x:r.x,y:r.y-1},{x:r.x,y:r.y+1}];
export function canAdd(rooms,cell){return validCell(cell)&&rooms.length<35&&!rooms.some(r=>roomKey(r)===roomKey(cell))&&neighbors(cell).some(n=>rooms.some(r=>roomKey(r)===roomKey(n)));}
export function normalize(data){const rooms=[{x:0,y:0,decor:true,curtains:true,shelf:{x:7,y:1.5,direction:'right'}}],pending=new Map();if(Array.isArray(data?.rooms))for(const r of data.rooms.slice(0,100)){if(validCell(r))pending.set(roomKey(r),{x:r.x,y:r.y,decor:r.decor===true,curtains:r.curtains!==false,shelf:data.version===2?normalizeShelf(r.shelf):(!r.x&&!r.y?{x:7,y:1.5,direction:'right'}:null)});}if(pending.has('0:0'))rooms[0]=pending.get('0:0');pending.delete('0:0');let progress=true;while(progress&&rooms.length<35){progress=false;for(const [key,r]of pending)if(canAdd(rooms,r)){rooms.push(r);pending.delete(key);progress=true;}}return {version:2,rooms,diary:typeof data?.diary==='string'?data.diary.slice(0,4000):''};}

export const ROOM={width:1375,height:1144,top:29,bottom:1111};
export const FLOOR={width:8,depth:7,step:.5};
export const shelfSize=direction=>direction==='center'?{w:2,d:1}:{w:1,d:2};
export function normalizeShelf(s){
 if(!s||!['left','center','right'].includes(s.direction)||!Number.isFinite(s.x)||!Number.isFinite(s.y))return null;
 const {w,d}=shelfSize(s.direction);
 return {direction:s.direction,x:Math.max(0,Math.min(8-w,Math.round(s.x*2)/2)),y:Math.max(0,Math.min(7-d,Math.round(s.y*2)/2))};
}
// Calibrated to the inside corners where the skirting meets the floor.
// The full-depth 8 × 7 grid reaches the front corners of the extended walls.
export const FLOOR_CORNERS=[{x:303,y:671},{x:1068,y:671},{x:1358,y:1083},{x:17,y:1083}];
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
// Furniture shares the floor camera: height changes only the vertical numerator.
export function roomPoint(x,y,z=0){
 const p=floorPoint(x,y),w=G*x/FLOOR.width+H*y/FLOOR.depth+1;
 return {x:p.x,y:p.y-z*(p1.x-p0.x)/FLOOR.width/w};
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
