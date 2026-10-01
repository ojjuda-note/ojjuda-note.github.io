export const roomKey=r=>`${r.x}:${r.y}`;
export const validCell=r=>r&&Number.isInteger(r.x)&&Number.isInteger(r.y)&&Math.abs(r.x)<=2&&Math.abs(r.y)<=3;
export const neighbors=r=>[{x:r.x-1,y:r.y},{x:r.x+1,y:r.y},{x:r.x,y:r.y-1},{x:r.x,y:r.y+1}];
export function canAdd(rooms,cell){return validCell(cell)&&rooms.length<35&&!rooms.some(r=>roomKey(r)===roomKey(cell))&&neighbors(cell).some(n=>rooms.some(r=>roomKey(r)===roomKey(n)));}
export function normalize(data){const rooms=[{x:0,y:0,decor:true,curtains:true,shelf:{x:7,y:1.5,direction:'right'}}],pending=new Map();if(Array.isArray(data?.rooms))for(const r of data.rooms.slice(0,100)){if(validCell(r))pending.set(roomKey(r),{x:r.x,y:r.y,decor:r.decor===true,curtains:r.curtains!==false,shelf:data.version===2?normalizeShelf(r.shelf):(!r.x&&!r.y?{x:7,y:1.5,direction:'right'}:null)});}if(pending.has('0:0'))rooms[0]=pending.get('0:0');pending.delete('0:0');let progress=true;while(progress&&rooms.length<35){progress=false;for(const [key,r]of pending)if(canAdd(rooms,r)){rooms.push(r);pending.delete(key);progress=true;}}return {version:2,rooms,diary:typeof data?.diary==='string'?data.diary.slice(0,4000):''};}

export const FLOOR={width:8,depth:7,step:.5};
export const shelfSize=direction=>direction==='center'?{w:2,d:1}:{w:1,d:2};
export function normalizeShelf(s){
 if(!s||!['left','center','right'].includes(s.direction)||!Number.isFinite(s.x)||!Number.isFinite(s.y))return null;
 const {w,d}=shelfSize(s.direction);
 return {direction:s.direction,x:Math.max(0,Math.min(8-w,Math.round(s.x*2)/2)),y:Math.max(0,Math.min(7-d,Math.round(s.y*2)/2))};
}
export function floorPoint(x,y){const t=y/7;return {x:260-245*t+x/8*(757+467*t),y:704+410*t};}
export function floorCell(x,y){const t=(y-704)/410;return {x:(x-(260-245*t))*8/(757+467*t),y:t*7};}
const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',hourCycle:'h23'});
export function roomPeriod(date=new Date()){
 const hour=Number(clock.format(date));
 return hour>=8&&hour<18?'day':hour>=6&&hour<8||hour>=18&&hour<20?'dusk':'night';
}
