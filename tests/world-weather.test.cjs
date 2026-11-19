const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app/world/world-weather.js'),'utf8');
const settle=()=>new Promise(setImmediate);
const KEY='ojjuda:theme-weather:v2',API_KEY='sb_publishable_test_weather_key',MINUTE=60000;
const storage=map=>({getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)});
function fixture({saved,legacy=false,permission='granted',enabled=true,user={id:'member'},fetcher,readCell,getSession,getClient}={}){
  let now=Date.parse('2026-11-19T03:15:00Z'),next=0,sessionReads=0,clientReads=0,fixes=0;
  const timers=new Map(),sessions=new Map(),local=new Map(),requests=[],reads=[],authListeners=new Set(),choiceListeners=new Map();
  if(saved)sessions.set(legacy?'ojjuda:theme-weather:v1':KEY,JSON.stringify(saved(now)));
  const status=new EventTarget();status.state=permission;
  const account={user},choice={enabled,version:0},cell={nx:60,ny:127};
  const db={auth:{
    getSession:()=>getSession?getSession(account,++sessionReads):Promise.resolve({data:{session:account.user?{user:account.user}:null}}),
    onAuthStateChange(callback){authListeners.add(callback);return {data:{subscription:{unsubscribe(){authListeners.delete(callback);}}}};}
  }};
  const service={
    current:()=>choice,
    subscribe(owner,callback){if(!choiceListeners.has(owner))choiceListeners.set(owner,new Set());choiceListeners.get(owner).add(callback);callback({...choice});return()=>choiceListeners.get(owner).delete(callback);},
    async readWeatherPosition(options){
      reads.push(options);
      if(!choice.enabled)throw Object.assign(Error('Off'),{code:'disabled'});
      if(status.state!=='granted')throw Object.assign(Error('Not granted'),{code:'denied'});
      fixes++;
      return readCell?readCell(options,now):{...(options.cell||cell),capturedAt:now};
    }
  };
  const FakeDate=class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
  function page(top){
    const events=new EventTarget(),document=new EventTarget(),applied=[];document.hidden=false;document.readyState='complete';
    const context=vm.createContext({console,URL,JSON,Map,Set,Date:FakeDate,Number,Math,Promise,Error,AbortController,CustomEvent,
      document,location:{origin:'https://ojjuda.kr'},top,sessionStorage:storage(sessions),localStorage:storage(local),
      OJJUDA_CONFIG:{supabaseKey:API_KEY},OjjudaThemes:{setWeather(kind){applied.push(kind);}},
      OjjudaGetClient:async()=>getClient?getClient(db,++clientReads):db,OjjudaLocation:service,
      navigator:{permissions:{query:async()=>status},geolocation:{getCurrentPosition(){throw Error('Use the consented location service');}}},
      addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),
      setTimeout(fn,ms){const id=++next;timers.set(id,{fn,at:now+ms});return id;},clearTimeout(id){timers.delete(id);},
      fetch:async(url,options)=>{requests.push({url,options});return fetcher?fetcher(url,options,now):Response.json({kind:'snow',expiresAt:now+10*MINUTE,source:'kma',observedAt:now});}
    });
    vm.runInContext(source,context);return {context,applied,document};
  }
  const parent=page();
  function location(detail={...cell,capturedAt:now}){
    parent.context.dispatchEvent(new CustomEvent('ojjuda:weather-location',{detail}));
  }
  async function flush(){
    for(let pass=0;pass<25;pass++){
      await settle();
      const due=[...timers].filter(([,timer])=>timer.at<=now).sort((a,b)=>a[1].at-b[1].at);
      if(!due.length)return;
      for(const [id,timer] of due)if(timers.delete(id))timer.fn();
    }
    throw Error('Unexpected immediate timer loop');
  }
  async function advance(ms){
    await flush();const target=now+ms;
    for(;;){
      const due=[...timers].filter(([,timer])=>timer.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!due)break;now=due[1].at;await flush();
    }
    now=target;await flush();
  }
  function login(value){account.user=value;for(const callback of authListeners)callback(value?'SIGNED_IN':'SIGNED_OUT',value?{user:value}:null);}
  function preference(value){choice.enabled=value;choice.version++;for(const callback of choiceListeners.get(account.user?.id)||[])callback({...choice});}
  function grant(value){status.state=value;status.dispatchEvent(new Event('change'));}
  function hidden(value){parent.document.hidden=value;parent.document.dispatchEvent(new Event('visibilitychange'));}
  return {parent,page,location,advance,flush,login,preference,grant,hidden,status,requests,reads,sessions,local,cell,now:()=>now,fixes:()=>fixes};
}

