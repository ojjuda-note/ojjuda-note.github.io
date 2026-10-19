import assert from 'node:assert/strict';
import fs from 'node:fs';
import {newGame,createEngine,advance,WEAPONS,windAt,WIND_MAX,TANK_SCALE} from '../games/tank/engine.mjs';
function harmlessTurn(game){
 const t=game.tanks[game.turn];
 return advance(game,game.turn,{type:'fire',weapon:10,angle:t.lastAng??t.ang,power:t.lastPow??t.pow,moves:[]}).state;
}
function returnToSeat(game,seat){
 for(let i=0;game.turn!==seat&&i<game.tanks.length*2;i++)game=harmlessTurn(game);
 assert.equal(game.turn,seat,'each living player must get another turn');return game;
}
assert.equal(fs.readFileSync(new URL('../games/tank/engine.mjs',import.meta.url),'utf8'),fs.readFileSync(new URL('../supabase/functions/tank/engine.mjs',import.meta.url),'utf8'));
assert.deepEqual(WEAPONS.map(w=>w.price),[0,0,0,2,1,2,1,1,5,3,1,1,3,3,0]);
assert.equal(WEAPONS[12].accuracy,.85);
assert.equal(WEAPONS[12].dmg,WEAPONS[0].dmg);
for(const weapon of WEAPONS.filter(w=>w.price>0&&w.name!=='핵탄'&&!['heal','teleport','dirt','bunker'].includes(w.kind)))assert.equal(weapon.r,WEAPONS[0].r,'other paid explosions use the basic shell radius');
assert.equal(WEAPONS[8].r,200,'nuclear shells restore their original large blast');
const originalRadii=[24,42,14,24,24,24,24,100,200,24,48,18,24];
WEAPONS.slice(0,originalRadii.length).forEach((w,i)=>assert.ok(Math.abs(w.r-originalRadii[i]*(i===8?1:1.2))<1e-10,'all non-nuclear radii increase by 20%'));
assert.deepEqual(WEAPONS.slice(0,13).map(w=>w.dmg),[34,24,11,14,34,42,12,0,130,26,0,0,34],'balanced paid damage keeps the free and homing damage unchanged');
assert.ok(Math.abs(TANK_SCALE/.45-1.15)<1e-10,'tanks are 15% larger');
// A shot into exposed bedrock levels the entire map, conserves soil, and damages real falls.
for(const size of [3,12]){
 const game=newGame(Array.from({length:size},(_,i)=>String(i)),'bedrock-quake',881);
 game.wind=0;game.terrain.fill(150);
 const pit=Math.floor(game.width*.4625/2),safeX=Math.floor(game.width*.875);
 game.terrain.fill(358,pit,pit+Math.floor(game.width*.1875/2));
 game.terrain.fill(200,Math.floor(safeX/2)-30,Math.floor(safeX/2)+30);
 game.tanks.forEach((t,i)=>Object.assign(t,{x:i===0?pit*2-10:i===1?pit*2-30:i===2?safeX:i===3?pit*2+10:50+i*40,y:i===3?716:i===2?400:300,vy:0}));
 const command={type:'fire',weapon:0,angle:0,power:20*Math.sqrt(1600/game.width),moves:[]};
 const e=createEngine(game),events=new Set();assert.equal(e.begin(command),0);
 let frames=0,soil=null,collapseFrames=0;const landingHits=new Map();
 while(['fly','settle'].includes(e.view().state)&&frames++<1000){
  e.step();const v=e.view();
  for(const f of v.floats)if(f.t===0&&f.txt.startsWith('낙하 -'))landingHits.set(f.x,(landingHits.get(f.x)||0)+1);
  if(v.quake){
   events.add(v.quake);assert.equal(v.turn,0,'collapse cannot hand over a turn early');
   assert.throws(()=>e.snapshot(),/simulation_incomplete/);
   if(v.quake.phase==='collapse'){
    collapseFrames++;const count=v.mask.reduce((sum,cell)=>sum+cell,0);
    if(soil===null)soil=count;else assert.equal(count,soil,'earth slides downhill without being deleted or created');
    assert.ok(v.mask.subarray(v.FR*v.GW).every(cell=>cell===1),'the indestructible bottom stays solid');
   }
  }
 }
 assert.ok(frames<1000&&collapseFrames>1&&collapseFrames<=120);assert.equal(events.size,1);
 const saved=e.snapshot();assert.equal(e.view().mask.reduce((sum,cell)=>sum+cell,0),soil);
 assert.ok(saved.terrain[pit-5]>game.terrain[pit-5],'the cliff collapses away from the actual blast');
 assert.ok(saved.terrain[pit+10]<game.terrain[pit+10],'fallen earth fills the low ground');
 assert.ok(saved.tanks[0].y>360&&saved.tanks[0].hp<100&&saved.tanks[0].hp>0,'falling damages the shooter above the cliff');
 assert.ok(saved.tanks[1].y>360&&saved.tanks[1].hp<100,'a nearby tank outside the blast takes falling damage too');
 assert.equal(saved.tanks[2].hp,100,'a supported low tank receives no arbitrary global health penalty');
 assert.ok(Math.max(...saved.terrain)-Math.min(...saved.terrain)<=1,'the entire map is level to one terrain cell, even far from the impact');
 assert.ok(saved.tanks.every(t=>t.y===saved.terrain[Math.floor(t.x/2)]*2&&t.vy===0),'every tank finishes on the new surface before the next turn');
 if(size===12){const t=saved.tanks[3];assert.equal(t.hp,100);assert.ok(t.y<716&&t.y<=saved.terrain[Math.floor(t.x/2)]*2,'soil arriving at the bottom supports a tank without burying it');}
 assert.equal(landingHits.get(saved.tanks[0].x),1,'one actual landing causes exactly one damage event');
 assert.equal(landingHits.get(saved.tanks[1].x),1);
 assert.equal(saved.shotNo,1);assert.equal(saved.turn,1);assert.equal(saved.round,1);
 const server=advance(game,0,command);assert.equal(server.price,0);assert.equal(server.frames,frames);
 assert.deepEqual(advance(game,0,command),server,'retrying cannot cause another earthquake');
 server.state.tanks.forEach(t=>delete t.misses);
 assert.deepEqual(saved,server.state,'client and server replay the same quake and falling damage');
 assert.deepEqual(createEngine(saved).snapshot(),saved,'collapsed earth and health survive resuming');
}
// A naturally flying shell stops above bedrock, then its blast removes the last layer.
// Previously this left a flat-bottomed pit with no quake, collapse, or falling damage.
{
 const game=newGame(['self','cliff','safe'],'thin-floor-quake',881);game.wind=0;game.terrain.fill(150);game.terrain.fill(350,370,520);
 game.tanks.forEach((t,i)=>Object.assign(t,{x:[730,710,1400][i],y:300,vy:0}));
 const command={type:'fire',weapon:0,angle:0,power:20,moves:[]},e=createEngine(game),events=new Set();e.begin(command);
 let frames=0,impact=null;
 while(['fly','settle'].includes(e.view().state)&&frames++<1000){
  e.step();const v=e.view();
  if(!impact&&v.booms.length){impact={x:v.booms[0].x,y:v.booms[0].y};assert.equal(v.quake,null,'the shell hits soil before reaching the floor');}
  if(v.quake)events.add(v.quake);
 }
 assert.ok(impact.y>=700&&impact.y<702);assert.ok(frames<1000);assert.equal(events.size,1);
 const saved=e.snapshot();assert.ok(saved.terrain[365]>game.terrain[365],'the distant cliff collapses after the blast uncovers bedrock');
 assert.ok(saved.tanks[0].hp<100&&saved.tanks[1].hp<100,'tanks outside the blast take real falling damage');assert.ok(saved.tanks[2].hp<100,'a distant high plateau also drops and damages its tank');
 assert.ok(Math.max(...saved.terrain)-Math.min(...saved.terrain)<=1);
 assert.equal(saved.shotNo,1);assert.equal(saved.turn,1);
 const server=advance(game,0,command);server.state.tanks.forEach(t=>delete t.misses);assert.deepEqual(saved,server.state);
}
// Blasts clearing the last soil layer count; higher blasts and support effects do not.
for(const [weapon,surface,x,expected] of [[0,680,800,false],[0,700,800,true],[0,714,800,true],[0,716,800,true],[7,716,800,false],[10,716,800,false],[11,716,800,false],[0,716,-40,false],[2,716,800,true],[13,716,800,true],[14,716,800,true]]){
 const game=newGame(['self','safe'],'quake-contact',881);game.wind=0;game.terrain.fill(surface/2);
 game.tanks.forEach((t,i)=>Object.assign(t,{x:i?1400:100,y:surface,vy:0}));
 const e=createEngine(game);e.begin({type:'fire',weapon,angle:90,power:50,moves:[]});
 e.view().shots.forEach(s=>Object.assign(s,{x,y:surface-.1,vx:0,vy:2,age:99}));
 const events=new Set();let frames=0;
 while(['fly','settle'].includes(e.view().state)&&frames++<2000){e.step();if(e.view().quake)events.add(e.view().quake);}
 assert.ok(frames<2000);assert.equal(events.size,expected?1:0,`weapon ${weapon} at ${x}/${surface} has only the intended quake`);
 assert.equal(e.snapshot().shotNo,1);
}
// Landing damage is five times the old value, while short drops remain harmless.
for(const [height,hp] of [[0,100],[40,100],[60,90],[100,60],[200,0]]){
 const game=newGame(['falling','safe'],'fall-damage',881);game.terrain.fill(350);
 game.tanks.forEach((t,i)=>Object.assign(t,{x:i?1400:300,y:i?700:700-height,vy:0,hp:100}));
 const e=createEngine(game);let frames=0;
 while(e.view().tanks[0].y<700&&frames++<120)e.step();
 assert.ok(frames<120);assert.equal(e.view().tanks[0].hp,hp,`fivefold landing damage for a ${height}-unit drop`);
 assert.equal(e.view().tanks[1].hp,100);
 for(let i=0;i<60;i++)e.step();
 assert.equal(e.view().tanks[0].hp,hp,'one landing causes damage only once, capped at zero health');
}
// The collision tolerance must not discard a falling tank's remaining speed.
{
 const game=newGame(['falling','safe'],'landing-tolerance',881);game.terrain.fill(350);
 game.tanks.forEach((t,i)=>Object.assign(t,{x:i?1400:300,y:i?700:699.5,vy:i?0:6,hp:100}));
 const e=createEngine(game);e.step();
 assert.equal(e.view().tanks[0].y,700);assert.equal(e.view().tanks[0].vy,0);
 assert.equal(e.view().tanks[0].hp,80,'a tank half a pixel above the surface still takes its actual impact damage');
 assert.equal(e.view().floats.filter(f=>f.txt==='낙하 -20').length,1);
 for(let i=0;i<60;i++)e.step();
 assert.equal(e.view().tanks[0].hp,80,'resting on the ground cannot charge the landing twice');
}
// Later scatter pellets pass through each earlier crater, including impacts in one frame.
{
 const game=newGame(['self','far'],'scatter-craters',881);game.wind=0;game.terrain.fill(150);
 game.tanks.forEach((t,i)=>Object.assign(t,{x:i?1400:300,y:300,vy:0}));
 const e=createEngine(game);assert.equal(e.begin({type:'fire',weapon:2,angle:90,power:30,moves:[]}),0);
 e.view().shots.forEach((s,i)=>Object.assign(s,{x:800,y:[299.9,299.5,299.2][i],vx:0,vy:4,age:99}));
 e.step();
 assert.equal(e.view().booms.length,1,'only the leading pellet hits the original surface');
 assert.equal(e.view().shots.length,2,'the other two cross the removed surface in the same frame');
 const first=e.view().booms[0],hits=[first];
 assert.ok(first.cr<first.r,'the explosion animation continues after the crater opens');
 assert.equal(e.view().mask[157*e.view().GW+400],0,'the full crater is already empty for collision checks');
 assert.equal(e.view().mask[160*e.view().GW+400],1,'earth beyond the blast remains solid');
 let frames=0;
 while(e.view().shots.length&&frames++<120){
  const before=e.view().mask.slice(),gw=e.view().GW;e.step();
  for(const b of e.view().booms)if(!hits.includes(b)){
   assert.equal(before[Math.floor(b.y/2)*gw+Math.floor(b.x/2)],1,'each following pellet explodes on remaining earth');
   assert.ok(b.y-hits.at(-1).y>WEAPONS[2].r-2,'each pellet passes the previous crater before hitting');
   hits.push(b);
  }
 }
 assert.ok(frames<120);assert.equal(hits.length,3);assert.equal(e.view().shotNo,game.shotNo+1);
 while(['fly','settle'].includes(e.view().state)&&frames++<18000)e.step();
 assert.ok(frames<18000);assert.equal(e.view().turn,1,'the three explosions use one turn');
 assert.ok(e.snapshot().terrain[400]>165,'the chained craters persist after settling');
}
// Steel Rain opens at the apex, then ten weak pellets cover a wide fan.
for(const angle of [45,90,135])for(const wind of [-WIND_MAX,0,WIND_MAX]){
 const game=newGame(['self','far'],'steel-rain',882);game.wind=wind;game.terrain.fill(150);
 game.tanks.forEach((t,i)=>Object.assign(t,{x:i?(angle>90?100:1500):(angle===90?800:angle>90?1400:200),y:300,vy:0}));
 const e=createEngine(game),mask=e.view().mask.slice(),hp=e.view().tanks.map(t=>t.hp);
 assert.equal(e.begin({type:'fire',weapon:14,angle,power:70,moves:[]}),0);
 const parent=e.view().shots[0];let frames=0,previousVy=parent.vy;
 while(!parent.dead&&frames++<3000){previousVy=parent.vy;e.step();}
 assert.ok(frames<3000);assert.ok(previousVy<0&&parent.vy>=0,'split once at the highest point');
 assert.equal(e.view().booms.filter(b=>b.airburst).length,1);
 assert.deepEqual(e.view().mask,mask,'opening the casing causes no extra crater');
 assert.deepEqual(e.view().tanks.map(t=>t.hp),hp,'the airburst causes no extra damage');
 const pellets=e.view().shots;assert.equal(pellets.length,10);
 for(const s of pellets){
  assert.equal(s.w.kind,'steelrain-pellet');assert.equal(s.w.r,WEAPONS[2].r);assert.equal(s.w.dmg,WEAPONS[0].dmg/10);
  assert.equal(s.x,parent.x);assert.equal(s.y,parent.y);assert.ok(s.vy>0);assert.equal(s.owner,0);assert.equal(s.n,game.shotNo+1);
 }
 assert.equal(new Set(pellets.map(s=>s.vx)).size,10);
 assert.ok(Math.max(...pellets.map(s=>s.vx))-Math.min(...pellets.map(s=>s.vx))>9,'fan is much wider than the five-way split shell');
 const impacts=new Set();
 while(['fly','settle'].includes(e.view().state)&&frames++<18000){e.step();e.view().booms.filter(b=>!b.airburst).forEach(b=>impacts.add(b));}
 assert.ok(frames<18000);assert.equal(impacts.size,10,'each pellet impacts exactly once without splitting again');
 const xs=[...impacts].map(b=>b.x);assert.ok(Math.max(...xs)-Math.min(...xs)>200,'landing positions cover a wide area');
 assert.equal(e.view().shotNo,1);assert.equal(createEngine(e.snapshot()).view().tanks[0].basicWeapon,14);
}
{
 const game=newGame(['self','far'],'rain-choice',882);game.wind=0;game.terrain.fill(350);
 game.tanks.forEach((t,i)=>Object.assign(t,{x:i?1400:200,y:700,vy:0}));
 const fire=(saved,weapon)=>advance(saved,saved.turn,{type:'fire',weapon,angle:90,power:5,moves:[]}).state;
 let saved=fire(game,14);saved=fire(saved,10);assert.equal(saved.tanks[0].w,14);
 saved=fire(saved,10);saved=fire(saved,10);
 saved=returnToSeat(saved,0);
 assert.equal(createEngine(saved).view().tanks[0].w,14,'Steel Rain stays selected after a paid shot and reconnecting');
}
// Compare real impacts on the same flat ground, including the resulting falls.
function balancedImpact(weapon,offset=0,surface=300){
 const game=newGame(['self','target'],'balance-impact',882);game.wind=0;game.terrain.fill(surface/2);
 game.tanks.forEach((t,i)=>Object.assign(t,{x:i?800:100,y:surface,vy:0}));
 const e=createEngine(game);e.begin({type:'fire',weapon,angle:90,power:50,moves:[]});
 const air=WEAPONS[weapon].kind==='mirv';
 e.view().shots.forEach(s=>Object.assign(s,{x:800+offset,y:air?surface-180:surface-.1,vx:0,vy:air?.01:2,age:99}));
 const bursts=new Set();let frames=0;
 while(['fly','settle'].includes(e.view().state)&&frames++<18000){e.step();e.view().booms.forEach(b=>bursts.add(b));}
 assert.ok(frames<18000);
 return {damage:100-e.view().tanks[1].hp,drop:e.view().tanks[1].y-surface,terrain:e.snapshot().terrain,bursts:[...bursts]};
}
const normalImpact=balancedImpact(0),digImpact=balancedImpact(6),nukeImpact=balancedImpact(8);
assert.equal(normalImpact.damage,34);assert.equal(balancedImpact(4).damage,34);assert.equal(balancedImpact(5).damage,42);
assert.ok(digImpact.drop>normalImpact.drop*2.5&&digImpact.damage>normalImpact.damage,'paid digging adds a deep fall instead of duplicating a weaker basic blast');
assert.equal(digImpact.terrain[420],150,'deep excavation does not widen the basic blast');
assert.equal(balancedImpact(6,0,700).damage,12,'bedrock prevents extra digging and falling damage');
assert.equal(nukeImpact.damage,100,'a central nuclear impact still destroys a full-health tank');
assert.equal(nukeImpact.drop,200,'nuclear excavation restores its original full depth');
assert.ok(nukeImpact.terrain[495]>150&&nukeImpact.terrain[505]===150,'the nuclear crater still reaches nearly 200 units horizontally');
assert.equal(balancedImpact(8,20).damage,100,'restore the original close-range nuclear damage');
assert.ok(balancedImpact(8,100).damage>=95&&balancedImpact(8,150).damage>60,'restore nuclear damage and falling at the outer blast');
const splitImpact=balancedImpact(3);assert.equal(splitImpact.bursts.length,5);assert.ok(splitImpact.bursts.every(b=>b.w.dmg===14&&b.r===WEAPONS[0].r));
assert.ok(splitImpact.damage>=24,'paid split fire gains useful concentrated damage');
const collisionGame=newGame(['self','target','far'],'larger-tanks',881);collisionGame.wind=0;collisionGame.terrain.fill(150);
collisionGame.tanks.forEach((t,i)=>Object.assign(t,{x:[300,900,1400][i],y:300,vy:0}));
for(const [offset,hit] of [[5.8,true],[6.5,false]]){
 const e=createEngine(collisionGame);e.begin({type:'fire',weapon:0,angle:45,power:55,moves:[]});
 const s=e.view().shots[0],tip=18*TANK_SCALE/Math.sqrt(2);
 assert.ok(Math.abs(s.x-(300+tip))<1e-10);assert.ok(Math.abs(s.y-(300-9*TANK_SCALE-tip))<1e-10,'the shell starts at the enlarged barrel tip');
 Object.assign(s,{x:900+offset,y:300-6*TANK_SCALE,vx:0,vy:-.15*.35/2,age:99});e.step();
 assert.equal(e.view().booms.length,hit?1:0,'the hit boundary grows with the visible tank');
}
const gusts=Array.from({length:100000},(_,i)=>windAt(123456+i%17,1700000000000+i*2800+(i%2800)));
const strengths=gusts.map(w=>Math.round(Math.abs(w)/WIND_MAX*10));
const windRates=[[0,3,.7],[4,7,.2],[8,10,.1]].map(([lo,hi,expected])=>{
 const rate=strengths.filter(w=>w>=lo&&w<=hi).length/strengths.length;
 assert.ok(Math.abs(rate-expected)<.005,`wind ${lo}–${hi} should appear ${expected*100}% of the time: ${rate}`);
 return (rate*100).toFixed(2);
});
assert.deepEqual([...new Set(strengths)].sort((a,b)=>a-b),Array.from({length:11},(_,i)=>i));
assert.ok(Math.min(...gusts)<-WIND_MAX*.8&&Math.max(...gusts)>WIND_MAX*.8,'gusts reach strong winds in both directions');
assert.ok(gusts.some(w=>Math.abs(w)<.003),'calm intervals remain possible');
assert.ok(gusts.every(w=>Math.abs(w)<=WIND_MAX));
assert.equal(WIND_MAX,.038,'the strongest physical wind is half the previous maximum');
// Measure actual turn changes too: globally rerolling repeats would distort 70/20/10.
const turnSampler=createEngine(newGame(['a','b','c'],'wind-distribution',3381)),turnBands=[0,0,0];
let previousWind=turnSampler.view().wind;
for(let i=0;i<100000;i++){
 turnSampler.skip();const wind=turnSampler.view().wind,strength=Math.round(Math.abs(wind)/WIND_MAX*10);
 assert.notEqual(wind,previousWind);previousWind=wind;turnBands[strength<=3?0:strength<=7?1:2]++;
}
turnBands.forEach((count,i)=>assert.ok(Math.abs(count/100000-[.7,.2,.1][i])<.005,`actual turns must preserve the requested band probability: ${turnBands}`));
for(let count=2;count<=12;count++){
 const names=Array.from({length:count},(_,i)=>String(i)),oldWidth=800*Math.max(3,Math.ceil(count/3)+1);
 const compact=newGame(names,'compact-map',count*777),view=createEngine(compact).view();
 assert.equal(view.W,Math.round(oldWidth*2/3));assert.equal(compact.width,view.W);
 assert.equal(view.MH,720,'horizontal size changes without flattening the landscape');
 assert.equal(compact.terrain.length,Math.ceil((view.W+1)/2));
 assert.ok(compact.tanks.every(t=>t.x>=20&&t.x<=view.W-20));
 assert.deepEqual(createEngine(compact).snapshot(),compact,'all player counts reload the saved width, including odd widths');
 const old=createEngine({names,runId:'old-map',seed:count*777,width:oldWidth}).snapshot();delete old.width;
 old.wind=count%2?.076:-.076;
 const recovered=createEngine(old),restored=recovered.snapshot();
 assert.equal(restored.width,oldWidth,'pre-update saves retain their original map size');
 assert.deepEqual(restored.terrain,old.terrain);assert.deepEqual(restored.tanks,old.tanks);
 assert.equal(restored.wind,Math.sign(old.wind)*WIND_MAX,'older strong winds are capped at 10');
 const command={type:'fire',weapon:10,angle:78.25,power:30,moves:[]};
 recovered.begin(command);let frames=0;
 while(['fly','settle'].includes(recovered.view().state)&&frames++<18000)recovered.step();
 const server=advance(old,old.turn,command).state;server.tanks.forEach(t=>delete t.misses);
 assert.deepEqual(recovered.snapshot(),server,'legacy width and capped wind replay identically');
}
const weatherGame=newGame(['a','b','c'],'wind-test',881,1700000000000);
const observer=createEngine(weatherGame);observer.setWindTime(1700000003400);
for(let i=0;i<600;i++)observer.step();
assert.equal(observer.view().wind,weatherGame.wind,'waiting and clock updates cannot change this turn\'s wind');
assert.equal(createEngine(observer.snapshot()).view().wind,weatherGame.wind,'reconnecting preserves the current wind');
const weatherCommand={type:'fire',weapon:0,angle:80,power:100,moves:[],windTime:1700000003700};
const replayWeather=createEngine(weatherGame);replayWeather.setWindTime(1700000099999);replayWeather.begin(weatherCommand);
const inFlight=new Set();let weatherFrames=0;
while(['fly','settle'].includes(replayWeather.view().state)&&weatherFrames++<18000){inFlight.add(replayWeather.view().wind);replayWeather.step();}
assert.deepEqual([...inFlight],[weatherGame.wind],'aiming, flight and settling all use the same wind');
assert.notEqual(replayWeather.view().wind,weatherGame.wind,'the next turn always gets different wind');
const authoritative=advance(weatherGame,0,weatherCommand).state;authoritative.tanks.forEach(t=>delete t.misses);
assert.deepEqual(replayWeather.snapshot(),authoritative,'server and all clients replay the saved turn wind identically');
const laterShot=advance(weatherGame,0,{...weatherCommand,windTime:1700099999999}).state;
laterShot.tanks.forEach(t=>delete t.misses);laterShot.windTime=authoritative.windTime;
assert.deepEqual(laterShot,authoritative,'choosing a different firing time cannot reroll the wind or trajectory');
assert.notEqual(advance(weatherGame,0,{type:'timeout'}).state.wind,weatherGame.wind,'a missed turn changes the wind');
assert.notEqual(advance(weatherGame,0,{type:'surrender'}).state.wind,weatherGame.wind,'the current player surrendering changes the wind');
assert.equal(advance(weatherGame,1,{type:'surrender'}).state.wind,weatherGame.wind,'another player surrendering leaves this turn\'s wind alone');
// Each round grants every survivor one turn; the next round is shuffled and saved.
for(const size of [2,4,12]){
 let game=newGame(Array.from({length:size},(_,i)=>'seat'+i),'shuffle-rounds',size*777);
 const seats=Array.from({length:size},(_,i)=>i),orders=new Set();
 assert.deepEqual(game.turnOrder,seats);assert.equal(game.round,1);
 for(let round=1;round<=8;round++){
  const order=[...game.turnOrder],seen=new Set();orders.add(order.join(','));
  assert.deepEqual([...order].sort((a,b)=>a-b),seats);
  for(const seat of order){
   assert.equal(game.round,round);assert.equal(game.turn,seat);assert.ok(!seen.has(seat));seen.add(seat);
   assert.deepEqual(createEngine(JSON.parse(JSON.stringify(game))).snapshot().turnOrder,game.turnOrder,'reconnecting preserves the remaining order');
   const before=game;game=harmlessTurn(game);
   if(seen.size===size){
    assert.deepEqual(harmlessTurn(before),game,'retrying the last shot cannot reroll next round');
    const replay=createEngine(before),t=before.tanks[seat];
    replay.begin({type:'fire',weapon:10,angle:t.lastAng??t.ang,power:t.lastPow??t.pow,moves:[]});
    let frames=0;while(['fly','settle'].includes(replay.view().state)&&frames++<18000)replay.step();
    const expected=structuredClone(game);expected.tanks.forEach(t=>delete t.misses);
    assert.deepEqual(replay.snapshot(),expected,'all clients replay the same shuffled next turn');
   }
  }
  assert.equal(game.round,round+1);assert.equal(game.turnOrder.length,size);
 }
 assert.ok(orders.size>1,'later rounds do not keep the fixed seat order');
}
{
 let game=newGame(['a','b','c','d'],'shuffle-elimination',883);
 game=harmlessTurn(game);const wind=game.wind;
 game=advance(game,3,{type:'surrender'}).state;
 assert.equal(game.turn,1);assert.equal(game.wind,wind);assert.deepEqual(game.turnOrder,[1,2],'off-turn surrender does not consume the active turn');
 game=advance(game,1,{type:'timeout'}).state;assert.equal(game.turn,2);assert.deepEqual(game.turnOrder,[2]);
 game=advance(game,2,{type:'surrender'}).state;
 assert.equal(game.round,2);assert.deepEqual([...game.turnOrder].sort(),[0,1],'eliminated tanks stay out of the shuffle');
 const legacy=newGame(['a','b','c','d'],'legacy-rounds',884);legacy.turn=2;
 delete legacy.turnOrder;delete legacy.round;delete legacy.turnSeed;
 let restored=createEngine(legacy).snapshot();assert.equal(restored.turn,2);assert.deepEqual(restored.turnOrder,[2,3]);
 restored=harmlessTurn(restored);assert.equal(restored.turn,3);
 restored=harmlessTurn(restored);assert.equal(restored.round,2);assert.equal(restored.turnOrder.length,4);
}
// Each player keeps a separate free-shell choice, including after a paid shot or a reload.
let choices=newGame(['a','b','c'],'basic-choice',881);
choices.wind=0;choices.terrain.fill(150);
choices.tanks.forEach((t,i)=>Object.assign(t,{x:200+i*600,y:300,vy:0}));
const choose=(seat,weapon,basicWeapon)=>{choices=returnToSeat(choices,seat);choices=advance(choices,seat,{type:'fire',weapon,basicWeapon,angle:90,power:5,moves:[]}).state;};
choose(0,1);assert.equal(choices.tanks[1].w,0);
choose(1,2);assert.equal(choices.tanks[2].w,0);
choose(2,0);choices=returnToSeat(choices,0);assert.equal(choices.tanks[0].w,1,'large shell stays selected on the next own turn');
choose(0,10);choices=returnToSeat(choices,1);assert.equal(choices.tanks[1].w,2,'another player retains scattershot');
choose(1,10,0);choose(2,10);choices=returnToSeat(choices,0);assert.equal(choices.tanks[0].w,1,'a paid shell returns to the remembered free shell');
choose(0,2,1);choices=returnToSeat(choices,1);assert.equal(choices.tanks[1].w,0,'a newly selected free shell is remembered even when a paid shell is fired instead');
choose(1,10);choose(2,10);choices=returnToSeat(choices,0);assert.equal(choices.tanks[0].w,2,'changing to another free shell replaces the previous choice');
const restoredChoices=createEngine(choices).snapshot();
assert.deepEqual(restoredChoices.tanks.map(t=>t.basicWeapon),[2,0,0]);assert.equal(restoredChoices.tanks[0].w,2);
const legacy=structuredClone(weatherGame);delete legacy.windIndex;
legacy.tanks.forEach((t,i)=>{delete t.basicWeapon;t.w=[2,12,0][i];});
assert.deepEqual(createEngine(legacy).snapshot().tanks.map(t=>t.basicWeapon),[2,0,0],'older saved games recover free selections without repeating paid ammo');
assert.equal(createEngine(legacy).view().wind,legacy.wind,'older saved games keep their current wind');
for(const basicWeapon of [-1,3,1.5,'1',null])assert.throws(()=>advance(weatherGame,0,{...weatherCommand,basicWeapon}),/invalid_move/);
// Remember each player's last fired angle/power, including zero and quarter degrees.
let aimGame=newGame(['a','b','c'],'remember-aim',882);
aimGame.terrain.fill(150);aimGame.tanks.forEach((t,i)=>Object.assign(t,{x:200+i*600,y:300,vy:0}));
assert.deepEqual(aimGame.tanks.map(t=>[t.ang,t.pow]),[[90,5],[90,5],[90,5]],'new players start with the default aim');
const rememberedAim=[[0,100],[41.25,67],[180,5]];
for(const [angle,power] of rememberedAim)aimGame=advance(aimGame,aimGame.turn,{type:'fire',weapon:10,angle,power,moves:[]}).state;
aimGame=returnToSeat(aimGame,0);
assert.deepEqual(aimGame.tanks.map(t=>[t.ang,t.pow]),rememberedAim,'each player keeps their own settings when their turn returns');
const reopenedAim=createEngine(JSON.parse(JSON.stringify(aimGame))).snapshot();
assert.deepEqual(reopenedAim.tanks.map(t=>[t.ang,t.pow]),rememberedAim,'saved games preserve exact aim values');
const oldAim=structuredClone(aimGame);oldAim.tanks[0].ang=90;oldAim.tanks[0].pow=5;
assert.deepEqual(createEngine(oldAim).view().tanks.map(t=>[t.ang,t.pow]),rememberedAim,'older saves restore their recorded last shot instead of reset gauges');
aimGame=advance(aimGame,0,{type:'fire',weapon:10,angle:72.75,power:46,moves:[]}).state;
aimGame=returnToSeat(aimGame,1);
aimGame=advance(aimGame,1,{type:'timeout'}).state;
aimGame=advance(aimGame,2,{type:'surrender'}).state;
aimGame=returnToSeat(aimGame,0);
assert.deepEqual([aimGame.tanks[0].ang,aimGame.tanks[0].pow],[72.75,46],'a later shot replaces the saved settings even across skipped turns');
assert.deepEqual([aimGame.tanks[1].lastAng,aimGame.tanks[1].lastPow],[41.25,67],'missing a turn does not replace the last fired settings');
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
   if((weapon>=3&&weapon<=9)||weapon===12)for(const boom of client.view().booms){assert.equal(boom.r,weapon===8?200:weapon===7?120:28.8,'including split, repeat and homing explosions');assert.equal(boom.D,weapon===8?150:weapon===7?146:73,'large terrain effects have time to expand to full size');}
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
nuclearGame.wind=0;
nuclearGame.terrain.fill(150);
nuclearGame.tanks.forEach((t,i)=>Object.assign(t,{x:[600,700,840][i],y:300,vy:0,hp:100}));
const nuclearTime=0;
const nuclearCommand={type:'fire',weapon:8,angle:90,power:5,moves:[],windTime:nuclearTime};
const basicBlast=advance(nuclearGame,0,{...nuclearCommand,weapon:0}),nuclearBlast=advance(nuclearGame,0,nuclearCommand);
assert.equal(basicBlast.state.tanks[1].hp,100);
assert.ok(basicBlast.state.terrain[312]>150,'the enlarged normal blast digs beyond its old 24-unit radius');
assert.equal(basicBlast.state.terrain[316],150,'ground beyond the new normal radius remains intact');
assert.ok(nuclearBlast.state.tanks[1].hp<100,'nuclear damage reaches tanks 100 units away');
assert.equal(nuclearBlast.state.tanks[2].hp,100,'tanks outside the large blast remain safe');
assert.ok(nuclearBlast.state.terrain[350]>basicBlast.state.terrain[350],'the actual crater also expands');
assert.equal(nuclearBlast.price,5,'the restored nuclear shell costs five jju');
// Dirt grows by 20% too, without damaging tanks or raising its price.
const dirtBlast=advance(nuclearGame,0,{...nuclearCommand,weapon:7});
assert.equal(WEAPONS[7].r,120);
assert.ok(dirtBlast.state.terrain[355]<150,'soil reaches 110 units from the impact');
assert.equal(dirtBlast.state.terrain[370],150,'terrain outside the 120-unit radius is unchanged');
assert.deepEqual(dirtBlast.state.tanks.map(t=>t.hp),[100,100,100]);
assert.equal(dirtBlast.price,1);
// Bunker markers summon one vertical missile, then excavate underground before soil collapses.
const bunkerWeapon=WEAPONS.findIndex(w=>w.kind==='bunker');
assert.equal(bunkerWeapon,13);assert.equal(WEAPONS[bunkerWeapon].price,3);assert.equal(WEAPONS[bunkerWeapon].dmg,WEAPONS[0].dmg);
for(const wind of [-WIND_MAX,WIND_MAX]){
 const game=newGame(['self','nearby','far'],'bunker-test',881);game.wind=wind;game.terrain.fill(150);
 game.tanks.forEach((t,i)=>Object.assign(t,{x:[150,950,1450][i],y:300,vy:0}));
 const e=createEngine(game),original=e.view().mask.slice();e.begin({type:'fire',weapon:bunkerWeapon,angle:45,power:50,moves:[]});
 const marker=e.view().shots[0];Object.assign(marker,{x:600,y:300,vx:0,vy:0,age:99});e.step();
 const missile=e.view().shots[0],impactX=marker.x;
 assert.equal(e.view().shots.length,1);assert.ok(marker.dead&&missile.bunker);
 assert.equal(missile.x,impactX);assert.ok(missile.y<0,'the missile enters from above the sky');
 assert.deepEqual(e.view().mask,original,'the marker itself cannot excavate or explode');assert.equal(e.view().booms.length,0);
 const cell=(x,y)=>e.view().mask[Math.floor(y/2)*e.view().GW+Math.floor(x/2)];
 const phases=new Set(),bursts=new Set();let frames=0,previousY=missile.y,cavityChecked=false;
 while(['fly','settle'].includes(e.view().state)&&frames++<18000){
  for(const shot of e.view().shots){
   assert.ok(shot.bunker);phases.add(shot.bunker.phase);assert.equal(shot.x,impactX,'even maximum crosswinds cannot shift the vertical missile');
   assert.equal(shot.vx,0);assert.ok(shot.y>=previousY,'the missile only moves down');previousY=shot.y;
   assert.equal(e.view().booms.length,0,'penetration happens before detonation');
  }
  for(const boom of e.view().booms){
   bursts.add(boom);assert.equal(boom.x,impactX);assert.equal(boom.y,440,'detonate deep below the actual surface');
   if(boom.t===boom.D-1){
    assert.equal(cell(impactX+40,440),0,'the underground blast removes soil far beyond the narrow shaft');
    assert.equal(cell(impactX+40,320),1,'the overlying soil stays above the cavity until settling');
    assert.equal(cell(impactX,330),0,'the missile leaves an open penetration shaft');
    assert.equal(cell(impactX+100,440),1,'soil beyond the underground radius stays intact');cavityChecked=true;
   }
  }
  e.step();
 }
 assert.ok(frames<18000&&cavityChecked);assert.deepEqual([...phases],['fall','drill']);assert.equal(bursts.size,1);
 assert.equal(e.view().shotNo,1,'marker and missile are one shot and one turn');assert.equal(e.view().turn,1);
 const final=e.snapshot();assert.ok(final.terrain[Math.floor((impactX+40)/2)]>150,'the roof collapses into the excavated space');
 assert.equal(final.terrain[Math.floor((impactX+100)/2)],150);
 assert.deepEqual(createEngine(final).snapshot(),final,'the collapsed underground crater survives continuing the game');
}
for(const surface of [300,700,716]){
 const game=newGame(['self','target'],'bunker-bedrock',882);game.wind=0;game.terrain.fill(surface/2);
 game.tanks.forEach((t,i)=>Object.assign(t,{x:i?1100:150,y:surface,vy:0}));
 const e=createEngine(game);e.begin({type:'fire',weapon:bunkerWeapon,angle:45,power:50,moves:[]});
 Object.assign(e.view().shots[0],{x:1100,y:surface-4,vx:0,vy:0,age:99});e.step();
 assert.equal(e.view().tanks[1].hp,100,'even a tank hit only marks the bunker target');
 let frames=0;while(!e.view().booms.length&&frames++<1500)e.step();
 assert.ok(frames<1500);assert.equal(e.view().booms.length,1);
 assert.ok(e.view().booms[0].y>=surface&&e.view().booms[0].y<=e.view().FLOOR,'the missile stops at bedrock without moving upward or escaping the map');
}
// Homing searches around the impact point, ignores self/wrecks, and bursts only at the locked enemy.
const homingGame=newGame(['self','far','nearest','wreck'],'homing-test',881);
homingGame.wind=0;
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
assert.equal([...guidedBursts][0].x,650);assert.equal([...guidedBursts][0].r,28.8);
assert.deepEqual(guided.snapshot().tanks.map(t=>t.hp),[100,100,66,0],'homing deals exactly normal direct-hit damage');
assert.equal(guided.snapshot().terrain[305],150,'the original impact point is intact');
assert.ok(guided.snapshot().terrain[325]>150,'the final normal explosion digs the target ground');
// The search radius is the nuclear radius, inclusive; equal-distance targets use stable seat order.
for(const [distance,expected] of [[199,1],[200,1],[200.01,undefined]]){
 const game=structuredClone(homingGame);game.tanks.forEach((t,i)=>Object.assign(t,{x:i?600+distance:600,hp:i<2?100:0}));
 const e=createEngine(game);e.begin(homingCommand);
 Object.assign(e.view().shots[0],{x:600,y:296,vx:0,vy:-.15*.35/2,age:99});e.step();
 assert.equal(e.view().shots[0]?.homing?.target,expected,`nuclear acquisition boundary: ${distance}`);
 if(expected===undefined)assert.equal(e.view().booms[0].r,28.8,'no target means an ordinary impact');
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
healGame.wind=0;
healGame.terrain.fill(150);
healGame.tanks.forEach((t,i)=>Object.assign(t,{x:[600,625,655,670,620][i],y:300,vy:0,hp:[50,88,50,50,0][i]}));
const healIndex=WEAPONS.findIndex(w=>w.kind==='heal');
assert.equal(WEAPONS[healIndex].r,WEAPONS[0].r*2);
const calmTime=0;
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
teleportGame.wind=0;
teleportGame.terrain.fill(150);teleportGame.tanks.forEach((t,i)=>Object.assign(t,{x:600+i*600,y:300,vy:0,hp:60+i*20}));
const teleport=createEngine(teleportGame),teleportMask=teleport.view().mask.slice();
const teleportCommand={type:'fire',weapon:11,angle:45,power:45,moves:[],windTime:calmTime};
assert.equal(teleport.begin(teleportCommand),1);let impact=null,teleportFrames=0;
while(['fly','settle'].includes(teleport.view().state)&&teleportFrames++<18000){
 teleport.step();const burst=teleport.view().booms.find(b=>b.w.kind==='teleport');if(burst)impact={x:burst.x,y:burst.y};
}
assert.ok(impact&&Math.abs(impact.x-600)>50,'teleport shell travels to a new landing spot');
assert.equal(teleport.snapshot().tanks[0].x,impact.x);assert.equal(teleport.snapshot().tanks[0].y,300);
assert.equal(teleport.snapshot().tanks[1].x,1200,'only the firing tank moves');
assert.deepEqual(teleport.snapshot().tanks.map(t=>t.hp),[60,80]);
assert.deepEqual(teleport.view().mask,teleportMask,'teleport leaves the terrain intact');
const teleportedServer=advance(teleportGame,0,teleportCommand).state;teleportedServer.tanks.forEach(t=>delete t.misses);
assert.deepEqual(teleport.snapshot(),teleportedServer);
// Invisible ground extends from each edge, even far beyond the visible map.
const sideTerrain=structuredClone(teleportGame);
sideTerrain.terrain[0]=110;sideTerrain.terrain[sideTerrain.terrain.length-1]=180;
for(const side of [-1,1])for(const distance of [120,1200]){
 const edge=createEngine(sideTerrain),width=edge.view().W,edgeHeight=(side<0?110:180)*2;
 const maskBefore=edge.view().mask.slice();
 edge.begin({type:'fire',weapon:0,angle:90,power:5,moves:[],windTime:calmTime});
 Object.assign(edge.view().shots[0],{x:side<0?-distance:width+distance,y:edgeHeight-40,vx:side*2,vy:2,age:99});
 edge.step();
 assert.equal(edge.view().shots.length,1,'passing the old side boundary must not burst a shell in midair');
 assert.equal(edge.view().booms.length,0);
 let frames=0;while(!edge.view().booms.length&&frames++<300)edge.step();
 assert.ok(frames<300,'the falling shell lands on the hidden side ground');
 const boom=edge.view().booms[0];
 assert.ok(boom.outside);assert.ok(side<0?boom.x<0:boom.x>width);
 assert.ok(boom.y>=edgeHeight&&boom.y<edgeHeight+3,'hidden ground continues the corresponding edge height');
 assert.equal(edge.view().W,width,'hidden terrain does not expand the visible map');
 assert.deepEqual(edge.view().mask,maskBefore);
}
for(const side of [-1,1]){
 const returning=createEngine(teleportGame),width=returning.view().W;
 returning.begin({type:'fire',weapon:0,angle:90,power:5,moves:[],windTime:calmTime});
 const shot=returning.view().shots[0];
 Object.assign(shot,{x:side<0?-120:width+120,y:200,vx:-side*20,vy:-1,age:99});
 let frames=0;while((shot.x<0||shot.x>width)&&!shot.dead&&frames++<100)returning.step();
 assert.ok(!shot.dead&&shot.x>=0&&shot.x<=width,'an airborne shell can return from the hidden extension');
 assert.equal(returning.view().booms.length,0);
}
// Every projectile bursts after landing outside, including children that split in midair.
for(const side of [-1,1])for(let weapon=0;weapon<WEAPONS.length;weapon++){
 const missedGame=structuredClone(teleportGame);missedGame.tanks[0].x=side<0?30:missedGame.width-30;missedGame.tanks[1].x=missedGame.width/2;
 const missed=createEngine(missedGame),maskBefore=missed.view().mask.slice(),bursts=new Set();
 const command={type:'fire',weapon,angle:side<0?175:5,power:100,moves:[],windTime:calmTime};missed.begin(command);
 let frames=0;
 while(['fly','settle'].includes(missed.view().state)&&frames++<18000){missed.step();missed.view().booms.forEach(b=>bursts.add(b));}
 assert.ok(frames<18000,'misses finish the turn after their explosion');
 assert.equal(bursts.size,WEAPONS[weapon].kind==='steelrain'?11:WEAPONS[weapon].kind==='mirv'?5:WEAPONS[weapon].count||1,'one explosion per missed projectile, plus the harmless Steel Rain airburst');
 assert.ok([...bursts].every(b=>b.outside&&(side<0?b.x<0:b.x>missed.view().W)));
 assert.deepEqual(missed.view().mask,maskBefore,'a distant outside blast cannot reach the battlefield');
 assert.deepEqual(missed.snapshot().tanks.map(t=>[t.x,t.y,t.hp]),missedGame.tanks.map(t=>[t.x,t.y,t.hp]),'missed healing and teleport shells have no remote effect');
 const server=advance(missedGame,0,command).state;server.tanks.forEach(t=>delete t.misses);
 assert.deepEqual(missed.snapshot(),server,'outside explosions replay identically online');
}
// Near-edge outside impacts use their real radius for craters, dirt, healing and damage.
for(const side of [-1,1])for(const weapon of [0,1,6,7,8,9,10,11,12,13]){
 const edgeGame=newGame(['edge','far'],'edge-effects',881);edgeGame.wind=0;edgeGame.terrain.fill(150);
 edgeGame.tanks.forEach((t,i)=>Object.assign(t,{x:i?edgeGame.width/2:side<0?6:edgeGame.width-6,y:300,vy:0,hp:weapon===10?50:100}));
 const command={type:'fire',weapon,angle:side<0?175:5,power:5,moves:[]},e=createEngine(edgeGame),bursts=new Set();
 e.begin(command);let frames=0;
 while(['fly','settle'].includes(e.view().state)&&frames++<18000){e.step();e.view().booms.forEach(b=>bursts.add(b));}
 assert.ok(frames<18000);assert.equal(bursts.size,1,'outside piercing and guidance do not spawn extra impacts');
 const b=[...bursts][0],result=e.snapshot(),kind=WEAPONS[weapon].kind;
 assert.ok(b.outside&&(side<0?b.x<0:b.x>edgeGame.width),'the explosion center stays outside the map');
 const edgeHeight=result.terrain[side<0?0:result.terrain.length-1];
 if(kind==='dirt')assert.ok(edgeHeight<150,'outside dirt fills the overlapping edge');
 else if(kind==='heal'||kind==='teleport')assert.deepEqual(result.terrain,edgeGame.terrain,'utility shots keep their non-destructive behavior');
 else{assert.ok(edgeHeight>150,'an outside blast digs the edge');assert.ok(result.tanks[0].hp<edgeGame.tanks[0].hp,'the overlapping blast also reaches an edge tank');}
 const untouched=Math.ceil((b.r+40)/2),index=side<0?untouched:result.terrain.length-1-untouched;
 assert.equal(result.terrain[index],150,'ground beyond the actual radius is untouched');
 if(kind==='heal')assert.equal(result.tanks[0].hp,75,'healing reaches only tanks inside the outside blast radius');
 if(kind==='teleport')assert.equal(result.tanks[0].x,edgeGame.tanks[0].x,'a miss cannot teleport a tank outside the map');
 const server=advance(edgeGame,0,command).state;server.tanks.forEach(t=>delete t.misses);
 assert.deepEqual(result,server,'outside terrain changes agree on the server and display');
 assert.deepEqual(createEngine(result).snapshot(),result,'edge craters survive saving and resuming');
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
for(let n=0;n<24&&game.tanks[0].hp>0;n++)game=game.turn===0?advance(game,0,{type:'timeout'}).state:harmlessTurn(game);
assert.equal(game.tanks[0].hp,0,'three absent turns eliminate the player');
assert.throws(()=>advance(newGame(['a','b'],'room',1),1,{type:'fire',weapon:0,angle:60,power:50,moves:[]}),/not_your_turn/);
console.log(`PASS: 2/3 map widths, legacy saves, 0–10 wind (${windRates.join('/')}% sampled; ${turnBands.map(n=>(n/1000).toFixed(2)).join('/')}% actual turns), homing (${(homingRate*100).toFixed(2)}% success), nearest enemy/range/ridge/failure, healing/teleport without terrain damage, outside explosions, all ${WEAPONS.length} ammo types, Steel Rain ten-pellet fan/free selection, bunker marker/vertical descent/underground excavation, 2/4/12-player replay parity`);
