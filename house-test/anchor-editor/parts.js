import {normalizeSofaBlanketDrape} from '../sofa-blanket-drape.js?v=20261003-blanket4';
import {SOFA_CUSHION_SEATS,sofaCushionOrder} from '../sofa-cushion-placement.js?v=20261003-blanket4';
// Original-pixel furniture partitions and ordered 2D accessory insertion.
// Polygon edges assign whole source pixels; antialiasing never divides a pixel
// between parts, so putting those parts back together cannot create alpha seams.
const PRESETS=new Set(['sofa','bed','desk','custom']);
const DIRECTIONS=new Set(['left','center','right']);
const SLOTS=new Set(['under','surface','front']);
const MAX_BYTES=25*1024*1024,MAX_PIXELS=16*1024*1024,MAX_SIDE=8192;
const fail=message=>{throw new RangeError(message);};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
function frameSize(value,label='그림'){
 if(!plain(value)||!Number.isInteger(value.width)||!Number.isInteger(value.height)||value.width<1||value.height<1||value.width>MAX_SIDE||value.height>MAX_SIDE||value.width*value.height>MAX_PIXELS)fail(`${label}의 크기가 올바르지 않습니다.`);
 return {width:value.width,height:value.height};
}
function identifier(value){if(typeof value!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value))fail('부위 또는 물건의 ID가 올바르지 않습니다.');return value;}
function name(value){if(typeof value!=='string'||!value.trim()||value.length>120)fail('부위 또는 물건 이름은 1~120자로 입력하세요.');return value.trim();}
function visible(value){if(value!==undefined&&typeof value!=='boolean')fail('부위 또는 물건 표시 여부가 올바르지 않습니다.');return value!==false;}
function point(p,frame){
 if(!plain(p)||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>frame.width||p.y>frame.height)fail('부위의 테두리 점이 그림 범위를 벗어났습니다.');
 return {x:p.x,y:p.y};
}
function polygon(value,frame){
 if(!Array.isArray(value)||value.length>1024||(value.length>0&&value.length<3))fail('부위의 테두리는 세 점 이상으로 지정하세요.');
 return value.map(p=>point(p,frame));
}
function source(value,frame=null){
 if(!plain(value))fail('PNG 그림 정보가 올바르지 않습니다.');
 const size=frameSize(value,'PNG 그림'),data=value.data;
 if(typeof data!=='string'||!data.startsWith('data:image/png;base64,'))fail('외부 주소 대신 PNG 그림 파일을 사용하세요.');
 const encoded=data.slice(22);
 if(encoded.length>Math.ceil(MAX_BYTES/3)*4||encoded.length<44||encoded.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))fail('PNG 그림은 25MB 이하의 올바른 파일이어야 합니다.');
 const bytes=encoded.length*3/4-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);
 if(bytes>MAX_BYTES)fail('PNG 그림 파일은 25MB 이하여야 합니다.');
 let header;
 try{header=globalThis.atob(encoded.slice(0,44));}catch{fail('PNG 그림 정보를 읽지 못했습니다.');}
 const expected=[137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82];
 if(expected.some((v,i)=>header.charCodeAt(i)!==v))fail('실제 PNG 형식의 그림을 사용하세요.');
 const number=offset=>header.charCodeAt(offset)*0x1000000+header.charCodeAt(offset+1)*0x10000+header.charCodeAt(offset+2)*0x100+header.charCodeAt(offset+3);
 if(number(16)!==size.width||number(20)!==size.height)fail('PNG 파일의 실제 크기와 저장된 크기가 다릅니다.');
 if(frame&&(size.width!==frame.width||size.height!==frame.height))fail('부위 PNG는 원본과 같은 전체 그림 크기여야 합니다.');
 if(value.name!==undefined&&(typeof value.name!=='string'||value.name.length>240))fail('PNG 파일 이름이 올바르지 않습니다.');
 return {data,...size,...(value.name!==undefined?{name:value.name}:{})};
}
function rect(value,frame){
 if(!plain(value)||![value.x,value.y,value.width,value.height].every(Number.isFinite)||value.x<0||value.y<0||value.width<=0||value.height<=0||value.x+value.width>frame.width+1e-8||value.y+value.height>frame.height+1e-8)fail('물건의 위치와 크기를 전체 그림 안에 맞추세요.');
 return {x:value.x,y:value.y,width:value.width,height:value.height};
}

