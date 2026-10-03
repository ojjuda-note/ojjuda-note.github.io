import {floorPoint,roomPoint} from './model.js?v=20261004-chairback1';
import {SOFA_ACCESSORY_IMAGES,SOFA_V1} from './sofa-v1-registration.js?v=20261004-chairback1';
import {SOFA_CUSHION_SEATS} from './sofa-cushion-placement.js?v=20261004-chairback1';
import {getSofaBlanketDrape,projectSofaBlanketDrape} from './sofa-blanket-drape.js?v=20261004-chairback1';
import {sofaAccessorySpec,sofaAccessoryOrigin,sofaAccessoryFromSofa,isBlanket,blanketMode} from './sofa-accessory-placement.js?v=20261004-chairback1';

// Keep the authored image plane and drape registrations unchanged. Independent
// coordinates translate their support origin; elevation moves only room z.
export function sofaAccessoryLayers(id,placement){
 if(isBlanket(id))id='blanket-sofa';
 const spec=sofaAccessorySpec(id),origin=sofaAccessoryOrigin(id,placement),direction=placement.direction;
 if(!spec||!origin)throw new RangeError('소품의 방향 또는 위치가 올바르지 않습니다.');
 const elevation=placement.elevation??0,project=(x,y,z)=>roomPoint(x,y,z-spec.baseElevation+elevation);
 const asset=SOFA_ACCESSORY_IMAGES[id][direction];
 if(id==='blanket-sofa'){
  const drape=projectSofaBlanketDrape(getSofaBlanketDrape(direction),direction,origin,project);
  return [{id,image:asset.image,triangles:drape.surface,sofaSurface:true},{id:id+'-front',image:asset.image,triangles:drape.front}];
 }
 const seat=SOFA_CUSHION_SEATS[id],n=4,triangles=[],[sx,sy,sw,sh]=asset.sourceRect;
 const point=(s,t)=>{
  const u=seat.u+(s-.5)*seat.width,v=seat.v+(direction==='left'?.48:direction==='right'?-.48:0)*(s-.5);
  const x=direction==='center'?u:direction==='left'?v:1.5-v,y=direction==='center'?v:direction==='left'?3.5-u:u;
  return project(origin.x+x,origin.y+y,seat.bottom+(1-t)*seat.height);
 };
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const corners=[[x/n,y/n],[(x+1)/n,y/n],[(x+1)/n,(y+1)/n],[x/n,(y+1)/n]];
  for(const indices of [[0,1,2],[0,2,3]])triangles.push({source:indices.map(i=>[sx+corners[i][0]*sw,sy+corners[i][1]*sh]),target:indices.map(i=>point(...corners[i]))});
 }
 return [{id,image:asset.image,triangles,sofaSurface:true}];
}
export function sofaAccessoryArtwork(item,placement,contact,size){
 const layers=sofaAccessoryLayers(item.accessoryId,placement),points=layers.flatMap(layer=>layer.triangles.flatMap(triangle=>triangle.target));
 const left=Math.min(...points.map(p=>p.x))-2,top=Math.min(...points.map(p=>p.y))-2,right=Math.max(...points.map(p=>p.x))+2,bottom=Math.max(...points.map(p=>p.y))+2;
 const footprint=[[placement.x,placement.y],[placement.x+size.w,placement.y],[placement.x+size.w,placement.y+size.d],[placement.x,placement.y+size.d]].map(p=>floorPoint(...p));
 return {footprint,reserved:footprint,anchors:footprint,contact,faces:[],left,top,width:right-left,height:bottom-top,art:{kind:'sofa-accessory',layers}};
}

const blanketAreaCache=new Map();
const triangleArea=triangle=>{const [a,b,c]=triangle.target;return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);};
export function sofaAccessoryPoseValid(id,placement){
 if(!isBlanket(id)||blanketMode(id,placement)!=='sofa')return true;
 id='blanket-sofa';
 try{
  const direction=placement.direction;
  if(!blanketAreaCache.has(direction)){
   const reference=sofaAccessoryFromSofa(id,SOFA_V1[direction].placement);
   blanketAreaCache.set(direction,sofaAccessoryLayers(id,reference).flatMap(layer=>layer.triangles.map(triangleArea)));
  }
  const original=blanketAreaCache.get(direction),current=sofaAccessoryLayers(id,placement).flatMap(layer=>layer.triangles.map(triangleArea));
  // A far-side position can reverse the draped picture's faces. Keep its
  // authored direction, just as the parent sofa rejects a folded picture mesh.
  return current.length===original.length&&current.every((area,index)=>area*original[index]>0);
 }catch{return false;}
}
