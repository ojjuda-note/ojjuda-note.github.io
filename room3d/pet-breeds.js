import * as THREE from './vendor/three.module.js';
import { compactModel } from './compact.js';

// Breed silhouettes and markings, shared by room pets and the care close-up.
const dogs={
  dog:{coat:'#c59a6f',ear:'drop',bib:true},
  dg_schnauzer:{coat:'#777a83',ear:'fold',beard:true,brows:true,leg:.28,muzzle:.22,tail:'up'},
  dg_jindo:{coat:'#eadfc5',ear:'point',leg:.35,body:.5,head:.27,muzzle:.20,tail:'curl',bib:true},
  dg_dachshund:{coat:'#795037',ear:'long',leg:.12,body:.72,head:.27,muzzle:.25,tan:true,tail:'sweep'},
  dg_pomeranian:{coat:'#dfa666',ear:'point',leg:.17,body:.35,head:.27,ruff:true,fluffy:true,tail:'plume',muzzle:.12},
  dg_poodle:{coat:'#c19a77',ear:'curly',leg:.32,body:.41,head:.29,curly:true,top:true,tail:'pom',muzzle:.21},
  dg_shiba:{coat:'#d99a55',ear:'point',leg:.23,body:.46,head:.32,bib:true,cheeks:true,tail:'curl',muzzle:.15},
  dg_corgi:{coat:'#d49b62',ear:'large',leg:.11,body:.63,head:.3,bib:true,blaze:true,socks:true,tail:'stub',muzzle:.15},
  dg_maltese:{coat:'#eee9df',ear:'silky',leg:.18,body:.37,head:.28,silky:true,bow:true,tail:'plume',muzzle:.12},
  dg_golden:{coat:'#dcb681',ear:'drop',leg:.34,body:.56,head:.33,feather:true,tail:'sweep',muzzle:.24,tongue:true},
  dg_husky:{coat:'#7f858f',ear:'point',leg:.33,body:.53,head:.31,husky:true,bib:true,tail:'plume',eye:'#8fb6da',muzzle:.2},
  dg_bichon:{coat:'#eee9df',ear:'round',leg:.2,body:.38,head:.34,curly:true,round:true,tail:'plume',muzzle:.11},
  dg_beagle:{coat:'#ba8758',ear:'long',leg:.26,body:.48,head:.29,bib:true,blaze:true,socks:true,saddle:true,tail:'up',muzzle:.20}
};
const cats={
  cat:{coat:'#dba66e',pattern:'tabby',eye:'#9eb376'},
  ct_cheese:{coat:'#dda263',pattern:'tabby',eye:'#bca45d'},
  ct_mackerel:{coat:'#a1a4aa',pattern:'tabby',stripe:'#515661',eye:'#b7ab69'},
  ct_tuxedo:{coat:'#42434b',bib:true,socks:true,blaze:true,eye:'#b7be72'},
  ct_calico:{coat:'#eee8df',pattern:'calico',eye:'#a3b78d'},
  ct_russian:{coat:'#8694a3',slim:true,leg:.29,head:.24,ear:'large',eye:'#8cc49a'},
  ct_siamese:{coat:'#e7d9be',points:'#716053',slim:true,leg:.29,head:.24,ear:'large',eye:'#8dbbdf'},
  ct_persian:{coat:'#ebe5da',fluffy:true,round:true,leg:.12,head:.34,ear:'small',eye:'#c4a46a',flat:true},
  ct_fold:{coat:'#a9adb6',fold:true,round:true,head:.31,ear:'fold',eye:'#c2a568'},
  ct_munchkin:{coat:'#d7ac7c',leg:.09,body:.52,head:.27,bib:true,socks:true,eye:'#97b398'},
  ct_norwegian:{coat:'#998672',fluffy:true,tufts:true,pattern:'tabby',stripe:'#665d55',leg:.27,body:.51,head:.3,bib:true,eye:'#b5bd87'},
  ct_ragdoll:{coat:'#e8e2d6',points:'#9b8d80',fluffy:true,bib:true,socks:true,blaze:true,body:.5,head:.29,eye:'#8daed9'},
  ct_blackcat:{coat:'#3e4048',eye:'#d4b773',head:.27}
};
export const breedKeys=[...Object.keys(dogs),...Object.keys(cats)];