export function createParts(preset='custom',direction='center',frame){
 if(!PRESETS.has(preset)||!DIRECTIONS.has(direction))fail('가구 종류 또는 방향이 올바르지 않습니다.');
 const p=(id,name,remainder=false)=>({id,name,...(remainder?{remainder:true}:{}),polygon:[],source:null,visible:true});
 let parts,order;
 if(preset==='sofa'){
  parts=[p('left-arm','왼쪽 팔걸이'),p('body','등받이·좌판·몸통',true),p('right-arm','오른쪽 팔걸이')];
  order=direction==='left'?['right-arm','body','slot:surface','left-arm','slot:front']:direction==='right'?['left-arm','body','slot:surface','right-arm','slot:front']:['body','slot:surface','left-arm','right-arm','slot:front'];
 }else if(preset==='bed'){
  parts=[p('head','머리판'),p('mattress','매트리스·몸통',true),p('foot-guard','발치 가림판')];
  order=['head','mattress','slot:surface','foot-guard','slot:front'];
 }else if(preset==='desk'){
  parts=[p('back-panel','뒤 가림판'),p('body','서랍·몸통',true),p('top','상판'),p('front-panel','앞 가림판')];
  order=['back-panel','body','slot:under','top','slot:surface','front-panel','slot:front'];
 }else{parts=[p('body','몸통',true)];order=['body','slot:under','slot:surface','slot:front'];}
 return normalizeParts({version:1,preset,direction,frame,parts,objects:[],order});
}

/** Validates a saved JSON description; never decodes or fetches external URLs. */
export function normalizeParts(value){
 if(!plain(value)||value.version!==1||!PRESETS.has(value.preset))fail('지원하지 않는 부위 작업 파일입니다.');
 const direction=value.direction??'center';if(!DIRECTIONS.has(direction))fail('가구 방향이 올바르지 않습니다.');
 const frame=frameSize(value.frame);
 if(!Array.isArray(value.parts)||value.parts.length<1||value.parts.length>16)fail('가구 부위는 1~16개로 구성하세요.');
 if(!Array.isArray(value.objects)||value.objects.length>16)fail('추가 물건은 16개까지 사용할 수 있습니다.');
 const used=new Set();let remainders=0;
 const id=value=>{const s=identifier(value);if(used.has(s))fail('부위 또는 물건 ID가 겹칩니다.');used.add(s);return s;};
 const parts=value.parts.map(p=>{
  if(!plain(p)||p.remainder!==undefined&&typeof p.remainder!=='boolean')fail('부위 정보가 올바르지 않습니다.');
  const result={id:id(p.id),name:name(p.name),...(p.remainder===true?{remainder:true}:{}),polygon:polygon(p.polygon??[],frame),source:p.source==null?null:source(p.source,frame),visible:visible(p.visible)};
  if(result.remainder){remainders++;if(result.polygon.length)fail('나머지 몸통에는 별도 테두리를 지정할 수 없습니다.');}
  return result;
 });
 if(remainders!==1)fail('원본의 남은 부분을 담는 몸통 부위가 하나 필요합니다.');
 const objects=value.objects.map(o=>{
  if(!plain(o)||!SLOTS.has(o.slot))fail('물건의 삽입 위치가 올바르지 않습니다.');
  const image=source(o.source),registration=o.registration==null?null:normalizeSofaBlanketDrape(o.registration,image,direction);
  if(o.sofaAccessoryId!==undefined&&(value.preset!=='sofa'||!Object.hasOwn(SOFA_CUSHION_SEATS,o.sofaAccessoryId)))fail('소파 쿠션의 종류가 올바르지 않습니다.');
  if(registration&&(value.preset!=='sofa'||o.slot!=='surface'))fail('소파 담요는 소파의 좌판·앞쪽에 함께 연결해야 합니다.');
  return {id:id(o.id),name:name(o.name),source:image,rect:rect(o.rect,frame),slot:o.slot,visible:visible(o.visible),...(registration?{registration}:{}),...(o.sofaAccessoryId?{sofaAccessoryId:o.sofaAccessoryId}:{})};
 });
 if(!Array.isArray(value.order)||value.order.length>19)fail('부위의 가림 순서가 올바르지 않습니다.');
 const seen=new Set(),partIds=new Set(parts.map(p=>p.id));
 const order=value.order.map(token=>{
  if(typeof token!=='string'||seen.has(token))fail('가림 순서에 중복 항목이 있습니다.');
  if(!partIds.has(token)&&!(token.startsWith('slot:')&&SLOTS.has(token.slice(5))))fail('가림 순서에 알 수 없는 부위가 있습니다.');
  seen.add(token);return token;
 });
 if(parts.some(p=>!seen.has(p.id)))fail('모든 부위를 가림 순서에 한 번씩 넣어 주세요.');
 if(objects.some(o=>!seen.has(`slot:${o.slot}`)))fail('물건을 넣을 자리가 가림 순서에 없습니다.');
 if(objects.some(o=>o.registration)&&!seen.has('slot:front'))fail('담요의 늘어진 부분을 그릴 앞쪽 자리가 필요합니다.');
 return {version:1,preset:value.preset,direction,frame,parts,objects,order};
}

