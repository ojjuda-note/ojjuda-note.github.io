// An orthographic miniature. All terrain, landmarks, counters and tile markings
// live in board coordinates, so they keep their depth when the view turns.
const TAU = Math.PI * 2;
const TEAM = ['#ed7057', '#239b90', '#9661c5', '#dfad38'];
const TILE = {normal:'#ffedbe', start:'#ffb19a', corner:'#ffe39b', path:'#def2da',
  whirl:'#8fdee7', stone:'#efaa9b', breeze:'#a8d9a4', center:'#ffd371'};
const MARK = {normal:'#c7a36c', start:'#8f4a3f', corner:'#a27430', path:'#83ad8a',
  whirl:'#267e97', stone:'#9d544a', breeze:'#427e55', center:'#976a24'};
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
const coast = [[-4.8,-4.75],[-3.15,-5.05],[-1.5,-4.96],[-.65,-5.22],[1,-5.1],[2.55,-5.13],[4.65,-4.92],[5.02,-4.35],[5.05,-3.33],[4.97,-2.36],[5.24,-1.04],[5.07,.31],[5.23,1.54],[5.06,2.7],[5.08,4.33],[4.54,4.99],[3.03,5.05],[1.78,5.26],[.43,5.12],[-.93,5.24],[-2.25,5.0],[-3.42,5.16],[-4.63,4.96],[-5.02,4.21],[-5.08,2.92],[-4.96,1.56],[-5.13,.43],[-5.22,-1.03],[-5.07,-2.23],[-5.18,-3.56],[-5.03,-4.27]];
const grass = '#9bcf88';
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

