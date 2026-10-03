import {recoverKnownChairProject} from '../chair-straight-regions.js?v=20261004-chairfront1';
import {validQuad,homography,project,drawWarp} from './warp.js?v=20261004-chairfront1';
import {ROOM,FLOOR,roomPoint,roomPlaneWorld,drawRoomGrid,nearestGridPoint} from './room-guide.js?v=20261004-chairfront1';
import {createCutout,alphaBounds,validatePolygon} from './cutout.js?v=20261004-chairfront1';
import {ROOM_IMAGE,REFERENCE_IMAGE} from './resources.js?v=20261004-chairfront1';
import {makeZip} from './zip.js?v=20261004-chairfront1';
import {generationGuide} from './ai-guide.js?v=20261004-chairfront1';
import {normalizeMesh,validateMesh,projectMesh,drawMesh,meshCoverage} from './mesh.js?v=20261004-chairfront1';
import {normalizePictureLayers,validatePictureLayers,projectPictureLayers,pictureLayersCoverage,drawPictureLayers,pictureLayerRegistrations,knownPictureRegistration,recoverKnownPictureProject} from './layered-mesh.js?v=20261004-chairfront1';
import {COFFEE_TABLE_V1} from '../coffee-table-v1-registration.js?v=20261004-chairfront1';
import {objectMetadata,OBJECT_USAGES,USAGE_LABELS} from './object-metadata.js?v=20261004-chairfront1';
import {PICTURE_LIBRARY} from './accessory-library.js?v=20261004-chairfront1';
import {createParts,normalizeParts,renderParts,getPartCanvases,getRenderOrder} from './parts.js?v=20261004-chairfront1';
import {mountPartsEditor} from './parts-editor.js?v=20261004-chairfront1';
import {hasDrapedObjects,drapedPartsPlan,drawDrapedLayer,upgradeSofaBlankets} from './draped-parts.js?v=20261004-chairfront1';
import {inferDirection,inferTarget,presetMetadata,planBatch,canAutoPrepare} from './automation.js?v=20261004-chairfront1';
import {mountSimpleEditor} from './simple-editor.js?v=20261004-chairfront1';

const $=id=>document.getElementById(id);
// Editable state is a tree of JSON values. Copy its mutable containers while
// reusing immutable strings, so every undo step does not duplicate image data.
const clone=value=>Array.isArray(value)?value.map(clone):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,clone(item)])):value;
const freshLayer=(n=1)=>({id:crypto.randomUUID?.()||String(Date.now()+n),name:`그림 영역 ${n}`,source:[],target:[],binding:null});
const DIRECTIONS=['left','center','right'];
const LABELS={left:'좌측',center:'정면',right:'우측'};
let aiConnection=null,aiRunning=false,aiCheckVersion=0,partsUI=null,simpleUI=null;
const partImageCache=new Map();
let shared={name:'새 가구',width:3,depth:1,height:1.4,...objectMetadata()},activeView='right';
const fresh=(direction='right')=>({format:'ojjuda-furniture',version:1,name:shared.name,...objectMetadata(shared),source:null,cutout:{polygon:[],strokes:[]},layers:[freshLayer()],placement:{direction,x:direction==='left'?0:direction==='center'?(FLOOR.width-shared.width)/2:FLOOR.width-shared.depth,y:direction==='center'?0:Math.min(3.5,FLOOR.depth-shared.width),width:shared.width,depth:shared.depth,height:shared.height}});
const freshSlot=direction=>({state:fresh(direction),selected:0,meshSelected:0,sourceImage:null,baseCutout:null,cutout:null,history:[],polygonDraft:[],tool:'points',camera:{source:{zoom:1,pan:{x:0,y:0}},room:{zoom:1,pan:{x:0,y:0}}},preview:null});
const slots=Object.fromEntries(DIRECTIONS.map(d=>[d,freshSlot(d)]));
let state=fresh(),selected=0,meshSelected=0,tool='points',sourceImage=null,baseCutout=null,cutout=null,background=null,history=[],polygonDraft=[],gesture=null,dirty=false,renderPending=false,cutPending=false,loading=false,noticeTimer;
const views={source:{zoom:1,pan:{x:0,y:0}},room:{zoom:1,pan:{x:0,y:0}}};
const cvs={source:$('source-canvas'),room:$('room-canvas')};
const readyFor=(l,p)=>l.source.length===4&&validQuad(l.source)&&validQuad(targetFor(l,p));
const ready=l=>readyFor(l,state.placement);
const layer=()=>state.layers[selected];
const unitQuad=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
const offsetExtent=(plane,p=state.placement)=>p[plane==='front'?'depth':plane==='side'?'width':'height'];
function clampOffsets(){for(const l of state.layers)if(l.binding)l.binding.offset=Math.max(0,Math.min(offsetExtent(l.binding.plane),l.binding.offset??0));}
function planeWorld(l,p=state.placement){
 const plane=l.binding.plane,q=roomPlaneWorld({...p,plane}),offset=l.binding.offset??0;
 const axis=plane==='top'?'z':plane==='front'?(p.direction==='center'?'y':'x'):(p.direction==='center'?'x':'y');
 const delta=plane==='front'&&p.direction==='right'?offset:-offset;
 return q.map(point=>({...point,[axis]:point[axis]+delta}));
}
function boundWorld(l,p=state.placement){
 const q=planeWorld(l,p);
 return (l.binding.uv||unitQuad).map(({x:u,y:v})=>Object.fromEntries(['x','y','z'].map(k=>[k,q[0][k]+u*(q[1][k]-q[0][k])+v*(q[3][k]-q[0][k])])));
}
const targetFor=(l,p)=>l.binding?boundWorld(l,p).map(p=>roomPoint(p.x,p.y,p.z)):l.target;
const target=l=>targetFor(l,state.placement);
const message=text=>{$('notice').textContent=text;$('notice').classList.add('show');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').classList.remove('show'),5500);};
function mark(){dirty=true;slots[activeView].preview=null;$('save-status').textContent='파일 저장 전';simpleUI?.schedule();}
function storeActive(){Object.assign(slots[activeView],{state,selected,meshSelected,sourceImage,baseCutout,cutout,history,polygonDraft,tool,camera:clone(views)});}
function loadActive(direction){activeView=direction;const slot=slots[direction];({state,selected,meshSelected=0,sourceImage,baseCutout,cutout,history,polygonDraft,tool}=slot);for(const k of ['source','room']){views[k]=clone(slot.camera[k]);$(k+'-zoom').value=views[k].zoom*100;}}
function switchView(direction){
 if(!DIRECTIONS.includes(direction)||direction===activeView)return;
 if(loading||gesture){$('direction').value=activeView;message('현재 작업이 끝난 뒤 방향을 바꿔 주세요.');return;}
 storeActive();loadActive(direction);if(document.body.dataset.mode==='simple'&&tool==='points')tool='inspect';sync();
}
function applyShared(){
 storeActive();
 for(const slot of Object.values(slots)){
  const apply=p=>{p.name=shared.name;Object.assign(p,objectMetadata(shared));Object.assign(p.placement,{width:shared.width,depth:shared.depth,height:shared.height});clampPlacement(p.placement);for(const l of p.layers)if(l.binding)l.binding.offset=Math.min(offsetExtent(l.binding.plane,p.placement),l.binding.offset??0);};
  apply(slot.state);slot.history.forEach(apply);slot.preview=null;
 }
}
const meshCoverCache=new WeakMap();
const pictureLayersCoverCache=new WeakMap();
const partsPlaneCoverCache=new WeakMap();
const drapePlanCache=new WeakMap();
function drapePlan(p,masked){
 if(!hasDrapedObjects(p.parts))return null;
 let plan=drapePlanCache.get(masked);
 if(!plan){const base=p===state?baseCutout:slots[p.placement.direction].baseCutout;plan=drapedPartsPlan(base,p.parts,partsImages(p.parts));drapePlanCache.set(masked,plan);}
 return plan;
}
function parentPicture(p,masked){return drapePlan(p,masked)?.parentImage||masked;}
function drawFurniture(ctx,p,masked,steps=32){
 if(!masked||!partsPlaneCoverage(p,masked).ok)return;
 const plan=drapePlan(p,masked),parent=plan?.parentImage||masked;
 if(p.pictureLayers&&(!validatePictureLayers(p.pictureLayers,p.placement,p.pictureLayerRules).ok||!cachedPictureLayersCoverage(parent,p.pictureLayers).ok))return;
 if(p.mesh&&(!meshProjection(p)||!cachedMeshCoverage(parent,p.mesh).ok))return;
 const drawParent=image=>{if(p.pictureLayers)drawPictureLayers(ctx,image,p.pictureLayers,p.placement,{requireCoverage:false,rules:p.pictureLayerRules});else if(p.mesh)drawMesh(ctx,image,p.mesh,p.placement,{requireCoverage:false});else for(const l of p.layers)if(readyFor(l,p.placement))drawWarp(ctx,image,l.source,targetFor(l,p.placement),{steps});};
 if(plan)for(const entry of plan.layers){if(entry.registration)drawDrapedLayer(ctx,entry,p.placement.direction,p.placement,roomPoint);else drawParent(entry.image);}
 else drawParent(masked);
}
function partsPlaneCoverage(p,masked){
 if(!p.parts||p.mesh||p.pictureLayers||!masked)return {ok:true,missing:0};
 masked=parentPicture(p,masked);
 const quads=p.layers.filter(l=>readyFor(l,p.placement)).map(l=>l.source),key=JSON.stringify(quads),previous=partsPlaneCoverCache.get(masked);
 if(previous?.key===key)return previous.value;
 const coverage=document.createElement('canvas');coverage.width=masked.width;coverage.height=masked.height;
 const ctx=coverage.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';
 for(const q of quads){path(ctx,q);ctx.fill();}
 const alpha=ctx.getImageData(0,0,coverage.width,coverage.height).data,pixels=masked.getContext('2d').getImageData(0,0,masked.width,masked.height).data;let missing=0;
 for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0&&alpha[i]<128)missing++;
 const value={ok:missing===0,missing};partsPlaneCoverCache.set(masked,{key,value});return value;
}
function cachedMeshCoverage(image,mesh){const key=JSON.stringify({points:mesh.anchors.map(a=>a.source),indices:mesh.indices});const previous=meshCoverCache.get(image);if(previous?.key===key)return previous.value;const value=meshCoverage(image,mesh);meshCoverCache.set(image,{key,value});return value;}
function cachedPictureLayersCoverage(image,layers){const key=JSON.stringify(layers.map(l=>({id:l.id,points:l.mesh.anchors.map(a=>a.source),indices:l.mesh.indices}))),previous=pictureLayersCoverCache.get(image);if(previous?.key===key)return previous.value;const value=pictureLayersCoverage(image,layers);pictureLayersCoverCache.set(image,{key,value});return value;}
function pictureLayersPoints(p=state){try{return projectPictureLayers(p.pictureLayers,p.placement,p.pictureLayerRules).flatMap(l=>l.projected.points.map(a=>a.target));}catch{return [];}}
function meshProjection(p=state){try{return p.mesh?projectMesh(p.mesh,p.placement):null;}catch{return null;}}
function meshPoints(p=state){return meshProjection(p)?.points.map(v=>v.target)||[];}
function previewFor(direction){
 const slot=slots[direction];if(slot.preview)return slot.preview;
 let status='이미지 필요',ready=false,result=null;
 if(slot.sourceImage){
  const p=slot.state;
  if(p.pictureLayers){
   const check=validatePictureLayers(p.pictureLayers,p.placement,p.pictureLayerRules);status=check.ok?'외곽 그림 확인 필요':'부위 기준점 확인 필요';
   if(check.ok){const coverage=cachedPictureLayersCoverage(parentPicture(p,slot.cutout),p.pictureLayers);if(coverage.ok){result=cropped(furnitureCanvas(1,p,slot.cutout));if(result){status='준비';ready=true;}}else status='부위 그림 누락';}
  }else if(p.mesh){
   const check=validateMesh(p.mesh,p.placement);status=check.ok?'외곽 그림 확인 필요':'기준점 확인 필요';
   if(check.ok){const coverage=cachedMeshCoverage(parentPicture(p,slot.cutout),p.mesh);if(coverage.ok){result=cropped(furnitureCanvas(1,p,slot.cutout));if(result){status='준비';ready=true;}}else status='외곽 그림 누락';}
  }else{
   const valid=p.layers.length>0&&p.layers.every(l=>readyFor(l,p.placement));
   status=!valid?'점 지정 필요':p.layers.some(l=>!l.binding)?'격자 연결 필요':'그림 확인 필요';
   if(p.layers.some(l=>readyFor(l,p.placement)))result=cropped(furnitureCanvas(1,p,slot.cutout));
   if(valid&&p.layers.every(l=>!!l.binding)&&result){status='준비';ready=true;}
   if(!partsPlaneCoverage(p,slot.cutout).ok){status='부위·물건 등록 범위 부족';ready=false;result=null;}
  }
  if(p.provenance?.kind==='ai'&&!p.provenance.reviewed){status='AI 그림 · 확인 필요';ready=false;}
  if(!result)result=cropped(slot.cutout);
 }
 return slot.preview={status,ready,result};
}
function syncSet(){
 storeActive();let count=0;
 for(const direction of DIRECTIONS){
  const p=previewFor(direction),canvas=$('preview-'+direction),ctx=canvas.getContext('2d');count+=p.ready?1:0;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(p.result){const img=p.result.canvas,k=Math.min((canvas.width-16)/img.width,(canvas.height-16)/img.height);ctx.drawImage(img,(canvas.width-img.width*k)/2,(canvas.height-img.height*k)/2,img.width*k,img.height*k);}
  $('status-'+direction).textContent=p.status;$('status-'+direction).dataset.state=slots[direction].state.provenance?.kind==='ai'&&!slots[direction].state.provenance.reviewed?'review':p.ready?'ready':'missing';
  document.querySelectorAll('[data-view="'+direction+'"]').forEach(b=>{b.classList.toggle('active',direction===activeView);b.setAttribute('aria-pressed',String(direction===activeView));});
 }
 $('set-summary').textContent=`원본 그림 ${DIRECTIONS.filter(d=>!!slots[d].sourceImage).length}/3 · 격자 연결 ${count}/3${count===3?' · 세트 내보내기 가능':' · 격자 미등록 그림도 작업 파일에 저장돼요'}`;
 $('export-set').disabled=count!==3||loading||!!gesture;
 for(const id of ['studio-apply','studio-preview'])if($(id))$(id).disabled=count!==3||loading||!!gesture||shared.usage!=='floor';
 $('export-parts').disabled=!DIRECTIONS.some(d=>slots[d].state.parts)||loading||!!gesture;
 $('export-picture-set').disabled=!DIRECTIONS.every(d=>!!slots[d].sourceImage)||loading||!!gesture;
 $('picture-export-warning').textContent=count===3?'원본 그림 ZIP에는 격자에 맞추기 전의 입력 그림 3장이 들어갑니다. 배치 그림은 격자 연결 세트로 저장하세요.':'격자 미등록 또는 검수 전 그림입니다. 그림 ZIP은 원본 3장과 작업 파일만 저장하며, 실제 방 배치 완료를 뜻하지 않습니다.';
 $('save-project').disabled=!DIRECTIONS.some(d=>!!slots[d].sourceImage)||loading||!!gesture;
 syncAI();
}
function clampPlacement(p){const sw=p.direction==='center'?p.width:p.depth,sd=p.direction==='center'?p.depth:p.width;p.x=Math.max(0,Math.min(FLOOR.width-sw,p.x));p.y=Math.max(0,Math.min(FLOOR.depth-sd,p.y));}

