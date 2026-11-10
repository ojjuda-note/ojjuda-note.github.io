const test=require('node:test');
const assert=require('node:assert/strict');
const {game}=require('./saetbyeol-fixture.cjs');

const legacyComplete=levels=>Object.fromEntries(levels.filter(u=>u.r<5).map(u=>[u.id,u.mx]));

test('one original game continues with 1,000 new nodes, 3,000 life upgrades and 50 new targets',t=>{
  const x=game(),f=x.w.fixture;t.after(()=>x.dom.window.close());
  assert.equal(f.upgrades.length,1200);
  assert.equal(f.upgrades.filter(u=>u.r>=5).length,1000);
  assert.equal(f.upgrades.filter(u=>u.r>=5).reduce((n,u)=>n+u.mx,0),3000);
  assert.equal(f.encounters.catalog.length,100);
  assert.equal(new Set(f.encounters.catalog.map(u=>u.id)).size,100);
  for(let stage=5;stage<10;stage++){
    assert.equal(f.upgrades.filter(u=>u.r===stage).length,200);
    assert.equal(f.encounters.catalog.filter(u=>u.stage===stage).length,10);
    for(let branch=0;branch<5;branch++)assert.equal(f.upgrades.filter(u=>u.r===stage&&u.b===branch).length,40);
  }
});

test('old completed save keeps every upgrade and enters life through the same start button',t=>{
  const x=game({saved:{stage:4,lv:{h0a:5,p4a:3},mem:[3,3,3,3,3],ended:true,intro:true,sound:false}});
  t.after(()=>x.dom.window.close());
  const f=x.w.fixture;
  assert.equal(x.$('#starStart').textContent,'차원문 열기');
  x.$('#starStart').click();
  assert.equal(f.state.stage,5);
  assert.equal(f.state.lv.h0a,5);
  assert.equal(f.state.lv.p4a,3);
  assert.equal(f.state.cur.life,0);
  assert.equal(f.state.ended,true);
  assert.equal(x.$('#treeCount').textContent.includes('/ 1200'),true);
  assert.equal(x.$('#overlay').classList.contains('on'),true);
  const saved=JSON.parse(x.w.localStorage.getItem('ojjuda.saetbyeol.save.v1:guest'));
  assert.equal(saved.stage,5);
  assert.equal(saved.lv.h0a,5);
});

test('new targets reward life currency without changing original ranking score',t=>{
  const x=game({saved:{stage:5,lv:{h0a:5},cur:{life:0},intro:true,tut:true,ended:true,sound:false}});
  t.after(()=>x.dom.window.close());
  const f=x.w.fixture;
  x.$('#starStart').click();
  f.spawn('portal_dust',true);
  f.kill(f.run.nodes.at(-1));
  assert.ok(f.state.cur.life>0);
  assert.ok(f.run.gain.life>0);
  assert.match(x.$('#cur').textContent,/생명력/);
  f.save();x.tick(600);
  const score=x.messages.find(m=>m.data.type==='ojjuda-game-result')?.data.score;
  assert.equal(score,50050,'extension growth must not inflate the legacy leaderboard');
});

