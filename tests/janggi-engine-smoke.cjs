// Exercise the exact WASM and NNUE files staged for Pages, including their UCI
// options and board coordinates. No browser account or saved games are needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
 const staged = path.resolve(process.argv[2], 'games/janggi/fairy-4d4b393-9991472750de');
 const {BOOK_FILE,openingCounts,warmOpeningBook} = await import('../games/janggi/opening-book.mjs?v=20261115-janggi-book1');
 const data = fs.readFileSync(path.join(path.dirname(staged),BOOK_FILE));
 const book = JSON.parse(data);
 assert.deepEqual(book.meta.accepted,[23529,24641]);
 assert.equal(Object.keys(book.positions).length,4306);
 global.location = new URL('https://ojjuda.kr');
 global.fetch = async url => {
  assert.equal(path.basename(url.pathname),BOOK_FILE);
  return {ok:true,json:async()=>book};
 };
 await warmOpeningBook();
 const {createNeuralPlayer} = await import('../games/janggi/neural-player.mjs');
 const {createJanggiStart,janggiRules} = await import('../games/janggi/worker-rules.mjs');
 for(const c of ['eheh','ehhe','heeh','hehe'])for(const h of ['eheh','ehhe','heeh','hehe']){
  const state=createJanggiStart({c,h});
  const legal=new Set(janggiRules.moves(state).map(m=>String(m.f*90+m.t)));
  const counts=openingCounts(state);
  assert.ok(Object.keys(counts).length>1);
  assert.ok(Object.entries(counts).every(([id,n])=>legal.has(id)&&n>=8));
 }
 const engine = await require(path.join(staged,'stockfish.js'))({
  wasmBinary:fs.readFileSync(path.join(staged,'stockfish.wasm'))
 });
 const bridge = {
  postMessage(msg){
   if(typeof msg==='string')return engine.postMessage(msg);
   engine.FS.writeFile('/janggi.nnue',fs.readFileSync(path.join(staged,path.basename(msg.url))));
   setImmediate(()=>bridge.onmessage({data:'nnue-ready'}));
  },
  terminate(){}
 };
 engine.addMessageListener(data=>bridge.onmessage({data}));
 const player=createNeuralPlayer(()=>bridge);
 assert.equal(await player.start(),true);
 const board=Array(90).fill('');
 for(const [sq,piece] of [[0,'R'],[12,'a'],[13,'k'],[39,'P'],[41,'H'],[75,'K'],[86,'C'],[89,'p']])board[sq]=piece;
 for(const level of ['pro','master','grandmaster']){
  const start=createJanggiStart();
  const opening=await player.choose(start,level,janggiRules,1200);
  assert.ok(opening&&janggiRules.moves(start).some(m=>m.f===opening.f&&m.t===opening.t));
  const position={b:board,t:'c',n:24,passes:0};
  const mate=await player.choose(position,level,janggiRules,1200);
  assert.deepEqual(mate,{f:0,t:5});
  assert.equal(janggiRules.status(janggiRules.apply(position,mate)).reason,'checkmate');
 }
 console.log('PASS: shipped Fairy-Stockfish and NNUE, opening book for all layouts and one-move mate on all three tiers');
 process.exit(0);
})().catch(error=>{console.error(error);process.exit(1)});