/** Back-to-front draw entries. Objects within one slot retain their array order. */
export function getRenderOrder(value){
 const state=normalizeParts(value),entries=[],parts=new Map(state.parts.map(p=>[p.id,p]));
 for(const token of state.order){
  if(token.startsWith('slot:')){
   const slot=token.slice(5);
   // The same blanket is one editable object and two paint entries. Its upper
   // cloth stays below cushions even when the blanket was inserted last.
   if(slot==='surface'||slot==='front')for(const o of state.objects)if(o.registration&&o.visible)entries.push({type:'object',id:o.id,slot,segment:slot});
   const objects=state.objects.filter(o=>!o.registration&&o.slot===slot&&o.visible),known=objects.filter(o=>o.sofaAccessoryId),order=sofaCushionOrder(known.map(o=>o.sofaAccessoryId),state.direction),sorted=known.sort((a,b)=>order.indexOf(a.sofaAccessoryId)-order.indexOf(b.sofaAccessoryId));let at=0;
   for(const object of objects){const o=object.sofaAccessoryId?sorted[at++]:object;entries.push({type:'object',id:o.id,slot});}
  }
  else if(parts.get(token).visible)entries.push({type:'part',id:token});
 }
 return entries;
}

function makeCanvas(width,height){
 const canvas=globalThis.document?.createElement('canvas')||(typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(width,height):null);
 if(!canvas)throw new Error('이 환경에서는 그림 합성을 사용할 수 없습니다.');
 canvas.width=width;canvas.height=height;return canvas;
}
function dimensions(image){return {width:image&&(image.naturalWidth||image.videoWidth||image.width),height:image&&(image.naturalHeight||image.videoHeight||image.height)};}
function decodedImage(imageMap,id,expected){
 const image=imageMap instanceof Map?imageMap.get(id):imageMap?.[id],size=dimensions(image);
 if(!image||('complete'in image&&!image.complete)||size.width!==expected.width||size.height!==expected.height)fail(`‘${id}’ 그림을 먼저 불러오거나 실제 크기를 확인하세요.`);
 return image;
}
function imageData(image,frame){
 const size=dimensions(image);
 if(!image||size.width!==frame.width||size.height!==frame.height||('complete'in image&&!image.complete))fail('원본 그림과 부위 작업의 전체 크기가 다릅니다.');
 const canvas=makeCanvas(frame.width,frame.height),ctx=canvas.getContext('2d',{willReadFrequently:true});
 ctx.drawImage(image,0,0);return ctx.getImageData(0,0,frame.width,frame.height);
}
function eachPolygonPixel(points,width,height,visit){
 if(!points.length)return;
 // Even-odd scan conversion at source pixel centers, without antialiasing.
 const top=Math.max(0,Math.ceil(Math.min(...points.map(p=>p.y))-.5)),bottom=Math.min(height-1,Math.floor(Math.max(...points.map(p=>p.y))-.5));
 for(let y=top;y<=bottom;y++){
  const scan=y+.5,hits=[];
  for(let i=0;i<points.length;i++){
   const a=points[i],b=points[(i+1)%points.length];
   if((a.y<=scan&&b.y>scan)||(b.y<=scan&&a.y>scan))hits.push(a.x+(scan-a.y)*(b.x-a.x)/(b.y-a.y));
  }
  hits.sort((a,b)=>a-b);
  for(let i=0;i+1<hits.length;i+=2){
   const start=Math.max(0,Math.ceil(hits[i]-.5)),end=Math.min(width,Math.ceil(hits[i+1]-.5));
   for(let x=start;x<end;x++)visit(y*width+x);
  }
 }
}

