import {FURNITURE,itemSize} from './furniture-catalog.js?v=20261003-carpet1';
import {floorPoint} from './model.js?v=20261003-carpet1';
import {prepareRuntime,runtimePoseValid,renderRuntime} from './anchor-editor/runtime.js?v=20261003-carpet1';
import {listMadeItems} from './custom-store.js?v=20261003-carpet1';
const items=new Map();
// Approved built-ins use the exact 2D runtimes exported by the studio.
// They never occupy an owner's made-item slot or add themselves to a saved room.
export async function loadBuiltInItems(){
 const loaded=await Promise.all([
  ['coffee-table','coffee-table-v2.runtime.json'],
  ['carpet','carpet-v1.runtime.json']
 ].map(async([id,file])=>{
  const item=FURNITURE[id],url=new URL('./assets/'+file,import.meta.url);
  url.searchParams.set('v',new URL(import.meta.url).searchParams.get('v')||'20261003-carpet1');
  let response;
  try{response=await fetch(url);}catch{throw new Error(item.shortLabel+'을 불러오지 못했어요. 다시 열어 주세요. 기존 배치는 보존됩니다.');}
  if(!response.ok)throw new Error(item.shortLabel+'을 불러오지 못했어요. 다시 열어 주세요. 기존 배치는 보존됩니다.');
  let prepared;
  try{prepared=await prepareRuntime(await response.json());}catch{throw new Error(item.shortLabel+' 정보를 확인하지 못했어요. 다시 열어 주세요. 기존 배치는 보존됩니다.');}
  if(['width','depth','height'].some(key=>prepared.runtime.dimensions[key]!==item[key])||prepared.runtime.layer!==item.layer)throw new Error(item.shortLabel+' 정보를 확인하지 못했어요. 다시 열어 주세요. 기존 배치는 보존됩니다.');
  return [id,prepared];
 }));
 for(const [id,prepared]of loaded)items.set(id,prepared);
}
export async function registerMadeItem(record){
 if(!/^made-[a-f0-9]{24}$/.test(record?.id))throw new Error('제작 아이템 번호를 확인해 주세요.');
 const prepared=await prepareRuntime(record.runtime),r=prepared.runtime;
 items.set(record.id,prepared);FURNITURE[record.id]={label:r.name,shortLabel:r.name,...r.dimensions,depthFill:1,introduced:20,autoPlace:false,directions:['left','center','right'],anchor:'rear',layer:r.layer,picture:'made',preview:r.views.center.preview,preferred:r.views.left.placement,clearance:'제작실에서 만든 아이템 · 이 기기에 저장됩니다.'};
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
