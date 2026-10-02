// Small, conservative authoring suggestions. These helpers inspect names or
// alpha values only. They do not recognize furniture in pixels, infer hidden
// surfaces, generate pictures, create room anchors, or update project state.
const DIRECTIONS=['left','center','right'];
const DIRECTION_WORDS={left:['left','좌','좌측','왼쪽'],center:['center','front','정면','중앙'],right:['right','우','우측','오른쪽']};
const KIND_WORDS={sofa:['sofa','couch','소파','쇼파'],bed:['bed','침대'],desk:['desk','책상'],chair:['chair','의자'],bookshelf:['bookshelf','bookcase','책장'],cushion:['cushion','쿠션'],blanket:['blanket','throw','담요']};
const USAGE_WORDS={sofa:['sofa','소파','쇼파','소파용','쇼파용'],bed:['bed','침대','침대용'],floor:['floor','바닥','바닥용'],shared:['shared','공용']};
const DIMENSIONS={sofa:{width:3.5,depth:1.5,height:1.8},bed:{width:3,depth:4,height:1.2},desk:{width:3,depth:1,height:1.4},chair:{width:1,depth:1,height:1.95},bookshelf:{width:2,depth:1,height:3.8},cushion:{width:.8,depth:.3,height:.8}};
const BLANKET_DIMENSIONS={sofa:{width:1,depth:1.2,height:1.4},bed:{width:2.8,depth:1.4,height:.9},floor:{width:2.8,depth:2,height:.1}};
const fail=message=>{throw new RangeError(message);};
function tokens(name){
 if(typeof name!=='string')return [];
 // A parent directory called "left" is not evidence about the file's view.
 const basename=name.normalize('NFKC').split(/[\\/]/).pop().replace(/\.(?:png|jpe?g|webp|gif|avif|bmp|json)$/i,'').toLowerCase();
 return basename.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}
function matches(words,dictionary){
 return Object.entries(dictionary).flatMap(([value,aliases])=>{const evidence=[...new Set(words.filter(word=>aliases.includes(word)))];return evidence.length?[{value,evidence}]:[];});
}
const unknownTarget=(confidence='none',evidence=[],reason='파일 이름에서 종류를 찾지 못했어요. 직접 선택해 주세요.')=>({kind:'unknown',usage:null,confidence,evidence,reason,basis:'filename'});

export function inferDirection(name){
 const hits=matches(tokens(name),DIRECTION_WORDS),evidence=hits.flatMap(h=>h.evidence);
 if(hits.length===1)return {direction:hits[0].value,confidence:'explicit',evidence,reason:'파일 이름에 방향이 명확하게 적혀 있어요.',basis:'filename'};
 return {direction:null,confidence:hits.length?'ambiguous':'none',evidence,reason:hits.length?'파일 이름에 서로 다른 방향이 있어요. 직접 선택해 주세요.':'파일 이름에 명확한 방향이 없어요. 직접 선택해 주세요.',basis:'filename'};
}

export function inferTarget(name){
 const words=tokens(name),hits=matches(words,KIND_WORDS),evidence=hits.flatMap(h=>h.evidence);
 if(!hits.length)return unknownTarget();
 const accessories=hits.filter(h=>['cushion','blanket'].includes(h.value));
 let kind;
 if(accessories.length===1&&hits.every(h=>h===accessories[0]||['sofa','bed'].includes(h.value)))kind=accessories[0].value;
 else if(hits.length===1)kind=hits[0].value;
 else return unknownTarget('ambiguous',evidence,'파일 이름에 여러 종류가 섞여 있어요. 만들 개체를 직접 선택해 주세요.');
 if(!['cushion','blanket'].includes(kind))return {kind,usage:'floor',confidence:'explicit',evidence,reason:'파일 이름의 종류를 참고했어요. 그림 내용과 실제 크기는 확인하지 않았어요.',basis:'filename'};
 const usageHits=matches(words,USAGE_WORDS),allEvidence=[...new Set([...evidence,...usageHits.flatMap(h=>h.evidence)])];
 const allowed=kind==='cushion'?['shared','sofa','bed']:['sofa','bed','floor'];
 if(usageHits.length>1||usageHits.some(h=>!allowed.includes(h.value)))return {kind,usage:null,confidence:'ambiguous',evidence:allEvidence,reason:'파일 이름의 사용 장소가 모호해요. 사용할 곳을 직접 선택해 주세요.',basis:'filename'};
 return {kind,usage:usageHits[0]?.value??null,confidence:'explicit',evidence:allEvidence,reason:usageHits.length?'파일 이름에 적힌 종류와 사용 장소를 참고했어요.':'종류만 파일 이름에서 찾았어요. 사용할 곳은 선택할 수 있어요.',basis:'filename'};
}

