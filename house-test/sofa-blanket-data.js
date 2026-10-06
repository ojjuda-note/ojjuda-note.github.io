import {SOFA_ACCESSORY_IMAGES,SOFA_V1} from './sofa-v1-registration.js?v=20261006-vine1';
import {normalizeSofaBlanketDrape,projectSofaBlanketDrape,installSofaBlanketDrapes} from './sofa-blanket-drape.js?v=20261006-vine1';
import {roomPoint} from './model.js?v=20261006-vine1';
const directions=['left','center','right'];
const invalid=()=>{throw new Error('Invalid sofa blanket registration');};
export function validateSofaBlanket(value){
 if(value?.format!=='ojjuda-sofa-blanket'||value.version!==1||!value.views||Object.keys(value.views).length!==3)invalid();
 const result={};
 for(const direction of directions){
  const v=value.views[direction],rect=v?.sourceRect;
  if(!/^assets\/[-a-z0-9]+\.png$/.test(v?.image)||!Array.isArray(rect)||rect.length!==4||!rect.every(Number.isInteger))invalid();
  const [x,y,w,h]=rect;if(x<0||y<0||w<=0||h<=0||x+w>8192||y+h>8192)invalid();
  const drape=normalizeSofaBlanketDrape(v.drape,undefined,direction),d=drape.referenceDimensions;
  if(d.width!==3.5||d.depth!==1.5||d.height!==1.8||drape.rows.some(row=>row[2]<0||row[2]>1.8))invalid();
  // Reject collapsed patches before they can become the pose-check baseline.
  const layers=projectSofaBlanketDrape(drape,direction,SOFA_V1[direction].placement,roomPoint);
  for(const triangle of [...layers.surface,...layers.front]){
   const [a,b,c]=triangle.target,area=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
   if(!Number.isFinite(area)||Math.abs(area)<1e-8)invalid();
  }
  result[direction]={image:v.image,sourceRect:[...rect],drape};
 }
 return result;
}
export function installSofaBlanket(views){
 const images={},drapes={};
 for(const direction of directions){const {drape,...image}=views[direction];images[direction]=image;drapes[direction]=drape;}
 SOFA_ACCESSORY_IMAGES['blanket-sofa']=images;installSofaBlanketDrapes(drapes);
}
