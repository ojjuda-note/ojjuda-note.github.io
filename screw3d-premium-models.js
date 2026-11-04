/* Premium procedural screw-puzzle objects. Geometry and pins use the original
   engine so that rotation, occlusion, physics and 3-of-a-kind rules stay shared. */
export function createPremiumModels(h) {
  const {modelCar,boxE,GRID,finish,pin,topOfE,Yax,cube,assemble,face,el,cylGeom,I3,
    boundOf,cylE,rx,add,mul,rz,coneGeom}=h;

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
    for(let x=1;x<L-1;x++)for(let z=1;z<D-1;z++)
      b.push(cube(x,1,z,(x+z)%3===0?'#F1DEB5':'#F8EDD5'));
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
    return (L-2)*D+2+(L-2)*(D-2)+(L-4)+1;
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
    return [4+Math.floor(a/2),2+Math.floor(a/6),2+Math.floor(a/10)];
  }
  function modelAnimal(type,t=0,minS=0) {
    const [L,D,H]=animalDims(t),pig=type==='pig',cow=type==='cow',b=[];
    const name=pig?'돼지':cow?'소':'토끼';
    for(let x=0;x<L-1;x++)for(let y=1;y<=H;y++)for(let z=0;z<D;z++){
      const col=pig?(x+y+z)%6===0?'#F6A8B9':'#F2BDCA':
        cow?(x*3+z*5+y*7)%9<3?'#444753':'#F7F6EC':
        (x+y+z)%5===0?'#E1E3F0':'#FFF9EF';
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
          cylE(0.11,half,add(face(B,Yax),[0,half,0]),'#F4DCE8'):
          el('wheel',coneGeom(cow?0.12:0.17,half,6),add(face(B,Yax),[0,half,0]),I3,cow?'#E2D3B2':'#E98FAF');
        M.els.push(E);pin(M,E,B,[E.c[0],E.c[1]+half,E.c[2]],Yax);
        const C=at(L-1,H+1,z),nx=[1,0,0],p=face(C,nx);
        const eye=cylE(0.077,0.022,add(p,mul(nx,0.022)),'#25283E',rz(-Math.PI/2));
        M.els.push(eye);pin(M,eye,C,add(p,mul(nx,0.044)),nx);
      }
      const B=at(L-1,H,Math.floor(D/2)),n=[1,0,0],p=face(B,n),radius=cow?0.24:pig?0.22:0.13;
      const muzzle=cylE(radius,0.090,add(p,mul(n,0.09)),cow?'#E5AE96':pig?'#EE849F':'#F4CFD1',rz(-Math.PI/2));
      M.els.push(muzzle);pin(M,muzzle,B,add(p,mul(n,0.18)),n);
      const back=at(0,1,Math.floor(D/2)),rear=[-1,0,0],q=face(back,rear);
      const tail=cylE(type==='rabbit'?0.16:0.085,0.08,add(q,mul(rear,0.08)),type==='rabbit'?'#FFFEFA':cow?'#46434E':'#EE93AA',rz(Math.PI/2));
      M.els.push(tail);pin(M,tail,back,add(q,mul(rear,0.16)),rear);
    }});
  }
  modelAnimal.blocks=t=>{
    const [L,D,H]=animalDims(t);return (L-1)*D*H+2*D+4;
  };
  const modelPig=(t=0,minS=0)=>modelAnimal('pig',t,minS);
  const modelCow=(t=0,minS=0)=>modelAnimal('cow',t,minS);
  const modelRabbit=(t=0,minS=0)=>modelAnimal('rabbit',t,minS);
  for(const fn of [modelPig,modelCow,modelRabbit])fn.blocks=modelAnimal.blocks;
  return [modelSportsCar,modelTitanic,modelWatermelon,modelPig,modelCow,modelRabbit];
}
