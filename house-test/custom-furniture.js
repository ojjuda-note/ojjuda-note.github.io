import {FURNITURE,itemSize} from './furniture-catalog.js?v=20261003-house-fix1';
import {floorPoint} from './model.js?v=20261003-house-fix1';
import {prepareRuntime,runtimePoseValid,renderRuntime} from './anchor-editor/runtime.js?v=20261003-house-fix1';
import {listMadeItems} from './custom-store.js?v=20261003-house-fix1';
const items=new Map();
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
