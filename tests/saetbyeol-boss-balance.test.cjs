const assert=require('node:assert/strict');
const {game}=require('./saetbyeol-fixture.cjs');
const completed=(f,stage)=>Object.fromEntries(f.upgrades.filter(u=>u.r<=stage).map(u=>[u.id,u.mx]));

const progression=game({saved:{intro:true,tut:true,sound:false}});
try{
  const {w,$}=progression,f=w.fixture;
  $('#starStart').click();
  f.state.sel='h0a';f.state.cur.light=9;f.refresh();
  assert.equal($('#buy').disabled,true,'the old cheaper budget no longer buys heat');
  f.state.cur.light=10;f.refresh();$('#buy').click();
  assert.equal(f.state.lv.h0a,1);assert.equal(f.state.cur.light,0);
  assert.equal(f.cost(f.upgrades.find(u=>u.id==='h0a')),17,'later levels still rise in price');
  assert.equal(f.cost(f.upgrades.find(u=>u.id==='p0a')),8);
  assert.equal(f.cost(f.upgrades.find(u=>u.id==='branch_0_0_0')),8);
  assert.equal(f.cost(f.upgrades.find(u=>u.id==='p1b')),20);
  assert.equal(f.cost(f.upgrades.find(u=>u.id==='h4a')),16);
  f.startRun(false);assert.equal(f.mode,'run','regular resource gathering stays available');
  const run=f.run;f.startRun(true);assert.equal(f.run,run,'a locked boss cannot replace a running game');
  f.setMode('hub');
  for(let stage=0;stage<5;stage++){
    const levels=completed(f,stage),last=f.upgrades.filter(u=>u.r===stage).at(-1);
    levels[last.id]--;
    f.loadProgress({stage,lv:levels,cur:{light:1e12,metal:1e12,mass:1e12},intro:true,tut:true,sound:false});
    assert.equal($('#bossBtn').disabled,true,`stage ${stage} needs its last upgrade`);
    assert.match($('#memLine').textContent,/보스 도전까지 강화 1회/);
    $('#bossBtn').disabled=false;$('#bossBtn').click();
    assert.equal(f.mode,'hub','forcing the button cannot bypass the growth limit');
    f.state.sel=last.id;f.refresh();assert.equal($('#buy').disabled,false);
    $('#buy').click();assert.equal($('#bossBtn').disabled,false,'last purchase immediately opens the boss');
    $('#bossBtn').click();assert.equal(f.run.boss.k,stage);assert.equal(f.mode,'run');
    f.setMode('hub');
  }
  const legacy=completed(f,1);legacy.h0a--;
  f.loadProgress({stage:1,lv:legacy,intro:true,tut:true,sound:false});
  assert.equal($('#bossBtn').disabled,true,'older unbalanced saves finish earlier growth before the next boss');
}finally{progression.dom.window.close();}

// Reproduce normal aiming at the boss, including a finger covering the target
// and a player who spends one second in five off target. No recovery pickups
// are provided and every shot is non-critical, so a win cannot depend on luck.
const results=[];
for(const width of [390,1024])for(const aim of ['center','touch','imperfect']){
  const g=game({width,height:780,saved:{intro:true,tut:true,sound:false}}),f=g.w.fixture;
  try{
    g.w.Math.random=()=>.99;
    f.loadProgress({stage:0,lv:completed(f,0),intro:true,tut:true,sound:false});f.startRun(true);
    let steps=0;
    while(f.mode==='run'&&steps++<1000){
      f.pointer.has=true;f.pointer.touch=aim==='touch';
      f.pointer.x=f.run.boss.x;f.pointer.y=f.run.boss.y;
      if(aim==='imperfect'&&f.run.time%5<1){f.pointer.x=-1000;f.pointer.y=-1000;}
      f.updateRun(.05);
    }
    assert.equal(f.run.boss.hp,0,`${width}px ${aim}: a fully grown ember must beat White Tail`);
    assert.ok(f.run.heat/f.liveStats.decay>1,'the player retains a recovery margin');
    assert.equal(f.run.bonusSeconds,0);
    results.push({width,aim,seconds:+f.run.time.toFixed(2),remaining:+(f.run.heat/f.liveStats.decay).toFixed(2)});
    g.tick(900);assert.equal(f.state.stage,1,'winning actually evolves to a protostar');
  }finally{g.dom.window.close();}
}

const volley=game({width:390,height:780,saved:{intro:true,tut:true,sound:false}}),v=volley.w.fixture;
try{
  v.loadProgress({stage:0,lv:completed(v,0),intro:true,tut:true,sound:false});v.startRun(true);
  v.pointer.has=true;v.pointer.x=100;v.pointer.y=700;
  const overlap=()=>({x:100,y:700,vx:0,vy:0,life:5});
  v.run.shards=Array.from({length:6},overlap);
  let before=v.run.heat;v.updateRun(.05);
  assert.ok(Math.abs((before-v.run.heat)/v.liveStats.decay-.65)<1e-8,'six simultaneous hits deduct only 0.6 seconds plus elapsed time');
  v.run.shards=[overlap()];before=v.run.heat;v.updateRun(.05);
  assert.ok(Math.abs((before-v.run.heat)/v.liveStats.decay-.05)<1e-8,'the short hit cooldown prevents a repeated hit');
  for(let i=0;i<16;i++)v.updateRun(.05);
  v.run.shards=[overlap()];before=v.run.heat;v.updateRun(.05);
  assert.ok(Math.abs((before-v.run.heat)/v.liveStats.decay-.65)<1e-8,'hazards still damage after the cooldown');
}finally{volley.dom.window.close();}
console.log('PASS: higher purchase costs, all five growth limits, forced-button protection, White Tail mobile/desktop combat, evolution and overlapping projectile damage',results);
