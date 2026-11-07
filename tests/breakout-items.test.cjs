const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const original=fs.readFileSync(path.join(__dirname,'../games/breakout/breakout-game.js'),'utf8');
// Inspect the engine only in this local fixture; the shipped module has no test API.
const source=original.replace('    return game;',`    game.inspect=()=>({balls,bricks,drops,paddle,waiting,finished,completed,lives,score,level,speed});
    game.previewStage=stageBricks;game.testStage=n=>{level=n;fillBricks();newTurn();};
    return game;`);
assert.notEqual(source,original);
const ROLLS={two:.04,ten:.125,pierce:.21,wide:.3,slow:.44,shrink:.6,fast:.75,single:.95};
const BOX_GROUP={two:'white',ten:'white',pierce:'white',wide:'yellow',slow:'yellow',shrink:'black',fast:'black',single:'black'};
const fallSpeed=kind=>BOX_GROUP[kind]==='black'?87.5:125;
const STEP=1/240;
const near=(actual,expected,message,tolerance=.0001)=>assert.ok(Math.abs(actual-expected)<tolerance,`${message}: ${actual} vs ${expected}`);
function fixture({speed='normal'}={}){
  const randomValues=[],math=Object.create(Math),scores=[],ends=[],clears=[],sounds=[];
  math.random=()=>randomValues.shift()??.99;
  const context={window:{OjjudaGameControls:{get:()=>({speed})}},Math:math};vm.runInNewContext(source,context);
  const api={setScore:v=>scores.push(v),end:v=>ends.push(v),stageClear:v=>clears.push(v),sound:Object.fromEntries(['tap','hit','bonus','bad'].map(kind=>[kind,()=>sounds.push(kind)]))};
  let game=context.window.OjjudaBreakoutGame.create(api);
  const state=()=>game.inspect();
  function advance(seconds){const n=Math.ceil(seconds*240);for(let i=0;i<n;i++)game.update(seconds/n);}
  function launch(){randomValues.push(.5);game.onKey(' ');}
  function park(){for(const ball of state().balls)Object.assign(ball,{x:180,y:380,vx:0,vy:-state().speed});}
  function hit(kind='two'){
    if(state().waiting)launch();park();const s=state(),brick=s.bricks.filter(b=>b.on&&!b.solid&&b.hp===1).at(-1),ball=s.balls[0];
    const roll=ROLLS[kind];assert.notEqual(roll,undefined);randomValues.push(0,roll);
    Object.assign(ball,{x:brick.x+brick.w/2,y:brick.y+brick.h+5.1,vx:0,vy:-s.speed});
    const before=s.score;game.update(1/240);assert.equal(state().score,before+10);
    const item=state().drops.at(-1);assert.equal(item.kind,kind);return item;
  }
  function catchItem(item){park();game.onMove(item.x);item.y=state().paddle.y-10;game.update(1/240);assert.ok(!state().drops.includes(item));}
  function missAll(){for(const ball of state().balls)ball.y=565;game.update(1/240);}
  function bounce(ball){park();game.onMove(180);const s=state();Object.assign(ball,{x:190,y:s.paddle.y-ball.r-.1,vx:0,vy:s.speed});game.update(STEP);assert.ok(ball.vy<0,'the selected ball really rebounds from the paddle');}
  function restart(){game.destroy();game=context.window.OjjudaBreakoutGame.create(api);}
  return{get game(){return game;},state,advance,launch,park,hit,catchItem,missAll,bounce,restart,scores,ends,clears,sounds,randomValues};
}
{
  const f=fixture(),item=f.hit('two'),startY=item.y;
  f.advance(.12);assert.ok(item.y>startY,'a broken brick releases a falling pickup');
  f.catchItem(item);assert.equal(f.state().balls.length,2);
  assert.equal(f.sounds.filter(s=>s==='bonus').length,1,'only catching awards the item');
  f.catchItem(f.hit('two'));assert.equal(f.state().balls.length,4,'a second doubling pickup makes four balls');
  f.catchItem(f.hit('two'));assert.equal(f.state().balls.length,8,'doubling continues from the current count');
  f.catchItem(f.hit('ten'));assert.equal(f.state().balls.length,80,'tenfold multiplies the current eight balls');
  f.catchItem(f.hit('two'));assert.equal(f.state().balls.length,100,'doubling stops at the one-hundred-ball limit');
  f.catchItem(f.hit('ten'));assert.equal(f.state().balls.length,100,'repeat pickups cannot exceed one hundred balls');
  f.catchItem(f.hit('pierce'));assert.equal(f.state().balls.filter(b=>b.piercing).length,1);
  const chosen=f.state().balls.find(b=>b.piercing).id;
  f.catchItem(f.hit('pierce'));assert.deepEqual(Array.from(f.state().balls.filter(b=>b.piercing),b=>b.id),[chosen]);
  f.state().balls.find(b=>b.id===chosen).y=565;f.game.update(1/240);
  assert.equal(f.state().balls.length,99);assert.equal(f.state().lives,3,'one lost ball does not cost a life');
  assert.equal(f.state().balls.filter(b=>b.piercing).length,0,'only the chosen ball carried the effect');
  f.missAll();assert.equal(f.state().lives,2);assert.equal(f.state().balls.length,1);assert.equal(f.state().waiting,true);
  assert.equal(f.state().balls[0].piercing,false);assert.equal(f.state().drops.length,0);
}
{
  const f=fixture();f.catchItem(f.hit('ten'));
  assert.equal(new Set(Array.from(f.state().balls,b=>b.vx.toFixed(4)+':'+b.vy.toFixed(4))).size,10,'ten balls spread in distinct directions');
  for(const ball of f.state().balls)assert.ok(Math.abs(Math.hypot(ball.vx,ball.vy)-f.state().speed)<.001);
}
{
  const f=fixture();f.catchItem(f.hit('two'));
  for(const expected of [20,100]){
    const item=f.hit('ten'),s=f.state(),existing=s.balls.slice(),directions=new Map();
    for(const [index,ball] of existing.entries()){
      const angle=-2.3+index*1.4/existing.length;
      Object.assign(ball,{x:180,y:380,vx:Math.cos(angle)*s.speed,vy:Math.sin(angle)*s.speed});
      directions.set(ball.id,{vx:ball.vx/s.speed,vy:ball.vy/s.speed});
    }
    f.game.onMove(item.x);item.y=s.paddle.y-10;f.game.update(STEP);
    const after=f.state(),added=after.balls.filter(ball=>!directions.has(ball.id));
    assert.equal(after.balls.length,expected,'tenfold uses the current count and clamps to one hundred');
    assert.equal(added.length,expected-existing.length);
    assert.equal(new Set(Array.from(added,ball=>ball.vx.toFixed(4)+':'+ball.vy.toFixed(4))).size,added.length,'each new batch fans out in distinct directions');
    for(const ball of after.balls){
      near(Math.hypot(ball.vx,ball.vy),after.speed,'both existing and added balls have the current speed');
      const before=directions.get(ball.id);
      if(before){near(ball.vx/after.speed,before.vx,'tenfold preserves existing horizontal direction');near(ball.vy/after.speed,before.vy,'tenfold preserves existing vertical direction');}
    }
  }
  const labels=[];f.game.draw(new Proxy({},{get:(_,name)=>(...args)=>{if(name==='fillText')labels.push(args[0]);},set:()=>true}));
  assert.ok(labels.includes('공 10배 · 최대 100개'),'the capped tenfold result is explained after collection');
}
{
  const f=fixture();f.catchItem(f.hit('pierce'));f.catchItem(f.hit('two'));f.catchItem(f.hit('two'));
  const [chosen,first,second,last]=f.state().balls;
  f.state().balls.splice(0,4,first,chosen,second,last);
  f.bounce(second);f.bounce(last);f.bounce(chosen);
  assert.equal(chosen.pierceBounces,1,'one real paddle contact leaves one piercing bounce');
  const item=f.hit('single'),s=f.state();
  assert.equal(s.balls.length,4,'a falling single-ball box cannot remove balls before collection');
  Object.assign(chosen,{x:210,y:340,vx:-.6*s.speed,vy:-.8*s.speed});
  const before={x:chosen.x,y:chosen.y,vx:chosen.vx,vy:chosen.vy,speed:s.speed,lives:s.lives,score:s.score};
  f.game.onMove(item.x);item.y=s.paddle.y-10;f.game.update(STEP);
  const after=f.state(),ratio=(before.speed+2*STEP)/before.speed;
  assert.equal(after.balls.length,1);assert.strictEqual(after.balls[0],chosen,'single keeps the latest paddle contact, independent of array position');
  near(chosen.vx,before.vx*ratio,'single preserves horizontal motion with only normal frame acceleration');
  near(chosen.vy,before.vy*ratio,'single preserves vertical motion with only normal frame acceleration');
  near(chosen.x,before.x+chosen.vx*STEP,'single does not teleport the surviving ball');
  near(chosen.y,before.y+chosen.vy*STEP,'single preserves the surviving ball’s progress');
  assert.equal(chosen.piercing,true);assert.equal(chosen.pierceBounces,1,'single retains the selected ball’s piercing duration');
  assert.equal(after.lives,before.lives);assert.equal(after.score,before.score);assert.equal(after.waiting,false);
  assert.equal(f.sounds.at(-1),'bad','the black single-ball pickup has the harmful sound');
}
{
  const f=fixture();f.catchItem(f.hit('two'));f.catchItem(f.hit('two'));
  const [,latest,previous,older]=f.state().balls;f.bounce(older);f.bounce(previous);f.bounce(latest);
  f.park();latest.y=565;f.game.update(STEP);
  assert.equal(f.state().balls.includes(latest),false);assert.equal(f.state().lives,3);
  f.catchItem(f.hit('single'));
  assert.equal(f.state().balls.length,1);assert.strictEqual(f.state().balls[0],previous,'when the latest ball is lost, the most recent living paddle contact survives');
}
{
  const f=fixture();f.catchItem(f.hit('ten'));f.catchItem(f.hit('ten'));
  const originalBalls=f.state().balls.slice();assert.equal(originalBalls.length,100);
  f.catchItem(f.hit('single'));
  assert.equal(f.state().balls.length,1);assert.ok(originalBalls.includes(f.state().balls[0]),'before any paddle bounce single preserves an existing ball, including at the hundred-ball cap');
  const only=f.state().balls[0];f.catchItem(f.hit('single'));
  assert.equal(f.state().balls.length,1);assert.strictEqual(f.state().balls[0],only,'collecting single with one ball keeps that ball');
  assert.equal(f.state().lives,3);assert.equal(f.state().waiting,false);
}
{
  const f=fixture();f.catchItem(f.hit('two'));f.catchItem(f.hit('two'));
  const item=f.hit('single'),originalBalls=f.state().balls.slice();f.game.onMove(340);item.x=12;
  for(const ball of originalBalls)Object.assign(ball,{x:180,y:380,vx:f.state().speed,vy:0});
  f.advance((565-item.y)/87.5+.1);
  assert.equal(f.state().drops.length,0);assert.equal(f.state().balls.length,4,'missing the single-ball box never deletes active balls');
  assert.ok(f.state().balls.every(ball=>originalBalls.includes(ball)));assert.equal(f.state().lives,3);
  assert.equal(f.sounds.includes('bad'),false);
}
{
  const f=fixture();f.catchItem(f.hit('two'));f.catchItem(f.hit('two'));
  const oldLatest=f.state().balls[3];f.bounce(f.state().balls[1]);f.bounce(oldLatest);
  f.restart();assert.equal(f.state().balls[0].lastPaddleTouch,0,'a new run starts without a previous paddle contact');
  f.catchItem(f.hit('two'));const freshLatest=f.state().balls[1];
  f.bounce(freshLatest);assert.equal(freshLatest.lastPaddleTouch,1,'the first real paddle contact of a fresh run starts a new history in the same loaded module');
  f.catchItem(f.hit('single'));
  assert.equal(f.state().balls.length,1);assert.strictEqual(f.state().balls[0],freshLatest);assert.notStrictEqual(f.state().balls[0],oldLatest);
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
  f.game.update(1/240);assert.equal(f.state().level,1);assert.equal(f.game.stageCleared,true);
  assert.equal(f.game.continueStage(2),true);assert.equal(f.state().level,2);assert.equal(f.state().lives,3);
  assert.equal(f.state().balls.length,1);assert.equal(f.state().balls[0].piercing,false);
  assert.equal(f.state().drops.length,0,'starting a new board ends this turn’s effects');
}
for(const speed of ['slow','normal','fast'])for(const [sizeItem,speedItem] of [['wide','fast'],['shrink','slow']]){
  const f=fixture({speed}),control=fixture({speed});
  for(const run of [f,control]){run.launch();run.missAll();}
  for(const next of [2,3]){
    const pickups=[sizeItem,sizeItem,sizeItem,sizeItem,'ten','pierce',...Array(6).fill(speedItem)];
    for(const kind of pickups){
      f.catchItem(f.hit(kind));control.catchItem(control.hit('pierce'));
    }
    assert.notEqual(f.state().paddle.w,80,'the size pickup is active before the clear');
    assert.notEqual(f.state().speed,control.state().speed,'the speed pickup is active before the clear');
    assert.equal(f.state().balls.length,10);assert.ok(f.state().balls.some(b=>b.piercing));
    for(const run of [f,control]){
      const s=run.state(),last=s.bricks.filter(b=>b.on&&!b.solid).at(-1);
      for(const brick of s.bricks)if(!brick.solid)brick.on=brick===last;
      last.hp=1;run.park();
      Object.assign(s.balls[0],{x:last.x+last.w/2,y:last.y+last.h+5.1,vx:0,vy:-s.speed});
      run.game.update(STEP);
      assert.equal(run.game.stageCleared,true);
    }
    const before=f.state();
    assert.equal(f.game.continueStage(next),true);assert.equal(control.game.continueStage(next),true);
    const after=f.state();
    assert.equal(after.paddle.w,80,'each next board resets both helpful and harmful paddle sizes');
    assert.ok(after.paddle.x>=0&&after.paddle.x+after.paddle.w<=360);
    near(after.speed,control.state().speed,'next-board speed matches a run without speed pickups, even after reaching a limit');
    assert.equal(after.score,before.score);assert.equal(after.lives,2,'continuing preserves the remaining lives');
    assert.equal(after.balls.length,1);assert.equal(after.balls[0].piercing,false);assert.equal(after.balls[0].pierceBounces,0);
    assert.equal(after.drops.length,0);assert.equal(after.waiting,true);
    near(after.balls[0].x,after.paddle.x+after.paddle.w/2,'the new ball is centered on the reset paddle');
    f.launch();near(Math.hypot(f.state().balls[0].vx,f.state().balls[0].vy),after.speed,'launch uses the reset speed');
  }
}
{
  // A ball overlapping a brick must rebound instead of jumping to a far edge.
  for(const setting of ['slow','normal','fast']){
    const f=fixture({speed:setting});f.launch();
    const s=f.state(),ball=s.balls[0],brick=s.bricks.find(b=>b.on&&!b.solid);
    const vx=s.speed*.4;
    Object.assign(ball,{x:brick.x+brick.w/2,y:brick.y+brick.h/2,vx,vy:-Math.sqrt(s.speed**2-vx**2)});
    const before={x:ball.x,y:ball.y};
    f.game.update(STEP);
    const moved=Math.hypot(ball.x-before.x,ball.y-before.y);
    assert.ok(moved<=2*s.speed*STEP+.5,`${setting}: brick rebound must not teleport the ball (${moved}px)`);
    assert.ok(ball.vy>0,`${setting}: the deeply overlapping ball still rebounds`);
  }
}
{
  const f=fixture();f.launch();const initial=f.state().speed;
  assert.ok(initial>=260&&initial<=300,'the initial speed leaves more time to follow the ball');
  for(let level=0;level<12;level++){
    if(f.state().waiting)f.launch();const s=f.state(),last=s.bricks.filter(b=>!b.solid).at(-1);
    for(const b of s.bricks)if(!b.solid)b.on=b===last;last.hp=1;
    Object.assign(s.balls[0],{x:last.x+last.w/2,y:last.y+last.h+6,vx:0,vy:-s.speed});f.game.update(1/240);
    assert.equal(f.game.continueStage(f.state().level+1),true);
  }
  assert.ok(f.state().speed>initial&&f.state().speed<=552,'later stages stay within the speed cap');
  f.launch();const s=f.state();Object.assign(s.balls[0],{x:180,y:468,vx:0,vy:s.speed});f.game.update(.05);
  assert.ok(s.balls[0].vy<0&&s.balls[0].y<490,'the fastest ball cannot skip the paddle during a long frame');
}
{
  const f=fixture(),layouts=Array.from({length:100},(_,i)=>f.game.previewStage(i+1));
  for(const [index,bricks] of layouts.entries()){
    const stage=index+1;assert.ok(bricks.length>=14&&bricks.length<=1000);
    if(index)assert.ok(bricks.length>=layouts[index-1].length,'later stages never contain fewer bricks');
    if(index>=2)assert.ok(bricks.length>layouts[index-2].length,'the brick count grows every two stages');
    assert.ok(bricks.every(b=>b.x>=0&&b.x+b.w<=360&&b.y>=84&&b.y+b.h<300&&b.w<=30&&b.h<=12&&b.w>=7&&b.h>=4));
    if(stage>=2)assert.ok(bricks.some(b=>b.hp===2));
    if(stage>=3)assert.ok(bricks.some(b=>b.solid));
    assert.ok(bricks.filter(b=>b.solid).every(b=>b.y===84),'steel cannot form an enclosure around targets');
    assert.ok(bricks.filter(b=>b.solid).length<=5,'the steel row always leaves two open passages');
    assert.ok(bricks.filter(b=>!b.solid).length>=7);
  }
  const fingerprints=new Set(layouts.map(bs=>JSON.stringify(Array.from(bs,b=>[b.x,b.y,b.hp,b.solid]))));
  assert.equal(fingerprints.size,100,'all 100 stages have distinct brick arrangements');
  assert.ok(layouts[99].filter(b=>b.hp===2).length>layouts[1].filter(b=>b.hp===2).length);
  assert.equal(layouts[0].length,14);assert.equal(layouts[99].length,1000);
  assert.equal(layouts.flat().filter(b=>!b.solid).length*10,504100,'the full run remains within the 550,000-point record limit');
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
  for(const b of s.bricks)if(b!==steel&&Math.abs(b.x-steel.x)<.01)b.on=false;
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
    if(stage<100){assert.equal(f.ends.length,0);assert.equal(f.game.stageCleared,true);assert.equal(f.game.continueStage(stage+1),true);}
  }
  assert.equal(f.state().level,100);assert.equal(f.state().completed,true);assert.equal(f.ends.length,1);
  assert.equal(f.game.resultTitle,'100단계 클리어!');f.game.update(.05);assert.equal(f.ends.length,1);
  assert.equal(f.clears.length,99,'each intermediate board emits one clear event before explicit continuation');
}
{
  const f=fixture(),initial=f.state().speed;f.advance(5);
  assert.equal(f.state().speed,initial,'waiting for launch never speeds up the ball');
  f.launch();Object.assign(f.state().balls[0],{x:180,y:300,vx:initial,vy:0});f.advance(5);
  assert.ok(Math.abs(f.state().speed-(initial+10))<.01,'time-based acceleration stays gentle while playing');
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
  const f=fixture(),s=f.state(),groups={white:[],yellow:[],black:[]},colors={white:'#FFFFFF',yellow:'#FFD36A',black:'#111111'};
  for(const kind of Object.keys(ROLLS)){
    s.drops.splice(0,s.drops.length,{x:100,y:300,kind});const commands=[];
    const canvas=new Proxy({}, {get:(_,name)=>(...args)=>commands.push([name,...args]),set:(_,name,value)=>{commands.push([name,value]);return true;}});
    f.game.draw(canvas);
    const group=BOX_GROUP[kind];groups[group].push(JSON.stringify(commands));
    const labelIndex=commands.findIndex(c=>c[0]==='fillText'&&c[1]==='?');
    assert.ok(labelIndex>=0,`${kind} hides its effect behind a question mark`);
    const bodyFillIndex=commands.slice(0,labelIndex).findLastIndex(c=>c[0]==='fill');
    const bodyColor=commands.slice(0,bodyFillIndex).findLast(c=>c[0]==='fillStyle')[1];
    assert.equal(bodyColor,colors[group],`${kind} uses the required ${group} box color`);
  }
  for(const [group,drawings] of Object.entries(groups))assert.equal(new Set(drawings).size,1,`effects within the ${group} group cannot be distinguished by appearance`);
  assert.equal(new Set(Object.values(groups).map(drawings=>drawings[0])).size,3,'white, yellow and black remain visibly distinct');
}

