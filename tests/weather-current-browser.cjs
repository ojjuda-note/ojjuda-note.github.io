// Exercise native Chromium permission/geolocation through the real location,
// weather and theme scripts. Only account data and the weather HTTP response are fixtures.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright');
const origin='https://weather-current.test',root=path.resolve(__dirname,'..');
const endpoint='https://ziezbdjofcugznowiuda.supabase.co/functions/v1/theme-weather';
const minute=60000,refresh=10*minute+100;
const firstPosition={latitude:37.5665,longitude:126.978,accuracy:30};
const movedPosition={latitude:35.1796,longitude:129.0756,accuracy:30};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function until(label,read,accept){
  const deadline=Date.now()+10000;let value;
  while(Date.now()<deadline){
    value=await read();
    if(accept(value))return value;
    await sleep(25);
  }
  assert.fail(label+': '+JSON.stringify(value));
}

async function setPermission(context,page,setting){
  const target=await context.newCDPSession(page);let browserContextId;
  try{
    const {targetInfo}=await target.send('Target.getTargetInfo');
    browserContextId=targetInfo.browserContextId;
  }finally{await target.detach();}
  assert.ok(browserContextId,'the test uses an isolated browser context');
  const session=await context.browser().newBrowserCDPSession();
  try{
    await session.send('Browser.setPermission',{permission:{name:'geolocation'},setting,
      origin,browserContextId});
  }finally{await session.detach();}
}

async function visibility(page,hidden){
  // Headless tabs do not reliably become hidden. Simulate this lifecycle input
  // on a real document; permission state and position acquisition remain native.
  await page.evaluate(hidden=>{
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>hidden?'hidden':'visible'});
    document.dispatchEvent(new Event('visibilitychange'));
    if(!hidden)window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
  },hidden);
}

async function snapshot(page){
  return page.evaluate(()=>{
    const surfaces=[window,...[...document.querySelectorAll('iframe')].map(frame=>frame.contentWindow)];
    return {
      surfaces:surfaces.map(surface=>({ready:!!surface.document.documentElement&&!!surface.OjjudaWeather,
        kind:surface.document.documentElement?.dataset.worldWeather||null,
        theme:surface.document.documentElement?.dataset.worldTheme,
        background:surface.document.body?surface.getComputedStyle(surface.document.body).backgroundColor:null})),
      state:window.OjjudaWeather?.getState(),
      gps:{...window.__weatherNative,activeWatches:[...window.__weatherNative.activeWatches]},
      authReads:window.__weatherFixture.authReads,preferenceReads:window.__weatherFixture.preferenceReads,
      summaries:Object.keys(sessionStorage).filter(key=>key.startsWith('ojjuda:theme-weather:'))
        .map(key=>({key,value:JSON.parse(sessionStorage.getItem(key))}))
    };
  });
}

async function waitWeather(fixture,kind,count=1){
  return until('weather '+kind+' after '+count+' requests',()=>snapshot(fixture.page),value=>
    fixture.requests.length>=count&&value.surfaces.every(surface=>surface.ready&&surface.kind===kind)&&value.state?.kind===kind);
}