test('a consented member gets current weather on entry without a feature event; frames share one grid request',async()=>{
  const f=fixture();await f.flush();
  assert.equal(f.requests.length,1);assert.equal(f.fixes(),1);assert.equal(f.parent.applied.at(-1),'snow');
  const child=f.page(f.parent.context);await f.flush();assert.equal(child.applied.at(-1),'snow');
  f.parent.context.dispatchEvent(new Event('pageshow'));f.location();await f.flush();
  assert.equal(f.requests.length,1,'same-cell feature events and pageshow do not duplicate a fresh request');
  const {url,options}=f.requests[0];assert.match(url,/\?nx=60&ny=127$/);
  assert.equal(options.headers.apikey,API_KEY);assert.equal(options.headers.Authorization,undefined);
  const saved=JSON.parse(f.sessions.get(KEY));assert.deepEqual(Object.keys(saved).sort(),['expiresAt','kind']);
  assert.ok(!f.sessions.get(KEY).includes('nx'));assert.ok(!f.sessions.get(KEY).includes('latitude'));
});

test('ten-minute refreshes obtain current grids beyond the old thirty-minute cutoff',async()=>{
  let kind='snow';
  const f=fixture({fetcher:(_url,_options,now)=>Response.json({kind,expiresAt:now+10*MINUTE})});
  await f.flush();kind='rain';f.cell.nx=61;
  await f.advance(10*MINUTE);assert.equal(f.requests.length,2);assert.match(f.requests.at(-1).url,/nx=61&ny=127/);
  assert.equal(f.parent.applied.at(-1),'rain');assert.equal(f.fixes(),2);
  await f.advance(30*MINUTE);assert.equal(f.requests.length,5);assert.equal(f.parent.applied.at(-1),'rain');
  kind=null;await f.advance(10*MINUTE);assert.equal(f.parent.applied.at(-1),null);
});

test('hidden pages pause and returning pages immediately acquire the moved current location',async()=>{
  const f=fixture();await f.flush();f.hidden(true);f.cell.nx=62;
  await f.advance(20*MINUTE);assert.equal(f.requests.length,1);
  f.hidden(false);f.parent.context.dispatchEvent(new Event('pageshow'));await f.flush();
  assert.equal(f.requests.length,2);assert.match(f.requests.at(-1).url,/nx=62&ny=127/);assert.equal(f.parent.applied.at(-1),'snow');
  f.parent.context.dispatchEvent(new Event('pagehide'));await f.advance(20*MINUTE);
  assert.equal(f.requests.length,2);f.parent.context.dispatchEvent(new Event('pageshow'));await f.flush();
  assert.equal(f.requests.length,3,'page restore resumes the coordinator even without a feature location event');
});

test('off, denied, logout and hidden abort location and reject its late result',async()=>{
  for(const action of ['off','denied','logout','hidden']){
    let release;
    const f=fixture({readCell:(_options,now)=>new Promise(resolve=>release=()=>resolve({nx:60,ny:127,capturedAt:now}))});
    await f.flush();assert.equal(f.reads.length,1);
    if(action==='off')f.preference(false);else if(action==='denied')f.grant('denied');else if(action==='logout')f.login(null);else f.hidden(true);
    assert.equal(f.reads[0].signal.aborted,true,action);
    release();await f.flush();assert.equal(f.requests.length,0,action);
    await f.advance(30*MINUTE);assert.equal(f.requests.length,0,action+' has no background retry');
  }
});

test('off, denied, logout and hidden reject late weather responses',async()=>{
  for(const action of ['off','denied','logout','hidden']){
    let release;
    const f=fixture({fetcher:(_url,_options,now)=>new Promise(resolve=>release=()=>resolve(Response.json({kind:'snow',expiresAt:now+10*MINUTE})))});
    await f.flush();assert.equal(f.requests.length,1);
    if(action==='off')f.preference(false);else if(action==='denied')f.grant('denied');else if(action==='logout')f.login(null);else f.hidden(true);
    assert.equal(f.requests[0].options.signal.aborted,true,action);
    release();await f.flush();assert.equal(f.parent.applied.at(-1),null,action);assert.equal(f.sessions.has(KEY),false);
    await f.advance(30*MINUTE);assert.equal(f.requests.length,1);
  }
});

test('unconsented, signed-out and anonymous visitors never acquire a location or weather',async()=>{
  for(const options of [{permission:'prompt'},{permission:'denied'},{enabled:false},{user:null},{user:{id:'guest',is_anonymous:true}}]){
    const f=fixture(options);await f.flush();await f.advance(30*MINUTE);
    assert.equal(f.fixes(),0,JSON.stringify(options));assert.equal(f.requests.length,0);assert.equal(f.parent.applied.at(-1),null);
  }
  const f=fixture({enabled:false});await f.flush();f.preference(true);await f.flush();
  assert.equal(f.requests.length,1,'an explicit app preference ON resumes weather');
  f.grant('denied');f.grant('granted');await f.flush();assert.equal(f.requests.length,2,'already granted permission resumes without a prompt');
});

