const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app/world/world-weather.js'),'utf8');
const settle=()=>new Promise(setImmediate);
const KEY='ojjuda:theme-weather:v1',API_KEY='sb_publishable_test_weather_key';
const storage=map=>({getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)});
function fixture({saved,permission='granted',choice,fetcher}={}){
  let now=Date.parse('2026-11-19T03:15:00Z'),next=0;
  const timers=new Map(),sessions=new Map(),local=new Map(),requests=[];
  if(saved)sessions.set(KEY,JSON.stringify(saved(now)));
  if(choice)local.set('ojjuda:location-choice',JSON.stringify(choice));
  const status=new EventTarget();status.state=permission;
  const FakeDate=class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
  function page(top){
    const events=new EventTarget(),document=new EventTarget(),applied=[];document.hidden=false;
    const context=vm.createContext({console,URL,JSON,Map,Set,Date:FakeDate,Number,Math,Promise,Error,AbortController,CustomEvent,
      document,location:{origin:'https://ojjuda.kr'},top,sessionStorage:storage(sessions),localStorage:storage(local),
      OJJUDA_CONFIG:{supabaseKey:API_KEY},OjjudaThemes:{setWeather(kind){applied.push(kind);}},
      navigator:{permissions:{query:async()=>status},geolocation:{getCurrentPosition(){throw Error('No new location request');}}},
      addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),
      setTimeout(fn,ms){const id=++next;timers.set(id,{fn,at:now+ms});return id;},clearTimeout(id){timers.delete(id);},
      fetch:async(url,options)=>{requests.push({url,options});return fetcher?fetcher(url,options,now):Response.json({kind:'rain',expiresAt:now+900000});}
    });
    vm.runInContext(source,context);return {context,applied,document};
  }
  const parent=page();
  function location(detail={latitude:37.5665,longitude:126.978,capturedAt:now}){
    parent.context.dispatchEvent(new CustomEvent('ojjuda:weather-location',{detail}));
  }
  async function advance(ms){
    now+=ms;
    for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}
    await settle();
  }
  return {parent,page,location,advance,status,requests,sessions,local,now:()=>now};
}

test('weather waits for existing location, rounds it, authenticates with apikey only and shares one request across frames',async()=>{
  let release;
  const f=fixture({fetcher:(_url,_options,now)=>new Promise(resolve=>release=()=>resolve(Response.json({kind:'snow',expiresAt:now+60000})))});
  await settle();assert.equal(f.requests.length,0);
  const child=f.page(f.parent.context);await settle();
  f.location();f.location();await settle();assert.equal(f.requests.length,1);
  const {url,options}=f.requests[0];assert.match(url,/\?lat=37\.6&lon=127\.0$/);
  assert.equal(options.headers.apikey,API_KEY);assert.equal(options.headers.Authorization,undefined);
  release();await settle();
  assert.equal(f.parent.applied.at(-1),'snow');assert.equal(child.applied.at(-1),'snow');
  const saved=JSON.parse(f.sessions.get(KEY));assert.deepEqual(Object.keys(saved).sort(),['expiresAt','kind']);
  assert.equal(saved.kind,'snow');assert.ok(!f.sessions.get(KEY).includes('37.6'));
  f.location();await settle();assert.equal(f.requests.length,1,'fresh summary in this cell is reused');
  await f.advance(60001);assert.equal(f.parent.applied.at(-1),null);assert.equal(child.applied.at(-1),null);assert.equal(f.sessions.has(KEY),false);
});

test('navigation restores only fresh consented summaries; disabled, denied and stale cases stay seasonal',async()=>{
  const fresh=fixture({saved:now=>({kind:'rain',expiresAt:now+60000})});await settle();
  assert.equal(fresh.parent.applied.at(-1),'rain');assert.equal(fresh.requests.length,0);
  const denied=fixture({saved:now=>({kind:'snow',expiresAt:now+60000}),permission:'denied'});await settle();
  assert.equal(denied.parent.applied.at(-1),null);assert.equal(denied.sessions.has(KEY),false);
  const off=fixture({saved:now=>({kind:'snow',expiresAt:now+60000}),choice:{enabled:false}});await settle();
  assert.equal(off.parent.applied.at(-1),null);assert.equal(off.sessions.has(KEY),false);
  const stale=fixture({saved:now=>({kind:'snow',expiresAt:now-1})});await settle();
  assert.equal(stale.parent.applied.at(-1),null);assert.equal(stale.requests.length,0);assert.equal(stale.sessions.has(KEY),false);
  fresh.status.state='denied';fresh.status.dispatchEvent(new Event('change'));
  assert.equal(fresh.parent.applied.at(-1),null);assert.equal(fresh.sessions.has(KEY),false);
  denied.status.state='granted';denied.location();await settle();assert.equal(denied.parent.applied.at(-1),'rain');
  denied.status.state='denied';denied.status.dispatchEvent(new Event('change'));assert.equal(denied.parent.applied.at(-1),null,'revocation is watched after an initially denied permission');
});

test('off/logout cancels in-flight weather and late responses cannot revive it',async()=>{
  let release;
  const f=fixture({fetcher:(_url,_options,now)=>new Promise(resolve=>release=()=>resolve(Response.json({kind:'rain',expiresAt:now+60000})))});
  await settle();f.location();await settle();assert.equal(f.requests.length,1);
  f.location(null);assert.equal(f.requests[0].options.signal.aborted,true);
  release();await settle();assert.equal(f.parent.applied.at(-1),null);assert.equal(f.sessions.has(KEY),false);
});

test('missing app key, stale locations, background pages and unavailable forecasts never invent a weather theme',async()=>{
  const f=fixture({fetcher:async()=>new Response('',{status:503})});await settle();
  f.location({latitude:37.5,longitude:127,capturedAt:f.now()-120001});await settle();assert.equal(f.requests.length,0);
  f.parent.document.hidden=true;f.location();await settle();assert.equal(f.requests.length,0);
  f.parent.document.hidden=false;
  const config=f.parent.context.OJJUDA_CONFIG;delete f.parent.context.OJJUDA_CONFIG;f.location();await settle();assert.equal(f.requests.length,0);
  f.parent.context.OJJUDA_CONFIG=config;f.location();await settle();assert.equal(f.requests.length,1);assert.equal(f.parent.applied.at(-1),null);
});
