const wardrobeStyles = [
  {id:'track', name:'트레이닝복', top:'집업 트랙 재킷', bottom:'조거 팬츠', colors:[
    ['네이비','#3f557d','#eef1fb'], ['올리브','#66754d','#f3e8cd'], ['코랄','#af5261','#fff0e6']]},
  {id:'suit', name:'정장', top:'더블 버튼 블레이저', bottom:'테이퍼드 슬랙스', colors:[
    ['차콜','#424650','#eee9e8'], ['베이지','#b8987e','#fff5e5'], ['와인','#743b52','#ffedf0']]},
  {id:'school', name:'교복', top:'리본 세일러 블라우스', bottom:'세일러 플리츠 스커트', colors:[
    ['네이비','#354b76','#f5f3ef'], ['버건디','#783b53','#fff2e8'], ['포레스트','#3f6559','#f6f0df']]},
];

// Each crop is [atlas x, atlas y, width, height, avatar x, avatar y].
// The last two coordinates register the painted garment on the 400 × 656 pose.
const wardrobeCrops = {
  'track-top': {
    basic: [0, 0, 210, 205, 99, 99],
    pure: [214, 0, 137, 208, 127, 98],
    cute: [355, 0, 164, 209, 127, 98],
    chic: [523, 0, 209, 219, 83, 90],
    lively: [736, 0, 195, 210, 100, 99],
    mini: [935, 0, 144, 106, 132, 357],
    catalog: [0, 572, 256, 217, 0, 0],
  },
  'track-bottom': {
    basic: [0, 0, 130, 346, 141, 210],
    pure: [134, 0, 134, 341, 140, 214],
    cute: [272, 0, 127, 344, 136, 213],
    chic: [403, 0, 187, 356, 137, 202],
    lively: [0, 0, 138, 353, 121, 204],
    mini: [727, 0, 103, 145, 153, 428],
    catalog: [0, 851, 88, 224, 0, 0],
  },
  'suit-top': {
    basic: [0, 223, 206, 203, 102, 101],
    pure: [210, 223, 140, 204, 126, 101],
    cute: [354, 223, 162, 207, 127, 101],
    chic: [520, 223, 208, 215, 83, 93],
    lively: [732, 223, 194, 206, 100, 102],
    mini: [930, 223, 143, 104, 134, 358],
    catalog: [264, 572, 256, 218, 0, 0],
  },
  'suit-bottom': {
    basic: [0, 360, 126, 346, 144, 210],
    pure: [130, 360, 130, 341, 143, 214],
    cute: [264, 360, 125, 345, 137, 213],
    chic: [393, 360, 194, 358, 138, 201],
    lively: [142, 0, 138, 353, 121, 204],
    mini: [721, 360, 101, 145, 154, 428],
    catalog: [264, 851, 87, 224, 0, 0],
  },
  'school-top': {
    basic: [0, 442, 133, 116, 139, 108],
    pure: [137, 442, 135, 120, 130, 108],
    cute: [276, 442, 135, 119, 127, 107],
    chic: [415, 442, 146, 126, 129, 98],
    lively: [565, 442, 143, 113, 123, 107],
    mini: [712, 442, 111, 77, 149, 363],
    catalog: [528, 572, 225, 224, 0, 0],
  },
  'school-bottom': {
    basic: [0, 722, 164, 119, 123, 210],
    pure: [168, 722, 167, 120, 121, 214],
    cute: [339, 722, 165, 119, 115, 213],
    chic: [508, 722, 162, 125, 113, 198],
    lively: [674, 722, 163, 120, 105, 203],
    mini: [841, 722, 123, 80, 143, 427],
    catalog: [528, 851, 256, 206, 0, 0],
  },
};
function registerWardrobeDesigns(catalog,approvedLooks,casual,poses) {
  for (const design of wardrobeStyles) {
    for (const part of ['top','bottom']) {
      design.colors.forEach((color, index) => {
        const group = design.id + '-' + part;
        catalog.push({
          id: group + '-' + index, category: part, design: group,
          name: design[part], tailored:part==='bottom'&&design.id!=='school'?'pants':design.id, colorName: color[0], swatch: color[1],
          preview:'fitted:garment:'+group+':catalog:'+index,
          variants: Object.fromEntries(poses.map(pose => [pose, 'fitted:garment:'+group+':'+pose+':'+index])),
        });
      });
    }
    approvedLooks.push({...casual, bag:null, name:design.name, bg:2,
      top:design.id+'-top-0', bottom:design.id+'-bottom-0'});
  }
}

const wardrobeArms={
  pure:'M128 157L155 159Q166 204 187 254L204 294Q212 272 220 240L235 170L254 163Q246 226 233 266L220 307Q220 337 199 333Q189 333 187 313L175 277Q149 234 128 157Z',
  cute:'M145 104L171 104Q164 133 156 163Q154 198 142 214L129 217Q123 187 129 152Z',
  chic:'M87 171L102 167Q120 203 145 217L164 214L184 226L195 239L184 244Q167 237 148 243Q117 240 89 203Z',
  lively:'M102 126L131 121Q136 153 144 179L144 205L132 216L109 216Q103 193 102 162Z'
};

