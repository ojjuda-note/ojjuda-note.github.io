const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const script=readFileSync(join(__dirname,'../shared/games/arcade-round-queue.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({records=new Map(),blocked=false,actor='member:A',send}={}){
 let now=Date.parse('2026-11-30T15:59:59Z'),sequence=0;
 const timers=new Map(),saved=[],sent=[];
 const storage={get length(){return records.size;},key:i=>[...records.keys()][i],getItem:k=>records.get(k),
  setItem(k,v){if(blocked)throw Error('blocked');records.set(k,v);},removeItem(k){if(blocked)throw Error('blocked');records.delete(k);}};
 const ctx=vm.createContext({window:{},localStorage:storage,Date:class extends Date{static now(){return now;}},
  setTimeout:(f,ms)=>{const id=++sequence;timers.set(id,{f,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(script,ctx);
 const queue=ctx.window.OjjudaArcadeRoundQueue.create({actor:()=>actor,send:async row=>{sent.push(row);return send?send(row):{ok:true};},onSaved:row=>saved.push(row)});
 const advance=async ms=>{now+=ms;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.f();}await tick();};
 const row=(game,score,id=randomUUID())=>({actor,game,score,id,finishedAt:new Date(now).toISOString()});
 return {queue,records,sent,saved,advance,row,actor:value=>{actor=value;},send:handler=>{send=handler;}};
}
test('two fast completed rounds are separate, retain their dates and retry automatically',async()=>{
 const f=fixture(),one=f.row('stacker',1),two=f.row('stacker',2);let calls=0;
 f.send(async()=>++calls===2?{ok:false,reason:'too_fast'}:{ok:true});
 assert.equal((await f.queue.submit(one)).ok,true);
 let final=null;
 const second=await f.queue.submit(two,r=>{final=r;});
 assert.equal(second.pending,true);assert.equal(second.durable,true);assert.equal(f.records.size,1);
 await f.advance(5199);assert.equal(final,null);await f.advance(1);assert.equal(final.ok,true);
 assert.deepEqual(f.sent.map(r=>[r.id,r.score,r.finishedAt]),[one,two,two].map(r=>[r.id,r.score,r.finishedAt]));
 assert.deepEqual(f.saved.map(r=>r.score),[1,2]);assert.equal(f.records.size,0);
});
test('storage is written before a leaderboard read, and reopening recovers the same receipt after a lost acknowledgement',async()=>{
 const ledger=new Map(),records=new Map(),owner='member:A';let completeRead;
 const f=fixture({records,actor:owner,send:async row=>{ledger.set(row.id,row.score);throw Error('reply lost');}});
 const row=f.row('runner',910);const save=f.queue.submit(row,null,new Promise(r=>{completeRead=r;}));
 assert.equal(records.size,1);assert.equal(f.sent.length,0);
 completeRead();assert.equal((await save).pending,true);
 const reopened=fixture({records,actor:'guest:device',send:async record=>{assert.ok(ledger.has(record.id));return {ok:true};}});
 reopened.queue.resume();await tick();assert.equal(reopened.sent.length,0);
 reopened.actor('member:B');reopened.queue.resume();await tick();assert.equal(reopened.sent.length,0);
 reopened.actor(owner);reopened.queue.resume();await tick();
 assert.equal(reopened.sent[0].id,row.id);assert.equal(reopened.sent[0].finishedAt,row.finishedAt);
 assert.equal(records.size,0);assert.equal(ledger.size,1);
});
test('the same UUID never merges results from two owners or guest identities',async()=>{
 const records=new Map(),id=randomUUID();const f=fixture({records,send:async()=>{throw Error('offline');}});
 for(const owner of ['member:A','member:B','guest:original']){f.actor(owner);assert.equal((await f.queue.submit(f.row('mole',1,id))).pending,true);}
 assert.equal(records.size,3);
 const reopened=fixture({records,actor:'guest:new'});reopened.queue.resume();await tick();assert.equal(reopened.sent.length,0);
 reopened.actor('guest:original');reopened.queue.resume();await tick();assert.deepEqual(reopened.sent.map(r=>r.actor),['guest:original']);
 assert.equal(records.size,2);
});
test('a fresh tab cannot replace an awaiting round with a conflicting score',async()=>{
 const f=fixture({send:async()=>{throw Error('offline');}}),row=f.row('stacker',2);
 await f.queue.submit(row);
 const fresh=fixture({records:f.records});
 const wrong=await fresh.queue.submit({...row,score:3});
 assert.equal(wrong.reason,'request_conflict');assert.equal(fresh.sent.length,0);
 assert.equal(JSON.parse([...f.records.values()][0]).score,2);
 await fresh.advance(0);assert.equal(fresh.sent[0].score,2);
});
test('restricted storage still retries in memory, and permanent rejections stop retrying',async()=>{
 const f=fixture({blocked:true,send:async()=>{throw Error('offline');}});
 const row=f.row('breakout',500),failure=await f.queue.submit(row);
 assert.equal(failure.pending,true);assert.equal(failure.durable,false);
 f.send(async()=>({ok:false,reason:'banned'}));await f.advance(3000);await f.advance(60000);
 assert.equal(f.sent.length,2);assert.equal(f.saved.length,0);
});
test('World routes restored guest and member receipts through their own clients, and suppresses preview writes',async()=>{
 const {JSDOM}=require('jsdom');
 const html=readFileSync(join(__dirname,'../world.html'),'utf8');
 const guest=readFileSync(join(__dirname,'../shared/games/guest-game-scores.js'),'utf8');
 const adapter=html.slice(html.indexOf('var arcadeRoundQueue;'),html.indexOf('let chachaRushPortalPromise'));
 const w=new JSDOM('',{url:'https://arcade.test',runScripts:'outside-only'}).window;
 try{
  let member=null,preview=false;
  const calls=[],events=[];
  function client(kind){return {rpc(name,args){calls.push({kind,name,args});
   const response=Promise.resolve({data:{ok:true,reward:0}});response.abortSignal=()=>response;return response;}};}
  w.OjjudaAdminPreview={isEnabled:()=>preview};w.OJJUDA_CONFIG={supabaseUrl:'https://score.test',supabaseKey:'fixture'};
  w.supabase={createClient:()=>client('guest')};w.S=client('member');w.D={parkGuest:true};
  w.worldRewardOwner=()=>member;w.AbortSignal=AbortSignal;
  w.addEventListener('ojjuda:game-record-saved',e=>events.push(e.detail));
  w.eval(guest);w.eval(script);w.eval(adapter);
  const at=Date.now(),id=randomUUID();
  assert.equal((await w.worldArcadeRound('mole',23,{owner:null,id,finishedAt:at})).ok,true);
  assert.equal(calls[0].name,'submit_arcade_round');assert.equal(calls[0].kind,'guest');
  assert.match(calls[0].args.p_guest_token,/^[a-f0-9]{64}$/);assert.equal(calls[0].args.p_expected_owner,null);
  assert.equal(calls[0].args.p_finished_at,new Date(at).toISOString());assert.equal(calls[0].args.p_round_id,id);
  member=randomUUID();w.D.parkGuest=false;
  assert.equal((await w.worldArcadeRound('runner',60,{owner:member,id:randomUUID(),finishedAt:at})).ok,true);
  assert.equal(calls[1].kind,'member');assert.equal(calls[1].args.p_expected_owner,member);assert.equal(calls[1].args.p_guest_token,null);
  assert.equal(events.length,2);assert.equal(events[0].guest,true);assert.equal(events[1].owner,member);
  assert.equal((await w.worldArcadeRound('stacker',1,{owner:null,id:randomUUID()})).reason,'owner_changed');
  preview=true;assert.equal((await w.worldArcadeRound('stacker',1,{owner:member,id:randomUUID()})).preview,true);
  assert.equal(calls.length,2);
 }finally{w.close();}
});

test('restoring a backlog sends one receipt at a time per game while other games can progress',async()=>{
 const offline=fixture({send:async()=>{throw Error('offline');}});
 for(const [game,score] of [['stacker',1],['stacker',2],['runner',100],['stacker',3]])await offline.queue.submit(offline.row(game,score));
 const next=fixture({records:offline.records});next.queue.resume();await tick();
 assert.deepEqual(next.sent.map(r=>r.score),[1,100]);
 await next.advance(5199);assert.equal(next.sent.length,2);await next.advance(1);
 assert.equal(next.sent.at(-1).score,2);await next.advance(5200);
 assert.deepEqual(next.sent.map(r=>r.score),[1,100,2,3]);assert.equal(offline.records.size,0);
});
