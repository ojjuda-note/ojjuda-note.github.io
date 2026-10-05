import {roomPoint} from './room-guide.js?v=20261005-cushiondata1';

// A mesh deforms the supplied illustration. It never paints replacement shapes,
// guesses hidden geometry, or treats an image margin as a physical contact.
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const kinds=new Set(['physical','contour','support']);
const normalizedCache=new WeakMap(),coverageCache=new WeakMap(),buffers=new WeakMap();
const fail=message=>{throw new RangeError(message);};
const signature=mesh=>JSON.stringify([mesh?.anchors,mesh?.indices,mesh?.referenceDimensions,mesh?.id,mesh?.label,mesh?.straightRegions]);
const copyMesh=mesh=>({...mesh,anchors:mesh.anchors.map(a=>({...a,source:{...a.source},world:{...a.world}})),indices:mesh.indices.map(ids=>[...ids]),...(mesh.referenceDimensions?{referenceDimensions:{...mesh.referenceDimensions}}:{}),...(mesh.straightRegions?{straightRegions:mesh.straightRegions.map(r=>({...r,start:{...r.start},end:{...r.end},...(r.surfaceTriangle?{surfaceTriangle:[...r.surfaceTriangle]}:{})}))}:{})});
function tolerance(points){
 const extent=Math.max(1,Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y)));
 return extent*extent*1e-10;
}
function area(poly){let n=0;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];n+=a.x*b.y-a.y*b.x;}return Math.abs(n)/2;}
function intersectionArea(first,second){
 let poly=first;
 for(let i=0;i<3&&poly.length;i++){
  const a=second[i],b=second[(i+1)%3],next=[];
  for(let j=0;j<poly.length;j++){
   const p=poly[j],q=poly[(j+1)%poly.length],dp=cross(a,b,p),dq=cross(a,b,q),inside=dp>=0;
   if(inside)next.push(p);
   if(inside!==(dq>=0)){const t=dp/(dp-dq);next.push({x:p.x+t*(q.x-p.x),y:p.y+t*(q.y-p.y)});}
  }
  poly=next;
 }
 return poly.length>2?area(poly):0;
}
function nonoverlap(points,indices,message){
 const tol=tolerance(points),polys=indices.map(ids=>ids.map(i=>points[i]));
 const boxes=polys.map(p=>({l:Math.min(...p.map(v=>v.x)),r:Math.max(...p.map(v=>v.x)),t:Math.min(...p.map(v=>v.y)),b:Math.max(...p.map(v=>v.y))}));
 for(let i=0;i<polys.length;i++)for(let j=i+1;j<polys.length;j++){
  const a=boxes[i],b=boxes[j];
  if(a.r<=b.l||b.r<=a.l||a.b<=b.t||b.b<=a.t)continue;
  if(intersectionArea(polys[i],polys[j])>tol)fail(message);
 }
}
function inCircle(a,b,c,p){
 const ax=a.x-p.x,ay=a.y-p.y,bx=b.x-p.x,by=b.y-p.y,cx=c.x-p.x,cy=c.y-p.y;
 return (ax*ax+ay*ay)*(bx*cy-by*cx)-(bx*bx+by*by)*(ax*cy-ay*cx)+(cx*cx+cy*cy)*(ax*by-ay*bx)>-1e-13;
}
function triangulate(input){
 const left=Math.min(...input.map(p=>p.x)),top=Math.min(...input.map(p=>p.y));
 const span=Math.max(Math.max(...input.map(p=>p.x))-left,Math.max(...input.map(p=>p.y))-top);
 if(!(span>0))fail('기준점의 위치가 서로 같습니다.');
 const points=input.map(p=>({x:(p.x-left)/span-.5,y:(p.y-top)/span-.5})),n=points.length;
 points.push({x:-32,y:-16},{x:32,y:-16},{x:0,y:32});
 let triangles=[[n,n+1,n+2]];
 for(let i=0;i<n;i++){
  const edges=new Map(),retained=[];
  for(const ids of triangles){
   if(!inCircle(...ids.map(k=>points[k]),points[i])){retained.push(ids);continue;}
   for(let k=0;k<3;k++){
    const a=ids[k],b=ids[(k+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;
    if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);
   }
  }
  for(const [a,b]of edges.values()){
   const turn=cross(points[a],points[b],points[i]);
   if(Math.abs(turn)>1e-13)retained.push(turn>0?[a,b,i]:[b,a,i]);
  }
  triangles=retained;
 }
 return triangles.filter(ids=>ids.every(i=>i<n));
}

/** Source coordinates are image pixels; world coordinates are local room units.
 * support points are explicitly authored rendering supports, never contact feet.
 * Explicit indices may be nested triples or a flat list. No bbox points are added.
 */
export function normalizeMesh(mesh){
 if(!mesh||typeof mesh!=='object'||!Array.isArray(mesh.anchors)||mesh.anchors.length<3||mesh.anchors.length>512)fail('기준점을 3개 이상 512개 이하로 지정하세요.');
 const key=signature(mesh),previous=normalizedCache.get(mesh);
 if(previous?.key===key)return copyMesh(previous.result);
 const anchors=mesh.anchors.map(a=>{
  if(!finite(a?.source)||!finite(a?.world)||!Number.isFinite(a.world.z))fail('기준점의 그림 좌표와 방 좌표를 모두 입력하세요.');
  const kind=a.kind??'physical';if(!kinds.has(kind))fail('기준점 종류가 올바르지 않습니다.');
  return {source:{x:a.source.x,y:a.source.y},world:{x:a.world.x,y:a.world.y,z:a.world.z},kind,...(typeof a.id==='string'?{id:a.id.slice(0,120)}:{}),...(typeof a.label==='string'?{label:a.label.slice(0,120)}:{})};
 });
 const points=anchors.map(a=>a.source),tol=tolerance(points);
 for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)if((points[i].x-points[j].x)**2+(points[i].y-points[j].y)**2<tol*1e-4)fail('같은 그림 위치에 기준점이 겹쳐 있습니다.');
 let indices;
 if(mesh.indices===undefined||mesh.indices===null)indices=triangulate(points);
 else{
  if(!Array.isArray(mesh.indices)||!mesh.indices.length)fail('그림을 연결할 삼각형이 없습니다.');
  indices=mesh.indices;
  if(typeof indices[0]==='number'){
   if(indices.length%3)fail('삼각형마다 기준점 번호 3개가 필요합니다.');
   indices=Array.from({length:indices.length/3},(_,i)=>indices.slice(i*3,i*3+3));
  }
 }
 if(!indices.length||indices.length>2048)fail('기준점이 한 줄에 있거나 삼각형 수가 잘못되었습니다.');
 const used=new Set();
 indices=indices.map(ids=>{
  if(!Array.isArray(ids)||ids.length!==3||ids.some(i=>!Number.isInteger(i)||i<0||i>=points.length)||new Set(ids).size!==3)fail('삼각형의 기준점 번호가 올바르지 않습니다.');
  const turn=cross(...ids.map(i=>points[i]));
  if(Math.abs(turn)<=tol)fail('너비가 없는 삼각형이 있습니다. 기준점 위치를 확인하세요.');
  ids.forEach(i=>used.add(i));return turn>0?[...ids]:[ids[0],ids[2],ids[1]];
 });
 if(used.size!==anchors.length)fail('연결되지 않은 기준점이 있습니다.');
 nonoverlap(points,indices,'그림의 삼각형이 서로 겹칩니다. 연결을 확인하세요.');
 let referenceDimensions;
 if(mesh.referenceDimensions!==undefined){
  const d=mesh.referenceDimensions;
  if(!d||![d.width,d.depth,d.height].every(v=>Number.isFinite(v)&&v>0))fail('기준 가구의 폭·깊이·높이가 올바르지 않습니다.');
  referenceDimensions={width:d.width,depth:d.depth,height:d.height};
 }
 let straightRegions;
 if(mesh.straightRegions!==undefined){
  if(!Array.isArray(mesh.straightRegions)||mesh.straightRegions.length>32)fail('직선 부위 정보를 확인하세요.');
  straightRegions=mesh.straightRegions.map(r=>{
   if(!finite(r?.start)||!finite(r?.end)||Math.hypot(r.end.x-r.start.x,r.end.y-r.start.y)<1||![r.radius,r.feather].every(n=>Number.isFinite(n)&&n>0&&n<=2000))fail('직선 부위의 끝점과 폭을 확인하세요.');
   if(r.endFade!==undefined&&(!Number.isFinite(r.endFade)||r.endFade<=0||r.endFade>Math.hypot(r.end.x-r.start.x,r.end.y-r.start.y)))fail('직선 부위의 끝단 보정 길이를 확인하세요.');
   if(r.surfaceTriangle!==undefined&&(!Array.isArray(r.surfaceTriangle)||r.surfaceTriangle.length!==3||new Set(r.surfaceTriangle).size!==3||!indices.some(t=>r.surfaceTriangle.every(i=>t.includes(i)))))fail('부위의 기준 삼각형을 확인하세요.');
   return {start:{...r.start},end:{...r.end},radius:r.radius,feather:r.feather,...(r.endFade!==undefined?{endFade:r.endFade}:{}),...(r.surfaceTriangle?{surfaceTriangle:[...r.surfaceTriangle]}:{})};
  });
 }
 const result={anchors,indices,...(referenceDimensions?{referenceDimensions}:{}),...(straightRegions?{straightRegions}:{}),...(typeof mesh.id==='string'?{id:mesh.id}:{}),...(typeof mesh.label==='string'?{label:mesh.label}:{})};
 normalizedCache.set(mesh,{key,result});return copyMesh(result);
}

