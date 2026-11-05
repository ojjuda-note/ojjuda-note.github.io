/*
 * A shared sculpted surface for detachable screw-box bricks.
 *
 * The puzzle keeps its original fasteners and exact physical collision mesh.
 * Only the visible outside is remeshed. Each surface triangle belongs to one
 * real removable brick, so the sculpture opens as its fasteners come out.
 * Newly exposed inner faces revert to the brick's original physical mesh.
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
  const shapes=[];
  const add=(c,r)=>shapes.push({c,r});
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
    add([lo[0]+bodyLength*.51,lo[1]+span[1]*.50,mid[2]],
      [bodyLength*.54+step*.30,span[1]*.41+step*.16,span[2]*.53+step*.34]);
    // A large round head overlaps the neck and reaches the roots of the
    // ears/horns. The original fastening cells stay exactly where they are.
    add([hi[0]-step*.53,hi[1]-step*.32,mid[2]],
      [step*1.15,step*1.15,span[2]*.55+step*.35]);
    for(const x of [lo[0]+step*.16,bodyEnd-step*.22])
      for(const z of [lo[2],hi[2]])
        add([x,lo[1]+step*.14,z],
          [step*.53,step*.84,step*.50]);
  }
  return p=>{
    let d=Infinity;
    for(const s of shapes)d=smoothMin(d,ellipsoid(p,s.c,s.r),step*.25);
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
    let n=cross(minus(pb,pa),minus(pc,pa)),mag=length(n);
    if(mag<1e-9)return;
    if(dot(n,outward)<0)[pb,pc]=[pc,pb],n=n.map(v=>-v);
    const center=[0,1,2].map(i=>(pa[i]+pb[i]+pc[i])/3),E=owner(center),m=meshes.get(E);
    const vertex=p=>{
      const local=minus(p,E.c),key=local.map(v=>v.toFixed(6)).join(',');
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
    const half=step*.5-step*.015;
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
    // A grid wider than one block can miss thin towers, rails and ship hulls
    // altogether. Sub-cell sampling guarantees visible geometry in every
    // disconnected one-block-wide feature, even in the fast quality tier.
    const fine=step*(organic?.58:.66);
    const coarse=step*(organic?(els.length<110?.69:.86):.90);
    const useFastOnly=M.els.length+M.screws.length>100;
    const sculptedFast=continuousFigure(els,envelope||sample,step,coarse,paint);
    const sculpted=useFastOnly?sculptedFast:continuousFigure(els,envelope||sample,step,fine,paint);
    for(const E of els){
      const p=pos(E.c);
      E.skinOriginalFaces=DIRECTIONS.map(n=>!cells.has(key(p.map((v,i)=>v+n[i]))));
      E.skinGeom=sculpted.get(E);
      E.skinFastGeom=sculptedFast.get(E);
      if(organic)E.material='fabric';
    }
  }
  // On cuddly animal toys the working fastening plates become tiny cloth-
  // covered buttons. The real plates, their screw paths and their collisions
  // are unchanged. Guard straps remain clearly metal and full-sized.
  if(ANIMALS.has(M.name)&&M.name!=='수박')for(const E of M.els){
    if(E.kind!=='plate'||E.guard||E.diagonal||E.parts)continue;
    E.skinPlate=true;
    E.skinPlateColor=M.name==='돼지'?'#F0AFC2':M.name==='펭귄'?'#82939A':M.name==='소'?'#E5E1D6':'#F0E7DD';
  }
  return M;
}
return {applySculptedSkins};
})();
export const applySculptedSkins = __sculpted.applySculptedSkins;
