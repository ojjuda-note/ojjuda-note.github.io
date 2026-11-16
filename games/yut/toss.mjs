// Movement is in world coordinates. A camera fitted to the available surface
// projects the split timber, its floor support and its shadow into the same space.
const TAU = Math.PI * 2;
const groundSin = .72, groundCos = Math.sqrt(1-groundSin**2);
const length = 116, radius = 13.6, facets = 16;
const cross = Array.from({length:facets+1},(_,i)=>section(Math.PI*i/facets));
const clamp = t => Math.max(0, Math.min(1, t));
const mix = (a,b,t) => a+(b-a)*t;
const easeOut = t => 1-(1-t)**2;
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

// faces[i] is 1 for the flat face or 0 for the rounded, marked face.
// Times in the plan and sampler are milliseconds. Angles are radians.
export function createThrow(faces,seed) {
  if(!Array.isArray(faces)||faces.length!==4||faces.some(f=>f!==0&&f!==1))throw TypeError('윷 네 개의 앞뒷면이 필요해요.');
  const rng=generator(seed), between=(a,b)=>mix(a,b,rng());
  const targets=[[-104,-65],[104,-67],[-104,66],[104,65]];
  for(let n=targets.length-1;n>0;n--){
    const j=Math.floor(rng()*(n+1));[targets[n],targets[j]]=[targets[j],targets[n]];
  }
  const bias=between(-14,14), flip=rng()<.5?-1:1;
  const rods=faces.map((face,i)=>{
    const dir=(i%2?1:-1)*flip, group=i<2?-1:1;
    const [endX,endDepth]=targets[i];
    const delay=between(32,78)+i*12, flight=between(850,980);
    const bounce=between(285,350), hop=between(160,225), slide=between(265,365);
    const finish=delay+flight+bounce+hop+slide;
    const yaw=flip*[-.41,.26,.38,-.23][i]+between(-.095,.095), roll=face?0:Math.PI;
    return {index:i,face,delay,flight,bounce,hop,slide,finish,
      x0:-81+i*14+bias, d0:102+i*4, contactX:group*40+dir*9+bias,
      contactD:group*18-dir*9, endX:endX+between(-2,2),endDepth:endDepth+between(-3,3),
      peak:between(178,209), bow:dir*between(35,62),firstLift:between(26,45),
      lastLift:between(7,15), yaw, roll,
      startYaw:-1.02+i*.082,impactYaw:yaw+dir*between(.50,1.05)*TAU,
      startRoll:roll-dir*between(2.35,3.65)*TAU,
      impactRoll:roll-dir*between(.57,.91)*TAU,
      startPitch:between(.24,.47),impactPitch:dir*between(.19,.48),
      pitchTurns:(i%2?1:-1)*TAU,turnDir:dir};
  });
  const settleMs=Math.max(...rods.map(r=>r.finish));
  return {rods,settleMs,totalMs:settleMs+530};
}

// Sample a flight, two separate impacts and a short final skid. Each group's
// first contact paths converge before the four sticks scatter to distinct slots.
export function sampleThrow(plan,elapsedMs) {
  return plan.rods.map(r=>{
    const t=Math.max(0,elapsedMs-r.delay),impact=t-r.flight;
    let x,depth,height,yaw,roll,pitch;
    if(impact<0){
      const u=clamp(t/r.flight),arc=4*u*(1-u);
      x=mix(r.x0,r.contactX,u)+r.bow*arc;
      depth=mix(r.d0,r.contactD,u)-18*arc;
      height=14*(1-u)+r.peak*arc;
      yaw=mix(r.startYaw,r.impactYaw,u);roll=mix(r.startRoll,r.impactRoll,u);
      pitch=mix(r.startPitch,r.impactPitch+r.pitchTurns,u);
    }else{
      const whole=clamp(impact/(r.bounce+r.hop+r.slide));
      const spread=easeOut(whole), bend=Math.sin(Math.PI*spread)*r.turnDir;
      x=mix(r.contactX,r.endX,spread)+12*bend;
      depth=mix(r.contactD,r.endDepth,spread)-16*bend;
      yaw=mix(r.impactYaw,r.yaw,easeOut(spread));
      roll=mix(r.impactRoll,r.roll,spread);
      let u,amp,tilt;
      if(impact<r.bounce){
        u=impact/r.bounce;amp=r.firstLift;
        tilt=mix(r.impactPitch,-r.impactPitch*.5,u)+r.turnDir*.56*Math.sin(Math.PI*u);
      }else if(impact<r.bounce+r.hop){
        u=(impact-r.bounce)/r.hop;amp=r.lastLift;
        tilt=mix(-r.impactPitch*.5,r.impactPitch*.15,u)-r.turnDir*.24*Math.sin(Math.PI*u);
      }else{
        u=clamp((impact-r.bounce-r.hop)/r.slide);amp=0;
        tilt=r.impactPitch*.15*(1-smooth(u));
        roll+=r.turnDir*.095*Math.sin(u*TAU)*(1-u);
      }
      height=amp*4*u*(1-u);pitch=tilt;
    }
    return {index:r.index,face:r.face,x,depth,height,pitch,yaw,roll,settled:elapsedMs>=r.finish};
  });
}