test('fifty calming journal chapters unlock gradually and remain readable',t=>{
  const x=game(),f=x.w.fixture;t.after(()=>x.dom.window.close());
  assert.equal(f.life.journal.length,5);
  assert.ok(f.life.journal.every(chapter=>chapter.length===10));
  assert.ok(f.life.journal.flat().every(([title,body])=>title.length>=3&&body.length>=70));
  const older=legacyComplete(f.upgrades);
  const saved={stage:5,lv:older,ended:true,intro:true,tut:true,sound:false};
  f.loadProgress(saved);f.setMode('hub');
  assert.match(x.$('#lifeJournal').textContent,/1\/10/);
  assert.match(x.$('#lifeQuote').textContent,/문 너머의 숨/);
  const growing=f.upgrades.filter(u=>u.r===5).slice(0,20);
  f.loadProgress({...saved,lv:{...older,...Object.fromEntries(growing.map(u=>[u.id,3]))}});
  assert.match(x.$('#lifeJournal').textContent,/2\/10/);
  assert.equal(x.$('#lifeProgress').getAttribute('aria-valuenow'),'10');
  x.$('#lifeJournal').click();
  assert.equal(x.$('#overlay').classList.contains('journal'),true);
  assert.match(x.$('#ovText').textContent,/유리처럼 맑은 집/);
  const previous=[...x.$('#ovBtns').querySelectorAll('button')].find(b=>b.textContent==='이전 이야기');
  previous.click();assert.match(x.$('#ovText').textContent,/문 너머의 숨/);
  x.$('#ovBtns button:last-child').click();
  assert.equal(x.$('#overlay').classList.contains('journal'),false);
});

test('richer life stages render more magical layers without animation requirement',t=>{
  const x=game(),f=x.w.fixture;t.after(()=>x.dom.window.close());
  function counts(stage,progress){
    const calls={ellipses:0,lights:0,petals:0};
    const ctx={save(){},restore(){},beginPath(){},ellipse(){calls.ellipses++},arc(){calls.lights++},moveTo(){},lineTo(){},quadraticCurveTo(){calls.petals++},stroke(){},fill(){}};
    f.life.drawMagic(ctx,100,100,30,stage,progress,0,true);
    return calls;
  }
  const start=counts(5,0),grown=counts(5,.98),next=counts(6,0),end=counts(9,1);
  assert.ok(grown.lights>start.lights);
  assert.ok(next.lights>=grown.lights,'visual effects should not become weaker when evolving');
  assert.ok(end.lights>grown.lights);
  assert.ok(end.ellipses>start.ellipses);
  assert.ok(end.petals>0);
  assert.equal(new Set(Object.values(f.life.kinds).map(k=>k.epilogue)).size,4);
});

test('players intentionally choose sunlight, water, wind or balanced species',t=>{
  for(const [counts,kind] of [
    [[12,0,0],'light'],[[0,12,0],'water'],[[0,0,12],'wind'],[[4,4,4],'balance']
  ]){
    const x=game({saved:{stage:5,cur:{life:1e6},intro:true,tut:true,ended:true,sound:false}});
    try{
      const f=x.w.fixture;f.setMode('hub');
      for(let i=0;i<counts.length;i++)for(let n=0;n<counts[i];n++)x.$(`#geneActions [data-gene="${['light','water','wind'][i]}"]`).click();
      assert.equal(f.state.geneType,kind);
      assert.equal(x.$('#geneActions').hidden,true);
      assert.match(x.$('#lifeStatus').textContent,new RegExp(f.life.kinds[kind].name));
      f.save();
      const saved=JSON.parse(x.w.localStorage.getItem('ojjuda.saetbyeol.save.v1:guest'));
      assert.equal(saved.geneType,kind);
    }finally{x.dom.window.close();}
  }
});

test('new life bosses have finite health and only the tenth stage completes the new ending',t=>{
  for(let stage=5;stage<10;stage++){
    const x=game(),f=x.w.fixture;
    try{
      const levels=Object.fromEntries(f.upgrades.filter(u=>u.r<=stage).map(u=>[u.id,u.mx]));
      f.loadProgress({stage,lv:levels,mem:Array(10).fill(3),intro:true,tut:true,ended:true,sound:false,
        genes:{light:12,water:0,wind:0},geneType:'light'});
      f.startRun(true);
      assert.ok(Number.isFinite(f.run.boss.hp)&&f.run.boss.hp>0,`boss ${stage}`);
      f.hurtBoss(1e30);x.tick(900);
      assert.equal(f.state.stage,stage===9?9:stage+1);
      assert.equal(f.state.lifeEnded,stage===9);
    }finally{x.dom.window.close();}
  }
});
