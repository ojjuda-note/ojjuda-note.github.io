const assert=require('node:assert/strict');
const {game}=require('./saetbyeol-fixture.cjs');
const x=game({saved:{intro:true,tut:true,sound:false}});
try{
  const {w,$}=x,f=w.fixture,e=f.encounters;
  let gameSeed=184;w.Math.random=()=>{gameSeed=(Math.imul(gameSeed,1664525)+1013904223)>>>0;return gameSeed/2**32;};
  $('#starStart').click();
  assert.equal(e.catalog.length,50);
  assert.equal(new Set(e.catalog.map(t=>t.id)).size,50);
  assert.equal(new Set(e.catalog.map(t=>t.name)).size,50);
  assert.equal(f.upgrades.length,200);
  assert.equal(new Set(f.upgrades.map(u=>u.id)).size,200);
  assert.equal(f.upgrades.reduce((sum,u)=>sum+u.mx,0),618);
  f.loadProgress({stage:4,lv:Object.fromEntries(f.upgrades.map(u=>[u.id,u.mx])),mem:[3,3,3,3,3],ended:true,intro:true,tut:true,sound:false});
  f.save();x.tick(600);
  const finalRecord=x.messages.find(message=>message.data.type==='ojjuda-game-result');
  assert.equal(finalRecord.data.score,57680,'all 200 completed upgrades are included in the submitted score');
  assert.ok(finalRecord.data.score<=60000,'fully grown scores remain inside the ranking limit');
  assert.equal(Object.values(f.parents).filter(p=>p===null).length,5);
  for(let branch=0;branch<5;branch++){
    assert.equal(f.upgrades.filter(u=>u.b===branch).length,40);
    for(let stage=0;stage<5;stage++)assert.equal(f.upgrades.filter(u=>u.b===branch&&u.r===stage).length,8);
  }
  for(const u of f.upgrades){
    const visited=new Set();let id=u.id;
    while(id){
      assert.ok(!visited.has(id),'tree cannot contain a cycle');visited.add(id);
      const parent=f.upgrades.find(item=>item.id===id);
      assert.ok(parent);assert.equal(parent.b,u.b);assert.ok(parent.r<=u.r);id=f.parents[id];
    }
    f.loadProgress({stage:u.r,lv:{},intro:true,sound:false});const before=f.stats();
    f.state.lv[u.id]=1;const after=f.stats();
    assert.ok(Object.keys(before).some(k=>k!=='pw'&&before[k]!==after[k]),u.id+' must provide an actual improvement');
    assert.ok(after.dmg/before.dmg<=1.15+1e-9,u.id+' cannot multiply damage abruptly');
    for(const value of Object.values(after))assert.ok(Number.isFinite(value));
  }
  let seed=731;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  const seen=new Set(['mem']);
  for(let stage=0;stage<5;stage++){
    assert.equal(e.catalog.filter(t=>t.stage===stage).length,10);
    let crystals=0;
    for(let i=0;i<20000;i++){
      const id=e.pick(stage,1,true,random),type=f.types[id];
      assert.ok(type.stage<=stage);seen.add(id);if(type.ice)crystals++;
      assert.ok(!f.types[e.pick(stage,1,false,random)].ice);
    }
    assert.ok(crystals/20000<.05,'recovery variants share one rare family probability');
  }
  assert.equal(seen.size,50,'every type can actually appear');
  f.loadProgress({stage:4,lv:{},intro:true,tut:true,sound:false});f.startRun(false);
  assert.equal(e.canSpawnHeat(f.run),false,'opening wave cannot contain recovery');
  f.run.time=4;assert.equal(e.canSpawnHeat(f.run),true);f.spawn('ice',true);
  const ice=f.run.nodes.at(-1);f.run.time=100;
  assert.equal(e.canSpawnHeat(f.run),false,'at most one recovery target lives at a time');
  ice.dead=true;assert.equal(e.canSpawnHeat(f.run),true);
  f.run.time=4;ice.dead=false;f.kill(ice);f.run.time=15.99;
  assert.equal(e.canSpawnHeat(f.run),false,'recovery spawns have a twelve second interval');
  f.run.time=16;assert.equal(e.canSpawnHeat(f.run),true);
  f.run.heat=0;assert.equal(e.recoverHeat(f.run,f.liveStats,f.types.time_crystal),0,'a finished timer cannot revive');
  const rounds=[];
  for(let stage=0;stage<5;stage++){
    const levels=Object.fromEntries(f.upgrades.filter(u=>u.r<=stage).map(u=>[u.id,u.mx]));
    f.loadProgress({stage,lv:levels,mem:[3,3,3,3,3],intro:true,tut:true,sound:false});f.startRun(false);
    const limit=f.liveStats.maxHeat/f.liveStats.decay+8;
    f.pointer.has=true;f.pointer.x=-10000;f.pointer.y=-10000;
    let iterations=0;
    // Even an impossible supply of recovery every frame must terminate.
    while(f.mode==='run'&&iterations++<10000){
      f.spawn('time_crystal',true);f.kill(f.run.nodes.at(-1));f.updateRun(.05);
    }
    assert.equal(f.mode,'end','the round must end despite unlimited recovery');
    assert.ok(f.run.time<=limit+.051);assert.ok(f.run.bonusSeconds<=8+1e-9);
    assert.ok(f.run.parts.length<=1410,'effects remain bounded');
    rounds.push(Number(f.run.time.toFixed(2)));
    f.startRun(true);iterations=0;
    while(f.mode==='run'&&iterations++<10000){
      const boss=f.run.boss,moon=boss.moons.find(m=>m.hp>0);
      const radius=Math.min(f.liveStats.radius*1.18,768*.42);
      if(boss.k===2&&moon){f.pointer.x=moon.x;f.pointer.y=moon.y;}
      else{
        const angle=f.run.time*1.7,offset=boss.r+radius*.6;
        f.pointer.x=boss.x+Math.cos(angle)*offset;f.pointer.y=boss.y+Math.sin(angle)*offset;
      }
      f.updateRun(.05);
    }
    assert.equal(f.run.boss.hp,0,`stage ${stage} boss must remain beatable with its completed upgrades`);
  }
  console.log('PASS: 50 reachable targets, 200 rooted upgrades, gradual effects, recovery limits, finite rounds and all five bosses; maximum recovery rounds:',rounds);
  f.startRun(false);const beforeTime=f.run.time;
  $('#catalogBtn').click();assert.equal(f.mode,'catalog');assert.equal(w.document.querySelectorAll('.catalog-list li').length,50);
  assert.equal(f.run.time,beforeTime);$('#ovBtns button').click();assert.equal(f.mode,'run');
  f.setMode('hub');$('#treeFit').click();
  $('#treeIn').click();assert.ok(f.treeView.zoom>1);
  f.state.sel='x4b';$('#treeFocus').click();
  const g=f.hubGeo(),position=f.upPos(f.upgrades.find(u=>u.id==='x4b'),g);
  assert.ok(Math.abs(position.x-g.centerX)<1e-6&&Math.abs(position.y-g.centerY)<1e-6,'selected late branch can be centered');
  const canvas=$('#c');let selected=f.state.sel;
  function pointer(type,id,x,y){const event=new w.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:id,clientX:x,clientY:y,button:0});canvas.dispatchEvent(event);}
  pointer('pointerdown',1,100,150);pointer('pointermove',1,150,160);pointer('pointerup',1,150,160);
  assert.equal(f.state.sel,selected,'panning does not select another upgrade');
  $('#treeFit').click();pointer('pointerdown',1,100,150);pointer('pointerdown',2,200,150);pointer('pointermove',2,280,150);
  assert.ok(f.treeView.zoom>1);pointer('pointerup',1,100,150);pointer('pointerup',2,280,150);
  assert.equal(f.state.sel,selected,'pinching does not select a branch');
  $('#treeFit').click();assert.equal(f.treeView.zoom,1);assert.equal(f.treeView.x,0);assert.equal(f.treeView.y,0);
  f.startRun(false);
  for(const type of e.catalog){f.spawn(type.id,true);f.drawNode(f.run.nodes.at(-1));}
  f.drawRun();f.setMode('hub');f.drawHub(.05);
  console.log('PASS: 50-entry field guide, pause/resume, tree zoom, drag/pinch selection protection and all drawing paths');
}finally{x.dom.window.close();}