function checkpoint(){history.push(clone(state));if(history.length>40)history.shift();$('undo').disabled=false;mark();}
function cut(){cutPending=false;if(sourceImage){baseCutout=createCutout(sourceImage,state.cutout.polygon,state.cutout.strokes);cutout=state.parts?renderParts(baseCutout,state.parts,partsImages(state.parts)):baseCutout;}}
// Keep every brush point, but rebuild the native-resolution image only once per
// displayed frame. Gesture completion flushes it before previews or saves run.
function redraw(){if(!renderPending){renderPending=true;requestAnimationFrame(()=>{renderPending=false;if(cutPending)cut();draw('source');draw('room');});}}
function dimensions(kind){return kind==='room'?{width:ROOM.width,height:ROOM.height}:{width:sourceImage?.naturalWidth||900,height:sourceImage?.naturalHeight||700};}
function camera(kind){const c=cvs[kind],r=c.getBoundingClientRect(),d=dimensions(kind),v=views[kind],s=Math.min((r.width-32)/d.width,(r.height-32)/d.height)*v.zoom;return {s,x:(r.width-d.width*s)/2+v.pan.x,y:(r.height-d.height*s)/2+v.pan.y,w:r.width,h:r.height};}
function pointAt(kind,e){const r=cvs[kind].getBoundingClientRect(),v=camera(kind);return {x:(e.clientX-r.left-v.x)/v.s,y:(e.clientY-r.top-v.y)/v.s};}
function path(ctx,points,close=true){if(!points.length)return;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))ctx.lineTo(p.x,p.y);if(close)ctx.closePath();}
function anchors(ctx,points,scale,color='#7755a5',complete=true,connect=true){
 if(!points.length)return;ctx.strokeStyle=color;ctx.lineWidth=1.5/scale;if(connect){path(ctx,points,complete&&points.length===4);ctx.stroke();}
 for(let i=0;i<points.length;i++){const p=points[i];ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,8/scale,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ffffff';ctx.lineWidth=2/scale;ctx.stroke();ctx.fillStyle='#ffffff';ctx.font=`600 ${11/scale}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1),p.x,p.y+.4/scale);}
}
function draw(kind){
 const canvas=cvs[kind],v=camera(kind);if(v.w<=0||v.h<=0)return;const dpr=Math.min(devicePixelRatio||1,2),w=Math.round(v.w*dpr),h=Math.round(v.h*dpr);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,v.w,v.h);ctx.save();ctx.translate(v.x,v.y);ctx.scale(v.s,v.s);
 if(kind==='source'){
  if(sourceImage){
   if($('compare-original').checked){ctx.globalAlpha=.28;ctx.drawImage(sourceImage,0,0);ctx.globalAlpha=1;}
   ctx.drawImage(partsUI?.sourcePreview(cutout)||cutout,0,0);
   if(tool==='part-outline'&&partsUI?.polygon().length){ctx.strokeStyle='#d88b39';ctx.lineWidth=2/v.s;path(ctx,partsUI.polygon());ctx.stroke();}
   if(tool==='outline'||tool==='part-outline'){anchors(ctx,polygonDraft,v.s,'#248779',false);if(polygonDraft.length>2){ctx.fillStyle='#24877922';path(ctx,polygonDraft);ctx.fill();}}
   else if(tool==='object'&&partsUI?.selectedRect()){const r=partsUI.selectedRect();ctx.strokeStyle='#248779';ctx.lineWidth=2/v.s;ctx.strokeRect(r.x,r.y,r.width,r.height);}
   else if(tool==='inspect'){}
   else if(state.pictureLayers){for(const part of state.pictureLayers)anchors(ctx,part.mesh.anchors.map(a=>a.source),v.s,'#248779',false,false);}
   else if(state.mesh){anchors(ctx,state.mesh.anchors.map(a=>a.source),v.s,'#248779',false,false);}
   else {state.layers.forEach((l,i)=>{if(i!==selected&&l.source.length===4){ctx.strokeStyle='#8b899580';ctx.lineWidth=1/v.s;path(ctx,l.source);ctx.stroke();}});anchors(ctx,layer().source,v.s,layer().source.length===4&&!validQuad(layer().source)?'#bf4650':undefined);}
  }else {ctx.restore();ctx.fillStyle='#777180';ctx.textAlign='center';ctx.font='16px sans-serif';ctx.fillText('그림을 넣으면 여기에서 편집할 수 있어요',v.w/2,v.h/2);return;}
 }else{
  if(background)ctx.drawImage(background,0,0,ROOM.width,ROOM.height);
  if($('grid-visible').checked)drawRoomGrid(ctx,{opacity:.34});
  if(cutout){ctx.globalAlpha=Number($('opacity').value)/100;drawFurniture(ctx,state,cutout,gesture?12:20);ctx.globalAlpha=1;}
  const curved=!!(state.mesh||state.pictureLayers),t=state.pictureLayers?pictureLayersPoints():state.mesh?meshPoints():target(layer());if(document.body.dataset.mode!=='simple')anchors(ctx,t,v.s,curved?'#248779':t.length===4&&!validQuad(t)?'#bf4650':undefined,!curved,!curved);
  if(document.body.dataset.mode!=='simple'&&!curved&&t.length===4&&validQuad(t)){ctx.font=`500 ${11/v.s}px sans-serif`;ctx.fillStyle='#55336b';for(let i=0;i<4;i++){const a=t[i],b=t[(i+1)%4],angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;ctx.fillText(`${angle.toFixed(1)}°`,(a.x+b.x)/2,(a.y+b.y)/2-12/v.s);}}
 }
 ctx.restore();
}
function resetViews(){for(const k of ['source','room']){views[k]={zoom:1,pan:{x:0,y:0}};$(k+'-zoom').value=100;}redraw();}
function horizontalValue(){const p=state.placement;return Math.round((p.direction==='right'?FLOOR.width-p.depth-p.x:p.x)*1e6)/1e6;}
function horizontalPosition(value){const p=state.placement;return p.direction==='right'?FLOOR.width-p.depth-value:value;}
function boundPlacement(){const p=state.placement,sw=p.direction==='center'?p.width:p.depth,sd=p.direction==='center'?p.depth:p.width;clampPlacement(p);$('pos-x').max=String(FLOOR.width-sw);$('pos-y').max=String(FLOOR.depth-sd);}
function sync(){
 boundPlacement();$('furniture-name').value=state.name;const l=layer();$('layer-select').replaceChildren(...state.layers.map((l,i)=>new Option(l.name,String(i),false,i===selected)));
 $('object-type').value=shared.objectType;$('object-usage').replaceChildren(...OBJECT_USAGES[shared.objectType].map(u=>new Option(USAGE_LABELS[u],u,false,u===shared.usage)));
 $('library-note').textContent=shared.dimensionStatus==='suggested'?'불러온 그림의 크기는 임시값입니다. 실제 그림 기준점을 등록하고 방에서 배치를 확인해 주세요.':'개체 하나에 좌측·정면·우측 그림이 들어 있습니다. 준비된 그림은 격자 기준점 미등록 상태로 열립니다.';
 for(const k of ['width','depth','height','direction'])$(k).value=state.placement[k];
 $('pos-x-label').textContent=state.placement.direction==='center'?'좌우 위치':'벽 간격';$('pos-x').value=horizontalValue();$('pos-y').value=state.placement.y;$('pos-x-value').textContent=horizontalValue()+'칸';$('pos-y-value').textContent=state.placement.y+'칸';
 $('plane').value=l.binding?.plane||$('plane').value||'front';$('grid-bind').classList.toggle('active',!!l.binding);$('free-mode').classList.toggle('active',!l.binding);
 $('plane-offset').value=l.binding?.offset??0;$('plane-offset').max=String(offsetExtent($('plane').value));$('plane-offset').disabled=!!(state.mesh||state.pictureLayers)||!l.binding;$('plane').disabled=!!(state.mesh||state.pictureLayers);$('grid-bind').disabled=!!(state.mesh||state.pictureLayers);$('free-mode').disabled=!!(state.mesh||state.pictureLayers);
 $('delete-layer').disabled=state.layers.length===1;$('layer-up').disabled=selected===state.layers.length-1;$('layer-down').disabled=selected===0;
 $('undo').disabled=!history.length&&!polygonDraft.length;$('save-project').disabled=!sourceImage;$('export-cutout').disabled=!sourceImage;$('export-png').disabled=!sourceImage||(state.pictureLayers?!validatePictureLayers(state.pictureLayers,state.placement,state.pictureLayerRules).ok:state.mesh?!validateMesh(state.mesh,state.placement).ok:!state.layers.some(ready));
 $('source-hint').textContent=tool==='inspect'?'그림을 확인하고, 필요한 부위의 윤곽만 찍어 주세요.':tool==='object'?'선택한 물건을 끌어 놓으세요. 크기는 비율 유지 막대로 조절해요.':tool==='part-outline'?`선택한 부위의 윤곽을 둘레 순서로 찍어 주세요 · ${polygonDraft.length}점`:tool==='outline'?`가구의 외곽을 따라 찍어 주세요 · ${polygonDraft.length}점`:tool==='erase'?'주변을 문질러 지워 주세요. 원본은 남아 있어요.':tool==='restore'?'지운 부분을 문질러 되돌려 주세요.':tool==='pan'?'그림과 방을 끌어 화면을 옮겨 보세요.':state.pictureLayers?`등록된 그림 부위 ${state.pictureLayers.length}개를 함께 확인하세요.`:state.mesh?`실제 접지점·봉제선 끝·곡선 외곽을 찍고 칸 좌표를 입력하세요 · ${state.mesh.anchors.length}점`:`실제 모서리를 둘레 순서로 찍어 주세요 · ${l.source.length}/4`;
 $('room-hint').textContent=state.pictureLayers?'각 부위의 실제 기준점을 방 격자에 연결했어요. 이동 막대로 접지와 가림을 확인하세요.':state.mesh?'곡선 기준점은 실제 방 좌표로 투영돼요. 그림에서 각 점과 실루엣을 확인하세요.':l.binding?'격자 연결됨 · 위치와 크기를 바꾸면 함께 맞춰져요.':'점 1~4를 끌어 원하는 각도에 맞추세요.';
 $('check-warning').hidden=!!(state.mesh||state.pictureLayers)||!(l.source.length===4&&!validQuad(l.source)||target(l).length===4&&!validQuad(target(l)));
 $('check-warning').textContent='점이 교차하거나 겹쳤어요. 둘레 순서로 다시 맞춰 주세요.';
 if(!partsPlaneCoverage(state,cutout).ok){$('check-warning').hidden=false;$('check-warning').textContent='부위·물건 일부가 등록한 면 밖에 있어요. 전체 그림을 덮는 면이나 곡선 기준점을 등록해야 방 그림을 저장할 수 있습니다. 원본 합성과 부위 ZIP은 저장할 수 있어요.';$('room-hint').textContent='전체 부위·물건의 기준점 등록이 필요해요. 일부만 사라진 방 그림은 내보내지 않습니다.';$('export-png').disabled=true;}
 $('finish-outline').disabled=tool!=='outline'||polygonDraft.length<3;$('points-list').replaceChildren();
 if(!state.mesh&&!state.pictureLayers)l.source.forEach((p,i)=>{const row=document.createElement('div');row.className='point-row';const label=document.createElement('span');label.textContent=String(i+1);row.append(label);for(const axis of ['x','y']){const input=document.createElement('input');input.type='number';input.step='.1';input.min='0';input.max=String(axis==='x'?sourceImage.naturalWidth:sourceImage.naturalHeight);input.value=p[axis].toFixed(1);input.setAttribute('aria-label',`원본 점 ${i+1} ${axis}`);input.onchange=()=>{const n=Number(input.value);if(!Number.isFinite(n))return;checkpoint();p[axis]=Math.max(0,Math.min(Number(input.max),n));sync();redraw();};row.append(input);}$('points-list').append(row);});
 document.querySelectorAll('[data-tool]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.tool===tool));b.classList.toggle('active',b.dataset.tool===tool);});
 syncMeshControls();partsUI?.sync();syncSet();if(document.body.dataset.mode==='simple'&&$('check-warning').hidden)$('room-hint').textContent=slots[activeView].preview?.ready?'이동 막대로 부위와 물건을 함께 옮겨 확인하세요. 겹침과 접지는 그림으로 확인해야 해요.':'격자 등록과 원근 확인이 필요해요. 고급 설정에서 실제 기준점을 연결하세요.';simpleUI?.sync();redraw();
}
function useTool(next){const pending=polygonDraft.length;tool=next;polygonDraft=[];if(pending)simpleUI?.schedule();sync();}
function defaultTarget(points){const xs=points.map(p=>p.x),ys=points.map(p=>p.y),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;const k=Math.min(350/(Math.max(...xs)-Math.min(...xs)||1),340/(Math.max(...ys)-Math.min(...ys)||1)),center=roomPoint(7,4,.8);return points.map(p=>({x:center.x+(p.x-cx)*k,y:center.y+(p.y-cy)*k}));}
function nearest(points,p,kind){const s=camera(kind).s;let result=-1,best=22;points.forEach((v,i)=>{const d=Math.hypot(v.x-p.x,v.y-p.y)*s;if(d<best){best=d;result=i;}});return result;}
function sourceClamp(p){return {x:Math.max(0,Math.min(sourceImage.naturalWidth,p.x)),y:Math.max(0,Math.min(sourceImage.naturalHeight,p.y))};}
for(const kind of ['source','room']){
 const c=cvs[kind];c.addEventListener('pointerdown',e=>{
  if(loading||gesture)return;c.setPointerCapture(e.pointerId);const p=pointAt(kind,e);
  if(tool==='pan'||e.button===1){gesture={kind,type:'pan',id:e.pointerId,client:{x:e.clientX,y:e.clientY},pan:{...views[kind].pan}};return;}
  if(!sourceImage)return;
  if(kind==='room'&&document.body.dataset.mode==='simple')return;
  if(kind==='source'&&tool==='object'){const rect=partsUI?.hit(p);if(rect){checkpoint();gesture={kind,type:'object',id:e.pointerId,point:p,rect};}return;}
  if(tool==='inspect')return;
  if(kind==='source'&&(tool==='outline'||tool==='part-outline')){polygonDraft.push(sourceClamp(p));mark();sync();return;}
  if(kind==='source'&&(tool==='erase'||tool==='restore')){checkpoint();const stroke={points:[sourceClamp(p)],radius:Number($('brush-size').value),restore:tool==='restore'};state.cutout.strokes.push(stroke);gesture={kind,type:'brush',id:e.pointerId,stroke};cut();redraw();return;}
  if(state.pictureLayers)return;
  if(state.mesh){
   const points=kind==='source'?state.mesh.anchors.map(a=>a.source):meshPoints(),index=nearest(points,p,kind);
   if(index>=0){checkpoint();meshSelected=index;gesture={kind,type:'mesh-anchor',id:e.pointerId,index};return;}
   if(kind==='source'&&tool==='points'){if(state.mesh.anchors.length>=512){message('기준점은 최대 512개까지 지정할 수 있어요.');return;}checkpoint();state.mesh.anchors.push({source:sourceClamp(p),world:{x:null,y:null,z:null},kind:'physical',label:`기준점 ${state.mesh.anchors.length+1}`});delete state.mesh.indices;meshSelected=state.mesh.anchors.length-1;sync();}
   return;
  }
  const l=layer(),points=kind==='source'?l.source:target(l),index=nearest(points,p,kind);
  if(index>=0){checkpoint();gesture={kind,type:'anchor',id:e.pointerId,index};return;}
  if(kind==='source'&&tool==='points'&&l.source.length<4){checkpoint();l.source.push(sourceClamp(p));if(l.source.length===4){l.target=defaultTarget(l.source);message(validQuad(l.source)?'네 점을 찍었어요. 오른쪽에서 격자에 맞추거나 점을 끌어 주세요.':'점이 교차했어요. 둘레 순서로 고쳐 주세요.');}sync();}
 });
 c.addEventListener('pointermove',e=>{if(!gesture||gesture.kind!==kind||gesture.id!==e.pointerId)return;
  if(gesture.type==='pan'){views[kind].pan={x:gesture.pan.x+e.clientX-gesture.client.x,y:gesture.pan.y+e.clientY-gesture.client.y};redraw();return;}
  let p=pointAt(kind,e);if(kind==='source'&&!(gesture.type==='mesh-anchor'&&state.mesh?.anchors[gesture.index]?.kind==='support'))p=sourceClamp(p);
  if(gesture.type==='object'){gesture.latest=p;if(!gesture.frame)gesture.frame=requestAnimationFrame(()=>{const g=gesture;if(g?.type==='object'){g.frame=null;partsUI.drag(g.rect,g.latest.x-g.point.x,g.latest.y-g.point.y);}});return;}
  if(gesture.type==='brush'){const pts=gesture.stroke.points,last=pts.at(-1);if(Math.hypot(p.x-last.x,p.y-last.y)>1){pts.push(p);cutPending=true;redraw();}return;}
  if(kind==='room'){
   p={x:Math.max(0,Math.min(ROOM.width,p.x)),y:Math.max(0,Math.min(ROOM.height,p.y))};
   if($('snap-grid').checked){const node=nearestGridPoint(p);if(node.distance*camera(kind).s<12)p=node.screen;}
  }
  if(gesture.type==='mesh-anchor'){
   const a=state.mesh.anchors[gesture.index];
   if(kind==='source')a.source=p;
   else {
    const projected=meshProjection(),at=projected?.points[gesture.index];
    if(at){const ref=state.mesh.referenceDimensions,sp=state.placement,sx=ref?(sp.direction==='center'?sp.width/ref.width:sp.depth/ref.depth):1,sy=ref?(sp.direction==='center'?sp.depth/ref.depth:sp.width/ref.width):1,sz=ref?sp.height/ref.height:1,z=a.world.z*sz;
     const from=[[0,0],[1,0],[1,1],[0,1]].map(([x,y])=>roomPoint(sp.x+x,sp.y+y,z)),inverse=homography(from,unitQuad.map(q=>({x:q.x*100,y:q.y*100})));
     if(inverse){const q=project(inverse,p);a.world.x=q.x/100/sx;a.world.y=q.y/100/sy;}
    }
   }
   redraw();return;
  }
  if(kind==='room'&&layer().binding){
   const l=layer(),inverse=homography(planeWorld(l).map(p=>roomPoint(p.x,p.y,p.z)),unitQuad.map(p=>({x:p.x*100,y:p.y*100})));
   if(inverse){const uv=project(inverse,p);l.binding.uv||=clone(unitQuad);l.binding.uv[gesture.index]={x:Math.max(-2,Math.min(3,uv.x/100)),y:Math.max(-2,Math.min(3,uv.y/100))};}
  }else (kind==='source'?layer().source:layer().target)[gesture.index]=p;
  redraw();
 });
 const end=e=>{if(gesture?.id===e.pointerId){if(gesture.type==='object'){if(gesture.frame)cancelAnimationFrame(gesture.frame);const p=gesture.latest||gesture.point;partsUI.drag(gesture.rect,p.x-gesture.point.x,p.y-gesture.point.y);}if(cutPending)cut();const changed=gesture.type!=='pan';gesture=null;if(changed)mark();sync();}};c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);
 c.addEventListener('dblclick',()=>{if(kind!=='source'||polygonDraft.length<3)return;if(tool==='outline')finishOutline();else if(tool==='part-outline')guarded(()=>partsUI.finish());});
 c.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();views[kind].zoom=Math.max(1,Math.min(4,views[kind].zoom*(e.deltaY>0?.9:1.1)));$(kind+'-zoom').value=views[kind].zoom*100;redraw();},{passive:false});
}
function finishOutline(){
 const p=polygonDraft.filter((v,i,a)=>!i||Math.hypot(v.x-a[i-1].x,v.y-a[i-1].y)>.5);if(p.length>3&&Math.hypot(p[0].x-p.at(-1).x,p[0].y-p.at(-1).y)<1)p.pop();
 if(!validatePolygon(p)){message('외곽선이 교차하거나 겹쳤어요. 점을 다시 찍어 주세요.');return;}
 checkpoint();state.cutout.polygon=clone(p);state.cutout.strokes=[];cut();useTool('points');message('외곽 밖을 투명하게 만들었어요. 필요한 부분은 지우개로 정리하세요.');
}
async function imageFrom(data){const img=new Image();img.src=data;try{await img.decode();}catch{throw new Error('그림 파일을 읽지 못했어요. 손상되지 않은 PNG, WebP, JPG 파일을 넣어 주세요.');}if(img.naturalWidth>6000||img.naturalHeight>6000||img.naturalWidth*img.naturalHeight>20000000)throw new Error('그림은 6,000px 이하, 전체 2,000만 픽셀 이하로 넣어 주세요.');return img;}
async function loadPartImage(data){
 if(!partImageCache.has(data)){const entry={image:null};entry.promise=imageFrom(data).then(image=>(entry.image=image)).catch(error=>{partImageCache.delete(data);throw error;});partImageCache.set(data,entry);}
 return partImageCache.get(data).promise;
}
function partsImages(parts){return new Map([...(parts?.parts||[]),...(parts?.objects||[])].filter(v=>v.source).map(v=>[v.id,partImageCache.get(v.source.data)?.image]));}
async function preparePartImages(parts){await Promise.all([...parts.parts,...parts.objects].filter(v=>v.source).map(async v=>{const image=await loadPartImage(v.source.data);if(image.naturalWidth!==v.source.width||image.naturalHeight!==v.source.height)throw new Error('부위 또는 물건의 PNG 크기 정보가 실제 그림과 달라요.');}));}
function commitParts(parts,{record=true,intermediate=false}={}){
 const next=parts?normalizeParts(parts):null;
 if(next&&(next.frame.width!==sourceImage.naturalWidth||next.frame.height!==sourceImage.naturalHeight))throw new Error('부위의 전체 캔버스 크기는 원본과 같아야 해요.');
 const result=next?renderParts(baseCutout,next,partsImages(next)):baseCutout;
 if(record)checkpoint();if(next)state.parts=next;else delete state.parts;cutout=result;if(intermediate){slots[activeView].preview=null;redraw();return;}polygonDraft=[];mark();sync();
}
function readFile(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('파일을 읽지 못했어요.'));r.readAsDataURL(file);});}
async function setSource(data,name,known=null){
 known||=await knownPictureRegistration(data,COFFEE_TABLE_V1);
 const img=await imageFrom(data),prepared=createCutout(img,known?.cutout.polygon||[],known?.cutout.strokes||[]),placement=clone(state.placement),empty=!DIRECTIONS.some(d=>d===activeView?sourceImage:slots[d].sourceImage);
 if(known&&known.direction!==activeView)throw new Error('등록된 원본 그림의 방향과 현재 방향이 달라요.');
 if(known&&empty)Object.assign(shared,{width:known.placement.width,depth:known.placement.depth,height:known.placement.height});
 if(!DIRECTIONS.some(d=>d===activeView?sourceImage:slots[d].sourceImage)&&shared.name==='새 가구')shared.name=name.replace(/\.[^.]+$/,'').slice(0,80)||'새 가구';
 state=fresh(activeView);state.placement=placement;state.name=shared.name;state.source={name,data,width:img.naturalWidth,height:img.naturalHeight};if(known){state.pictureLayers=clone(known.pictureLayers);state.pictureLayerRules=clone(known.pictureLayerRules);state.cutout=clone(known.cutout);state.placement=clone(known.placement);manualShared=true;}sourceImage=img;baseCutout=prepared;cutout=prepared;selected=0;history=[];polygonDraft=[];tool='points';applyShared();mark();resetViews();sync();
}
async function guarded(fn){if(loading||gesture)return;loading=true;try{await fn();}catch(e){message(e.message||'작업하지 못했어요. 파일을 확인해 주세요.');}finally{loading=false;sync();}}
function mayReplace(direction=activeView){storeActive();return !slots[direction].sourceImage||confirm(`${LABELS[direction]} 그림과 편집 내용을 바꿀까요? 다른 방향은 그대로 남아요.`);}
const autoStates=new WeakSet();let manualShared=false;
function untouchedForPreparation(p){
 if(p.pictureLayers)return false;
 if(canAutoPrepare(p).ok)return true;
 if(!autoStates.has(p)||!p.parts||p.parts.objects.length||p.parts.parts.some(v=>v.source||v.polygon.length||v.visible===false))return false;
 const expected=createParts(p.parts.preset,p.placement.direction,p.parts.frame);
 return JSON.stringify(p.parts)===JSON.stringify(expected)&&canAutoPrepare({...p,parts:undefined}).ok;
}
function selectedMetadata(target){const kind=$('quick-kind').value;if(kind!=='auto')return presetMetadata(kind);return target?.confidence==='explicit'&&target.kind!=='unknown'?presetMetadata(target.kind,{...(target.usage?{usage:target.usage}:{})}):null;}
function autoPrepare(metadata){
 if(!metadata)return false;storeActive();if(DIRECTIONS.some(d=>slots[d].polygonDraft.length)){message('작성 중인 윤곽을 먼저 완성하거나 취소해 주세요. 부위 구성은 유지합니다.');return false;}if(manualShared){message('직접 수정한 크기·용도·위치는 유지했어요. 자동 준비로 바꾸지 않습니다.');return false;}const sources=DIRECTIONS.map(d=>slots[d].state).filter(p=>p.source);
 if(sources.some(p=>!untouchedForPreparation(p))){message('기존 부위·기준점·크기는 유지했어요. 종류 설정은 새 그림에서 자동 준비합니다.');return false;}
 Object.assign(shared,objectMetadata(metadata),metadata.suggestedDimensions);applyShared();
 for(const d of DIRECTIONS){const slot=slots[d];if(!slot.sourceImage)continue;slot.state.parts=createParts(metadata.partsPreset,d,{width:slot.sourceImage.naturalWidth,height:slot.sourceImage.naturalHeight});autoStates.add(slot.state);slot.cutout=renderParts(slot.baseCutout,slot.state.parts,partsImages(slot.state.parts));slot.preview=null;}
 loadActive(activeView);$('quick-kind').value=metadata.kind==='blanket'?'blanket-'+metadata.usage:metadata.kind;mark();return true;
}
function syncKindFromProject(){const p=state;const value=p.objectType==='blanket'?'blanket-'+p.usage:p.objectType==='cushion'?'cushion':['sofa','bed','desk'].includes(p.parts?.preset)?p.parts.preset:'auto';$('quick-kind').value=value;}
$('quick-kind').onchange=()=>{const metadata=selectedMetadata();if(!metadata||!hasAnySource())return;if(autoPrepare(metadata))sync();else{syncKindFromProject();sync();}};
$('source-file').onchange=e=>guarded(async()=>{
 const f=e.target.files[0];e.target.value='';if(!f)return;validateImageFile(f);
 const data=await readFile(f),known=await knownPictureRegistration(data,COFFEE_TABLE_V1),direction=known?.direction||inferDirection(f.name).direction||activeView;if(!mayReplace(direction))return;
 await imageFrom(data);storeActive();loadActive(direction);
 await setSource(data,f.name,known);if(!known)autoPrepare(selectedMetadata(inferTarget(f.name)));
 if(document.body.dataset.mode==='simple')tool='inspect';sync();message(known?`${LABELS[direction]}의 동일한 원본 PNG를 확인해 검증된 부위·접지점 등록을 복구했어요.`:`${LABELS[direction]} 그림을 넣었어요. 원본을 유지하며 필요한 부위 설정을 준비했어요. 실제 윤곽과 격자는 확인해 주세요.`);
});
$('example').onclick=()=>guarded(async()=>{if(!mayReplace())return;const response=await fetch(REFERENCE_IMAGE);if(!response.ok)throw new Error('원본 그림을 열지 못했어요.');await setSource(await readFile(await response.blob()),'우리집 원본.png');message('원본을 열었어요. 외곽 따기로 원하는 가구만 남겨 주세요.');});
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>useTool(b.dataset.tool));
document.querySelectorAll('[data-panel]').forEach(b=>{if(b.tagName!=='BUTTON')return;b.onclick=()=>{document.body.dataset.panel=b.dataset.panel;document.querySelectorAll('button[data-panel]').forEach(x=>x.setAttribute('aria-selected',String(x===b)));redraw();};});
$('finish-outline').onclick=finishOutline;
$('reset-cutout').onclick=()=>{if(!sourceImage)return;checkpoint();state.cutout={polygon:[],strokes:[]};polygonDraft=[];cut();sync();};
$('undo').onclick=async()=>{if(polygonDraft.length){polygonDraft.pop();simpleUI?.schedule();sync();return;}if(!history.length)return;state=history.pop();selected=Math.min(selected,state.layers.length-1);cut();mark();sync();};
$('reset-points').onclick=()=>{checkpoint();layer().source=[];layer().target=[];layer().binding=null;sync();};
$('layer-select').onchange=e=>{selected=Number(e.target.value);polygonDraft=[];sync();};
$('add-layer').onclick=()=>{if(!sourceImage){message('먼저 그림을 넣어 주세요.');return;}checkpoint();state.layers.push(freshLayer(state.layers.length+1));selected=state.layers.length-1;useTool('points');message('새 영역에서 윗면·옆면 등의 실제 모서리 네 점을 찍어 주세요.');};
$('delete-layer').onclick=()=>{if(state.layers.length<2)return;checkpoint();state.layers.splice(selected,1);selected=Math.max(0,selected-1);sync();};
for(const [id,step] of [['layer-up',1],['layer-down',-1]])$(id).onclick=()=>{const next=selected+step;if(next<0||next>=state.layers.length)return;checkpoint();[state.layers[selected],state.layers[next]]=[state.layers[next],state.layers[selected]];selected=next;sync();};
 $('grid-bind').onclick=()=>{if(layer().source.length!==4||!validQuad(layer().source)){message('먼저 원본의 모서리 네 점을 둘레 순서로 찍어 주세요.');return;}checkpoint();layer().binding={plane:$('plane').value,uv:clone(unitQuad),offset:0};sync();message('우리집 격자에 연결했어요. 꼭지점 번호와 그림의 면이 맞는지 확인해 주세요.');};
