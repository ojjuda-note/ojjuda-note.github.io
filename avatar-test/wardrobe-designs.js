// Fitting coordinates for the six female-r01 poses. Each top uses the same
// local drawing coordinates, while the trousers follow the individual legs.
const wardrobeFits = {
  basic:  {top:[206,116,1,1], pants:'M169 211Q205 218 242 211Q261 243 269 291Q269 334 245 400Q241 424 246 456Q252 487 235 550L209 552Q205 513 207 476L206 416L206 350Q205 396 205 421L205 485 201 552H176Q159 497 165 452L172 417Q165 373 143 312Q137 269 169 211Z'},
  pure:   {top:[201,117,.95,1.03], pants:'M173 215Q205 224 238 216Q260 251 270 308Q264 360 244 405Q240 430 245 461Q248 493 230 550H206L206 427 207 351 208 415 208 490 205 548H181Q163 487 169 447L176 414Q169 372 144 313Q146 263 173 215Z'},
  cute:   {top:[196,117,.90,1.02], pants:'M165 216 Q200 224 237 214 Q251 248 262 306 Q258 353 217 411 Q217 431 235 454 Q242 477 245 523 L221 539 Q210 509 205 483 L208 555 L181 557 Q162 508 162 478 Q161 446 166 420 Q156 368 139 311 Q140 272 165 216Z'},
  chic:   {top:[217,108,1,1.09], pants:'M174 206 Q206 215 239 208 Q262 244 271 313 Q281 383 287 411 Q301 461 327 549 L301 556 Q275 508 251 445 L203 329 Q204 382 199 422 Q197 459 200 554 L173 557 Q152 489 156 451 L161 419 Q163 388 141 314 Q129 264 174 206Z'},
  lively: {top:[194,114,.91,1.01], pants:'M157 212 Q192 221 225 210 Q251 246 250 297 Q249 327 197 359 Q220 363 245 372 L245 398 Q220 403 197 398 Q197 457 216 548 L187 554 Q160 489 160 418 Q160 404 148 397 Q131 389 140 365 Q145 350 143 340 L128 306 Q130 263 157 212Z'},
  mini:   {top:[204,369,.84,.67], pants:'M174 433 Q205 439 237 431 Q253 457 252 493 Q243 518 242 569 H218 Q210 545 207 507 Q204 540 196 569 H170 Q170 526 157 493 Q155 469 174 433Z'},
};
const wardrobeStyles = [
  {id:'track', name:'트레이닝복', top:'집업 트랙 재킷', bottom:'조거 팬츠', colors:[
    ['네이비','#3f557d','#eef1fb'], ['올리브','#66754d','#f3e8cd'], ['코랄','#af5261','#fff0e6']]},
  {id:'suit', name:'정장', top:'더블 버튼 블레이저', bottom:'테이퍼드 슬랙스', colors:[
    ['차콜','#424650','#eee9e8'], ['베이지','#b8987e','#fff5e5'], ['와인','#743b52','#ffedf0']]},
  {id:'school', name:'교복', top:'리본 세일러 블라우스', bottom:'세일러 플리츠 스커트', colors:[
    ['네이비','#354b76','#f5f3ef'], ['버건디','#783b53','#fff2e8'], ['포레스트','#3f6559','#f6f0df']]},
];

