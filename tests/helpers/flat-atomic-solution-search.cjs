// Offline verifier for the two-tap, atomic screw transfer interaction.
// Never loaded by the game. A failed greedy search is not an impossibility proof.
const P=require('../../games/screw/screw-flat-physics.js');

function solve(stage,layout,seed=0,{tray=3,policy=0,firstChoice=0}={}){
 const level=P.makeFlatLevel(stage,layout),route=[];
 for(let i=P.spareHoleCount(stage);i<tray;i++)level.holes.push({id:level.holes.length,owner:null,screw:null,extra:true});
 if(tray>P.spareHoleCount(stage))P.layoutSpareHoles(level);
 const allowedTray=new Set(level.holes.filter(h=>h.owner===null).slice(0,tray));
 const sim=P.createPhysics(level);
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
  const freeBoard=policy===2&&h.owner!==null&&risk===0;
  return risk*10000+(freeBoard?-1000:0)+(policy===2&&h.owner!==null?-h.y:h.y);
 };
 let reason='budget';
 for(let n=0;n<level.plates.length*12+10;n++){
  if(level.plates.every(p=>p.state==='gone')){reason=null;break;}
  const supports=new Set();
  for(const pair of sim.engine.pairs.list.filter(pair=>pair.isActive)){
   let a=pair.bodyA.parent,b=pair.bodyB.parent;
   if(a.label.startsWith('metal-'))[a,b]=[b,a];
   if(a.label.startsWith('screw-')&&b.label.startsWith('metal-')&&level.plates[+b.label.slice(6)].state==='loose')supports.add(+a.label.slice(6));
  }
  const options=level.screws.map(s=>({s,targets:s.hole&&P.canUnscrew(level,s)?level.holes.filter(h=>(h.owner!==null||allowedTray.has(h))&&P.canSeatScrew(level,h,s)):[]})).filter(o=>o.targets.length);
  if(!options.length){advance(6);if(level.plates.every(p=>p.state==='gone')){reason=null;break;}reason='no immediate destination';break;}
  options.sort((a,b)=>{
   const aSupport=supports.has(a.s.id)&&!pinned(a.s),bSupport=supports.has(b.s.id)&&!pinned(b.s);
   return Number(bSupport)-Number(aSupport)||(!pinned(a.s)?1:0)-(!pinned(b.s)?1:0)||(ranks.get(a.s.id)-ranks.get(b.s.id));
  });
  const signature=level.screws.map(s=>s.hole?.id).join(',')+'|'+level.plates.map(p=>p.state).join(',');
  const choices=options.filter(o=>!seen.has(signature+'>'+o.s.id));
  let option=choices[0];
  if(choices.length&&seed)option=choices[Math.floor(random()*Math.min(7,choices.length))];
  if(choices.length&&!route.length&&firstChoice)option=choices[firstChoice%choices.length];
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
// Test-only parking preferences. The game never loads solution hints.
const strategies=`
00000000000020000002000202002000000002002002000020020000200000020200002200000020
00000000000000200000000200000000000202000002000022000000200000022020000000200202
00000022020020000000000020220220020200200200202202200000002002000000000000000000
00000220002020020000222020002002000202202000000000002000020200000020022000220000
00202000002000020200200000000000020200020002000000002220002000002020022202000220
22020002220002000022020200202002220002020020022020202000000000002202220020020000
00020000002200000022002200000002000000002002222020002002002000000200222200000000
20022002200200000020020000000220002002002020020200000202000200020022000022202020
00220200022000020000002202220022020202202000002000002000020200022220002200222202
02200202200000020000002200002200002202020200000020202202000020000200202000220200
00020002000200002002000222020000020000000022000020002200200020202020000020222200
02002202000200222020000202220220002000020200000002020000200022020002200020000000
2200202222000020202000000000200000202200
`.replace(/\s/g,'');
function certified(stage){return solve(stage,undefined,0,{policy:Number(strategies[stage-1])});}
module.exports={solve,certified};
if(require.main===module)for(const stage of process.argv.slice(2).map(Number)){
 const result=solve(stage);console.log(JSON.stringify({...result,route:result.route.slice(0,7)}));
}
