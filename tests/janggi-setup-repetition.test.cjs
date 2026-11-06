const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const {JSDOM}=require('jsdom');
const world=fs.readFileSync(path.join(__dirname,'../world.html'),'utf8');
const engineSource=world.slice(world.indexOf('var Yh='),world.indexOf('var Xe='));
const browser=vm.createContext({Date,Math});vm.runInContext(engineSource,browser);
const plain=value=>JSON.parse(JSON.stringify(value));
const opening=[{f:81,t:72},{f:0,t:9},{f:72,t:81},{f:9,t:0},{f:81,t:72},{f:0,t:9},{f:72,t:81},{f:9,t:0}];
const replay=(engine,moves=opening)=>moves.reduce((state,move)=>engine.apply(state,engine.find(state,move,true)),engine.init());
const browserEngine={init:browser.vp,find:browser.Dp,apply:browser.ca,status:browser.Mp,best:browser.Bp};

test('four layouts put both sides in the selected order from their own viewpoint',async()=>{
 const {boards}=await import('../supabase/functions/game-action/engines.mjs');
 for(const c of ['eheh','ehhe','heeh','hehe'])for(const h of ['eheh','ehhe','heeh','hehe']){
  const state=browser.vp({c,h});
  assert.equal([82,83,87,88].map(i=>state.b[i]).join('').toLowerCase(),c);
  assert.equal([7,6,2,1].map(i=>state.b[i]).join(''),h);
  assert.deepEqual(plain(state),boards.janggi.init({c,h}));
 }
});

test('browser and server allow two shuttles, reject the third, and keep other moves and AI available',async()=>{
 const {boards}=await import('../supabase/functions/game-action/engines.mjs');
 for(const engine of [browserEngine,boards.janggi]){
  let state=engine.init();
  for(const move of opening){assert.ok(engine.find(state,move));state=engine.apply(state,move);}
  assert.equal(engine.find(state,{f:81,t:72}),null);
  assert.ok(engine.find(state,{f:81,t:63}));
  assert.ok(!engine.status(state).over);
  for(const level of ['easy','normal','hard']){
   const ai=engine.best(state,level,50);assert.ok(ai);assert.ok(engine.find(state,ai));
   assert.notDeepEqual(plain(ai),{f:81,t:72});
  }
  const next=engine.apply(state,{f:54,t:45});
  assert.equal(engine.find(next,{f:0,t:9}),null,'Han has an independent repetition limit');
  assert.deepEqual(plain(state.shuttle),{c:{f:72,t:81,run:4},h:{f:9,t:0,run:4}},'search never mutates the original history');
  assert.ok(engine.find(replay(engine,opening.slice(0,-2)),{f:72,t:81}),'undo reconstructs the earlier limit');
  const changed=engine.apply(engine.apply(state,{f:81,t:63}),{f:0,t:18});
  assert.ok(engine.find(changed,{f:63,t:81}),'a different move starts a new sequence');
  const passed=engine.apply(engine.apply(state,{pass:1}),{f:0,t:18});
  assert.ok(engine.find(passed,{f:81,t:72}),'passing breaks this side’s consecutive sequence');
 }
});

test('online validation rejects a forged third shuttle, accepts legacy histories and validates computer replacements',async()=>{
 const {verifyAction,verifyComputerAction}=await import('../supabase/functions/game-action/rules.mjs');
 const game={kind:'janggi',p1:'a',p2:'b',status:'playing',moves:opening,janggi_layout:{c:'eheh',h:'hehe'}};
 const act=(g,user,input)=>verifyAction(g,user,{action:'game_move',p_ply:g.moves.length,p_move:input});
 assert.throws(()=>act(game,'a',{f:81,t:72}),/repeated_move/);
 assert.deepEqual(act(game,'a',{f:54,t:45}).move,{f:54,t:45});
 const legacy={...game,moves:[...opening,{f:81,t:72},{f:0,t:9}]};
 assert.deepEqual(act(legacy,'a',{f:54,t:45}).move,{f:54,t:45},'already saved games remain playable');
 const computer=verifyComputerAction({...game,computer_seats:['p1']},'b');
 assert.ok(computer);assert.notDeepEqual(computer.move,{f:81,t:72});
 assert.deepEqual(act(game,'a',computer.move),computer);
});

test('the visible pre-game chooser selects actual starting pieces and reopens for another game',async()=>{
 const dom=new JSDOM('<div id="bd-menu"></div>',{runScripts:'outside-only'}),w=dom.window;
 try{
  w.eval(engineSource);
  w.eval(world.slice(world.indexOf('var Xe='),world.indexOf('function pa(')));
  w.eval(world.slice(world.indexOf('function jgChooser('),world.indexOf('async function vn(')));
  w.eval(world.slice(world.indexOf('var Qp={'),world.indexOf('var to=[]')));
  w.g={};w.D={online:false};w.newPracticeStreakRound=()=>null;w.ln=async()=>'<button data-online-invite>초대</button>';
  let started,menuKind;w.zp=(kind,mode,options)=>{started=w.jp(kind,mode,options);w.E=started;};w.vn=kind=>{menuKind=kind;};
  const menu=w.document.getElementById('bd-menu');menu.innerHTML=await w.Hp('janggi');
  assert.equal(menu.querySelectorAll('.bd-layout').length,1);
  for(const button of menu.querySelectorAll('[data-act="bd-layout"]'))assert.equal(button.closest('details,[hidden]'),null);
  for(const side of ['c','h'])for(const code of ['eheh','ehhe','heeh','hehe']){
   const button=menu.querySelector(`[data-side="${side}"][data-v="${code}"]`);
   w.Qp['bd-layout'](button.dataset);
   assert.equal(button.getAttribute('aria-pressed'),'true');
   assert.equal(menu.querySelectorAll(`[data-side="${side}"][aria-pressed="true"]`).length,1);
   w.Qp['bd-start']({k:'janggi',mode:'ai'});
   const cells=side==='c'?[82,83,87,88]:[7,6,2,1];
   assert.equal(cells.map(i=>started.s.b[i]).join('').toLowerCase(),code);
  }
  w.Qp['bd-again']();assert.equal(menuKind,'janggi');
  menu.innerHTML=await w.Hp('chess');assert.equal(menu.querySelector('.bd-layout'),null);
 }finally{w.close();}
});

test('a blocked board tap gives a short explanation without changing the board',()=>{
 const ctx=vm.createContext({Date,Math});vm.runInContext(engineSource,ctx);
 vm.runInContext(world.slice(world.indexOf('function g2('),world.indexOf('function ',world.indexOf('function g2(')+12)),ctx);
 ctx.E={kind:'janggi',mode:'local',s:replay(browserEngine),sel:81,targets:[]};ctx.$l=()=>true;
 ctx.ze=()=>browserEngine;ctx.Je=()=>{};let message;ctx.M=text=>{message=text;};
 const before=plain(ctx.E.s);ctx.g2(72);assert.match(message,/3번/);assert.deepEqual(plain(ctx.E.s),before);
});
