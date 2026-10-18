import assert from 'node:assert/strict';
import fs from 'node:fs';
import {newGame,createEngine,advance,WEAPONS,windAt,WIND_MAX} from '../games/tank/engine.mjs';
assert.equal(fs.readFileSync(new URL('../games/tank/engine.mjs',import.meta.url),'utf8'),fs.readFileSync(new URL('../supabase/functions/tank/engine.mjs',import.meta.url),'utf8'));
assert.deepEqual(WEAPONS.map(w=>w.price),[0,0,0,2,1,2,1,1,3,3,1,1,3]);
assert.equal(WEAPONS[12].accuracy,.85);
assert.equal(WEAPONS[12].dmg,WEAPONS[0].dmg);
for(const weapon of WEAPONS.filter(w=>w.price>0&&w.name!=='핵탄'&&!['heal','teleport','dirt'].includes(w.kind)))assert.equal(weapon.r,WEAPONS[0].r,'other paid explosions use the basic shell radius');
assert.equal(WEAPONS[8].r,200,'nuclear shells restore their original large blast');
const gusts=Array.from({length:100000},(_,i)=>windAt(123456+i%17,1700000000000+i*2800+(i%2800)));
const strengths=gusts.map(w=>Math.round(Math.abs(w)/WIND_MAX*20));
const strongRate=strengths.filter(w=>w>=10).length/strengths.length;
assert.ok(strongRate>.195&&strongRate<.205,`strong winds should appear 20% of the time: ${strongRate}`);
assert.deepEqual([...new Set(strengths)].sort((a,b)=>a-b),Array.from({length:21},(_,i)=>i));
assert.ok(Math.min(...gusts)<-WIND_MAX*.8&&Math.max(...gusts)>WIND_MAX*.8,'gusts reach strong winds in both directions');
assert.ok(gusts.some(w=>Math.abs(w)<.003),'calm intervals remain possible');
assert.ok(gusts.every(w=>Math.abs(w)<=WIND_MAX));
assert.ok(Math.max(...gusts)-Math.min(...gusts)>.15,'maximum physical wind is doubled');
const weatherGame=newGame(['a','b','c'],'wind-test',881,1700000000000);
const observer=createEngine(weatherGame);observer.setWindTime(1700000003400);
assert.equal(observer.view().wind,windAt(weatherGame.weatherSeed,1700000003400),'aiming uses live shared weather');
const weatherCommand={type:'fire',weapon:0,angle:80,power:100,moves:[],windTime:1700000003700};
const replayWeather=createEngine(weatherGame);replayWeather.setWindTime(1700000099999);replayWeather.begin(weatherCommand);
const inFlight=new Set();let weatherFrames=0;
while(['fly','settle'].includes(replayWeather.view().state)&&weatherFrames++<18000){replayWeather.step();inFlight.add(replayWeather.view().wind.toFixed(6));}
assert.ok(inFlight.size>1,'wind changes during flight');
const authoritative=advance(weatherGame,0,weatherCommand).state;authoritative.tanks.forEach(t=>delete t.misses);
assert.deepEqual(replayWeather.snapshot(),authoritative,'accepted wind time overrides preview timing and replays identically');
for(const size of [2,4,12]){
 const initial=newGame(Array.from({length:size},(_,i)=>'탱크'+i),'room',size*777);
 assert.equal(initial.tanks.length,size);
 assert.deepEqual(createEngine(initial).snapshot(),initial);
 for(let weapon=0;weapon<WEAPONS.length;weapon++){
  // Aim near the tank to exercise terrain, explosions, damage and every special effect.
  const command={type:'fire',weapon,angle:weapon%2?75:100,power:15,moves:Array(80).fill(weapon%2?1:-1)};
  const result=advance(initial,0,command),client=createEngine(initial);assert.equal(client.begin(command),result.price);
  let frames=0;while(['fly','settle'].includes(client.view().state)&&frames++<18000){
   client.step();
   if((weapon>=3&&weapon<=9)||weapon===12)for(const boom of client.view().booms){assert.equal(boom.r,weapon===8?200:weapon===7?100:WEAPONS[0].r,'including split, repeat and homing explosions');assert.equal(boom.D,weapon===8?150:weapon===7?130:69,'large terrain effects have time to expand to full size');}
  }
  const rendered=client.snapshot();result.state.tanks.forEach(t=>delete t.misses);
  assert.deepEqual(rendered,result.state,`server and client replay match: ${size} players, weapon ${weapon}`);
  assert.ok(result.state.terrain.every(x=>Number.isInteger(x)&&x>=0&&x<=358));
  assert.ok(result.state.tanks.every(t=>Number.isFinite(t.x)&&Number.isFinite(t.y)&&t.hp>=0&&t.hp<=100));
  assert.deepEqual(createEngine(rendered).snapshot(),rendered,'snapshot preserves settled terrain');
 }
}
// A tank beyond a normal blast must still be damaged by the restored nuclear blast.
const nuclearGame=newGame(['self','nearby','outside'],'nuclear-range',881);
nuclearGame.terrain.fill(150);
nuclearGame.tanks.forEach((t,i)=>Object.assign(t,{x:[600,700,840][i],y:300,vy:0,hp:100}));
let nuclearTime=0;while(windAt(nuclearGame.weatherSeed,nuclearTime)!==0)nuclearTime+=2800;
const nuclearCommand={type:'fire',weapon:8,angle:90,power:5,moves:[],windTime:nuclearTime};
const basicBlast=advance(nuclearGame,0,{...nuclearCommand,weapon:0}),nuclearBlast=advance(nuclearGame,0,nuclearCommand);
assert.equal(basicBlast.state.tanks[1].hp,100);
assert.ok(nuclearBlast.state.tanks[1].hp<100,'nuclear damage reaches tanks 100 units away');
assert.equal(nuclearBlast.state.tanks[2].hp,100,'tanks outside the large blast remain safe');
assert.ok(nuclearBlast.state.terrain[350]>basicBlast.state.terrain[350],'the actual crater also expands');
assert.equal(nuclearBlast.price,3,'restoring the radius does not raise the price');
// Dirt fills the wider half-nuclear area without damaging tanks or raising its price.
const dirtBlast=advance(nuclearGame,0,{...nuclearCommand,weapon:7});
assert.equal(WEAPONS[7].r,WEAPONS[8].r/2);
assert.ok(dirtBlast.state.terrain[340]<150,'soil reaches 80 units from the impact');
assert.equal(dirtBlast.state.terrain[360],150,'terrain outside the 100-unit radius is unchanged');
assert.deepEqual(dirtBlast.state.tanks.map(t=>t.hp),[100,100,100]);
assert.equal(dirtBlast.price,1);
// Homing searches around the impact point, ignores self/wrecks, and bursts only at the locked enemy.
const homingGame=newGame(['self','far','nearest','wreck'],'homing-test',881);
homingGame.seed=1;homingGame.terrain.fill(150);
homingGame.tanks.forEach((t,i)=>Object.assign(t,{x:[600,690,650,610][i],y:300,vy:0,hp:i===3?0:100}));
const homingCommand={type:'fire',weapon:12,angle:90,power:5,moves:[],windTime:nuclearTime};
const guided=createEngine(homingGame),guidedMask=guided.view().mask.slice();
assert.equal(guided.begin(homingCommand),3);
Object.assign(guided.view().shots[0],{x:610,y:300,vx:0,vy:0,age:99});guided.step();
assert.equal(guided.view().shots[0].homing.target,2,'choose the nearest living enemy, not self or wreck');
assert.equal(guided.view().booms.length,0,'locking does not create a first explosion');
assert.deepEqual(guided.view().mask,guidedMask);
let guidedFrames=0;const guidedBursts=new Set();
while(['fly','settle'].includes(guided.view().state)&&guidedFrames++<18000){guided.step();guided.view().booms.forEach(b=>guidedBursts.add(b));}
assert.ok(guidedFrames<18000);assert.equal(guidedBursts.size,1);
assert.equal([...guidedBursts][0].x,650);assert.equal([...guidedBursts][0].r,24);
assert.deepEqual(guided.snapshot().tanks.map(t=>t.hp),[100,100,66,0],'homing deals exactly normal direct-hit damage');
assert.equal(guided.snapshot().terrain[305],150,'the original impact point is intact');
assert.ok(guided.snapshot().terrain[325]>150,'the final normal explosion digs the target ground');
// The search radius is the nuclear radius, inclusive; equal-distance targets use stable seat order.
for(const [distance,expected] of [[199,1],[200,1],[200.01,undefined]]){
 const game=structuredClone(homingGame);game.tanks.forEach((t,i)=>Object.assign(t,{x:i?600+distance:600,hp:i<2?100:0}));
 const e=createEngine(game);e.begin(homingCommand);
 Object.assign(e.view().shots[0],{x:600,y:296,vx:0,vy:-.15*.35/2,age:99});e.step();
 assert.equal(e.view().shots[0]?.homing?.target,expected,`nuclear acquisition boundary: ${distance}`);
 if(expected===undefined)assert.equal(e.view().booms[0].r,24,'no target means an ordinary impact');
}
const tied=structuredClone(homingGame);tied.tanks[1].x=640;tied.tanks[2].x=560;
const tie=createEngine(tied);tie.begin(homingCommand);Object.assign(tie.view().shots[0],{x:600,y:296,vx:0,vy:-.15*.35/2,age:99});tie.step();
assert.equal(tie.view().shots[0].homing.target,1);
// A ridge cannot stop a successful lock; the guided shell climbs over it without carving it.
const ridge=structuredClone(homingGame);ridge.tanks[1].x=700;ridge.tanks[2].hp=0;ridge.terrain.fill(100,310,341);
const overHill=createEngine(ridge);overHill.begin(homingCommand);
Object.assign(overHill.view().shots[0],{x:600,y:296,vx:0,vy:0,age:99});
let hillFrames=0,sawCrossing=false;
while(['fly','settle'].includes(overHill.view().state)&&hillFrames++<18000){
 overHill.step();for(const s of overHill.view().shots)if(s.homing&&s.x>=620&&s.x<=680){sawCrossing=true;assert.ok(s.y<200,'guided shell clears the hill');}
}
assert.ok(sawCrossing&&hillFrames<18000);assert.equal(overHill.snapshot().tanks[1].hp,66);assert.equal(overHill.snapshot().terrain[320],100);
// Both accuracy outcomes replay exactly, and retrying an accepted shot cannot reroll the result.
for(const [seed,expectedHit] of [[1,true],[1700,false]]){
 const game=structuredClone(homingGame);game.seed=seed;
 const result=advance(game,0,homingCommand),again=advance(game,0,homingCommand),replay=createEngine(game);replay.begin(homingCommand);
 assert.deepEqual(again,result);assert.equal(result.price,3,'successful and missed guidance both cost 3 jju');
 let frames=0;while(['fly','settle'].includes(replay.view().state)&&frames++<18000)replay.step();
 result.state.tanks.forEach(t=>delete t.misses);assert.deepEqual(replay.snapshot(),result.state);
 assert.equal(result.state.tanks[2].hp,expectedHit?66:100);
 assert.equal(result.state.tanks[0].hp,expectedHit?100:66,'failed guidance bursts at the original impact');
}
let homingSuccesses=0;const homingTrials=2000;
for(let i=0;i<homingTrials;i++){
 const e=createEngine({...homingGame,seed:Math.imul(i,0x9e3779b9)>>>0});e.begin(homingCommand);
 if(e.view().shots[0].canHome)homingSuccesses++;
}
const homingRate=homingSuccesses/homingTrials;
assert.ok(homingRate>.84&&homingRate<.86,`guidance should succeed 85% of the time: ${homingRate}`);
// Healing reaches twice the basic radius, including opponents and the firing tank.
const healGame=newGame(['self','hurt','edge','outside','wreck'],'heal-test',881);
healGame.terrain.fill(150);
healGame.tanks.forEach((t,i)=>Object.assign(t,{x:[600,625,645,660,620][i],y:300,vy:0,hp:[50,88,50,50,0][i]}));
const healIndex=WEAPONS.findIndex(w=>w.kind==='heal');
assert.equal(WEAPONS[healIndex].r,WEAPONS[0].r*2);
let calmTime=0;while(windAt(healGame.weatherSeed,calmTime)!==0)calmTime+=2800;
const healEngine=createEngine(healGame),beforeMask=healEngine.view().mask.slice();
const healCommand={type:'fire',weapon:healIndex,angle:90,power:5,moves:[],windTime:calmTime};
assert.equal(healEngine.begin(healCommand),1);
let healFrames=0;const recoveryLabels=new Set();
while(['fly','settle'].includes(healEngine.view().state)&&healFrames++<18000){
 healEngine.step();healEngine.view().floats.filter(f=>f.heal).forEach(f=>recoveryLabels.add(f.txt));
}
assert.ok(healFrames<18000);
assert.deepEqual(healEngine.snapshot().tanks.map(t=>t.hp),[75,100,75,50,0],'heal once, cap at 100, leave distant and destroyed tanks unchanged');
assert.deepEqual(healEngine.snapshot().terrain,healGame.terrain,'healing never changes the ground height');
assert.deepEqual(healEngine.view().mask,beforeMask,'healing never digs or fills any ground cells');
assert.deepEqual([...recoveryLabels].sort(),['+12','+25']);
const healedServer=advance(healGame,0,healCommand).state;healedServer.tanks.forEach(t=>delete t.misses);
assert.deepEqual(healEngine.snapshot(),healedServer,'healing replays identically for server and all clients');
const teleportGame=newGame(['self','opponent'],'teleport',881);
teleportGame.terrain.fill(150);teleportGame.tanks.forEach((t,i)=>Object.assign(t,{x:600+i*1200,y:300,vy:0,hp:60+i*20}));
const teleport=createEngine(teleportGame),teleportMask=teleport.view().mask.slice();
const teleportCommand={type:'fire',weapon:11,angle:45,power:45,moves:[],windTime:calmTime};
assert.equal(teleport.begin(teleportCommand),1);let impact=null,teleportFrames=0;
while(['fly','settle'].includes(teleport.view().state)&&teleportFrames++<18000){
 teleport.step();const burst=teleport.view().booms.find(b=>b.w.kind==='teleport');if(burst)impact={x:burst.x,y:burst.y};
}
assert.ok(impact&&Math.abs(impact.x-600)>50,'teleport shell travels to a new landing spot');
assert.equal(teleport.snapshot().tanks[0].x,impact.x);assert.equal(teleport.snapshot().tanks[0].y,300);
assert.equal(teleport.snapshot().tanks[1].x,1800,'only the firing tank moves');
assert.deepEqual(teleport.snapshot().tanks.map(t=>t.hp),[60,80]);
assert.deepEqual(teleport.view().mask,teleportMask,'teleport leaves the terrain intact');
const teleportedServer=advance(teleportGame,0,teleportCommand).state;teleportedServer.tanks.forEach(t=>delete t.misses);
assert.deepEqual(teleport.snapshot(),teleportedServer);
// Every shell bursts once per projectile when it leaves either side of the map.
for(const side of [-1,1])for(let weapon=0;weapon<WEAPONS.length;weapon++){
 const missedGame=structuredClone(teleportGame);missedGame.tanks[0].x=side<0?30:2370;missedGame.tanks[1].x=1200;
 const missed=createEngine(missedGame),maskBefore=missed.view().mask.slice(),bursts=new Set();
 const command={type:'fire',weapon,angle:side<0?175:5,power:100,moves:[],windTime:calmTime};missed.begin(command);
 let frames=0;
 while(['fly','settle'].includes(missed.view().state)&&frames++<18000){missed.step();missed.view().booms.forEach(b=>bursts.add(b));}
 assert.ok(frames<18000,'misses finish the turn after their explosion');
 assert.equal(bursts.size,WEAPONS[weapon].count||1,'one explosion per missed projectile, without piercing repeats');
 assert.ok([...bursts].every(b=>b.outside&&b.fx&&(side<0?b.x<0:b.x>missed.view().W)));
 assert.deepEqual(missed.view().mask,maskBefore,'an edge indicator never changes terrain');
 assert.deepEqual(missed.snapshot().tanks.map(t=>[t.x,t.y,t.hp]),missedGame.tanks.map(t=>[t.x,t.y,t.hp]),'missed healing and teleport shells have no remote effect');
 const server=advance(missedGame,0,command).state;server.tanks.forEach(t=>delete t.misses);
 assert.deepEqual(missed.snapshot(),server,'outside explosions replay identically online');
}
// Exercise the lower boundary and rolling off either edge after ground contact.
for(const edge of ['bottom','roll-left','roll-right']){
 const engine=createEngine(teleportGame);engine.begin({type:'fire',weapon:edge==='bottom'?0:5,angle:90,power:5,moves:[],windTime:calmTime});
 const v=engine.view(),shot=v.shots[0];
 Object.assign(shot,edge==='bottom'?{x:v.W+1,y:v.MH+41,vx:0,vy:1}:{x:edge==='roll-left'?.1:v.W-.1,y:299,vx:edge==='roll-left'?-2:2,vy:0,rolling:true,rollT:0});
 engine.step();assert.equal(engine.view().shots.length,0);assert.equal(engine.view().booms.length,1);assert.equal(engine.view().booms[0].outside,true);
 engine.step();assert.equal(engine.view().booms.length,1,'edge burst is not repeated on the next tick');
}
const highArc=createEngine(teleportGame);highArc.begin({type:'fire',weapon:0,angle:90,power:100,moves:[],windTime:calmTime});
let aboveScreen=false,arcFrames=0;
while(['fly','settle'].includes(highArc.view().state)&&arcFrames++<18000){
 highArc.step();if(highArc.view().shots.some(s=>s.y<0))aboveScreen=true;
}
assert.ok(aboveScreen&&arcFrames<18000,'high shots can leave the top of the screen and fall back normally');
let game=newGame(['a','b','c'],'room',1);
for(let n=0;n<3;n++){
 game=advance(game,game.turn,{type:'timeout'}).state;
 game=advance(game,game.turn,{type:'fire',weapon:0,angle:0,power:100,moves:[]}).state;
 if(!game.over)game=advance(game,game.turn,{type:'fire',weapon:0,angle:180,power:100,moves:[]}).state;
}
assert.equal(game.tanks[0].hp,0,'three absent turns eliminate the player');
assert.throws(()=>advance(newGame(['a','b'],'room',1),1,{type:'fire',weapon:0,angle:60,power:50,moves:[]}),/not_your_turn/);
console.log(`PASS: 0–20 wind (${(strongRate*100).toFixed(2)}% strong), homing (${(homingRate*100).toFixed(2)}% success), nearest enemy/range/ridge/failure, healing/teleport without terrain damage, outside explosions, all 13 ammo types, 2/4/12-player replay parity`);
