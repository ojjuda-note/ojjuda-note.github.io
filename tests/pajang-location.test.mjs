import test from 'node:test';
import assert from 'node:assert/strict';
import '../shared/location/location.js';
import {readLocationCell,prepareLocation} from '../features/pajang/location.mjs';

const fix=accuracy=>({coords:{latitude:37.5665,longitude:126.978,accuracy}});
const cell={latCell:3757,lonCell:12698};
function environment(t,geolocation){
  globalThis.OjjudaLocation.forget('member');
  for(const [key,value] of Object.entries({navigator:{geolocation,permissions:{query:async()=>({state:'granted'})}},window:new EventTarget(),document:{querySelector:()=>null}})){
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    t.after(()=>descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]);
  }
}

test('a usable fast fix uploads only the coarse cell and manual retry ignores old cache',async t=>{
  const calls=[];environment(t,{getCurrentPosition(ok,fail,options){calls.push(options);ok(fix(30));}});
  assert.deepEqual(await readLocationCell(),cell);
  assert.deepEqual(await readLocationCell({fresh:true}),cell);
  assert.equal(calls[0].maximumAge,30000);assert.equal(calls[1].maximumAge,0);
});

test('a coarse initial fix improves during a bounded precise watch',async t=>{
  const cleared=[],progress=[];let fineOptions;
  environment(t,{
    getCurrentPosition(ok){ok(fix(6000));},
    watchPosition(ok,fail,options){fineOptions=options;queueMicrotask(()=>{ok(fix(5000));ok(fix(30));ok(fix(20));});return 11;},
    clearWatch(id){cleared.push(id);}
  });
  assert.deepEqual(await readLocationCell({onProgress:v=>progress.push(v)}),cell);
  assert.equal(fineOptions.enableHighAccuracy,true);assert.equal(fineOptions.maximumAge,0);
  assert.deepEqual(cleared,[11]);assert.ok(progress.at(-1).includes('더 정확한'));
});

for(const code of [2,3])test(`initial location error ${code} recovers with one precise watch`,async t=>{
  let watches=0;const cleared=[];
  environment(t,{getCurrentPosition(ok,fail){fail({code});},watchPosition(ok){watches++;queueMicrotask(()=>ok(fix(50)));return 12;},clearWatch(id){cleared.push(id);}});
  assert.deepEqual(await readLocationCell(),cell);assert.equal(watches,1);assert.deepEqual(cleared,[12]);
});

test('denied permission is explained without repeatedly requesting it',async t=>{
  let watches=0;
  environment(t,{getCurrentPosition(ok,fail){fail({code:1});},watchPosition(){watches++;}});
  await assert.rejects(readLocationCell(),{code:'denied'});assert.equal(watches,0);
});

test('precise errors remain distinct and the watch always ends',async t=>{
  for(const [input,expected] of [[null,'inaccurate'],[1,'denied'],[2,'unavailable'],[3,'timeout']]){
    const cleared=[];
    environment(t,{getCurrentPosition(ok){ok(fix(9000));},watchPosition(ok,fail){queueMicrotask(()=>input?fail({code:input}):ok(fix(8000)));return 13;},clearWatch(id){cleared.push(id);}});
    await assert.rejects(readLocationCell({preciseTimeout:10}),{code:expected});
    assert.deepEqual(cleared,[13]);
  }
});

test('cancel ignores late callbacks and stops an active precise watch',async t=>{
  const controller=new AbortController(),cleared=[];let late,started;
  const watching=new Promise(resolve=>{started=resolve;});
  environment(t,{getCurrentPosition(ok){ok(fix(4000));},watchPosition(ok){late=ok;started();return 14;},clearWatch(id){cleared.push(id);}});
  const pending=readLocationCell({signal:controller.signal});
  await watching;controller.abort();
  await assert.rejects(pending,{name:'AbortError'});late(fix(20));assert.deepEqual(cleared,[14]);
});

