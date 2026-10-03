import {floorPoint,roomPoint} from './model.js?v=20261003-chairdesk1';
import {SOFA_V1,SOFA_ACCESSORY_IMAGES} from './sofa-v1-registration.js?v=20261003-chairdesk1';
import {projectMesh,validateMesh} from './picture-mesh.js?v=20261003-chairdesk1';
import {getSofaBlanketDrape,projectSofaBlanketDrape} from './sofa-blanket-drape.js?v=20261003-chairdesk1';
import {SOFA_CUSHION_SEATS,sofaCushionOrder} from './sofa-cushion-placement.js?v=20261003-chairdesk1';
export {SOFA_CUSHION_SEATS} from './sofa-cushion-placement.js?v=20261003-chairdesk1';

// Cushion support points are authored placements on the seat. A cushion has
// one unbroken picture plane rather than inheriting the sofa's seat/back seam.
function cushionLayer(id,direction,placement){
 const asset=SOFA_ACCESSORY_IMAGES[id][direction],seat=SOFA_CUSHION_SEATS[id],n=4,triangles=[];
 const [sx,sy,sw,sh]=asset.sourceRect;
 const point=(s,t)=>{
  const u=seat.u+(s-.5)*seat.width;
  const v=seat.v+(direction==='left'?.48:direction==='right'?-.48:0)*(s-.5);
  const x=direction==='center'?u:direction==='left'?v:1.5-v;
  const y=direction==='center'?v:direction==='left'?3.5-u:u;
  return roomPoint(placement.x+x,placement.y+y,seat.bottom+(1-t)*seat.height);
 };
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const corners=[[x/n,y/n],[(x+1)/n,y/n],[(x+1)/n,(y+1)/n],[x/n,(y+1)/n]];
  for(const ids of [[0,1,2],[0,2,3]])triangles.push({source:ids.map(i=>[sx+corners[i][0]*sw,sy+corners[i][1]*sh]),target:ids.map(i=>point(...corners[i]))});
 }
 return {id,image:asset.image,triangles};
}
export function sofaPoseValid(placement,item){
 const registration=SOFA_V1[placement?.direction];
 return !!registration&&validateMesh(registration.mesh,{...placement,width:item.width,depth:item.depth,height:item.height}).ok;
}
export function sofaArtwork(item,placement,contact,size){
 const registration=SOFA_V1[placement.direction];
 if(!registration)throw new RangeError('Unknown sofa picture direction');
 const pose={...placement,width:item.width,depth:item.depth,height:item.height};
 const projected=projectMesh(registration.mesh,pose),points=projected.points.map(p=>p.target);
 const footprint=[[contact.x,contact.y],[contact.x+contact.w,contact.y],[contact.x+contact.w,contact.y+contact.d],[contact.x,contact.y+contact.d]].map(p=>floorPoint(...p));
 const reserved=[[placement.x,placement.y],[placement.x+size.w,placement.y],[placement.x+size.w,placement.y+size.d],[placement.x,placement.y+size.d]].map(p=>floorPoint(...p));
 const layers=[],enabled=id=>placement.accessories?.[id]!==false;
 const accessory=id=>({id,...SOFA_ACCESSORY_IMAGES[id][placement.direction]});
 const blanket=enabled('blanket-sofa')?projectSofaBlanketDrape(getSofaBlanketDrape(placement.direction),placement.direction,pose,roomPoint):null;
 const blanketLayer=part=>({id:part==='surface'?'blanket-sofa':'blanket-sofa-front',image:SOFA_ACCESSORY_IMAGES['blanket-sofa'][placement.direction].image,triangles:blanket[part]});
 for(const id of registration.order){
  if(id==='slot:surface'){
   if(blanket)layers.push(blanketLayer('surface'));
   layers.push(...sofaCushionOrder(Object.keys(SOFA_CUSHION_SEATS).filter(enabled),placement.direction).map(accessory));
  }
  else if(id==='slot:front'){if(blanket)layers.push(blanketLayer('front'));}
  else layers.push({id,image:registration.parts[id],rect:[0,0,...registration.canvas]});
 }
 const sofaTriangles=projected.triangles.map(t=>({source:t.source.map(p=>[p.x,p.y]),target:t.target}));
 const drawLayers=layers.map(layer=>{
  if(SOFA_CUSHION_SEATS[layer.id])return cushionLayer(layer.id,placement.direction,placement);
  if(layer.triangles)return layer;
  return {...layer,triangles:sofaTriangles};
 });
 points.push(...drawLayers.flatMap(layer=>layer.triangles.flatMap(triangle=>triangle.target)));
 const left=Math.min(...points.map(p=>p.x))-2,top=Math.min(...points.map(p=>p.y))-2,right=Math.max(...points.map(p=>p.x))+2,bottom=Math.max(...points.map(p=>p.y))+2;
 return {footprint,reserved,anchors:projected.points.filter(p=>p.kind==='physical'&&Math.abs(p.world.z)<1e-8).map(p=>p.target),contact,faces:[],left,top,width:right-left,height:bottom-top,
  art:{kind:'sofa',canvas:registration.canvas,layers:drawLayers,mesh:{definition:registration.mesh,placement:pose},triangles:sofaTriangles}};
}
