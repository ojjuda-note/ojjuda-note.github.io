// Procedural artwork for 바람의 궁수. All coordinates are CSS pixels.
// Distant art and tree sprites are cached; world scenery follows the camera.
const layers = new Map();
const TAU = Math.PI * 2;

// Wind is the same signed value used for the arrow's horizontal acceleration.
// A leaf never drifts against that direction; flutter only changes its tilt.
const wrap = (value, span) => ((value % span) + span) % span;
const safeWind = wind => Number.isFinite(wind) ? wind : 0;
export const windLeafCount = wind => 6 + Math.round(Math.min(1, Math.abs(safeWind(wind)) / 1.35) * 14);

/** Deterministic, frame-rate independent leaf motion in CSS pixels. */
export function windLeafAt(index, time, w, h, wind = 0) {
  const depth = .55 + wrap(index * .381966, 1) * .45;
  const scale = Math.min(w, h);
  const vx = safeWind(wind) * scale * .10 * depth;
  const vy = scale * .017 * depth;
  const margin = 12;
  const spanX = w + margin * 2, spanY = h * .78 + margin * 2;
  return {
    x: wrap((index * .618034 + .13) * spanX + time * vx, spanX) - margin,
    y: wrap((index * .414214 + .07) * spanY + time * vy, spanY) - margin,
    vx, vy,
    rotation: Math.atan2(vy, vx) + Math.sin(time * (1.8 + index % 3 * .35) + index) * .16,
    radius: (3 + depth * 2.5) * Math.max(.7, Math.min(1, scale / 600)),
    depth
  };
}

function rng(seed = 11827) {
  let n = seed >>> 0;
  return () => ((n = Math.imul(1664525, n) + 1013904223 >>> 0) / 4294967296);
}
function ellipse(ctx, x, y, rx, ry, fill, rotation = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), rotation, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}
function line(ctx, x, y, x2, y2, color, width = 1) {
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function shape(ctx, points, fill) {
  ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}

function pine(ctx, x, base, height, width, palette, seed = 1) {
  const rand = rng(seed), top = base - height;
  ctx.fillStyle = palette.trunk;
  ctx.beginPath(); ctx.moveTo(x - width * .035, base); ctx.lineTo(x - width * .012, top + height * .25);
  ctx.lineTo(x + width * .018, top + height * .25); ctx.lineTo(x + width * .045, base); ctx.fill();
  for (let i = 5; i >= 0; i--) {
    const y = top + height * (.13 + i * .125), span = width * (.12 + i * .075);
    ctx.beginPath(); ctx.moveTo(x, y - height * .16);
    ctx.bezierCurveTo(x - span * .27, y - height * .055, x - span * .68, y + height * .01, x - span, y + height * .09);
    ctx.quadraticCurveTo(x - span * .6, y + height * .115, x - span * .17, y + height * .076);
    ctx.quadraticCurveTo(x + span * .5, y + height * .115, x + span * (1.02 + rand() * .08), y + height * .075);
    ctx.bezierCurveTo(x + span * .54, y + height * .01, x + span * .19, y - height * .06, x, y - height * .16);
    ctx.fillStyle = i % 2 ? palette.dark : palette.mid; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y - height * .15);
    ctx.bezierCurveTo(x - span * .1, y - height * .035, x + span * .18, y + height * .04, x + span * .7, y + height * .071);
    ctx.quadraticCurveTo(x + span * .24, y + height * .06, x, y + height * .03);
    ctx.closePath(); ctx.fillStyle = palette.light; ctx.fill();
  }
}

function broadleaf(ctx, x, base, height, width, palette, seed = 1) {
  const rand = rng(seed), cy = base - height * .72;
  ctx.lineCap = 'round';
  line(ctx, x, base, x + width * .015, cy, palette.trunk, Math.max(1, width * .095));
  line(ctx, x, base - height * .33, x - width * .25, cy - height * .05, palette.trunk, Math.max(1, width * .045));
  line(ctx, x, base - height * .43, x + width * .23, cy - height * .07, palette.trunk, Math.max(1, width * .035));
  for (let i = 0; i < 13; i++) {
    const angle = i * 2.4, radius = i < 6 ? .26 : .14;
    const dx = Math.cos(angle) * width * radius, dy = Math.sin(angle) * height * .12;
    ellipse(ctx, x + dx, cy + dy, width * (.25 + rand() * .1), height * (.13 + rand() * .07), i % 3 ? palette.mid : palette.dark, angle * .06);
  }
  for (let i = 0; i < 9; i++) {
    const dx = (rand() - .35) * width * .65, dy = -height * .13 + rand() * height * .18;
    ellipse(ctx, x + dx, cy + dy, width * (.1 + rand() * .09), height * (.045 + rand() * .045), palette.light, -.25);
  }
  line(ctx, x + width * .023, base - 1, x + width * .03, base - height * .35, palette.bark || '#b4aa78', Math.max(.5, width * .016));
}

