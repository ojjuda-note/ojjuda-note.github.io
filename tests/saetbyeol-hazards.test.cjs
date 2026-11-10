const assert=require('node:assert/strict');
const {test}=require('node:test');
const {game}=require('./saetbyeol-fixture.cjs');

const levels=(fixture,stage,count)=>Object.fromEntries(fixture.upgrades.filter(u=>u.r===stage).slice(0,count).map(u=>[u.id,1]));
const saved=(stage,lv={})=>({stage,maxStage:stage,ended:true,lifeStarted:true,intro:true,tut:true,sound:false,lv,genes:{light:12,water:0,wind:0},geneType:'light'});

test('chapters 3–6 each unlock three different hazards as growth increases',()=>{
  const {w,dom}=game();
  try{
    const h=w.fixture.shadows;
    const stages={6:['jelly','vortex','octopus'],7:['crystal','butterfly','mushroom'],8:['bat','cloud','gravity'],9:['seed','thief','clone']};
    for(const [stage,types] of Object.entries(stages)){
      assert.deepEqual(Array.from(h.stageKinds[stage]),types);
      assert.equal(h.choose(Number(stage),19,()=>.999),types[0]);
      assert.equal(h.choose(Number(stage),60,()=>.999),types[1]);
      assert.equal(h.choose(Number(stage),120,()=>.999),types[2]);
      assert.ok(types.every(type=>h.info(type).name.length>2));
    }
    assert.equal(h.choose(5,200,()=>.9),'shadow','chapter 2 remains compatible');
    assert.equal(h.interval(20),30);assert.equal(h.interval(200),2);
  }finally{dom.window.close();}
});

test('solid hazards need a few taps but only reward after fully clearing',()=>{
  const x=game({width:390,height:740});
  try{
    const f=x.w.fixture;f.loadProgress(saved(7,levels(f,7,60)));
    x.w.Math.random=()=>.999;
    f.startRun(false);
    assert.equal(f.spawnShadow(),true);
    const enemy=f.run.shadows[0];
    assert.equal(enemy.kind,'butterfly');
    assert.equal(enemy.hp,1);
    assert.equal(f.tapShadow(enemy.x,enemy.y),true);
    assert.equal(f.run.shadows.length,0);
    // Late-stage crystals take two taps; a partial touch must not create rewards.
    f.loadProgress(saved(7,levels(f,7,19)));
    x.w.Math.random=()=>.9;f.startRun(false);f.spawnShadow();
    const crystal=f.run.shadows[0],before=f.state.cur.life;
    assert.equal(crystal.kind,'crystal');assert.equal(crystal.hp,2);
    assert.equal(f.tapShadow(crystal.x,crystal.y),true);
    assert.equal(crystal.hp,1);assert.equal(f.run.shadows.length,1);
    assert.equal(f.state.cur.life,before);
    assert.equal(f.tapShadow(crystal.x,crystal.y),true);
    assert.equal(f.run.shadows.length,0);assert.ok(f.state.cur.life>before);
  }finally{x.dom.window.close();}
});

test('ocean ink and forest spores briefly tint the screen, without changing saved upgrades',()=>{
  for(const [stage,kind] of [[6,'octopus'],[7,'mushroom'],[9,'seed']]){
    const x=game({width:500,height:700});
    try{
      const f=x.w.fixture;f.loadProgress(saved(stage,levels(f,stage,200)));
      f.startRun(false);const r=f.run;
      x.w.Math.random=()=>kind==='seed'?.01:.999;f.spawnShadow();
      const enemy=r.shadows[0];assert.equal(enemy.kind,kind);
      enemy.age=1.5;enemy.fire=.001;
      f.pointer.has=true;f.pointer.x=250;f.pointer.y=420;
      f.updateShadows(.05,{x:250,y:420});
      assert.ok(r.shadowShots.length>0);
      const shot=r.shadowShots[0];shot.x=250;shot.y=420;shot.vx=shot.vy=0;
      const before=r.heat;f.updateShadows(.01,{x:250,y:420});
      assert.ok(r.heat<before);assert.ok(r.hazardVeil>0,kind);
      const original=JSON.stringify(f.state.lv);
      f.updateShadows(.5,{x:250,y:420});
      assert.equal(JSON.stringify(f.state.lv),original,'combat cannot erase upgrades');
      f.drawRun();
    }finally{x.dom.window.close();}
  }
});

test('crystal butterflies, storm clouds and cosmic clones fire different volleys',()=>{
  for(const [stage,kind,shots] of [[7,'butterfly',2],[8,'cloud',2],[9,'clone',3]]){
    const x=game();
    try{
      const f=x.w.fixture;f.loadProgress(saved(stage,levels(f,stage,200)));
      x.w.Math.random=()=>kind==='clone'?.999:.5;f.startRun(false);f.spawnShadow();
      const enemy=f.run.shadows[0];assert.equal(enemy.kind,kind);
      enemy.age=1.2;enemy.fire=.001;
      f.updateShadows(.05,{x:420,y:390});
      assert.equal(f.run.shadowShots.length,shots);
      assert.ok(f.run.shadowShots.every(shot=>shot.kind===kind));
      f.drawRun();
    }finally{x.dom.window.close();}
  }
});

test('chapters 3–6 have unique boss names, glowing portraits and gentle volleys',()=>{
  const bosses=['심해 그림자 고래','수정 골렘','폭풍의 천공 드래곤','우주의 공허한 심장'];
  for(let stage=6;stage<=9;stage++){
    const x=game({width:390,height:740,reducedMotion:true});
    try{
      const f=x.w.fixture;
      const full=Object.fromEntries(f.upgrades.filter(u=>u.r<=stage).map(u=>[u.id,u.mx]));
      f.loadProgress(saved(stage,full));f.startRun(true);
      assert.equal(f.run.boss.k,stage);
      assert.equal(f.life.chapters[stage-5].boss,bosses[stage-6]);
      f.run.boss.fire=6;f.updateRun(.05);
      assert.ok(f.run.shards.length>=3,'boss sends dodgeable glowing shots');
      assert.equal(f.run.shadows.length,0,'regular villains stay out of boss encounters');
      f.drawRun();
    }finally{x.dom.window.close();}
  }
});
