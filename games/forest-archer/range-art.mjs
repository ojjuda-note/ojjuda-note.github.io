// Colours are grouped by range distance so the landscape stays stable during a shot or replay.
const ranges = [
  { sky:['#438994','#92c4c3','#fbe2ab'], sun:'#fff1c1', glow:'#fff2ca', mountains:['#9cafac','#728f94','#436f77'], rock:['#93b9af','#618f89','#335e64'], mist:'#dfe6c9', trees:['#799d91','#497b70','#28574f','#193e3b'], leaf:'#abc27b', grass:['#94ad82','#769672','#345f51'], path:['#c7ba91','#b0a67d'], bloom:'#f3c584' },
  { sky:['#665d80','#d38f89','#ffd49b'], sun:'#ffecb0', glow:'#ffd7ad', mountains:['#bc9292','#927c88','#6b6379'], rock:['#d5a997','#a58a91','#695d73'], mist:'#f5d3b0', trees:['#aa9092','#827478','#575965','#373e4a'], leaf:'#d69c70', grass:['#ad967a','#977e70','#5b5b62'], path:['#d2ae88','#b49278'], bloom:'#ffca79' },
  { sky:['#152b52','#39587b','#9faab4'], sun:'#ecf2db', glow:'#b2d8e7', mountains:['#7a8ba2','#596d8a','#394f70'], rock:['#a8bbca','#728aa0','#455f7d'], mist:'#a0b8c7', trees:['#647d90','#455e76','#30475d','#1c3046'], leaf:'#8ba8a4', grass:['#72878a','#576e75','#374d5e'], path:['#9aa49e','#859193'], bloom:'#cfddc2' }
];
export function rangePalette(distance) {
  return ranges[distance >= 90 ? 2 : distance >= 40 ? 1 : 0];
}
function randomStream(seed) {
  return () => ((seed = (Math.imul(seed,1664525) + 1013904223) >>> 0) / 4294967296);
}
function polygon(c,points,fill) {
  c.beginPath(); c.moveTo(...points[0]);
  for (let i=1;i<points.length;i++) c.lineTo(...points[i]);
  c.closePath(); c.fillStyle=fill; c.fill();
}
function oval(c,x,y,rx,ry,fill,angle=0) {
  c.beginPath(); c.ellipse(x,y,rx,ry,angle,0,Math.PI*2); c.fillStyle=fill; c.fill();
}
function ridge(c,profile,base,shadow,lit,rand) {
  const peaks=[];
  for(let i=0;i<profile.length-1;i++) {
    const [x,y]=profile[i],[nextX,nextY]=profile[i+1];
    const slices=Math.max(2,Math.ceil((nextX-x)/11));
    for(let n=0;n<slices;n++){
      const t=n/slices;
      peaks.push([x+(nextX-x)*t,y+(nextY-y)*t+(n?rand()*5:0)]);
    }
  }
  peaks.push(profile.at(-1));
  const rockShade=c.createLinearGradient(0,65,0,base);
  rockShade.addColorStop(0,shadow);rockShade.addColorStop(1,lit);
  polygon(c,[...peaks,[1500,base],[-500,base]],rockShade);
  for(let i=1;i<profile.length-1;i++){
    const [x,y]=profile[i],[lx,ly]=profile[i-1],[rx,ry]=profile[i+1];
    if(y>=ly||y>=ry)continue;
    const depth=base-y,foot=x+(rx-x)*.56;
    const face=c.createLinearGradient(x,y,x+20,base);
    face.addColorStop(0,lit);face.addColorStop(1,shadow);
    polygon(c,[[x,y+1],[rx,ry+1],[foot+25,base],[foot-7,y+depth*.79],[x+8,y+depth*.55],[x+18,y+depth*.3]],face);
    c.save();c.globalAlpha=.22;
    for(let j=0;j<9;j++){
      const sx=x+(rx-x)*rand()*.65,top=y+(ry-y)*(sx-x)/(rx-x)+5+rand()*16;
      polygon(c,[[sx,top],[sx+2+rand()*4,top+3],[sx+8+rand()*16,top+16+rand()*25]],shadow);
    }
    c.restore();
  }
}
// The lookout and its overhanging eaves form a single middle-distance silhouette.
function lookout(c,x,y,scale,colour) {
  c.save();c.translate(x,y);c.scale(scale,scale);c.fillStyle=colour;
  c.fillRect(-22,-3,44,3);c.fillRect(-18,-25,3,23);c.fillRect(15,-25,3,23);
  c.fillRect(-2,-25,3,23);c.fillRect(-20,-8,40,2);
  for(let i=-17;i<=17;i+=5)c.fillRect(i,-7,1.3,6);
  c.beginPath();c.moveTo(-34,-29);c.quadraticCurveTo(-25,-24,-9,-35);
  c.lineTo(0,-42);c.lineTo(9,-35);c.quadraticCurveTo(25,-24,34,-29);
  c.quadraticCurveTo(26,-20,10,-22);c.lineTo(-10,-22);
  c.quadraticCurveTo(-26,-20,-34,-29);c.fill();c.restore();
}
export function paintPanorama(c,w,h,p) {
  const night=p===ranges[2],sunset=p===ranges[1];
  const rand=randomStream(night?31711:sunset?28490:17309);
  c.save();c.scale(w/1000,h/600);
  const sky=c.createLinearGradient(0,-125,0,270);
  p.sky.forEach((colour,i)=>sky.addColorStop(i/2,colour));c.fillStyle=sky;c.fillRect(-500,-180,2000,960);
  const sx=night?585:sunset?381:646,sy=night?40:sunset?100:64,glow=c.createRadialGradient(sx,sy,7,sx,sy,191);
  glow.addColorStop(0,p.glow+'b8');glow.addColorStop(.40,p.glow+'57');glow.addColorStop(1,p.glow+'00');
  c.fillStyle=glow;c.fillRect(sx-191,sy-191,382,382);
  if(night)for(let i=0;i<160;i++)oval(c,rand()*2000-500,rand()*230-150,.3+rand(),.3+rand(),p.sun+'ba');
  oval(c,sx,sy,night?16:23,night?16:23,p.sun);
  if(night)for(let i=0;i<9;i++)oval(c,sx-8+rand()*16,sy-7+rand()*14,rand()*2+.4,rand()*1.2+.3,'#acbcb86b');
  // Strands of cloud follow the wind across the frame, with clear sky between banks.
  for(let i=0;i<27;i++){
    const x=rand()*1940-470,y=rand()*150-42,length=25+rand()*92;
    c.save();c.globalAlpha=night?.11:.30;
    c.beginPath();c.moveTo(x-length,y);c.bezierCurveTo(x-length*.5,y-2,x-length*.43,y-9,x-3,y-5);
    c.bezierCurveTo(x+14,y-15,x+length*.46,y-4,x+length,y);
    c.quadraticCurveTo(x+11,y+4,x-length,y);c.fillStyle=p.glow;c.fill();c.restore();
  }
  ridge(c,[[-500,117],[-336,76],[-257,126],[-80,105],[42,141],[181,70],[255,135],[336,111],[433,155],[533,103],[597,129],[718,75],[841,147],[973,102],[1098,147],[1285,80],[1500,145]],271,p.mountains[0],p.rock[0],rand);
  ridge(c,[[-500,180],[-392,113],[-274,141],[-146,83],[-64,125],[57,98],[112,144],[178,117],[240,151],[308,93],[340,125],[400,147],[491,184],[630,157],[684,113],[709,119],[754,79],[783,130],[853,155],[936,127],[1024,153],[1160,119],[1272,171],[1410,123],[1500,141]],270,p.mountains[1],p.rock[1],rand);
  if(night){
    for(const [x,y,width,height] of [[303,99,27,19],[747,85,22,18],[692,118,16,13]]){
      polygon(c,[[x-width,y+height],[x,y],[x+width,y+height*1.15],[x+6,y+height*.7],[x+2,y+height],[x-7,y+height*.53]],p.sun+'a6');
    }
  }
  const ledge=[[-500,164],[-360,192],[-225,130],[-116,166],[-20,142],[76,160],[137,147],[197,160],[232,154],[257,181],[317,190],[358,213],[487,222],[599,213],[661,193],[700,189],[729,174],[771,174],[812,151],[873,163],[949,147],[1002,171],[1135,137],[1288,183],[1500,153]];
  ridge(c,ledge,266,p.mountains[2],p.rock[2],rand);
  if(sunset){
    lookout(c,747,174,.56,p.mountains[2]);
    // A winding stone bridge sits in the side valley, behind the range.
    c.save();c.translate(553,210);c.strokeStyle=p.mountains[2];c.lineWidth=3;
    c.beginPath();c.moveTo(-33,4);c.quadraticCurveTo(0,-15,32,0);c.stroke();
    for(let j=-27;j<=27;j+=9){const y=-4+Math.abs(j)*.17;c.fillStyle=p.mountains[2];c.fillRect(j,y,2,12);}
    c.restore();
  }else if(!night){
    const fall=c.createLinearGradient(0,177,0,234);
    fall.addColorStop(0,'#e3f4e5b3');fall.addColorStop(.72,'#ddf3e58a');fall.addColorStop(1,'#edf7de00');
    for(let i=0;i<6;i++){
      const x=724+i*1.7;
      c.beginPath();c.moveTo(x,178+rand()*2);c.bezierCurveTo(x+2,190,x-3,207,x-2+i*.9,229);
      c.strokeStyle=fall;c.lineWidth=.9+rand()*1.7;c.stroke();
    }
  }
  // Distant evergreens follow the contour of the near ridge.
  for(let i=1;i<ledge.length;i++){
    const [x0,y0]=ledge[i-1],[x1,y1]=ledge[i];
    for(let x=x0+3;x<x1;x+=3+rand()*4){
      if(x>727&&x<770)continue;
      const y=y0+(x-x0)/(x1-x0)*(y1-y0)+2,height=3+rand()*7;
      polygon(c,[[x-2,y],[x,y-height],[x+2.4,y]],p.mountains[2]);
    }
  }
  const fog=c.createLinearGradient(0,174,0,252);fog.addColorStop(0,p.mist+'00');fog.addColorStop(.75,p.mist+'a0');fog.addColorStop(1,p.mist);
  c.fillStyle=fog;c.fillRect(-500,174,2000,88);
  if(!night){
    const shafts=c.createLinearGradient(0,46,0,245);
    shafts.addColorStop(0,p.glow+'01');shafts.addColorStop(.63,p.glow+'23');shafts.addColorStop(1,p.glow+'02');
    for(let i=0;i<3;i++){
      const shift=i*26;
      polygon(c,[[sx+shift,sy],[sx+15+shift,sy],[sx-104+shift,248],[sx-145+shift,248]],shafts);
    }
  }
  c.restore();
}
// Each tree is painted once onto a transparent sprite, then projected in world space.
export function paintFir(c,x,base,h,w,p,depth,seed) {
  const rand=randomStream(seed),top=base-h,lean=(rand()-.5)*w*.14;
  const trunkGradient=c.createLinearGradient(x-w*.045,0,x+w*.055,0);
  trunkGradient.addColorStop(0,p.trees[3]);trunkGradient.addColorStop(.7,p.trees[depth]);trunkGradient.addColorStop(1,p.leaf);
  polygon(c,[[x-w*.045,base],[x+lean,top],[x+w*.053,base]],trunkGradient);
  const shade=p.trees[depth], light=p.leaf;
  for(let row=14;row>=0;row--){
    const t=(row+1)/16,axis=x+lean*(1-t),y=top+h*(.035+t*.80);
    for(const side of [-1,1]){
      const span=w*(.04+.48*t**.76)*(.82+rand()*.30),rise=h*(.035+t*.035),lift=(rand()-.55)*h*.029;
      const points=[[axis,y-rise*1.42],[axis+side*span*.45,y-rise*.02],[axis+side*span,y+lift]];
      for(let k=7;k>=1;k--){
        const u=k/8;
        points.push([axis+side*span*u,y+rise*(.3+rand()*.58)+lift*u],[axis+side*span*(u-.036),y+rise*.23+lift*u]);
      }
      points.push([axis,y+rise*.15]);polygon(c,points,shade);
      c.save();c.globalAlpha=(side===1?.24:.09)*(1-depth*.055);
      polygon(c,[points[0],[axis+side*span*.5,y],[axis+side*span*.94,y+lift],[axis+side*span*.52,y+rise*.25],[axis,y-rise*.38]],light);
      c.restore();
    }
  }
}

