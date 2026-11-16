import { animalFor,drawZodiac } from './zodiac.mjs?v=5';
import { TEAMS,EVENT_NAMES,tileEffect } from './rules.mjs?v=11';

// A square lacquer board viewed by a level, front-facing orthographic camera.
const TAU = Math.PI * 2;
export const PAWN_HOP_MS=265;
// Camera-facing arrangements, ordered back to front on a single shared base.
const stackSeats=[
  [],[[0,0]],[[-.40,0],[.40,0]],
  [[0,-.36],[-.37,.22],[.37,.22]],
  [[-.34,-.33],[.34,-.33],[-.38,.27],[.38,.27]]
];
const pawnSizes=[0,1.12,.96,.81,.77];
const validPawnIndex=index=>Number.isInteger(index)&&index>=0&&index<4;
const PEARL=['#fff1cd','#f1f3e4','#c5e8e1','#d0d3eb','#ead0df','#f7ddc7'];
const GOLD='#ffe3a2';
const eventStamps={
  back:{color:'#8e482f',tones:['#ffe3bf','#b87852','#f6c194'],
    contour:[[-.88,0],[-.46,-.54],[.65,-.54],[.77,-.41],[.77,.41],[.65,.54],[-.46,.54]]},
  carry:{color:'#1b6354',tones:['#e2f7d5','#73a58b','#b9e5bf'],
    contour:[[-.62,-.55],[.62,-.55],[.79,-.34],[.79,.34],[.62,.55],[-.62,.55],[-.79,.34],[-.79,-.34]]},
  home:{color:'#514276',tones:['#eee4ff','#a58bb9','#d8caeb'],
    contour:[[-.74,-.36],[0,-.67],[.74,-.36],[.62,.33],[0,.61],[-.62,.33]]}
};
const c = 4.05;
const nodes = [[c,c]];
for (let i=1;i<=5;i++) nodes.push([c,c-i*c*2/5]);
for (let i=1;i<=5;i++) nodes.push([c-i*c*2/5,-c]);
for (let i=1;i<=5;i++) nodes.push([-c,-c+i*c*2/5]);
for (let i=1;i<5;i++) nodes.push([-c+i*c*2/5,c]);
nodes.push([2*c/3,-2*c/3],[c/3,-c/3],[0,0],[-c/3,c/3],[-2*c/3,2*c/3],
  [-2*c/3,-2*c/3],[-c/3,-c/3],[c/3,c/3],[2*c/3,2*c/3]);
