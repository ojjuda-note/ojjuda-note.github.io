const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
const html=fs.readFileSync(path.join(__dirname,'../games/photo-ttang.html'),'utf8');
const engine=html.slice(html.indexOf('/*ENGINE*/')+'/*ENGINE*/'.length,html.indexOf('// ================= 사진 땅따먹기'));
const mobCode=html.slice(html.indexOf('function blocked('),html.indexOf('let respawnQ=[];'));
const mobTypes=html.match(/const MOB=\{[^\n]+/)[0];
const {World,hitMob}=vm.runInNewContext(engine+`
${mobTypes}
let world,me,mobs,respawnQ=[],over=false,floats=[];
const MOB_RESPAWN=30,burst=()=>{},sfx={capture(){}};
${mobCode}
function hitMob(w,p,m,dt=0){world=w;me=p;mobs=[m];respawnQ=[];updateMobs(dt);return p.alive;}
({World,hitMob});`);

function fixture({diagonal=false,bot=false,scale=20}={}){
  const world=new World(32,'solo',40);world.itemsOn=false;world.setViewScale(scale);
  const attacker=world.addPlayer({noSpawn:true,alive:true,x:25,y:25,bot,born:-1});
  const target=world.addPlayer({noSpawn:true,alive:true,x:6,y:diagonal?6:10,born:-1});
  for(let i=1;i<=160;i++){
    const px=target.x,py=target.y;target.x=6+i*.05;target.y=diagonal?target.x:10;world.visit(target,px,py);
  }
  world.time=1;world.events.length=0;return {world,attacker,target};
}
function touch(f,x,y,px=x,py=y){f.attacker.x=x;f.attacker.y=y;f.world.visit(f.attacker,px,py);}
function mob(x,y,extra={}){return Object.assign({type:'bounce',x,y,r:.75,v:4.2,vx:0,vy:0,ph:0,alive:true,born:-1},extra);}

test('the visible body edge cuts a trail for both the player and computers',()=>{
  for(const bot of [false,true]){
    const f=fixture({bot});touch(f,10,11);
    assert.equal(f.target.alive,false);assert.equal(f.attacker.kills,1);
    assert.equal(f.world.events.find(e=>e.t==='death').why,'cut');
    assert.equal(f.target.trail.length,0);
  }
});
test('exact body-plus-line boundary hits while a visible gap does not',()=>{
  for(const scale of [20,5]){
    const hit=fixture({scale}),r=hit.world.bodyRadius(hit.attacker)+hit.world.trailRadius;
    touch(hit,10,10+r);assert.equal(hit.target.alive,false);
    const miss=fixture({scale});touch(miss,10,10+r+.01);assert.equal(miss.target.alive,true);
  }
});
test('diagonal lines and round endpoints use their drawn reach',()=>{
  const hit=fixture({diagonal:true}),r=hit.world.bodyRadius(hit.attacker)+hit.world.trailRadius;
  touch(hit,10,10+r*Math.SQRT2);assert.equal(hit.target.alive,false);
  const miss=fixture({diagonal:true});touch(miss,10,10+(r+.01)*Math.SQRT2);assert.equal(miss.target.alive,true);
  const end=fixture();touch(end,6-r,10);assert.equal(end.target.alive,false);
  const gap=fixture();touch(gap,6-r-.01,10);assert.equal(gap.target.alive,true);
});
test('movement between samples and boosted movement still cut at the edge',()=>{
  const jump=fixture();touch(jump,10,13,10,7);assert.equal(jump.target.alive,false);
  const boost=fixture();Object.assign(boost.attacker,{x:10,y:11.3,ang:-Math.PI/2,target:-Math.PI/2,boostT:5});
  boost.world.step(.02);assert.equal(boost.target.alive,false);
});
test('shield and owned-territory capture rules still protect the player',()=>{
  const shield=fixture();shield.target.shieldT=3;touch(shield,10,11);assert.equal(shield.target.alive,true);
  shield.target.shieldT=0;touch(shield,10,11);assert.equal(shield.target.alive,false);
  const own=fixture();Object.assign(own.target,{x:10,y:11});own.world.setOwn(own.world.si(10,11),own.target.id);
  own.world.visit(own.target,10,11.1);assert.equal(own.target.alive,true);assert.equal(own.target.trail.length,0);
  assert.ok(own.world.events.some(e=>e.t==='capture'));
});
test('old self trails collide at the body edge while the connected neck stays safe',()=>{
  for(const [time,shield,alive] of [[1,0,false],[.1,0,true],[1,3,true]]){
    const f=fixture();f.world.time=time;Object.assign(f.target,{x:10,y:11,shieldT:shield});f.world.visit(f.target,10,11);
    assert.equal(f.target.alive,alive);
  }
});
test('body-to-body contact preserves territory defense and does not require center overlap',()=>{
  for(const scale of [20,5])for(const owner of [0,1,2]){
    const w=new World(32,'solo',40);w.setViewScale(scale);w.time=1;
    const a=w.addPlayer({noSpawn:true,alive:true,x:10,y:10,born:-1});
    const distance=2*w.bodyRadius(a),b=w.addPlayer({noSpawn:true,alive:true,x:10+distance,y:10,born:-1});
    if(owner)for(const x of [10,10+distance/2,10+distance])w.setOwn(w.si(x,10),owner);
    w.visit(a,10,10);assert.equal(a.alive,owner===1);assert.equal(b.alive,owner===2);
    const gap=new World(32,'solo',40);gap.setViewScale(scale);gap.time=1;
    const p=gap.addPlayer({noSpawn:true,alive:true,x:10,y:10,born:-1});
    const q=gap.addPlayer({noSpawn:true,alive:true,x:10+distance+.01,y:10,born:-1});gap.visit(p,10,10);
    assert.equal(p.alive,true);assert.equal(q.alive,true);
  }
});
test('outer walking room reaches the last rectangular map cell at every screen scale',()=>{
  for(const scale of [20,5]){
    const w=new World(32,'solo',40);w.setViewScale(scale);w.time=1;w.itemsOn=false;
    const p=w.addPlayer({noSpawn:true,alive:true,x:.01,y:39.99,born:-1});w.step(0);
    assert.ok(Math.abs(p.x-.5/w.G)<1e-8);assert.ok(Math.abs(p.y-(40-.5/w.G))<1e-8);assert.equal(p.wall,true);
  }
});
test('normal and slow straight movement do not hit the newly connected trail',()=>{
  for(const scale of [20,5,2])for(const speed of [4.2,5.6]){
    const w=new World(64,'solo',40);w.itemsOn=false;w.setViewScale(scale);w.time=1;
    const p=w.addPlayer({noSpawn:true,alive:true,x:5,y:10,ang:0,target:0,speed,born:-1});
    for(let i=0;i<240;i++)w.step(1/60);assert.equal(p.alive,true,`scale ${scale}, speed ${speed}`);
  }
});
test('mob contact uses the same visible player body at all screen scales',()=>{
  for(const scale of [20,5])for(const gap of [0,.01]){
    const w=new World(32,'solo',40);w.time=1;w.setViewScale(scale);
    const p=w.addPlayer({noSpawn:true,alive:true,x:10,y:10,born:-1});
    const m=mob(10,10),r=w.bodyRadius(p)+w.mobRadius(m);m.x+=r+gap;
    assert.equal(hitMob(w,p,m),gap>0);
  }
});
test('mob line contact uses distance rather than eight perimeter sample points',()=>{
  for(const scale of [20,5])for(const gap of [0,.01]){
    const f=fixture({scale}),m=mob(10,10);m.y+=f.world.mobRadius(m)+f.world.trailRadius+gap;
    assert.equal(hitMob(f.world,f.target,m),gap>0);
  }
});
test('mobs respect shield and owned-territory safety',()=>{
  for(const protection of ['shield','land']){
    const w=new World(32,'solo',40);w.time=1;
    const p=w.addPlayer({noSpawn:true,alive:true,x:10,y:10,born:-1});
    if(protection==='shield')p.shieldT=3;else w.setOwn(w.si(10,10),p.id);
    assert.equal(hitMob(w,p,mob(11.59,10)),true);
  }
});
test('birth animation uses the same growing radius for drawing and collision',()=>{
  const w=new World(32,'solo',40),p=w.addPlayer({noSpawn:true,alive:true,born:0});
  w.time=0;assert.equal(w.bodyRadius(p),.85*.3);w.time=.35;assert.equal(w.bodyRadius(p),.85);
  const m=mob(10,10,{born:0});w.time=0;assert.equal(w.mobRadius(m),.75*.05);w.time=.4;assert.equal(w.mobRadius(m),.75);
});
