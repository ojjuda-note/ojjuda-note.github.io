import {roomPoint} from './model.js?v=20261005-floorprops1';
import {SIDE_TABLE_V3} from './side-table-registration.js?v=20261005-floorprops1';
import {registeredArtwork} from './registered-artwork.js?v=20261005-floorprops1';

const area=points=>points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-p.y*q.x;},0)/2;
// Keep each independently drawn face visible; never mirror it across the room.
export function sideTablePoseValid(placement){
 const registration=SIDE_TABLE_V3[placement?.direction];if(!registration)return false;
 const dx=placement.x-registration.placement.x,dy=placement.y-registration.placement.y;
 return registration.layers.every(layer=>{
  const original=area(layer.world.map(p=>roomPoint(...p)));
  const moved=area(layer.world.map(([x,y,z])=>roomPoint(x+dx,y+dy,z)));
  return Number.isFinite(moved)&&Math.abs(moved)>1&&original*moved>0;
 });
}
export function sideTableArtwork(item,placement,contact,size){
 return registeredArtwork(SIDE_TABLE_V3[placement.direction],placement,contact,size);
}
