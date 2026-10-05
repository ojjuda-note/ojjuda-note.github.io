// The installed room uses the editor's own 2D drawing routines and room grid.
import {ROOM,roomPoint,roomPlaneWorld} from './room-guide.js?v=20261005-shapeguard1';
import {validQuad,drawWarp} from './warp.js?v=20261005-shapeguard1';
import {normalizeMesh,validateMesh,projectMesh,drawMesh} from './mesh.js?v=20261005-shapeguard1';
import {normalizePictureLayers,validatePictureLayers,projectPictureLayers,drawPictureLayers} from './layered-mesh.js?v=20261005-shapeguard1';
import {normalizeSofaBlanketDrape} from '../sofa-blanket-drape.js?v=20261005-shapeguard1';
import {drawDrapedLayer} from './draped-parts.js?v=20261005-shapeguard1';
import {alphaBounds} from './cutout.js?v=20261005-shapeguard1';
import {pictureShape} from './shape-check.js?v=20261005-shapeguard1';

const preparedPictures=new WeakMap();

const directions=['left','center','right'],unit=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
const fail=message=>{throw new Error(message);};
const area=points=>points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-p.y*q.x;},0)/2;
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<20000&&Math.abs(p.y)<20000;
export function boundWorld(layer,placement){
 const plane=layer.binding.plane,offset=layer.binding.offset||0;
 const axis=plane==='top'?'z':plane==='front'?(placement.direction==='center'?'y':'x'):(placement.direction==='center'?'x':'y');
 const delta=plane==='front'&&placement.direction==='right'?offset:-offset;
 const q=roomPlaneWorld({...placement,plane}).map(p=>({...p,[axis]:p[axis]+delta}));
 return (layer.binding.uv||unit).map(({x:u,y:v})=>Object.fromEntries(['x','y','z'].map(k=>[k,q[0][k]+u*(q[1][k]-q[0][k])+v*(q[3][k]-q[0][k])])));
}
const targets=(layer,p)=>boundWorld(layer,p).map(w=>roomPoint(w.x,w.y,w.z));
function imageData(data){
 if(typeof data!=='string'||data.length>35000000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data))fail('PNG 그림 정보가 올바르지 않아요.');
 return data;
}
export function validateRuntime(value){
 if(value?.format!=='ojjuda-runtime-furniture'||value.version!==1||typeof value.name!=='string'||!value.name.trim()||value.name.length>80)fail('완성한 가구 정보를 확인해 주세요.');
 if(!['standing','floor','surface'].includes(value.layer))fail('가구 또는 소품의 놓을 곳을 확인해 주세요.');
 if(value.shapePolicy!==undefined&&value.shapePolicy!==1)fail('그림 비율 검사 버전을 확인해 주세요.');
 const dims=value.dimensions;
 if(!dims||!['width','depth','height'].every(k=>Number.isFinite(dims[k])&&dims[k]>=.1&&dims[k]<=(k==='height'?4.5:7)))fail('가구 크기를 확인해 주세요.');
 for(const direction of directions){
  const v=value.views?.[direction],p=v?.placement;
  if(!p||p.direction!==direction||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x+(direction==='center'?dims.width:dims.depth)>10||p.y+(direction==='center'?dims.depth:dims.width)>7||['width','depth','height'].some(k=>p[k]!==dims[k]))fail('세 방향의 크기와 위치가 맞지 않아요.');
  if(p.elevation!==undefined&&(!Number.isFinite(p.elevation)||p.elevation<0||p.elevation+dims.height>ROOM.wallHeight+1e-6||value.layer!=='surface'&&p.elevation!==0))fail('소품 높이를 확인해 주세요.');
  if(!Array.isArray(v.layers)||v.layers.length>80)fail('그림 면 정보를 확인해 주세요.');
  if(v.mesh)normalizeMesh(v.mesh);
  else if(v.pictureLayers)normalizePictureLayers(v.pictureLayers,v.pictureLayerRules);
  else if(!v.layers.length||v.layers.some(l=>!Array.isArray(l.source)||l.source.length!==4||!l.source.every(point)||!validQuad(l.source)||!['top','front','side'].includes(l.binding?.plane)||!Array.isArray(l.binding.uv)||l.binding.uv.length!==4||!l.binding.uv.every(p=>point(p)&&p.x>=-2&&p.x<=3&&p.y>=-2&&p.y<=3)||!Number.isFinite(l.binding.offset??0)||l.binding.offset<0||l.binding.offset>7))fail('모든 면의 꼭지점을 격자에 연결해 주세요.');
  imageData(v.preview);
  if(!Array.isArray(v.drawings)||!v.drawings.length||v.drawings.length>80)fail('가구 그림이 비어 있어요.');
  for(const layer of v.drawings){imageData(layer.data);if(layer.registration){normalizeSofaBlanketDrape(layer.registration);if(!['surface','front'].includes(layer.segment))fail('담요의 그리기 순서를 확인해 주세요.');}}
  if(!runtimePoseValid(value,p))fail('가구의 기준점이 뒤집히거나 겹쳐요. 제작실에서 확인해 주세요.');
 }
 return value;
}
export function runtimePoseValid(runtime,placement){
 try{
  const v=runtime.views[placement.direction],p={...v.placement,...placement};
  const elevation=p.elevation??0;if(!Number.isFinite(elevation)||elevation<0||elevation+runtime.dimensions.height>ROOM.wallHeight+1e-6||runtime.layer!=='surface'&&elevation!==0)return false;
  const pictures=preparedPictures.get(runtime)?.[placement.direction];
  if(runtime.shapePolicy===1&&pictures&&!pictures.every(image=>pictureShape(v,image,targets,p).ok))return false;
  if(v.mesh)return validateMesh(v.mesh,p).ok;
  if(v.pictureLayers)return validatePictureLayers(v.pictureLayers,p,v.pictureLayerRules).ok;
  return v.layers.every(l=>{const t=targets(l,p);return validQuad(t)&&area(t)*area(targets(l,v.placement))>0;});
 }catch{return false;}
}
function decode(data){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>im.width<=8192&&im.height<=8192&&im.width*im.height<=16000000?resolve(im):reject(new Error('그림 크기가 너무 커요.'));im.onerror=()=>reject(new Error('가구 그림을 읽지 못했어요.'));im.src=imageData(data);});}
export async function prepareRuntime(value){
 const runtime=validateRuntime(value),views={};
 for(const d of directions){const v=runtime.views[d];views[d]={...v,drawings:await Promise.all(v.drawings.map(async layer=>({...layer,image:await decode(layer.data)})))};}
 if(runtime.shapePolicy===1){
  const pictures=Object.fromEntries(directions.map(d=>[d,views[d].drawings.filter(l=>!l.registration).map(l=>l.image)]));
  for(const d of directions){if(!pictures[d].length)fail('검사할 본체 그림이 없어요.');for(const image of pictures[d]){const check=pictureShape(runtime.views[d],image,targets);if(!check.ok)fail(check.error);}}
  preparedPictures.set(runtime,pictures);
 }
 return {runtime,views,cache:new Map()};
}
export function renderRuntime(prepared,placement){
 const key=JSON.stringify(placement);if(prepared.cache.has(key))return prepared.cache.get(key);
 const v=prepared.views[placement.direction],p={...v.placement,...placement};
 if(!runtimePoseValid(prepared.runtime,p))fail('이 방향의 그림으로 놓을 수 없는 위치예요.');
 const scale=2,full=document.createElement('canvas');full.width=ROOM.width*scale;full.height=ROOM.height*scale;
 const ctx=full.getContext('2d');ctx.scale(scale,scale);
 for(const drawing of v.drawings){
  if(drawing.registration)drawDrapedLayer(ctx,drawing,p.direction,p,roomPoint);
  else if(v.pictureLayers)drawPictureLayers(ctx,drawing.image,v.pictureLayers,p,{requireCoverage:false,rules:v.pictureLayerRules});
  else if(v.mesh)drawMesh(ctx,drawing.image,v.mesh,p,{requireCoverage:false});
  else for(const layer of v.layers)drawWarp(ctx,drawing.image,layer.source,targets(layer,p),{steps:20});
 }
 const b=alphaBounds(full);if(!b)fail('표시할 가구 그림이 없어요.');
 const canvas=document.createElement('canvas');canvas.width=b.width;canvas.height=b.height;canvas.getContext('2d').drawImage(full,b.x,b.y,b.width,b.height,0,0,b.width,b.height);
 let anchors;
 if(v.mesh)anchors=projectMesh(v.mesh,p).points.filter(a=>a.kind==='physical'&&Math.abs(a.world.z)<1e-8).map(a=>a.target);
 else if(v.pictureLayers)anchors=projectPictureLayers(v.pictureLayers,p,v.pictureLayerRules).filter(l=>!l.hidden).flatMap(l=>l.projected.points.filter(a=>a.kind==='physical'&&Math.abs(a.world.z)<1e-8).map(a=>a.target));
 else anchors=v.layers.flatMap(l=>boundWorld(l,p)).filter(w=>Math.abs(w.z-(p.elevation??0))<1e-8).map(w=>roomPoint(w.x,w.y,w.z));
 anchors=anchors.filter((p,i,a)=>a.findIndex(q=>Math.hypot(q.x-p.x,q.y-p.y)<.01)===i);
 const result={left:b.x/scale,top:b.y/scale,width:b.width/scale,height:b.height/scale,anchors,canvas};
 if(prepared.cache.size>=3)prepared.cache.delete(prepared.cache.keys().next().value);prepared.cache.set(key,result);return result;
}
