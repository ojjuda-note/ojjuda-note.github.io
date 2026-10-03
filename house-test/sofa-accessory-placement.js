import {SOFA_CUSHION_SEATS} from './sofa-cushion-placement.js?v=20261004-chairleg2';

// These are each item's reserved support area, not the transparent image frame.
// The draped blanket keeps the original hanging ends outside its support area.
const blanket={width:1.6,depth:1.1,height:1.015,baseElevation:.025};
const floorBlanket={width:2,depth:1.5,height:.05,baseElevation:0};
const rounded=value=>Number(value.toFixed(6));
export const isBlanket=id=>id==='blanket-floor'||id==='blanket-sofa';
export function blanketMode(id,placement){
 return placement?.mode==='floor'||placement?.mode==='sofa'?placement.mode:id==='blanket-sofa'?'sofa':'floor';
}
export function blanketSpec(mode){return {...(mode==='sofa'?blanket:floorBlanket)};}
export function sofaAccessorySpec(id){
 const seat=SOFA_CUSHION_SEATS[id];
 return seat?{width:seat.width,depth:.5,height:seat.height,baseElevation:seat.bottom}:isBlanket(id)?{...blanket}:null;
}
export function sofaAccessoryOffset(id,direction){
 if(!['left','center','right'].includes(direction))return null;
 const seat=SOFA_CUSHION_SEATS[id];
 if(seat){
  const {u,v,width}=seat;
  const offsets={center:{x:u-width/2,y:v-.25},left:{x:v-.25,y:3.5-u-width/2},right:{x:1.5-v-.25,y:u-width/2}};
  return Object.fromEntries(Object.entries(offsets[direction]).map(([key,value])=>[key,rounded(value)]));
 }
 return isBlanket(id)?{...{center:{x:.01,y:.38},left:{x:.38,y:1.89},right:{x:.02,y:.01}}[direction]}:null;
}
export function sofaAccessoryFromSofa(id,sofa){
 const spec=sofaAccessorySpec(id),offset=sofaAccessoryOffset(id,sofa?.direction);
 if(!spec||!offset||![sofa?.x,sofa?.y].every(Number.isFinite))return null;
 return {direction:sofa.direction,x:rounded(sofa.x+offset.x),y:rounded(sofa.y+offset.y),elevation:spec.baseElevation};
}
// Bringing a cushion close to the sofa places it at its approved seat once.
// It remains an independent item: there is no parent link or saved snap state.
export function snapCushionToSofa(id,candidate,sofa){
 if(!Object.hasOwn(SOFA_CUSHION_SEATS,id)||!['left','center','right'].includes(candidate?.direction)||!['left','center','right'].includes(sofa?.direction)||![candidate?.x,candidate?.y,sofa?.x,sofa?.y].every(Number.isFinite))return null;
 const spec=sofaAccessorySpec(id),front=candidate.direction==='center',w=front?spec.width:spec.depth,d=front?spec.depth:spec.width;
 if(!nearSofa(candidate,w,d,sofa))return null;
 const snapped=sofaAccessoryFromSofa(id,sofa),targetFront=sofa.direction==='center';
 return snapped&&inRoom(snapped.x,snapped.y,targetFront?spec.width:spec.depth,targetFront?spec.depth:spec.width)?snapped:null;
}
const inRoom=(x,y,width,depth)=>x>=0&&y>=0&&x+width<=10+1e-6&&y+depth<=7+1e-6;
function nearSofa(candidate,w,d,sofa){
 if(!['left','center','right'].includes(candidate?.direction)||!['left','center','right'].includes(sofa?.direction)||![candidate?.x,candidate?.y,sofa?.x,sofa?.y].every(Number.isFinite))return false;
 const sofaWidth=sofa.direction==='center'?3.5:1.5,sofaDepth=sofa.direction==='center'?1.5:3.5;
 // The shared authoring grid is 10 by 7. Never use a malformed/off-room sofa
 // as an automatic destination or silently clamp its approved seat position.
 if(!inRoom(sofa.x,sofa.y,sofaWidth,sofaDepth))return false;
 const dx=Math.max(sofa.x-candidate.x-w,candidate.x-sofa.x-sofaWidth,0),dy=Math.max(sofa.y-candidate.y-d,candidate.y-sofa.y-sofaDepth,0);
 return Math.hypot(dx,dy)<=.35+1e-9;
}
// Pointer movement places independent soft furnishings on the floor once they
// leave the sofa. Explicit height-slider edits deliberately do not call this.
export function resolveAccessoryDrag(id,candidate,sofa){
 if(!candidate||(!Object.hasOwn(SOFA_CUSHION_SEATS,id)&&!isBlanket(id)))return candidate;
 if(!isBlanket(id))return snapCushionToSofa(id,candidate,sofa)||{...candidate,elevation:0};
 const spec=blanketSpec(blanketMode(id,candidate)),front=candidate.direction==='center';
 if(nearSofa(candidate,front?spec.width:spec.depth,front?spec.depth:spec.width,sofa)){
  const snapped=sofaAccessoryFromSofa(id,sofa),target=blanketSpec('sofa'),targetFront=sofa.direction==='center';
  if(snapped&&inRoom(snapped.x,snapped.y,targetFront?target.width:target.depth,targetFront?target.depth:target.width))return {...snapped,mode:'sofa'};
 }
 return {...candidate,mode:'floor',elevation:0};
}
export function sofaAccessoryOrigin(id,placement){
 const offset=sofaAccessoryOffset(id,placement?.direction);
 return offset?{direction:placement.direction,x:placement.x-offset.x,y:placement.y-offset.y,width:3.5,depth:1.5,height:1.8}:null;
}
