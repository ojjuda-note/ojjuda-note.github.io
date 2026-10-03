import {FURNITURE,itemSize} from './furniture-catalog.js?v=20261004-chairfarrear1';
import {floorPoint} from './model.js?v=20261004-chairfarrear1';
import {prepareRuntime,runtimePoseValid,renderRuntime} from './anchor-editor/runtime.js?v=20261004-chairfarrear1';
import {listMadeItems} from './custom-store.js?v=20261004-chairfarrear1';
import {straightenChairLegs} from './chair-straight-regions.js?v=20261004-chairfarrear1';
import {builtInAssets} from './built-in-assets.js?v=20261004-chairfarrear1';
import {readBuiltInAsset} from './built-in-cache.js?v=20261004-chairfarrear1';
const items=new Map();
const pendingBuiltIns=new Map();
const retryBuiltIns=new Set();
export const builtInItemReady=id=>!Object.hasOwn(builtInAssets,id)||items.has(id);
const registeredViews=runtime=>Object.fromEntries(['left','center','right'].map(direction=>[direction,{...runtime.views[direction].placement,direction}]));
// Approved built-ins use the exact 2D runtimes exported by the studio.
// They never occupy an owner's made-item slot or add themselves to a saved room.
export async function loadBuiltInItems(ids=Object.keys(builtInAssets)){
 await Promise.all([...new Set(ids)].filter(id=>Object.hasOwn(builtInAssets,id)).map(id=>{
  if(items.has(id))return;
  if(pendingBuiltIns.has(id))return pendingBuiltIns.get(id);
  const pending=(async()=>{
  const {file,revision}=builtInAssets[id];
  const item=FURNITURE[id],url=new URL('./assets/'+file,import.meta.url);
  url.searchParams.set('v',revision);
  let asset;
  try{asset=await readBuiltInAsset(url,{reload:retryBuiltIns.has(id)});}catch{throw new Error(item.shortLabel+'을 불러오지 못했어요. 다시 열어 주세요. 기존 배치는 보존됩니다.');}
  const {response}=asset;
  if(!response.ok)throw new Error(item.shortLabel+'을 불러오지 못했어요. 다시 열어 주세요. 기존 배치는 보존됩니다.');
  let prepared;
  try{
   const runtime=await response.json();prepared=await prepareRuntime(id==='chair'?straightenChairLegs(runtime):runtime);
   if(['width','depth','height'].some(key=>prepared.runtime.dimensions[key]!==item[key])||prepared.runtime.layer!==item.layer)throw new Error('catalog mismatch');
  }catch{await asset.discard();throw new Error(item.shortLabel+' 정보를 확인하지 못했어요. 다시 열어 주세요. 기존 배치는 보존됩니다.');}
  await asset.keep();
  items.set(id,prepared);retryBuiltIns.delete(id);if(item.preferredViews)item.preferredViews=registeredViews(prepared.runtime);
  })().catch(error=>{retryBuiltIns.add(id);throw error;}).finally(()=>pendingBuiltIns.delete(id));
  pendingBuiltIns.set(id,pending);return pending;
 }));
}
export async function registerMadeItem(record){
 if(!/^made-[a-f0-9]{24}$/.test(record?.id))throw new Error('제작 아이템 번호를 확인해 주세요.');
 const prepared=await prepareRuntime(record.runtime),r=prepared.runtime;
 items.set(record.id,prepared);FURNITURE[record.id]={label:r.name,shortLabel:r.name,...r.dimensions,depthFill:1,introduced:20,autoPlace:false,directions:['left','center','right'],anchor:'rear',layer:r.layer,picture:'made',preview:r.views.center.preview,preferred:r.views.left.placement,preferredViews:registeredViews(r),clearance:'제작실에서 만든 아이템 · 이 기기에 저장됩니다.'};
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