test('temporary failures retry once after one minute, then wait ten minutes; online recovery uses that same retry',async()=>{
  let count=0;
  const f=fixture({fetcher:(_url,_options,now)=>++count<=2?new Response('',{status:503}):Response.json({kind:'rain',expiresAt:now+10*MINUTE})});
  await f.flush();assert.equal(f.requests.length,1);
  await f.advance(MINUTE);assert.equal(f.requests.length,2);
  await f.advance(9*MINUTE);assert.equal(f.requests.length,2);
  await f.advance(MINUTE);assert.equal(f.requests.length,3);assert.equal(f.parent.applied.at(-1),'rain');
  const online=fixture({fetcher:async()=>new Response('',{status:503})});await online.flush();
  online.parent.context.dispatchEvent(new Event('online'));await online.flush();assert.equal(online.requests.length,2);
  online.parent.context.dispatchEvent(new Event('online'));await online.flush();assert.equal(online.requests.length,2,'online events cannot make an unbounded retry loop');
});

test('a delayed initial session cannot overwrite a newer signed-in account',async()=>{
  let initial;
  const f=fixture({getSession:()=>new Promise(resolve=>initial=resolve)});
  await f.flush();f.login({id:'new-member'});await f.flush();
  assert.deepEqual(f.reads.map(read=>read.accountId),['new-member']);
  initial({data:{session:{user:{id:'old-member'}}}});await f.flush();
  assert.deepEqual(f.reads.map(read=>read.accountId),['new-member']);assert.equal(f.requests.length,1);
});

test('startup network failures recover with bounded retries and on a later foreground return',async()=>{
  let attempts=0;
  const f=fixture({getClient:(db,count)=>{attempts=count;if(count<=2)throw Error('Offline');return db;}});
  await f.flush();assert.equal(attempts,1);assert.equal(f.requests.length,0);
  await f.advance(MINUTE);assert.equal(attempts,2);
  await f.advance(9*MINUTE);assert.equal(attempts,2);
  await f.advance(MINUTE);assert.equal(attempts,3);assert.equal(f.requests.length,1);
  const session=fixture({getSession:(account,count)=>count===1?Promise.reject(Error('Offline')):
    Promise.resolve({data:{session:{user:account.user}}})});
  await session.flush();assert.equal(session.requests.length,0);
  session.hidden(true);await session.advance(20*MINUTE);assert.equal(session.requests.length,0);
  session.hidden(false);await session.flush();assert.equal(session.requests.length,1,'returning retries a failed initial session read');
});

test('v2 summaries restore after current account consent, ignoring another account local choice; old forecast summaries are discarded',async()=>{
  let release;
  const f=fixture({saved:now=>({kind:'rain',expiresAt:now+MINUTE}),fetcher:(_url,_options,now)=>new Promise(resolve=>release=()=>resolve(Response.json({kind:'snow',expiresAt:now+10*MINUTE})))});
  f.local.set('ojjuda:location-choice',JSON.stringify({accountId:'another',enabled:false}));
  await f.flush();assert.equal(f.parent.applied.at(-1),'rain');release();await f.flush();assert.equal(f.parent.applied.at(-1),'snow');
  const off=fixture({enabled:false,saved:now=>({kind:'snow',expiresAt:now+MINUTE})});await off.flush();
  assert.equal(off.parent.applied.at(-1),null);assert.equal(off.sessions.has(KEY),false);
  const denied=fixture({permission:'denied',saved:now=>({kind:'snow',expiresAt:now+MINUTE})});await denied.flush();
  assert.equal(denied.parent.applied.at(-1),null);assert.equal(denied.sessions.has(KEY),false);
  const legacy=fixture({legacy:true,saved:now=>({kind:'rain',expiresAt:now+MINUTE}),
    fetcher:(_url,_options,now)=>new Promise(resolve=>release=()=>resolve(Response.json({kind:'snow',expiresAt:now+10*MINUTE})))});
  await legacy.flush();assert.equal(legacy.sessions.has('ojjuda:theme-weather:v1'),false);
  assert.equal(legacy.parent.applied.at(-1),null,'the previous forecast provider summary is never restored');
  release();await legacy.flush();assert.equal(legacy.parent.applied.at(-1),'snow');
});

test('missing configuration and stale grid results never request weather',async()=>{
  const missing=fixture();delete missing.parent.context.OJJUDA_CONFIG;await missing.flush();
  assert.equal(missing.fixes(),0);assert.equal(missing.requests.length,0);
  const stale=fixture({readCell:(_options,now)=>({nx:60,ny:127,capturedAt:now-120001})});await stale.flush();
  assert.equal(stale.requests.length,0);assert.equal(stale.parent.applied.at(-1),null);
});