/** Category defaults after an explicit category choice. Dimensions are editable
 * starting values, not measurements derived from an image or its alpha bounds.
 */
export function presetMetadata(kind,{usage}={}){
 if(['auto','unknown',null,undefined].includes(kind))return null;
 if(typeof kind!=='string')fail('만들 개체의 종류를 선택해 주세요.');
 const alias=kind.match(/^blanket-(sofa|bed|floor)$/);
 if(alias){if(usage!==undefined&&usage!==alias[1])fail('담요 종류와 사용 장소가 서로 다릅니다.');usage=alias[1];kind='blanket';}
 if(!Object.hasOwn(KIND_WORDS,kind))fail('지원하지 않는 개체 종류입니다.');
 const accessory=kind==='cushion'||kind==='blanket',objectType=accessory?kind:'furniture';
 const allowed=kind==='cushion'?['shared','sofa','bed']:kind==='blanket'?['sofa','bed','floor']:['floor'];
 const chosenUsage=usage??allowed[0];if(!allowed.includes(chosenUsage))fail('이 개체에 사용할 수 없는 장소입니다.');
 return {kind,objectType,usage:chosenUsage,partsPreset:['sofa','bed','desk'].includes(kind)?kind:'custom',suggestedDimensions:{...(kind==='blanket'?BLANKET_DIMENSIONS[chosenUsage]:DIMENSIONS[kind])},dimensionStatus:'suggested',basis:'category-default'};
}

function batchTarget(entries){
 const known=entries.map(e=>e.target).filter(t=>t.kind!=='unknown'),kinds=[...new Set(known.map(t=>t.kind))],evidence=[...new Set(entries.flatMap(e=>e.target.evidence))];
 if(entries.some(e=>e.target.confidence==='ambiguous')||kinds.length>1)return unknownTarget('ambiguous',evidence,'파일들의 종류 또는 사용 장소가 달라요. 같은 개체인지 확인해 주세요.');
 if(!known.length)return unknownTarget();
 const usages=[...new Set(known.map(t=>t.usage).filter(Boolean))];
 if(usages.length>1)return unknownTarget('ambiguous',evidence,'파일들의 사용 장소가 달라요. 같은 개체인지 확인해 주세요.');
 return {kind:kinds[0],usage:usages[0]??null,confidence:'explicit',evidence,reason:'파일 이름에서 공통 종류를 참고했어요. 그림의 동일성은 직접 확인해 주세요.',basis:'filename'};
}

/** A plan only. Missing/duplicate directions never receive arbitrary positions.
 * Passing occupiedDirections blocks automatic replacement of existing artwork.
 * Unknown categories may still have three clearly named directions; their
 * category remains unknown, rather than being fabricated from image pixels.
 */
export function planBatch(files,{occupiedDirections=[]}={}){
 if(!Array.isArray(files))throw new TypeError('그림 파일 목록이 필요합니다.');
 if(!Array.isArray(occupiedDirections)||occupiedDirections.some(d=>!DIRECTIONS.includes(d)))fail('기존 그림의 방향 정보가 올바르지 않습니다.');
 const entries=files.map((file,index)=>{
  const name=typeof file==='string'?file:typeof file?.name==='string'?file.name:'';
  return {index,name,...inferDirection(name),target:inferTarget(name)};
 }),target=batchTarget(entries),suggestions={};
 for(const direction of DIRECTIONS){const same=entries.filter(e=>e.direction===direction);if(same.length===1)suggestions[direction]=same[0].index;}
 let reason='파일 이름의 세 방향을 자동으로 배정할 수 있어요.';
 if(files.length!==3)reason='좌측·정면·우측 그림을 세 장 선택해 주세요.';
 else if(occupiedDirections.length)reason='기존 그림이 있어 자동으로 바꾸지 않아요. 교체할 방향을 확인해 주세요.';
 else if(entries.some(e=>e.confidence!=='explicit')||Object.keys(suggestions).length!==3)reason='방향 이름이 없거나 겹쳐 있어요. 세 방향을 직접 골라 주세요.';
 else if(target.confidence==='ambiguous')reason=target.reason;
 else return {automatic:true,assignments:{...suggestions},suggestions,entries,target,reason,requiresManual:false};
 return {automatic:false,assignments:null,suggestions,entries,target,reason,requiresManual:true};
}

