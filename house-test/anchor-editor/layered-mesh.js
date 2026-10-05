import {normalizeMesh,projectMesh,drawMesh} from './mesh.js?v=20261005-itemmanifest1';
import {roomPoint} from './room-guide.js?v=20261005-itemmanifest1';

// Each layer owns triangles from the original picture. Destination overlap is
// intentional (for example, a rear leg behind the rim), but folds/overlap inside
// a layer are rejected by the same roomPoint mesh checks used by the editor.
const fail=message=>{throw new RangeError(message);};
export function normalizePictureLayers(layers,rules={}){
 if(!Array.isArray(layers)||!layers.length||layers.length>64)fail('그림 부위는 1개 이상 64개 이하로 등록하세요.');
 if(!rules||typeof rules!=='object'||rules.legCount!==undefined&&(!Number.isInteger(rules.legCount)||rules.legCount<1||rules.legCount>64)||rules.flatTop!==undefined&&typeof rules.flatTop!=='boolean')fail('등록한 가구 구조 확인 정보가 올바르지 않아요.');
 const seen=new Set();let count=0;
 const result=layers.map(layer=>{
  if(!layer||typeof layer.id!=='string'||!layer.id||layer.id.length>120||seen.has(layer.id)||layer.label!==undefined&&(typeof layer.label!=='string'||layer.label.length>120))fail('그림 부위의 이름 또는 고유 번호가 올바르지 않아요.');
  seen.add(layer.id);
  if(!Array.isArray(layer.mesh?.indices)||!layer.mesh.indices.length)fail('각 그림 부위에 삼각형 연결을 명시해 주세요.');
  count+=layer.mesh?.anchors?.length||0;if(count>512)fail('그림 부위의 기준점은 합계 512개까지 등록할 수 있어요.');
  if(layer.role!==undefined&&!['top','rim','leg'].includes(layer.role))fail('그림 부위의 구조 역할이 올바르지 않아요.');
  if(layer.visibility!==undefined&&(layer.visibility!=='front-facing'||layer.role!=='rim'))fail('그림 부위의 가림 정보가 올바르지 않아요.');
  const mesh=normalizeMesh(layer.mesh),contactIndices=layer.contactIndices;
  if(contactIndices!==undefined&&(!Array.isArray(contactIndices)||!contactIndices.length||new Set(contactIndices).size!==contactIndices.length||contactIndices.some(i=>!Number.isInteger(i)||i<0||i>=mesh.anchors.length)))fail('다리의 실제 접지점 번호가 올바르지 않아요.');
  if(layer.role==='top'&&mesh.anchors.some(a=>Math.abs(a.world.z-mesh.anchors[0].world.z)>1e-7))fail('상판 기준점의 높이가 서로 달라요. 평평한 상판을 한 높이에 등록하세요.');
  if(layer.role==='leg'&&(!contactIndices?.length||contactIndices.some(i=>mesh.anchors[i].kind!=='physical'||Math.abs(mesh.anchors[i].world.z)>1e-7)))fail('각 다리에 실제 바닥 접지점(z=0)을 따로 등록하세요.');
  return {id:layer.id,label:layer.label||layer.id,mesh,...(layer.role?{role:layer.role}:{}),...(contactIndices?{contactIndices:[...contactIndices]}:{}),...(layer.visibility?{visibility:layer.visibility}:{})};
 });
 if(rules.legCount!==undefined&&result.filter(l=>l.role==='leg').length!==rules.legCount)fail(`등록한 다리 ${rules.legCount}개의 부위와 접지점이 모두 필요해요.`);
 if(rules.flatTop===true&&!result.some(l=>l.role==='top'))fail('상판 부위가 빠졌어요. 원본 상판을 따로 등록하세요.');
 return result;
}
function hiddenRim(layer,placement){
 if(layer.visibility!=='front-facing')return null;
 const mesh=layer.mesh,ref=mesh.referenceDimensions,front=placement.direction==='center',sx=ref?(front?placement.width/ref.width:placement.depth/ref.depth):1,sy=ref?(front?placement.depth/ref.depth:placement.width/ref.width):1,sz=ref?placement.height/ref.height:1;
 const points=mesh.anchors.map(a=>{const world={x:a.world.x*sx,y:a.world.y*sy,z:a.world.z*sz};return {...a,world,target:roomPoint(placement.x+world.x,placement.y+world.y,world.z)};});
 if(!points.every(p=>Number.isFinite(p.target.x)&&Number.isFinite(p.target.y)))return null;
 const xs=points.map(p=>p.target.x),ys=points.map(p=>p.target.y),extent=Math.max(1,Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)),eps=extent*extent*1e-10;
 const back=mesh.indices.every(ids=>{const [a,b,c]=ids.map(i=>points[i].target);return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)<=eps;});
 return back?{...mesh,points,triangles:[]}:null;
}
export function projectPictureLayers(layers,placement,rules){return normalizePictureLayers(layers,rules).map(layer=>{const hidden=hiddenRim(layer,placement);return {...layer,...(hidden?{hidden:true}:{}),projected:hidden||projectMesh(layer.mesh,placement)};});}
export function validatePictureLayers(layers,placement,rules){try{placement?projectPictureLayers(layers,placement,rules):normalizePictureLayers(layers,rules);return {ok:true,error:null};}catch(error){return {ok:false,error:error.message};}}

