/*
 * A shared sculpted surface for detachable screw-box bricks.
 *
 * The puzzle keeps its original fasteners and exact physical collision mesh.
 * Each physical brick owns a closed solid clipped to its own cell. The
 * complete model keeps a curved silhouette, while exposed cuts and falling
 * pieces retain the very same opaque volume and surface-mounted fasteners.
 */
const __sculpted = (() => {
const TETS = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6],
  [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
const CORNERS = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],
  [0,0,1],[1,0,1],[1,1,1],[0,1,1]];
const DIRECTIONS = [[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]];
const ANIMALS = new Set(['토끼','돼지','소','펭귄','수박']);
const quadrupeds = new Set(['토끼','돼지','소']);
const sq = x => x*x;
const clamp = (x,a,b) => Math.min(b,Math.max(a,x));
const length = v => Math.hypot(v[0],v[1],v[2]);
const minus = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const plus = (a,b) => a.map((v,i)=>v+b[i]);
const times = (v,k) => v.map(x=>x*k);
const unit = v => { const d=length(v)||1;return times(v,1/d); };
const smoothMin = (a,b,k) => {
  if(k<=0)return Math.min(a,b);
  const h=Math.max(k-Math.abs(a-b),0)/k;
  return Math.min(a,b)-h*h*k*.25;
};
function roundedBox(p,c,half,r) {
  const q=[0,1,2].map(i=>Math.abs(p[i]-c[i])-half+r);
  return Math.hypot(Math.max(q[0],0),Math.max(q[1],0),Math.max(q[2],0))
    +Math.min(Math.max(...q),0)-r;
}
function ellipsoid(p,c,r) {
  const q=[0,1,2].map(i=>(p[i]-c[i])/Math.max(.001,r[i]));
  return (length(q)-1)*Math.min(...r);
}

// Shape the complete animal as a single plump body, rather than a row of
// independently rounded blocks. The shape is intersected with the original
// removable-volume union, so no decorative skin can become an invisible wall.
function figureEnvelope(name, els, step) {
  if(!ANIMALS.has(name))return null;
  const lo=[0,1,2].map(i=>Math.min(...els.map(e=>e.c[i])));
  const hi=[0,1,2].map(i=>Math.max(...els.map(e=>e.c[i])));
  const span=[0,1,2].map(i=>hi[i]-lo[i]), mid=[0,1,2].map(i=>(lo[i]+hi[i])*.5);
  const shapes=[],bridges=[];
  // Give the figure a fuller, soft-toy silhouette.  The screw heads retain
  // their original dimensions, so they read as small hardware on a big toy.
  const add=(c,r)=>shapes.push({c,r:r.map(v=>v*1.12)});
  const connect=(a,b,r0,r1)=>{
    const v=minus(b,a);
    bridges.push({a,v,inv:1/(dot(v,v)||1),r0,r1});
  };
  if(name==='수박') {
    add(mid,span.map(v=>v*.5+step*.34));
  } else if(name==='펭귄') {
    add([mid[0],lo[1]+span[1]*.42,mid[2]],
      [span[0]*.51+step*.2,span[1]*.46+step*.21,span[2]*.51+step*.28]);
    add([mid[0],hi[1]-span[1]*.16,mid[2]],
      [span[0]*.31+step*.23,span[1]*.20+step*.20,span[2]*.48+step*.17]);
    for(const side of [-1,1])add([mid[0]+side*span[0]*.44,lo[1]+span[1]*.46,mid[2]],
      [step*.39,span[1]*.25+step*.08,span[2]*.35+step*.12]);
    for(const side of [-1,1])add([mid[0]+side*span[0]*.20,lo[1],hi[2]],
      [step*.53,step*.32,step*.52]);
  } else if(quadrupeds.has(name)) {
    const bodyEnd=hi[0]-step*.88;
    const bodyLength=Math.max(step,bodyEnd-lo[0]);
    const bodyCenter=[lo[0]+bodyLength*.51,lo[1]+span[1]*.50,mid[2]];
    add(bodyCenter,
      [bodyLength*.54+step*.30,span[1]*.41+step*.16,span[2]*.53+step*.34]);
    // A large round head overlaps the neck and reaches the roots of the
    // ears/horns. The original fastening cells stay exactly where they are.
    add([hi[0]-step*.53,hi[1]-step*.32,mid[2]],
      [step*1.15,step*1.15,span[2]*.55+step*.35]);
    for(const x of [lo[0]+step*.16,bodyEnd-step*.22])
      for(const z of [lo[2],hi[2]]){
        const foot=[x,lo[1]+step*.14,z];
        add(foot,[step*.53,step*.84,step*.50]);
        // Large animals used to have disconnected paws: the oval belly
        // narrows at its corners while the real fastening cells stay at the
        // outer edge. A tapered soft leg joins each paw to a point *inside*
        // the body without moving a single physical cube or screw.
        const root=[x*.55+bodyCenter[0]*.45,
          lo[1]+span[1]*.36,z*.55+mid[2]*.45];
        connect(foot,root,step*.72,step*.98);
      }
  }
  return p=>{
    let d=Infinity;
    for(const s of shapes)d=smoothMin(d,ellipsoid(p,s.c,s.r),step*.25);
    for(const b of bridges){
      const q=minus(p,b.a),t=clamp(dot(q,b.v)*b.inv,0,1);
      d=smoothMin(d,length(minus(q,times(b.v,t)))-(b.r0+(b.r1-b.r0)*t),step*.25);
    }
    return d;
  };
}

