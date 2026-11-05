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
    let views=0,taps=0,features=0,mounts=0,pieces=0,zoomTaps=0,triangles=0;
    const seams=new Map();
    const normalPan=st.pan.slice();
    for(const e of m.els)if(e.skinGeom){
      pieces++;assert.ok(e.skinGeom.closed&&e.skinGeom===e.skinFastGeom,
        'every quality tier retains the same closed solid piece');
      assert.ok(e.skinGeom.faces.length>0,'a retained physical piece has a real solid mesh: stage '+stage+' piece '+m.els.indexOf(e)+' center '+e.c);
      const edges=new Map();let volume=0;
      triangles+=e.skinGeom.faces.length;
      const siblings=m.els.filter(o=>o!==e&&o.skinGeom&&(o.skinRole||'subject')===(e.skinRole||'subject'));
      for(const v of e.skinGeom.verts){const p=add(v,e.c),d=dot(v,v);
        assert.ok(siblings.every(o=>{const q=sub(p,o.c);return dot(q,q)>=d-2e-5;}),
          'a convex solid never crosses its neighbouring cell boundary');}
      for(const f of e.skinGeom.faces){
        const [a,b,c]=f.idx.map(i=>e.skinGeom.verts[i]);
        const normal=cross(sub(b,a),sub(c,a));
        assert.ok(dot(normal,f.n)>0,'every solid triangle has outward winding');
        volume+=dot(a,cross(b,c))/6;
        if(f.boundary){const k=m.els.indexOf(e)+','+m.els.indexOf(f.boundary);
          seams.set(k,(seams.get(k)||0)+Math.hypot(...normal)/2);}
        for(let i=0;i<3;i++){
          const a=f.idx[i],b=f.idx[(i+1)%3],k=Math.min(a,b)+','+Math.max(a,b),v=edges.get(k)||[0,0];
          v[0]++;v[1]+=a<b?1:-1;edges.set(k,v);
        }
      }
      assert.ok(volume>1e-10,'a retained piece has positive solid volume');
      if([...edges.values()].some(([count,winding])=>count!==2||winding!==0))console.log('BAD_EDGES',stage,m.els.indexOf(e),JSON.stringify([...edges].filter(([,v])=>v[0]!==2||v[1]!==0).slice(0,12).map(([k,v])=>({edge:k,v,p:k.split(',').map(i=>e.skinGeom.verts[i])}))));
      assert.ok([...edges.values()].every(([count,winding])=>count===2&&winding===0),
        'each chunk is watertight with paired opposite edges: stage '+stage+' piece '+m.els.indexOf(e));
    }
    for(const [k,area] of seams){const [a,b]=k.split(',');
      assert.ok(Math.abs(area-(seams.get(b+','+a)||0))<.0002,
        'neighbouring chunks share the same closed cut face: stage '+stage+' pair '+k+' areas '+area+'/'+(seams.get(b+','+a)||0));}
    for(const s of m.screws)if(s.skinMount?.surfaceKind==='mesh'){
      mounts++;const a=s.skinMount,face=a.owner.skinGeom.faces[a.face];
      assert.equal(a.owner,s.into,'a mounted fastener belongs to its own retained piece');
      const p=sub(a.p,mul(a.a,.006)),v=face.idx.map(i=>add(a.owner.c,a.owner.skinGeom.verts[i]));
      assert.ok(Math.abs(dot(sub(p,v[0]),face.n))<1e-7,'seat touches the actual rendered triangle');
      assert.ok(v.every((q,i)=>dot(cross(sub(v[(i+1)%3],q),sub(p,q)),face.n)>=-1e-7),
        'seat is inside its real surface triangle, not a detached analytic shell');
      assert.ok(!face.boundary||a.interior,'an exterior screw is not buried in a neighbouring cell cut');
      for(const other of m.screws){const b=other.skinMount;
        if(other===s||b?.owner!==a.owner||dot(a.a,b.a)<.7)continue;
        assert.ok(Math.hypot(...sub(add(a.p,mul(a.a,.029)),add(b.p,mul(b.a,.029))))>=.051*((a.drawScale||1)+(b.drawScale||1))-.001,
          'same-facing screw heads do not overlap on their solid seat: stage '+stage+' screws '+m.screws.indexOf(s)+','+m.screws.indexOf(other));
      }
    }
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
      st.zm=1;st.pan=normalPan.slice();
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
        const top=(x,y)=>{let owner=null,z=-Infinity;
          for(const it of st.order)for(const pg of it.polys)
            if(pg.depth&&(pg.visible||[pg.pts]).some(p=>pointIn(x,y,p))){
              const d=depthAt(pg.depth,{x,y});if(d>z){z=d;owner=it.owner;}}
          return owner;};
        for(const s of free){
          const points=[],head=st.heads.get(s);if(head)points.push(head);
          for(const pg of st.drawn)if(pg.owner===s&&Math.abs(polyArea(pg.pts))>.02)
            points.push({x:pg.pts.reduce((v,p)=>v+p.x,0)/pg.pts.length,
              y:pg.pts.reduce((v,p)=>v+p.y,0)/pg.pts.length});
          for(const p of points){
            if(p.x<5||p.x>315||p.y<SCENE_TOP+1||p.y>SCENE_BOTTOM-1||top(p.x,p.y)!==s)continue;
            assert.equal(blocked(s,m),null,'camera rotation alone cannot change physical extraction');
            if(m.screws.filter(z=>z.state==='in').length<=3){
              game.onWheel(-Math.log(9)/.0015,p.x,p.y);game.draw(canvas);
              assert.equal(top(p.x,p.y),s,'9x zoom preserves the nearest visible fastener');
              assert.equal(blocked(s,m),null,'zoom cannot remove a physical blocker');
              assert.ok(st.drawn.every(pg=>pg.pts.every(q=>q.y>=SCENE_TOP-1e-6&&q.y<=SCENE_BOTTOM+1e-6)),
                'zoomed touch polygons cannot invade the HUD');zoomTaps++;
            }
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
        if(!next)console.log('FAILED_SCREWS',JSON.stringify(free.map(s=>({id:m.screws.indexOf(s),p:s.p,a:s.a,
          mount:s.skinMount&&{p:s.skinMount.p,a:s.skinMount.a,face:s.skinMount.face},
          into:m.els.indexOf(s.into),intoC:s.into.c,thru:m.els.indexOf(s.thru),thruKind:s.thru.kind,
          head:st.heads.get(s),drawn:st.drawn.filter(pg=>pg.owner===s).length,
          remaining:m.els.filter(e=>e.state==='on').map(e=>({id:m.els.indexOf(e),kind:e.kind,c:e.c}))}))));
        assert.ok(next,'no actually visible/clickable legal screw at stage '+stage+' left '+left+' seed '+seed);
      }else next=free[Math.floor(Math.random()*free.length)];
      remove(next);
    }
    assert.ok(m.els.every(e=>e.state==='gone'),'all pieces detach after the last actual touch');
    game.destroy();return {stage,total,features,views,taps,mounts,pieces,zoomTaps,triangles};
  };
