// Small ceramic sculptures. Geometry is shared by every instance and shaded in
// camera space. The depth buffer also keeps adjoining ears, horns and tails solid.
export const ANIMALS=Object.freeze(['쥐','소','호랑이','토끼','용','뱀','말','양','원숭이','닭','개','돼지']);
export function animalFor(team,_index,offset=2,teamAnimals){return teamAnimals?.[team]??(team*3+offset)%12;}

const TAU=Math.PI*2, dark='#352f39', ivory='#fff0ce', rose='#ee9a95';
const palette=new Map(),models=new Array(12),bases=new Map(),cache=new Map();
function color(s){
  if(!palette.has(s))palette.set(s,[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)));
  return palette.get(s);
}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const diff=(a,b)=>a.map((v,i)=>v-b[i]);
const norm=v=>{const length=Math.hypot(...v)||1;return v.map(x=>x/length);};
function mesh(){return {v:[],f:[]};}
function vertex(m,p,n,col){m.v.push([...p,...n,...color(col)]);return m.v.length-1;}
function connect(m,a,b){
  for(let j=0;j<a.length;j++){const k=(j+1)%a.length;
    m.f.push(a[j],b[j],b[k],a[j],b[k],a[k]);
  }
}
function rotate(v,ax,az,ay){
  const cx=Math.cos(ax),sx=Math.sin(ax),cz=Math.cos(az),sz=Math.sin(az),cy=Math.cos(ay),sy=Math.sin(ay);
  const y=v[1]*cx-v[2]*sx,z=v[1]*sx+v[2]*cx,x=v[0]*cz-y*sz;
  return [x*cy+z*sy,v[0]*sz+y*cz,z*cy-x*sy];
}
function ball(m,pos,radii,c,angles=[0,0,0],rings=6,sides=13) {
  let prev=[];
  for(let i=0;i<=rings;i++){
    const a=Math.PI*i/rings,y=Math.cos(a),r=Math.sin(a),row=[];
    for(let j=0;j<sides;j++){
      const t=TAU*j/sides,p=[Math.cos(t)*r,y,Math.sin(t)*r];
      const q=rotate(p.map((v,k)=>v*radii[k]),...angles),n=norm(rotate(p.map((v,k)=>v/radii[k]),...angles));
      row.push(vertex(m,q.map((v,k)=>v+pos[k]),n,c));
    }
    if(i)connect(m,prev,row);prev=row;
  }
}
function tube(m,path,radii,col,sides=9){
  // Transport an entire circular section along the tail, horn or limb.
  let prev=[],right;
  for(let i=0;i<path.length;i++){
    const tangent=norm(diff(path[Math.min(i+1,path.length-1)],path[Math.max(i-1,0)]));
    const normal=norm(cross(tangent,right?cross(right,tangent):Math.abs(tangent[0])<.8?[1,0,0]:[0,0,1]));
    const binorm=norm(cross(tangent,normal));right=normal;
    const row=[];
    for(let j=0;j<sides;j++){
      const a=j*TAU/sides,r=radii[i],n=normal.map((v,k)=>v*Math.cos(a)+binorm[k]*Math.sin(a));
      const p=path[i].map((v,k)=>v+r*n[k]);
      row.push(vertex(m,p,n,Array.isArray(col)?col[i]:col));
    }
    if(i)connect(m,prev,row);prev=row;
  }
}
function baseMesh(team){
  if(bases.has(team))return bases.get(team);
  const m=mesh(),rim='#e9ca86';
  const profile=[[.29,.00,'#324340'],[.395,.022,team],[.430,.060,team],[.430,.106,team],
    [.427,.123,rim],[.420,.139,rim],[.409,.157,team],[.39,.171,team],[.0001,.173,team]];
  let prev=[];
  profile.forEach(([radius,y,c],i)=>{
    const row=[];for(let j=0;j<32;j++){
      const a=j*TAU/32,cs=Math.cos(a),sn=Math.sin(a);
      const n=i===profile.length-1?[0,1,0]:norm([cs,i>4?.55:i<2?-.30:0,sn]);
      row.push(vertex(m,[cs*radius,y,sn*radius],n,c));
    }
    if(i)connect(m,prev,row);prev=row;
  });
  bases.set(team,m);return m;
}

