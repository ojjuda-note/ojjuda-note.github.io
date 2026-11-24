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
async function wardrobeLayer(key,data,loadImage,newCanvas){
  const [,type,id,pose,choice]=key.split(':');
  const layer=newCanvas(),ctx=layer.getContext('2d');
  if(type==='garment'){
    const [style,part]=id.split('-');
    const [sx,sy,width,height,dx,dy]=wardrobeCrops[id][pose];
    const sheet=await loadImage('./artwork/atelier-'+part+'-01.webp');
    const patch=newCanvas(width,height),paint=patch.getContext('2d',{willReadFrequently:true});
    paint.drawImage(sheet,sx,sy,width,height,0,0,width,height);
    dyeWardrobe(paint,width,height,style,Number(choice));
    if(pose==='catalog')return patch;
    ctx.drawImage(patch,dx,dy);
    return layer;
  }
  const base=await loadImage(data.base[id]);
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