function triangleTransform(source,target){
 const [p,q,r]=source,[a,b,c]=target,x1=q.x-p.x,y1=q.y-p.y,x2=r.x-p.x,y2=r.y-p.y,det=x1*y2-x2*y1;
 const ux=b.x-a.x,uy=b.y-a.y,vx=c.x-a.x,vy=c.y-a.y;
 const m0=(ux*y2-vx*y1)/det,m2=(vx*x1-ux*x2)/det,m1=(uy*y2-vy*y1)/det,m3=(vy*x1-uy*x2)/det;
 const matrix=[m0,m1,m2,m3,a.x-m0*p.x-m2*p.y,a.y-m1*p.x-m3*p.y];
 if(!matrix.every(Number.isFinite))fail('그림을 변환할 수 없는 기준점입니다.');
 return matrix;
}

export function projectMesh(mesh,placement={x:0,y:0}){
 const normalized=normalizeMesh(mesh);
 if(!finite(placement))fail('가구의 방 위치가 올바르지 않습니다.');
 let sx=1,sy=1,sz=1;
 if(normalized.referenceDimensions){
  const d=normalized.referenceDimensions,width=placement.width??d.width,depth=placement.depth??d.depth,height=placement.height??d.height;
  if(![width,depth,height].every(v=>Number.isFinite(v)&&v>0))fail('가구의 폭·깊이·높이가 올바르지 않습니다.');
  const front=placement.direction==='center';
  sx=front?width/d.width:depth/d.depth;sy=front?depth/d.depth:width/d.width;sz=height/d.height;
 }
 const elevation=placement.elevation??0;
 if(!Number.isFinite(elevation)||elevation<0||elevation>4.5)fail('소품 높이가 올바르지 않습니다.');
 const points=normalized.anchors.map(a=>{
  const world={x:a.world.x*sx,y:a.world.y*sy,z:a.world.z*sz};
  return {...a,world,target:roomPoint(placement.x+world.x,placement.y+world.y,world.z+elevation)};
 });
 if(!points.every(p=>finite(p.target)))fail('기준점이 방의 투영 범위를 벗어났습니다.');
 const targets=points.map(p=>p.target),tol=tolerance(targets);
 const triangles=normalized.indices.map(indices=>{
  const source=indices.map(i=>points[i].source),target=indices.map(i=>points[i].target);
  if(cross(...target)<=tol)fail('그림이 접히거나 뒤집힙니다. 방 기준점 위치를 확인하세요.');
  return {indices,source,target,matrix:triangleTransform(source,target)};
 });
 nonoverlap(targets,normalized.indices,'이동한 그림이 서로 겹쳐 접힙니다. 방 기준점을 확인하세요.');
 return {...normalized,points,triangles};
}

