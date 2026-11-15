// Exercise the exact WASM and NNUE files staged for Pages, including their UCI
// options and board coordinates. No browser account or saved games are needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
 const staged = path.resolve(process.argv[2], 'games/janggi/fairy-4d4b393-9991472750de');
 const {createNeuralPlayer} = await import('../games/janggi/neural-player.mjs');
 const {createJanggiStart,janggiRules} = await import('../games/janggi/worker-rules.mjs');
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
 console.log('PASS: shipped Fairy-Stockfish and NNUE, openings and one-move mate on all three tiers');
 process.exit(0);
})().catch(error=>{console.error(error);process.exit(1)});
