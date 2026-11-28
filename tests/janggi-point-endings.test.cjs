const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../world.html'),'utf8');
const live=vm.createContext({});
vm.runInContext(html.slice(html.indexOf('var vt='),html.indexOf('var Xe=')),live);
const plain=value=>JSON.parse(JSON.stringify(value));

test('score the last attacking capture immediately, but keep playing with an attacker on either side',async()=>{
 const {janggiRules}=await import('../games/janggi/worker-rules.mjs');
 const {boards}=await import('../supabase/functions/game-action/engines.mjs');
 const {searchRules}=await import('../games/janggi/search-rules.mjs');
 const {chooseJanggiMasterMove}=await import('../games/janggi/master-ai.mjs');
 const b=Array(90).fill(''); b[76]='K'; b[13]='k'; b[84]='A'; b[86]='A'; b[3]='a'; b[75]='p';
 const state={b,t:'c',n:37,passes:0};
 for(const rules of [janggiRules,boards.janggi,{apply:live.ca,status:live.Mp}]){
  for(const piece of 'rRhHcCeEpP'){
   const board=b.slice(); board[75]=''; board[40]=piece;
   assert.equal(rules.status({...state,b:board}).over,false,piece);
  }
  const taken=rules.apply(state,{f:76,t:75});
  assert.deepEqual(plain(rules.status(taken)),{over:true,result:'c',reason:'points',points:{c:6,h:4.5}});
  const equal=taken.b.slice(); equal[86]='';
  assert.deepEqual(plain(rules.status({...taken,b:equal})),{over:true,result:'h',reason:'points',points:{c:3,h:4.5}});
  const kings=b.map(p=>p.toLowerCase()==='k'?p:'');
  assert.deepEqual(plain(rules.status({...state,b:kings})),{over:true,result:'h',reason:'points',points:{c:0,h:1.5}});
 }
 for(const level of ['easy','normal','hard','pro','master','grandmaster']){
  const move=chooseJanggiMasterMove(state,searchRules,{level,budgetMs:80});
  assert.equal(move.t,75);
  assert.equal(chooseJanggiMasterMove(janggiRules.apply(state,move),searchRules,{level}),null);
 }
});

test('the 200th ply settles the online game once, including a pass, using server scores',async()=>{
 const {boards}=await import('../supabase/functions/game-action/engines.mjs');
 const {verifyAction}=await import('../supabase/functions/game-action/rules.mjs');
 const {janggiRules}=await import('../games/janggi/worker-rules.mjs');
 const game={kind:'janggi',status:'playing',p1:'cho',p2:'han',janggi_layout:{c:'eheh',h:'hehe'},moves:[]};
 const board=boards.janggi;
 let state=board.init(game.janggi_layout),seed=193;
 for(let n=0;n<199;n++){
  const moves=live.Dr(state).filter(m=>!m.x && !live.jgBikjangKey(board.apply(state,m).b,state.t) && !live.hl(board.apply(state,m)));
  assert.ok(moves.length);
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const move=moves[seed%moves.length];
  game.moves.push({f:move.f,t:move.t});state=board.apply(state,move);
 }
 assert.equal(state.n,199);
 for(const status of [live.Mp,board.status,janggiRules.status])assert.equal(status(state).over,false);
 const pass={pass:1};
 const result=verifyAction(game,'han',{action:'game_move',p_ply:199,p_move:pass,p_result:'p1'});
 assert.equal(result.result,'p2');assert.equal(result.reason,'points');
 const end=board.apply(state,pass);
 for(const status of [live.Mp,board.status,janggiRules.status])
  assert.deepEqual(plain(status(end)),{over:true,result:'h',reason:'points',points:{c:72,h:73.5}});
 game.moves.push(pass);
 assert.throws(()=>verifyAction(game,'cho',{action:'game_move',p_ply:200,p_move:pass}),/game_already_over/);
});
