/* Download game assets when a game is selected, and share successful loads. */
(()=>{
 'use strict';
 const revision='20261104-festival-fireworks-full3';
 // Each game has its own release version. This never changes the Agit version.
 // Asset ?v= values below are cache revisions, independent of release numbers.
 const versions=Object.freeze({
  byeolcheonji:'1.0.1',
  festival:'1.3.0',
  restaurants:'1.9.1',
  recommendations:'1.5.2',
  archery:'2.6.1',
  roulette:'1.8.2',
  bang:'1.9.3',
  poker:'1.5.2',
  tank:'1.4.3',
  mines:'1.3.3',
  sacheonseong:'1.9.3',
  saetbyeol:'1.2.6',
  tour:'1.4.3',
  ttang:'1.4.3',
  photo_ttang:'1.3.3',
  mole:'1.4.3',
  runner:'1.3.3',
  stacker:'1.4.3',
  breakout:'1.5.3',
  spot:'1.10.5',
  screw:'1.5.3',
  janggi:'1.4.2',
  chess:'1.4.2',
  billiards:'1.4.2',
  matgo:'1.4.2'
 });
 const controls=['/game-controls.css?v=20261007-flow1','/game-controls.js?v=20261007-flow1'];
 const session='/game-session.js?v=20261031-fresh-games1';
 const minesRules='/games/mines/rules.js?v=20261022-ranks1';
 const restaurantRatings=['/restaurant-ratings.css?v=20261103-restaurants-ratings1','/restaurant-ratings.js?v=20261103-restaurants-ratings1'];
 const restaurantLocation=['/games/certified-restaurants/vendor/leaflet.css','/games/certified-restaurants/vendor/leaflet.js','/restaurant-location-picker.css?v=20261103-restaurants-auto-address1','/restaurant-location-picker.js?v=20261103-restaurants-auto-address1'];
 const groups={
  byeolcheonji:[],
  festival:['/world-festival-schedule.css?v=20261104-festival-fireworks-full3','/world-festival-schedule.js?v=20261104-festival-fireworks-full3'],
  restaurants:[...restaurantRatings,...restaurantLocation,'/world-restaurant-guide.css?v=20261104-agit-home1','/world-restaurant-guide.js?v=20261104-agit-home1','/recommended-restaurants.css?v=20261103-restaurants-map-pick1','/recommended-restaurants.js?v=20261104-restaurant-photos1'],
  recommendations:[...restaurantRatings,...restaurantLocation,'/recommended-restaurants.css?v=20261103-restaurants-map-pick1','/recommended-restaurants.js?v=20261104-restaurant-photos1'],
  archery:['/world-tour-game.css?v=20261104-game-fullscreen1','/world-archery-game.css?v=20261104-archery-admin-trial1','/world-archery-game.js?v=20261104-archery-straight-wall-drop1'],
  roulette:[session,'/world-roulette-game.css?v=20261031-roulette-multi2','/world-roulette-game.js?v=20261104-game-fullscreen1'],
  bang:[session,'/world-tour-game.css?v=20261104-game-fullscreen1','/world-bang-game.js?v=20261104-game-fullscreen1'],
  sacheonseong:['/world-sacheonseong-game.css?v=20261104-game-fullscreen1','/world-sacheonseong-game.js?v=20261104-game-fullscreen1'],
  poker:[session,'/world-tour-game.css?v=20261104-game-fullscreen1','/world-poker-game.css?v=20261021-poker-table1','/world-poker-game.js?v=20261104-game-fullscreen1'],
  tank:[session,'/world-tour-game.css?v=20261104-game-fullscreen1','/world-tank-game.css?v=20261018-fullscreen1','/world-tank-game.js?v=20261104-game-fullscreen1'],
  mines:['/world-tour-game.css?v=20261104-game-fullscreen1',minesRules,'/world-mines-game.js?v=20261104-game-fullscreen1'],
  saetbyeol:['/world-tour-game.css?v=20261104-game-fullscreen1','/world-saetbyeol-game.js?v=20261104-game-fullscreen1'],
  tour:[session,'/world-tour-game.css?v=20261104-game-fullscreen1','/world-tour-game.js?v=20261104-game-fullscreen1'],
  spot:['/world-spot-game.css?v=20261104-game-fullscreen1','/world-spot-game.js?v=20261104-game-progression-lock1'],
  ttang:['/ttang-bridge.js?v=20261104-game-fullscreen1'],
  photo_ttang:['/photo-ttang-access.js?v=20261006-red1','/photo-ttang-ranking.js?v=20261021-photo-idols1','/photo-ttang-bridge.js?v=20261103-guest-one-round1'],
  mole:[...controls,'/games/mole-game.css?v=20261006-garden1','/games/mole-game.js?v=20261006-garden1'],
  runner:[...controls,'/games/runner-game.css?v=20261006-fog3','/games/runner-game.js?v=20261027-runner-size1'],
  breakout:[...controls,'/games/breakout-game.css?v=20261102-breakout-round-choice1','/games/breakout-game.js?v=20261102-breakout-pickups2'],
  screw:[...controls,'/screw-games.css?v=20261004-design1','/screw-loader.js?v=20261103-game-results1'],
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
  return complete.has(url)||(url===minesRules&&typeof window.OjjudaMinesRules?.record==='function');
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
