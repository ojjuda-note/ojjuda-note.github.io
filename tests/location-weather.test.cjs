const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../shared/location/location.js'),'utf8');
test('shared location emits only rounded consented weather cells and clears on denied, disabled and logout',async()=>{
  const events=new EventTarget(),seen=[],storage=new Map();let mode='ok',calls=0;
  const context=vm.createContext({console,Date,Map,Set,JSON,Number,Promise,Error,DOMException,AbortController,CustomEvent,
    setTimeout,clearTimeout,setInterval,clearInterval,
    location:{origin:'https://ojjuda.kr'},document:new EventTarget(),
    addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),
    localStorage:{setItem(){}},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    navigator:{permissions:{query:async()=>({state:mode==='deny'?'denied':'granted'})},geolocation:{
      getCurrentPosition(ok,fail){calls++;if(mode==='deny')fail({code:1});else ok({coords:{latitude:37.5665,longitude:126.978,accuracy:30},timestamp:Date.now()});},
      watchPosition(){throw Error('unexpected precision request');},clearWatch(){}
    }}
  });
  events.addEventListener('ojjuda:weather-location',event=>seen.push(event.detail));
  vm.runInContext(source,context);
  const api=context.OjjudaLocation;
  await api.readPosition({accountId:'member'});assert.equal(calls,1);
  assert.deepEqual(Object.keys(seen[0]).sort(),['capturedAt','latitude','longitude']);
  assert.equal(seen[0].latitude,37.6);assert.equal(seen[0].longitude,127);
  await api.readPosition({accountId:'member'});assert.equal(calls,1,'weather hook adds no geolocation calls');assert.equal(seen.length,2);
  api.acceptPreference('member',{enabled:false,version:1});assert.equal(seen.at(-1),null);
  const before=seen.length;
  await api.readPosition({accountId:'member',allowDisabled:true,fresh:true});assert.equal(seen.length,before,'off preference cannot publish even an allowed feature fix');
  api.acceptPreference('member',{enabled:true,version:2});mode='deny';
  await assert.rejects(api.readPosition({accountId:'member',fresh:true}),{code:'denied'});assert.equal(seen.at(-1),null);
  mode='ok';await api.readPosition({accountId:'member',fresh:true});assert.equal(seen.at(-1).latitude,37.6);
  api.forget('member');assert.equal(seen.at(-1),null);assert.equal(storage.has('ojjuda:location-cell:member'),false);
});
