// Square wooden board, drawn and picked with the same front-facing orthographic camera.
const TAU = Math.PI * 2;
const TEAM = ['#ed7057', '#239b90', '#9661c5', '#dfad38'];
const c = 4.05;
const nodes = [[c,c]];
for (let i=1;i<=5;i++) nodes.push([c,c-i*c*2/5]);
for (let i=1;i<=5;i++) nodes.push([c-i*c*2/5,-c]);
for (let i=1;i<=5;i++) nodes.push([-c,-c+i*c*2/5]);
for (let i=1;i<5;i++) nodes.push([-c+i*c*2/5,c]);
nodes.push([2*c/3,-2*c/3],[c/3,-c/3],[0,0],[-c/3,c/3],[-2*c/3,2*c/3],
  [-2*c/3,-2*c/3],[-c/3,-c/3],[c/3,c/3],[2*c/3,2*c/3]);
const tracks = [[...Array.from({length:20},(_,n)=>n),0],[5,20,21,22,23,24,15],[10,25,26,22,27,28,0]];
const types = nodes.map((_,i) => i===0?'start':i===22?'center':[5,10,15].includes(i)?'corner':
  [3,16].includes(i)?'stone':[8,13].includes(i)?'whirl':[6,18].includes(i)?'breeze':i>=20?'path':'normal');
const pi = Math.PI;
function mix(color,other,amt) {
  const val = s => {
    if(s[0]==='#') return parseInt(s.slice(1),16);
    const [r,g,b]=s.match(/\d+/g).map(Number);return (r<<16)|(g<<8)|b;
  };
  const a=val(color), b=val(other);
  const parts=[16,8,0].map(i=>Math.round(((a>>i)&255)*(1-amt)+((b>>i)&255)*amt));
  return 'rgb('+parts.join(',')+')';
}
function rounded(x,z,w,d,r) {
  const pts=[];
  for(const [cx,cz,start] of [[x+w/2-r,z+d/2-r,0],[x-w/2+r,z+d/2-r,pi/2],[x-w/2+r,z-d/2+r,pi],[x+w/2-r,z-d/2+r,3*pi/2]]) {
    for(let j=0;j<=6;j++){const a=start+j*pi/12;pts.push([cx+r*Math.cos(a),cz+r*Math.sin(a)]);}
  }
  return pts;
}
function ring(x,z,rx,rz,count=16,phase=0) {
  return Array.from({length:count},(_,i)=>{const a=phase+i*TAU/count;return [x+rx*Math.cos(a),z+rz*Math.sin(a)];});
}
const mapAt = (pts,y) => pts.map(([x,z])=>[x,y,z]);

