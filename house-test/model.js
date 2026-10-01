export const roomKey=r=>`${r.x}:${r.y}`;
export const validCell=r=>r&&Number.isInteger(r.x)&&Number.isInteger(r.y)&&Math.abs(r.x)<=2&&Math.abs(r.y)<=3;
export const neighbors=r=>[{x:r.x-1,y:r.y},{x:r.x+1,y:r.y},{x:r.x,y:r.y-1},{x:r.x,y:r.y+1}];
export function canAdd(rooms,cell){return validCell(cell)&&rooms.length<35&&!rooms.some(r=>roomKey(r)===roomKey(cell))&&neighbors(cell).some(n=>rooms.some(r=>roomKey(r)===roomKey(n)));}
export function normalize(data){const rooms=[{x:0,y:0,decor:true}],pending=new Map();if(Array.isArray(data?.rooms))for(const r of data.rooms.slice(0,100)){if(validCell(r))pending.set(roomKey(r),{x:r.x,y:r.y,decor:r.decor===true});}if(pending.has('0:0'))rooms[0]=pending.get('0:0');pending.delete('0:0');let progress=true;while(progress&&rooms.length<35){progress=false;for(const [key,r]of pending)if(canAdd(rooms,r)){rooms.push(r);pending.delete(key);progress=true;}}return {version:1,rooms,diary:typeof data?.diary==='string'?data.diary.slice(0,4000):''};}