// A bent red pine contrasts with the spires of fir along the valley floor.
export function paintRedPine(c,x,base,h,w,p,depth,seed) {
  const rand=randomStream(seed),bark=p.trees[Math.min(3,depth+1)];
  c.save();c.translate(x,base);c.scale(w,h);c.lineCap='round';
  const limb=(points,thickness,colour)=>{
    c.beginPath();c.moveTo(...points[0]);c.bezierCurveTo(...points[1],...points[2],...points[3]);
    c.strokeStyle=colour;c.lineWidth=thickness;c.stroke();
  };
  limb([[0,0],[-.09,-.37],[.14,-.40],[.01,-.82]],.054,bark);
  limb([[-.014,-.004],[-.08,-.34],[.117,-.41],[.003,-.80]],.008,p.rock[1]);
  for(let j=0;j<8;j++){
    const t=j/8,side=j%2===0?-1:1,y=-.50-t*.42;
    const end=side*(.42-t*.29)*(.86+rand()*.2),start=.02+.027*Math.sin(j);
    limb([[start,y+.10],[start+end*.24,y+.11],[end*.62,y+.13],[end,y-.01]],.023-t*.014,bark);
    for(let l=0;l<7;l++){
      const px=end+(l-3)*.052*(1-t*.53),py=y+Math.cos(l*1.03)*.015-rand()*.034;
      c.beginPath();c.moveTo(px-.12,py+.018);
      c.bezierCurveTo(px-.103,py-.016,px-.066,py-.045,px-.037,py-.036);
      c.bezierCurveTo(px-.004,py-.079,px+.057,py-.056,px+.07,py-.031);
      c.quadraticCurveTo(px+.11,py-.032,px+.128,py+.005);
      c.quadraticCurveTo(px+.03,py+.023,px-.12,py+.018);
      c.fillStyle=p.trees[depth];c.fill();
      c.save();c.globalAlpha=.18;
      c.beginPath();c.moveTo(px-.078,py-.024);c.quadraticCurveTo(px,py-.094,px+.067,py-.028);
      c.quadraticCurveTo(px+.022,py-.051,px-.078,py-.024);c.fillStyle=p.leaf;c.fill();c.restore();
    }
  }
  c.restore();
}
