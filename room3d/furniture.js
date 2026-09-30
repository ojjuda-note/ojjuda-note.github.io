import * as THREE from './vendor/three.module.js';

export function refineFurniture(catalog,{box,cyl,sph,at}) {
  const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.8,...extra});
  function ring(radius,tube,color,y){const m=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,12,64),mat(color));m.rotation.x=-Math.PI/2;m.position.y=y;m.castShadow=m.receiveShadow=true;return m;}
  function surface(radius,color,y){const m=new THREE.Mesh(new THREE.CircleGeometry(radius,48),mat(color,{roughness:.25,metalness:.08}));m.rotation.x=-Math.PI/2;m.position.y=y;m.receiveShadow=true;return m;}
  function rounded(w,d,r){const s=new THREE.Shape(),x=-w/2,y=-d/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+d-r);s.quadraticCurveTo(x+w,y+d,x+w-r,y+d);s.lineTo(x+r,y+d);s.quadraticCurveTo(x,y+d,x,y+d-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;}
  function remove(g,mesh){g.remove(mesh);mesh.geometry?.dispose();mesh.material?.dispose();}
  function basin(radius,height,color,bottom=0){const profile=[[radius*.72,0],[radius*.84,height*.2],[radius,height*.92],[radius,height],[radius-.035,height],[radius*.80-.035,height*.22],[0,height*.15],[0,0]].map(p=>new THREE.Vector2(...p));const mesh=new THREE.Mesh(new THREE.LatheGeometry(profile,40),mat(color,{side:THREE.DoubleSide}));mesh.position.y=bottom;mesh.castShadow=mesh.receiveShadow=true;return mesh;}
  function vessel(w,d,h,y,c,r=.2){const g=new THREE.Group(),shape=rounded(w,d,r);shape.holes.push(rounded(w-.23,d-.23,Math.max(.03,r-.10)));const geometry=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:3,steps:1});geometry.rotateX(-Math.PI/2);const shell=new THREE.Mesh(geometry,mat(c));shell.position.y=y;shell.castShadow=shell.receiveShadow=true;g.add(shell,at(box(w-.13,.07,d-.13,c,.03),0,y+.04,0));const water=new THREE.Mesh(new THREE.ShapeGeometry(rounded(w-.24,d-.24,Math.max(.03,r-.10))),mat('#b5dfe0',{roughness:.2}));water.name='water-surface';water.rotation.x=-Math.PI/2;water.position.y=y+h-.075;g.add(water);return g;}
  function faucet(g,x,y,z,color='#bdc0c6'){g.add(at(cyl(.025,.025,.26,color,12),x,y+.13,z));const neck=at(cyl(.025,.025,.17,color,12),x+.065,y+.25,z);neck.rotation.z=Math.PI/2;g.add(neck);}
  catalog.fountain.build=color=>{
    const g=new THREE.Group(),stone=color||'#e6ddd5';
    g.add(at(cyl(1.02,1.08,.15,stone,48),0,.075,0),ring(.965,.09,stone,.27),surface(.89,'#86c9de',.23));
    g.add(at(cyl(.105,.19,.72,stone,20),0,.48,0),at(cyl(.43,.28,.11,stone,40),0,.87,0),ring(.41,.042,stone,.95),surface(.375,'#8bd3e5',.936),at(cyl(.045,.065,.23,stone,16),0,1.04,0));
    const water=mat('#b7e3eb',{transparent:true,opacity:.83,depthWrite:false,roughness:.15});
    for(let i=0;i<8;i++){const a=i*Math.PI/4;const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,1.17,0),new THREE.Vector3(Math.cos(a)*.56,1.9,Math.sin(a)*.56),new THREE.Vector3(Math.cos(a)*.75,.25,Math.sin(a)*.75));g.add(new THREE.Mesh(new THREE.TubeGeometry(curve,24,.022,8,false),water));}
    for(const r of [.22,.49,.71]){const ripple=ring(r,.009,'#d6f2f0',.238);g.add(ripple);}
    return g;
  };
  catalog.bathtub.build=color=>{
    const g=new THREE.Group(),shell=rounded(2,.98,.22),hole=rounded(1.7,.69,.18);shell.holes.push(hole);
    const geometry=new THREE.ExtrudeGeometry(shell,{depth:.52,bevelEnabled:true,bevelSize:.04,bevelThickness:.04,bevelSegments:3,steps:1});geometry.rotateX(-Math.PI/2);
    const tub=new THREE.Mesh(geometry,mat(color||'#eee8de'));tub.position.y=.12;tub.castShadow=tub.receiveShadow=true;g.add(tub,at(box(1.82,.15,.8,'#e2dfd9',.15),0,.14,0));
    const water=new THREE.Mesh(new THREE.ShapeGeometry(rounded(1.69,.68,.17)),mat('#afd9de',{roughness:.2}));water.rotation.x=-Math.PI/2;water.position.y=.43;g.add(water);
    g.add(at(cyl(.027,.027,.33,'#b6b8bf',12),-.77,.63,-.29));const tap=at(cyl(.027,.027,.20,'#b6b8bf',12),-.69,.79,-.29);tap.rotation.z=Math.PI/2;g.add(tap);
    for(const x of [-.65,.65])for(const z of [-.26,.26])g.add(at(cyl(.055,.07,.12,'#ccb798',12),x,.06,z));
    g.add(at(sph(.073,'#e9c571',16,12),.48,.47,.12),at(sph(.048,'#e9c571',14,10),.49,.55,.15));
    return g;
  };
  catalog.clawtub.build=color=>{const g=vessel(1.9,.95,.64,.22,color,.29);for(const x of [-.70,.70])for(const z of [-.30,.30]){g.add(at(sph(.08,'#d6b680',14,10),x,.08,z),at(cyl(.043,.06,.16,'#d6b680',12),x,.17,z));}faucet(g,-.79,.80,-.32,'#d6b680');g.add(at(box(.22,.07,.12,'#e4abc3',.03),.58,.88,-.35));return g;};
  catalog.roundtub.build=color=>{const g=new THREE.Group();g.add(basin(1,.74,color),surface(.855,'#b5dfe0',.66));g.children[1].name='water-surface';faucet(g,-.65,.67,-.61);for(let i=0;i<8;i++){const a=i*Math.PI/4;g.add(at(sph(.023,'#d5edef',10,8),Math.cos(a)*.57,.69,Math.sin(a)*.57));}g.add(at(box(.31,.035,.22,'#e4abc3',.02),.62,.765,.58));return g;};
  catalog.hinoki.build=color=>{const g=vessel(1.9,.95,.80,0,color,.055);for(let i=0;i<8;i++)for(const z of [-.481,.481])g.add(at(box(.012,.76,.01,'#ba956c',.002),-.82+i*.235,.40,z));for(const y of [.22,.61])for(const z of [-.492,.492])g.add(at(box(1.9,.025,.015,'#a59684',.003),0,y,z));faucet(g,-.79,.75,-.31,color);g.add(at(box(.35,.025,.96,color,.01),.38,.835,0));return g;};
  catalog.basin.build=color=>{const g=new THREE.Group();g.add(basin(.32,.20,color),surface(.265,'#b9dce0',.155));g.add(at(sph(.045,'#e8c26b',12,8),.11,.19,-.055),at(sph(.031,'#e8c26b',12,8),.12,.24,-.03));return g;};
  catalog.saunabucket.build=color=>{const g=new THREE.Group();g.add(basin(.18,.23,color),surface(.135,'#b9dce0',.18),ring(.17,.008,'#acafbd',.17));const spoon=at(cyl(.008,.008,.31,color,8),.19,.26,0);spoon.rotation.z=.4;g.add(spoon,at(cyl(.037,.032,.027,color,12),.25,.40,0));return g;};
  const oldVanity=catalog.vanity.build;catalog.vanity.build=color=>{const g=oldVanity(color);for(const mesh of [...g.children])if(mesh.geometry?.type==='CylinderGeometry'&&[.26,.2].includes(mesh.geometry.parameters.radiusTop))remove(g,mesh);for(const x of [-.5,.5]){const bowl=basin(.26,.135,'#eeece8',.88);bowl.position.x=x;const water=surface(.20,'#c4e1df',.976);water.position.x=x;g.add(bowl,water);}return g;};
  const oldBowl=catalog.bowlsink.build;catalog.bowlsink.build=color=>{const g=oldBowl(color);for(const mesh of [...g.children])if(mesh.geometry?.parameters.radius===.24||mesh.geometry?.parameters.radiusTop===.2)remove(g,mesh);g.add(basin(.24,.18,'#eeece8',.85),surface(.18,'#c4e1df',.994));return g;};
  const oldBread=catalog.breadrack.build;catalog.breadrack.build=color=>{const g=oldBread(color);remove(g,g.children[0]);g.add(at(box(.7,1.2,.045,color,.015),0,.6,-.19),at(box(.045,1.2,.4,color,.015),-.33,.6,0),at(box(.045,1.2,.4,color,.015),.33,.6,0),at(box(.72,.04,.43,color,.015),0,1.22,0));return g;};
  const oldVending=catalog.vending.build;catalog.vending.build=color=>{const g=oldVending(color);remove(g,g.children[0]);const back=g.children[1];back.position.z=.06;g.add(at(box(.9,1.9,.06,color,.025),0,.97,-.36),at(box(.12,1.9,.8,color,.025),-.39,.97,0),at(box(.12,1.9,.8,color,.025),.39,.97,0),at(box(.9,.17,.8,color,.025),0,1.85,0),at(box(.9,.67,.8,color,.025),0,.335,0));return g;};
  catalog.flowerbed.build=color=>{const g=new THREE.Group();g.add(at(cyl(.48,.5,.08,'#d8c4ab',32),0,.04,0),surface(.45,'#9bb58b',.086));for(let i=0;i<7;i++){const a=i*2.4,r=.09+(i%3)*.12,x=Math.cos(a)*r,z=Math.sin(a)*r,y=.24+(i%2)*.06;g.add(at(cyl(.009,.009,y-.08,'#729474',8),x,(y+.08)/2,z));for(let j=0;j<5;j++){const b=j*Math.PI*2/5,petal=at(sph(.034,['#e3aabc','#ddd0ef','#faf0da'][i%3],12,8),x+Math.cos(b)*.031,y,z+Math.sin(b)*.031);petal.scale.y=.45;g.add(petal);}g.add(at(sph(.020,'#e4c26d',10,8),x,y+.007,z));}return g;};
  const oldToilet=catalog.toilet.build;catalog.toilet.build=color=>{
    const g=oldToilet(color),seat=g.children[4];g.remove(seat);seat.geometry.dispose();seat.material.dispose();
    g.add(surface(.16,'#c5dfdf',.485));return g;
  };
  catalog.plant.build=color=>{
    const g=new THREE.Group();g.add(at(cyl(.24,.18,.42,'#dec0a4',24),0,.21,0),at(cyl(.25,.25,.05,'#ecd3bc',24),0,.42,0),at(cyl(.21,.21,.022,'#79644d',24),0,.443,0));
    for(let i=0;i<6;i++){
      const a=i*2.4,h=.74+(i%3)*.20,x=Math.cos(a)*.30,z=Math.sin(a)*.30;
      const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,.43,0),new THREE.Vector3(x*.7,h*.8,z*.7),new THREE.Vector3(x,h,z));g.add(new THREE.Mesh(new THREE.TubeGeometry(curve,10,.013,6,false),mat('#739578')));
      const shape=new THREE.Shape();shape.moveTo(0,-.18);shape.bezierCurveTo(-.35,-.01,-.30,.28,0,.24);shape.bezierCurveTo(.30,.28,.35,-.01,0,-.18);
      for(const sign of [-1,1])for(const yy of [.02,.12]){const hole=new THREE.Path();hole.absellipse(sign*.115,yy,.038,.014,0,Math.PI*2,true,sign*.55);shape.holes.push(hole);}
      const leaf=new THREE.Mesh(new THREE.ShapeGeometry(shape,18),mat(color||'#89ac8b',{side:THREE.DoubleSide}));leaf.position.set(x,h,z);leaf.rotation.set(-.7,a,Math.sin(a)*.25);leaf.castShadow=true;g.add(leaf);
    }
    return g;
  };
}
