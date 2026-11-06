const Physics=require('../../../games/screw/screw-flat-physics.js');
const maxTicks=120*60*60*2;

// The client reports the simulation tick of each two-tap transfer. Use the same
// game engine to verify that every pin moves legally and every sheet actually falls.
function verifyClear(stage,events,endTick){
  if(!Number.isInteger(stage)||stage<1||stage>1000||!Array.isArray(events)||events.length<2||events.length>1000||
    !Number.isSafeInteger(endTick)||endTick<0||endTick>maxTicks)return false;
  const level=Physics.makeFlatLevel(stage);
  if(events.length<level.screws.length||(level.challengeMoves!==undefined&&events.length>level.challengeMoves))return false;
  const sim=Physics.createPhysics(level);
  let now=0,moved=false;
  function advance(to){
    while(now<to){
      if(level.plates.every(p=>p.state==='fixed'||p.state==='gone')){now=to;return;}
      const ticks=Math.min(6,to-now);sim.step(ticks/120);now+=ticks;
    }
  }
  try{
    for(const event of events){
      if(!Array.isArray(event)||event.length!==3||!event.every(Number.isSafeInteger))return false;
      const [tick,id,to]=event;
      if(tick<now||(moved&&tick-now<44)||tick>endTick||!level.screws[id]||!level.holes[to])return false;
      advance(tick);
      if(!sim.move(level.screws[id],level.holes[to]))return false;
      moved=true;
    }
    advance(endTick);
    return level.plates.every(p=>p.state==='gone');
  }finally{sim.destroy();}
}
module.exports={verifyClear};
