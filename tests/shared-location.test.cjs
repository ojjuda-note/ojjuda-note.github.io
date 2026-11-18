const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../shared/location/location.js'),'utf8');
const settle=()=>new Promise(setImmediate);
const storage=map=>({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)});

test('Park and Pajang reuse a recent fix and share off/on without reusing revoked or stale locations',async()=>{
  const sessions=new Map(),settings=new Map(),channels=new Set(),host={location:{origin:'https://ojjuda.test'}};
  class Channel{
    constructor(){channels.add(this);}unref(){}
    postMessage(data){for(const peer of channels)if(peer!==this)queueMicrotask(()=>peer.onmessage?.({data:structuredClone(data)}));}
  }
  function page(owner='member',top=host){
    const state={calls:0,mode:'ok',permission:'granted'};
    const document=new EventTarget();document.hidden=false;
    const db={auth:{getSession:async()=>({data:{session:{user:{id:owner}}}})},rpc:async(name,args)=>{
      assert.equal(name,'ojjuda_location_preference');assert.equal(args.p_account_id,owner);
      let choice=settings.get(owner)||{enabled:true,version:0};
      if(typeof args.p_enabled==='boolean'){
        if(args.p_expected_version!==choice.version)return {error:{code:'PT412',message:'stale'}};
        choice={enabled:args.p_enabled,version:choice.version+1};settings.set(owner,choice);
      }
      return {data:choice};
    }};
    const context=vm.createContext({console,Map,Set,Error,DOMException,AbortController,Date,Number,JSON,Promise,
      setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask,BroadcastChannel:Channel,document,
      location:{origin:'https://ojjuda.test'},top,sessionStorage:storage(sessions),localStorage:storage(new Map()),addEventListener(){},
      navigator:{permissions:{query:async()=>({state:state.permission})},geolocation:{
        getCurrentPosition(ok,fail){state.calls++;if(state.mode==='hold'){state.late=ok;return;}
          if(state.mode==='deny'){fail({code:1});return;}ok({coords:{latitude:37.5665,longitude:126.978,accuracy:30},timestamp:Date.now()});},
        watchPosition(){throw Error('a good fix must not retry');},clearWatch(){}
      }}});
    vm.runInContext(source,context);
    return {state,api:context.OjjudaLocation,read:options=>context.OjjudaLocation.readPosition({db,accountId:owner,...options}),
      pref:()=>context.OjjudaLocation.preference(db,owner,{refresh:true}),
      set:async enabled=>{const p=await context.OjjudaLocation.preference(db,owner,{refresh:true});return context.OjjudaLocation.setPreference(db,owner,enabled,p.version);}};
  }
  const park=page(),pajang=page();
  const first=await park.read();assert.equal(park.state.calls,1);
  assert.equal((await pajang.read()).latitude,first.latitude);assert.equal(pajang.state.calls,0,'a sibling frame shares the in-memory fix');
  const persisted=JSON.parse(sessions.get('ojjuda:location-cell:member'));
  assert.equal(persisted.latitude,37.57);assert.equal(persisted.longitude,126.98);
  assert.equal(persisted.accuracy,830,'the rounded point includes its added uncertainty');
  const afterNavigation=page('member',{location:{origin:'https://ojjuda.test'}});
  assert.equal((await afterNavigation.read({coarseCache:true})).latitude,37.57);assert.equal(afterNavigation.state.calls,0);
  await park.set(false);await settle();
  assert.equal(pajang.api.current('member').enabled,false);assert.equal(sessions.size,0);
  await assert.rejects(pajang.read(),{code:'disabled'});assert.equal(pajang.state.calls,0);
  const reentry=page();assert.equal((await reentry.pref()).enabled,false,'saved off survives a new page');
  await pajang.set(true);await settle();assert.equal(park.api.current('member').enabled,true);
  assert.ok(await park.read());assert.equal(park.state.calls,2,'off clears the previous fix');
  park.state.mode='hold';const pending=park.read({fresh:true});const cancelled=assert.rejects(pending,{code:'disabled'});
  await settle();await pajang.set(false);await cancelled;
  park.state.late({coords:{latitude:38,longitude:128,accuracy:30},timestamp:Date.now()});await settle();
  assert.equal(sessions.size,0,'a late fix cannot restore coordinates after off');
  pajang.api.acceptPreference('member',{enabled:true,version:0});assert.equal(pajang.api.current('member').enabled,false);
  const other=page('another-member');assert.equal((await other.pref()).enabled,true);await other.read();assert.equal(other.state.calls,1);
  await pajang.set(true);pajang.state.mode='ok';await pajang.read({fresh:true});
  pajang.state.permission='denied';pajang.state.mode='deny';
  await assert.rejects(pajang.read(),{code:'denied'});assert.equal(sessions.has('ojjuda:location-cell:member'),false,'revoking browser permission clears the cache');
  pajang.state.permission='granted';pajang.state.mode='ok';await pajang.read({fresh:true});
  host.__ojjudaLocationMemory.clear();
  const old=JSON.parse(sessions.get('ojjuda:location-cell:member'));old.capturedAt=Date.now()-120001;sessions.set('ojjuda:location-cell:member',JSON.stringify(old));
  const expired=page('member',{location:{origin:'https://ojjuda.test'}});await expired.read({coarseCache:true});assert.equal(expired.state.calls,1,'expired cells require a fresh fix');
});
