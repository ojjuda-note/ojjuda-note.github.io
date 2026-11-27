const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const source=name=>fs.readFileSync(path.join(root,name),'utf8');
function section(file,start,end){
  const s=source(file),a=s.indexOf(start),b=s.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,start);
  return s.slice(a,b);
}
test('Agit arms one Korean midnight update and catches up when the tab returns',()=>{
  const document=new EventTarget(),window=new EventTarget(),tasks=new Map();
  let now=Date.parse('2026-11-27T14:59:59.500Z'),id=0,renders=0;
  window.OjjudaAgitHub={kstDate:()=>new Date(now+9*3600000).toISOString().slice(0,10)};
  const context={window,document,Date:{now:()=>now},g:{},z:()=>null,
    refreshAgitHub:()=>renders++,setTimeout:(fn,delay)=>{tasks.set(++id,{fn,delay});return id;},clearTimeout:key=>tasks.delete(key)};
  vm.runInNewContext(section('world.html','let agitVisibleDate=','const entryGame='),context);
  assert.deepEqual([...tasks.values()].map(t=>t.delay),[500]);
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(tasks.size,0);
  now+=1000;document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(renders,1);assert.deepEqual([...tasks.values()].map(t=>t.delay),[86400000-500]);
  window.dispatchEvent(new Event('pagehide'));assert.equal(tasks.size,0);
});
test('Park pauses signed-photo renewals, queued photo lookups and passive GPS until shown',async()=>{
  const dom=new JSDOM('<main></main>',{url:'https://example.test/park/',runScripts:'outside-only',pretendToBeVisual:true});
  try{
    const w=dom.window,timers=new Map();let next=0,hidden=false,newFixes=0,reloads=0;
    Object.defineProperty(w.document,'hidden',{get:()=>hidden});
    Object.assign(w,{setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id),
      closePhotoLightbox(){},identityEpoch:1,session:{user:{id:'member'}},feedMode:'all',feedTerm:'',detail:{hidden:true},backdrop:{hidden:true},
      nearbyPosition:null,locationIsEnabled:()=>true,quietLocatedReload(){reloads++;},
      currentPosition:(_fresh,_enable,signal)=>{newFixes++;return new Promise((resolve,reject)=>{
        if(newFixes===1)signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});else resolve({latitude:37});
      });}});
    Object.defineProperty(w.navigator,'geolocation',{value:{}});
    Object.defineProperty(w.navigator,'permissions',{value:{query:async()=>({state:'granted'})}});
    w.eval(section('note/preview.js','const cardPhotoCache =','function applyCardPhoto')+
      section('note/preview.js','function scheduleCardPhotoRefresh','// Photos attach')+
      section('note/preview.js','async function positionIfAlreadyGranted','function consumeInitialCard')+
      section('note/preview.js','function syncParkActivity()', "$('#quick-gender')")+
      "cardPhotoCache.set('card',{url:'photo',at:Date.now()});cardPhotoWanted.add('queued');window.flipHost=on=>{parkHostVisible=on;syncParkActivity()};window.fix=positionIfAlreadyGranted;syncParkActivity();");
    const ids=()=>[...timers.values()].map(t=>t.ms);
    assert.ok(ids().includes(80));assert.ok(ids().some(ms=>ms>470000));
    const first=w.fix(),duplicate=w.fix();await new Promise(setImmediate);assert.equal(newFixes,1);
    hidden=true;w.document.dispatchEvent(new w.Event('visibilitychange'));
    assert.equal(await first,null);assert.equal(await duplicate,null);assert.equal(timers.size,0);
    w.flipHost(false);hidden=false;w.document.dispatchEvent(new w.Event('visibilitychange'));await new Promise(setImmediate);
    assert.equal(newFixes,1);assert.equal(timers.size,0);assert.equal(await w.fix(),null);
    w.flipHost(true);await new Promise(setImmediate);
    assert.equal(newFixes,2);assert.equal(reloads,1);assert.ok(ids().includes(80));
    w.dispatchEvent(new w.Event('pagehide'));assert.equal(timers.size,0);
  }finally{dom.window.close();}
});
test('closing the Pajang sample radar stops both sensors and invalidates a pending grant',async()=>{
  const dom=new JSDOM('<main id="welcome"><details class="sample-radar" open><button id="compass"></button><div class="rose"></div><div id="marks"></div><b id="direction"></b><p id="sensor-note"></p><p id="reply"></p><b id="by"></b></details></main>',
    {url:'https://example.test/pajang/',runScripts:'outside-only',pretendToBeVisual:true});
  try{
    const w=dom.window,panel=w.document.querySelector('details'),button=w.document.querySelector('button'),listening=new Set();
    let grant;w.DeviceOrientationEvent={requestPermission:()=>new Promise(resolve=>{grant=resolve;})};
    for(const method of ['addEventListener','removeEventListener']){
      const original=w[method].bind(w);
      w[method]=(name,...args)=>{if(name.startsWith('deviceorientation'))listening[method==='addEventListener'?'add':'delete'](name);return original(name,...args);};
    }
    w.eval(source('features/pajang/preview.mjs').replaceAll('export function','function'));
    button.click();grant('granted');await new Promise(setImmediate);assert.equal(listening.size,2);
    panel.open=false;panel.dispatchEvent(new w.Event('toggle'));assert.equal(listening.size,0);
    panel.open=true;button.click();panel.open=false;panel.dispatchEvent(new w.Event('toggle'));
    panel.open=true;grant('granted');await new Promise(setImmediate);assert.equal(listening.size,0);
  }finally{dom.window.close();}
});
test('member radar releases its sensors, and private views stop polling while hidden',async()=>{
  const program=path.join(root,'features/pajang');
  const esbuild=require(require.resolve('esbuild',{paths:[program]}));
  const js=esbuild.buildSync({stdin:{contents:`
    import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
    import {useCompass} from './src/app/use-compass';import {pollWhileVisible} from './src/lib/visible-poll';
    function Radar(){const c=useCompass();window.compass=c;return null;}
    const root=createRoot(document.getElementById('root'));flushSync(()=>root.render(React.createElement(Radar)));
    window.end=()=>flushSync(()=>root.unmount());window.stopPoll=pollWhileVisible(()=>{},4000);
  `,resolveDir:program},bundle:true,write:false,platform:'browser',define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text;
  const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test/',runScripts:'outside-only',pretendToBeVisual:true});
  try{
    const w=dom.window,listeners=new Set(),intervals=new Set();
    let grants=0,hidden=false;Object.defineProperty(w.document,'hidden',{get:()=>hidden});
    w.DeviceOrientationEvent={requestPermission:async()=>{grants++;return 'granted';}};
    for(const method of ['addEventListener','removeEventListener']){
      const original=w[method].bind(w);
      w[method]=(name,...args)=>{if(name.startsWith('deviceorientation'))listeners[method==='addEventListener'?'add':'delete'](name);return original(name,...args);};
    }
    w.setInterval=()=>{const id=Symbol();intervals.add(id);return id;};w.clearInterval=id=>intervals.delete(id);
    w.eval(js);await w.compass.start();assert.equal(listeners.size,2);assert.equal(intervals.size,1);
    hidden=true;w.document.dispatchEvent(new w.Event('visibilitychange'));assert.equal(listeners.size,0);assert.equal(intervals.size,0);
    hidden=false;w.document.dispatchEvent(new w.Event('visibilitychange'));assert.equal(listeners.size,2);assert.equal(intervals.size,1);assert.equal(grants,1);
    w.dispatchEvent(new w.Event('pagehide'));assert.equal(listeners.size,0);assert.equal(intervals.size,0);
    w.dispatchEvent(new w.Event('pageshow'));assert.equal(listeners.size,2);assert.equal(intervals.size,1);
    w.end();w.stopPoll();assert.equal(listeners.size,0);assert.equal(intervals.size,0);
  }finally{dom.window.close();}
});
test('Agit polls board replies only for an outstanding invitation in the foreground',async()=>{
  const document=new EventTarget(),window=new EventTarget(),tasks=new Map(),calls=[];
  let id=0;
  const ctx=vm.createContext({window,document,g:{},setTimeout:(fn,ms)=>{tasks.set(++id,{fn,ms});return id;},clearTimeout:key=>tasks.delete(key),calls});
  vm.runInContext(section('world.html','let boardInviteReader=','async function Q0()')+'boardInviteReader=async id=>calls.push(id);syncBoardInvitePoll();',ctx);
  assert.equal(tasks.size,0);ctx.setPendingBoardInvite('game');assert.equal(tasks.size,1);
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(tasks.size,0);
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));assert.equal(tasks.size,1);
  const [key,task]=[...tasks][0];assert.equal(task.ms,3000);tasks.delete(key);await task.fn();
  assert.deepEqual(calls,['game']);assert.equal(tasks.size,1);
  ctx.setPendingBoardInvite(null);assert.equal(tasks.size,0);
});
