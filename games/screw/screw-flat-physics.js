/* Rigid metal pieces, board holes and screw joints for the flat puzzle. */
(function () {
  'use strict';
  const M=typeof module!=='undefined'&&module.exports?require('../../vendor/matter-0.20.0.min.js'):window.Matter;
  const Decomp=typeof module!=='undefined'&&module.exports?require('../../vendor/poly-decomp-0.3.0.min.js'):window.decomp;
  const Partitions=typeof module!=='undefined'&&module.exports?require('./screw-flat-partitions.js'):window.OjjudaFlatPartitions;
  M.Common.setDecomp(Decomp);
  const BOARD={x:24,y:143,w:312,h:346},STEP=1000/120,SCREW_RADIUS=13,LAST_STAGE=1000;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const BODY_ID=Symbol.for('ojjuda.flat.body'),PINNED_BODIES=Symbol.for('ojjuda.flat.pinnedBodies');
  // A per-body exclusion avoids the 32-category bitmask limit at fifty plates.
  if(!M.Detector.canCollide.ojjudaFlat){
    const canCollide=M.Detector.canCollide;
    const filter=(a,b)=>canCollide(a,b)&&!a[PINNED_BODIES]?.has(b[BODY_ID])&&!b[PINNED_BODIES]?.has(a[BODY_ID]);
    filter.ojjudaFlat=true;M.Detector.canCollide=filter;
  }
  // Every level starts with three free holes. Up to nine paid holes use fixed
  // positions, so placing an extra screw never moves existing parked screws.
  function spareHoleCount(){return 3;}
  const EXTRA_SPARE_POSITIONS=[
    [54,80],[126,80],[198,80],[234,80],[306,80],
    [54,120],[126,120],[198,120],[234,120]
  ];
  function layoutSpareHoles(level){
    const spare=level.holes.filter(h=>h.owner===null);
    if(spare.length>12)throw Error('Flat puzzle storage exceeds twelve holes');
    spare.forEach((h,i)=>{
      const [x,y]=i<3?[90+i*90,100]:EXTRA_SPARE_POSITIONS[i-3];
      h.x=x;h.y=y;h.storageScale=i<3?1:.7;
    });
  }
  function createSpareHoles(stage){
    const holes=Array.from({length:spareHoleCount(stage)},(_,id)=>({id,x:0,y:100,owner:null,screw:null}));
    layoutSpareHoles({holes});return holes;
  }
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
  function plateCovers(p,x,y,radius=0){
    if(p.state==='gone')return false;
    const q=localPoint(p,x,y),bounds=p.localBounds;
    if(bounds&&(q.x<bounds.min.x-radius||q.x>bounds.max.x+radius||
      q.y<bounds.min.y-radius||q.y>bounds.max.y+radius))return false;
    return polygonDistance(p.vertices,q.x,q.y)<radius;
  }
  function segmentDistance(a,b,c,d){
    const ux=b.x-a.x,uy=b.y-a.y,vx=d.x-c.x,vy=d.y-c.y,det=ux*vy-uy*vx;
    if(Math.abs(det)>1e-8){
      const x=c.x-a.x,y=c.y-a.y,t=(x*vy-y*vx)/det,s=(x*uy-y*ux)/det;
      if(t>=0&&t<=1&&s>=0&&s<=1)return 0;
    }
    const distance=(p,q,r)=>{const x=r.x-q.x,y=r.y-q.y,t=clamp(((p.x-q.x)*x+(p.y-q.y)*y)/(x*x+y*y||1),0,1);return Math.hypot(p.x-q.x-t*x,p.y-q.y-t*y);};
    return Math.min(distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b));
  }
  function plateBlocksSlot(p,hole,radius){
    const dx=Math.cos(-.28)*radius*.62,dy=Math.sin(-.28)*radius*.62;
    const a=localPoint(p,hole.x-dx,hole.y-dy),b=localPoint(p,hole.x+dx,hole.y+dy),margin=radius*.13;
    const bounds=p.localBounds;
    if(bounds&&(Math.max(a.x,b.x)<bounds.min.x-margin||Math.min(a.x,b.x)>bounds.max.x+margin||
      Math.max(a.y,b.y)<bounds.min.y-margin||Math.min(a.y,b.y)>bounds.max.y+margin))return false;
    return polygonDistance(p.vertices,a.x,a.y)<margin||polygonDistance(p.vertices,b.x,b.y)<margin||
      p.vertices.some((v,i)=>segmentDistance(a,b,v,p.vertices[(i+1)%p.vertices.length])<margin);
  }
  function alignedMount(p,hole){return p.mounts.findIndex(v=>{const q=worldPoint(p,v);return Math.hypot(q.x-hole.x,q.y-hole.y)<=2.8;});}
  function screwDepth(level,hole){
    const attached=level.plates.filter(p=>p.state!=='gone'&&p.pins.some(pin=>pin.hole===hole.id));
    return attached.length?Math.max(...attached.map(p=>p.z)):hole.screw===null?-1:Math.max(0,...level.plates.map(p=>p.z))+1;
  }
  function screwRadius(level,hole){return (level.screwRadius||SCREW_RADIUS)*(hole?.owner===null?(hole.storageScale||1):1);}
  function canSeatScrew(level,hole,screw){
    return hole.screw===null&&canAccessHole(level,hole)&&!level.screws.some(other=>other.hole&&other!==screw&&
      Math.hypot(other.hole.x-hole.x,other.hole.y-hole.y)<screwRadius(level,hole)+screwRadius(level,other.hole)+1.5-1e-6);
  }
  function canAccessHole(level,hole){
    const radius=level.screwRadius||SCREW_RADIUS,depths=new Map();
    if(level.interlocked)for(const p of level.plates)if(p.state!=='gone')for(const pin of p.pins)depths.set(pin.hole,Math.max(depths.get(pin.hole)??-1,p.z));
    const foreground=Math.max(0,...level.plates.map(p=>p.z))+1;
    const depth=depths.get(hole.id)??(hole.screw===null?-1:foreground);
    // Check the actual tool opening, not a predetermined release sequence.
    // A front sheet or screw head can cover it; moving either reveals it.
    const occupied=hole.screw!==null;
    // An empty board socket must leave enough room around its center to seat the head.
    const margin=level.interlocked?radius*(occupied ? .13 : (level.parkingClearance||0)):12*radius/SCREW_RADIUS;
    if(level.plates.some(p=>p.state!=='gone'&&(!level.interlocked||p.z>depth)&&(level.interlocked&&occupied?plateBlocksSlot(p,hole,radius):plateCovers(p,hole.x,hole.y,margin))&&
      !p.pins.some(pin=>pin.hole===hole.id)&&alignedMount(p,hole)<0))return false;
    if(!level.interlocked)return true;
    const dx=Math.cos(-.28),dy=Math.sin(-.28),half=occupied?radius*.62:0;
    return !level.screws.some(s=>{
      if(!s.hole||s.id===hole.screw||(depths.get(s.hole.id)??foreground)<=depth)return false;
      const x=s.hole.x-hole.x,y=s.hole.y-hole.y,t=clamp(x*dx+y*dy,-half,half);
      return Math.hypot(x-t*dx,y-t*dy)<screwRadius(level,s.hole)+margin;
    });
  }
  function bareHole(level,hole){return !level.plates.some(p=>plateCovers(p,hole.x,hole.y,15*(level.screwRadius||SCREW_RADIUS)/SCREW_RADIUS));}
  function canUnscrew(level,s){return !!s.hole&&s.hole.screw===s.id&&canAccessHole(level,s.hole);}
  function screwPoint(s){return s.hole?{x:s.hole.x,y:s.hole.y}:null;}
  const SHAPE_NAMES=['곡선 철판'];
  // Keep advanced curved pieces large enough to see and touch on a phone.
  // Difficulty comes from shared contours, parked heads and tight move budgets.
  const pieceCount=L=>L<11?1+Math.floor(L/2):7+[20,35,55,80,115,220,400,650,850].filter(n=>L>=n).length;
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
  function gravityReleaseOrder(plates){
    const extents=plates.map(p=>{
      const vertices=p.vertices.map(v=>worldPoint(p,v));
      return{p,vertices,minX:Math.min(...vertices.map(v=>v.x)),maxX:Math.max(...vertices.map(v=>v.x)),bottom:Math.max(...vertices.map(v=>v.y))};
    });
    function span(item,x){
      const v=item.vertices,ys=[];
      for(let i=0;i<v.length;i++){
        const a=v[i],b=v[(i+1)%v.length];
        if(x<Math.min(a.x,b.x)-.001||x>Math.max(a.x,b.x)+.001)continue;
        if(Math.abs(a.x-b.x)<.001){ys.push(a.y,b.y);}else{
          const t=(x-a.x)/(b.x-a.x);if(t>=-.001&&t<=1.001)ys.push(a.y+t*(b.y-a.y));
        }
      }
      return ys.length?{top:Math.min(...ys),bottom:Math.max(...ys)}:null;
    }
    const below=new Map(extents.map(e=>[e.p.id,new Set()]));
    for(let i=0;i<extents.length;i++)for(let j=i+1;j<extents.length;j++){
      const a=extents[i],b=extents[j],left=Math.max(a.minX,b.minX),right=Math.min(a.maxX,b.maxX);
      if(right-left<.4)continue;
      const xs=[left+(right-left)*.08,left+(right-left)*.5,left+(right-left)*.92];
      for(const x of xs){
        const aa=span(a,x),bb=span(b,x);if(!aa||!bb)continue;
        if(aa.bottom<=bb.top+1){below.get(a.p.id).add(b.p.id);break;}
        if(bb.bottom<=aa.top+1){below.get(b.p.id).add(a.p.id);break;}
      }
    }
    const pending=new Set(plates.map(p=>p.id)),order=[];
    while(pending.size){
      const available=extents.filter(e=>pending.has(e.p.id)&&![...below.get(e.p.id)].some(id=>pending.has(id)));
      const candidates=available.length?available:extents.filter(e=>pending.has(e.p.id));
      candidates.sort((a,b)=>b.bottom-a.bottom||a.p.id-b.p.id);
      const next=candidates[0].p;order.push(next);pending.delete(next.id);
    }
    return order;
  }

  // Each entry records a geometry seed and a physically verified move budget.
  const CURVED_LAYOUTS=[[0,2],[0,4],[0,4],[0,8],[0,6],[0,9],[0,10],[0,13],[0,15],[0,24],[1,23],[1,85],[0,30],[1,30],[0,24],[1,24],[0,22],[0,21],[0,19],[0,27],[0,25],[0,36],[0,24],[0,25],[0,25],[2,27],[0,24],[0,26],[1,21],[0,28],[0,27],[0,27],[1,21],[4,26],[1,31],[0,32],[0,33],[0,43],[0,31],[2,24],[0,48],[0,28],[0,35],[0,33],[1,32],[0,25],[0,38],[0,27],[1,28],[1,28],[0,22],[0,24],[0,44],[0,24],[1,31],[0,36],[0,33],[0,35],[0,28],[0,30],[0,34],[1,37],[3,35],[2,33],[1,32],[0,27],[0,53],[1,29],[0,34],[1,40],[1,34],[0,41],[2,30],[0,46],[3,34],[1,42],[1,40],[0,41],[4,41],[5,85],[3,40],[0,40],[2,49],[5,43],[3,48],[1,39],[1,44],[0,39],[1,36],[2,50],[3,39],[1,36],[0,34],[2,34],[7,40],[2,59],[0,42],[5,47],[5,63],[0,47],[0,38],[2,49],[5,37],[0,50],[0,40],[3,54],[7,38],[0,37],[0,38],[4,41],[0,36],[1,39],[2,45],[3,44],[0,46],[1,49],[0,51],[1,57],[3,52],[1,44],[2,49],[1,39],[3,45],[2,44],[4,46],[10,46],[1,42],[7,45],[0,34],[6,46],[1,34],[3,39],[2,38],[1,41],[6,41],[5,41],[0,49],[8,43],[2,50],[4,38],[0,43],[2,38],[1,45],[14,41],[2,39],[2,41],[0,38],[2,44],[17,41],[3,45],[5,43],[1,49],[3,41],[8,37],[1,44],[0,41],[2,38],[2,45],[0,39],[2,44],[5,46],[3,44],[20,47],[4,38],[5,41],[1,40],[7,38],[0,45],[2,33],[0,46],[0,45],[2,45],[0,43],[0,38],[0,40],[2,45],[6,41],[8,42],[4,44],[0,49],[2,43],[7,43],[0,37],[0,43],[1,49],[0,37],[13,53],[4,44],[0,39],[3,45],[1,39],[3,55],[1,45],[9,41],[0,43],[7,46],[1,35],[0,36],[2,46],[1,44],[0,44],[8,44],[1,44],[5,31],[1,41],[13,43],[0,37],[0,41],[7,47],[5,41],[1,45],[4,36],[0,41],[5,35],[10,43],[6,47],[1,35],[0,47],[1,46],[2,46],[16,53],[3,49],[2,42],[7,37],[27,60],[4,48],[4,42],[0,35],[13,57],[7,38],[12,48],[8,43],[13,49],[7,57],[9,46],[4,43],[5,52],[1,54],[1,44],[0,51],[7,49],[4,46],[10,41],[5,53],[4,37],[9,50],[2,53],[1,41],[6,48],[2,41],[1,52],[10,49],[16,50],[4,38],[6,39],[6,52],[11,53],[0,51],[4,51],[1,39],[3,41],[0,45],[12,47],[6,40],[0,42],[4,47],[3,45],[5,40],[16,47],[6,49],[3,52],[1,43],[6,44],[14,41],[11,56],[9,50],[3,45],[5,47],[0,42],[14,50],[10,44],[0,42],[10,45],[2,43],[0,45],[1,48],[3,47],[0,45],[5,57],[4,57],[2,48],[5,38],[13,44],[21,36],[8,49],[13,54],[4,48],[6,43],[2,37],[3,37],[5,43],[8,48],[3,63],[7,50],[10,43],[6,44],[2,57],[0,59],[16,52],[16,58],[0,54],[0,39],[22,50],[6,49],[2,47],[16,41],[16,56],[2,47],[14,49],[1,40],[9,53],[2,46],[4,44],[6,46],[3,52],[6,52],[0,41],[4,45],[26,49],[4,53],[5,60],[2,44],[9,38],[8,53],[2,48],[2,57],[12,44],[8,48],[3,39],[3,56],[0,47],[3,47],[6,53],[7,53],[5,49],[7,58],[6,55],[7,54],[10,58],[10,34],[9,40],[29,53],[0,51],[1,43],[6,50],[4,39],[0,48],[8,47],[17,49],[8,42],[2,36],[1,45],[1,50],[2,50],[0,46],[18,40],[1,45],[1,36],[12,52],[2,43],[3,51],[4,46],[3,44],[8,40],[0,40],[24,105],[12,51],[6,44],[6,46],[4,51],[0,47],[0,49],[1,47],[4,57],[2,45],[3,44],[3,45],[20,47],[3,51],[0,50],[3,56],[16,44],[12,39],[2,44],[1,49],[0,43],[2,45],[4,38],[1,49],[5,58],[3,54],[5,51],[2,49],[1,48],[1,66],[14,48],[16,54],[19,48],[38,52],[4,41],[12,46],[11,46],[14,52],[3,49],[4,54],[27,48],[48,49],[5,59],[6,76],[9,43],[4,57],[4,41],[9,45],[5,49],[2,60],[8,45],[0,58],[7,48],[17,73],[23,58],[13,46],[4,53],[9,71],[42,51],[4,45],[3,57],[1,45],[22,45],[0,53],[28,49],[12,46],[10,68],[1,53],[8,50],[18,58],[0,60],[6,47],[32,58],[18,53],[31,68],[15,59],[2,54],[6,47],[5,47],[13,44],[12,51],[27,51],[1,47],[0,44],[5,45],[2,57],[18,52],[18,58],[9,60],[3,46],[10,52],[10,46],[16,70],[6,43],[1,56],[1,53],[11,50],[5,59],[0,45],[13,52],[13,48],[10,54],[42,52],[10,50],[40,63],[2,45],[1,51],[7,53],[11,38],[4,48],[21,45],[35,42],[3,57],[0,49],[9,53],[7,41],[14,51],[23,49],[13,52],[18,47],[7,66],[2,48],[9,62],[1,56],[3,57],[6,56],[18,61],[5,66],[7,56],[5,45],[17,51],[5,56],[22,50],[8,41],[29,58],[2,48],[3,46],[10,57],[6,50],[8,57],[1,52],[16,61],[11,54],[12,53],[41,53],[15,53],[4,49],[29,43],[13,46],[4,42],[7,62],[11,65],[13,53],[33,66],[1,49],[5,59],[17,43],[1,48],[0,41],[0,69],[33,52],[5,53],[11,47],[4,49],[0,49],[5,53],[12,44],[6,46],[0,48],[7,41],[18,45],[11,56],[18,64],[20,55],[0,43],[9,64],[4,50],[14,38],[0,59],[9,51],[12,55],[2,56],[8,57],[5,57],[40,42],[9,40],[29,43],[1,45],[12,50],[8,45],[1,59],[3,48],[5,46],[3,62],[10,46],[27,61],[17,48],[7,50],[8,45],[1,53],[1,55],[5,56],[1,45],[3,53],[1,47],[1,50],[16,50],[10,55],[0,63],[2,60],[14,40],[24,57],[2,47],[4,53],[25,45],[5,52],[7,54],[10,50],[0,49],[7,47],[7,40],[42,37],[67,59],[12,57],[3,48],[15,49],[4,148],[3,44],[4,53],[16,42],[1,51],[0,65],[1,44],[1,54],[12,61],[3,56],[5,54],[12,56],[9,58],[23,52],[14,47],[5,61],[14,50],[29,52],[11,49],[33,45],[13,53],[0,58],[3,50],[5,40],[4,45],[7,53],[8,50],[8,59],[26,64],[6,51],[10,51],[0,55],[4,53],[58,55],[6,47],[5,51],[10,57],[1,52],[20,40],[10,40],[7,56],[10,55],[4,57],[11,53],[5,52],[0,60],[2,60],[23,40],[23,63],[9,48],[1,63],[30,64],[0,55],[17,56],[1,59],[6,60],[17,48],[14,59],[9,39],[2,68],[10,42],[3,60],[14,44],[26,59],[3,50],[50,49],[7,51],[0,51],[37,56],[25,59],[21,58],[22,54],[28,50],[21,48],[25,61],[20,49],[3,44],[6,56],[16,62],[67,55],[26,52],[43,57],[5,55],[5,42],[1,62],[0,46],[2,56],[40,53],[44,68],[48,77],[30,73],[15,52],[8,54],[14,55],[24,41],[9,57],[40,59],[4,64],[3,78],[43,55],[60,54],[5,46],[1,42],[2,55],[29,47],[35,52],[29,64],[3,66],[7,66],[12,46],[8,111],[13,54],[22,60],[16,58],[34,70],[9,92],[29,64],[3,58],[27,52],[6,60],[40,45],[1,60],[2,50],[16,42],[30,62],[5,69],[8,63],[23,59],[8,49],[7,58],[10,74],[8,44],[9,60],[0,57],[25,74],[4,56],[16,69],[29,41],[17,51],[18,55],[11,59],[31,52],[1,66],[9,56],[5,67],[37,67],[50,61],[5,59],[6,58],[32,43],[18,53],[0,53],[11,50],[2,56],[34,48],[12,63],[8,51],[3,55],[53,64],[61,57],[0,51],[17,61],[19,51],[1,61],[5,43],[48,53],[18,58],[35,47],[122,55],[8,64],[13,69],[22,56],[7,71],[69,57],[12,67],[5,67],[31,65],[10,46],[12,53],[17,48],[12,69],[0,54],[29,58],[20,71],[3,53],[27,57],[2,52],[39,58],[34,64],[4,58],[21,53],[17,56],[43,60],[27,61],[2,53],[21,53],[0,53],[15,65],[11,59],[3,72],[12,56],[25,54],[12,55],[1,56],[26,71],[11,55],[11,47],[18,70],[36,52],[2,42],[0,55],[23,59],[18,66],[25,53],[0,47],[8,61],[14,79],[5,59],[40,65],[13,54],[30,55],[5,48],[12,47],[11,62],[12,75],[4,52],[6,50],[21,67],[32,47],[6,52],[23,56],[1,48],[27,58],[17,66],[16,62],[30,62],[23,51],[23,64],[12,53],[38,58],[28,57],[84,38],[0,67],[6,60],[9,52],[25,52],[12,59],[1,60],[21,56],[6,50],[45,48],[20,52],[0,66],[4,72],[16,80],[9,62],[117,65],[8,64],[13,62],[63,65],[2,56],[25,50],[47,59],[54,57],[1,52],[28,70],[53,62],[7,60],[20,73],[40,65],[52,63],[6,65],[8,49],[88,64],[32,85],[23,61],[7,75],[24,61],[25,68],[67,49],[45,57],[17,48],[4,55],[14,66],[47,44],[3,69],[0,62],[14,58],[56,79],[12,52],[25,79],[19,73],[6,55],[30,68],[9,75],[86,66],[11,51],[48,58],[0,55],[42,58],[5,64],[6,60],[14,48],[1,50],[27,59],[30,49],[10,55],[10,70],[94,69],[4,54],[42,55],[41,55],[24,60],[3,61],[32,58],[15,61],[1,59],[23,61],[3,78],[19,66],[38,48],[4,49],[57,59],[6,60],[1,56],[37,71],[5,58],[100,61],[53,67],[32,49],[13,62],[30,64],[17,60],[23,71],[21,54],[3,58],[45,65],[15,57],[132,57],[7,70],[4,73],[76,55],[31,76],[0,53],[4,66],[10,52],[48,61],[14,55],[50,73],[4,67],[20,63],[10,58],[15,69],[22,64],[35,60],[32,60],[5,84],[55,58],[1,64],[13,66],[2,64],[31,69],[5,71],[5,61],[62,62],[35,50],[22,62],[37,69],[72,62],[12,60],[36,54],[2,64],[27,67],[45,69],[7,76],[30,69],[33,57],[14,53],[56,114],[68,74],[1,73],[6,71],[0,56],[59,62],[78,67],[56,61],[34,70],[21,66],[38,64],[35,59],[0,58],[59,58],[18,66],[120,68],[18,60],[29,61],[25,46],[33,60],[6,61]];
  function makeFlatLevel(stage,layout){
    const L=clamp(Math.trunc(stage)||1,1,LAST_STAGE),count=pieceCount(L);
    const published=CURVED_LAYOUTS[L-1];
    const variant=layout?.variant??published[0],mountRadius=Math.min(12,40/Math.sqrt(count));
    const radius=mountRadius*(L>=122?.65:1);
    let fragments;
    for(let attempt=0;attempt<24;attempt++){
      const seed=7919*L+104729*variant+137*attempt;
      try{
        fragments=Partitions.build(count,seed).map(raw=>{
          const centre=M.Vertices.centre(raw);
          const poly=raw.map(v=>({x:centre.x+(v.x-centre.x)*.994,y:centre.y+(v.y-centre.y)*.994}));
          const mounts=mountPair(poly,mountRadius+1,2*mountRadius+8);
          return{raw,centre,poly,mounts};
        });break;
      }catch(error){if(attempt===23)throw error;}
    }
    const holes=createSpareHoles(L),screws=[],plates=[];
    for(const f of fragments){
      const p={id:plates.length,z:0,x:f.centre.x,y:f.centre.y,angle:0,profile:'curved',
        vertices:f.poly.map(v=>({x:v.x-f.centre.x,y:v.y-f.centre.y})),mounts:[],pins:[],holeIds:[],
        state:'fixed',vx:0,vy:0,spin:0,screwRadius:radius,shaftRadius:radius*.45};
      p.w=Math.max(...p.vertices.map(v=>v.x))-Math.min(...p.vertices.map(v=>v.x));
      p.h=Math.max(...p.vertices.map(v=>v.y))-Math.min(...p.vertices.map(v=>v.y));
      p.localBounds=M.Bounds.create(p.vertices);plates.push(p);
      for(const point of f.mounts){
        const h={id:holes.length,x:point.x,y:point.y,owner:p.id,screw:screws.length};holes.push(h);
        p.mounts.push({x:h.x-p.x,y:h.y-p.y});p.holeIds.push(h.id);p.pins.push({hole:h.id,mount:p.mounts.length-1});
        screws.push({id:screws.length,hole:h,startHole:h.id});
      }
    }
    const ordered=gravityReleaseOrder(plates);ordered.forEach((p,i)=>{p.z=plates.length-i;});
    const level={stage:L,theme:(L-1)%6,shape:'곡선 철판',screwRadius:radius,interlocked:true,
      silhouette:[[{x:32,y:151},{x:328,y:151},{x:328,y:481},{x:32,y:481}]],plates,holes,screws,
      order:ordered.flatMap(p=>p.holeIds.slice().sort((a,b)=>holes[b].y-holes[a].y).map(id=>holes[id].screw)),
      requiredMoves:published[1]};
    if(L>=122){level.challengeMoves=published[1];level.parkingClearance=.7;}
    return level;
  }
  // A screw can leave its plate only if there is a different usable parking
  // hole. Falling metal may uncover an empty slot, so preview that motion in
  // an independent rigid-body world without changing the real player's board.
  function canMoveToSpare(level,screw){
    if(!canUnscrew(level,screw))return false;
    const vacancies=level.holes.filter(h=>h!==screw.hole&&h.screw===null);
    if(!vacancies.length)return false;
    if(vacancies.some(h=>canSeatScrew(level,h,screw)))return true;
    const trial={...level,holes:level.holes.map(h=>({...h})),plates:level.plates.map(p=>({...p,pins:p.pins.map(pin=>({...pin}))}))};
    trial.screws=level.screws.map(s=>({...s,hole:s.hole?trial.holes[s.hole.id]:null}));
    const preview=createPhysics(trial),lifted=trial.screws[screw.id];
    try{
      if(!preview.lift(lifted))return false;
      for(let t=0;t<150;t++){
        preview.step(.05);
        if(t%3===0&&vacancies.some(h=>canSeatScrew(trial,trial.holes[h.id],lifted)))return true;
      }
      return false;
    }finally{preview.destroy();}
  }
  function createPhysics(level){
    const engine=M.Engine.create({positionIterations:12,velocityIterations:8,constraintIterations:8,enableSleeping:false});
    engine.gravity.y=1;engine.gravity.scale=.001;
    const bodies=new Map(),joints=new Map(),screwBodies=new Map();let accumulator=0,dead=false;
    function refreshScrews(){
      for(const s of level.screws){
        let body=screwBodies.get(s.id);
        if(!s.hole){if(body){M.Composite.remove(engine.world,body);screwBodies.delete(s.id);}continue;}
        if(!body){
          body=M.Bodies.circle(s.hole.x,s.hole.y,screwRadius(level,s.hole),{label:'screw-'+s.id,isStatic:true,friction:.5,frictionStatic:.8,restitution:.02,slop:.025,collisionFilter:{category:1,mask:2}});
          screwBodies.set(s.id,body);M.Composite.add(engine.world,body);
        }
        M.Body.setPosition(body,{x:s.hole.x,y:s.hole.y});
        const currentRadius=screwRadius(level,s.hole);
        if(Math.abs(body.circleRadius-currentRadius)>.001)M.Body.scale(body,currentRadius/body.circleRadius,currentRadius/body.circleRadius);
        // Every visible head is solid, including a screw parked on the board.
        // Only the plate actually pinned by this screw excludes that contact.
        const attached=level.plates.filter(p=>p.state!=='gone'&&p.pins.some(pin=>pin.hole===s.hole.id));
        body.collisionFilter.mask=2;
        body.collisionFilter[PINNED_BODIES]=new Set(attached.map(p=>bodies.get(p.id)?.id).filter(id=>id!==undefined));
      }
    }
    function sync(p){const b=bodies.get(p.id);p.x=b.position.x;p.y=b.position.y;p.angle=b.angle;p.vx=M.Body.getVelocity(b).x;p.vy=M.Body.getVelocity(b).y;p.spin=M.Body.getAngularVelocity(b);}
    function refreshPins(p){
      const b=bodies.get(p.id);if(!b)return;
      for(const c of joints.get(p.id)||[])M.Composite.remove(engine.world,c);joints.set(p.id,[]);
      // A remaining screw is a real pivot, including on advanced stages.
      // The plate may swing into other metal instead of being frozen in place.
      const fixed=p.pins.length>=2;M.Body.setStatic(b,fixed);
      p.state=p.pins.length>=2?'fixed':p.pins.length?'hinged':'loose';
      // Released plates collide with the remaining screws and fixed plates.
      // The contact can leave a badly released plate physically jammed.
      if(fixed){M.Body.setVelocity(b,{x:0,y:0});M.Body.setAngularVelocity(b,0);}
      else if(p.pins.length===1){
        const pin=p.pins[0],hole=level.holes[pin.hole],q=worldPoint(p,p.mounts[pin.mount]);
        const c=M.Constraint.create({pointA:{x:hole.x,y:hole.y},bodyB:b,pointB:{x:q.x-p.x,y:q.y-p.y},length:0,stiffness:1,damping:.12});
        joints.set(p.id,[c]);M.Composite.add(engine.world,c);
      }
    }
    for(const p of level.plates)if(p.state!=='gone'){
      const b=M.Bodies.fromVertices(p.x,p.y,[p.vertices],{label:'metal-'+p.id,friction:.45,frictionStatic:.7,frictionAir:.012,restitution:.04,density:.002,slop:.025,collisionFilter:{category:2,mask:3}},true,false,0,false);
      M.Body.setAngle(b,p.angle);M.Body.setVelocity(b,{x:p.vx||0,y:p.vy||0});M.Body.setAngularVelocity(b,p.spin||0);
      b.collisionFilter[BODY_ID]=b.id;bodies.set(p.id,b);M.Composite.add(engine.world,b);refreshPins(p);
    }
    refreshScrews();
    function lift(screw){
      if(dead||level.screws.some(s=>!s.hole)||!canUnscrew(level,screw))return false;
      const from=screw.hole;screw.heldFrom=from.id;from.screw=null;screw.hole=null;
      for(const p of level.plates)if(p.state!=='gone'&&p.pins.some(pin=>pin.hole===from.id)){
        p.pins=p.pins.filter(pin=>pin.hole!==from.id);refreshPins(p);
      }
      refreshScrews();return true;
    }
    function move(screw,to){
      if(dead||(screw.hole&&(level.screws.some(s=>!s.hole)||!canUnscrew(level,screw)))||!canSeatScrew(level,to,screw))return false;
      const from=screw.hole,changed=new Set();
      for(const p of level.plates)if(p.state!=='gone'){
        if(from&&p.pins.some(pin=>pin.hole===from.id)){p.pins=p.pins.filter(pin=>pin.hole!==from.id);changed.add(p);}
        const mount=alignedMount(p,to);if(mount>=0&&!p.pins.some(pin=>pin.mount===mount)){p.pins.push({hole:to.id,mount});changed.add(p);}
      }
      if(from)from.screw=null;to.screw=screw.id;screw.hole=to;delete screw.heldFrom;
      for(const p of changed)refreshPins(p);
      refreshScrews();
      return true;
    }
    function step(seconds){
      if(dead)return[];accumulator+=clamp(seconds,0,.05)*1000;const gone=[];
      while(accumulator+1e-8>=STEP){
        const hinges=level.plates.filter(p=>p.state==='hinged').map(p=>{
          const b=bodies.get(p.id);return{p,b,x:b.position.x,y:b.position.y,angle:b.angle};
        });
        M.Engine.update(engine,STEP);accumulator-=STEP;
        // Concave contacts can over-correct a joint in one solver step. A fixed
        // screw is a hard pivot: stop at the last valid pose instead of allowing
        // a collision impulse to tear the plate away from the visible fastener.
        for(const old of hinges){
          const {p,b}=old,pin=p.pins[0],hole=level.holes[pin.hole],mount=p.mounts[pin.mount];
          const co=Math.cos(b.angle),si=Math.sin(b.angle);
          if(Math.hypot(b.position.x+mount.x*co-mount.y*si-hole.x,b.position.y+mount.x*si+mount.y*co-hole.y)<=1.5)continue;
          M.Body.setPosition(b,{x:old.x,y:old.y});M.Body.setAngle(b,old.angle);
          M.Body.setVelocity(b,{x:0,y:0});M.Body.setAngularVelocity(b,0);
          Object.assign(b.constraintImpulse,{x:0,y:0,angle:0});Object.assign(b.positionImpulse,{x:0,y:0});
          const c=joints.get(p.id)[0],cos=Math.cos(old.angle),sin=Math.sin(old.angle);
          c.pointB={x:mount.x*cos-mount.y*sin,y:mount.x*sin+mount.y*cos};c.angleB=old.angle;
        }
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
    return{step,lift,move,destroy,refreshScrews,engine,bodies,screwBodies};
  }
  const api={replayVersion:'curved-partitions-v1',BOARD,SCREW_RADIUS,LAST_STAGE,SHAPE_NAMES,makeFlatLevel,createPhysics,spareHoleCount,layoutSpareHoles,canUnscrew,canAccessHole,canSeatScrew,canMoveToSpare,bareHole,plateCovers,screwPoint,screwDepth,screwRadius,worldPoint,alignedMount,polygonDistance};
  if(typeof window!=='undefined')window.OjjudaFlatPhysics=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