// Sculpt an entire animal before dividing the continuous curved surface
// among its real removable pieces. Individual cell clipping would leave
// unsightly holes at the head, paws and haunches.
function continuousFigure(els,field,step,spacing,paintAt) {
  const min=[0,1,2].map(i=>Math.min(...els.map(e=>e.c[i]))-step*1.65);
  const max=[0,1,2].map(i=>Math.max(...els.map(e=>e.c[i]))+step*1.65);
  const count=[0,1,2].map(i=>Math.ceil((max[i]-min[i])/spacing));
  const id=(x,y,z)=>(z*(count[1]+1)+y)*(count[0]+1)+x;
  const values=[];
  for(let z=0;z<=count[2];z++)for(let y=0;y<=count[1];y++)for(let x=0;x<=count[0];x++){
    const p=[min[0]+x*spacing,min[1]+y*spacing,min[2]+z*spacing];
    values.push({p,f:field(p)});
  }
  const meshes=new Map(els.map(E=>[E,{verts:[],faces:[],seen:new Map()}]));
  const owner=p=>{
    let best=els[0],d=Infinity;
    for(const E of els){
      const q=minus(E.c,p),dist=dot(q,q);
      if(dist<d){best=E;d=dist;}
    }
    return best;
  };
  const addTriangle=(pa,pb,pc,outward)=>{
    [pa,pb,pc]=[pa,pb,pc].map(p=>p.map(v=>Math.round(v*1e9)/1e9));
    let n=cross(minus(pb,pa),minus(pc,pa)),mag=length(n);
    if(mag<1e-9)return;
    if(dot(n,outward)<0)[pb,pc]=[pc,pb],n=n.map(v=>-v);
    const center=[0,1,2].map(i=>(pa[i]+pb[i]+pc[i])/3),E=owner(center),m=meshes.get(E);
    const vertex=p=>{
      const local=minus(p,E.c),key=local.map(v=>v.toFixed(10)).join(',');
      if(m.seen.has(key))return m.seen.get(key);
      const i=m.verts.length;m.verts.push(local);m.seen.set(key,i);return i;
    };
    m.faces.push({idx:[vertex(pa),vertex(pb),vertex(pc)],n:n.map(v=>v/mag),paint:paintAt?.(center)||E.color});
  };
  const interp=(a,b)=>{
    const t=clamp(a.f/(a.f-b.f||1),0,1);
    return a.p.map((v,i)=>v+(b.p[i]-v)*t);
  };
  for(let z=0;z<count[2];z++)for(let y=0;y<count[1];y++)for(let x=0;x<count[0];x++){
    const c=CORNERS.map(([dx,dy,dz])=>values[id(x+dx,y+dy,z+dz)]);
    for(const tet of TETS){
      const inside=tet.map(i=>c[i]).filter(v=>v.f<=0),outside=tet.map(i=>c[i]).filter(v=>v.f>0);
      if(!inside.length||!outside.length)continue;
      const average=arr=>[0,1,2].map(i=>arr.reduce((sum,v)=>sum+v.p[i],0)/arr.length);
      const outward=minus(average(outside),average(inside));
      if(inside.length===1) {
        const p=outside.map(q=>interp(inside[0],q));
        addTriangle(p[0],p[1],p[2],outward);
      }else if(outside.length===1) {
        const p=inside.map(q=>interp(outside[0],q));
        addTriangle(p[0],p[1],p[2],outward);
      }else{
        const a=interp(inside[0],outside[0]),b=interp(inside[0],outside[1]);
        const d=interp(inside[1],outside[0]),e=interp(inside[1],outside[1]);
        addTriangle(a,b,d,outward);addTriangle(b,e,d,outward);
      }
    }
  }
  const result=new Map();
  for(const [E,m] of meshes){
    const size=[step*.5,step*.5,step*.5];
    for(const v of m.verts)for(let i=0;i<3;i++)size[i]=Math.max(size[i],Math.abs(v[i]));
    result.set(E,{verts:m.verts,faces:m.faces,half:size,soft:true,sculpted:true});
  }
  return result;
}