{
  const f=fixture(),counts=Object.fromEntries(Object.keys(ROLLS).map(kind=>[kind,0]));
  function dropAt(roll){
    f.game.testStage(1);f.launch();const s=f.state(),brick=s.bricks.at(-1);
    Object.assign(s.balls[0],{x:brick.x+brick.w/2,y:brick.y+brick.h+5.1,vx:0,vy:-s.speed});
    f.randomValues.push(0,roll);f.game.update(STEP);
    assert.equal(f.state().drops.length,1,'a real destroyed brick produces the selected box');
    return f.state().drops[0].kind;
  }
  for(let i=0;i<2400;i++)counts[dropAt(i/2400)]++;
  assert.deepEqual(counts,{two:200,ten:200,pierce:200,wide:300,slow:300,shrink:400,fast:400,single:400},'a deterministic grid divides effects evenly inside each color group');
  const colors={white:0,yellow:0,black:0};for(const [kind,count] of Object.entries(counts))colors[BOX_GROUP[kind]]+=count;
  assert.deepEqual(colors,{white:600,yellow:600,black:1200},'black occurs twice as often as either white or yellow');
  for(const [boundary,before,after] of [[1/12,'two','ten'],[1/6,'ten','pierce'],[.25,'pierce','wide'],[.375,'wide','slow'],[.5,'slow','shrink'],[2/3,'shrink','fast'],[5/6,'fast','single']]){
    assert.equal(dropAt(boundary-Number.EPSILON),before,'the lower side of each probability boundary selects its preceding effect');
    assert.equal(dropAt(boundary),after,'the exact probability boundary selects its next effect');
    assert.equal(dropAt(boundary+Number.EPSILON),after,'the upper side of each probability boundary selects its next effect');
  }
  assert.equal(dropAt(0),'two');assert.equal(dropAt(1-Number.EPSILON),'single');
}

