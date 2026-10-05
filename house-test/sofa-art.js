import {floorPoint,roomPoint} from './model.js?v=20261005-clovermug1';
import {SOFA_V1} from './sofa-v1-registration.js?v=20261005-clovermug1';
import {projectMesh,validateMesh} from './picture-mesh.js?v=20261005-clovermug1';
export {SOFA_CUSHION_SEATS} from './sofa-cushion-placement.js?v=20261005-clovermug1';
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
 const layers=registration.order.filter(id=>!id.startsWith('slot:')).map(id=>({id,image:registration.parts[id],rect:[0,0,...registration.canvas]}));
 const sofaTriangles=projected.triangles.map(t=>({source:t.source.map(p=>[p.x,p.y]),target:t.target}));
 const drawLayers=layers.map(layer=>({...layer,triangles:sofaTriangles}));
 points.push(...drawLayers.flatMap(layer=>layer.triangles.flatMap(triangle=>triangle.target)));
 const left=Math.min(...points.map(p=>p.x))-2,top=Math.min(...points.map(p=>p.y))-2,right=Math.max(...points.map(p=>p.x))+2,bottom=Math.max(...points.map(p=>p.y))+2;
 return {footprint,reserved,anchors:projected.points.filter(p=>p.kind==='physical'&&Math.abs(p.world.z)<1e-8).map(p=>p.target),contact,faces:[],left,top,width:right-left,height:bottom-top,
  art:{kind:'sofa',canvas:registration.canvas,layers:drawLayers,mesh:{definition:registration.mesh,placement:pose},triangles:sofaTriangles}};
}

export function sofaForegroundLayers(geometry,direction){
 const order=SOFA_V1[direction].order,nearParts=order.slice(order.indexOf('slot:surface')+1).filter(id=>!id.startsWith('slot:'));
 return geometry.art.layers.filter(layer=>nearParts.includes(layer.id));
}
