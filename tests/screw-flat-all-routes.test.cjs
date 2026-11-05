const assert=require('node:assert/strict');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');

// The twelve introductory/special layouts have input-based playthroughs in
// screw-flat.test.cjs. Check every other level under real rigid-body physics.
if(isMainThread){
 const stages=Array.from({length:989},(_,i)=>i+12).filter(stage=>stage!==25);
 const batches=Array.from({length:4},(_,offset)=>stages.filter((_,i)=>i%4===offset));
 Promise.all(batches.map(stages=>new Promise((resolve,reject)=>{
  const worker=new Worker(__filename,{workerData:stages});
  worker.once('message',resolve);worker.once('error',reject);
  worker.once('exit',code=>{if(code)reject(Error('Flat route worker exited '+code));});
 }))).then(results=>{
  const failures=results.flatMap(r=>r.failures);
  assert.deepEqual(failures,[],'every generated layout must have a free, physical solution');
  assert.equal(results.reduce((n,r)=>n+r.count,0),988);
  console.log('PASS: all 988 generated flat stages clear with the original three holes and base move budget; 12 introductory/special stages are covered by input tests.');
 }).catch(error=>{console.error(error);process.exitCode=1;});
}else{
 const P=require('../screw-flat-physics.js'),G=require('../screw-flat.js'),failures=[];
 for(const stage of workerData){
  const level=P.makeFlatLevel(stage),sim=P.createPhysics(level);let failed=null;
  assert.equal(level.holes.length-level.screws.length,3);
  assert.ok(level.route.length<=G.moveLimit(level));
  for(const [step,move] of level.route.entries()){
   if(!sim.move(level.screws[move.screw],level.holes[move.to])){failed={stage,step};break;}
   for(let tick=0;tick<30;tick++)sim.step(.05);
  }
  for(let tick=0;tick<50;tick++)sim.step(.05);
  if(!failed&&level.plates.some(p=>p.state!=='gone'))failed={stage,remaining:level.plates.filter(p=>p.state!=='gone').map(p=>p.id)};
  if(failed)failures.push(failed);
  sim.destroy();
 }
 parentPort.postMessage({count:workerData.length,failures});
}
