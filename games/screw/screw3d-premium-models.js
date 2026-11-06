/* Premium procedural screw-puzzle objects. Geometry and pins use the original
   engine so that rotation, occlusion, physics and 3-of-a-kind rules stay shared. */
export function createPremiumModels(h) {
  const {modelCar,boxE,GRID,finish,pin,topOfE,Yax,cube,assemble,face,el,cylGeom,I3,
    boundOf,cylE,rx,add,mul,rz,coneGeom}=h;

  // Rounded toys use real convex triangle meshes, including their collision
  // planes. The fasteners still attach to the same original removable parts.
  const plushBall=(half,rings=8,seg=14)=>{
    const verts=[],faces=[];
    for(let j=0;j<=rings;j++){
      const theta=Math.PI*j/rings;
      for(let i=0;i<seg;i++){
        const a=i*2*Math.PI/seg;
        verts.push([half[0]*Math.sin(theta)*Math.cos(a),
          half[1]*Math.cos(theta),half[2]*Math.sin(theta)*Math.sin(a)]);
      }
    }
    const put=(indices)=>{
      const A=verts[indices[0]],B=verts[indices[1]],C=verts[indices[2]];
      const u=[0,1,2].map(i=>B[i]-A[i]),v=[0,1,2].map(i=>C[i]-A[i]);
      let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const cen=[0,1,2].map(i=>indices.reduce((t,k)=>t+verts[k][i],0)/indices.length);
      if(n.reduce((sum,x,i)=>sum+x*cen[i]/half[i],0)<0){indices.reverse();n=n.map(x=>-x);}
      const l=Math.hypot(...n);if(l>1e-8)faces.push({idx:indices,n:n.map(x=>x/l)});
    };
    for(let j=0;j<rings;j++)for(let i=0;i<seg;i++){
      const ni=(i+1)%seg,a=j*seg+i,b=j*seg+ni,c=(j+1)*seg+i,d=(j+1)*seg+ni;
      if(j>0)put([a,c,b]);
      if(j<rings-1)put([b,c,d]);
    }
    return {verts,faces,half};
  };

  function modelSportsCar(t=0,minS=0) {
    const M=modelCar(t,minS),L=4+t,D=2+Math.floor(t/3);
    M.name='스포츠카';
    for(const E of M.els) {
      if(E.cell) {
        const [x,y,z]=E.cell;
        E.color=y?(z===0||z===D-1?'#183C62':'#2C5B85') :
          (x%4===0?'#ED5569':z===0||z===D-1?'#C72E4B':'#F26778');
      }else if(E.kind==='wheel'&&E.color==='#2E3358')E.color='#202638';
    }
    // Original working car assembly is retained; new racing paint keeps all screws reachable.
    return M;
  }
  modelSportsCar.blocks=modelCar.blocks;

  function modelTitanic(t=0,minS=0) {
    const L=9+Math.min(42,Math.floor(t*0.8)),D=3+Math.min(5,Math.floor(t/12)),mid=Math.floor(D/2);
    const b=[];
    for(let x=0;x<L;x++)for(let z=0;z<D;z++)if(x!==0&&x!==L-1||z===mid)
      b.push(cube(x,0,z,(x+z)%4===0?'#35425C':'#29354B'));
    for(let x=1;x<L-1;x++)
      b.push(cube(x,1,mid,x%3===0?'#F1DEB5':'#F8EDD5'));
    for(let x=2;x<L-2;x++)b.push(cube(x,2,mid,x%4===0?'#D7E3EB':'#F6F4E9'));
    b.push(cube(2,3,mid,'#F4EFE2'));
    const at=(x,y,z)=>b.find(E=>E.cell[0]===x&&E.cell[1]===y&&E.cell[2]===z);
    return assemble('타이타닉호',b,{minS,pre:M=>{
      for(let i=0;i<4;i++) {
        const x=3+Math.floor((L-6)*i/3),B=at(x,2,mid),by=face(B,Yax)[1];
        const A=el('wheel',cylGeom(0.12,0.16,14),[B.c[0],by+0.16,B.c[2]],I3,'#D88B43');
        A.parts=[
          {geom:cylGeom(0.12,0.14,14),pc:[0,-0.02,0],pR:I3,color:'#D99048'},
          {geom:cylGeom(0.125,0.045,14),pc:[0,0.122,0],pR:I3,color:'#354154'}
        ];
        A.geom=boundOf(A.parts);M.els.push(A);
        pin(M,A,B,[A.c[0],A.c[1]+0.17,A.c[2]],Yax);
      }
      for(const z of [0,D-1])for(const x of [2,4,6,Math.max(7,L-4)]) {
        if(x>=L-1)continue;
        const B=at(x,0,z),n=[0,0,z===0?-1:1],p=face(B,n);
        const E=cylE(0.063,0.022,add(p,mul(n,0.022)),'#F9CF80',rx(Math.PI/2));
        M.els.push(E);pin(M,E,B,add(p,mul(n,0.044)),n);
      }
    }});
  }
  modelTitanic.blocks=t=>{
    const L=9+Math.min(42,Math.floor(t*0.8)),D=3+Math.min(5,Math.floor(t/12));
    return (L-2)*D+2+(L-2)+(L-4)+1;
  };

  const watermelonSize=t=>4+Math.min(11,t);
  function watermelonCell(N,x,y,z) {
    const m=(N-1)/2,r=N/2-0.05;
    return ((x-m)/r)**2+((y-m)/r)**2+((z-m)/r)**2<=1;
  }
  const watermelonShell=(N,x,y,z)=>watermelonCell(N,x,y,z)&&[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].some(d=>!watermelonCell(N,x+d[0],y+d[1],z+d[2]));
  function modelWatermelon(t=0,minS=0) {
    const N=watermelonSize(t),m=(N-1)/2,b=[];
    for(let x=0;x<N;x++)for(let y=0;y<N;y++)for(let z=0;z<N;z++){
      if(!watermelonShell(N,x,y,z))continue;
      const front=x>m+N*0.24,inner=Math.hypot(y-m,z-m)<N*0.30;
      const angle=Math.atan2(z-m,x-m),stripe=Math.floor((angle+Math.PI)*8)%2;
      const color=front&&inner?'#F16974':front?'#F1EAC6':stripe?'#227C51':'#57AC68';
      b.push(cube(x,y,z,color));
    }
    const high=b.filter(E=>E.cell[0]===Math.round(m)&&E.cell[2]===Math.round(m)).sort((a,c)=>c.cell[1]-a.cell[1])[0]||
      b.slice().sort((a,c)=>c.cell[1]-a.cell[1])[0];
    const reds=b.filter(E=>E.color==='#F16974');
    const seeds=reds.filter(E=>!b.some(A=>A.cell[0]===E.cell[0]+1&&A.cell[1]===E.cell[1]&&A.cell[2]===E.cell[2])).slice(0,2);
    return assemble('수박',b,{minS,pre:M=>{
      const stem=cylE(0.065,0.15,add(face(high,Yax),[0,0.15,0]),'#387A3A');
      M.els.push(stem);pin(M,stem,high,[stem.c[0],topOfE(stem),stem.c[2]],Yax);
      for(const B of seeds) {
        const n=[1,0,0],p=face(B,n),E=cylE(0.052,0.017,add(p,mul(n,0.017)),'#312E43',rz(-Math.PI/2));
        M.els.push(E);pin(M,E,B,add(p,mul(n,0.034)),n);
      }
    }});
  }
  modelWatermelon.blocks=t=>{
    const N=watermelonSize(t);let n=0;
    for(let x=0;x<N;x++)for(let y=0;y<N;y++)for(let z=0;z<N;z++)if(watermelonShell(N,x,y,z))n++;
    return n;
  };

  function animalDims(t) {
    const a=Math.min(48,t);
    // Grow in all three axes: a large stuffed animal should become chubby,
    // not turn into a very long, skinny row of square bricks.
    return [4+Math.floor(a/5),3+Math.floor(a/7),3+Math.floor(a/9)];
  }
  function modelAnimal(type,t=0,minS=0) {
    const [L,D,H]=animalDims(t),pig=type==='pig',cow=type==='cow',b=[];
    const name=pig?'돼지':cow?'소':'토끼';
    for(let x=0;x<L-1;x++)for(let y=1;y<=H;y++)for(let z=0;z<D;z++){
      // Hollow figurines expose inner fastening faces instead of trapping solid voxels.
      if(x>0&&x<L-2&&y>1&&y<H&&z>0&&z<D-1)continue;
      const col=pig?'#F3B7C5':
        cow?(x%7>=3&&x%7<=4&&y>=2?'#51535B':'#F7F5EC'):
        '#FFF8EE';
      b.push(cube(x,y,z,col));
    }
    for(let z=0;z<D;z++)for(let y=H;y<=H+1;y++)
      b.push(cube(L-1,y,z,pig?'#F5B6CA':cow?'#F5F3E7':'#FFF7EA'));
    for(const x of [0,L-2])for(const z of [0,D-1])
      b.push(cube(x,0,z,cow?'#5B6570':pig?'#E99BAE':'#ECE4DA'));
    const at=(x,y,z)=>b.find(E=>E.cell[0]===x&&E.cell[1]===y&&E.cell[2]===z);
    return assemble(name,b,{minS,pre:M=>{
      for(const z of [0,D-1]) {
        const B=at(L-1,H+1,z),half=type==='rabbit'?0.34:cow?0.17:0.20;
        const E=type==='rabbit'?
          el('wheel',plushBall([.115,half,.14]),add(face(B,Yax),[0,half,0]),I3,'#FFF4E9'):
          el('wheel',coneGeom(cow?0.12:0.17,half,6),add(face(B,Yax),[0,half,0]),I3,cow?'#E2D3B2':'#E98FAF');
        if(type==='rabbit') {
          const earH=half+0.13;
          E.parts=[
            {geom:plushBall([.13,earH,.15]),pc:[0,-.06,0],pR:I3,color:'#FFF8ED'},
            {geom:plushBall([.032,earH*.76,.085]),pc:[.10,-.035,0],pR:I3,color:'#ED9EB1'}
          ];
          E.geom=boundOf(E.parts);E.material='fabric';
        }
        E.faceFeature=true;
        M.els.push(E);pin(M,E,B,[E.c[0],E.c[1]+half,E.c[2]],Yax);
        // Put the eyes on the two rounded cheeks, visible in side views,
        // instead of sticking them like pins onto the front of the snout.
        const C=at(L-1,H+1,z),nx=[0,0,z===0?-1:1],p=face(C,nx);
        const eye=cylE(0.077,0.022,add(p,mul(nx,0.022)),'#25283E',rx(z===0?-Math.PI/2:Math.PI/2));
        eye.parts=[
          {geom:plushBall([.074,.035,.074]),pc:[0,0,0],pR:I3,color:'#25283E'},
          {geom:plushBall([.021,.009,.021]),pc:[-.022,.033,-.022],pR:I3,color:'#FFFFFF'}
        ];
        eye.geom=boundOf(eye.parts);
        eye.faceFeature=true;
        M.els.push(eye);pin(M,eye,C,add(p,mul(nx,0.044)),nx);
      }
      const B=at(L-1,H,Math.floor(D/2)),n=[1,0,0],p=face(B,n),radius=cow?0.24:pig?0.22:0.13;
      const muzzle=cylE(radius,0.090,add(p,mul(n,0.09)),cow?'#E5AE96':pig?'#EE849F':'#F4CFD1',rz(-Math.PI/2));
      muzzle.parts=[{geom:plushBall([radius,.09,radius]),pc:[0,0,0],pR:I3,color:muzzle.color}];
      if(pig||cow)for(const side of [-1,1])muzzle.parts.push({
        geom:plushBall([.034,.011,.034]),pc:[side*radius*.38,.087,0],pR:I3,color:'#96636B'
      });
      muzzle.geom=boundOf(muzzle.parts);
      muzzle.faceFeature=true;
      M.els.push(muzzle);pin(M,muzzle,B,add(p,mul(n,0.18)),n);
      const back=at(0,1,Math.floor(D/2)),rear=[-1,0,0],q=face(back,rear);
      const tail=cylE(type==='rabbit'?0.16:0.085,0.08,add(q,mul(rear,0.08)),type==='rabbit'?'#FFFEFA':cow?'#46434E':'#EE93AA',rz(Math.PI/2));
      tail.geom=plushBall([type==='rabbit'?.18:.095,type==='rabbit'?.17:.1,type==='rabbit'?.18:.1]);
      tail.faceFeature=true;
      M.els.push(tail);pin(M,tail,back,add(q,mul(rear,0.16)),rear);
    }});
  }
  modelAnimal.blocks=t=>{
    const [L,D,H]=animalDims(t);return (L-1)*D*H-Math.max(0,L-3)*Math.max(0,D-2)*Math.max(0,H-2)+2*D+4;
  };
  const modelPig=(t=0,minS=0)=>modelAnimal('pig',t,minS);
  const modelCow=(t=0,minS=0)=>modelAnimal('cow',t,minS);
  const modelRabbit=(t=0,minS=0)=>modelAnimal('rabbit',t,minS);
  for(const fn of [modelPig,modelCow,modelRabbit])fn.blocks=modelAnimal.blocks;
  return [modelSportsCar,modelTitanic,modelWatermelon,modelPig,modelCow,modelRabbit];
}
