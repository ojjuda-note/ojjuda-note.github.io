// Offline deterministic regeneration; this resumable log is not a runtime asset.
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs'),path=require('node:path'),P=require('../../games/screw/screw-flat-physics.js'),{solve}=require('./flat-solution-search.cjs');
function replay(stage,layout,route){
 const l=P.makeFlatLevel(stage,layout),sim=P.createPhysics(l),advance=t=>{for(let n=0;n<Math.round(t*20);n++)sim.step(.05);};let error=null;
 for(const [step,r] of route.entries()){
  if(!sim.lift(l.screws[r.screw])){error='lift '+step;break;}advance(r.wait||1.5);
  if(r.to===null)break;
  if(!P.canSeatScrew(l,l.holes[r.to],l.screws[r.screw])){error='target '+step;break;}
  advance(.4);if(!sim.move(l.screws[r.screw],l.holes[r.to])){error='place '+step;break;}advance(1.5);
 }
 advance(8);if(!error&&l.plates.some(p=>p.state!=='gone'))error='remaining';sim.destroy();return error;
}
if(isMainThread){
 const stages=Array.from({length:989},(_,i)=>i+12).filter(s=>s!==25),log=process.argv[2]||path.join(__dirname,'../fixtures/flat-certified-work.jsonl');
 fs.mkdirSync(path.dirname(log),{recursive:true});
 const done=fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[],completed=new Set(done.map(r=>r.stage));let count=done.length,failed=done.filter(r=>r.error).length;
 console.log(JSON.stringify({resuming:count,failed,log}));
 Promise.all(Array.from({length:4},(_,i)=>new Promise((resolve,reject)=>{
  const w=new Worker(__filename,{workerData:stages.filter((s,n)=>n%4===i&&!completed.has(s))});
  w.on('message',r=>{if(r.done)return resolve();fs.appendFileSync(log,JSON.stringify(r)+'\n');count++;if(r.error)failed++;if(count%25===0||r.error)console.log(JSON.stringify({count,failed,stage:r.stage,error:r.error}));});w.on('error',reject);w.on('exit',code=>{if(code)reject(Error('worker '+code));});
 }))).then(()=>console.log(JSON.stringify({complete:true,count,failed,log}))).catch(e=>{console.error(e);process.exitCode=1;});
}else{
 for(const stage of workerData){
  let certified=null,last=null;
  const candidates=[...Array.from({length:9},(_,i)=>[0,[.982,.96,.94,.92,.9,.88,.86,.84,.82][i]]),...Array.from({length:6},(_,i)=>[.96,.92,.88,.84,.82].map(gap=>[i+1,gap])).flat()];
  for(const layout of candidates){
   try{const r=solve(stage,layout);last=r.reason;if(r.reason)continue;const error=replay(stage,layout,r.route);if(error){last='replay '+error;continue;}certified={stage,layout,moves:r.moves,route:r.route};break;}catch(e){last=e.message;}
  }
  parentPort.postMessage(certified||{stage,error:last});
 }
 parentPort.postMessage({done:true});
}