function animalPaint(name,els,step) {
  const lo=[0,1,2].map(i=>Math.min(...els.map(e=>e.c[i])));
  const hi=[0,1,2].map(i=>Math.max(...els.map(e=>e.c[i])));
  const mid=[0,1,2].map(i=>(lo[i]+hi[i])*.5);
  const span=[0,1,2].map(i=>Math.max(step,hi[i]-lo[i]));
  if(name==='토끼')return p=>p[1]<lo[1]+step*.45?'#EFE5D9':'#FFF9F0';
  if(name==='돼지')return p=>p[1]<lo[1]+step*.55?'#EBA8B9':'#F3B7C5';
  if(name==='소')return p=>{
    const x=(p[0]-lo[0])/span[0],y=(p[1]-lo[1])/span[1],z=(p[2]-mid[2])/span[2];
    const spot=(sq((x-.34)/.14)+sq((y-.52)/.24)+sq((z-.30)/.65)<1.2)
      ||(sq((x-.65)/.15)+sq((y-.68)/.19)+sq((z+.40)/.5)<1.0);
    return spot?'#464B55':'#F7F5EC';
  };
  if(name==='펭귄')return p=>{
    const front=p[2]>mid[2]+span[2]*.25,belly=p[1]<hi[1]-span[1]*.22;
    return front&&belly?'#F4F5F2':'#334654';
  };
  if(name==='수박')return p=>{
    const r=Math.hypot(p[1]-mid[1],p[2]-mid[2]),end=p[0]>hi[0]-step*.28;
    if(end&&r<span[1]*.40)return '#EC6B79';
    if(end)return '#F0E7BD';
    const az=Math.atan2(p[2]-mid[2],p[0]-mid[0]);
    return Math.sin(az*9)>0?'#2B8855':'#56AD70';
  };
  return ()=>null;
}

