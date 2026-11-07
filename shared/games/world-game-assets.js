/* Download game assets when a game is selected, and share successful loads. */
(()=>{
 'use strict';
 const revision='20261107-restaurants-slot50-gangwon-5';
 // Each game has its own release version. This never changes the Agit version.
 // Asset ?v= values below are cache revisions, independent of release numbers.
 const versions=Object.freeze({
  group:'1.2.1',
  byeolcheonji:'1.0.5',
  festival:'1.6.1',
  restaurants:'1.11.10',
  recommendations:'1.6.1',
  archery:'3.2.1',
  roulette:'1.9.1',
  bang:'1.10.1',
  poker:'1.6.1',
  tank:'1.5.1',
  solitaire:'1.2.1',
  mines:'1.4.1',
  sacheonseong:'1.10.1',
  saetbyeol:'1.3.1',
  tour:'1.5.1',
  ttang:'1.5.1',
  photo_ttang:'1.4.1',
  mole:'1.5.1',
  runner:'1.4.1',
  stacker:'1.5.1',
  breakout:'1.6.4',
  spot:'1.11.2',
  screw:'2.22.2',
  janggi:'1.6.0',
  chess:'1.4.4',
  billiards:'1.4.4',
  matgo:'1.5.1'
 });
 const controls=['/shared/games/game-controls.css?v=20261106-source-folders1','/shared/games/game-controls.js?v=20261106-source-folders1'];
 const session='/shared/games/game-session.js?v=20261106-source-folders1';
 const minesRules='/games/mines/rules.js?v=20261022-ranks1';
 const solitaireRules='/games/solitaire/rules.js?v=20261106-solitaire-ranking1';
 const restaurantRatings=['/games/certified-restaurants/restaurant-ratings.css?v=20261106-source-folders1','/games/certified-restaurants/restaurant-ratings.js?v=20261106-source-folders1'];
 const restaurantLocation=['/games/certified-restaurants/vendor/leaflet.css','/games/certified-restaurants/vendor/leaflet.js','/games/certified-restaurants/restaurant-location-picker.css?v=20261106-source-folders1','/games/certified-restaurants/restaurant-location-picker.js?v=20261106-source-folders1'];
 const groups={
  group:[],
  byeolcheonji:[],
  festival:['/games/festival-schedule/world-festival-schedule.css?v=20261107-festival-location2','/games/festival-schedule/world-festival-schedule.js?v=20261107-festival-location2'],
  restaurants:[...restaurantRatings,...restaurantLocation,'/games/certified-restaurants/world-restaurant-guide.css?v=20261106-source-folders1','/games/certified-restaurants/world-restaurant-guide.js?v=20261107-restaurants-slot50-gangwon-5','/games/certified-restaurants/recommended-restaurants.css?v=20261106-source-folders1','/games/certified-restaurants/recommended-restaurants.js?v=20261106-source-folders1'],
  recommendations:[...restaurantRatings,...restaurantLocation,'/games/certified-restaurants/recommended-restaurants.css?v=20261106-source-folders1','/games/certified-restaurants/recommended-restaurants.js?v=20261106-source-folders1'],
  archery:['/shared/games/world-tour-game.css?v=20261106-source-folders1','/games/forest-archer/world-archery-game.css?v=20261106-source-folders1','/games/forest-archer/world-archery-game.js?v=20261106-source-folders1'],
  roulette:[session,'/games/roulette/world-roulette-game.css?v=20261106-source-folders1','/games/roulette/world-roulette-game.js?v=20261106-source-folders1'],
  bang:[session,'/shared/games/world-tour-game.css?v=20261106-source-folders1','/games/bang/world-bang-game.js?v=20261106-source-folders1'],
  sacheonseong:['/games/sacheonseong/world-sacheonseong-game.css?v=20261106-source-folders1','/games/sacheonseong/world-sacheonseong-game.js?v=20261106-source-folders1'],
  poker:[session,'/shared/games/world-tour-game.css?v=20261106-source-folders1','/games/poker/world-poker-game.css?v=20261106-source-folders1','/games/poker/world-poker-game.js?v=20261106-poker-red1'],
  tank:[session,'/shared/games/world-tour-game.css?v=20261106-source-folders1','/games/tank/world-tank-game.css?v=20261106-source-folders1','/games/tank/world-tank-game.js?v=20261106-source-folders1'],
  solitaire:['/shared/games/world-tour-game.css?v=20261106-source-folders1',solitaireRules,'/games/solitaire/world-solitaire-game.js?v=20261107-solitaire-hold250-1'],
  mines:['/shared/games/world-tour-game.css?v=20261106-source-folders1',minesRules,'/games/mines/world-mines-game.js?v=20261106-source-folders1'],
  saetbyeol:['/shared/games/world-tour-game.css?v=20261106-source-folders1','/games/saetbyeol/world-saetbyeol-game.js?v=20261106-source-folders1'],
  tour:[session,'/shared/games/world-tour-game.css?v=20261106-source-folders1','/games/ojjuda-tour/world-tour-game.js?v=20261106-source-folders1'],
  spot:['/games/spot-difference/world-spot-game.css?v=20261106-source-folders1','/games/spot-difference/world-spot-game.js?v=20261107-spot-touch-area1'],
  ttang:['/games/ttang/ttang-bridge.js?v=20261106-source-folders1'],
  photo_ttang:['/games/photo-ttang/photo-ttang-access.js?v=20261106-source-folders1','/games/photo-ttang/photo-ttang-ranking.js?v=20261106-source-folders1','/games/photo-ttang/photo-ttang-bridge.js?v=20261106-source-folders1'],
  mole:[...controls,'/games/mole/mole-game.css?v=20261106-source-folders1','/games/mole/mole-game.js?v=20261106-source-folders1'],
  runner:[...controls,'/games/runner/runner-game.css?v=20261106-source-folders1','/games/runner/runner-game.js?v=20261106-source-folders1'],
  breakout:[...controls,'/games/breakout/breakout-game.css?v=20261106-source-folders1','/games/breakout/breakout-game.js?v=20261107-breakout-speed-reset1'],
  screw:[...controls,'/games/screw/screw-games.css?v=20261106-source-folders1','/games/screw/screw-loader.js?v=20261107-screw-box-touch1'],
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
 function resourceReady(url){
  return complete.has(url)||(url===minesRules&&typeof window.OjjudaMinesRules?.record==='function')||(url===solitaireRules&&typeof window.OjjudaSolitaireRules?.record==='function');
 }
 function loadResource(url){
  if(resourceReady(url))return Promise.resolve();
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
 function waitForAssets(work){
  return new Promise((resolve,reject)=>{
   // Keep the original script and its shared request alive: removing a pending
   // script cannot guarantee that it will not execute after a retry is inserted.
   const timer=setTimeout(()=>reject(Error('game_asset_timeout')),15000);
   work.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
  });
 }
 window.OjjudaGameAssets={
  revision,updateRevision,
  version:id=>versions[id]||'',
  ready:id=>(groups[id]||[]).every(resourceReady),
  load:id=>waitForAssets(Promise.all((groups[id]||[]).map(loadResource)))
 };
})();