function pixelsOf(image){
 if(image?.data?.length===image.width*image.height*4)return image;
 const width=image?.naturalWidth||image?.width,height=image?.naturalHeight||image?.height;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width*height>32000000)fail('그림 크기가 올바르지 않아요.');
 const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(width,height):document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);return ctx.getImageData(0,0,width,height);
}
// Count every pixel cell touched by the source triangle union. A row-strip scan
// avoids canvas antialias seams counting shared edges as missing art. Alpha < 8
// is generated-image fringe, not a physical part or an image-margin anchor.
export function pictureLayersCoverage(image,layers){
 const normalized=normalizePictureLayers(layers),{width,height,data}=pixelsOf(image);
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width*height>32000000)fail('그림 크기가 올바르지 않아요.');
 const covered=new Uint8Array(width*height);
 for(const {mesh}of normalized)for(const ids of mesh.indices){
  const triangle=ids.map(i=>mesh.anchors[i].source),top=Math.max(0,Math.floor(Math.min(...triangle.map(p=>p.y)))),bottom=Math.min(height-1,Math.ceil(Math.max(...triangle.map(p=>p.y)))-1);
  for(let y=top;y<=bottom;y++){
   let poly=triangle;
   for(const [boundary,above]of [[y,true],[y+1,false]]){
    const next=[];
    for(let i=0;i<poly.length;i++){
     const p=poly[i],q=poly[(i+1)%poly.length],dp=above?p.y-boundary:boundary-p.y,dq=above?q.y-boundary:boundary-q.y;
     if(dp>=0)next.push(p);
     if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);next.push({x:p.x+t*(q.x-p.x),y:boundary});}
    }
    poly=next;if(!poly.length)break;
   }
   if(poly.length<3)continue;
   let area=0;for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];area+=p.x*q.y-p.y*q.x;}
   if(Math.abs(area)<2e-12)continue;
   const left=Math.max(0,Math.floor(Math.min(...poly.map(p=>p.x))+1e-9)),right=Math.min(width,Math.ceil(Math.max(...poly.map(p=>p.x))-1e-9));
   if(right>left)covered.fill(1,y*width+left,y*width+right);
  }
 }
 let total=0,missing=0,left=width,right=-1,top=height,bottom=-1;
 for(let i=0;i<covered.length;i++)if(data[i*4+3]>=8){total++;if(!covered[i]){missing++;const x=i%width,y=Math.floor(i/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
 return {ok:total>0&&missing===0,total,covered:total-missing,missing,alphaThreshold:8,bounds:missing?{x:left,y:top,width:right-left+1,height:bottom-top+1}:null};
}
export function drawPictureLayers(ctx,image,layers,placement,{requireCoverage=true,rules}={}){
 let projected;try{projected=projectPictureLayers(layers,placement,rules);if(requireCoverage&&!pictureLayersCoverage(image,layers).ok)return false;}catch{return false;}
 for(const layer of projected)if(!layer.hidden&&!drawMesh(ctx,image,layer.mesh,placement,{requireCoverage:false}))return false;
 return true;
}
export function pictureLayerRegistrations(layers,placement,bounds,rules){
 return projectPictureLayers(layers,placement,rules).map(({id,label,role,visibility,hidden,contactIndices,projected})=>({id,label,...(role?{role}:{}),...(visibility?{visibility,hidden:!!hidden}:{}),...(contactIndices?{contactIndices:[...contactIndices]}:{}),kind:'mesh',placement:{...placement},referenceDimensions:{width:placement.width,depth:placement.depth,height:placement.height},indices:projected.indices,anchors:projected.points.map(v=>({source:{x:v.target.x-bounds.x,y:v.target.y-bounds.y},world:{...v.world},kind:v.kind,label:v.label||''})),bounds:{...bounds}}));
}

const digestCache=new Map();
/** Restore a measured registration only for byte-identical original PNG data.
 * A filename, similar silhouette or inferred number of legs is never evidence.
 */
export async function knownPictureRegistration(data,registry){
 if(typeof data!=='string'||!data.startsWith('data:image/png;base64,')||!globalThis.crypto?.subtle)return null;
 if(!digestCache.has(data)){
  if(digestCache.size>=12)digestCache.delete(digestCache.keys().next().value);
  digestCache.set(data,crypto.subtle.digest('SHA-256',Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0))).then(bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')));
 }
 const sha=await digestCache.get(data);
 for(const [direction,value]of Object.entries(registry))if(value.sourceSha256===sha){
  const check=validatePictureLayers(value.pictureLayers,value.placement,value.pictureLayerRules);if(!check.ok)throw new Error(check.error);
  return {direction,...value};
 }
 return null;
}
export async function recoverKnownPictureProject(project,registry){
 if(!project?.source?.data||project.pictureLayers)return {project,recovered:false};
 const known=await knownPictureRegistration(project.source.data,registry);if(!known)return {project,recovered:false};
 if(project.placement?.direction!==known.direction)throw new Error('원본 PNG의 등록 방향과 작업 방향이 달라요. 원본에 맞는 방향으로 다시 넣어 주세요.');
 const result=JSON.parse(JSON.stringify(project));delete result.mesh;
 result.pictureLayers=JSON.parse(JSON.stringify(known.pictureLayers));result.pictureLayerRules={...known.pictureLayerRules};result.cutout=JSON.parse(JSON.stringify(known.cutout));
 result.placement={...known.placement,x:project.placement.x,y:project.placement.y};
 return {project:result,recovered:true};
}
