import {SOFA_V1} from './sofa-v1-registration.js?v=20261006-assembly1';
import {normalizeMesh,projectMesh} from './picture-mesh.js?v=20261006-assembly1';
const directions=['left','center','right'],parts=['left-arm','body','right-arm'],slots=['slot:surface','slot:front'];
const invalid=()=>{throw new Error('Invalid sofa registration');};
export function validateSofaRegistration(value){
 if(value?.format!=='ojjuda-sofa-registration'||![1,2,3].includes(value.version)||!value.views||Object.keys(value.views).length!==3)invalid();
 for(const direction of directions){
  const v=value.views[direction],p=v?.placement;
  if(!p||p.direction!==direction||p.width!==3.5||p.depth!==1.5||p.height!==1.8||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x+(direction==='center'?3.5:1.5)>10||p.y+(direction==='center'?1.5:3.5)>7)invalid();
  if(!Array.isArray(v.canvas)||v.canvas.length!==2||!v.canvas.every(n=>Number.isInteger(n)&&n>0&&n<=8192))invalid();
  if(!v.parts||Object.keys(v.parts).length!==3||!parts.every(id=>/^assets\/[-a-z0-9]+\.png$/.test(v.parts[id])))invalid();
  if(!Array.isArray(v.order)||v.order.length!==5||new Set(v.order).size!==5||!v.order.every(id=>parts.includes(id)||slots.includes(id)))invalid();
  if(v.originalLayers!==undefined){
   // Version 3 is opt-in. Existing v1/v2 pictures and registrations keep their
   // exact renderer; older apps reject this data instead of silently warping it.
   const {side,body}=v.originalLayers||{};
   if(value.version!==3||direction!=='left'||!side||!body)invalid();
   for(const part of [side,body])if(!/^assets\/(?:[-a-z0-9]+\/)*[-a-z0-9]+\.png$/.test(part.image)||!Array.isArray(part.size)||part.size.length!==2||!part.size.every(n=>Number.isInteger(n)&&n>0&&n<=8192))invalid();
   if(!Number.isFinite(side.height)||side.height<=0||side.height>p.height||!Array.isArray(side.feet)||side.feet.length!==2||side.feet.some(point=>!Array.isArray(point)||point.length!==2||point.some((n,i)=>!Number.isFinite(n)||n<0||n>=side.size[i]))||side.feet[0][0]>=side.feet[1][0]||side.feet[0][1]<=0||side.feet[0][1]!==side.feet[1][1])invalid();
   if(!Number.isFinite(body.topHeight)||!Number.isFinite(body.bottomHeight)||body.bottomHeight<0||body.topHeight>p.height||body.topHeight<=body.bottomHeight)invalid();
   if(side.supportHeight!==undefined&&(!Number.isFinite(side.supportHeight)||side.supportHeight<=0||side.supportHeight>=side.height||!Number.isFinite(side.supportY)||side.supportY<=0))invalid();
   if([body.nearHeight,body.nearInset,body.farInset].some(n=>n!==undefined)&&(!Number.isFinite(body.nearHeight)||body.nearHeight<=body.bottomHeight||body.nearHeight>p.height||![body.nearInset,body.farInset].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||!body.supportAnchors))invalid();
   if(side.supportY!==undefined||body.supportAnchors!==undefined){
    if(!Number.isFinite(side.supportY)||side.supportY<0||side.supportY>=side.feet[0][1])invalid();
    const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every((n,i)=>Number.isFinite(n)&&n>=0&&n<body.size[i]);
    if(!Array.isArray(body.supportAnchors)||body.supportAnchors.length!==4||!body.supportAnchors.every(validPoint))invalid();
    if(body.outline!==undefined&&(!Array.isArray(body.outline)||body.outline.length<3||body.outline.length>256||!body.outline.every(validPoint)))invalid();
   }
  }
  const mesh=normalizeMesh(v.mesh),d=mesh.referenceDimensions;
  if(d&&(d.width!==3.5||d.depth!==1.5||d.height!==1.8))invalid();
  const feet=mesh.anchors.filter(a=>a.kind==='physical'&&Math.abs(a.world.z)<1e-8);
  if(feet.length<(direction==='center'?2:3)||feet.some(a=>a.world.x<0||a.world.y<0||a.world.x>(direction==='center'?3.5:1.5)||a.world.y>(direction==='center'?1.5:3.5)))invalid();
  projectMesh(v.mesh,p);
  if(v.partMeshes!==undefined){
   // Version 2 makes old clients reject unsupported part registrations instead
   // of silently drawing them with the shared mesh. Source coverage/topology
   // stays identical; only authored world coordinates may differ by part.
   if(value.version<2||!v.partMeshes||Array.isArray(v.partMeshes)||typeof v.partMeshes!=='object'||Object.keys(v.partMeshes).some(id=>!parts.includes(id)))invalid();
   for(const part of Object.values(v.partMeshes)){
    const own=normalizeMesh(part);
    if(JSON.stringify(own.referenceDimensions)!==JSON.stringify(mesh.referenceDimensions)||JSON.stringify(own.indices)!==JSON.stringify(mesh.indices)||own.anchors.length!==mesh.anchors.length)invalid();
    own.anchors.forEach((a,i)=>{
     const base=mesh.anchors[i];
     if(a.source.x!==base.source.x||a.source.y!==base.source.y||a.kind!==base.kind)invalid();
     if(base.kind==='physical'&&Math.abs(base.world.z)<1e-8&&['x','y','z'].some(k=>a.world[k]!==base.world[k]))invalid();
    });
    projectMesh(part,p);
   }
  }
 }
 return structuredClone(value.views);
}
// Validate all three views first; a bad download must not partly replace them.
export function installSofaRegistration(views){Object.assign(SOFA_V1,views);}
