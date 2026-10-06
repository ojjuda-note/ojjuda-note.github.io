import {FLOOR_BLANKET_REGISTRATION} from './floor-blanket-registration.js?v=20261006-sofaparts1';
import {validateFloorBlanketProjection} from './accessory-art.js?v=20261006-sofaparts1';
const directions=['left','center','right'];
const invalid=()=>{throw new Error('Invalid floor blanket registration');};
const points=(value,w,h,min,max)=>Array.isArray(value)&&value.length>=min&&value.length<=max&&value.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=0&&p[1]>=0&&p[0]<=w&&p[1]<=h);
function convexQuad(points){
 const turns=points.map((a,i)=>{const b=points[(i+1)%4],c=points[(i+2)%4];return (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);});
 return turns.every(v=>v>1e-8);
}
export function validateFloorBlanket(value){
 const d=value?.dimensions;
 if(value?.format!=='ojjuda-floor-blanket'||value.version!==1||d?.width!==2||d.depth!==1.5||d.height!==.05||!value.views||Object.keys(value.views).length!==3)invalid();
 for(const direction of directions){
  const v=value.views[direction];
  if(!/^assets\/[-a-z0-9]+\.png$/.test(v?.image)||!Array.isArray(v.canvas)||v.canvas.length!==2||!v.canvas.every(n=>Number.isInteger(n)&&n>0&&n<=8192))invalid();
  const [w,h]=v.canvas;
  if(!points(v.sourceCorners,w,h,4,4)||!points(v.normalizedFloorCorners,1,1,4,4)||!convexQuad(v.sourceCorners)||!convexQuad(v.normalizedFloorCorners)||!points(v.alphaHull,w,h,3,2048))invalid();
  if(v.sourceSha256!==undefined&&!/^[a-f0-9]{64}$/.test(v.sourceSha256))invalid();
  const area=v.alphaHull.reduce((sum,a,i)=>{const b=v.alphaHull[(i+1)%v.alphaHull.length];return sum+a[0]*b[1]-a[1]*b[0];},0);
  if(Math.abs(area)<1e-8)invalid();
  validateFloorBlanketProjection(v);
 }
 return structuredClone(value.views);
}
// Replace complete view objects so the renderer's WeakMap grid cache refreshes.
export function installFloorBlanket(views){Object.assign(FLOOR_BLANKET_REGISTRATION,views);}