function animalMesh(id){
  if(models[id])return models[id];
  const m=mesh();
  const E=(p,r,c,a=[0,0,0],q=6,n=13)=>ball(m,p,r,c,a,q,n);
  const T=(p,r,c,n=9)=>tube(m,p,r,c,n);
  const eyes=(x,y,z,r=.034)=>{
    for(const t of [-1,1]){
      E([t*x,y,z],[r,r*1.14,r*.76],dark,[0,0,0],4,9);
      E([t*x-.008,y+r*.38,z+r*.54],[r*.32,r*.32,r*.25],'#fff6da',[0,0,0],3,7);
    }
  };
  const feet=(coat,tip=coat)=>{
    for(const t of [-1,1]){E([t*.135,.274,.108],[.111,.13,.12],coat);
      E([t*.15,.222,.20],[.106,.064,.117],tip);}
  };
  const smallEars=(coat,inner,y=.85)=>{
    for(const t of [-1,1]){E([t*.190,y,-.012],[.107,.115,.079],coat,[0,0,t*-.17]);
      E([t*.203,y+.014,.046],[.061,.065,.034],inner);}
  };
  const head=(coat,body=coat)=>{
    E([0,.450,-.068],[.255,.279,.216],body,[-.12,0,0]);
    E([0,.721,.056],[.284,.254,.233],coat);
  };
  const smile=(x,y,z)=>{
    T([[-x,y+.014,z],[0,y,z+.018],[x,y+.014,z]],[.010,.012,.010],'#815448',6);
  };
  if(id===0){ // Mouse: two shell-like ears, tapered nose and a long bare tail.
    const coat='#8896b3',pink='#edabb1';
    T([[0,.34,-.20],[-.18,.26,-.36],[-.37,.24,-.31],[-.45,.25,-.13],[-.42,.28,.05],[-.32,.31,.13]],
      [.041,.038,.034,.030,.021,.006],pink);
    feet(coat,pink);head(coat,'#7a87a5');
    for(const t of [-1,1]){E([t*.204,.904,.008],[.159,.153,.075],coat,[.03,0,t*-.12]);
      E([t*.210,.919,.059],[.108,.105,.034],pink);}
    E([0,.695,.218],[.189,.145,.157],'#b8bbc7');E([0,.676,.349],[.060,.045,.048],'#e79da2');
    eyes(.144,.786,.226,.032);
    for(const t of [-1,1])for(const d of [-1,1])T([[t*.105,.674,.305],[t*.23,.671+d*.02,.31],[t*.335,.672+d*.044,.31]],[.010,.010,.004],'#ede0d4',6);
  } else if(id===1){ // Ox: russet haunches, arcing pale horns, broad muzzle and hooves.
    const coat='#b5724c',cream='#f2d5a6';feet(coat,'#59493e');head(coat,'#a45f40');
    for(const t of [-1,1]){
      E([t*.257,.798,.013],[.134,.068,.075],coat,[0,0,t*.13]);E([t*.30,.800,.063],[.062,.036,.022],rose);
      T([[t*.177,.886,0],[t*.255,.926,-.006],[t*.337,.976,.006],[t*.370,1.055,.032],[t*.354,1.096,.052]],
        [.075,.069,.052,.030,.006],[cream,cream,'#e5c280','#9a744e','#624c41']);
    }
    E([.025,.899,.144],[.091,.087,.063],cream,[0,0,-.24]);
    E([0,.666,.220],[.212,.122,.129],cream);eyes(.157,.786,.242);
    for(const t of [-1,1])E([t*.072,.686,.336],[.024,.017,.012],'#744d44');
    smile(.056,.639,.337);
  } else if(id===2){ // Tiger: hand-painted bands wrap the brow, cheeks and tail.
    const coat='#e8a044',ink='#554140';
    T([[.13,.35,-.18],[.31,.35,-.29],[.39,.48,-.23],[.39,.60,-.13],[.34,.67,-.07]],
      [.074,.070,.068,.060,.043],[coat,ink,coat,ink,coat]);
    feet(coat,'#f0d3a0');head(coat,'#d78b3d');smallEars(coat,ink,.905);
    for(const t of [-1,1]){
      E([t*.113,.661,.255],[.116,.092,.074],ivory);
      E([t*.239,.722,.131],[.035,.097,.045],ink,[.43,0,t*-.26]);
      E([t*.154,.897,.164],[.026,.079,.030],ink,[-.44,0,t*-.35]);
      E([t*.206,.483,.082],[.038,.036,.111],ink,[.26,0,t*.52]);
    }
    E([0,.916,.173],[.031,.068,.03],ink,[-.51,0,0]);eyes(.144,.787,.241,.037);
    E([0,.715,.316],[.052,.033,.036],ink);
  } else if(id===3){ // Rabbit: long, open ears, ivory bib and cotton tail.
    const coat='#f3e9d6';feet(coat,'#e9c7bc');
    E([.19,.351,-.247],[.123,.123,.123],'#fff5e1');E([0,.42,-.055],[.235,.235,.212],'#dfd4c1');
    E([0,.645,.06],[.248,.212,.212],coat);
    for(const t of [-1,1]){const a=[-.055,0,t*-.18];
      E([t*.105,.905,-.006],[.083,.232,.071],coat,a);
      E([t*.108,.920,.042],[.046,.171,.038],'#eca6a5',a);
      E([t*.077,.585,.225],[.081,.074,.060],'#fff3dc');}
    eyes(.112,.684,.243,.033);E([0,.631,.273],[.038,.027,.030],'#d88f94');
  } else if(id===4){ // Eastern dragon: antler forks, gold whiskers, crest and jade tail.
    const jade='#47a79a',pale='#bde2bb',gold='#e6ac52';
    T([[0,.33,-.18],[.225,.33,-.30],[.352,.384,-.30],[.398,.49,-.232],[.388,.57,-.164]],
      [.122,.094,.073,.046,.007],jade);
    feet(jade,pale);head(jade,'#378f88');
    E([0,.425,.141],[.131,.153,.067],pale);
    for(const t of [-1,1]){
      T([[t*.147,.888,-.040],[t*.211,.979,-.080],[t*.23,1.065,-.056],[t*.272,1.12,-.018]],
        [.051,.041,.028,.005],gold);
      T([[t*.211,.98,-.067],[t*.284,1.015,-.104],[t*.306,1.057,-.104]],[.034,.025,.004],gold);
      E([t*.240,.755,-.010],[.075,.134,.055],'#dd965e',[0,0,t*-.60]);
      E([t*.182,.852,.176],[.084,.035,.036],'#397d75',[0,0,t*.25]);
      T([[t*.139,.672,.266],[t*.234,.651,.315],[t*.329,.676,.310],[t*.364,.746,.273]],
        [.023,.018,.013,.005],gold,7);
    }
    E([0,.674,.238],[.172,.117,.154],pale);
    for(const t of [-1,1])E([t*.073,.720,.365],[.024,.017,.014],'#40877b');
    T([[0,.871,.028],[0,.997,.012],[.016,1.052,-.020]],[.073,.045,.005],gold);
    eyes(.149,.793,.234);
  } else if(id===5){ // Snake: two complete coils lead to a raised curved neck.
    const green='#6baf78',pale='#eed58f';
    const coil=[],r=[];
    for(let i=0;i<=29;i++){const t=i/29,a=-.4+t*TAU*1.66,radius=.290-t*.106;
      coil.push([radius*Math.cos(a),.267+t*.213,radius*Math.sin(a)-.015]);r.push(.028+Math.min(1,t*5)*.077);}
    T(coil,r,green,12);
    const end=coil[coil.length-1];
    T([end,[-.055,.510,-.130],[-.143,.625,-.072],[-.104,.740,-.021],[.010,.814,.041],[.114,.887,.101]],
      [.106,.101,.077,.076,.076,.096],green,12);
    E([.113,.891,.157],[.175,.122,.158],green);
    E([.112,.855,.249],[.151,.058,.097],pale);
    for(const t of [-1,1]){
      E([.113+t*.101,.933,.255],[.030,.034,.023],dark);
      E([.106+t*.101,.944,.269],[.010,.010,.007],ivory); }
    T([[.113,.846,.333],[.131,.819,.377],[.10,.804,.439]],[.017,.014,.004],'#bd5559',6);
    T([[.131,.819,.377],[.174,.803,.425]],[.013,.004],'#bd5559',6);
    for(const [a,h] of [[.75,.31],[1.35,.32],[2.05,.335],[1.65,.449],[2.31,.46]]){
      const d=h>.40?.17:.26;E([d*Math.cos(a),h+.060,d*Math.sin(a)-.015],[.040,.032,.040],'#d4bd70');}
  } else if(id===6){ // Horse: raised chest, long nose and dark swept mane.
    const bay='#ae7152',mane='#574345';feet(bay,'#51413c');
    E([0,.422,-.080],[.221,.245,.215],bay);E([0,.605,.046],[.184,.252,.156],bay,[-.24,0,0]);
    T([[.075,.475,-.24],[.13,.449,-.35],[.128,.327,-.420],[.086,.239,-.417]],[.082,.086,.067,.020],mane);
    for(let i=0;i<4;i++)E([0,.67+i*.066,-.084],[.095,.106,.092],mane);
    E([0,.801,.094],[.196,.207,.194],bay);
    E([0,.746,.269],[.147,.119,.197],'#d29973',[-.19,0,0]);
    for(const t of [-1,1]){
      E([t*.120,.986,.023],[.056,.109,.045],bay,[0,0,t*-.15]);E([t*.123,.994,.052],[.028,.065,.022],'#d99b90',[0,0,t*-.15]);
      E([t*.075,.764,.434],[.020,.018,.013],'#735246');}
    T([[0,.872,-.085],[-.047,.996,-.046],[-.11,1.015,.040],[-.154,.951,.142],[-.173,.882,.163]],[.088,.080,.068,.049,.008],mane);
    eyes(.137,.831,.247);
  } else if(id===7){ // Ram: soft fleece and a curled ochre horn on either side.
    const wool='#f3e9cb',skin='#9b887d',horn='#b98249';
    feet(skin,'#6d6059');E([0,.430,-.055],[.256,.246,.231],wool);
    for(let j=0;j<8;j++){const a=j*TAU/8;E([Math.cos(a)*.17,.476,Math.sin(a)*.165-.05],[.107,.122,.107],wool);}
    E([0,.710,.073],[.216,.194,.200],skin);E([0,.655,.211],[.132,.096,.092],'#cfb9a0');
    for(const t of [-1,1]){
      const path=[];const radii=[];for(let j=0;j<=13;j++){
        const u=j/13,a=-.75+u*TAU*.94,r=.130*(1-u*.67);
        path.push([t*(.235+r*Math.sin(a)),.796+r*Math.cos(a),.070+u*.102+r*Math.sin(a)*.26]);radii.push(.058*(1-u*.73));}
      T(path,radii,horn,10);
    }
    for(const [x,y,z,r] of [[0,.883,.031,.12],[-.114,.864,.055,.098],[.120,.864,.050,.094],[-.055,.886,.123,.087],[.072,.880,.125,.085]])
      E([x,y,z],[r,r*.86,r],wool);
    eyes(.112,.743,.240,.029);E([0,.676,.300],[.04,.024,.020],'#6c534a');
  } else if(id===8){ // Monkey: peach mask with pronounced ears and a curled tail.
    const coat='#a76c4b',mask='#f4cf99';
    const tail=[[.10,.37,-.19],[.259,.344,-.32],[.362,.438,-.33],[.395,.584,-.23],[.356,.671,-.15],[.285,.678,-.147],[.253,.630,-.170]];
    T(tail,[.066,.059,.052,.048,.043,.032,.014],coat);
    feet(coat,mask);head(coat);
    for(const t of [-1,1]){E([t*.260,.762,.040],[.119,.110,.066],coat);E([t*.293,.772,.086],[.061,.066,.035],mask);
      E([t*.090,.755,.220],[.121,.115,.071],mask,[0,0,t*-.24]);}
    E([0,.647,.226],[.172,.095,.089],mask);E([.025,.928,.012],[.086,.066,.077],coat,[0,0,-.39]);
    eyes(.116,.773,.281,.031);for(const t of [-1,1])E([t*.029,.695,.306],[.013,.010,.009],'#98644f');
    smile(.060,.641,.309);
  } else if(id===9){ // Rooster: scalloped red comb, two wattles, beak and glazed tail.
    for(const t of [-1,1]){T([[t*.096,.31,.028],[t*.096,.205,.045]],[.034,.032],'#dc9a48');
      E([t*.096,.201,.09],[.079,.030,.087],'#dc9a48');}
    for(const [x,y,z,a,c] of [[-.11,.526,-.24,-.55,'#356f78'],[.012,.610,-.31,-.56,'#3f8891'],[.112,.565,-.25,-.75,'#41687f']]){
      E([x,y,z],[.095,.245,.089],c,[a,0,x<0?.3:-.13]);}
    E([0,.460,-.035],[.231,.239,.225],'#ecbc72');
    for(const t of [-1,1])E([t*.182,.465,-.025],[.085,.154,.177],'#d88e52',[.37,0,t*.15]);
    E([0,.703,.116],[.208,.217,.179],ivory);
    for(let i=0;i<3;i++)E([0,.922+.021*Math.sin(i),.176-i*.083],[.062,.097-i*.008,.064],'#d4524d',[-.20,0,0]);
    E([-.031,.612,.251],[.048,.067,.038],'#ce534f');E([.033,.615,.252],[.042,.059,.034],'#da6255');
    T([[0,.704,.253],[0,.705,.327],[0,.696,.397]],[.074,.050,.004],'#df9e3e');
    eyes(.122,.758,.268,.032);
  } else if(id===10){ // Beagle: long velvet ears, tricolour saddle and white foot tips.
    const tan='#c38b55',black='#574a45',white='#f6e5c4';
    T([[.09,.368,-.207],[.207,.435,-.284],[.25,.555,-.248],[.24,.633,-.198]],[.063,.054,.047,.021],[tan,tan,white,white]);
    feet(tan,white);head(tan,black);E([0,.468,.123],[.140,.158,.080],white);
    for(const t of [-1,1])E([t*.227,.741,.055],[.103,.203,.105],t<0?black:'#956240',[.25,0,t*.12]);
    E([0,.817,.246],[.056,.097,.034],white,[.20,0,0]);E([0,.654,.240],[.163,.107,.119],white);
    eyes(.124,.773,.259);E([0,.692,.344],[.064,.040,.040],dark);
    E([.019,.593,.312],[.040,.044,.022],'#dc938a');
  } else { // Pig: rolled-up tail, folded pinnae and a prominent two-hole snout.
    const pink='#e99b9d';
    const tail=[];for(let i=0;i<=16;i++){const u=i/16,a=u*TAU*1.2;
      tail.push([.095+u*.109+Math.sin(a)*.053,.390+Math.cos(a)*.057,-.22-u*.12]);}
    T(tail,tail.map((_,i)=>.024-i*.00085),'#d67e87',7);
    feet(pink,'#bc7981');head(pink,'#dc9097');
    for(const t of [-1,1]){
      T([[t*.155,.861,.028],[t*.220,.960,.044],[t*.249,.994,.091],[t*.279,.945,.128]],[.102,.076,.033,.007],pink);
      E([t*.216,.924,.101],[.054,.055,.028],'#c97683',[0,0,t*-.25]);
    }
    E([0,.685,.271],[.144,.088,.090],'#d77e8a');for(const t of [-1,1])E([t*.058,.693,.353],[.027,.032,.012],'#864e60');
    eyes(.150,.781,.240,.034);
  }
  // A modest three-quarter pose shows a face and a flank in the default view.
  const yaw=[.18,.20,.17,.19,.25,.08,.63,.23,.19,.35,.19,.17][id],cs=Math.cos(yaw),sn=Math.sin(yaw);
  for(const v of m.v){
    const x=v[0],z=v[2],nx=v[3],nz=v[5];v[0]=x*cs+z*sn;v[2]=z*cs-x*sn;v[3]=nx*cs+nz*sn;v[5]=nz*cs-nx*sn;
  }
  models[id]=m;return m;
}
const pi=Math.PI;

