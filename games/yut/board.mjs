// Orthographic lacquer game board. Its inlays and miniatures retain their proportions
// while the surrounding panel stretches to fit its available play area.
const TAU = Math.PI * 2;
const TEAM = ['#ed7057', '#239b90', '#9661c5', '#dfad38'];
const PEARL=['#f2e6c3','#ceddd3','#a7d3cc','#b4bbce','#cfb4c5','#ecd0ba'];
const GOLD='#e8c586';
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
    for(let j=0;j<=3;j++){const a=start+j*pi/6;pts.push([cx+r*Math.cos(a),cz+r*Math.sin(a)]);}
  }
  return pts;
}
function ring(x,z,rx,rz,count=16,phase=0) {
  return Array.from({length:count},(_,i)=>{const a=phase+i*TAU/count;return [x+rx*Math.cos(a),z+rz*Math.sin(a)];});
}
const mapAt = (pts,y) => pts.map(([x,z])=>[x,y,z]);
function themeLight(base,dx,dz) {
  const n=Math.hypot(dx,dz)||1;
  const l=(dz*.65+dx*.35)/n;
  return l>0?mix(base,'#ffefc2',.10*l):mix(base,'#385863',-.27*l);
}
function stampShape(points,x,z,size,y) { return points.map(([px,pz])=>[x+px*size,y,z+pz*size]); }

