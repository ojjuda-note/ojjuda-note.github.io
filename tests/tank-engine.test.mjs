import assert from 'node:assert/strict';
import fs from 'node:fs';
import {newGame,createEngine,advance,WEAPONS} from '../games/tank/engine.mjs';
assert.equal(fs.readFileSync(new URL('../games/tank/engine.mjs',import.meta.url),'utf8'),fs.readFileSync(new URL('../supabase/functions/tank/engine.mjs',import.meta.url),'utf8'));
assert.deepEqual(WEAPONS.map(w=>w.price),[0,0,0,2,1,2,1,1,3,3]);
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
console.log('PASS: all 10 ammo types, 2/4/12-player physics, server/client replay parity, terrain snapshots and absent-player elimination');