function wardrobeArt(style, part, pose, color) {
  const fit = wardrobeFits[pose];
  const [, fabric, trim] = color;
  const edge = '#262135';
  const outline = `stroke="${edge}" stroke-width="1.3" stroke-linejoin="round"`;
  const seam = `fill="none" stroke="${edge}" stroke-opacity=".42" stroke-width="1.6" stroke-linecap="round"`;
  const fill = 'fill="url(#fabric)"';
  let art;
  if (part === 'sleeves') {
    art=drawTrackSleeves(pose,trim,edge);
  } else if (part === 'top') {
    const [x,y,sx,sy] = fit.top;
    const body = {
      track: `<path ${fill} ${outline} d="M-27 3 -23-2 -17 13 Q0 25 18 13 L24-2 29 3 Q51 6 57 23 L61 44 42 52 36 44 Q39 59 34 72 L37 102 Q0 112-37 102 L-34 74 Q-39 61-38 46 L-45 52-65 46-60 23 Q-56 7-27 3Z"/>
        <path fill="${trim}" opacity=".85" d="M-47 13-52 18-58 43-53 45-46 22-40 10ZM45 12 50 17 57 42 52 44 46 23 40 10Z"/>
        <path fill="${edge}" opacity=".31" d="M-35 53q8 11 24 12l-17 5 10 5q-13-3-17-8zm68 5q-7 8-16 12l10-1-4 7 11-8z"/><path fill="${trim}" opacity=".88" d="M12 36h11l-2 3H11zm1 5h6l-2 2h-5z"/><path fill="none" stroke="${trim}" stroke-width="2" d="M0 22V105 M-29 78l18 7m40-7-18 7"/><path ${seam} d="M-36 95Q0 104 36 95"/><path stroke="${trim}" stroke-width="3" d="M3 24v8"/>`,
      suit: `<path ${fill} ${outline} d="M-27 1Q-49 0-58 15L-66 43-43 52-38 43Q-39 62-34 75L-44 109Q-24 115-3 106Q18 116 42 106L34 74 39 47 45 52 62 43 56 17Q51 4 27 1L0 49Z"/>
        <path fill="${trim}" d="M-23 3 0 49 25 3Q4 24-23 3Z"/>
        <path fill="${fabric}" ${outline} d="M-27 1-14 19-20 27 0 56-28 36-38 17ZM27 1 38 17 29 37-4 70 18 35 12 26Z"/>
        <path fill="${tint(fabric,-26)}" d="M-34 77l19 3-2 4-18-2zm49-1 18-3 1 5-18 3z"/><path fill="${trim}" d="M18 42l8-5 4 4-2 1z"/><path ${seam} d="M-34 79h18m31 0h18M-3 69l-3 34"/><g fill="${trim}"><circle cx="-10" cy="65" r="2"/><circle cx="8" cy="65" r="2"/><circle cx="-12" cy="82" r="2"/><circle cx="6" cy="82" r="2"/></g>`,
      school: `<path fill="url(#ivory)" ${outline} d="M-28 2Q-52 2-59 20L-64 44-43 52-38 42Q-42 56-34 75L-32 103Q0 110 34 103L34 74Q41 62 38 44L43 52 62 44 55 18Q50 3 28 2L0 27Z"/>
        <path ${fill} ${outline} d="M-26 0-44 3-37 26 0 54 38 25 45 4 27 0Q19 21 0 23-18 21-26 0Z"/>
        <path fill="none" stroke="${trim}" stroke-width="1.6" d="M-40 5-33 24 0 48 34 23 41 6M-63 41l20 8m86 0 18-8"/>
        <path fill="#a93758" ${outline} d="M0 48Q-24 32-23 46Q-25 58-5 54L-15 75-6 72 0 56 8 74 17 76 6 54Q26 59 24 44Q20 33 0 48Z"/>`,
    };
    art = `<g transform="translate(${x} ${y}) scale(${sx} ${sy})">${body[style]}</g>`;
    if (pose==='cute' || pose==='lively') {
      const arm = pose==='cute'
        ? 'M147 138Q154 120 166 111L165 128 154 168Q150 188 139 199L133 182 139 156Z'
        : 'M127 149 120 133 117 150Q118 171 123 191Q128 202 138 190L144 176 137 157Z';
      art = `<defs><mask id="arm"><rect width="400" height="656" fill="white"/><path d="${arm}"/></mask></defs><g mask="url(#arm)">${art}</g>`;
    }
    if(style==='track')art=drawTrackSleeves(pose,trim,edge)+art;
  } else {
    const details = trouserDetails[pose];
    const [x,y,sx,sy]=fit.top;
    const sport=style==='track';
    const waist = '<g transform="translate('+x+' '+y+') scale('+sx+' '+sy+')"><path d="M-37 94Q0 104 37 94L39 108Q0 119-40 108Z" fill="'+edge+'" opacity=".4"/>'+
      (sport?'<path d="M-35 101Q0 109 35 101M0 105q-12-7-10 0t10 0q13-7 10 0t-10 0l-4 12m4-12 5 12" fill="none" stroke="'+trim+'" stroke-width="1.5"/>':
       '<path d="M-38 103Q0 113 37 103" fill="none" stroke="'+edge+'" stroke-width="5"/><rect x="-5" y="103" width="10" height="7" rx="1" fill="none" stroke="'+trim+'" stroke-width="1.6"/>')+'</g>';
    const seams=sport?details.stripe:details.crease;
    art = '<path '+fill+' '+(sport?'stroke="'+tint(fabric,-26)+'" stroke-width="5" stroke-linejoin="round"':outline)+' d="'+fit.pants+'"/><clipPath id="legs"><path d="'+fit.pants+'"/></clipPath>'+
      '<g clip-path="url(#legs)"><path d="'+details.crease+'" fill="none" stroke="'+edge+'" stroke-width="13" opacity=".15"/>'+
      '<path d="'+seams+'" fill="none" stroke="'+trim+'" stroke-width="'+(sport?4:1.3)+'" opacity="'+(sport?.88:.47)+'"/>'+
      (sport?'<path d="'+seams+'" transform="translate(4 0)" fill="none" stroke="'+trim+'" stroke-width="1.4" opacity=".8"/><path d="'+details.cuffs+'" stroke="'+edge+'" stroke-width="13" opacity=".65"/>':'')+
      waist+'</g>';
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="656" viewBox="0 0 400 656"><defs><linearGradient id="fabric"><stop stop-color="${edge}"/><stop offset=".19" stop-color="${fabric}"/><stop offset=".31" stop-color="${tint(fabric,30)}"/><stop offset=".48" stop-color="${fabric}"/><stop offset=".55" stop-color="${tint(fabric,-20)}"/><stop offset=".73" stop-color="${tint(fabric,17)}"/><stop offset="1" stop-color="${tint(fabric,-36)}"/></linearGradient><linearGradient id="ivory"><stop stop-color="${tint(trim,-44)}"/><stop offset=".24" stop-color="${trim}"/><stop offset=".56" stop-color="${tint(trim,-12)}"/><stop offset=".76" stop-color="${trim}"/><stop offset="1" stop-color="${tint(trim,-37)}"/></linearGradient></defs>${art}</svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function registerWardrobeDesigns(catalog,approvedLooks,casual,poses) {
  for (const design of wardrobeStyles) {
    for (const part of ['top','bottom']) {
      design.colors.forEach((color, index) => {
        const group = design.id + '-' + part;
        catalog.push({
          id: group + '-' + index, category: part, design: group,
          name: design[part], tailored:part==='bottom'&&design.id!=='school'?'pants':design.id, colorName: color[0], swatch: color[1],
          variants: Object.fromEntries(poses.map(pose => [pose, design.id==='school'&&part==='bottom'?'fitted:skirt:'+pose+':'+index:wardrobeArt(design.id, part, pose, color)])),
        });
      });
    }
    approvedLooks.push({...casual, bag:null, name:design.name, bg:2,
      top:design.id+'-top-0', bottom:design.id+'-bottom-0'});
  }
}

function tint(hex, amount) {
  const rgb=[1,3,5].map(i=>Math.max(0,Math.min(255,parseInt(hex.slice(i,i+2),16)+amount)));
  return 'rgb('+rgb.join(',')+')';
}

// Stitching and ankle ribbing follow each original leg, including the raised foot.
const trouserDetails = {
  basic:{stripe:'M160 229Q135 278 149 319T177 416Q159 472 181 549 M249 231Q270 286 261 330T238 421Q252 468 230 548',crease:'M185 231Q178 283 186 339L192 414 184 487 189 550 M224 231Q242 283 229 348L221 418 228 475 222 549',cuffs:'M169 548L205 549 M207 549L239 548'},
  pure:{stripe:'M164 238Q140 282 151 321L180 415Q164 477 186 548 M246 234Q274 293 261 331L237 415Q250 470 225 548',crease:'M187 235Q177 300 191 352L195 419 188 479 192 550 M222 234Q247 285 232 351L219 419 228 475 216 550',cuffs:'M176 546L207 545 M205 548L234 546'},
  cute:{stripe:'M155 235Q135 286 150 337L171 415Q153 467 186 551 M243 229Q263 294 250 335L211 410Q237 463 239 524',crease:'M178 235Q165 301 182 364L185 425 178 475 193 553 M221 233Q242 290 220 359L195 414Q214 462 234 527',cuffs:'M177 553L210 552 M216 537L248 523'},
  chic:{stripe:'M163 224Q133 267 147 324L168 415Q151 474 179 552 M246 226Q272 304 275 373Q284 446 323 549',crease:'M184 230Q172 293 181 348L183 410 173 462 187 553 M222 231Q244 305 257 363L271 418 289 484 314 553',cuffs:'M171 554L202 551 M299 554L330 546'},
  lively:{stripe:'M151 225Q123 279 139 317L152 349 M161 395Q156 455 190 549 M231 224Q258 273 241 310Q228 341 188 362Q211 375 244 377',crease:'M178 226Q155 276 158 329L153 377Q176 425 177 469L198 551 M207 231Q234 272 218 312L158 381Q190 392 244 385',cuffs:'M182 553L218 546 M241 369L242 400'},
  mini:{stripe:'M168 439Q151 462 164 507L174 567 M242 439Q259 471 244 512L237 568',crease:'M186 441Q177 476 185 502L184 568 M224 441Q235 469 224 511L228 568',cuffs:'M166 568H200 M214 568H248'}
};

const wardrobeArms={
  pure:'M128 157L155 159Q166 204 187 254L204 294Q212 272 220 240L235 170L254 163Q246 226 233 266L220 307Q220 337 199 333Q189 333 187 313L175 277Q149 234 128 157Z',
  cute:'M145 104L171 104Q164 133 156 163Q154 198 142 214L129 217Q123 187 129 152Z',
  chic:'M87 171L102 167Q120 203 145 217L164 214L184 226L195 239L184 244Q167 237 148 243Q117 240 89 203Z',
  lively:'M102 126L131 121Q136 153 144 179L144 205L132 216L109 216Q103 193 102 162Z'
};

async function wardrobeLayer(key,data,loadImage,newCanvas) {
  const [,part,pose,choice]=key.split(':');
  const layer=newCanvas(), ctx=layer.getContext('2d',{willReadFrequently:true});
  const base=await loadImage(data.base[pose]);
  if(part==='sleeves'){
    return loadImage(wardrobeArt('track','sleeves',pose,wardrobeStyles[0].colors[Number(choice)]));
  }
  if(part==='arms'){
    ctx.clip(new Path2D(wardrobeArms[pose]));
    ctx.drawImage(base,0,0);
    return layer;
  }
  const skirt=await loadImage(data.items.find(x=>x.id==='bottom-original').variants[pose]);
  if(part==='base'){
    ctx.drawImage(base,0,0);
    // The original cutout leaves a fine fringe around the old skirt.
    ctx.globalCompositeOperation='destination-out';
    for(const [x,y] of [[0,0],[2,0],[-2,0],[0,2],[0,-2],[2,2],[-2,2]])ctx.drawImage(skirt,x,y);
    return layer;
  }
  ctx.drawImage(skirt,0,0);
  const pixels=ctx.getImageData(0,0,layer.width,layer.height), rgba=pixels.data;
  const [,fabric,trim]=wardrobeStyles.find(style=>style.id==='school').colors[Number(choice)];
  const color=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const cloth=color(fabric), piping=color(trim), width=layer.width, height=layer.height;
  const hem=new Int16Array(width).fill(-1);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    if(rgba[(y*width+x)*4+3]>120)hem[x]=y;
  }
  const spacing=pose==='mini'?5:8;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;
    if(!rgba[i+3])continue;
    const light=Math.min(1.85,(rgba[i]*.25+rgba[i+1]*.60+rgba[i+2]*.15+12)/72);
    const d=hem[x]-y;
    const band=Math.abs(d-spacing)<1.35||Math.abs(d-spacing*1.9)<.8;
    for(let k=0;k<3;k++)rgba[i+k]=band?piping[k]*(.64+.24*light):cloth[k]*light;
  }
  ctx.putImageData(pixels,0,0);
  return layer;
}

