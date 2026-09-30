import * as THREE from './vendor/three.module.js';
import { compactModel } from './compact.js';

// Legacy catalog variants describe the pot, species, pattern and small details
// separately. Keep these display hints instead of flattening every base alias.
export function buildVariant(def,color,{native,nativeKey,box,cyl,sph,at}) {
  const v=def.variant;if(!v)return null;
  if(nativeKey==='bathposter'&&v.art!=='duck')return null;
  const mat=(c,extra={})=>new THREE.MeshStandardMaterial({color:c,roughness:.85,...extra});
  const g=new THREE.Group(),green='#729c78',light='#9fba8d';
  function ell(c,x,y,z,rx,ry,rz){const m=new THREE.Mesh(new THREE.SphereGeometry(1,18,12),mat(c));m.scale.set(rx,ry,rz);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;g.add(m);return m;}
  function stem(points,r=.01,c=green){const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));g.add(new THREE.Mesh(new THREE.TubeGeometry(path,14,r,6,false),mat(c)));}
  function leaf(x,y,z,w,h,angle=0,c=green){const shape=new THREE.Shape();shape.moveTo(0,0);shape.bezierCurveTo(-w,h*.35,-w*.55,h*.85,0,h);shape.bezierCurveTo(w*.55,h*.85,w,h*.35,0,0);
    const geometry=new THREE.ShapeGeometry(shape,10),p=geometry.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,Math.sin(p.getY(i)/h*Math.PI)*w*.35);geometry.computeVertexNormals();
    const m=new THREE.Mesh(geometry,mat(c,{side:THREE.DoubleSide}));m.position.set(x,y,z);m.rotation.set(-.38,angle,Math.sin(angle)*.25);m.castShadow=true;g.add(m);return m;}
  function flower(x,y,z,c,r=.1,petals=5){for(let i=0;i<petals;i++){const a=i/petals*Math.PI*2;ell(c,x+Math.cos(a)*r*.66,y+Math.sin(a)*r*.66,z,r*.6,r*.48,r*.18);}ell('#e5bd69',x,y,z+r*.17,r*.28,r*.28,r*.18);}
  function pot(tall=false){const height=tall?.43:v.low?.19:.30,r=tall?.27:.20;
    const p=at(cyl(r,r*.78,height,color,24),0,height/2,0);if(v.glass){p.material.dispose();p.material=mat(color,{transparent:true,opacity:.5,depthWrite:false,roughness:.18});}g.add(p,at(cyl(r*1.04,r*1.04,.045,color,24),0,height,0),at(cyl(r*.90,r*.90,.014,'#81705b',24),0,height+.01,0));return height;
  }
  if(v.sp){
    const tall=nativeKey==='tallplant',y=pot(tall),sp=v.sp;
    if(sp==='stuki'){for(let i=0;i<7;i++){const a=i*2.4,x=Math.cos(a)*.09,z=Math.sin(a)*.09,h=.5+(i%3)*.15;const blade=ell(i%2?green:light,x,y+h/2,z,.029,h/2,.035);blade.rotation.z=Math.sin(a)*.1;}}
    else if(sp==='fern'||sp==='palm'){
      const base=sp==='palm'?y+.75:y;if(sp==='palm')stem([[0,y,0],[0,base,0]],.035,'#b79b71');
      for(let i=0;i<8;i++){const a=i*Math.PI/4,len=sp==='palm'?.9:.55;
        stem([[0,base,0],[Math.cos(a)*len*.45,base+.38,Math.sin(a)*len*.45],[Math.cos(a)*len,base+.15,Math.sin(a)*len]],.007);
        for(let j=1;j<7;j++){const t=j/7,x=Math.cos(a)*len*t,z=Math.sin(a)*len*t,h=base+Math.sin(t*Math.PI)*.3;for(const side of [-1,1]){const l=leaf(x,h,z,.035,(1-t*.55)*.24,a+side*.7,i%2?green:light);l.rotation.x=-1.0;l.rotation.z=side*.65;}}
      }
    }else if(sp==='ivy'){
      for(let i=0;i<5;i++){const a=i*1.26,x=Math.cos(a)*.22,z=Math.sin(a)*.22;stem([[0,y,0],[x,y+.13,z],[x*1.45,.08,z*1.45]],.009);for(let j=0;j<5;j++)leaf(x*(1+j*.13),y+.11-j*.065,z*(1+j*.13),.065,.13,a+j*.25,j%2?green:light);}
    }else if(sp==='bamboo'){
      for(let i=0;i<4;i++){const x=(i-1.5)*.07,h=.65+(i%2)*.22;g.add(at(cyl(.023,.024,h,green,10),x,y+h/2,0));for(let j=1;j<5;j++){g.add(at(cyl(.026,.026,.018,light,10),x,y+h*j/5,0));if(j>2)leaf(x,y+h*j/5,.01,.034,.26,(i+j)*1.5);}}
    }else if(['olive','eucalyptus','fiddle','bird'].includes(sp)){
      const h=tall?1.35:1.0;stem([[0,y,0],[.03,y+h,0]],tall?.025:.014,'#aa8868');
      for(let i=0;i<(sp==='bird'?6:11);i++){const a=i*2.4,yy=y+.15+i*h/(sp==='bird'?7:12),r=sp==='bird'?.4:sp==='fiddle'?.28:.22,x=Math.cos(a)*r,z=Math.sin(a)*r;stem([[0,yy,0],[x,yy+.12,z]],.007);if(sp==='eucalyptus')ell(i%2?'#8fb2a3':'#9abbac',x,yy+.13,z,.087,.022,.087);else leaf(x,yy+.08,z,sp==='bird'?.14:sp==='fiddle'?.12:.045,sp==='bird'?.52:sp==='fiddle'?.30:.15,a);if(sp==='olive'&&i%3===0)ell('#607251',x,yy+.06,z,.025,.034,.026);}
    }else if(sp==='succulent'){
      for(let layer=0;layer<3;layer++)for(let i=0;i<7;i++){const a=i*.897+layer*.35,r=.14-layer*.035;const l=ell(layer%2?light:green,Math.cos(a)*r,y+.045+layer*.05,Math.sin(a)*r,.061,.04,.13-layer*.03);l.rotation.y=-a+Math.PI/2;l.rotation.z=.25;}
    }else{
      const count=sp==='sunflower'?3:sp==='orchid'?3:5;
      for(let i=0;i<count;i++){const a=i*2.4,x=Math.cos(a)*.10,z=Math.sin(a)*.10,h=y+.39+(i%3)*.12;stem([[x,y,z],[x*.7,h,z]],.009);leaf(x,y+.08,z,.055,.23,a);
        if(sp==='tulip'){const cup=ell(['#e5a0ae','#ecd397','#ddb4c7'][i%3],x*.7,h,z,.075,.105,.072);for(let j=0;j<3;j++){const b=j*2.1;ell(cup.material.color.getStyle(),x*.7+Math.cos(b)*.037,h+.07,z+Math.sin(b)*.037,.038,.046,.038);}}
        else if(sp==='lavender'){for(let j=0;j<5;j++)ell(j%2?'#a394be':'#c0afd3',x*.7,h-j*.032,z,.043,.024,.038);}
        else if(sp==='orchid'){for(let j=0;j<3;j++)flower(x*.7+(j-1)*.095,h+j*.08,z,'#e3afcf',.08);}
        else flower(x*.7,h,z,'#e9c56d',.105,9);
      }
    }
    return compactModel(g);
  }
  if(nativeKey==='matx'||nativeKey==='rugx'||nativeKey==='curtain'||nativeKey==='bathposter'){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const p=canvas.getContext('2d'),pattern=v.p||v.art||'plain';
    p.fillStyle=color;p.fillRect(0,0,512,512);
    const ink='#f8f1e4',accent='#bd94b4',dark='#86748d';
    function circle(x,y,r,c){p.fillStyle=c;p.beginPath();p.arc(x,y,r,0,Math.PI*2);p.fill();}
    function heart(x,y,r,c){p.fillStyle=c;p.beginPath();p.moveTo(x,y+r);p.bezierCurveTo(x-r*1.6,y,x-r,y-r,x,y-r*.25);p.bezierCurveTo(x+r,y-r,x+r*1.6,y,x,y+r);p.fill();}
    function duck(x,y,r){p.fillStyle='#eac876';p.beginPath();p.ellipse(x,y,r,r*.63,0,0,Math.PI*2);p.fill();circle(x+r*.6,y-r*.65,r*.50,'#eac876');circle(x+r*.73,y-r*.74,r*.07,dark);p.fillStyle='#d79860';p.fillRect(x+r*.94,y-r*.67,r*.33,r*.14);}
    if(['stripe','kstripe'].includes(pattern)){p.fillStyle=ink;for(let y=0;y<512;y+=64)p.fillRect(0,y,512,25);}
    else if(['check','kcheck'].includes(pattern)){p.fillStyle=ink;for(let x=0;x<8;x++)for(let y=0;y<8;y++)if((x+y)%2===0)p.fillRect(x*64,y*64,64,64);}
    else if(['dots','heart','paw','flower','fruit','duck','coffee'].includes(pattern)){
      for(let y=75;y<512;y+=120)for(let x=60+(y%240>120?50:0);x<512;x+=120){
        if(pattern==='dots')circle(x,y,13,ink);
        if(pattern==='heart')heart(x,y,23,accent);
        if(pattern==='paw'){p.fillStyle=dark;p.beginPath();p.ellipse(x,y+8,23,18,0,0,7);p.fill();for(const [dx,dy] of [[-23,-14],[-9,-28],[10,-28],[25,-13]])circle(x+dx,y+dy,9,dark);}
        if(pattern==='flower'){for(let k=0;k<6;k++)circle(x+Math.cos(k*Math.PI/3)*20,y+Math.sin(k*Math.PI/3)*20,13,ink);circle(x,y,12,'#e3bd6d');}
        if(pattern==='fruit'){circle(x-8,y,19,'#d98e88');circle(x+8,y,19,'#d98e88');p.fillStyle=green;p.fillRect(x-2,y-34,5,15);}
        if(pattern==='duck')duck(x,y,26);
        if(pattern==='coffee'){p.fillStyle=ink;p.fillRect(x-21,y-17,39,33);p.lineWidth=6;p.strokeStyle=ink;p.beginPath();p.arc(x+22,y-3,10,-Math.PI/2,Math.PI/2);p.stroke();p.fillStyle=dark;p.fillRect(x-16,y-15,30,7);}
      }
    }else if(pattern==='wave'){p.strokeStyle=ink;p.lineWidth=8;for(let y=30;y<540;y+=50){p.beginPath();for(let x=0;x<=512;x+=8)p.lineTo(x,y+Math.sin(x/34)*12);p.stroke();}}
    else if(pattern==='rainbow'){for(let i=0;i<5;i++){p.strokeStyle=['#dfa4ab','#edc5a0','#edd8a3','#a7c5ac','#baaed0'][i];p.lineWidth=27;p.beginPath();p.arc(256,365,185-i*31,Math.PI,2*Math.PI);p.stroke();}}
    else if(pattern==='ring'){for(const r of [205,185,60]){p.strokeStyle=ink;p.lineWidth=9;p.beginPath();p.arc(256,256,r,0,7);p.stroke();}}
    else if(pattern==='cow'){p.fillStyle='#eee8dd';p.fillRect(0,0,512,512);for(let i=0;i<9;i++){p.fillStyle='#615963';p.beginPath();p.ellipse((i*173)%512,(i*109+64)%512,55+(i%3)*12,36+(i%2)*14,i*.65,0,7);p.fill();}}
    else if(pattern==='geo'||pattern==='persian'){p.strokeStyle=ink;p.lineWidth=9;p.strokeRect(24,24,464,464);p.strokeRect(43,43,426,426);for(let i=0;i<3;i++){p.fillStyle=i%2?color:accent;p.beginPath();const r=177-i*44;p.moveTo(256,256-r);p.lineTo(256+r,256);p.lineTo(256,256+r);p.lineTo(256-r,256);p.closePath();p.fill();}}
    else if(pattern==='stone'||pattern==='shaggy'){for(let i=0;i<1700;i++){p.fillStyle=i%2?'#eee7dc':'#d4c9bb';p.fillRect((i*97)%512,(i*151)%512,pattern==='shaggy'?2:4,pattern==='shaggy'?8:2);}}
    if(v.art==='duck'){p.fillStyle='#dae9e7';p.fillRect(0,0,512,512);duck(244,290,142);for(const [x,y,r] of [[74,93,22],[412,121,34],[375,428,13]])circle(x,y,r,ink);}
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.userData.generatedAvatar=true;
    if(nativeKey==='curtain'||nativeKey==='bathposter'){
      const model=native.build(color);model.traverse(mesh=>{if(mesh.material?.map&&mesh.geometry?.type==='PlaneGeometry'){mesh.material=mesh.material.clone();mesh.material.map=texture;mesh.material.needsUpdate=true;}});return model;
    }
    const w=(native.w||2)-.10,d=(native.d||1)-.10,round=v.round||v.shape==='round',shape=new THREE.Shape();
    if(round)shape.absellipse(0,0,w/2,d/2,0,Math.PI*2,false,0);
    else if(v.shape==='cloud'||v.blob){for(let i=0;i<=80;i++){const a=i/80*Math.PI*2,r=1+.08*Math.sin(a*5);const x=Math.cos(a)*w/2*r,y=Math.sin(a)*d/2*r;i?shape.lineTo(x,y):shape.moveTo(x,y);}}
    else{shape.moveTo(-w/2,-d/2);shape.lineTo(w/2,-d/2);shape.lineTo(w/2,d/2);shape.lineTo(-w/2,d/2);shape.closePath();}
    const geometry=new THREE.ShapeGeometry(shape,48),uv=geometry.attributes.uv,pos=geometry.attributes.position;
    for(let i=0;i<uv.count;i++)uv.setXY(i,pos.getX(i)/w+.5,pos.getY(i)/d+.5);
    const mesh=new THREE.Mesh(geometry,mat('#ffffff',{map:texture,side:THREE.DoubleSide}));mesh.rotation.x=-Math.PI/2;mesh.position.y=.027;mesh.receiveShadow=true;g.add(mesh);return g;
  }
  if(v.foam||v.style==='rose'||v.water){const model=native.build(color);
    if(v.water)model.traverse(m=>{if(m.name==='water-surface')m.material.color.set(v.water);});
    if(v.foam||v.style==='rose')for(let i=0;i<12;i++){const x=Math.cos(i*2.4)*.48,z=Math.sin(i*2.4)*.28,y=nativeKey==='clawtub'?.83:.70;
      const m=new THREE.Mesh(new THREE.SphereGeometry(v.foam?.08:.035,12,8),mat(v.foam?'#fffaf3':'#d99bb1'));m.position.set(x,y,z);if(!v.foam)m.scale.set(1,.17,1.4);model.add(m);}return model;
  }
  if(v.metal&&nativeKey==='wallshower')return native.build(v.metal);
  if(v.top&&nativeKey==='vanity'){const model=native.build(color);for(const m of model.children){if(m.position.y===.86){m.material.dispose();m.material=mat(v.top);}if(v.tap&&m.geometry?.type==='CylinderGeometry'&&m.geometry.parameters.radiusTop<=.03){m.material.dispose();m.material=mat(v.tap,{metalness:.3,roughness:.45});}}return model;}
  if(v.big&&nativeKey==='onggi'){ell(color,0,.39,0,.31,.36,.31);g.add(at(cyl(.18,.17,.07,color,24),0,.735,0),at(cyl(.22,.20,.06,'#846954',24),0,.80,0),at(sph(.04,color,12,8),0,.85,0));return g;}
  if(v.inlay&&nativeKey==='lowtable'){const model=native.build(color);for(const x of [-.74,.74])for(const z of [-.26,.26])for(let i=0;i<5;i++){const a=i*Math.PI*2/5,m=new THREE.Mesh(new THREE.CircleGeometry(.026,16),mat(i%2?'#d6dfed':'#c8d6d4',{metalness:.2}));m.rotation.x=-Math.PI/2;m.position.set(x+Math.cos(a)*.037,.477,z+Math.sin(a)*.037);model.add(m);}return model;}
  if(v.deco&&nativeKey==='kcabinet'){const model=native.build(color);for(const m of [...model.children])if(m.position.y>1.07){model.remove(m);m.geometry?.dispose();m.material?.dispose();}
    if(v.deco==='board')g.add(at(box(.55,.045,.38,'#d6b589',.07),-.25,1.105,0),at(box(.17,.028,.055,'#bbbfc7',.008),-.20,1.14,.03));
    if(v.deco==='jar'){for(let i=0;i<3;i++)g.add(at(cyl(.09,.09,.22,['#e9cfb1','#c0d6bf','#e3c1ce'][i],20),-.4+i*.35,1.21,0),at(cyl(.094,.094,.035,'#c8ab87',20),-.4+i*.35,1.338,0));}
    if(v.deco==='fruit'){g.add(at(cyl(.27,.22,.035,'#ead9be',24),0,1.108,0));for(let i=0;i<4;i++)ell(['#d9918e','#dfba79','#9ab68a','#e2b481'][i],-.19+i*.12,1.18,(i%2)*.10-.05,.087,.081,.083);}
    if(v.deco==='kettle'){ell('#cad8cb',0,1.27,0,.18,.18,.18);g.add(at(cyl(.12,.12,.025,'#b9c6b9',24),0,1.44,0),at(sph(.035,'#ac9b84',12,8),0,1.48,0));const spout=at(cyl(.034,.06,.22,'#cad8cb',12),.19,1.31,0);spout.rotation.z=-.7;g.add(spout);const handle=new THREE.Mesh(new THREE.TorusGeometry(.15,.025,8,24,Math.PI*1.5),mat('#ac9b84'));handle.position.set(-.16,1.3,0);g.add(handle);}
    if(v.deco==='toaster'){g.add(at(box(.47,.28,.28,'#e1c0bb',.10),0,1.23,0));for(const z of [-.063,.063])g.add(at(box(.31,.008,.03,'#766670',.01),0,1.375,z),at(box(.26,.075,.024,'#e1bf8c',.015),0,1.407,z));g.add(at(cyl(.027,.027,.024,'#b5b7bf',12),.242,1.19,.055));}
    model.add(g);return model;
  }
  return null;
}
