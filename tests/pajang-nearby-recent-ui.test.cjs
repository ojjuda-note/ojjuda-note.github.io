const assert=require('node:assert/strict');
const path=require('node:path');
const test=require('node:test');
const {JSDOM,VirtualConsole}=require('jsdom');
const {buildSync}=require('../features/pajang/node_modules/esbuild');

const program=buildSync({stdin:{contents:`
  import React from 'react';
  import {createRoot} from 'react-dom/client';
  import NearbyRadar from './src/app/nearby-radar';
  const root=createRoot(document.getElementById('radar'));
  window.renderRadar=(station,sample=false)=>root.render(<NearbyRadar station={station} sample={sample}
    onProfile={(...args)=>window.profiles.push(args)} onJoin={()=>{}} onSettings={async()=>true}/>);
`,resolveDir:path.resolve(__dirname,'../features/pajang'),loader:'tsx'},bundle:true,write:false,
  format:'iife',target:'es2022',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text;

const current={day:'2026-11-19',slot:'am',question:'친구에게 서운하면 어떻게 표현하나요?',body:'직접 말해요.',at:30,liked:true,likeCount:2};
const previous={day:'2026-11-18',slot:'pm',question:'하루가 바쁠 때 무엇을 먼저 하나요?',body:'급한 일부터 해요.',at:20};
const oldest={day:'2026-11-18',slot:'am',question:'쉬는 날은 어떻게 보내나요?',body:'혼자 쉬어요.',at:10};
const person={id:'peer',name:'라온',region:'서울',interest:'walk',body:current.body,at:30,range:3,bearing:315};
const historyOnly={id:'past-peer',name:'도담',region:'서울',interest:'book',body:previous.body,at:20,range:1,sameCell:true,answers:[previous,oldest]};
const base={day:current.day,slot:current.slot,question:{id:1,q:[current.question],answers:[]},nextAt:'2026-11-19T09:00:00Z',
  me:{id:'me',name:'보리',region:'서울',interest:'coffee'},people:[person],signals:[],messages:[],remaining:3,
  authenticated:true,locationEnabled:true,radarOn:true};

function fixture(t){
  const errors=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM('<!doctype html><div id="radar"></div>',{url:'https://ojjuda.test',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
  const w=dom.window;t.after(()=>w.close());w.profiles=[];w.pajangArt={};w.eval(program);
  async function until(check){for(let n=0;n<100;n++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Radar DOM did not settle: '+w.document.body.textContent+'\n'+errors.join('\n'));}
  const markers=()=>[...w.document.querySelectorAll('.scope-person')];
  const answers=()=>[...w.document.querySelectorAll('.radar-answer')];
  return {w,errors,until,markers,answers,render:value=>w.renderRadar(value)};
}

test('recent answers share one marker and a past-only writer opens the correct dated answer',async t=>{
  const f=fixture(t),{w}=f;
  f.render({...base,nearbyPeople:[{...person,answers:[current,previous,oldest]},historyOnly]});
  await f.until(()=>f.markers().length===2&&f.answers().length===2);
  f.markers().find(marker=>marker.getAttribute('aria-label').startsWith('라온,')).click();
  await f.until(()=>f.answers().length===3);
  assert.deepEqual(f.answers().map(answer=>answer.querySelector('.radar-quote').textContent),[current.body,previous.body,oldest.body]);
  assert.deepEqual(f.answers().map(answer=>answer.querySelector('h3').textContent),[current.question,previous.question,oldest.question]);
  assert.deepEqual(f.answers().map(answer=>answer.querySelector('time').getAttribute('datetime')),['2026-11-19','2026-11-18','2026-11-18']);
  assert.equal(w.document.querySelectorAll('.radar-answer-meta span').length,1);
  f.markers().find(marker=>marker.getAttribute('aria-label').startsWith('도담,')).click();
  await f.until(()=>f.answers().length===2);
  assert.equal(w.document.querySelector('.radar-identity h2').textContent,'도담');
  assert.equal(w.document.querySelectorAll('.radar-answer-meta span').length,0,'past replies do not carry the current label');
  w.document.querySelector('.radar-primary').click();
  assert.equal(w.profiles[0][0],'past-peer');
  assert.deepEqual(JSON.parse(JSON.stringify(w.profiles[0][1])),previous);
  assert.deepEqual(f.errors,[]);
});

test('an explicit empty nearby feed and disabled location never fall back to current people',async t=>{
  const f=fixture(t),{w}=f;
  f.render({...base,nearbyPeople:[]});
  await f.until(()=>w.document.querySelector('.radar-empty'));
  assert.equal(f.markers().length,0);
  assert.equal(f.answers().length,0);
  f.render({...base,nearbyPeople:[historyOnly],locationEnabled:false});
  await f.until(()=>w.document.querySelector('.radar-empty h2')?.textContent==='위치를 숨겼어요');
  assert.equal(f.markers().length,0);
  assert.equal(f.answers().length,0);
  assert.deepEqual(f.errors,[]);
});

test('legacy member responses still show their current question and preserve profile navigation',async t=>{
  const f=fixture(t),{w}=f;f.render(base);
  await f.until(()=>f.answers().length===1);
  assert.equal(f.markers().length,1);
  assert.equal(f.answers()[0].querySelector('h3').textContent,current.question);
  assert.equal(f.answers()[0].querySelector('.radar-quote').textContent,current.body);
  w.document.querySelector('.radar-primary').click();
  assert.equal(w.profiles[0][0],person.id);
  assert.equal(w.profiles[0][1],undefined,'old responses keep the original profile path');
  assert.deepEqual(f.errors,[]);
});

// Exercise the actual station lifecycle in memory so the date-change checks do
// not depend on a generated release bundle or a live geolocation/account.
const stationProgram=buildSync({entryPoints:[path.resolve(__dirname,'../features/pajang/src/main.tsx')],
  bundle:true,write:false,format:'iife',target:'es2022',jsx:'automatic',
  define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text;

function stationFixture(t,{enabled=true,checked=true,holdWrites=0}={}){
  const errors=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM('<!doctype html><div id="station"></div>',{
    url:'https://ojjuda.test/features/pajang/station.html?view=radar',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
  const w=dom.window;t.after(()=>w.close());
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  let state={...structuredClone(base),slot:'pm',nextAt:new Date(Date.now()+3600000).toISOString(),
    locationEnabled:enabled,locationVersion:0,locationChecked:checked,radarOn:enabled&&checked,
    nearbyPeople:enabled&&checked?[{...person,answers:[current]}]:[]};
  let session={access_token:'test-token',user:{id:'account',is_anonymous:false}};
  const positions=[],writes=[],held=[],calls=[],subscribers=new Set(),authListeners=new Set();
  w.pajangState=structuredClone(state);w.pajangArt={};
  w.OjjudaLocation={
    acceptPreference(){},
    subscribe(_account,listener){subscribers.add(listener);return()=>subscribers.delete(listener);},
    readPosition(options){return new Promise((resolve,reject)=>{
      const item={signal:options.signal,resolve,reject};positions.push(item);
      options.signal?.addEventListener('abort',()=>reject(new w.DOMException('cancelled','AbortError')),{once:true});
    });}
  };
  const db={auth:{
    getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:session?.user}}),
    onAuthStateChange(listener){authListeners.add(listener);return {data:{subscription:{unsubscribe(){authListeners.delete(listener);}}}};}
  },rpc(name,params={}){
    calls.push({name,params});let data,pending;
    if(name==='pajang_member'){
      if(params.p_action==='radar-enable'){
        writes.push({day:state.day,params});
        const answer={...current,day:state.day,slot:state.slot,body:state.day+' 답변'};
        state={...state,radarOn:true,nearbyPeople:[{...person,body:answer.body,answers:[answer]}]};
        data=structuredClone(state);
        if(holdWrites-->0)pending=new Promise(resolve=>held.push(()=>resolve({data})));
      }else data=state;
    }else if(name==='pajang_discovery_feed')data={items:[],nextCursor:null,total:0,remaining:3};
    else if(name==='is_admin')data=false;
    else throw Error('Unexpected RPC '+name);
    const result=pending??Promise.resolve({data:structuredClone(data)});result.abortSignal=()=>result;return result;
  }};
  w.OjjudaGetClient=async()=>db;w.eval(stationProgram);
  async function until(check){for(let n=0;n<100;n++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Station did not settle: '+w.document.body.textContent+'\n'+errors.join('\n'));}
  async function pulse(patch={}){
    state={...state,...patch};const reads=calls.filter(call=>call.name==='pajang_member'&&call.params.p_action==='state').length;
    w.document.dispatchEvent(new w.Event('visibilitychange'));
    await until(()=>calls.filter(call=>call.name==='pajang_member'&&call.params.p_action==='state').length>reads);
    await new Promise(resolve=>setTimeout(resolve,30));
  }
  function moveDay(day){return pulse({day,slot:'am',radarOn:false,nearbyPeople:[],locationChecked:true});}
  function completePosition(index){positions[index].resolve({latitude:37.5,longitude:127});}
  function changeAccount(id){session={...session,user:{id,is_anonymous:false}};for(const listener of authListeners)listener('SIGNED_IN',session);}
  return {w,errors,positions,writes,held,calls,until,pulse,moveDay,completePosition,changeAccount};
}

test('an open station refreshes location once after midnight and retains the returned nearby feed',async t=>{
  const f=stationFixture(t);
  await f.until(()=>f.w.document.querySelector('.scope-person'));
  await f.pulse();assert.equal(f.positions.length,0,'the initial checked location is reused');
  await f.moveDay('2026-11-20');
  await f.until(()=>f.positions.length===1);
  f.completePosition(0);
  await f.until(()=>f.writes.length===1&&f.w.document.querySelector('.radar-quote')?.textContent==='2026-11-20 답변');
  assert.equal(f.writes[0].day,'2026-11-20');
  assert.equal(f.writes[0].params.p_data.accountId,'account');
  await f.pulse();await f.pulse({slot:'pm'});await f.pulse();
  assert.equal(f.positions.length,1,'same-day polls and the noon question do not request GPS again');
  assert.equal(f.writes.length,1);
  assert.deepEqual(f.errors,[]);
});

test('a held previous-day location response cannot block or replace the new day lookup',async t=>{
  const f=stationFixture(t,{checked:false,holdWrites:1});
  await f.until(()=>f.positions.length===1);f.completePosition(0);
  await f.until(()=>f.held.length===1);
  await f.moveDay('2026-11-20');
  await f.until(()=>f.positions.length===2);
  assert.equal(f.positions[0].signal.aborted,true,'day cleanup cancels the previous location attempt');
  f.completePosition(1);
  await f.until(()=>f.w.document.querySelector('.radar-quote')?.textContent==='2026-11-20 답변');
  f.held[0]();await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(f.w.document.querySelector('.radar-quote').textContent,'2026-11-20 답변','the late response never restores yesterday');
  assert.equal(f.writes.length,2);
  assert.deepEqual(f.errors,[]);
});

test('midnight keeps sharing off and a denied daily lookup is not retried by same-day polls',async t=>{
  const off=stationFixture(t,{enabled:false});
  await off.until(()=>off.w.document.querySelector('.radar-empty'));
  await off.moveDay('2026-11-20');await off.pulse({slot:'pm'});
  assert.equal(off.positions.length,0);assert.equal(off.writes.length,0);
  const denied=stationFixture(t,{checked:false});
  await denied.until(()=>denied.positions.length===1);
  denied.positions[0].reject(Error('위치 권한이 꺼져 있어요.'));
  await denied.until(()=>denied.w.document.querySelector('.radar-feedback')?.textContent.includes('위치 권한'));
  await denied.pulse();await denied.pulse({slot:'pm'});
  assert.equal(denied.positions.length,1);assert.equal(denied.writes.length,0);
  assert.deepEqual(off.errors,[]);assert.deepEqual(denied.errors,[]);
});

test('changing accounts during the new-day lookup never saves that location under another account',async t=>{
  const f=stationFixture(t);await f.until(()=>f.w.document.querySelector('.scope-person'));
  await f.moveDay('2026-11-20');await f.until(()=>f.positions.length===1);
  f.changeAccount('another-account');f.completePosition(0);
  await f.until(()=>f.w.document.querySelector('.radar-feedback')?.textContent.includes('회원 정보'));
  assert.equal(f.writes.length,0);
  await f.moveDay('2026-11-21');
  assert.equal(f.positions.length,1,'an old member view does not restart GPS for a different signed-in account');
  assert.equal(f.writes.length,0);
  assert.deepEqual(f.errors,[]);
});
