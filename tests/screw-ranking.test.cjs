const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {bundleScrew3d}=require('./screw3d-vm-bundle.cjs');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),world=read('world.html');
const part=(from,to)=>world.slice(world.indexOf(from),world.indexOf(to,world.indexOf(from)+from.length));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const noop=()=>{};
function fixture(){
 const calls=[],timers=[],messages=[],storage=new Map();let owner='member-a',submit=async(game,score)=>({ok:true,best:score});
 const node={innerHTML:'',textContent:'',hidden:false};
 const context=vm.createContext({console,Promise,Number,Math,crypto:require('node:crypto'),localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},performance:{now:()=>1},
  worldRewardOwner:()=>owner,worldRewardRequest:()=>({owner}),worldRewardCurrent:r=>r.owner===owner,
  tf:async(game,score,request)=>{calls.push({game,score,request});return submit(game,score,request);},
  vl:async(name,args,request)=>{assert.equal(name,'submit_screw_box_score');calls.push({game:'screw_box',score:args.p_score,request,runId:args.p_run_id});return submit('screw_box',args.p_score,request);},
  setTimeout:(resolve,delay)=>timers.push({resolve,delay}),M:message=>messages.push(message),
  window:{addEventListener:noop,removeEventListener:noop,dispatchEvent:noop},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},document:{getElementById:()=>null,querySelector:()=>null,body:{classList:{remove:noop}}},cancelAnimationFrame:noop,
  worldGameAssetRequest:0,worldClosingGames:null,worldRecommendedRestaurants:null,R:null,G2:{},D:{user:{id:owner}},$: {},Cn:()=>false,ti:noop,sf:noop,
  gt:{arcadeEnd:noop},_r:{screw:{unit:'점'}},w:String,nf:noop,B2:noop});
 vm.runInContext(part('function syncFlatDrills()', 'function screwStageResult(')+
  part('function pendingScrewScore(', 'async function _2(')+
  part('async function _2(', 'function sf(')+part('var worldResultIds=', 'async function S2(')+part('async function S2(', 'function z2(')+
  part('function El(', 'var Cl=')+part('function M2(', 'function Ja(')+part('function Ja(', 'function D2('),context);
 context.ti=noop;context.nf=noop;
 return {context,calls,timers,messages,storage,setOwner:value=>{owner=value;},setSubmit:value=>{submit=value;},
  session(mode='flat'){
   const r={id:'screw',owner,screwMode:mode,ov:{dataset:{},querySelector:()=>node,remove:noop},game:null,running:false};
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
 const flat=require('../games/screw/screw-flat.js').flat({setScore:noop,end:()=>assert.fail('early stage cannot end the run'),saveScore:score=>records.push(score)});
 flat.state.level.plates.forEach(p=>p.state='gone');flat.update(.05);
 assert.equal(records.length,1,'a completed flat stage saves before reaching stage 1000');
 assert.equal(records[0],flat.state.score);flat.update(.05);assert.equal(records.length,1);flat.destroy();
 const boxContext=vm.createContext({console,crypto:require('node:crypto'),localStorage:global.localStorage,window:{}});
 vm.runInContext(bundleScrew3d(read).replace('  start(st.L);','  globalThis.stageState=st;start(st.L);'),boxContext);
 const boxRecords=[],box=boxContext.screw3d({setScore:noop,end:()=>assert.fail('a cleared box stage does not fail'),saveScore:score=>boxRecords.push(score)});
 boxContext.stageState.lvl.screws.forEach(s=>s.state='done');boxContext.stageState.lvl.els.forEach(e=>e.state='gone');
 box.update(.05);assert.equal(boxRecords.length,1,'box stage progress saves without waiting for failure');
 assert.equal(boxRecords[0],boxContext.stageState.score);box.update(.05);assert.equal(boxRecords.length,1);

 const f=fixture(),save=f.context.createScrewScoreRecorder('screw_flat');
 let finish;f.setSubmit((game,score)=>new Promise(resolve=>{finish=()=>resolve({ok:true,best:score});}));
 const first=save(20);await tick();const second=save(50),duplicate=save(50),lower=save(20);
 assert.equal(f.calls.length,1,'checkpoints serialize');finish();await tick();
 assert.equal(f.calls.length,2);finish();await Promise.all([first,second,duplicate,lower]);
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

 // Storage restrictions must not prevent a live server save or reset the run ID.
 for(const method of ['setItem','getItem']){
  const restricted=fixture();restricted.context.localStorage[method]=()=>{throw Error('storage blocked');};
  const firstBox=restricted.context.createScrewScoreRecorder('screw_box');
  assert.equal((await firstBox(12)).ok,true,method+' failure still permits a server save');
  assert.equal((await firstBox(20)).ok,true);
  const nextBox=restricted.context.createScrewScoreRecorder('screw_box');
  assert.equal((await nextBox(7)).ok,true,'a later game in this page keeps earned points');
  assert.deepEqual(restricted.calls.map(c=>c.score),[12,20,27]);
  const runId=restricted.calls[0].runId;
  assert.ok(restricted.calls.every(c=>c.runId===runId),'all checkpoints retain one idempotency key');
  restricted.setOwner('member-b');
  assert.equal((await firstBox(40)).reason,'stale','the prior account cannot submit after switching');
  assert.equal((await restricted.context.createScrewScoreRecorder('screw_box')(9)).ok,true);
  assert.equal(restricted.calls[3].score,9,'the next account starts its own total');
  assert.notEqual(restricted.calls[3].runId,runId,'different accounts never share a score run');
  restricted.setOwner('member-a');
  assert.equal((await restricted.context.createScrewScoreRecorder('screw_box')(3)).ok,true);
  assert.equal(restricted.calls[4].score,30,'returning to an account restores its in-memory total');
  assert.equal(restricted.calls[4].runId,runId);
  assert.deepEqual(restricted.messages,[],'successful server saves do not show a failure warning');
 }

 const oldSnapshot=fixture(),snapshotSave=oldSnapshot.context.createScrewScoreRecorder('screw_box');
 await snapshotSave(20);
 const snapshot=[...oldSnapshot.storage.entries()];
 const restoreWrite=oldSnapshot.context.localStorage.setItem;
 oldSnapshot.context.localStorage.setItem=()=>{throw Error('quota');};
 await snapshotSave(35);
 assert.deepEqual([...oldSnapshot.storage.entries()],snapshot,'disk retains only the older acknowledged snapshot');
 const afterQuota=oldSnapshot.context.createScrewScoreRecorder('screw_box');
 await afterQuota(5);
 oldSnapshot.context.localStorage.setItem=restoreWrite;
 await afterQuota(10);
 assert.deepEqual(oldSnapshot.calls.map(c=>c.score),[20,35,40,45],
  'an old disk snapshot cannot lower newer in-memory points when starting a game or restoring writes');
 assert.ok(oldSnapshot.calls.every(c=>c.runId===oldSnapshot.calls[0].runId));

 // Reads can recover before writes, exposing a different run from an older page.
 const recoveredRead=fixture(),boxKey='ojjuda-screw-box-cumulative-v1:member-a';
 const diskRun='11111111-1111-4111-8111-111111111111',otherRun='22222222-2222-4222-8222-222222222222';
 recoveredRead.storage.set(boxKey,JSON.stringify({runId:diskRun,total:80,acked:50}));
 recoveredRead.storage.set('ojjuda-screw-box-cumulative-v1:member-b',JSON.stringify({runId:otherRun,total:40,acked:40}));
 const restoreRead=recoveredRead.context.localStorage.getItem,restoreRecoveredWrite=recoveredRead.context.localStorage.setItem;
 recoveredRead.context.localStorage.getItem=recoveredRead.context.localStorage.setItem=()=>{throw Error('storage blocked');};
 const activeBox=recoveredRead.context.createScrewScoreRecorder('screw_box');
 assert.equal((await activeBox(12)).ok,true);
 const activeRunId=recoveredRead.calls[0].runId;
 assert.notEqual(activeRunId,diskRun,'inaccessible storage creates a fresh in-memory run');
 recoveredRead.context.localStorage.getItem=restoreRead;
 assert.equal((await activeBox(20)).ok,true,'recovering an older disk run cannot stale the active recorder');
 assert.equal((await recoveredRead.context.createScrewScoreRecorder('screw_box')(7)).ok,true);
 assert.deepEqual(recoveredRead.calls.map(c=>c.score),[12,20,27],
  'the active run stays cumulative without adding the old disk run or its pending points');
 assert.ok(recoveredRead.calls.every(c=>c.runId===activeRunId));
 assert.equal(JSON.parse(recoveredRead.storage.get(boxKey)).runId,diskRun,'writes remain blocked throughout read recovery');
 recoveredRead.setOwner('member-b');
 assert.equal((await activeBox(40)).reason,'stale');
 assert.equal((await recoveredRead.context.createScrewScoreRecorder('screw_box')(9)).ok,true);
 assert.equal(recoveredRead.calls[3].score,49,'another account can restore its own durable total');
 assert.equal(recoveredRead.calls[3].runId,otherRun);
 recoveredRead.setOwner('member-a');
 const returnToActive=recoveredRead.context.createScrewScoreRecorder('screw_box');
 assert.equal((await returnToActive(3)).ok,true);
 assert.equal(recoveredRead.calls[4].score,30);
 assert.equal(recoveredRead.calls[4].runId,activeRunId,'returning restores the active account run despite the older disk run');
 recoveredRead.context.localStorage.setItem=restoreRecoveredWrite;
 assert.equal((await returnToActive(4)).ok,true);
 assert.deepEqual(JSON.parse(recoveredRead.storage.get(boxKey)),{runId:activeRunId,total:31,acked:31},
  'restored writes persist the active run without replaying a different run');

 const beforeFirstSave=fixture();
 beforeFirstSave.storage.set(boxKey,JSON.stringify({runId:diskRun,total:80,acked:50}));
 const restoreEarlyRead=beforeFirstSave.context.localStorage.getItem;
 beforeFirstSave.context.localStorage.getItem=beforeFirstSave.context.localStorage.setItem=()=>{throw Error('storage blocked');};
 const freshBox=beforeFirstSave.context.createScrewScoreRecorder('screw_box');
 const freshRunId=beforeFirstSave.context.screwBoxScoreState('member-a').runId;
 assert.notEqual(freshRunId,diskRun);
 beforeFirstSave.context.localStorage.getItem=restoreEarlyRead;
 assert.equal((await freshBox(12)).ok,true,'read recovery before the first point cannot stale a new recorder');
 assert.equal(beforeFirstSave.calls.length,1);
 assert.equal(beforeFirstSave.calls[0].runId,freshRunId);
 assert.equal(beforeFirstSave.calls[0].score,12,'an empty active run does not adopt a different disk run');

 const newerSnapshot=fixture();
 await newerSnapshot.context.createScrewScoreRecorder('screw_box')(20);
 const sameRunId=newerSnapshot.calls[0].runId;
 newerSnapshot.storage.set(boxKey,JSON.stringify({runId:sameRunId,total:35,acked:30}));
 assert.equal((await newerSnapshot.context.createScrewScoreRecorder('screw_box')(5)).ok,true);
 assert.deepEqual(newerSnapshot.calls.map(c=>c.score),[20,40],'a newer snapshot of the same run still merges');
 assert.equal(newerSnapshot.calls[1].runId,sameRunId);

 const unsavedBox=fixture();unsavedBox.context.localStorage.setItem=()=>{throw Error('quota');};
 unsavedBox.setSubmit(async()=>({ok:false,reason:'unavailable'}));
 assert.equal((await unsavedBox.context.createScrewScoreRecorder('screw_box')(25)).ok,false);
 assert.equal(unsavedBox.calls.length,1,'storage failure still attempts the server before reporting failure');
 assert.match(unsavedBox.messages[0],/저장하지 못/);
 assert.doesNotMatch(unsavedBox.messages[0],/보관/,'failed local and server writes cannot claim durable storage');
 unsavedBox.setSubmit(async(_,score)=>({ok:true,best:score}));
 unsavedBox.context.S={};unsavedBox.context.resumeScrewScores();await tick();
 assert.deepEqual(unsavedBox.calls.map(c=>c.score),[25,25],'recovery retries the in-memory points after the server returns');
 assert.equal(unsavedBox.calls[0].runId,unsavedBox.calls[1].runId,'recovery keeps the original idempotency key');
 await unsavedBox.context.createScrewScoreRecorder('screw_box')(0);
 assert.equal(unsavedBox.calls.length,2,'the acknowledged recovery is not sent again');

 // Exercise actual World start/score/exit/mode/result handlers with only transport replaced.
 const lifecycle=fixture();const firstRun=lifecycle.session();await lifecycle.context._2();
 firstRun.api.setScore(27);lifecycle.context.El();await tick();
 assert.equal(lifecycle.context.R,null);assert.deepEqual(lifecycle.calls.map(c=>[c.game,c.score]),[['screw_flat',27]],'leaving saves positive progress under the selected mode');
 const secondRun=lifecycle.session('box');await lifecycle.context._2();secondRun.api.setScore(45);
 lifecycle.context.M2({target:{closest:()=>({dataset:{g:'screw-modes'}})}});await tick();
 assert.equal(secondRun.game,null);assert.equal(lifecycle.calls[1].game,'screw_box');assert.equal(lifecycle.calls[1].score,45);
 assert.equal(lifecycle.storage.size,1,'acknowledged box points preserve only the durable cumulative total');
 assert.deepEqual(JSON.parse(lifecycle.storage.get('ojjuda-screw-box-cumulative-v1:member-a'))?.total,45,'box score remains cumulative for later sessions');
 const finalRun=lifecycle.session();await lifecycle.context._2();finalRun.api.setScore(100);await finalRun.api.saveScore(100);await finalRun.api.end(100);
 assert.equal(lifecycle.calls.filter(c=>c.score===100).length,1,'the final screen reuses the checkpoint receipt');
 assert.equal(finalRun.running,false);
 const empty=lifecycle.session();await lifecycle.context._2();lifecycle.context.El();await tick();assert.equal(lifecycle.calls.length,3,'opening and closing an untouched game adds no zero record');
 const changed=lifecycle.session();await lifecycle.context._2();lifecycle.setOwner('member-b');changed.api.setScore(400);lifecycle.context.El();await tick();
 assert.equal(lifecycle.calls.length,3,'exit never assigns the previous player’s points to the next account');

 const interrupted=fixture();interrupted.setSubmit(()=>new Promise(()=>{}));
 const activeRun=interrupted.session();await interrupted.context._2();activeRun.api.setScore(37);await tick();
 assert.equal(interrupted.calls[0].score,37,'positive points save without requiring a completed stage or exit');
 assert.equal(interrupted.storage.size,1,'points are durably queued before the HTTP reply');
 const recoveredPage=fixture();for(const entry of interrupted.storage)recoveredPage.storage.set(...entry);
 recoveredPage.context.S={};recoveredPage.context.resumeScrewScores();await tick();
 assert.equal(recoveredPage.calls[0].score,37,'a new page retries an interrupted record when rankings mount');
 assert.equal(recoveredPage.storage.has('ojjuda-screw-pending:member-a:screw_flat'),false,'successful recovery clears only the acknowledged flat record');
 assert.equal(recoveredPage.storage.has('ojjuda-screw-box-cumulative-v1:member-a'),true,'box cumulative state remains available across page loads');
 const differentAccount=fixture();for(const entry of interrupted.storage)differentAccount.storage.set(...entry);
 differentAccount.context.S={};differentAccount.setOwner('member-b');differentAccount.context.resumeScrewScores();await tick();
 assert.equal(differentAccount.calls.length,0,'another account never replays the previous account’s queued points');

 const failed=fixture();failed.setSubmit(async()=>({ok:false,reason:'network'}));
 const failure=failed.context.createScrewScoreRecorder('screw_flat')(66);await tick();
 for(let i=0;i<2;i++){failed.timers.shift().resolve();await tick();}
 assert.equal((await failure).ok,false);assert.equal(failed.storage.size,1,'retry exhaustion preserves earned points');
 assert.match(failed.messages[0],/보관/);
 const blocked=fixture();blocked.context.localStorage.setItem=()=>{throw Error('quota');};blocked.setSubmit(async()=>({ok:false,reason:'unavailable'}));
 await blocked.context.createScrewScoreRecorder('screw_flat')(77);
 assert.match(blocked.messages[0],/저장하지 못/,'unavailable local storage cannot claim the score was retained');
 console.log('PASS: both screw stage checkpoints, immediate saves, durable recovery, restricted storage recovery, serialized retries, account isolation, mode switch, exit and final deduplication');
})().catch(error=>{console.error(error);process.exitCode=1;});
