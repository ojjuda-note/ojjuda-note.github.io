/* Midgame rendering/picking, not just the generator's logical solution. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {bundleScrew3d}=require('./screw3d-vm-bundle.cjs');
const source=bundleScrew3d(file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
const testMath=Object.create(Math);
const context=vm.createContext({assert,Math:testMath,console,window:{},
  localStorage:{getItem(){return null;},setItem(){}}});
// Rendering still executes the real projection, depth clipping, draw list and
// pointer handlers. Only Canvas raster operations are omitted in this audit.
const noop=()=>{},gradient={addColorStop:noop};
const canvas=new Proxy({canvas:{width:360,height:540},
  createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,
  measureText:s=>({width:String(s).length*7})},{get:(o,k)=>k in o?o[k]:noop});
context.canvas=canvas;
vm.runInContext(source+`
  const pointIn=(x,y,pts)=>{
    let inside=false;
    for(let i=0,j=pts.length-1;i<pts.length;j=i++){
      const a=pts[i],b=pts[j];
      if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
    }
    return inside;
  };
  globalThis.checkMidgame=(stage,seed)=>{
    let randomSeed=seed>>>0;
    Math.random=()=>((randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0)/4294967296);
    const game=screw3d({setScore(){},end(){},getCoins:()=>0},stage),st=window.__ojjScrew3d;
    st.touched=true;st.msgT=0;
    const m=st.lvl,total=m.screws.length;
    let views=0,taps=0,features=0;
    for(const s of m.screws)if(s.thru.faceFeature){
      features++;
      assert.equal(rayHit(s.p,s.a,DRAW_HEAD_H,[s.thru],[]),null,
        'feature head must not be buried in its own ear/tail at stage '+stage);
      assert.ok(rayHit(add(s.p,mul(s.a,-.003)),s.a,0,[s.thru],[]),
        'feature fastener must touch its real part, not float in air at stage '+stage);
    }
    // Settled removals are monotone: an already clear path cannot acquire a
    // new blocker. Recheck a cached blocked path when its first blocker leaves,
    // rather than doing O(screws^2) repeated full collision queries per stage.
    const blockedBy=new Map(m.screws.map(s=>[s,blocked(s,m)]));
    const remove=s=>{
      s.state='done';st.fly=[];st.lastPaintStamp=null;
      const removed=new Set([s]);
      for(const e of [s.thru,s.into])if(!held(e,m.screws)){
        e.state='gone';e.dyn=null;e.hinge=null;removed.add(e);
      }
      blockedBy.delete(s);
      for(const [next,blocker] of blockedBy)if(removed.has(blocker))blockedBy.set(next,blocked(next,m));
    };
    const clickable=free=>{
      const angles=[[st.yaw,st.pitch]];
      // A player can rotate to the extraction side of each candidate.
      for(const s of free){const a=visibleScrewPose(s).a;
        angles.push([Math.atan2(-a[0],a[2]),Math.max(-1.35,Math.min(1.35,Math.asin(a[1])))]);}
      for(const pitch of [.6,-.6,1.35,-1.35,0])
        for(let k=0;k<8;k++)angles.push([k*Math.PI/4,pitch]);
      const seen=new Set();
      for(const [yaw,pitch] of angles){
        const key=yaw.toFixed(3)+','+pitch.toFixed(3);if(seen.has(key))continue;seen.add(key);
        st.yaw=yaw;st.pitch=pitch;st.lastPaintStamp=null;game.draw(canvas);views++;
        const top=(x,y)=>{for(let i=st.drawn.length-1;i>=0;i--)
          if(pointIn(x,y,st.drawn[i].pts))return st.drawn[i].owner;return null;};
        for(const s of free){
          const points=[],head=st.heads.get(s);if(head)points.push(head);
          for(const pg of st.drawn)if(pg.owner===s&&Math.abs(polyArea(pg.pts))>.02)
            points.push({x:pg.pts.reduce((v,p)=>v+p.x,0)/pg.pts.length,
              y:pg.pts.reduce((v,p)=>v+p.y,0)/pg.pts.length});
          for(const p of points){
            if(p.x<5||p.x>315||p.y<230||p.y>520||top(p.x,p.y)!==s)continue;
            // Color queues are tested separately; isolate actual visibility
            // and touch extraction here without paid slots or x-ray.
            st.boxes=[{c:s.color,n:0,res:0,close:0},null];st.buf=Array(5).fill(null);
            game.onDown(p.x,p.y,1);game.onUp(p.x,p.y,1);
            if(s.state==='out'){taps++;return s;}
          }
        }
      }
      return null;
    };
    const checkpoints=new Set([Math.floor(total*.5),Math.floor(total*.2),21,9,3,2,1]);
    for(let left=total;left;left--){
      const free=[...blockedBy].filter(([,blocker])=>!blocker).map(([s])=>s);
      assert.ok(free.length,'random legal route has a physical move at stage '+stage+' left '+left);
      let next;
      if(checkpoints.has(left)){
        next=clickable(free);
        assert.ok(next,'no actually visible/clickable legal screw at stage '+stage+' left '+left+' seed '+seed);
      }else next=free[Math.floor(Math.random()*free.length)];
      remove(next);
    }
    assert.ok(m.els.every(e=>e.state==='gone'),'all pieces detach after the last actual touch');
    game.destroy();return {stage,total,features,views,taps};
  };
`,context);

const start=Number(process.env.SCREW_VIS_START||0),end=Number(process.env.SCREW_VIS_END||1000);
const levels=start?Array.from({length:end-start+1},(_,i)=>start+i):
  [1,2,3,5,17,18,19,20,25,31,38,39,40,80,160,300,500,700,800,998,999,1000];
const totals={levels:0,screws:0,features:0,views:0,taps:0},begin=Date.now();
for(const stage of levels){
  const r=context.checkMidgame(stage,Math.imul(stage,9973)+37);
  totals.levels++;totals.screws+=r.total;totals.features+=r.features;
  totals.views+=r.views;totals.taps+=r.taps;
  if(start&&stage%50===0)console.log('VISIBILITY_PROGRESS',stage,Math.round((Date.now()-begin)/1000));
}
if(!start)for(const seed of [2,5,9]){
  const r=context.checkMidgame(20,seed);totals.levels++;totals.screws+=r.total;
  totals.features+=r.features;totals.views+=r.views;totals.taps+=r.taps;
}
console.log('PASS: randomized midgame depth clipping and real pointer extraction',JSON.stringify({...totals,ms:Date.now()-begin}));