export function buildBreed(key,selectedColor) {
  const dog=!!dogs[key],o={...(dogs[key]||cats[key])},g=new THREE.Group(),head=new THREE.Group();
  const coat=selectedColor||o.coat,cream='#eee7da',dark='#383038',pink='#d999a5';
  const materials=new Map(),sphere=new THREE.SphereGeometry(1,24,16);
  function mat(color){if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.88}));return materials.get(color);}
  function ell(parent,color,x,y,z,sx,sy,sz){const m=new THREE.Mesh(sphere,typeof color==='string'?mat(color):color);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
  function line(parent,points,color,r=.009){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,16,r,6,false),mat(color));parent.add(mesh);return mesh;}
  function coatMaterial(){
    if(!o.pattern)return mat(coat);
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const p=canvas.getContext('2d');p.fillStyle=coat;p.fillRect(0,0,512,256);
    if(o.pattern==='tabby'){
      p.strokeStyle=o.stripe||'#ac783f';p.lineWidth=11;p.lineCap='round';
      for(let i=0;i<9;i++){const x=28+i*60;p.beginPath();p.moveTo(x,72);p.bezierCurveTo(x-25,115,x+23,149,x-5,200);p.stroke();}
    }else{
      for(const [x,y,rx,ry,c] of [[65,100,57,73,'#c3915e'],[245,120,58,92,'#494348'],[435,120,73,65,'#c3915e'],[350,203,34,30,'#494348']]){p.fillStyle=c;p.beginPath();p.ellipse(x,y,rx,ry,-.3,0,Math.PI*2);p.fill();}
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.userData.generatedAvatar=true;
    return new THREE.MeshStandardMaterial({map:texture,roughness:.95});
  }
  const leg=o.leg??(dog?.23:.2),bodyLength=o.body??(dog?.48:.43),bodyWidth=o.slim?.22:dog?.29:.255;
  const bodyY=leg+.20,headRadius=o.head??(dog?.30:.275),headY=leg+(dog?.52:.43),headZ=bodyLength*.8;
  const fur=coatMaterial();ell(g,fur,0,bodyY,0,bodyWidth,.255,bodyLength);
  if(o.saddle)ell(g,'#4b4647',0,bodyY+.13,-.06,bodyWidth*.99,.16,bodyLength*.72);
  if(o.bib||o.cheeks||o.husky)ell(g,cream,0,bodyY-.025,bodyLength*.7,bodyWidth*.80,.25,.20);
  if(o.fluffy||o.ruff||o.silky||o.feather){
    for(let i=0;i<11;i++){const a=i/11*Math.PI*2;ell(g,i%3?coat:cream,Math.sin(a)*bodyWidth*.68,bodyY+.09+Math.cos(a)*.19,bodyLength*.70,.13,.17,.14);}
  }
  if(o.curly){for(let i=0;i<24;i++){const a=i*2.4;ell(g,coat,Math.cos(a)*bodyWidth*.9,bodyY+.15*Math.sin(a),Math.sin(i*1.7)*bodyLength*.82,.082,.085,.088);}}
  for(const x of [-1,1])for(const z of [-1,1]){
    const c=o.socks?cream:o.points||coat,px=x*bodyWidth*.65,pz=z*bodyLength*.64;
    ell(g,c,px,leg/2+.045,pz,.068,leg/2+.05,.083);ell(g,c,px,.056,pz+.045,.085,.057,.11);
    if(o.curly)ell(g,coat,px,.13,pz,.103,.085,.107);
    if(o.tan)ell(g,'#bb9069',px,.058,pz+.065,.082,.047,.091);
    if(z===1)for(const toe of [-.027,.027])line(g,[[px+toe,.08,pz+.118],[px+toe,.06,pz+.145]],o.socks?'#d4c8b7':coat,.003);
  }
  head.position.set(0,headY,headZ);g.add(head);
  const headDepth=dog?.265:o.flat?.21:.245;
  ell(head,coat,0,0,0,headRadius,o.round?headRadius*.96:headRadius*.89,headDepth);
  if(o.fluffy||o.ruff||o.silky)for(let i=0;i<10;i++){const a=i/10*Math.PI*2;ell(head,coat,Math.cos(a)*headRadius*.86,Math.sin(a)*headRadius*.72,-.035,.105,.115,.115);}
  if(o.curly){const radius=o.round?headRadius:headRadius*.89;for(let i=0;i<18;i++){const a=i/18*Math.PI*2;ell(head,coat,Math.cos(a)*radius,Math.sin(a)*radius*.91,-.055,.086,.085,.096);}if(o.top)for(const x of [-.11,0,.11])ell(head,coat,x,.29,-.015,.13,.12,.13);}
  if(o.points)ell(head,o.points,0,-.015,.115,headRadius*.77,.20,.14);
  if(o.husky)for(const x of [-1,1])ell(head,cream,x*.125,-.006,.19,.135,.225,.096);
  if(o.blaze){ell(head,cream,0,.10,.213,.065,.165,.065);if(!dog)for(const x of [-1,1])ell(head,cream,x*.07,-.09,.22,.105,.10,.07);}
  if(o.cheeks)for(const x of [-1,1])ell(head,cream,x*.16,-.08,.19,.12,.15,.10);
  if(o.pattern==='calico'){ell(head,'#c3915e',-.155,.12,.10,.14,.16,.13);ell(head,'#494348',.17,.1,.08,.125,.16,.135);}
  if(o.pattern==='tabby')for(const x of [-.08,0,.08])line(head,[[x*.55,.225,.128],[x,.19,.20],[x*.8,.145,.242]],o.stripe||'#a57543',.015);

  const earColor=o.points||coat;
  function triangularEar(sign,large=false){
    const h=(dog?large?.35:.26:large?.28:o.ear==='small'?.14:.22),w=large?.135:.105;
    const shape=new THREE.Shape();shape.moveTo(-w,0);shape.quadraticCurveTo(-w*.65,h*.68,0,h);shape.quadraticCurveTo(w*.65,h*.68,w,0);shape.closePath();
    const outer=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.08,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.015,bevelThickness:.02}),mat(earColor));
    const ear=new THREE.Group();ear.position.set(sign*headRadius*.68,headRadius*.56,-.04);ear.rotation.z=-sign*.20;ear.add(outer);
    const inside=new THREE.Mesh(new THREE.ShapeGeometry(shape),mat(dog?'#c4a2a0':'#dcb3b5'));inside.scale.set(.56,.64,1);inside.position.set(0,.035,.106);ear.add(inside);head.add(ear);
    if(o.tufts)line(ear,[[0,h,.04],[sign*.018,h+.075,.035]],coat,.01);
  }
  for(const sign of [-1,1]){
    if(['point','large'].includes(o.ear)||(!dog&&!o.fold)){triangularEar(sign,o.ear==='large');continue;}
    if(o.ear==='fold'||o.fold){const ear=ell(head,coat,sign*headRadius*.86,.135,.025,.115,.075,.14);ear.rotation.z=-sign*.35;continue;}
    const length=o.ear==='long'?.29:o.ear==='silky'?.27:o.ear==='round'?.10:.205;
    const ear=ell(head,o.ear==='long'&&o.saddle?'#92664c':coat,sign*headRadius*.96,-.015,-.035,.115,length,.105);ear.rotation.z=sign*.14;
    if(o.ear==='curly')for(let i=0;i<5;i++)ell(head,coat,sign*(headRadius+.02),.12-i*.075,.035,.087,.067,.08);
    if(o.ear==='silky')for(let i=0;i<3;i++)ell(head,i%2?cream:coat,sign*(headRadius+.018+i*.02),-.06-i*.045,.015,.065,.21,.075);
  }
  const muzzleColor=o.beard?'#d2d0c8':o.bib||o.cheeks||o.husky||o.blaze?cream:o.points||coat;
  const muzzleDepth=dog?(o.muzzle??.16):.07,muzzleZ=headDepth*.81;
  if(dog)ell(head,muzzleColor,0,-.09,muzzleZ,.14,.10,muzzleDepth);
  else for(const x of [-.057,.057])ell(head,muzzleColor,x,-.09,headDepth*.94,.077,.062,.067);
  if(o.beard){for(const x of [-.115,0,.115])ell(head,'#d8d6d0',x,-.17,.205,.09,.125,.09);}
  if(o.brows)for(const x of [-1,1]){const brow=ell(head,'#d5d3cb',x*.135,.135,.237,.102,.036,.045);brow.rotation.z=x*.15;}
  if(o.tan)for(const x of [-1,1])ell(head,'#c4996c',x*.12,.12,.235,.05,.025,.025);
  const eyeZ=o.husky||o.points?.29:headDepth*.94,eyeX=dog?.115:.112,eyeY=dog?.035:.025;
  for(const sign of [-1,1]){
    if(!dog||o.eye){ell(head,dark,sign*eyeX,eyeY,eyeZ,.061,.066,.03);ell(head,o.eye||'#b8b777',sign*eyeX,eyeY+.002,eyeZ+.023,.049,.054,.019);ell(head,'#27242b',sign*eyeX,eyeY+.002,eyeZ+.041,dog?.025:.019,.043,.012);}
    else ell(head,'#3b2d2a',sign*eyeX,eyeY,eyeZ,.043,.049,.027);
    ell(head,'#fffaf0',sign*eyeX-.012,eyeY+.018,eyeZ+(dog&&!o.eye?.024:.05),.013,.014,.006);
  }
  const noseZ=dog?muzzleZ+muzzleDepth*.91:headDepth+.055;
  ell(head,dog?'#343039':pink,0,-.065,noseZ,.044,dog?.031:.024,.026);
  line(head,[[0,-.08,noseZ],[0,-.116,noseZ+.001]],dark,.006);
  for(const x of [-1,1])line(head,[[0,-.113,noseZ],[x*.035,-.135,noseZ-.008],[x*.062,-.117,noseZ-.02]],dark,.005);
  if(o.tongue)ell(head,pink,0,-.153,noseZ-.015,.031,.047,.016);
  if(!dog)for(const side of [-1,1])for(const dy of [-.03,.015,.055])line(head,[[side*.10,-.11+dy,headDepth+.015],[side*.24,-.105+dy*1.2,headDepth-.02],[side*.34,-.10+dy*1.3,headDepth-.06]],'#c6b9aa',.0035);
  if(o.bow){for(const x of [-1,1])ell(head,'#d898b1',.11+x*.057,.29,.13,.067,.048,.038);ell(head,'#c78aa5',.11,.29,.165,.028,.03,.017);}

  const tail=new THREE.Group();g.add(tail);const tc=o.points||coat,tailBase=[0,bodyY+.08,-bodyLength*.85];
  if(dog&&o.tail==='stub')ell(tail,coat,0,bodyY+.11,-bodyLength,.105,.08,.08);
  else{
    let points,radius=dog?.047:.039;
    if(o.tail==='curl'){points=[tailBase,[0,bodyY+.35,-bodyLength-.14],[.16,bodyY+.47,-bodyLength-.02],[.24,bodyY+.32,-bodyLength+.1],[.12,bodyY+.24,-bodyLength+.06]];radius=.08;}
    else if(o.tail==='sweep'){points=[tailBase,[.06,bodyY+.07,-bodyLength-.23],[.21,bodyY+.1,-bodyLength-.45],[.3,bodyY+.16,-bodyLength-.57]];radius=o.feather?.09:.038;}
    else{points=[tailBase,[.04,bodyY+.23,-bodyLength-.17],[.12,bodyY+.49,-bodyLength-.2],[.2,bodyY+.64,-bodyLength-.05]];radius=o.tail==='plume'||o.fluffy?.095:.042;}
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),geometry=new THREE.TubeGeometry(curve,32,radius,10,false),positions=geometry.attributes.position;
    const full=o.tail==='plume'||o.fluffy||o.feather;
    for(let i=0;i<=32;i++){const t=i/32,center=curve.getPointAt(t),taper=(full?.78+Math.sin(t*Math.PI)*.55:1)*(1-.86*t*t*t*t);
      for(let j=0;j<=10;j++){const index=i*11+j,p=new THREE.Vector3().fromBufferAttribute(positions,index).sub(center).multiplyScalar(taper).add(center);positions.setXYZ(index,p.x,p.y,p.z);}}
    geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,mat(tc));tail.add(mesh);ell(tail,tc,...points.at(-1),radius*.14,radius*.14,radius*.14);
    if(o.tail==='pom')ell(tail,coat,...points.at(-1),.11,.12,.11);
    if(o.saddle)ell(tail,cream,...points.at(-1),.065,.09,.065);
  }
  g.remove(tail);const result=compactModel(g);result.add(tail);result.userData.tail=tail;result.userData.breed=key;return result;
}
