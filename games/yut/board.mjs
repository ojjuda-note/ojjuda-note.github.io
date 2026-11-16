import { drawZodiac } from './zodiac.mjs?v=1';

// A square lacquer board viewed by a level, front-facing orthographic camera.
const TAU = Math.PI * 2;
const TEAM = ['#ed7057', '#239b90', '#9661c5', '#dfad38'];
const PEARL=['#fff1cd','#f1f3e4','#c5e8e1','#d0d3eb','#ead0df','#f7ddc7'];
const GOLD='#ffe3a2';
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
function seeded(n) { const t=Math.sin(n*104.7+13.3)*43758.55;return t-Math.floor(t); }
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
function stampShape(points,x,z,size,y) { return points.map(([px,pz])=>[x+px*size,y,z+pz*size]); }

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
  function flat(points, color, stroke, lineWidth=1) {
    if(!points.length)return;
    ctx.beginPath();for(let i=0;i<points.length;i++){const [x,y]=points[i];if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
    ctx.closePath();ctx.fillStyle=color;ctx.fill();
    if(stroke){ctx.lineWidth=lineWidth;ctx.strokeStyle=stroke;ctx.stroke();}
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
      // Directional moonlight from the upper left and a small polished rim highlight.
      const light=-u*.62+h*.74-d*.26;
      const half=Math.hypot(.62,.74+tilt,lift-.26);
      const glint=Math.max(0,(-u*.62+h*(.74+tilt)+d*(lift-.26))/half)**19;
      const tint=light>.10 ? mix(col,'#fff2cb',Math.min(.64,(light-.1)*.34+glint*.28)) : mix(col,'#092128',Math.min(.48,(.1-light)*.49));
      visible.push({depth:dep(a[0]+b[0],a[1]+b[1]),color:tint,points:[[a[0],y1,a[1]],[b[0],y1,b[1]],[w[0],y2,w[1]],[v[0],y2,v[1]]]});
    }
    visible.sort((a,b)=>a.depth-b.depth);
    for(const side of visible)face(side.points,side.color);
  }
  function solid(low,high,bottom,top,side,lid){walls(low,bottom,high,top,side);face(mapAt(high,top),lid);}
  function box(x,z,w,d,b,t,side,lid=side,r=.035) {const v=rounded(x,z,w,d,Math.min(r,w/2,d/2));solid(v,v,b,t,side,lid);}
  function column(x,z,rb,rt,b,t,side,lid=side,n=12) {solid(ring(x,z,rb,rb,n),ring(x,z,rt,rt,n),b,t,side,lid);}
  const surface=.13;
  function wire(path,color,weight,y=surface+.008){line(mapAt(path,y),color,weight);}
  function outline(path,color,weight,y){wire([...path,path[0]],color,weight,y);}
  function glaze(x,y,u,v,stops){
    const g=ctx.createLinearGradient(x,y,u,v);for(const [t,col] of stops)g.addColorStop(t,col);return g;
  }
  const edge=w=>rounded(0,0,w,w,.42);
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
  function clasps(){
    for(let side=0;side<4;side++){
      const c=[1,0,-1,0][side],s=[0,1,0,-1][side];
      if(dep(-s,c)<.08)continue;
      const pt=(x,y,d=5.02)=>[x*c-d*s,y,x*s+d*c];
      for(const mid of [-3.93,3.93]){
        const corners=[[-.23,-.16],[.23,-.16],[.19,-.29],[.12,-.33],[.10,-.43],[-.10,-.43],[-.12,-.33],[-.19,-.29]];
        face(corners.map(([u,h])=>pt(mid+u,h)),'#cfb27d');
        line([pt(mid-.19,-.19),pt(mid+.19,-.19)],'#ffebbc',.022);
        line([pt(mid,-.27),pt(mid,-.34)],'#605443',.033);
      }
      if(side===0){
        const plate=[[-.32,-.22],[-.14,-.21],[0,-.265],[.14,-.21],[.32,-.22],[.25,-.34],[.15,-.37],[.08,-.43],[-.08,-.43],[-.15,-.37],[-.25,-.34]];
        face(plate.map(([u,h])=>pt(u,h)),'#dbc08a');
        line([pt(-.24,-.25),pt(-.13,-.25),pt(0,-.295),pt(.13,-.25),pt(.24,-.25)],'#ffeabe',.020);
        line([pt(0,-.32),pt(0,-.38)],'#5d5347',.033);
      }
    }
  }
  function water(){
    const glow=ctx.createRadialGradient(width*.40,height*.38,0,width*.46,height*.46,Math.max(width*.66,height*.73));
    glow.addColorStop(0,'#eff6ed');glow.addColorStop(.55,'#d4e7df');glow.addColorStop(1,'#b4d0c9');
    ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
    for(let i=0;i<92;i++){
      const x=width*seeded(16+i),y=height*seeded(640+i),w=(5+seeded(i+721)*21)*Math.max(.6,width/1000);
      ctx.strokeStyle=i%7?'rgba(80,129,121,.13)':'rgba(252,255,241,.58)';ctx.lineWidth=.8;
      ctx.beginPath();ctx.moveTo(x-w,y);ctx.bezierCurveTo(x-w*.41,y+w*.17,x+w*.22,y-w*.17,x+w,y);ctx.stroke();
    }
  }
  function lacquer(){
    const offset=(u,d)=>[u*cos-d*sin,u*sin+d*cos];
    for(const [w,u,d,alpha] of [[10.31,.09,.17,.10],[10.17,.08,.12,.16],[10.02,.05,.08,.32]]){
      const [dx,dz]=offset(u,d);
      face(mapAt(edge(w).map(([x,z])=>[x+dx,z+dz]),-.83),'rgba(0,5,10,'+alpha+')');
    }
    solid(edge(9.59),edge(9.85),-.76,-.66,'#506e66','#7a8374');
    solid(edge(9.85),edge(9.97),-.66,-.56,'#958d73','#c5b295');
    solid(edge(9.97),edge(10.02),-.56,-.50,'#cbac7a','#fae7b9');
    solid(edge(10.02),edge(10),-.50,-.15,'#79736a','#928775');
    solid(edge(10),edge(10.06),-.15,-.085,'#c8a778','#f2dfb7');
    solid(edge(10.06),edge(9.96),-.085,.04,'#607c70','#a1b6a2');
    solid(edge(9.96),edge(9.9),.04,surface,'#c5ad82',
      glaze(ox-scale*4.6,oy-scale*4,ox+scale*4.6,oy+scale*3.1,[[0,'#89baac'],[.26,'#70a899'],[.50,'#86b9a9'],[.68,'#70a495'],[1,'#619486']]));
    clasps();
    outline(edge(9.73),'#f6e6b9',.027);outline(edge(9.48),'#c2ddd0',.017);outline(edge(9.39),'#56897f',.016);
    for(let side=0;side<4;side++){
      const a=side*pi/2,co=Math.cos(a),sn=Math.sin(a),turn=([x,z])=>[x*co-z*sn,z*co+x*sn];
      for(let j=-8;j<=8;j++){
        const x=j*.49;
        face(mapAt([[x-.15,-4.795],[x,-4.838],[x+.15,-4.795],[x,-4.754]].map(turn),surface+.011),PEARL[(j+20+side*2)%6]);
      }
      wire([[-4.63,-4.29],[-4.63,-4.51],[-4.51,-4.63],[-4.29,-4.63]].map(turn),'#ffedbc',.034);
    }
    for(let i=0;i<135;i++)feature(seeded(280+i)*9.05-4.525,seeded(650+i)*9.05-4.525,surface+.001,.006+seeded(500+i)*.01,.008,'rgba(222,225,193,.21)');
  }
  function shell(points,seed=0,brightness=1){
    const pts=mapAt(points,surface+.014).map(project),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
    const tone=n=>mix(PEARL[(Math.abs(seed)+n)%6],'#608e81',1-brightness);
    flat(pts,glaze(Math.min(...xs),Math.min(...ys),Math.max(...xs)+.1,Math.max(...ys)+.1,[[0,tone(0)],[.35,tone(2)],[.64,tone(1)],[1,tone(4)]]));
  }
  const shift=(pts,x,z,s,flip=1)=>pts.map(([a,b])=>[x+a*s*flip,z+b*s]);
  function crane(x,z,s,flip){
    const trans=p=>shift(p,x,z,s,flip),lay=(p,k)=>shell(trans(p),k,.88);
    const stroke=(p,c,w)=>wire(trans(p),c,w*s);
    lay([[-.53,.06],[-.76,-.29],[-.89,-.57],[-.80,-.54],[-.64,-.37],[-.73,-.70],[-.62,-.61],[-.47,-.38],[-.46,-.72],[-.37,-.53],[-.31,-.29],[-.21,-.53],[-.17,-.34],[-.20,-.11],[.18,.15]],2);
    lay([[-.42,.08],[-.12,-.06],[.14,.07],[.37,.10],[.17,.22],[-.10,.23],[-.46,.17],[-.72,.27]],0);
    lay([[-.15,.14],[.06,.26],[.32,.43],[.63,.67],[.79,.74],[.72,.57],[.95,.64],[.83,.46],[1.02,.52],[.86,.34],[1,.35],[.72,.16],[.31,.05]],3);
    for(let i=0;i<3;i++)stroke([[.19,.14],[.50+i*.065,.25+i*.072],[.72+i*.065,.36+i*.10]],'#507177',.018);
    stroke([[.05,.12],[.36,.04],[.54,-.06],[.68,-.19],[.81,-.19]],'#c6d9cc',.063);
    lay([[.76,-.22],[.86,-.25],[.92,-.20],[.84,-.166],[.76,-.18]],5);
    lay([[.9,-.21],[1.18,-.18],[.89,-.16]],0);
    stroke([[-.39,.14],[-.76,.27],[-1.05,.30]],'#bfa476',.026);
    stroke([[-.40,.15],[-.79,.34],[-.99,.37]],'#bea573',.023);
  }
  function landscapeMoon(x,z,s){
    const trans=p=>shift(p,x,z,s);
    shell(trans(ring(.52,-.42,.26,.26,36)),4,.98);
    for(const p of [
      [[-1,.32],[-.75,.15],[-.55,.22],[-.25,-.13],[.02,.08],[.18,.01],[.50,.31],[.72,.22],[.97,.43]],
      [[-.64,.39],[-.37,.22],[-.24,.21],[.02,-.12],[.16,-.06],[.34,-.24],[.64,.04],[.85,.12],[1,.26]],
      [[-.75,.47],[-.49,.37],[-.28,.38],[-.05,.25],[.23,.23],[.44,.15],[.68,.26],[.92,.24]]])wire(trans(p),'#e5edce',.029*s);
    shell(trans([[-.56,.22],[-.25,-.13],[-.36,.13],[-.26,.07],[-.34,.22]]),1,.75);
    shell(trans([[.03,-.12],[.15,-.06],[.34,-.24],[.27,-.06],[.19,.02],[.11,0]]),3,.76);
    for(let i=0;i<4;i++){
      const p=Array.from({length:19},(_,j)=>{const a=j/18;return [-.76+i*.1+a*(1.53-i*.10),.58+i*.095+Math.sin(a*TAU+i*.8)*.035];});
      wire(trans(p),i%2?'#476f69':'#d4e9cc',.019*s);
    }
  }
  function pine(x,z,s){
    const trans=p=>shift(p,x,z,s),branch=(p,col,w)=>wire(trans(p),col,w*s);
    shell(trans([[-.14,.73],[.01,.4],[-.04,.18],[-.29,.05],[-.39,-.10],[-.28,-.04],[-.12,.02],[.05,.06],[.20,.23],[.16,.48],[.07,.73]]),5,.78);
    branch([[-.07,.18],[.23,.10],[.42,-.10],[.60,-.16]],'#dfedd4',.056);
    branch([[-.23,.04],[-.29,-.14],[-.48,-.25],[-.58,-.4]],'#f3e4c0',.043);
    branch([[-.06,.71],[-.33,.76],[-.52,.74]],'#5c8576',.035);branch([[.06,.71],[.29,.78],[.42,.76]],'#648b79',.029);
    const tufts=[[-.55,-.43,.42],[-.31,-.42,.46],[-.77,-.24,.37],[-.38,-.12,.43],[.57,-.18,.40],[.35,-.12,.32],[.73,-.29,.31]];
    tufts.forEach(([a,b,r],k)=>{
      for(let j=0;j<9;j++){
        const th=pi+pi*j/8,rr=r*(.75+seeded(k*17+j)*.26),dx=Math.cos(th),dz=Math.sin(th);
        shell(trans([[a,b],[a+dx*rr-dz*.032,b+dz*rr+dx*.032],[a+dx*(rr+.09),b+dz*(rr+.09)],[a+dx*rr+dz*.032,b+dz*rr-dx*.032]]),k+j,.71+seeded(j+k)*.15);
      }
    });
  }
  function waves(x,z,s){
    const trans=p=>shift(p,x,z,s);
    for(let row=2;row>=0;row--)for(const center of row===1?[-.72,0,.72]:[-.36,.36]){
      for(const r of [.30,.235,.17,.11]){
        const pts=Array.from({length:17},(_,i)=>{const a=pi+i*pi/16;return [center+r*Math.cos(a),.47-row*.22+r*Math.sin(a)];});
        wire(trans(pts),row%2?'#4f827c':'#e4edce',.018*s);
      }
    }
    shell(trans([[-.39,-.36],[.04,-.29],[.36,-.47],[.27,-.28],[.10,-.16],[-.15,-.17]]),0,.88);
    shell(trans([[.05,-.35],[.05,-.97],[-.29,-.44]]),3,.95);
    wire(trans([[.06,-.98],[.06,-.28]]),'#f4dfb4',.027*s);
  }
  function inlay(){
    const motifs=[[crane,-.55,-2.27,.96,1],[crane,.98,-2.80,.56,-1],[pine,-2.38,.16,1.12],
      [landscapeMoon,-.23,2.30,1.12],[waves,2.48,.07,1.03]];
    for(const [draw,x,z,size,flip] of motifs)draw(x,z,size,flip);
  }
  function trail(){
    for(const route of tracks)for(let i=1;i<route.length;i++){
      const [x,z]=nodes[route[i-1]],[u,v]=nodes[route[i]],path=[[x,z],[u,v]],diag=route.length!==21;
      wire(path,'#446b61',.155,surface+.018);wire(path,diag?'#e1f3e5':'#f4dca5',diag?.05:.068,surface+.020);
      const a=(x+u)/2,b=(z+v)/2,n=Math.hypot(u-x,v-z),dx=(u-x)/n,dz=(v-z)/n;
      face(mapAt([[a-.105*dx,b-.105*dz],[a-.044*dz,b+.044*dx],[a+.105*dx,b+.105*dz],[a+.044*dz,b-.044*dx]],surface+.022),diag?'#f5faf0':'#fff1c9');
    }
  }
  function tile(i){
    const [x,z]=nodes[i],type=types[i],hero=['start','corner','center'].includes(type);
    const rad=hero?.735:i>=20?.42:.505,y=hero?.435:.352;
    const outer=ring(x,z,rad,rad,32),lid=ring(x,z,rad*.84,rad*.84,32),[sx,sy]=project([x,y,z]),r=rad*scale;
    const tones=hero?['#fff5d8','#d9b879','#f5e0ac']:type==='stone'?['#ffd6b7','#c58271','#f2b6a0']:
      type==='breeze'?['#e4f5d7','#8abca2','#c5e6c3']:type==='whirl'?['#ece4fa','#ac98c1','#ecd1e5']:
      i>=20?['#f0f7e9','#c5d4ca','#e6ecd9']:['#fff8e1','#d1d8c5','#f6efdb'];
    castShadow(x,z,surface+.004,rad*1.13,rad*1.10,y-surface,.67);
    solid(ring(x,z,rad*.91,rad*.91,32),outer,surface+.014,surface+.065,hero?'#8e7654':'#637c70','#b1a781');
    solid(outer,outer,surface+.065,y-.087,hero?'#b29868':'#9faf98',tones[1]);
    solid(outer,lid,y-.087,y,hero?'#eed5a3':'#d3d9c0',
      glaze(sx-r,sy-r*.6,sx+r,sy+r*.68,[[0,tones[0]],[.38,tones[1]],[.63,tones[2]],[.80,tones[0]],[1,tones[2]]]));
    const lip=Array.from({length:16},(_,j)=>{const a=-2.9+j*.073;return [x+Math.cos(a)*rad*.905,y-.021,z+Math.sin(a)*rad*.905];});
    line(lip,hero?'#ffefbd':'#e9efda',.016);
    const disc=(size,col)=>feature(x,z,y+.006,size,size,col);
    const mark=(p,col)=>face(stampShape(p,x,z,rad,y+.019),col);
    const stroke=(p,col,w)=>line(stampShape(p,x,z,rad,y+.022),col,w*rad);
    outline(ring(x,z,rad*.75,rad*.75,28),hero?'#a3824c':'#8b9c8c',.016,y+.010);
    if(type==='path'||type==='normal'){disc(rad*.105,type==='path'?'#577b79':'#8c8d71');disc(rad*.047,tones[0]);return;}
    if(type==='stone'){
      const rocks=[[-.12,.020,.245,.44],[.16,.045,.188,.285]];
      castShadow(x,z,y+.008,.32,.22,.42,.58);
      for(const [dx,dz,rise,peak] of rocks){
        const foot=ring(x+dx,z+dz,rise,rise*.75,5,.18), tip=[x+dx-.045,y+peak,z+dz];
        const faces=foot.map((p,k)=>[p,foot[(k+1)%foot.length],k]).sort(([a,b],[c,d])=>dep(a[0]+b[0],a[1]+b[1])-dep(c[0]+d[0],c[1]+d[1]));
        for(const [a,b,k] of faces)face([[a[0],y+.01,a[1]],[b[0],y+.01,b[1]],tip],['#794d54','#a46260','#b4796c','#d99b81','#eeaf8b'][k]);
      }
    }else if(type==='whirl'){
      const pool=ring(x,z,rad*.46,rad*.46,28);
      walls(ring(x,z,rad*.33,rad*.33,28),y+.012,pool,y+.092,'#807292');
      feature(x,z,y+.020,rad*.34,rad*.34,'#5c567d');
      const swirl=Array.from({length:42},(_,j)=>{const a=j*.26,r=rad*.46*(1-j/44);return [x+r*Math.cos(a),y+.022+.074*(1-j/44)**2,z+r*Math.sin(a)];});
      line(swirl,'#e0cfeb',rad*.072);
      outline(pool,'#aa94bd',.029,y+.093);
    }else if(type==='breeze'){
      const current=[[-.52,.15],[-.24,.09],[.04,-.15],[.22,-.21],[.23,-.31],[.48,-.18],[.28,.04],[.27,-.045],[.12,-.02],[-.14,.19],[-.34,.23]];
      for(const [dx,dz,sz,rise] of [[0,-.15,.93,.10],[.03,.16,.79,.067]]){
        const shape=current.map(([a,b])=>[x+(a*sz+dx)*rad,z+(b*sz+dz)*rad]);
        solid(shape,shape,y+.008,y+rise,'#335c53','#518976');
        wire(shape.slice(1,5),'#d4ead1',.018,y+rise+.002);
      }
    }else if(type==='start'){
      disc(rad*.63,'#854a49');const sz=.19;
      for(let row=0;row<3;row++)for(let col=0;col<4;col++)if((row+col)%2===0){
        const a=(col-2)*sz,b=(row-1.5)*sz;mark([[a,b],[a+sz,b],[a+sz,b+sz],[a,b+sz]],'#fbecc8');
      }
    }else if(type==='center'){
      disc(rad*.66,'#37625f');
      for(let j=0;j<8;j++){
        const a=j*pi/4,dx=Math.cos(a),dz=Math.sin(a),l=j%2?.43:.63;
        mark([[0,0],[dx*.2-dz*.102,dz*.2+dx*.102],[dx*l,dz*l],[dx*.2+dz*.102,dz*.2-dx*.102]],PEARL[(j+1)%6]);
      }
      disc(.085,'#f5dba1');
    }else{
      disc(rad*.63,i===15?'#7a7591':i===5?'#4a7077':'#4e7668');
      if(i===15){for(let j=0;j<4;j++){const a=j*pi/2;mark([[0,0],[Math.cos(a+.48)*.29,Math.sin(a+.48)*.29],[Math.cos(a)*.51,Math.sin(a)*.51],[Math.cos(a-.48)*.29,Math.sin(a-.48)*.29]],'#eee2c4');}}
      else if(i===5){
        feature(x-.075,z,y+.014,rad*.36,rad*.36,'#f8e2ae');
        feature(x-.015,z-.053,y+.019,rad*.295,rad*.295,'#4a7077');
        mark([[.24,-.27],[.28,-.14],[.40,-.10],[.28,-.06],[.24,.08],[.20,-.06],[.08,-.10],[.20,-.14]],'#f8e2ae');
      }else{stroke([[0,.38],[0,0],[-.33,-.28]],'#fff0cb',.085);stroke([[0,0],[.33,-.28]],'#fff0cb',.085);
        for(const [a,b] of [[0,.38],[-.33,-.28],[.33,-.28]])feature(x+a*rad,z+b*rad,y+.025,.052,.052,'#f9ebc7');}
    }
  }
  // A scaled-down roof lantern marks the approach to the starting corner.
  function lantern(x,z){
    castShadow(x,z,surface+.01,.33,.25,.9,.45);
    feature(x,z,surface+.01,.48,.35,'rgba(227,169,82,.09)');
    box(x,z,.46,.39,surface+.035,.23,'#586064','#ac9a7c',.045);
    box(x,z,.37,.31,.23,.31,'#80705c','#ceaf79',.025);
    const perimeter=[[-.16,-.12],[.16,-.12],[.16,.12],[-.16,.12]];
    const world=(a,y,b)=>[x+a,y,z+b];
    for(let i=0;i<4;i++){
      const a=perimeter[i],b=perimeter[(i+1)%4];
      if(dep(b[1]-a[1],a[0]-b[0])<0)continue;
      const panel=[world(a[0],.33,a[1]),world(b[0],.33,b[1]),world(b[0],.75,b[1]),world(a[0],.75,a[1])];
      face(panel,i%2?'#f8d090':'#ffdf9c');
      line([panel[0],panel[3]],'#564b43',.035);line([panel[1],panel[2]],'#695140',.035);
      for(const t of [.33,.67])line([world(a[0]*(1-t)+b[0]*t,.33,a[1]*(1-t)+b[1]*t),world(a[0]*(1-t)+b[0]*t,.75,a[1]*(1-t)+b[1]*t)],'#b6905b',.014);
      for(const h of [.40,.65])line([world(a[0],h,a[1]),world(b[0],h,b[1])],'#826746',.019);
    }
    box(x,z,.42,.34,.73,.79,'#594d43','#b19770',.025);
    const eave=[[-.34,-.26], [0,-.22],[.34,-.26],[.30,0],[.34,.26],[0,.22],[-.34,.26],[-.30,0]];
    const roof=eave.map(([a,b],i)=>world(a,i%2?.758:.845,b));
    const cap=world(0,1.015,0),order=roof.map((p,i)=>({p,q:roof[(i+1)%8],i})).sort((a,b)=>dep(a.p[0]+a.q[0],a.p[2]+a.q[2])-dep(b.p[0]+b.q[0],b.p[2]+b.q[2]));
    for(const {p,q,i} of order){
      face([p,q,cap],['#52746c','#6c9088','#5c7e77','#6e8f7f','#567970','#6b8d80','#74988b','#82a090'][i]);
      line([p,q],'#e1c28a',.023);
      if(i%2===0)line([p,cap],'#92a49a',.020);
    }
    column(x,z,.051,.015,1.015,1.095,'#c3a978','#ebcd95',8);
  }
  const objects=nodes.map(([x,z],i)=>({x,z,draw:()=>tile(i)}));
  objects.push({x:3.19,z:1.64,draw:()=>lantern(3.19,1.64)});
  function nodeHeight(n){return [0,5,10,15,22].includes(n)?.435:.352;}
  function pawn(p,x,z,y,size){
    const animal=Number.isInteger(p.animal)&&p.animal>=0&&p.animal<12?p.animal:(p.team*3+p.index+2)%12;
    drawZodiac(ctx,project,x,y,z,size,animal,TEAM[p.team]??TEAM[0],p.index);
  }
  const rack={x:1.35,z:3.12};
  function rackPoint(x,z){
    return [rack.x+.18*Math.abs(sin)+x*cos-z*sin,rack.z-.15*Math.abs(sin)+x*sin+z*cos];
  }
  function reservePositions(){
    return reserves.filter(p=>p.team===activeTeam).map(p=>{
      const [x,z]=rackPoint((p.index-.5)*1.22,0);
      return {p,x,z,y:surface+.101,ground:surface+.101,size:.94,from:-1};
    });
  }
  function reserveTray(){
    const tray=rounded(0,0,2.32,.84,.14).map(([x,z])=>rackPoint(x,z));
    const inset=rounded(0,0,2.24,.76,.13).map(([x,z])=>rackPoint(x,z));
    solid(tray,tray,surface+.018,surface+.071,'#988568','#ead2a3');
    solid(inset,inset,surface+.071,surface+.095,'#798e82','#a3bcb0');
    for(const offset of [-.61,.61]){
      const [x,z]=rackPoint(offset,0);
      feature(x,z,surface+.098,.355,.355,'#849e92');
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
        const offset=(i-(group.length-1)/2)*.58,size=group.length>1?.76:1;
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
  function drawScene(reserve){
    water();lacquer();inlay();trail();
    const display=objects.map(o=>({order:dep(o.x,o.z),draw:o.draw}));
    if(reserve.length)display.push({order:dep(rack.x,rack.z)-1,draw:reserveTray});
    for(const actor of drawnPawns){
      const {p,x,z,y,ground,size}=actor;
      if(isLifted(actor))continue;
      display.push({order:dep(x,z)+.16,draw:()=>{
        castShadow(x,z,ground,.43*size,.37*size,.83*size+y-ground,.52);
        if(p.team===activeTeam&&optionFor(actor)?.index===selected){
          const path=mapAt(ring(x,z,.48*size,.48*size,32),ground+.004);
          line([...path,path[0]],'#396e68',.105);line([...path,path[0]],GOLD,.052);
        }
        pawn(p,x,z,y,size);
      }});
    }
    display.sort((a,b)=>a.order-b.order);
    for(const v of display)v.draw();
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
    const span=10.06*(Math.abs(cos)+Math.abs(sin));
    tilt=Math.min(.90,Math.max(.44,height/width*1.02));
    lift=Math.sqrt(1-tilt*tilt);
    const pad=Math.max(3,Math.min(10,Math.min(width,height)*.014));
    // Fit the panel, beveled coins, obstacles and any raised pawn to the same camera.
    const actors=pawnPositions(time),reserve=reservePositions();
    drawnPawns=[...actors,...reserve];
    const farthest=c*(Math.abs(cos)+Math.abs(sin));
    let top=Math.min(-span*.5*tilt-surface*lift,-(farthest+.81)*tilt-.49*lift,-(farthest+.25)*tilt-.80*lift);
    for(const a of actors)top=Math.min(top,(dep(a.x,a.z)-.40*a.size)*tilt-(a.y+1.15*a.size)*lift);
    const bottom=(span*.5+.08)*tilt+.83*lift;
    scale=Math.min((width-pad*2)/span,(height-pad*2)/(bottom-top));
    ox=width/2;oy=height/2-(top+bottom)*scale/2;
    const movingFigure=gesture?.moved&&!turnStart&&!moves.length;
    if(movingFigure&&gesture.backdrop){
      ctx.drawImage(gesture.backdrop,0,0,width,height);
    }else{
      drawScene(reserve);
      // During a drag only the lifted figurine and the target rings change.
      if(movingFigure&&typeof OffscreenCanvas==='function'){
        const picture=new OffscreenCanvas(canvas.width,canvas.height),copy=picture.getContext('2d');
        if(copy){copy.drawImage(canvas,0,0);gesture.backdrop=picture;}
      }
    }
    const allowed=destinationNodes(),over=gesture?.moved?destinationAt(gesture.x,gesture.y,allowed):null;
    for(const n of allowed){
      const [x,z]=nodes[n],y=targetHeight(n),radius=nodeHeight(n)>.4?.80:.64;
      if(n===over)feature(x,z,y,radius,radius,'rgba(252,231,158,.30)');
      const path=mapAt(ring(x,z,radius,radius,48),y);
      line([...path,path[0]],'#326860',n===over?.18:.14);
      line([...path,path[0]],'#fff5cf',n===over?.105:.073);
    }
    if(gesture?.moved)drawLifted();
    moves=moves.filter(m=>time-m.start<265);
    if(turnStart||moves.length)schedule();
  }
  function schedule(){if(!dead&&!frame)frame=requestAnimationFrame(paint);}
  function resize() {
    const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;
    if(gesture){gesture.backdrop=null;gesture.x=gesture.clientX-rect.left;gesture.y=gesture.clientY-rect.top;}
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
  function pawnDistance(actor,px,py){
    const [x,base]=project([actor.x,actor.y+.10*actor.size,actor.z]);
    const [,head]=project([actor.x,actor.y+1.03*actor.size,actor.z]);
    const dy=py-Math.max(head,Math.min(base,py)),d=Math.hypot(px-x,dy);
    return d<=Math.max(22,.42*actor.size*scale)?d+.04*Math.abs(py-(head+base)/2):Infinity;
  }
  function destinationAt(px,py,allowed){
    let nearest=null,distance=Math.max(22,scale*.78);
    for(const n of allowed){
      const [x,z]=nodes[n],[sx,sy]=project([x,targetHeight(n),z]);
      const d=Math.hypot(px-sx,py-sy);
      if(d<distance){nearest=n;distance=d;}
    }
    // A tall figure on an occupied legal square is part of its drop target.
    for(const actor of drawnPawns){
      if(isLifted(actor)||!allowed.includes(actor.from))continue;
      const d=pawnDistance(actor,px,py)+.09*scale;
      if(d<distance){nearest=actor.from;distance=d;}
    }
    return nearest;
  }
  function pieceAt(px,py){
    let nearest=null,distance=Infinity;
    for(const actor of drawnPawns){
      const option=optionFor(actor);
      if(!option||option.team!==activeTeam)continue;
      const d=pawnDistance(actor,px,py);
      if(d<distance){
        const [x,y]=project([actor.x,actor.y,actor.z]);
        nearest={...option,gripX:(x-px)/scale,gripY:(y-py)/scale};distance=d;
      }
    }
    return nearest;
  }
  function drawLifted(){
    const g=gesture,base=surface+.01,u=(g.x-ox)/scale+g.gripX,d=((g.y-oy)/scale+g.gripY+base*lift)/tilt;
    const x=u*cos-d*sin,z=u*sin+d*cos;
    const carried=drawnPawns.filter(isLifted);
    castShadow(x,z,base,.49,.41,1.22,.56);
    carried.forEach((actor,i)=>{
      const stacked=carried.length>1,offset=stacked?(i-(carried.length-1)/2)*.56:0;
      pawn(actor.p,x+offset*cos,z+offset*sin,base+.30+i*.045,stacked?.76:actor.size);
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
      if(gesture)gesture.backdrop=null;
      options=available.filter(o=>o&&TEAM[o.team]&&[0,1].includes(o.index)&&(o.from===-1||nodes[o.from])&&nodes[o.to]);
      selected=Number.isInteger(selectedIndex)?selectedIndex:null;
      if(gesture&&!options.some(o=>o.index===gesture.index&&o.team===gesture.team&&o.from===gesture.from))closeGesture(true);
      canvas.classList.toggle('choosing',options.length>0||targets.length>0);
      if(canvas.style)canvas.style.touchAction=options.length?'none':'';
      schedule();
    },
    setState(next={}) {
      if(gesture)gesture.backdrop=null;
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
      if(gesture)gesture.backdrop=null;
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
