// Offline verifier for the two-tap, atomic screw transfer interaction.
// Never loaded by the game. A failed greedy search is not an impossibility proof.
const P=require('../../screw-flat-physics.js');

function solve(stage,layout,seed=0){
 const level=P.makeFlatLevel(stage,layout),sim=P.createPhysics(level),route=[];
 let randomState=(seed*747796405+stage*2891336453)>>>0;
 const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
 const ranks=new Map(level.order.map((id,i)=>[id,i]));
 const seen=new Set();
 const advance=(seconds=1.5)=>{for(let i=0;i<Math.round(seconds*20);i++)sim.step(.05);};
 const pinned=s=>s.hole&&level.plates.some(p=>p.state!=='gone'&&p.pins.some(pin=>pin.hole===s.hole.id));
 const targetScore=h=>{
  let risk=0;
  for(const p of level.plates)if(p.state!=='gone'){
   const b=sim.bodies.get(p.id).bounds;
   if(h.y>b.min.y-level.screwRadius&&h.x>b.min.x-level.screwRadius&&h.x<b.max.x+level.screwRadius)risk++;
  }
  return risk*10000+h.y;
 };
 let reason='budget';
 for(let n=0;n<level.plates.length*7+10;n++){
  if(level.plates.every(p=>p.state==='gone')){reason=null;break;}
  const supports=new Set();
  for(const pair of sim.engine.pairs.list.filter(pair=>pair.isActive)){
   let a=pair.bodyA.parent,b=pair.bodyB.parent;
   if(a.label.startsWith('metal-'))[a,b]=[b,a];
   if(a.label.startsWith('screw-')&&b.label.startsWith('metal-')&&level.plates[+b.label.slice(6)].state==='loose')supports.add(+a.label.slice(6));
  }
  const options=level.screws.map(s=>({s,targets:s.hole&&P.canUnscrew(level,s)?level.holes.filter(h=>(h.owner!==null||h.id<3)&&P.canSeatScrew(level,h,s)):[]})).filter(o=>o.targets.length);
  if(!options.length){advance(6);if(level.plates.every(p=>p.state==='gone')){reason=null;break;}reason='no immediate destination';break;}
  options.sort((a,b)=>{
   const aSupport=supports.has(a.s.id)&&!pinned(a.s),bSupport=supports.has(b.s.id)&&!pinned(b.s);
   return Number(bSupport)-Number(aSupport)||(!pinned(a.s)?1:0)-(!pinned(b.s)?1:0)||(ranks.get(a.s.id)-ranks.get(b.s.id));
  });
  const signature=level.screws.map(s=>s.hole?.id).join(',')+'|'+level.plates.map(p=>p.state).join(',');
  const choices=options.filter(o=>!seen.has(signature+'>'+o.s.id));
  const option=seed&&choices.length?choices[Math.floor(random()*Math.min(7,choices.length))]:choices[0];
  if(!option){reason='cycle';break;}
  seen.add(signature+'>'+option.s.id);
  const screw=option.s,from=screw.hole.id;
  const detached=option.targets.filter(h=>level.plates.every(p=>p.state==='gone'||P.alignedMount(p,h)<0));
  const targets=(detached.length?detached:option.targets).sort((a,b)=>targetScore(a)-targetScore(b));
  if(seed&&targets.length>1){const candidate=targets.splice(Math.floor(random()*Math.min(4,targets.length)),1)[0];targets.unshift(candidate);}
  let destination=null;
  for(const h of targets){if(sim.move(screw,h)){destination=h;break;}}
  if(!destination){reason='transfer rejected';break;}
  route.push({screw:screw.id,from,to:destination.id,wait:1.5});
  advance();
 }
 if(level.plates.every(p=>p.state==='gone'))reason=null;
 const result={stage,reason,moves:route.length,remaining:level.plates.filter(p=>p.state!=='gone').map(p=>p.id),route};
 sim.destroy();return result;
}
module.exports={solve};
if(require.main===module)for(const stage of process.argv.slice(2).map(Number)){
 const result=solve(stage);console.log(JSON.stringify({...result,route:result.route.slice(0,7)}));
}