for(const [kind,notice]of Object.entries({two:'공 2배 · 2개',ten:'공 10배 · 10개',pierce:'관통 · 판 2회',wide:'받침대 길어짐',slow:'공 속도 -10%',shrink:'받침대 짧아짐',fast:'공 속도 +10%',single:'공 1개만 남았어요'})){
  const f=fixture(),item=f.hit(kind);
  assert.equal(f.state().balls.length,1,`${kind} cannot multiply balls before collection`);
  assert.equal(f.state().balls.some(ball=>ball.piercing),false,`${kind} cannot activate piercing before collection`);
  assert.equal(f.state().paddle.w,80,`${kind} cannot change paddle width before collection`);
  near(f.state().speed,280+2*STEP,`${kind} cannot change speed before collection`);
  const labels=()=>{const text=[];const canvas=new Proxy({},{get:(_,name)=>(...args)=>{if(name==='fillText')text.push(args[0]);},set:()=>true});f.game.draw(canvas);return text;};
  assert.ok(labels().includes('?'),'a falling box hides the exact effect');
  assert.equal(labels().includes(notice),false,`${kind} is not announced before collection`);
  f.catchItem(item);assert.ok(labels().includes(notice),`${kind} is announced after collection`);
}

// These checks trigger a real brick collision and collect the resulting drop.
// Observation stays in the fixture; the production module gains no test API.
for(const kind of Object.keys(ROLLS)){
  const f=fixture(),item=f.hit(kind),startY=item.y;f.park();f.advance(.1);
  near(item.y-startY,BOX_GROUP[kind]==='black'?8.75:12.5,`${kind}: black boxes fall thirty percent slower while other colors keep their speed`);
  assert.ok(f.state().drops.includes(item),'the measured box remains in flight before it reaches the paddle');
}
for(const kind of Object.keys(ROLLS)){
  const f=fixture(),item=f.hit(kind),before={width:f.state().paddle.w,speed:f.state().speed},y=item.y;
  assert.equal(before.width,80,`${kind} does not resize the catcher when the box appears`);
  f.game.onMove(340);item.x=12;
  for(const ball of f.state().balls)Object.assign(ball,{x:180,y:380,vx:before.speed,vy:0});
  const elapsed=(565-y)/fallSpeed(kind)+.1;f.advance(elapsed);
  assert.equal(f.state().drops.length,0,`${kind} can be avoided by letting it fall`);
  assert.equal(f.state().balls.length,1,`${kind} cannot multiply balls when missed`);
  assert.equal(f.state().balls.some(ball=>ball.piercing),false,`${kind} cannot activate piercing when missed`);
  assert.equal(f.state().paddle.w,80,`${kind} has no paddle effect when missed`);
  near(f.state().speed,before.speed+2*elapsed,`${kind} has no speed effect when missed`,.001);
  assert.equal(f.sounds.some(sound=>sound==='bonus'||sound==='bad'),false,'missing a box awards no effect sound');
}
{
  const f=fixture();
  const wide=f.hit('wide');f.game.onMove(wide.x);let center=f.state().paddle.x+f.state().paddle.w/2;
  f.catchItem(wide);assert.equal(f.state().paddle.w,96);near(f.state().paddle.x+48,center,'growing preserves the catcher center');
  const shrink=f.hit('shrink');f.game.onMove(shrink.x);center=f.state().paddle.x+48;
  f.catchItem(shrink);assert.equal(f.state().paddle.w,80);near(f.state().paddle.x+40,center,'shrinking preserves the catcher center');
  assert.deepEqual(f.sounds.filter(sound=>sound==='bonus'||sound==='bad'),['bonus','bad'],'harmful pickup sounds are distinguishable');
  for(const edge of [12,348]){
    const item=f.hit('wide');item.x=edge;f.catchItem(item);
    assert.ok(f.state().paddle.x>=0&&f.state().paddle.x+f.state().paddle.w<=360,'growing at an edge stays in the playfield');
    near(edge<180?f.state().paddle.x:f.state().paddle.x+f.state().paddle.w,edge<180?0:360,'growth clamps to the touched edge');
  }
}
{
  const f=fixture();f.game.testStage(10);
  for(let i=0;i<7;i++)f.catchItem(f.hit('wide'));
  assert.equal(f.state().paddle.w,144,'repeat wide pickups have a practical maximum');
  for(let i=0;i<9;i++)f.catchItem(f.hit('shrink'));
  assert.equal(f.state().paddle.w,48,'repeat shrink pickups leave a usable catcher');
  f.catchItem(f.hit('wide'));assert.equal(f.state().paddle.w,64,'a good pickup restores width after hitting the lower limit');
  const speed=f.state().speed;f.missAll();assert.equal(f.state().paddle.w,64,'losing a life keeps the earned size in the current run');
  assert.ok(f.state().speed>=speed);f.game.destroy();
  const fresh=fixture();assert.equal(fresh.state().paddle.w,80,'a new run starts with the standard catcher');assert.equal(fresh.state().speed,280);
}
for(const [setting,pace]of [['slow',.8],['normal',1],['fast',1.15]]){
  const f=fixture({speed:setting});f.game.testStage(10);f.catchItem(f.hit('two'));
  for(const [kind,factor]of [['fast',1.1],['slow',.9]]){
    const item=f.hit(kind),s=f.state(),before=s.speed;
    const directions=[[-.6,-.8],[.8,.6]];
    s.balls.forEach((ball,i)=>Object.assign(ball,{x:180,y:380,vx:directions[i][0]*before,vy:directions[i][1]*before}));
    f.game.onMove(item.x);item.y=s.paddle.y-10;f.game.update(STEP);
    const expected=(before+2*STEP*pace)*factor;
    near(f.state().speed,expected,`${setting}: ${kind} changes current speed by exactly ten percent`);
    s.balls.forEach((ball,i)=>{
      near(Math.hypot(ball.vx,ball.vy),expected,`${kind} applies to every live ball`);
      near(ball.vx/expected,directions[i][0],`${kind} preserves horizontal direction`);
      near(ball.vy/expected,directions[i][1],`${kind} preserves vertical direction`);
    });
    const ball=s.balls[0];Object.assign(ball,{x:s.paddle.x+s.paddle.w/2,y:s.paddle.y-ball.r-.1,vx:0,vy:s.speed});f.game.update(STEP);
    assert.ok(ball.vy<0,'the changed-speed ball still bounces from the catcher');
    near(Math.hypot(ball.vx,ball.vy),f.state().speed,'a paddle bounce keeps the changed speed');
  }
  for(let i=0;i<8;i++)f.catchItem(f.hit('fast'));
  near(f.state().speed,552*pace,`${setting}: repeated speed-ups respect the 20% higher speed cap`);
  for(let i=0;i<14;i++)f.catchItem(f.hit('slow'));
  near(f.state().speed,140*pace,`${setting}: repeated slowdowns retain a playable minimum`);
  f.park();const before=f.state().speed;f.game.update(.05);
  near(f.state().speed,before+.1*pace,'ordinary gradual acceleration still continues after a slowdown');
}
{
  const f=fixture();f.catchItem(f.hit('wide'));f.catchItem(f.hit('slow'));
  const s=f.state(),last=s.bricks.filter(brick=>brick.on&&!brick.solid).at(-1);
  for(const brick of s.bricks)if(!brick.solid)brick.on=brick===last;
  Object.assign(s.balls[0],{x:last.x+last.w/2,y:last.y+last.h+6,vx:0,vy:-s.speed});f.game.update(STEP);
  assert.equal(f.game.continueStage(2),true);
  assert.equal(f.state().paddle.w,80,'continuing a level clears the current board’s paddle-size effect');
  near(f.state().speed,300+10*STEP,'continuing keeps five physics steps and stage acceleration but clears the slowdown');
}
{
  const f=fixture();f.catchItem(f.hit('pierce'));let s=f.state(),ball=s.balls[0];
  Object.assign(ball,{x:ball.r+.1,y:350,vx:-s.speed,vy:0});f.game.update(1/240);
  assert.equal(ball.piercing,true);assert.equal(ball.pierceBounces,2,'left wall does not consume piercing');
  Object.assign(ball,{x:360-ball.r-.1,y:350,vx:s.speed,vy:0});f.game.update(1/240);
  assert.equal(ball.pierceBounces,2,'right wall does not consume piercing');
  Object.assign(ball,{x:180,y:60+ball.r+.1,vx:0,vy:-s.speed});f.game.update(1/240);
  assert.equal(ball.pierceBounces,2,'ceiling does not consume piercing');
  Object.assign(ball,{x:s.paddle.x+s.paddle.w/2,y:s.paddle.y-ball.r-.1,vx:0,vy:s.speed});f.game.update(1/240);
  assert.equal(ball.piercing,true);assert.equal(ball.pierceBounces,1,'first paddle bounce keeps piercing');
  f.game.update(1/240);assert.equal(ball.pierceBounces,1,'moving away from the paddle does not count again');
  Object.assign(ball,{x:180,y:60+ball.r+.1,vx:0,vy:-s.speed});f.game.update(1/240);
  assert.equal(ball.pierceBounces,1,'wall between paddle hits does not count');
  Object.assign(ball,{x:s.paddle.x+s.paddle.w/2,y:s.paddle.y-ball.r-.1,vx:0,vy:s.speed});f.game.update(1/240);
  assert.equal(ball.piercing,false);assert.equal(ball.pierceBounces,0,'second paddle bounce turns piercing off');
  const brick=s.bricks.filter(b=>b.on&&!b.solid&&b.hp===1).at(-1);
  Object.assign(ball,{x:brick.x+brick.w/2,y:brick.y+brick.h+6,vx:0,vy:-s.speed});f.game.update(1/240);
  assert.ok(ball.vy>0,'after two paddle bounces the ball rebounds from bricks again');
}
{
  const f=fixture();f.catchItem(f.hit('pierce'));const s=f.state(),ball=s.balls[0],brick=s.bricks.filter(b=>b.on&&!b.solid&&b.hp===1).at(-1);
  Object.assign(ball,{x:brick.x+brick.w/2,y:brick.y+brick.h+6,vx:0,vy:-s.speed});f.game.update(1/240);
  assert.equal(ball.pierceBounces,2,'passing through a brick does not consume a bounce');
  f.catchItem(f.hit('two'));assert.equal(f.state().balls.filter(b=>b.piercing).length,1,'new balls do not inherit the effect');
  assert.equal(f.state().balls.filter(b=>!b.piercing).every(b=>b.pierceBounces===0),true);
}
console.log('PASS: 100 stages; eight real falling mystery pickups; white/yellow/black boxes at exact 1:1:2 odds with hidden effects and black boxes falling 30% slower; current-count doubling and tenfold up to 100 balls; single preserves the latest living paddle contact and its motion/piercing; bounded center-preserving paddle sizes; ten-percent speed changes for all balls/settings; skipped pickups, run reset and stage continuity; piercing, multiball lives, acceleration, collision and teardown');