$('free-mode').onclick=()=>{if(!layer().binding)return;checkpoint();layer().target=target(layer()).map(p=>({...p}));layer().binding=null;sync();};
$('plane').onchange=()=>{if(layer().binding){checkpoint();layer().binding.plane=$('plane').value;clampOffsets();}sync();};
$('plane-offset').onchange=e=>{if(!layer().binding)return;const value=Number(e.target.value),max=offsetExtent(layer().binding.plane);if(!Number.isFinite(value)||value<0||value>max){message(`안쪽 거리는 0~${max}칸 사이로 넣어 주세요.`);sync();return;}checkpoint();layer().binding.offset=value;sync();};
$('direction').onchange=e=>switchView(e.target.value);
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
for(const k of ['width','depth','height'])$(k).onchange=e=>{const value=Number(e.target.value),max=k==='height'?ROOM.wallHeight:k==='width'?7:7;if(!Number.isFinite(value)||value<.1||value>max){message(`크기는 0.1~${max} 사이로 넣어 주세요.`);sync();return;}manualShared=true;shared[k]=value;applyShared();mark();sync();};
for(const [id,key] of [['pos-x','x'],['pos-y','y']]){const input=$(id);let marked=false;input.oninput=()=>{if(!marked){checkpoint();marked=true;}manualShared=true;state.placement[key]=key==='x'?horizontalPosition(Number(input.value)):Number(input.value);boundPlacement();$(id+'-value').textContent=(key==='x'?horizontalValue():state.placement[key])+'칸';redraw();};const finish=()=>{if(!marked)return;marked=false;mark();sync();};for(const type of ['change','pointerup','pointercancel','blur'])input.addEventListener(type,finish);}
for(const kind of ['source','room'])$(kind+'-zoom').oninput=e=>{views[kind].zoom=Number(e.target.value)/100;redraw();};
for(const id of ['opacity','grid-visible','compare-original'])$(id).oninput=redraw;
$('fit-view').onclick=resetViews;
$('furniture-name').onchange=e=>{shared.name=e.target.value.trim().slice(0,80)||'새 가구';applyShared();mark();sync();};
$('object-type').onchange=e=>{manualShared=true;shared.objectType=e.target.value;shared.usage=OBJECT_USAGES[shared.objectType][0];applyShared();mark();sync();};
$('object-usage').onchange=e=>{manualShared=true;shared.usage=e.target.value;applyShared();mark();sync();};
function filename(){return state.name.replace(/[\\/:*?"<>|]/g,'-')||'가구';}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function png(canvas,name){canvas.toBlob(blob=>{if(!blob){message('PNG 저장에 실패했어요.');return;}download(blob,name);},'image/png');}
function cropped(canvas){const b=alphaBounds(canvas);if(!b)return null;const out=document.createElement('canvas');out.width=b.width;out.height=b.height;out.getContext('2d').drawImage(canvas,b.x,b.y,b.width,b.height,0,0,b.width,b.height);return {canvas:out,bounds:b};}
$('export-cutout').onclick=()=>{if(!cutout)return;const result=cropped(cutout);if(!result){message('남은 그림이 없어요. 되살리기로 복구해 주세요.');return;}png(result.canvas,filename()+'-'+activeView+'-분리.png');message('주변을 지운 투명 그림을 저장했어요.');};
function furnitureCanvas(scale=1,p=state,masked=cutout){const c=document.createElement('canvas');c.width=ROOM.width*scale;c.height=ROOM.height*scale;const ctx=c.getContext('2d');ctx.scale(scale,scale);drawFurniture(ctx,p,masked);return c;}
$('export-png').onclick=()=>{if(!partsPlaneCoverage(state,cutout).ok){message('등록한 면 밖의 부위·물건이 있어요. 전체 그림의 기준점을 먼저 보완해 주세요.');return;}if(state.pictureLayers){const check=validatePictureLayers(state.pictureLayers,state.placement,state.pictureLayerRules);if(!check.ok){message(check.error);return;}if(!cachedPictureLayersCoverage(parentPicture(state,cutout),state.pictureLayers).ok){message('부위 기준점 밖에 그림이 남아 있어요. 누락한 부위의 외곽을 보완해 주세요.');return;}}else if(state.mesh){const check=validateMesh(state.mesh,state.placement);if(!check.ok){message(check.error);return;}if(!cachedMeshCoverage(parentPicture(state,cutout),state.mesh).ok){message('곡선 기준점 밖에 그림이 남아 있어요. 외곽 기준점을 보완해 주세요.');return;}}else if(!state.layers.some(ready))return;const result=cropped(furnitureCanvas(3));if(!result){message('남은 그림이 없어요. 꼭지점과 외곽선을 확인해 주세요.');return;}png(result.canvas,filename()+'-'+activeView+'-가구.png');message('방과 격자를 제외한 3배 해상도 투명 가구 PNG를 저장했어요.');};
function exportProject(p=state,masked=cutout){
 if(!p.source)return null;
 const result=cropped(furnitureCanvas(1,p,masked)),projected=p.mesh?meshProjection(p):null;
 const meshRegistration=projected&&result?{kind:'mesh',placement:clone(p.placement),referenceDimensions:{width:p.placement.width,depth:p.placement.depth,height:p.placement.height},indices:projected.indices,anchors:projected.points.map((v,i)=>({source:{x:v.target.x-result.bounds.x,y:v.target.y-result.bounds.y},world:{x:v.world.x,y:v.world.y,z:v.world.z},kind:p.mesh.anchors[i].kind||'physical',label:p.mesh.anchors[i].label||''})),bounds:result.bounds}:null;
 return {...clone(p),roomCalibration:{id:'ojjuda-room-v3',width:ROOM.width,height:ROOM.height,grid:FLOOR},registration:p.mesh||p.pictureLayers?[]:p.layers.map(l=>({id:l.id,source:l.source,target:targetFor(l,p.placement),world:l.binding?boundWorld(l,p.placement):null})),...(p.pictureLayers?{pictureLayerRegistrations:result?pictureLayerRegistrations(p.pictureLayers,p.placement,result.bounds,p.pictureLayerRules):null}:{}),...(p.mesh?{meshRegistration:hasDrapedObjects(p.parts)&&meshRegistration?{...meshRegistration,scope:'parent-only'}:meshRegistration}:{}),...(hasDrapedObjects(p.parts)?{accessoryRegistration:{version:1,parent:'original-source',order:getRenderOrder(p.parts),objects:p.parts.objects.filter(o=>o.registration).map(o=>({id:o.id,registration:clone(o.registration),visible:o.visible}))}}:{}),asset:result?{data:result.canvas.toDataURL('image/png'),bounds:result.bounds,...(hasDrapedObjects(p.parts)?{purpose:'room-preview'}:{})}:null};
}
function exportSet(){
 storeActive();const data={format:'ojjuda-furniture-set',version:1,name:shared.name,...objectMetadata(shared),generationNotes:$('ai-notes').value.trim(),dimensions:{width:shared.width,depth:shared.depth,height:shared.height},activeView,views:{}};
 for(const d of DIRECTIONS)data.views[d]=exportProject(slots[d].state,slots[d].cutout);
 data.complete=DIRECTIONS.every(d=>previewFor(d).ready);data.missing=DIRECTIONS.filter(d=>!previewFor(d).ready);data.registrationStatus=data.complete?'registered':'unregistered';return data;
}
function pendingOutlines(){storeActive();return DIRECTIONS.filter(d=>slots[d].polygonDraft.length>0);}
function canSave(){const pending=pendingOutlines();if(pending.length){message(`${pending.map(d=>LABELS[d]).join('·')}의 외곽 따기를 마치거나 Esc로 취소한 뒤 저장해 주세요.`);return false;}return !gesture;}
$('save-project').onclick=()=>{if(loading||!canSave())return;const data=exportSet();if(!DIRECTIONS.some(d=>!!data.views[d]))return;download(new Blob([JSON.stringify(data)],{type:'application/json'}),filename()+'.furniture-set.json');dirty=false;$('save-status').textContent='작업 파일 저장됨';message(data.complete?'세 방향을 한 가구 파일에 저장했어요.':'미완성 방향을 포함한 세트 작업 파일을 저장했어요. 이어서 완성할 수 있어요.');};
const canvasBlob=canvas=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG를 만들지 못했어요.')),'image/png'));
$('export-parts').onclick=()=>guarded(async()=>{
 if(!canSave())return;storeActive();
 const data=exportSet(),entries=[],manifest={format:'ojjuda-parts-set',version:1,name:shared.name,coordinateSystem:'original-source-pixels',editableProject:'furniture-set.json',registrationStatus:data.registrationStatus,views:{}};
 for(const d of DIRECTIONS){const slot=slots[d],parts=slot.state.parts;if(!parts){manifest.views[d]=null;continue;}
  const canvases=getPartCanvases(slot.baseCutout,parts,partsImages(parts));
  const m={frame:clone(parts.frame),preset:parts.preset,order:clone(parts.order),renderOrder:getRenderOrder(parts),parts:[],objects:[],composite:d+'/composite.png'};
  for(const part of parts.parts){const file=d+'/parts/'+part.id+'.png';entries.push({name:file,data:await canvasBlob(canvases.get(part.id))});m.parts.push({id:part.id,name:part.name,file,visible:part.visible,remainder:part.remainder,polygon:clone(part.polygon),sourceFrame:clone(parts.frame)});}
  for(const object of parts.objects){const file=d+'/objects/'+object.id+'.png',binary=atob(object.source.data.split(',')[1]);entries.push({name:file,data:Uint8Array.from(binary,c=>c.charCodeAt(0))});m.objects.push({id:object.id,name:object.name,file,slot:object.slot,rect:clone(object.rect),visible:object.visible,sourceSize:{width:object.source.width,height:object.source.height},...(object.registration?{registration:clone(object.registration)}:{}),...(object.sofaAccessoryId?{sofaAccessoryId:object.sofaAccessoryId}:{})});}
  entries.push({name:m.composite,data:await canvasBlob(slot.cutout)});manifest.views[d]=m;
 }
 if(!entries.length)return;
 entries.push({name:'parts-manifest.json',data:JSON.stringify(manifest)},{name:'furniture-set.json',data:JSON.stringify(data)},{name:'README.txt',data:'부위 PNG는 각 방향 원본과 같은 전체 캔버스 좌표입니다. 자르거나 부위별로 이동·확대하지 마세요. 물건 PNG는 원본 크기입니다. registration이 있는 담요는 그 접힘 기준점으로 소파와 따로 격자에 연결합니다. renderOrder의 surface 조각은 쿠션 아래, front 조각은 앞쪽에 그립니다. 등록 담요에 rect나 소파 mesh를 다시 적용하지 마세요. 나머지 물건은 rect와 slot을 사용합니다. order는 뒤에서 앞으로 그리는 순서입니다.\n숨긴 부위도 편집 복원을 위해 PNG로 내보냅니다. furniture-set.json을 열면 부위·원본·물건·격자 작업을 함께 복원합니다. 미등록 그림은 방 배치가 완성됐다는 뜻이 아닙니다. 가려진 부분을 자동 생성하지 않았으며 그림의 품질과 가림은 직접 확인해야 합니다.\n'});
 download(await makeZip(entries),filename()+'-부위그림세트.zip');message('부위별 PNG·물건·그리는 순서와 편집 파일을 함께 저장했어요.');
});
$('export-picture-set').onclick=()=>guarded(async()=>{
 if(!canSave()||!DIRECTIONS.every(d=>!!slots[d].sourceImage))return;
 const data=exportSet(),entries=[];data.exportMode='pictures';
 for(const d of DIRECTIONS){const slot=slots[d],dataURL=slot.state.source.data;let bytes;if(dataURL.startsWith('data:image/png;base64,')){const binary=atob(dataURL.split(',')[1]);bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));}else{const c=document.createElement('canvas');c.width=slot.sourceImage.naturalWidth;c.height=slot.sourceImage.naturalHeight;c.getContext('2d').drawImage(slot.sourceImage,0,0);bytes=await canvasBlob(c);}entries.push({name:d+'.png',data:bytes});}
 entries.push({name:'furniture-set.json',data:JSON.stringify(data)},{name:'README.txt',data:`${shared.name}\n종류: ${shared.objectType}\n용도: ${USAGE_LABELS[shared.usage]}\n원본 세 방향 그림 세트입니다. PNG는 격자 변형이나 편집 마스크를 적용하기 전의 입력 원본입니다. PNG 원본은 바이트를 그대로 보존하며 JPG/WebP 입력은 PNG로 변환합니다. 편집 내용은 furniture-set.json에 저장됩니다.\n격자 상태: ${data.registrationStatus}\n기준점·배치 각도·곡선·접지를 검증한 완성 가구를 뜻하지 않습니다. 그림의 용도는 지지 가구에 대한 자동 연결이나 충돌 기능을 뜻하지 않습니다.\n`});
 download(await makeZip(entries),filename()+'-그림세트.zip');message('원본 그림 3장과 작업 파일을 저장했어요. 실제 방 배치 검증은 별도로 진행해야 해요.');
});
$('export-set').onclick=()=>guarded(async()=>{
 if(!canSave())return;storeActive();if(!DIRECTIONS.every(d=>previewFor(d).ready)){message('세 방향의 그림·꼭지점·격자 연결을 모두 준비해 주세요.');return;}
 const data=exportSet(),entries=[];
 for(const d of DIRECTIONS){const result=cropped(furnitureCanvas(3,slots[d].state,slots[d].cutout));if(!result)throw new Error(`${LABELS[d]}에 남은 그림이 없어요.`);entries.push({name:d+'.png',data:await canvasBlob(result.canvas)});}
 entries.push({name:'furniture-set.json',data:JSON.stringify(data)});const zip=await makeZip(entries);download(zip,filename()+'-가구세트.zip');dirty=false;$('save-status').textContent='저장됨';message('좌측·정면·우측 PNG와 편집 파일을 한 ZIP에 저장했어요.');
});
function validateMeshDraft(mesh){
 const validSource=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<100000&&Math.abs(p.y)<100000;
 if(!mesh||!Array.isArray(mesh.anchors)||mesh.anchors.length>512||mesh.anchors.some(a=>!validSource(a.source)||!a.world||!['x','y','z'].every(k=>a.world[k]===null||Number.isFinite(a.world[k])&&Math.abs(a.world[k])<1000)||a.kind!==undefined&&!['physical','contour','support'].includes(a.kind)))throw new Error('곡선 기준점 정보가 올바르지 않아요.');
 if(mesh.referenceDimensions)validateDimensions(mesh.referenceDimensions);
 if(mesh.indices!==undefined){const indices=mesh.indices;if(!Array.isArray(indices)||indices.length>4096||indices.some(t=>!Array.isArray(t)||t.length!==3||new Set(t).size!==3||t.some(i=>!Number.isInteger(i)||i<0||i>=mesh.anchors.length)))throw new Error('곡선 기준점 연결 정보가 올바르지 않아요.');}
}
function syncMeshControls(){
 $('geometry-mode').disabled=!!state.pictureLayers;
 if(state.pictureLayers){
  $('geometry-mode').value='mesh';$('plane-controls').hidden=true;$('mesh-controls').hidden=false;$('mesh-selected').replaceChildren(...state.pictureLayers.map(p=>new Option(p.label||p.id,p.id)));$('mesh-selected').disabled=true;$('mesh-delete').disabled=true;$('mesh-fields').replaceChildren();
  const check=validatePictureLayers(state.pictureLayers,state.placement,state.pictureLayerRules),coverage=check.ok&&cutout?cachedPictureLayersCoverage(parentPicture(state,cutout),state.pictureLayers):null;
  $('mesh-status').textContent=!check.ok?check.error:coverage&&!coverage.ok?`등록한 부위 밖에 그림 ${coverage.missing.toLocaleString()}픽셀이 남았어요.`:`그림 부위 ${state.pictureLayers.length}개를 각각 격자에 연결했어요. 안쪽부터 앞쪽 순서로 겹칩니다.`;$('mesh-status').dataset.state=check.ok&&(!coverage||coverage.ok)?'ready':'missing';$('mesh-scale-note').textContent='원본 그림 부위와 연결 순서를 보존합니다. 이동·크기 조절은 각 부위의 실제 방 좌표에 함께 적용돼요.';return;
 }
 $('mesh-selected').disabled=false;
 const active=!!state.mesh;$('geometry-mode').value=active?'mesh':'planes';$('plane-controls').hidden=active;$('mesh-controls').hidden=!active;
 if(!active)return;
 const mesh=state.mesh;meshSelected=Math.max(0,Math.min(meshSelected,mesh.anchors.length-1));
 $('mesh-selected').replaceChildren(...mesh.anchors.map((a,i)=>new Option(`${i+1}. ${a.label||'기준점'} · ${{physical:'실제 기준점',contour:'그림 외곽',support:'외삽 보조점'}[a.kind||'physical']}`,String(i),false,i===meshSelected)));
 $('mesh-delete').disabled=!mesh.anchors.length;$('mesh-fields').replaceChildren();
 const check=validateMesh(mesh,state.placement);let text=check.ok?'기준점이 방 좌표에 연결됐어요.':'방 좌표를 모두 입력하고 점의 연결을 확인하세요.';
 if(check.ok&&cutout){const coverage=cachedMeshCoverage(parentPicture(state,cutout),mesh);text=coverage.ok?'곡선 외곽과 접지점을 포함한 그림 전체가 연결됐어요.':`기준점 밖에 그림 ${coverage.missing.toLocaleString()}픽셀이 남았어요. 실제 외곽점을 보완하세요.`;}
 if(!check.ok&&mesh.anchors.length>=3)text=check.error;
 $('mesh-status').textContent=text;$('mesh-status').dataset.state=check.ok&&(!cutout||cachedMeshCoverage(parentPicture(state,cutout),mesh).ok)?'ready':'missing';
 $('mesh-scale-note').textContent=mesh.referenceDimensions?'칸 좌표는 등록한 기준 크기의 값입니다. 가구 크기를 바꾸면 함께 확대·축소돼요.':'등록한 칸 좌표를 고정해서 씁니다. 가구 크기를 바꿔도 이 기준점은 늘어나지 않아요.';
 const a=mesh.anchors[meshSelected];if(!a)return;
 const name=document.createElement('label');name.textContent='기준점 이름';const nameInput=document.createElement('input');nameInput.type='text';nameInput.value=a.label||'';nameInput.maxLength=120;nameInput.onchange=()=>{checkpoint();a.label=nameInput.value;sync();};name.append(nameInput);$('mesh-fields').append(name);
 const role=document.createElement('label');role.textContent='기준점 구분';const select=document.createElement('select');for(const [value,label]of [['physical','실제 접지점·봉제선'],['contour','실제 그림 외곽'],['support','외삽 보조점']])select.append(new Option(label,value));select.value=a.kind||'physical';select.onchange=()=>{checkpoint();a.kind=select.value;sync();};role.append(select);$('mesh-fields').append(role);
 for(const [group,axes,title]of [['source',['x','y'],'그림 픽셀'],['world',['x','y','z'],'방 칸 좌표']]){
  const row=document.createElement('div');row.className='mesh-coordinate-row';const heading=document.createElement('span');heading.textContent=title;row.append(heading);
  for(const axis of axes){const label=document.createElement('label');label.textContent=axis;const input=document.createElement('input');input.type='number';input.step=group==='source'?'.1':'.01';input.value=a[group][axis]??'';input.setAttribute('aria-label',`곡선 점 ${meshSelected+1} ${group==='source'?'그림':'방'} ${axis}`);input.onchange=()=>{const value=input.value===''?null:Number(input.value);if(value!==null&&!Number.isFinite(value)||group==='source'&&value===null)return;checkpoint();a[group][axis]=value;if(group==='source'&&a.kind!=='support'){a.source=sourceClamp(a.source);}sync();};label.append(input);row.append(label);}
  $('mesh-fields').append(row);
 }
}
$('geometry-mode').onchange=e=>{
 if(state.pictureLayers)return;
 checkpoint();if(e.target.value==='mesh'){state.mesh={referenceDimensions:{width:shared.width,depth:shared.depth,height:shared.height},anchors:[]};meshSelected=0;}
 else {delete state.mesh;message('기존 면 작업으로 돌아왔어요. 곡선 기준점은 되돌리기로 복구할 수 있어요.');}
 useTool('points');
};
$('mesh-selected').onchange=e=>{meshSelected=Number(e.target.value);sync();};
$('mesh-delete').onclick=()=>{if(!state.mesh?.anchors.length)return;checkpoint();state.mesh.anchors.splice(meshSelected,1);delete state.mesh.indices;meshSelected=Math.max(0,meshSelected-1);sync();};

function validateProject(p){
 if(!p||p.format!=='ojjuda-furniture'||p.version!==1||typeof p.name!=='string'||!/^data:image\/(png|webp|jpeg);base64,/.test(p.source?.data||''))throw new Error('이 프로그램에서 저장한 가구 파일을 열어 주세요.');
 objectMetadata(p);
 if(p.provenance&&(p.provenance.kind!=='ai'||!DIRECTIONS.includes(p.provenance.sourceDirection)||typeof p.provenance.model!=='string'||p.provenance.model.length>200||typeof p.provenance.reviewed!=='boolean'))throw new Error('AI 그림의 제작 정보가 올바르지 않아요.');
 if(p.mesh)validateMeshDraft(p.mesh);
 if(p.pictureLayers!==undefined){if(p.mesh)throw new Error('단일 곡선과 부위별 곡선은 동시에 등록할 수 없어요.');normalizePictureLayers(p.pictureLayers,p.pictureLayerRules);p.pictureLayers.forEach(l=>validateMeshDraft(l.mesh));}
 if(p.parts)normalizeParts(p.parts);
 const finitePoint=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&Math.abs(v.x)<100000&&Math.abs(v.y)<100000;
 if(!Array.isArray(p.layers)||p.layers.length<1||p.layers.length>50||p.layers.some(l=>!Array.isArray(l.source)||![0,1,2,3,4].includes(l.source.length)||!l.source.every(finitePoint)||!Array.isArray(l.target)||![0,4].includes(l.target.length)||!l.target.every(finitePoint)||l.binding&&!['front','side','top'].includes(l.binding.plane)))throw new Error('꼭지점 정보가 올바르지 않아요.');
 if(p.layers.some(l=>l.binding?.uv&&(!Array.isArray(l.binding.uv)||l.binding.uv.length!==4||!l.binding.uv.every(q=>finitePoint(q)&&q.x>=-2&&q.x<=3&&q.y>=-2&&q.y<=3))))throw new Error('격자 연결 정보가 올바르지 않아요.');
 if(!p.cutout||!Array.isArray(p.cutout.polygon)||p.cutout.polygon.length>10000||p.cutout.polygon.length&&!validatePolygon(p.cutout.polygon)||!Array.isArray(p.cutout.strokes)||p.cutout.strokes.length>5000||p.cutout.strokes.some(s=>!Array.isArray(s.points)||s.points.length>100000||!s.points.every(finitePoint)||!Number.isFinite(s.radius)||s.radius<=0||s.radius>1000))throw new Error('외곽선 정보가 올바르지 않아요.');
 const a=p.placement;if(!a||!['right','center','left'].includes(a.direction)||!['x','y','width','depth','height'].every(k=>Number.isFinite(a[k]))||a.width<.1||a.width>7||a.depth<.1||a.depth>7||a.height<.1||a.height>ROOM.wallHeight)throw new Error('가구 크기가 올바르지 않아요.');
 if(p.layers.some(l=>l.binding&&l.binding.offset!==undefined&&(!Number.isFinite(l.binding.offset)||l.binding.offset<0||l.binding.offset>offsetExtent(l.binding.plane,a))))throw new Error('면의 안쪽 거리가 올바르지 않아요.');
}
function hasAnySource(){storeActive();return DIRECTIONS.some(d=>!!slots[d].sourceImage);}
function validateDimensions(d){if(!d||!['width','depth','height'].every(k=>Number.isFinite(d[k])&&d[k]>=.1&&d[k]<=(k==='height'?ROOM.wallHeight:7)))throw new Error('세트의 공통 크기가 올바르지 않아요.');}
async function prepareProject(p){
 p=await recoverKnownChairProject(p);
 ({project:p}=await recoverKnownPictureProject(p,COFFEE_TABLE_V1));
 validateProject(p);const img=await imageFrom(p.source.data),masked=createCutout(img,p.cutout.polygon,p.cutout.strokes),slot=freshSlot(p.placement.direction);
 slot.state={format:p.format,version:p.version,name:p.name.slice(0,80),...objectMetadata(p),source:{...p.source,width:img.naturalWidth,height:img.naturalHeight},cutout:clone(p.cutout),layers:clone(p.layers),placement:clone(p.placement)};
 if(p.provenance)slot.state.provenance=clone(p.provenance);if(p.mesh)slot.state.mesh=clone(p.mesh);if(p.pictureLayers)slot.state.pictureLayers=clone(p.pictureLayers);if(p.pictureLayerRules)slot.state.pictureLayerRules=clone(p.pictureLayerRules);
 slot.sourceImage=img;slot.baseCutout=masked;slot.cutout=masked;
 if(p.parts){slot.state.parts=await upgradeSofaBlankets(p.parts);if(slot.state.parts.direction!==p.placement.direction)throw new Error('부위 구성의 방향이 현재 그림과 달라요.');if(slot.state.parts.frame.width!==img.naturalWidth||slot.state.parts.frame.height!==img.naturalHeight)throw new Error('부위 캔버스 크기가 원본과 달라요.');await preparePartImages(slot.state.parts);slot.cutout=renderParts(masked,slot.state.parts,partsImages(slot.state.parts));}
 clampPlacement(slot.state.placement);return slot;
}
async function prepareSet(p){
 if(p?.views){const recovered=await Promise.all(DIRECTIONS.map(async d=>[d,await recoverKnownPictureProject(p.views[d],COFFEE_TABLE_V1)]));if(recovered.some(([,v])=>v.recovered)){p={...p,views:{...p.views}};for(const [d,v]of recovered)p.views[d]=v.project;const first=recovered.find(([,v])=>v.recovered)[1].project;p.dimensions={width:first.placement.width,depth:first.placement.depth,height:first.placement.height};}}
 if(p.version!==1||typeof p.name!=='string'||!p.views||typeof p.views!=='object'||!DIRECTIONS.includes(p.activeView))throw new Error('세트 파일의 기본 정보가 올바르지 않아요.');
 validateDimensions(p.dimensions);if(p.generationNotes!==undefined&&(typeof p.generationNotes!=='string'||p.generationNotes.length>2000))throw new Error('자동 그리기 메모가 올바르지 않아요.');
 const metadata=objectMetadata(p);
 for(const d of DIRECTIONS){
  if(!Object.hasOwn(p.views,d))throw new Error('세 방향의 작업 정보가 필요해요.');
  const v=p.views[d];if(v===null)continue;validateProject(v);
  if(v.placement.direction!==d||v.name!==p.name||['width','depth','height'].some(k=>v.placement[k]!==p.dimensions[k])||Object.keys(metadata).some(k=>objectMetadata(v)[k]!==metadata[k]))throw new Error('방향별 그림과 세트의 이름·종류·용도·크기가 맞지 않아요.');
 }
 const prepared=await Promise.all(DIRECTIONS.map(async d=>[d,p.views[d]===null?null:await prepareProject(p.views[d])]));
 return {shared:{name:p.name.slice(0,80),...metadata,...Object.fromEntries(['width','depth','height'].map(k=>[k,p.dimensions[k]]))},activeView:p.activeView,generationNotes:p.generationNotes||'',slots:Object.fromEntries(prepared)};
}
$('project-file').onchange=e=>guarded(async()=>{
 const f=e.target.files[0];e.target.value='';if(!f)return;if(f.size>150000000)throw new Error('가구 파일은 150MB 이하로 넣어 주세요.');const p=JSON.parse(await f.text());
 if(p?.format==='ojjuda-furniture-set'){
  const prepared=await prepareSet(p);
  if(hasAnySource()&&!confirm('현재 세 방향의 작업을 이 가구 세트로 바꿀까요?'))return;
  manualShared=true;shared=prepared.shared;$('ai-notes').value=prepared.generationNotes;for(const d of DIRECTIONS)slots[d]=prepared.slots[d]||freshSlot(d);
  loadActive(prepared.activeView);syncKindFromProject();if(document.body.dataset.mode==='simple')tool='inspect';simpleUI?.schedule();dirty=false;$('save-status').textContent='불러옴';resetViews();sync();message('세 방향의 그림·꼭지점·격자 연결을 함께 불러왔어요.');
 }else{
  const prepared=await prepareProject(p),direction=prepared.state.placement.direction,existing=hasAnySource();
  if(!mayReplace(direction))return;
  const changed=existing&&['width','depth','height'].some(k=>prepared.state.placement[k]!==shared[k]);
  if(!existing)shared={name:prepared.state.name,...objectMetadata(prepared.state),...Object.fromEntries(['width','depth','height'].map(k=>[k,prepared.state.placement[k]]))};
  manualShared=true;storeActive();slots[direction]=prepared;loadActive(direction);applyShared();mark();resetViews();sync();
  message(`${LABELS[direction]} 그림을 세트에 불러왔어요.${changed?' 크기는 현재 세트의 공통 크기에 맞췄어요.':' 다른 방향의 작업은 유지돼요.'}`);
 }
});
// Loading a library object replaces the complete three-view project atomically.
// No target corners or room registration are inferred from an image bounding box.
$('library-object').replaceChildren(...PICTURE_LIBRARY.items.map(item=>new Option(item.name,item.id)));
$('library-load').onclick=()=>guarded(async()=>{
 const item=PICTURE_LIBRARY.items.find(v=>v.id===$('library-object').value);if(!item)return;
 if(hasAnySource()&&!confirm('현재 작업을 선택한 개체의 세 방향 그림으로 바꿀까요? 저장하지 않은 작업은 사라져요.'))return;
 const metadata=objectMetadata(item);validateDimensions(item.dimensions);
 const pictures=await Promise.all(DIRECTIONS.map(async direction=>{const url=item.views[direction];let data;if(url.startsWith('data:image/png;base64,'))data=url;else{const response=await fetch(new URL(url,import.meta.url));if(!response.ok)throw new Error('선택한 그림 파일을 불러오지 못했어요. 현재 작업은 유지됩니다.');const blob=await response.blob();if(blob.size>25000000)throw new Error('그림은 각각 25MB 이하여야 해요.');data=await readFile(new Blob([blob],{type:new URL(url,import.meta.url).pathname.endsWith('.webp')?'image/webp':'image/png'}));}const image=await imageFrom(data);return {direction,data,image,masked:createCutout(image,[],[])};}));
 manualShared=false;shared={name:item.name,...metadata,...item.dimensions};
 for(const picture of pictures){const d=picture.direction,slot=freshSlot(d);slot.sourceImage=picture.image;slot.baseCutout=picture.masked;slot.cutout=picture.masked;slot.state.source={name:item.id+'-'+d+(picture.data.startsWith('data:image/webp;')?'.webp':'.png'),data:picture.data,width:picture.image.naturalWidth,height:picture.image.naturalHeight};slot.state.provenance={kind:'ai',sourceDirection:d,model:'Built-in image generation; accessory picture library',reviewed:false};slots[d]=slot;}
 $('ai-notes').value=`${item.name} 한 개체. ${USAGE_LABELS[item.usage]}. 다른 개체와 지지 가구는 포함하지 않습니다.`;loadActive('center');autoPrepare(presetMetadata(item.objectType,{usage:item.usage}));syncKindFromProject();if(document.body.dataset.mode==='simple')tool='inspect';mark();resetViews();sync();message('한 개체의 세 방향 원본을 불러왔어요. 크기는 임시값이며 격자 기준점은 미등록 상태입니다.');
});
let pendingBatch=null;
function validateImageFile(file){if(file.size>25000000)throw new Error('그림은 각각 25MB 이하로 넣어 주세요.');if(!/^image\/(png|webp|jpeg)$/.test(file.type))throw new Error('PNG, WebP, JPG 그림을 넣어 주세요.');}
async function applyBatch(indexes,target){
 if(!pendingBatch)return false;if(new Set(indexes).size!==3||indexes.some(i=>!Number.isInteger(i)||i<0||i>2))throw new Error('방향마다 서로 다른 그림 파일을 선택해 주세요.');
 const existing=hasAnySource();if(existing&&!confirm('현재 세 방향의 그림과 편집 내용을 새 그림 세 장으로 바꿀까요?'))return false;if(existing)manualShared=false;
 if(!existing&&shared.name==='새 가구')shared.name=pendingBatch[indexes[2]].name.replace(/\.[^.]+$/,'').replace(/[-_ ]*(?:left|right|center|front|좌측|우측|정면|왼쪽|오른쪽)$/i,'').slice(0,80)||'새 가구';
 const selectedFiles=indexes.map(i=>pendingBatch[i]),knownFiles=selectedFiles.filter(f=>f.known);if(knownFiles.length===3){const dimensions=knownFiles[0].known.placement;Object.assign(shared,{width:dimensions.width,depth:dimensions.depth,height:dimensions.height});manualShared=true;}
 const prepared={};for(const [i,d]of DIRECTIONS.entries()){const file=selectedFiles[i],slot=freshSlot(d);if(file.known&&file.known.direction!==d)throw new Error('원본 PNG의 등록 방향과 선택한 방향이 달라요.');slot.sourceImage=file.image;slot.baseCutout=file.cutout;slot.cutout=file.cutout;slot.state.source={name:file.name,data:file.data,width:file.image.naturalWidth,height:file.image.naturalHeight};if(file.known){slot.state.pictureLayers=clone(file.known.pictureLayers);slot.state.pictureLayerRules=clone(file.known.pictureLayerRules);slot.state.cutout=clone(file.known.cutout);slot.state.placement={...file.known.placement,width:shared.width,depth:shared.depth,height:shared.height};}if(document.body.dataset.mode==='simple')slot.tool='inspect';prepared[d]=slot;}
 for(const d of DIRECTIONS)slots[d]=prepared[d];loadActive(activeView);autoPrepare(selectedMetadata(target));pendingBatch=null;$('batch-dialog').close();mark();resetViews();sync();message(knownFiles.length===3?'동일한 원본 세 장을 확인해 부위·접지점 등록을 함께 복구했어요.':'세 방향을 한 개체로 준비했어요. 실제 부위 윤곽과 격자는 확인이 필요해요.');return true;
}
let batchTarget=null;
$('batch-file').onchange=e=>guarded(async()=>{
 const files=[...e.target.files];e.target.value='';if(!files.length)return;if(files.length!==3)throw new Error('좌측·정면·우측 그림을 세 장 함께 선택해 주세요.');files.forEach(validateImageFile);
 const prepared=await Promise.all(files.map(async file=>{const data=await readFile(file),image=await imageFrom(data),known=await knownPictureRegistration(data,COFFEE_TABLE_V1);return {name:file.name,data,image,known,cutout:createCutout(image,known?.cutout.polygon||[],known?.cutout.strokes||[])};}));
 const plan=planBatch(files);pendingBatch=prepared;batchTarget=plan.target;
 if(prepared.every(f=>f.known)&&new Set(prepared.map(f=>f.known.direction)).size===3){await applyBatch(DIRECTIONS.map(d=>prepared.findIndex(f=>f.known.direction===d)),plan.target);pendingBatch=null;return;}
 if(plan.automatic){await applyBatch(DIRECTIONS.map(d=>plan.assignments[d]),plan.target);pendingBatch=null;return;}
 for(const d of DIRECTIONS){const select=$('batch-'+d);select.replaceChildren(new Option('방향을 직접 선택하세요',''),...files.map((f,i)=>new Option(f.name,String(i))));select.value=plan.suggestions[d]===undefined?'':String(plan.suggestions[d]);}
 $('batch-dialog').showModal();
});
$('batch-cancel').onclick=()=>{$('batch-dialog').close();pendingBatch=null;};
$('batch-dialog').addEventListener('cancel',()=>{pendingBatch=null;});
$('batch-apply').onclick=()=>guarded(async()=>{if(DIRECTIONS.some(d=>$('batch-'+d).value===''))throw new Error('세 방향의 파일을 모두 골라 주세요.');await applyBatch(DIRECTIONS.map(d=>Number($('batch-'+d).value)),batchTarget);});
function setAIStatus(text,state='idle'){$('ai-status').textContent=text;$('ai-status').dataset.state=state;}
function syncAI(){
 const busy=loading||!!gesture;
 $('ai-source-label').textContent=`기준 그림: ${LABELS[activeView]}${sourceImage?' · 현재 방향의 그림을 보존합니다':' · 이 방향의 원본 그림을 넣어 주세요'}`;
 $('ai-generate').disabled=!sourceImage||busy;$('ai-generate').dataset.running=String(aiRunning);
 $('ai-generate').textContent=aiRunning?'다른 방향을 그리고 있어요…':'이 개체의 나머지 두 방향 그리기';
 $('ai-refresh').disabled=busy;$('clear-view').disabled=!sourceImage||busy;
 $('ai-notes').disabled=busy;
 const ai=state.provenance?.kind==='ai';$('ai-review-view').hidden=!ai;
 $('source-title').textContent=ai?`AI 그림 · ${LABELS[activeView]}`:'원본 그림';
 document.querySelector('button[data-panel="source"]').textContent=ai?'AI 그림':'원본 그림';
 $('ai-review-view').disabled=busy||!!state.provenance?.reviewed;
 $('ai-review-view').textContent=state.provenance?.reviewed?'이 방향 그림 확인됨':'이 방향 그림 확인 완료';
}
async function apiJSON(url,options={},timeout=12000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await fetch(url,{cache:'no-store',credentials:'same-origin',...options,signal:controller.signal});
  let data;try{data=await response.json();}catch{throw new Error('AI 서버의 응답을 읽지 못했어요. 실행 주소와 연결 상태를 확인해 주세요.');}
  if(!response.ok){const detail=typeof data?.error==='string'?data.error:typeof data?.error?.message==='string'?data.error.message:typeof data?.message==='string'?data.message:null;throw new Error(detail?.slice(0,500)||'자동 그리기에 실패했어요. AI 연결을 확인한 뒤 다시 시도해 주세요.');}
  return data;
 }catch(error){
  if(error.name==='AbortError')throw new Error('응답 시간이 길어 요청을 마쳤어요. 서버 상태를 확인한 뒤 다시 시도해 주세요.');
  if(error instanceof TypeError)throw new Error('AI 서버에 연결하지 못했어요. 서버를 실행한 주소에서 열어 주세요.');
  throw error;
 }finally{clearTimeout(timer);}
}
async function checkAIConnection(show=true){
 if(document.querySelector('#studio-editor')){aiConnection={configured:false};if(show)setAIStatus('자동 그리기는 아직 연결되지 않았어요. 준비한 그림을 불러와 편집하고 우리집에 적용할 수 있어요.','missing');return aiConnection;}
 const version=++aiCheckVersion;
 if(location.protocol==='file:'){
  aiConnection={configured:false,localFile:true};
  if(show&&!aiRunning)setAIStatus('파일로 연 화면에서는 자동 그리기를 사용할 수 없어요. AI 서버를 실행한 주소에서 열어 주세요.','missing');
  return aiConnection;
 }
 if(show&&!aiRunning)setAIStatus('자동 그리기 연결을 확인하고 있어요.','checking');
 try{
  const result=await apiJSON('/api/furniture-ai/status');
  if(typeof result?.configured!=='boolean')throw new Error('AI 연결 정보를 확인하지 못했어요. 서버 설정을 확인해 주세요.');
  if(version===aiCheckVersion){aiConnection={configured:result.configured,model:typeof result.model==='string'?result.model:''};if(show&&!aiRunning)setAIStatus(result.configured?'자동 그리기가 연결됐어요. 원본 그림을 넣고 실행해 주세요.':'AI 연결이 아직 설정되지 않았어요. 서버에서 연결한 뒤 다시 확인해 주세요.',result.configured?'ready':'missing');}
  return {configured:result.configured,model:typeof result.model==='string'?result.model:''};
 }catch(error){
  if(version===aiCheckVersion){aiConnection={configured:false,error:error.message};if(show&&!aiRunning)setAIStatus(error.message,'error');}
  return {configured:false,error:error.message};
 }
}
$('ai-refresh').onclick=()=>guarded(async()=>{await checkAIConnection();});
$('ai-notes').onchange=mark;
$('clear-view').onclick=()=>{
 if(loading||gesture||!sourceImage)return;
 if(!confirm(`${LABELS[activeView]}의 그림과 편집 내용을 비울까요? 다른 방향은 그대로 남아요.`))return;
 const direction=activeView;storeActive();slots[direction]=freshSlot(direction);loadActive(direction);mark();resetViews();sync();message(`${LABELS[direction]}을 비웠어요. 원본 방향을 선택한 뒤 자동 그리기로 다시 만들 수 있어요.`);
};
$('ai-review-view').onclick=()=>{
 if(loading||gesture||state.provenance?.kind!=='ai')return;
 checkpoint();state.provenance.reviewed=true;sync();message('그림 확인을 기록했어요. 실제 꼭지점을 찍고 격자에 연결해 주세요.');
};
$('ai-generate').onclick=()=>guarded(async()=>{
 if(!sourceImage){setAIStatus('먼저 기준이 될 방향을 선택하고 원본 그림 한 장을 넣어 주세요.','missing');return;}
 if(!canSave())return;
 if(!shared.name.trim()||['새 가구','새 개체','우리집 원본'].includes(shared.name.trim())){setAIStatus('먼저 제작대상 이름을 입력해 주세요. 예: 소파 본체, 꽃무늬 쿠션, 분홍 담요','missing');return;}
 if(state.provenance?.kind==='ai'&&!state.provenance.reviewed){setAIStatus('추정해서 그린 그림이에요. 이 방향의 구조를 먼저 확인한 뒤 기준으로 사용해 주세요.','missing');return;}
 storeActive();const sourceDirection=activeView,missing=DIRECTIONS.filter(d=>d!==sourceDirection&&!slots[d].sourceImage);
 if(!missing.length){setAIStatus('나머지 방향에 이미 그림이 있어요. 다시 그릴 방향을 비운 뒤 원본 방향에서 실행해 주세요.','missing');return;}
 const reference=cropped(cutout);if(!reference){setAIStatus('기준 그림에 남은 부분이 없어요. 복원하기로 가구를 남겨 주세요.','missing');return;}
 aiRunning=true;syncAI();
 try{
  setAIStatus('자동 그리기 연결을 확인하고 있어요.','checking');const connection=await checkAIConnection(false);
  if(!connection.configured){setAIStatus(connection.localFile?'AI 서버를 실행한 주소에서 열어야 자동으로 그릴 수 있어요.':connection.error||'AI 연결이 아직 설정되지 않았어요. 서버에서 연결한 뒤 다시 확인해 주세요.','missing');return;}
  const targets=missing.map(direction=>{const placement=fresh(direction).placement;clampPlacement(placement);const guide=generationGuide(placement);return {direction,guide:guide.image,placement:guide.placement,corners:guide.corners};});
  const request={source:{data:reference.canvas.toDataURL('image/png'),direction:sourceDirection},name:shared.name,targetObject:shared.name,...objectMetadata(shared),dimensions:{width:shared.width,depth:shared.depth,height:shared.height},notes:$('ai-notes').value.trim(),targets};
  setAIStatus(`${LABELS[sourceDirection]} 원본을 기준으로 ${missing.map(d=>LABELS[d]).join('·')}을 그리고 있어요. 잠시 기다려 주세요.`,'working');
  const response=await apiJSON('/api/furniture-ai/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)},600000);
  if(!response||!Array.isArray(response.views)||response.errors!==undefined&&!Array.isArray(response.errors))throw new Error('생성 결과의 형식이 올바르지 않아요. 현재 작업은 그대로 남아 있어요.');
  const accepted=[],failed=[],seen=new Set();
  for(const generated of response.views){
   const direction=generated?.direction;if(!missing.includes(direction)||seen.has(direction)){failed.push('요청하지 않았거나 중복된 방향은 반영하지 않았어요.');continue;}seen.add(direction);
   try{
    if(!/^data:image\/png;base64,/.test(generated.data||''))throw new Error('PNG 그림을 받지 못했어요.');
    const image=await imageFrom(generated.data),masked=createCutout(image,[],[]);if(!alphaBounds(masked))throw new Error('그림이 비어 있어요.');
    const slot=freshSlot(direction),requested=targets.find(t=>t.direction===direction);
    slot.state.placement=clone(requested.placement);slot.state.source={name:`${shared.name}-${direction}-ai.png`,data:generated.data,width:image.naturalWidth,height:image.naturalHeight};
    slot.state.provenance={kind:'ai',sourceDirection,model:(typeof generated.model==='string'?generated.model:connection.model||'AI').slice(0,200),reviewed:false};
    slot.sourceImage=image;slot.baseCutout=masked;slot.cutout=masked;slots[direction]=slot;accepted.push(direction);
   }catch(error){failed.push(`${LABELS[direction]}: ${error.message}`);}
  }
  for(const failure of response.errors||[])if(missing.includes(failure?.direction)&&!accepted.includes(failure.direction))failed.push(`${LABELS[failure.direction]}: ${String(failure.message||'그리지 못했어요.').slice(0,400)}`);
  for(const direction of missing)if(!accepted.includes(direction)&&!(response.errors||[]).some(e=>e?.direction===direction)&&!seen.has(direction))failed.push(`${LABELS[direction]} 결과를 받지 못했어요.`);
  if(accepted.length){dirty=true;$('save-status').textContent='저장 전';sync();}
  const success=accepted.length?`${accepted.map(d=>LABELS[d]).join('·')} 그림을 만들었어요. 원본은 보존됐고, 새 그림은 구조와 꼭지점을 확인해야 해요.`:'';
  if(failed.length){setAIStatus(`${success}${success?' ':''}${failed.join(' ')} 빈 방향은 같은 버튼으로 다시 시도할 수 있어요.`,'error');}
  else setAIStatus(success||'생성된 그림을 받지 못했어요. 현재 작업은 그대로 남아 있어요.',accepted.length?'success':'error');
 }catch(error){setAIStatus(error.message,'error');}
 finally{aiRunning=false;syncAI();}
});

// A file decode/export transaction must not race with another view or edit.
for(const type of ['click','change','input'])document.addEventListener(type,e=>{
 if(!loading&&!gesture)return;
 if(e.target.closest('button,input,select,textarea')&&!e.target.closest('#notice')){e.preventDefault();e.stopImmediatePropagation();}
},true);

window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('keydown',e=>{if(loading)return;if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!/INPUT|TEXTAREA/.test(document.activeElement.tagName)){e.preventDefault();$('undo').click();}if(e.key==='Escape'){if(cutPending)cut();polygonDraft=[];gesture=null;simpleUI?.schedule();sync();}});
new ResizeObserver(redraw).observe(document.querySelector('main'));
partsUI=mountPartsEditor({get:()=>({parts:state.parts,frame:{width:sourceImage?.naturalWidth||0,height:sourceImage?.naturalHeight||0},direction:activeView,baseImage:baseCutout,imageMap:partsImages(state.parts),draft:polygonDraft,tool}),commit:commitParts,run:guarded,loadImage:loadPartImage,readFile,message,redraw,startOutline:()=>useTool('part-outline'),clearDraft:()=>useTool(document.body.dataset.mode==='simple'?'inspect':'points'),setTool:useTool,checkpoint,preview:parts=>commitParts(parts,{record:false,intermediate:true}),finish:()=>{mark();sync();}});
function rawSnapshot(){storeActive();return {format:'ojjuda-furniture-set',version:1,name:shared.name,...objectMetadata(shared),dimensions:{width:shared.width,depth:shared.depth,height:shared.height},generationNotes:$('ai-notes').value,activeView,views:Object.fromEntries(DIRECTIONS.map(d=>[d,slots[d].state.source?clone(slots[d].state):null]))};}
async function restoreDraft(project){const prepared=await prepareSet(project);if(hasAnySource()&&!confirm('현재 작업을 자동 임시저장한 세트로 바꿀까요?'))return false;manualShared=true;shared=prepared.shared;$('ai-notes').value=prepared.generationNotes;for(const d of DIRECTIONS)slots[d]=prepared.slots[d]||freshSlot(d);loadActive(prepared.activeView);syncKindFromProject();if(document.body.dataset.mode==='simple')tool='inspect';dirty=true;$('save-status').textContent='복원됨 · 파일 저장 전';resetViews();sync();return true;}
loadActive('right');document.body.dataset.panel='source';tool='inspect';
simpleUI=mountSimpleEditor({get:()=>{storeActive();return {state,image:sourceImage,tool,pending:DIRECTIONS.some(d=>slots[d].polygonDraft.length),busy:loading||!!gesture||!!partsUI?.isAdjusting()};},snapshot:rawSnapshot,restore:restoreDraft,run:guarded,mode:simple=>{if(!polygonDraft.length&&['inspect','points'].includes(tool))tool=simple?'inspect':'points';sync();}});
sync();checkAIConnection();
imageFrom(ROOM_IMAGE).then(img=>{background=img;redraw();}).catch(()=>message('방 배경을 읽지 못했어요. 꼭지점과 격자 편집은 사용할 수 있어요.'));

