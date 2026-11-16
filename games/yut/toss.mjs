// Movement is in world coordinates. A camera fitted to the available surface
// projects the split timber, its floor support and its shadow into the same space.
const TAU = Math.PI * 2;
const groundSin = .72, groundCos = Math.sqrt(1-groundSin**2);
const length = 116, radius = 13.6, facets = 16;
const cross = Array.from({length:facets+1},(_,i)=>section(Math.PI*i/facets));
const clamp = t => Math.max(0, Math.min(1, t));
const mix = (a,b,t) => a+(b-a)*t;
const smooth = t => t*t*(3-2*t);

function section(theta) { return [radius*Math.cos(theta), radius*(.31-Math.sin(theta))]; }

function generator(seed) {
  let state=2166136261;
  for(const c of String(seed)){state^=c.charCodeAt(0);state=Math.imul(state,16777619);}
  return () => {
    state=(state+0x6d2b79f5)>>>0;
    let n=Math.imul(state^(state>>>15),1|state);
    n^=n+Math.imul(n^(n>>>7),61|n);
    return ((n^(n>>>14))>>>0)/4294967296;
  };
}

function basis(yaw,pitch,roll) {
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const cr=Math.cos(roll),sr=Math.sin(roll);
  return [[cy*cp,sy*cp,sp],[-sy*cr-cy*sp*sr,cy*cr-sy*sp*sr,cp*sr],
    [sy*sr-cy*sp*cr,-cy*sr-sy*sp*cr,cp*cr]];
}
function floorSupport(pitch,roll) {
  const cp=Math.cos(pitch),across=cp*Math.sin(roll),up=cp*Math.cos(roll);
  let lowest=Infinity;
  for(const [s,h] of cross)lowest=Math.min(lowest,s*across+h*up);
  const slope=Math.abs(Math.sin(pitch));
  const shoulder=(length/2-2.5)*slope-lowest;
  const cap=length/2*slope-(.84*lowest-.32*up);
  return Math.max(shoulder,cap);
}

function quaternion(yaw,pitch,roll) {
  const cy=Math.cos(yaw/2),sy=Math.sin(yaw/2),cp=Math.cos(pitch/2),sp=-Math.sin(pitch/2);
  const cr=Math.cos(roll/2),sr=Math.sin(roll/2);
  return [cy*cp*cr+sy*sp*sr,cy*cp*sr-sy*sp*cr,cy*sp*cr+sy*cp*sr,sy*cp*cr-cy*sp*sr];
}
function releaseSpin(r,start,direction,turns) {
  const [a,b,c,d]=start,[e,f,g,h]=quaternion(r.impactYaw,r.impactPitch,r.impactRoll);
  const delta=[a*e+b*f+c*g+d*h,a*f-b*e-c*h+d*g,a*g+b*h-c*e-d*f,a*h-b*g+c*f-d*e];
  // Choose the equivalent quaternion which keeps the seeded axial spin sense.
  const sign=Math.sign(delta[1])*direction,norm=Math.hypot(delta[1],delta[2],delta[3]);
  r.localAxis=delta.slice(1).map(v=>v*sign/norm);
  r.spin=(2*Math.atan2(norm,delta[0]*sign)+turns*TAU)/r.flight;
  r.frame=spinFrame(r);
}
function spinFrame(r) {
  const impact=basis(r.impactYaw,r.impactPitch,r.impactRoll);
  const axis=[0,1,2].map(i=>impact.reduce((v,dir,j)=>v+dir[i]*r.localAxis[j],0));
  // Rodrigues rotation about the same tilted axis throughout free flight.
  return impact.map(v=>{
    const dot=axis[0]*v[0]+axis[1]*v[1]+axis[2]*v[2];
    return {v,parallel:axis.map(a=>a*dot),
      tangent:[axis[1]*v[2]-axis[2]*v[1],axis[2]*v[0]-axis[0]*v[2],axis[0]*v[1]-axis[1]*v[0]]};
  });
}
function airborneAngles(r,relativeMs){
  const phase=relativeMs*r.spin,c=Math.cos(phase),s=Math.sin(phase);
  const component=(j,k)=>{
    const {v,parallel,tangent}=r.frame[j];
    return v[k]*c+parallel[k]*(1-c)+tangent[k]*s;
  };
  const roll=Math.atan2(component(1,2),component(2,2));
  const expectedRoll=r.impactRoll+r.localAxis[0]*phase;
  return {yaw:Math.atan2(component(0,1),component(0,0)),pitch:Math.asin(Math.max(-1,Math.min(1,component(0,2)))),
    roll:roll+Math.round((expectedRoll-roll)/TAU)*TAU};
}

