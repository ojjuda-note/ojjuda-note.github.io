const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),world=read('world.html');
const part=(from,to)=>world.slice(world.indexOf(from),world.indexOf(to,world.indexOf(from)+from.length));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const noop=()=>{};
function fixture(){
 const calls=[],timers=[],messages=[];let owner='member-a',submit=async(game,score)=>({ok:true,best:score});
 const node={innerHTML:'',textContent:'',hidden:false};
 const context=vm.createContext({console,Promise,Number,Math,performance:{now:()=>1},
  worldRewardOwner:()=>owner,worldRewardRequest:()=>({owner}),worldRewardCurrent:r=>r.owner===owner,
  tf:async(game,score,request)=>{calls.push({game,score,request});return submit(game,score,request);},
  setTimeout:(resolve,delay)=>timers.push({resolve,delay}),M:message=>messages.push(message),
  window:{removeEventListener:noop},document:{body:{classList:{remove:noop}}},cancelAnimationFrame:noop,
  worldGameAssetRequest:0,R:null,G2:{},D:{user:{id:owner}},$: {},Cn:()=>false,ti:noop,sf:noop,
  gt:{arcadeEnd:noop},_r:{screw:{unit:'점'}},w:String,nf:noop,B2:noop});
 vm.runInContext(part('function createScrewScoreRecorder(', 'async function _2(')+
  part('async function _2(', 'function sf(')+part('async function S2(', 'function z2(')+
  part('function El(', 'var Cl=')+part('function M2(', 'function Ja(')+part('function Ja(', 'function D2('),context);
 context.ti=noop;context.nf=noop;
 return {context,calls,timers,messages,setOwner:value=>{owner=value;},setSubmit:value=>{submit=value;},
  session(mode='flat'){
   const r={id:'screw',screwMode:mode,ov:{dataset:{},querySelector:()=>node,remove:noop},game:null,running:false};
   context.R=r;context.window.OjjudaScrewLoader={load:async()=>api=>{r.api=api;return{draw:noop,destroy:noop};}};return r;
  }};
}
(async()=>{
 const {PGlite}=require('@electric-sql/pglite'),db=new PGlite();
 try{
  await db.exec(`create table public.game_scores(id int primary key,game text,score int,reward int,created_at timestamptz);
   insert into game_scores values(1,'screw',119,0,'2026-10-03 07:33:24+00'),(2,'screw',80,0,'2026-10-03 09:19:00+00'),
   (3,'screw_flat',250,0,'2026-10-20 00:00+00'),(4,'screw_box',200,0,'2026-10-21 00:00+00');`);
  const before=(await db.query('select * from game_scores order by id')).rows;
  const migration=read('supabase/migrations/20261025064516_restore_legacy_screw_box_scores.sql');
  await db.exec(migration);await db.exec(migration);
  const after=(await db.query('select * from game_scores order by id')).rows;
  assert.deepEqual(after,[{...before[0],game:'screw_box'},...before.slice(1)],'only unambiguous pre-split box records are restored; scores, dates and newer modes remain intact, even on rerun');
 }finally{await db.close();}
 // First reproduce the real stage-clear callbacks, before any terminal game over.
 const records=[],storage=new Map();global.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))};
 const flat=require('../screw-flat.js').flat({setScore:noop,end:()=>assert.fail('early stage cannot end the run'),saveScore:score=>records.push(score)});
 flat.state.level.plates.forEach(p=>p.state='gone');flat.update(.05);
 assert.equal(records.length,1,'a completed flat stage saves before reaching stage 1000');
 assert.equal(records[0],flat.state.score);flat.update(.05);assert.equal(records.length,1);flat.destroy();
 const boxContext=vm.createContext({console,localStorage:global.localStorage});
 vm.runInContext(read('screw3d.js').replace(/export \{[^}]*\};/,'').replace('  start(st.L);','  globalThis.stageState=st;start(st.L);'),boxContext);
 const boxRecords=[],box=boxContext.screw3d({setScore:noop,end:()=>assert.fail('a cleared box stage does not fail'),saveScore:score=>boxRecords.push(score)});
 boxContext.stageState.lvl.screws.forEach(s=>s.state='done');boxContext.stageState.lvl.els.forEach(e=>e.state='gone');
 box.update(.05);assert.equal(boxRecords.length,1,'box stage progress saves without waiting for failure');
 assert.equal(boxRecords[0],boxContext.stageState.score);box.update(.05);assert.equal(boxRecords.length,1);

 const f=fixture(),save=f.context.createScrewScoreRecorder('screw_flat');
 let finish;f.setSubmit((game,score)=>new Promise(resolve=>{finish=()=>resolve({ok:true,best:score});}));
 const first=save(20),second=save(50),duplicate=save(50),lower=save(20);await tick();
 assert.equal(f.calls.length,1,'checkpoints serialize');finish();await first;await tick();
 assert.equal(f.calls.length,2);finish();await Promise.all([second,duplicate,lower]);
 assert.deepEqual(f.calls.map(c=>c.score),[20,50],'final result and exit cannot duplicate a saved checkpoint or lower it');

 const retry=fixture();let tries=0;retry.setSubmit(async(_,score)=>++tries===1?{ok:false,reason:'too_fast'}:{ok:true,best:score});
 const pending=retry.context.createScrewScoreRecorder('screw_box')(42);await tick();
 assert.equal(retry.timers[0].delay,5100);retry.timers.shift().resolve();assert.equal((await pending).ok,true);
 assert.equal(retry.calls[0].request,retry.calls[1].request,'a retry preserves the guest request identity');
 const stale=fixture();stale.setSubmit(async()=>({ok:false,reason:'too_fast'}));
 const old=stale.context.createScrewScoreRecorder('screw_flat')(80);await tick();stale.setOwner('member-b');stale.timers.shift().resolve();
 assert.equal((await old).reason,'stale');assert.equal(stale.calls.length,1,'an account switch cancels a waiting save');
 const network=fixture();let attempts=0;network.setSubmit(async(_,score)=>{if(++attempts===1)throw Error('offline');return{ok:true,best:score};});
 const recovered=network.context.createScrewScoreRecorder('screw_flat')(90);await tick();network.timers.shift().resolve();
 assert.equal((await recovered).ok,true,'transient errors do not drop a checkpoint');

 // Exercise actual World start/score/exit/mode/result handlers with only transport replaced.
 const lifecycle=fixture();const firstRun=lifecycle.session();await lifecycle.context._2();
 firstRun.api.setScore(27);lifecycle.context.El();await tick();
 assert.equal(lifecycle.context.R,null);assert.deepEqual(lifecycle.calls.map(c=>[c.game,c.score]),[['screw_flat',27]],'leaving saves positive progress under the selected mode');
 const secondRun=lifecycle.session('box');await lifecycle.context._2();secondRun.api.setScore(45);
 lifecycle.context.M2({target:{closest:()=>({dataset:{g:'screw-modes'}})}});await tick();
 assert.equal(secondRun.game,null);assert.equal(lifecycle.calls[1].game,'screw_box');assert.equal(lifecycle.calls[1].score,45);
 const finalRun=lifecycle.session();await lifecycle.context._2();finalRun.api.setScore(100);await finalRun.api.saveScore(100);await finalRun.api.end(100);
 assert.equal(lifecycle.calls.filter(c=>c.score===100).length,1,'the final screen reuses the checkpoint receipt');
 assert.equal(finalRun.running,false);
 const empty=lifecycle.session();await lifecycle.context._2();lifecycle.context.El();await tick();assert.equal(lifecycle.calls.length,3,'opening and closing an untouched game adds no zero record');
 const changed=lifecycle.session();await lifecycle.context._2();changed.api.setScore(400);lifecycle.setOwner('member-b');lifecycle.context.El();await tick();
 assert.equal(lifecycle.calls.length,3,'exit never assigns the previous player’s points to the next account');
 console.log('PASS: both screw stage checkpoints, serialized retries, account isolation, mode switch, exit, final deduplication and untouched games');
})().catch(error=>{console.error(error);process.exitCode=1;});