// Divide the whole figure into closed nearest-cell volumes. Assigning only
// outside triangles leaves paper-thin scraps; each cell needs its own hull.
function closeSkinFragments(els,meshes,paintAt,field) {
  const key=p=>p.map(v=>Math.round(v*1e8)).join(',');
  const whole=[];
  for(const [E,m] of meshes)for(const f of m.faces)
    whole.push(f.idx.map(i=>plus(m.verts[i],E.c)));
  const lo=[0,1,2].map(i=>Math.min(...whole.flatMap(f=>f.map(p=>p[i])))-1);
  const hi=[0,1,2].map(i=>Math.max(...whole.flatMap(f=>f.map(p=>p[i])))+1);
  const corners=CORNERS.map(p=>p.map((v,i)=>v?hi[i]:lo[i]));
  const clip=(p,n,center)=>{
    const out=[];
    for(let i=0;i<p.length;i++){
      const a=p[i],b=p[(i+1)%p.length];
      let da=dot(minus(a,center),n),db=dot(minus(b,center),n);
      if(Math.abs(da)<1e-9)da=0;if(Math.abs(db)<1e-9)db=0;
      if(da<=0)out.push(a);
      if((da<=0)!==(db<=0))out.push(plus(a,times(minus(b,a),da/(da-db))));
    }
    return [...new Map(out.map(p=>[key(p),p])).values()];
  };
  const cellRegion=E=>{
    let region=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]]
      .map(idx=>({p:idx.map(i=>corners[i])}));
    const neighbors=els.filter(F=>F!==E).sort((a,b)=>length(minus(a.c,E.c))-length(minus(b.c,E.c)));
    for(const F of neighbors){
      const n=unit(minus(F.c,E.c)),center=times(plus(E.c,F.c),.5);
      if(region.every(f=>f.p.every(p=>dot(minus(p,center),n)<=1e-8)))continue;
      const next=[],rim=new Map();
      for(const f of region){
        const p=clip(f.p,n,center);
        for(const q of p)if(Math.abs(dot(minus(q,center),n))<1e-8)rim.set(key(q),q);
        if(p.length>=3)next.push({...f,p});
      }
      const p=[...rim.values()];
      if(p.length>=3){
        const mid=times(p.reduce(plus,[0,0,0]),1/p.length);
        const u=unit(cross(n,Math.abs(n[0])<.8?[1,0,0]:[0,1,0])),v=cross(n,u);
        p.sort((a,b)=>Math.atan2(dot(minus(a,mid),v),dot(minus(a,mid),u))-Math.atan2(dot(minus(b,mid),v),dot(minus(b,mid),u)));
        if(length(p.reduce((sum,q,i)=>plus(sum,cross(q,p[(i+1)%p.length])),[0,0,0]))>1e-9)
          next.push({p,n,center,neighbor:F});
      }
      region=next;
    }
    return region;
  };
  // Build a closed convex volume from the actual surface points in one cell.
  // Unlike a triangle-soup cap, every hull edge has exactly two oppositely
  // wound faces. The hull stays inside all shared cell half-spaces, so pieces
  // never overlap or borrow a neighbour's skin.
  const hull=(input,E,planes)=>{
    const snapped=input.map(p=>p.map((v,i)=>E.c[i]+Math.round((v-E.c[i])*1e6)/1e6));
    const points=[...new Map(snapped.map(p=>[key(p),p])).values()]
      .sort((a,b)=>dot(minus(b,E.c),minus(b,E.c))-dot(minus(a,E.c),minus(a,E.c)));
    const ints=points.map(p=>p.map((v,i)=>Math.round((v-E.c[i])*1e6)));
    const orientation=(a,b,c,d)=>{
      const u=minus(ints[b],ints[a]),v=minus(ints[c],ints[a]),w=minus(ints[d],ints[a]);
      const terms=[u[0]*v[1]*w[2],u[1]*v[2]*w[0],u[2]*v[0]*w[1],
        -u[2]*v[1]*w[0],-u[1]*v[0]*w[2],-u[0]*v[2]*w[1]];
      const det=terms.reduce((a,b)=>a+b,0),error=terms.reduce((a,b)=>a+Math.abs(b),0)*1e-13;
      if(Math.abs(det)>error)return Math.sign(det);
      // Only the nearly coplanar case needs exact integer arithmetic. A
      // guessed epsilon can reverse a horizon edge and open a solid hull.
      const U=u.map(BigInt),V=v.map(BigInt),W=w.map(BigInt);
      const exact=U[0]*(V[1]*W[2]-V[2]*W[1])-U[1]*(V[0]*W[2]-V[2]*W[0])+U[2]*(V[0]*W[1]-V[1]*W[0]);
      return exact>0n?1:exact<0n?-1:0;
    };
    let a=0,b=0,c=0,d=0;
    for(let i=1;i<points.length;i++)if(points[i][0]<points[a][0])a=i;
    for(let i=0;i<points.length;i++)if(length(minus(points[i],points[a]))>length(minus(points[b],points[a])))b=i;
    const ab=minus(points[b],points[a]);
    for(let i=0;i<points.length;i++)if(length(cross(ab,minus(points[i],points[a])))>length(cross(ab,minus(points[c],points[a]))))c=i;
    const n=unit(cross(ab,minus(points[c],points[a])));
    for(let i=0;i<points.length;i++)if(Math.abs(dot(n,minus(points[i],points[a])))>Math.abs(dot(n,minus(points[d],points[a]))))d=i;
    const inner=times([a,b,c,d].map(i=>points[i]).reduce(plus,[0,0,0]),.25);
    const face=(a,b,c,orient=true)=>{
      let n=unit(cross(minus(points[b],points[a]),minus(points[c],points[a])));
      if(orient&&dot(n,minus(inner,points[a]))>0){[b,c]=[c,b];n=times(n,-1);}
      return {idx:[a,b,c],n};
    };
    let faces=[face(a,b,c),face(a,d,b),face(a,c,d),face(b,d,c)];
    const initial=new Set([a,b,c,d]);
    for(let i=0;i<points.length;i++){
      if(initial.has(i))continue;
      const visible=new Set(faces.filter(f=>orientation(...f.idx,i)>0));
      if(!visible.size)continue;
      const rim=new Map();
      for(const f of visible)for(let j=0;j<3;j++){
        const a=f.idx[j],b=f.idx[(j+1)%3],reverse=b+','+a;
        if(rim.has(reverse))rim.delete(reverse);else rim.set(a+','+b,[a,b]);
      }
      const added=[...rim.values()].map(([a,b])=>face(a,b,i,false));
      faces=faces.filter(f=>!visible.has(f));faces.push(...added);
    }
    const used=[...new Set(faces.flatMap(f=>f.idx))],indices=new Map(used.map((id,i)=>[id,i]));
    const verts=used.map(i=>minus(points[i],E.c));
    faces=faces.map(f=>{
      const p=f.idx.map(i=>points[i]),center=times(p.reduce(plus,[0,0,0]),1/3);
      const boundary=planes.find(q=>p.every(v=>Math.abs(dot(minus(v,q.center),q.n))<2e-6));
      return {idx:f.idx.map(i=>indices.get(i)),n:f.n,paint:paintAt?.(center)||E.color,boundary:boundary?.neighbor};
    });
    return {verts,faces,half:[0,1,2].map(i=>Math.max(.001,...verts.map(v=>Math.abs(v[i])))),
      soft:true,sculpted:true,closed:true};
  };
  const result=new Map();
  for(const E of els){
    const region=cellRegion(E),planes=region.filter(f=>f.neighbor),points=[];
    for(const triangle of whole){
      let p=triangle;
      for(const plane of planes){p=clip(p,plane.n,plane.center);if(!p.length)break;}
      points.push(...p);
    }
    // Interior cells have no outside-shell triangles. Their shared cell
    // corners are the real solid volume, not an empty decorative fragment.
    for(const f of region)for(const p of f.p)if(field(p)<=1e-8)points.push(p);
    result.set(E,hull(points,E,planes));
  }
  return result;
}