export function createBoard(canvas,chooseDestination,choosePawn,dropPawn) {
  const ctx = canvas.getContext('2d');
  if(!ctx) return {setState(){},setMoves(){},setTargets(){},rotate(){},destroy(){}};
  let width=0,height=0,scale=1,ox=0,oy=0;
  let angle=0,cos=1,sin=0,tilt=.8,lift=.6;
  let turnFrom=angle,turnTo=angle,turnStart=0,moves=[],pieces=[],reserves=[],activeTeam=0;
  let frame=0,dead=false;
  const reduced=()=>typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dep=(x,z)=>-x*sin+z*cos;
  let targets=[],options=[],selected=null,gesture=null,drawnPawns=[],skipClick=null;
  const horizontal=(x,z)=>x*cos+z*sin;
  function project([x,y,z]) {
    return [ox+horizontal(x,z)*scale,oy+(dep(x,z)*tilt-y*lift)*scale];
  }
  function flat(points,color) {
    if(!points.length)return;
    ctx.beginPath();for(let i=0;i<points.length;i++){const [x,y]=points[i];if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
    ctx.closePath();ctx.fillStyle=color;ctx.fill();
  }
  function face(pts,col) {flat(pts.map(project),col);}
  function line(pts,col,weight=.04) {
    ctx.beginPath();pts.map(project).forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.lineWidth=Math.max(.55,weight*scale);ctx.strokeStyle=col;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
  }
  function feature(x,z,heightWorld,rx,rz,color) {face(mapAt(ring(x,z,rx,rz,24),heightWorld),color);}
  function walls(lower,y1,upper,y2,col) {
    const visible=[];
    for(let i=0;i<lower.length;i++){
      const j=(i+1)%lower.length,a=lower[i],b=lower[j],v=upper[i],w=upper[j];
      const dx=b[0]-a[0],dz=b[1]-a[1],dy=y2-y1;
      const nx=dz*dy,ny=dx*(v[1]-a[1])-dz*(v[0]-a[0]),nz=-dx*dy;
      const len=Math.hypot(nx,ny,nz)||1,u=horizontal(nx,nz)/len,h=ny/len,d=dep(nx,nz)/len;
      if(d*lift+h*tilt<=0)continue;
      const light=-u*.56+h*.76-d*.24;
      const tint=light>0?mix(col,'#fff8e8',light*.18):mix(col,'#122825',-light*.30);
      visible.push({depth:dep(a[0]+b[0],a[1]+b[1]),color:tint,points:[[a[0],y1,a[1]],[b[0],y1,b[1]],[w[0],y2,w[1]],[v[0],y2,v[1]]]});
    }
    visible.sort((a,b)=>a.depth-b.depth);
    for(const side of visible)face(side.points,side.color);
  }
  function solid(low,high,bottom,top,side,lid){walls(low,bottom,high,top,side);face(mapAt(high,top),lid);}
  function column(x,z,rb,rt,b,t,side,lid=side,n=28){solid(ring(x,z,rb,rb,n),ring(x,z,rt,rt,n),b,t,side,lid);}
  const surface=.13;
  const edge=w=>rounded(0,0,w,w,.40);
  function nodeHeight(n){return [0,5,10,15,22].includes(n)?.285:.235;}
  function castShadow(x,z,y,rx,rz,objectHeight,strength){
    const [cx,cy]=project([x,y,z]),reach=objectHeight*.48;
    const grad=ctx.createRadialGradient(0,0,.02,0,0,1);
    grad.addColorStop(0,'rgba(2,12,16,'+strength+')');
    grad.addColorStop(.55,'rgba(2,12,16,'+(strength*.72)+')');
    grad.addColorStop(1,'rgba(2,12,16,0)');
    ctx.save();
    ctx.translate(cx+reach*scale*.65,cy+reach*scale*tilt*.45);
    ctx.scale(Math.max(1,(rx+reach*.42)*scale),Math.max(1,(rz+reach*.32)*scale*tilt));
    ctx.beginPath();ctx.arc(0,0,1,0,TAU);ctx.fillStyle=grad;ctx.fill();ctx.restore();
  }
  function table(){
    const glow=ctx.createLinearGradient(0,0,width*.36,height);
    glow.addColorStop(0,'#213b3c');glow.addColorStop(1,'#102429');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
    for(const [w,z,alpha] of [[10.20,.10,.12],[10.11,.06,.22]]){
      const shadow=edge(w).map(([a,b])=>[a-z*sin,b+z*cos]);
      face(mapAt(shadow,-.39),'rgba(5,16,17,'+alpha+')');
    }
    solid(edge(9.89),edge(10.03),-.35,-.26,'#866e56','#ac9173');
    solid(edge(10.03),edge(10.03),-.26,.018,'#b39778','#ccb396');
    solid(edge(10.03),edge(9.96),.018,.078,'#c5aa8b','#d4bd9e');
    const mat=edge(9.76);
    solid(mat,mat,.078,surface,'#2f4a45','#254740');
    for(const route of tracks){
      line(mapAt(route.map(n=>nodes[n]),surface+.004),route.length===21?'#dedbc7':'#bdc8b8',route.length===21?.070:.056);
    }
  }
  // The six event marks match the symbols in the game rules.
  function tile(n){
    const [x,z]=nodes[n],type=types[n],y=nodeHeight(n);
    const main=y>.25,event=['stone','whirl','breeze'].includes(type),r=main?.59:event?.45:.365;
    const color={stone:'#e2b29f',whirl:'#c9c3d8',breeze:'#b1d5bf',start:'#dce7d8'}[type]||'#e8e5d7';
    castShadow(x,z,surface+.003,r*1.09,r*1.04,y-surface,.39);
    column(x,z,r,r,surface+.008,y-.036,mix(color,'#647064',.33),color);
    column(x,z,r,r-.036,y-.036,y,color,color);
    const trace=(pts,col,w)=>line(pts.map(([a,b])=>[x+a*r,y+.008,z+b*r]),col,w*r);
    const ink=(pts,col)=>face(pts.map(([a,b])=>[x+a*r,y+.009,z+b*r]),col);
    if(type==='start'){
      trace([[-.24,.43],[-.24,-.45]],'#2c5750',.12);
      ink([[-.24,-.43],[.40,-.43],[.21,-.20],[.40,.02],[-.24,.02]],'#2c5750');
    }else if(type==='stone'){
      ink([[-.50,.29],[-.09,-.45],[.08,-.23],[.18,-.34],[.50,.29]],'#714b3c');
    }else if(type==='whirl'){
      const curl=Array.from({length:32},(_,j)=>{const r=.46*(1-j/35),a=j*.33;return [r*Math.cos(a),r*Math.sin(a)];});
      trace(curl,'#615779',.12);
    }else if(type==='breeze'){
      for(const a of [-.41,-.02])trace([[a,-.30],[a+.33,0],[a,.30]],'#385e50',.13);
    }else if(n===5||n===10||n===22){
      ink([[0,-.19],[.19,0],[0,.19],[-.19,0]],'#63796c');
    }
  }
  function pawn(p,x,z,y,size){
    const base=TEAM[p.team]||TEAM[0],cap=mix(base,'#fff6e4',.21);
    column(x,z,.31*size,.34*size,y,y+.056*size,mix(base,'#263f3a',.35),base);
    column(x,z,.34*size,.31*size,y+.056*size,y+.245*size,base,base);
    column(x,z,.31*size,.265*size,y+.245*size,y+.295*size,cap,cap);
    const [sx,sy]=project([x,y+.299*size,z]);
    ctx.save();ctx.translate(sx,sy);ctx.scale(1,Math.max(.69,tilt));
    ctx.fillStyle='#20302d';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='700 '+Math.max(7,Math.round(.37*size*scale))+'px system-ui, sans-serif';
    ctx.fillText(String(p.index+1),0,0);ctx.restore();
  }
  const rack={x:.48,z:2.80};
  function rackPoint(x,z){
    return [rack.x+x*cos-z*sin,rack.z+x*sin+z*cos];
  }
  function reservePositions(){
    return reserves.filter(p=>p.team===activeTeam).map(p=>{
      const [x,z]=rackPoint((p.index-.5)*1.18,0);
      return {p,x,z,y:surface+.042,ground:surface+.042,size:1,from:-1};
    });
  }
  function reserveTray(){
    const bed=rounded(0,0,2.32,.96,.36).map(([x,z])=>rackPoint(x,z));
    solid(bed,bed,surface+.004,surface+.033,'#36544b','#33534a');
    for(const offset of [-.59,.59]){
      const [x,z]=rackPoint(offset,0);
      feature(x,z,surface+.038,.355,.355,'#28483e');
    }
  }
  function pawnPositions(time){
    const positions=[],groups=new Map();
    for(const p of pieces){
      const group=groups.get(p.node)||[];
      group.push(p);groups.set(p.node,group);
    }
    for(const [node,group] of groups){
      const [nx,nz]=nodes[node],ground=nodeHeight(node)+.004;
      group.forEach((p,i)=>{
        const offset=(i-(group.length-1)/2)*.4,size=group.length>1?.80:1;
        let x=nx+offset*cos,z=nz+offset*sin,y=ground;
        const step=moves.find(move=>move.team===p.team&&move.index===p.index);
        if(step){
          const t=Math.max(0,Math.min(1,(time-step.start)/265));
          x=step.from[0]*(1-t)+x*t;z=step.from[1]*(1-t)+z*t;
          y+=Math.sin(pi*t)*.53;
        }
        positions.push({p,x,z,y,ground,size,from:node});
      });
    }
    return positions;
  }
  function paint(time) {
    frame=0;if(dead||!width||!height)return;
    if(turnStart){const t=Math.min(1,(time-turnStart)/420);angle=turnFrom+(turnTo-turnFrom)*(1-(1-t)**3);if(t===1)turnStart=0;}
    // Exact quarter turns preserve horizontal edges at rest.
    if(turnStart){cos=Math.cos(angle);sin=Math.sin(angle);}
    else{
      const cardinal=(Math.round(angle/(pi/2))%4+4)%4;
      cos=[1,0,-1,0][cardinal];sin=[0,1,0,-1][cardinal];
    }
    const span=10.03*(Math.abs(cos)+Math.abs(sin));
    tilt=Math.min(.90,Math.max(.44,height/width*1.02));
    lift=Math.sqrt(1-tilt*tilt);
    const pad=Math.max(3,Math.min(10,Math.min(width,height)*.014));
    // Fit the panel, beveled coins, obstacles and any raised pawn to the same camera.
    const actors=pawnPositions(time),reserve=reservePositions();
    drawnPawns=[...actors,...reserve];
    const farthest=c*(Math.abs(cos)+Math.abs(sin));
    let top=Math.min(-span*.5*tilt-surface*lift,-(farthest+.81)*tilt-.33*lift);
    for(const a of actors)top=Math.min(top,(dep(a.x,a.z)-.22*a.size)*tilt-(a.y+.30*a.size)*lift);
    const bottom=(span*.5+.08)*tilt+.39*lift;
    scale=Math.min((width-pad*2)/span,(height-pad*2)/(bottom-top));
    ox=width/2;oy=height/2-(top+bottom)*scale/2;
    table();
    const display=nodes.map(([x,z],n)=>({order:dep(x,z),draw:()=>tile(n)}));
    if(reserve.length)display.push({order:dep(rack.x,rack.z)-1,draw:reserveTray});
    for(const actor of drawnPawns){
      const {p,x,z,y,ground,size}=actor;
      if(isLifted(actor))continue;
      display.push({order:dep(x,z)+.16,draw:()=>{
        castShadow(x,z,ground,.36*size,.35*size,.31+y-ground,.45);
        if(p.team===activeTeam&&optionFor(actor)?.index===selected){
          const path=mapAt(ring(x,z,.425*size,.425*size,32),ground+.004);
          line([...path,path[0]],'#ecdbab',.055);
        }
        pawn(p,x,z,y,size);
      }});
    }
    display.sort((a,b)=>a.order-b.order);
    for(const v of display)v.draw();
    const allowed=destinationNodes(),over=gesture?.moved?destinationAt(gesture.x,gesture.y,allowed):null;
    for(const n of allowed){
      const [x,z]=nodes[n],y=targetHeight(n),radius=nodeHeight(n)>.25?.74:.62;
      if(n===over)feature(x,z,y,radius,radius,'rgba(252,231,158,.30)');
      const path=mapAt(ring(x,z,radius,radius,48),y);
      line([...path,path[0]],'#fff5cf',n===over?.105:.073);
    }
    if(gesture?.moved)drawLifted();
    moves=moves.filter(m=>time-m.start<265);
    if(turnStart||moves.length)schedule();
  }
  function schedule(){if(!dead&&!frame)frame=requestAnimationFrame(paint);}
  function resize() {
    const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;
    if(gesture){gesture.x=gesture.clientX-rect.left;gesture.y=gesture.clientY-rect.top;}
    const ratio=Math.min(window.devicePixelRatio||1,2);
    const w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx.setTransform(ratio,0,0,ratio,0,0);schedule();
  }
  const ro=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
  if(ro)ro.observe(canvas);else window.addEventListener('resize',resize);
  function optionFor(actor){
    const here=options.filter(o=>o.team===actor.p.team&&o.from===actor.from);
    return here.find(o=>o.index===actor.p.index)??(actor.from>=0?here[0]:null);
  }
  function isLifted(actor){
    return gesture?.moved&&actor.p.team===gesture.team&&actor.from===gesture.from&&
      (actor.from>=0||actor.p.index===gesture.index);
  }
  function targetHeight(n){return nodeHeight(n)+.025;}
  function destinationNodes(){
    const index=gesture?.index??selected;
    if(!options.length)return targets;
    return [...new Set(options.filter(o=>o.team===activeTeam&&(index==null||o.index===index)).map(o=>o.to))];
  }
  function destinationAt(px,py,allowed){
    let nearest=null,distance=Math.max(22,scale*.78);
    for(const n of allowed){
      const [x,z]=nodes[n],[sx,sy]=project([x,targetHeight(n),z]);
      const d=Math.hypot(px-sx,py-sy);
      if(d<distance){nearest=n;distance=d;}
    }
    return nearest;
  }
  function pieceAt(px,py){
    let nearest=null,distance=Math.max(22,.49*scale);
    for(const actor of drawnPawns){
      const option=optionFor(actor);
      if(!option||option.team!==activeTeam)continue;
      const [x,y]=project([actor.x,actor.y+.25*actor.size,actor.z]),d=Math.hypot(px-x,py-y);
      if(d<distance){nearest=option;distance=d;}
    }
    return nearest;
  }
  function drawLifted(){
    const g=gesture,base=surface+.01,u=(g.x-ox)/scale,d=((g.y-oy)/scale+base*lift)/tilt;
    const x=u*cos-d*sin,z=u*sin+d*cos;
    const carried=drawnPawns.filter(isLifted);
    castShadow(x,z,base,.40,.38,.68,.56);
    carried.forEach((actor,i)=>{
      const stacked=carried.length>1,offset=stacked?(i-(carried.length-1)/2)*.33:0;
      pawn(actor.p,x+offset*cos,z+offset*sin,base+.45+i*.045,stacked?.83:1);
    });
  }
  function local(event){
    const rect=canvas.getBoundingClientRect();
    return [event.clientX-rect.left,event.clientY-rect.top];
  }
  function closeGesture(blockClick){
    if(!gesture)return;
    const g=gesture;gesture=null;
    if(blockClick)skipClick={x:g.x,y:g.y,until:performance.now()+650};
    if(g.captured&&canvas.hasPointerCapture?.(g.id))canvas.releasePointerCapture?.(g.id);
    if(g.fallback){
      window.removeEventListener('pointermove',pointerMove);
      window.removeEventListener('pointerup',pointerUp);
      window.removeEventListener('pointercancel',pointerCancel);
    }
    if(canvas.style)canvas.style.cursor='';
    schedule();
  }
  function pointerDown(event){
    if(!options.length||gesture||event.isPrimary===false||(event.button!=null&&event.button!==0))return;
    skipClick=null;
    const [x,y]=local(event);
    if(selected!=null&&destinationAt(x,y,destinationNodes())!=null)return;
    const option=pieceAt(x,y);
    if(!option)return;
    const id=event.pointerId??0;
    const g={...option,id,x,y,startX:x,startY:y,clientX:event.clientX,clientY:event.clientY,moved:false};
    gesture=g;selected=option.index;
    try{if(canvas.setPointerCapture){canvas.setPointerCapture(id);g.captured=true;}}catch{/* detached before capture */}
    if(!g.captured){
      g.fallback=true;
      window.addEventListener('pointermove',pointerMove);window.addEventListener('pointerup',pointerUp);
      window.addEventListener('pointercancel',pointerCancel);
    }
    event.preventDefault?.();
    choosePawn?.(option.index);
    schedule();
  }
  function updatePointer(event){
    const g=gesture;
    [g.x,g.y]=local(event);g.clientX=event.clientX;g.clientY=event.clientY;
    if(!g.moved&&Math.hypot(g.x-g.startX,g.y-g.startY)>5)g.moved=true;
  }
  function pointerMove(event){
    if(!gesture||gesture.id!==(event.pointerId??0))return;
    updatePointer(event);
    if(gesture.moved){
      if(canvas.style)canvas.style.cursor='grabbing';
      event.preventDefault?.();schedule();
    }
  }
  function pointerUp(event){
    if(!gesture||gesture.id!==(event.pointerId??0))return;
    updatePointer(event);
    const g=gesture,to=g.moved?destinationAt(g.x,g.y,destinationNodes()):null;
    closeGesture(true);event.preventDefault?.();
    if(to!=null){
      if(dropPawn)dropPawn(g.index,to);
      else chooseDestination?.(to);
    }
  }
  function pointerCancel(event){
    if(gesture&&gesture.id===(event.pointerId??0))closeGesture(true);
  }
  function tap(event){
    const [x,y]=local(event);
    if(skipClick&&performance.now()<=skipClick.until&&Math.hypot(x-skipClick.x,y-skipClick.y)<32){skipClick=null;return;}
    const node=destinationAt(x,y,destinationNodes()),option=pieceAt(x,y);
    if(option&&(selected==null||node==null)){
      selected=option.index;choosePawn?.(option.index);schedule();return;
    }
    if(node!=null)chooseDestination?.(node);
  }
  const listeners={pointerdown:pointerDown,pointermove:pointerMove,pointerup:pointerUp,pointercancel:pointerCancel,lostpointercapture:pointerCancel,click:tap};
  for(const [type,listener] of Object.entries(listeners))canvas.addEventListener(type,listener);
  resize();
  return {
    setTargets(destinations) {
      targets=[...new Set(destinations.filter(n=>nodes[n]))];
      canvas.classList.toggle('choosing',targets.length>0||options.length>0);schedule();
    },
    setMoves(available=[],selectedIndex=null){
      options=available.filter(o=>o&&TEAM[o.team]&&[0,1].includes(o.index)&&(o.from===-1||nodes[o.from])&&nodes[o.to]);
      selected=Number.isInteger(selectedIndex)?selectedIndex:null;
      if(gesture&&!options.some(o=>o.index===gesture.index&&o.team===gesture.team&&o.from===gesture.from))closeGesture(true);
      canvas.classList.toggle('choosing',options.length>0||targets.length>0);
      if(canvas.style)canvas.style.touchAction=options.length?'none':'';
      schedule();
    },
    setState(next={}) {
      const list=Array.isArray(next.pieces)?next.pieces.filter(p=>p&&nodes[p.node]).map(p=>({...p})):[];
      if(next.snap)moves=[];
      else if(!reduced()){
        const now=performance.now();
        moves=moves.filter(v=>now-v.start<265);
        for(const p of list){
          const prev=pieces.find(o=>o.team===p.team&&o.index===p.index);
          if(prev&&prev.node===p.node)continue;
          moves=moves.filter(v=>v.team!==p.team||v.index!==p.index);
          moves.push({team:p.team,index:p.index,from:nodes[prev?.node]??nodes[0],start:now});
        }
      }
      reserves=Array.isArray(next.waiting)?next.waiting.filter(p=>p&&TEAM[p.team]&&[0,1].includes(p.index)).map(p=>({...p})):[];
      pieces=list;activeTeam=next.activeTeam;
      if(gesture&&gesture.team!==activeTeam)closeGesture(true);
      schedule();
    },
    rotate(direction=1) {
      turnFrom=angle;turnTo+=(direction<0?-1:1)*pi/2;
      if(reduced()){angle=turnTo;turnStart=0;} else turnStart=performance.now();
      schedule();
    },
    destroy(){
      dead=true;closeGesture(false);
      if(frame)cancelAnimationFrame(frame);
      for(const [type,listener] of Object.entries(listeners))canvas.removeEventListener(type,listener);
      ro?.disconnect();window.removeEventListener('resize',resize);
    }
  };
}
