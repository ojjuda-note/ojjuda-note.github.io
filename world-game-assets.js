/* Download game assets when a game is selected, and share successful loads. */
(()=>{
 'use strict';
 const revision='20261031-ranking-clean1';
 // Each game has its own release version. This never changes the Agit version.
 // Asset ?v= values below are cache revisions, independent of release numbers.
 const versions=Object.freeze({
  bang:'1.7.2',
  poker:'1.3.1',
  tank:'1.2.2',
  mines:'1.1.1',
  sacheonseong:'1.4.1',
  saetbyeol:'1.1.1',
  tour:'1.2.2',
  ttang:'1.2.2',
  photo_ttang:'1.1.1',
  mole:'1.1.1',
  runner:'1.1.1',
  stacker:'1.1.1',
  breakout:'1.1.1',
  spot:'1.5.1',
  screw:'1.2.1',
  janggi:'1.2.2',
  chess:'1.2.2',
  billiards:'1.2.2',
  matgo:'1.2.1'
 });
 const controls=['/game-controls.css?v=20261007-flow1','/game-controls.js?v=20261007-flow1'];
 const session='/game-session.js?v=20261031-fresh-games1';
 const groups={
  bang:[session,'/world-tour-game.css?v=20261012-marble-invite1','/world-bang-game.js?v=20261031-best-streak-rankings1'],
  sacheonseong:['/world-sacheonseong-game.css?v=20261028-games-check1','/world-sacheonseong-game.js?v=20261031-fresh-games1'],
  poker:[session,'/world-tour-game.css?v=20261012-marble-invite1','/world-poker-game.css?v=20261021-poker-table1','/world-poker-game.js?v=20261031-fresh-games1'],
  tank:[session,'/world-tour-game.css?v=20261012-marble-invite1','/world-tank-game.css?v=20261018-fullscreen1','/world-tank-game.js?v=20261031-best-streak-rankings1'],
  mines:['/world-tour-game.css?v=20261012-marble-invite1','/games/mines/rules.js?v=20261022-ranks1','/world-mines-game.js?v=20261022-ranks1'],
  saetbyeol:['/world-tour-game.css?v=20261012-marble-invite1','/world-saetbyeol-game.js?v=20261021-guest1'],
  tour:[session,'/world-tour-game.css?v=20261012-marble-invite1','/world-tour-game.js?v=20261031-best-streak-rankings1'],
  spot:['/world-spot-game.css?v=20261003-mobile2','/world-spot-game.js?v=20261031-fresh-games1'],
  ttang:['/ttang-bridge.js?v=20261031-best-streak-rankings1'],
  photo_ttang:['/photo-ttang-access.js?v=20261006-red1','/photo-ttang-ranking.js?v=20261021-photo-idols1','/photo-ttang-bridge.js?v=20261031-fresh-games1'],
  mole:[...controls,'/games/mole-game.css?v=20261006-garden1','/games/mole-game.js?v=20261006-garden1'],
  runner:[...controls,'/games/runner-game.css?v=20261006-fog3','/games/runner-game.js?v=20261027-runner-size1'],
  breakout:[...controls,'/games/breakout-game.js?v=20261007-flow1'],
  screw:[...controls,'/screw-games.css?v=20261004-design1','/screw-loader.js?v=20261031-fresh-games1'],
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
