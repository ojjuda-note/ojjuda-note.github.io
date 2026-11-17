const test=require('node:test');
const assert=require('node:assert/strict');
const {game,owner}=require('./saetbyeol-fixture.cjs');

function engine(t){
  const session=game();
  t.after(()=>session.dom.window.close());
  return session.w.fixture;
}
function counters(state){
  return [state.foodCollected,state.legacyFoodCredit,state.pendingLegacyFoodCredit];
}

test('older saves use purchased life levels and their own biome food thresholds',t=>{
  const f=engine(t),levels={};
  for(let stage=5;stage<=9;stage++)levels[f.upgrades.find(u=>u.r===stage).id]=stage===5?3:1;
  levels[f.upgrades.find(u=>u.r===0).id]=5;
  const saved={stage:1,maxStage:9,lv:levels,cur:{life:5000},mem:Array(10).fill(3)};
  f.loadProgress(saved);
  assert.deepEqual(counters(f.state),[0,3*7+8+9+10+12,0]);
  const everyLevel=Object.fromEntries(f.upgrades.map(u=>[u.id,u.mx]));
  f.loadProgress({...saved,lv:everyLevel});
  assert.deepEqual(counters(f.state),[0,27600,0]);
});

test('only evidence of life play earns the minimum credit',t=>{
  const f=engine(t);
  for(const saved of [null,{stage:4,ended:true,mem:[3,3,3,3,3]}, {stage:5,ended:true,lifeStarted:true}]){
    f.loadProgress(saved);
    assert.deepEqual(counters(f.state),[0,0,0]);
  }
  for(const evidence of [{cur:{life:1}},{genes:{water:1}},{mem:[0,0,0,0,0,1]},{maxStage:6}]){
    f.loadProgress({stage:5,...evidence});
    assert.deepEqual(counters(f.state),[0,7,0]);
  }
  const future=f.upgrades.find(u=>u.r===9).id;
  f.loadProgress({stage:5,lv:{[future]:9},mem:[0,0,0,0,0,0,0,0,0,3]});
  assert.deepEqual(counters(f.state),[0,0,0]);
});

test('saves with a food counter reserve only the missing estimate for host verification',t=>{
  const f=engine(t),id=f.upgrades.find(u=>u.r===5).id;
  for(const [measured,pending] of [[0,21],[4,17],[21,0],[22,0]]){
    f.loadProgress({stage:5,lv:{[id]:3},foodCollected:measured});
    assert.deepEqual(counters(f.state),[measured,0,pending]);
  }
  f.loadProgress({stage:5,cur:{life:1},foodCollected:1});
  assert.deepEqual(counters(f.state),[1,0,6]);
});

test('reloading never recalculates a reserved, settled, or zero estimate after new play',t=>{
  const f=engine(t),id=f.upgrades.find(u=>u.r===5).id;
  for(const original of [
    {stage:5,lv:{[id]:1}},
    {stage:5,lv:{[id]:1},foodCollected:3},
    {stage:5,foodCollected:0,legacyFoodCredit:0,pendingLegacyFoodCredit:0}
  ]){
    f.loadProgress(original);
    const [measured,credit,pending]=counters(f.state);
    const saved=JSON.parse(JSON.stringify(f.state));
    saved.lv[id]=3;saved.foodCollected=measured+8;
    f.loadProgress(saved);
    assert.deepEqual(counters(f.state),[measured+8,credit,pending]);
  }
});

test('returning from admin demo verifies the original save and ignores late demo-time replies',t=>{
  const x=game({admin:true,member:owner,saved:{stage:5,cur:{life:1},foodCollected:2}});
  t.after(()=>x.dom.window.close());
  const f=x.w.fixture;
  const requests=()=>x.messages.filter(({data})=>data.type==='ojjuda-saetbyeol-legacy-food-check');
  const reply=requestId=>x.receive({type:'ojjuda-saetbyeol-legacy-food',requestId,eligible:true});
  const first=requests()[0].data.requestId;
  assert.deepEqual(counters(f.state),[2,0,5]);
  f.startDemo(9);
  reply(first);
  assert.deepEqual(counters(f.state),[0,0,0]);
  f.endDemo();
  assert.equal(requests().length,2);
  const second=requests()[1].data.requestId;
  assert.notEqual(first,second);
  reply(first);
  assert.deepEqual(counters(f.state),[2,0,5]);
  reply(second);
  assert.deepEqual(counters(f.state),[2,5,0]);
});

test('entry applies the reserved estimate once, even after offline play or a repeated reply',t=>{
  const saved={stage:5,ended:true,intro:true,tut:true,cur:{life:1},foodCollected:2};
  const x=game({saved}),state=x.w.fixture.state;
  t.after(()=>x.dom.window.close());
  const load=()=>JSON.parse(x.w.localStorage.getItem('ojjuda.saetbyeol.save.v1:guest'));
  const latest=()=>x.messages.filter(m=>m.data.type==='ojjuda-saetbyeol-legacy-food-check').at(-1).data.requestId;
  const reply=(requestId,eligible)=>x.receive({type:'ojjuda-saetbyeol-legacy-food',requestId,eligible});
  assert.deepEqual(counters(load()),[2,0,5]);
  assert.equal(x.$('#entryFoodCredit').hidden,false);
  reply(latest(),null);
  x.$('#starStart').click();
  const id=latest();
  state.foodCollected++;
  x.w.fixture.save();
  assert.deepEqual(counters(load()),[3,0,5]);
  reply(id,true);reply(id,true);
  assert.deepEqual(counters(load()),[3,5,0]);
  assert.match(x.$('#starFoodCredit').textContent,/\+5점/);
  x.tick(600);
  assert.equal(x.messages.find(m=>m.data.type==='ojjuda-game-result').data.score,50008);
  const reopened=game({saved:load()});t.after(()=>reopened.dom.window.close());
  assert.equal(reopened.messages.some(m=>m.data.type==='ojjuda-saetbyeol-legacy-food-check'),false);
  assert.deepEqual(counters(reopened.w.fixture.state),[3,5,0]);
});

test('ineligible history, reset, and demo never receive a stale award',t=>{
  const saved={stage:5,intro:true,tut:true,ended:true,cur:{life:1},foodCollected:1};
  for(const scenario of ['ineligible','reset','demo']){
    const x=game({saved,member:'10000000-0000-0000-0000-000000000001',admin:scenario==='demo'});
    t.after(()=>x.dom.window.close());
    const history=()=>x.messages.filter(m=>m.data.type==='ojjuda-saetbyeol-legacy-food-check').at(-1).data.requestId;
    const requestId=history();
    if(scenario==='reset')x.w.fixture.resetGame();
    if(scenario==='demo')x.w.fixture.startDemo(8);
    x.receive({type:'ojjuda-saetbyeol-legacy-food',requestId,eligible:scenario!=='ineligible'});
    assert.equal(x.w.fixture.state.legacyFoodCredit,0);
    if(scenario==='demo'){
      x.w.fixture.endDemo();
      assert.notEqual(history(),requestId);
      x.receive({type:'ojjuda-saetbyeol-legacy-food',requestId:history(),eligible:true});
      assert.equal(x.w.fixture.state.legacyFoodCredit,6);
    } else {
      assert.equal(x.w.fixture.state.pendingLegacyFoodCredit,0);
    }
  }
});
