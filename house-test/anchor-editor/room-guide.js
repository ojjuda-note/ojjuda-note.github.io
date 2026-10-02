import {ROOM,FLOOR,roomPoint} from '../model.js?v=20261003-house-fix1';

export {ROOM,FLOOR,roomPoint};

/** Clockwise corners of a furniture plane in the room's existing world units. */
export function roomPlaneWorld({plane='top',direction='right',x=9,y=3.5,width=3,depth=1,height=1.4}={}){
 if(!['top','front','side'].includes(plane))throw new RangeError('Unknown furniture plane');
 if(!['right','center','left'].includes(direction))throw new RangeError('Unknown furniture direction');
 if(![x,y,width,depth,height].every(Number.isFinite)||width<=0||depth<=0||height<=0)throw new RangeError('Furniture dimensions must be positive finite numbers');
 const farX=x+(direction==='center'?width:depth),nearY=y+(direction==='center'?depth:width);
 const p=(x,y,z)=>({x,y,z});
 if(plane==='top')return [p(x,y,height),p(farX,y,height),p(farX,nearY,height),p(x,nearY,height)];
 let a,b;
 if(plane==='front'){
  if(direction==='right'){a=[x,y];b=[x,nearY];}
  else if(direction==='left'){a=[farX,nearY];b=[farX,y];}
  else {a=[x,nearY];b=[farX,nearY];}
 }else if(direction==='center'){a=[farX,y];b=[farX,nearY];}
 else {a=[x,nearY];b=[farX,nearY];}
 return [p(...a,height),p(...b,height),p(...b,0),p(...a,0)];
}

/** The only projection used here is the actual editor's roomPoint. */
export function planeQuad(options){return roomPlaneWorld(options).map(p=>roomPoint(p.x,p.y,p.z));}

function ticks(max,step){
 if(!Number.isFinite(step)||step<=0||step<.01)throw new RangeError('Grid step must be at least 0.01');
 const result=[];
 for(let i=0;i<=Math.floor((max+1e-9)/step);i++)result.push(Math.min(max,i*step));
 if(max-result[result.length-1]>1e-9)result.push(max);
 return result;
}

/** World-coordinate line pairs, also shared by drawing and geometry tests. */
export function roomGridLines({step=FLOOR.step}={}){
 const lines=[],xs=ticks(FLOOR.width,step),ys=ticks(FLOOR.depth,step),zs=ticks(ROOM.wallHeight,step);
 const add=(surface,a,b,coordinate)=>lines.push({surface,a,b,major:Math.abs(coordinate-Math.round(coordinate))<1e-8});
 for(const x of xs)add('floor',[x,0,0],[x,FLOOR.depth,0],x);
 for(const y of ys)add('floor',[0,y,0],[FLOOR.width,y,0],y);
 for(const x of xs)add('back',[x,0,0],[x,0,ROOM.wallHeight],x);
 for(const y of ys)for(const [x,surface]of [[0,'left'],[FLOOR.width,'right']])add(surface,[x,y,0],[x,y,ROOM.wallHeight],y);
 for(const z of zs){
  add('back',[0,0,z],[FLOOR.width,0,z],z);
  add('left',[0,0,z],[0,FLOOR.depth,z],z);
  add('right',[FLOOR.width,0,z],[FLOOR.width,FLOOR.depth,z],z);
 }
 return lines;
}

/** Draw in the room's native 1507 × 1044 canvas coordinates. */
export function drawRoomGrid(ctx,{opacity=.35,step=FLOOR.step}={}){
 const lines=roomGridLines({step});
 ctx.save();
 ctx.globalAlpha*=Math.max(0,Math.min(1,Number.isFinite(opacity)?opacity:.35));
 ctx.strokeStyle='#287c85';
 for(const {a,b,major}of lines){
  const start=roomPoint(...a),end=roomPoint(...b);
  ctx.lineWidth=major?1.4:.75;
  ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.stroke();
 }
 ctx.restore();
}

/** Nearest visible floor/wall grid node; distance is in native canvas pixels. */
export function nearestGridPoint(point,{step=FLOOR.step}={}){
 if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))throw new TypeError('A finite canvas point is required');
 const xs=ticks(FLOOR.width,step),ys=ticks(FLOOR.depth,step),zs=ticks(ROOM.wallHeight,step);
 let best=null;
 const check=(x,y,z)=>{
  const screen=roomPoint(x,y,z),distance=Math.hypot(screen.x-point.x,screen.y-point.y);
  if(!best||distance<best.distance)best={x,y,z,screen,distance};
 };
 for(const x of xs)for(const y of ys)check(x,y,0);
 for(const x of xs)for(const z of zs)check(x,0,z);
 for(const y of ys)for(const z of zs){check(0,y,z);check(FLOOR.width,y,z);}
 return best;
}