export function validateMesh(mesh,placement){
 try{if(placement)projectMesh(mesh,placement);else normalizeMesh(mesh);return {ok:true,error:null};}
 catch(error){return {ok:false,error:error.message};}
}

const applyMatrix=(m,p)=>({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]});
function mappedPoint(projected,p){
 const tri=projected.triangles.find(t=>t.source.every((a,i)=>cross(a,t.source[(i+1)%3],p)>=-1e-6));
 return tri?applyMatrix(tri.matrix,p):null;
}

/** Rendering-only correction: a straight piece of wood must not acquire a
 * hinge when it crosses the original coarse triangle edges. Move the existing
 * pixels continuously across a shared subdivision, never paste separate legs.
 * The original geometry remains the authority for placement and contact feet.
 */
export function straightenProjectedMesh(projected){
 if(!projected.straightRegions?.length)return projected;
 const regions=projected.straightRegions.map(r=>{
  const a=mappedPoint(projected,r.start),b=mappedPoint(projected,r.end);
  const dx=r.end.x-r.start.x,dy=r.end.y-r.start.y,length=Math.hypot(dx,dy);
  return {...r,a,b,dx,dy,length};
 }).filter(r=>r.a&&r.b);
 if(!regions.length)return projected;
 const points=[],lookup=new Map(),indices=[];
 const vertex=(source,matrix)=>{
  const key=source.x.toFixed(7)+':'+source.y.toFixed(7);
  if(lookup.has(key))return lookup.get(key);
  const target=applyMatrix(matrix,source);let dx=0,dy=0,weight=0;
  for(const r of regions){
   const t=((source.x-r.start.x)*r.dx+(source.y-r.start.y)*r.dy)/(r.length*r.length);
   if(t<=0||t>=1)continue;
   const distance=Math.abs((source.x-r.start.x)*r.dy-(source.y-r.start.y)*r.dx)/r.length;
   if(distance>=r.radius+r.feather)continue;
   const u=Math.max(0,(distance-r.radius)/r.feather),end=r.endFade?Math.min(1,(1-t)*r.length/r.endFade):1;
   const w=(1-u*u*(3-2*u))*end*end*(3-2*end);
   const c={x:r.start.x+t*r.dx,y:r.start.y+t*r.dy},old=mappedPoint(projected,c);
   if(!old)continue;
   dx+=w*(r.a.x+t*(r.b.x-r.a.x)-old.x);dy+=w*(r.a.y+t*(r.b.y-r.a.y)-old.y);weight+=w;
  }
  // Registered physical/support anchors keep their exact original targets.
  const anchor=projected.points.some(p=>Math.hypot(p.source.x-source.x,p.source.y-source.y)<1e-6);
  const delta=anchor?{x:0,y:0}:{x:dx/Math.max(1,weight),y:dy/Math.max(1,weight)};
  const id=points.length;points.push({source,target,delta});lookup.set(key,id);return id;
 };
 const split=(s,m,depth)=>{
  if(!depth){indices.push(s.map(p=>vertex(p,m)));return;}
  const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2}),[a,b,c]=s,ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
  for(const sub of [[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]])split(sub,m,depth-1);
 };
 for(const t of projected.triangles)split(t.source,t.matrix,4);
 // If a formerly valid pose is near a fold, reduce only the visual correction.
 // Never reject a stored placement or remove its furniture to straighten it.
 let strength=1,targets;
 for(;;){
  targets=points.map(p=>({x:p.target.x+strength*p.delta.x,y:p.target.y+strength*p.delta.y}));
  if(indices.every(ids=>cross(...ids.map(i=>targets[i]))>1e-10))break;
  strength/=2;if(strength<1/128)return projected;
 }
 // An explicitly registered surface also owns the edges of its wooden shaft.
 // Blend toward that existing triangle's transform in a capsule around the
 // shaft. Rounded end falloff keeps the foot rim continuous; all anchors stay
 // pinned. Guard this local pass independently of other legs' corrections.
 const surfaces=regions.filter(r=>r.surfaceTriangle).map(r=>({...r,matrix:projected.triangles.find(t=>r.surfaceTriangle.every(i=>t.indices.includes(i))).matrix}));
 let surfaceStrength;
 if(surfaces.length){
  const base=targets,delta=points.map((p,i)=>{
   if(projected.points.some(a=>Math.hypot(a.source.x-p.source.x,a.source.y-p.source.y)<1e-6))return {x:0,y:0};
   let x=0,y=0,weight=0;
   for(const r of surfaces){
    const t=Math.max(0,Math.min(1,((p.source.x-r.start.x)*r.dx+(p.source.y-r.start.y)*r.dy)/(r.length*r.length)));
    const distance=Math.hypot(p.source.x-r.start.x-t*r.dx,p.source.y-r.start.y-t*r.dy);
    if(distance>=r.radius+r.feather)continue;
    const u=Math.max(0,(distance-r.radius)/r.feather),w=1-u*u*(3-2*u),q=applyMatrix(r.matrix,p.source);
    x+=w*(q.x-base[i].x);y+=w*(q.y-base[i].y);weight+=w;
   }
   return {x:x/Math.max(1,weight),y:y/Math.max(1,weight)};
  });
  surfaceStrength=0;
  for(let amount=1;amount>=1/128;amount/=2){
   const candidate=base.map((p,i)=>({x:p.x+amount*delta[i].x,y:p.y+amount*delta[i].y}));
   if(indices.every(ids=>cross(...ids.map(i=>candidate[i]))>1e-10)){targets=candidate;surfaceStrength=amount;break;}
  }
 }
 const triangles=indices.map(ids=>{
  const source=ids.map(i=>points[i].source),target=ids.map(i=>targets[i]);
  return {indices:ids,source,target,matrix:triangleTransform(source,target)};
 });
 return {...projected,triangles,renderPoints:targets,straightStrength:strength,...(surfaceStrength!==undefined?{surfaceStrength}:{})};
}