const tracks = [[...Array.from({length:20},(_,n)=>n),0],[5,20,21,22,23,24,15],[10,25,26,22,27,28,0]];
const types = nodes.map((_,i) => i===0?'start':i===22?'center':[5,10,15].includes(i)?'corner':i>=20?'path':'normal');
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
  if(!ctx)return {setState(){},setMoves(){},setTargets(){},beginReserveDrag(){return false;},updateReserveDrag(){},endReserveDrag(){return false;},cancelReserveDrag(){},rotate(){},destroy(){}};
  let width=0,height=0,scale=1,ox=0,oy=0;
  let angle=0,cos=1,sin=0,tilt=.8,lift=.6,framedAngle=null;
  const boardDepth=1.42;
  let objectDepth=null;
  let turnFrom=angle,turnTo=angle,turnStart=0,moves=[],pieces=[],reserves=[],activeTeam=null;
  const emphasisMs=640,turnGrowth=.14,stepLift=.53;
  let emphasisFrom=TEAMS.map(()=>0),emphasisStart=null;
  let frame=0,dead=false;
  const reduced=()=>typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function emphasis(team,time){
    const target=team===activeTeam?1:0;
    if(emphasisStart===null)return target;
    const t=Math.min(1,Math.max(0,(time-emphasisStart)/emphasisMs)),ease=t*t*(3-2*t);
    return emphasisFrom[team]+(target-emphasisFrom[team])*ease;
  }
  function setActiveTeam(team){
    if(team===activeTeam)return;
    const now=performance.now();
    emphasisFrom=TEAMS.map((_,i)=>emphasis(i,now));
    activeTeam=team;emphasisStart=reduced()?null:now;
  }
  const dep=(x,z)=>-x*sin+z*cos;
  let targets=[],options=[],selected=null,gesture=null,drawnPawns=[],skipClick=null;
  let tileState={},flags=[];
  let backdrop=null,beamKey='',beamStart=0,beamRise=0;
  const beamMs=1150;
  const horizontal=(x,z)=>x*cos+z*sin;
  function project([x,y,z]) {
    const d=dep(x,z);
    // Spread the stations along the table while keeping each solid's proportions.
    return [ox+horizontal(x,z)*scale,oy+((d+(objectDepth??d)*(boardDepth-1))*tilt-y*lift)*scale];
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
      // Each exposed rail carries its grain in the wood's local coordinates.
      for(let band=0;band<8;band++){
        const from=-4.51+seeded(side*22+band)*.35;
        const to=4.51-seeded(side*22+band+9)*.41;
        const strand=Array.from({length:31},(_,j)=>{
          const u=from+(to-from)*j/30;
          const ripple=Math.sin(u*2.1+band*.61)*.012+Math.sin(u*.89+side)*.025;
          return pt(u,-.20-band*.035+ripple);
        });
        line(strand,band%3?'rgba(61,32,20,.20)':'rgba(255,203,142,.24)',band%3?.010:.013);
      }
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
    solid(edge(10.02),edge(10),-.50,-.15,'#965f43','#b78254');
    solid(edge(10),edge(10.06),-.15,-.085,'#c8a778','#f2dfb7');
    solid(edge(10.06),edge(9.96),-.085,.04,'#607c70','#a1b6a2');
    solid(edge(9.96),edge(9.9),.04,surface,'#c5ad82',
      glaze(ox-scale*4.6,oy-scale*4,ox+scale*4.6,oy+scale*3.1,[[0,'#afd8c9'],[.24,'#89c1ae'],[.57,'#79ae9d'],[.82,'#6da192'],[1,'#5a8b80']]));
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
      wire(path,'#375d53',diag?.143:.170,surface+.018);wire(path,diag?'#e1f3e5':'#fff0c8',diag?.068:.081,surface+.020);
      const a=(x+u)/2,b=(z+v)/2,n=Math.hypot(u-x,v-z),dx=(u-x)/n,dz=(v-z)/n;
      face(mapAt([[a-.105*dx,b-.105*dz],[a-.044*dz,b+.044*dx],[a+.105*dx,b+.105*dz],[a+.044*dz,b-.044*dx]],surface+.022),diag?'#f5faf0':'#fff1c9');
    }
  }
  function eventStamp(stamp,label,x,y,r){
    // The face stays readable from each viewing side, like the pawn number plates.
    const h=r*Math.max(.78,tilt);
    const contour=stamp.contour.map(([u,v])=>[x+u*r,y+v*h]);
    flat(contour,stamp.color,'#fff4d9',Math.max(.8,r*.06));
    ctx.save();
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fffbed';
    ctx.font='bold '+Math.max(8,r*.86)+'px system-ui, sans-serif';
    ctx.fillText(label,x,y+h*.035,r*1.38);ctx.restore();
  }
  function tile(i){
    const [x,z]=nodes[i],type=tileEffect(tileState,i)??types[i];
    const hero=['start','corner','center'].includes(type);
    const rad=hero?.735:i>=20?.42:.505,y=nodeHeight(i);
    const [sx,sy]=project([x,y,z]),r=rad*scale;
    const stamp=Object.hasOwn(eventStamps,type)?eventStamps[type]:null;
    const tones=stamp?stamp.tones:hero?['#fff5d8','#d9b879','#f5e0ac']:
      i>=20?['#f0f7e9','#c5d4ca','#e6ecd9']:['#fff8e1','#d1d8c5','#f6efdb'];
    castShadow(x,z,surface+.004,rad*1.27,rad*1.19,y-surface,.59);
    castShadow(x,z,surface+.006,rad*.98,rad*.96,.08,.77);
    // Sweep circular sections up the turned body. Overlapping the projected
    // sections avoids hairline seams between separately antialiased facets.
    const profile=[[surface+.014,.89,hero?'#916b43':'#789281'],[surface+.075,.99,tones[1]],
      [y-.138,1,tones[1]],[y-.084,.97,tones[2]],[y-.025,.87,tones[2]],[y,.74,tones[0]]];
    for(let band=1;band<profile.length;band++){
      const [bottom,lo]=profile[band-1],[top,hi,base]=profile[band];
      const light=glaze(sx-r,sy,sx+r,sy,[[0,mix(base,'#614835',.25)],[.17,base],
        [.34,mix(base,'#fff6cf',.54)],[.61,base],[.89,mix(base,'#564d44',.25)],[1,mix(base,'#655246',.38)]]);
      const steps=Math.max(1,Math.ceil(((top-bottom)*lift*scale+Math.abs(hi-lo)*r)/.85));
      ctx.fillStyle=light;
      for(let k=band===1?0:1;k<=steps;k++){
        const t=k/steps,radius=(lo+(hi-lo)*t)*r,cy=sy+(y-bottom-(top-bottom)*t)*lift*scale;
        ctx.beginPath();ctx.ellipse(sx,cy,radius,radius*tilt,0,0,TAU);ctx.fill();
      }
    }
    const lid=glaze(sx-r*.65,sy-r*.62,sx+r*.72,sy+r*.60,[[0,tones[0]],[.48,tones[2]],[1,tones[1]]]);
    ctx.beginPath();ctx.ellipse(sx,sy,r*.74,r*.74*tilt,0,0,TAU);ctx.fillStyle=lid;ctx.fill();
    const disc=(size,col)=>feature(x,z,y+.006,size,size,col);
    const mark=(p,col)=>face(stampShape(p,x,z,rad,y+.019),col);
    const stroke=(p,col,w)=>line(stampShape(p,x,z,rad,y+.022),col,w*rad);
    if(stamp){eventStamp(stamp,EVENT_NAMES[type],sx,sy,r);return;}
    outline(ring(x,z,rad*.75,rad*.75,28),hero?'#a3824c':'#8b9c8c',.016,y+.010);
    if(type==='path'||type==='normal'){disc(rad*.105,type==='path'?'#577b79':'#8c8d71');disc(rad*.047,tones[0]);return;}
    if(type==='start'){
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
  function nodeHeight(n){return [0,5,10,15,22].includes(n)?.54:.425;}
  function pawn(p,x,z,y,size){
    const animal=Number.isInteger(p.animal)&&p.animal>=0&&p.animal<12?p.animal:animalFor(p.team,p.index);
    drawZodiac(ctx,project,x,y,z,size,animal,TEAMS[p.team].color);
  }
  function pawnPositions(time){
    const positions=[],groups=new Map();
    for(const p of pieces){
      const key=p.node*TEAMS.length+p.team;
      const group=groups.get(key)||[];
      group.push(p);groups.set(key,group);
    }
    for(const group of groups.values()){
      const node=group[0].node;
      const [nx,nz]=nodes[node],ground=nodeHeight(node)+.004;
      group.forEach((p,i)=>{
        const [side,depth]=stackSeats[group.length][i];
        const baseSize=pawnSizes[group.length];
        const light=emphasis(p.team,time),size=baseSize*(1+turnGrowth*light);
        let centerX=nx,centerZ=nz,y=ground;
        const step=moves.find(move=>move.team===p.team&&move.index===p.index);
        if(step){
          const t=Math.max(0,Math.min(1,(time-step.start)/PAWN_HOP_MS));
          centerX=step.from[0]*(1-t)+nx*t;centerZ=step.from[1]*(1-t)+nz*t;
          y+=Math.sin(pi*t)*stepLift*tilt;
        }
        positions.push({p,x:centerX+side*cos-depth*sin,z:centerZ+side*sin+depth*cos,
          centerX,centerZ,y,ground,size,light,from:node});
      });
    }
    return positions;
  }
  function drawBoard(){
    water();lacquer();
    ctx.save();ctx.globalAlpha=options.length?.38:.59;inlay();ctx.restore();
    trail();
    const display=objects.map(o=>({order:dep(o.x,o.z),draw:o.draw}));
    display.sort((a,b)=>a.order-b.order);
    for(const v of display){objectDepth=v.order;v.draw();}
    objectDepth=null;
  }
  function turnHalo(cx,cy,rx,ry,light){
    ctx.save();ctx.translate(cx,cy);ctx.scale(rx,ry);
    ctx.globalAlpha*=light;
    const glow=ctx.createRadialGradient(0,0,.96,0,0,1.34);
    glow.addColorStop(0,'rgba(45,188,187,.88)');
    glow.addColorStop(.38,'rgba(141,255,248,.80)');
    glow.addColorStop(1,'rgba(162,255,246,0)');
    ctx.fillStyle=glow;ctx.fillRect(-1.34,-1.34,2.68,2.68);
    ctx.beginPath();ctx.arc(0,0,1.16,0,TAU);
    ctx.lineWidth=.065;ctx.strokeStyle='#edfffa';ctx.stroke();
    ctx.restore();
  }
  function drawPawnGroup(group,carried=false){
    const first=group[0],team=first.p.team,stack=group.length>1;
    const x=stack?first.centerX:first.x,z=stack?first.centerZ:first.z;
    const [cx,cy]=project([x,first.ground+.013,z]);
    const rx=scale*(stack?.78*(1+turnGrowth*first.light):.49*first.size);
    const ry=scale*tilt*(group.length>=3?.72*(1+turnGrowth*first.light):.49*first.size);
    const chosen=team===activeTeam&&selected!==null&&group.some(a=>a.p.index===selected);
    ctx.save();
    const liftedSource=!carried&&isLifted(first);
    if(liftedSource)ctx.globalAlpha=.48;
    else castShadow(x,z,first.ground,rx/scale,ry/(tilt*scale),first.size*.83,.43);
    if(first.light>0&&!liftedSource)turnHalo(cx,cy,rx,ry,first.light);
    ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,TAU);ctx.fillStyle=TEAMS[team].ink;ctx.fill();
    ctx.strokeStyle=chosen?'#163653':'#fffbee';ctx.lineWidth=chosen?Math.max(5,scale*.16):Math.max(2.2,scale*.088);ctx.stroke();
    ctx.strokeStyle=chosen?'#96e9ff':TEAMS[team].color;ctx.lineWidth=chosen?Math.max(2.6,scale*.088):Math.max(1.2,scale*.052);ctx.stroke();
    if(chosen){
      for(const side of [-1,1]){
        const end=cx+side*(rx+scale*.043),notch=Math.max(4,scale*.13);
        flat([[end,cy],[end+side*notch,cy-notch*.73],[end+side*notch,cy+notch*.73]],'#97ebff','#193e5e',1.2);
      }
    }
    if(liftedSource){ctx.restore();return;}
    for(const a of group)pawn(a.p,a.x,a.z,a.y,a.size);
    const font=Math.max(chosen?12:10,Math.min(17,scale*.245)),h=font*(chosen?1.52:1.40);
    const ids=group.map(a=>a.p.index+1).sort((a,b)=>a-b);
    const numbers=ids.length>2&&ids.at(-1)-ids[0]===ids.length-1?ids[0]+'–'+ids.at(-1):ids.join('·');
    const name=(scale<28?TEAMS[team].mark:TEAMS[team].name)+' '+numbers;
    ctx.font='bold '+font+'px "Noto Sans CJK KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    const mark=chosen?font*.94:0;
    const w=(ctx.measureText(name)?.width??font*name.length*.86)+font*.78+mark;
    const left=Math.max(1,Math.min(width-w-1,cx-w/2));
    const top=Math.max(1,Math.min(height-h-1,cy+ry*.76-h*.21));
    const cap=chosen?h*.28:h/2;
    ctx.beginPath();ctx.moveTo(left+cap,top);
    ctx.arcTo(left+w,top,left+w,top+h,cap);ctx.arcTo(left+w,top+h,left,top+h,cap);
    ctx.arcTo(left,top+h,left,top,cap);ctx.arcTo(left,top,left+w,top,cap);ctx.closePath();
    ctx.fillStyle=chosen?'#193f60':TEAMS[team].ink;ctx.fill();ctx.lineWidth=Math.max(1,font*.10);ctx.strokeStyle=chosen?'#b3efff':'#fffbed';ctx.stroke();
    if(chosen){
      const xx=left+font*.38,yy=top+h*.52;
      ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(xx+font*.22,yy+font*.21);ctx.lineTo(xx+font*.65,yy-font*.27);
      ctx.strokeStyle='#9aecff';ctx.lineWidth=Math.max(1.7,font*.17);ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
    }
    ctx.fillStyle='#fff';ctx.fillText(name,left+(w+mark)/2,top+h*.51);
    for(const a of group)a.tag={left,top,right:left+w,bottom:top+h};
    ctx.restore();
  }
  function drawPawns(){
    const groups=[];
    for(const a of drawnPawns){
      // Members converging onto a square keep their own base until they arrive together.
      const stack=groups.find(([b])=>b.from===a.from&&b.p.team===a.p.team&&Math.hypot(a.centerX-b.centerX,a.centerZ-b.centerZ)<.22);
      if(stack)stack.push(a);else groups.push([a]);
    }
    groups.sort(([a],[b])=>dep(a.x,a.z)-dep(b.x,b.z));
    for(const group of groups)drawPawnGroup(group);
  }
  function beamShape(n){
    const [x,z]=nodes[n],[cx,cy]=project([x,targetHeight(n),z]);
    const radius=scale*(nodeHeight(n)>.4?.59:.48);
    const reach=Math.min(scale*(1.30+.70*lift),Math.max(0,cy-3));
    return {cx,cy,radius,reach};
  }
  function drawBeam(n,elapsed,hover){
    const {cx,cy,radius:r,reach}=beamShape(n);
    const h=Math.max(1,reach*beamRise),depth=r*tilt;
    const gold=hover?'255,160,39':'255,190,67';
    ctx.save();ctx.translate(cx,cy);
    // The footprint stays on the tile while the fluted sides grow vertically.
    ctx.save();ctx.scale(r*1.52,depth*1.52);
    const pool=ctx.createRadialGradient(0,0,.12,0,0,1);
    pool.addColorStop(0,'rgba(255,252,200,.72)');pool.addColorStop(.61,'rgba('+gold+',.58)');pool.addColorStop(1,'rgba('+gold+',0)');
    ctx.fillStyle=pool;ctx.fillRect(-1,-1,2,2);ctx.restore();
    const oval=(y,rx,ry,color,weight)=>{
      ctx.beginPath();ctx.ellipse(0,y,rx,ry,0,0,TAU);ctx.strokeStyle=color;ctx.lineWidth=weight;ctx.stroke();
    };
    oval(0,r*1.17,depth*1.17,hover?'#60371d':'#795029',Math.max(2.8,scale*.089));
    oval(0,r*1.17,depth*1.17,hover?'#fff1a6':'#ffc063',Math.max(1.4,scale*.045));
    const shaft=glaze(0,depth*.42,0,-h,[[0,'rgba(255,244,170,.08)'],[.20,'rgba('+gold+','+(hover?.58:.42)+')'],[.68,'rgba(255,244,187,.28)'],[1,'rgba(255,250,219,0)']]);
    ctx.fillStyle=shaft;ctx.beginPath();ctx.moveTo(-r,0);
    ctx.lineTo(-r*.84,-h);ctx.lineTo(r*.84,-h);ctx.lineTo(r,0);
    ctx.ellipse(0,0,r,depth,0,0,pi);ctx.closePath();ctx.fill();
    const core=glaze(0,depth*.4,0,-h,[[0,'rgba(255,255,219,.66)'],[.32,'rgba(255,249,195,.48)'],[1,'rgba(255,250,207,0)']]);
    flat([[-r*.40,depth*.39],[-r*.15,-h*.97],[r*.14,-h],[r*.36,depth*.39]],core);
    const ray=glaze(0,0,0,-h,[[0,'rgba(255,255,220,.98)'],[.42,'rgba(255,250,193,.87)'],[1,'rgba(255,250,220,0)']]);
    ctx.strokeStyle=ray;ctx.lineWidth=Math.max(1.1,scale*(hover?.052:.037));
    for(const edge of [-1,-.68,.73,1]){
      const foot=Math.sqrt(1-edge*edge)*depth*.82;
      ctx.beginPath();ctx.moveTo(edge*r,foot);ctx.lineTo(edge*r*.84,-h+foot*.28);ctx.stroke();
    }
    oval(0,r,depth,'rgba(255,254,221,.98)',Math.max(1.1,scale*.044));
    // The rim and flecks travel upward once, then leave a steady light.
    if(elapsed<beamMs){
      const t=elapsed/beamMs,k=1-.18*t,opacity=Math.sin(pi*t)*.52;
      oval(-h*t*.86,r*k,depth*k*.63,'rgba(255,253,204,'+opacity+')',Math.max(1,scale*.045));
      for(const [i,offset] of [-.48,.20,.58].entries()){
        const u=(t-.10*i)/.78;
        if(u<=0||u>=1)continue;
        const x=offset*r,y=-h*u,s=Math.sin(pi*u)*Math.max(1.5,r*.12);
        flat([[x,y-s*1.5],[x+s*.60,y],[x,y+s*1.5],[x-s*.60,y]],'rgba(255,255,222,'+Math.sin(pi*u)+')');
      }
    }
    ctx.restore();
  }
  function flagLayout(allowed){
    const index=gesture?.index??selected;
    if(index==null||!options.length)return [];
    const font=Math.max(13,Math.min(18,scale*.34)),h=font+9;
    ctx.font='bold '+font+'px "Noto Sans CJK KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    const placed=[],obstacles=[];
    for(const actor of drawnPawns){
      if(isLifted(actor))continue;
      const [x,foot]=project([actor.x,actor.y,actor.z]),[,head]=project([actor.x,actor.y+1.07*actor.size,actor.z]);
      const r=scale*.43*actor.size;
      obstacles.push({left:x-r,top:head-r*.21,right:x+r,bottom:foot+r*.19});
      if(actor.tag)obstacles.push(actor.tag);
    }
    for(const [i,n] of allowed.entries()){
      const option=options.find(o=>o.team===activeTeam&&o.index===index&&o.to===n);
      const fallback=n===0?'골인':allowed.length>1?'길 '+(i+1):'도착';
      const label=typeof option?.label==='string'?option.label.trim().slice(0,6)||fallback:fallback;
      const w=Math.ceil((ctx.measureText(label)?.width??font*label.length)+font*.86+5);
      const {cx,cy,radius,reach}=beamShape(n);
      const rise=Math.max(12,Math.min(reach*.74,scale*1.13)),side=radius*.92+w*.45;
      const candidates=[
        [cx,cy-rise-h*.51],[cx-side,cy-rise*.70],[cx+side,cy-rise*.70],
        [cx-side,cy+radius*.54],[cx+side,cy+radius*.54],[cx,cy+radius*tilt+h*.67]
      ];
      let best=null,bestCost=Infinity;
      for(const [rank,[x,y]] of candidates.entries()){
        const left=Math.max(3,Math.min(width-w-3,x-w/2)),top=Math.max(3,Math.min(height-h-3,y-h/2));
        const flag={n,label,font,left,top,right:left+w,bottom:top+h,cx,cy,radius};
        let cost=rank*3+Math.abs(left+w/2-x)+Math.abs(top+h/2-y);
        for(const rect of [...obstacles,...placed]){
          const overlapX=Math.min(flag.right+3,rect.right)-Math.max(flag.left-3,rect.left);
          const overlapY=Math.min(flag.bottom+3,rect.bottom)-Math.max(flag.top-3,rect.top);
          if(overlapX>0&&overlapY>0)cost+=overlapX*overlapY*4;
        }
        // Keep the rim of each legal square visible, including its neighbour at a fork.
        for(const node of allowed){
          const beam=beamShape(node),rad=beam.radius*.74;
          const dx=Math.max(flag.left-beam.cx,0,beam.cx-flag.right);
          const dy=Math.max(flag.top-beam.cy,0,beam.cy-flag.bottom)/tilt;
          cost+=Math.max(0,rad-Math.hypot(dx,dy))*7;
        }
        if(cost<bestCost){best=flag;bestCost=cost;}
      }
      placed.push(best);
    }
    return placed;
  }
  function drawFlag(flag,hover){
    const {left:l,top:t,right:r,bottom:b,cx,cy,radius,font,label}=flag;
    const h=b-t,mid=(t+b)/2,edge='#6b371c';
    const joinX=Math.max(l+h*.22,Math.min(r-h*.28,cx));
    const joinY=cy>mid?b:t;
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(cx,cy-radius*tilt*.30);ctx.lineTo(joinX,joinY);
    ctx.lineWidth=3.2;ctx.strokeStyle=edge;ctx.stroke();ctx.lineWidth=1.55;ctx.strokeStyle='#ffc469';ctx.stroke();
    const pts=[[l+3,t],[r-3,t],[r,t+3],[r-h*.12,mid],[r,b-3],[r-3,b],[l+3,b],[l,b-3],[l,t+3]];
    flat(pts.map(([x,y])=>[x,y+1.3]),'rgba(63,39,23,.23)');
    flat(pts,hover?'#ffb340':'#ffc06a',edge,Math.max(1.8,font*.13));
    ctx.fillStyle='#452912';ctx.font='bold '+font+'px "Noto Sans CJK KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,(l+r)/2-1,mid);
    ctx.restore();
  }
  function flagAt(x,y,allowed){
    return flags.find(f=>allowed.includes(f.n)&&x>=f.left-1&&x<=f.right+1&&y>=f.top-1&&y<=f.bottom+1);
  }
  function frameBoard(){
    const rotationSpan=Math.abs(cos)+Math.abs(sin),span=10.06*rotationSpan;
    const pad=Math.max(3,Math.min(10,Math.min(width,height)*.014));
    const widthScale=(width-2*pad)/span,availableHeight=(height-2*pad)/widthScale;
    // Reserve the far corner for a full-size, highlighted pawn at the top of its hop,
    // even on an empty board. Only the viewport and deliberate rotation affect the camera.
    const size=pawnSizes[1]*(1+turnGrowth),farCorner=c*rotationSpan;
    const head=nodeHeight(0)+.004+1.15*size;
    const top=(t,l)=>-Math.max(span*.5*boardDepth*t+surface*l,(farCorner*boardDepth+.40*size)*t+(head+stepLift*t)*l);
    const bottom=(t,l)=>(span*.5+.08)*boardDepth*t+.83*l;
    let low=.72,high=.85;
    for(let i=0;i<10;i++){
      const mid=(low+high)/2,l=Math.sqrt(1-mid*mid);
      if(bottom(mid,l)-top(mid,l)<=availableHeight)low=mid;
      else high=mid;
    }
    tilt=low;lift=Math.sqrt(1-tilt*tilt);
    const first=top(tilt,lift),last=bottom(tilt,lift);
    scale=Math.min(widthScale,(height-2*pad)/(last-first));
    ox=width/2;oy=height/2-(first+last)*scale/2;
    framedAngle=angle;
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
    if(framedAngle!==angle)frameBoard();
    if(emphasisStart!==null&&(reduced()||time-emphasisStart>=emphasisMs))emphasisStart=null;
    drawnPawns=pawnPositions(time);
    const allowed=destinationNodes();
    const key=allowed.length?[activeTeam,selected??'all',...allowed].join('/'):'';
    if(key!==beamKey){beamKey=key;beamStart=time;backdrop=null;}
    const elapsed=reduced()?beamMs:Math.max(0,time-beamStart);
    beamRise=1-(1-Math.min(1,elapsed/510))**3;
    const stationary=!turnStart;
    if(stationary&&backdrop){
      ctx.drawImage(backdrop,0,0,width,height);
    }else{
      backdrop=null;
      drawBoard();
      if(stationary){
        const picture=typeof OffscreenCanvas==='function'?new OffscreenCanvas(canvas.width,canvas.height):canvas.ownerDocument?.createElement('canvas');
        if(picture){
          picture.width=canvas.width;picture.height=canvas.height;
          const copy=picture.getContext('2d');
          if(copy){copy.drawImage(canvas,0,0);backdrop=picture;}
        }
      }
    }
    const over=gesture?.moved?destinationAt(gesture.x,gesture.y,allowed):null;
    for(const n of allowed)drawBeam(n,elapsed,n===over);
    drawPawns();
    if(!gesture?.moved||!flags.length||turnStart)flags=flagLayout(allowed);
    for(const flag of flags)drawFlag(flag,flag.n===over);
    if(gesture?.moved&&(!gesture.external||insideCanvas(gesture)))drawLifted();
    moves=moves.filter(m=>time-m.start<PAWN_HOP_MS);
    if(turnStart||moves.length||(allowed.length&&elapsed<beamMs)||(emphasisStart!==null&&drawnPawns.some(a=>a.p.team===activeTeam||emphasisFrom[a.p.team]>0)))schedule();
  }
  function schedule(){if(!dead&&!frame)frame=requestAnimationFrame(paint);}
  function resize() {
    const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;
    framedAngle=null;backdrop=null;flags=[];
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
  function pawnDistance(actor,px,py){
    const tag=actor.tag;
    if(tag&&px>=tag.left&&px<=tag.right&&py>=tag.top&&py<=tag.bottom)return 0;
    const [x,base]=project([actor.x,actor.y+.10*actor.size,actor.z]);
    const [,head]=project([actor.x,actor.y+1.03*actor.size,actor.z]);
    const dy=py-Math.max(head,Math.min(base,py)),d=Math.hypot(px-x,dy);
    return d<=Math.max(22,.42*actor.size*scale)?d+.04*Math.abs(py-(head+base)/2):Infinity;
  }
  function destinationAt(px,py,allowed){
    const flag=flagAt(px,py,allowed);
    if(flag)return flag.n;
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
    // Ground squares and figures take precedence over a shaft behind them.
    if(nearest===null&&beamRise>0&&!drawnPawns.some(a=>!isLifted(a)&&pawnDistance(a,px,py)<Infinity)){
      let closest=Infinity;
      for(const n of allowed){
        const {cx,cy,radius,reach}=beamShape(n),dx=Math.abs(px-cx);
        if(dx<radius*.82 && py<cy && py>cy-reach*beamRise*.86 && cy-py<closest){
          nearest=n;closest=cy-py;
        }
      }
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
        const [x,y]=project([actor.centerX,actor.y,actor.centerZ]);
        nearest={...option,gripX:(x-px)/scale,gripY:(y-py)/scale};distance=d;
      }
    }
    return nearest;
  }
  function drawLifted(){
    const g=gesture,base=surface+.01,u=(g.x-ox)/scale+g.gripX,d=((g.y-oy)/scale+g.gripY+base*lift)/(tilt*boardDepth);
    const x=u*cos-d*sin,z=u*sin+d*cos;
    const carried=g.external?[{p:g.p,from:-1,size:pawnSizes[1]*(1+turnGrowth),light:1}]:drawnPawns.filter(isLifted);
    if(carried.length)drawPawnGroup(carried.map((actor,i)=>{
      const [side,depth]=stackSeats[carried.length][i];
      return {...actor,centerX:x,centerZ:z,x:x+side*cos-depth*sin,z:z+side*sin+depth*cos,ground:base,y:base+.30};
    }),true);
  }
  function local(event){
    const rect=canvas.getBoundingClientRect();
    return [event.clientX-rect.left,event.clientY-rect.top];
  }
  const insideCanvas=g=>g.x>=0&&g.y>=0&&g.x<width&&g.y<height;
  function beginReserveDrag(index,event){
    if(dead||gesture)return false;
    const p=reserves.find(p=>p.team===activeTeam&&p.index===index);
    if(!p||!options.some(o=>o.team===p.team&&o.index===index&&o.from===-1))return false;
    const [x,y]=local(event);
    if(selected!==index)flags=[];
    selected=index;skipClick=null;
    gesture={external:true,p,team:p.team,index,from:-1,x,y,clientX:event.clientX,clientY:event.clientY,moved:true,gripX:0,gripY:0};
    schedule();return true;
  }
  function updateReserveDrag(event){
    if(!gesture?.external)return;
    [gesture.x,gesture.y]=local(event);gesture.clientX=event.clientX;gesture.clientY=event.clientY;
    schedule();
  }
  function endReserveDrag(event){
    if(!gesture?.external)return false;
    updateReserveDrag(event);
    const g=gesture,to=insideCanvas(g)?destinationAt(g.x,g.y,destinationNodes()):null;
    closeGesture(true);
    if(to==null)return false;
    if(dropPawn)dropPawn(g.index,to);else chooseDestination?.(to);
    return true;
  }
  function cancelReserveDrag(){if(gesture?.external)closeGesture(false);}
  function closeGesture(blockClick){
    if(!gesture)return;
    const g=gesture;gesture=null;backdrop=null;
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
  function canSwitchHere(option,x,y,allowed){
    if(!option||option.index===selected||flagAt(x,y,allowed))return false;
    return drawnPawns.some(actor=>{
      if(optionFor(actor)?.index!==option.index)return false;
      const t=actor.tag;
      if(t&&x>=t.left&&x<=t.right&&y>=t.top&&y<=t.bottom)return true;
      return !allowed.includes(actor.from)&&pawnDistance(actor,x,y)<scale*.29*actor.size;
    });
  }
  function pointerDown(event){
    if(!options.length||gesture||event.isPrimary===false||(event.button!=null&&event.button!==0))return;
    skipClick=null;
    const [x,y]=local(event);
    const allowed=destinationNodes(),option=pieceAt(x,y);
    if(!option)return;
    if(selected!=null&&destinationAt(x,y,allowed)!=null&&!canSwitchHere(option,x,y,allowed))return;
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
    if(!g.moved&&Math.hypot(g.x-g.startX,g.y-g.startY)>5){g.moved=true;backdrop=null;}
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
    const allowed=destinationNodes(),node=destinationAt(x,y,allowed),option=pieceAt(x,y);
    if(option&&(selected==null||node==null||canSwitchHere(option,x,y,allowed))){
      selected=option.index;choosePawn?.(option.index);schedule();return;
    }
    if(node!=null)chooseDestination?.(node);
  }
  const listeners={pointerdown:pointerDown,pointermove:pointerMove,pointerup:pointerUp,pointercancel:pointerCancel,lostpointercapture:pointerCancel,click:tap};
  for(const [type,listener] of Object.entries(listeners))canvas.addEventListener(type,listener);
  resize();
  return {
    beginReserveDrag,updateReserveDrag,endReserveDrag,cancelReserveDrag,
    setTargets(destinations) {
      targets=[...new Set(destinations.filter(n=>nodes[n]))];
      if(!targets.length&&!options.length){beamKey='';beamRise=0;backdrop=null;}
      canvas.classList.toggle('choosing',targets.length>0||options.length>0);schedule();
    },
    setMoves(available=[],selectedIndex=null){
      backdrop=null;flags=[];
      options=available.filter(o=>o&&TEAMS[o.team]&&validPawnIndex(o.index)&&(o.from===-1||nodes[o.from])&&nodes[o.to]);
      selected=Number.isInteger(selectedIndex)?selectedIndex:null;
      if(!options.length&&!targets.length){beamKey='';beamRise=0;}
      if(gesture&&!options.some(o=>o.index===gesture.index&&o.team===gesture.team&&o.from===gesture.from))closeGesture(true);
      canvas.classList.toggle('choosing',options.length>0||targets.length>0);
      if(canvas.style)canvas.style.touchAction=options.length?'none':'';
      schedule();
    },
    setState(next={}) {
      backdrop=null;flags=[];
      const list=Array.isArray(next.pieces)?next.pieces.filter(p=>p&&TEAMS[p.team]&&validPawnIndex(p.index)&&nodes[p.node]).map(p=>({...p})):[];
      if(next.snap)moves=[];
      else if(!reduced()){
        const now=performance.now();
        moves=moves.filter(v=>now-v.start<PAWN_HOP_MS);
        for(const p of list){
          const prev=pieces.find(o=>o.team===p.team&&o.index===p.index);
          if(prev&&prev.node===p.node)continue;
          moves=moves.filter(v=>v.team!==p.team||v.index!==p.index);
          moves.push({team:p.team,index:p.index,from:nodes[prev?.node]??nodes[0],start:now});
        }
      }
      reserves=Array.isArray(next.waiting)?next.waiting.filter(p=>p&&TEAMS[p.team]&&validPawnIndex(p.index)).map(p=>({...p})):[];
      pieces=list;setActiveTeam(next.activeTeam??null);tileState=next;
      if(gesture&&(gesture.team!==activeTeam||(gesture.external&&!reserves.some(p=>p.team===gesture.team&&p.index===gesture.index))))closeGesture(true);
      schedule();
    },
    rotate(direction=1) {
      backdrop=null;flags=[];
      turnFrom=angle;turnTo+=(direction<0?-1:1)*pi/2;
      if(reduced()){angle=turnTo;turnStart=0;} else turnStart=performance.now();
      schedule();
    },
    destroy(){
      dead=true;backdrop=null;closeGesture(false);
      if(frame)cancelAnimationFrame(frame);
      for(const [type,listener] of Object.entries(listeners))canvas.removeEventListener(type,listener);
      ro?.disconnect();window.removeEventListener('resize',resize);
    }
  };
}
