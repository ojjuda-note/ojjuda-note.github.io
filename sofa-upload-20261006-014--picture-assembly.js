// Original side pictures stay horizontal. One continuous body picture meets
// the measured wooden support tops. The editor and installed item share this.
import {roomPoint} from './room-guide.js?v=20261006-assembly1';
import {homography,project,validQuad,drawWarp} from './warp.js?v=20261006-assembly1';
import {normalizePartSource} from './parts.js?v=20261006-assembly1';

const fail=message=>{throw new Error(message);};
const finite=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
const rect=(w,h)=>[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
const area=q=>q.reduce((s,p,i)=>{const n=q[(i+1)%q.length];return s+p.x*n.y-p.y*n.x;},0)/2;
export function normalizeAssembly(value){
 if(!value||value.version!==1||!['left','center','right'].includes(value.direction))fail('겹쳐 만들기 정보를 확인해 주세요.');
 const d=value.dimensions;
 if(!d||!['width','depth','height'].every(k=>finite(d[k],.1,k==='height'?4.5:7)))fail('가구 크기를 확인해 주세요.');
 const sides={};
 for(const id of ['near','far']){
  const p=value.sides?.[id];if(!p)fail('양쪽 옆판 그림을 넣어 주세요.');
  const source=normalizePartSource(p.source);
  if(!finite(p.supportY,1,source.height-1)||!finite(p.footY,p.supportY+1,source.height)||!finite(p.height,.05,d.height)||!finite(p.supportHeight,.01,p.height-.01)||!finite(p.length,.05,1)||!finite(p.supportX,0,1))fail('옆판의 다리 윗면·발끝·높이를 확인해 주세요.');
  if(!Array.isArray(p.feetX)||p.feetX.length!==2||!p.feetX.every(x=>finite(x,0,source.width))||p.feetX[0]>=p.feetX[1])fail('옆판의 두 다리 위치를 확인해 주세요.');
  sides[id]={source,supportY:p.supportY,footY:p.footY,height:p.height,supportHeight:p.supportHeight,length:p.length,supportX:p.supportX,feetX:[...p.feetX]};
 }
 const b=value.body;if(!b)fail('몸통 그림을 넣어 주세요.');const source=normalizePartSource(b.source);
 if(!Array.isArray(b.anchors)||b.anchors.length!==4||[0,1,2,3].some(i=>{const p=b.anchors[i];return !p||!finite(p.x,0,source.width)||!finite(p.y,0,source.height);})||!validQuad(b.anchors))fail('몸통의 위쪽 두 점과 밑면 두 점을 순서대로 찍어 주세요.');
 if(!finite(b.nearHeight,sides.near.supportHeight+.01,d.height)||!finite(b.farHeight,sides.far.supportHeight+.01,d.height)||!finite(b.nearInset,0,1)||!finite(b.farInset,0,1))fail('몸통 높이는 다리 윗면보다 높게 맞춰 주세요.');
 return {version:1,direction:value.direction,dimensions:{...d},sides,body:{source,anchors:b.anchors.map(p=>({...p})),nearHeight:b.nearHeight,farHeight:b.farHeight,nearInset:b.nearInset,farInset:b.farInset}};
}

export function assemblyGeometry(assembly,placement){
 const a=assembly,d=a.dimensions,p={...d,...placement},direction=p.direction;
 if(direction!==a.direction)fail('해당 방향의 원본 그림을 따로 준비해 주세요.');
 const scale=p.height/d.height,elevation=p.elevation||0;
 const point=(x,y,z)=>roomPoint(x,y,z*scale+elevation);
 const side=(id)=>{
  const s=a.sides[id],near=id==='near',{width:w,height:h}=s.source;
  let x0,x1,y,supportX;
  if(direction==='center'){
   const span=p.width*s.length;x0=p.x+(near?0:p.width-span);x1=x0+span;y=p.y+p.depth;
   supportX=x0+(near?s.supportX:1-s.supportX)*span;
  }else{
   const span=p.depth*s.length;x0=p.x+(direction==='left'?0:p.depth-span);x1=x0+span;y=p.y+(near?p.width:0);
   supportX=x0+(direction==='left'?s.supportX:1-s.supportX)*span;
  }
  const at=(sx,sy)=>point(x0+sx/w*(x1-x0),y,sy<=s.supportY?s.supportHeight+(s.supportY-sy)/s.supportY*(s.height-s.supportHeight):(s.footY-sy)/(s.footY-s.supportY)*s.supportHeight);
  const bands=[[0,s.supportY],[s.supportY,h]].map(([start,end])=>({source:[0,start,w,end-start],target:[at(0,start),at(w,end)]}));
  return {id,bands,support:point(supportX,y,s.supportHeight),feet:s.feetX.map(sx=>at(sx,s.footY)),bounds:rect(w,h).map(({x,y})=>at(x,y)),x0,x1,y};
 };
 const near=side('near'),far=side('far'),b=a.body;
 const top=(panel,inset,height)=>direction==='center'?point(p.x+p.width*inset,p.y,height):point(panel.x0+(panel.x1-panel.x0)*(direction==='left'?inset:1-inset),panel.y,height);
 const targets=[top(near,b.nearInset,b.nearHeight),top(far,b.farInset,b.farHeight),far.support,near.support];
 if(area(b.anchors)*area(targets)<=0)fail('몸통 점의 순서가 반대예요. 가까운 위 → 먼 위 → 먼 아래 → 가까운 아래로 찍어 주세요.');
 const matrix=homography(b.anchors,targets);if(!matrix)fail('몸통의 높이와 옆판 간격을 확인해 주세요.');
 const source=rect(b.source.width,b.source.height),denominators=source.map(q=>matrix[6]*q.x+matrix[7]*q.y+1);
 if(!denominators.every(n=>n>1e-8)&&!denominators.every(n=>n< -1e-8))fail('몸통 점을 실제 모서리에 더 가깝게 맞춰 주세요.');
 const target=source.map(q=>project(matrix,q));
 if(!validQuad(target)||target.some(q=>!finite(q.x,-3000,4500)||!finite(q.y,-2000,3000)))fail('그림이 너무 늘어났어요. 몸통 기준점을 확인해 주세요.');
 const body={id:'body',source,target,matrix,supports:[near.support,far.support]};
 const layers=direction==='center'?[body,far,near]:[far,body,near];
 return {layers,body,sides:{near,far},anchors:[...far.feet,...near.feet]};
}

export function assemblyCheck(assembly,placement){
 try{assemblyGeometry(assembly,placement);return {ok:true};}catch(error){return {ok:false,error:error.message};}
}
export function drawAssembly(ctx,assembly,images,placement,{steps=24}={}){
 const geometry=assemblyGeometry(assembly,placement);
 for(const layer of geometry.layers){
  const image=images.get(layer.id);if(!image)fail('부위 그림을 먼저 불러와 주세요.');
  if(layer.id==='body'){
   if(!drawWarp(ctx,image,layer.source,layer.target,{steps}))fail('몸통 그림을 맞추지 못했어요. 기준점을 확인해 주세요.');
  }else for(const band of layer.bands){const [a,b]=band.target;ctx.drawImage(image,...band.source,a.x,a.y,b.x-a.x,b.y-a.y);}
 }
 return geometry;
}
export async function prepareAssemblyImages(assembly,decode){
 const entries=await Promise.all(['near','body','far'].map(async id=>{
  const s=id==='body'?assembly.body.source:assembly.sides[id].source,image=await decode(s.data);
  if((image.naturalWidth||image.width)!==s.width||(image.naturalHeight||image.height)!==s.height)fail('부위 그림의 저장된 크기와 실제 크기가 달라요.');
  return [id,image];
 }));return new Map(entries);
}

// Measured from the user's approved October 6 sofa. These are source-pixel
// landmarks, never inferred from a transparent canvas corner or generated anew.
export function approvedSofaAssembly(side,body){
 const panel={source:side,supportY:640,footY:786,feetX:[87,1171],height:.94,supportHeight:(786-640)/786*.98,length:1,supportX:.98};
 return normalizeAssembly({version:1,direction:'left',dimensions:{width:3.5,depth:1.5,height:1.8},sides:{near:panel,far:{...panel}},body:{source:body,anchors:[{x:10,y:250},{x:620,y:0},{x:949,y:559},{x:506,y:857}],nearHeight:1.4,farHeight:1.32,nearInset:.14,farInset:.2824174346953029}});
}
