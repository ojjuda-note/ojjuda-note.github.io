const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test');
const KEY='ojjuda-breakout-last-stage-v1';
const original=fs.readFileSync(path.join(__dirname,'../games/breakout-game.js'),'utf8');
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
    const scores=[],ends=[];
    const game=context.window.OjjudaBreakoutGame.create({setScore:n=>scores.push(n),end:n=>ends.push(n)},startStage);
    const state=()=>game.inspect();
    function hit(brick){
      if(state().waiting)game.onKey(' ');
      const s=state();Object.assign(s.balls[0],{x:brick.x+brick.w/2,y:brick.y+brick.h+6,vx:0,vy:-s.speed});
      game.update(1/240);
    }
    function finishStage(){
      const s=state(),last=s.bricks.filter(b=>b.on&&!b.solid).at(-1);
      assert.ok(last,'the current board has a breakable brick');
      for(const brick of s.bricks)if(!brick.solid)brick.on=brick===last;
      last.hp=1;hit(last);
    }
    function loseLife(){
      if(state().waiting)game.onKey(' ');
      for(const ball of state().balls)ball.y=565;
      game.update(1/240);
    }
    return {game,state,scores,ends,finishStage,loseLife,hit};
  }
  return {open,storage,readStage:()=>context.window.OjjudaBreakoutGame.readStage(),levels:context.window.OjjudaBreakoutGame.levels};
}

function assertFresh(run,level,bricks){
  const s=run.state();
  assert.equal(run.game.stage,level,'the public stage reflects the currently played level');
  assert.deepEqual([s.level,s.bricks.length,s.score,s.lives,s.balls.length,s.waiting,s.finished,s.completed],[level,bricks,0,3,1,true,false,false]);
  assert.ok(s.bricks.every(b=>b.on&&b.hp===b.maxHp),'reentry rebuilds every brick with its full strength');
  assert.equal(s.drops.length,0);assert.equal(s.balls[0].piercing,false);
  assert.equal(s.balls[0].vx,0);assert.equal(s.balls[0].vy,0);
  assert.deepEqual(run.scores,[],'restoring a level does not replay old points');
  assert.deepEqual(run.ends,[],'restoring a level does not submit another result');
}

test('breakout remembers the actual entered level across exit, reentry and a new page',()=>{
  const retained=[['ojjuda-screw-last-stage-v1','37'],['ojjuda-screw-flat-last-stage-v1','14'],['unrelated-entry','keep-me']];
  const storage=new Map(retained),engine=fixture({storage}),first=engine.open();
  assertFresh(first,1,14);assert.equal(storage.get(KEY),'1');
  first.finishStage();assert.equal(first.state().level,2);assert.equal(storage.get(KEY),'2');
  first.finishStage();assert.equal(first.state().level,3);assert.equal(storage.get(KEY),'3');
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
  const engine=fixture(),run=engine.open();run.finishStage();run.finishStage();
  for(let i=0;i<3;i++)run.loseLife();
  assert.equal(run.state().finished,true);assert.equal(run.state().completed,false);
  assert.equal(run.ends.length,1);assert.equal(engine.storage.get(KEY),'3');
  run.game.update(.05);assert.equal(run.ends.length,1);run.game.destroy();
  const retry=engine.open();assertFresh(retry,3,34);retry.game.destroy();
});

test('breakout honors an explicit selected level and remembers a lower selection as the last played level',()=>{
  const storage=new Map([[KEY,'37']]),engine=fixture({storage});
  assert.equal(engine.levels,100);assert.equal(engine.readStage(),37);assert.equal(storage.get(KEY),'37','reading the menu level does not change progress');
  const lower=engine.open(2);assertFresh(lower,2,24);assert.equal(storage.get(KEY),'2');
  lower.finishStage();assert.equal(lower.game.stage,3);assert.equal(engine.readStage(),3);lower.game.destroy();
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
    if(level<100)assert.equal(run.ends.length,0);
  }
  assert.equal(run.state().completed,true);assert.equal(run.state().level,100);
  assert.equal(run.game.resultTitle,'100단계 클리어!');assert.equal(run.ends.length,1);
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
    run.finishStage();assert.equal(run.state().level,2);run.game.destroy();
    const next=engine.open();assertFresh(next,1,14);next.game.destroy();
  }
  const storage=new Map([[KEY,'3']]),engine=fixture({storage,writeThrows:true}),run=engine.open();
  assertFresh(run,3,34);run.finishStage();assert.equal(run.state().level,4);
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