function partition(baseImage,state,imageMap){
 const {width,height}=state.frame,base=imageData(baseImage,state.frame),owner=new Int8Array(width*height);owner.fill(-1);
 const uploaded=new Map();
 for(const p of state.parts)if(p.source)uploaded.set(p.id,imageData(decodedImage(imageMap,p.id,p.source),state.frame));
 let remainder=-1;
 state.parts.forEach((p,index)=>{
  if(p.remainder){remainder=index;return;}
  const claim=i=>{if(owner[i]===-1)owner[i]=index;};
  if(p.polygon.length)eachPolygonPixel(p.polygon,width,height,claim);
  else if(uploaded.has(p.id)){
   // With no original-region polygon, replacement alpha is the explicit
   // fallback ownership mask. Shape changes need a polygon to erase old art.
   const rgba=uploaded.get(p.id).data;for(let i=0;i<owner.length;i++)if(rgba[i*4+3]>0)claim(i);
  }
 });
 for(let i=0;i<owner.length;i++)if(owner[i]===-1)owner[i]=remainder;
 return {base,owner,uploaded};
}

/** Every component keeps the full source canvas. Hidden parts are included for
 * export. Uploaded art replaces its full layer, not just its ownership polygon;
 * this lets an author paint a previously hidden continuation outside that mask.
 */
export function getPartCanvases(baseImage,value,imageMap=new Map()){
 const state=normalizeParts(value),{width,height}=state.frame,{base,owner,uploaded}=partition(baseImage,state,imageMap),result=new Map();
 state.parts.forEach((p,index)=>{
  const canvas=makeCanvas(width,height),ctx=canvas.getContext('2d'),pixels=ctx.createImageData(width,height);
  if(uploaded.has(p.id))pixels.data.set(uploaded.get(p.id).data);
  else for(let i=0;i<owner.length;i++)if(owner[i]===index){const at=i*4;pixels.data[at]=base.data[at];pixels.data[at+1]=base.data[at+1];pixels.data[at+2]=base.data[at+2];pixels.data[at+3]=base.data[at+3];}
  ctx.putImageData(pixels,0,0);result.set(p.id,canvas);
 });
 return result;
}

/** Composes parts and inserted objects before the furniture's existing warp.
 * A hidden original part leaves a gap; this function never invents hidden art.
 */
export function renderParts(baseImage,value,imageMap=new Map()){
 const state=normalizeParts(value),{width,height}=state.frame,parts=getPartCanvases(baseImage,state,imageMap),objects=new Map(state.objects.map(o=>[o.id,o]));
 // Validate all accessory decodes before drawing, including currently hidden
 // objects; an invalid imported file cannot leave a partly rendered result.
 const images=new Map(state.objects.map(o=>[o.id,decodedImage(imageMap,o.id,o.source)]));
 const canvas=makeCanvas(width,height),ctx=canvas.getContext('2d');
 for(const entry of getRenderOrder(state)){
  if(entry.type==='part')ctx.drawImage(parts.get(entry.id),0,0);
  else{
   const o=objects.get(entry.id),r=o.rect,image=images.get(o.id);
   if(entry.segment){const split=o.registration.rows[o.registration.surfaceRows][0],sy=entry.segment==='surface'?0:split,sh=entry.segment==='surface'?split:o.source.height-split;ctx.drawImage(image,0,sy,o.source.width,sh,r.x,r.y+r.height*sy/o.source.height,r.width,r.height*sh/o.source.height);}
   else ctx.drawImage(image,r.x,r.y,r.width,r.height);
  }
 }
 return canvas;
}
