// The 600 × 400 scene uses orthographic projection. x and depth are floor
// coordinates. height is the gap between the lowest point of a stick and the mat.
const W = 600, H = 400, TAU = Math.PI * 2;
const groundCos = .80, groundSin = .60, originY = 267;
const length = 116, radius = 11, facets = 14;
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
  const targets=[[-108,-64],[100,-70],[-96,64],[110,60]];
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
    const yaw=flip*[-.98,.36,1.20,-.30][i]+between(-.17,.17), roll=face?0:Math.PI;
    return {index:i,face,delay,flight,bounce,hop,slide,finish,
      x0:-81+i*14+bias, d0:102+i*4, contactX:group*40+dir*9+bias,
      contactD:group*18-dir*9, endX:endX+between(-8,8),endDepth:endDepth+between(-6,6),
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

function mat(ctx) {
  const grad=ctx.createLinearGradient(0,0,W,H);
  grad.addColorStop(0,'#f8dfab');grad.addColorStop(.56,'#e9c994');grad.addColorStop(1,'#d6b17f');
  ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
  // The small staggered warp is painted once per canvas.
  for(let row=0;row<100;row++){
    const y=row*4+1.5;
    ctx.fillStyle=row%3===0?'rgba(116,72,38,.095)':'rgba(128,82,45,.055)';
    ctx.fillRect(0,y,W,.65);
    for(let x=-16+(row%2)*8;x<W;x+=16){
      ctx.fillStyle='rgba(255,245,207,.25)';ctx.fillRect(x,y+.8,7.6,.85);
      ctx.fillStyle='rgba(144,102,58,.09)';ctx.fillRect(x+7.8,y+.6,.8,2.7);
    }
  }
  for(const [inset,tone,weight] of [[8,'#9b805a',1],[12,'#a98b64',2],[19,'#a98b64',.9],[25,'rgba(142,105,64,.35)',.7]]){
    ctx.strokeStyle=tone;ctx.lineWidth=weight;ctx.strokeRect(inset,inset,W-2*inset,H-2*inset);
  }
  ctx.strokeStyle='rgba(116,97,63,.58)';ctx.lineWidth=1;
  for(const [x,y,angle] of [[16,16,0],[W-16,16,Math.PI/2],[W-16,H-16,Math.PI],[16,H-16,-Math.PI/2]]){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    ctx.beginPath();ctx.moveTo(2,39);ctx.lineTo(2,13);ctx.lineTo(13,13);ctx.lineTo(13,2);ctx.lineTo(39,2);ctx.stroke();ctx.restore();
  }
}
const matCache=new WeakMap();
function backdrop(ctx) {
  let image=matCache.get(ctx);
  if(!image){
    if(typeof OffscreenCanvas==='function')image=new OffscreenCanvas(W,H);
    else if(ctx.canvas?.ownerDocument)image=ctx.canvas.ownerDocument.createElement('canvas');
    if(image){image.width=W;image.height=H;mat(image.getContext('2d'));matCache.set(ctx,image);}
  }
  if(image)ctx.drawImage(image,0,0);else mat(ctx);
}

function orient(r) {
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
    return [W*.5+r.x+dx,originY+(r.depth+dd)*groundSin-(r.height+support+dh)*groundCos];
  }
  return {vector,point,support};
}
function polygon(ctx,pts,color) {
  ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=color;ctx.fill();
}
function stroke(ctx,pts,color,width) {
  ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function tint(base,normal) {
  const light=Math.max(0,-.44*normal[0]-.38*normal[1]+.805*normal[2]);
  const k=.74+.31*light;
  return 'rgb('+base.map(v=>Math.min(255,Math.round(v*k))).join(',')+')';
}

function drawStick(ctx,r,model) {
  const {point,vector}=model, side=length/2;
  const visible=n=>n[1]*groundCos+n[2]*groundSin>.001;
  // Convex solid, so visible face interiors do not overlap.
  for(let i=0;i<facets;i++){
    const theta=(i+.5)*Math.PI/facets, normal=vector(0,Math.cos(theta),-Math.sin(theta));
    if(!visible(normal))continue;
    const a=cross[i],b=cross[i+1];
    const color=tint([188+Math.sin(theta*8)*4,126,72],normal);
    polygon(ctx,[point(-side,...a),point(side,...a),point(side,...b),point(-side,...b)],color);
    // Subtle grain follows the curvature of each individual segment.
    if(i%2===1){
      const sec=section(theta);
      stroke(ctx,[point(-side+3,...sec),point(-12,sec[0]+.12,sec[1]+.12),point(side-3,...sec)],'rgba(103,57,29,.21)',.65);
    }
    for(const cut of [-side+5,side-5])stroke(ctx,[point(cut,...a),point(cut,...b)],'rgba(94,55,33,.48)',1.0);
    const left=Math.max(i*Math.PI/facets,.60),right=Math.min((i+1)*Math.PI/facets,Math.PI-.60);
    if(left<right){
      const mark=(t,dir,center)=>point(center+dir*(t-Math.PI/2)*8.0,...section(t));
      for(const center of [-24,0,24]){
        for(const dir of [-1,1])stroke(ctx,[mark(left,dir,center),mark(right,dir,center)],'#613c2c',2.65);
      }
    }
  }
  const faceNormal=vector(0,0,1);
  if(visible(faceNormal)){
    const f=(x,y)=>point(x,y,radius*.31);
    polygon(ctx,[f(-side,-radius),f(side,-radius),f(side,radius),f(-side,radius)],tint([253,220,162],faceNormal));
    for(const sy of [-1,1]){
      stroke(ctx,[f(-side,sy*(radius-.9)),f(side,sy*(radius-.9))],sy>0?'#bb8b57':'#f4d9a5',1.4);
      stroke(ctx,[f(-side+4,sy*(radius-2.6)),f(-12,sy*(radius-3.3)),f(side-3,sy*(radius-2.6))],'rgba(155,103,57,.34)',.75);
    }
    stroke(ctx,[f(-side+9,2.2),f(-34,1),f(-11,1.9),f(0,.4),f(33,.95),f(side-8,-1.4)],'rgba(166,117,68,.46)',.75);
    stroke(ctx,[f(-side+15,-4.9),f(-1,-3.4),f(15,-5.2),f(35,-4.1)],'rgba(179,128,73,.38)',.75);
  }
  for(const sign of [-1,1]){
    const capNormal=vector(sign,0,0);
    if(!visible(capNormal))continue;
    polygon(ctx,cross.map(([s,h])=>point(sign*side,s,h)),tint([215,174,113],capNormal));
    for(const scale of [.55,.74]){
      const pts=cross.map(([s,h])=>point(sign*side,s*scale,(h-radius*.31)*scale+radius*.31-1));
      stroke(ctx,pts,'rgba(122,79,41,.48)',.70);
    }
  }
}
function drawShadow(ctx,r,m) {
  const t=clamp(r.height/220),angle=Math.atan2(Math.sin(r.yaw)*groundSin,Math.cos(r.yaw));
  const x=W*.5+r.x+4+r.height*.105, y=originY+r.depth*groundSin+2+r.height*.045;
  const footprint=Math.hypot(Math.cos(r.yaw),Math.sin(r.yaw)*groundSin);
  const half=length*.49*Math.abs(Math.cos(r.pitch))*footprint+5;
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);
  for(let i=4;i>=0;i--){
    ctx.beginPath();ctx.ellipse(0,0,Math.max(7,half)+i*(1.5+3*t),radius*.62+i*(1.2+2.4*t),0,0,TAU);
    ctx.fillStyle='rgba(74,46,24,'+((.06-.036*t)*(1-.10*i))+')';ctx.fill();
  }
  if(r.height<2&&m.support<22){
    ctx.beginPath();ctx.ellipse(0,-.9,Math.max(6,half-2),radius*.42,0,0,TAU);ctx.fillStyle='rgba(80,48,26,.13)';ctx.fill();
  }
  ctx.restore();
}
function impactDust(ctx,r,time) {
  const u=clamp((time-r.delay-r.flight)/215);
  if(u===0||u===1)return;
  for(let i=0;i<6;i++){
    const a=i*TAU/6+r.index*.84;
    const x=W*.5+r.contactX+Math.cos(a)*(14+u*23);
    const y=originY+(r.contactD+Math.sin(a)*(15+u*25))*groundSin-13*Math.sin(u*Math.PI);
    ctx.beginPath();ctx.ellipse(x,y,1.7*(1-u)+.4,.8,0,0,TAU);ctx.fillStyle='rgba(244,229,190,'+(.70*(1-u))+')';ctx.fill();
  }
}

