import assert from 'node:assert/strict';
import fs from 'node:fs';
import {newGame,createEngine,advance,WEAPONS,windAt,WIND_MAX} from '../games/tank/engine.mjs';
assert.equal(fs.readFileSync(new URL('../games/tank/engine.mjs',import.meta.url),'utf8'),fs.readFileSync(new URL('../supabase/functions/tank/engine.mjs',import.meta.url),'utf8'));
assert.deepEqual(WEAPONS.map(w=>w.price),[0,0,0,2,1,2,1,1,3,3]);
const gusts=Array.from({length:300},(_,i)=>windAt(123456,1700000000000+i*200));
assert.ok(Math.min(...gusts)<-WIND_MAX*.8&&Math.max(...gusts)>WIND_MAX*.8,'gusts reach strong winds in both directions');
assert.ok(gusts.some(w=>Math.abs(w)<.003),'calm intervals remain possible');
assert.ok(gusts.every(w=>Math.abs(w)<=WIND_MAX));
assert.ok(Math.max(...gusts)-Math.min(...gusts)>.06,'wind range is substantially wider');
const weatherGame=newGame(['a','b','c'],'wind-test',881,1700000000000);
const observer=createEngine(weatherGame);observer.setWindTime(1700000003400);
assert.equal(observer.view().wind,windAt(weatherGame.weatherSeed,1700000003400),'aiming uses live shared weather');
const weatherCommand={type:'fire',weapon:0,angle:80,power:100,moves:[],windTime:1700000003700};
const replayWeather=createEngine(weatherGame);replayWeather.setWindTime(1700000099999);replayWeather.begin(weatherCommand);
const inFlight=new Set();let weatherFrames=0;
while(['fly','settle'].includes(replayWeather.view().state)&&weatherFrames++<18000){replayWeather.step();inFlight.add(replayWeather.view().wind.toFixed(6));}
assert.ok(inFlight.size>100,'wind changes during flight');
const authoritative=advance(weatherGame,0,weatherCommand).state;authoritative.tanks.forEach(t=>delete t.misses);
assert.deepEqual(replayWeather.snapshot(),authoritative,'accepted wind time overrides preview timing and replays identically');
for(const size of [2,4,12]){
 const initial=newGame(Array.from({length:size},(_,i)=>'탱크'+i),'room',size*777);
 assert.equal(initial.tanks.length,size);
 assert.deepEqual(createEngine(initial).snapshot(),initial);
 for(let weapon=0;weapon<10;weapon++){
  // Aim near the tank to exercise terrain, explosions, damage and every special effect.
  const command={type:'fire',weapon,angle:weapon%2?75:100,power:15,moves:Array(80).fill(weapon%2?1:-1)};
  const result=advance(initial,0,command),client=createEngine(initial);assert.equal(client.begin(command),result.price);
  let frames=0;while(['fly','settle'].includes(client.view().state)&&frames++<18000)client.step();
  const rendered=client.snapshot();result.state.tanks.forEach(t=>delete t.misses);
  assert.deepEqual(rendered,result.state,`server and client replay match: ${size} players, weapon ${weapon}`);
  assert.ok(result.state.terrain.every(x=>Number.isInteger(x)&&x>=0&&x<=358));
  assert.ok(result.state.tanks.every(t=>Number.isFinite(t.x)&&Number.isFinite(t.y)&&t.hp>=0&&t.hp<=100));
  assert.deepEqual(createEngine(rendered).snapshot(),rendered,'snapshot preserves settled terrain');
 }
}
let game=newGame(['a','b','c'],'room',1);
for(let n=0;n<3;n++){
 game=advance(game,game.turn,{type:'timeout'}).state;
 game=advance(game,game.turn,{type:'fire',weapon:0,angle:0,power:100,moves:[]}).state;
 if(!game.over)game=advance(game,game.turn,{type:'fire',weapon:0,angle:180,power:100,moves:[]}).state;
}
assert.equal(game.tanks[0].hp,0,'three absent turns eliminate the player');
assert.throws(()=>advance(newGame(['a','b'],'room',1),1,{type:'fire',weapon:0,angle:60,power:50,moves:[]}),/not_your_turn/);
console.log('PASS: variable strong/calm wind, shared clock, changing in-flight wind, all 10 ammo types, 2/4/12-player physics and replay parity');
