const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test');
const KEY='ojjuda-breakout-last-stage-v1';
const original=fs.readFileSync(path.join(__dirname,'../games/breakout/breakout-game.js'),'utf8');
// Observe real game transitions without adding a test interface to the shipped engine.
const source=original.replace('    return game;',`    game.inspect=()=>({balls,bricks,drops,paddle,waiting,finished,completed,lives,score,level,speed});
    return game;`);
assert.notEqual(source,original);

function fixture({storage=new Map(),readThrows=false,writeThrows=false,speed='normal'}={}){
  const math=Object.create(Math);math.random=()=>.99;
  const context={window:{OjjudaGameControls:{get:()=>({speed})}},Math:math};
  if(storage)context.localStorage={
    getItem(key){if(readThrows)throw Error('storage blocked');return storage.get(key)??null;},
    setItem(key,value){if(writeThrows)throw Error('storage full');storage.set(key,String(value));}
  };
  vm.runInNewContext(source,context);
  function open(startStage){
    const scores=[],ends=[],clears=[];
    const game=context.window.OjjudaBreakoutGame.create({setScore:n=>scores.push(n),end:n=>ends.push(n),stageClear:n=>clears.push(n)},startStage);
    const state=()=>game.inspect();
    function hit(brick,dt=1/240){
      if(state().waiting)game.onKey(' ');
      const s=state();Object.assign(s.balls[0],{x:brick.x+brick.w/2,y:brick.y+brick.h+6,vx:0,vy:-s.speed});
      game.update(dt);
    }
    function finishStage(dt=1/240){
      const s=state(),last=s.bricks.filter(b=>b.on&&!b.solid).at(-1);
      assert.ok(last,'the current board has a breakable brick');
      for(const brick of s.bricks)if(!brick.solid)brick.on=brick===last;
      last.hp=1;hit(last,dt);
    }
    function loseLife(){
      if(state().waiting)game.onKey(' ');
      for(const ball of state().balls)ball.y=565;
      game.update(1/240);
    }
    return {game,state,scores,ends,clears,finishStage,loseLife,hit};
  }
  return {open,storage,readStage:()=>context.window.OjjudaBreakoutGame.readStage(),levels:context.window.OjjudaBreakoutGame.levels};
}

function assertFresh(run,level,bricks){
  const s=run.state();
  assert.equal(run.game.stage,level,'the public stage reflects the currently played level');
  assert.equal(run.game.stageCleared,false);
  assert.deepEqual([s.level,s.bricks.length,s.score,s.lives,s.balls.length,s.waiting,s.finished,s.completed],[level,bricks,0,3,1,true,false,false]);
  assert.ok(s.bricks.every(b=>b.on&&b.hp===b.maxHp),'reentry rebuilds every brick with its full strength');
  assert.equal(s.drops.length,0);assert.equal(s.balls[0].piercing,false);
  assert.equal(s.balls[0].vx,0);assert.equal(s.balls[0].vy,0);
  assert.deepEqual(run.scores,[],'restoring a level does not replay old points');
  assert.deepEqual(run.ends,[],'restoring a level does not submit another result');
  assert.deepEqual(run.clears,[],'restoring a level does not replay a completion event');
}

test('breakout remembers the actual entered level across exit, reentry and a new page',()=>{
  const retained=[['ojjuda-screw-last-stage-v1','37'],['ojjuda-screw-flat-last-stage-v1','14'],['unrelated-entry','keep-me']];
  const storage=new Map(retained),engine=fixture({storage}),first=engine.open();
  assertFresh(first,1,14);assert.equal(storage.get(KEY),'1');
  first.finishStage();assert.equal(first.game.continueStage(2),true);assert.equal(first.state().level,2);assert.equal(storage.get(KEY),'2');
  first.finishStage();assert.equal(first.game.continueStage(3),true);assert.equal(first.state().level,3);assert.equal(storage.get(KEY),'3');
  const oldBoard=first.state().bricks;
  first.hit(oldBoard.find(b=>b.on&&!b.solid&&b.hp===1));
  first.loseLife();assert.equal(first.state().lives,2);assert.ok(first.state().score>0);
  first.state().balls[0].piercing=true;first.state().balls[0].pierceBounces=2;
  first.state().drops.push({x:100,y:300,kind:'ten'});
  first.game.destroy();assert.equal(storage.get(KEY),'3','leaving an unfinished board keeps its level');
  const second=engine.open();assertFresh(second,3,34);assert.notEqual(second.state().bricks,oldBoard);second.game.destroy();
  const reloaded=fixture({storage:new Map(storage)}).open();assertFresh(reloaded,3,34);reloaded.game.destroy();
  assert.deepEqual([...storage].filter(([key])=>key!==KEY),retained,'other games and unrelated saved data stay intact');
});

