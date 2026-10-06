import {validateFloorBlanket,installFloorBlanket} from './floor-blanket-data.js?v=20261006-vine1';
import {validateSofaBlanket,installSofaBlanket} from './sofa-blanket-data.js?v=20261006-vine1';
import {isSofaCushion,validateSofaCushions,installSofaCushions} from './sofa-cushion-data.js?v=20261006-vine1';
import {sofaAccessoryFromSofa} from './sofa-accessory-placement.js?v=20261006-vine1';
import {validateSofaRegistration,installSofaRegistration} from './sofa-registration-data.js?v=20261006-vine1';
import {isCatalogItem,catalogFurniture} from './item-manifest.js?v=3';
import {FURNITURE,itemSize} from './furniture-catalog.js?v=20261006-vine1';
import {floorPoint} from './model.js?v=20261006-vine1';
import {prepareRuntime,runtimePoseValid,renderRuntime,runtimeMinimumElevation,runtimeContactBoxes} from './anchor-editor/runtime.js?v=20261006-vine1';
import {listMadeItems} from './custom-store.js?v=20261006-vine1';
import {straightenChairLegs} from './chair-straight-regions.js?v=20261006-vine1';
import {builtInAssets,loadBuiltInAssetList} from './built-in-assets.js?v=20261006-vine1';
import {readBuiltInAsset} from './built-in-cache.js?v=20261006-vine1';
const items=new Map(),readyBuiltIns=new Set();
const sofaDependents=new Set(['sofa','cream-floral-cushion','sage-cushion','peach-cushion','pink-check-cushion','blanket-sofa','blanket-floor']);
const floorBlanketDependents=new Set(['sofa','blanket-floor','blanket-sofa']);
const pendingBuiltIns=new Map();
const retryBuiltIns=new Set();
let pendingCatalog;
const loadCatalog=()=>pendingCatalog??=loadBuiltInAssetList().then(()=>{Object.assign(FURNITURE,catalogFurniture(builtInAssets));});
export const builtInItemReady=id=>{
 if(sofaDependents.has(id)){
  const required=['sofa','sofa-blanket'];
  if(id==='sofa'||isSofaCushion(id))required.push('sofa-cushions');
  if(floorBlanketDependents.has(id))required.push('floor-blanket');
  return required.every(asset=>readyBuiltIns.has(asset));
 }
 return !Object.hasOwn(builtInAssets,id)||readyBuiltIns.has(id);
};
const registeredViews=runtime=>Object.fromEntries(['left','center','right'].map(direction=>[direction,{...runtime.views[direction].placement,direction}]));
// Approved built-ins use the exact 2D runtimes exported by the studio.
// They never occupy an owner's made-item slot or add themselves to a saved room.
export async function loadBuiltInItems(ids){
 await loadCatalog();ids??=Object.keys(builtInAssets);
 if(ids.some(id=>floorBlanketDependents.has(id)))ids=[...ids,'floor-blanket'];
 if(ids.some(id=>id==='sofa'||isSofaCushion(id)))ids=[...ids,'sofa-cushions'];
 if(ids.some(id=>sofaDependents.has(id)))ids=[...ids,'sofa','sofa-blanket'];
 if(ids.some(id=>isCatalogItem(id)&&!Object.hasOwn(builtInAssets,id)))throw new Error('저장된 아이템 목록을 찾지 못했어요. 닫은 뒤 다시 열어 주세요. 기존 배치는 보존됩니다.');
 await Promise.all([...new Set(ids)].filter(id=>Object.hasOwn(builtInAssets,id)).map(id=>{
  if(readyBuiltIns.has(id))return;
  if(pendingBuiltIns.has(id))return pendingBuiltIns.get(id);
  const pending=(async()=>{
  const {file,revision}=builtInAssets[id];
  const item=id==='floor-blanket'?{shortLabel:'바닥 담요'}:id==='sofa-blanket'?{shortLabel:'담요'}:id==='sofa-cushions'?{shortLabel:'쿠션'}:FURNITURE[id],url=new URL('./assets/'+file,import.meta.url);
  url.searchParams.set('v',revision);
  let asset;
  try{asset=await readBuiltInAsset(url,{reload:retryBuiltIns.has(id)});}catch{throw new Error(item.shortLabel+'을 불러오지 못했어요. 다시 열어 주세요. 기존 배치는 보존됩니다.');}
  const {response}=asset;
  if(!response.ok)throw new Error(item.shortLabel+'을 불러오지 못했어요. 다시 열어 주세요. 기존 배치는 보존됩니다.');
  let prepared;
  try{
   const runtime=await response.json();
   if(id==='floor-blanket')prepared=validateFloorBlanket(runtime);
   else if(id==='sofa-blanket')prepared=validateSofaBlanket(runtime);
   else if(id==='sofa-cushions')prepared=validateSofaCushions(runtime);
   else if(id==='sofa')prepared=validateSofaRegistration(runtime);
   else prepared=await prepareRuntime(id==='chair'?straightenChairLegs(runtime):runtime);
   if(id!=='sofa'&&id!=='sofa-cushions'&&id!=='sofa-blanket'&&id!=='floor-blanket'&&(['width','depth','height'].some(key=>prepared.runtime.dimensions[key]!==item[key])||prepared.runtime.layer!==item.layer))throw new Error('catalog mismatch');
  }catch{await asset.discard();throw new Error(item.shortLabel+' 정보를 확인하지 못했어요. 다시 열어 주세요. 기존 배치는 보존됩니다.');}
  await asset.keep();
  readyBuiltIns.add(id);retryBuiltIns.delete(id);
  if(id==='floor-blanket'){installFloorBlanket(prepared);return;}
  if(id==='sofa-blanket'){
   installSofaBlanket(prepared);
   for(const blanket of ['blanket-floor','blanket-sofa'])FURNITURE[blanket].preview=prepared.center.image;
   return;
  }
  if(id==='sofa-cushions'){
   installSofaCushions(prepared);
   for(const [cushion,{views}]of Object.entries(prepared)){
    FURNITURE[cushion].preview=views.center.image;
    FURNITURE[cushion].preferred={...sofaAccessoryFromSofa(cushion,{direction:'center',x:3,y:3}),elevation:0};
   }
   return;
  }
  if(id==='sofa'){installSofaRegistration(prepared);return;}
  items.set(id,prepared);if(prepared.runtime.version===3)item.clearance='화분 밑면 높이를 선반에 맞춰요. 늘어진 잎이 바닥이나 다른 가구에 닿지 않게 놓아 주세요.';if(item.preferredViews||isCatalogItem(id))item.preferredViews=registeredViews(prepared.runtime);if(isCatalogItem(id))item.preferred={...item.preferredViews.left};
  })().catch(error=>{retryBuiltIns.add(id);throw error;}).finally(()=>pendingBuiltIns.delete(id));
  pendingBuiltIns.set(id,pending);return pending;
 }));
}
export async function registerMadeItem(record){
 if(!/^made-[a-f0-9]{24}$/.test(record?.id))throw new Error('제작 아이템 번호를 확인해 주세요.');
 const prepared=await prepareRuntime(record.runtime),r=prepared.runtime;
 items.set(record.id,prepared);FURNITURE[record.id]={label:r.name,shortLabel:r.name,...r.dimensions,depthFill:1,introduced:20,autoPlace:false,directions:['left','center','right'],anchor:'rear',layer:r.layer,picture:'made',preview:r.views.center.preview,preferred:r.views.left.placement,preferredViews:registeredViews(r),clearance:r.layer==='surface'?'높이를 책상 상판에 맞춰 놓아 주세요. 따로 이동하고 회수할 수 있어요.':'제작실에서 만든 아이템 · 이 기기에 저장됩니다.'};
 return record.id;
}
export async function loadMadeItems(owner){const records=await listMadeItems(owner);for(const r of records)await registerMadeItem(r);}
export function madePoseValid(id,p){const item=items.get(id);return !!item&&runtimePoseValid(item.runtime,p);}
export function madeArtwork(id,p,contact){
 const item=items.get(id),rendered=renderRuntime(item,p),size=itemSize(id,p.direction);
 const footprint=[[p.x,p.y],[p.x+size.w,p.y],[p.x+size.w,p.y+size.d],[p.x,p.y+size.d]].map(([x,y])=>floorPoint(x,y));
 // The carpet's source canvas includes transparent padding around its floor quad.
 // Placement handles identify the rug footprint, not those padded image corners.
 const anchors=id==='carpet'?footprint:rendered.anchors;
 return {...rendered,anchors,footprint,reserved:footprint,contact,faces:[],art:{kind:'made',canvas:rendered.canvas}};
}

export function madeMinimumElevation(id,direction){const item=items.get(id);return item?runtimeMinimumElevation(item.runtime,direction):0;}
export function madeContactBoxes(id,placement){const item=items.get(id);return item?runtimeContactBoxes(item.runtime,placement):[];}