function glide(u) {return 1-(1-clamp(u))**4;}
function rocking(offset,velocity,decay,frequency,t) {
  return Math.exp(-decay*t)*(offset*Math.cos(frequency*t)+(velocity+decay*offset)/frequency*Math.sin(frequency*t));
}
function landedAngles(r,ms) {
  if(ms>=r.groundTime)return {pitch:r.restPitch,roll:r.roll,yaw:r.yaw};
  const t=ms*.001,fade=1-smooth(clamp((ms/r.groundTime-.54)/.46));
  // The second contact rocks the stick about its lower edge without another hop.
  const u=clamp((ms-r.bounce)/(r.groundTime-r.bounce));
  const wobble=Math.sin(1.5*TAU*u)*Math.exp(-2.2*u)*(1-smooth(clamp((u-.73)/.27)));
  const spin=Math.sign(r.impactRoll-r.roll),tip=Math.sign(r.impactPitch-r.restPitch);
  return {
    yaw:mix(r.impactYaw,r.yaw,glide(ms/r.glideTime))+.039*spin*tip*wobble,
    pitch:r.restPitch+fade*rocking(r.impactPitch-r.restPitch,r.pitchVelocity,r.pitchDecay,r.pitchFrequency,t)-.050*tip*wobble,
    roll:r.roll+fade*rocking(r.impactRoll-r.roll,r.rollVelocity,r.rollDecay,r.rollFrequency,t)-.195*spin*wobble
  };
}

function pileLayout(random) {
  const between=(a,b)=>mix(a,b,random());
  const mirrorX=random()<.5?-1:1,mirrorY=random()<.5?-1:1,rotation=between(-.09,.09);
  const c=Math.cos(rotation),s=Math.sin(rotation);
  function pose(x,y,yaw,role){
    x*=mirrorX;y*=mirrorY;
    const angle=Math.atan2(mirrorY*Math.sin(yaw),mirrorX*Math.cos(yaw))+rotation;
    // Keep timber grain in the same reading direction across mirrored layouts.
    const reverse=Math.cos(angle)<0;
    const heading=reverse?Math.atan2(-Math.sin(angle),-Math.cos(angle)):angle;
    return {x:c*x-s*y,y:s*x+c*y,yaw:heading,role,tiltSign:reverse?-1:1};
  }
  const x=between(-12,12),y=between(-16,-10),low=between(-.20,.20);
  const upper=low+between(.95,1.25),lowAt=(random()<.5?-1:1)*between(14,22),upperAt=between(13,22);
  const slots=[pose(x-lowAt*Math.cos(low),y-lowAt*Math.sin(low),low,'base'),
    pose(x-upperAt*Math.cos(upper),y-upperAt*Math.sin(upper),upper,'upper'),
    pose(between(-64,-60),between(42,49),between(-.32,.15),'loose'),
    pose(between(59,63),between(49,56),between(-.13,.32),'loose')];
  for(let i=slots.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]];}
  return slots;
}

const dot3=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function tangentLine(r,axes,normal) {
  const side=dot3(axes[1],normal),up=dot3(axes[2],normal);
  let best=cross[0],max=-Infinity;
  for(const p of cross){
    const score=p[0]*side+p[1]*up;
    if(score>max){max=score;best=p;}
  }
  return [r.x,r.depth,r.height+r.support].map((v,i)=>v+axes[1][i]*best[0]+axes[2][i]*best[1]);
}

// For two intersecting extrusions the common supporting plane is normal to
// both long axes. Their two tangent lines meet at the real bearing point.
function bearing(lower,upper) {
  const low=basis(lower.yaw,lower.pitch,lower.roll),high=basis(upper.yaw,upper.pitch,upper.roll);
  const [a]=low,[b]=high;
  const det=a[0]*b[1]-a[1]*b[0];
  if(Math.abs(det)<.13)return null;
  const dx0=upper.x-lower.x,dy0=upper.depth-lower.depth;
  const reach=Math.max(Math.abs((dx0*b[1]-dy0*b[0])/det),Math.abs((dx0*a[1]-dy0*a[0])/det));
  const coverage=smooth(clamp((length/2+30-reach)/32))*smooth(clamp((Math.abs(det)-.13)/.18));
  if(coverage===0)return null;
  const sign=Math.sign(det);
  const normal=[(a[1]*b[2]-a[2]*b[1])*sign,(a[2]*b[0]-a[0]*b[2])*sign,det*sign];
  const l=tangentLine(lower,low,normal),u=tangentLine(upper,high,normal.map(v=>-v));
  const dx=u[0]-l[0],dy=u[1]-l[1],ta=(dx*b[1]-dy*b[0])/det,tb=(dx*a[1]-dy*a[0])/det;
  const z=l[2]+a[2]*ta;
  return {x:l[0]+a[0]*ta,depth:l[1]+a[1]*ta,z,gap:u[2]+b[2]*tb-z,coverage};
}

