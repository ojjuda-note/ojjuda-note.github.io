const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../world.html'),'utf8');
const part=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)+1));

function board(flipped){
 let above=false;
 const frames=[],fades=[];
 const piece={parentNode:{},animate:(keys,options)=>frames.push({keys,options})};
 const ghost={animate:(keys,options)=>fades.push({keys,options}),remove(){this.removed=true}};
 const tile=sq=>({getAttribute:name=>{
  const x=sq%9,y=Math.floor(sq/9);
  return name==='cx'?26+38*(flipped?8-x:x):26+38*(flipped?9-y:y);
 }});
 const svg={querySelector(selector){
  if(selector.startsWith('.bd-pc'))return piece;
  if(selector==='.jg-captured')return ghost;
  if(selector==='[data-act="bd-sq"]')return this.firstTile;
  return tile(Number(selector.match(/data-i="(\d+)"/)[1]));
 },firstTile:{},insertBefore(node,target){above=node===piece.parentNode&&target===this.firstTile}};
 return {svg,frames,fades,ghost,onTop:()=>above};
}

test('a capture slides in board coordinates from either seat and resumes after a redraw',()=>{
 let now=5000;
 const ctx=vm.createContext({performance:{now:()=>now},kn:sq=>[sq%9,Math.floor(sq/9)]});
 vm.runInContext(part('function jgMoveDuration(','function u2()'),ctx);
 for(const flip of [false,true]){
  const move={f:54,t:18};
  const duration=ctx.jgMoveDuration(move),motion={moves:[move],duration};
  assert.equal(ctx.jgMoveDuration({f:54,t:45}),520);
  assert.equal(duration,700);
  assert.equal(ctx.jgMoveDuration({f:81,t:0}),820);
  const initial=board(flip);ctx.jgAnimateMove(motion,initial.svg);
  assert.ok(initial.onTop());assert.equal(initial.frames[0].keys[0].transform,`translate(0px, ${flip?-152:152}px)`);
  assert.equal(initial.frames[0].keys.at(-1).transform,'translate(0px, 0px)');
  assert.equal(initial.fades[0].keys.at(-1).opacity,0);
  const deadline=motion.endsAt;now+=105;
  const next=board(flip);ctx.jgAnimateMove(motion,next.svg);
  assert.equal(next.frames[0].options.delay,-105);assert.equal(next.fades[0].options.delay,-105);
  assert.equal(deadline,motion.endsAt);
  now=deadline;const after=board(flip);ctx.jgAnimateMove(motion,after.svg);
  assert.equal(after.frames.length,0);assert.ok(after.ghost.removed);
 }
});

test('a fast AI waits only for the previous landing and cannot apply a stale reply',async()=>{
 let now=1000,applied=0;
 const move={f:27,t:36},timers=[];
 const session=()=>({kind:'janggi',level:'pro',s:{},anim:{endsAt:1250}});
 const ctx=vm.createContext({qt:false,E:session(),performance:{now:()=>now},
  h2(){},Dr:()=>[move],jgMasterThink:async()=>move,Ka(){applied++},console,
  setTimeout:(fn,delay)=>timers.push({fn,delay})});
 vm.runInContext(part('function Fl(){','function g2(t){'),ctx);
 const turn=async()=>{ctx.Fl();await new Promise(setImmediate)};
 await turn();assert.equal(applied,0);assert.equal(timers[0].delay,310);assert.ok(ctx.E.thinking);
 now=1310;timers.shift().fn();assert.equal(applied,1);assert.equal(ctx.E.thinking,false);
 ctx.E=session();now=1000;await turn();ctx.E.s={};timers.shift().fn();assert.equal(applied,1);
 ctx.E=session();await turn();ctx.E=session();timers.shift().fn();assert.equal(applied,1);
 ctx.E=session();now=2000;await turn();assert.equal(applied,2);assert.equal(timers.length,0);
 ctx.E=session();ctx.qt=true;now=1000;await turn();assert.equal(applied,3);assert.equal(timers.length,0);
});

test('local AI calculation starts after a long slide has landed',async()=>{
 let now=1000, searches=0, applied=0;
 const timers=[];
 const ctx=vm.createContext({qt:false,wn:520,
  E:{kind:'janggi',level:'normal',s:{},anim:{endsAt:1820}},performance:{now:()=>now},
  h2(){},jgMasterThink:async()=>{throw Error('worker unavailable')},console:{warn(){}},
  waitForJanggiProAi:async()=> (_s,_rules,budget,level)=>{assert.equal(level,'normal');searches++;return {f:27,t:36}},Ka(){applied++},
  setTimeout:(fn,delay)=>timers.push({fn,delay})});
 vm.runInContext(part('function Fl(){','function g2(t){'),ctx);
 ctx.Fl();await new Promise(setImmediate);assert.equal(searches,0);assert.equal(timers[0].delay,880);
 now+=timers[0].delay;timers.shift().fn();await new Promise(setImmediate);
 assert.equal(searches,1);assert.equal(applied,1);assert.equal(timers.length,0);
});
