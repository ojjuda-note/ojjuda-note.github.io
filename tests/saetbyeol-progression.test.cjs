const test=require('node:test');
const assert=require('node:assert/strict');
const {game}=require('./saetbyeol-fixture.cjs');

function fixture(t,stage=0){
  const x=game(),f=x.w.fixture;t.after(()=>x.dom.window.close());
  f.loadProgress({stage,lv:Object.fromEntries(f.upgrades.filter(u=>u.r<=stage).map(u=>[u.id,u.mx])),intro:true,tut:true,sound:false});
  f.startRun(true);
  return {...x,f,kill:()=>{f.run.boss.shield=false;f.hurtBoss(1e20);}};
}

test('a living boss cannot trigger evolution even when the completion handler is called directly',t=>{
  const x=fixture(t);assert.ok(x.f.run.boss.hp>0);
  assert.equal(x.f.winBoss(),false);x.tick(900);
  assert.equal(x.f.state.stage,0);assert.equal(x.f.mode,'run');
});

test('defeating the current boss evolves once after its celebration',t=>{
  const x=fixture(t);x.kill();
  assert.equal(x.f.state.stage,0);assert.equal(x.f.mode,'end');
  assert.equal(x.f.winBoss(),false,'the same defeat cannot enqueue another evolution');
  x.tick(900);assert.equal(x.f.state.stage,1);
  x.tick(900);assert.equal(x.f.state.stage,1);
});

test('reset during a victory celebration cannot advance the new game',t=>{
  const x=fixture(t,1);x.kill();x.f.resetGame();
  assert.equal(x.f.state.stage,0);assert.equal(x.f.run,null);
  x.tick(900);assert.equal(x.f.state.stage,0);assert.equal(x.f.mode,'hub');
});

test('an old boss result cannot change a replacement run',t=>{
  const x=fixture(t,1);x.kill();x.f.startRun(false);
  const current=x.f.run;x.tick(900);
  assert.equal(x.f.run,current);assert.equal(x.f.state.stage,1);assert.equal(x.f.mode,'run');
});

test('an old boss result cannot change replacement saved progress',t=>{
  const x=fixture(t,1);x.kill();
  x.f.loadProgress({stage:0,lv:{},intro:true,tut:true,sound:false});
  x.tick(900);assert.equal(x.f.state.stage,0);
});

test('the final boss completes the final evolution without creating a sixth stage',t=>{
  const x=fixture(t,4);x.kill();x.tick(900);
  assert.equal(x.f.state.stage,4);assert.match(x.$('#overlay').textContent,/모두 삼킨다/);
});