function restState(r,pitch=0) {
  return {index:r.index,x:r.endX,depth:r.endDepth,yaw:r.yaw,roll:r.roll,pitch,
    height:0,support:floorSupport(pitch,r.roll)};
}
function restingPitch(lower,upper,sign) {
  const base=restState(lower);
  let lo=0,hi=.45;
  for(let i=0;i<18;i++){
    const mid=(lo+hi)*.5,contact=bearing(base,restState(upper,mid*sign));
    if(contact&&contact.gap<-.26)lo=mid;else hi=mid;
  }
  return sign*(lo+hi)*.5;
}

function seatUpper(scene,plan) {
  const base=scene[plan.base],upper=scene[plan.upper];
  upper.baseIndex=-1;upper.stackLift=0;upper.contact=null;
  // The lower rod can receive the other one while still settling. Blend in
  // over the final approach, including on a low, wide projection.
  const entry=smooth(clamp((base.sinceImpact+125)/125));
  if(entry===0)return scene;
  const topOfBase=base.height+base.support+floorSupport(-base.pitch,base.roll+Math.PI);
  if(upper.height>=topOfBase+30)return scene;
  const contact=bearing(base,upper);
  if(!contact)return scene;
  upper.stackLift=Math.max(0,Math.min(-contact.gap,topOfBase-upper.height))*contact.coverage*entry;
  upper.height+=upper.stackLift;
  upper.baseIndex=plan.base;
  upper.contact={...contact,coverage:contact.coverage*entry,gap:Math.max(0,contact.gap)};
  return scene;
}

const gravity=.00178; // world units per millisecond squared, shared by all four
// faces[i] is 1 for the flat face or 0 for the rounded, marked face.
export function createThrow(faces,seed) {
  if(!Array.isArray(faces)||faces.length!==4||faces.some(f=>f!==0&&f!==1))throw TypeError('윷 네 개의 앞뒷면이 필요해요.');
  const rng=generator(seed), between=(a,b)=>mix(a,b,rng());
  const slots=pileLayout(rng);
  const lead=between(-15,10),handDepth=between(39,54),handYaw=between(-.46,-.26);
  const rods=faces.map((face,i)=>{
    const dir=rng()<.5?-1:1;
    const slot=slots[i],delay=between(12,58)+i*15;
    const landing=slot.role==='base'?between(955,992):slot.role==='upper'?between(1120,1172):between(995,1120);
    const flight=landing-delay;
    const bounce=between(174,228),slide=between(275,365);
    const glideTime=(bounce+slide)*between(.80,.95),groundTime=bounce+slide+80;
    const yaw=slot.yaw,roll=face?0:Math.PI;
    const across=(i-1.5)*19+between(-1.5,1.5),along=(i%2?7:-7)+between(-3,3);
    const x0=lead+along*Math.cos(handYaw)-across*Math.sin(handYaw);
    const d0=handDepth+along*Math.sin(handYaw)+across*Math.cos(handYaw);
    const endX=slot.x,endDepth=slot.y;
    // The incoming horizontal momentum carries into a short frictional slide.
    const vx=(endX-x0)/(flight+glideTime/4),vd=(endDepth-d0)/(flight+glideTime/4);
    const r={index:i,face,delay,flight,bounce,hop:0,slide,groundTime,glideTime,restPitch:0,
      finish:delay+flight+groundTime,x0,d0,endX,endDepth,vx,vd,
      contactX:x0+vx*flight,contactD:d0+vd*flight,yaw,roll,
      impactYaw:yaw,impactPitch:(rng()<.5?-1:1)*between(.22,.44),impactRoll:roll-dir*between(1.05,1.82),
      pitchDecay:between(5.7,7.7),pitchFrequency:between(12,17),
      rollDecay:between(5.8,7.3),rollFrequency:between(7.4,10.3)};
    const startRotation=quaternion(handYaw+(i-1.5)*.065+between(-.055,.055),between(.12,.30),
      r.impactRoll-dir*between(1.70,4.08));
    const turns=rng()<.18?0:1;
    releaseSpin(r,startRotation,dir,turns);
    const earlier=airborneAngles(r,-.25),later=airborneAngles(r,.25);
    const yawVelocity=(later.yaw-earlier.yaw)/.5;
    r.impactYaw-=yawVelocity*between(.29,.50)*glideTime/4;
    releaseSpin(r,startRotation,dir,turns);
    r.pitchVelocity=(later.pitch-earlier.pitch)*2000*.25-Math.sign(r.impactPitch)*between(2.0,3.2);
    r.rollVelocity=(later.roll-earlier.roll)*2000*between(.56,.78);
    const start=airborneAngles(r,-flight);
    r.startHeight=floorSupport(start.pitch,start.roll)+between(13,22);
    r.contactHeight=floorSupport(r.impactPitch,r.impactRoll);
    return r;
  });
  const base=slots.findIndex(p=>p.role==='base'),upper=slots.findIndex(p=>p.role==='upper');
  rods[upper].restPitch=restingPitch(rods[base],rods[upper],slots[upper].tiltSign);
  const settleMs=Math.max(...rods.map(r=>r.finish));
  return {rods,base,upper,settleMs,totalMs:settleMs+530};
}