// Sleeve outlines, piping and cuffs share the same registration as the original arms.
const trackSleeves = {
  basic:[
    ['M142 154Q157 155 171 164L164 215Q163 231 152 246L122 298L104 290Q121 249 135 219Z','M148 162L145 217Q132 249 110 288','M105 287l18 7'],
    ['M242 166L265 155L271 215Q289 262 304 292L289 300Q264 265 246 225Z','M259 162L264 216Q281 259 297 289','M287 296l17-7']],
  pure:[
    ['M133 158L157 153L178 211L203 293L186 300Q166 266 154 227Z','M141 163L163 220L190 289','M185 293l17-7'],
    ['M230 162L256 160L248 217L225 299L207 295Q218 260 222 217Z','M249 166L242 214L220 291','M207 291l18 5']],
  cute:[
    ['M129 156Q141 153 152 159L148 180Q153 147 160 124L179 129L165 194Q159 216 146 214Q130 212 131 190Z','M136 162Q134 206 146 208Q155 208 158 189L174 135','M158 129l20 6'],
    ['M230 163L254 158L257 217Q264 253 285 292L272 306Q243 267 234 230Z','M249 164L250 216Q258 254 279 292','M268 298l17-10']],
  chic:[
    ['M135 132L160 149Q137 170 113 190Q130 209 154 222L146 241Q110 225 89 201Q81 188 92 175Z','M137 143L98 180Q89 189 102 201L142 231','M143 237l10-17'],
    ['M242 154L265 158L265 216Q272 251 286 294L272 303Q251 265 244 226Z','M259 165L257 217Q265 258 281 292','M269 298l17-8']],
  lively:[
    ['M135 154L154 163L142 198Q132 221 117 218Q103 214 105 197L118 137L138 141L128 184Z','M145 164L133 198Q123 218 114 204L123 147','M116 142l21 4'],
    ['M230 158L254 158L258 217Q270 257 288 292L276 305Q247 266 236 229Z','M247 164L252 218Q264 257 282 290','M273 299l17-10']],
  mini:[
    ['M155 398L175 404Q170 432 150 456L136 452Q150 428 151 414Z','M158 405Q156 426 142 450','M136 450l15 5'],
    ['M237 403L256 398L263 427L275 453L260 459Q239 433 237 417Z','M250 404Q253 429 269 451','M258 456l17-5']]
};

function drawTrackSleeves(pose,trim,edge){
  return trackSleeves[pose].map(([outline,piping,cuff])=>
    '<path d="'+outline+'" fill="url(#fabric)" stroke="'+edge+'" stroke-width="1.1" stroke-linejoin="round"/>'+
    '<path d="'+piping+'" fill="none" stroke="'+trim+'" stroke-width="2.5" stroke-linecap="round"/>'+
    '<path d="'+cuff+'" fill="none" stroke="'+edge+'" stroke-width="5" opacity=".82"/>'
  ).join('');
}