export function drawThrow(ctx,width,height,plan,elapsedMs) {
  if(!ctx||width<=0||height<=0)return;
  ctx.save();ctx.scale(width/W,height/H);backdrop(ctx);ctx.lineJoin='round';ctx.lineCap='round';
  const sticks=sampleThrow(plan,elapsedMs).map(r=>({r,m:orient(r)}));
  sticks.forEach(({r,m})=>drawShadow(ctx,r,m));
  plan.rods.forEach(r=>impactDust(ctx,r,elapsedMs));
  const depth=({r,m})=>r.depth*groundCos+(r.height+m.support)*groundSin;
  sticks.sort((a,b)=>depth(a)-depth(b));
  sticks.forEach(({r,m})=>drawStick(ctx,r,m));ctx.restore();
}

export function createToss(canvas) {
  const ctx=canvas.getContext('2d');let running=null;
  function cancel(){
    if(!running)return;
    const run=running;running=null;cancelAnimationFrame(run.frame);clearTimeout(run.deadline);run.resolve();
  }
  function play(faces,seed,onSettle){
    cancel();
    const plan=createThrow(faces,seed);
    if(!ctx){onSettle?.();return Promise.resolve();}
    const bounds=canvas.getBoundingClientRect(),ratio=Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.max(1,Math.round(bounds.width*ratio));canvas.height=Math.max(1,Math.round(bounds.height*ratio));
    return new Promise(resolve=>{
      const run={resolve,frame:0,deadline:0,settled:false},start=performance.now();running=run;
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
