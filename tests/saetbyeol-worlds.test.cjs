const test=require('node:test');
const assert=require('node:assert/strict');
const {game}=require('./saetbyeol-fixture.cjs');

const stageIds=['portal_dust','water_pebble','moss_rock','cloud_rock','life_rock'];
const thresholds=[7,8,9,10,12];

function canvasRecorder(){
  const calls=[];
  const context=new Proxy({}, {
    get(_target,key){
      if(key==='createLinearGradient'||key==='createRadialGradient')return (...args)=>{
        calls.push([key,...args]);return {addColorStop(offset,color){calls.push(['stop',offset,color]);}};
      };
      return (...args)=>{calls.push([key,...args]);};
    },
    set(){return true;}
  });
  return {context,calls};
}

test('every life chapter has ten exclusive foods with new artwork and descriptions',t=>{
  const x=game();t.after(()=>x.dom.window.close());
  const f=x.w.fixture, names=new Set();
  for(let stage=5;stage<10;stage++){
    const foods=f.encounters.catalog.filter(item=>item.stage===stage);
    assert.equal(foods.length,10);
    assert.ok(foods.every(item=>item.form&&item.motion&&item.detail&&item.detail.length>=8));
    assert.ok(foods.every(item=>!/(운석|혜성|성운|별$|금속|프리즘)/.test(item.name)),`stage ${stage}: no recycled celestial food`);
    for(const item of foods){assert.equal(names.has(item.name),false);names.add(item.name);}
    const source=new Set(foods.map(item=>item.id));
    for(let i=0;i<150;i++){
      const target=f.encounters.pick(stage,1,false,()=>i/150);
      assert.ok(source.has(target),`stage ${stage} must not show previous chapter's foods: ${target}`);
    }
  }
  assert.equal(names.size,50);
});

test('new growth names follow each living world and no life upgrades are dead purchases',t=>{
  const x=game();t.after(()=>x.dom.window.close());
  const upgrades=x.w.fixture.upgrades.filter(item=>item.r>=5);
  assert.equal(new Set(upgrades.map(item=>item.n)).size,1000);
  assert.match(upgrades.find(item=>item.id==='life_1_0_0').n,/푸른 첫숨/);
  assert.match(upgrades.find(item=>item.id==='life_4_0_39').n,/끝없는 내일/);
  const nutrition=upgrades.find(item=>item.id==='life_2_3_1'),water=upgrades.find(item=>item.id==='life_2_3_2');
  const stats={life:1,iceHeat:.35};
  nutrition.f(stats,3);water.f(stats,3);
  assert.ok(stats.life>1,'light-feeding growth must increase life currency, not retired light currency');
  assert.ok(stats.iceHeat>.35,'water-feeding growth must actually improve healing');
});

test('five worlds, moving atmospheres, and every food silhouette draw independently',t=>{
  const x=game();t.after(()=>x.dom.window.close());
  const f=x.w.fixture,signatures=new Set();
  for(let stage=5;stage<10;stage++){
    const {context,calls}=canvasRecorder();let seed=37;
    f.life.drawWorld(context,800,600,stage,()=>{seed=(seed*16807)%2147483647;return seed/2147483647;});
    const signature=['fillRect','ellipse','bezierCurveTo','quadraticCurveTo','lineTo','arc'].map(action=>calls.filter(call=>call[0]===action).length).join(':');
    signatures.add(signature);
    assert.ok(calls.some(([name])=>name==='fillRect'),`background stage ${stage}`);
    f.life.drawAtmosphere(context,Array.from({length:40},(_,i)=>({x:i*17,y:i*9,s:1+i%3,p:i/3})),800,600,stage,3,0,0,false,.5);
    for(const type of f.encounters.catalog.filter(item=>item.stage===stage)){
      const before=calls.length;
      assert.equal(f.life.drawFood(context,{x:30,y:40,r:type.r,born:1,seed:1,rot:.2,hit:0,hp:type.hp,max:type.hp},type,3,false,.6,stage),true);
      assert.ok(calls.length>before,`food ${type.id} draws its silhouette`);
    }
    assert.ok(calls.every(call=>call.slice(1).every(arg=>typeof arg!=='number'||Number.isFinite(arg))),`stage ${stage} drawing has finite coordinates`);
  }
  assert.equal(signatures.size,5,'biomes must have five distinct background drawing signatures');
  const {context}=canvasRecorder();
  assert.equal(f.life.drawFood(context,{x:2,y:2,r:12,born:1},f.types.rock,0,false,0,0),false,'original chapter uses its original art');
});

test('each world unlocks a distinct reward when its local food meter fills',t=>{
  for(let index=0;index<5;index++){
    const stage=5+index;
    const x=game({saved:{stage,cur:{life:1000},intro:true,tut:true,ended:true,sound:false}});
    try{
      const f=x.w.fixture;
      f.startRun(false);
      f.run.nodes=[];
      if(stage===9)f.run.heat-=f.liveStats.decay*2;
      const previousHeat=f.run.heat;
      for(let i=0;i<thresholds[index];i++){
        f.spawn(stageIds[index],true);
        f.kill(f.run.nodes.at(-1));
      }
      assert.equal(f.run.fed,thresholds[index]);
      assert.equal(x.$('#biomeMeter').hidden,false);
      assert.equal(x.$('#biomeMeter').getAttribute('aria-valuenow'),'0');
      assert.ok(f.run.gain.life>0);
      if(stage===5)assert.ok(f.run.gain.life>thresholds[index]*2);
      if(stage===6||stage===8)assert.ok(f.run.biomePower>=4.5);
      if(stage===9){assert.ok(f.run.biomeBonus>0);assert.ok(f.run.heat>previousHeat);}
      f.setMode('hub');assert.equal(x.$('#biomeMeter').hidden,true);
    }finally{x.dom.window.close();}
  }
});

test('original chapter stays unchanged in layout and never shows life-specific controls',t=>{
  const x=game({saved:{stage:3,intro:true,tut:true,ended:true,sound:false}});
  t.after(()=>x.dom.window.close());
  const f=x.w.fixture;
  f.setMode('hub');
  assert.equal(x.w.document.body.dataset.world,'star');
  assert.equal(x.$('#lifeLab').hidden,true);
  f.startRun(false);
  assert.equal(x.$('#biomeMeter').hidden,true);
  assert.equal(f.run.fed,0);
});