// A fastener belongs to its own retained piece, not to an analytic surface
// of the complete toy (which can differ from its coarse rendered triangles).
function attachToMesh(E,s,interior=false,taken=[]) {
  const geom=E.skinFastGeom;if(!geom?.faces.length)return null;
  let best=null;
  for(let i=0;i<geom.faces.length;i++){
    const f=geom.faces[i],n=f.n,slope=dot(n,s.a);if((f.boundary&&!interior)||slope<.05)continue;
    const p=f.idx.map(j=>plus(geom.verts[j],E.c)),t=dot(n,minus(p[0],s.p))/slope;
    const q=plus(s.p,times(s.a,t));
    if(p.some((a,j)=>dot(cross(minus(p[(j+1)%3],a),minus(q,a)),n)<-1e-8))continue;
    if(!best||t>best.t)best={p:q,a:n,t,face:i};
  }
  // A cell-axis ray can hit a neighbouring cell cut instead of the outer
  // curve. Mounting there makes two legal screws face into one another.
  // Find a real exterior triangle of THIS piece, never a neighbour's skin.
  if(!best){
    let score=Infinity;
    for(let i=0;i<geom.faces.length;i++){
      const f=geom.faces[i];if(f.boundary)continue;
      const p=f.idx.map(j=>plus(geom.verts[j],E.c)),n=f.n;
      let q=minus(s.p,times(n,dot(n,minus(s.p,p[0]))));
      if(p.some((a,j)=>dot(cross(minus(p[(j+1)%3],a),minus(q,a)),n)<-1e-8)){
        let distance=Infinity;
        for(let j=0;j<3;j++){
          const a=p[j],v=minus(p[(j+1)%3],a),d=dot(v,v);
          const point=plus(a,times(v,d?clamp(dot(minus(s.p,a),v)/d,0,1):0));
          const gap=length(minus(point,s.p));if(gap<distance){distance=gap;q=point;}
        }
      }
      const cost=length(minus(q,s.p))+.08*(1-dot(n,s.a));
      if(cost<score){score=cost;best={p:q,a:n,face:i};}
    }
  }
  if(!best)return null;
  const head=p=>plus(p.p,times(p.a,.035));
  const clearance=p=>taken.length?Math.min(...taken.map(q=>length(minus(head(p),head(q))))):Infinity;
  if(clearance(best)<.106){
    let candidate=null,score=Infinity;
    for(let i=0;i<geom.faces.length;i++){
      const f=geom.faces[i];if(f.boundary&&!interior)continue;
      const [a,b,c]=f.idx.map(j=>plus(geom.verts[j],E.c));
      for(let u=0;u<=8;u++)for(let v=0;v<=8-u;v++){
        const p=plus(a,plus(times(minus(b,a),u/8),times(minus(c,a),v/8)));
        const q={p,a:f.n,face:i};if(clearance(q)<.106)continue;
        const cost=length(minus(p,s.p))+.12*length(minus(p,best.p))+.08*(1-dot(f.n,s.a));
        if(cost<score){score=cost;candidate=q;}
      }
    }
    if(candidate)best=candidate;
  }
  taken.push(best);
  return {p:plus(best.p,times(best.a,.006)),a:best.a,owner:E,face:best.face,
    gap:length(minus(best.p,s.p)),surfaceError:0,surfaceKind:'mesh',interior};
}