function imagePixels(image){
 if(image&&Number.isInteger(image.width)&&Number.isInteger(image.height)&&image.data?.length===image.width*image.height*4)return image;
 const width=image&&(image.naturalWidth||image.videoWidth||image.width),height=image&&(image.naturalHeight||image.videoHeight||image.height);
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width*height>32000000)fail('그림 크기가 올바르지 않습니다.');
 const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(width,height):globalThis.document?.createElement('canvas');
 if(!canvas)fail('그림의 투명 영역을 읽을 수 없습니다.');
 canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});
 if(!ctx)fail('그림을 읽을 수 없습니다.');
 ctx.drawImage(image,0,0);return ctx.getImageData(0,0,width,height);
}

/** Counts painted pixel cells not touched by any source triangle. Alpha-zero
 * margins never require anchors. This does not invent extrapolation coordinates.
 * ImageData is accepted so coverage can also be checked without a browser.
 */
export function meshCoverage(image,mesh){
 const normalized=normalizeMesh(mesh),key=signature(normalized);
 // Only immutable decoded images are cached. A brush-edited canvas/ImageData
 // must be read again; otherwise erasing/restoring could bypass coverage checks.
 const immutable=typeof ImageBitmap!=='undefined'&&image instanceof ImageBitmap||typeof HTMLImageElement!=='undefined'&&image instanceof HTMLImageElement;
 const identity=immutable?`${image.currentSrc||image.src||''}:${image.naturalWidth||image.width}:${image.naturalHeight||image.height}:${key}`:null;
 const cached=immutable?coverageCache.get(image):null;if(cached?.identity===identity)return {...cached.result};
 const {width,height,data}=imagePixels(image),coveredPixels=new Uint8Array(width*height);
 if(width<=0||height<=0||width*height>32000000)fail('그림 크기가 올바르지 않습니다.');
 for(const ids of normalized.indices){
  const triangle=ids.map(i=>normalized.anchors[i].source);
  const top=Math.max(0,Math.floor(Math.min(...triangle.map(p=>p.y)))),bottom=Math.min(height-1,Math.ceil(Math.max(...triangle.map(p=>p.y)))-1);
  for(let y=top;y<=bottom;y++){
   // Clip a triangle to a pixel-row strip; every touched pixel cell is counted.
   // A tiny epsilon avoids counting mere contact with the next pixel's edge.
   let poly=triangle;
   for(const [boundary,keepAbove]of [[y,true],[y+1,false]]){
    const next=[];
    for(let i=0;i<poly.length;i++){
     const p=poly[i],q=poly[(i+1)%poly.length],dp=keepAbove?p.y-boundary:boundary-p.y,dq=keepAbove?q.y-boundary:boundary-q.y;
     if(dp>=0)next.push(p);
     if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);next.push({x:p.x+t*(q.x-p.x),y:boundary});}
    }poly=next;if(!poly.length)break;
   }
   if(poly.length<3||area(poly)<1e-12)continue;
   const start=Math.max(0,Math.floor(Math.min(...poly.map(p=>p.x))+1e-9)),end=Math.min(width,Math.ceil(Math.max(...poly.map(p=>p.x))-1e-9));
   if(end>start)coveredPixels.fill(1,y*width+start,y*width+end);
  }
 }
 let total=0,missing=0,left=width,right=-1,top=height,bottom=-1;
 for(let i=0;i<coveredPixels.length;i++)if(data[i*4+3]>0){
  total++;if(!coveredPixels[i]){missing++;const x=i%width,y=Math.floor(i/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 }
 const result={ok:missing===0&&total>0,total,covered:total-missing,missing,bounds:missing?{x:left,y:top,width:right-left+1,height:bottom-top+1}:null};
 if(immutable)coverageCache.set(image,{identity,result});return result;
}

function outline(ctx,points){ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.closePath();}
function isolatedBuffer(ctx,targets){
 const transform=ctx.getTransform?.(),scale=transform?Math.min(4,Math.max(1,Math.hypot(transform.a,transform.b),Math.hypot(transform.c,transform.d))):1;
 const left=Math.floor(Math.min(...targets.map(p=>p.x)))-1,top=Math.floor(Math.min(...targets.map(p=>p.y)))-1;
 const width=Math.ceil((Math.max(...targets.map(p=>p.x))-left+1)*scale),height=Math.ceil((Math.max(...targets.map(p=>p.y))-top+1)*scale);
 if(width<=0||height<=0||width>16384||height>16384||width*height>32000000)return null;
 let canvas=buffers.get(ctx);
 if(!canvas){canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(width,height):ctx.canvas?.ownerDocument?.createElement('canvas');if(!canvas)return null;buffers.set(ctx,canvas);}
 canvas.width=width;canvas.height=height;const painter=canvas.getContext('2d');if(!painter)return null;
 painter.setTransform(scale,0,0,scale,-left*scale,-top*scale);painter.globalCompositeOperation='lighter';
 return {canvas,painter,left,top,width:width/scale,height:height/scale};
}

/** All source-alpha coverage and fold checks finish before touching the caller's
 * canvas. Adjacent antialiased triangles add only within an isolated layer, then
 * that complete original-art layer is composited once over the existing room.
 */
export function drawMesh(ctx,image,mesh,placement,options={}){
 let projected;
 try{
  if(!ctx||!image||('complete'in image&&!image.complete))return false;
  projected=projectMesh(mesh,placement);
  if(options.requireCoverage!==false&&!meshCoverage(image,mesh).ok)return false;
 }catch{return false;}
 projected=straightenProjectedMesh(projected);
 const buffer=isolatedBuffer(ctx,projected.renderPoints||projected.points.map(p=>p.target));if(!buffer)return false;
 const painter=buffer.painter;
 try{
  for(const triangle of projected.triangles){
   painter.save();try{outline(painter,triangle.target);painter.clip();painter.transform(...triangle.matrix);painter.drawImage(image,0,0);}finally{painter.restore();}
  }
  ctx.save();try{ctx.drawImage(buffer.canvas,buffer.left,buffer.top,buffer.width,buffer.height);}finally{ctx.restore();}
 }catch{return false;}
 return true;
}
