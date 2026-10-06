const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const original=fs.readFileSync(path.join(__dirname,'../games/breakout-game.js'),'utf8');
// Inspect the engine only in this local fixture; the shipped module has no test API.
const source=original.replace('    return game;',`    game.inspect=()=>({balls,bricks,drops,paddle,waiting,finished,completed,lives,score,level,speed});
    game.previewStage=stageBricks;game.testStage=n=>{level=n;fillBricks();newTurn();};
    return game;`);
assert.notEqual(source,original);
function fixture(){
  const randomValues=[],math=Object.create(Math),scores=[],ends=[],sounds=[];
  math.random=()=>randomValues.shift()??.99;
  const context={window:{},Math:math};vm.runInNewContext(source,context);
  const game=context.window.OjjudaBreakoutGame.create({setScore:v=>scores.push(v),end:v=>ends.push(v),sound:Object.fromEntries(['tap','hit','bonus','bad'].map(kind=>[kind,()=>sounds.push(kind)]))});
  const state=()=>game.inspect();
  function advance(seconds){const n=Math.ceil(seconds*240);for(let i=0;i<n;i++)game.update(seconds/n);}
  function launch(){randomValues.push(.5);game.onKey(' ');}
  function park(){for(const ball of state().balls)Object.assign(ball,{x:180,y:380,vx:0,vy:-state().speed});}
  function hit(kind='two'){
    if(state().waiting)launch();park();const s=state(),brick=s.bricks.filter(b=>b.on&&!b.solid&&b.hp===1).at(-1),ball=s.balls[0];
    const roll={two:.1,ten:.6,pierce:.9}[kind];randomValues.push(0,roll);
    Object.assign(ball,{x:brick.x+brick.w/2,y:brick.y+brick.h+6,vx:0,vy:-s.speed});
    const before=s.score;game.update(1/240);assert.equal(state().score,before+10);
    const item=state().drops.at(-1);assert.equal(item.kind,kind);return item;
  }
  function catchItem(item){park();game.onMove(item.x);item.y=state().paddle.y-10;game.update(1/240);assert.ok(!state().drops.includes(item));}
  function missAll(){for(const ball of state().balls)ball.y=565;game.update(1/240);}
  return{game,state,advance,launch,park,hit,catchItem,missAll,scores,ends,sounds,randomValues};
}
{
  const f=fixture(),item=f.hit('two'),startY=item.y;
  f.advance(.12);assert.ok(item.y>startY,'a broken brick releases a falling pickup');
  f.catchItem(item);assert.equal(f.state().balls.length,2);
  assert.equal(f.sounds.filter(s=>s==='bonus').length,1,'only catching awards the item');
  f.catchItem(f.hit('two'));assert.equal(f.state().balls.length,4,'a second doubling pickup makes four balls');
  f.catchItem(f.hit('two'));assert.equal(f.state().balls.length,8,'doubling continues from the current count');
  f.catchItem(f.hit('ten'));assert.equal(f.state().balls.length,10);
  f.catchItem(f.hit('two'));assert.equal(f.state().balls.length,10,'the two-ball item never removes an active ball');
  f.catchItem(f.hit('ten'));assert.equal(f.state().balls.length,10,'repeat pickups cannot exceed ten balls');
  f.catchItem(f.hit('pierce'));assert.equal(f.state().balls.filter(b=>b.piercing).length,1);
  const chosen=f.state().balls.find(b=>b.piercing).id;
  f.catchItem(f.hit('pierce'));assert.deepEqual(Array.from(f.state().balls.filter(b=>b.piercing),b=>b.id),[chosen]);
  f.state().balls.find(b=>b.id===chosen).y=565;f.game.update(1/240);
  assert.equal(f.state().balls.length,9);assert.equal(f.state().lives,3,'one lost ball does not cost a life');
  assert.equal(f.state().balls.filter(b=>b.piercing).length,0,'only the chosen ball carried the effect');
  f.missAll();assert.equal(f.state().lives,2);assert.equal(f.state().balls.length,1);assert.equal(f.state().waiting,true);
  assert.equal(f.state().balls[0].piercing,false);assert.equal(f.state().drops.length,0);
}
{
  const f=fixture();f.catchItem(f.hit('ten'));
  assert.equal(new Set(Array.from(f.state().balls,b=>b.vx.toFixed(4)+':'+b.vy.toFixed(4))).size,10,'ten balls spread in distinct directions');
  for(const ball of f.state().balls)assert.ok(Math.abs(Math.hypot(ball.vx,ball.vy)-f.state().speed)<.001);
}
for(const piercing of [false,true]){
  const f=fixture();if(piercing)f.catchItem(f.hit('pierce'));else f.launch();
  const s=f.state(),ball=s.balls[0],column=s.bricks.filter(b=>b.on).reduce((best,b)=>{const col=s.bricks.filter(x=>x.on&&x.x===b.x);return col.length>best.length?col:best;},[]),bottom=Math.max(...column.map(b=>b.y+b.h));Object.assign(ball,{x:column[0].x+column[0].w/2,y:bottom+8,vx:0,vy:-s.speed});
  const before=s.score;f.advance(.2);
  if(piercing){assert.ok(f.state().score>=before+20,'the piercing ball crosses multiple bricks without reversing');assert.ok(ball.vy<0);}
  else{assert.equal(f.state().score,before+10);assert.ok(ball.vy>0,'normal balls rebound');}
}
{
  const f=fixture();f.launch();const s=f.state(),brick=s.bricks.at(-1),ball=s.balls[0];
  s.balls.push({...ball,id:999});
  for(const b of s.balls)Object.assign(b,{x:brick.x+brick.w/2,y:brick.y+brick.h+6,vx:0,vy:-s.speed});
  f.game.update(1/240);assert.equal(f.state().score,10,'two simultaneous hits cannot count a brick twice');
}
{
  const f=fixture();f.catchItem(f.hit('pierce'));
  const s=f.state(),last=s.bricks.filter(b=>b.on&&!b.solid).at(-1);for(const b of s.bricks)b.on=b===last;
  Object.assign(s.balls[0],{x:last.x+last.w/2,y:last.y+last.h+6,vx:0,vy:-s.speed});
  f.game.update(1/240);assert.equal(f.state().level,2);assert.equal(f.state().lives,3);
  assert.equal(f.state().balls.length,1);assert.equal(f.state().balls[0].piercing,false);
  assert.equal(f.state().drops.length,0,'starting a new board ends this turn’s effects');
}
{
  const f=fixture();f.launch();const initial=f.state().speed;
  assert.ok(initial>330&&initial<=380,'the initial speed is only moderately faster');
  for(let level=0;level<12;level++){
    if(f.state().waiting)f.launch();const s=f.state(),last=s.bricks.filter(b=>!b.solid).at(-1);
    for(const b of s.bricks)if(!b.solid)b.on=b===last;last.hp=1;
    Object.assign(s.balls[0],{x:last.x+last.w/2,y:last.y+last.h+6,vx:0,vy:-s.speed});f.game.update(1/240);
  }
  assert.ok(f.state().speed>initial&&f.state().speed<=620,'speed increases gradually and stays bounded');
  f.launch();const s=f.state();Object.assign(s.balls[0],{x:180,y:468,vx:0,vy:s.speed});f.game.update(.05);
  assert.ok(s.balls[0].vy<0&&s.balls[0].y<490,'the fastest ball cannot skip the paddle during a long frame');
}
{
  const f=fixture(),layouts=Array.from({length:100},(_,i)=>f.game.previewStage(i+1));
  for(const [index,bricks] of layouts.entries()){
    const stage=index+1;assert.ok(bricks.length>=14&&bricks.length<=63);
    if(index)assert.ok(bricks.length>=layouts[index-1].length,'later stages never contain fewer bricks');
    if(index>=2)assert.ok(bricks.length>layouts[index-2].length,'the brick count grows every two stages');
    assert.ok(bricks.every(b=>b.x>=0&&b.x+b.w<=360&&b.y>=84&&b.y+b.h<300&&b.w===30&&b.h===12));
    if(stage>=2)assert.ok(bricks.some(b=>b.hp===2));
    if(stage>=3)assert.ok(bricks.some(b=>b.solid));
    assert.ok(bricks.filter(b=>b.solid).every(b=>b.y===84),'steel cannot form an enclosure around targets');
    assert.ok(bricks.filter(b=>b.solid).length<=5,'the steel row always leaves two open passages');
    assert.ok(bricks.filter(b=>!b.solid).length>=7);
  }
  const fingerprints=new Set(layouts.map(bs=>JSON.stringify(Array.from(bs,b=>[b.x,b.y,b.hp,b.solid]))));
  assert.equal(fingerprints.size,100,'all 100 stages have distinct brick arrangements');
  assert.ok(layouts[99].filter(b=>b.hp===2).length>layouts[1].filter(b=>b.hp===2).length);
  assert.equal(layouts[0].length,14);assert.equal(layouts[99].length,63);
  assert.equal(layouts.flat().filter(b=>!b.solid).length*10,35600,'the full run remains within the 40,000-point record limit');
}
for(const piercing of [false,true]){
  const f=fixture();f.game.testStage(2);if(piercing)f.catchItem(f.hit('pierce'));else f.launch();
  const s=f.state(),brick=s.bricks.find(b=>b.hp===2),ball=s.balls[0],before=s.score;
  for(const other of s.bricks)if(other!==brick)other.on=false;
  Object.assign(ball,{x:brick.x+brick.w/2,y:brick.y+brick.h+6,vx:0,vy:-s.speed});
  f.advance(.05);assert.equal(brick.hp,1);assert.equal(brick.on,true);assert.equal(f.state().score,before,'the first strike gives no destruction points');
  f.park();f.game.update(1/240);
  Object.assign(f.state().balls[0],{x:brick.x+brick.w/2,y:brick.y+brick.h+6,vx:0,vy:-f.state().speed});
  f.game.update(1/240);assert.equal(brick.on,false);assert.equal(f.state().score,before+10,'a second contact breaks the tough brick');
}
for(const piercing of [false,true]){
  const f=fixture();f.game.testStage(3);if(piercing)f.catchItem(f.hit('pierce'));else f.launch();
  const s=f.state(),steel=s.bricks.find(b=>b.solid),ball=s.balls[0],before=s.score;
  for(const b of s.bricks)if(b!==steel&&b.id%10===steel.id%10)b.on=false;
  Object.assign(ball,{x:steel.x+steel.w/2,y:steel.y+steel.h+12,vx:0,vy:-s.speed});f.advance(.1);
  assert.equal(steel.on,true);assert.equal(f.state().score,before);assert.equal(f.state().drops.length,0);
  assert.equal(ball.vy<0,piercing,'a normal ball rebounds from steel; the piercing ball passes without destroying it');
}
{
  const f=fixture();
  for(let stage=1;stage<=100;stage++){
    assert.equal(f.state().level,stage);f.launch();const s=f.state(),last=s.bricks.filter(b=>!b.solid).at(-1);
    for(const b of s.bricks)if(!b.solid)b.on=b===last;last.hp=1;
    Object.assign(s.balls[0],{x:last.x+last.w/2,y:last.y+last.h+6,vx:0,vy:-s.speed});f.game.update(1/240);
    if(stage<100)assert.equal(f.ends.length,0);
  }
  assert.equal(f.state().level,100);assert.equal(f.state().completed,true);assert.equal(f.ends.length,1);
  assert.equal(f.game.resultTitle,'100단계 클리어!');f.game.update(.05);assert.equal(f.ends.length,1);
}
{
  const f=fixture(),initial=f.state().speed;f.advance(5);
  assert.equal(f.state().speed,initial,'waiting for launch never speeds up the ball');
  f.launch();Object.assign(f.state().balls[0],{x:180,y:300,vx:initial,vy:0});f.advance(5);
  assert.ok(Math.abs(f.state().speed-(initial+25))<.01,'time alone increases speed while playing');
  assert.equal(f.state().score,0,'time-based acceleration needs no brick hits');
}
{
  const f=fixture();for(let i=0;i<3;i++){f.launch();f.missAll();}
  assert.deepEqual(f.ends,[0]);f.game.update(.05);f.game.onDown(180);f.game.onKey(' ');assert.deepEqual(f.ends,[0]);
  f.game.destroy();assert.equal(f.state().balls.length,0);f.game.update(.05);assert.deepEqual(f.ends,[0]);
}
{
  let spawned=0;
  for(let percent=0;percent<100;percent++){
    const f=fixture();f.launch();const s=f.state(),brick=s.bricks.at(-1);
    Object.assign(s.balls[0],{x:brick.x+brick.w/2,y:brick.y+brick.h+6,vx:0,vy:-s.speed});
    f.randomValues.push(percent/100,.1);f.game.update(1/240);spawned+=f.state().drops.length;
    assert.equal(f.state().balls[0].r,5,'balls use the smaller collision radius');
  }
  assert.equal(spawned,8,'only 8 of 100 equally spaced rolls drop an item, including the first brick');
  const f=fixture();f.launch();const s=f.state(),brick=s.bricks.at(-1);
  s.drops.push({x:20,y:200,kind:'two'},{x:40,y:200,kind:'ten'});
  Object.assign(s.balls[0],{x:brick.x+brick.w/2,y:brick.y+brick.h+6,vx:0,vy:-s.speed});
  f.randomValues.push(0,.1);f.game.update(1/240);assert.equal(f.state().drops.length,2,'at most two items fall at once');
}
{
  const f=fixture(),s=f.state(),renders=[];
  for(const kind of ['two','ten','pierce']){
    s.drops.splice(0,s.drops.length,{x:100,y:300,kind});const commands=[];
    const canvas=new Proxy({}, {get:(_,name)=>(...args)=>commands.push([name,...args]),set:(_,name,value)=>{commands.push([name,value]);return true;}});
    f.game.draw(canvas);renders.push(JSON.stringify(commands));
    assert.ok(commands.some(c=>c[0]==='fillText'&&c[1]==='?'),'falling items show a question mark');
  }
  assert.equal(new Set(renders).size,1,'all falling item types have identical shapes, colors and labels');
}
console.log('PASS: 100 distinct stages and final completion, two-hit contacts, unbreakable steel and open passages, falling items, two/ten balls, one-turn piercing, multiball lives, time-based bounded acceleration, fast collision, and teardown');
