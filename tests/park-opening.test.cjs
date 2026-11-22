const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../park/opening.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({user='one',card=false,error=false,host=false,started=false,pendingAuth=false}={}){
  let finish,onAuth,reads=0,signal,unsubscribed=false;
  const images=[],listeners=new Map(),timers=new Map();let nextTimer=0;
  const db={auth:{getSession:pendingAuth?()=>new Promise(()=>{}):async()=>({data:{session:user?{user:{id:user}}:null}}),
    onAuthStateChange(fn){onAuth=fn;return {data:{subscription:{unsubscribe(){unsubscribed=true;}}}};}},
    schema:()=>({rpc(name,args){assert.equal(name,'list_cards');assert.equal(args.p_lat,null);reads++;
      return {abortSignal(value){signal=value;return new Promise(resolve=>{finish=()=>resolve(error?{error:{message:'offline'}}:{data:[{kind:'memo',body:'fixture',background_key:'10'}]});});}};}})};
  const scope={OJJUDA_CONFIG:{supabaseUrl:'fixture',supabaseKey:'fixture'},supabase:{createClient:()=>db},
    URL,AbortController,location:new URL('https://fixture.test/park/'+(card?'?card=shared':'')),
    document:{documentElement:{hasAttribute:()=>false}},Image:class{set src(value){images.push(value);}},
    setTimeout:(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,delay});return id;},
    clearTimeout:id=>timers.delete(id),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  scope.window=scope;
  if(host){scope.parent={location:new URL('https://fixture.test/world.html'),OjjudaGetClient:async()=>db};delete scope.supabase;delete scope.OJJUDA_CONFIG;}
  if(started)scope.OjjudaParkFeedStarted=true;
  vm.runInNewContext(source,scope);
  return {scope,db,images,get reads(){return reads;},get signal(){return signal;},get unsubscribed(){return unsubscribed;},
    fireTimer:delay=>{for(const [id,timer] of [...timers])if(timer.delay===delay){timers.delete(id);timer.fn();}},
    finish:()=>finish(),auth:user=>onAuth('SIGNED_IN',user?{user:{id:user}}:null),leave:()=>listeners.get('pagehide')?.()};
}
for(const user of ['one',null])test(`first feed is started early and consumed once (${user||'guest'})`,async()=>{
  const f=fixture({user});await tick();assert.equal(f.reads,1);
  assert.equal(f.scope.OjjudaParkOpening.client,f.db);
  const pending=f.scope.OjjudaParkOpening.take(user);f.finish();
  assert.equal((await pending).data[0].body,'fixture');
  assert.equal(f.scope.OjjudaParkOpening.take,undefined,'consumption releases the prepared response closure');
  assert.deepEqual(f.images,['/note/assets/10.jpg']);assert.equal(f.unsubscribed,true);
});
for(const change of ['other','logout','leave'])test(`late opening data is discarded on ${change}`,async()=>{
  const f=fixture();await tick();const pending=f.scope.OjjudaParkOpening.take('one');
  if(change==='leave')f.leave();else f.auth(change==='logout'?null:'two');
  f.finish();assert.equal(await pending,undefined);assert.equal(f.signal.aborted,true);assert.deepEqual(f.images,[]);
});
test('a different viewer cannot consume the prepared page',async()=>{
  const f=fixture();await tick();f.finish();assert.equal(await f.scope.OjjudaParkOpening.take('two'),undefined);
});
test('failed preparation falls back to a normal feed request',async()=>{
  const f=fixture({error:true});await tick();f.finish();assert.equal(await f.scope.OjjudaParkOpening.take('one'),undefined);
});
test('shared-card navigation skips the general feed',async()=>{
  const f=fixture({card:true});await tick();assert.equal(f.reads,0);
  assert.equal(await f.scope.OjjudaParkOpening.take('one'),undefined);
});
test('embedded Park starts through Agit before its own SDK and tools are ready',async()=>{
  const f=fixture({host:true});await tick();assert.equal(f.reads,1);
  assert.equal(f.scope.OjjudaParkOpening.client,null,'other iframe tools must not retain the host client');
  const pending=f.scope.OjjudaParkOpening.take('one');f.finish();
  assert.equal((await pending).data[0].body,'fixture');assert.equal(f.unsubscribed,true);
});
test('a slow opening script cannot duplicate an already started feed',async()=>{
  const f=fixture({started:true});await tick();assert.equal(f.reads,0);assert.equal(f.scope.OjjudaParkOpening,undefined);
});


test('a stalled warm-up cannot hold up the visible feed for a second full timeout', async()=>{
  const f=fixture();await tick();assert.equal(f.reads,1);
  const pending=f.scope.OjjudaParkOpening.take('one');
  f.fireTimer(900);
  assert.equal(await pending,undefined);
  assert.equal(f.signal.aborted,true,'the unused warm-up request is cancelled');
  assert.equal(f.scope.OjjudaParkOpening.take,undefined);
  f.finish();await tick();assert.deepEqual(f.images,[]);
});
test('an unfinished warm-up auth lookup never delays the first normal card request',async()=>{
  const f=fixture({pendingAuth:true});await tick();
  assert.equal(f.reads,0);
  assert.equal(await f.scope.OjjudaParkOpening.take('one'),undefined);
  assert.equal(f.scope.OjjudaParkOpening.take,undefined);
});
