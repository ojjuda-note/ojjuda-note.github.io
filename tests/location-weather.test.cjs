const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../shared/location/location.js'),'utf8');
const settle=()=>new Promise(setImmediate);
function fixture({permission='granted',enabled=true,user={id:'member'},accuracy=30,mode='ok'}={}){
  let now=Date.parse('2026-11-19T03:15:00Z'),timerId=0,watchId=0;
  const events=new EventTarget(),seen=[],storage=new Map(),timers=new Map(),watches=new Map(),cleared=[],options=[];
  const status=new EventTarget();status.state=permission;
  const state={user,choice:{enabled,version:0},accuracy,mode,gets:0,geoCalls:0,latitude:37.5665,longitude:126.978,preferenceReads:0};
  const value=()=>({coords:{latitude:state.latitude,longitude:state.longitude,accuracy:state.accuracy},timestamp:now});
  const FakeDate=class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
  const context=vm.createContext({console,Date:FakeDate,Math,Map,Set,JSON,Number,Promise,Error,DOMException,AbortController,CustomEvent,
    setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),
    setInterval,clearInterval,location:{origin:'https://ojjuda.kr'},document:new EventTarget(),
    addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),
    localStorage:{setItem(){}},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,text)=>storage.set(key,text),removeItem:key=>storage.delete(key)},
    navigator:{permissions:{query:async()=>status},geolocation:{
      getCurrentPosition(ok,fail){state.gets++;state.geoCalls++;if(state.mode==='hold'){state.featureSuccess=ok;return;}
        if(state.mode==='deny')fail({code:1});else ok(value());},
      watchPosition(ok,fail,settings){const id=++watchId;state.geoCalls++;options.push(settings);watches.set(id,{ok,fail});
        if(state.mode==='deny')fail({code:1});else if(state.mode!=='hold')ok(value());return id;},
      clearWatch(id){cleared.push(id);watches.delete(id);}
    }}
  });
  events.addEventListener('ojjuda:weather-location',event=>seen.push(event.detail));
  vm.runInContext(source,context);
  const api=context.OjjudaLocation;
  const db={auth:{getSession:async()=>({data:{session:state.user?{user:state.user}:null}})},rpc:async()=>{
    state.preferenceReads++;return {data:{...state.choice}};
  }};
  async function advance(ms){now+=ms;for(const [id,timer] of [...timers])if(timer.at<=now&&timers.delete(id))timer.fn();await settle();}
  return {context,api,db,state,status,seen,storage,options,cleared,watches,advance,
    read:options=>api.readPosition({db,accountId:'member',...options}),
    weather:options=>api.readWeatherPosition({db,accountId:'member',...options}),
    success(){for(const watch of [...watches.values()])watch.ok(value());},
    featureSuccess(){state.featureSuccess(value());},
    off(){state.choice={enabled:false,version:state.choice.version+1};api.acceptPreference('member',state.choice);},
    grant(value){status.state=value;status.dispatchEvent(new Event('change'));},
  };
}

test('feature reads emit only KMA grids; undefined forget cannot clear another frame weather',async()=>{
  const f=fixture();await f.read();assert.equal(f.state.geoCalls,1);
  assert.deepEqual(Object.keys(f.seen[0]).sort(),['capturedAt','nx','ny']);
  assert.equal(f.seen[0].nx,60);assert.equal(f.seen[0].ny,127);
  const before=f.seen.length;f.api.forget(undefined);assert.equal(f.seen.length,before);
  await f.read();assert.equal(f.state.geoCalls,1,'the hook adds no geolocation call');
  f.off();assert.equal(f.seen.at(-1),null);
  const offCount=f.seen.length;await f.api.readPosition({accountId:'member',allowDisabled:true,fresh:true});
  assert.equal(f.seen.length,offCount,'an off preference cannot publish a feature fix');
  f.api.forget('member');assert.equal(f.seen.at(-1),null);assert.equal(f.storage.has('ojjuda:location-cell:member'),false);
});

test('previous-account settings and teardown cannot cancel current member weather',async()=>{
  const f=fixture();await f.read();const before=f.seen.length;
  f.context.__ojjudaThemeWeather={isAccount:id=>id==='member'};
  f.api.acceptPreference('previous-member',{enabled:false,version:1});
  f.api.forget('previous-member');assert.equal(f.seen.length,before);
  f.off();assert.equal(f.seen.at(-1),null,'the current member still clears immediately');
});

