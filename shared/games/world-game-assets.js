/* Download game assets when a game is selected, and share successful loads. */
(()=>{
 'use strict';
 const revision='20261113-tarot-personal1'
 // Each game has its own release version. This never changes the Agit version.
 // Asset ?v= values below are cache revisions, independent of release numbers.
 const versions=Object.freeze({
  tarot:'1.9.0',
  saju:'2.4.0',
  group:'1.2.2',
  chacha_rush:'1.1.0',
  byeolcheonji:'1.0.5',
  festival:'1.6.2',
  restaurants:'1.13.2',
  recommendations:'1.7.2',
  archery:'3.4.0',
  roulette:'1.10.0',
  bang:'1.12.0',
  poker:'1.7.0',
  tank:'1.7.0',
  solitaire:'1.5.0',
  mines:'1.5.0',
  sacheonseong:'1.18.1',
  saetbyeol:'1.8.0',
  tour:'1.6.0',
  ttang:'1.7.0',
  photo_ttang:'1.6.0',
  mole:'1.8.0',
  runner:'3.4.0',
  stacker:'1.6.0',
  breakout:'1.8.0',
  spot:'1.14.0',
  screw:'2.24.0',
  janggi:'1.11.0',
  chess:'1.5.0',
  billiards:'1.5.0',
  matgo:'1.7.0'
 });
 const controls=['/shared/games/game-controls.css?v=20261109-unified-multiplayer-ui2','/shared/games/game-controls.js?v=20261106-source-folders1'];
 const session='/shared/games/game-session.js?v=20261108-streak-exit1';
// unchanged production source at line 38
  festival:['/games/festival-schedule/world-festival-schedule.css?v=20261107-festival-location2','/games/festival-schedule/world-festival-schedule.js?v=20261110-navigation-return1'],
  restaurants:[...restaurantRatings,...restaurantComments,...restaurantLocation,'/games/certified-restaurants/world-restaurant-guide.css?v=20261106-source-folders1','/games/certified-restaurants/world-restaurant-guide.js?v=20261111-restaurants-broadcast1','/games/certified-restaurants/recommended-restaurants.css?v=20261106-source-folders1',recommendedRestaurantScript],
  recommendations:[...restaurantRatings,...restaurantComments,...restaurantLocation,'/games/certified-restaurants/recommended-restaurants.css?v=20261106-source-folders1',recommendedRestaurantScript],
  archery:['/shared/games/world-tour-game.css?v=20261106-source-folders1','/games/forest-archer/world-archery-game.css?v=20261106-source-folders1','/games/forest-archer/world-archery-game.js?v=20261112-arcade-entry-return1'],
  roulette:[session,'/games/roulette/world-roulette-game.css?v=20261106-source-folders1','/games/roulette/world-roulette-game.js?v=20261112-arcade-entry-return1'],
  bang:[session,'/shared/games/world-tour-game.css?v=20261106-source-folders1','/games/bang/world-bang-game.js?v=20261112-arcade-entry-return1'],
  sacheonseong:['/games/sacheonseong/world-sacheonseong-game.css?v=20261106-source-folders1','/games/sacheonseong/world-sacheonseong-game.js?v=20261112-arcade-entry-return2'],
  poker:[session,'/shared/games/world-tour-game.css?v=20261106-source-folders1','/games/poker/world-poker-game.css?v=20261106-source-folders1','/games/poker/world-poker-game.js?v=20261112-arcade-entry-return1'],
  tank:[session,'/shared/games/world-tour-game.css?v=20261106-source-folders1','/games/tank/world-tank-game.css?v=20261106-source-folders1','/games/tank/world-tank-game.js?v=20261112-arcade-entry-return1'],
  solitaire:['/shared/games/world-tour-game.css?v=20261106-source-folders1',solitaireRules,'/games/solitaire/world-solitaire-game.js?v=20261112-arcade-entry-return1'],
  mines:['/shared/games/world-tour-game.css?v=20261106-source-folders1',minesRules,'/games/mines/world-mines-game.js?v=20261112-arcade-entry-return1'],
  saetbyeol:['/shared/games/world-tour-game.css?v=20261106-source-folders1','/games/saetbyeol/world-saetbyeol-game.js?v=20261112-arcade-entry-return1'],
  tour:[session,'/shared/games/world-tour-game.css?v=20261106-source-folders1','/games/ojjuda-tour/world-tour-game.js?v=20261112-arcade-entry-return1'],
  spot:['/games/spot-difference/world-spot-game.css?v=20261106-source-folders1','/games/spot-difference/world-spot-game.js?v=20261112-arcade-entry-return1'],
  ttang:['/games/ttang/ttang-bridge.js?v=20261112-arcade-entry-return1'],
  photo_ttang:['/games/photo-ttang/photo-ttang-access.js?v=20261106-source-folders1','/games/photo-ttang/photo-ttang-ranking.js?v=20261110-admin-record-free1','/games/photo-ttang/photo-ttang-bridge.js?v=20261112-arcade-entry-return1'],
  mole:[...controls,'/games/mole/mole-game.css?v=20261108-mole-grids1','/games/mole/mole-game.js?v=20261108-mole-seven1'],
  runner:[...controls,'/games/runner/runner-game.css?v=20261110-runner-seahorse-v3-1','/games/runner/runner-game.js?v=20261111-runner-inset1'],
  breakout:[...controls,'/games/breakout/breakout-game.css?v=20261106-source-folders1','/games/breakout/breakout-game.js?v=20261110-admin-game-preview1'],
// unchanged production source at line 66
