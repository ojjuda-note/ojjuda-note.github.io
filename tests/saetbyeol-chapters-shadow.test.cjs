const assert=require('node:assert/strict');
const {test}=require('node:test');
const {game}=require('./saetbyeol-fixture.cjs');

const cards=w=>[...w.document.querySelectorAll('#chapterGrid button[data-chapter]')];
const lifeLevels=(fixture,stage,count=200)=>Object.fromEntries(fixture.upgrades.filter(u=>u.r===stage).slice(0,count).map(u=>[u.id,1]));

test('six chapters appear, with only chapter one unlocked for new players',()=>{
  const x=game({width:390,height:740});
  try{
    const {w,$}=x,f=w.fixture;
    assert.equal($('#starChapters').disabled,false);
    $('#starChapters').click();
    assert.equal(f.mode,'hub');assert.equal($('#starEntry').hidden,true);
    assert.equal($('#chapterSelect').hidden,false);
    assert.equal(cards(w).length,6);
    assert.equal(cards(w)[0].disabled,false);
    assert.ok(cards(w).slice(1).every(button=>button.disabled));
    cards(w)[1].click();assert.equal(f.state.stage,0,'locked cards cannot jump ahead');
    $('#chapterClose').click();assert.equal($('#chapterSelect').hidden,true);
    assert.equal($('#chapterCurrent').textContent,'1챕터 · 샛별의 탄생');
  }finally{x.dom.window.close();}
});

test('existing first ending unlocks chapter two and keeps its portal story',()=>{
  const x=game({saved:{stage:4,ended:true,legacyEnding:'아침의 별',intro:true,tut:true,sound:false}});
  try{
    const {w,$}=x,f=w.fixture;
    assert.equal(f.state.maxStage,5,'old first ending migrates to the second chapter unlock');
    $('#starChapters').click();
    assert.equal(cards(w)[1].disabled,false);
    assert.equal(cards(w)[2].disabled,true);
    cards(w)[1].click();
    assert.equal(f.state.stage,5);assert.equal(f.state.lifeStarted,true);
    assert.ok($('#overlay').classList.contains('on'),'new chapter retains its opening story');
    assert.equal($('#chapterSelect').hidden,true);
    assert.equal(f.state.maxStage,5);
  }finally{x.dom.window.close();}
});

test('each life boss unlocks only the next chapter; replay and reload preserve all progress',()=>{
  const seed=game();
  const completed=Object.fromEntries(seed.w.fixture.upgrades.filter(u=>u.r<=5).map(u=>[u.id,u.mx]));
  seed.dom.window.close();
  const x=game({saved:{stage:5,ended:true,lifeStarted:true,intro:true,tut:true,sound:false,lv:completed}});
  try{
    const {w,$}=x,f=w.fixture;
    $('#starGrowth').click();$('#chapterBtn').click();
    assert.equal(cards(w)[1].disabled,false);assert.equal(cards(w)[2].disabled,true);
    $('#chapterClose').click();
    f.startRun(true);assert.ok(f.run.boss);
    f.run.boss.hp=0;assert.equal(f.winBoss(),true);x.tick(900);
    assert.equal(f.state.stage,6);assert.equal(f.state.maxStage,6);
    for(let i=0;i<6&&$('#overlay').classList.contains('on');i++)$('#overlay').click();
    $('#chapterBtn').click();assert.equal(cards(w)[2].disabled,false);
    assert.equal(cards(w)[3].disabled,true);
    cards(w)[1].click();assert.equal(f.state.stage,5);
    assert.equal(f.state.maxStage,6,'visiting a previous chapter does not revoke its successor');
    const oldNode=f.upgrades.find(u=>u.r===5);
    assert.equal(f.state.lv[oldNode.id],oldNode.mx);
    const raw=JSON.parse(w.localStorage.getItem('ojjuda.saetbyeol.save.v1:guest'));
    assert.equal(raw.stage,5);assert.equal(raw.maxStage,6);
    const restored=game({saved:raw});
    try{
      assert.equal(restored.w.fixture.state.maxStage,6);
      assert.equal(restored.w.fixture.state.lv[oldNode.id],oldNode.mx);
      restored.$('#starChapters').click();
      assert.equal(cards(restored.w)[2].disabled,false);
      assert.equal(cards(restored.w)[3].disabled,true);
    }finally{restored.dom.window.close();}
  }finally{x.dom.window.close();}
});

