import * as THREE from './vendor/three.module.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';

const defaults={skin:'#ffe3d0',hairColor:'#5a3a2e',topColor:'#9db7f5',bottomColor:'#3a3f66',hair:'bob',face:'calm',top:'tee',bottom:'pants',shoes:'sneakers',acc:'none'};
const smooth=(a,b,v)=>THREE.MathUtils.smoothstep(v,a,b);
const fullHats=new Set(['cap','beret','beanie','strawhat','santahat','witchhat']);
function material(color){return new THREE.MeshStandardMaterial({color,roughness:.85,metalness:0});}
function filtered(geometry,keep){
  const p=geometry.getAttribute('position'),index=geometry.index?.array||Array.from({length:p.count},(_,i)=>i),triangles=[];
  for(let i=0;i<index.length;i+=3){const ids=[index[i],index[i+1],index[i+2]],center=new THREE.Vector3();for(const j of ids)center.add(new THREE.Vector3().fromBufferAttribute(p,j));center.multiplyScalar(1/3);if(keep(center))triangles.push(...ids);}
  geometry.setIndex(triangles);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
function tube(points,radius,color){return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),24,radius,8,false),material(color));}
function lock(points,radii,color){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),geometry=new THREE.TubeGeometry(curve,36,1,12,false),p=geometry.getAttribute('position');
  for(let i=0;i<=36;i++){const t=i/36,center=curve.getPointAt(t),at=t*(radii.length-1),j=Math.min(radii.length-2,Math.floor(at)),r=THREE.MathUtils.lerp(radii[j],radii[j+1],at-j);for(let k=0;k<=12;k++){const n=i*13+k,v=new THREE.Vector3().fromBufferAttribute(p,n).sub(center).multiplyScalar(r).add(center);p.setXYZ(n,v.x,v.y,v.z);}}
  geometry.computeVertexNormals();return new THREE.Mesh(geometry,material(color));
}
function bulb(center,size,color){const m=new THREE.Mesh(new THREE.SphereGeometry(1,32,24),material(color));m.position.set(...center);m.scale.set(...size);return m;}
function patch(w,h,d,color,x,y,z){const m=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,3,Math.min(w,h,d)/3),material(color));m.position.set(x,y,z);return m;}
function texture(canvas){const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.userData.generatedAvatar=true;return t;}