const shell=['#c5dbce','#a5ccc8','#e3dcc4','#a1c7ce','#c9b8c7'];

function cornerInlay(ctx,x,y,rotation) {
  ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.lineCap='square';
  const fret=[[0,58],[0,14],[13,14],[13,0],[56,0]];
  const lock=[[5,43],[5,20],[23,20],[23,5],[43,5]];
  stroke(ctx,fret,'#48615a',4.4);stroke(ctx,fret,'#c3ba85',2.3);
  stroke(ctx,lock,'#0b2026',5.5);stroke(ctx,lock,'#83aba8',2.1);
  stroke(ctx,[[8,31],[8,9],[31,9]],'#e0d4ae',1.55);
  for(const [a,b] of [[0,52],[0,41],[49,0],[33,0],[13,0]]){
    polygon(ctx,[[a-1,b],[a+1,b-1],[a+4,b],[a+1,b+1]],shell[(a+b)%5]);
  }
  polygon(ctx,[[7,4],[10,7],[7,10],[4,7]],'#c0cad1');
  ctx.restore();
}

// Small nacre shards form the crest of a wave, with engraving running underneath it.
function tideInlay(ctx,x,y,scale,flip) {
  ctx.save();ctx.translate(x,y);ctx.scale(scale*flip,scale);
  for(let i=0;i<3;i++){
    ctx.strokeStyle=['#4b756f','#355f60','#507a74'][i];ctx.lineWidth=.85;
    ctx.beginPath();ctx.moveTo(-6,17+i*3);
    ctx.bezierCurveTo(11,24+i*2,28,16+i*3,42,4+i*3);
    ctx.bezierCurveTo(53,-5+i*3,69,-6+i*3,75,-1+i*3);
    ctx.stroke();
  }
  for(let i=0;i<14;i++){
    const t=i/13,xx=4+t*68,yy=14-15*Math.sin(t*Math.PI/2)+4*Math.sin(t*TAU);
    const len=3.2+Math.sin(t*Math.PI)*2.7;
    polygon(ctx,[[xx,yy],[xx+len*.29,yy-1.6],[xx+len,yy-1.25],[xx+len*.28,yy+.88]],
      shell[(i*3)%5]);
  }
  ctx.restore();
}