`,context);

const start=Number(process.env.SCREW_VIS_START||0),end=Number(process.env.SCREW_VIS_END||1000);
const levels=process.env.SCREW_VIS_LEVELS?process.env.SCREW_VIS_LEVELS.split(',').map(Number):start?Array.from({length:end-start+1},(_,i)=>start+i):
  [1,2,3,5,17,18,19,20,25,31,38,39,40,80,160,300,500,700,800,998,999,1000];
const totals={levels:0,screws:0,features:0,views:0,taps:0,mounts:0,pieces:0,zoomTaps:0,triangles:0},begin=Date.now();
for(const stage of levels){
  const r=context.checkMidgame(stage,Math.imul(stage,9973)+37);
  totals.levels++;totals.screws+=r.total;totals.features+=r.features;
  totals.views+=r.views;totals.taps+=r.taps;
  totals.mounts+=r.mounts;totals.pieces+=r.pieces;totals.zoomTaps+=r.zoomTaps;
  totals.triangles+=r.triangles;
  if(start&&stage%25===0)console.log('VISIBILITY_PROGRESS',stage,Math.round((Date.now()-begin)/1000));
}
if(!start&&!process.env.SCREW_VIS_LEVELS)for(const seed of [2,4,5,9]){
  const r=context.checkMidgame(20,seed);totals.levels++;totals.screws+=r.total;
  totals.features+=r.features;totals.views+=r.views;totals.taps+=r.taps;
  totals.mounts+=r.mounts;totals.pieces+=r.pieces;totals.zoomTaps+=r.zoomTaps;
}
console.log('PASS: randomized midgame depth clipping and real pointer extraction',JSON.stringify({...totals,ms:Date.now()-begin}));