async function fixture(browser,assets,{permission='granted',enabled=true,signedIn=true,kind='snow',hold=false}={}){
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'ko-KR',geolocation:firstPosition});
  if(permission==='granted')await context.grantPermissions(['geolocation'],{origin});
  await context.addInitScript(({enabled,signedIn})=>{
    const native=navigator.geolocation,stats={gets:0,watches:0,clears:0,options:[],activeWatches:new Set(),weatherAborts:0};
    window.__weatherNative=stats;
    // Chromium's emulated positions retain wall-clock timestamps. Align only
    // that timestamp with Playwright's clock; coordinates still come from Chromium.
    const stamp=callback=>position=>callback({coords:position.coords,timestamp:Date.now()});
    const get=native.getCurrentPosition.bind(native),watch=native.watchPosition.bind(native),clear=native.clearWatch.bind(native);
    native.getCurrentPosition=(success,error,options)=>{
      stats.gets++;stats.options.push({...options});return get(stamp(success),error,options);
    };
    native.watchPosition=(success,error,options)=>{
      stats.watches++;stats.options.push({...options});const id=watch(stamp(success),error,options);
      stats.activeWatches.add(id);return id;
    };
    native.clearWatch=id=>{stats.clears++;stats.activeWatches.delete(id);return clear(id);};
    const fetch=window.fetch.bind(window);
    window.fetch=(input,options)=>{
      if(String(input).includes('/functions/v1/theme-weather'))options?.signal?.addEventListener('abort',()=>stats.weatherAborts++,{once:true});
      return fetch(input,options);
    };
    if(window!==window.top){
      window.OJJUDA_CONFIG=window.top.OJJUDA_CONFIG;
      window.OjjudaGetClient=window.top.OjjudaGetClient;
      return;
    }
    const account='weather-browser-member',callbacks=new Set();
    let session=signedIn?{user:{id:account,is_anonymous:false}}:null,choice={enabled,version:0};
    const state=window.__weatherFixture={authReads:0,preferenceReads:0};
    const result=value=>{const query=Promise.resolve(value);query.abortSignal=()=>query;return query;};
    const db={auth:{
      async getSession(){state.authReads++;return {data:{session},error:null};},
      onAuthStateChange(callback){
        callbacks.add(callback);queueMicrotask(()=>{if(callbacks.has(callback))callback('INITIAL_SESSION',session);});
        return {data:{subscription:{unsubscribe(){callbacks.delete(callback);}}}};
      }
    },rpc(name,args){
      if(name!=='ojjuda_location_preference'||args.p_account_id!==account)throw Error('Unexpected account/preference request');
      state.preferenceReads++;
      if(typeof args.p_enabled==='boolean'){
        if(args.p_expected_version!==choice.version)return result({error:{code:'PT412',message:'Stale preference'}});
        choice={enabled:args.p_enabled,version:choice.version+1};
      }
      return result({data:{...choice},error:null});
    }};
    state.setEnabled=enabled=>window.OjjudaLocation.setPreference(db,account,enabled,choice.version);
    state.logout=()=>{session=null;for(const callback of callbacks)callback('SIGNED_OUT',null);};
    window.OJJUDA_CONFIG={supabaseUrl:'https://ziezbdjofcugznowiuda.supabase.co',supabaseKey:'sb_publishable_weather_browser_fixture'};
    window.OjjudaGetClient=async()=>db;
  },{enabled,signedIn});
  const page=await context.newPage();
  await page.clock.install({time:new Date('2026-11-19T03:15:00Z')});
  if(permission==='denied')await setPermission(context,page,'denied');
  const requests=[],errors=[],gates=new Set();let responseKind=kind,responseHold=hold,finished=0;
  const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'apikey, accept'};
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin+url.pathname===endpoint){
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
      assert.equal(request.method(),'GET');
      assert.deepEqual([...url.searchParams.keys()].sort(),['nx','ny'],'only the KMA grid goes to the weather proxy');
      assert.ok(/^\d+$/.test(url.searchParams.get('nx'))&&/^\d+$/.test(url.searchParams.get('ny')),'integer grid coordinates');
      const headers=await request.allHeaders();
      assert.equal(headers.apikey,'sb_publishable_weather_browser_fixture');assert.equal(headers.authorization,undefined);
      const entry={nx:Number(url.searchParams.get('nx')),ny:Number(url.searchParams.get('ny')),kind:responseKind};
      requests.push(entry);
      if(responseHold)await new Promise(resolve=>gates.add(resolve));
      try{
        const now=await page.evaluate(()=>Date.now());
        await route.fulfill({contentType:'application/json',headers:cors,body:JSON.stringify({kind:entry.kind,expiresAt:now+10*minute})});
      }catch(error){
        // Cancellation is an expected outcome of the interruption cases below.
        if(!responseHold)throw error;
      }finally{finished++;}
      return;
    }
    if(url.origin!==origin)return route.abort();
    if(['/','/park/','/pajang/'].includes(url.pathname))return route.fulfill({contentType:'text/html',body:`<!doctype html>
      <html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <link rel="stylesheet" href="/app/world/world-themes.css">
      <style>body{margin:0;padding:20px;background:var(--bg);color:var(--ink)}button{background:var(--accent);color:var(--on-accent)}iframe{width:100%;height:140px;border:0}</style>
      <script src="/shared/location/location.js" defer></script><script src="/app/world/world-themes.js" defer></script>
      <script src="/app/world/world-weather.js" defer></script></head><body><h1>${url.pathname==='/'?'아지트':url.pathname==='/park/'?'공원':'파장'}</h1><button>현재 날씨</button></body></html>`});
    const body=assets.get(url.pathname);
    if(body)return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body});
    return route.abort();
  });
  page.on('pageerror',error=>errors.push(error.message));
  const item={context,page,requests,errors,
    setKind(value){responseKind=value;},
    release(){for(const resolve of gates)resolve();gates.clear();},
    finished:()=>finished,
    async close(){item.release();await context.close();}
  };
  await page.goto(origin+'/',{waitUntil:'load'});
  return item;
}

