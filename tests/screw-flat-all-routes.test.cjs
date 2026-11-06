const assert=require('node:assert/strict');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');

// The twelve intro/special stages and fourteen advanced examples have real
// UI-tap playthroughs in other tests. Every advanced board is independently
// solved in the same rigid-body engine without publishing the answer paths.
if(isMainThread){
 const stages=Array.from({length:1000},(_,i)=>i+1);
 const batches=Array.from({length:4},(_,offset)=>stages.filter((_,i)=>i%4===offset));
 Promise.all(batches.map(stages=>new Promise((resolve,reject)=>{
  const worker=new Worker(__filename,{workerData:stages});
  worker.once('message',resolve);worker.once('error',reject);
  worker.once('exit',code=>{if(code)reject(Error('Flat route worker exited '+code));});
 }))).then(results=>{
  assert.deepEqual(results.flatMap(r=>r.failures),[],'every stage must have a free solution with visible screw collisions');
  assert.equal(results.reduce((n,r)=>n+r.count,0),1000);
  console.log('PASS: all 1000 stages physically clear with only three free spare holes, no items, and the certified move budgets.');
 }).catch(error=>{console.error(error);process.exitCode=1;});
}else{
 const P=require('../games/screw/screw-flat-physics.js'),G=require('../games/screw/screw-flat.js');
 const {certified:solveAtomic}=require('./helpers/flat-atomic-solution-search.cjs'),failures=[];let checked=0;
 for(const stage of workerData){
  let error=null;
  try{
   const level=P.makeFlatLevel(stage),result=solveAtomic(stage);
   assert.equal(level.holes.length-level.screws.length,P.spareHoleCount(stage));
   assert.equal(result.reason,null,`stage ${stage}: ${result.reason}`);
   assert.ok(result.moves<=G.moveLimit(level),`stage ${stage} needs ${result.moves} moves, but only ${G.moveLimit(level)} are available`);
   assert.equal(result.remaining.length,0);
  }catch(e){error={stage,error:e.message};}
  if(error)failures.push(error);checked++;
  if(checked%50===0)console.log(`Flat physics verification: ${checked}/${workerData.length} in worker ending at stage ${workerData.at(-1)}; failures ${failures.length}`);
 }
 parentPort.postMessage({count:workerData.length,failures});
}
