const assert = require('node:assert/strict');
const {test} = require('node:test');

test('a popular opening can break a close tie, but cannot override tactics, legality or depth',async()=>{
 const {createJanggiStart,janggiRules}=await import('../games/janggi/worker-rules.mjs');
 const {createNeuralPlayer}=await import('../games/janggi/neural-player.mjs');
 const {bookKey,warmOpeningBook,openingCounts,pickOpeningMove}=await import('../games/janggi/opening-book.mjs?v=20261115-janggi-book1');
 const state=createJanggiStart();
 const [best,popular]=janggiRules.moves(state);
 const id=m=>m.f*90+m.t;
 const square=i=>'abcdefghi'[i%9]+(10-Math.floor(i/9));
 const notation=m=>square(m.f)+square(m.t);
 const positions={[bookKey(state)]:{[id(popular)]:90}};
 const originalFetch=global.fetch;
 global.location=new URL('https://ojjuda.kr');
 global.fetch=async()=>({ok:false});
 await warmOpeningBook();
 assert.equal(openingCounts(state),null);
 global.fetch=async()=>({ok:true,json:async()=>({positions})});
 await warmOpeningBook();
 global.fetch=originalFetch;delete global.location;
 assert.equal(openingCounts(state),positions[bookKey(state)]);
 assert.equal(openingCounts({...state,n:16}),null);
 assert.equal(openingCounts({...state,t:'h'}),null);
 assert.equal(openingCounts({...state,passes:1}),null);
 assert.equal(pickOpeningMove([best,popular],{[id(best)]:100,[id(popular)]:25},()=>0.8),popular);
 let alternate='';let extra='';
 const bridge={terminate(){},postMessage(command){
  const send=data=>queueMicrotask(()=>bridge.onmessage({data}));
  if(command==='uci')send('uciok');
  else if(command?.type==='load-nnue')send('nnue-ready');
  else if(command==='isready')send('readyok');
  else if(typeof command==='string'&&command.startsWith('go nodes')){
   send('info string NNUE evaluation using janggi');
   send('info depth 6 multipv 1 score cp 20 nodes 500 pv '+notation(best));
   send(alternate);if(extra)send(extra);
   send('bestmove '+notation(best));
  }
 }};
 const player=createNeuralPlayer(()=>bridge);await player.start();
 for(const [depth,score,uci,expected] of [[6,16,notation(popular),popular],[6,5,notation(popular),best],[5,18,notation(popular),best],[6,18,'a1a10',best]]){
  alternate=`info depth ${depth} multipv 2 score cp ${score} nodes 500 pv ${uci}`;
  assert.deepEqual(await player.choose(state,'master',janggiRules,100),expected);
 }
 alternate='info depth 6 multipv 2 score cp 18 nodes 500 pv '+notation(popular);
 extra='info depth 7 multipv 1 score mate 1 nodes 600 pv '+notation(best);
 assert.deepEqual(await player.choose(state,'grandmaster',janggiRules,100),best);
});