function size(value){
 if(!value||!Number.isFinite(value.width)||!Number.isFinite(value.height)||value.width<=0||value.height<=0)fail('그림의 폭과 높이가 올바르지 않습니다.');
 return {width:value.width,height:value.height};
}
function rgba(value){
 const width=value&&(value.naturalWidth||value.videoWidth||value.width),height=value&&(value.naturalHeight||value.videoHeight||value.height);
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width*height>16*1024*1024)fail('투명도를 확인할 그림 크기가 올바르지 않습니다.');
 if(value.data){if(value.data.length!==width*height*4)fail('그림의 픽셀 정보가 올바르지 않습니다.');return {width,height,data:value.data};}
 if(value.getContext){const ctx=value.getContext('2d',{willReadFrequently:true});if(!ctx)fail('그림의 투명도를 읽지 못했습니다.');return ctx.getImageData(0,0,width,height);}
 if('complete'in value&&!value.complete)fail('그림이 아직 준비되지 않았습니다.');
 const canvas=globalThis.document?.createElement('canvas')||(typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(width,height):null);
 if(!canvas)fail('이 환경에서는 그림의 픽셀을 읽을 수 없습니다.');
 canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)fail('그림의 투명도를 읽지 못했습니다.');ctx.drawImage(value,0,0);return ctx.getImageData(0,0,width,height);
}

/** Alpha inspection is not background recognition: existing transparent pixels
 * do not prove that all unwanted scenery was removed. Bounds are image pixels.
 */
export function analyseAlpha(image){
 const {width,height,data}=rgba(image);let transparentPixels=0,opaquePixels=0,partialPixels=0,left=width,right=-1,top=height,bottom=-1;
 for(let i=0;i<width*height;i++){
  const alpha=data[i*4+3];if(!Number.isInteger(alpha)||alpha<0||alpha>255)fail('투명도 픽셀 값이 올바르지 않습니다.');
  if(alpha===0){transparentPixels++;continue;}
  if(alpha===255)opaquePixels++;else partialPixels++;
  const x=i%width,y=Math.floor(i/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=y;
 }
 const visibleBounds=right<0?null:{x:left,y:top,width:right-left+1,height:bottom-top+1},empty=right<0;
 return {hasTransparency:transparentPixels+partialPixels>0,visibleBounds,bounds:visibleBounds?{...visibleBounds}:null,empty,fullyTransparent:empty,opaquePixels,transparentPixels,partialPixels,alphaOnly:true};
}
export const analyzeAlpha=analyseAlpha;

/** Image-space starting rectangle, not an inferred physical support surface. */
export function suggestObjectRect(frame,sourceSize,{fraction=.35}={}){
 const f=size(frame),s=size(sourceSize);if(!Number.isFinite(fraction)||fraction<=0||fraction>1)fail('초기 그림 크기의 비율은 0보다 크고 1 이하여야 합니다.');
 const scale=Math.min(f.width*fraction/s.width,f.height*fraction/s.height),width=s.width*scale,height=s.height*scale;
 return {x:(f.width-width)/2,y:(f.height-height)/2,width,height};
}
export function recommendObjectRect(sourceSize,frame,options){return suggestObjectRect(frame,sourceSize,options);}

/** Conservative guard for preparing a newly loaded, otherwise untouched image.
 * A caller may present manual choices for protected work; no edits are applied.
 */
export function canAutoPrepare(project){
 const no=reason=>({ok:false,reason});
 if(!project||typeof project!=='object'||!project.source)return no('새 그림을 먼저 넣어 주세요.');
 if(project.parts)return no('기존 부위 작업을 유지합니다.');
 if(project.mesh)return no('기존 기준점 작업을 유지합니다.');
 if(project.registrationStatus&&project.registrationStatus!=='unregistered')return no('기존 격자 등록을 유지합니다.');
 if(project.cutout&&(!Array.isArray(project.cutout.polygon)||!Array.isArray(project.cutout.strokes)||project.cutout.polygon.length||project.cutout.strokes.length))return no('기존 오려내기 작업을 유지합니다.');
 if(project.layers!==undefined){
  if(!Array.isArray(project.layers)||project.layers.length>1)return no('기존 그림 영역 작업을 유지합니다.');
  for(const layer of project.layers)if(!layer||!Array.isArray(layer.source)||!Array.isArray(layer.target)||layer.source.length||layer.target.length||layer.binding)return no('기존 꼭지점과 격자 연결을 유지합니다.');
 }
 return {ok:true,reason:'편집 전의 새 그림에 종류별 시작 설정을 제안할 수 있어요.'};
}

export function nextEmptyPart(value){
 const parts=Array.isArray(value)?value:value?.parts;if(!Array.isArray(parts))return null;
 return parts.find(p=>p&&typeof p.id==='string'&&!p.remainder&&!p.source&&Array.isArray(p.polygon)&&p.polygon.length===0)?.id??null;
}
