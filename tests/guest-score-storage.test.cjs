const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const crypto=require('node:crypto');

const source=fs.readFileSync(path.join(__dirname,'../shared/games/guest-game-scores.js'),'utf8');
const storageKey='ojjuda.guest-ranking.v1';
const scoreGames=['mole','runner','stacker','breakout','screw','screw_box','screw_flat','spot','ttang','tour','saetbyeol','mines','solitaire','sacheonseong_1','sacheonseong_200'];
const runId='10000000-0000-4000-8000-000000000001';
function fixture({blocked='',existing=null,preview=false}={}){
 const stored=new Map(existing===null?[]:[[storageKey,existing]]),reads=[],writes=[],calls=[],events=[],clients=[],delays=[],timeouts=[];
 let reply=name=>({data:name==='guest_game_ranking'?[]:{ok:true},error:null}),randomCalls=0;
 const client={rpc(name,args){
  return {abortSignal(signal){
   calls.push({name,args:JSON.parse(JSON.stringify(args)),rawArgs:args,signal});
   return Promise.resolve().then(()=>reply(name,args,calls.length));
  }};
 }};
 const window={OJJUDA_CONFIG:{supabaseUrl:'https://example.test',supabaseKey:'test-publishable'},
  OjjudaAdminPreview:{isEnabled:()=>preview},
  supabase:{createClient:(...args)=>{clients.push(args);return client;}},
  dispatchEvent:event=>events.push(event)};
 vm.runInNewContext(source,{window,Uint8Array,
  localStorage:{getItem:key=>{reads.push(key);if(blocked==='read'||blocked==='both')throw Error('SecurityError');return stored.get(key)||null;},
   setItem:(key,value)=>{writes.push({key,value});if(blocked==='write'||blocked==='both')throw Error('QuotaExceededError');stored.set(key,value);}},
  crypto:{randomUUID:()=>crypto.randomUUID(),getRandomValues:array=>{randomCalls++;return crypto.getRandomValues(array);}},
  AbortSignal:{timeout:milliseconds=>{timeouts.push(milliseconds);return {milliseconds};}},
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
  setTimeout:(callback,delay)=>{delays.push(delay);queueMicrotask(callback);return delays.length;}
 });
 return {api:window.OjjudaGuestScores,stored,reads,writes,calls,events,clients,delays,timeouts,
  setReply:value=>{reply=value;},setPreview:value=>{preview=value;},randomCalls:()=>randomCalls};
}

for(const blocked of ['','read','write','both'])test('all guest score routes keep one identity with storage '+(blocked||'available'),async()=>{
 const f=fixture({blocked});
 for(const game of scoreGames){
  const request=crypto.randomUUID();assert.equal((await f.api.submit(game,3,request)).ok,true);
  assert.equal(f.calls.at(-1).name,'submit_guest_game_score');
  assert.equal(f.calls.at(-1).args.p_game,game);assert.equal(f.calls.at(-1).args.p_request_id,request);
 }
 assert.equal((await f.api.submitScrewBox(41,runId)).ok,true);
 assert.equal((await f.api.spot(9)).ok,true);
 assert.equal((await f.api.territory(runId,true)).ok,true);
 assert.equal((await f.api.marble(runId,false)).ok,true);
 assert.deepEqual(await f.api.ranking('sacheonseong','month'),[]);
 assert.deepEqual(f.calls.slice(scoreGames.length).map(call=>call.name),[
  'submit_guest_screw_box_score','record_spot_clear','record_ttang_result','record_marble_result','guest_game_ranking'
 ]);
 const tokens=new Set(f.calls.map(call=>call.args.p_guest_token));
 assert.equal(tokens.size,1,'a storage exception must not split one page into different guests');
 assert.match([...tokens][0],/^[a-f0-9]{64}$/);assert.equal(f.randomCalls(),1);
 assert.equal(f.calls[scoreGames.length].args.p_run_id,runId);
 assert.equal(f.calls[scoreGames.length+2].args.p_round,runId);
 assert.equal(f.calls[scoreGames.length+2].args.p_won,true);
 assert.equal(f.calls[scoreGames.length+3].args.p_won,false);
 assert.equal(f.calls.at(-1).args.p_period,'month');
 assert.equal(f.clients.length,1,'all paths share one isolated guest client');
 const auth=f.clients[0][2].auth;
 assert.equal(auth.persistSession,false);assert.equal(auth.autoRefreshToken,false);assert.equal(auth.detectSessionInUrl,false);
 assert.ok(f.timeouts.every(ms=>ms===10000),'each RPC has a bounded response wait');
});

