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
    lively: [594, 0, 129, 347, 125, 206],
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
    lively: [591, 360, 126, 347, 126, 206],
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
// Registration on the original 400 × 656 artwork. Each row gives the source
// height, target height and sideways shift at a joint or shoe landmark.
const livelyLegFit=[
  [[198,202,-13],[302,306,-13],[350,354,-12],[414,416,-6],[477,474,1],[551,546,15],[656,651,15]],
  [[198,202,-13],[302,306,-13],[346,347,-20],[380,377,-32],[411,401,-39],[432,416,-35],[471,441,-29],[516,469,-22],[552,492,-21],[656,591,-13]]
];
function fitLivelyLegs(source,newCanvas,part){
  const result=newCanvas(),ctx=result.getContext('2d');
  if(part==='skirt'){
    ctx.drawImage(source,-15,-1);
    return result;
  }
  if(part==='pants'){
    // Feather the joint between the pelvis and thigh texture strips.
    const cloth=newCanvas(),paint=cloth.getContext('2d',{willReadFrequently:true});
    paint.drawImage(source,0,0);
    const region=paint.getImageData(132,283,148,41),data=region.data,original=data.slice();
    for(let x=5;x<143;x++){
      const seam=Math.round(15+(x-6)*.058),lo=seam-7,hi=seam+7;
      const a=(lo*148+x)*4,b=(hi*148+x)*4;
      if(original[a+3]<245||original[b+3]<245)continue;
      for(let y=lo+1;y<hi;y++){
        const i=(y*148+x)*4,w=(y-lo)/(hi-lo);
        if(original[i+3]<235)continue;
        for(let k=0;k<3;k++)data[i+k]=original[a+k]*(1-w)+original[b+k]*w;
      }
    }
    paint.putImageData(region,132,283);source=cloth;
    // Keep the waistband and the fly in one piece before the legs diverge.
    ctx.drawImage(source,0,194,400,109,-13,198,400,109);
  }
  for(const [side,anchors] of livelyLegFit.entries()){
    for(let section=1;section<anchors.length;section++){
      const [sy0,y0,dx0]=anchors[section-1],[sy1,y1,dx1]=anchors[section];
      for(let y=y0;y<y1;y++){
        if(part==='pants'&&y<307)continue;
        const t=(y-y0)/(y1-y0);
        let sy=sy0+(sy1-sy0)*t;
        if(part==='skin'&&(y<284||sy>559))continue;
        if(part==='shoes'&&sy<480)continue;
        // The donor's skirt covers the upper thighs. Extend exposed thigh
        // paint up beneath the lively skirt so every hem has full coverage.
        const bareThigh=part==='skin'&&sy<350;
        const growth=bareThigh?Math.min(1,(350-sy)/58):0;
        const split=sy<330?205:Math.min(253,205+(sy-330)*.30);
        const start=side?Math.round(split):100;
        const end=side?(part==='skin'&&sy<338?274:375):Math.round(split);
        // Cubic tangents keep the outside edge of the knee and calf continuous.
        const prev=anchors[Math.max(0,section-2)],next=anchors[Math.min(anchors.length-1,section+1)];
        const m0=(dx1-prev[2])*(y1-y0)/(y1-prev[1]);
        const m1=(next[2]-dx0)*(y1-y0)/(next[1]-y0);
        const dx=(1-t)*(1-t)*((1+2*t)*dx0+t*m0)+t*t*((3-2*t)*dx1+(t-1)*m1);
        if(bareThigh){
          const left=side?211:134, width=side?66:70;
          const shift=side?-18:-11;
          ctx.drawImage(source,left,350,width,1,left+dx+growth*shift,y,width+growth*8,1);
        }else ctx.drawImage(source,start,sy,end-start,1,start+dx,y,end-start,1);
      }
    }
  }
  return result;
}
async function livelyBody(data,loadImage,newCanvas){
  const [upper,donor]=await Promise.all([loadImage(data.base.lively),loadImage(data.base.chic)]);
  const body=fitLivelyLegs(donor,newCanvas,'skin'),ctx=body.getContext('2d');
  ctx.drawImage(upper,0,0,400,283,0,0,400,283);
  // The hand extends below the old hem and stays in its original position.
  ctx.drawImage(upper,265,283,68,50,265,283,68,50);
  return body;
}
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
  if(part==='boots'&&pose==='lively'){
    return fitLivelyLegs(await loadImage('fitted:nocturne:boots:chic'),newCanvas,'boots');
  }
  const [sx,sy,w,h,dx,dy]=nocturneCrops[part][pose];
  const sheet=await loadImage('./artwork/nocturne-01.webp');
  const out=pose==='catalog'?newCanvas(w,h):newCanvas();
  out.getContext('2d').drawImage(sheet,sx,sy,w,h,dx,dy,w,h);
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
const neckFit={
  basic:[206,113,1,0],pure:[198,114,.96,2],cute:[196,113,.98,3],
  chic:[213,109,1,9],lively:[194,112,.98,-4],mini:[205,369,.79,0]
};
function paintShoulders(ctx,pose){
  const [x,y,scale,tilt]=neckFit[pose];
  ctx.save();
  ctx.translate(x,y);
  ctx.transform(scale,tilt/104,0,scale,0,0);
  const silhouette=new Path2D('M-14 -12Q-13 -3 -20 0Q-28 4 -43 8Q-53 10 -57 21Q-62 35 -60 47L-45 58L-39 67L39 67L45 55L60 48Q61 33 55 18Q50 9 42 8Q23 4 15 -2L13 -12Z');
  const tone=ctx.createLinearGradient(-48,0,50,56);
  tone.addColorStop(0,'#f1bdad');tone.addColorStop(.19,'#ffe2d4');tone.addColorStop(.50,'#ffe6da');tone.addColorStop(.8,'#f7d5c6');tone.addColorStop(1,'#e7b7ac');
  ctx.fillStyle=tone;ctx.fill(silhouette);
  ctx.restore();
}
async function portraitLayer(pose,flags,data,loadImage,newCanvas){
  const straight=flags.includes('h'),dress=flags.includes('d'),boots=flags.includes('b');
  const baseKey=flags.includes('c')?'fitted:base:'+pose:pose==='lively'?'fitted:body:lively':data.base[pose];
  const original=await loadImage(baseKey),out=newCanvas(),ctx=out.getContext('2d');
  ctx.drawImage(original,0,0);
  if(straight){
    ctx.clearRect(0,0,out.width,pose==='mini'?514:245);
    ctx.drawImage(await loadImage('fitted:nocturne:head:'+pose),0,0);
  }
  ctx.globalCompositeOperation='destination-out';
  async function erase(item,offsets){
    const im=await loadImage(data.items.find(x=>x.id===item).variants[pose]);
    for(const [x,y] of offsets)ctx.drawImage(im,x,y);
  }
  if(straight&&flags.includes('c')){
    ctx.save();ctx.beginPath();ctx.rect(0,0,out.width,pose==='mini'?514:245);ctx.clip();
    await erase('bottom-original',[[0,0],[2,0],[-2,0],[0,2],[0,-2]]);
    ctx.restore();
  }
  if(dress)await erase('top-original',[[0,0],[-1,0],[1,0],[0,1]]);
  if(boots&&pose!=='lively')await erase('shoes-original',[[0,0],[-3,0],[3,0],[0,-3],[0,3]]);
  ctx.globalCompositeOperation='destination-over';
  if(dress)paintShoulders(ctx,pose);
  return out;
}

