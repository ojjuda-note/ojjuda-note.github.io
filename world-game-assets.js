/* Download game assets when a game is selected, and share successful loads. */
(()=>{
 'use strict';
 const revision='20261026-matgo-motion1';
 // Each game has its own release version. This never changes the Agit version.
 // Asset ?v= values below are cache revisions, independent of release numbers.
 const versions=Object.freeze({
  poker:'1.0.0',
  tank:'1.0.1',
  mines:'1.0.0',
  saetbyeol:'1.0.0',
  tour:'1.0.0',
  ttang:'1.0.0',
  photo_ttang:'1.0.0',
  mole:'1.0.0',
  runner:'1.0.0',
  stacker:'1.0.0',
  breakout:'1.0.0',
  spot:'1.2.2',
  screw:'1.0.2',
  janggi:'1.0.0',
  chess:'1.0.0',
  billiards:'1.0.0',
  matgo:'1.0.2'
 });
 const controls=['/game-controls.css?v=20261007-flow1','/game-controls.js?v=20261007-flow1'];
 const groups={
  poker:['/world-tour-game.css?v=20261012-marble-invite1','/world-poker-game.css?v=20261021-poker-table1','/world-poker-game.js?v=20261024-peek1'],
  tank:['/world-tour-game.css?v=20261012-marble-invite1','/world-tank-game.css?v=20261018-fullscreen1','/world-tank-game.js?v=20261022-ranks2'],
  mines:['/world-tour-game.css?v=20261012-marble-invite1','/games/mines/rules.js?v=20261022-ranks1','/world-mines-game.js?v=20261022-ranks1'],
  saetbyeol:['/world-tour-game.css?v=20261012-marble-invite1','/world-saetbyeol-game.js?v=20261021-guest1'],
  tour:['/world-tour-game.css?v=20261012-marble-invite1','/world-tour-game.js?v=20261022-ranks1'],
  spot:['/world-spot-game.css?v=20261003-mobile2','/world-spot-game.js?v=20261024-photo-car2'],
  ttang:['/ttang-bridge.js?v=20261022-ranks2'],
  photo_ttang:['/photo-ttang-access.js?v=20261006-red1','/photo-ttang-ranking.js?v=20261021-photo-idols1','/photo-ttang-bridge.js?v=20261023-entry1'],
  mole:[...controls,'/games/mole-game.css?v=20261006-garden1','/games/mole-game.js?v=20261006-garden1'],
  runner:[...controls,'/games/runner-game.css?v=20261006-fog3','/games/runner-game.js?v=20261006-bird1'],
  breakout:[...controls,'/games/breakout-game.js?v=20261007-flow1'],
  screw:[...controls,'/screw-games.css?v=20261004-design1','/screw-loader.js?v=20261025-rank1'],
  stacker:controls
 };
 const requests=new Map(),complete=new Set();
 // Pull-to-refresh must notice game releases even when the Agit version stays
 // the same. Share an in-flight check; an offline check must not block rankings.
 let releaseCheck=null;
 function updateRevision(){
  if(releaseCheck)return releaseCheck;
  releaseCheck=(async()=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),2000);
   try{
    const response=await fetch('/game-release.json?t='+Date.now(),{cache:'no-store',signal:controller.signal});
    if(!response.ok)return null;
    const next=(await response.json())?.revision;
    return typeof next==='string'&&/^\d{8}-[a-z0-9-]{1,60}$/.test(next)&&next!==revision?next:null;
   }catch{return null;}
   finally{clearTimeout(timer);}
  })().finally(()=>{releaseCheck=null;});
  return releaseCheck;
 }
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
  revision,updateRevision,
  version:id=>versions[id]||'',
  ready:id=>(groups[id]||[]).every(url=>complete.has(url)),
  load:id=>Promise.all((groups[id]||[]).map(loadResource))
 };
})();