// When sleeves cover the forearms, keep the original fingers in front of the cuffs.
const wardrobeHands={
  pure:'M182 295Q190 292 201 298L211 290L226 294L221 315Q216 338 198 333Q188 329 187 313Z',
  cute:'M150 117L158 87L185 83L192 107Q180 119 178 130L159 131Z',
  chic:'M146 224Q152 217 165 218Q183 213 196 237L184 243L164 236L147 241Z',
  lively:'M99 143L86 91L110 77L143 91L141 129L136 144Z'
};
const wardrobeDyes={
  track:{base:[64,59,75],colors:[[53,69,104],[100,114,71],[171,83,101]]},
  suit:{base:[62,54,57],colors:[[72,72,79],[178,147,118],[117,59,83]]},
  school:{base:[57,49,62],colors:[[53,65,99],[118,54,76],[54,94,80]]}
};
function dyeWardrobe(context,width,height,style,index){
  const pixels=context.getImageData(0,0,width,height);
  const rgba=pixels.data,{base,colors}=wardrobeDyes[style],color=colors[index];
  const fabric=base.map((v,k)=>Array.from({length:256},(_,light)=>color[k]*Math.pow(light/v,.91)));
  for(let i=0;i<rgba.length;i+=4){
    if(!rgba[i+3])continue;
    const r=rgba[i],g=rgba[i+1],b=rgba[i+2];
    const light=.26*r+.58*g+.16*b;
    // Ivory piping, the silk ribbon and metal hardware retain their original finish.
    const dyed=Math.max(0,Math.min(1,(176-light)/45));
    const accent=Math.max(0,Math.min(1,(r-b-(style==='school'?9:13))/17));
    const weight=dyed*(1-accent);
    for(let k=0;k<3;k++)rgba[i+k]+=(fabric[k][rgba[i+k]]-rgba[i+k])*weight;
  }
  context.putImageData(pixels,0,0);
}
const wardrobeFitCrops={"dress":{"basic":[0,0,180,195,114,140],"pure":[184,0,134,199,139,140],"cute":[322,0,149,210,127,128],"chic":[475,0,193,208,87,124],"lively":[672,0,174,198,105,136],"mini":[850,0,129,125,140,383]},"boots":{"lively":[983,0,144,308,141,339]},"arm":{"lively":[1131,0,53,127,95,90],"cute":[1188,0,72,133,122,80],"chic":[1264,0,108,75,89,167],"pure":[0,312,131,173,127,164]}};
const nocturneCrops={"dress":{"basic":[0,0,180,195,114,140],"pure":[184,0,125,199,139,140],"cute":[313,0,147,210,129,128],"chic":[464,0,193,208,87,124],"lively":[661,0,174,198,105,136],"mini":[839,0,129,125,140,383],"catalog":[244,280,122,190,0,0]},"boots":{"basic":[972,0,92,265,163,379],"pure":[1068,0,87,266,165,379],"cute":[1159,0,110,276,158,371],"chic":[1273,0,204,276,154,374],"mini":[1481,0,86,109,163,516],"catalog":[370,280,35,190,0,0]},"choker":{"basic":[0,280,38,66,186,105],"pure":[42,280,37,67,181,105],"cute":[83,280,37,67,179,105],"chic":[124,280,39,66,191,100],"lively":[167,280,37,67,179,104],"mini":[208,280,32,52,189,360],"catalog":[409,280,80,190,0,0]},"head":{"basic":[493,280,156,237,127,8],"pure":[928,280,120,236,135,9],"cute":[1327,280,138,238,129,7],"chic":[171,522,183,240,89,5],"lively":[636,522,171,240,97,5],"mini":[1089,522,239,355,86,148]},"hair-front":{"basic":[653,280,98,205,155,4],"pure":[1052,280,103,205,145,6],"cute":[1469,280,102,205,144,4],"chic":[358,522,103,205,155,2],"lively":[811,522,103,205,144,2],"mini":[1332,522,245,357,79,143],"catalog":[299,883,110,190,0,0]},"hair-back":{"basic":[755,280,103,205,155,4],"pure":[1159,280,103,206,145,6],"cute":[0,522,103,205,144,4],"chic":[465,522,103,206,155,2],"lively":[918,522,103,206,144,2],"mini":[0,883,248,357,79,143]},"bag":{"basic":[862,280,62,94,278,305],"pure":[1266,280,57,86,178,312],"cute":[107,522,60,92,257,309],"chic":[572,522,60,92,258,314],"lively":[1025,522,60,92,277,304],"mini":[252,883,43,64,251,463],"catalog":[413,883,85,190,0,0]}};
function registerNocturne(catalog,looks,casual,poses){
  const collection=[
    ['dress','dress','셔링 원피스 · 토시 세트'],
    ['choker','accessory','큐빅 체인 초커'],
    ['boots','shoes','스웨이드 니하이 부츠'],
    ['hair-front','hair','한쪽 넘긴 긴 생머리'],
    ['bag','bag','체인 복조리백']
  ];
  const look={...casual,name:'블랙 셔링 룩',bg:1};
  for(const [part,category,name] of collection){
    const id='nocturne-'+part;
    catalog.push({id,category,name,design:id,...(part==='dress'?{colorName:'블랙',swatch:'#24232c'}:{}),preview:'fitted:nocturne:'+part+':catalog',
      variants:Object.fromEntries(poses.map(pose=>[pose,'fitted:nocturne:'+part+':'+pose]))});
    if(part==='dress'){
      for(const [tone,label,swatch] of [['wine','와인','#642d40'],['night','미드나이트 블루','#303f59']]){
        catalog.push({id:id+'-'+tone,category,name,design:id,colorName:label,swatch,
          preview:'fitted:nocturne:dress:catalog:'+tone,
          variants:Object.fromEntries(poses.map(pose=>[pose,'fitted:nocturne:dress:'+pose+':'+tone]))});
      }
    }
    look[category]=id;
  }
  looks.unshift(look);
  return look;
}
async function nocturneLayer(part,pose,loadImage,newCanvas,tone){
  const revised=wardrobeFitCrops[part]?.[pose];
  const [sx,sy,w,h,dx,dy]=revised||nocturneCrops[part][pose];
  const sheet=await loadImage(revised?'./artwork/wardrobe-fit-02.webp':'./artwork/nocturne-01.webp');
  const out=pose==='catalog'?newCanvas(w,h):newCanvas();
  const neckOffset=part==='choker'?({pure:-7,cute:-2,chic:-6,lively:1}[pose]||0):0;
  out.getContext('2d').drawImage(sheet,sx,sy,w,h,dx+neckOffset,dy,w,h);
  if(part==='hair-back'&&pose!=='mini'){
    const c=out.getContext('2d'),{neck:[x,y]}=jointFit[pose];
    c.save();c.globalCompositeOperation='destination-over';
    const shadow=c.createLinearGradient(x-32,y,x+32,y+3);
    shadow.addColorStop(0,'#1f1c22');shadow.addColorStop(.5,'#231e24');shadow.addColorStop(1,'#1d1a20');
    c.fillStyle=shadow;c.beginPath();c.moveTo(x-40,y-28);
    c.quadraticCurveTo(x,y-42,x+40,y-25);c.lineTo(x+38,y+35);
    c.quadraticCurveTo(x,y+14,x-38,y+35);c.closePath();c.fill();c.restore();
  }
  if(part==='dress'&&tone){
    const ctx=out.getContext('2d'),pixels=ctx.getImageData(0,0,out.width,out.height);
    const color=tone==='wine'?[1.94,.89,1.12]:[.97,1.19,1.63];
    for(let i=0;i<pixels.data.length;i+=4){
      if(!pixels.data[i+3])continue;
      for(let k=0;k<3;k++)pixels.data[i+k]*=color[k];
    }
    ctx.putImageData(pixels,0,0);
  }
  return out;
}
// Source-space landmarks for the neck and the two arms of each original drawing.
const jointFit={
  basic:{neck:[206,100,12], arms:[[160,126,151,221,112,293],[251,127,258,221,296,294]]},
  pure:{neck:[191,101,11], arms:[[147,128,169,222,195,296],[245,128,236,220,217,295]]},
  cute:{neck:[196,100,11], arms:[[147,126,141,205,167,118],[241,126,246,219,275,297]]},
  chic:{neck:[204,96,12], arms:[[163,118,99,190,150,230],[250,133,255,221,277,297]]},
  lively:{neck:[200,97,11], arms:[[147,127,117,203,124,137],[245,125,246,217,280,292]]},
  mini:{neck:[205,361,11], arms:[[167,380,158,419,143,455],[243,380,251,419,266,455]]}
};
function skinTone(ctx,x1,y1,x2,y2){
  const tone=ctx.createLinearGradient(x1,y1,x2,y2);
  tone.addColorStop(0,'#e8b7a8');
  tone.addColorStop(.26,'#ffe1d2');
  tone.addColorStop(.7,'#ffe5d9');
  tone.addColorStop(1,'#eac0b2');
  return tone;
}
function paintShoulders(ctx,pose){
  const {neck:[cx,cy,n],arms:[left,right]}=jointFit[pose];
  const scale=pose==='mini'?.77:1, depth=pose==='mini'?10:16;
  function cap([x,y,ex,ey],side){
    const dx=ex-x,dy=ey-y,len=Math.hypot(dx,dy);
    const band=pose==='mini'?.48:.31;
    const bx=x+dx*band,by=y+dy*band,r=11*scale*side;
    return {x,y,ox:bx+r*dy/len,oy:by-r*dx/len,ix:bx-r*dy/len,iy:by+r*dx/len};
  }
  const l=cap(left,-1),r=cap(right,1);
  ctx.beginPath();ctx.moveTo(cx-n,cy-3);
  ctx.bezierCurveTo(cx-n,cy+depth*.6,cx-n-4,cy+depth*.88,l.x+8,l.y-8*scale);
  ctx.bezierCurveTo(l.x-5,l.y-6*scale,l.ox-1,l.oy-9,l.ox,l.oy);
  ctx.lineTo(l.ix,l.iy);ctx.lineTo(cx-32*scale,cy+56*scale);
  ctx.lineTo(cx+33*scale,cy+56*scale);ctx.lineTo(r.ix,r.iy);ctx.lineTo(r.ox,r.oy);
  ctx.bezierCurveTo(r.ox+1,r.oy-10,r.x+4,r.y-7*scale,r.x-7,r.y-8*scale);
  ctx.bezierCurveTo(cx+n+5,cy+depth*.9,cx+n,cy+depth*.6,cx+n,cy-3);ctx.closePath();
  ctx.fillStyle=skinTone(ctx,left[0]-9,cy,right[0]+10,cy+8);ctx.fill();
}
function paintSchoolArms(ctx,pose,newCanvas){
  if(pose==='mini'){
    const patch=newCanvas(),p=patch.getContext('2d');
    for(const [outline,left,right] of [
      ['M158 392L178 397Q176 410 169 426L151 425Q156 409 158 392Z',154,176],
      ['M232 397L251 392Q254 411 260 425L241 426Q235 412 232 397Z',235,257]
    ]){
      p.fillStyle=skinTone(p,left,400,right,407);p.fill(new Path2D(outline));
    }
    const fade=p.createLinearGradient(0,415,0,426);
    fade.addColorStop(0,'#000');fade.addColorStop(1,'transparent');
    p.globalCompositeOperation='destination-in';p.fillStyle=fade;p.fillRect(0,380,400,47);
    ctx.globalCompositeOperation='source-over';ctx.drawImage(patch,0,0);
    return;
  }
  const mini=pose==='mini';
  for(const [x,y,ex,ey] of jointFit[pose].arms){
    const dx=ex-x,dy=ey-y,len=Math.hypot(dx,dy),nx=dy/len,ny=-dx/len;
    const r=mini?8.3:9.4;
    const ax=x+dx*.35,ay=y+dy*.35,bx=x+dx*.85,by=y+dy*.85;
    ctx.beginPath();ctx.moveTo(ax-nx*r,ay-ny*r);
    ctx.lineTo(ax+nx*r,ay+ny*r);ctx.lineTo(bx+nx*r*.87,by+ny*r*.87);
    ctx.lineTo(bx-nx*r*.87,by-ny*r*.87);ctx.closePath();
    ctx.fillStyle=skinTone(ctx,ax-nx*r,ay-ny*r,ax+nx*r,ay+ny*r);ctx.fill();
  }
}
function cleanWrist(ctx,source,x,y,radius){
  // Keep the ink immediately bordering skin, but drop old hair and sleeve
  // fragments that sit beside an exposed wrist in the original drawing.
  const size=2*radius,left=Math.floor(x-radius),top=Math.floor(y-radius);
  const patch=document.createElement('canvas');patch.width=size;patch.height=size;
  const p=patch.getContext('2d',{willReadFrequently:true});
  p.drawImage(source,left,top,size,size,0,0,size,size);
  const im=p.getImageData(0,0,size,size),rgba=im.data,skin=new Uint8Array(size*size);
  for(let n=0;n<skin.length;n++){
    const i=n*4,r=rgba[i],g=rgba[i+1],b=rgba[i+2];
    skin[n]=rgba[i+3]>35&&r>151&&g>101&&b>83&&r>=g-4&&g>=b*.92&&r-b<130;
  }
  for(let row=1;row<size-1;row++)for(let col=1;col<size-1;col++){
    const n=row*size+col;
    if(skin[n])continue;
    let neighbours=0;
    for(const dy of [-1,0,1])for(const dx of [-1,0,1])neighbours+=skin[n+dy*size+dx];
    rgba[n*4+3]*=Math.min(1,neighbours/3);
  }
  p.putImageData(im,0,0);ctx.drawImage(patch,left,top);
}
function shoulderAndArmBacking(pose,native,newCanvas,fullArms=true){
  const out=newCanvas(),c=out.getContext('2d');
  paintShoulders(c,pose);
  // Keep the painted forearms. Where the old sleeve removed the upper arm,
  // extend its skin beneath the new sleeve so any neckline or cuff can overlap it.
  for(const [sx,sy,ex,ey,wx,wy] of jointFit[pose].arms){
    const scale=pose==='mini'?.76:1;
    const segments=[[sx,sy,ex,ey,11.5,9]];
    if(fullArms)segments.push([ex,ey,wx,wy,9,6]);
    for(const [ax,ay,bx,by,ar,br] of segments){
      const len=Math.hypot(bx-ax,by-ay),nx=(by-ay)/len,ny=(ax-bx)/len;
      const r=ar*scale,t=br*scale,section=new Path2D();
      section.moveTo(ax-nx*r,ay-ny*r);section.lineTo(ax+nx*r,ay+ny*r);
      section.lineTo(bx+nx*t,by+ny*t);section.quadraticCurveTo(bx+(bx-ax)*.07,by+(by-ay)*.07,bx-nx*t,by-ny*t);
      section.closePath();c.fillStyle=skinTone(c,ax-nx*r,ay-ny*r,ax+nx*r,ay+ny*r);c.fill(section);
      // The long sleeve in the original drawing masks the upper arm; hair
      // highlights behind it cannot be used as skin. Preserve only the forearm ink.
      if(fullArms&&ax===ex){
        c.save();c.clip(section);cleanWrist(c,native,(ex+wx)/2,(ey+wy)/2,75);c.restore();
      }
    }
  }
  // Blend the painted collarbone highlights without copying dark hair outlines.
  if(fullArms){
    const [x,y]=jointFit[pose].neck,patch=newCanvas(48,44),pc=patch.getContext('2d');
    pc.drawImage(native,x-24,y-5,48,44,0,0,48,44);
    const pixels=pc.getImageData(0,0,48,44);
    for(let row=0;row<44;row++)for(let col=0;col<48;col++){
      const i=(row*48+col)*4,dx=(col-24)/24,dy=(row-22)/22;
      const feather=Math.max(0,Math.min(1,(1-dx*dx-dy*dy)*3));
      const skin=Math.max(0,Math.min(1,(pixels.data[i]-182)/27,(pixels.data[i+1]-125)/33,(pixels.data[i+2]-108)/33));
      pixels.data[i+3]*=skin*feather;
    }
    pc.putImageData(pixels,0,0);c.drawImage(patch,x-24,y-5);
  }
  return out;
}
async function dressPortrait(ctx,pose,original,data,loadImage,newCanvas,straight,dress){
  const mini=pose==='mini',{neck:[cx,cy],arms}=jointFit[pose];
  const native=await loadImage(data.base[pose]);
  const head=straight?await loadImage('fitted:nocturne:head:'+pose):original;
  ctx.clearRect(0,0,ctx.canvas.width,mini?495:dress?319:250);
  if(!straight){
    // The hair mask keeps the original waves beyond the clipped face and hands.
    const waves=newCanvas();const w=waves.getContext('2d');
    w.drawImage(original,0,0);w.globalCompositeOperation='destination-in';
    w.drawImage(await loadImage(data.items.find(i=>i.id==='casual01-hair').variants[pose]),0,0);
    ctx.drawImage(waves,0,0);
  }
  if(dress)paintShoulders(ctx,pose);
  else ctx.drawImage(shoulderAndArmBacking(pose,native,newCanvas),0,0);
  // Fit the original face outline. A soft join below the jaw preserves its
  // painted shadow without transferring the old neckline or hair at the sides.
  const faces={basic:[207,67,0],pure:[199,69,9],cute:[199,67,10],chic:[209,65,6],
    lively:[199,64,9],mini:[204,305,0]};
  const [fx,fy,rotation]=faces[pose];
  const contour=mini?[[-34,-58],[-14,-61],[15,-61],[34,-50],[40,-19],[42,4],[39,17],
    [33,28],[23,31],[0,35],[-23,31],[-36,22],[-41,7],[-40,-19]]:
    [[-30,-51],[-10,-58],[15,-56],[28,-45],[35,-19],[35,3],[32,14],[24,27],[10,33],[0,36],[-13,31],[-24,24],[-32,12],[-35,-6]];
  const face=newCanvas(),f=face.getContext('2d');
  f.save();f.translate(fx,fy);f.rotate(rotation*Math.PI/180);
  if(mini)f.scale(2.85,2.55);
  f.beginPath();f.moveTo(...contour[0]);for(const pt of contour.slice(1))f.lineTo(...pt);
  f.closePath();f.fill();f.restore();
  if(mini){
    // The chin reaches y=361. Keep the long side locks on their separate hair layer.
    f.globalCompositeOperation='destination-in';
    f.fill(new Path2D('M85 140H322V303Q312 331 278 343Q254 357 221 360Q205 365 185 360Q154 357 131 341Q105 327 85 303Z'));
  }
  f.globalCompositeOperation='source-in';f.drawImage(head,0,0);
  ctx.drawImage(face,0,0);
  const neck=newCanvas(30,25),n=neck.getContext('2d',{willReadFrequently:true});
  n.drawImage(await loadImage(data.base[pose]),cx-15,cy-7,30,25,0,0,30,25);
  const skin=n.getImageData(0,0,30,25),pixels=skin.data;
  for(let y=0;y<25;y++)for(let x=0;x<30;x++){
    const i=(y*30+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    const edge=Math.min(1,Math.max(0,(r-120)/26),Math.max(0,(g-72)/28),
      Math.max(0,14-Math.abs(x-14.5)),(25-y)/10);
    pixels[i+3]*=r>g&&g>=b*.94?edge:0;
  }
  n.putImageData(skin,0,0);ctx.drawImage(neck,cx-15,cy-7);

  for(let index=0;index<arms.length;index++){
    const [, ,ex,ey,x,y]=arms[index],len=Math.hypot(x-ex,y-ey);
    const dx=(x-ex)/len,dy=(y-ey)/len,nx=dy,ny=-dx;
    const wrist=mini?10:14, reach=mini?38:65, fan=mini?17:35;
    const ax=x-16*dx,ay=y-16*dy,bx=x+reach*dx,by=y+reach*dy;
    ctx.save();ctx.beginPath();ctx.moveTo(ax-wrist*nx,ay-wrist*ny);ctx.lineTo(ax+wrist*nx,ay+wrist*ny);
    ctx.lineTo(bx+fan*nx,by+fan*ny);ctx.lineTo(bx-fan*nx,by-fan*ny);ctx.closePath();ctx.clip();
    cleanWrist(ctx,native,x,y,mini?37:52);
    ctx.restore();
  }
}
async function portraitLayer(pose,flags,data,loadImage,newCanvas){
  const straight=flags.includes('h'),dress=flags.includes('d'),boots=flags.includes('b');
  const baseKey=flags.includes('c')?'fitted:base:'+pose:data.base[pose];
  const original=await loadImage(baseKey),out=newCanvas(),ctx=out.getContext('2d');
  ctx.drawImage(original,0,0);
  ctx.globalCompositeOperation='destination-out';
  async function erase(item,offsets){
    const im=await loadImage(data.items.find(x=>x.id===item).variants[pose]);
    for(const [x,y] of offsets)ctx.drawImage(im,x,y);
  }
  if(straight&&pose==='mini'){
    const waves=await loadImage(data.items.find(i=>i.id==='casual01-hair').variants.mini);
    for(const dx of [-1,0,1])ctx.drawImage(waves,dx,0);
  }
  if(dress)await erase('top-original',[[0,0],[-1,0],[1,0],[0,1]]);
  if(flags.includes('p')){
    // Both trouser legs cover the native skin. Keep the shoes and lowered hand.
    ctx.clearRect(121,286,135,80);
    ctx.clearRect(125,366,116,36);
    ctx.clearRect(145,402,75,140);
  }
  if(boots){
    await erase('shoes-original',[[0,0],[-3,0],[3,0],[0,-3],[0,3]]);
    // Mask just the lower body. Keep hands, hair and accessories outside that region.
    const lower=newCanvas(),leg=lower.getContext('2d');
    clipAtBoots(leg,pose);leg.drawImage(out,0,0);
    const from=pose==='mini'?505:pose==='lively'?335:358;
    ctx.clearRect(0,from,out.width,out.height-from);
    ctx.save();ctx.globalCompositeOperation='source-over';
    ctx.drawImage(lower,0,from,out.width,out.height-from,0,from,out.width,out.height-from);ctx.restore();
  }
  ctx.globalCompositeOperation='source-over';
  if(dress||straight)await dressPortrait(ctx,pose,original,data,loadImage,newCanvas,straight,dress);
  else if(flags.includes('k')){
    ctx.save();ctx.globalCompositeOperation='destination-over';
    ctx.drawImage(shoulderAndArmBacking(pose,await loadImage(data.base[pose]),newCanvas,false),0,0);ctx.restore();
  }
  if(flags.includes('s')){
    ctx.globalCompositeOperation='destination-over';paintSchoolArms(ctx,pose,newCanvas);
  }
  return out;
}

// The neutral drawing has one unobstructed sleeve. Mirror its knit panel about
// the button placket, then fit that complete garment to each pose.
const knitFit = {
  basic: [1,0,0,1,0,0], pure: [.99,-.015,.07,1.09,-11,-3],
  cute: [1.02,-.012,-.025,1.08,-12,-3], chic: [1.04,.19,.12,1.07,3,-11],
  lively: [.96,.015,-.14,1.07,-8,-6]
};
async function knitLayer(id,pose,data,loadImage,newCanvas){
  const original=data.items.find(entry=>entry.id===id).variants;
  if(pose==='mini')return loadImage(original.mini);
  const neutral=await loadImage(original.basic);
  const panel=newCanvas(),p=panel.getContext('2d'),axis=207.5;
  p.drawImage(neutral,138,111,69.5,108,138,111,69.5,108);
  p.translate(2*axis,0);p.scale(-1,1);
  p.drawImage(neutral,138,111,69.5,108,138,111,69.5,108);
  // Keep the native buttons intact across the center seam.
  p.setTransform(1,0,0,1,0,0);p.drawImage(neutral,202,145,11,74,202,145,11,74);
  const out=newCanvas(),ctx=out.getContext('2d');
  const [a,b,c,d,x,y]=knitFit[pose];
  ctx.save();
  ctx.translate(axis+x,150+y);ctx.transform(a,b,c,d,0,0);ctx.translate(-axis,-150);
  ctx.drawImage(panel,0,0);ctx.restore();
  return out;
}

// Opening landmarks are in atlas-registered avatar coordinates. The outer shell
// remains whole in the wardrobe. Only its front crosses the body when worn.
const neckOpenings={
  track:{
    basic:[193,103,218,103,109],pure:[186,102,211,103,109],
    cute:[183,103,207,103,109],chic:[202,94,226,100,104],
    lively:[182,106,207,103,111],mini:[195,361,214,361,365]
  },
  suit:{
    basic:[196,105,215,105,117],pure:[188,104,208,104,116],
    cute:[185,105,204,105,117],chic:[202,97,222,101,112],
    lively:[186,106,204,105,117],mini:[197,363,212,363,370]
  },
  school:{
    basic:[188,114,223,114,125],pure:[181,113,216,113,124],
    cute:[178,113,213,113,124],chic:[197,105,230,112,120],
    lively:[179,115,214,113,125],mini:[191,369,217,369,377]
  }
};
function wornCollar(image,style,pose,newCanvas){
  const [l,ly,r,ry,front]=neckOpenings[style][pose];
  const out=newCanvas(),c=out.getContext('2d'),center=(l+r)/2;
  const shift=jointFit[pose].neck[0]-center, top=Math.min(ly,ry)-6, bottom=front+23;
  c.drawImage(image,0,0);
  // Register the collar to the neck while leaving both sleeve cuffs in place.
  if(Math.abs(shift)>.5){
    const left=Math.floor(center-49),midL=Math.floor(l-3),midR=Math.ceil(r+3),right=Math.ceil(center+49);
    c.clearRect(left,top,right-left,bottom-top);
    for(let y=top;y<bottom;y++){
      const offset=shift*Math.min(1,(bottom-y)/(bottom-front));
      const src=[left,midL,midR,right],dst=[left,midL+offset,midR+offset,right];
      for(let k=0;k<3;k++)c.drawImage(image,src[k],y,src[k+1]-src[k],1,dst[k],y,dst[k+1]-dst[k],1);
    }
  }
  c.save();c.translate(Math.abs(shift)>.5?shift:0,0);
  c.globalCompositeOperation='destination-out';
  c.beginPath();c.moveTo(l-1,top);c.lineTo(r+1,top);c.lineTo(r,ry);
  if(style==='suit'){
    c.bezierCurveTo(r,front-4,center+3,front-2,center,front);
    c.bezierCurveTo(center-3,front-2,l,front-4,l,ly);
  }else{
    c.bezierCurveTo(r-1,front+1,l+1,front+1,l,ly);
  }
  c.closePath();c.fill();c.restore();
  return out;
}

// Each line follows the painted upper rim, including the overlapping legs of
// the crossed stance and the diagonal shaft of the raised-knee stance.
const bootRims={
  basic:[[164,384,185,388,206,385],[210,385,232,387,253,385]],
  pure:[[166,384,187,387,207,385],[209,385,230,387,251,385]],
  cute:[[159,383,175,386,187,382],[182,380,204,382,226,375]],
  chic:[[156,381,178,385,200,383],[233,380,254,381,278,377]],
  lively:[[149,342,173,352,198,365]],
  mini:[[168,521,184,523,201,522],[212,521,227,523,244,522]]
};
function bootFit(pose,x,y){
  if(pose==='cute')return 8*Math.max(0,1-Math.abs(x-225)/37)*Math.max(0,Math.min(1,(421-y)/44));
  return 0;
}
function bootLayer(image,pose,front,newCanvas){
  const out=newCanvas(),c=out.getContext('2d');
  c.drawImage(image,0,0);
  if(pose==='cute'){
    // Widen the forward shaft to the outside of the original crossed thigh.
    c.clearRect(188,369,75,52);
    for(let y=369;y<421;y++){
      const delta=bootFit(pose,225,y);
      c.drawImage(image,188,y,37,1,188,y,37+delta,1);
      c.drawImage(image,225,y,38,1,225+delta,y,38-delta,1);
    }
  }
  if(front){
    c.globalCompositeOperation='destination-out';
    for(const [l,ly,m,my,r,ry] of bootRims[pose]){
      c.beginPath();c.moveTo(l+1+bootFit(pose,l,ly),ly);
      c.quadraticCurveTo(m+bootFit(pose,m,my),my,r-1+bootFit(pose,r,ry),ry);
      c.lineTo(r+bootFit(pose,r,ry),ry-12);c.lineTo(l+bootFit(pose,l,ly),ly-12);c.closePath();c.fill();
    }
  }
  return out;
}
function clipAtBoots(ctx,pose){
  const rims=bootRims[pose];
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(400,0);
  if(pose==='lively'){
    ctx.lineTo(400,365);ctx.lineTo(198,365);
    ctx.quadraticCurveTo(173,354,149,342);
    // The standing thigh continues behind the bent knee.
    ctx.lineTo(147,355);ctx.lineTo(154,372);ctx.lineTo(178,391);
    ctx.lineTo(145,391);ctx.lineTo(135,350);ctx.lineTo(0,350);
  }else{
    const top=Math.min(...rims.flatMap(rim=>[rim[1],rim[5]]))-22;
    ctx.lineTo(400,top);ctx.lineTo(0,top);ctx.closePath();
    for(const [l,ly,m,my,r,ry] of rims){
      const left=l+bootFit(pose,l,ly),right=r+bootFit(pose,r,ry);
      ctx.moveTo(left-30,top-1);ctx.lineTo(right+30,top-1);
      ctx.quadraticCurveTo(right+7,ry-10,right-1,ry+1);
      ctx.quadraticCurveTo(m+bootFit(pose,m,my),my+2,left+1,ly+1);
      ctx.quadraticCurveTo(left-7,ly-10,left-30,top-1);
      ctx.closePath();
    }
  }
  ctx.closePath();ctx.clip();
}

// Only the wave curling over the shoulder belongs in front of the garment.
const waveLocks={
  basic:'M218 86H247Q244 116 259 134Q274 163 259 185H248L217 140Z',
  pure:'M202 86H235Q226 113 251 141Q266 165 248 191H235L201 140Z',
  cute:'M204 84H239Q229 114 249 140Q262 170 252 191H237L203 140Z',
  chic:'M217 83H248Q243 103 258 119Q284 145 271 160L252 153L216 124Z',
  lively:'M206 80H240Q231 111 248 135Q261 166 249 179H233L203 140Z'
};

async function wardrobeLayer(key,data,loadImage,newCanvas,findItem){
  const [,type,id,pose,choice]=key.split(':');
  if(type==='knit')return knitLayer(id,pose,data,loadImage,newCanvas);
  if(type==='collar'){
    const garment=await loadImage('fitted:garment:'+id+':'+pose+':'+choice);
    return wornCollar(garment,id.split('-')[0],pose,newCanvas);
  }
  if(type==='boot-front'||type==='boot-back'){
    return bootLayer(await loadImage('fitted:nocturne:boots:'+id),id,type==='boot-front',newCanvas);
  }
  if(type==='locks'){
    const out=newCanvas(),c=out.getContext('2d');
    c.clip(new Path2D(waveLocks[id]));
    const mask=await loadImage(data.items.find(x=>x.id==='casual01-hair').variants[id]);
    const hair=findItem(pose);
    c.drawImage(hair?await loadImage(hair.variants[id]):await loadImage(data.base[id]),0,0);
    c.globalCompositeOperation='destination-in';c.drawImage(mask,0,0);
    return out;
  }
  if(type==='forearm'){
    const out=newCanvas(),c=out.getContext('2d');
    const paths={
      cute:'M121 183Q124 161 141 143L153 103Q157 84 174 80L186 86L187 106L180 118L169 127L157 179Q152 211 138 216Q124 218 121 201Z',
      lively:'M93 79H142L139 128L135 143L141 184L139 207L125 216L102 215L99 189L108 139L99 126Z'
    };
    c.clip(new Path2D(paths[id]));
    cleanWrist(c,await loadImage(data.base[id]),id==='cute'?154:117,149,75);
    return out;
  }
  if(type==='mini-hand'){
    const out=newCanvas(),c=out.getContext('2d');
    c.save();c.clip(new Path2D('M253 454L267 447Q277 453 288 475L276 482L250 477Z'));
    cleanWrist(c,await loadImage(data.base.mini),268,468,26);c.restore();return out;
  }
  if(type==='nocturne')return nocturneLayer(id,pose,loadImage,newCanvas,choice);
  if(type==='portrait')return portraitLayer(id,pose,data,loadImage,newCanvas);
  const layer=newCanvas(),ctx=layer.getContext('2d');
  if(type==='tucked'){
    const pants=await loadImage('fitted:garment:'+id+':'+pose+':'+choice);
    clipAtBoots(ctx,pose);
    ctx.drawImage(pants,0,0);
    return layer;
  }
  if(type==='garment'){
    const [style,part]=id.split('-');
    const [sx,sy,width,height,dx,dy]=wardrobeCrops[id][pose];
    const fittedTrousers=pose==='lively'&&(id==='track-bottom'||id==='suit-bottom');
    const sheet=await loadImage(fittedTrousers?'./artwork/lively-trousers-02.webp':'./artwork/atelier-'+part+'-01.webp');
    const patch=newCanvas(width,height),paint=patch.getContext('2d',{willReadFrequently:true});
    paint.drawImage(sheet,sx,sy,width,height,0,0,width,height);
    dyeWardrobe(paint,width,height,style,Number(choice));
    if(pose==='catalog')return patch;
    ctx.drawImage(patch,dx,dy);
    return layer;
  }
  const base=pose==='straight'?await loadImage('fitted:nocturne:arm:'+id):await loadImage(data.base[id]);
  if(type==='arms'||type==='hands'){
    ctx.clip(new Path2D((type==='arms'?wardrobeArms:wardrobeHands)[id]));
    ctx.drawImage(base,0,0);
  }else if(type==='base'){
    ctx.drawImage(base,0,0);
    const skirt=await loadImage(data.items.find(x=>x.id==='bottom-original').variants[id]);
    ctx.globalCompositeOperation='destination-out';
    for(const [x,y] of [[0,0],[2,0],[-2,0],[0,2],[0,-2],[4,0],[-4,0],[0,4],[0,-4],[3,3],[-3,3],[3,-3],[-3,-3]])ctx.drawImage(skirt,x,y);
  }
  return layer;
}
