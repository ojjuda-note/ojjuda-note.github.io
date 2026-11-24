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
    if(!skin[n]&&!skin[n-1]&&!skin[n+1]&&!skin[n-size]&&!skin[n+size])rgba[n*4+3]=0;
  }
  p.putImageData(im,0,0);ctx.drawImage(patch,left,top);
}
async function dressPortrait(ctx,pose,original,data,loadImage,newCanvas,straight){
  const mini=pose==='mini',{neck:[cx,cy],arms}=jointFit[pose];
  const saved=newCanvas();saved.getContext('2d').drawImage(ctx.canvas,0,0);
  const head=straight?await loadImage('fitted:nocturne:head:'+pose):original;
  ctx.clearRect(0,0,ctx.canvas.width,mini?495:319);
  if(!straight){
    // The hair mask keeps the original waves beyond the clipped face and hands.
    const waves=newCanvas();const w=waves.getContext('2d');
    w.drawImage(original,0,0);w.globalCompositeOperation='destination-in';
    w.drawImage(await loadImage(data.items.find(i=>i.id==='casual01-hair').variants[pose]),0,0);
    ctx.drawImage(waves,0,0);
  }
  paintShoulders(ctx,pose);
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
    const hand=index===0&&['cute','chic','lively'].includes(pose)?await loadImage('fitted:nocturne:arm:'+pose):saved;
    ctx.save();ctx.beginPath();ctx.moveTo(ax-wrist*nx,ay-wrist*ny);ctx.lineTo(ax+wrist*nx,ay+wrist*ny);
    ctx.lineTo(bx+fan*nx,by+fan*ny);ctx.lineTo(bx-fan*nx,by-fan*ny);ctx.closePath();ctx.clip();
    if(straight&&hand===saved)cleanWrist(ctx,hand,x,y,mini?44:69);
    else ctx.drawImage(hand,0,0);
    ctx.restore();
  }
}
function trimLegsAtBoots(ctx,pose){
  const split={basic:[210,383,383],pure:[209,383,383],cute:[204,380,375],
    chic:[219,379,378],mini:[205,520,520],lively:[188,383,364]}[pose];
  ctx.clearRect(0,split[1],split[0],ctx.canvas.height-split[1]);
  ctx.clearRect(split[0],split[2],ctx.canvas.width-split[0],ctx.canvas.height-split[2]);
}

async function portraitLayer(pose,flags,data,loadImage,newCanvas){
  const straight=flags.includes('h'),dress=flags.includes('d'),boots=flags.includes('b');
  const baseKey=flags.includes('c')?'fitted:base:'+pose:data.base[pose];
  const original=await loadImage(baseKey),out=newCanvas(),ctx=out.getContext('2d');
  ctx.drawImage(original,0,0);
  if(straight){
    ctx.clearRect(0,0,out.width,pose==='mini'?514:245);
    ctx.drawImage(await loadImage('fitted:nocturne:head:'+pose),0,0);
    // Only the side locks reach this far. Keep the thighs below the mini skirt.
    if(pose==='mini'){
      ctx.clearRect(166,497,81,17);
      ctx.drawImage(original,166,497,81,17,166,497,81,17);
    }
    if(pose==='lively'){
      ctx.clearRect(87,79,55,65);
      ctx.drawImage(await loadImage('fitted:nocturne:arm:lively'),87,79,55,65,87,79,55,65);
    }
  }
  ctx.globalCompositeOperation='destination-out';
  async function erase(item,offsets){
    const im=await loadImage(data.items.find(x=>x.id===item).variants[pose]);
    for(const [x,y] of offsets)ctx.drawImage(im,x,y);
  }
  if(straight&&flags.includes('c')){
    ctx.save();ctx.beginPath();ctx.rect(0,0,out.width,pose==='mini'?497:245);ctx.clip();
    await erase('bottom-original',[[0,0],[2,0],[-2,0],[0,2],[0,-2]]);
    ctx.restore();
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
    trimLegsAtBoots(ctx,pose);
  }
  ctx.globalCompositeOperation='source-over';
  if(dress)await dressPortrait(ctx,pose,original,data,loadImage,newCanvas,straight);
  if(flags.includes('s')){
    ctx.globalCompositeOperation='destination-over';paintSchoolArms(ctx,pose,newCanvas);
  }
  return out;
}

async function wardrobeLayer(key,data,loadImage,newCanvas){
  const [,type,id,pose,choice]=key.split(':');
  if(type==='nocturne')return nocturneLayer(id,pose,loadImage,newCanvas,choice);
  if(type==='portrait')return portraitLayer(id,pose,data,loadImage,newCanvas);
  const layer=newCanvas(),ctx=layer.getContext('2d');
  if(type==='tucked'){
    const pants=await loadImage('fitted:garment:'+id+':'+pose+':'+choice);
    // The shaft covers the pants below the cuff. Preserve the upper fabric
    // and remove the second outline that would otherwise run down the calf.
    const cuff={basic:383,pure:383,cute:378,chic:379,lively:383,mini:520}[pose];
    ctx.drawImage(pants,0,0,layer.width,cuff,0,0,layer.width,cuff);
    if(pose==='lively'){
      // The raised calf is nearly horizontal. End the fabric at its angled cuff.
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(150,340);
      ctx.lineTo(206,362);
      ctx.lineTo(layer.width,362);
      ctx.lineTo(layer.width,cuff);
      ctx.lineTo(185,cuff);
      ctx.lineTo(150,356);
      ctx.closePath();
      ctx.clip();
      ctx.clearRect(150,340,layer.width-150,cuff-340);
      ctx.restore();
    }
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
