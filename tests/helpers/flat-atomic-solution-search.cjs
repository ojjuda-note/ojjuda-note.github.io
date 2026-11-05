// Offline verifier for the two-tap, atomic screw transfer interaction.
// Never loaded by the game. A failed greedy search is not an impossibility proof.
const P=require('../../screw-flat-physics.js');

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
 for(let n=0;n<level.plates.length*7+10;n++){
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
// Test-only search hints. Each digit chooses a parking preference or an alternative
// first fastener. Every move still has to clear the physical board within its budget.
const strategies=`
20022100210111000001111001000110010000012101112212121210111101000010100201121111
10002101000110210012100000000001011001010211010010110001111101210111002000212022
01000000101010121001100100000000020212121110210110111002111111200022212012011111
00221010200001101000221100210210102000110001012200202010112200200101101202011110
01210201100100111011100001111210000111001100000220000120201210211000100000200010
12120200112100102000110001001011112101011020110012120211000020211011021001102101
12000020010121001011011101221000001110100110010011201010011000112020001100000001
01101102221001000110120200001110122011101000122101021002020000101101110012021220
02000220100120210102011111102112201101110011202200020001101102000101011000122120
01121011011000101002220110010100101100000101111110210000102122101101010200010100
0100002212011200112001010012001022121010211101000000200110100010000100100101202
`.replace(/\s/g,'');
function certified(stage){
 const strategy=Number(strategies[stage-122]||0);
 return solve(stage,undefined,0,{policy:strategy===1?2:0,firstChoice:strategy===2?7:0});
}
module.exports={solve,certified};
if(require.main===module)for(const stage of process.argv.slice(2).map(Number)){
 const result=solve(stage);console.log(JSON.stringify({...result,route:result.route.slice(0,7)}));
}
