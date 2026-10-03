const assert = require('node:assert/strict');
const {flat, makeFlatLevel, canUnscrew, plateCovers, screwPoint, STAGE_KEY} = require('../screw-flat.js');
const storage = new Map();
global.localStorage = {getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))};
const tick = (game, seconds = 1.8) => { for(let n=0;n<Math.ceil(seconds/.05);n++)game.update(.05); };
const press = (game,x,y) => { game.onDown(x,y,1);game.onUp(x,y,1); };
const remove = (game,id) => { const s=game.state.level.screws[id],q=screwPoint(s); assert.ok(canUnscrew(game.state.level,s),`stage ${game.state.L}, screw ${id} is physically reachable`); press(game,q.x,q.y); };
let last=0;
for(let stage=1;stage<=500;stage++) {
  const level=makeFlatLevel(stage);
  assert.ok(level.screws.length>=last);last=level.screws.length;
  assert.equal(level.screws.length%3,0);
  if(stage<=3){assert.equal(level.screws.length,[12,18,24][stage-1]);assert.equal(level.colorCount,2);}
  else assert.ok(level.colorCount>=3 && level.screws.length>=30);
  assert.deepEqual(level.solution,makeFlatLevel(stage).solution,'retrying a stage restores the same puzzle');
  for(let i=0;i<level.solution.length;i++) {
    const s=level.screws[level.solution[i]], q=screwPoint(s);
    assert.ok(q.x>=37 && q.x<=323 && q.y>=216 && q.y<=480,'all screw heads remain inside the board');
    assert.ok(canUnscrew(level,s),`stage ${stage} has a legal complete solution`);
    assert.equal(s.color,level.queue[Math.floor(i/3)]);
    s.state='done';if(s.plate.screws.every(s=>s.state==='done'))s.plate.state='gone';
  }
  assert.ok(level.plates.every(p=>p.state==='gone'));
}

// Exact rounded corners, rotation and current falling positions share one outline.
const p={x:0,y:0,w:100,h:40,radius:12,angle:0,state:'fixed',z:1};
assert.equal(plateCovers(p,49,19),false,'empty rounded corner is not a rectangle blocker');
assert.equal(plateCovers(p,35,0),true);
p.angle=Math.PI/2;assert.equal(plateCovers(p,0,35),true);assert.equal(plateCovers(p,35,0),false);
const back={x:0,y:0,w:80,h:30,radius:10,angle:0,state:'fixed',z:0};
const bolt={plate:back,offset:0,state:'in'};
const level={plates:[back,p],screws:[bolt]};
p.state='falling';assert.equal(canUnscrew(level,bolt),false,'a falling plate still hides its rear screw');
p.y=100;assert.equal(canUnscrew(level,bolt),true,'moved plate leaves no stale obstruction');
p.y=0;p.state='gone';assert.equal(canUnscrew(level,bolt),true);

let purchases=0,ends=0;
const api={setScore(){},end(){ends++},buyScrew(){purchases++;}};
storage.set('ojjuda-screw-stage','37');
for(const stage of [1,2,3,4,10,30,100,500]) {
  storage.set(STAGE_KEY,String(stage));const game=flat(api),order=game.state.level.solution.slice();
  for(const id of order) { remove(game,id);tick(game);assert.equal(game.state.ended,false); }
  assert.equal(game.state.complete,true,`real flights, colour trays and falling plates complete stage ${stage}`);
  assert.equal(game.state.level.plates.filter(p=>p.state==='gone').length,game.state.level.plates.length);
  assert.equal(game.state.score,order.length+stage*10);
  assert.equal(storage.get(STAGE_KEY),String(Math.min(500,stage+1)),'clearing saves the next flat stage');
  assert.equal(storage.get('ojjuda-screw-stage'),'37','flat progress never overwrites the box version');
  if(stage<500){press(game,267,514);assert.equal(game.state.L,stage+1);}
}
assert.equal(purchases,0);assert.equal(ends,0);
storage.set(STAGE_KEY,'1');const game=flat(api),first=game.state.level.solution[0],q=screwPoint(game.state.level.screws[first]);
game.onDown(q.x,q.y,1);game.onCancel(1);game.onUp(q.x,q.y,1);
assert.equal(game.state.level.screws[first].state,'in','cancelled pointer never unscrews');
game.onDown(q.x,q.y,1);game.onDown(q.x+10,q.y,2);game.onUp(q.x,q.y,1);game.onUp(q.x+10,q.y,2);
assert.equal(game.state.level.screws[first].state,'in','multitouch never becomes a stray tap');
remove(game,first);tick(game);assert.ok(game.state.score>0);
press(game,303,514);assert.equal(game.state.score,0,'retry rolls back this stage score');
assert.equal(game.state.level.screws[first].state,'in');
game.destroy();press(game,q.x,q.y);tick(game);assert.equal(game.state.level.screws[first].state,'in','closed game does not continue');
console.log('PASS: all 500 flat stages have free solutions; 8 full games finish with real motion and trays; exact moving occlusion, independent stages, safe retry and cancelled touches.');