test('chapter one never spawns shadows; fewer than 20 growths allow just one rare visitor',()=>{
  const x=game({width:390,height:740,saved:{stage:4,intro:true,tut:true,sound:false}});
  try{
    const {w,$}=x,f=w.fixture;
    $('#starGrowth').click();f.startRun(false);
    assert.equal(f.run.shadowSteps,0);assert.equal(f.run.shadows.length,0);
    assert.equal($('#boostBtn').hidden,false,'original stages keep their booster');
    const levels=lifeLevels(f,5,19);
    f.loadProgress({stage:5,maxStage:5,lifeStarted:true,ended:true,lv:levels,intro:true,tut:true,sound:false});
    f.startRun(false);assert.equal(f.run.shadowSteps,19);
    assert.equal($('#boostBtn').hidden,true,'life stages hide the unsupported paid booster');
    assert.equal(f.shadows.interval(19),45);
    assert.equal(f.spawnShadow(),true);assert.equal(f.spawnShadow(),false,'only one visitor is possible in a run');
    const enemy=f.run.shadows[0],before=f.state.cur.life;
    const tap=new w.Event('pointerdown',{bubbles:true,cancelable:true});
    Object.assign(tap,{clientX:enemy.x,clientY:enemy.y,button:0,pointerType:'touch'});
    $('#c').dispatchEvent(tap);
    assert.equal(f.run.shadows.length,0,'tapping bursts the shadow');
    assert.ok(f.state.cur.life>before,'bursting earns life currency');
    assert.equal(f.spawnShadow(),false,'a popped early visitor does not immediately respawn');
  }finally{x.dom.window.close();}
});

test('returning to chapter one keeps evolved creatures and the last ending unlocked',()=>{
  const x=game({saved:{stage:9,maxStage:9,ended:true,lifeStarted:true,lifeEnded:true,intro:true,tut:true,sound:false,genes:{light:12,water:0,wind:0},geneType:'light'}});
  try{
    const {w,$}=x,f=w.fixture;
    $('#starChapters').click();assert.ok(cards(w).every(button=>!button.disabled));
    cards(w)[0].click();
    assert.equal(f.state.stage,4);assert.equal(f.state.maxStage,9);
    assert.equal(f.state.geneType,'light');assert.equal(f.state.lifeEnded,true);
    assert.notEqual($('#bossBtn').textContent,'생명의 별 다시 보기','the final ending belongs only to chapter six');
    f.save();const raw=JSON.parse(w.localStorage.getItem('ojjuda.saetbyeol.save.v1:guest'));
    const restored=game({saved:raw});
    try{
      assert.equal(restored.w.fixture.state.maxStage,9);
      assert.equal(restored.w.fixture.state.geneType,'light','revisiting the original game never erases evolution');
      restored.$('#starChapters').click();cards(restored.w)[5].click();
      assert.equal(restored.w.fixture.state.stage,9);
      assert.equal(restored.$('#bossBtn').textContent,'생명의 별 다시 보기');
    }finally{restored.dom.window.close();}
  }finally{x.dom.window.close();}
});

test('enemy frequency rises from 30 seconds at 20 growths to exactly two seconds at 200',()=>{
  const x=game({width:390,height:740});
  try{
    const f=x.w.fixture;
    assert.equal(f.shadows.interval(20),30);assert.equal(f.shadows.interval(200),2);
    for(let n=21;n<=200;n++)assert.ok(f.shadows.interval(n)<f.shadows.interval(n-1));
    f.loadProgress({stage:5,maxStage:5,ended:true,lifeStarted:true,lv:lifeLevels(f,5,200),intro:true,tut:true,sound:false});
    f.startRun(false);
    assert.equal(f.run.shadowSteps,200);
    assert.equal(f.run.shadowClock,2);
    for(let i=0;i<40;i++)f.updateRun(.05);
    assert.equal(f.run.shadowTotal,1,'first shadow appears at 2 seconds');
    for(let i=0;i<40;i++)f.updateRun(.05);
    assert.equal(f.run.shadowTotal,2,'next shadow appears 2 seconds later');
    assert.ok(f.run.shadows.length>0);
    f.drawRun();
    const enemy=f.run.shadows[0];enemy.fire=.01;
    f.pointer.has=true;f.pointer.x=enemy.x+110;f.pointer.y=enemy.y;
    f.updateShadows(.05,{x:f.pointer.x,y:f.pointer.y});
    assert.ok(f.run.shadowShots.length>0,'villains fire visible projectiles');
    const shot=f.run.shadowShots[0];shot.x=f.pointer.x;shot.y=f.pointer.y;shot.vx=shot.vy=0;
    const heat=f.run.heat;f.updateShadows(.01,{x:shot.x,y:shot.y});
    assert.ok(f.run.heat<heat,'an enemy projectile can attack the player');
    assert.equal(f.run.shadowShots.includes(shot),false,'one projectile deals damage once');
  }finally{x.dom.window.close();}
});
