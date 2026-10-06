const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
for(const game of ['ttang','photo-ttang']){
 const html=fs.readFileSync(path.join(__dirname,'../games',game+'.html'),'utf8');
 const end=game==='ttang'?'/*ENDENGINE*/':'// ================= 사진 땅따먹기';
 const engine=html.slice(html.indexOf('/*ENGINE*/')+'/*ENGINE*/'.length,html.indexOf(end));
 const {World}=vm.runInNewContext(engine+'\n({World})');
 for(const [right,bottom] of [[false,false],[true,false],[false,true],[true,true]])test(`${game}: a real movement loop claims ${right?'right':'left'} ${bottom?'bottom':'top'} corner and both outermost rows`,()=>{
  const w=new World(20,'solo',24),height=game==='ttang'?20:24;w.itemsOn=false;w.time=10;
  const xy=(x,y)=>[right?20-x:x,bottom?height-y:y];
  const [x,y]=xy(3,3),p=w.addPlayer({noSpawn:true,alive:true,x,y,born:-1,bot:false,speed:6.4,turn:20});
  for(let gy=20;gy<40;gy++)for(let gx=20;gx<40;gx++){const [a,b]=xy((gx+.5)/w.G,(gy+.5)/w.G);w.setOwn(w.si(a,b),p.id);}
  const edge=.5/w.G;
  for(const target of [[edge,3],[edge,edge],[3,edge],[3,3]]){
   const [tx,ty]=xy(...target);
   let steps=0;
   while(Math.hypot(tx-p.x,ty-p.y)>1e-7&&steps++<1000){
    p.ang=p.target=Math.atan2(ty-p.y,tx-p.x);w.step(Math.min(.01,Math.hypot(tx-p.x,ty-p.y)/p.speed));
    assert.equal(p.alive,true,'normal movement around the edge stays alive');
   }
   assert.ok(steps<1000,'the character can reach the last grid cell without getting stuck against the old body inset');
  }
  for(let n=0;n<20;n++){
   const [a,b]=xy(edge,(n+.5)/w.G),[c,d]=xy((n+.5)/w.G,edge);
   assert.equal(w.own[w.si(a,b)],p.id,'every last-column cell in the closed corner is owned');
   assert.equal(w.own[w.si(c,d)],p.id,'every last-row cell in the closed corner is owned');
  }
  const [cx,cy]=xy(edge,edge);assert.equal(w.own[w.si(cx,cy)],p.id,'the extreme corner cell is captured');
 });
}
test('multiplayer guest prediction keeps the host position in all four last cells',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../games/ttang.html'),'utf8');
 const engine=html.split('/*ENGINE*/')[1].split('/*ENDENGINE*/')[0];
 const predictor=html.slice(html.indexOf('function guestPredict('),html.indexOf('function lobby('));
 const positions=vm.runInNewContext(engine+`
  const world=new World(20,'duo');world.netTime=0;world.netAt=0;
  const edge=.5/world.G;
  for(const [x,y] of [[edge,edge],[20-edge,edge],[edge,20-edge],[20-edge,20-edge]])world.addPlayer({noSpawn:true,alive:true,x,y,tx:x,ty:y,ang:0,tang:0,speed:0});
  ${predictor}
  guestPredict(0);JSON.stringify(world.players.map(p=>[p.x,p.y]));`,{performance:{now:()=>0}});
 assert.deepEqual(JSON.parse(positions),[[.05,.05],[19.95,.05],[.05,19.95],[19.95,19.95]],'guest does not push a captured corner position back inside the old body inset');
});
