// Offline witness search only. Failure means this heuristic did not find a
// path; it is not proof that a layout is impossible. Never loaded by the game.
const P=require('../../screw-flat-physics.js');
function solve(stage,layout){
 const l=P.makeFlatLevel(stage,layout),sim=P.createPhysics(l),route=[],rank=new Map(l.order.map((id,i)=>[id,i])),seen=new Set();
 const advance=(seconds=1.5)=>{for(let t=0;t<seconds*20;t++)sim.step(.05);};
 const pinned=s=>s.hole&&l.plates.some(p=>p.state!=='gone'&&p.pins.some(pin=>pin.hole===s.hole.id));
 const targetScore=h=>{
  let risk=0;for(const p of l.plates)if(p.state!=='gone'){const b=sim.bodies.get(p.id).bounds;if(h.y>b.min.y-l.screwRadius&&h.x>b.min.x-l.screwRadius&&h.x<b.max.x+l.screwRadius)risk++;}
  return risk*10000+h.y;
 };
 let reason='budget';
 for(let n=0;n<l.plates.length*6+6;n++){
  if(l.plates.every(p=>p.state==='gone')){reason=null;break;}
  const supports=new Set();
  for(const pair of sim.engine.pairs.list.filter(pair=>pair.isActive)){
   let a=pair.bodyA.parent,b=pair.bodyB.parent;if(a.label.startsWith('metal-'))[a,b]=[b,a];
   if(a.label.startsWith('screw-')&&b.label.startsWith('metal-')&&l.plates[+b.label.slice(6)].state==='loose')supports.add(+a.label.slice(6));
  }
  const available=l.screws.filter(s=>P.canUnscrew(l,s)),support=available.filter(s=>supports.has(s.id)&&!pinned(s));
  const candidates=[...support.sort((a,b)=>b.hole.y-a.hole.y),...available.filter(pinned).sort((a,b)=>(rank.get(a.id)-rank.get(b.id)))];
  if(!candidates.length){advance(6);if(l.plates.every(p=>p.state==='gone')){reason=null;break;}reason='no exposed screw';break;}
  const signature=l.screws.map(s=>s.hole?.id).join(',')+'|'+l.plates.map(p=>p.state).join(',');
  const s=candidates.find(s=>!seen.has(signature+'>'+s.id));if(!s){reason='cycle';break;}seen.add(signature+'>'+s.id);
  const from=s.hole.id;if(!sim.lift(s)){reason='lift rejected';break;}advance();
  const entry={screw:s.id,from,to:null};route.push(entry);
  if(l.plates.every(p=>p.state==='gone')){reason=null;break;}
  // Every stage must be solvable using only its three free parking holes,
  // without depending on a purchased item.
  const certifiedDestinations=()=>l.holes.filter(h=>(h.owner!==null||h.id<3)&&P.canSeatScrew(l,h,s));
  let free=certifiedDestinations();
  if(!free.length){advance(6);free=certifiedDestinations();entry.wait=7.5;}
  if(!free.length){reason='no place after lift';break;}
  const detached=free.filter(h=>l.plates.every(p=>p.state==='gone'||P.alignedMount(p,h)<0));if(detached.length)free=detached;
  let placed=false;
  for(let attempt=0;attempt<4&&!placed;attempt++){
   free.sort((a,b)=>targetScore(a)-targetScore(b));const to=free[0];if(!to)break;
   advance(.4);if(sim.move(s,to)){entry.to=to.id;placed=true;break;}
   entry.wait=(entry.wait||1.5)+.4;free=certifiedDestinations();
  }
  if(!placed){reason='placement rejected';break;}advance();
 }
 if(l.plates.every(p=>p.state==='gone'))reason=null;
 const result={stage,reason,moves:route.length,remaining:l.plates.filter(p=>p.state!=='gone').map(p=>p.id),route};sim.destroy();return result;
}
module.exports={solve};
if(require.main===module)for(const stage of process.argv.slice(2).map(Number)){const r=solve(stage);console.log(JSON.stringify({...r,route:undefined}));}
