import {FURNITURE,itemSize} from './furniture-catalog.js?v=20261003-furniture-scale1';
import {floorPoint} from './model.js?v=20261003-furniture-scale1';
import {prepareRuntime,runtimePoseValid,renderRuntime} from './anchor-editor/runtime.js?v=20261003-furniture-scale1';
import {listMadeItems} from './custom-store.js?v=20261003-furniture-scale1';
const items=new Map();
// The approved built-in uses the exact 2D runtime exported by the studio.
// It never occupies an owner's made-item slot or adds itself to a saved room.
export async function loadBuiltInItems(){
 const url=new URL('./assets/coffee-table-v2.runtime.json',import.meta.url);
 url.searchParams.set('v',new URL(import.meta.url).searchParams.get('v')||'20261003-furniture-scale1');
 const response=await fetch(url);if(!response.ok)throw new Error('거실 테이블을 불러오지 못했어요. 다시 열어 주세요. 기존 배치는 보존됩니다.');
 const prepared=await prepareRuntime(await response.json()),item=FURNITURE['coffee-table'];
 if(['width','depth','height'].some(key=>prepared.runtime.dimensions[key]!==item[key])||prepared.runtime.layer!==item.layer)throw new Error('거실 테이블 정보를 확인하지 못했어요. 다시 열어 주세요. 기존 배치는 보존됩니다.');
 items.set('coffee-table',prepared);
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
 return {...rendered,footprint,reserved:footprint,contact,faces:[],art:{kind:'made',canvas:rendered.canvas}};
}