/** Adapt the author's continuous body and rig; every saved wardrobe key stays intact. */
export function dressAvatar({visual,bones,config,makeAccessories}){
  const cfg={...defaults,...config},skin=new THREE.Color(cfg.skin),topColor=new THREE.Color(cfg.topColor),bottomColor=new THREE.Color(cfg.bottomColor);
  const parts={};visual.traverse(node=>{if(node.isSkinnedMesh&&node.material?.name)parts[node.material.name]=node;});
  const bind=parts.skin;
  visual.updateMatrixWorld(true);
  // Decorations use rest-space positions, then attach to the same animated bones.
  function attach(mesh,bone='Spine'){
    mesh.castShadow=mesh.receiveShadow=true;mesh.applyMatrix4(bones[bone].matrixWorld.clone().invert());bones[bone].add(mesh);return mesh;
  }
  function skinned(geometry,mat,name){const m=new THREE.SkinnedMesh(geometry,mat);m.name=name;m.bind(bind.skeleton,bind.bindMatrix);m.frustumCulled=false;m.castShadow=m.receiveShadow=true;visual.add(m);return m;}
  for(const name of ['Stitch cream','Warm charcoal','Eye white','Cheek rose','Smile rose'])if(parts[name])parts[name].visible=false;
  // Original sneaker and logo share a primitive; keep only the footwear section.
  filtered(parts['Sneaker ivory'].geometry,p=>p.y<.2);
  const shortSleeve=['tee','stripe','polka','dress','redtee','taegeuktee'].includes(cfg.top),dress=['dress','witch'].includes(cfg.top);
  const top=parts.top,position=top.geometry.getAttribute('position'),color=new Float32Array(position.count*3);
  for(let i=0;i<position.count;i++){
    let x=position.getX(i),y=position.getY(i),z=position.getZ(i);const arm=Math.abs(x)>.245&&y<.84,exposed=shortSleeve&&arm&&y<.735;
    if(exposed){const center=Math.sign(x)*(.31+(.67-y)*.045);x=center+(x-center)*.74;z*=.72;}
    if(cfg.top==='hanbok'&&arm){const fullness=1+.4*(1-smooth(.58,.83,y));x=Math.sign(x)*.31+(x-Math.sign(x)*.31)*fullness;z*=fullness;}
    if(cfg.top==='jacket'&&!arm){x*=1.035;z*=1.06;}
    if(cfg.top==='dress'&&!arm&&y<.68)x*=1.035;
    position.setXYZ(i,x,y,z);const c=exposed?skin:new THREE.Color(0xffffff);color.set(c.toArray(),i*3);
  }
  top.geometry.setAttribute('color',new THREE.BufferAttribute(color,3));top.material.color.set(0xffffff);top.material.vertexColors=true;top.geometry.computeVertexNormals();
  // A fitted print follows the actual curved, skinned cloth rather than a floating label.
  const print=document.createElement('canvas');print.width=512;print.height=512;const ctx=print.getContext('2d');ctx.fillStyle=cfg.top==='overalls'?'#fffaf2':cfg.topColor;ctx.fillRect(0,0,512,512);
  const tx=(x)=>(x+.4)/.8*512,ty=y=>(.97-y)/.5*512;
  const rect=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(tx(x-w/2),ty(y+h/2),w/.8*512,h/.5*512);};
  const white='#fffaf2',navy='#475978',rose='#cd7c94';
  if(cfg.top==='stripe')for(const y of [.60,.67,.74,.81,.88])rect(0,y,.46,.022,navy);
  if(cfg.top==='polka')for(let row=0;row<4;row++)for(let col=0;col<5;col++){ctx.fillStyle='#617294';ctx.beginPath();ctx.ellipse(tx(-.16+col*.08+(row%2)*.018),ty(.61+row*.067),5,8,0,0,7);ctx.fill();}
  if(cfg.top==='sweater')for(let x=-.20;x<=.20;x+=.022)rect(x,.75,.003,.31,'#b4b7bc');
  if(['vest','overalls'].includes(cfg.top)){rect(-.30,.73,.15,.45,white);rect(.30,.73,.15,.45,white);}
  if(['shirt','cardigan','jacket'].includes(cfg.top))rect(0,.75,cfg.top==='shirt'?.025:.095,.35,white);
  if(cfg.top==='santa'){rect(0,.74,.035,.32,white);rect(0,.59,.47,.038,white);rect(0,.68,.46,.045,'#514b55');}
  if(cfg.top==='sailor')rect(0,.83,.21,.16,navy);
  if(cfg.top==='redtee'){ctx.fillStyle='#fffaf0';ctx.font='bold 34px sans-serif';ctx.textAlign='center';ctx.fillText('KOREA',256,ty(.77));}
  if(cfg.top==='taegeuktee'){const cx=256,cy=ty(.79),r=32;ctx.fillStyle='#d96776';ctx.beginPath();ctx.arc(cx,cy,r,Math.PI,0);ctx.fill();ctx.fillStyle='#537fb0';ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI);ctx.fill();}
  ctx.fillStyle='#ffffff';ctx.fillRect(502,502,10,10);
  const uv=new Float32Array(position.count*2);for(let i=0;i<position.count;i++){const x=position.getX(i),y=position.getY(i),z=position.getZ(i);uv[i*2]=(x+.4)/.8;uv[i*2+1]=(y-.47)/.5;if(z<0&&!['stripe','polka','sweater'].includes(cfg.top)){uv[i*2]=.99;uv[i*2+1]=.99;}if((shortSleeve&&Math.abs(x)>.245&&y<.735)||(['vest','overalls'].includes(cfg.top)&&Math.abs(x)>.245)){uv[i*2]=.999;uv[i*2+1]=.001;}}
  top.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));top.material.map=texture(print);
  // Tailoring and collars add depth to otherwise similar shirt silhouettes.
  if(shortSleeve)for(const side of [-1,1]){const cuff=new THREE.Mesh(new THREE.TorusGeometry(.066,.008,8,28),material(cfg.topColor));cuff.rotation.x=Math.PI/2;cuff.position.set(side*.307,.735,0);attach(cuff,side<0?'Arm_R':'Arm_L');}
  if(['tee','stripe','polka','redtee','taegeuktee'].includes(cfg.top))attach(tube([[-.095,.909,.055],[0,.895,.096],[.095,.909,.055]],.009,cfg.topColor));
  if(cfg.top==='hoodie'){
    const hood=new THREE.Mesh(new THREE.TorusGeometry(.12,.044,12,36,Math.PI*1.65),material(cfg.topColor));hood.scale.set(1.22,1,1);hood.rotation.x=Math.PI/2;hood.position.set(0,.88,-.065);attach(hood);
    attach(patch(.205,.082,.028,cfg.topColor,0,.63,.155));for(const x of [-.065,.065])attach(tube([[x,.895,.125],[x*.85,.80,.165]],.005,white));
  }
  if(['cardigan','jacket'].includes(cfg.top))attach(patch(.085,.29,.014,'#fffaf2',0,.739,.156));
  if(['shirt','cardigan','jacket','sailor','hanbok'].includes(cfg.top)){
    for(const side of [-1,1]){const flap=patch(cfg.top==='hanbok'?.033:cfg.top==='jacket'?.075:.06,cfg.top==='jacket'?.20:.145,.015,cfg.top==='sailor'?navy:cfg.top==='jacket'?cfg.topColor:white,side*.045,.849,.141);flap.rotation.z=side*.37;attach(flap);}
    if(cfg.top==='hanbok'){attach(tube([[.015,.815,.166],[.055,.792,.174],[.105,.825,.16]],.014,rose));attach(patch(.022,.12,.018,rose,.047,.74,.167));}
    else if(cfg.top==='sailor')attach(tube([[-.07,.79,.175],[0,.75,.177],[.07,.79,.175]],.018,rose));
    else for(const y of [.63,.70,.77])attach(bulb([.025,y,.172],[.009,.009,.006],'#ae9678'));
  }
  if(cfg.top==='overalls'){for(const x of [-.14,.14])attach(patch(.04,.34,.018,cfg.bottomColor,x,.75,.155));attach(patch(.24,.16,.018,cfg.bottomColor,0,.70,.16));for(const x of [-.12,.12])attach(bulb([x,.82,.172],[.009,.009,.006],'#d7b976'));}
  if(cfg.top==='vest')attach(tube([[-.12,.91,.10],[0,.79,.164],[.12,.91,.10]],.013,'#f9f2e7'));
  if(cfg.top==='santa')attach(patch(.072,.065,.012,'#d7b46c',0,.68,.161));
  if(cfg.top==='witch')attach(patch(.26,.043,.019,'#e5bb79',0,.625,.154));

  const skirt=['skirt','pleats','longskirt','chima'].includes(cfg.bottom),bottom=parts.bottom,pants=bottom.geometry.getAttribute('position'),pantsColors=new Float32Array(pants.count*3);
  for(let i=0;i<pants.count;i++){
    let x=pants.getX(i),y=pants.getY(i),z=pants.getZ(i);const exposed=(skirt||dress||cfg.bottom==='shorts'&&y<.31),center=Math.sign(x)*.131;
    if(exposed&&y<.48){x=center+(x-center)*.78;z=.005+(z-.005)*.77;}
    if(cfg.bottom==='jogger'&&y<.22){const f=.72+.28*smooth(.10,.22,y);x=center+(x-center)*f;z*=f;}
    pants.setXYZ(i,x,y,z);let c=exposed?skin:bottomColor;
    if(cfg.bottom==='jeans'&&Math.abs(Math.abs(x)-.20)<.007)c=bottomColor.clone().lerp(new THREE.Color('#e6c99f'),.6);
    if(cfg.bottom==='santapants'&&y<.16)c=new THREE.Color(white);
    pantsColors.set(c.toArray(),i*3);
  }
  bottom.geometry.setAttribute('color',new THREE.BufferAttribute(pantsColors,3));bottom.material.vertexColors=true;bottom.material.color.set(0xffffff);bottom.geometry.computeVertexNormals();
  if(cfg.bottom==='shorts'&&!dress)for(const side of [-1,1]){const cuff=new THREE.Mesh(new THREE.TorusGeometry(.074,.008,8,28),material(cfg.bottomColor));cuff.rotation.x=Math.PI/2;cuff.scale.y=1.15;cuff.position.set(side*.131,.315,.005);attach(cuff,side<0?'Leg_R':'Leg_L');}
  const skirts=[];
  if(skirt||dress){
    const kind=dress?cfg.top:cfg.bottom,hem=['longskirt','chima','witch'].includes(kind)?.16:.29,width=kind==='chima'?.36:kind==='dress'?.31:.29;
    const geometry=new THREE.CylinderGeometry(.218,width,.57-hem,64,10,true),p=geometry.getAttribute('position');geometry.translate(0,(.57+hem)/2,0);
    for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),t=(.57-y)/(.57-hem),a=Math.atan2(z,x),pleat=kind==='pleats'?.038:kind==='chima'?.019:.009,f=1+Math.cos(a*(kind==='pleats'?18:12))*pleat*t;p.setXYZ(i,x*f,y+Math.cos(a*12)*.004*t,z*f*.76);}
    geometry.computeVertexNormals();const fabric=material(dress?cfg.topColor:cfg.bottomColor);fabric.side=THREE.DoubleSide;
    geometry.translate(0,-.528,0);const garment=new THREE.Mesh(geometry,fabric);garment.position.y=.528;const mesh=attach(garment,'Hips');skirts.push(mesh);mesh.userData.restPosition=mesh.position.clone();mesh.userData.restQuaternion=mesh.quaternion.clone();
    attach(tube([[-.215,.574,.06],[-.15,.574,.12],[0,.574,.157],[.15,.574,.12],[.215,.574,.06]],.012,dress?cfg.topColor:cfg.bottomColor),'Hips');
  }

  const shoes=parts['Sneaker ivory'],sole=parts['Rubber sole'];
  const shoeColors={sneakers:'#f3e7cf',loafers:'#785641',boots:'#916849',rainboots:'#e5bb57',sandals:cfg.skin,slippers:'#e4b7ce',kkotsin:'#e9a2b5'};
  shoes.material.color.set(shoeColors[cfg.shoes]||shoeColors.sneakers);
  sole.material.color.set(cfg.shoes==='sandals'?'#b89877':cfg.shoes==='kkotsin'?'#825e66':'#d6c9b6');
  if(cfg.shoes==='loafers'||cfg.shoes==='kkotsin'||cfg.shoes==='sandals'){
    for(let i=0;i<shoes.geometry.attributes.position.count;i++){const p=shoes.geometry.attributes.position;p.setY(i,.04+(p.getY(i)-.04)*.73);}shoes.geometry.computeVertexNormals();
  }
  for(const side of [-1,1]){
    const bone=side<0?'Ankle_R':'Ankle_L',x=side*.134;
    if(['boots','rainboots'].includes(cfg.shoes)){
      const g=new THREE.CylinderGeometry(.073,.078,cfg.shoes==='boots'?.16:.20,32,4,true);g.scale(1,1,1.12);g.translate(x,cfg.shoes==='boots'?.16:.18,0);attach(new THREE.Mesh(g,material(shoeColors[cfg.shoes])),bone);
      attach(tube([[x-.062,.245,.032],[x,.245,.077],[x+.062,.245,.032]],.01,shoeColors[cfg.shoes]),bone);
    }
    if(cfg.shoes==='sneakers')for(const z of [.05,.08,.11])attach(tube([[x-.04,.116,z],[x,.123,z+.003],[x+.04,.116,z]],.004,white),bone);
    if(cfg.shoes==='loafers')attach(patch(.14,.014,.037,'#bd9b6b',x,.103,.071),bone);
    if(cfg.shoes==='sandals')for(const z of [.07,.12])attach(tube([[x-.074,.071,z],[x,.105,z],[x+.074,.071,z]],.018,'#c6a87e'),bone);
    if(cfg.shoes==='slippers')attach(bulb([x,.113,.075],[.09,.035,.09],'#f2d4e2'),bone);
    if(cfg.shoes==='kkotsin'){for(let j=0;j<5;j++)attach(bulb([x+Math.cos(j*1.257)*.017,.098,.112+Math.sin(j*1.257)*.017],[.013,.006,.013],'#fff5d6'),bone);}
  }

  const hair=parts.hair,hp=hair.geometry.getAttribute('position');
  // Remove only the author's separate brow strokes; facial expressions draw their own.
  filtered(hair.geometry,p=>!(p.z>.235&&p.z<.278&&p.y>1.322&&p.y<1.362&&Math.abs(p.x)<.17));
  for(let i=0;i<hp.count;i++){
    let x=hp.getX(i),y=hp.getY(i),z=hp.getZ(i);const lower=1-smooth(1.21,1.49,y),back=1-smooth(.06,.25,z);
    if(['short','pixie','buzz','spiky','bun','doublebun','ponytail','twin','braid','afro','curly'].includes(cfg.hair))y+=lower*(cfg.hair==='buzz'?.20:cfg.hair==='pixie'?.13:.075);
    if(cfg.hair==='buzz'){x*=.94;z*=.87;y=1.28+(y-1.28)*.89;}
    if(['long','wavy'].includes(cfg.hair)){y-=lower*back*.38;z-=lower*.032;if(cfg.hair==='wavy')x+=Math.sign(x)*Math.sin(y*25)*.022*lower;}
    if(cfg.hair==='sidepart'){x+=smooth(1.30,1.61,y)*.025;z+=.018*smooth(.05,.3,z);}
    if(cfg.hair==='bangs'&&z>.19&&y<1.50){y=Math.max(1.343,y);z+=.008;}
    if(fullHats.has(cfg.acc)&&y>1.47)y=1.47+(y-1.47)*.34;
    hp.setXYZ(i,x,y,z);
  }
  hair.geometry.computeVertexNormals();hair.geometry.computeBoundingBox();
  const hairExtras=[];const addHair=m=>{hairExtras.push(attach(m,'Head'));return m;};
  if(cfg.hair==='buzz'){
    hair.visible=false;
    const vertices=[],indices=[],columns=48,rows=18;
    for(let i=0;i<=rows;i++)for(let j=0;j<=columns;j++){
      const a=j/columns*Math.PI*2,front=Math.max(0,Math.sin(a)),end=1.89-.63*front,t=.01+(end-.01)*i/rows;
      vertices.push(.357*Math.sin(t)*Math.cos(a),1.292+.298*Math.cos(t),.291*Math.sin(t)*Math.sin(a)-.008);
    }
    for(let i=0;i<rows;i++)for(let j=0;j<columns;j++){const a=i*(columns+1)+j,b=a+columns+1;indices.push(a,b,a+1,b,b+1,a+1);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();const m=new THREE.Mesh(g,material(cfg.hairColor));m.material.side=THREE.DoubleSide;addHair(m);
  }
  if(cfg.hair==='bangs'){
    const vertices=[],indices=[],cols=28,rows=6;
    for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){const x=-.285+j/cols*.57,y=1.365+i/rows*.17;vertices.push(x,y,.306*Math.sqrt(Math.max(.1,1-(x/.40)**2))+.012);}
    for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=i*(cols+1)+j,b=a+cols+1;indices.push(a,a+1,b,b,a+1,b+1);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();const m=new THREE.Mesh(g,material(cfg.hairColor));m.material.side=THREE.DoubleSide;addHair(m);
  }
  if(!fullHats.has(cfg.acc)){
    if(cfg.hair==='bun')addHair(bulb([0,1.61,-.12],[.16,.145,.14],cfg.hairColor));
    if(cfg.hair==='doublebun')for(const x of [-.32,.32])addHair(bulb([x,1.51,-.08],[.135,.14,.14],cfg.hairColor));
    if(cfg.hair==='spiky')for(let i=-2;i<=2;i++)addHair(lock([[i*.11,1.58,-.025],[i*.12,1.73-Math.abs(i)*.024,-.01],[i*.14,1.81-Math.abs(i)*.03,.02]],[.075,.035,.002],cfg.hairColor));
    if(['curly','afro'].includes(cfg.hair))for(let i=0;i<18;i++){const a=i*Math.PI*2/18,r=cfg.hair==='afro'?.40:.345;addHair(bulb([Math.cos(a)*r,1.36+Math.sin(a)*.27,-.025],[cfg.hair==='afro'?.12:.09,.11,.13],cfg.hairColor));}
  }
  if(['ponytail','twin','braid'].includes(cfg.hair)){
    for(const side of cfg.hair==='twin'?[-1,1]:[1]){
      const x=cfg.hair==='ponytail'?.23:side*.34,z=cfg.hair==='ponytail'?-.24:-.12;
      if(cfg.hair==='braid')for(let i=0;i<9;i++)addHair(bulb([x+Math.sin(i*2.5)*.031,1.36-i*.054,z+.04],[.052-i*.003,.052,.052-i*.003],cfg.hairColor));
      else addHair(lock([[x,1.45,z],[x+side*.09,1.30,z-.075],[x+side*.075,1.02,z-.09],[x+side*.03,.89,z-.04]],[.105,.105,.063,.004],cfg.hairColor));
      addHair(bulb([x,1.43,z],[.062,.028,.07],'#d599b7'));
    }
  }
  visual.updateMatrixWorld(true);
  // Fit shared wardrobe accessories to this head, using its real styled hair bounds.
  const bounds=new THREE.Box3().setFromObject(hair);for(const m of hairExtras)bounds.union(new THREE.Box3().setFromObject(m));
  if(makeAccessories&&cfg.acc!=='none'){
    const h=new THREE.Group(),proxy=new THREE.Mesh(new THREE.BoxGeometry((bounds.max.x-bounds.min.x)/.86,(bounds.max.y-bounds.min.y)/.78,(bounds.max.z-bounds.min.z)/.79),material('#ffffff'));
    proxy.position.set((bounds.max.x+bounds.min.x)/2/.86,((bounds.max.y+bounds.min.y)/2-1.275)/.78,(bounds.max.z+bounds.min.z)/2/.79);h.add(proxy);
    const upper=new THREE.Group(),a=makeAccessories({...cfg,hair:'bob'},h,upper);a.scale.set(.86,.78,.79);a.position.set(0,1.275,0);
    if(cfg.acc==='bandaid'){a.children[0].position.z+=.035;a.children[0].material.color.set('#c99575');}
    if(cfg.acc==='flagband')a.position.z=.17;
    if(['crown','catears','bunnyears','devilhorns','halo'].includes(cfg.acc))a.position.y+=Math.max(0,bounds.max.y-1.59);
    if(cfg.acc==='backpack'||cfg.acc==='scarf')attach(a,'Spine');else attach(a,'Head');
    if(upper.children.length){upper.scale.set(.86,.8,.84);upper.position.y=.528;attach(upper,'Spine');}
    proxy.geometry.dispose();proxy.material.dispose();visual.updateMatrixWorld(true);bounds.union(new THREE.Box3().setFromObject(a));
  }
  const faceGeometry=filtered(bind.geometry.clone(),p=>p.y>1.08&&p.y<1.41&&p.z>.10&&Math.abs(p.x)<.28);
  const fp=faceGeometry.getAttribute('position'),fn=faceGeometry.getAttribute('normal'),fuv=new Float32Array(fp.count*2);
  for(let i=0;i<fp.count;i++){const x=fp.getX(i),y=fp.getY(i),z=fp.getZ(i);fuv[i*2]=(x+.28)/.56;fuv[i*2+1]=(y-1.085)/.325;fp.setXYZ(i,x+fn.getX(i)*.0015,y+fn.getY(i)*.0015,z+fn.getZ(i)*.0015);}
  faceGeometry.setAttribute('uv',new THREE.BufferAttribute(fuv,2));
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=384;const faceTexture=texture(canvas),faceMaterial=new THREE.MeshBasicMaterial({map:faceTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  const face=skinned(faceGeometry,faceMaterial,'wardrobe-face');face.renderOrder=2;
  function setFace(mood){paintFace(canvas,mood,cfg.hairColor);faceTexture.needsUpdate=true;}
  setFace(cfg.face);
  return {bounds,setFace,setPose(pose){for(const skirt of skirts){skirt.quaternion.copy(skirt.userData.restQuaternion);if(pose==='sit')skirt.rotateX(-Math.PI*.38);}},config:cfg};
}

function paintFace(canvas,mood,hairColor){
  const c=canvas.getContext('2d');c.clearRect(0,0,512,384);c.lineCap='round';c.lineJoin='round';
  const X=x=>(x+.28)/.56*512,Y=y=>(1.410-y)/.325*384,ink='#342e32';
  const oval=(x,y,rx,ry,color)=>{c.fillStyle=color;c.beginPath();c.ellipse(X(x),Y(y),rx/.56*512,ry/.325*384,0,0,Math.PI*2);c.fill();};
  const line=(points,color=ink,width=4)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(X(points[0][0]),Y(points[0][1]));if(points.length===3)c.quadraticCurveTo(X(points[1][0]),Y(points[1][1]),X(points[2][0]),Y(points[2][1]));else c.lineTo(X(points[1][0]),Y(points[1][1]));c.stroke();};
  const closed=x=>line([[x-.025,1.266],[x,['sleep','sleepy'].includes(mood)?1.252:1.287],[x+.025,1.266]],ink,5);
  const eye=x=>{oval(x,1.266,.018,.029,ink);oval(x-.004,1.278,.004,.006,'#fffaf0');};
  for(const x of [-.17,.17])oval(x,1.190,.032,mood==='shy'?.019:.011,mood==='shy'?'#df8d94':'rgba(229,156,151,.55)');
  for(const x of [-.116,.116]){
    if(['smile','grin','sleep','sleepy'].includes(mood)||(mood==='wink'&&x>0)||(mood==='tongue'&&x<0))closed(x);
    else if(mood==='love'){
      const px=X(x),py=Y(1.266);c.fillStyle='#d9859c';c.beginPath();c.moveTo(px,py+23);c.bezierCurveTo(px-39,py-3,px-14,py-28,px,py-9);c.bezierCurveTo(px+14,py-28,px+39,py-3,px,py+23);c.fill();
    }else if(mood==='starry'){c.fillStyle='#b79447';c.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4-Math.PI/2,r=i%2?8:24;c.lineTo(X(x)+Math.cos(a)*r,Y(1.266)+Math.sin(a)*r);}c.closePath();c.fill();}
    else eye(x);
    const tilt=mood==='angry'?(x<0?-.012:.012):mood==='cry'?(x<0?.009:-.009):0;
    line([[x-.025,1.337+tilt],[x,1.346],[x+.025,1.337-tilt]],hairColor,4);
  }
  if(mood==='surprised')oval(0,1.116,.019,.018,ink);
  else if(mood==='grin'){oval(0,1.121,.045,.025,ink);c.fillStyle='#fffaf0';c.fillRect(X(-.036),Y(1.137),X(.036)-X(-.036),8);}
  else if(mood==='angry'||mood==='cry')line([[-.037,1.115],[0,1.135],[.037,1.115]],'#9c6470',4);
  else if(mood==='sleep')oval(0,1.115,.011,.008,'#ae7580');
  else line([[-.043,1.126],[0,1.101],[.043,1.126]],'#a86e7a',4);
  if(mood==='tongue')oval(.012,1.103,.013,.021,'#dc889e');
  if(mood==='cry')for(const x of [-.143,.143])oval(x,1.217,.009,.029,'#90bed3');
  if(mood==='cool'){c.fillStyle='#464251';for(const x of [-.116,.116])c.fillRect(X(x-.044),Y(1.286),80,38);line([[-.074,1.268],[.074,1.268]],ink,5);}
}