function spaceMeshFasteners(E,screws) {
  const distance=(a,b)=>length(minus(plus(a.p,times(a.a,.035)),plus(b.p,times(b.a,.035))));
  const current=screws.map(s=>({p:minus(s.skinMount.p,times(s.skinMount.a,.006)),a:s.skinMount.a,face:s.skinMount.face}));
  if(current.every((a,i)=>current.every((b,j)=>j<=i||distance(a,b)>=.106)))return;
  const choices=[];
  for(let face=0;face<E.skinGeom.faces.length;face++){
    const f=E.skinGeom.faces[face],[a,b,c]=f.idx.map(i=>plus(E.c,E.skinGeom.verts[i]));
    for(let u=0;u<=10;u++)for(let v=0;v<=10-u;v++)choices.push({
      p:plus(a,plus(times(minus(b,a),u/10),times(minus(c,a),v/10))),a:f.n,face,boundary:!!f.boundary});
  }
  const unique=[...new Map(choices.map(p=>[[...p.p.map(v=>Math.round(v*1e7)),...p.a.map(v=>Math.round(v*1e4)),p.boundary].join(','),p])).values()];
  const order=screws.map((s,i)=>({s,i,options:[current[i],...unique.filter(p=>s.skinMount.interior||!p.boundary)]
    .map(p=>({p,cost:length(minus(p.p,s.p))+.08*(1-dot(p.a,s.a))+.08*length(minus(p.p,current[i].p))}))
    .sort((a,b)=>a.cost-b.cost).map(p=>p.p)}))
    .sort((a,b)=>Number(a.s.skinMount.interior)-Number(b.s.skinMount.interior)||a.options.length-b.options.length);
  // A later fastener can need a little space where an earlier one was placed.
  // Repack that small group together, choosing the closest real surface seats;
  // never move a logical screw, use a neighbour's part, or float a head.
  for(const spacing of [.106,.086,.066,.046])for(const limit of [120,500]){
    const placed=[];let visits=0;
    const search=index=>{
      if(index===order.length)return true;
      if(++visits>20000)return false;
      for(const p of order[index].options.slice(0,limit)){
        if(placed.some(q=>distance(p,q)<spacing))continue;
        placed.push(p);if(search(index+1))return true;placed.pop();
      }
      return false;
    };
    if(search(0)){
      order.forEach(({s},i)=>{const p=placed[i];Object.assign(s.skinMount,{
        p:plus(p.p,times(p.a,.006)),a:p.a,face:p.face,gap:length(minus(p.p,s.p)),
        drawScale:Math.min(1,(spacing-.004)/.102)});});
      return;
    }
  }
}