function mat(ctx,W,H) {
  // Thin stepped rims and a quiet open field keep the silhouettes readable in flight.
  const rim=ctx.createLinearGradient(0,0,W,H);
  rim.addColorStop(0,'#537172');rim.addColorStop(.12,'#163237');rim.addColorStop(.48,'#071a21');rim.addColorStop(.88,'#324b4b');rim.addColorStop(1,'#122326');
  ctx.fillStyle=rim;ctx.fillRect(0,0,W,H);
  for(const [inset,color,weight] of [[3,'#a89c74',1],[7,'#071d24',4],[9,'#6a8b82',.8]]){
    ctx.strokeStyle=color;ctx.lineWidth=weight;ctx.strokeRect(inset,inset,W-2*inset,H-2*inset);
  }
  const field=ctx.createLinearGradient(28,9,W*.75,H);
  field.addColorStop(0,'#265358');field.addColorStop(.43,'#194247');
  field.addColorStop(.8,'#143239');field.addColorStop(1,'#102d35');
  ctx.fillStyle=field;ctx.fillRect(12,12,W-24,H-24);
  ctx.save();ctx.beginPath();ctx.rect(13,13,W-26,H-26);ctx.clip();
  // Woven ramie catches a grazing light across the lacquered tray.
  for(let row=0;row<(H-24)/4;row++){
    const yy=13+row*4;
    ctx.fillStyle=row%3?'rgba(5,27,32,.10)':'rgba(177,202,175,.028)';ctx.fillRect(12,yy,W-24,.7);
    ctx.fillStyle='rgba(178,214,195,.043)';
    for(let xx=14+(row%2)*5;xx<W-12;xx+=11)ctx.fillRect(xx,yy+1,4.6,.7);
  }
  for(const [xx,yy,scale,flip] of [[32,H*.28,.72,1],[W-32,H*.71,.72,-1],[39,H*.83,.5,1],[W-39,H*.16,.5,-1]]){
    tideInlay(ctx,xx,yy,scale,flip);
  }
  // Fine repeating tide lines fade into the shore at the two long edges.
  for(const [x,y,mirror] of [[13,H*.67,1],[W-13,H*.29,-1]]){
    ctx.save();ctx.translate(x,y);ctx.scale(mirror,1);ctx.strokeStyle='#32565a';ctx.lineWidth=.8;
    for(let j=0;j<5;j++){
      ctx.beginPath();ctx.moveTo(-6,j*4);
      ctx.bezierCurveTo(9,5+j*4,21,-12+j*4,32,-12+j*4);
      ctx.bezierCurveTo(42,-14+j*4,53,-3+j*4,65,-8+j*4);ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
  ctx.lineWidth=.85;ctx.strokeStyle='#637d70';ctx.strokeRect(15,15,W-30,H-30);
  for(const [x,y,rotation] of [[21,21,0],[W-21,21,Math.PI/2],[W-21,H-21,Math.PI],[21,H-21,-Math.PI/2]]){
    cornerInlay(ctx,x,y,rotation);
  }
}
const matCache=new WeakMap();
function backdrop(ctx,width,height) {
  const unit=Math.max(Math.min(width/510,height/340),Math.max(width,height)/1100);
  const w=Math.round(width/unit),h=Math.round(height/unit);
  let image=matCache.get(ctx);
  if(!image||image.width!==w||image.height!==h){
    if(typeof OffscreenCanvas==='function')image=new OffscreenCanvas(w,h);
    else if(ctx.canvas?.ownerDocument)image=ctx.canvas.ownerDocument.createElement('canvas');
    if(image){image.width=w;image.height=h;mat(image.getContext('2d'),w,h);matCache.set(ctx,image);}
  }
  if(image)ctx.drawImage(image,0,0,width,height);
  else{ctx.save();ctx.scale(width/w,height/h);mat(ctx,w,h);ctx.restore();}
}

function camera(width,height,scale,baseline) {
  const w=width/scale,h=height/scale;
  const distance=Math.max(1900,Math.min(w,h)*3.2);
  const spreadX=Math.min(w*.241,length*1.24)/104;
  const spreadDepth=Math.min(h*.190,length*.49)/(66*groundSin);
  const lift=Math.min(1.65,h*.36/(200*groundCos));
  function project(x,depth,z){
    const perspective=distance/(distance-depth*groundCos-z*groundSin);
    return [w/2+x*perspective,h*baseline+(depth*groundSin-z*groundCos)*perspective];
  }
  return {w,h,scale,distance,project,spreadX,spreadDepth,lift};
}

function stageRod(r,cam) {
  return {...r,x:r.x*cam.spreadX,depth:r.depth*cam.spreadDepth,height:r.height*cam.lift};
}

function orient(r,cam) {
  const cy=Math.cos(r.yaw),sy=Math.sin(r.yaw),cr=Math.cos(r.roll),sr=Math.sin(r.roll);
  const cp=Math.cos(r.pitch),sp=Math.sin(r.pitch);
  const along=[cy*cp,sy*cp,sp];
  const across=[-sy*cr-cy*sp*sr,cy*cr-sy*sp*sr,cp*sr];
  const up=[sy*sr-cy*sp*cr,-cy*sr-sy*sp*cr,cp*cr];
  // Exact floor support of the extruded section at the current attitude.
  const support=length*.5*Math.abs(along[2])-Math.min(...cross.map(([s,h])=>s*across[2]+h*up[2]));
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
  const t=clamp(r.height/170), x=r.x+2+r.height*.10,d=r.depth+2+r.height*.12;
  const center=cam.project(x,d,0);
  const cos=Math.cos(r.yaw),sin=Math.sin(r.yaw);
  const span=(length*.48*Math.abs(Math.cos(r.pitch))+2);
  const end=cam.project(x+span*cos,d+span*sin,0);
  const angle=Math.atan2(end[1]-center[1],end[0]-center[0]);
  const half=Math.max(5,Math.hypot(end[0]-center[0],end[1]-center[1]));
  ctx.save();ctx.translate(...center);ctx.rotate(angle);
  for(let i=4;i>=0;i--){
    ctx.beginPath();ctx.ellipse(0,0,half+i*(1.3+2.9*t),radius*.58+i*(1.2+2.1*t),0,0,TAU);
    ctx.fillStyle='rgba(0,10,15,'+((.16-.095*t)*(1-.10*i))+')';ctx.fill();
  }
  if(r.height<2&&m.support<22){
    ctx.beginPath();ctx.ellipse(0,-.4,Math.max(6,half-1),radius*.52,0,0,TAU);
    ctx.fillStyle='rgba(0,10,15,.40)';ctx.fill();
  }
  ctx.restore();
}

function impactDust(ctx,r,time,cam) {
  const u=clamp((time-r.delay-r.flight)/215);
  if(u===0||u===1)return;
  for(let i=0;i<6;i++){
    const a=i*TAU/6+r.index*.84;
    const x=r.contactX*cam.spreadX+Math.cos(a)*(11+u*17);
    const d=r.contactD*cam.spreadDepth+Math.sin(a)*(11+u*19);
    const [px,py]=cam.project(x,d,9*Math.sin(u*Math.PI));
    ctx.beginPath();ctx.ellipse(px,py,1.1*(1-u)+.3,.55,0,0,TAU);
    ctx.fillStyle='rgba(244,229,190,'+(.60*(1-u))+')';ctx.fill();
  }
}

function bodies(scene,cam){
  return scene.map(r=>({r,m:orient(r,cam)}));
}

// Follow the cluster at the top of the arc. Frame both end caps even while a
// stick is upright. The floor stays still once the sticks have landed.
function frameThrow(parts,cam){
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  for(const {m} of parts)for(const x of [-length/2,length/2])for(const [s,h] of cross){
    const [px,py]=m.point(x,s,h);
    left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);
  }
  const pad=Math.min(cam.w,cam.h)*.028;
  const headroom=Math.max(pad,cam.h*.105);
  const zoom=Math.min(1,(cam.w-2*pad)/(right-left),(cam.h-headroom-pad)/(bottom-top));
  const shift=(lo,hi,size,near)=>Math.max(near-lo*zoom,Math.min(0,size-pad-hi*zoom));
  return {zoom,x:shift(left,right,cam.w,pad),y:shift(top,bottom,cam.h,headroom)};
}

function renderBodies(ctx,parts,cam,plan,time){
  for(const {r,m} of parts)drawShadow(ctx,r,m,cam);
  if(plan)for(const rod of plan.rods)impactDust(ctx,rod,time,cam);
  const depth=({r,m})=>r.depth*groundCos+(r.height+m.support)*groundSin;
  parts.sort((a,b)=>depth(a)-depth(b));
  for(const {r,m} of parts)drawStick(ctx,r,m);
}

export function drawThrow(ctx,width,height,plan,elapsedMs) {
  if(!ctx||width<=0||height<=0)return;
  const scale=Math.min(width*.445,height*.63)/length;
  const cam=camera(width,height,scale,.55);
  const parts=bodies(sampleThrow(plan,elapsedMs).map(r=>stageRod(r,cam)),cam);
  const frame=frameThrow(parts,cam);
  backdrop(ctx,width,height);
  ctx.save();ctx.scale(scale,scale);ctx.translate(frame.x,frame.y);ctx.scale(frame.zoom,frame.zoom);
  ctx.lineJoin='round';ctx.lineCap='round';renderBodies(ctx,parts,cam,plan,elapsedMs);ctx.restore();
}

// The rack uses the same meshes, end grain, face marks and light as the throw.
// Its positions are in reading order so a supplied result remains legible.
export function drawRack(ctx,width,height,faces=null) {
  if(!ctx||width<=0||height<=0)return;
  const wide=width/height>=1.58;
  const scale=Math.min(width*(wide?.383:.72),height*(wide?1.40:.78))/length;
  const cam=camera(width,height,scale,.50);
  const layout=wide
    ? [[-.239,-.225,-.045],[.239,-.225,.035],[-.239,.220,.050],[.239,.220,-.04]]
    : [[-.035,-.344,-.085],[.03,-.118,-.050],[-.025,.110,-.080],[.045,.340,-.045]];
  const parts=bodies(layout.map(([x,y,yaw],i)=>{
    const face=faces?.[i]??[0,1,0,1][i];
    // Invert the ground perspective so all rows are centered inside the tray.
    const planeY=y*cam.h+radius*.14;
    const depth=planeY/(groundSin+planeY*groundCos/cam.distance);
    return {index:i,face,yaw,roll:face?0:Math.PI,pitch:0,height:0,
      x:x*cam.w*(1-depth*groundCos/cam.distance),depth};
  }),cam);
  backdrop(ctx,width,height);
  ctx.save();ctx.scale(scale,scale);ctx.lineJoin='round';ctx.lineCap='round';
  renderBodies(ctx,parts,cam,null,0);ctx.restore();
}

export function createToss(canvas) {
  const ctx=canvas.getContext('2d');let running=null;
  function cancel(){
    if(!running)return;
    const run=running;running=null;cancelAnimationFrame(run.frame);clearTimeout(run.deadline);
    run.resizeObserver?.disconnect();window.removeEventListener('resize',run.resize);run.resolve();
  }
  function play(faces,seed,onSettle){
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
