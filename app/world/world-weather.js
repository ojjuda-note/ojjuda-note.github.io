/* Rain/snow accents reuse consented, coarse location events; this file never
   requests geolocation. Forecast data: MET Norway (CC BY 4.0), via our proxy. */
(function(root){
'use strict';
if(root.OjjudaWeather)return;
const KEY='ojjuda:theme-weather:v1',LOCATION_EVENT='ojjuda:weather-location';
const ENDPOINT='https://ziezbdjofcugznowiuda.supabase.co/functions/v1/theme-weather';
const MAX_AGE=30*60*1000;
let host=root;
try{if(root.top&&root.location?.origin&&root.top.location.origin===root.location.origin)host=root.top;}catch{}

function createCoordinator(surface){
  const subscribers=new Set();
  let state={kind:null,expiresAt:0},timer=0,pending=null,lastCell='',revision=0;
  function valid(value){
    return value&&(value.kind===null||value.kind==='rain'||value.kind==='snow')&&
      Number.isFinite(value.expiresAt)&&value.expiresAt>Date.now()&&value.expiresAt<=Date.now()+MAX_AGE;
  }
  const snapshot=()=>({...state});
  function apply(value){
    clearTimeout(timer);
    state=valid(value)?{kind:value.kind,expiresAt:value.expiresAt}:{kind:null,expiresAt:0};
    try{if(state.expiresAt)surface.sessionStorage.setItem(KEY,JSON.stringify(state));else surface.sessionStorage.removeItem(KEY);}catch{}
    for(const listener of subscribers)listener(snapshot());
    if(state.expiresAt)timer=setTimeout(()=>apply(null),Math.max(1,state.expiresAt-Date.now()+1));
  }
  function clear(){
    revision++;pending?.controller.abort();pending=null;lastCell='';apply(null);
  }
  function subscribe(listener){
    if(state.expiresAt&&state.expiresAt<=Date.now())apply(null);
    subscribers.add(listener);listener(snapshot());return()=>subscribers.delete(listener);
  }
  async function receive(event){
    const value=event.detail;
    if(value===null){clear();return;}
    if(surface.document?.hidden||!value||!Number.isFinite(value.latitude)||Math.abs(value.latitude)>90||
        !Number.isFinite(value.longitude)||Math.abs(value.longitude)>180||!Number.isFinite(value.capturedAt)||
        value.capturedAt>Date.now()+1000||Date.now()-value.capturedAt>=120000)return;
    // Round again at the network boundary so injected events cannot add precision.
    const lat=(Math.round(value.latitude*10)/10).toFixed(1),lon=(Math.round(value.longitude*10)/10).toFixed(1);
    const cell=lat+','+lon;
    if(pending?.cell===cell)return;
    if(cell===lastCell&&valid(state))return;
    const apiKey=surface.OJJUDA_CONFIG?.supabaseKey;
    if(typeof apiKey!=='string'||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(apiKey)||apiKey.length>256){clear();return;}
    pending?.controller.abort();
    const request=++revision,controller=new AbortController();
    pending={cell,controller};
    if(lastCell&&lastCell!==cell)apply(null);
    const timeout=setTimeout(()=>controller.abort(),7000);
    try{
      const response=await surface.fetch(ENDPOINT+'?lat='+lat+'&lon='+lon,{
        method:'GET',headers:{Accept:'application/json',apikey:apiKey},credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal
      });
      if(!response.ok)throw Error('Weather unavailable');
      const data=await response.json();
      if(!valid(data))throw Error('Expired weather');
      if(request!==revision||controller.signal.aborted)return;
      lastCell=cell;apply(data);
    }catch{
      if(request===revision){lastCell='';apply(null);}
    }finally{
      clearTimeout(timeout);
      if(request===revision)pending=null;
    }
  }
  surface.addEventListener(LOCATION_EVENT,receive);
  // Restoring a summary never restores coordinates or asks for location access.
  let saved;
  try{saved=JSON.parse(surface.sessionStorage.getItem(KEY)||'null');}catch{}
  if(!valid(saved)){try{surface.sessionStorage.removeItem(KEY);}catch{}}
  const initialRevision=revision;
  async function watchPermission(){
    try{
      const permission=await surface.navigator.permissions?.query({name:'geolocation'});
      permission?.addEventListener?.('change',()=>{if(permission.state!=='granted')clear();});
      if(!permission||permission.state!=='granted'){clear();return;}
      const choice=JSON.parse(surface.localStorage.getItem('ojjuda:location-choice')||'null');
      if(choice?.enabled===false){clear();return;}
      if(revision===initialRevision&&valid(saved))apply(saved);
    }catch{/* Without permission evidence, wait for a successful location event. */}
  }
  void watchPermission();
  function visible(){
    if(surface.document?.hidden){revision++;pending?.controller.abort();pending=null;return;}
    if(!valid(state))apply(null);
  }
  surface.document?.addEventListener('visibilitychange',visible);
  surface.addEventListener('pageshow',visible);
  surface.addEventListener('pagehide',()=>{revision++;pending?.controller.abort();pending=null;});
  return Object.freeze({subscribe,getState:()=>valid(state)?snapshot():{kind:null,expiresAt:0},clear});
}
// One coordinator handles same-origin World/Park/Pajang frames. Only weather
// summaries are exposed; location data are neither stored nor returned.
const coordinator=host.__ojjudaThemeWeather||(host.__ojjudaThemeWeather=createCoordinator(host));
function sync(value=coordinator.getState()){
  root.OjjudaThemes?.setWeather(value.kind);
  root.dispatchEvent(new root.CustomEvent('ojjuda:weatherchange',{detail:{...value}}));
}
const unsubscribe=coordinator.subscribe(sync);
root.OjjudaWeather=Object.freeze({getState:coordinator.getState,clear:coordinator.clear});
root.document.addEventListener('DOMContentLoaded',()=>sync(),{once:true});
root.addEventListener('pageshow',()=>sync());
root.addEventListener('pagehide',event=>{if(!event.persisted)unsubscribe();});
})(globalThis);
