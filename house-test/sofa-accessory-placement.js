import {SOFA_CUSHION_SEATS} from './sofa-cushion-placement.js?v=20261003-houseopen1';

// These are each item's reserved support area, not the transparent image frame.
// The draped blanket keeps the original hanging ends outside its support area.
const blanket={width:1.6,depth:1.1,height:1.015,baseElevation:.025};
const rounded=value=>Number(value.toFixed(6));
export function sofaAccessorySpec(id){
 const seat=SOFA_CUSHION_SEATS[id];
 return seat?{width:seat.width,depth:.5,height:seat.height,baseElevation:seat.bottom}:id==='blanket-sofa'?{...blanket}:null;
}
export function sofaAccessoryOffset(id,direction){
 if(!['left','center','right'].includes(direction))return null;
 const seat=SOFA_CUSHION_SEATS[id];
 if(seat){
  const {u,v,width}=seat;
  const offsets={center:{x:u-width/2,y:v-.25},left:{x:v-.25,y:3.5-u-width/2},right:{x:1.5-v-.25,y:u-width/2}};
  return Object.fromEntries(Object.entries(offsets[direction]).map(([key,value])=>[key,rounded(value)]));
 }
 return id==='blanket-sofa'?{...{center:{x:.01,y:.38},left:{x:.38,y:1.89},right:{x:.02,y:.01}}[direction]}:null;
}
export function sofaAccessoryFromSofa(id,sofa){
 const spec=sofaAccessorySpec(id),offset=sofaAccessoryOffset(id,sofa?.direction);
 if(!spec||!offset||![sofa?.x,sofa?.y].every(Number.isFinite))return null;
 return {direction:sofa.direction,x:rounded(sofa.x+offset.x),y:rounded(sofa.y+offset.y),elevation:spec.baseElevation};
}
export function sofaAccessoryOrigin(id,placement){
 const offset=sofaAccessoryOffset(id,placement?.direction);
 return offset?{direction:placement.direction,x:placement.x-offset.x,y:placement.y-offset.y,width:3.5,depth:1.5,height:1.8}:null;
}