// Public API only for the authenticated studio wrapper, not a network service.
export function studioBundle(){
 if(loading||!canSave())throw new Error('진행 중인 편집을 마친 뒤 적용해 주세요.');
 const project=exportSet();if(!project.complete)throw new Error('세 방향의 그림과 격자 연결을 먼저 완성해 주세요.');
 if(shared.usage!=='floor')throw new Error('소파·침대 위 소품은 부모 가구에 넣은 다음 가구 세트로 적용해 주세요.');
 const runtime={format:'ojjuda-runtime-furniture',version:1,name:project.name,dimensions:project.dimensions,layer:shared.objectType==='furniture'?'standing':'floor',views:{}};
 const png=image=>{if(image.toDataURL)return image.toDataURL('image/png');const c=document.createElement('canvas');c.width=image.naturalWidth||image.width;c.height=image.naturalHeight||image.height;c.getContext('2d').drawImage(image,0,0);return c.toDataURL('image/png');};
 for(const d of DIRECTIONS){const slot=slots[d],p=slot.state,plan=drapePlan(p,slot.cutout);runtime.views[d]={placement:clone(p.placement),layers:clone(p.layers).map(l=>l.binding?{...l,binding:{...l.binding,uv:l.binding.uv||clone(unitQuad),offset:l.binding.offset||0}}:l),...(p.mesh?{mesh:clone(p.mesh)}:{}),...(p.pictureLayers?{pictureLayers:clone(p.pictureLayers),pictureLayerRules:clone(p.pictureLayerRules||{})}:{}),preview:project.views[d].asset.data,drawings:(plan?.layers||[{image:slot.cutout}]).map(l=>({data:png(l.image),...(l.registration?{registration:clone(l.registration),segment:l.segment}:{})}))};}
 return {runtime,project};
}
export const studioMessage=message;
export const studioRefresh=sync;
export const studioRestore=restoreDraft;
export async function studioFlush(){
 if(loading||!canSave())throw new Error('진행 중인 편집을 마친 뒤 닫아 주세요.');
 await simpleUI.flush();
}