function camera(project,x,y,z){
  const p=project([x,y,z]),q=[project([x+1,y,z]),project([x,y+1,z]),project([x,y,z+1])];
  const a=q.map(n=>n[0]-p[0]),b=q.map(n=>n[1]-p[1]),scale=Math.hypot(...a);
  return {p,scale,r:a.map(v=>v/scale),d:b.map(v=>v/scale)};
}
function viewFromAngles(azimuth,pitch){
  const c=Math.cos(azimuth),s=Math.sin(azimuth),t=Math.sin(pitch),l=Math.cos(pitch);
  return {r:[c,0,s],d:[-s*t,-l,c*t],e:[-s*l,t,c*l]};
}
function makeCanvas(ctx,side){
  let c;
  if(typeof OffscreenCanvas!=='undefined')c=new OffscreenCanvas(side,side);
  else if(typeof document!=='undefined')c=document.createElement('canvas');
  else if(ctx.canvas?.constructor)try{c=new ctx.canvas.constructor(side,side);}catch{}
  if(!c)return null;
  c.width=side;c.height=side;return c;
}
function paintMesh(m,view,pixels,depth,side,unit){
  const {r,d,e}=view, ox=side*.5, oy=side*.735;
  const dst=new Float32Array(m.v.length*6);
  for(let i=0;i<m.v.length;i++){
    const [x,y,z,nx,ny,nz,red,green,blue]=m.v[i],idx=i*6;
    dst[idx]=ox+unit*(r[0]*x+r[2]*z);dst[idx+1]=oy+unit*(d[0]*x+d[1]*y+d[2]*z);
    dst[idx+2]=e[0]*x+e[1]*y+e[2]*z;
    const right=r[0]*nx+r[2]*nz, down=d[0]*nx+d[1]*ny+d[2]*nz,front=e[0]*nx+e[1]*ny+e[2]*nz;
    const sun=Math.max(0,-.43*right-.74*down+.51*front);
    const gloss=Math.max(0,-.25*right-.41*down+.878*front)**26;
    const lit=.79+.256*sun+.025*ny;
    dst[idx+3]=red*lit+18*gloss;dst[idx+4]=green*lit+17*gloss;dst[idx+5]=blue*lit+14*gloss;
  }
  for(let i=0;i<m.f.length;i+=3){
    const a=m.f[i]*6,b=m.f[i+1]*6,c=m.f[i+2]*6;
    const x0=dst[a],y0=dst[a+1],dx1=dst[b]-x0,dy1=dst[b+1]-y0,dx2=dst[c]-x0,dy2=dst[c+1]-y0;
    const area=dx1*dy2-dy1*dx2;
    if(Math.abs(area)<.003)continue;
    const xmin=Math.max(0,Math.floor(Math.min(x0,x0+dx1,x0+dx2))),xmax=Math.min(side-1,Math.ceil(Math.max(x0,x0+dx1,x0+dx2)));
    const ymin=Math.max(0,Math.floor(Math.min(y0,y0+dy1,y0+dy2))),ymax=Math.min(side-1,Math.ceil(Math.max(y0,y0+dy1,y0+dy2)));
    const w1x=dy2/area,w1y=-dx2/area,w2x=-dy1/area,w2y=dx1/area;
    const deltaZ1=dst[b+2]-dst[a+2],deltaZ2=dst[c+2]-dst[a+2];
    for(let y=ymin;y<=ymax;y++){
      let w1=(xmin+.5-x0)*w1x+(y+.5-y0)*w1y,w2=(xmin+.5-x0)*w2x+(y+.5-y0)*w2y;
      let pos=y*side+xmin;
      for(let x=xmin;x<=xmax;x++,pos++,w1+=w1x,w2+=w2x){
        if(w1<-.0002||w2<-.0002||w1+w2>1.0002)continue;
        const zz=dst[a+2]+deltaZ1*w1+deltaZ2*w2;
        if(zz<=depth[pos])continue;
        depth[pos]=zz;
        const rem=1-w1-w2;
        for(let k=0;k<3;k++)pixels[pos*4+k]=rem*dst[a+3+k]+w1*dst[b+3+k]+w2*dst[c+3+k];
        pixels[pos*4+3]=255;
      }
    }
  }
}
function bake(ctx,id,team,view,unit) {
  const side=Math.ceil(unit*1.93),c=makeCanvas(ctx,side);if(!c)return null;
  const cc=c.getContext('2d');if(!cc?.createImageData)return null;
  const image=cc.createImageData(side,side);if(!image?.data)return null;
  const depth=new Float32Array(side*side);
  depth.fill(-Infinity);
  paintMesh(baseMesh(team),view,image.data,depth,side,unit);
  paintMesh(animalMesh(id),view,image.data,depth,side,unit);
  cc.putImageData(image,0,0);return c;
}
function badge(ctx,sx,sy,unit,team,index){
  const radius=Math.max(3.45,.114*unit);
  ctx.save();ctx.translate(sx,sy);
  ctx.beginPath();ctx.arc(0,0,radius,0,TAU);ctx.fillStyle='#fff0c9';ctx.fill();
  ctx.lineWidth=Math.max(.65,radius*.16);ctx.strokeStyle=team;ctx.stroke();
  ctx.font='800 '+Math.max(5.8,radius*1.62)+'px system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle='#3b3734';ctx.fillText(String(index+1),0,0);ctx.restore();
}
export function drawZodiac(ctx,project,x,y,z,size,animal,teamColor,index){
  const id=Number.isInteger(animal)&&animal>=0&&animal<12?animal:0;
  const {p,scale,r,d}=camera(project,x,y,z);
  if(!(scale>0&&size>0))return;
  // Quantization only affects the stored lighting/view of the figure. Its
  // actual board position and scale stay continuous, including while dragging.
  const az=Math.round(Math.atan2(r[2],r[0])/(Math.PI/36)), pitch=Math.round(Math.acos(Math.min(1,Math.max(0,-d[1])))/(Math.PI/72));
  const view=viewFromAngles(az*Math.PI/36,pitch*Math.PI/72),target=scale*size;
  const unit=target<=58?72:target<=102?128:192;
  const key=[id,teamColor,az,pitch,unit].join('/');
  let sprite=cache.get(key);
  if(!sprite){
    sprite=bake(ctx,id,teamColor,view,unit);
    if(sprite){
      if(cache.size>=84){const oldest=cache.keys().next().value;cache.delete(oldest);}
      cache.set(key,sprite);
    }
  }
  if(sprite){
    const w=sprite.width/unit*target;
    ctx.drawImage(sprite,p[0]-w*.5,p[1]-w*.735,w,w);
  }
  if(index!==undefined){
    const front=norm([-r[2],0,r[0]]),offset=.362*size;
    const [bx,by]=project([x+front[0]*offset,y+.157*size,z+front[2]*offset]);
    badge(ctx,bx,by,target,teamColor,index);
  }
}
