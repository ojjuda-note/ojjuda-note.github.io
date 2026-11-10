const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');

const world=fs.readFileSync(path.join(__dirname,'../world.html'),'utf8');
const rules=world.slice(world.indexOf('var Yh='),world.indexOf('var Xe='));
const replay=world.slice(world.indexOf('// Finished Janggi games are kept'),world.indexOf('function worldBoardResultMarkup()'));
const plain=value=>JSON.parse(JSON.stringify(value));

function fixture(){
 const stored=new Map();
 const context=vm.createContext({
  Date,Math,console,
  D:{online:false},E:null,
  localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)},
  Xe:{janggi:{side:{c:'초',h:'한'}}},
  d2:{c:{P:'卒'},h:{R:'車'}},
  Lp:{points:'점수',checkmate:'외통',resign:'기권'},
  Op:()=>({c:'나',h:'컴퓨터'}),
  w:text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;'),
  p2:()=>`<svg data-act="bd-sq">${context.E.s.b[45]||'-'} ${context.E.s.b[54]||'-'}</svg>`,
  y2:(kind,moves,layout)=>{
   let state=context.vp(layout),last=null;
   for(const move of moves){last=context.Dp(state,move,true);if(!last)return{bad:true,s:state,last};state=context.ca(state,last)}
   return{s:state,last};
  },
  jp:(kind,mode,options)=>({kind,mode,...options}),
  Je:()=>{context.rendered=true},
  M:()=>{}
 });
 vm.runInContext(rules,context);
 vm.runInContext(replay,context);
 const layout={c:'eheh',h:'hehe'};
 const moves=[{f:54,t:45},{f:0,t:9}];
 const final=moves.reduce((state,move)=>context.ca(state,move),context.vp(layout));
 context.E={kind:'janggi',mode:'ai',me:'c',level:'normal',layout,moves,
  s:final,over:{over:true,result:'h',reason:'points',points:{c:20,h:33}}};
 return{context,stored};
}

test('a completed game saves once and can be reopened from the board menu',()=>{
 const{context,stored}=fixture();
 context.jgArchiveCurrent();
 assert.equal(context.jgRecentReplays().length,1);
 context.jgArchiveCurrent();
 assert.equal(context.jgRecentReplays().length,1,'rerendering the result must not duplicate the game');
 assert.match(context.jgReplayMenuMarkup(),/내 최근 기보/);
 assert.match(context.jgReplayMenuMarkup(),/패배/);
 assert.equal(stored.size,1);
 context.jgOpenSavedReplay(0);
 assert.equal(context.E.reviewStep,2);
 assert.equal(context.E.reviewReturn,'menu');
 assert.equal(context.rendered,true);
 assert.deepEqual(plain(context.E.moves),[{f:54,t:45},{f:0,t:9}]);
 context.D={online:true,user:{id:'different-account'}};
 assert.equal(context.jgRecentReplays().length,0,'other accounts on the same device cannot see these replays');
});

test('replay shows each board position, all moves and an explicit defeat reason',()=>{
 const{context}=fixture();
 context.E.reviewStep=0;
 assert.match(context.jgReplayBoard(),/data-act="bd-review-board">- P/,'initial pawn stays on its start square');
 context.E.reviewStep=1;
 assert.match(context.jgReplayBoard(),/data-act="bd-review-board">P -/,'first move updates the replay board');
 context.E.reviewStep=2;
 const markup=context.jgReplayMarkup();
 assert.match(markup,/기보 · 복기/);
 assert.match(markup,/점수 판정 · 초 20점 \/ 한 33점/);
 assert.match(markup,/1수 초 卒/);
 assert.match(markup,/2수 한 車/);
 assert.match(markup,/bd-review-step/);
 assert.match(markup,/2 \/ 2수/);
 assert.equal(context.E.s.b[45],'P','viewing a previous move never changes the live game state');
});

test('the defender may repeat an escape from check without being declared checkmated',async()=>{
 const{boards}=await import('../supabase/functions/game-action/engines.mjs');
 const{janggiRules}=await import('../games/janggi/worker-rules.mjs');
 const{context}=fixture();
 const board=Array(90).fill('');
 board[75]='K';board[13]='k';board[3]='r';board[49]='p';
 const state={b:board,t:'c',n:9,passes:0,shuttle:{c:{f:76,t:75,run:4}}};
 for(const engine of [
  {find:context.Dp,status:context.Mp},boards.janggi,
  {find:(s,m)=>janggiRules.moves(s).find(item=>item.f===m.f&&item.t===m.t),status:janggiRules.status}
 ]){
  assert.equal(engine.status(state).check,true);
  assert.ok(engine.find(state,{f:75,t:76}));
  assert.notEqual(engine.status(state).over,true);
 }
});
