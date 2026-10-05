import {SOFA_V1} from './sofa-v1-registration.js?v=20261005-sofadata1';
import {normalizeMesh,projectMesh} from './picture-mesh.js?v=20261005-sofadata1';
const directions=['left','center','right'],parts=['left-arm','body','right-arm'],slots=['slot:surface','slot:front'];
const invalid=()=>{throw new Error('Invalid sofa registration');};
export function validateSofaRegistration(value){
 if(value?.format!=='ojjuda-sofa-registration'||value.version!==1||!value.views||Object.keys(value.views).length!==3)invalid();
 for(const direction of directions){
  const v=value.views[direction],p=v?.placement;
  if(!p||p.direction!==direction||p.width!==3.5||p.depth!==1.5||p.height!==1.8||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x+(direction==='center'?3.5:1.5)>10||p.y+(direction==='center'?1.5:3.5)>7)invalid();
  if(!Array.isArray(v.canvas)||v.canvas.length!==2||!v.canvas.every(n=>Number.isInteger(n)&&n>0&&n<=8192))invalid();
  if(!v.parts||Object.keys(v.parts).length!==3||!parts.every(id=>/^assets\/[-a-z0-9]+\.png$/.test(v.parts[id])))invalid();
  if(!Array.isArray(v.order)||v.order.length!==5||new Set(v.order).size!==5||!v.order.every(id=>parts.includes(id)||slots.includes(id)))invalid();
  const mesh=normalizeMesh(v.mesh),d=mesh.referenceDimensions;
  if(d&&(d.width!==3.5||d.depth!==1.5||d.height!==1.8))invalid();
  const feet=mesh.anchors.filter(a=>a.kind==='physical'&&Math.abs(a.world.z)<1e-8);
  if(feet.length<(direction==='center'?2:3)||feet.some(a=>a.world.x<0||a.world.y<0||a.world.x>(direction==='center'?3.5:1.5)||a.world.y>(direction==='center'?1.5:3.5)))invalid();
  projectMesh(v.mesh,p);
 }
 return structuredClone(value.views);
}
// Validate all three views first; a bad download must not partly replace them.
export function installSofaRegistration(views){Object.assign(SOFA_V1,views);}