function flightStates(plan,elapsedMs) {
  return plan.rods.map(r=>{
    // The bundle is lifted into release velocity over the first few frames.
    const release=elapsedMs-r.delay,power=Math.max(3,r.delay/11);
    const t=release<0?r.delay/power*(clamp(elapsedMs/r.delay)**power-1):release;
    const impact=t-r.flight;
    const air=impact<0;
    const angles=air?airborneAngles(r,impact):landedAngles(r,impact);
    const support=floorSupport(angles.pitch,angles.roll);
    let floor=support,arc=0;
    if(air){
      floor=mix(r.startHeight,r.contactHeight,t/r.flight);
      arc=.5*gravity*t*(r.flight-t);
    }else if(impact<r.bounce){
      // One short recoil of the contacting end, followed by grounded rolling.
      arc=.5*gravity*impact*(r.bounce-impact);
    }
    const travel=air?t:r.flight+r.glideTime*.25*glide(impact/r.glideTime);
    const settled=elapsedMs>=r.finish;
    return {index:r.index,face:r.face,x:settled?r.endX:r.x0+r.vx*travel,
      depth:settled?r.endDepth:r.d0+r.vd*travel,...angles,
      height:Math.max(0,floor+arc-support),floor,arc,support,settled,sinceImpact:impact,phase:air?'flight':impact<r.bounce?'bounce':'ground'};
  });
}

export function sampleThrow(plan,elapsedMs) {
  return seatUpper(flightStates(plan,elapsedMs),plan);
}

// A single field and a hairline rim keep attention on movement and contact.
function backdrop(ctx,width,height) {
  const light=ctx.createLinearGradient(0,0,width*.7,height);
  light.addColorStop(0,'#285456');light.addColorStop(.54,'#1a4144');light.addColorStop(1,'#16363a');
  ctx.fillStyle=light;ctx.fillRect(0,0,width,height);
  const edge=Math.max(1,Math.min(width,height)*.0025);
  ctx.strokeStyle='#51706b';ctx.lineWidth=edge;ctx.strokeRect(edge,edge,width-2*edge,height-2*edge);
}

function camera(width,height,scale,baseline) {
  const w=width/scale,h=height/scale;
  const distance=1900;
  const wide=clamp((width/height-.85)/.8);
  const lift=Math.min(1.65,h*(.36-.16*wide)/(200*groundCos));
  function project(x,depth,z){
    const perspective=distance/(distance-depth*groundCos-z*groundSin);
    return [w/2+x*perspective,h*baseline+(depth*groundSin-z*groundCos)*perspective];
  }
  return {w,h,scale,distance,project,lift};
}

function stageScene(plan,t,cam) {
  const scene=flightStates(plan,t);
  // Preserve near-ground clearance and the full recoil. Only the high part
  // of the launch is compressed in a short viewport, with a continuous slope.
  for(const r of scene){
    const excess=Math.max(0,r.height-40);
    const freeHeight=excess-16*(1-Math.exp(-excess/16));
    r.height+=(cam.lift-1)*freeHeight;
  }
  return seatUpper(scene,plan);
}