test('weather takes one cancellable low-accuracy fix and never saves raw coordinates',async()=>{
  const f=fixture({accuracy:3000});const grid=await f.weather();
  assert.deepEqual({...grid},{nx:60,ny:127,capturedAt:Date.parse('2026-11-19T03:15:00Z')});
  assert.equal(f.state.geoCalls,1);assert.equal(f.state.gets,0);
  assert.deepEqual({...f.options[0]},{enableHighAccuracy:false,maximumAge:0,timeout:8000});
  assert.deepEqual(f.cleared,[1],'a synchronous native callback still clears its returned watch id');
  assert.equal(f.watches.size,0);assert.equal(f.storage.size,0);assert.equal(f.context.__ojjudaLocationMemory.size,0);
  assert.equal(f.seen.length,0,'a weather-only read does not emit or retain exact coordinates');
  assert.equal(f.state.preferenceReads,2,'server consent is checked before and after GPS');
});

test('an obsolete account read cannot clear the current account weather',async()=>{
  const f=fixture({user:{id:'current-member'}});
  await assert.rejects(f.read());
  assert.equal(f.state.geoCalls,0);
  assert.equal(f.seen.length,0,'auth mismatch belongs to this stale read; the central auth binder owns weather clearing');
});

test('weather never prompts, invents a default location, or accepts unusable accuracy',async()=>{
  for(const options of [{permission:'prompt'},{permission:'denied'},{enabled:false},{user:null},{user:{id:'other'}},{user:{id:'member',is_anonymous:true}}]){
    const f=fixture(options);await assert.rejects(f.weather());assert.equal(f.state.geoCalls,0,JSON.stringify(options));
  }
  const poor=fixture({accuracy:5001});await assert.rejects(poor.weather(),{code:'inaccurate'});
  assert.equal(poor.state.geoCalls,1,'there is no precision escalation');assert.equal(poor.watches.size,0);
  const outside=fixture();outside.state.longitude=-74;outside.state.latitude=40.7;
  await assert.rejects(outside.weather(),{code:'unavailable'});assert.equal(outside.storage.size,0);
});

test('existing feature memory and an in-flight feature read prevent a duplicate GPS request',async()=>{
  const cached=fixture();await cached.read();await cached.weather();assert.equal(cached.state.geoCalls,1);
  cached.grant('denied');await assert.rejects(cached.weather(),{code:'denied'});assert.equal(cached.state.geoCalls,1,'a cached fix never bypasses permission');
  const pending=fixture({mode:'hold'});const feature=pending.read();await settle();
  const weather=pending.weather();await settle();assert.equal(pending.state.geoCalls,1);assert.equal(pending.watches.size,0);
  pending.featureSuccess();await feature;const grid=await weather;
  assert.equal(grid.nx,60);assert.equal(pending.state.geoCalls,1);
});

test('off, permission loss and cancellation immediately stop a pending watch and ignore late fixes',async()=>{
  for(const action of ['off','denied','abort']){
    const f=fixture({mode:'hold'}),controller=new AbortController();
    const request=f.weather({signal:controller.signal}),rejected=assert.rejects(request);
    await settle();assert.equal(f.watches.size,1);
    const late=[...f.watches.values()][0].ok;
    if(action==='off')f.off();else if(action==='denied')f.grant('denied');else controller.abort();
    await rejected;assert.equal(f.watches.size,0);assert.deepEqual(f.cleared,[1]);
    late({coords:{latitude:37.5,longitude:127,accuracy:30},timestamp:Date.now()});await settle();
    assert.equal(f.storage.size,0);assert.equal(f.context.__ojjudaLocationMemory.size,0);
  }
});

test('weather times out without precision retry and rechecks identity and server preference after GPS',async()=>{
  const timeout=fixture({mode:'hold'}),pending=timeout.weather(),rejected=assert.rejects(pending,{code:'timeout'});
  await settle();await timeout.advance(8000);await rejected;assert.equal(timeout.watches.size,0);assert.equal(timeout.state.geoCalls,1);
  const changed=fixture({mode:'hold'}),old=changed.weather(),discarded=assert.rejects(old);
  await settle();changed.state.user={id:'other'};changed.success();await discarded;
  assert.equal(changed.storage.size,0);
  const off=fixture({mode:'hold'}),oldChoice=off.weather(),blocked=assert.rejects(oldChoice);
  await settle();off.state.choice={enabled:false,version:1};off.success();await blocked;
  assert.equal(off.storage.size,0);assert.equal(off.seen.at(-1),null,'a server-side OFF discovered after GPS clears weather');
});