test('breakout retries the same level after losing all three lives',()=>{
  const engine=fixture(),run=engine.open();run.finishStage();assert.equal(run.game.continueStage(2),true);run.finishStage();assert.equal(run.game.continueStage(3),true);
  for(let i=0;i<3;i++)run.loseLife();
  assert.equal(run.state().finished,true);assert.equal(run.state().completed,false);
  assert.equal(run.ends.length,1);assert.equal(engine.storage.get(KEY),'3');
  assert.equal(run.game.finishRun(),false);assert.equal(run.game.continueStage(4),false);
  run.game.update(.05);assert.equal(run.ends.length,1);run.game.destroy();
  const retry=engine.open();assertFresh(retry,3,34);retry.game.destroy();
});

test('breakout honors an explicit selected level and remembers a lower selection as the last played level',()=>{
  const storage=new Map([[KEY,'37']]),engine=fixture({storage});
  assert.equal(engine.levels,100);assert.equal(engine.readStage(),37);assert.equal(storage.get(KEY),'37','reading the menu level does not change progress');
  const lower=engine.open(2);assertFresh(lower,2,24);assert.equal(storage.get(KEY),'2');
  lower.finishStage();assert.equal(lower.game.continueStage(3),true);assert.equal(lower.game.stage,3);assert.equal(engine.readStage(),3);lower.game.destroy();
  const returned=engine.open();assertFresh(returned,3,34);returned.game.destroy();
  const final=engine.open(100);assertFresh(final,100,1000);assert.equal(engine.readStage(),100);final.game.destroy();
  const first=engine.open(1);assertFresh(first,1,14);assert.equal(engine.readStage(),1);first.game.destroy();
  const reloaded=fixture({storage:new Map(storage)}).open();assertFresh(reloaded,1,14);reloaded.game.destroy();
});

test('breakout validates explicit level selections while undefined uses the saved level',()=>{
  for(const value of [null,false,true,0,-1,101,1.5,NaN,Infinity,'3',{},[]]){
    const storage=new Map([[KEY,'37']]),run=fixture({storage}).open(value);
    assertFresh(run,1,14);assert.equal(storage.get(KEY),'1');run.game.destroy();
  }
  const engine=fixture({storage:new Map([[KEY,'37']])}),run=engine.open(undefined);
  assertFresh(run,37,373);assert.equal(engine.readStage(),37);run.game.destroy();
});

test('breakout keeps level 100 after a complete run and never stores level 101',()=>{
  const engine=fixture(),run=engine.open();
  for(let level=1;level<=100;level++){
    assert.equal(run.state().level,level);assert.equal(engine.storage.get(KEY),String(level));
    run.finishStage();
    if(level<100){
      assert.equal(run.ends.length,0);assert.equal(run.game.stage,level);assert.equal(engine.storage.get(KEY),String(level),'clearing alone does not advance the saved level');
      assert.equal(run.game.continueStage(level+1),true);
    }
  }
  assert.equal(run.state().completed,true);assert.equal(run.state().level,100);
  assert.equal(run.game.resultTitle,'100단계 클리어!');assert.equal(run.ends.length,1);
  assert.equal(run.clears.length,99);assert.equal(run.game.continueStage(101),false);assert.equal(run.game.finishRun(),false);
  assert.equal(engine.storage.get(KEY),'100');run.game.destroy();
  const retry=engine.open();assertFresh(retry,100,1000);retry.game.destroy();
});

test('breakout rejects missing, malformed and out-of-range saved levels',()=>{
  for(const value of [undefined,'',' ','0','-1','101','1.5','37junk','NaN','Infinity','{}','[5]']){
    const storage=new Map(value===undefined?[]:[[KEY,value]]),run=fixture({storage}).open();
    assertFresh(run,1,14);assert.equal(storage.get(KEY),'1',String(value));run.game.destroy();
  }
  for(const [value,count] of [['1',14],['37',373],['100',1000]]){
    const run=fixture({storage:new Map([[KEY,value]])}).open();
    assertFresh(run,Number(value),count);run.game.destroy();
  }
});

test('breakout remains playable when saved levels cannot be read or written',()=>{
  for(const options of [{storage:null},{readThrows:true},{readThrows:true,writeThrows:true}]){
    const engine=fixture(options),run=engine.open();assertFresh(run,1,14);
    run.finishStage();assert.equal(run.game.continueStage(2),true);assert.equal(run.state().level,2);run.game.destroy();
    const next=engine.open();assertFresh(next,1,14);next.game.destroy();
  }
  const storage=new Map([[KEY,'3']]),engine=fixture({storage,writeThrows:true}),run=engine.open();
  assertFresh(run,3,34);run.finishStage();assert.equal(run.game.continueStage(4),true);assert.equal(run.state().level,4);
  assert.equal(storage.get(KEY),'3','a failed write preserves the existing saved level');run.game.destroy();
  const next=engine.open();assertFresh(next,3,34);next.game.destroy();
});