const forestPalettes = [
  {trunk:'#719886', dark:'#83ad95', mid:'#91b79e', light:'#a7c6aa'},
  {trunk:'#5f7f62', dark:'#547f65', mid:'#638e6c', light:'#83a77b'},
  {trunk:'#685d3e', dark:'#325d49', mid:'#456e50', light:'#769163', bark:'#9d9564'},
  {trunk:'#514e35', dark:'#294d3b', mid:'#385b41', light:'#63845a', bark:'#958661'}
];

function makeLayer(width, height, ratio = 1) {
  const canvas = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(Math.ceil(width * ratio), Math.ceil(height * ratio))
    : Object.assign(document.createElement('canvas'), {width:Math.ceil(width * ratio), height:Math.ceil(height * ratio)});
  const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
  return {canvas,ctx};
}

// The distant forest is a fixed image with generous overscan. Moving a camera
// translates/scales that image; it never allocates a new forest every frame.
function buildBackdrop(w, h) {
  const ratio = Math.min(1.5, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
  const {canvas,ctx} = makeLayer(w * 2, h * 1.6, ratio);
  const ox = w * .5, oy = h * .3, horizon = h * .405, rand = rng(7321);
  ctx.translate(ox,oy);
  const sky = ctx.createLinearGradient(0,-oy,0,horizon+h*.18);
  sky.addColorStop(0,'#c5e3dd'); sky.addColorStop(.65,'#e2ecdc'); sky.addColorStop(1,'#f0edcf');
  ctx.fillStyle=sky;ctx.fillRect(-ox,-oy,w*2,h*1.6);
  const sunx=w*.735,suny=Math.max(28,horizon*.21);
  const sun=ctx.createRadialGradient(sunx,suny,2,sunx,suny,Math.min(w,h)*.29);
  sun.addColorStop(0,'rgba(255,252,215,.8)');sun.addColorStop(.23,'rgba(255,250,220,.25)');sun.addColorStop(1,'rgba(255,250,220,0)');
  ctx.fillStyle=sun;ctx.fillRect(-ox,-oy,w*2,h*1.6);
  ellipse(ctx,sunx,suny,Math.min(w,h)*.034,Math.min(w,h)*.034,'rgba(255,252,227,.88)');
  for(let i=0;i<3;i++)shape(ctx,[{x:sunx-5+i*12,y:suny},{x:w*(.12+i*.16),y:h},{x:w*(.23+i*.19),y:h},{x:sunx+5+i*12,y:suny}],'rgba(255,250,220,.045)');
  for(let layer=0;layer<3;layer++){
    const y=horizon-h*(.115-layer*.035);
    ctx.beginPath();ctx.moveTo(-ox,horizon+60);ctx.lineTo(-ox,y+20);
    ctx.bezierCurveTo(-w*.28,y-35,-w*.12,y-12,w*.08,y+6);
    ctx.bezierCurveTo(w*.17,y-45,w*.22,y-12,w*.32,y+3);
    ctx.bezierCurveTo(w*.45,y-50+layer*13,w*.62,y-18,w*.71,y+6);
    ctx.bezierCurveTo(w*.85,y-43,w*1.05,y-26,w*1.1,y+27);
    ctx.bezierCurveTo(w*1.22,y-40,w*1.37,y-15,w*1.5,y+20);
    ctx.lineTo(w*1.5,horizon+60);ctx.closePath();ctx.fillStyle=['#b7cfbb','#a5c5ad','#94b8a0'][layer];ctx.fill();
  }
  for(let i=0;i<100;i++){
    const x=i/99*w*2-ox,edge=Math.min(1,Math.abs(x/w-.5)*2);
    const height=h*(.037+rand()*.045+edge*.055);
    pine(ctx,x,horizon+h*.028+rand()*10,height,height*.55,forestPalettes[0],i+20);
  }
  const mist=ctx.createLinearGradient(0,horizon-45,0,horizon+35);
  mist.addColorStop(0,'rgba(224,235,212,0)');mist.addColorStop(.6,'rgba(224,235,212,.28)');mist.addColorStop(1,'rgba(224,235,212,0)');
  ctx.fillStyle=mist;ctx.fillRect(-ox,horizon-45,w*2,80);
  return {canvas,ox,oy,horizon};
}

const worldTrees = [
  {z:245,x:20,height:15,width:8,palette:0},
  {z:180,x:17,height:14,width:7,palette:0},
  {z:125,x:15,height:13,width:7,palette:0},
  {z:90,x:14,height:13,width:7,palette:0},
  {z:65,x:18,height:13,width:7,palette:0},
  {z:47,x:12,height:12,width:6,palette:1},
  {z:34,x:9.7,height:12.5,width:6.4,palette:1},
  {z:25,x:8.2,height:10,width:4.6,palette:2},
  {z:16,x:6.8,height:9,width:4.5,palette:2},
  {z:7,x:4.8,height:5,width:3.7,palette:3}
];
const treeSprites = new Map();
function getTreeSprite(index,side) {
  const key=index*2+(side===1?1:0);
  if(treeSprites.has(key))return treeSprites.get(key);
  const tree=worldTrees[index], unit=360/tree.height;
  const sw=Math.ceil(tree.width*unit*1.45+12),sh=396,base=382;
  const {canvas,ctx}=makeLayer(sw,sh);
  if((index+(side===1?1:0))%3===0) broadleaf(ctx,sw/2,base,360,tree.width*unit,forestPalettes[tree.palette],50+index*3+side);
  else pine(ctx,sw/2,base,360,tree.width*unit,forestPalettes[tree.palette],70+index*4+side);
  const sprite={canvas,sw,sh,base,unit};treeSprites.set(key,sprite);return sprite;
}

// Generated once in world coordinates, so grass/gravel move with the camera.
const meadow=(()=>{
  const random=rng(24891),gravel=[],grass=[];
  for(let i=0;i<360;i++)gravel.push({x:(random()-.5)*3.2,z:2+random()*285,size:.015+random()*.022,rotation:random(),light:i%3===0});
  for(let i=0;i<460;i++){
    const sign=i%2?-1:1;
    grass.push({x:sign*(2.18+random()*28),z:2+random()*285,height:.05+random()*.12,bend:(random()-.5)*.07,flower:i%13===0,light:i%3===0});
  }
  return {gravel,grass};
})();

function drawGround(ctx,w,h,camera,project) {
  const horizon=camera.horizon, near=camera.z+.2;
  const groundTop=Math.max(0,Math.min(h,horizon));
  const grass=ctx.createLinearGradient(0,groundTop,0,Math.max(groundTop+1,h));
  grass.addColorStop(0,'#a2b78a');grass.addColorStop(.35,'#87a275');grass.addColorStop(1,'#668957');
  ctx.fillStyle=grass;ctx.fillRect(0,groundTop,w,h-groundTop);
  // Clip each strip in world space before perspective division. This also lets
  // the range continue under the camera when an arrow overshoots the target.
  const depths=[600,400,285,200,145,105,80,55,38,26,18,12,8,5,3,1.7,0];
  for(let i=0;i<depths.length-1;i++){
    const far=depths[i],close=Math.max(depths[i+1],near);
    if(far<=close)continue;
    shape(ctx,[project({x:-1.8,y:0,z:far}),project({x:1.8,y:0,z:far}),project({x:1.8,y:0,z:close}),project({x:-1.8,y:0,z:close})],i%2?'#c9bd97':'#cec19c');
    for(const side of[-1,1])shape(ctx,[project({x:side*1.8,y:.015,z:far}),project({x:side*2.05,y:.015,z:far}),project({x:side*2.05,y:.015,z:close}),project({x:side*1.8,y:.015,z:close})],'rgba(88,112,61,.22)');
  }
  for(const stone of meadow.gravel){
    if(stone.z<=near)continue;
    const p=project({x:stone.x,y:.012,z:stone.z});
    if(!p.visible||p.x<-5||p.x>w+5||p.y>h+5||p.y<0)continue;
    const size=Math.min(3.3,p.scale*stone.size);
    ellipse(ctx,p.x,p.y,size*1.7,size*.38,stone.light?'rgba(245,231,187,.56)':'rgba(119,111,82,.22)',stone.rotation);
  }
  for(const blade of meadow.grass){
    if(blade.z<=near)continue;
    const p=project({x:blade.x,y:0,z:blade.z});
    if(!p.visible||p.x<-8||p.x>w+8||p.y<0||p.y>h+14)continue;
    const length=Math.min(24,blade.height*p.scale);if(length<.8)continue;
    const bend=blade.bend*p.scale;
    ctx.strokeStyle=blade.light?'rgba(194,205,131,.55)':'rgba(55,92,49,.43)';ctx.lineWidth=Math.min(1.6,.6+p.scale*.002);
    ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.quadraticCurveTo(p.x+length*.2,p.y-length*.6,p.x+bend,p.y-length);ctx.stroke();
    if(blade.flower)ellipse(ctx,p.x+bend,p.y-length,Math.min(2,length*.16),Math.min(1.5,length*.12),'#f0e7b5');
  }
}

function drawWorldTrees(ctx,w,h,camera,project) {
  for(let index=0;index<worldTrees.length;index++){
    const tree=worldTrees[index];if(tree.z<=camera.z+.2)continue;
    for(const side of[-1,1]){
      const p=project({x:side*tree.x,y:0,z:tree.z});
      if(!p.visible)continue;
      const treeW=tree.width*p.scale,treeH=tree.height*p.scale;
      if(p.x+treeW*.8<0||p.x-treeW*.8>w||p.y<0||p.y-treeH>h)continue;
      const sprite=getTreeSprite(index,side),scale=p.scale/sprite.unit;
      ellipse(ctx,p.x,p.y+2,treeW*.58,Math.max(2,treeW*.08),'rgba(43,73,43,.14)');
      ctx.drawImage(sprite.canvas,p.x-sprite.sw*.5*scale,p.y-sprite.base*scale,sprite.sw*scale,sprite.sh*scale);
    }
  }
}

/** Draw the sunlit range. camera.horizon is always a CSS-pixel coordinate. */
export function drawScenery(ctx,w,h,options={}) {
  if(!(w>0&&h>0))return;
  const baseFocal=Math.min(w*1.08,h*1.5),input=options.camera||{};
  const camera={x:0,y:1.65,z:0,cx:w/2,horizon:h*.405,focal:baseFocal,...input};
  const project=options.project||((p)=>{const depth=Math.max(.2,p.z-camera.z),scale=camera.focal/depth;return {x:camera.cx+(p.x-camera.x)*scale,y:camera.horizon-(p.y-camera.y)*scale,scale,visible:p.z>camera.z+.2};});
  const key=[Math.round(w),Math.round(h)].join(':');let backdrop=layers.get(key);
  if(!backdrop){backdrop=buildBackdrop(w,h);layers.set(key,backdrop);if(layers.size>2)layers.delete(layers.keys().next().value);}
  ctx.save();ctx.fillStyle='#c5e3dd';ctx.fillRect(0,0,w,h);
  const zoom=Math.max(.4,Math.min(2.5,camera.focal/baseFocal));
  // Distant scenery has small parallax, while nearby objects use full world
  // projection. Overscan covers normal aiming pans and the eased chase view.
  const dx=camera.cx-w*.5*zoom-camera.x*camera.focal/350;
  const dy=camera.horizon-backdrop.horizon*zoom-(camera.y-1.65)*camera.focal/350;
  ctx.drawImage(backdrop.canvas,dx-backdrop.ox*zoom,dy-backdrop.oy*zoom,w*2*zoom,h*1.6*zoom);
  drawGround(ctx,w,h,camera,project);drawWorldTrees(ctx,w,h,camera,project);
  const maxDistance=Math.max(20,Number(options.stage?.distance)||40);
  for(let z=80;z>=10;z-=10){
    if(z>maxDistance+5||z<=camera.z+.2)continue;
    const p=project({x:-2.52,y:0,z}),markerH=Math.min(58,p.scale*.48),markerW=Math.min(44,p.scale*.6);
    if(!p.visible||p.x<8||p.x>w-8||p.y>h-10||p.y<0||markerW<9)continue;
    line(ctx,p.x,p.y,p.x,p.y-markerH,'#77714c',Math.min(4,Math.max(1.5,p.scale*.034)));
    ctx.fillStyle='#ece3c4';ctx.fillRect(p.x-markerW/2,p.y-markerH,markerW,markerH*.48);
    ctx.fillStyle='#4f674b';ctx.font=`600 ${Math.max(6,markerW*.25)}px system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(`${z}m`,p.x,p.y-markerH*.76);
  }
  const time=Number(options.time)||0,wind=Number(options.stage?.wind)||0;
  for(let i=0;i<windLeafCount(wind);i++){
    const leaf=windLeafAt(i,time,w,h,wind),r=leaf.radius;
    ctx.save();ctx.translate(leaf.x,leaf.y);ctx.rotate(leaf.rotation);ctx.globalAlpha=.40+leaf.depth*.22;
    ctx.beginPath();ctx.moveTo(-r,0);ctx.quadraticCurveTo(-r*.12,-r*.88,r,0);ctx.quadraticCurveTo(-r*.12,r*.72,-r,0);
    ctx.fillStyle=i%3?'#d8d698':'#b8c18a';ctx.fill();line(ctx,-r*1.45,0,r*.68,0,'#7a8b59',.7);ctx.restore();
  }
  const vignette=ctx.createRadialGradient(w*.5,h*.47,Math.min(w,h)*.25,w*.5,h*.47,Math.max(w,h)*.8);
  vignette.addColorStop(0,'rgba(16,47,34,0)');vignette.addColorStop(1,'rgba(16,47,34,.13)');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
  ctx.restore();
}

/** Friendly, readable moving woodland targets. radius is the visual scale. */
export function drawAnimal(ctx,x,y,radius,kind,time=0) {
  const r=Math.max(1,radius);
  ctx.save(); ctx.translate(x,y); ctx.scale(r,r);
  ctx.lineCap='round'; ctx.lineJoin='round';
  if(kind==='bird') {
    ctx.translate(0,.18); ctx.scale(1,.8);
    const flap=Math.sin(time*8.5), lift=.25+flap*.65;
    // Far wing, with the near wing carrying a pale feather edge.
    ctx.beginPath(); ctx.moveTo(-.12,-.08);
    ctx.bezierCurveTo(-.45,-.72-lift*.35,-.95,-.64-lift*.55,-1.15,-.13-lift*.65);
    ctx.quadraticCurveTo(-.57,-.37-lift*.14,.04,.12); ctx.closePath(); ctx.fillStyle='#92543a'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-.07,-.07);
    ctx.bezierCurveTo(.08,-.75-lift*.45,.73,-.8-lift*.65,.97,-.29-lift*.65);
    ctx.quadraticCurveTo(.48,-.45-lift*.12,.04,.15); ctx.closePath(); ctx.fillStyle='#ca8958'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(.22,-.45-lift*.27); ctx.quadraticCurveTo(.65,-.65-lift*.43,.97,-.29-lift*.65);
    ctx.strokeStyle='#edc99a'; ctx.lineWidth=.055; ctx.stroke();
    shape(ctx,[{x:-.33,y:.04},{x:-.95,y:.27},{x:-.79,y:.42},{x:-.24,y:.22}],'#674735');
    ellipse(ctx,0,.06,.48,.24,'#ad6945',-.1);
    ellipse(ctx,.05,.15,.32,.1,'#edc99c',-.06);
    ellipse(ctx,.43,-.12,.21,.2,'#c98a59');
    shape(ctx,[{x:.58,y:-.14},{x:.86,y:-.07},{x:.58,y:.0}],'#eee1b7');
    ellipse(ctx,.49,-.16,.035,.036,'#2a382f');
    ellipse(ctx,.5,-.175,.009,.009,'#fff6dc');
  } else {
    ctx.scale(1,.68);
    const gait=Math.sin(time*5.4)*.19;
    // Far legs and a lifted, cream-edged tail.
    ctx.strokeStyle='#80583d'; ctx.lineWidth=.115;
    for(const [lx,offset]of[[-.46,gait],[.32,-gait]]) {
      ctx.beginPath(); ctx.moveTo(lx,.12); ctx.lineTo(lx+offset,.55); ctx.lineTo(lx-offset*.7,.94); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-.62,-.05); ctx.quadraticCurveTo(-1.04,-.31,-.92,-.43); ctx.quadraticCurveTo(-.69,-.34,-.5,-.1);
    ctx.fillStyle='#eedabc'; ctx.fill();
    ellipse(ctx,-.05,.02,.68,.35,'#b67c4c',-.05);
    ellipse(ctx,-.05,.19,.49,.14,'#e8c899',-.05);
    ctx.beginPath(); ctx.moveTo(.25,-.1); ctx.quadraticCurveTo(.35,-.63,.59,-.84); ctx.lineTo(.83,-.58); ctx.quadraticCurveTo(.55,-.15,.53,.17);
    ctx.fillStyle='#c18a56'; ctx.fill();
    ellipse(ctx,.76,-.69,.31,.18,'#c18a56',.15);
    ellipse(ctx,.94,-.64,.16,.1,'#ead0aa',.12);
    ellipse(ctx,1.055,-.66,.052,.047,'#4c4934');
    ellipse(ctx,.75,-.745,.032,.034,'#303f31');
    ellipse(ctx,.755,-.756,.009,.009,'#f6edd5');
    ellipse(ctx,.57,-.91,.075,.2,'#ba8556',-.45);
    ellipse(ctx,.75,-.92,.07,.18,'#d4ab7a',.35);
    ctx.strokeStyle='#c99a67';ctx.lineWidth=.12;
    for(const [lx,offset]of[[-.38,-gait],[.4,gait]]) {
      ctx.beginPath();ctx.moveTo(lx,.17);ctx.lineTo(lx+offset,.55);ctx.lineTo(lx-offset*.8,.95);ctx.stroke();
      line(ctx,lx-offset*.8-.035,.98,lx-offset*.8+.05,.98,'#48503a',.1);
    }
    for(const [sx,sy]of[[-.38,-.1],[-.1,-.18],[.13,-.12],[-.19,.02]])ellipse(ctx,sx,sy,.034,.024,'#eac99a');
  }
  ctx.restore();
}

/** Draws a transparent shop item illustration, without clearing the canvas. */
export function drawEquipmentIcon(ctx,w,h,{kind='bow',tier=0,color}={}) {
  const colors=['#a67548','#b88c4c','#487967','#b69a54'];
  const accent=color||colors[Math.max(0,Math.min(3,tier))];
  ctx.save();ctx.translate(w*.5,h*.5);
  const s=Math.min(w,h);ctx.scale(s,s);
  ellipse(ctx,0,.36,.25,.027,'rgba(49,66,45,.1)');
  if(kind==='bow') {
    ctx.rotate(-.16);
    // Distinct bow silhouettes make equipment tiers visible without labels.
    ctx.beginPath();ctx.moveTo(-.1,-.37);
    ctx.bezierCurveTo(.22,-.34,.28,-.18,.21,0);
    ctx.bezierCurveTo(.28,.18,.22,.34,-.1,.37);
    ctx.strokeStyle=accent;ctx.lineWidth=tier===3?.045:.038;ctx.lineCap='round';ctx.stroke();
    ctx.beginPath();ctx.moveTo(-.092,-.36);ctx.bezierCurveTo(.15,-.31,.21,-.17,.17,0);ctx.bezierCurveTo(.21,.17,.15,.31,-.092,.36);
    ctx.strokeStyle=tier<2?'#e1b77d':'#9fc2a5';ctx.lineWidth=.009;ctx.stroke();
    line(ctx,-.1,-.37,-.047,0,'#e5d9b5',.008);line(ctx,-.047,0,-.1,.37,'#e5d9b5',.008);
    line(ctx,.212,-.063,.212,.063,tier<2?'#5f513a':'#2d4c40',.057);
    for(let i=0;i<5;i++)line(ctx,.19,-.047+i*.023,.233,-.043+i*.023,'rgba(236,220,172,.5)',.006);
    line(ctx,-.25,0,.35,0,'#e5cea3',.012);
    shape(ctx,[{x:.34,y:-.024},{x:.41,y:0},{x:.34,y:.024}],'#5d7666');
    shape(ctx,[{x:-.24,y:-.004},{x:-.32,y:-.045},{x:-.34,y:-.022},{x:-.27,y:.007}],'#b7784b');
    if(tier===3) {
      for(const y of[-.35,.35]) {
        ellipse(ctx,-.068,y,.049,.049,'#375447');ellipse(ctx,-.068,y,.028,.028,'#c8af71');ellipse(ctx,-.068,y,.01,.01,'#375447');
      }
      line(ctx,-.058,-.34,.053,.31,'#667d66',.007);
      line(ctx,-.058,.34,.053,-.31,'#667d66',.007);
    } else if(tier===2) {
      line(ctx,.14,-.22,.19,-.15,'#d4c79a',.022);line(ctx,.14,.22,.19,.15,'#d4c79a',.022);
    }
  } else {
    ctx.rotate(-.67);
    // A small bundle for lower tiers; a precision-tipped arrow for higher ones.
    const shafts=tier<2?[-.05,.05]:[0];
    for(const offset of shafts) {
      const shaft=tier<2?'#b99a67':'#687f73';
      line(ctx,-.39,offset,.34,offset,shaft,.019);
      line(ctx,-.35,offset-.005,.32,offset-.005,'#ead7aa',.004);
      shape(ctx,[{x:.30,y:offset-.037},{x:.43,y:offset},{x:.30,y:offset+.037},{x:.32,y:offset}],tier===3?'#c5a15b':'#647b6d');
      for(const direction of[-1,1]) {
        ctx.beginPath();ctx.moveTo(-.36,offset);ctx.quadraticCurveTo(-.31,offset+direction*.09,-.18,offset+direction*.065);ctx.lineTo(-.23,offset);ctx.closePath();ctx.fillStyle=accent;ctx.fill();
        line(ctx,-.34,offset+direction*.015,-.22,offset+direction*.057,tier>1?'#d5d9ac':'#edd1a0',.006);
      }
      line(ctx,-.4,offset-.022,-.4,offset+.022,'#596b50',.013);
      if(tier===3)for(let i=0;i<3;i++)line(ctx,.19+i*.025,offset-.012,.19+i*.025,offset+.012,'#c5a15b',.009);
    }
  }
  ctx.restore();
}

/** Foreground bow and drawing hand. The shooting corridor stays unobstructed. */
export function drawFirstPersonBow(ctx,w,h,{charge=0,swayX=0,swayY=0,color='#a9784e',drawing=false}={}) {
  const pull=Math.max(0,Math.min(1,charge));
  const size=Math.min(w*.66,h*.45);
  const gripX=w*(w/h>1.5?.39:.32)+Math.max(-12,Math.min(12,swayX*100));
  const gripY=h*.93+Math.max(-7,Math.min(7,swayY*65));
  ctx.save();ctx.translate(gripX,gripY);ctx.scale(size,size);ctx.rotate(-.12);
  ctx.lineJoin='round';ctx.lineCap='round';

  // A soft rim shadow gives the carved limbs a tangible foreground weight.
  const bend=pull*.035;
  const limb=()=>{
    ctx.beginPath();ctx.moveTo(-.11,-.62);
    ctx.bezierCurveTo(-.22,-.55,-.23,-.42,-.12-bend,-.23);
    ctx.bezierCurveTo(-.055-bend,-.13,-.025,-.07,0,0);
    ctx.bezierCurveTo(-.025,.08,-.055-bend,.14,-.12-bend,.25);
    ctx.bezierCurveTo(-.23,.44,-.22,.56,-.11,.64);
  };
  limb();ctx.strokeStyle='rgba(38,48,31,.28)';ctx.lineWidth=.061;ctx.stroke();
  limb();ctx.strokeStyle=color;ctx.lineWidth=.046;ctx.stroke();
  // The lighter laminated edge follows the same recurve shape.
  ctx.save();ctx.translate(.008,-.005);limb();ctx.strokeStyle='#dab482';ctx.lineWidth=.009;ctx.stroke();ctx.restore();
  for(const y of[-.6,.62]) {
    line(ctx,-.116,y-.025,-.095,y+.017,'#4c4935',.025);
    line(ctx,-.118,y-.017,-.104,y+.006,'#c9bb91',.006);
  }

  // Bowstring and nock move toward the shooting hand as the draw grows.
  const nockX=drawing?.16+pull*.34:.08;
  const nockY=drawing?.025+pull*.15:.015;
  ctx.beginPath();ctx.moveTo(-.11,-.62);ctx.lineTo(nockX,nockY);ctx.lineTo(-.11,.64);
  ctx.strokeStyle='rgba(43,48,31,.28)';ctx.lineWidth=.012;ctx.stroke();
  ctx.beginPath();ctx.moveTo(-.109,-.62);ctx.lineTo(nockX,nockY);ctx.lineTo(-.109,.64);
  ctx.strokeStyle='#f3e7c5';ctx.lineWidth=.0055;ctx.stroke();

  // Arrow points up the range, with feathers close to the nocking hand.
  const tipX=.34,tipY=-.58;
  line(ctx,nockX,nockY,tipX,tipY,'#514f39',.017);
  line(ctx,nockX-.002,nockY-.002,tipX-.002,tipY-.004,'#e2c795',.009);
  const angle=Math.atan2(tipY-nockY,tipX-nockX);
  ctx.save();ctx.translate(tipX,tipY);ctx.rotate(angle);
  shape(ctx,[{x:.056,y:0},{x:-.015,y:-.016},{x:-.007,y:0},{x:-.015,y:.016}],'#617769');
  line(ctx,.042,-.002,-.01,-.011,'#b6c7aa',.003);ctx.restore();
  ctx.save();ctx.translate(nockX,nockY);ctx.rotate(angle);
  for(const sign of[-1,1]) {
    ctx.beginPath();ctx.moveTo(.012,0);ctx.quadraticCurveTo(.055,sign*.043,.13,sign*.032);ctx.lineTo(.092,0);ctx.closePath();
    ctx.fillStyle=sign===1?'#a35f3f':'#e5c394';ctx.fill();
    line(ctx,.036,sign*.011,.11,sign*.025,'rgba(255,236,189,.7)',.003);
  }
  ctx.restore();

  // Leather grip, left hand and a small sleeve establish the first-person view.
  line(ctx,-.003,-.074,.005,.085,'#4c4835',.078);
  for(let i=0;i<6;i++)line(ctx,-.038,-.06+i*.025,.037,-.055+i*.025,'#a68b62',.007);
  ctx.beginPath();ctx.moveTo(-.075,.005);ctx.quadraticCurveTo(-.16,.03,-.20,.11);
  ctx.lineTo(-.4,.32);ctx.lineTo(-.22,.45);ctx.lineTo(-.025,.21);
  ctx.quadraticCurveTo(.048,.15,.045,.07);ctx.closePath();ctx.fillStyle='#ceab7d';ctx.fill();
  ctx.beginPath();ctx.moveTo(-.14,.115);ctx.lineTo(-.43,.35);ctx.lineTo(-.24,.49);ctx.lineTo(-.02,.23);ctx.closePath();ctx.fillStyle='#536b49';ctx.fill();
  line(ctx,-.145,.11,-.02,.23,'#829069',.029);
  ctx.beginPath();ctx.moveTo(-.09,.04);ctx.quadraticCurveTo(-.035,-.055,.014,-.015);
  ctx.quadraticCurveTo(.067,.016,.033,.059);ctx.lineTo(-.023,.049);ctx.quadraticCurveTo(-.061,.13,-.1,.1);ctx.closePath();ctx.fillStyle='#d7b78c';ctx.fill();
  for(let i=0;i<3;i++){
    line(ctx,-.032,.067+i*.024,.035,.059+i*.024,'#c6a173',.023);
    line(ctx,-.022,.062+i*.024,.026,.055+i*.024,'#e7c99f',.005);
  }

  if(drawing) {
    // The string hand stays low, opening a clear sight line over the arrow.
    ctx.beginPath();ctx.moveTo(nockX+.03,nockY-.012);ctx.quadraticCurveTo(nockX+.12,nockY-.06,nockX+.15,nockY+.026);
    ctx.lineTo(nockX+.32,nockY+.24);ctx.lineTo(nockX+.15,nockY+.33);
    ctx.quadraticCurveTo(nockX+.045,nockY+.18,nockX-.012,nockY+.09);ctx.closePath();ctx.fillStyle='#c7a174';ctx.fill();
    ctx.beginPath();ctx.moveTo(nockX+.13,nockY+.13);ctx.lineTo(nockX+.35,nockY+.25);ctx.lineTo(nockX+.18,nockY+.36);ctx.lineTo(nockX+.05,nockY+.2);ctx.closePath();ctx.fillStyle='#536b49';ctx.fill();
    for(let i=0;i<2;i++)line(ctx,nockX+.005,nockY+.018+i*.028,nockX+.09,nockY+.005+i*.028,'#ddba8f',.03);
    line(ctx,nockX+.13,nockY+.13,nockX+.06,nockY+.2,'#8b9872',.023);
  }
  ctx.restore();
}