function orient(r,cam) {
  const [along,across,up]=basis(r.yaw,r.pitch,r.roll);
  const support=r.support??floorSupport(r.pitch,r.roll);
  function vector(x,s,h){
    return [along[0]*x+across[0]*s+up[0]*h,along[1]*x+across[1]*s+up[1]*h,along[2]*x+across[2]*s+up[2]*h];
  }
  function point(x,s,h){
    const [dx,dd,dh]=vector(x,s,h);
    return cam.project(r.x+dx,r.depth+dd,r.height+support+dh);
  }
  const eye=[-r.x,cam.distance*groundCos-r.depth,cam.distance*groundSin-r.height-support];
  function visible(n){return n[0]*eye[0]+n[1]*eye[1]+n[2]*eye[2]>0;}
  return {vector,point,support,visible};
}
function polygon(ctx,pts,color) {
  ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=color;ctx.fill();
}
function stroke(ctx,pts,color,width) {
  ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function tint(base,normal) {
  const light=Math.max(0,-.42*normal[0]-.48*normal[1]+.77*normal[2]);
  const gloss=Math.max(0,-.24*normal[0]+.12*normal[1]+.964*normal[2])**14;
  const k=.61+.46*light+.12*gloss;
  return 'rgb('+base.map(v=>Math.min(255,Math.round(v*k))).join(',')+')';
}

function drawStick(ctx,r,model) {
  const {point,vector,visible}=model, side=length/2, shoulder=side-2.5;
  // Curved timber panels are lit separately; engraving is applied continuously
  // across the visible arc so the burned X reads as one cut in the wood.
  const marks=[];
  for(let i=0;i<facets;i++){
    const theta=(i+.5)*Math.PI/facets, normal=vector(0,Math.cos(theta),-Math.sin(theta));
    if(!visible(normal))continue;
    const a=cross[i],b=cross[i+1];
    const color=tint([217+Math.sin(theta*8)*3,155+6*Math.sin(theta),93],normal);
    const panel=[point(-shoulder,...a),point(shoulder,...a),point(shoulder,...b),point(-shoulder,...b)];
    polygon(ctx,panel,color);
    // A subpixel underlap closes antialias seams between adjacent curved facets.
    stroke(ctx,[panel[0],panel[1]],color,.8);
    // Subtle grain follows the curvature of each individual segment.
    if(i%2===1){
      const sec=section(theta);
      stroke(ctx,[point(-side+3,...sec),point(-12,sec[0]+.12,sec[1]+.12),point(side-3,...sec)],'rgba(103,57,29,.21)',.65);
    }
    for(const cut of [-side+6,side-6]){
      stroke(ctx,[point(cut,...a),point(cut,...b)],'#714e36',1.5);
      stroke(ctx,[point(cut+1.5,...a),point(cut+1.5,...b)],'#e3bd76',1.1);
    }
    const left=Math.max(i*Math.PI/facets,.60),right=Math.min((i+1)*Math.PI/facets,Math.PI-.60);
    if(left<right){
      const previous=marks[marks.length-1];
      if(previous&&Math.abs(previous[1]-left)<.001)previous[1]=right;
      else marks.push([left,right]);
    }
  }
  for(const [left,right] of marks){
    const steps=Math.max(2,Math.ceil((right-left)*10));
    for(const center of [-24,0,24])for(const dir of [-1,1]){
      const edge=offset=>Array.from({length:steps+1},(_,i)=>{
        const theta=mix(left,right,i/steps);
        return point(center+offset+dir*(theta-Math.PI/2)*8,...section(theta));
      });
      polygon(ctx,[...edge(-1.55),...edge(1.65).reverse()],'#603c28');
      polygon(ctx,[...edge(1.65),...edge(2.4).reverse()],'#e5b778');
    }
  }
  const faceNormal=vector(0,0,1);
  if(visible(faceNormal)){
    const f=(x,y)=>point(x,y,radius*.31);
    const p=f(0,-radius),q=f(0,radius);
    const wood=ctx.createLinearGradient(p[0],p[1],q[0],q[1]);
    wood.addColorStop(0,tint([233,185,123],faceNormal));wood.addColorStop(.18,tint([253,225,176],faceNormal));
    wood.addColorStop(.70,tint([249,215,159],faceNormal));wood.addColorStop(1,tint([215,167,105],faceNormal));
    polygon(ctx,[f(-shoulder,-radius),f(shoulder,-radius),f(shoulder,radius),f(-shoulder,radius)],wood);
    for(const end of [-1,1]){
      const cut=end*(side-6);
      stroke(ctx,[f(cut,-radius+.6),f(cut,radius-.6)],'#ae8655',1.4);
      stroke(ctx,[f(cut+end*1.4,-radius+.6),f(cut+end*1.4,radius-.6)],'#e8ce98',.9);
    }
    for(const sy of [-1,1]){
      stroke(ctx,[f(-shoulder,sy*(radius-.9)),f(shoulder,sy*(radius-.9))],sy>0?'#bb8b57':'#f4d9a5',1.4);
      stroke(ctx,[f(-side+4,sy*(radius-2.6)),f(-12,sy*(radius-3.3)),f(side-3,sy*(radius-2.6))],'rgba(155,103,57,.34)',.75);
    }
    stroke(ctx,[f(-side+9,2.2),f(-34,1),f(-11,1.9),f(0,.4),f(33,.95),f(side-8,-1.4)],'rgba(166,117,68,.46)',.75);
    stroke(ctx,[f(-side+15,-4.9),f(-1,-3.4),f(15,-5.2),f(35,-4.1)],'rgba(179,128,73,.38)',.75);
  }
  for(const sign of [-1,1]){
    // A small chamfer wraps continuously around the semicircular sawn end.
    const tip=(s,h)=>point(sign*side,s*.84,-2+(h+2)*.84);
    for(let i=0;i<facets;i++){
      const theta=(i+.5)*Math.PI/facets;
      const n=vector(sign*.61,.79*Math.cos(theta),-.79*Math.sin(theta));
      if(!visible(n))continue;
      const a=cross[i],b=cross[i+1];
      const band=[point(sign*shoulder,...a),point(sign*shoulder,...b),tip(...b),tip(...a)];
      const color=tint([224,169,105],n);
      polygon(ctx,band,color);stroke(ctx,[band[1],band[2]],color,.45);
    }
    const top=vector(sign*.44,0,.898),flat=radius*.31;
    if(visible(top))polygon(ctx,[point(sign*shoulder,-radius,flat),point(sign*shoulder,radius,flat),
      tip(radius,flat),tip(-radius,flat)],tint([245,207,149],top));
    const capNormal=vector(sign,0,0);
    if(!visible(capNormal))continue;
    polygon(ctx,cross.map(([s,h])=>tip(s,h)),tint([225,176,115],capNormal));
    for(const ring of [.30,.53,.76]){
      const pts=cross.map(([s,h])=>tip(s*ring,(h-flat)*ring+flat-1));
      stroke(ctx,pts,'rgba(119,75,39,.53)',.72);
    }
  }
}
function drawShadow(ctx,r,m,cam) {
  const cos=Math.cos(r.yaw),sin=Math.sin(r.yaw),pitch=Math.sin(r.pitch);
  const span=length*.49*Math.cos(r.pitch);
  const z=r.height+m.support;
  const shadowEnd=sign=>{
    const alt=z+sign*length*.49*pitch;
    return cam.project(r.x+sign*span*cos+alt*.16,r.depth+sign*span*sin+alt*.22,0);
  };
  const a=shadowEnd(-1),b=shadowEnd(1),dx=(b[0]-a[0])*.5,dy=(b[1]-a[1])*.5;
  const x=(a[0]+b[0])*.5,y=(a[1]+b[1])*.5,angle=Math.atan2(dy,dx);
  const half=Math.max(4,Math.hypot(dx,dy)),air=clamp(z/200);
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);
  for(let i=4;i>=0;i--){
    ctx.beginPath();ctx.ellipse(0,0,half+i*(1.3+2.9*air),radius*.56+i*(1.2+2.5*air),0,0,TAU);
    ctx.fillStyle='rgba(3,17,18,'+((.14-.082*air)*(1-.10*i))+')';ctx.fill();
  }
  ctx.restore();
  // The shadow concentrates underneath the first touching tip, then grows
  // along the length as the other end drops onto the surface.
  const contact=Math.exp(-r.height/5.2);
  if(contact<.006)return;
  const weightedTip=-Math.sign(pitch)*(1-Math.exp(-Math.abs(pitch)*4.8));
  const center=cam.project(r.x+span*cos*weightedTip,r.depth+span*sin*weightedTip,0);
  ctx.save();ctx.translate(...center);ctx.rotate(Math.atan2(sin*groundSin,cos));
  ctx.beginPath();ctx.ellipse(0,0,Math.max(4,half*(1-.77*Math.abs(weightedTip))),radius*.53,0,0,TAU);
  ctx.fillStyle='rgba(1,10,12,'+(.43*contact)+')';ctx.fill();ctx.restore();
}