function applySculptedSkins(M,step) {
  const groups=new Map();
  for(const E of M.els)if(E.cell&&E.geom?.soft&&!E.parts){
    const role=E.skinRole||'subject';
    if(!groups.has(role))groups.set(role,[]);
    groups.get(role).push(E);
  }
  for(const [role,els] of groups){
    const origin=els[0].c;
    const pos=c=>[0,1,2].map(i=>Math.round((c[i]-origin[i])/step));
    const key=v=>v.join(',');
    const cells=new Map(els.map(E=>[key(pos(E.c)),E]));
    const organic=role!=='pedestal'&&ANIMALS.has(M.name);
    const rad=step*(organic?.40:.28),blend=step*(organic?.30:.22);
    const half=step*.5+step*.052;
    const envelope=organic?figureEnvelope(M.name,els,step):null;
    const paint=organic?animalPaint(M.name,els,step):null;
    const sample=p=>{
      const near=pos(p);let d=Infinity;
      for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
        const E=cells.get(key([near[0]+x,near[1]+y,near[2]+z]));
        if(E)d=smoothMin(d,roundedBox(p,E.c,half,rad),blend);
      }
      return d;
    };
    // Every physical cell needs a real volume, including the outer shoulder
    // cells of the largest animals. A lightly inset rounded cell union fills
    // those corners without flattening the continuous curved silhouette.
    const field=envelope?p=>smoothMin(envelope(p),sample(p)+step*.22,step*.16):sample;
    // A grid wider than one block can miss thin towers, rails and ship hulls
    // altogether. Sub-cell sampling guarantees visible geometry in every
    // disconnected one-block-wide feature, even in the fast quality tier.
    const coarse=step*(organic?(els.length<110?.64:.86):(els.length<110?.75:.90));
    const sculptedFast=closeSkinFragments(els,continuousFigure(els,field,step,coarse,paint),paint,field);
    // One mesh for every quality tier: a zoom/fast-mode switch must never
    // move the surface through an unchanged screw head.
    const sculpted=sculptedFast;
    const normalCache=new Map();
    for(const E of els){
      const p=pos(E.c);
      E.skinOriginalFaces=DIRECTIONS.map(n=>!cells.has(key(p.map((v,i)=>v+n[i]))));
      E.skinGeom=sculpted.get(E);
      E.skinFastGeom=sculptedFast.get(E);
      for(const mesh of new Set([E.skinGeom,E.skinFastGeom])){
        const h=step*.01;
        const outside=new Set(mesh.faces.filter(f=>!f.boundary).flatMap(f=>f.idx));
        mesh.normals=mesh.verts.map((v,j)=>{
          if(!outside.has(j))return [0,1,0];
          const p=plus(v,E.c),key=p.map(x=>Math.round(x*1e7)).join(',');
          if(normalCache.has(key))return normalCache.get(key);
          const n=unit([0,1,2].map(i=>{const a=p.slice(),b=p.slice();a[i]+=h;b[i]-=h;return field(a)-field(b);}));
          normalCache.set(key,n);return n;
        });
      }
      if(organic)E.material='fabric';
    }
    const seats=new Map();
    for(const s of M.screws){
      if(!cells.has(key(pos(s.into?.c||[Infinity,Infinity,Infinity])))
        ||s.thru?.kind!=='plate'||s.thru?.faceFeature||s.thru?.hinge
        ||s.guard)continue;
      const E=s.into,at=pos(E.c);
      // Interior screws stay hidden between the original removable bricks.
      const blockedAxis=[0,1,2].some(i=>Math.abs(s.a[i])>.9&&cells.has(key(at.map((v,j)=>v+(j===i?Math.sign(s.a[i]):0)))));
      if(!seats.has(E))seats.set(E,[]);
      const mount=attachToMesh(E,s,blockedAxis,seats.get(E));
      if(mount)s.skinMount=mount;
    }
  }
  const seatsByOwner=new Map();
  for(const s of M.screws)if(s.skinMount?.surfaceKind==='mesh'){
    if(!seatsByOwner.has(s.into))seatsByOwner.set(s.into,[]);seatsByOwner.get(s.into).push(s);
  }
  for(const [E,screws] of seatsByOwner)spaceMeshFasteners(E,screws);
  // On cuddly animal toys the working fastening plates become tiny cloth-
  // covered buttons. The real plates, their screw paths and their collisions
  // are unchanged. Guard straps remain clearly metal and full-sized.
  if(ANIMALS.has(M.name))for(const E of M.els){
    if(E.kind!=='plate'||E.guard||E.diagonal)continue;
    E.skinPlate=true;
    E.skinPlateColor=M.name==='돼지'?'#F0AFC2':M.name==='펭귄'?'#82939A':M.name==='소'?'#E5E1D6':M.name==='수박'?'#5DA373':'#F0E7DD';
    // Decorative fasteners from the old cube model (including multi-part
    // plates) cannot sit outside the new curved body. Their physical plates
    // still exist for screw collisions and the solution order; only the old
    // detached visual geometry is suppressed.
    E.visualMountOnly=true;
  }
  // A cloth button should sit beneath each visible screw, not hang at the
  // old cubic plate location. Guard plates remain metal and keep their shape.
  for(const E of M.els){
    if(E.kind!=='plate'||E.guard||E.faceFeature||E.hinge)continue;
    const owned=M.screws.filter(s=>s.thru===E);
    if(owned.length&&owned.every(s=>s.skinMount))E.visualMountOnly=true;
  }
  for(const E of M.els)if(E.guard&&E.guardTarget?.skinMount){
    E.visualOffset=minus(E.guardTarget.skinMount.p,E.guardTarget.p);
    for(const s of M.screws)if(s.thru===E&&s.guard){
      s.skinMount={p:plus(s.p,E.visualOffset),a:s.a,gap:0};
    }
  }
  return M;
}
return {applySculptedSkins};
})();
export const applySculptedSkins = __sculpted.applySculptedSkins;