test('a valid persisted guest token is reused even when writes are blocked',async()=>{
 const token='ab'.repeat(32),f=fixture({blocked:'write',existing:token});
 await f.api.submit('mole',3,runId);await f.api.submitScrewBox(40,runId);await f.api.spot(9);
 assert.ok(f.calls.every(call=>call.args.p_guest_token===token));assert.equal(f.randomCalls(),0);assert.equal(f.writes.length,0);
});

for(const blocked of ['read','write','both'])test('guest too_fast retry keeps its token and request UUID with blocked '+blocked,async()=>{
 const f=fixture({blocked});f.setReply((_name,_args,attempt)=>({data:attempt===1?{ok:false,reason:'too_fast'}:{ok:true},error:null}));
 assert.equal((await f.api.submit('mole',3,runId)).ok,true);
 assert.equal(f.calls.length,2);assert.equal(f.calls[0].rawArgs,f.calls[1].rawArgs);
 assert.deepEqual(f.calls[0].args,f.calls[1].args,'retrying must not change the server idempotency payload');
 assert.equal(f.calls[1].args.p_request_id,runId);assert.deepEqual(f.delays,[5100]);
 assert.equal(f.events.length,1);assert.equal(f.events[0].type,'ojjuda:game-record-saved');assert.equal(f.events[0].detail.guest,true);
});

const saveRoutes=[
 ['score',api=>api.submit('mole',3,runId)],
 ['box',api=>api.submitScrewBox(41,runId)],
 ['spot',api=>api.spot(9)],
 ['territory',api=>api.territory(runId,true)],
 ['marble',api=>api.marble(runId,false)]
];
for(const [name,save]of saveRoutes)test('guest '+name+' rejected and transport-failed responses never announce a saved record',async()=>{
 const rejected=fixture({blocked:'both'});rejected.setReply(()=>({data:{ok:false,reason:'invalid'},error:null}));
 assert.equal((await save(rejected.api)).ok,false);assert.equal(rejected.calls.length,1);assert.equal(rejected.events.length,0);
 const offline=fixture({blocked:'both'});offline.setReply(()=>({data:null,error:new Error('offline')}));
 await assert.rejects(save(offline.api),/offline/);assert.equal(offline.calls.length,1);assert.equal(offline.events.length,0);
});

test('a second too_fast response stays failed and cannot emit a saved event',async()=>{
 const f=fixture({blocked:'both'});f.setReply(()=>({data:{ok:false,reason:'too_fast'},error:null}));
 assert.equal((await f.api.submit('mole',3,runId)).reason,'too_fast');
 assert.equal(f.calls.length,2);assert.equal(f.events.length,0);assert.deepEqual(f.delays,[5100]);
});

test('admin preview neither submits guest scores nor reads or creates a guest identity',async()=>{
 const f=fixture({blocked:'both',preview:true});
 for(const game of scoreGames){const result=await f.api.submit(game,3,runId);assert.equal(result.preview,true);assert.equal(result.reason,'admin_preview');}
 for(const [,save]of saveRoutes.slice(1)){const result=await save(f.api);assert.equal(result.preview,true);assert.equal(result.ok,false);}
 assert.equal(f.calls.length,0);assert.equal(f.clients.length,0);assert.equal(f.events.length,0);
 assert.equal(f.reads.length,0);assert.equal(f.writes.length,0);assert.equal(f.randomCalls(),0);
 f.setPreview(false);assert.equal((await f.api.submit('mole',3,runId)).ok,true);assert.equal(f.calls.length,1);
});

test('invalid scores and run IDs cannot create a guest identity or reach the server',async()=>{
 const f=fixture({blocked:'both'});
 for(const [game,score]of [['unknown',3],['sacheonseong_0',3],['sacheonseong_201',3],['mole',-1],['mole',1.5],['mole',NaN]]){
  assert.equal((await f.api.submit(game,score,runId)).reason,'invalid');
 }
 assert.equal((await f.api.submitScrewBox(41,'not-a-uuid')).reason,'invalid');
 assert.equal((await f.api.submitScrewBox(2000000000,runId)).reason,'invalid');
 assert.equal(f.calls.length,0);assert.equal(f.reads.length,0);assert.equal(f.writes.length,0);assert.equal(f.events.length,0);
});
