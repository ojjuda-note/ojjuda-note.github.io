/* Shared location acquisition and the member's Park/Pajang preference. */
(function(root){
'use strict';
if(root.OjjudaLocation)return;
const notices = {
  disabled:'위치가 꺼져 있어요. 공원이나 파장에서 위치를 켜 주세요.',
  guardian:'위치를 이용하려면 보호자의 위치 동의가 필요해요.',
  account:'로그인 상태를 확인한 뒤 위치를 이용해 주세요.',
  prompt:'현재 위치를 사용하려면 위치 확인을 눌러 주세요.',
  denied:'위치 권한이 막혀 있어요. 휴대폰 설정에서 브라우저의 위치 권한과 오쭈다 사이트의 위치 허용을 확인해 주세요.',
  unavailable:'위치 신호를 받지 못했어요. 휴대폰의 위치 기능과 인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
  timeout:'위치 확인 시간이 초과됐어요. 창가나 실외에서 다시 확인해 주세요.',
  inaccurate:'위치 오차가 커요. 정밀 위치를 허용하거나 창가·실외에서 다시 확인해 주세요.',
  unsupported:'이 화면에서는 위치를 사용할 수 없어요. Chrome이나 Safari에서 오쭈다를 직접 열어 주세요.'
};
function failure(code) { return Object.assign(Error(notices[code]),{code}); }
function locationError(error) {
  return failure(error?.code===1||error?.name==='SecurityError'?'denied':error?.code===3?'timeout':'unavailable');
}
function positionFrom(position,maxAccuracy=2000) {
  const {latitude,longitude,accuracy}=position.coords||{};
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||!Number.isFinite(accuracy)||
      Math.abs(latitude)>90||Math.abs(longitude)>180||accuracy<0||accuracy>maxAccuracy)return null;
  return {latitude,longitude,accuracy,capturedAt:Number.isFinite(position.timestamp)?position.timestamp:Date.now(),
    ...(Number.isFinite(position.coords.speed)&&position.coords.speed>=0?{speed:position.coords.speed}:{})};
}
function locate(geo,{signal,precise,timeout,fresh}) {
  return new Promise((resolve,reject)=>{
    let done=false,watchId=null,timer;
    let lastError=failure('timeout');
    function finish(error,cell) {
      if(done)return;
      done=true;clearTimeout(timer);
      if(watchId!==null)geo.clearWatch(watchId);
      signal?.removeEventListener('abort',cancel);
      error?reject(error):resolve(cell);
    }
    function cancel(){finish(signal?.reason instanceof Error?signal.reason:new DOMException('위치 확인을 취소했어요.','AbortError'));}
    if(signal?.aborted){cancel();return;}
    signal?.addEventListener('abort',cancel,{once:true});
    function success(position) {
      const cell=positionFrom(position);
      if(cell){finish(null,cell);return;}
      lastError=failure('inaccurate');
      if(!precise)finish(lastError);
    }
    function error(reason) {
      lastError=locationError(reason);
      if(!precise||lastError.code==='denied')finish(lastError);
    }
    const options={enableHighAccuracy:precise,timeout,maximumAge:precise||fresh?0:30000};
    try {
      if(precise) {
        // A first coarse fix can improve. Stop as soon as one usable fix arrives.
        timer=setTimeout(()=>finish(lastError),timeout);
        watchId=geo.watchPosition(success,error,options);
        if(done)geo.clearWatch(watchId);
      }else geo.getCurrentPosition(success,error,options);
    }catch(reason){finish(locationError(reason));}
  });
}

async function measurePosition({signal,onProgress,fresh=false,preciseTimeout=20000,automatic=false},authorize) {
  if(!navigator.geolocation||globalThis.isSecureContext===false)throw failure('unsupported');
  async function beforeGPS(){
    await authorize();
    if(automatic){
      let permission;
      try { permission=await navigator.permissions?.query({name:'geolocation'}); } catch {}
      if(permission?.state!=='granted')throw failure(permission?.state==='denied'?'denied':'prompt');
    }
    if(signal?.aborted)throw signal.reason;
  }
  await beforeGPS();
  onProgress?.('위치를 확인하고 있어요.');
  try {
    return await locate(navigator.geolocation,{signal,precise:false,timeout:4000,fresh});
  }catch(error){
    if(error.name==='AbortError'||error.code==='denied'||error.code==='disabled')throw error;
  }
  await beforeGPS();
  onProgress?.('더 정확한 위치를 확인하고 있어요.');
  return locate(navigator.geolocation,{signal,precise:true,timeout:preciseTimeout,fresh:true});
}

const preferences=new Map(),listeners=new Map(),active=new Map();
let host=root;
try{if(root.top&&root.location?.origin&&root.top.location.origin===root.location.origin)host=root.top;}catch{}
// KMA's official DFS Lambert projection, 5 km grid. Raw weather coordinates
// never leave this service or enter storage.
// https://www.weather.go.kr/w/resources/js/app-2021/app-index.js (convertDfsGrid)
function weatherCell(position){
  if(!freshPosition(position,5000))return null;
  return weatherGrid(position);
}
function weatherGrid(position){
  if(!Number.isFinite(position?.latitude)||Math.abs(position.latitude)>=90||
     !Number.isFinite(position.longitude)||Math.abs(position.longitude)>180)return null;
  const rad=Math.PI/180,re=6371.00877/5,lat1=30*rad,lat2=60*rad;
  const sn=Math.log(Math.cos(lat1)/Math.cos(lat2))/Math.log(Math.tan(Math.PI/4+lat2/2)/Math.tan(Math.PI/4+lat1/2));
  const sf=Math.pow(Math.tan(Math.PI/4+lat1/2),sn)*Math.cos(lat1)/sn;
  const ro=re*sf/Math.pow(Math.tan(Math.PI/4+38*rad/2),sn);
  const ra=re*sf/Math.pow(Math.tan(Math.PI/4+position.latitude*rad/2),sn);
  let theta=(position.longitude-126)*rad;
  if(theta>Math.PI)theta-=2*Math.PI;if(theta< -Math.PI)theta+=2*Math.PI;
  theta*=sn;
  const nx=Math.floor(ra*Math.sin(theta)+43.5),ny=Math.floor(ro-ra*Math.cos(theta)+136.5);
  return nx>=1&&nx<=149&&ny>=1&&ny<=253?{nx,ny,capturedAt:position.capturedAt}:null;
}
// Existing feature reads also supply the current grid, without account details.
function notifyWeather(position,accountId){
  const target=typeof host.dispatchEvent==='function'?host:root;
  if(typeof target.dispatchEvent!=='function'||typeof target.CustomEvent!=='function')return;
  // A late settings/teardown callback from another account cannot cancel the
  // current member's weather. The account identifier never enters the event.
  if(!position&&accountId&&target.__ojjudaThemeWeather?.isAccount&&!target.__ojjudaThemeWeather.isAccount(accountId))return;
  const detail=weatherCell(position);
  target.dispatchEvent(new target.CustomEvent('ojjuda:weather-location',{detail}));
}
const memory=host.__ojjudaLocationMemory||(host.__ojjudaLocationMemory=new Map());
const featureReads=host.__ojjudaLocationReads||(host.__ojjudaLocationReads=new Map());
const signalKey='ojjuda:location-choice',cachePrefix='ojjuda:location-cell:';
let channel;
try{channel=typeof BroadcastChannel==='function'?new BroadcastChannel('ojjuda-location'):null;}catch{}
channel?.unref?.();
function clearPosition(accountId){
  memory.delete(accountId);
  try{sessionStorage.removeItem(cachePrefix+accountId);}catch{}
}
function acceptPreference(accountId,value,broadcast=false){
  if(!accountId||typeof value?.enabled!=='boolean'||!Number.isSafeInteger(value.version)||value.version<0)return;
  const previous=preferences.get(accountId);
  if(previous&&previous.version>value.version)return previous;
  const next={enabled:value.enabled,version:value.version,checkedAt:Date.now()};
  preferences.set(accountId,next);
  const changed=!previous||previous.version!==next.version||previous.enabled!==next.enabled;
  if(!next.enabled)notifyWeather(null,accountId);
  if(changed&&!next.enabled){
    clearPosition(accountId);
    for(const controller of active.get(accountId)||[])controller.abort(failure('disabled'));
  }
  if(changed)for(const listener of listeners.get(accountId)||[])listener(next);
  if(broadcast&&changed){
    const message={accountId,enabled:next.enabled,version:next.version};
    channel?.postMessage(message);
    try{localStorage.setItem(signalKey,JSON.stringify(message));}catch{}
  }
  return next;
}
function received(value){if(value?.accountId)acceptPreference(value.accountId,value);}
if(channel)channel.onmessage=event=>received(event.data);
root.addEventListener?.('storage',event=>{if(event.key===signalKey){try{received(JSON.parse(event.newValue));}catch{}}});
async function verifyAccount(db,accountId){
  const {data,error}=await db.auth.getSession();
  if(error||data.session?.user?.id!==accountId||data.session?.user?.is_anonymous){
    throw Error('회원 정보를 다시 확인해 주세요.');
  }
  return data.session.user;
}
const parkSurface=()=>/^\/(?:park|note)(?:\/|$)/.test(root.location?.pathname||'');
async function authorizePosition(db,accountId,{park=parkSurface(),weather=false,signal}={}){
  if(signal?.aborted)throw signal.reason;
  if(!db||!accountId){
    if(park)throw failure('account');
    return;
  }
  const user=await verifyAccount(db,accountId);
  const junior=user.app_metadata?.park_guardian_account===true||user.role==='park_junior';
  if(junior&&(weather||!park))throw failure('disabled');
  if(park||junior){
    const request=db.rpc('park_guardian_location_allowed');
    const {data,error}=await (signal&&request.abortSignal?request.abortSignal(signal):request);
    if(error||data!==true){
      clearPosition(accountId);notifyWeather(null,accountId);
      throw error?Error('위치 동의를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.'):failure('guardian');
    }
    await verifyAccount(db,accountId);
  }
  if(signal?.aborted)throw signal.reason;
  return {junior};
}
async function preference(db,accountId,{refresh=false,legacyDisabled=false,signal}={}){
  if(!accountId)return {enabled:true,version:0};
  await verifyAccount(db,accountId);
  const cached=preferences.get(accountId);
  if(!refresh&&!legacyDisabled&&cached&&Date.now()-cached.checkedAt<5000)return cached;
  const query=db.rpc('ojjuda_location_preference',{p_account_id:accountId,p_legacy_disabled:legacyDisabled});
  const {data,error}=await (signal&&query.abortSignal?query.abortSignal(signal):query);
  if(signal?.aborted)throw signal.reason;
  if(error)throw Object.assign(Error(error.message||'위치 설정을 확인하지 못했어요.'),{code:error.code});
  await verifyAccount(db,accountId);
  const next=acceptPreference(accountId,data,true);
  if(!next)throw Error('위치 설정을 확인하지 못했어요. 다시 시도해 주세요.');
  return next;
}
async function setPreference(db,accountId,enabled,version){
  await verifyAccount(db,accountId);
  const {data,error}=await db.rpc('ojjuda_location_preference',{
    p_account_id:accountId,p_enabled:enabled,p_expected_version:version
  });
  if(error){if(error.code==='PT412')await preference(db,accountId,{refresh:true});throw Object.assign(Error(error.message),{code:error.code});}
  await verifyAccount(db,accountId);
  return acceptPreference(accountId,data,true);
}
function subscribe(accountId,callback){
  if(!listeners.has(accountId))listeners.set(accountId,new Set());
  listeners.get(accountId).add(callback);
  if(preferences.has(accountId))callback(preferences.get(accountId));
  return()=>{listeners.get(accountId)?.delete(callback);};
}
function observe(db,accountId,callback){
  const unsubscribe=subscribe(accountId,callback);
  let closed=false,checking=false;
  const refresh=async()=>{
    if(closed||checking||root.document?.hidden)return;
    checking=true;
    try{await preference(db,accountId,{refresh:true});}catch{}finally{checking=false;}
  };
  const timer=setInterval(refresh,12000);
  root.document?.addEventListener('visibilitychange',refresh);void refresh();
  return()=>{closed=true;clearInterval(timer);unsubscribe();root.document?.removeEventListener('visibilitychange',refresh);};
}
function freshPosition(value,maxAccuracy=2000){
  return value&&Number.isFinite(value.capturedAt)&&Date.now()>=value.capturedAt&&Date.now()-value.capturedAt<120000&&
    Number.isFinite(value.latitude)&&Math.abs(value.latitude)<=90&&Number.isFinite(value.longitude)&&Math.abs(value.longitude)<=180&&
    Number.isFinite(value.accuracy)&&value.accuracy>=0&&value.accuracy<=maxAccuracy;
}
function rememberPosition(accountId,position){
  if(!accountId||!freshPosition(position))return;
  memory.set(accountId,position);
  // Only a coarse cell survives navigation; exact coordinates stay in page memory.
  try{sessionStorage.setItem(cachePrefix+accountId,JSON.stringify({
    latitude:Math.round(position.latitude*100)/100,longitude:Math.round(position.longitude*100)/100,
    accuracy:position.accuracy+800,capturedAt:position.capturedAt
  }));}catch{}
}
async function cachedPosition(accountId,coarseCache){
  if(!accountId)return null;
  try{if((await navigator.permissions?.query({name:'geolocation'}))?.state!=='granted'){clearPosition(accountId);notifyWeather(null,accountId);return null;}}catch{return null;}
  let value=memory.get(accountId);
  if(!freshPosition(value)&&coarseCache){try{value=JSON.parse(sessionStorage.getItem(cachePrefix+accountId));}catch{}}
  if(freshPosition(value))return {...value};
  clearPosition(accountId);return null;
}
async function readPosition({db,accountId,allowDisabled=false,coarseCache=false,cache=true,park=parkSurface(),...options}={}){
  const authorize=signal=>authorizePosition(db,accountId,{park,signal});
  if(park&&!accountId)throw failure('account');
  if(db&&accountId){
    const choice=await preference(db,accountId);
    if(!choice.enabled&&!allowDisabled)throw failure('disabled');
  }
  if(options.signal?.aborted)throw options.signal.reason;
  if(cache&&!options.fresh){
    const cached=await cachedPosition(accountId,coarseCache);
    if(cached){
      const permission=await authorize(options.signal);
      if(options.signal?.aborted)throw options.signal.reason;
      if(!allowDisabled&&preferences.get(accountId)?.enabled===false)throw failure('disabled');
      if(!permission?.junior&&preferences.get(accountId)?.enabled!==false)notifyWeather(cached);
      return cached;
    }
  }
  const controller=new AbortController();
  const cancel=()=>controller.abort(options.signal.reason);
  options.signal?.addEventListener('abort',cancel,{once:true});
  if(!active.has(accountId))active.set(accountId,new Set());
  active.get(accountId).add(controller);
  let measured;
  try{
    if(options.signal?.aborted)cancel();
    measured=measurePosition({...options,signal:controller.signal},()=>authorize(controller.signal));
    if(accountId)featureReads.set(accountId,measured);
    const position=await measured;
    const permission=await authorize(controller.signal);
    if(controller.signal.aborted)throw controller.signal.reason;
    if(cache)rememberPosition(accountId,position);
    if(!permission?.junior&&preferences.get(accountId)?.enabled!==false)notifyWeather(position);
    return position;
  }catch(error){
    if(error?.code==='denied'||error?.code==='disabled')notifyWeather(null,accountId);
    throw error;
  }finally{
    if(featureReads.get(accountId)===measured)featureReads.delete(accountId);
    controller.abort();active.get(accountId).delete(controller);options.signal?.removeEventListener('abort',cancel);
  }
}
function weatherPosition(signal,existing){
  return new Promise((resolve,reject)=>{
    let done=false,watchId=null;
    const finish=(error,position)=>{
      if(done)return;done=true;clearTimeout(timer);
      if(watchId!==null)navigator.geolocation.clearWatch(watchId);
      signal.removeEventListener('abort',cancel);
      error?reject(error):resolve(position);
    };
    const cancel=()=>finish(signal.reason||new DOMException('Location cancelled','AbortError'));
    const timer=setTimeout(()=>finish(failure('timeout')),8000);
    if(signal.aborted){cancel();return;}
    signal.addEventListener('abort',cancel,{once:true});
    if(existing){existing.then(position=>finish(null,position),error=>finish(error));return;}
    if(!navigator.geolocation?.watchPosition||root.isSecureContext===false){finish(failure('unsupported'));return;}
    try{
      // A cancellable one-shot, without a high-accuracy fallback or saved fix.
      watchId=navigator.geolocation.watchPosition(position=>{
        const value=positionFrom(position,5000);
        finish(value?null:failure('inaccurate'),value);
      },error=>finish(locationError(error)),{enableHighAccuracy:false,maximumAge:0,timeout:8000});
      if(done)navigator.geolocation.clearWatch(watchId);
    }catch(error){finish(locationError(error));}
  });
}
async function readWeatherPosition({db,accountId,signal,cell}={}){
  if(!db||!accountId)throw failure('disabled');
  const controller=new AbortController(),cancel=()=>controller.abort(signal?.reason);
  let permission;
  const revoked=()=>{if(permission.state!=='granted')controller.abort(failure('denied'));};
  const check=()=>{if(controller.signal.aborted)throw controller.signal.reason;};
  signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  if(!active.has(accountId))active.set(accountId,new Set());active.get(accountId).add(controller);
  try{
    check();
    const choice=await preference(db,accountId,{refresh:true,signal:controller.signal});check();
    if(!choice.enabled)throw failure('disabled');
    permission=await navigator.permissions?.query({name:'geolocation'});check();
    if(permission?.state!=='granted')throw failure('denied');
    permission.addEventListener?.('change',revoked);
    let grid=cell&&Number.isInteger(cell.nx)&&cell.nx>=1&&cell.nx<=149&&Number.isInteger(cell.ny)&&cell.ny>=1&&cell.ny<=253&&
      Number.isFinite(cell.capturedAt)&&cell.capturedAt<=Date.now()&&Date.now()-cell.capturedAt<120000?
      {nx:cell.nx,ny:cell.ny,capturedAt:cell.capturedAt}:null;
    if(!grid){
      await authorizePosition(db,accountId,{weather:true,signal:controller.signal});check();
      const cached=memory.get(accountId);
      const position=freshPosition(cached)?cached:await weatherPosition(controller.signal,featureReads.get(accountId));
      check();grid=weatherCell(position);
      if(!grid)throw failure('unavailable');
    }
    // A settings change while GPS was pending must invalidate its result.
    const latest=await preference(db,accountId,{refresh:true,signal:controller.signal});check();
    if(!latest.enabled||permission.state!=='granted')throw failure(latest.enabled?'denied':'disabled');
    await authorizePosition(db,accountId,{weather:true,signal:controller.signal});check();
    return grid;
  }finally{
    permission?.removeEventListener?.('change',revoked);controller.abort();
    active.get(accountId).delete(controller);signal?.removeEventListener('abort',cancel);
  }
}
function forget(accountId){
  if(!accountId)return;
  notifyWeather(null,accountId);
  clearPosition(accountId);preferences.delete(accountId);
  for(const controller of active.get(accountId)||[])controller.abort();
}
root.OjjudaLocation={readPosition,readWeatherPosition,weatherCell,weatherGrid,
  readGuestPosition:options=>measurePosition(options,()=>{}),
  authorizePosition,preference,setPreference,acceptPreference,subscribe,observe,forget,
  current:accountId=>preferences.get(accountId),errorText:error=>error?.message||notices.unavailable};
})(globalThis);