async function wardrobeLayer(key,data,loadImage,newCanvas){
  const [,type,id,pose,choice]=key.split(':');
  if(type==='nocturne')return nocturneLayer(id,pose,loadImage,newCanvas,choice);
  if(type==='portrait')return portraitLayer(id,pose,data,loadImage,newCanvas);
  const layer=newCanvas(),ctx=layer.getContext('2d');
  if(type==='garment'){
    const [style,part]=id.split('-');
    if(pose==='lively'&&part==='bottom'&&style!=='school'){
      const pants=await loadImage('fitted:garment:'+id+':chic:'+choice);
      return fitLivelyLegs(pants,newCanvas,'pants');
    }
    const [sx,sy,width,height,dx,dy]=wardrobeCrops[id][pose];
    const sheet=await loadImage('./artwork/atelier-'+part+'-01.webp');
    const patch=newCanvas(width,height),paint=patch.getContext('2d',{willReadFrequently:true});
    paint.drawImage(sheet,sx,sy,width,height,0,0,width,height);
    dyeWardrobe(paint,width,height,style,Number(choice));
    if(pose==='catalog')return patch;
    ctx.drawImage(patch,dx,dy);
    return layer;
  }
  if(type==='body'&&id==='lively')return livelyBody(data,loadImage,newCanvas);
  const base=type==='base'&&id==='lively'
    ?await loadImage('fitted:body:lively'):await loadImage(data.base[id]);
  if(type==='arms'||type==='hands'){
    ctx.clip(new Path2D((type==='arms'?wardrobeArms:wardrobeHands)[id]));
    ctx.drawImage(base,0,0);
  }else if(type==='base'){
    ctx.drawImage(base,0,0);
    if(id==='lively'){ctx.beginPath();ctx.rect(0,0,layer.width,283);ctx.clip();}
    const skirt=await loadImage(data.items.find(x=>x.id==='bottom-original').variants[id]);
    ctx.globalCompositeOperation='destination-out';
    for(const [x,y] of [[0,0],[2,0],[-2,0],[0,2],[0,-2],[4,0],[-4,0],[0,4],[0,-4],[3,3],[-3,3],[3,-3],[-3,-3]])ctx.drawImage(skirt,x,y);
  }
  return layer;
}