function bodies(scene,cam){
  return scene.map(r=>({r,m:orient(r,cam)}));
}

const throwLens=new WeakMap();
function fixedLens(plan,width,height){
  const cached=throwLens.get(plan);
  if(cached&&cached.width===width&&cached.height===height)return cached;
  const scale=Math.min(width*.445,height*.63)/length;
  const cam=camera(width,height,scale,.57);
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  // Measure once for this throw and viewport. The camera never follows a
  // rotating tip, pumps its zoom at impact or jumps between neighboring sticks.
  for(let t=0;t<plan.settleMs+26;t+=26){
    const scene=stageScene(plan,t,cam);
    for(const state of scene){
      const m=orient(state,cam);
      for(const x of [-length/2,length/2])for(const [s,h] of cross){
        const [px,py]=m.point(x,s,h);
        left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);
      }
    }
  }
  const pad=Math.min(cam.w,cam.h)*.030+1.2,headroom=cam.h*.102+1.4;
  const zoom=Math.min(1,(cam.w-2*pad)/(right-left),(cam.h-headroom-pad)/(bottom-top));
  const shift=(lo,hi,size,near)=>Math.max(near-lo*zoom,Math.min(0,size-pad-hi*zoom));
  const lens={cam,width,height,zoom,x:shift(left,right,cam.w,pad),y:shift(top,bottom,cam.h,headroom)};
  throwLens.set(plan,lens);return lens;
}