test('breakout retains the selected speed setting when starting a fresh saved-level game',()=>{
  for(const [speed,pace] of [['slow',.8],['normal',1],['fast',1.15]]){
    const run=fixture({storage:new Map([[KEY,'3']]),speed}).open();
    assertFresh(run,3,34);assert.equal(run.state().speed,280*pace);
    run.game.update(.1);assert.equal(run.state().speed,280*pace,'waiting to launch does not accelerate the ball');run.game.destroy();
  }
});

test('breakout pauses after a clear and keeps that level when the player leaves without continuing',()=>{
  const engine=fixture(),run=engine.open();
  run.state().drops.push({x:100,y:300,kind:'ten'});run.finishStage(.1);
  assert.equal(run.game.stage,1);assert.equal(run.game.stageCleared,true);assert.equal(run.state().finished,false);
  assert.equal(engine.readStage(),1);assert.equal(run.state().drops.length,0);
  assert.deepEqual(run.clears,[run.state().score]);assert.deepEqual(run.ends,[]);
  const before=JSON.stringify(run.state());
  for(let i=0;i<3;i++)run.game.update(.1);
  run.game.onDown(0);run.game.onMove(300);
  for(const key of ['ArrowLeft','ArrowRight',' ','Enter'])assert.equal(run.game.onKey(key),false);
  assert.equal(JSON.stringify(run.state()),before,'time, pointer input and keyboard input cannot move the cleared board');
  assert.equal(run.clears.length,1,'a long clear frame and later updates emit only one event');
  assert.equal(engine.storage.get(KEY),'1');run.game.destroy();
  const reopened=fixture({storage:new Map(engine.storage)}).open();assertFresh(reopened,1,14);reopened.game.destroy();
});

test('breakout continues only to the next level and preserves the accumulated run state',()=>{
  const engine=fixture({speed:'fast'}),run=engine.open();
  assert.equal(run.game.continueStage(2),false);assert.equal(run.game.finishRun(),false,'an active board is not a cleared run');
  run.loseLife();run.game.onKey(' ');run.game.update(.1);run.finishStage(.1);
  const before={score:run.state().score,lives:run.state().lives,speed:run.state().speed};
  assert.equal(before.lives,2);assert.ok(before.score>0);
  for(const next of [undefined,null,0,1,3,'2',2.5,Infinity])assert.equal(run.game.continueStage(next),false,'only the immediately following numeric level is eligible');
  assert.equal(engine.readStage(),1);assert.equal(run.game.stageCleared,true);
  assert.equal(run.game.continueStage(2),true);
  const after=run.state();
  assert.equal(run.game.stage,2);assert.equal(run.game.stageCleared,false);assert.equal(engine.readStage(),2);
  assert.equal(after.score,before.score);assert.equal(after.lives,before.lives);
  assert.equal(after.speed,280*1.15,'continuation resets the ball to the selected base speed');
  assert.equal(after.bricks.length,24);assert.ok(after.bricks.every(b=>b.on&&b.hp===b.maxHp));
  assert.equal(after.balls.length,1);assert.equal(after.balls[0].piercing,false);assert.equal(after.waiting,true);assert.equal(after.drops.length,0);
  assert.equal(run.game.continueStage(3),false);assert.equal(run.game.finishRun(),false);assert.deepEqual(run.ends,[]);assert.equal(run.clears.length,1);
  run.game.destroy();
});

test('breakout finishes a cleared run once before starting a separate previous or current level',()=>{
  for(const selected of [2,3]){
    const engine=fixture({storage:new Map([[KEY,'3']])}),run=engine.open();run.finishStage(.1);
    const score=run.state().score;assert.equal(run.game.stageCleared,true);assert.deepEqual(run.ends,[]);
    assert.equal(run.game.finishRun(),true);assert.equal(run.game.stageCleared,true);assert.equal(run.state().finished,true);
    assert.deepEqual(run.ends,[score]);assert.equal(run.game.finishRun(),false);assert.equal(run.game.continueStage(4),false);
    run.game.update(.1);run.game.onDown(180);run.game.destroy();assert.deepEqual(run.ends,[score],'completion, repeated clicks and teardown cannot submit twice');
    const restart=engine.open(selected);assertFresh(restart,selected,selected===2?24:34);assert.equal(engine.readStage(),selected);restart.game.destroy();
  }
});
