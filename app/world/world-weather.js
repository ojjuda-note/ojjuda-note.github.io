/* Current rain/snow from KMA. One same-origin coordinator checks the member's
   existing location consent; only weather summaries survive navigation. */
(function(root){
'use strict';
if(root.OjjudaWeather)return;
const KEY='ojjuda:theme-weather:v2',LOCATION_EVENT='ojjuda:weather-location';
const ENDPOINT='https://ziezbdjofcugznowiuda.supabase.co/functions/v1/theme-weather';
const INTERVAL=10*60*1000,RETRY=60*1000,MAX_AGE=30*60*1000;
let host=root;
try{if(root.top&&root.location?.origin&&root.top.location.origin===root.location.origin)host=root.top;}catch{}

function createCoordinator(surface){
  const subscribers=new Set(),later=(fn,ms)=>surface.setTimeout(fn,ms),cancel=id=>surface.clearTimeout(id);
  let state={kind:null,expiresAt:0},expiryTimer=0,pollTimer=0,pending=null,revision=0;
  let db,service,permission,account='',authRevision=0,knownAuth=false,started=false,starting=false;
  let authBound=false,permissionWatched=false,startTimer=0,startRetried=false;
  let unsubscribeChoice=()=>{},eventCell=null,lastCell='',lastFetch=0,retried=false,saved;
  let suspended=!!surface.document?.hidden;
  function valid(value){
    return value&&(value.kind===null||value.kind==='rain'||value.kind==='snow')&&
      Number.isFinite(value.expiresAt)&&value.expiresAt>Date.now()&&value.expiresAt<=Date.now()+MAX_AGE;
  }
  function validCell(value){
    return value&&Number.isInteger(value.nx)&&value.nx>=1&&value.nx<=149&&Number.isInteger(value.ny)&&value.ny>=1&&value.ny<=253&&
      Number.isFinite(value.capturedAt)&&value.capturedAt<=Date.now()&&Date.now()-value.capturedAt<120000;
  }
  const snapshot=()=>({...state});
  function apply(value){
    cancel(expiryTimer);expiryTimer=0;
    state=valid(value)?{kind:value.kind,expiresAt:value.expiresAt}:{kind:null,expiresAt:0};
    try{if(state.expiresAt)surface.sessionStorage.setItem(KEY,JSON.stringify(state));else surface.sessionStorage.removeItem(KEY);}catch{}
    for(const listener of subscribers)listener(snapshot());
    if(state.expiresAt&&!surface.document?.hidden)expiryTimer=later(()=>{
      apply(null);void refresh();
    },Math.max(1,state.expiresAt-Date.now()+1));
  }
  function pause(clear=false){
    revision++;pending?.controller.abort();pending=null;eventCell=null;lastCell='';
    cancel(pollTimer);cancel(expiryTimer);cancel(startTimer);pollTimer=0;expiryTimer=0;startTimer=0;
    if(clear)apply(null);
  }
  function clear(){saved=null;retried=false;pause(true);}
  function subscribe(listener){
    if(state.expiresAt&&state.expiresAt<=Date.now())apply(null);
    subscribers.add(listener);listener(snapshot());return()=>subscribers.delete(listener);
  }
  function schedule(delay){
    cancel(pollTimer);pollTimer=0;
    if(account&&!surface.document?.hidden)pollTimer=later(()=>{pollTimer=0;void refresh();},delay);
  }
  function blocked(){
    return service?.current(account)?.enabled===false||(permission&&permission.state!=='granted');
  }
  async function refresh(){
    if(pending||!account||!db||!service?.readWeatherPosition||surface.document?.hidden||
        (permission&&permission.state!=='granted'))return;
    const apiKey=surface.OJJUDA_CONFIG?.supabaseKey;
    if(typeof apiKey!=='string'||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(apiKey)||apiKey.length>256){clear();return;}
    cancel(pollTimer);pollTimer=0;
    const controller=new AbortController(),owner=account,request=++revision;
    const current=()=>request===revision&&account===owner&&!surface.document?.hidden;
    pending={controller,request};
    let timeout=later(()=>controller.abort(),20000);
    try{
      const candidate=eventCell;eventCell=null;
      const cell=await service.readWeatherPosition({db,accountId:owner,signal:controller.signal,cell:candidate});
      if(!current())return;
      if(controller.signal.aborted)throw controller.signal.reason;
      if(blocked()||!validCell(cell))throw Error('Location unavailable');
      const key=cell.nx+','+cell.ny;
      if(lastCell&&lastCell!==key)apply(null);
      // Restore only after this account's permission and server preference passed.
      if(!state.expiresAt&&valid(saved))apply(saved);
      saved=null;
      cancel(timeout);timeout=later(()=>controller.abort(),12000);
      const response=await surface.fetch(ENDPOINT+'?nx='+cell.nx+'&ny='+cell.ny,{
        method:'GET',headers:{Accept:'application/json',apikey:apiKey},credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal
      });
      if(!response.ok)throw Error('Weather unavailable');
      const data=await response.json();
      if(!current())return;
      if(controller.signal.aborted)throw controller.signal.reason;
      if(blocked()||!valid(data))throw Error('Expired weather');
      lastCell=key;lastFetch=Date.now();retried=false;apply(data);schedule(INTERVAL);
    }catch(error){
      if(!current())return;
      apply(null);saved=null;eventCell=null;
      if(blocked()||['disabled','denied','unsupported'].includes(error?.code)){retried=false;return;}
      // One short recovery attempt, then wait for the next ordinary refresh.
      const delay=retried?INTERVAL:RETRY;retried=!retried;schedule(delay);
    }finally{
      cancel(timeout);
      if(pending?.request===request)pending=null;
    }
  }
  function receive(event){
    if(event.detail===null){clear();return;}
    if(surface.document?.hidden||!validCell(event.detail))return;
    eventCell={nx:event.detail.nx,ny:event.detail.ny,capturedAt:event.detail.capturedAt};
    if(eventCell.nx+','+eventCell.ny===lastCell&&valid(state)&&Date.now()-lastFetch<INTERVAL)return;
    void refresh();
  }
  function sessionChanged(session){
    const next=session?.user&&!session.user.is_anonymous?session.user.id:'';
    if(knownAuth&&next===account)return;
    const previous=account;knownAuth=true;unsubscribeChoice();unsubscribeChoice=()=>{};
    pause(true);account=next;retried=false;
    if(previous||!account)saved=null;
    if(!account)return;
    const owner=account;
    unsubscribeChoice=service.subscribe(owner,choice=>{
      if(owner!==account)return;
      if(!choice.enabled)clear();
      else if(!pending&&!surface.document?.hidden)schedule(0);
    });
    schedule(0);
  }
  async function start(){
    if(started||starting)return;starting=true;cancel(startTimer);startTimer=0;
    service=surface.OjjudaLocation;
    try{
      if(!service?.readWeatherPosition||!surface.OjjudaGetClient)throw Error('Location service unavailable');
      db=await surface.OjjudaGetClient();
      if(!authBound){db.auth.onAuthStateChange((_event,session)=>{
        authRevision++;
        // Only synchronous invalidation here; schedule(0) runs reads later.
        sessionChanged(session);
      });authBound=true;}
      const version=authRevision;
      const sessionRead=db.auth.getSession();
      if(!permissionWatched){permissionWatched=true;void (async()=>{
        try{
          permission=await surface.navigator.permissions?.query({name:'geolocation'});
          permission?.addEventListener?.('change',()=>{
            if(permission.state!=='granted')clear();else schedule(0);
          });
          if(permission?.state!=='granted')clear();
        }catch{permissionWatched=false;/* The location service will refuse GPS. */}
      })();}
      const result=await Promise.resolve(sessionRead).catch(error=>({error}));
      if(version===authRevision){
        if(result.error)throw result.error;
        sessionChanged(result.data?.session);
      }
      started=true;startRetried=false;
      if(account&&!pending&&!valid(state))schedule(0);
    }catch{
      clear();
      const delay=startRetried?INTERVAL:RETRY;startRetried=!startRetried;
      if(!surface.document?.hidden)startTimer=later(()=>void start(),delay);
    }finally{starting=false;}
  }
  function visible(){
    if(surface.document?.hidden){suspended=true;pause();return;}
    apply(valid(state)?state:null);
    if(suspended){suspended=false;retried=false;if(!started)void start();else void refresh();}
  }
  surface.addEventListener(LOCATION_EVENT,receive);
  try{
    saved=JSON.parse(surface.sessionStorage.getItem(KEY)||'null');
    surface.sessionStorage.removeItem('ojjuda:theme-weather:v1');
  }catch{}
  if(!valid(saved)){saved=null;try{surface.sessionStorage.removeItem(KEY);}catch{}}
  surface.document?.addEventListener('visibilitychange',visible);
  surface.addEventListener('pageshow',visible);
  surface.addEventListener('pagehide',()=>{suspended=true;pause();});
  surface.addEventListener('online',()=>{
    if(surface.document?.hidden)return;
    if(!started&&startRetried)void start();else if(retried&&!pending)void refresh();
  });
  if(surface.document?.readyState==='loading')surface.document.addEventListener('DOMContentLoaded',()=>void start(),{once:true});
  else void start();
  return Object.freeze({subscribe,getState:()=>valid(state)?snapshot():{kind:null,expiresAt:0},isAccount:id=>id===account,clear});
}
// A child frame subscribes to its host, including when it was the first opener.
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