function contactShadow(ctx,base,top,cam) {
  const contact=top.r.contact;
  if(contact.gap>30)return;
  const pts=[-length/2,length/2].flatMap(x=>cross.map(([s,h])=>base.m.point(x,s,h)));
  pts.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const boundary=ordered=>{
    const edge=[];
    for(const p of ordered){
      while(edge.length>1){
        const a=edge[edge.length-2],b=edge[edge.length-1];
        if((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])>0)break;
        edge.pop();
      }
      edge.push(p);
    }
    edge.pop();return edge;
  };
  const hull=[...boundary(pts),...boundary(pts.reverse())];
  const c=cam.project(contact.x+2,contact.depth+3,contact.z);
  const a=top.m.point(-length/2,0,0),b=top.m.point(length/2,0,0);
  ctx.save();ctx.beginPath();hull.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
  ctx.closePath();ctx.clip();ctx.translate(...c);ctx.rotate(Math.atan2(b[1]-a[1],b[0]-a[0]));
  const strength=Math.exp(-contact.gap/10)*contact.coverage;
  for(let i=2;i>=0;i--){
    ctx.beginPath();ctx.ellipse(0,0,24+i*1.6,radius*.71+i*1.8,0,0,TAU);
    ctx.fillStyle='rgba(39,22,12,'+(.19*strength)+')';ctx.fill();
  }
  ctx.restore();
}
function renderBodies(ctx,parts,cam){
  for(const {r,m} of parts)drawShadow(ctx,r,m,cam);
  const depth=({r,m})=>r.depth*groundCos+(r.height+m.support)*groundSin;
  parts.sort((a,b)=>depth(a)-depth(b));
  const top=parts.find(({r})=>r.contact&&r.contact.gap<36);
  const base=top&&parts.find(({r})=>r.index===top.r.baseIndex);
  if(base&&parts.indexOf(base)>parts.indexOf(top)){
    parts.splice(parts.indexOf(base),1);parts.splice(parts.indexOf(top),0,base);
  }
  for(const part of parts){
    if(part===top&&base)contactShadow(ctx,base,top,cam);
    drawStick(ctx,part.r,part.m);
  }
}

export function drawThrow(ctx,width,height,plan,elapsedMs) {
  if(!ctx||width<=0||height<=0)return;
  const lens=fixedLens(plan,width,height),cam=lens.cam;
  const parts=bodies(stageScene(plan,elapsedMs,cam),cam);
  backdrop(ctx,width,height);
  ctx.save();ctx.scale(cam.scale,cam.scale);ctx.translate(lens.x,lens.y);ctx.scale(lens.zoom,lens.zoom);
  ctx.lineJoin='round';ctx.lineCap='round';renderBodies(ctx,parts,cam);ctx.restore();
}