(async()=>{
  const names=['/shared/location/location.js','/app/world/world-themes.js','/app/world/world-themes.css','/app/world/world-weather.js'];
  const assets=new Map(await Promise.all(names.map(async name=>[name,await fs.readFile(path.join(root,name))])));
  const browser=await chromium.launch();let active;
  try{
    active=await fixture(browser,assets);const f=active;
    const snowy=await waitWeather(f,'snow');
    assert.deepEqual(f.requests[0],{nx:60,ny:127,kind:'snow'},'the native fixture position reaches its KMA grid');
    assert.ok(snowy.gps.watches+snowy.gps.gets>=1,'startup reads an allowed current position without a feature event');
    assert.equal(snowy.gps.activeWatches.length,0,'the position watcher stops after its first usable fix');
    assert.ok(snowy.gps.options.every(options=>options.enableHighAccuracy===false),'weather never escalates to precise GPS');
    await f.page.evaluate(()=>{
      for(const section of ['park','pajang']){const frame=document.createElement('iframe');frame.src='/'+section+'/';document.body.append(frame);}
    });
    await until('all three weather surfaces',()=>snapshot(f.page),value=>value.surfaces.length===3&&value.surfaces.every(surface=>surface.ready&&surface.kind==='snow'));
    assert.equal(f.requests.length,1,'same-origin sections share one coordinator request');
    const summaries=(await snapshot(f.page)).summaries;
    assert.equal(summaries.length,1,'the successful current weather summary survives navigation');
    for(const {value} of summaries)assert.deepEqual(Object.keys(value).sort(),['expiresAt','kind'],'the stored weather summary has no location');
    const backgrounds=[snowy.surfaces[0].background];
    for(const kind of ['rain',null]){
      f.setKind(kind);const count=f.requests.length+1;
      await f.page.clock.runFor(refresh);const changed=await waitWeather(f,kind,count);
      assert.equal(f.requests.length,count,'one weather request per refresh');
      backgrounds.push(changed.surfaces[0].background);
      assert.ok(changed.surfaces.every(surface=>surface.theme==='autumn'),'current weather preserves the calendar date');
    }
    assert.equal(new Set(backgrounds).size,3,'snow, rain and stopped precipitation change the rendered palette');
    await visibility(f.page,true);const hiddenCalls=f.requests.length,hiddenGps=(await snapshot(f.page)).gps.watches;
    await f.context.setGeolocation(movedPosition);f.setKind('snow');
    await f.page.clock.runFor(30*minute);
    assert.equal(f.requests.length,hiddenCalls,'hidden pages do not fetch weather');
    assert.equal((await snapshot(f.page)).gps.watches,hiddenGps,'hidden pages do not start location watches');
    await visibility(f.page,false);await waitWeather(f,'snow',hiddenCalls+1);
    assert.equal(f.requests.length,hiddenCalls+1,'visibility and pageshow share the same resumed request');
    assert.notDeepEqual([f.requests.at(-1).nx,f.requests.at(-1).ny],[60,127],'resume obtains the moved position instead of retaining the old grid');
    for(let cycle=0;cycle<4;cycle++){
      const count=f.requests.length+1;
      await f.page.clock.runFor(refresh);await waitWeather(f,'snow',count);
      assert.equal(f.requests.length,count,'continuous use does not duplicate refreshes');
    }
    assert.deepEqual(f.errors,[]);
    console.log('PASS native current location -> KMA grid -> snow/rain/clear across three surfaces; moved resume and updates beyond 30 minutes');
    await f.close();active=null;

    for(const mode of ['prompt','denied','disabled','signed-out']){
      active=await fixture(browser,assets,{permission:['prompt','denied'].includes(mode)?mode:'granted',enabled:mode!=='disabled',signedIn:mode!=='signed-out'});
      const denied=active;
      await until(mode+' startup settles',()=>snapshot(denied.page),value=>value.authReads>0&&value.surfaces.every(surface=>surface.ready));
      await sleep(100);await denied.page.clock.runFor(refresh);await sleep(100);
      const state=await snapshot(denied.page);
      assert.equal(state.gps.gets+state.gps.watches,0,mode+' never requests location or prompts');
      assert.equal(denied.requests.length,0,mode+' never requests weather');
      assert.equal(state.state.kind,null);assert.deepEqual(denied.errors,[]);
      if(mode==='prompt'||mode==='denied')assert.equal(await denied.page.evaluate(async()=>(await navigator.permissions.query({name:'geolocation'})).state),mode);
      await denied.close();active=null;
    }
    console.log('PASS prompt/denied browser permission, disabled preference and signed-out entry make zero location requests');

    for(const reason of ['off','denied','logout','hidden']){
      active=await fixture(browser,assets,{hold:true});const pending=active;
      await until(reason+' waits for weather',async()=>pending.requests.length,value=>value===1);
      const before=await snapshot(pending.page);
      if(reason==='off')await pending.page.evaluate(()=>window.__weatherFixture.setEnabled(false));
      else if(reason==='denied')await setPermission(pending.context,pending.page,'denied');
      else if(reason==='logout')await pending.page.evaluate(()=>window.__weatherFixture.logout());
      else await visibility(pending.page,true);
      await until(reason+' cancels pending weather',()=>snapshot(pending.page),value=>value.gps.weatherAborts>=1&&value.state?.kind===null);
      pending.release();await until(reason+' late response finishes',async()=>pending.finished(),value=>value===1);
      await pending.page.clock.runFor(20*minute);await sleep(50);
      const state=await snapshot(pending.page);
      assert.equal(state.state.kind,null,reason+' cannot revive a stale snow response');
      assert.ok(state.surfaces.every(surface=>surface.kind===null));
      assert.equal(pending.requests.length,1,reason+' removes automatic retry timers');
      assert.equal(state.gps.gets+state.gps.watches,before.gps.gets+before.gps.watches,reason+' does not restart GPS');
      assert.equal(state.gps.activeWatches.length,0);assert.deepEqual(pending.errors,[]);
      await pending.close();active=null;
    }
    console.log('PASS off/denied/logout/hidden abort pending weather, discard late snow and stop background retries');
  }catch(error){
    if(active)console.error('CURRENT_WEATHER_DIAGNOSTICS',JSON.stringify({requests:active.requests,errors:active.errors,state:await snapshot(active.page).catch(()=>null)}));
    throw error;
  }finally{if(active)await active.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
