/* Shared location acquisition and the member's Park/Pajang preference. */
(function(root){
'use strict';
if(root.OjjudaLocation)return;
const notices = {
  disabled:'위치가 꺼져 있어요. 공원이나 파장에서 위치를 켜 주세요.',
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
function positionFrom(position) {
  const {latitude,longitude,accuracy}=position.coords||{};
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||!Number.isFinite(accuracy)||
      Math.abs(latitude)>90||Math.abs(longitude)>180||accuracy<0||accuracy>2000)return null;
  return {latitude,longitude,accuracy,capturedAt:Number.isFinite(position.timestamp)?position.timestamp:Date.now()};
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

async function measurePosition({signal,onProgress,fresh=false,preciseTimeout=20000}={}) {
  if(!navigator.geolocation||globalThis.isSecureContext===false)throw failure('unsupported');
  onProgress?.('위치를 확인하고 있어요.');
  try {
    return await locate(navigator.geolocation,{signal,precise:false,timeout:4000,fresh});
  }catch(error){
    if(error.name==='AbortError'||error.code==='denied'||error.code==='disabled')throw error;
  }
  onProgress?.('더 정확한 위치를 확인하고 있어요.');
  return locate(navigator.geolocation,{signal,precise:true,timeout:preciseTimeout,fresh:true});
}

const preferences=new Map(),listeners=new Map(),active=new Map();
let host=root;
try{if(root.top&&root.location?.origin&&root.top.location.origin===root.location.origin)host=root.top;}catch{}
// Weather only reuses a location that a feature has already obtained with consent.
// Never persist the weather cell or include account identifiers in this event.
function notifyWeather(position){
  const target=typeof host.dispatchEvent==='function'?host:root;
  if(typeof target.dispatchEvent!=='function'||typeof target.CustomEvent!=='function')return;
  const detail=position&&freshPosition(position)?{
    latitude:Math.round(position.latitude*10)/10,
    longitude:Math.round(position.longitude*10)/10,
    capturedAt:position.capturedAt
  }:null;
  target.dispatchEvent(new target.CustomEvent('ojjuda:weather-location',{detail}));
}
const memory=host.__ojjudaLocationMemory||(host.__ojjudaLocationMemory=new Map());
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
  if(!next.enabled)notifyWeather(null);
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
    notifyWeather(null);
    throw Error('회원 정보를 다시 확인해 주세요.');
  }
}
async function preference(db,accountId,{refresh=false,legacyDisabled=false}={}){
  if(!accountId)return {enabled:true,version:0};
  await verifyAccount(db,accountId);
  const cached=preferences.get(accountId);
  if(!refresh&&!legacyDisabled&&cached&&Date.now()-cached.checkedAt<5000)return cached;
  const {data,error}=await db.rpc('ojjuda_location_preference',{p_account_id:accountId,p_legacy_disabled:legacyDisabled});
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
function freshPosition(value){
  return value&&Number.isFinite(value.capturedAt)&&Date.now()>=value.capturedAt&&Date.now()-value.capturedAt<120000&&
    Number.isFinite(value.latitude)&&Math.abs(value.latitude)<=90&&Number.isFinite(value.longitude)&&Math.abs(value.longitude)<=180&&
    Number.isFinite(value.accuracy)&&value.accuracy>=0&&value.accuracy<=2000;
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
  try{if((await navigator.permissions?.query({name:'geolocation'}))?.state!=='granted'){clearPosition(accountId);notifyWeather(null);return null;}}catch{return null;}
  let value=memory.get(accountId);
  if(!freshPosition(value)&&coarseCache){try{value=JSON.parse(sessionStorage.getItem(cachePrefix+accountId));}catch{}}
  if(freshPosition(value))return {...value};
  clearPosition(accountId);return null;
}
async function readPosition({db,accountId,allowDisabled=false,coarseCache=false,cache=true,...options}={}){
  if(db&&accountId){
    const choice=await preference(db,accountId);
    if(!choice.enabled&&!allowDisabled)throw failure('disabled');
  }
  if(options.signal?.aborted)throw options.signal.reason;
  if(cache&&!options.fresh){
    const cached=await cachedPosition(accountId,coarseCache);
    if(cached){
      if(db&&accountId)await verifyAccount(db,accountId);
      if(options.signal?.aborted)throw options.signal.reason;
      if(!allowDisabled&&preferences.get(accountId)?.enabled===false)throw failure('disabled');
      if(preferences.get(accountId)?.enabled!==false)notifyWeather(cached);
      return cached;
    }
  }
  const controller=new AbortController();
  const cancel=()=>controller.abort(options.signal.reason);
  options.signal?.addEventListener('abort',cancel,{once:true});
  if(!active.has(accountId))active.set(accountId,new Set());
  active.get(accountId).add(controller);
  try{
    if(options.signal?.aborted)cancel();
    const position=await measurePosition({...options,signal:controller.signal});
    if(db&&accountId)await verifyAccount(db,accountId);
    if(controller.signal.aborted)throw controller.signal.reason;
    if(cache)rememberPosition(accountId,position);
    if(preferences.get(accountId)?.enabled!==false)notifyWeather(position);
    return position;
  }catch(error){
    if(error?.code==='denied'||error?.code==='disabled')notifyWeather(null);
    throw error;
  }finally{controller.abort();active.get(accountId).delete(controller);options.signal?.removeEventListener('abort',cancel);}
}
function forget(accountId){
  notifyWeather(null);
  clearPosition(accountId);preferences.delete(accountId);
  for(const controller of active.get(accountId)||[])controller.abort();
}
root.OjjudaLocation={readPosition,preference,setPreference,acceptPreference,subscribe,observe,forget,
  current:accountId=>preferences.get(accountId),errorText:error=>error?.message||notices.unavailable};
})(globalThis);
