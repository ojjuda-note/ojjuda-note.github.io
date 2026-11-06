const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const source=fs.readFileSync(path.join(__dirname,'../world.html'),'utf8');
const browser=vm.createContext({Date,Math});
vm.runInContext(source.slice(source.indexOf('var Yh='),source.indexOf('var Xe=')),browser);
const local={init:browser.vp,apply:browser.ca,find:browser.Dp,status:browser.Mp,best:browser.Bp};
const plain=value=>JSON.parse(JSON.stringify(value));
// Clearing the centre pawns opens a real, legal facing-king position.
// Han then alternately blocks and reopens it while Cho shuttles a rook.
const moves=[{f:58,t:57},{f:31,t:30},{f:81,t:72},{f:30,t:31},{f:72,t:81},{f:31,t:30},{f:81,t:72},{f:30,t:31},{f:72,t:81},{f:31,t:30}];
const replay=(engine,history)=>history.reduce((state,input)=>{const move=engine.find(state,input,true);assert.ok(move);return engine.apply(state,move);},engine.init());
const engines=async()=>[local,(await import('../supabase/functions/game-action/engines.mjs')).boards.janggi];

test('bikjang requires both kings on one open file, with the full board and turn in the key',()=>{
 const board=Array(90).fill('');board[13]='k';board[76]='K';
 assert.ok(browser.jgBikjangKey(board,'c'));
 assert.notEqual(browser.jgBikjangKey(board,'c'),browser.jgBikjangKey(board,'h'));
 board[40]='P';assert.equal(browser.jgBikjangKey(board,'c'),null);
 board[40]='';board[13]='';board[12]='k';assert.equal(browser.jgBikjangKey(board,'c'),null);
 board[12]='';assert.equal(browser.jgBikjangKey(board,'c'),null);
});

test('the third identical bikjang is a draw, including the otherwise blocked third shuttle',async()=>{
 for(const engine of await engines()){
  let state=engine.init();
  for(let i=0;i<moves.length;i++){
   assert.ok(!engine.status(state).over,`play continues before move ${i+1}`);
   const move=engine.find(state,moves[i]);assert.ok(move,`move ${i+1} remains legal`);
   state=engine.apply(state,move);
   if(i===1||i===5)assert.ok(!engine.status(state).over,'first and second occurrences do not end the game');
  }
  assert.deepEqual(plain(engine.status(state)),{over:true,result:'draw',reason:'bikjang'});
  assert.equal(engine.best(state,'normal',50),null,'AI cannot move after the draw');
 }
});

test('different bikjang positions and opposite turns do not count as the same position',async()=>{
 for(const engine of await engines()){
  let state=replay(engine,moves.slice(0,2));
  state=engine.apply(state,{pass:1});
  assert.equal(Object.values(state.bikjangKeys).filter(n=>n===1).length,2);
  assert.ok(!engine.status(state).over);
  state=replay(engine,moves.slice(0,3));
  assert.ok(Object.values(state.bikjangKeys).every(n=>n===1));
  assert.ok(!engine.status(state).over);
 }
});

test('passing in bikjang reaches the same-position draw without premature point scoring',async()=>{
 for(const engine of await engines()){
  let state=replay(engine,moves.slice(0,2));
  for(let i=0;i<4;i++){
   assert.ok(!engine.status(state).over);assert.ok(engine.find(state,{pass:1}));state=engine.apply(state,{pass:1});
  }
  assert.equal(engine.status(state).result,'draw');assert.equal(engine.status(state).reason,'bikjang');
  const normal=replay(engine,[{pass:1},{pass:1}]);assert.equal(engine.status(normal).reason,'points');
 }
});

test('undo, replay and AI search keep bikjang counts immutable and consistent',async()=>{
 const all=await engines();
 for(const engine of all){
  const state=replay(engine,moves.slice(0,-1)),before=plain(state);
  engine.best(state,'easy',50);assert.deepEqual(plain(state),before);
  const done=engine.apply(state,engine.find(state,moves.at(-1)));
  assert.deepEqual(plain(state),before,'finishing the game preserves the undo snapshot');
  assert.ok(!engine.status(state).over);assert.equal(engine.status(done).reason,'bikjang');
  assert.deepEqual(plain(done),plain(replay(engine,moves)));
 }
 assert.deepEqual(plain(replay(all[0],moves)),plain(replay(all[1],moves)));
});

test('server stores the third bikjang as a draw and ignores client winner claims',async()=>{
 const {verifyAction}=await import('../supabase/functions/game-action/rules.mjs');
 const {createHandler}=await import('../supabase/functions/game-action/handler.mjs');
 const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000010';
 const game={id,kind:'janggi',p1:a,p2:b,status:'playing',moves:[],janggi_layout:{c:'eheh',h:'hehe'},updated_at:'2026-11-06T13:00:00Z'};
 let checked;
 for(const move of moves){
  checked=verifyAction(game,game.moves.length%2?b:a,{action:'game_move',p_ply:game.moves.length,p_move:move});
  game.moves.push(checked.move);
 }
 assert.equal(checked.result,'draw');assert.equal(checked.reason,'bikjang');
 game.moves.pop();let committed;
 const handler=createHandler({env:key=>({SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'server-only',SUPABASE_ANON_KEY:'public'})[key],fetchImpl:async(url,options)=>{
  if(url.includes('/rpc/'))committed=JSON.parse(options.body);
  return new Response(JSON.stringify(url.endsWith('/user')?{id:b}:url.includes('/board_games')?[game]:null));
 }});
 const response=await handler(new Request('https://edge.invalid',{method:'POST',headers:{authorization:'Bearer member',origin:'https://ojjuda.kr'},body:JSON.stringify({action:'game_move',p_id:id,p_ply:9,p_move:moves.at(-1),p_result:'p2'})}));
 assert.equal(response.status,200);assert.equal((await response.json()).result,'draw');
 assert.equal(committed.p_result,'draw');assert.equal(committed.p_reason,'bikjang');
});

test('the result screen says draw with the short bikjang reason',()=>{
 const start=source.indexOf('function worldBoardResultMarkup('),end=source.indexOf('var cPromoGlyph=',start);
 const ctx=vm.createContext({E:{kind:'janggi',over:{result:'draw',reason:'bikjang'},mode:'online'},Op:()=>({}),worldGameResultKey:()=>'',worldGameResultMarkup:args=>{ctx.result=args;return 'result';}});
 vm.runInContext(source.slice(start,end),ctx);ctx.worldBoardResultMarkup();
 assert.equal(ctx.result.outcome,'draw');assert.equal(ctx.result.metric,'같은 빅장 3회');
});
