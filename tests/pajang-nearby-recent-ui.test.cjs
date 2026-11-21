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