test('cancel while the fast lookup is pending does not start a retry',async t=>{
  const controller=new AbortController();let late,watches=0;
  environment(t,{getCurrentPosition(ok){late=ok;},watchPosition(){watches++;}});
  const pending=readLocationCell({signal:controller.signal});await new Promise(setImmediate);controller.abort();late(fix(5000));
  await assert.rejects(pending,{name:'AbortError'});assert.equal(watches,0);
});

test('entry respects off, preserves failures, and checks the account before upload',async t=>{
  let reads=0,writes=0,denied=false,account='member';
  environment(t,{getCurrentPosition(ok,fail){reads++;denied?fail({code:1}):ok(fix(40));}});
  const state={me:{id:'profile'},locationEnabled:true,locationVersion:5};
  const db={auth:{getSession:async()=>({data:{session:{user:{id:account}}}})},rpc:async(name,args)=>{
    if(name==='ojjuda_location_preference')return {data:{enabled:true,version:5}};
    writes++;assert.deepEqual(args.p_data,{...cell,accountId:'member',consent:true,shareBearing:true,automatic:true,locationVersion:5});
    return {data:{...state,radarOn:true}};
  }};
  const off={...state,locationEnabled:false};assert.equal(await prepareLocation(off,db,'member'),off);assert.equal(reads,0);
  denied=true;const failed=await prepareLocation(state,db,'member');assert.equal(failed.locationEnabled,true);assert.ok(failed.locationNotice.includes('권한'));assert.equal(writes,0);
  denied=false;account='other';await prepareLocation(state,db,'member');assert.equal(writes,0);
  account='member';const success=await prepareLocation(state,db,'member');assert.equal(success.radarOn,true);assert.equal(writes,1);
});

test('reopening Pajang after a one-time grant expires waits for the location button',async t=>{
  let reads=0,writes=0,permission='granted';
  environment(t,{getCurrentPosition(ok){reads++;ok(fix(40));}});
  navigator.permissions.query=async()=>({state:permission});
  const state={me:{id:'profile'},locationEnabled:true,locationVersion:1};
  const db={auth:{getSession:async()=>({data:{session:{user:{id:'member'}}}})},rpc:async(name)=>{
    if(name==='ojjuda_location_preference')return {data:{enabled:true,version:1}};
    writes++;return {data:{...state,radarOn:true}};
  }};
  assert.equal((await prepareLocation(state,db,'member')).radarOn,true);
  permission='prompt';
  for(let visit=0;visit<2;visit++){
    const result=await prepareLocation(state,db,'member');
    assert.equal(result.locationNotice,'');assert.equal(result.locationChecked,true);
  }
  assert.equal(reads,1);assert.equal(writes,1);
  assert.deepEqual(await readLocationCell({db,accountId:'member',allowDisabled:true,fresh:true}),cell);
  assert.equal(reads,2);
});

test('leaving during entry stops the lookup and never saves a location',async t=>{
  let writes=0,late;
  environment(t,{getCurrentPosition(ok){late=ok;}});
  const db={auth:{getSession:async()=>({data:{session:{user:{id:'member'}}}})},rpc:async()=>{writes++;}};
  const state={me:{id:'profile'},locationEnabled:true};
  const pending=prepareLocation(state,db,'member');await new Promise(setImmediate);window.dispatchEvent(new Event('pagehide'));
  late(fix(50));assert.equal(await pending,state);assert.equal(writes,0);
});

test('a background lookup is cancellable by a settings change without leaving the page',async t=>{
  let writes=0,late;const progress=[],controller=new AbortController();
  environment(t,{getCurrentPosition(ok){late=ok;}});
  const db={auth:{getSession:async()=>({data:{session:{user:{id:'member'}}}})},rpc:async()=>{writes++;}};
  const state={me:{id:'profile'},locationEnabled:true,locationVersion:0};
  const pending=prepareLocation(state,db,'member',{signal:controller.signal,onProgress:message=>progress.push(message)});
  await new Promise(setImmediate);assert.ok(progress.includes('위치를 확인하고 있어요.'));
  controller.abort();late(fix(50));
  assert.equal(await pending,state);assert.equal(writes,0);
});
