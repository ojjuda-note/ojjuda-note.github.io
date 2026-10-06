import {SOFA_ACCESSORY_IMAGES} from './sofa-v1-registration.js?v=20261006-assembly1';
import {SOFA_CUSHION_SEATS} from './sofa-cushion-placement.js?v=20261006-assembly1';
const baseline=structuredClone(SOFA_CUSHION_SEATS),directions=['left','center','right'];
export const isSofaCushion=id=>Object.hasOwn(baseline,id);
const invalid=()=>{throw new Error('Invalid sofa cushion registration');};
export function validateSofaCushions(value){
 if(value?.format!=='ojjuda-sofa-cushions'||value.version!==1||!value.cushions||Object.keys(value.cushions).length!==4)invalid();
 for(const [id,original]of Object.entries(baseline)){
  const entry=value.cushions[id],seat=entry?.seat,views=entry?.views;
  // Existing IDs keep their reserved dimensions so saved rooms remain valid.
  if(!seat||seat.width!==original.width||seat.height!==original.height||!['u','v','bottom'].every(key=>Number.isFinite(seat[key])))invalid();
  if(seat.u<seat.width/2||seat.u+seat.width/2>3.5||seat.v<.25||seat.v>1.25||seat.bottom<0||seat.bottom+seat.height>1.8)invalid();
  if(!views||Object.keys(views).length!==3)invalid();
  for(const direction of directions){
   const view=views[direction],rect=view?.sourceRect;
   if(!/^assets\/[-a-z0-9]+\.png$/.test(view?.image)||!Array.isArray(rect)||rect.length!==4||!rect.every(Number.isInteger))invalid();
   const [x,y,w,h]=rect;if(x<0||y<0||w<=0||h<=0||x+w>8192||y+h>8192)invalid();
  }
 }
 return structuredClone(value.cushions);
}
// Install only after the entire set has passed validation; retain shared maps.
export function installSofaCushions(cushions){
 for(const [id,{seat,views}]of Object.entries(cushions)){
  SOFA_CUSHION_SEATS[id]=seat;SOFA_ACCESSORY_IMAGES[id]=views;
 }
}