export function createBoard(canvas) {
  const ctx = canvas.getContext('2d');
  if(!ctx) return {setState(){},rotate(){},destroy(){}};
  let width=0,height=0,scale=1,ox=0,oy=0;
  let angle=-.57,cos=Math.cos(angle),sin=Math.sin(angle),tilt=.66,lift=.75;
  let turnFrom=angle,turnTo=angle,turnStart=0,moves=[],pieces=[],activeTeam=0;
  let frame=0,dead=false;
  const reduced=()=>typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dep=(x,z)=>-x*sin+z*cos;
  const project=([x,y,z])=>[ox+scale*(x*cos+z*sin),oy+scale*(dep(x,z)*tilt-y*lift)];
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
  function pebble(x,z,y,s,base) {
    const r=ring(x,z,s,.76*s,7,.24);
    const ht=r.map(([a,b],i)=>[x+(a-x)*(.53+.18*seeded(i+7)),z+(b-z)*.69]);
    solid(r,ht,y,y+.48*s,base,mix(base,'#ffffe8',.3));
  }
  function island() {
    const edge=f=>coast.map(([x,z])=>[x*f,z*f]);
    const foam=edge(1.06),sand=edge(1.01),rock=edge(.995),turf=edge(.984);
    face(mapAt(edge(1.095),-.60),'rgba(65,169,165,.28)');
    face(mapAt(edge(1.077),-.59),'rgba(198,246,217,.82)');
    solid(foam,sand,-.6,-.40,'#e5c78a','#ffdc99');
    solid(rock,rock,-.40,-.03,'#bc9c74','#d5b783',true);
    solid(rock,turf,-.04,.12,'#77ae69',grass);
    // A scattering of raised meadow patches gives the plateau a hand-painted edge.
    for(let i=0;i<55;i++){
      const x=seeded(i+5)*9.35-4.7,z=seeded(i+160)*9.35-4.7;
      const col=i%3===0?'rgba(214,229,161,.54)':'rgba(117,181,117,.34)';
      feature(x,z,.124,.10+seeded(i+23)*.30,.05+seeded(i)*.17,col);
    }
  }
  function water(){
    const g=ctx.createLinearGradient(0,0,width*.30,height);
    g.addColorStop(0,'#b2e9e9');g.addColorStop(.53,'#89d6dc');g.addColorStop(1,'#65bdcb');
    ctx.fillStyle=g;ctx.fillRect(0,0,width,height);
    for(let i=0;i<112;i++){
      const x=width*seeded(50+i),y=height*seeded(500+i),w=(3+seeded(900+i)*14)*Math.max(.64,width/720);
      ctx.strokeStyle=i%4?'rgba(248,255,239,.46)':'rgba(59,157,171,.22)';
      ctx.lineWidth=Math.max(.7,scale*.027);ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(x-w,y);ctx.quadraticCurveTo(x-w*.4,y+w*.14,x,y);ctx.quadraticCurveTo(x+w*.51,y-w*.13,x+w*.85,y);ctx.stroke();
    }
  }
  function trail(){
    for(const route of tracks)for(let i=1;i<route.length;i++){
      const a=nodes[route[i-1]],b=nodes[route[i]];
      const [x,z]=a,[u,v]=b;
      line([[x,.13,z],[u,.13,v]],i&&route.length===21?'#88b577':'#89b57d',.25);
      line([[x,.135,z],[u,.135,v]],route.length===21?'#f5d79b':'#cfdea9',.16);
      const p=(x+u)/2,q=(z+v)/2;
      feature(p,q,.143,.08,.08,route.length===21?'#ffedc1':'#e6ecc8');
    }
  }
  function tile(i) {
    const [x,z]=nodes[i],type=types[i],isBig=['start','corner','center'].includes(type),inside=i>=20;
    const w=isBig?1.32:inside?.94:1.08, h=.37+(isBig?.08:0),r=isBig?.28:.19, ground=.13;
    const base=rounded(x,z,w,w,r),upper=rounded(x,z,w-.065,w-.065,r*.94);
    feature(x+.055,z+.085,ground,w*.67,w*.57,'rgba(54,104,72,.16)');
    solid(base,base,ground,h-.08,inside?'#86ab76':'#bd9d6a',TILE[type]);
    solid(base,upper,h-.08,h,mix(TILE[type],'#b69765',.28),TILE[type]);
    const mark=MARK[type],y=h+.012,m=isBig?.86:.75;
    function icon(pts,color=mark){face(stampShape(pts,x,z,m,y),color);}
    function stroke(pts,color=mark,w=.055){line(stampShape(pts,x,z,m,y+.003),color,w);}
    if(type==='stone'){
      icon([[-.45,.26],[-.12,-.30],[.08,.02],[.22,-.18],[.45,.26]]);
      icon([[-.12,-.30],[-.22,-.12],[-.09,-.14],[.025,-.07]],'#ffddbb');
    }else if(type==='breeze'){
      for(const d of [-.2,.13])icon([[-.33,d-.17],[0,d-.03],[.30,d-.17],[.30,d], [0,d+.14],[-.33,d]]);
    }else if(type==='whirl'){
      const p=Array.from({length:35},(_,j)=>{const a=j*.26,r=.40*(1-j/42);return [r*Math.cos(a),r*Math.sin(a)];});
      stroke(p,mark,.072);
    }else if(type==='center'){
      icon([[0,-.48],[.13,-.14],[.47,0],[.13,.14],[0,.48],[-.13,.14],[-.47,0],[-.13,-.14]]);
      feature(x,z,y+.005,.078,.078,'#ffe5a8');
    }else if(type==='corner' && i!==15) {
      stroke([[0,.31],[0,.01],[-.25,-.23]]);stroke([[0,.01],[.26,-.22]]);
      for (const [a,b] of [[-.27,-.25],[.27,-.25],[0,.31]])feature(x+a*m,z+b*m,y+.006,.078,.078,mark);
    }else if(type==='start'){
      const cells=.15;
      for(let a=0;a<4;a++)for(let b=0;b<3;b++)if((a+b)%2===0)face(mapAt(rounded(x+(a-1.5)*cells,z+(b-1)*cells,cells*1.01,cells*1.01,0),y),mark);
    }else{
      const rad=i===15?.17:inside?.07:.12;
      feature(x,z,y,rad,rad,mark);if(!inside)feature(x,z,y+.005,rad*.49,rad*.49,TILE[type]);
    }
  }
  function pine(x,z,s) {
    const y=.13,at=n=>y+n*s;
    feature(x+.10*s,z+.08*s,y,.48*s,.32*s,'rgba(48,107,70,.20)');
    column(x,z,.11*s,.08*s,y,at(.71),'#9a7152','#ba8b5c',8);
    for(const [dy,rad,colour] of [[.34,.49,'#42866a'],[.65,.39,'#519d78'],[.92,.28,'#66af80']]){
      const lo=ring(x,z,rad*s,rad*s,9,.12),hi=ring(x-.018*s,z,.027*s,.027*s,9,.12);
      solid(lo,hi,at(dy),at(dy+rad*1.46),colour,'#a5d39b');
    }
  }
  function shrub(x,z,s) {
    feature(x+.07,z+.06,.13,s,s*.71,'rgba(58,107,70,.18)');
    pebble(x-.12*s,z,.13,s,'#69a968');pebble(x+.56*s,z+.06*s,.13,s*.68,'#7bb46e');
  }
  function house(x,z,s) {
    const ground=.13,yy=t=>ground+t*s;
    const block=(w,d,b,t,side,lid=side)=>box(x,z,w*s,d*s,yy(b),yy(t),side,lid,.035*s);
    feature(x+.10*s,z+.14*s,.13,1.12*s,.90*s,'rgba(53,103,70,.21)');
    block(1.76,1.34,0,.12,'#b5a995','#eddec1');block(1.60,1.19,.12,.22,'#b88962','#f0c990');
    const posts=[[-.64,-.42],[.64,-.42],[-.64,.42],[.64,.42]].sort((a,b)=>dep(...a)-dep(...b));
    for(const [px,pz] of posts){
      column(x+px*s,z+pz*s,.084*s,.073*s,yy(.22),yy(.98),'#b65c46','#e7a377',9);
      column(x+px*s,z+pz*s,.105*s,.10*s,yy(.24),yy(.30),'#e2ad72','#ffdb9d',9);
    }
    block(1.72,1.26,.83,.96,'#418677','#6ba892');
    block(1.86,1.40,.96,1.03,'#e1a066','#ffe4b1');
    function roofLayer(w,d,baseY,topY,color,topHalf){
      const verts=[[0,-d/2,0],[w/2,-d/2,.14],[w/2,0,0],[w/2,d/2,.14],[0,d/2,0],[-w/2,d/2,.14],[-w/2,0,0],[-w/2,-d/2,.14]];
      const low=verts.map(([a,b,up])=>[x+a*s,yy(baseY+up),z+b*s]);
      const high=verts.map(([a,b])=>[x+a*topHalf*s,yy(topY),z+b*.16*s]);
      const fs=[];
      for(let i=0;i<8;i++){
        const j=(i+1)%8;
        fs.push({depth:dep((low[i][0]+low[j][0])/2,(low[i][2]+low[j][2])/2),p:[low[i],low[j],high[j],high[i]],i});
      }
      fs.sort((a,b)=>a.depth-b.depth);
      for(const f of fs){face(f.p,['#3e6679','#537a8c','#7193a0','#4d7486'][Math.floor(f.i/2)]);line([f.p[0],f.p[1]],color,.055*s);
        for (const t of [.22,.48,.74]){
          const lerp=(a,b)=>a.map((v,k)=>v+(b[k]-v)*t);
          line([lerp(f.p[0],f.p[1]),lerp(f.p[3],f.p[2])],'rgba(220,237,229,.27)',.024*s);
        }
      }
      face(high,'#7e9da6'); line([high[7],high[1]],'#a6babc',.066*s);
    }
    roofLayer(2.18,1.65,1.03,1.48,'#354f62',.56);
    line([[x-.70*s,yy(1.56),z],[x-.57*s,yy(1.50),z],[x+.57*s,yy(1.50),z],[x+.70*s,yy(1.56),z]],'#435e71',.10*s);
  }
  function rockCluster(x,z,s){
    feature(x+.03,z+.06,.13,s*.53,s*.29,'rgba(72,112,78,.19)');
    pebble(x-.10*s,z,.13,.34*s,'#92a39b');pebble(x+.20*s,z+.09*s,.13,.21*s,'#acb9a2');
  }
  function boat(x,z,s) {
    const y=-.58;
    feature(x+.08,z+.05,y,.74*s,.24*s,'rgba(63,157,167,.29)');
    const hull=[[-.69,0],[-.42,-.18],[.34,-.2],[.68,0],[.37,.2],[-.43,.18]];
    const outline=k=>hull.map(([a,b])=>[x+a*k*s,z+b*k*s]);
    solid(outline(.77),outline(1),y,y+.15*s,'#a97755','#f6cf88');
    line([[x-.08*s,y+.11*s,z],[x-.08*s,y+1.02*s,z]],'#976d50',.045*s);
    face([[x-.1*s,y+.95*s,z],[x-.10*s,y+.32*s,z],[x-.55*s,y+.34*s,z+.055*s]],'#fff1c6');
    face([[x-.045*s,y+.87*s,z],[x+.42*s,y+.30*s,z],[x-.045*s,y+.31*s,z+.035*s]],'#e89069');
  }
  function flag(x,z,s) {
    const ground=.13;
    column(x,z,.044*s,.04*s,ground,ground+.88*s,'#956a49','#dfb17b',8);
    face([[x,ground+.85*s,z],[x+.42*s,ground+.73*s,z+.04*s],[x,ground+.60*s,z]],'#df7054');
  }
  const objects=[];
  function add(x,z,draw){objects.push({x,z,draw});}
  for(let i=0;i<nodes.length;i++){const [x,z]=nodes[i];add(x,z,()=>tile(i));}
  add(-.05,-2.60,()=>house(-.05,-2.60,.91));
  for(const [x,z,s] of [[-2.83,-.6,.97],[-2.43,-.29,.73],[-3.12,-.02,.64],[2.79,.20,.94],[2.46,.57,.69],[.60,2.83,.83],[.17,2.62,.62],[-1.8,-4.75,.45],[4.67,.06,.43]])add(x,z,()=>pine(x,z,s));
  for(const [x,z,s] of [[-.87,2.32,.37],[-1,2.63,.27],[-2.74,1.25,.28],[3.06,-1.1,.31],[1.14,-2.87,.35],[-.25,4.66,.23]])add(x,z,()=>shrub(x,z,s));
  for(const [x,z,s] of [[1.13,2.82,1.05],[-2.25,-1.04,.78],[2.6,-.48,.75],[-1.24,-2.56,.80],[-3.1,4.63,.58],[4.57,-2.0,.57]])add(x,z,()=>rockCluster(x,z,s));
  add(4.71,4.52,()=>flag(4.71,4.52,.91));
  function pawn(p,x,z,y,s) {
    const base=TEAM[p.team]??TEAM[0],dark=mix(base,'#263d48',.30);
    feature(x+.025,z+.045,y,.36*s,.34*s,'rgba(61,71,59,.25)');
    column(x,z,.35*s,.35*s,y,y+.075*s,dark,base,18);
    column(x,z,.35*s,.27*s,y+.075*s,y+.16*s,base,base,18);
    column(x,z,.25*s,.155*s,y+.15*s,y+.39*s,base,mix(base,'#fff2bc',.26),16);
    column(x,z,.174*s,.19*s,y+.35*s,y+.40*s,'#f4dd93','#ffedb0',16);
    const cy=y+.58*s,rad=.225*s;
    for(let n=0;n<7;n++){
      const a=-pi/2+n*pi/7,b=-pi/2+(n+1)*pi/7;
      column(x,z,Math.max(.001,Math.cos(a)*rad),Math.max(.001,Math.cos(b)*rad),cy+Math.sin(a)*rad,cy+Math.sin(b)*rad,base,mix(base,'#fff1ce',.34),16);
    }
    const [cx,cz]=project([x,y+.590*s,z]); const radius=Math.max(2.4,.128*s*scale);
    ctx.beginPath();ctx.arc(cx,cz,radius,0,TAU);ctx.fillStyle='#fff3d7';ctx.fill();
    ctx.fillStyle='#49433d';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold '+Math.max(5,Math.round(radius*1.60))+'px system-ui, sans-serif';
    ctx.fillText(String(p.index+1),cx,cz+.5);
  }
  function paint(time) {
    frame=0;if(dead||!width||!height)return;
    if(turnStart){const t=Math.min(1,(time-turnStart)/420);angle=turnFrom+(turnTo-turnFrom)*(1-(1-t)**3);if(t===1)turnStart=0;}
    cos=Math.cos(angle);sin=Math.sin(angle);
    const dimension=Math.abs(cos)+Math.abs(sin);
    tilt=Math.max(.53,Math.min(.70,.70-(width/height-1.45)*.13));lift=Math.sqrt(1-tilt*tilt);
    scale=Math.min(width/(10.35*dimension+1.05),height/(10.35*dimension*tilt+1.35));
    ox=width*.5;oy=height*.505;
    water();
    // Tiny moored craft sit beyond the playable coast.
    boat(-5.92,2.27,.78);boat(5.69,-2.52,.55);
    island();trail();
    const display=objects.map(v=>({...v,order:dep(v.x,v.z)}));
    const groups=new Map();
    for(const p of pieces){if(!nodes[p.node])continue;const g=groups.get(p.node)||[];g.push(p);groups.set(p.node,g);}
    for(const [n,g] of groups){
      g.forEach((p,i)=>{
        const [nx,nz]=nodes[n],offset=(i-(g.length-1)/2)*.40;
        let x=nx+offset*cos,z=nz+offset*sin;
        let y=['corner','center','start'].includes(types[n])?.467:.389;
        const step=moves.find(v=>v.team===p.team&&v.index===p.index);
        if(step){
          const t=Math.min(1,Math.max(0,(time-step.start)/265));
          x=step.from[0]*(1-t)+x*t;z=step.from[1]*(1-t)+z*t;y+=Math.sin(pi*t)*.53;
        }
        const px=x,pz=z,py=y;
        display.push({order:dep(x,z)+.30,draw:()=>pawn(p,px,pz,py,g.length>1?.80:1)});
        if(p.team===activeTeam)display.push({order:dep(x,z)+.20,draw:()=>{
          const pts=mapAt(ring(px,pz,g.length>1?.36:.43,g.length>1?.36:.43,32),py+.004);line([...pts,pts[0]],'#fff6d7',.055);
        }});
      });
    }
    display.sort((a,b)=>a.order-b.order);
    for(const v of display)v.draw();
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
  resize();
  return {
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
      pieces=list;activeTeam=next.activeTeam;schedule();
    },
    rotate(direction=1) {
      turnFrom=angle;turnTo+=(direction<0?-1:1)*pi/2;
      if(reduced()){angle=turnTo;turnStart=0;} else turnStart=performance.now();
      schedule();
    },
    destroy(){dead=true;if(frame)cancelAnimationFrame(frame);ro?.disconnect();window.removeEventListener('resize',resize);}
  };
}
