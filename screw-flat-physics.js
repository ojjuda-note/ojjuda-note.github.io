/* Rigid metal pieces, board holes and screw joints for the flat puzzle. */
(function () {
  'use strict';
  const M=typeof module!=='undefined'&&module.exports?require('./vendor/matter-0.20.0.min.js'):window.Matter;
  const BOARD={x:24,y:143,w:312,h:346},STEP=1000/120;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const seeded=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  function worldPoint(p,v){const co=Math.cos(p.angle),si=Math.sin(p.angle);return{x:p.x+v.x*co-v.y*si,y:p.y+v.x*si+v.y*co};}
  function localPoint(p,x,y){const co=Math.cos(p.angle),si=Math.sin(p.angle),dx=x-p.x,dy=y-p.y;return{x:dx*co+dy*si,y:-dx*si+dy*co};}
  function polygonDistance(vertices,x,y){
    let inside=false,distance=Infinity;
    for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
      const a=vertices[j],b=vertices[i],dx=b.x-a.x,dy=b.y-a.y;
      if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
      const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy),0,1);
      distance=Math.min(distance,Math.hypot(x-a.x-t*dx,y-a.y-t*dy));
    }
    return inside?-distance:distance;
  }
  function plateCovers(p,x,y,radius=0){if(p.state==='gone')return false;const q=localPoint(p,x,y);return polygonDistance(p.vertices,q.x,q.y)<radius;}
  function alignedMount(p,hole){return p.mounts.findIndex(v=>{const q=worldPoint(p,v);return Math.hypot(q.x-hole.x,q.y-hole.y)<=2.8;});}
  function canAccessHole(level,hole){
    return !level.plates.some(p=>p.state!=='gone'&&plateCovers(p,hole.x,hole.y,12)&&
      !p.pins.some(pin=>pin.hole===hole.id)&&alignedMount(p,hole)<0);
  }
  function bareHole(level,hole){return !level.plates.some(p=>plateCovers(p,hole.x,hole.y,15));}
  function canUnscrew(level,s){return s.hole.screw===s.id&&canAccessHole(level,s.hole);}
  function screwPoint(s){return{x:s.hole.x,y:s.hole.y};}
  function clipLine(poly,cut,midY,keepLeft){
    const result=[],side=v=>v.x-cut.x-cut.slope*(v.y-midY);
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],da=side(a),db=side(b),ina=keepLeft?da<=0:da>=0,inb=keepLeft?db<=0:db>=0;
      if(ina)result.push(a);
      if(ina!==inb){const t=da/(da-db);result.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
    }
    return result;
  }
  function mountPair(vertices){
    const xs=vertices.map(v=>v.x),ys=vertices.map(v=>v.y),candidates=[];
    for(let y=Math.ceil(Math.min(...ys)+17);y<Math.max(...ys)-16;y+=3)
      for(let x=Math.ceil(Math.min(...xs)+17);x<Math.max(...xs)-16;x+=3)
        if(polygonDistance(vertices,x,y)<=-17)candidates.push({x,y});
    if(candidates.length<2)throw Error('Metal piece has no room for screws');
    const extremes=[];
    for(let i=0;i<12;i++){const co=Math.cos(i*Math.PI/6),si=Math.sin(i*Math.PI/6);extremes.push(candidates.reduce((best,p)=>p.x*co+p.y*si>best.x*co+best.y*si?p:best));}
    let pair=null,dist=0;
    for(const a of extremes)for(const b of extremes){const d=Math.hypot(a.x-b.x,a.y-b.y);if(d>dist){dist=d;pair=[a,b];}}
    if(dist<32)throw Error('Metal piece screw heads overlap');
    return pair.sort((a,b)=>a.x-b.x||a.y-b.y);
  }
  function makeFlatLevel(stage){
    const L=clamp(Math.trunc(stage)||1,1,500),random=seeded(431+L*7919);
    const top=[[153,157],[207,157],[232,169],[247,192],[251,270],[109,270],[113,192],[128,169]].map(([x,y])=>({x,y}));
    let bands,counts;
    if(L<=3){
      bands=[[[153,157],[207,157],[232,169],[247,192],[251,266],[109,266],[113,192],[128,169]],
        [[109,266],[251,266],[307,372],[53,372]],[[53,372],[307,372],[318,475],[42,475]]].map(poly=>poly.map(([x,y])=>({x,y})));
      counts=L===1?[1,1,1]:L===2?[1,2,1]:[1,2,2];
    }else{
      const rows=[[270,109,251],[323,74,286],[374,52,308],[424,43,317],[475,42,318]];
      bands=[top];
      for(let i=0;i<rows.length-1;i++){
        const [y0,l0,r0]=rows[i],[y1,l1,r1]=rows[i+1];
        // Adjacent pieces share the same boundary; the outer shape stays closed.
        bands.push([{x:l0,y:y0},{x:r0,y:y0},{x:r1,y:y1},{x:l1,y:y1}]);
      }
      const extra=Math.min(7,1+Math.floor((L-4)/5));counts=[2,1,1,1,1];
      for(let i=0;i<extra;i++)counts[[4,3,2,1,4,3,2][i]]++;
    }
    const plates=[],holes=[],screws=[];
    for(const x of L<=3?[90,180,270]:[126,234])holes.push({id:holes.length,x,y:100,owner:null,screw:null});
    bands.forEach((band,row)=>{
      const left=Math.min(...band.map(v=>v.x)),right=Math.max(...band.map(v=>v.x));
      const midY=(Math.min(...band.map(v=>v.y))+Math.max(...band.map(v=>v.y)))/2;
      const rowSlope=(random()<.5?-1:1)*(L>3&&row===0?.18+random()*.2:.05+random()*.12);
      const cuts=[{x:left-1,slope:0}];for(let col=1;col<counts[row];col++)cuts.push({x:left+(right-left)*(col/counts[row]+(random()-.5)*.025),slope:rowSlope});cuts.push({x:right+1,slope:0});
      for(let col=0;col<counts[row];col++){
        let poly=clipLine(clipLine(band,cuts[col],midY,false),cuts[col+1],midY,true);
        const centre=M.Vertices.centre(poly);
        poly=poly.map(v=>({x:centre.x+(v.x-centre.x)*.978,y:centre.y+(v.y-centre.y)*.965}));
        const mounts=mountPair(poly),vertices=poly.map(v=>({x:v.x-centre.x,y:v.y-centre.y}));
        const p={id:plates.length,z:plates.length,row,col,releaseFrom:rowSlope>=0?1:-1,x:centre.x,y:centre.y,angle:0,vertices,mounts:[],pins:[],holeIds:[],state:'fixed',vx:0,vy:0,spin:0};
        p.w=Math.max(...vertices.map(v=>v.x))-Math.min(...vertices.map(v=>v.x));p.h=Math.max(...vertices.map(v=>v.y))-Math.min(...vertices.map(v=>v.y));
        plates.push(p);
        for(const q of mounts){
          const h={id:holes.length,x:q.x,y:q.y,owner:p.id,screw:screws.length};holes.push(h);p.holeIds.push(h.id);
          p.mounts.push({x:q.x-p.x,y:q.y-p.y});p.pins.push({hole:h.id,mount:p.mounts.length-1});
          screws.push({id:screws.length,hole:h,startHole:h.id});
        }
      }
    });
    return{stage:L,theme:(L-1)%6,plates,holes,screws,order:[...plates].sort((a,b)=>b.row-a.row||(a.col-b.col)*a.releaseFrom).flatMap(p=>(p.releaseFrom>0?p.holeIds:[...p.holeIds].reverse()).map(h=>holes[h].screw))};
  }
  function createPhysics(level){
    const engine=M.Engine.create({positionIterations:12,velocityIterations:8,constraintIterations:8,enableSleeping:false});
    engine.gravity.y=1;engine.gravity.scale=.001;
    const bodies=new Map(),joints=new Map();let accumulator=0,dead=false;
    function sync(p){const b=bodies.get(p.id);p.x=b.position.x;p.y=b.position.y;p.angle=b.angle;p.vx=M.Body.getVelocity(b).x;p.vy=M.Body.getVelocity(b).y;p.spin=M.Body.getAngularVelocity(b);}
    function refreshPins(p){
      const b=bodies.get(p.id);if(!b)return;
      for(const c of joints.get(p.id)||[])M.Composite.remove(engine.world,c);joints.set(p.id,[]);
      const fixed=p.pins.length>=2;M.Body.setStatic(b,fixed);
      p.state=fixed?'fixed':p.pins.length?'hinged':'loose';
      if(fixed){M.Body.setVelocity(b,{x:0,y:0});M.Body.setAngularVelocity(b,0);}
      else if(p.pins.length===1){
        const pin=p.pins[0],hole=level.holes[pin.hole],q=worldPoint(p,p.mounts[pin.mount]);
        const c=M.Constraint.create({pointA:{x:hole.x,y:hole.y},bodyB:b,pointB:{x:q.x-p.x,y:q.y-p.y},length:0,stiffness:1,damping:.12});
        joints.set(p.id,[c]);M.Composite.add(engine.world,c);
      }
    }
    for(const p of level.plates)if(p.state!=='gone'){
      const b=M.Bodies.fromVertices(p.x,p.y,[p.vertices],{label:'metal-'+p.id,friction:.45,frictionStatic:.7,frictionAir:.012,restitution:.04,density:.002,slop:.025});
      M.Body.setAngle(b,p.angle);M.Body.setVelocity(b,{x:p.vx||0,y:p.vy||0});M.Body.setAngularVelocity(b,p.spin||0);
      bodies.set(p.id,b);M.Composite.add(engine.world,b);refreshPins(p);
    }
    function move(screw,to){
      if(dead||to.screw!==null||!canUnscrew(level,screw)||!canAccessHole(level,to))return false;
      const from=screw.hole,changed=new Set();
      for(const p of level.plates)if(p.state!=='gone'){
        if(p.pins.some(pin=>pin.hole===from.id)){p.pins=p.pins.filter(pin=>pin.hole!==from.id);changed.add(p);}
        const mount=alignedMount(p,to);if(mount>=0&&!p.pins.some(pin=>pin.mount===mount)){p.pins.push({hole:to.id,mount});changed.add(p);}
      }
      from.screw=null;to.screw=screw.id;screw.hole=to;
      for(const p of changed)refreshPins(p);
      return true;
    }
    function step(seconds){
      if(dead)return[];accumulator+=clamp(seconds,0,.05)*1000;const gone=[];
      while(accumulator+1e-8>=STEP){
        M.Engine.update(engine,STEP);accumulator-=STEP;
        for(const p of level.plates)if(p.state!=='gone'){
          sync(p);const b=bodies.get(p.id);
          // Supported or jammed plates never disappear on a timer.
          if(!p.pins.length&&b.bounds.min.y>BOARD.y+BOARD.h+20){
            p.state='gone';M.Composite.remove(engine.world,b);bodies.delete(p.id);gone.push(p.id);
          }
        }
      }
      return gone;
    }
    function destroy(){dead=true;M.Composite.clear(engine.world,false);M.Engine.clear(engine);bodies.clear();joints.clear();}
    return{step,move,destroy,engine,bodies};
  }
  const api={BOARD,makeFlatLevel,createPhysics,canUnscrew,canAccessHole,bareHole,plateCovers,screwPoint,worldPoint,alignedMount,polygonDistance};
  if(typeof window!=='undefined')window.OjjudaFlatPhysics=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
