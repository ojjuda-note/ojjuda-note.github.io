/* Download game assets when a game is selected, and share successful loads. */
(()=>{
 'use strict';
 const controls=['/game-controls.css?v=20261007-flow1','/game-controls.js?v=20261007-flow1'];
 const groups={
  spot:['/world-spot-game.css?v=20261003-mobile2','/world-spot-game.js?v=20261009-entry1'],
  ttang:['/ttang-bridge.js?v=20261009-entry1'],
  photo_ttang:['/photo-ttang-access.js?v=20261006-red1','/photo-ttang-ranking.js?v=20261006-rank1','/photo-ttang-bridge.js?v=20261009-entry1'],
  mole:[...controls,'/games/mole-game.css?v=20261006-garden1','/games/mole-game.js?v=20261006-garden1'],
  runner:[...controls,'/games/runner-game.css?v=20261006-fog3','/games/runner-game.js?v=20261006-bird1'],
  breakout:[...controls,'/games/breakout-game.js?v=20261007-flow1'],
  screw:[...controls,'/screw-games.css?v=20261004-design1','/screw-loader.js?v=20261009-entry1'],
  stacker:controls
 };
 const requests=new Map(),complete=new Set();
 function loadResource(url){
  if(requests.has(url))return requests.get(url);
  const promise=new Promise((resolve,reject)=>{
   const style=url.split('?')[0].endsWith('.css'),node=document.createElement(style?'link':'script');
   if(style){node.rel='stylesheet';node.href=url;}else{node.src=url;node.async=false;}
   node.onload=()=>{complete.add(url);resolve();};
   node.onerror=()=>{requests.delete(url);node.remove();reject(Error('game_asset_unavailable'));};
   document.head.append(node);
  });
  requests.set(url,promise);return promise;
 }
 window.OjjudaGameAssets={
  ready:id=>(groups[id]||[]).every(url=>complete.has(url)),
  load:id=>Promise.all((groups[id]||[]).map(loadResource))
 };
})();
