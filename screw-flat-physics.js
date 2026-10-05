/* Rigid metal pieces, board holes and screw joints for the flat puzzle. */
(function () {
  'use strict';
  const M=typeof module!=='undefined'&&module.exports?require('./vendor/matter-0.20.0.min.js'):window.Matter;
  const BOARD={x:24,y:143,w:312,h:346},STEP=1000/120,SCREW_RADIUS=13,LAST_STAGE=1000;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const BODY_ID=Symbol.for('ojjuda.flat.body'),PINNED_BODIES=Symbol.for('ojjuda.flat.pinnedBodies');
  // A per-body exclusion avoids the 32-category bitmask limit at fifty plates.
  if(!M.Detector.canCollide.ojjudaFlat){
    const canCollide=M.Detector.canCollide;
    const filter=(a,b)=>canCollide(a,b)&&!a[PINNED_BODIES]?.has(b[BODY_ID])&&!b[PINNED_BODIES]?.has(a[BODY_ID]);
    filter.ojjudaFlat=true;M.Detector.canCollide=filter;
  }
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
    return !level.plates.some(p=>p.state!=='gone'&&plateCovers(p,hole.x,hole.y,12*(level.screwRadius||SCREW_RADIUS)/SCREW_RADIUS)&&
      !p.pins.some(pin=>pin.hole===hole.id)&&alignedMount(p,hole)<0);
  }
  function bareHole(level,hole){return !level.plates.some(p=>plateCovers(p,hole.x,hole.y,15*(level.screwRadius||SCREW_RADIUS)/SCREW_RADIUS));}
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
  function mountPair(vertices,inset=17,separation=32){
    const xs=vertices.map(v=>v.x),ys=vertices.map(v=>v.y),candidates=[];
    for(let y=Math.ceil(Math.min(...ys)+inset);y<Math.max(...ys)-inset+1;y+=3)
      for(let x=Math.ceil(Math.min(...xs)+inset);x<Math.max(...xs)-inset+1;x+=3)
        if(polygonDistance(vertices,x,y)<=-inset)candidates.push({x,y});
    if(candidates.length<2)throw Error('Metal piece has no room for screws');
    const extremes=[];
    for(let i=0;i<12;i++){const co=Math.cos(i*Math.PI/6),si=Math.sin(i*Math.PI/6);extremes.push(candidates.reduce((best,p)=>p.x*co+p.y*si>best.x*co+best.y*si?p:best));}
    let pair=null,dist=0;
    for(const a of extremes)for(const b of extremes){const d=Math.hypot(a.x-b.x,a.y-b.y);if(d>dist){dist=d;pair=[a,b];}}
    if(dist<separation)throw Error('Metal piece screw heads overlap');
    return pair.sort((a,b)=>a.x-b.x||a.y-b.y);
  }
  const SHAPE_NAMES=['보석','방패','하트','나뭇잎','원형','네모판','꽃','별','나비','구름','초승달','로켓','십자'];
  const SHAPE_UNLOCKS=[80,140,220,320,450,650];
  function shapeIndex(L){const extra=SHAPE_UNLOCKS.filter(stage=>L>=stage).length;return extra?(L-SHAPE_UNLOCKS[extra-1]+6+extra)%(7+extra):(L-11+6)%7;}
  const FIRST_SHAPED_STAGE=11,PIECE_INCREASES=[20,35,55,80,115];
  const pieceCount=L=>L<FIRST_SHAPED_STAGE?1+Math.floor(L/2):L<160?7+PIECE_INCREASES.filter(n=>L>=n).length:13+Math.floor((L-160)*37/(LAST_STAGE-160));
  function flowerOutline(first=false){
    // A convex centre and five circular caps form one concave flower without overlapping bodies.
    const radius=first?70:110,offset=first?100:80,half=Math.PI/5,edgeX=radius*Math.cos(half)-offset,edgeY=radius*Math.sin(half);
    const capRadius=Math.hypot(edgeX,edgeY),arc=Math.atan2(edgeY,edgeX),centre=[],petals=[];
    for(let i=0;i<5;i++){
      const a=-Math.PI/2+i*2*Math.PI/5,co=Math.cos(a),si=Math.sin(a);
      centre.push({x:radius*Math.cos(a-half),y:radius*Math.sin(a-half)});
      const steps=first?24:16,cap=Array.from({length:steps+1},(_,j)=>{
        const t=-arc+2*arc*j/steps,x=offset+capRadius*Math.cos(t),y=capRadius*Math.sin(t);
        return{x:x*co-y*si,y:x*si+y*co};
      });
      const petal=first?clipPlane(clipPlane(cap,-Math.sin(a-half),Math.cos(a-half),0,false),-Math.sin(a+half),Math.cos(a+half),0,true):cap;
      petals.push(petal.filter((p,j)=>Math.hypot(p.x-petal[(j+1)%petal.length].x,p.y-petal[(j+1)%petal.length].y)>1e-6));
    }
    const roots=[centre,...petals],points=roots.flat(),xs=points.map(p=>p.x),ys=points.map(p=>p.y);
    const minX=Math.min(...xs),minY=Math.min(...ys),width=Math.max(...xs)-minX,height=Math.max(...ys)-minY;
    const outline=roots.map(poly=>poly.map(p=>({x:32+(p.x-minX)*296/width,y:151+(p.y-minY)*330/height})));
    const outside=outline.slice(1).sort((a,b)=>M.Vertices.centre(b).y-M.Vertices.centre(a).y);
    return[...outside.slice(0,4),outline[0],outside[4]];
  }
  function advancedOutline(index){
    const points=rows=>rows.map(([x,y])=>({x,y})),mirror=poly=>poly.map(p=>({x:360-p.x,y:p.y})).reverse();let roots;
    if(index===7){
      const inner=95,outer=165,half=Math.PI/5;
      roots=[Array.from({length:5},(_,i)=>{const a=-Math.PI/2+half+i*2*half;return{x:inner*Math.cos(a),y:inner*Math.sin(a)};})];
      for(let i=0;i<5;i++){const a=-Math.PI/2+i*2*half;roots.push([{x:inner*Math.cos(a-half),y:inner*Math.sin(a-half)},{x:outer*Math.cos(a),y:outer*Math.sin(a)},{x:inner*Math.cos(a+half),y:inner*Math.sin(a+half)}]);}
    }else if(index===8){
      const top=points([[156,218],[120,175],[63,154],[35,179],[32,237],[52,282],[156,319]]);
      const bottom=points([[156,321],[70,316],[43,346],[43,407],[72,455],[115,480],[156,440]]);
      roots=[top,mirror(top),bottom,mirror(bottom),points([[156,218],[204,218],[204,440],[156,440]])];
    }else if(index===9){
      const circle=(x,y,r)=>Array.from({length:48},(_,i)=>({x:x+r*Math.cos(i*Math.PI/24),y:y+r*Math.sin(i*Math.PI/24)}));
      const left=clipPlane(clipPlane(circle(96,310,64),1,0,100,true),0,1,330,true);
      const middle=clipPlane(clipPlane(clipPlane(circle(180,290,90),1,0,100,false),1,0,260,true),0,1,330,true);
      roots=[left,middle,mirror(left),points([[32,330],[328,330],[328,380],[304,429],[270,451],[90,451],[56,429],[32,380]])];
    }else if(index===10){
      const tip=points([[240,157],[170,154],[102,181],[61,221],[130,260]]);
      const middle=points([[61,221],[130,260],[102,317],[32,317],[39,269]]);
      const lower=poly=>poly.map(p=>({x:p.x,y:634-p.y})).reverse();roots=[tip,middle,lower(middle),lower(tip)];
    }else if(index===11){
      const fin=points([[133,302],[133,424],[44,456],[61,386]]);
      roots=[points([[133,196],[180,151],[227,196],[227,390],[133,390]]),fin,mirror(fin),points([[142,390],[218,390],[228,432],[180,480],[132,432]])];
    }else{
      roots=[points([[127,245],[233,245],[233,389],[127,389]]),points([[127,151],[233,151],[233,245],[127,245]]),points([[127,389],[233,389],[233,481],[127,481]]),points([[32,245],[127,245],[127,389],[32,389]]),points([[233,245],[328,245],[328,389],[233,389]])];
    }
    const all=roots.flat(),minX=Math.min(...all.map(p=>p.x)),maxX=Math.max(...all.map(p=>p.x)),minY=Math.min(...all.map(p=>p.y)),maxY=Math.max(...all.map(p=>p.y));
    return roots.map(poly=>poly.map(p=>({x:32+(p.x-minX)*296/(maxX-minX),y:151+(p.y-minY)*330/(maxY-minY)}))).sort((a,b)=>M.Vertices.centre(b).y-M.Vertices.centre(a).y);
  }
  function shapeOutline(index,firstFlower=false){
    if(index>=7)return advancedOutline(index);
    const points=rows=>rows.map(([x,y])=>({x,y}));
    if(index===6)return flowerOutline(firstFlower);
    if(index===0)return[points([[95,157],[265,157],[322,225],[310,380],[180,477],[50,380],[38,225]])];
    if(index===1)return[points([[55,157],[305,157],[318,335],[285,404],[180,477],[75,404],[42,335]])];
    if(index===2){
      const left=points([[180,191],[157,165],[129,151],[89,151],[55,167],[33,205],[32,263],[54,346],[107,419],[180,480]]);
      return[left,left.map(p=>({x:360-p.x,y:p.y})).reverse()];
    }
    if(index===3)return[points([[180,157],[262,181],[308,239],[318,307],[293,375],[241,437],[180,477],[115,453],[65,399],[42,329],[48,260],[86,199]])];
    if(index===4)return[Array.from({length:24},(_,i)=>{const a=i*Math.PI/12;return{x:180+140*Math.cos(a),y:317+160*Math.sin(a)};})];
    return[points([[66,157],[294,157],[318,181],[318,453],[294,477],[66,477],[42,453],[42,181]])];
  }
  function clipPlane(poly,nx,ny,cut,low){
    const result=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],da=a.x*nx+a.y*ny-cut,db=b.x*nx+b.y*ny-cut;
      const ina=low?da<=0:da>=0,inb=low?db<=0:db>=0;
      if(ina)result.push(a);
      if(ina!==inb){const t=da/(da-db);result.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
    }
    return result;
  }
  function fitFragment(raw,radius=SCREW_RADIUS){
    if(raw.length<3||!M.Vertices.isConvex(raw))return null;
    const centre=M.Vertices.centre(raw),poly=raw.map(v=>({x:centre.x+(v.x-centre.x)*.982,y:centre.y+(v.y-centre.y)*.982}));
    try{return{raw,poly,centre,mounts:mountPair(poly,radius+2,32*radius/SCREW_RADIUS),area:M.Vertices.area(raw)};}catch(_){return null;}
  }
  function splitFragment(fragment,random,radius){
    const xs=fragment.raw.map(p=>p.x),ys=fragment.raw.map(p=>p.y);
    const main=Math.max(...xs)-Math.min(...xs)>Math.max(...ys)-Math.min(...ys)?0:Math.PI/2;
    const angles=[main+(random()-.5)*.65,main+Math.PI/2+(random()-.5)*.65,main,main+Math.PI/2,Math.PI/4,-Math.PI/4];
    for(const angle of angles){
      const nx=Math.cos(angle),ny=Math.sin(angle),dots=fragment.raw.map(p=>p.x*nx+p.y*ny),min=Math.min(...dots),span=Math.max(...dots)-min;
      for(const fraction of [.5,.43,.57,.36,.64]){
        const cut=min+span*fraction,a=fitFragment(clipPlane(fragment.raw,nx,ny,cut,true),radius);if(!a)continue;
        const b=fitFragment(clipPlane(fragment.raw,nx,ny,cut,false),radius);if(!b)continue;
        // Visit the side gravity can pull away from the shared cut first.
        fragment.children=ny>=0?[b,a]:[a,b];return fragment.children;
      }
    }
    return null;
  }
  function makeShapedLevel(L){
    const count=pieceCount(L),shape=shapeIndex(L),outline=shapeOutline(shape,L===FIRST_SHAPED_STAGE);
    const area=outline.reduce((sum,poly)=>sum+M.Vertices.area(poly),0),density=shape>=7?Math.min(1,Math.sqrt(area/75000)):1;
    const radius=SCREW_RADIUS*density/(1+Math.max(0,count-18)*.04);let leaves,roots;
    for(let attempt=0;attempt<12;attempt++){
      const random=seeded(9041+L*7919+attempt*104729);
      roots=outline.map(raw=>fitFragment(raw,radius));if(roots.some(p=>!p))throw Error('Invalid metal outline');leaves=[...roots];
      if(L===FIRST_SHAPED_STAGE){
        // Keep the first flower's centre small and its top mounts high enough to reopen as it falls.
        const centre=roots[4],halves=[false,true].map(low=>fitFragment(clipPlane(centre.raw,1,0,181,low)));
        centre.children=halves;leaves.splice(4,1,...halves);
        roots[5].mounts=[{x:160,y:174},{x:200,y:174}];
      }
      while(leaves.length<count){
        const candidates=leaves.filter(p=>!p.unsplittable).sort((a,b)=>b.area-a.area);let changed=false;
        for(const p of candidates){
          const children=splitFragment(p,random,radius);
          if(children){leaves.splice(leaves.indexOf(p),1,...children);changed=true;break;}p.unsplittable=true;
        }
        if(!changed)break;
      }
      if(leaves.length===count)break;
    }
    if(leaves.length!==count)throw Error('Metal outline has too few usable pieces');
    const plates=[],holes=[90,180,270].map((x,id)=>({id,x,y:100,owner:null,screw:null})),screws=[];
    for(const f of leaves){
      const p={id:plates.length,z:plates.length,row:0,col:plates.length,releaseFrom:1,x:f.centre.x,y:f.centre.y,angle:0,
        screwRadius:radius,vertices:f.poly.map(v=>({x:v.x-f.centre.x,y:v.y-f.centre.y})),mounts:[],pins:[],holeIds:[],state:'fixed',vx:0,vy:0,spin:0};
      p.w=Math.max(...p.vertices.map(v=>v.x))-Math.min(...p.vertices.map(v=>v.x));p.h=Math.max(...p.vertices.map(v=>v.y))-Math.min(...p.vertices.map(v=>v.y));
      plates.push(p);f.id=p.id;
      for(const q of f.mounts){
        const h={id:holes.length,x:q.x,y:q.y,owner:p.id,screw:screws.length};holes.push(h);p.holeIds.push(h.id);
        p.mounts.push({x:q.x-p.x,y:q.y-p.y});p.pins.push({hole:h.id,mount:p.mounts.length-1});screws.push({id:screws.length,hole:h,startHole:h.id});
      }
    }
    const ordered=[],visit=node=>node.children?node.children.forEach(visit):ordered.push(plates[node.id]);roots.forEach(visit);
    return{stage:L,theme:(L-1)%6,shape:SHAPE_NAMES[shape],screwRadius:radius,silhouette:roots.map(p=>p.raw),plates,holes,screws,order:ordered.flatMap(p=>p.holeIds.map(h=>holes[h].screw))};
  }
  function makeFlatLevel(stage){
    const L=clamp(Math.trunc(stage)||1,1,LAST_STAGE),count=pieceCount(L),random=seeded(431+Math.max(1,count-2)*7919);
    if(L>=FIRST_SHAPED_STAGE)return makeShapedLevel(L);
    const top=[[153,157],[207,157],[232,169],[247,192],[251,270],[109,270],[113,192],[128,169]].map(([x,y])=>({x,y}));
    let bands,counts;
    if(count===1){
      bands=[[[95,157],[265,157],[318,475],[42,475]].map(([x,y])=>({x,y}))];counts=[1];
    }else if(count===2){
      bands=[top,[[109,270],[251,270],[318,475],[42,475]].map(([x,y])=>({x,y}))];counts=[1,1];
    }else{
      bands=[[[153,157],[207,157],[232,169],[247,192],[251,266],[109,266],[113,192],[128,169]],
        [[109,266],[251,266],[307,372],[53,372]],[[53,372],[307,372],[318,475],[42,475]]].map(poly=>poly.map(([x,y])=>({x,y})));
      counts=count===3?[1,1,1]:count===4?[1,2,1]:count===5?[1,2,2]:[2,2,2];
    }
    const plates=[],holes=[],screws=[];
    for(const x of [90,180,270])holes.push({id:holes.length,x,y:100,owner:null,screw:null});
    bands.forEach((band,row)=>{
      const left=Math.min(...band.map(v=>v.x)),right=Math.max(...band.map(v=>v.x));
      const midY=(Math.min(...band.map(v=>v.y))+Math.max(...band.map(v=>v.y)))/2;
      const rowSlope=(random()<.5?-1:1)*(.05+random()*.12);
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
    return{stage:L,theme:(L-1)%6,silhouette:bands,plates,holes,screws,order:[...plates].sort((a,b)=>b.row-a.row||(a.col-b.col)*a.releaseFrom).flatMap(p=>(p.releaseFrom>0?p.holeIds:[...p.holeIds].reverse()).map(h=>holes[h].screw))};
  }
  function createPhysics(level){
    const engine=M.Engine.create({positionIterations:12,velocityIterations:8,constraintIterations:8,enableSleeping:false});
    engine.gravity.y=1;engine.gravity.scale=.001;
    const bodies=new Map(),joints=new Map(),screwBodies=new Map();let accumulator=0,dead=false;
    const radius=level.screwRadius||SCREW_RADIUS;
    function refreshScrews(){
      for(const s of level.screws){
        let body=screwBodies.get(s.id);
        if(!body){
          body=M.Bodies.circle(s.hole.x,s.hole.y,radius,{label:'screw-'+s.id,isStatic:true,friction:.5,frictionStatic:.8,restitution:.02,slop:.025,collisionFilter:{category:1,mask:2}});
          screwBodies.set(s.id,body);M.Composite.add(engine.world,body);
        }
        M.Body.setPosition(body,{x:s.hole.x,y:s.hole.y});
        // A screw passes through its own drilled mount, but stops every other plate.
        body.collisionFilter[PINNED_BODIES]=new Set(level.plates.filter(p=>p.pins.some(pin=>pin.hole===s.hole.id)).map(p=>bodies.get(p.id)?.id).filter(id=>id!==undefined));
      }
    }
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
      const b=M.Bodies.fromVertices(p.x,p.y,[p.vertices],{label:'metal-'+p.id,friction:.45,frictionStatic:.7,frictionAir:.012,restitution:.04,density:.002,slop:.025,collisionFilter:{category:2,mask:3}});
      M.Body.setAngle(b,p.angle);M.Body.setVelocity(b,{x:p.vx||0,y:p.vy||0});M.Body.setAngularVelocity(b,p.spin||0);
      b.collisionFilter[BODY_ID]=b.id;bodies.set(p.id,b);M.Composite.add(engine.world,b);refreshPins(p);
    }
    refreshScrews();
    function move(screw,to){
      if(dead||to.screw!==null||!canUnscrew(level,screw)||!canAccessHole(level,to))return false;
      const from=screw.hole,changed=new Set();
      for(const p of level.plates)if(p.state!=='gone'){
        if(p.pins.some(pin=>pin.hole===from.id)){p.pins=p.pins.filter(pin=>pin.hole!==from.id);changed.add(p);}
        const mount=alignedMount(p,to);if(mount>=0&&!p.pins.some(pin=>pin.mount===mount)){p.pins.push({hole:to.id,mount});changed.add(p);}
      }
      from.screw=null;to.screw=screw.id;screw.hole=to;
      for(const p of changed)refreshPins(p);
      refreshScrews();
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
    function destroy(){dead=true;M.Composite.clear(engine.world,false);M.Engine.clear(engine);bodies.clear();joints.clear();screwBodies.clear();}
    return{step,move,destroy,engine,bodies,screwBodies};
  }
  const api={BOARD,SCREW_RADIUS,LAST_STAGE,SHAPE_NAMES,makeFlatLevel,createPhysics,canUnscrew,canAccessHole,bareHole,plateCovers,screwPoint,worldPoint,alignedMount,polygonDistance};
  if(typeof window!=='undefined')window.OjjudaFlatPhysics=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
