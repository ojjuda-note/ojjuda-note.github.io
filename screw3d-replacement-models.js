/* Replacement shapes for Ojjuda screw-box.
 * Every fastener is part of the original simulation; no visual-only fake screw.
 * Original tutorial bricks remain untouched in levels 1-3.
 */
export function createReplacementModels(h) {
  const { cube, assemble, modelCar, boxE, cylE, el, pin, add, mul, face,
    GRID, I3, Yax, rx, rz, cylGeom, boxGeom, boundOf, tubeParts, pinCount } = h;
  const blue='#63C9EA', glass='#A3E6F2', red='#D94452', gold='#F8C85A';
  const nrm = p => Math.hypot(...p) || 1;
  const position = (a,b) => [(a[0]+b[0])*0.5,(a[1]+b[1])*0.5,(a[2]+b[2])*0.5];
  const safeAdd = (M, E, B, p, axis) => { M.els.push(E); pin(M,E,B,p,axis); return E; };
  const eye = (M, B, q, color='#172737') => {
    const n=[0,0,1],p=add(q,[0,0,GRID/2]);
    const E=cylE(0.065,0.021,add(p,[0,0,0.022]),color,rx(Math.PI/2));
    safeAdd(M,E,B,add(p,[0,0,0.044]),n);E.material='glass';
  };
  function robotCells(t) {
    const w=7+Math.min(15,Math.floor(t/2)), ht=9+Math.min(16,Math.floor(t/2)), d=2+Math.min(5,Math.floor(t/5)), cells=[];
    for(let x=0;x<w;x++)for(let y=0;y<ht;y++)for(let z=0;z<d;z++){
      const X=Math.abs((x-(w-1)/2)/((w-1)/2)), Y=y/(ht-1);
      const head=Y>=0.70&&X<0.53&&Y<0.98;
      const torso=Y>=0.29&&Y<0.71&&X<0.60;
      const arms=Y>=0.34&&Y<0.70&&X>=0.54&&X<=1;
      const legs=Y<0.33&&X>0.10&&X<0.60;
      if(!head&&!torso&&!arms&&!legs)continue;
      let color=head?'#819BBE':torso?'#4B77A0':arms?'#7098C1':'#506782';
      if(z===d-1&&torso&&X<0.22)color=gold;
      if(z===d-1&&head&&Y>0.78&&Y<0.91&&X>0.14&&X<0.4)color='#AFEBF0';
      cells.push({x,y,z,color});
    }
    return {cells,w,ht,d};
  }
  function modelRobot(t=0,minS=0) {
    const {cells,w,ht,d}=robotCells(t),b=cells.map(q=>cube(q.x,q.y,q.z,q.color));
    const at=(x,y,z)=>b.find(E=>E.cell[0]===x&&E.cell[1]===y&&E.cell[2]===z);
    return assemble('로봇',b,{minS,pre:M=>{
      const mid=Math.floor(w/2),top=[...b].filter(E=>E.cell[2]===Math.floor((d-1)/2)).sort((a,b)=>b.cell[1]-a.cell[1])[0];
      if(top) {
        const p=face(top,Yax),antenna=cylE(.055,.15,add(p,[0,.15,0]),'#F8C75E');
        safeAdd(M,antenna,top,[antenna.c[0],antenna.c[1]+.15,antenna.c[2]],Yax);
      }
      const y=Math.round(ht*.48),B=at(mid,y,d-1);
      if(B) {
        const p=face(B,[0,0,1]),dial=cylE(.105,.023,add(p,[0,0,.023]),'#80F6DF',rx(Math.PI/2));
        safeAdd(M,dial,B,add(p,[0,0,.046]),[0,0,1]);dial.material='glass';
      }
    }});
  }
  modelRobot.blocks=t=>robotCells(t).cells.length;

  function penguinCells(t) {
    const w=6+Math.min(13,Math.floor(t/2)),ht=8+Math.min(13,Math.floor(t/2)),d=2+Math.min(5,Math.floor(t/5)),cells=[];
    const mid=(w-1)/2;
    for(let x=0;x<w;x++)for(let y=0;y<ht;y++)for(let z=0;z<d;z++){
      const X=Math.abs(x-mid)/(w*.5),Y=y/(ht-1),Z=Math.abs(z-(d-1)/2)/(d*.5);
      const body=Y>=.11&&Y<.78 && X*X*.80+Math.pow((Y-.46)/.48,2)*.75+Z*Z*.16<=1.01;
      const head=Y>=.72 && X<.57&&Z<.95;
      const wing=Y>.29&&Y<.70&&X>=.73&&X<1;
      const feet=Y<.18 && X>.16&&X<.73 && z===d-1;
      if(!body&&!head&&!wing&&!feet)continue;
      let color=feet?'#E9A34E':wing?'#263748':head?'#263C50':'#354B5E';
      if(body&&z===d-1&&X<.57)color='#F2F5F3';
      cells.push({x,y,z,color});
    }
    const cx=Math.floor(mid),y=Math.max(1,Math.floor(ht*.77));
    cells.push({x:cx,y,z:d,color:'#EAA653'}); // projecting beak connected to head
    return {cells,w,ht,d};
  }
  function modelPenguin(t=0,minS=0) {
    const {cells,w,ht,d}=penguinCells(t),b=cells.map(q=>cube(q.x,q.y,q.z,q.color));
    const at=(x,y,z)=>b.find(E=>E.cell[0]===x&&E.cell[1]===y&&E.cell[2]===z);
    return assemble('펭귄',b,{minS,pre:M=>{
      const y=Math.max(1,Math.floor(ht*.84)),mid=(w-1)/2;
      for(const x of [Math.floor(mid-1),Math.ceil(mid+1)]){
        const B=at(x,y,d-1);
        if(B)eye(M,B,B.c);
      }
    }});
  }
  modelPenguin.blocks=t=>penguinCells(t).cells.length;

  function modelFireTruck(t=0,minS=0) {
    // Preserve the original working truck chassis and its two-axle fasteners.
    const M=modelCar(t,minS),Lc=4+t,Wc=2+Math.floor(t/3);
    M.name='소방차';
    for(const E of M.els){
      if(E.cell) {
        const [x,y,z]=E.cell;
        E.color=y ? (x>=Lc-2?'#C9E9F5':x===1?'#F4E9D7':'#D84B55') :
          (x===0||x===Lc-1?'#C63D49':z===0||z===Wc-1?'#DC5059':'#BD3745');
        E.material='paint';
      }else if(E.kind==='wheel'&&E.color==='#2E3358'){E.color='#2A303D';E.material='polished';}
    }
    const upper=M.els.filter(E=>E.cell&&E.cell[1]===1);
    if(upper.length<2)return M;
    const topY=upper[0].c[1]+GRID/2;
    const xs=upper.map(E=>E.c[0]),zs=upper.map(E=>E.c[2]);
    const x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
    const xc=(x0+x1)/2, railH=Math.max(.10,(x1-x0)*.5);
    // One mechanically detachable ladder unit, secured with three separated
    // screws. Grouped rungs avoid head-to-head interlocks on the early levels.
    const zc=(z0+z1)/2;
    const ladder=el('wheel',null,[xc,topY+.075,zc],I3,'#E1E9F0');
    const parts=[
      {geom:boxGeom([railH,.027,.032]),pc:[0,0,z0-zc],pR:I3,color:'#DEE5EA'},
      {geom:boxGeom([railH,.027,.032]),pc:[0,0,z1-zc],pR:I3,color:'#CBD5DC'}
    ];
    for(const pos of [-.4,0,.4]) {
      parts.push({geom:boxGeom([.032,.022,Math.max(.14,(z1-z0)*.5+.04)]),
        pc:[railH*pos,.005,0],pR:I3,color:'#F4F8FA'});
    }
    ladder.parts=parts;ladder.geom=boundOf(parts);ladder.material='metal';
    M.els.push(ladder);
    const mount=(x,z)=>{
      const B=upper.find(b=>b.c[2]===z&&Math.abs(b.c[0]-x)<.001)||
        upper.find(b=>b.c[2]===z)||upper[0];
      pin(M,ladder,B,[x,topY+.112,z],Yax);
    };
    mount(x0,z0);mount(x1,z0);mount(x1,z1);
    return M;
  }
  modelFireTruck.blocks=modelCar.blocks;

  function helicopterCells(t) {
    const L=8+Math.min(20,Math.floor(t/2)),D=2+Math.min(6,Math.floor(t/5)),W=L-3,cells=[];
    for(let x=0;x<L;x++)for(let y=0;y<=3;y++)for(let z=0;z<D;z++){
      const body=x<W && (y===1||y===2);
      const cabin=x<W-1&&y===3&&z>0&&z<D-1;
      const skid=x>0&&x<W-1&&y===0&&(z===0||z===D-1);
      const tail=x>=W && y===2&&z===Math.floor(D/2);
      if(!body&&!cabin&&!skid&&!tail)continue;
      let color=skid?'#455E70':tail?'#53949B':y===3?'#73AFC4':'#55A8B3';
      if(x===0&&y>=2)color='#A2DEE7';
      if(x===W-1&&body)color='#367D8C';
      cells.push({x,y,z,color});
    }
    return {cells,L,D,W};
  }
  function modelHelicopter(t=0,minS=0) {
    const {cells,L,D,W}=helicopterCells(t),b=cells.map(q=>cube(q.x,q.y,q.z,q.color));
    const at=(x,y,z)=>b.find(E=>E.cell[0]===x&&E.cell[1]===y&&E.cell[2]===z);
    return assemble('헬리콥터',b,{minS,pre:M=>{
      const mid=Math.floor((W-1)/2),z=Math.floor(D/2),B=at(mid,3,z)||at(mid,2,z);
      if(B){
        const y=face(B,Yax)[1],E=el('wheel',null,[B.c[0],y+.13,B.c[2]],I3,'#E5EAF0');
        E.parts=[
          {geom:boxGeom([Math.max(.52,W*GRID*.40),.025,.045]),pc:[0,0,0],pR:I3,color:'#E5EAF0'},
          {geom:boxGeom([.045,.023,Math.max(.40,D*GRID*.62)]),pc:[0,.03,0],pR:I3,color:'#BECBD4'},
          {geom:cylGeom(.085,.06,12),pc:[0,-.035,0],pR:I3,color:'#59798A'}
        ];
        E.geom=boundOf(E.parts);
        safeAdd(M,E,B,[E.c[0],E.c[1]+.048,E.c[2]],Yax);
      }
      const tail=at(L-1,2,z);
      if(tail){
        const p=face(tail,[0,0,1]),E=boxE([.19,.025,.025],add(p,[0,0,.045]),'#E5EAF0');
        E.material='metal';safeAdd(M,E,tail,add(p,[0,0,.07]),[0,0,1]);
      }
    }});
  }
  modelHelicopter.blocks=t=>helicopterCells(t).cells.length;

  function modelFerrisWheel(t=0,minS=0) {
    const N=6+Math.min(30,Math.floor(t/2)),D=2+Math.min(12,Math.floor(t/5)),top=4+Math.min(14,Math.floor(t/4)),mid=Math.floor(N/2),z=Math.floor(D/2);
    const b=[];
    for(let x=0;x<N;x++)for(let zz=0;zz<D;zz++)b.push(cube(x,0,zz,'#C0CDD4'));
    for(let y=1;y<=top;y++)for(const xx of [mid-1,mid,mid+1])b.push(cube(xx,y,z,y%2?'#8AA7B6':'#A4BDC7'));

    const at=(x,y,zz)=>b.find(E=>E.cell[0]===x&&E.cell[1]===y&&E.cell[2]===zz);
    const R=Math.max(.64,(N-1)*GRID*.43),cy=(top+.5)*GRID,cx=(mid+.5)*GRID,cz=(z+1)*GRID+.24;
    return assemble('대관람차',b,{minS,pre:M=>{
      const center=at(mid,top,z),wheel=el('wheel',null,[cx,cy,cz],I3,'#E5AF63');
      const parts=[],seg=16+2*Math.min(2,t);
      for(let i=0;i<seg;i++){
        const a=i*2*Math.PI/seg,bb=(i+1)*2*Math.PI/seg;
        const p0=[R*Math.cos(a),R*Math.sin(a),0],p1=[R*Math.cos(bb),R*Math.sin(bb),0];
        parts.push(...tubeParts([p0,p1],.045,['#E5AF63']));
      }
      for(let i=0;i<8;i++){
        const ang=i*Math.PI/4;
        parts.push(...tubeParts([[0,0,0],[R*Math.cos(ang),R*Math.sin(ang),0]],.025,['#A9BACB']));
      }
      parts.push({geom:cylGeom(.12,.065,12),pc:[0,0,0],pR:rx(Math.PI/2),color:'#8C9FB5'});
      wheel.parts=parts;wheel.geom=boundOf(parts);wheel.material='metal';
      safeAdd(M,wheel,center,[cx,cy,cz+.07],[0,0,1]);
      const seats=6+Math.min(4,Math.floor(t/2));
      for(let i=0;i<seats;i++){
        const ang=Math.PI*2*i/seats,px=cx+R*Math.cos(ang),py=cy+R*Math.sin(ang)-.13;
        const E=boxE([.12,.11,.12],[px,py,cz+.045],i%2?'#E59D9C':'#9BC6DA');
        E.material='paint';safeAdd(M,E,wheel,[px,py,cz+.18],[0,0,1]);
      }
    }});
  }
  modelFerrisWheel.blocks=t=>{
    const N=6+Math.min(30,Math.floor(t/2)),D=2+Math.min(12,Math.floor(t/5)),top=4+Math.min(14,Math.floor(t/4));
    return N*D+top*3;
  };
  // Materials are decorative only: shape, fasteners and collisions are unchanged.
  const dress = model => {
    const make=(t=0,minS=0)=>{
      const M=model(t,minS);
      for(const E of M.els)if(!E.material) E.material=E.cell?'paint':E.flat?'metal':'polished';
      return M;
    };
    make.blocks=model.blocks;
    return make;
  };
  return {
    modelRobot:dress(modelRobot),
    modelFireTruck:dress(modelFireTruck),
    modelFerrisWheel:dress(modelFerrisWheel),
    modelPenguin:dress(modelPenguin),
    modelHelicopter:dress(modelHelicopter)
  };
}
