// Metres are supplied by the range. Anatomy here is measured in target radii:
// +X faces forward, +Y is up and +Z points toward the near flank.
const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const clip01=v=>clamp(v,0,1);
const unit=v=>{const d=Math.hypot(...v)||1;return v.map(n=>n/d);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const blend=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));
const fur={
 rabbit:['#98816c','#e3d3b7'],wildcat:['#877159','#c6af8d'],deer:['#a46540','#d3ad82'],cheetah:['#c99554','#ecd3a1'],
 bird:['#9b5739','#dfac73'],pigeon:['#78868f','#b6bcc0'],eagle:['#654b38','#9f8060'],
 cream:['#d2bc9e','#f4e6ca'],ivory:['#d8d1bd','#fff7dd'],ink:['#262522','#454038'],nose:['#473331','#64504b'],
 inner:['#9f7d72','#d1aca1'],hoof:['#3e3430','#645044'],gold:['#b58237','#e3bc65'],iris:['#75502c','#ce9b51'],
 pupil:['#161a17','#242724'],glint:['#fff7e1','#fff7e1'],feather:['#453e38','#7d6753'],winggrey:['#596773','#94a1a7'],
 neck:['#395b56','#76918a'],bar:['#333538','#665a50'],amber:['#805b38','#c49968']
};
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const maps=new Map();
const peltNames=['rabbit','wildcat','deer','cheetah','bird','pigeon','eagle','feather'];
let peltRequested=false;
function requestPelts(){
 if(peltRequested||typeof Image!=='function')return;
 peltRequested=true;
 const image=new Image();image.decoding='async';
 image.onload=()=>{
  const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(1024,256):document.createElement('canvas');
  canvas.width=1024;canvas.height=256;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx?.getImageData)return;
  ctx.drawImage(image,0,0,1024,256);
  for(let i=0;i<peltNames.length;i++){
   const rgba=ctx.getImageData((i%4)*256,Math.floor(i/4)*128,256,128).data;
   const texels=new Uint32Array(256*128);
   for(let j=0;j<texels.length;j++)texels[j]=rgba[j*4]|rgba[j*4+1]<<8|rgba[j*4+2]<<16;
   maps.set(peltNames[i],texels);
   if(peltNames[i]==='pigeon')maps.set('winggrey',texels);
  }
 };
 image.src=new URL('./wildlife-coats.webp',import.meta.url).href;
}
function skin(name){
 if(maps.has(name))return maps.get(name);
 const [back,belly]=fur[name].map(rgb),w=256,h=128,data=new Uint32Array(w*h);
 let seed=37727;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const u=x/w,v=y/h,a=v*TAU,underside=clip01((.25-Math.cos(a))*.83);
   let shade=1+(random()-.5)*.063+Math.sin(x*.9+Math.sin(a*9)*3)*.012;
   if(name==='cheetah'&&underside<.75){
     const row=Math.floor(v*13),cell=u*22+(row%2)*.5;
     const du=(cell%1)-.50,dv=(v*13%1)-.5;
     if(du*du+dv*dv<.058)shade*=.35;
   }else if(name==='wildcat'){
     const band=Math.cos(u*40+Math.sin(a)*2+Math.sin(u*16+a)*1.4);
     shade-=Math.max(0,band-.38)*.49*(1-underside);
   }else if(name==='feather'||name==='winggrey'||name==='eagle'){
     shade+=.045*Math.sin(u*66+Math.sin(a)*4)+.022*Math.cos(u*161+3*a);
   }
   const c=back.map((k,i)=>clamp(Math.round(mix(k,belly[i],underside)*shade),0,255));
   data[y*w+x]=c[0]|c[1]<<8|c[2]<<16;
 }
 maps.set(name,data);return data;
}
// Build a closed, smoothly shaded variable-section surface along a curved spine.
// The last two entries on a rib are its vertical and transverse radii.
function loft(model,part,material,ribs,sides=12){
 const start=model.v.length/8,rows=ribs.length,grid=[];
 for(let i=0;i<rows;i++){
   const a=ribs[Math.max(0,i-1)],b=ribs[Math.min(rows-1,i+1)],p=ribs[i];
   const axis=unit(b.slice(0,3).map((n,j)=>n-a[j]));
   const vertical=unit(cross(Math.abs(axis[2])>.92?[1,0,0]:[0,0,1],axis));
   if(vertical[1]<0)for(let k=0;k<3;k++)vertical[k]*=-1;
   const across=cross(axis,vertical);
   const ring=[];for(let j=0;j<sides;j++){
     const a=j*TAU/sides,c=Math.cos(a)*p[3],s=Math.sin(a)*p[4];
     ring.push(p.slice(0,3).map((n,k)=>n+vertical[k]*c+across[k]*s));
   }
   grid.push(ring);
 }
 for(let i=0;i<rows;i++)for(let j=0;j<=sides;j++){
   const p=grid[i][j%sides],prev=grid[Math.max(i-1,0)][j%sides],next=grid[Math.min(i+1,rows-1)][j%sides];
   const l=grid[i][(j+sides-1)%sides],r=grid[i][(j+1)%sides];
   const normal=unit(cross(r.map((v,k)=>v-l[k]),next.map((v,k)=>v-prev[k])));
   model.v.push(...p,...normal,i/(rows-1),j/sides);
 }
 const idx=model.indices.length,stride=sides+1;
 for(let i=0;i<rows-1;i++)for(let j=0;j<sides;j++){
   const p=start+i*stride+j;model.indices.push(p,p+1,p+stride,p+1,p+stride+1,p+stride);
 }
 model.parts.push({part,material,first:idx,end:model.indices.length});
}
function ellipsoid(m,part,color,x,y,z,rx,ry,rz,slant=0){
 const c=Math.cos(slant),s=Math.sin(slant),ribs=[];
 for(let i=0;i<=8;i++){const a=Math.PI*i/8,dx=-Math.cos(a)*rx,f=Math.max(.009,Math.sin(a));ribs.push([x+c*dx,y+s*dx,z,ry*f,rz*f]);}
 loft(m,part,color,ribs,12);
}
function limb(m,part,color,points){
 loft(m,part,color,points.map(([x,y,z,r,w=r])=>[x,y,z,Math.max(.001,r),Math.max(.001,w)]),10);
}
function coat(m,part,color,ribs,detail=18){loft(m,part,color,ribs.map(([x,y,h,w,z=0])=>[x,y,z,h,w]),detail);}
const rates={rabbit:7.2,wildcat:6.1,deer:5.4,cheetah:10,bird:8.5,pigeon:10.2,eagle:2.2};
const isBird=k=>k==='bird'||k==='pigeon'||k==='eagle';
export function wildlifePhase(kind,clock){return clock*(rates[kind]||6);}
// Stride lengths and stance fractions are shared by the moving root and the feet.
export const modelScale=1.26;
export const gaits={
 rabbit:{stride:1.74,stance:.29,foot:.395,lift:.21},
 wildcat:{stride:1.17,stance:.56,foot:.51,lift:.14},
 deer:{stride:2.20,stance:.31,foot:.65,lift:.24},
 cheetah:{stride:2.88,stance:.30,foot:.51,lift:.25}
};
function footPhase(kind,phase,hind,side){
 const offset=kind==='rabbit'?(hind?.02:.35)+(side<0?.048:0):
   kind==='wildcat'?(hind?0:.50)+(side<0?.5:0):
   (hind?0:kind==='deer'?.36:.49)+(side<0?(kind==='cheetah'?.11:.074):0);
 return ((phase/TAU+offset)%1+1)%1;
}
export function gaitBob(kind,phase){return kind==='wildcat'?.029*(1-Math.cos(phase*2)):0;}
export function pawPose(kind,phase,hind,side){
 const g=gaits[kind];
 const t=footPhase(kind,phase,hind,side),reach=g.stride*g.stance*.5;
 if(t<g.stance)return {x:reach-g.stride*t,lift:0};
 const f=(t-g.stance)/(1-g.stance),arc=Math.sin(Math.PI*f);
 // Match ground-relative velocity at toe-off and touch-down.
 const smooth=f*f*(3-2*f),x=mix(-reach,reach,smooth)-g.stride*(1-g.stance)*f*(1-f)*(1-2*f);
 return {x,lift:g.lift*arc*arc};
}
export function gaitLift(kind,phase){
 const g=gaits[kind];if(!g)return 0;
 let since=1,until=1;
 for(const hind of [false,true])for(const side of [-1,1]){
  const t=footPhase(kind,phase,hind,side);if(t<g.stance)return 0;
  since=Math.min(since,t-g.stance);until=Math.min(until,1-t);
 }
 const air=since+until,phaseInAir=since/air;
 return Math.sin(Math.PI*phaseInAir)**2*Math.min(1,air/(kind==='deer'?.24:.26));

}
function mammal(m,k,a){
 const rabbit=k==='rabbit',deer=k==='deer',cat=k==='wildcat',fast=k==='cheetah';
 const s=Math.sin(a),c=Math.cos(a),spring=rabbit?.055:fast?.052:deer?.034:.014;
 const spine=s*spring,bodyH=rabbit?.258:deer?.237:fast?.196:.238;
 const shoulder=rabbit?.24:deer?.34:.35,hip=rabbit?-.37:deer?-.49:-.46;
 const headX=rabbit?.50:deer?.73:fast?.68:.59,headY=(rabbit?.105:deer?.46:.216)+spine*.36;
 const width=rabbit?.235:deer?.228:fast?.166:.194;
 coat(m,'body',k,[[hip-.24,.005+spine,.012,.015],[hip-.18,.023+spine,bodyH*.69,width*.63],
  [hip-.04,.029+spine,bodyH*1.05,width],[hip+.12,.02+spine,bodyH*1.08,width*1.04],[-.12,.025+spine*.52,bodyH*.94,width*.94],
  [.07,.041+spine*.14,bodyH*.84,width*.88],[shoulder-.05,.026,bodyH,width],[shoulder+.07,.034,bodyH*.9,width*.85],[shoulder+.13,.065,bodyH*.42,width*.52],[shoulder+.14,.08,.009,.012]],22);
 // Four independent articulated chains: hind hocks fold forward during recovery.
 for(const side of [-1,1])for(const hind of [true,false]){
   const paw=pawPose(k,a,hind,side),xx=hind?hip:shoulder;
   const z=side*width*(hind?.68:.72),top=.035+(hind?spine:0),height=gaits[k].foot;
   const ankleX=xx+paw.x,ankleY=-height+paw.lift-gaitBob(k,a);
   const step=paw.x,reach=1,lift=paw.lift/gaits[k].lift;
   const kneeX=xx+(hind?.14:-.036)+step*reach*.30,kneeY=top-height*.49+lift*.033;
   const heelX=ankleX-(hind?(rabbit?.15:.105):.038),heelY=ankleY+(hind?.145:.10);
   const thick=hind?(rabbit?.149:deer?.105:.093):(deer?.075:.066);
   limb(m,'leg',k,[[xx-.04,top+.095,z,.028],[xx,top,z,thick,thick*.76],[mix(xx,kneeX,.5),mix(top,kneeY,.5),z,thick*.90],
     [kneeX,kneeY,z,thick*.64],[mix(kneeX,heelX,.52),mix(kneeY,heelY,.52),z,thick*.49],[heelX,heelY,z,thick*.34],
     [ankleX,ankleY+.02,z,thick*.31],[ankleX+.04,ankleY+.01,z,.014]]);
   const foot=rabbit?(hind?.134:.086):deer?.060:.084;
   ellipsoid(m,'leg',deer?'hoof':rabbit?'cream':k,ankleX+foot*.56,ankleY,z,foot,deer?.035:.037,thick*.55);
 }
 // Curved neck joins the breast underneath the skull.
 coat(m,'body',k,[[shoulder-.14,.025,.106,width*.8],[shoulder-.02,.072,.188,width*.87],[shoulder+.09,deer?.19:.12,.164,width*.79],
  [headX-.17,headY-.01,.123,width*.62],[headX-.085,headY+.005,.09,width*.53]],16);
 const hr=rabbit?.175:deer?.132:.15;
 coat(m,'head',k,[[headX-.205,headY-.008,.015,.024],[headX-.16,headY+.014,hr*.80,hr*.83],[headX-.075,headY+.011,hr*1.05,hr],
 [headX+.036,headY+.003,hr,hr*.97],[headX+.115,headY-.026,hr*.80,hr*.79],[headX+.154,headY-.048,hr*.60,hr*.59]],18);
 const snout=deer?.294:rabbit?.242:.243;
 coat(m,'head',deer?k:'cream',[[headX+.062,headY-.047,hr*.67,hr*.86],[headX+.14,headY-.065,hr*.64,hr*.76],
 [headX+snout-.064,headY-.085,hr*.45,hr*.58],[headX+snout,headY-.07,hr*.29,hr*.42]],14);
 ellipsoid(m,'head',rabbit?'nose':'ink',headX+snout-.005,headY-.056,0,.040,.033,hr*.51);
 for(const side of [-1,1]){
   const eyeX=headX+.054,eyeY=headY+.044,eyeZ=side*hr*.87;
   ellipsoid(m,'head','ink',eyeX,eyeY,eyeZ,.038,.032,.019,-.13);
   ellipsoid(m,'head','iris',eyeX+.006,eyeY,eyeZ+side*.013,.025,.023,.012);
   ellipsoid(m,'head','pupil',eyeX+.013,eyeY,eyeZ+side*.021,.015,.020,.007);
   ellipsoid(m,'head','glint',eyeX+.019,eyeY+.010,eyeZ+side*.027,.006,.006,.004);
   if(fast)limb(m,'head','ink',[[eyeX+.02,eyeY-.018,eyeZ,.012],[eyeX+.059,eyeY-.075,side*hr*.81,.014],[headX+.179,headY-.106,side*hr*.57,.006]]);
   // Eyelids, pale brow, lip crease and whisker pads read from both flanks.
   limb(m,'head',fast?'cream':k,[[eyeX-.044,eyeY+.025,eyeZ,.010],[eyeX-.002,eyeY+.041,eyeZ+side*.005,.011],[eyeX+.046,eyeY+.023,eyeZ,.006]]);
   limb(m,'head','nose',[[headX+snout-.013,headY-.09,side*hr*.37,.006],[headX+snout-.048,headY-.109,side*hr*.49,.007],[headX+snout-.095,headY-.106,side*hr*.62,.004]]);
   if(deer)limb(m,'body','cream',[[shoulder+.11,.085,side*.09,.018],[shoulder+.18,.198,side*.100,.037],[headX-.16,headY-.082,side*.074,.019]]);
   const length=rabbit?.47:deer?.238:cat?.19:.107;
   const baseX=headX-(side>0?.047:.104),baseY=headY+hr*.76,baseZ=side*hr*.54;
   const back=rabbit?-.142:deer?-.16:cat?-.046:-.033;
   const endX=baseX+back+(rabbit?.057:.02)*Math.sin(a-.57+side*.46),endZ=baseZ+side*(deer?.19:rabbit?.062:.047);
   const w=rabbit?.072:deer?.076:cat?.073:.075;
   limb(m,'ear',k,[[baseX,baseY,baseZ,.043],[baseX+back*.23,baseY+length*.32,baseZ+side*.023,w,w*.64],
    [mix(baseX,endX,.64),baseY+length*.69,mix(baseZ,endZ,.64),w*.84,w*.48],[endX,baseY+length,endZ,fast?.029:.005,.005]]);
   limb(m,'ear','inner',[[baseX-.002,baseY+length*.15,baseZ+side*.033,.011],
    [mix(baseX,endX,.50),baseY+length*.52,mix(baseZ,endZ,.50)+side*w*.43,w*.37,.011],
    [mix(baseX,endX,.83),baseY+length*.84,mix(baseZ,endZ,.83)+side*.017,.004]]);
 }
 if(rabbit)ellipsoid(m,'body','ivory',hip-.25,.062+spine,0,.090,.089,.094,.23);
 else if(deer)limb(m,'body','cream',[[hip-.12,.12+spine,0,.078],[hip-.225,.16+spine,.008,.072],[hip-.31,.215+spine,.03,.018]]);
 else{
  const length=fast?.72:.42,base=hip-.13;const points=[];
  for(let i=0;i<=8;i++){const t=i/8;points.push([base-length*t,.072+spine+.17*t*t+.075*t*Math.sin(a-3*t),.17*t*Math.sin(a*.5-t*2),(.064-(fast?.042:.021)*t)]);}
  limb(m,'body',k,points.slice(0,7));limb(m,'body','bar',points.slice(6));
 }
}
function bird(m,k,a,bank,landing){
 const eagle=k==='eagle',pigeon=k==='pigeon',scale=eagle?1.16:pigeon?1:.94;
 const bodyY=k==='bird'?-.205:-.135,headX=eagle?.68:pigeon?.48:.47;
 const headY=eagle?.015:pigeon?.118:-.052,coatName=k;
 const flap=eagle?.39+.24*Math.sin(a):.22+.76*Math.sin(a);
 const fold=eagle?.08:.25,span=eagle?1.43:pigeon?1.02:.96;
 const wingColor=eagle?'eagle':pigeon?'winggrey':'bird';
 coat(m,'body',coatName,[[-.63,bodyY+.042,.014,.024],[-.49,bodyY+.028,.109,.074],[-.28,bodyY,.172,.149],[-.06,bodyY+.007,.202,.183],[.14,bodyY+.027,.188,.171],[.29,bodyY+.07,.148,.145],[.37,bodyY+.12,.089,.093]],18);
 coat(m,'body',pigeon?'neck':eagle?'ivory':k,[[.17,bodyY+.035,.116,.125],[.28,bodyY+.093,.15,.136],[headX-.075,headY-.035,.118,.114],[headX,headY,.093,.09]],16);
 ellipsoid(m,'head',eagle?'ivory':k,headX,headY,0,eagle?.204:.153,eagle?.141:.139,eagle?.145:.128,.04);
 coat(m,'head',eagle?'gold':pigeon?'ink':'amber',[[headX+.094,headY-.028,.052,.075],[headX+.164,headY-.03,.060,.057],[headX+(eagle?.292:.245),headY-.056,.033,.027],[headX+(eagle?.273:.269),headY-(eagle?.117:.059),.005,.004]],10);
 for(const side of [-1,1]){
  const z=side*(eagle?.128:.114);
  ellipsoid(m,'head','ink',headX+.058,headY+.028,z,.034,.029,.013);
  ellipsoid(m,'head',eagle?'gold':'iris',headX+.063,headY+.03,z+side*.01,.025,.023,.01);
  ellipsoid(m,'head','pupil',headX+.067,headY+.03,z+side*.019,.015,.018,.006);
  ellipsoid(m,'head','glint',headX+.073,headY+.038,z+side*.024,.005,.005,.003);
  if(eagle)limb(m,'head','cream',[[headX+.011,headY+.060,z,.012],[headX+.065,headY+.054,z+side*.017,.017],[headX+.104,headY+.041,z,.007]]);
  // Primary feathers fan from the wrist. The outer vanes lag the elbow on recovery.
  const angle=flap+side*(bank+.23),tipAngle=angle-(eagle?.11:.29)*Math.cos(a);
  const base=[.09,bodyY+.129,side*.105];
  const elbow=[-.10-fold*(1-Math.cos(a))*.27,base[1]+Math.sin(angle)*span*.46,side*(.11+Math.cos(angle)*span*.46)];
  const wrist=[-.21-fold*(1-Math.cos(a))*.60,elbow[1]+Math.sin(tipAngle)*span*.28,elbow[2]+side*Math.cos(tipAngle)*span*.28];
  const vane=(from,to,w,color)=>{
   // Width runs along the chord (forward/back), thickness perpendicular to the wing.
   const off=unit(cross(unit(to.map((n,i)=>n-from[i])),[1,0,0]));
   const rows=[0,.21,.57,.83,1],points=[];
   for(const t of rows){const p=blend(from,to,t),amp=Math.max(.016,Math.sin(Math.PI*t)**.67)*w;
    points.push([p[0],p[1],p[2],amp]);}
   const start=m.v.length/8,first=m.indices.length;
   for(let i=0;i<rows.length;i++)for(let j=0;j<=8;j++){const p=points[i],ang=j*TAU/8,ch=Math.cos(ang),n=Math.sin(ang);
    const normal=unit([ch*.23,off[1]*n,off[2]*n]);m.v.push(p[0]+ch*p[3],p[1]+off[1]*p[3]*.14*n,p[2]+off[2]*p[3]*.14*n,...normal,rows[i],j/8);}
   for(let i=0;i<rows.length-1;i++)for(let j=0;j<8;j++){const p=start+i*9+j;m.indices.push(p,p+1,p+9,p+1,p+10,p+9);}
   m.parts.push({part:'body',material:color,first,end:m.indices.length});
  };
  // A continuous cambered wing carries the secondary and primary feathers.
  const tip=[wrist[0]-.14,wrist[1]+Math.sin(tipAngle)*span*.41,wrist[2]+side*Math.cos(tipAngle)*span*.41];
  const sections=[[base,.20],[blend(base,elbow,.59),.30],[elbow,.31],[blend(elbow,wrist,.53),.275],[wrist,.235],[blend(wrist,tip,.58),.16],[tip,.018]];
  const wi=m.v.length/8,firstWing=m.indices.length;
  for(let j=0;j<sections.length;j++){
   const [p,chord]=sections[j];
   for(let q=0;q<=8;q++){const angle=q*TAU/8,back=Math.cos(angle),thickness=Math.sin(angle);
    m.v.push(p[0]-.07+chord*back,p[1]+chord*.19*thickness,p[2],...unit([.22*back,thickness,.13*side]),j/(sections.length-1),q/8);}
  }
  for(let j=0;j<sections.length-1;j++)for(let q=0;q<8;q++){const n=wi+j*9+q;m.indices.push(n,n+1,n+9,n+1,n+10,n+9);}
  m.parts.push({part:'body',material:wingColor,first:firstWing,end:m.indices.length});
  for(let j=0;j<7;j++){
   const t=j/6,from=blend(base,wrist,t*.92);
   vane(from,[from[0]-.27-.11*t,from[1]+Math.sin(angle)*(.095+.12*t),from[2]+side*Math.cos(angle)*(.105+.14*t)],.108*scale,wingColor);
  }
  for(let j=0;j<(eagle?8:6);j++){
   const t=j/(eagle?7:5),from=blend(elbow,wrist,.29+.71*t);
   const reach=(.19+.31*t)*span;
   const end=[from[0]-.36+.19*t,from[1]+Math.sin(tipAngle-.12*t)*reach,from[2]+side*Math.cos(tipAngle-.12*t)*reach];
   vane(from,end,(eagle?.096:.086)*(1-.3*t),eagle?'feather':pigeon?'winggrey':'amber');
  }
  vane(base,elbow,.192*scale,wingColor);vane(elbow,wrist,.133*scale,wingColor);
  if(pigeon){const from=blend(elbow,wrist,.28);vane(from,[from[0]-.22,from[1]+.039,from[2]+side*.07],.034,'bar');}
  const footY=bodyY-(eagle?.17+.185*landing:.20),tuck=eagle?(1-landing)*.21:0;
  limb(m,'leg',eagle?'gold':'inner',[[.065,bodyY-.12,side*.070,.036],[.098-tuck*.45,footY+.065,side*.082,.027],[.14-tuck,footY+.017,side*.094,.021],[.197-tuck,footY-.02,side*.105,.013],[.235-tuck,footY-.015,side*.110,.005]]);
  limb(m,'leg',eagle?'ink':'inner',[[.15-tuck,footY+.008,side*.09,.012],[.19-tuck,footY-.031,side*.099,.011],[.20-tuck,footY-.027,side*.099,.003]]);
 }
 for(let j=-3;j<=3;j++){
   const s=j/3;limb(m,'body',eagle?'ivory':pigeon?'winggrey':'feather',[[-.37,bodyY+.035,s*.037,.034,.038],[-.61,bodyY+.001,s*.086,.062,.057],[-(eagle?.96:.87)+Math.abs(s)*.049,bodyY-.057,s*.154,.026,.046],[-(eagle?.98:.89)+Math.abs(s)*.052,bodyY-.061,s*.16,.007,.013]]);
 }
}
const meshes=new Map();
let lastBlend=null;
export function wildlifeMesh(kind,phase,bank=0,landing=1){
 const frame=((phase/TAU*48)%48+48)%48,f=Math.floor(frame),t=frame-f;
 const b=Math.round(clamp(bank,-.60,.60)*24),fold=kind==='eagle'?Math.round(clip01(landing)*12):0;
 const one=keyPose(kind,f,b,fold);if(t<1e-7)return one;
 const two=keyPose(kind,(f+1)%48,b,fold);
 if(lastBlend?.one===one&&lastBlend.two===two&&lastBlend.t===t)return lastBlend.mesh;
 const v=new Float32Array(one.v);
 for(let i=0;i<v.length;i+=8)for(let j=i;j<i+6;j++)v[j]+=t*(two.v[j]-v[j]);
 const mesh={v,indices:one.indices,parts:one.parts};lastBlend={one,two,t,mesh};return mesh;
}
function keyPose(kind,f,b,fold){
 const key=kind+':'+f+':'+b+':'+fold;
 if(meshes.has(key))return meshes.get(key);
 const m={v:[],indices:[],parts:[]};
 if(isBird(kind))bird(m,kind,f*TAU/48,b/24,fold/12);else mammal(m,kind,f*TAU/48);
 for(let i=0;i<m.v.length;i+=8){m.v[i]*=modelScale;m.v[i+1]*=modelScale;m.v[i+2]*=modelScale;}
 m.v=new Float32Array(m.v);m.indices=new Uint16Array(m.indices);
 if(meshes.size>=72)meshes.delete(meshes.keys().next().value);meshes.set(key,m);return m;
}
// Normalized camera projection preserves near/far flank parallax even during zoom.
export function wildlifeView(pose,camera={x:0,y:1.65,z:0}){
 const depth=Math.max(.15,pose.z-camera.z);
 return {unit:pose.radius/depth,dx:(pose.x-camera.x)/depth,dy:(pose.y-camera.y)/depth,side:pose.direction<0?-1:1};
}
const surfaceCache={};
function surface(w,h){
 if(!surfaceCache.canvas){
  surfaceCache.canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(w,h):typeof document!=='undefined'?document.createElement('canvas'):null;
  if(!surfaceCache.canvas)return null;
  surfaceCache.ctx=surfaceCache.canvas.getContext('2d');
 }
 if(!surfaceCache.ctx?.createImageData)return null;
 if(w!==surfaceCache.w||h!==surfaceCache.h){
  surfaceCache.canvas.width=w;surfaceCache.canvas.height=h;surfaceCache.w=w;surfaceCache.h=h;
  surfaceCache.img=surfaceCache.ctx.createImageData(w,h);surfaceCache.pixels=new Uint32Array(surfaceCache.img.data.buffer);
  surfaceCache.z=new Float32Array(w*h);
 }
 surfaceCache.pixels.fill(0);surfaceCache.z.fill(-Infinity);return surfaceCache;
}
function projections(m,view,fall,packed){
 const count=m.v.length/8,buf=packed&&packed.length>=count*6?packed:new Float32Array(count*6);
 const c=Math.cos(fall.rotation),s=Math.sin(fall.rotation);
 for(let k=0,j=0;k<m.v.length;k+=8,j+=6){
  const x=m.v[k],y=m.v[k+1],z=m.v[k+2],d=1/Math.max(.12,1-z*view.unit);
  buf[j]=((c*x+s*y*fall.scaleY)*view.side+view.dx*z)*d;
  buf[j+1]=((-s*x+c*y*fall.scaleY)+view.dy*z)*d;
  buf[j+2]=z;buf[j+3]=.66+.43*Math.max(-.55,-m.v[k+3]*view.side*.33+m.v[k+4]*.79+m.v[k+5]*.51);
  buf[j+4]=m.v[k+6];buf[j+5]=m.v[k+7];
 }
 return buf;
}
let projected;
const noFall={rotation:0,scaleY:1};
export function drawWildlife(ctx,x,y,r,pose,camera,fall=noFall){
 if(!(r>.18)||!pose||!Number.isFinite(r))return false;
 requestPelts();
 const view=wildlifeView(pose,camera);
 const canvas=ctx.canvas,extent=r*(2+2*Math.abs(view.dx));
 if(canvas){
  const width=canvas.clientWidth||canvas.width,height=canvas.clientHeight||canvas.height;
  if(x+extent<0||x-extent>width||y+r*2.5<0||y-r*2.5>height)return true;
 }
 const mesh=wildlifeMesh(pose.kind,pose.gaitPhase??wildlifePhase(pose.kind,pose.poseTime||0),pose.bank,pose.landing);
 projected=projections(mesh,view,fall,projected);
 let lx=Infinity,ly=Infinity,rx=-Infinity,ry=-Infinity;
 for(let i=0;i<mesh.v.length/8*6;i+=6){lx=Math.min(lx,projected[i]);rx=Math.max(rx,projected[i]);ly=Math.min(ly,projected[i+1]);ry=Math.max(ry,projected[i+1]);}
 // Bound allocations even when the flight camera passes immediately beside a wing.
 const scale=Math.min(210,r*1.65,540/Math.max(.01,rx-lx),390/Math.max(.01,ry-ly));
 const w=Math.max(16,Math.ceil(((rx-lx)*scale+4)/16)*16),h=Math.max(16,Math.ceil(((ry-ly)*scale+4)/16)*16);
 const tile=surface(w,h);if(!tile)return false;
 for(let i=0;i<mesh.v.length/8*6;i+=6){projected[i]=(projected[i]-lx)*scale+2;projected[i+1]=(ry-projected[i+1])*scale+2;}
 const p=projected,ind=mesh.indices,depth=tile.z,pix=tile.pixels;
 for(const part of mesh.parts){
 const tex=skin(part.material);
 for(let k=part.first;k<part.end;k+=3){
  const ia=ind[k]*6,ib=ind[k+1]*6,ic=ind[k+2]*6;
  const ax=p[ia],ay=p[ia+1],bx=p[ib],by=p[ib+1],cx=p[ic],cy=p[ic+1];
  const abx=bx-ax,aby=by-ay,acx=cx-ax,acy=cy-ay,area=abx*acy-aby*acx;
  if(Math.abs(area)<.018)continue;
  const x0=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)),x1=Math.min(w-1,Math.floor(Math.max(ax,bx,cx)-.5));
  const y0=Math.max(0,Math.ceil(Math.min(ay,by,cy)-.5)),y1=Math.min(h-1,Math.floor(Math.max(ay,by,cy)-.5));
  const da=p[ia+2],la=p[ia+3],ua=p[ia+4],va=p[ia+5];
  for(let yy=y0;yy<=y1;yy++){
   const dy=yy+.5-ay,dx=x0+.5-ax;let b=(dx*acy-dy*acx)/area,c=(abx*dy-aby*dx)/area;
   for(let xx=x0,at=yy*w+x0;xx<=x1;xx++,at++,b+=acy/area,c-=aby/area){
    if(b<0||c<0||b+c>1)continue;
    const a=1-b-c,z=a*da+b*p[ib+2]+c*p[ic+2];if(z<=depth[at])continue;
    depth[at]=z;const light=a*la+b*p[ib+3]+c*p[ic+3];
    const u=clamp((a*ua+b*p[ib+4]+c*p[ic+4])*255|0,0,255);
    const v=clamp((a*va+b*p[ib+5]+c*p[ic+5])*127|0,0,127);
    const color=tex[v*256+u];pix[at]=255<<24|Math.min(255,(color&255)*light)|Math.min(255,((color>>>8)&255)*light)<<8|Math.min(255,(color>>>16)*light)<<16;
   }
  }
 }}
 tile.ctx.putImageData(tile.img,0,0);
 ctx.drawImage(tile.canvas,x+(lx-2/scale)*r,y-(ry+2/scale)*r,w*r/scale,h*r/scale);
 return true;
}
// The same posed triangles resolve a shot crossing the target plane. Keep the
// triangle and its barycentric weights so an embedded arrow travels with that limb.
export function pickWildlife(pose,point){
 const localX=(point.x-pose.x)/pose.radius,localY=(point.y-pose.y)/pose.radius;
 const view=wildlifeView(pose);
 if(Math.abs(localX)>3.5+2*Math.abs(view.dx)||Math.abs(localY)>2.3+2*Math.abs(view.dy))return null;
 const mesh=wildlifeMesh(pose.kind,pose.gaitPhase,pose.bank,pose.landing);
 const pp=projections(mesh,view,noFall,new Float64Array(mesh.v.length/8*6));
 let front=-Infinity,hit=null;
 for(const {part,first,end} of mesh.parts)for(let k=first;k<end;k+=3){
  const a=mesh.indices[k]*6,b=mesh.indices[k+1]*6,c=mesh.indices[k+2]*6;
  const bx=pp[b]-pp[a],by=pp[b+1]-pp[a+1],cx=pp[c]-pp[a],cy=pp[c+1]-pp[a+1],area=bx*cy-by*cx;
  if(Math.abs(area)<1e-10)continue;
  const dx=localX-pp[a],dy=localY-pp[a+1],v=(dx*cy-dy*cx)/area,w=(bx*dy-by*dx)/area,u=1-v-w;
  if(u<0||v<0||w<0)continue;
  const z=u*pp[a+2]+v*pp[b+2]+w*pp[c+2];
  if(z<=front)continue;
  front=z;hit={part,type:'wildlife',index:k,weights:[u,v,w]};
 }
 return hit;
}
export function wildlifeAttachment(pose,anchor,fall=noFall){
 const mesh=wildlifeMesh(pose.kind,pose.gaitPhase,pose.bank,pose.landing),view=wildlifeView(pose);
 if(!Number.isInteger(anchor.index)||anchor.index<0||anchor.index+2>=mesh.indices.length||anchor.weights?.length!==3)return null;
 const c=Math.cos(fall.rotation),s=Math.sin(fall.rotation);
 let x=0,y=0;
 for(let j=0;j<3;j++){
  const i=mesh.indices[anchor.index+j]*8,v=mesh.v,z=v[i+2],d=1/Math.max(.12,1-z*view.unit),w=anchor.weights[j];
  x+=w*((c*v[i]+s*v[i+1]*fall.scaleY)*view.side+view.dx*z)*d;
  y+=w*((-s*v[i]+c*v[i+1]*fall.scaleY)+view.dy*z)*d;
 }
 return {x:pose.x+x*pose.radius,y:pose.y+y*pose.radius,z:pose.z};
}

export function wildlifeSupport(pose,fall=noFall){
 const m=wildlifeMesh(pose.kind,pose.gaitPhase,pose.bank,pose.landing),s=Math.sin(fall.rotation),c=Math.cos(fall.rotation);
 if(!fall.rotation&&m.support!==undefined)return m.support*pose.radius;
 let low=0;for(let i=0;i<m.v.length;i+=8)low=Math.max(low,s*m.v[i]-c*m.v[i+1]*fall.scaleY);
 if(!fall.rotation)m.support=low+.003;
 return (low+.003)*pose.radius;
}