const rackPlans=new WeakMap();
function resultRack(ctx,width,height,faces,seed){
  const mask=faces.reduce((bits,v,i)=>bits|(v<<i),0);
  let saved=rackPlans.get(ctx);
  if(!saved||saved.seed!==seed||saved.mask!==mask){
    saved={seed,mask,plan:createThrow(faces,seed)};rackPlans.set(ctx,saved);
  }
  const cam=camera(width,height,1,.5);
  const parts=bodies(stageScene(saved.plan,saved.plan.settleMs,cam),cam);
  let l=Infinity,r=-Infinity,t=Infinity,b=-Infinity;
  for(const {m} of parts)for(const x of [-length/2,length/2])for(const [s,h] of cross){
    const [px,py]=m.point(x,s,h);l=Math.min(l,px);r=Math.max(r,px);t=Math.min(t,py);b=Math.max(b,py);
  }
  // Uniform reframing preserves the crossing angle, bearing point and visible
  // face order even in a short landscape result tray.
  const pad=Math.max(3,Math.min(width,height)*.055);
  const scale=Math.min((width-2*pad)/(r-l+7),(height-2*pad)/(b-t+11));
  if(scale<=0)return;
  ctx.save();ctx.translate(width/2,height/2);ctx.scale(scale,scale);ctx.translate(-(l+r+3)/2,-(t+b+5)/2);
  ctx.lineJoin='round';ctx.lineCap='round';renderBodies(ctx,parts,cam);ctx.restore();
}

export function drawRack(ctx,width,height,faces=null,seed=null) {
  if(!ctx||width<=0||height<=0)return;
  backdrop(ctx,width,height);
  if(faces){resultRack(ctx,width,height,faces,seed);return;}
  const wide=width/height>=1.58;
  const scale=Math.min(width*(wide?.383:.72),height*(wide?1.40:.78))/length;
  const cam=camera(width,height,scale,.50);
  const layout=wide
    ? [[-.239,-.225,-.045],[.239,-.225,.035],[-.239,.220,.050],[.239,.220,-.04]]
    : [[-.035,-.344,-.085],[.03,-.118,-.050],[-.025,.110,-.080],[.045,.340,-.045]];
  const parts=bodies(layout.map(([x,y,yaw],i)=>{
    const face=[0,1,0,1][i];
    // Invert the ground perspective so all rows are centered inside the tray.
    const planeY=y*cam.h+radius*.14;
    const depth=planeY/(groundSin+planeY*groundCos/cam.distance);
    return {index:i,face,yaw,roll:face?0:Math.PI,pitch:0,height:0,
      x:x*cam.w*(1-depth*groundCos/cam.distance),depth};
  }),cam);
  ctx.save();ctx.scale(scale,scale);ctx.lineJoin='round';ctx.lineCap='round';
  renderBodies(ctx,parts,cam);ctx.restore();
}

export function createToss(canvas) {
  const ctx=canvas.getContext('2d');let running=null;
  function cancel(){
    if(!running)return;
    const run=running;running=null;cancelAnimationFrame(run.frame);clearTimeout(run.deadline);
    run.resizeObserver?.disconnect();window.removeEventListener('resize',run.resize);run.resolve();
  }
  function play(faces,seed,onSettle,onThrow){
    cancel();
    const plan=createThrow(faces,seed);
    if(!ctx){onSettle?.();return Promise.resolve();}
    function resize(){
      const bounds=canvas.getBoundingClientRect(),ratio=Math.min(2,window.devicePixelRatio||1);
      const width=Math.max(1,Math.round(bounds.width*ratio)),height=Math.max(1,Math.round(bounds.height*ratio));
      if(width!==canvas.width)canvas.width=width;
      if(height!==canvas.height)canvas.height=height;
    }
    resize();
    return new Promise(resolve=>{
      const run={resolve,frame:0,deadline:0,settled:false,resize,resizeObserver:null},start=performance.now();running=run;
      onThrow?.(plan);
      if(typeof ResizeObserver==='function'){
        run.resizeObserver=new ResizeObserver(resize);run.resizeObserver.observe(canvas);
      }
      window.addEventListener('resize',resize);
      function show(t){
        if(running!==run)return;
        drawThrow(ctx,canvas.width,canvas.height,plan,t);
        if(!run.settled&&t>=plan.settleMs){run.settled=true;onSettle?.();}
      }
      function update(now){
        if(running!==run)return;
        const t=Math.max(0,now-start);show(t);
        if(running!==run)return;
        if(t>=plan.totalMs)cancel();
        else run.frame=requestAnimationFrame(update);
      }
      show(0);run.frame=requestAnimationFrame(update);
      // A hidden tab can stop delivering animation frames altogether.
      run.deadline=setTimeout(()=>{if(running===run){show(plan.totalMs);if(running===run)cancel();}},Math.ceil(plan.totalMs)+90);
    });
  }
  return {play,cancel};
}