export function createBoard(canvas,chooseDestination) {
  const ctx = canvas.getContext('2d');
  if(!ctx) return {setState(){},setTargets(){},rotate(){},destroy(){}};
  let width=0,height=0,scale=1,ox=0,oy=0;
  let angle=-.20,cos=Math.cos(angle),sin=Math.sin(angle),tilt=.66,lift=.75;
  let turnFrom=angle,turnTo=angle,turnStart=0,moves=[],pieces=[],reserves=[],activeTeam=0;
  let frame=0,dead=false;
  const reduced=()=>typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dep=(x,z)=>-x*sin+z*cos;
  let across=1,along=1,anchor=null,targets=[];
  const horizontal=(x,z)=>x*cos+z*sin;
  // Widen the sea and paths to fit the viewport while preserving each miniature's proportions.
  function project([x,y,z]) {
    const h=horizontal(x,z), d=dep(x,z);
    const u=anchor ? anchor.h*across+(h-anchor.h)*scale : h*across;
    const v=anchor ? anchor.d*along+(d-anchor.d)*scale : d*along;
    return [ox+u,oy+v*tilt-y*scale*lift];
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
  function walls(lower,y1,upper,y2,col,faceted=false) {
    const visible=[];
    for(let i=0;i<lower.length;i++){
      const j=(i+1)%lower.length,a=lower[i],b=lower[j],dx=b[0]-a[0],dz=b[1]-a[1];
      if(dep(dz,-dx)<-.001)continue;
      const v=faceted ? mix(col,'#96765e',seeded(i)*.16) : themeLight(col,dx,dz);
      visible.push([dep((a[0]+b[0])/2,(a[1]+b[1])/2),[[...a],[...b],upper[j],upper[i]],v,i]);
    }
    visible.sort((a,b)=>a[0]-b[0]);
    for(const [,q,t] of visible) face([[q[0][0],y1,q[0][1]],[q[1][0],y1,q[1][1]],[q[2][0],y2,q[2][1]],[q[3][0],y2,q[3][1]]],t);
  }
  function solid(low,high,bottom,top,side,lid,facets=false) {walls(low,bottom,high,top,side,facets);face(mapAt(high,top),lid);}
  function box(x,z,w,d,b,t,side,lid=side,r=.035) {const v=rounded(x,z,w,d,Math.min(r,w/2,d/2));solid(v,v,b,t,side,lid);}
  function column(x,z,rb,rt,b,t,side,lid=side,n=12) {solid(ring(x,z,rb,rb,n),ring(x,z,rt,rt,n),b,t,side,lid);}
  const surface=.13;
  function wire(path,color,weight,y=surface+.008){line(mapAt(path,y),color,weight);}
  function outline(path,color,weight,y){wire([...path,path[0]],color,weight,y);}
  function glaze(x,y,u,v,stops){
    const g=ctx.createLinearGradient(x,y,u,v);for(const [t,col] of stops)g.addColorStop(t,col);return g;
  }
  function edge(w){
    const h=w/2,r=.48,k=.065;
    return [[-h+r,-h],[h-r,-h],[h-r*.6,-h+k],[h-k,-h+r*.6],[h,-h+r],
      [h,h-r],[h-k,h-r*.6],[h-r*.6,h-k],[h-r,h],[-h+r,h],
      [-h+r*.6,h-k],[-h+k,h-r*.6],[-h,h-r],[-h,-h+r],
      [-h+k,-h+r*.6],[-h+r*.6,-h+k]];
  }
  function water(){
    ctx.fillStyle=glaze(0,0,width*.7,height,[[0,'#19363e'],[.45,'#0b222a'],[1,'#07151c']]);ctx.fillRect(0,0,width,height);
    for(let i=0;i<92;i++){
      const x=width*seeded(16+i),y=height*seeded(640+i),w=(5+seeded(i+721)*21)*Math.max(.6,width/1000);
      ctx.strokeStyle=i%7?'rgba(130,179,180,.12)':'rgba(187,193,170,.24)';ctx.lineWidth=.8;
      ctx.beginPath();ctx.moveTo(x-w,y);ctx.bezierCurveTo(x-w*.41,y+w*.17,x+w*.22,y-w*.17,x+w,y);ctx.stroke();
    }
  }
  function lacquer(){
    face(mapAt(edge(10).map(([x,z])=>[x+.12,z+.18]),-.68),'rgba(0,7,12,.54)');
    solid(edge(9.75),edge(9.96),-.60,-.49,'#152227','#382e30');
    solid(edge(9.96),edge(10.02),-.49,-.43,'#a07b4f','#d9bc85');
    solid(edge(10.02),edge(10),-.43,-.13,'#29272a','#443934');
    solid(edge(10),edge(10.06),-.13,-.085,'#977b51','#d5b987');
    solid(edge(10.06),edge(9.96),-.085,.04,'#2a3537','#5e625a');
    solid(edge(9.96),edge(9.9),.04,surface,'#847255',
      glaze(0,0,width*.9,height,[[0,'#173940'],[.24,'#17353d'],[.47,'#23484d'],[.72,'#17353d'],[1,'#122a30']]));
    outline(edge(9.73),'#bdae89',.027);outline(edge(9.48),'#77928c',.017);outline(edge(9.39),'#334d50',.016);
    for(let side=0;side<4;side++){
      const a=side*pi/2,co=Math.cos(a),sn=Math.sin(a),turn=([x,z])=>[x*co-z*sn,z*co+x*sn];
      for(let j=-8;j<=8;j++){
        const x=j*.49;
        face(mapAt([[x-.15,-4.795],[x,-4.838],[x+.15,-4.795],[x,-4.754]].map(turn),surface+.011),PEARL[(j+20+side*2)%6]);
      }
      wire([[-4.63,-4.29],[-4.63,-4.51],[-4.51,-4.63],[-4.29,-4.63]].map(turn),'#e6d0a0',.034);
    }
    for(let i=0;i<135;i++)feature(seeded(280+i)*9.05-4.525,seeded(650+i)*9.05-4.525,surface+.001,.006+seeded(500+i)*.01,.008,'rgba(222,225,193,.21)');
  }
  function shell(points,seed=0,brightness=1){
    const pts=mapAt(points,surface+.014).map(project),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
    const tone=n=>mix(PEARL[(Math.abs(seed)+n)%6],'#32656a',1-brightness);
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
      [[-.75,.47],[-.49,.37],[-.28,.38],[-.05,.25],[.23,.23],[.44,.15],[.68,.26],[.92,.24]]])wire(trans(p),'#9aafa0',.029*s);
    shell(trans([[-.56,.22],[-.25,-.13],[-.36,.13],[-.26,.07],[-.34,.22]]),1,.75);
    shell(trans([[.03,-.12],[.15,-.06],[.34,-.24],[.27,-.06],[.19,.02],[.11,0]]),3,.76);
    for(let i=0;i<4;i++){
      const p=Array.from({length:19},(_,j)=>{const a=j/18;return [-.76+i*.1+a*(1.53-i*.10),.58+i*.095+Math.sin(a*TAU+i*.8)*.035];});
      wire(trans(p),i%2?'#709795':'#b2bfa9',.019*s);
    }
  }
  function pine(x,z,s){
    const trans=p=>shift(p,x,z,s),branch=(p,col,w)=>wire(trans(p),col,w*s);
    shell(trans([[-.14,.73],[.01,.4],[-.04,.18],[-.29,.05],[-.39,-.10],[-.28,-.04],[-.12,.02],[.05,.06],[.20,.23],[.16,.48],[.07,.73]]),5,.78);
    branch([[-.07,.18],[.23,.10],[.42,-.10],[.60,-.16]],'#bfd0ba',.056);
    branch([[-.23,.04],[-.29,-.14],[-.48,-.25],[-.58,-.4]],'#c7bfa1',.043);
    branch([[-.06,.71],[-.33,.76],[-.52,.74]],'#91a998',.035);branch([[.06,.71],[.29,.78],[.42,.76]],'#92a99a',.029);
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
        wire(trans(pts),row%2?'#84acab':'#9ab9ad',.018*s);
      }
    }
    shell(trans([[-.39,-.36],[.04,-.29],[.36,-.47],[.27,-.28],[.10,-.16],[-.15,-.17]]),0,.88);
    shell(trans([[.05,-.35],[.05,-.97],[-.29,-.44]]),3,.95);
    wire(trans([[.06,-.98],[.06,-.28]]),'#ceb783',.027*s);
  }
  function inlay(){
    const motifs=[[crane,-.55,-2.27,.96,1],[crane,.98,-2.80,.56,-1],[pine,-2.38,.16,1.12],
      [landscapeMoon,-.23,2.30,1.12],[waves,2.48,.07,1.03]];
    for(const [draw,x,z,size,flip] of motifs){
      anchor={h:horizontal(x,z),d:dep(x,z)};
      draw(x,z,size,flip);
    }
    anchor=null;
  }
  function trail(){
    for(const route of tracks)for(let i=1;i<route.length;i++){
      const [x,z]=nodes[route[i-1]],[u,v]=nodes[route[i]],path=[[x,z],[u,v]],diag=route.length!==21;
      wire(path,'#0b272c',.155,surface+.018);wire(path,diag?'#82aaa7':'#bca270',diag?.05:.068,surface+.020);
      const a=(x+u)/2,b=(z+v)/2,n=Math.hypot(u-x,v-z),dx=(u-x)/n,dz=(v-z)/n;
      face(mapAt([[a-.105*dx,b-.105*dz],[a-.044*dz,b+.044*dx],[a+.105*dx,b+.105*dz],[a+.044*dz,b-.044*dx]],surface+.022),diag?'#c0d3cf':'#ecdcad');
    }
  }
  function tile(i){
    const [x,z]=nodes[i],type=types[i],hero=['start','corner','center'].includes(type);
    const rad=hero?.735:i>=20?.42:.505,y=hero?.435:.352;
    const outer=ring(x,z,rad,rad,28),lid=ring(x,z,rad*.87,rad*.87,28),[sx,sy]=project([x,y,z]),r=rad*scale;
    const tones=hero?['#fff0bc','#d7b369','#e6cf95']:type==='stone'?['#f3bf9e','#ba806c','#e5ae99']:
      type==='breeze'?['#d7edc7','#86b6a1','#c3e1c3']:type==='whirl'?['#c4c9e8','#9495bd','#e2cedc']:
      i>=20?['#d0e5da','#97b4b2','#d9d6c9']:['#fff2d1','#bdc4b3','#ebe6ca'];
    feature(x+.055,z+.10,surface+.023,rad*1.08,rad*1.04,'rgba(0,11,14,.54)');
    solid(outer,outer,surface+.027,y-.074,hero?'#8e734a':'#596d69','#a29a79');
    solid(outer,lid,y-.074,y,hero?'#dcc58a':'#b1b9a6',
      glaze(sx-r,sy-r*.6,sx+r,sy+r*.68,[[0,tones[0]],[.38,tones[1]],[.65,tones[2]],[1,tones[0]]]));
    const disc=(size,col)=>feature(x,z,y+.006,size,size,col);
    const mark=(p,col)=>face(stampShape(p,x,z,rad,y+.019),col);
    const stroke=(p,col,w)=>line(stampShape(p,x,z,rad,y+.022),col,w*rad);
    outline(ring(x,z,rad*.75,rad*.75,28),hero?'#a3824c':'#8b9c8c',.016,y+.010);
    if(type==='path'||type==='normal'){disc(rad*.105,type==='path'?'#577b79':'#8c8d71');disc(rad*.047,tones[0]);return;}
    if(type==='stone'){
      const rocks=[[-.12,.015,.22,.30],[.14,.04,.17,.22]];
      for(const [dx,dz,rise,peak] of rocks){
        const foot=ring(x+dx,z+dz,rise,rise*.75,5,.18), tip=[x+dx-.045,y+peak,z+dz];
        const faces=foot.map((p,k)=>[p,foot[(k+1)%foot.length],k]).sort(([a,b],[c,d])=>dep(a[0]+b[0],a[1]+b[1])-dep(c[0]+d[0],c[1]+d[1]));
        for(const [a,b,k] of faces)face([[a[0],y+.01,a[1]],[b[0],y+.01,b[1]],tip],['#794d54','#a46260','#b4796c','#d99b81','#eeaf8b'][k]);
      }
    }else if(type==='whirl'){
      const path=Array.from({length:36},(_,j)=>{const a=j*.31,r=.49*(1-j/39);return [r*Math.cos(a),r*Math.sin(a)];});
      stroke(path,'#4b4d76',.105);
    }else if(type==='breeze'){
      for(const off of [-.21,.13])stroke([[-.45,off+.13],[-.06,off+.14],[.20,off-.05],[.39,off-.04]],'#366858',.11);
    }else if(type==='start'){
      disc(rad*.63,'#854a49');const sz=.19;
      for(let row=0;row<3;row++)for(let col=0;col<4;col++)if((row+col)%2===0){
        const a=(col-2)*sz,b=(row-1.5)*sz;mark([[a,b],[a+sz,b],[a+sz,b+sz],[a,b+sz]],'#fbecc8');
      }
    }else if(type==='center'){
      disc(rad*.66,'#25484e');
      for(let j=0;j<8;j++){
        const a=j*pi/4,dx=Math.cos(a),dz=Math.sin(a),l=j%2?.43:.63;
        mark([[0,0],[dx*.2-dz*.102,dz*.2+dx*.102],[dx*l,dz*l],[dx*.2+dz*.102,dz*.2-dx*.102]],PEARL[(j+1)%6]);
      }
      disc(.085,'#e8c48b');
    }else{
      disc(rad*.63,i===15?'#626c86':i===5?'#375769':'#3d6262');
      if(i===15){for(let j=0;j<4;j++){const a=j*pi/2;mark([[0,0],[Math.cos(a+.48)*.29,Math.sin(a+.48)*.29],[Math.cos(a)*.51,Math.sin(a)*.51],[Math.cos(a-.48)*.29,Math.sin(a-.48)*.29]],'#eee2c4');}}
      else if(i===5){
        feature(x-.075,z,y+.014,rad*.36,rad*.36,'#f8e2ae');
        feature(x-.015,z-.053,y+.019,rad*.295,rad*.295,'#375769');
        mark([[.24,-.27],[.28,-.14],[.40,-.10],[.28,-.06],[.24,.08],[.20,-.06],[.08,-.10],[.20,-.14]],'#f8e2ae');
      }else{stroke([[0,.38],[0,0],[-.33,-.28]],'#fff0cb',.085);stroke([[0,0],[.33,-.28]],'#fff0cb',.085);
        for(const [a,b] of [[0,.38],[-.33,-.28],[.33,-.28]])feature(x+a*rad,z+b*rad,y+.025,.052,.052,'#f9ebc7');}
    }
  }
  // A scaled-down roof lantern marks the approach to the starting corner.
  function lantern(x,z){
    feature(x,z,surface+.01,.55,.43,'rgba(227,169,82,.08)');
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
      face([p,q,cap],['#38565a','#4d6565','#496066','#426165','#375158','#486668','#4d696a','#54716d'][i]);
      line([p,q],'#e1c28a',.023);
      if(i%2===0)line([p,cap],'#92a49a',.020);
    }
    column(x,z,.051,.015,1.015,1.095,'#c3a978','#ebcd95',8);
  }
  const objects=nodes.map(([x,z],i)=>({x,z,draw:()=>tile(i)}));
  objects.push({x:3.19,z:1.64,draw:()=>lantern(3.19,1.64)});
  function pawn(p,x,z,y,s) {
    const base=TEAM[p.team]??TEAM[0], dark=mix(base,'#172e38',.37), bright=mix(base,'#fff2d2',.36);
    const build=(rb,rt,low,high,side,lid=side)=>column(x,z,rb*s,rt*s,y+low*s,y+high*s,side,lid,18);
    feature(x+.04,z+.055,y,.37*s,.34*s,'rgba(3,19,19,.36)');
    build(.29,.35,0,.06,'#645c4a');build(.35,.33,.06,.115,GOLD,'#e4c791');
    build(.32,.22,.115,.20,dark,base);
    build(.21,.32,.18,.34,dark,base);build(.32,.27,.34,.51,base,bright);
    build(.27,.14,.51,.61,bright,bright);build(.145,.16,.59,.64,'#bb905d','#f1dca5');
    build(.13,.17,.64,.72,dark,bright);build(.17,.068,.72,.81,bright,base);
    build(.062,.044,.81,.875,GOLD,'#f6e0a5');
    const [cx,cy]=project([x,y+.385*s,z]);const radius=Math.max(2.7,.156*s*scale);
    ctx.beginPath();ctx.arc(cx,cy+radius*.28,radius,0,TAU);ctx.fillStyle='#f9e8be';ctx.fill();
    ctx.strokeStyle='#876b4b';ctx.lineWidth=Math.max(.65,radius*.10);ctx.stroke();
    ctx.fillStyle='#3d4142';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold '+Math.max(5,Math.round(radius*1.55))+'px system-ui, sans-serif';
    ctx.fillText(String(p.index+1),cx,cy+radius*.31);
  }
  function reserveDock(x,z){
    const count=reserves.length, gap=.405, width=.46+gap*(count-1);
    box(x,z,width+.17,.51,surface+.02,surface+.075,'#6c5d4e','#d1b584',.12);
    box(x,z,width+.10,.445,surface+.075,surface+.105,'#4c5755','#25494e',.10);
    reserves.forEach(([team,amount],i)=>{
      const xx=x+(i-(count-1)/2)*gap, base=TEAM[team];
      column(xx,z,.163,.176,.24,.28,'#8a795e','#d7bd87',16);
      column(xx,z,.164,.132,.28,.36,mix(base,'#233b42',.18),mix(base,'#f1d9a1',.17),16);
      for(let j=0;j<Math.min(amount,2);j++)feature(xx+(j-(Math.min(amount,2)-1)/2)*.080,z,.365,.024,.027,'#fff0c3');
    });
  }
  function paint(time) {
    frame=0;if(dead||!width||!height)return;
    if(turnStart){const t=Math.min(1,(time-turnStart)/420);angle=turnFrom+(turnTo-turnFrom)*(1-(1-t)**3);if(t===1)turnStart=0;}
    cos=Math.cos(angle);sin=Math.sin(angle);
    const dimension=Math.abs(cos)+Math.abs(sin);
    tilt=width<height?.81:.65;
    lift=Math.sqrt(1-tilt*tilt);
    across=width/(10.3*dimension+.12);
    along=height/(10.3*dimension*tilt+.82);
    scale=Math.min(across,along);
    ox=width/2;oy=height*.50;
    anchor=null;
    water();
    lacquer();inlay();trail();
    const display=objects.map(v=>({...v,order:dep(v.x,v.z)}));
    if(reserves.length){
      const x=1.35,z=3.30;
      display.push({x,z,order:dep(x,z),draw:()=>reserveDock(x,z)});
    }
    const groups=new Map();
    for(const p of pieces){if(!nodes[p.node])continue;const g=groups.get(p.node)||[];g.push(p);groups.set(p.node,g);}
    for(const [n,g] of groups){
      g.forEach((p,i)=>{
        const [nx,nz]=nodes[n],offset=(i-(g.length-1)/2)*.40;
        let x=nx+offset*cos,z=nz+offset*sin;
        let y=['corner','center','start'].includes(types[n])?.445:.362;
        const step=moves.find(v=>v.team===p.team&&v.index===p.index);
        if(step){
          const t=Math.min(1,Math.max(0,(time-step.start)/265));
          x=step.from[0]*(1-t)+x*t;z=step.from[1]*(1-t)+z*t;y+=Math.sin(pi*t)*.53;
        }
        const px=x,pz=z,py=y;
        display.push({x,z,order:dep(x,z)+.30,draw:()=>pawn(p,px,pz,py,g.length>1?.80:1)});
        if(p.team===activeTeam)display.push({x,z,order:dep(x,z)+.20,draw:()=>{
          const pts=mapAt(ring(px,pz,g.length>1?.36:.43,g.length>1?.36:.43,32),py+.004);line([...pts,pts[0]],'#28484a',.09);line([...pts,pts[0]],GOLD,.052);
        }});
      });
    }
    display.sort((a,b)=>a.order-b.order);
    for(const v of display){
      anchor={h:horizontal(v.x,v.z),d:dep(v.x,v.z)};
      v.draw();
    }
    anchor=null;
    for(const n of targets){
      const [x,z]=nodes[n];
      anchor={h:horizontal(x,z),d:dep(x,z)};
      const path=mapAt(ring(x,z,.72,.72,48),.48);
      line([...path,path[0]],'#15494d',.17);
      line([...path,path[0]],'#f4d296',.105);
      line([...path,path[0]],'#fff5cf',.036);
    }
    anchor=null;
    moves=moves.filter(m=>time-m.start<265);
    if(turnStart||moves.length)schedule();
  }
  function schedule(){if(!dead&&!frame)frame=requestAnimationFrame(paint);}
  function resize() {
    const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;
    const ratio=Math.min(window.devicePixelRatio||1,2);
    const w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx.setTransform(ratio,0,0,ratio,0,0);schedule();
  }
  const ro=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
  if(ro)ro.observe(canvas);else window.addEventListener('resize',resize);
  function tap(event) {
    if(!targets.length||!chooseDestination)return;
    const rect=canvas.getBoundingClientRect(),px=event.clientX-rect.left,py=event.clientY-rect.top;
    let nearest=null, distance=Math.max(21,scale*.85);
    for(const node of targets){
      const [x,z]=nodes[node], [sx,sy]=project([x,.48,z]);
      const diff=Math.hypot(px-sx,py-sy);
      if(diff<distance){nearest=node;distance=diff;}
    }
    if(nearest!==null)chooseDestination(nearest);
  }
  canvas.addEventListener('click',tap);
  resize();
  return {
    setTargets(destinations) {
      targets=[...new Set(destinations.filter(n=>nodes[n]))];
      canvas.classList.toggle('choosing',targets.length>0);
      schedule();
    },
    setState(next={}) {
      const list=Array.isArray(next.pieces)?next.pieces.filter(p=>p&&nodes[p.node]).map(p=>({...p})):[];
      if(!reduced()){
        const now=performance.now();
        moves=moves.filter(v=>now-v.start<265);
        for(const p of list){
          const prev=pieces.find(o=>o.team===p.team&&o.index===p.index);
          if(prev&&prev.node===p.node)continue;
          moves=moves.filter(v=>v.team!==p.team||v.index!==p.index);
          moves.push({team:p.team,index:p.index,from:nodes[prev?.node]??nodes[0],start:now});
        }
      }
      const counts=new Map();
      for(const p of Array.isArray(next.waiting)?next.waiting:[]){
        if(p&&TEAM[p.team])counts.set(p.team,(counts.get(p.team)||0)+1);
      }
      reserves=[...counts].sort(([a],[b])=>a-b);
      pieces=list;activeTeam=next.activeTeam;schedule();
    },
    rotate(direction=1) {
      turnFrom=angle;turnTo+=(direction<0?-1:1)*pi/2;
      if(reduced()){angle=turnTo;turnStart=0;} else turnStart=performance.now();
      schedule();
    },
    destroy(){dead=true;canvas.removeEventListener('click',tap);if(frame)cancelAnimationFrame(frame);ro?.disconnect();window.removeEventListener('resize',resize);}
  };
}
