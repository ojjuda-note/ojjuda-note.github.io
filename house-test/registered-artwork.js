import {floorPoint,roomPoint} from './model.js?v=20261006-wall1';

const mix=(a,b,t)=>a.map((value,i)=>value+(b[i]-value)*t);
const quad=(points,u,v)=>mix(mix(points[0],points[1],u),mix(points[3],points[2],u),v);
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const area=points=>points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-p[1]*q[0];},0)/2;

function halfPlane(points,a,b,inside){
 const result=[];
 for(let i=0;i<points.length;i++){
  const p=points[i],q=points[(i+1)%points.length],dp=cross(a,b,p),dq=cross(a,b,q),keepP=inside?dp>=0:dp<=0,keepQ=inside?dq>=0:dq<=0;
  if(keepP)result.push(p);
  if(keepP!==keepQ)result.push(mix(p,q,dp/(dp-dq)));
 }
 return result;
}
// A flattened sprite contains the nearer layer's pixels in every overlap.
// Partition that artwork before moving it, so those pixels are drawn once.
function subtractQuad(points,cutter){
 const result=[];let remainder=points;
 for(let i=0;i<cutter.length&&remainder.length>=3;i++){
  const a=cutter[i],b=cutter[(i+1)%cutter.length],outside=halfPlane(remainder,a,b,false);
  if(outside.length>=3&&Math.abs(area(outside))>1e-7)result.push(outside);
  remainder=halfPlane(remainder,a,b,true);
 }
 return result;
}
function projectiveMap(source,target){
 const rows=[];
 for(let i=0;i<4;i++){
  const [x,y]=source[i],{x:u,y:v}=target[i];
  rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);
 }
 for(let col=0;col<8;col++){
  let pivot=col;for(let row=col+1;row<8;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;
  [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
  const divisor=rows[col][col];if(Math.abs(divisor)<1e-10)return null;
  for(let j=col;j<=8;j++)rows[col][j]/=divisor;
  for(let row=0;row<8;row++)if(row!==col){const factor=rows[row][col];for(let j=col;j<=8;j++)rows[row][j]-=factor*rows[col][j];}
 }
 const m=[...rows.map(row=>row[8]),1];
 return ([x,y])=>{const w=m[6]*x+m[7]*y+1;return {x:(m[0]*x+m[1]*y+m[2])/w,y:(m[3]*x+m[4]*y+m[5])/w};};
}
// This mesh samples only the final maker-exported bitmap, never the source atlas.
const meshCache=new WeakMap();
function sourceMeshesFor(registration){
 if(meshCache.has(registration))return meshCache.get(registration);
 const meshes=registration.layers.map((layer,index)=>{
 const triangles=[],n=8,occluders=registration.layers.slice(index+1).map(l=>area(l.target)<0?[...l.target].reverse():l.target);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const q=[quad(layer.target,x/n,y/n),quad(layer.target,(x+1)/n,y/n),quad(layer.target,(x+1)/n,(y+1)/n),quad(layer.target,x/n,(y+1)/n)];
  for(const ids of [[0,1,2],[0,2,3]]){
   let pieces=[ids.map(i=>q[i])];
   for(const cutter of occluders)pieces=pieces.flatMap(piece=>subtractQuad(piece,cutter));
   for(const piece of pieces)for(let i=1;i<piece.length-1;i++){
    const triangle=[piece[0],piece[i],piece[i+1]];
    if(Math.abs(area(triangle))>1e-7)triangles.push(triangle);
   }
  }
 }
 return triangles;
 });
 meshCache.set(registration,meshes);
 return meshes;
}

// Source correspondence order stays unchanged; only clipping cutters are
// normalized clockwise, including the oppositely facing center inside panel.
export function registeredArtwork(registration,s,contact,size,parts=null){
 const ref=registration.placement,dx=s.x-ref.x,dy=s.y-ref.y;
 const project=([x,y,z])=>roomPoint(x+dx,y+dy,z);
 const footprint=[[s.x,s.y],[s.x+size.w,s.y],[s.x+size.w,s.y+size.d],[s.x,s.y+size.d]].map(p=>floorPoint(...p));
 const anchors=registration.anchors.map(project);
 const base={footprint,reserved:footprint,anchors,contact,faces:[]};
 if(!parts&&Math.abs(dx)<1e-9&&Math.abs(dy)<1e-9){
  const {origin,offset,scale,canvas,image}=registration;
  const x=origin.x-offset.x/scale,y=origin.y-offset.y/scale,width=canvas[0]/scale,height=canvas[1]/scale;
  const points=registration.layers.flatMap(layer=>layer.world.map(project));
  const left=Math.min(...points.map(p=>p.x))-2,top=Math.min(...points.map(p=>p.y))-2,right=Math.max(...points.map(p=>p.x))+2,bottom=Math.max(...points.map(p=>p.y))+2;
  // The authored reference pose is one unchanged bitmap draw, including alpha.
  return {...base,left,top,width:right-left,height:bottom-top,art:{kind:'desk',sprite:{image,x,y,width,height}}};
 }
 const triangles=[],sourceMeshes=sourceMeshesFor(registration);
 registration.layers.forEach((layer,index)=>{
  if(parts&&!parts.includes(layer.id))return;
  const map=projectiveMap(layer.target,layer.world.map(project));
  if(!map)return;
  for(const source of sourceMeshes[index])triangles.push({image:registration.image,part:layer.id,source,target:source.map(map)});
 });
 const points=triangles.flatMap(t=>t.target),left=Math.min(...points.map(p=>p.x))-2,top=Math.min(...points.map(p=>p.y))-2;
 const right=Math.max(...points.map(p=>p.x))+2,bottom=Math.max(...points.map(p=>p.y))+2;
 return {...base,left,top,width:right-left,height:bottom-top,art:{kind:'desk',triangles}};
}
