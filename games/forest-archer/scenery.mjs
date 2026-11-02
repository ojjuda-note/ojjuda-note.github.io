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

function clipObstacleNear(points, near) {
  const clipped=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],insideA=a.z>=near,insideB=b.z>=near;
    if(insideA)clipped.push(a);
    if(insideA!==insideB){
      const t=(near-a.z)/(b.z-a.z);
      clipped.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:near});
    }
  }
  return clipped;
}

/**
 * Draw one solid collision box at the caller's existing front-face painter depth.
 * Timber seams and masonry courses are opaque surface decoration; only separate
 * obstacle boxes create gaps. Every face and detail is clipped to its real box.
 */
export function drawObstacle(ctx,obstacle,{project,camera={},nearPlane=.25}={}) {
  if(!obstacle||typeof project!=='function')return;
  const {width,height,depth,z}=obstacle,x=obstacle.x??0;
  if(![x,z,width,height,depth].every(Number.isFinite)||width<=0||height<=0||depth<=0)return;
  const cameraX=Number.isFinite(camera.x)?camera.x:0,cameraY=Number.isFinite(camera.y)?camera.y:1.65;
  const near=(Number.isFinite(camera.z)?camera.z:0)+Math.max(.001,Number.isFinite(nearPlane)?nearPlane:.25);
  const left=x-width/2,right=x+width/2,front=z-depth/2,back=z+depth/2;
  if(back<=near)return;
  const timber=obstacle.type==='timber',pillar=obstacle.type==='pillar';
  const palette=timber
    ?{light:'#ac9366',dark:'#7c6846',side:'#6e6043',top:'#c0aa7b',edge:'#625a3f',seam:'#5c563e99',shine:'#dcc79c80'}
    :pillar
      ?{light:'#adad95',dark:'#848c75',side:'#737e65',top:'#c3c3a8',edge:'#6d795f',seam:'#657158a6',shine:'#dcdcc18c'}
      :{light:'#9a997b',dark:'#747c62',side:'#657054',top:'#b6b195',edge:'#657154',seam:'#626f588f',shine:'#ccd0a48c'};
  const point=(px,py,pz)=>({x:px,y:py,z:pz});
  const line3=(a,b,color=palette.seam,lineWidth=.8)=>{
    if(a.z<near&&b.z<near)return;
    if(a.z<near||b.z<near){
      const t=(near-a.z)/(b.z-a.z),crossing=point(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,near);
      if(a.z<near)a=crossing;else b=crossing;
    }
    const pa=project(a),pb=project(b);
    if([pa.x,pa.y,pb.x,pb.y].every(Number.isFinite))line(ctx,pa.x,pa.y,pb.x,pb.y,color,lineWidth);
  };
  const face=(corners,fill,details)=>{
    const points=clipObstacleNear(corners,near).map(project);
    if(points.length<3||!points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))return;
    ctx.save();shape(ctx,points,fill);ctx.clip();
    ctx.strokeStyle=palette.edge;ctx.lineWidth=1;ctx.stroke();
    if(details)details();
    ctx.restore();
  };
  const rows=Math.min(10,Math.max(3,Math.ceil(height/(pillar?.52:.68))));
  const cols=Math.min(12,Math.max(pillar?1:3,Math.ceil(width/(timber?.36:pillar?.85:1.05))));
  const frontPoint=(u,v)=>point(left+width*u,height*v,front);
  ctx.save();ctx.lineJoin='round';ctx.lineCap='butt';

  // A lateral chase camera sees the correct side; preview sees the full top.
  if(cameraX<left||cameraX>right){
    const side=cameraX<left?left:right;
    face([point(side,0,back),point(side,0,front),point(side,height,front),point(side,height,back)],palette.side,()=>{
      if(timber){
        for(const u of [.2,.55,.83])line3(point(side,0,front+depth*u),point(side,height,front+depth*u),'#ac96685c');
      }else{
        for(let row=1;row<rows;row++)line3(point(side,height*row/rows,front),point(side,height*row/rows,back));
        for(let row=0;row<rows;row++){
          const zz=front+depth*(row%2?.38:.64);
          line3(point(side,height*row/rows,zz),point(side,height*(row+1)/rows,zz));
        }
      }
    });
  }
  if(cameraY>height){
    face([point(left,height,front),point(right,height,front),point(right,height,back),point(left,height,back)],palette.top,()=>{
      for(let col=1;col<cols;col++){
        const xx=left+width*col/cols;
        line3(point(xx,height,front),point(xx,height,back),palette.seam,.7);
      }
      if(pillar){
        const insetX=Math.min(width*.12,.12),insetZ=Math.min(depth*.18,.12);
        const corners=[point(left+insetX,height,front+insetZ),point(right-insetX,height,front+insetZ),point(right-insetX,height,back-insetZ),point(left+insetX,height,back-insetZ)];
        corners.forEach((p,i)=>line3(p,corners[(i+1)%4],palette.shine,1));
      }else if(timber){
        line3(point(left,height,front+depth*.35),point(right,height,front+depth*.35),'#e1cea257',.8);
      }
    });
  }
  if(front>=near){
    const bottom=project(frontPoint(0,0)),top=project(frontPoint(0,1));
    if([bottom.x,bottom.y,top.x,top.y].every(Number.isFinite)){
      const shade=ctx.createLinearGradient(0,top.y,0,Math.max(top.y+.01,bottom.y));
      shade.addColorStop(0,palette.light);shade.addColorStop(1,palette.dark);
      face([frontPoint(0,0),frontPoint(1,0),frontPoint(1,1),frontPoint(0,1)],shade,()=>{
        if(timber){
          // Closed planks: a solid backing remains beneath every seam and brace.
          for(let col=0;col<cols;col++){
            const u=col/cols,v=(col+1)/cols;
            if(col%2===0)shape(ctx,[frontPoint(u,0),frontPoint(v,0),frontPoint(v,1),frontPoint(u,1)].map(project),'#e2bd7215');
            if(col)line3(frontPoint(u,0),frontPoint(u,1),palette.seam,1.1);
            for(let grain=0;grain<2;grain++){
              const xx=(col+.3+grain*.35)/cols;
              const a=project(frontPoint(xx,.08)),b=project(frontPoint(xx+(col%2?-.05:.05)/cols,.5)),c=project(frontPoint(xx,.94));
              ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(b.x,b.y,c.x,c.y);ctx.strokeStyle=grain?'#ddc08e39':'#5f573b3d';ctx.lineWidth=.7;ctx.stroke();
            }
          }
          for(const v of [.24,.76]){
            const half=Math.min(.055,.11/height);
            shape(ctx,[frontPoint(0,v-half),frontPoint(1,v-half),frontPoint(1,v+half),frontPoint(0,v+half)].map(project),'#88724e');
            line3(frontPoint(0,v+half),frontPoint(1,v+half),'#c3a5789c',1);
            for(let col=0;col<cols;col++){
              const p=project(frontPoint((col+.5)/cols,v));
              ellipse(ctx,p.x,p.y,Math.min(1.5,Math.max(.45,p.scale*.018)),Math.min(1.5,Math.max(.45,p.scale*.018)),'#4e5640');
            }
          }
        }else{
          for(let row=1;row<rows;row++)line3(frontPoint(0,row/rows),frontPoint(1,row/rows));
          for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
            const u=(col+(row%2?.5:0))/cols;
            if(u>0&&u<1)line3(frontPoint(u,row/rows),frontPoint(u,(row+1)/rows));
          }
          if(pillar){
            for(const v of [.09,.91]){
              line3(frontPoint(0,v),frontPoint(1,v),palette.seam,1.5);
              line3(frontPoint(0,v+.012),frontPoint(1,v+.012),palette.shine,1);
            }
          }
          const patches=pillar?3:Math.min(11,cols+3);
          for(let i=0;i<patches;i++){
            const p=project(frontPoint((i+.35)/patches,.985-(i%3)*.012));
            ellipse(ctx,p.x,p.y,Math.max(1,width*p.scale/(patches*2.7)),Math.max(.7,Math.min(3,p.scale*.035)),'#718455bb');
          }
        }
        line3(frontPoint(0,1),frontPoint(1,1),palette.shine,1.5);
      });
    }
  }
  ctx.restore();
}

/** Friendly walking bystanders. x/y locate the centre of the feet in world space. */
export function drawPasser(ctx,person,{project,camera={},nearPlane=.25,time=0}={}) {
  if(!person||typeof project!=='function')return;
  const {x,z,width,height}=person,y=person.y??0,depth=person.depth??0;
  if(![x,y,z,width,height,depth].every(Number.isFinite)||width<=0||height<=0)return;
  const front=z-Math.max(0,depth)/2;
  const near=(Number.isFinite(camera.z)?camera.z:0)+Math.max(.001,Number.isFinite(nearPlane)?nearPlane:.25);
  if(front<near)return;
  const p=project({x,y,z:front});
  if(![p.x,p.y,p.scale].every(Number.isFinite)||p.scale<=0)return;
  let seed=0;
  for(const char of String(person.id??person.passId??0))seed=(Math.imul(seed,31)+char.charCodeAt(0))>>>0;
  const jackets=['#749084','#b38b65','#8d8697','#a69d69','#73899a'];
  const skin=['#d2ad87','#bb926e','#ae805f'];
  const jacket=jackets[seed%jackets.length],skinTone=skin[seed%skin.length];
  const speed=Number.isFinite(person.speed)?Math.abs(person.speed):Number.isFinite(person.velocityX)?Math.abs(person.velocityX):2;
  const clock=(Number.isFinite(time)?time:0)*5.4*Math.max(.7,Math.min(1.6,speed/2))+seed%17;
  const stride=Math.sin(clock),liftNear=Math.max(0,Math.cos(clock))*.045,liftFar=Math.max(0,-Math.cos(clock))*.045;
  const footNear=.24*stride,footFar=-.24*stride,bob=Math.abs(Math.cos(clock))*.009;
  ctx.save();ctx.translate(p.x,p.y);ctx.scale((person.direction<0?-1:1)*width*p.scale,height*p.scale);
  // Limbs, clothing and hats always remain inside the same physical person box.
  ctx.beginPath();ctx.rect(-.5,-1,1,1);ctx.clip();
  const leg=(hip,foot,lift,color)=>{
    ctx.beginPath();ctx.moveTo(hip-.09,-.44+bob);
    ctx.quadraticCurveTo(foot*.65-.07,-.24,foot-.065,-.045-lift);
    ctx.lineTo(foot+.075,-.045-lift);
    ctx.quadraticCurveTo(foot*.65+.1,-.25,hip+.1,-.43+bob);
    ctx.closePath();ctx.fillStyle=color;ctx.fill();
    ellipse(ctx,foot+.035,-.022-lift,.135,.026,'#465147');
  };
  leg(-.075,footFar,liftFar,'#50645e');
  // Far arm swings opposite to its leg, behind the coat.
  ctx.beginPath();ctx.moveTo(-.12,-.72+bob);ctx.lineTo(-.25,-.68+bob);
  ctx.quadraticCurveTo(-.22+stride*.12,-.53,-.20+stride*.22,-.43+bob);
  ctx.lineTo(-.07+stride*.22,-.42+bob);ctx.quadraticCurveTo(-.07+stride*.12,-.56,.025,-.66+bob);
  ctx.closePath();ctx.fillStyle='#61766b';ctx.fill();
  leg(.065,footNear,liftNear,'#65776c');
  ctx.beginPath();ctx.moveTo(-.18,-.73+bob);
  ctx.quadraticCurveTo(.03,-.79+bob,.21,-.69+bob);ctx.lineTo(.23,-.43+bob);
  ctx.quadraticCurveTo(0,-.38+bob,-.23,-.43+bob);ctx.lineTo(-.24,-.64+bob);
  ctx.closePath();ctx.fillStyle=jacket;ctx.fill();
  line(ctx,.08,-.69+bob,.085,-.45+bob,'#d9d5b956',.012);
  ellipse(ctx,.035,-.755+bob,.075,.065,skinTone);
  ellipse(ctx,.035,-.867+bob,.155,.105,skinTone);
  // A small nose and brim make the facing direction readable even at a distance.
  shape(ctx,[{x:.16,y:-.896+bob},{x:.23,y:-.862+bob},{x:.14,y:-.852+bob}],skinTone);
  ctx.beginPath();ctx.moveTo(-.12,-.855+bob);
  ctx.quadraticCurveTo(-.2,-1+bob,.04,-.994+bob);
  ctx.quadraticCurveTo(.20,-.984+bob,.18,-.92+bob);
  ctx.quadraticCurveTo(.01,-.955+bob,-.09,-.891+bob);
  ctx.closePath();ctx.fillStyle=seed%2?'#756952':'#566754';ctx.fill();
  if(seed%2===0)ellipse(ctx,.10,-.928+bob,.19,.02,'#566754');
  ellipse(ctx,.12,-.886+bob,.014,.009,'#495348');
  // Rounded coat sleeve and hand. No hit reaction or injury decoration.
  const handX=.18-stride*.21;
  ctx.beginPath();ctx.moveTo(.11,-.70+bob);ctx.quadraticCurveTo(.25,-.73+bob,.30,-.65+bob);
  ctx.quadraticCurveTo(.30-stride*.12,-.56,handX+.065,-.46+bob);
  ctx.lineTo(handX-.07,-.46+bob);ctx.quadraticCurveTo(.13-stride*.12,-.56,.11,-.70+bob);
  ctx.closePath();ctx.fillStyle=jacket;ctx.fill();
  ellipse(ctx,handX,-.45+bob,.067,.035,skinTone);
  ctx.restore();
}

/** Orange clay disc; its silhouette matches rx=1.3r and ry=.6r in the engine. */
export function drawClay(ctx,x,y,radius,time=0,direction=1) {
  if(!Number.isFinite(x)||!Number.isFinite(y))return;
  const r=Math.max(.1,Number.isFinite(radius)?radius:1),clock=Number.isFinite(time)?time:0;
  const wobble=Math.sin(clock*5.3)*.035;
  ctx.save();ctx.translate(x,y);ctx.scale(direction<0?-r:r,r);
  ctx.beginPath();ctx.ellipse(0,0,1.3,.6,0,0,TAU);
  const clay=ctx.createLinearGradient(0,-.6,0,.6);
  clay.addColorStop(0,'#f0ad55');clay.addColorStop(.47,'#dd843a');clay.addColorStop(1,'#ad592d');
  ctx.fillStyle=clay;ctx.fill();ctx.clip();
  // The rim and moulded top stay inside the collision ellipse while it spins.
  ellipse(ctx,0,.22+wobble,1.23,.36,'#ac5b2b');
  ellipse(ctx,0,-.065+wobble,1.17,.44,'#e99542');
  ctx.beginPath();ctx.ellipse(0,-.078+wobble,1.04,.35,0,Math.PI*1.07,Math.PI*1.96);
  ctx.strokeStyle='#ffe0a2';ctx.lineWidth=.045;ctx.stroke();
  ctx.beginPath();ctx.ellipse(0,-.04+wobble,.82,.265,0,0,TAU);
  ctx.strokeStyle='#bf652d';ctx.lineWidth=.031;ctx.stroke();
  ellipse(ctx,0,-.075+wobble,.54,.15,'#eda34c');
  for(let i=0;i<4;i++){
    const angle=clock*2.1+i*Math.PI/2;
    const xx=Math.cos(angle)*.96,yy=Math.sin(angle)*.30-.05+wobble;
    line(ctx,xx*.91,yy,xx,yy+Math.sin(angle)*.035,'#f8bd6c',.023);
  }
  ctx.beginPath();ctx.ellipse(0,.018,1.27,.56,0,0,Math.PI);
  ctx.strokeStyle='#8f512c8c';ctx.lineWidth=.037;ctx.stroke();
  ctx.restore();
}

/** Friendly event saucer, contained in the same 1.3r by .6r collision ellipse. */
export function drawUfo(ctx,x,y,radius,time=0,direction=1) {
  if(!Number.isFinite(x)||!Number.isFinite(y))return;
  const r=Math.max(.1,Number.isFinite(radius)?radius:1),clock=Number.isFinite(time)?time:0;
  ctx.save();ctx.translate(x,y);ctx.scale(direction<0?-r:r,r);
  ctx.beginPath();ctx.ellipse(0,0,1.3,.6,0,0,TAU);ctx.clip();
  const hull=ctx.createLinearGradient(0,-.2,0,.56);
  hull.addColorStop(0,'#b9cbb6');hull.addColorStop(.45,'#829f91');hull.addColorStop(1,'#486c63');
  ellipse(ctx,0,.16,1.28,.38,hull);
  ellipse(ctx,0,.025,1.28,.27,'#b8cbb7');
  ctx.beginPath();ctx.ellipse(0,.04,1.23,.235,0,0,Math.PI);
  ctx.strokeStyle='#dce2c7';ctx.lineWidth=.032;ctx.stroke();
  // A fixed glass canopy leaves the dodge motion entirely to the simulation.
  const glass=ctx.createLinearGradient(0,-.55,0,.02);
  glass.addColorStop(0,'#b7dcd1');glass.addColorStop(.55,'#87b5a7');glass.addColorStop(1,'#5a887a');
  ctx.beginPath();ctx.ellipse(0,-.025,.61,.52,0,Math.PI,TAU);ctx.closePath();
  ctx.fillStyle=glass;ctx.fill();
  ellipse(ctx,-.18,-.31,.10,.13,'#eff7d69e',.42);
  ctx.beginPath();ctx.ellipse(0,-.025,.55,.46,0,Math.PI*1.12,Math.PI*1.58);
  ctx.strokeStyle='#e0efd5a6';ctx.lineWidth=.025;ctx.stroke();
  ellipse(ctx,0,-.018,.65,.085,'#91afa0');
  line(ctx,-.54,-.035,.48,-.035,'#d0dcc0',.023);
  for(let i=0;i<5;i++){
    const xx=(i-2)*.43,yy=.23+(1-Math.abs(i-2)/2)*.075;
    const light=.58+.28*(.5+.5*Math.sin(clock*2.4+i*1.3));
    ellipse(ctx,xx,yy,.088,.056,'#456f61');
    ellipse(ctx,xx,yy-.005,.059,.035,`rgba(${i%2?'186,223,185':'246,217,143'},${light})`);
  }
  for(const sign of[-1,1])line(ctx,sign*.98,.09,sign*1.06,.19,'#e3e5c65c',.023);
  ellipse(ctx,0,.48,.34,.025,'#bed6a86b');
  ctx.restore();
}

// The new species use the same centre and normalized hit envelope as the engine.
// Body travel and hopping belong to the simulation; these drawings animate only
// wings, paws and tails so an arrow stays attached to the place it struck.
function drawFeline(ctx,kind,time) {
  const fast=kind==='cheetah',gait=Math.sin(time*(fast?10:6.1)),stride=gait*(fast?.22:.13);
  const coat=fast?'#cea35f':'#a6987c',shade=fast?'#a77d45':'#827c65';
  const light=fast?'#edcf94':'#d2c6a6',ink=fast?'#564c37':'#645e48';
  const limb=(x,offset,near)=>{
    ctx.beginPath();ctx.moveTo(x,.08);
    ctx.lineTo(x+offset*.55,.31);ctx.lineTo(x-offset*.62,.52);
    ctx.strokeStyle=near?coat:shade;ctx.lineWidth=fast?.075:.105;ctx.stroke();
    ellipse(ctx,x-offset*.62+.045,.52,.10,.045,near?light:shade);
  };
  // A long balancing tail distinguishes the cheetah from the short-tailed cat.
  ctx.beginPath();ctx.moveTo(-.52,.015);
  if(fast)ctx.bezierCurveTo(-.87,.06,-1.16,-.24+gait*.035,-1.28,-.10+gait*.035);
  else ctx.bezierCurveTo(-.78,-.01,-1.01,-.10+gait*.025,-.95,-.23+gait*.025);
  ctx.strokeStyle=coat;ctx.lineWidth=fast?.085:.13;ctx.stroke();
  if(fast){
    line(ctx,-1.16,-.15+gait*.035,-1.28,-.10+gait*.035,ink,.087);
    line(ctx,-1.04,-.12+gait*.025,-1.075,-.135+gait*.03,ink,.087);
  }else{
    line(ctx,-.82,-.07+gait*.02,-.85,-.085+gait*.02,ink,.135);
    line(ctx,-.94,-.13+gait*.02,-.95,-.23+gait*.025,ink,.13);
  }
  limb(-.43,stride,false);limb(.35,-stride,false);
  ellipse(ctx,-.10,0,fast?.67:.59,fast?.22:.29,coat,-.035);
  ellipse(ctx,-.08,.12,fast?.49:.43,fast?.105:.15,light,-.025);
  ellipse(ctx,-.42,.075,fast?.23:.26,fast?.21:.26,coat,-.1);
  if(fast){
    // Small solid spots remain legible even when the whole animal is far away.
    for(const [sx,sy,sr]of[[-.57,-.09,.033],[-.34,-.14,.035],[-.10,-.13,.031],[.12,-.10,.034],[.35,-.05,.028],[-.46,.05,.030],[-.20,.035,.028],[.03,.035,.030],[.23,.07,.027],[-.38,.17,.028]])ellipse(ctx,sx,sy,sr,sr*.8,ink);
  }else{
    for(const sx of[-.44,-.20,.04]){
      ctx.beginPath();ctx.moveTo(sx-.045,-.21);ctx.quadraticCurveTo(sx+.045,-.08,sx,.035);
      ctx.strokeStyle=ink;ctx.lineWidth=.035;ctx.stroke();
    }
  }
  limb(-.39,-stride,true);limb(.38,stride,true);
  // A low neck and round muzzle keep the cats distinct from the taller deer.
  ellipse(ctx,fast?.50:.44,-.10,fast?.27:.25,fast?.19:.25,coat,-.17);
  ellipse(ctx,fast?.69:.59,-.20,fast?.23:.25,fast?.20:.23,coat,-.10);
  if(fast){
    ellipse(ctx,.56,-.36,.09,.10,shade,-.2);ellipse(ctx,.74,-.37,.085,.095,shade,.1);
    ellipse(ctx,.57,-.36,.045,.05,light);ellipse(ctx,.74,-.37,.04,.045,light);
  }else{
    shape(ctx,[{x:.39,y:-.32},{x:.42,y:-.56},{x:.57,y:-.37}],shade);
    shape(ctx,[{x:.61,y:-.37},{x:.68,y:-.49},{x:.80,y:-.29}],coat);
    shape(ctx,[{x:.44,y:-.39},{x:.45,y:-.49},{x:.52,y:-.38}],light);
    shape(ctx,[{x:.65,y:-.37},{x:.68,y:-.44},{x:.74,y:-.34}],light);
    line(ctx,.42,-.53,.40,-.59,ink,.025);line(ctx,.68,-.47,.69,-.51,ink,.025);
    line(ctx,.54,-.38,.57,-.29,ink,.025);line(ctx,.66,-.38,.65,-.29,ink,.025);
  }
  const muzzleX=fast?.87:.78;
  ellipse(ctx,muzzleX,-.10,fast?.16:.15,.11,light,.02);
  ellipse(ctx,muzzleX+.105,-.145,.044,.032,ink);
  const eyeX=fast?.765:.675;
  ellipse(ctx,eyeX,-.235,.032,.036,'#354331');
  ellipse(ctx,eyeX+.009,-.245,.009,.010,'#fff2cf');
  if(fast)line(ctx,eyeX+.012,-.19,muzzleX-.045,-.065,ink,.026);
  else for(const y of[-.095,-.065])line(ctx,.82,y,1.01,y-.025,'#6f7153',.010);
  line(ctx,muzzleX+.065,-.065,muzzleX+.025,-.035,ink,.012);
}

function drawFlightBird(ctx,kind,time) {
  const eagle=kind==='eagle',flap=Math.sin(time*(eagle?2.2:10.2));
  const wing=eagle?'#765c3e':'#829397',farWing=eagle?'#5b4d35':'#65787d';
  const edge=eagle?'#b99d66':'#bac7c4',body=eagle?'#8b6b45':'#8d9e9e';
  ctx.save();
  // Keep all animated feathers within the physical silhouette, at every flap.
  ctx.beginPath();ctx.ellipse(0,0,eagle?1.55:1.18,eagle?.95:.86,0,0,TAU);ctx.clip();
  if(eagle){
    const lift=flap*.10;
    shape(ctx,[{x:-.08,y:.02},{x:-.52,y:-.60-lift},{x:-1.28,y:-.49-lift},{x:-1.45,y:-.24-lift},{x:-1.18,y:-.29-lift},{x:-1.40,y:-.10-lift},{x:-1.13,y:-.20-lift},{x:-1.32,y:.03-lift},{x:-.82,y:-.08},{x:-.26,y:.20}],farWing);
    ctx.beginPath();ctx.moveTo(-.12,.06);ctx.bezierCurveTo(.08,-.40,.23,-.72-lift,.45,-.76-lift);
    ctx.lineTo(1.30,-.49-lift);ctx.lineTo(1.45,-.24-lift);ctx.lineTo(1.19,-.30-lift);
    ctx.lineTo(1.38,-.10-lift);ctx.lineTo(1.12,-.20-lift);ctx.lineTo(1.27,.02-lift);
    ctx.quadraticCurveTo(.66,-.16,.12,.20);ctx.closePath();ctx.fillStyle=wing;ctx.fill();
    ctx.beginPath();ctx.moveTo(.15,-.34);ctx.quadraticCurveTo(.54,-.52-lift,1.20,-.30-lift);
    ctx.strokeStyle=edge;ctx.lineWidth=.07;ctx.stroke();
    for(let i=0;i<3;i++)line(ctx,.55+i*.19,-.35-lift,.68+i*.19,-.21-lift,'#594b35',.025);
    shape(ctx,[{x:-.30,y:.12},{x:-.98,y:.31},{x:-.85,y:.55},{x:-.27,y:.31}],'#584b35');
    line(ctx,-.88,.34,-.32,.23,edge,.04);
    ellipse(ctx,-.01,.15,.59,.24,body,-.06);
    ellipse(ctx,.04,.25,.40,.10,'#b59866',-.02);
    ellipse(ctx,.53,.015,.30,.20,'#e0d9b6',-.14);
    ellipse(ctx,.71,-.05,.22,.17,'#eee5c5');
    shape(ctx,[{x:.87,y:-.06},{x:1.06,y:.01},{x:1.00,y:.12},{x:.89,y:.04}],'#d2ad5a');
    ellipse(ctx,.77,-.09,.030,.031,'#354331');
    line(ctx,.71,-.13,.82,-.12,'#8c8259',.025);
  }else{
    const lift=.14*flap;
    ctx.beginPath();ctx.moveTo(-.10,.02);ctx.bezierCurveTo(-.35,-.70-lift,-.76,-.64-lift,-1.03,-.23-lift);
    ctx.quadraticCurveTo(-.65,-.24-lift,-.10,.16);ctx.closePath();ctx.fillStyle=farWing;ctx.fill();
    ctx.beginPath();ctx.moveTo(-.05,.10);ctx.bezierCurveTo(.10,-.57-lift,.44,-.76-lift,.94,-.32-lift);
    ctx.quadraticCurveTo(.55,-.23-lift,.10,.22);ctx.closePath();ctx.fillStyle=wing;ctx.fill();
    ctx.beginPath();ctx.moveTo(.27,-.32-lift);ctx.quadraticCurveTo(.55,-.43-lift,.83,-.29-lift);
    ctx.strokeStyle='#566b72';ctx.lineWidth=.060;ctx.stroke();
    ctx.beginPath();ctx.moveTo(.35,-.45-lift);ctx.quadraticCurveTo(.64,-.48-lift,.90,-.31-lift);
    ctx.strokeStyle='#596e76';ctx.lineWidth=.05;ctx.stroke();
    ctx.beginPath();ctx.moveTo(.10,-.22);ctx.quadraticCurveTo(.45,-.64-lift,.92,-.31-lift);
    ctx.strokeStyle=edge;ctx.lineWidth=.028;ctx.stroke();
    shape(ctx,[{x:-.30,y:.11},{x:-1.00,y:.29},{x:-.86,y:.46},{x:-.26,y:.31}],'#647a81');
    line(ctx,-.93,.30,-.87,.42,'#415c66',.045);
    ellipse(ctx,-.04,.14,.48,.24,body,-.10);
    ellipse(ctx,.02,.23,.31,.09,'#bdc8c0',-.05);
    ellipse(ctx,.32,.04,.20,.23,'#6e9185',-.23);
    ellipse(ctx,.37,.10,.10,.16,'#8d8598',-.25);
    ellipse(ctx,.48,-.12,.20,.20,'#a9b6af');
    shape(ctx,[{x:.62,y:-.10},{x:.83,y:-.04},{x:.62,y:.02}],'#607176');
    ellipse(ctx,.64,-.08,.052,.03,'#e3e5d3');
    ellipse(ctx,.53,-.15,.038,.039,'#bb9966');
    ellipse(ctx,.54,-.15,.022,.025,'#34433c');
    ellipse(ctx,.546,-.159,.007,.008,'#fff7d7');
    line(ctx,.04,.34,.22,.38,'#a17865',.023);
  }
  ctx.restore();
}

/** Friendly, readable moving woodland targets. radius is the visual scale. */
export function drawAnimal(ctx,x,y,radius,kind,time=0,direction=1) {
  if(!Number.isFinite(x)||!Number.isFinite(y))return;
  const r=Math.max(.1,Number.isFinite(radius)?radius:1),clock=Number.isFinite(time)?time:0;
  ctx.save(); ctx.translate(x,y); ctx.scale(direction<0?-r:r,r);
  ctx.lineCap='round'; ctx.lineJoin='round';
  if(kind==='wildcat'||kind==='cheetah') {
    ctx.beginPath();ctx.ellipse(0,0,kind==='cheetah'?1.38:1.12,kind==='cheetah'?.62:.66,0,0,TAU);ctx.clip();
    drawFeline(ctx,kind,clock);
  } else if(kind==='pigeon'||kind==='eagle') {
    drawFlightBird(ctx,kind,clock);
  } else if(kind==='bird') {
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
  } else if(kind==='rabbit') {
    ctx.scale(1,.84);
    const hop=Math.sin(time*7.2),stretch=hop*.12,earTilt=Math.sin(time*7.2-.35)*.08;
    // The engine moves the animal's center; only paws and ears animate here.
    ellipse(ctx,-.34,.40,.29,.10,'#ab9b81',-.18+stretch);
    line(ctx,.25,.24,.35-stretch,.51,'#b4a387',.11);
    ellipse(ctx,.42-stretch,.52,.15,.06,'#c6b598',-.06);
    ellipse(ctx,-.68,.04,.15,.14,'#e6dcc6',-.2);
    ellipse(ctx,-.15,.10,.57,.36,'#c3b297',-.13);
    ellipse(ctx,-.18,.22,.42,.18,'#e2d6bf',-.13);
    ellipse(ctx,-.39,.22,.29,.29,'#ccbb9c',-.20);
    ellipse(ctx,-.39+stretch,.48,.29,.084,'#ddd0b4',-.12-stretch*.5);
    line(ctx,-.55+stretch,.47,-.28+stretch,.48,'#b29f81',.015);
    // Two tall ears make the near-range rabbit readable at phone sizes.
    ellipse(ctx,.37,-.49,.092,.31,'#b7a389',-.22-earTilt);
    ellipse(ctx,.365,-.51,.038,.23,'#c7ab99',-.22-earTilt);
    ellipse(ctx,.58,-.51,.10,.34,'#d6c6aa',-.04-earTilt*.7);
    ellipse(ctx,.585,-.53,.041,.26,'#bd9f8c',-.04-earTilt*.7);
    ellipse(ctx,.48,-.10,.29,.25,'#d5c5a8',-.06);
    ellipse(ctx,.66,.006,.19,.13,'#e8dcc5',.08);
    ellipse(ctx,.83,-.008,.043,.032,'#785e50');
    line(ctx,.79,.025,.73,.055,'#9a8067',.012);
    ellipse(ctx,.59,-.155,.035,.041,'#344432');
    ellipse(ctx,.598,-.168,.010,.012,'#fff6df');
    line(ctx,.24,.27,.30+stretch,.48,'#d5c1a0',.12);
    ellipse(ctx,.38+stretch,.49,.17,.065,'#e6d6b9',.03);
    line(ctx,.34+stretch,.48,.46+stretch,.49,'#bca68a',.012);
    for(const y of[-.018,.021])line(ctx,.71,y,.92,y-.032,'rgba(102,107,80,.65)',.009);
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

/** Gold impact at a projected hit point. Age is seconds after impact, not replay time. */
export function drawBullseyeImpact(ctx,w,h,{x,y,age,scale=1,reducedMotion=false}={}) {
  const duration=1.2;
  if(!ctx||![w,h,x,y,age].every(Number.isFinite)||w<=0||h<=0||w>32768||h>32768||age<0||age>=duration)return;
  const size=Math.max(.45,Math.min(2,Number.isFinite(scale)?scale:1));
  const radius=Math.max(26,Math.min(74,Math.min(w,h)*.12))*size;
  if(x<-radius*5||x>w+radius*5||y<-radius*5||y>h+radius*5)return;
  const progress=age/duration,fade=Math.pow(1-progress,1.35);
  ctx.save();ctx.translate(x,y);ctx.lineCap='round';ctx.lineJoin='round';
  const opacity=Number.isFinite(ctx.globalAlpha)?ctx.globalAlpha:1;
  if(reducedMotion){
    // A fixed, restrained halo gives the same success feedback without travel.
    const r=Math.max(10,Math.min(22,radius*.34));
    const glow=ctx.createRadialGradient(0,0,0,0,0,r);
    glow.addColorStop(0,'rgba(245,206,103,.36)');glow.addColorStop(.38,'rgba(232,183,78,.18)');glow.addColorStop(1,'rgba(226,172,68,0)');
    ctx.globalAlpha=opacity*fade;ellipse(ctx,0,0,r,r,glow);
    ctx.beginPath();ctx.arc(0,0,r*.48,0,TAU);ctx.strokeStyle='#eccb7e';ctx.lineWidth=1.1;ctx.stroke();
    ctx.restore();return;
  }

  // The warm bloom is local to the hit. Its dark-edged waves stay legible on a gold bullseye.
  const bloom=radius*(.85+.90*(1-Math.exp(-age*8)));
  const glow=ctx.createRadialGradient(0,0,0,0,0,bloom);
  glow.addColorStop(0,'rgba(255,220,127,.58)');glow.addColorStop(.24,'rgba(245,190,69,.34)');
  glow.addColorStop(.68,'rgba(226,153,43,.10)');glow.addColorStop(1,'rgba(226,153,43,0)');
  ctx.globalAlpha=opacity*Math.exp(-age*3.4)*fade;ellipse(ctx,0,0,bloom,bloom,glow);
  for(let i=0;i<2;i++){
    const elapsed=age-i*.055,life=i?.58:.46;if(elapsed<0||elapsed>=life)continue;
    const t=elapsed/life,travel=1-Math.pow(1-t,3),r=radius*(.14+(i?1.6:2.15)*travel);
    const strength=Math.pow(1-t,1.15),width=Math.max(1.5,radius*(i?.032:.048));
    ctx.beginPath();ctx.arc(0,0,r,0,TAU);
    ctx.globalAlpha=opacity*strength*.72;ctx.strokeStyle='#6a562e';ctx.lineWidth=width+Math.max(1.4,radius*.045);ctx.stroke();
    ctx.globalAlpha=opacity*strength*(i?.78:.96);ctx.strokeStyle=i?'#e6b755':'#ffe4a0';ctx.lineWidth=width;ctx.stroke();
  }

  // A single outward burst of tapered speed streaks makes the first quarter-second feel sharp.
  if(age<.34){
    const t=age/.34,travel=1-Math.pow(1-t,2),count=w<500?14:20;
    for(let i=0;i<count;i++){
      const spread=(i*.6180339887)%1,angle=i*TAU/count+.19+spread*.16;
      const start=radius*(.30+travel*(1.55+spread*.60));
      const length=radius*(.34+spread*.58)*(1-t*.62),half=Math.max(.8,radius*(.012+spread*.016));
      const ux=Math.cos(angle),uy=Math.sin(angle),vx=-uy,vy=ux;
      ctx.globalAlpha=opacity*Math.pow(1-t,1.2)*(.64+spread*.25);
      shape(ctx,[{x:ux*start,y:uy*start},{x:ux*(start+length*.32)+vx*half,y:uy*(start+length*.32)+vy*half},
        {x:ux*(start+length),y:uy*(start+length)},{x:ux*(start+length*.32)-vx*half,y:uy*(start+length*.32)-vy*half}],i%3?'#f8d785':'#c5903f');
    }
  }

  // Indexed trajectories do not consume gameplay randomness. Tails follow the same drag/gravity curve as their heads.
  const count=w<500?36:48,drag=1.65,gravity=radius*2.3;
  for(let i=0;i<count;i++){
    const spread=(i*.6180339887)%1,angle=i*2.3999632297+.31,life=.56+spread*.57;
    if(age>=life)continue;
    const t=age/life,speed=radius*(3.3+spread*3.2),back=Math.max(0,age-(.015+spread*.019));
    const travel=speed*(1-Math.exp(-drag*age))/drag,oldTravel=speed*(1-Math.exp(-drag*back))/drag;
    const ux=Math.cos(angle),uy=Math.sin(angle),px=ux*(radius*.045+travel),py=uy*(radius*.045+travel)+gravity*age*age;
    const tx=ux*(radius*.045+oldTravel),ty=uy*(radius*.045+oldTravel)+gravity*back*back;
    const width=Math.max(1.05,radius*(.022+spread*.018));
    ctx.globalAlpha=opacity*Math.pow(1-t,.85)*(.78+spread*.20);
    if(i%3===0)line(ctx,tx,ty,px,py,'#8c6534',width+1.2);
    line(ctx,tx,ty,px,py,i%3?'#ffe2a0':'#e8b24c',width);
    if(i%6===0){
      const star=Math.max(1.7,radius*.055)*(1-t*.4);
      line(ctx,px-star,py,px+star,py,'#fff0be',Math.max(.9,width*.56));
      line(ctx,px,py-star,px,py+star,'#fff0be',Math.max(.9,width*.56));
    }
  }
  const chips=w<500?12:18;
  for(let i=0;i<chips;i++){
    const spread=(i*.754877666)%1,life=.68+spread*.44;if(age>=life)continue;
    const t=age/life,angle=-Math.PI+.20+spread*(Math.PI-.40),speed=radius*(1.8+spread*2.3);
    const travel=speed*(1-Math.exp(-age*1.1))/1.1;
    const px=Math.cos(angle)*(radius*.07+travel),py=Math.sin(angle)*(radius*.07+travel)+radius*2.8*age*age;
    const length=Math.max(3.5,radius*(.12+spread*.13)),width=Math.max(1.7,length*.30);
    ctx.save();ctx.translate(px,py);ctx.rotate(angle+age*(i%2?4.5+spread*3:-3.6-spread*2));
    ctx.globalAlpha=opacity*Math.pow(1-t,.9)*.94;
    shape(ctx,[{x:-length*.56,y:-width*.32},{x:length*.50,y:-width*.48},
      {x:length*.29,y:width*.46},{x:-length*.43,y:width*.23}],i%3===0?'#a6773e':i%3===1?'#d2a15d':'#edc27f');
    ctx.strokeStyle='#76532f';ctx.lineWidth=Math.max(.7,radius*.018);ctx.stroke();
    line(ctx,-length*.32,-width*.03,length*.24,-width*.13,'#f0cf8c',Math.max(.55,radius*.012));
    ctx.restore();
  }

  // One brief, irregular star is an impact accent, not a full-screen flash or repeating pulse.
  if(age<.19){
    const t=age/.19,reach=radius*(.43+.67*Math.min(1,age/.045));
    const points=Array.from({length:16},(_,i)=>{
      const angle=i*TAU/16+.14,r=i%2?reach*.17:reach*(i%4?.72:1);
      return {x:Math.cos(angle)*r,y:Math.sin(angle)*r};
    });
    ctx.globalAlpha=opacity*Math.pow(1-t,1.1)*.95;
    shape(ctx,points,'#ffe8aa');ctx.strokeStyle='#ae7933';ctx.lineWidth=Math.max(1,radius*.027);ctx.stroke();
    ellipse(ctx,0,0,Math.max(2.2,radius*.105),Math.max(2.2,radius*.105),'#fff1bf');
  }
  ctx.restore();
}

/** Brief dark edge focus follows the actual hit; the target and reduced-motion view stay clear. */
export function drawBullseyeVignette(ctx,w,h,{age,duration=1.9,impactAge=-1,entryMask=0,reducedMotion=false}={}) {
  if(reducedMotion||!ctx||![w,h,age,duration].every(Number.isFinite)||w<=0||h<=0||w>32768||h>32768||duration<=0||age<0||age>=duration)return;
  const envelope=Math.max(0,Math.min(1,age/.10,(duration-age)/.36));
  const pulse=Number.isFinite(impactAge)&&impactAge>=0&&impactAge<.48?Math.exp(-impactAge*8.5):0;
  const entry=Number.isFinite(entryMask)?Math.max(0,Math.min(1,entryMask)):0;
  if(envelope<=0&&pulse<=0&&entry<=0)return;
  ctx.save();ctx.translate(w*.5,h*.5);ctx.scale(w*.5,h*.5);
  const focus=ctx.createRadialGradient(0,0,.24,0,0,1.42);
  focus.addColorStop(0,'rgba(26,43,31,0)');focus.addColorStop(.28,'rgba(26,43,31,0)');
  focus.addColorStop(.66,`rgba(29,43,29,${(.075*envelope+.09*pulse+.075*entry).toFixed(4)})`);
  focus.addColorStop(1,`rgba(30,35,23,${Math.min(.56,.27*envelope+.20*pulse+.18*entry).toFixed(4)})`);
  ctx.fillStyle=focus;ctx.fillRect(-1,-1,2,2);ctx.restore();
}

// Equipment artwork follows the same independent attributes as the simulation.
// Profiles are intentionally bounded: additional items never grow with their id.
const bowProfiles = [
  {length:.37,tipX:-.12,reach:.26,waist:.18,curl:.08},
  {length:.35,tipX:-.14,reach:.23,waist:.15,curl:.02},
  {length:.36,tipX:-.16,reach:.31,waist:.17,curl:-.08},
  {length:.39,tipX:-.13,reach:.28,waist:.14,curl:-.04},
  {length:.34,tipX:-.10,reach:.24,waist:.17,curl:.06},
  {length:.38,tipX:-.11,reach:.30,waist:.20,curl:.02},
  {length:.29,tipX:-.14,reach:.25,waist:.13,curl:-.05},
  {length:.38,tipX:-.13,reach:.21,waist:.13,curl:.05},
  {length:.41,tipX:-.16,reach:.30,waist:.19,curl:.09},
  {length:.36,tipX:-.15,reach:.28,waist:.17,curl:-.09},
  {length:.37,tipX:-.10,reach:.23,waist:.12,curl:-.03},
  {length:.39,tipX:-.18,reach:.31,waist:.18,curl:-.10},
  {length:.35,tipX:-.13,reach:.27,waist:.15,curl:-.06},
  {length:.38,tipX:-.12,reach:.25,waist:.13,curl:-.02},
  {length:.40,tipX:-.16,reach:.29,waist:.16,curl:-.07},
  {length:.36,tipX:-.11,reach:.28,waist:.17,curl:-.04},
  {length:.38,tipX:-.16,reach:.30,waist:.18,curl:-.08},
  {length:.37,tipX:-.12,reach:.24,waist:.14,curl:-.02},
  {length:.39,tipX:-.15,reach:.29,waist:.16,curl:-.06},
  {length:.40,tipX:-.17,reach:.30,waist:.17,curl:-.09}
];
const gunProfiles = [
  {muzzle:.34,barrel:.019,stock:.37,foreEnd:.11,foreWidth:.055,gripDrop:.13,cheek:false,rail:false},
  {muzzle:.27,barrel:.028,stock:.32,foreEnd:.14,foreWidth:.062,gripDrop:.18,cheek:false,rail:true},
  {muzzle:.35,barrel:.031,stock:.39,foreEnd:.17,foreWidth:.080,gripDrop:.15,cheek:true,rail:false},
  {muzzle:.44,barrel:.022,stock:.36,foreEnd:.10,foreWidth:.057,gripDrop:.14,cheek:false,rail:true},
  {muzzle:.41,barrel:.029,stock:.40,foreEnd:.18,foreWidth:.073,gripDrop:.16,cheek:true,rail:true}
];
const equipmentValue=(value,fallback,min,max)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:fallback));
const equipmentVariant=tier=>{
  const count=bowProfiles.length+gunProfiles.length;
  return ((Math.trunc(Number.isFinite(tier)?tier:0)%count)+count)%count;
};
const gunProfile=variant=>gunProfiles[Math.max(0,variant-bowProfiles.length)%gunProfiles.length];
const burstGrade=(burstCount,grouping)=>equipmentValue(burstCount,1,1,3)>1?(equipmentValue(grouping,35,0,100)>=85?3:equipmentValue(grouping,35,0,100)>=50?2:1):0;

function drawFletching(ctx,x,y,{name='',windArea=1,stability=35}={},accent='#ad895f',variant=0,scale=1) {
  const area=equipmentValue(windArea,1,.16,1.4),stable=equipmentValue(stability,35,0,100);
  const height=(.025+area*.065)*scale;
  const length=(.10+Math.sqrt(area)*.085)*scale;
  const feather=/깃/.test(name)||!name,rounded=/곡면|유선/.test(name),wedge=/삼각|쐐기/.test(name);
  for(const direction of[-1,1]) {
    const top=y+direction*height;
    ctx.beginPath();ctx.moveTo(x,y);
    if(wedge) {ctx.lineTo(x+length*.48,top);ctx.lineTo(x+length*.94,top*.18+y*.82);}
    else if(feather) {ctx.quadraticCurveTo(x+length*.12,top*1.18-y*.18,x+length*.83,top*.72+y*.28);}
    else if(rounded) {ctx.bezierCurveTo(x+length*.1,top*1.12-y*.12,x+length*.52,top,x+length*.94,y+direction*height*.35);}
    else {ctx.lineTo(x+length*.25,top*.65+y*.35);ctx.lineTo(x+length*.92,top*.52+y*.48);}
    ctx.lineTo(x+length*.72,y);ctx.closePath();ctx.fillStyle=accent;ctx.fill();
    line(ctx,x+length*.12,y+direction*height*.14,x+length*.79,y+direction*height*.47,'rgba(244,231,195,.78)',.004*scale);
    if(feather)for(let i=1;i<=3;i++){
      const t=i*.19;
      line(ctx,x+length*t,y+direction*height*.13,x+length*(t+.13),y+direction*height*(.48+(1-t)*.18),'rgba(69,88,62,.30)',.003*scale);
    }
  }
  // Thin bindings distinguish material grades without implying another stat.
  const ties=1+Math.min(3,Math.floor(stable/30));
  for(let i=0;i<ties;i++)line(ctx,x+length*.85+i*.012*scale,y-.012*scale,x+length*.85+i*.012*scale,y+.012*scale,variant%2?'#bdaa79':'#e5d6b0',.005*scale);
}

function drawScopeTube(ctx,x,y,length=.18,radius=.025,angle=0) {
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);
  line(ctx,-length*.36,radius*.9,-length*.36,radius*1.8,'#596d5b',radius*.45);
  line(ctx,length*.30,radius*.9,length*.30,radius*1.8,'#596d5b',radius*.45);
  line(ctx,-length*.5,0,length*.5,0,'#405b51',radius*1.75);
  line(ctx,-length*.37,-radius*.40,length*.34,-radius*.40,'#9faf8b',radius*.20);
  for(const sign of[-1,1]) {
    ellipse(ctx,sign*length*.5,0,radius*.35,radius,'#b9bb91');
    ellipse(ctx,sign*length*.5,0,radius*.22,radius*.72,'#53837b');
    line(ctx,sign*length*.5,-radius*.4,sign*length*.5,radius*.1,'#b4ded0',radius*.13);
  }
  ctx.restore();
}

function drawBurstMagazine(ctx,x,y,accent,burstCount,grouping,scale=1) {
  const grade=burstGrade(burstCount,grouping);if(!grade)return;
  const count=Math.round(equipmentValue(burstCount,3,2,3));
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  // A compact side cassette leaves the rail and any mounted optic visible.
  shape(ctx,[{x:-.11,y:-.09},{x:.045,y:-.09},{x:.07,y:-.06},{x:.07,y:.10},{x:-.09,y:.10},{x:-.11,y:.07}],'#405d50');
  shape(ctx,[{x:-.10,y:-.085},{x:.038,y:-.085},{x:.055,y:-.055},{x:-.085,y:-.055}],accent);
  shape(ctx,[{x:-.085,y:-.048},{x:.048,y:-.048},{x:.048,y:.065},{x:-.085,y:.065}],'#6b7d66');
  for(let i=0;i<count;i++){
    const xx=-.065+i*.041;
    line(ctx,xx,.053,xx,-.075,'#dcc7a0',.009);
    shape(ctx,[{x:xx-.012,y:-.071},{x:xx,y:-.105},{x:xx+.012,y:-.071}],'#b6c2ad');
  }
  line(ctx,-.09,.075,.053,.075,accent,.018);
  if(grade>=2){line(ctx,-.10,-.045,-.10,.052,'#c9c6a0',.009);line(ctx,.061,-.045,.061,.052,'#c9c6a0',.009);}
  if(grade===3){ellipse(ctx,-.072,.077,.012,.009,'#ddd4e4');ellipse(ctx,.032,.077,.012,.009,'#ddd4e4');}
  ctx.restore();
}

function drawCrossbowIcon(ctx,variant,accent,gripRatio,elasticRatio,scopeMounted,burstCount=1,grouping=0) {
  ctx.save();ctx.rotate(-.48+(variant%2)*.13);
  const grade=burstGrade(burstCount,grouping),span=.31+elasticRatio*.04-grade*.004,limbWidth=.030+elasticRatio*.022;
  // A transverse prod, longitudinal rail, shaped stock and front stirrup.
  const prod=()=>{
    ctx.beginPath();ctx.moveTo(-span,-.14);
    ctx.bezierCurveTo(-span*.85,-.23-grade*.006,-span*.42,-.23-grade*.006,0,-.18);
    ctx.bezierCurveTo(span*.42,-.23-grade*.006,span*.85,-.23-grade*.006,span,-.14);
  };
  prod();ctx.lineWidth=limbWidth+.015;ctx.strokeStyle='#425a49';ctx.stroke();
  prod();ctx.lineWidth=limbWidth;ctx.strokeStyle=accent;ctx.stroke();
  ctx.save();ctx.translate(0,-.007);prod();ctx.lineWidth=.006;ctx.strokeStyle='#ddc99a';ctx.stroke();ctx.restore();
  line(ctx,-span,-.14,0,.035,'#e9dfbf',.007);line(ctx,0,.035,span,-.14,'#e9dfbf',.007);
  shape(ctx,[{x:-.055,y:-.22},{x:.055,y:-.22},{x:.049,y:.14},{x:.10,y:.32},{x:.065,y:.38},{x:-.085,y:.38},{x:-.075,y:.20},{x:-.045,y:.10}],accent);
  line(ctx,-.067,.365,.077,.365,'#41594a',.027);
  line(ctx,-.028,-.27,-.028,.17,'#4a6656',.016);line(ctx,.028,-.27,.028,.17,'#4a6656',.016);
  line(ctx,0,-.28,0,.16,'#d2c7a4',.008);
  ctx.beginPath();ctx.moveTo(-.036,-.26);ctx.lineTo(-.052,-.35);ctx.quadraticCurveTo(0,-.39,.052,-.35);ctx.lineTo(.036,-.26);
  ctx.strokeStyle='#526c5c';ctx.lineWidth=.018;ctx.stroke();
  // Trigger guard is visible to the side of the stock in this oblique view.
  ctx.beginPath();ctx.moveTo(.04,.10);ctx.quadraticCurveTo(.13,.12,.085,.21);ctx.lineTo(.048,.21);
  ctx.strokeStyle='#455e4d';ctx.lineWidth=.012;ctx.stroke();
  line(ctx,.049,.125,.071,.17,'#c9b47d',.012);
  const wraps=3+Math.round(gripRatio*4);
  for(let i=0;i<wraps;i++)line(ctx,-.047,.19+i*.016,.051,.19+i*.016,'rgba(55,75,51,.55)',.005);
  line(ctx,0,.08,0,-.29,'#e8d1a4',.012);
  shape(ctx,[{x:-.019,y:-.29},{x:0,y:-.355},{x:.019,y:-.29}],'#6a8271');
  shape(ctx,[{x:0,y:.05},{x:-.033,y:.10},{x:-.025,y:.13},{x:0,y:.09}],'#b89b66');
  if(variant===11)for(const sign of[-1,1])line(ctx,sign*.12,-.19,sign*.27,-.17,'#d9c288',.014);
  if(grade){
    drawBurstMagazine(ctx,-.069,.005,accent,burstCount,grouping,.82);
    for(const sign of[-1,1])line(ctx,sign*.12,-.197,sign*(.22+grade*.014),-.19-grade*.005,'#c5c9ad',.009+grade*.002);
  }
  if(scopeMounted)drawScopeTube(ctx,0,-.025,.19,.025,-Math.PI/2);
  ctx.restore();
}

function drawFirstPersonCrossbow(ctx,w,h,{charge=0,swayX=0,swayY=0,color='#8d9471',drawing=false,grip=82,elasticity=90,tipMass=4,fletching,arrowColor='#a35f3f',scopeMounted=false,burstCount=1,grouping=0}) {
  const pull=equipmentValue(charge,0,0,1),gripRatio=equipmentValue(grip,82,0,100)/100,elasticRatio=equipmentValue(elasticity,90,0,100)/100;
  const grade=burstGrade(burstCount,grouping),size=Math.min(w*.84,h*.48),span=.43+elasticRatio*.05-grade*.004;
  ctx.save();ctx.translate(w*.5+equipmentValue(swayX*100,0,-12,12),h*.96+equipmentValue(swayY*65,0,-7,7));ctx.scale(size,size);
  ctx.lineCap='round';ctx.lineJoin='round';
  // The crossbow remains below the target corridor even with its scope fitted.
  ctx.beginPath();ctx.moveTo(-.055,-.61);ctx.lineTo(-.074,-.72);ctx.quadraticCurveTo(0,-.77,.074,-.72);ctx.lineTo(.055,-.61);
  ctx.strokeStyle='#5b7360';ctx.lineWidth=.028;ctx.stroke();
  const prod=()=>{
    ctx.beginPath();ctx.moveTo(-span,-.40+pull*.018);
    ctx.bezierCurveTo(-span*.82,-.56,-span*.40,-.60,0,-.50);
    ctx.bezierCurveTo(span*.40,-.60,span*.82,-.56,span,-.40+pull*.018);
  };
  prod();ctx.strokeStyle='rgba(31,49,36,.35)';ctx.lineWidth=.071;ctx.stroke();
  prod();ctx.strokeStyle=color;ctx.lineWidth=.039+elasticRatio*.021;ctx.stroke();
  ctx.save();ctx.translate(0,-.010);prod();ctx.strokeStyle='#d9c593';ctx.lineWidth=.009;ctx.stroke();ctx.restore();
  if(grade)for(const sign of[-1,1])line(ctx,sign*.19,-.53,sign*(.27+grade*.021),-.50,'#c3c6a8',.010+grade*.003);
  const stringY=drawing?-.27+pull*.24:-.25;
  line(ctx,-span,-.40+pull*.018,0,stringY,'#e8dfba',.009);line(ctx,0,stringY,span,-.40+pull*.018,'#e8dfba',.009);
  // Hands support a real stock instead of pulling a loose vertical bowstring.
  shape(ctx,[{x:-.12,y:-.08},{x:-.24,y:.01},{x:-.36,y:.28},{x:-.19,y:.35},{x:-.07,y:.13}],'#caa67a');
  shape(ctx,[{x:-.24,y:.08},{x:-.39,y:.31},{x:-.21,y:.40},{x:-.10,y:.17}],'#536b49');
  shape(ctx,[{x:.07,y:.03},{x:.19,y:.06},{x:.33,y:.32},{x:.16,y:.39},{x:.035,y:.17}],'#d4b286');
  shape(ctx,[{x:.19,y:.15},{x:.36,y:.35},{x:.18,y:.43},{x:.08,y:.23}],'#536b49');
  shape(ctx,[{x:-.053,y:-.64},{x:.053,y:-.64},{x:.07,y:-.14},{x:.105,y:.10},{x:.14,y:.37},{x:-.14,y:.37},{x:-.105,y:.10},{x:-.07,y:-.14}],color);
  line(ctx,-.055,-.60,-.044,.21,'#4d6854',.022);line(ctx,.055,-.60,.044,.21,'#4d6854',.022);
  line(ctx,0,-.61,0,.21,'#dfcca0',.014);
  for(let i=0;i<4+Math.round(gripRatio*4);i++)line(ctx,-.065,.08+i*.029,.065,.08+i*.029,'#526448',.011);
  ctx.beginPath();ctx.moveTo(.075,.03);ctx.quadraticCurveTo(.18,.065,.115,.17);ctx.lineTo(.08,.16);
  ctx.strokeStyle='#354e3f';ctx.lineWidth=.019;ctx.stroke();line(ctx,.08,.058,.112,.113,'#cdbb82',.017);
  const pointWidth=.013+equipmentValue(tipMass,4,2,14)*.0009;
  line(ctx,0,-.045,0,-.645,'#ead3a5',.013);
  shape(ctx,[{x:-pointWidth,y:-.63},{x:0,y:-.71},{x:pointWidth,y:-.63}],'#718976');
  ctx.save();ctx.translate(0,-.065);ctx.rotate(-Math.PI/2);drawFletching(ctx,0,0,fletching,arrowColor,0,.63);ctx.restore();
  if(grade)drawBurstMagazine(ctx,-.085,-.19,color,burstCount,grouping,1.22);
  for(const sign of[-1,1])for(let i=0;i<3;i++)line(ctx,sign*.073,.015+i*.026,sign*.13,.02+i*.026,'#dfbd91',.022);
  if(scopeMounted) {
    // A low optic tube and its rear lens stay visible below the aiming reticle.
    line(ctx,-.038,-.29,-.038,.015,'#314f43',.017);line(ctx,.038,-.29,.038,.015,'#314f43',.017);
    shape(ctx,[{x:-.043,y:-.35},{x:.043,y:-.35},{x:.067,y:-.025},{x:-.067,y:-.025}],'#3e5b50');
    line(ctx,-.028,-.30,-.045,-.065,'#a2b196',.009);
    ellipse(ctx,0,-.03,.071,.043,'#a8af8b');ellipse(ctx,0,-.03,.056,.031,'#39665e');
    ellipse(ctx,-.016,-.04,.018,.008,'#8ebeb0',-.2);
    line(ctx,-.025,-.355,.025,-.355,'#b8c5a0',.014);
  }
  ctx.restore();
}

function drawGunIcon(ctx,variant,accent,gripRatio,scopeMounted) {
  const p=gunProfile(variant);
  ctx.save();ctx.rotate(-.46);
  // Generic range equipment: each rifle has its own stock and barrel profile.
  line(ctx,-.06,-.025,p.muzzle,-.025,'#465e54',p.barrel+.012);
  line(ctx,-.035,-.03,p.muzzle-.012,-.03,'#a2b5a3',p.barrel*.37);
  line(ctx,p.muzzle-.015,-.025,p.muzzle,-.025,'#c3b18c',p.barrel+.014);
  shape(ctx,[{x:-p.stock,y:-.035},{x:-.22,y:-.025},{x:-.12,y:.006},{x:-.025,y:-.009},{x:p.foreEnd,y:.005},{x:p.foreEnd-.015,y:.066},{x:-.065,y:.066},{x:-.17,y:.10},{x:-p.stock,y:.115}],accent);
  line(ctx,-p.stock,-.025,-p.stock,.106,'#465b4c',.024);
  line(ctx,-p.stock+.025,-.014,-.20,.003,'#d2c4a08a',.009);
  shape(ctx,[{x:-.12,y:.047},{x:-.053,y:.055},{x:-.073,y:p.gripDrop},{x:-.148,y:p.gripDrop+.013}],accent);
  const wraps=2+Math.round(gripRatio*4);
  for(let i=0;i<wraps;i++)line(ctx,-.135,.078+i*(p.gripDrop-.073)/wraps,-.078,.082+i*(p.gripDrop-.073)/wraps,'#415c486b',.006);
  if(p.cheek)shape(ctx,[{x:-p.stock+.035,y:-.028},{x:-.225,y:-.016},{x:-.205,y:.022},{x:-p.stock+.035,y:.025}],'#53685b');
  shape(ctx,[{x:-.095,y:-.045},{x:.065,y:-.045},{x:.08,y:.008},{x:-.10,y:.012}],'#65796b');
  line(ctx,-.083,-.037,.056,-.037,'#c5cfb2',.007);
  ctx.beginPath();ctx.moveTo(-.05,.065);ctx.quadraticCurveTo(.042,.069,.025,.13);ctx.quadraticCurveTo(-.015,.152,-.058,.115);
  ctx.strokeStyle='#425a4a';ctx.lineWidth=.011;ctx.stroke();
  line(ctx,-.024,.07,-.006,.101,'#b6b193',.010);
  const ribCount=3+Math.round(gripRatio*3);
  for(let i=0;i<ribCount;i++){const xx=.035+i*(p.foreEnd-.05)/ribCount;line(ctx,xx,.029,xx-.005,.055,'#4f665753',.006);}
  if(p.rail)for(let i=0;i<5;i++)line(ctx,-.065+i*.025,-.048,-.065+i*.025,-.061,'#587261',.009);
  line(ctx,p.muzzle-.045,-.03,p.muzzle-.045,-.068,'#4b6655',.012);
  if(scopeMounted)drawScopeTube(ctx,-.01,-.104,.26,.028,0);
  else line(ctx,-.06,-.047,-.06,-.079,'#536d5a',.013);
  ctx.restore();
}

function drawFirstPersonGun(ctx,w,h,{tier=20,swayX=0,swayY=0,color='#7c9a83',grip=60,scopeMounted=false}) {
  const p=gunProfile(equipmentVariant(tier)),gripRatio=equipmentValue(grip,60,0,100)/100;
  const size=Math.min(w*.68,h*.50),muzzle=-.59-p.muzzle*.53,fore=-.39-p.foreEnd*.44;
  ctx.save();ctx.translate(w*.5+equipmentValue(swayX*100,0,-12,12),h*.98+equipmentValue(swayY*65,0,-7,7));ctx.scale(size,size);
  ctx.lineCap='round';ctx.lineJoin='round';
  // Barrel and receiver stay low in the view, leaving the target corridor open.
  const barrelWidth=.016+p.barrel*.38;
  shape(ctx,[{x:-barrelWidth,y:muzzle},{x:barrelWidth,y:muzzle},{x:.039,y:-.19},{x:-.039,y:-.19}],'#485f53');
  line(ctx,-barrelWidth*.37,muzzle+.015,-.013,-.24,'#b1c0a6',.008);
  ellipse(ctx,0,muzzle,barrelWidth*1.12,.010,'#b9b591');
  ellipse(ctx,0,muzzle,barrelWidth*.62,.005,'#3d5549');
  line(ctx,0,muzzle+.035,0,muzzle-.017,'#405b4c',.013);
  const half=p.foreWidth;
  // A supporting hand around the fore-end and a second hand at the stock.
  shape(ctx,[{x:-half,y:-.24},{x:-.21,y:-.12},{x:-.37,y:.24},{x:-.21,y:.35},{x:-.055,y:.02}],'#ccaa7e');
  shape(ctx,[{x:-.21,y:.03},{x:-.39,y:.30},{x:-.22,y:.41},{x:-.10,y:.17}],'#536b49');
  shape(ctx,[{x:.055,y:.015},{x:.18,y:.055},{x:.31,y:.29},{x:.17,y:.39},{x:.02,y:.15}],'#d4b084');
  shape(ctx,[{x:.16,y:.16},{x:.33,y:.35},{x:.16,y:.44},{x:.07,y:.24}],'#536b49');
  shape(ctx,[{x:-half*.72,y:fore},{x:half*.72,y:fore},{x:half,y:-.17},{x:.085,y:.025},{x:.11+p.stock*.08,y:.38},{x:-.11-p.stock*.08,y:.38},{x:-.085,y:.025},{x:-half,y:-.17}],color);
  line(ctx,-half*.50,fore+.024,-.079,.27,'#d3c29b87',.010);
  shape(ctx,[{x:-.045,y:-.30},{x:.045,y:-.30},{x:.053,y:.02},{x:-.053,y:.02}],'#5c7464');
  line(ctx,0,-.28,0,.015,'#b1bea0',.010);
  if(p.cheek)shape(ctx,[{x:-.078,y:.15},{x:.077,y:.15},{x:.105,y:.32},{x:-.105,y:.32}],'#506654');
  for(let i=0;i<3+Math.round(gripRatio*4);i++)line(ctx,-.070,.065+i*.027,.070,.065+i*.027,'#405a496b',.009);
  if(p.rail)for(let i=0;i<4;i++)line(ctx,-.043,-.30+i*.045,.043,-.30+i*.045,'#344f4166',.009);
  ctx.beginPath();ctx.moveTo(.075,.025);ctx.quadraticCurveTo(.172,.06,.115,.16);ctx.lineTo(.081,.15);
  ctx.strokeStyle='#3b5545';ctx.lineWidth=.018;ctx.stroke();line(ctx,.080,.055,.109,.106,'#c6b98d',.016);
  for(let i=0;i<3;i++)line(ctx,-half-.020,-.17+i*.032,half*.40,-.175+i*.032,'#dfbc90',.024);
  if(scopeMounted){
    line(ctx,-.036,-.31,-.036,.005,'#344e42',.016);line(ctx,.036,-.31,.036,.005,'#344e42',.016);
    shape(ctx,[{x:-.037,y:-.36},{x:.037,y:-.36},{x:.063,y:-.035},{x:-.063,y:-.035}],'#425f50');
    line(ctx,-.022,-.32,-.044,-.077,'#a7b699',.008);
    ellipse(ctx,0,-.037,.067,.040,'#b2b798');ellipse(ctx,0,-.037,.052,.028,'#416f64');
    ellipse(ctx,-.015,-.047,.017,.007,'#a7cdbb',-.2);
  }else{
    line(ctx,-.038,-.20,-.038,-.23,'#465f4d',.013);line(ctx,.038,-.20,.038,-.23,'#465f4d',.013);
  }
  ctx.restore();
}

function drawBulletIcon(ctx,accent='#b99b5f') {
  ctx.save();ctx.rotate(-.57);
  // One readable range cartridge, with no arrow shaft or fletching.
  shape(ctx,[{x:-.29,y:-.075},{x:.095,y:-.075},{x:.14,y:-.055},{x:.14,y:.055},{x:.095,y:.075},{x:-.29,y:.075}],'#b79b60');
  shape(ctx,[{x:-.28,y:-.058},{x:.09,y:-.058},{x:.12,y:-.039},{x:.12,y:-.015},{x:-.28,y:-.025}],'#dfc890');
  ctx.beginPath();ctx.moveTo(.13,-.055);ctx.lineTo(.22,-.055);
  ctx.quadraticCurveTo(.32,-.047,.385,0);ctx.quadraticCurveTo(.32,.047,.22,.055);
  ctx.lineTo(.13,.055);ctx.closePath();ctx.fillStyle=accent;ctx.fill();
  line(ctx,.155,-.035,.28,-.029,'#eee0b48c',.008);
  line(ctx,.13,-.057,.13,.057,'#7e8059',.010);
  line(ctx,-.30,-.079,-.30,.079,'#8a7f51',.025);
  line(ctx,-.288,-.068,-.288,.068,'#e0cd97',.010);
  line(ctx,-.235,-.073,-.235,.073,'#8b814e6b',.007);
  ctx.restore();
}

function drawCoachIcon(ctx,accent) {
  const skin='#d7af82',shade='#be956d',light='#ebcca2';
  ctx.save();
  // A raised finger and a whistle read as coaching at small shop-card sizes.
  ctx.beginPath();ctx.moveTo(-.28,.20);ctx.quadraticCurveTo(-.49,.23,-.55,.06);
  ctx.strokeStyle='#426b51';ctx.lineWidth=.12;ctx.stroke();
  line(ctx,-.55,.07,-.58,-.065,skin,.080);
  ellipse(ctx,-.58,-.075,.055,.070,skin,-.12);
  line(ctx,-.57,-.10,-.565,-.20,skin,.029);
  line(ctx,-.605,-.105,-.61,-.035,shade,.014);
  ctx.beginPath();ctx.moveTo(.28,.20);ctx.quadraticCurveTo(.54,.27,.38,.29);
  ctx.strokeStyle='#426b51';ctx.lineWidth=.14;ctx.stroke();
  shape(ctx,[{x:-.38,y:.43},{x:-.37,y:.23},{x:-.22,y:.13},{x:0,y:.17},{x:.22,y:.13},{x:.38,y:.24},{x:.39,y:.43}],accent);
  shape(ctx,[{x:-.17,y:.14},{x:0,y:.20},{x:.16,y:.14},{x:.11,y:.43},{x:-.11,y:.43}],'#e5ddbb');
  ellipse(ctx,0,.12,.065,.085,skin);
  shape(ctx,[{x:-.16,y:.135},{x:-.025,y:.20},{x:-.12,y:.28},{x:-.22,y:.17}],'#8fa486');
  shape(ctx,[{x:.16,y:.135},{x:.025,y:.20},{x:.12,y:.28},{x:.22,y:.17}],'#8fa486');
  line(ctx,-.025,.21,-.025,.42,'#6e8263',.010);
  for(const y of[.26,.34,.41])ellipse(ctx,.015,y,.012,.012,'#a39462');
  ctx.beginPath();ctx.roundRect(-.28,.29,.12,.09,.012);ctx.fillStyle='#527552';ctx.fill();
  line(ctx,-.28,.305,-.16,.305,'#a8b28b',.010);
  ellipse(ctx,-.195,-.06,.043,.069,shade);ellipse(ctx,.195,-.06,.043,.069,shade);
  ellipse(ctx,0,-.075,.195,.218,skin);
  ellipse(ctx,.035,-.11,.14,.16,light,-.07);
  ellipse(ctx,-.10,-.01,.032,.019,'#c99170');ellipse(ctx,.11,-.01,.032,.019,'#c99170');
  for(const sign of[-1,1]){
    const x=sign*.073;
    ctx.beginPath();ctx.moveTo(x-.035,-.13);ctx.quadraticCurveTo(x,-.148,x+.034,-.13);
    ctx.strokeStyle='#6c6146';ctx.lineWidth=.014;ctx.stroke();
    ellipse(ctx,x,-.085,.016,.023,'#334735');ellipse(ctx,x+.004,-.093,.005,.006,'#f7efd6');
  }
  ctx.beginPath();ctx.moveTo(.005,-.06);ctx.quadraticCurveTo(-.015,-.01,.014,-.004);
  ctx.strokeStyle='#b98f67';ctx.lineWidth=.010;ctx.stroke();
  ctx.beginPath();ctx.moveTo(-.062,.030);ctx.quadraticCurveTo(.006,.087,.073,.026);
  ctx.strokeStyle='#8a6950';ctx.lineWidth=.014;ctx.stroke();
  ctx.beginPath();ctx.moveTo(-.048,.037);ctx.quadraticCurveTo(.007,.067,.056,.033);
  ctx.strokeStyle='#f1dbb5';ctx.lineWidth=.011;ctx.stroke();
  // Soft forest-green brim, with a small gold target badge on the crown.
  ctx.beginPath();ctx.moveTo(-.22,-.26);ctx.quadraticCurveTo(-.22,-.47,-.04,-.47);
  ctx.quadraticCurveTo(.20,-.48,.22,-.26);ctx.closePath();ctx.fillStyle='#375b46';ctx.fill();
  ctx.beginPath();ctx.moveTo(-.185,-.28);ctx.quadraticCurveTo(.02,-.24,.19,-.285);
  ctx.strokeStyle=accent;ctx.lineWidth=.047;ctx.stroke();
  ellipse(ctx,0,-.25,.32,.055,'#426b50',-.025);
  ctx.beginPath();ctx.ellipse(0,-.245,.29,.032,-.025,0,Math.PI);ctx.strokeStyle='#294d3c';ctx.lineWidth=.011;ctx.stroke();
  ellipse(ctx,.015,-.36,.041,.041,'#c5ac68');
  ctx.beginPath();ctx.arc(.015,-.36,.027,0,TAU);ctx.strokeStyle='#5b704b';ctx.lineWidth=.006;ctx.stroke();
  ellipse(ctx,.015,-.36,.009,.009,'#536746');
  // The gold cord and open whistle mouth remain separate from the smiling face.
  ctx.beginPath();ctx.moveTo(-.06,.16);ctx.quadraticCurveTo(-.02,.34,.24,.285);
  ctx.strokeStyle='#b5a16a';ctx.lineWidth=.009;ctx.stroke();
  ellipse(ctx,.37,.285,.061,.047,skin,-.15);
  ctx.beginPath();ctx.roundRect(.215,.252,.115,.068,.021);ctx.fillStyle='#c7b26c';ctx.fill();
  ctx.beginPath();ctx.roundRect(.31,.265,.068,.030,.005);ctx.fillStyle='#dbc58b';ctx.fill();
  ellipse(ctx,.253,.274,.024,.014,'#647154');
  line(ctx,.224,.305,.309,.305,'#927f48',.009);
  line(ctx,.318,.270,.367,.270,'#f3dca5',.006);
  ctx.restore();
}

function drawAbilityArrowTip(ctx,ability,pointStart,pointWidth,accent) {
  if(ability==='bounce') {
    // A rounded resilient cap and a short compression collar show the rebound.
    const back=pointStart+.012,capWidth=Math.max(.035,pointWidth*1.18);
    ctx.beginPath();ctx.moveTo(pointStart-.026,-.022);
    for(let i=0;i<5;i++)ctx.lineTo(pointStart-.022+i*.009,i%2?.022:-.022);
    ctx.strokeStyle='#566c5b';ctx.lineWidth=.010;ctx.stroke();
    line(ctx,pointStart-.03,-.027,pointStart-.03,.027,'#b4b99a',.012);
    ctx.beginPath();ctx.roundRect(back,-capWidth,.41-back,capWidth*2,.016);
    ctx.fillStyle='#526c5b';ctx.fill();
    ellipse(ctx,.407,0,.020,capWidth,accent);
    ellipse(ctx,.415,-capWidth*.12,.010,capWidth*.68,'#d5d4ae');
    line(ctx,back+.008,-capWidth*.62,.394,-capWidth*.62,'#a4ba98',.005);
    for(const xx of[back+.020,back+.040])line(ctx,xx,-capWidth*.8,xx,capWidth*.8,'#829b79',.006);
  } else {
    // The open teal U-ring is separate from the pointed magnetic arrowhead.
    const width=Math.max(.031,pointWidth),ring=pointStart-.034;
    shape(ctx,[{x:pointStart,y:-width},{x:.42,y:0},{x:pointStart,y:width},{x:pointStart+.012,y:0}],'#4f9292');
    shape(ctx,[{x:pointStart+.008,y:-width*.63},{x:.405,y:-.002},{x:pointStart+.024,y:.004}],'#c0dfd0');
    line(ctx,pointStart+.018,width*.48,.395,.006,accent,.004);
    ctx.beginPath();ctx.moveTo(ring+.014,-.044);ctx.lineTo(ring-.012,-.044);
    ctx.quadraticCurveTo(ring-.032,-.044,ring-.032,-.022);ctx.lineTo(ring-.032,.022);
    ctx.quadraticCurveTo(ring-.032,.044,ring-.012,.044);ctx.lineTo(ring+.014,.044);
    ctx.strokeStyle='#4c858b';ctx.lineWidth=.015;ctx.stroke();
    line(ctx,ring+.005,-.044,ring+.020,-.044,'#bddecf',.017);
    line(ctx,ring+.005,.044,ring+.020,.044,'#84b9b5',.017);
    line(ctx,ring-.032,-.018,ring-.032,.018,'#a3cfbf',.004);
  }
}

/** Draws a transparent shop item illustration, without clearing the canvas. */
export function drawEquipmentIcon(ctx,w,h,{kind='bow',tier=0,color,grip=30,elasticity=40,tipMass=4,fletching,weaponType='bow',scopeMounted=false,burstCount=1,grouping=0}={}) {
  const variant=equipmentVariant(tier);
  const colors=['#a67548','#b88c4c','#487967','#b69a54','#8d6850','#887447','#788b60','#668b80','#526e78','#a2a568','#b39467','#7c889e','#709e95','#a79679','#bcafcf','#718ea2','#598f83','#a79679','#b1a471','#bcafcf','#7c9a83','#9a8467','#7b949b','#9c8e73','#a8b1bf'];
  const accent=color||colors[variant];
  const gripRatio=equipmentValue(grip,30,0,100)/100,elasticRatio=equipmentValue(elasticity,40,0,100)/100;
  ctx.save();ctx.translate(w*.5,h*.5);
  const s=Math.min(w,h);ctx.scale(s,s);
  ellipse(ctx,0,.39,.28,.024,'rgba(49,66,45,.1)');
  ctx.lineCap='round';ctx.lineJoin='round';
  if(kind==='coach') {
    ctx.save();ctx.scale(Math.min(1,w/h/1.55),1);drawCoachIcon(ctx,color||'#6f8e71');ctx.restore();
  } else if(kind==='bullet') {
    drawBulletIcon(ctx,color||'#ae9060');
  } else if(kind!=='arrow'&&weaponType==='gun') {
    drawGunIcon(ctx,variant,accent,gripRatio,scopeMounted);
  } else if(kind!=='arrow'&&weaponType==='crossbow') {
    drawCrossbowIcon(ctx,variant,accent,gripRatio,elasticRatio,scopeMounted,burstCount,grouping);
  } else if(kind==='bow') {
    ctx.rotate(-.12+(variant%3-1)*.035);
    const p=bowProfiles[variant%bowProfiles.length],limbWidth=.025+elasticRatio*.022;
    const limb=()=>{
      ctx.beginPath();ctx.moveTo(p.tipX,-p.length);
      ctx.bezierCurveTo(p.tipX+p.curl,-p.length*.94,p.reach,-p.length*.80,p.reach*.87,-p.length*.45);
      ctx.quadraticCurveTo(p.waist+.01,-p.length*.16,p.waist,0);
      ctx.quadraticCurveTo(p.waist+.01,p.length*.16,p.reach*.87,p.length*.45);
      ctx.bezierCurveTo(p.reach,p.length*.80,p.tipX+p.curl,p.length*.94,p.tipX,p.length);
    };
    limb();ctx.strokeStyle='rgba(57,68,45,.20)';ctx.lineWidth=limbWidth+.012;ctx.stroke();
    limb();ctx.strokeStyle=accent;ctx.lineWidth=limbWidth;ctx.stroke();
    ctx.save();ctx.translate(-.007,0);limb();ctx.strokeStyle=variant===9?'#ebe2ae':'#ddc799';ctx.lineWidth=.007;ctx.stroke();ctx.restore();
    if(variant===9) {
      // Bamboo composite limbs have visible laminations and node bindings.
      ctx.save();ctx.translate(.008,0);limb();ctx.strokeStyle='#71845d';ctx.lineWidth=.004;ctx.stroke();ctx.restore();
      for(const sign of[-1,1])for(const distance of[.18,.27])line(ctx,p.reach*.77-.015,sign*distance,p.reach*.77+.026,sign*(distance-.012),'#b8bd83',.015);
    }
    line(ctx,p.tipX,-p.length,-.075,0,'#e8dab7',.006);line(ctx,-.075,0,p.tipX,p.length,'#e8dab7',.006);
    const handleWidth=.045+gripRatio*.032,handleLength=.10+gripRatio*.07;
    line(ctx,p.waist,-handleLength/2,p.waist,handleLength/2,variant===4?'#845c40':'#3d5746',handleWidth);
    const wraps=3+Math.round(gripRatio*6);
    for(let i=0;i<wraps;i++){
      const y=-handleLength*.43+i*handleLength*.86/(wraps-1);
      line(ctx,p.waist-handleWidth*.42,y,p.waist+handleWidth*.42,y+.008,'rgba(230,213,170,.65)',.004);
    }
    if(gripRatio>.8)for(const sign of[-1,1])line(ctx,p.waist-handleWidth*.6,sign*handleLength*.51,p.waist+handleWidth*.6,sign*handleLength*.51,'#c8ac70',.009);
    if(variant===3||variant===10||variant===11)for(const sign of[-1,1]){
      ellipse(ctx,p.reach*.83,sign*p.length*.52,.014,.021,variant===3?'#e6dca9':'#dac58d');
      line(ctx,p.reach*.83-.014,sign*p.length*.52,p.reach*.83+.014,sign*p.length*.52,'#5e7353',.004);
    }
    line(ctx,-.28,0,.33,0,'#dec396',.010);
    shape(ctx,[{x:.32,y:-.020},{x:.40,y:0},{x:.32,y:.020}],'#647968');
    shape(ctx,[{x:-.26,y:-.003},{x:-.33,y:-.043},{x:-.36,y:-.020},{x:-.29,y:.006}],'#af8357');
    if(scopeMounted){line(ctx,p.waist,-.08,p.waist+.07,-.08,'#566e57',.014);drawScopeTube(ctx,p.waist+.04,-.13,.15,.022,0);}
  } else {
    ctx.rotate(-.57+(variant%3-1)*.025);
    const mass=equipmentValue(tipMass,4,2,14);
    const pointLength=.062+mass*.0045,pointWidth=.018+mass*.0014;
    const pointStart=.42-pointLength;
    const shaft=variant===0||variant===4?'#b59663':variant===2||variant===7||variant===9?'#5b746c':'#899486';
    line(ctx,-.41,0,pointStart+.028,0,shaft,.017);
    line(ctx,-.39,-.004,pointStart+.024,-.004,'#e6d6ae',.0035);
    const metal=variant===5||variant===10?'#b19b5e':variant===8?'#65756b':variant===3?'#b8c4b9':'#738a78';
    const ability=kind==='arrow'?(tier===12?'bounce':tier===13?'magnetic':null):null;
    if(ability)drawAbilityArrowTip(ctx,ability,pointStart,pointWidth,accent);
    else{
      shape(ctx,[{x:pointStart,y:-pointWidth},{x:.42,y:0},{x:pointStart,y:pointWidth},{x:pointStart+.012,y:0}],metal);
      line(ctx,pointStart+.008,-pointWidth*.62,.397,-.002,'rgba(246,242,213,.77)',.004);
      if(mass>=9)line(ctx,pointStart-.016,-.014,pointStart-.016,.014,metal,.014);
    }
    drawFletching(ctx,-.38,0,fletching,accent,variant);
    line(ctx,-.415,-.017,-.415,.017,'#576b53',.012);
    for(let i=0;i<1+variant%3;i++)line(ctx,.11+i*.024,-.009,.11+i*.024,.009,accent,.007);
  }
  ctx.restore();
}

/** Foreground bow and drawing hand. The shooting corridor stays unobstructed. */
export function drawFirstPersonBow(ctx,w,h,{tier=0,charge=0,swayX=0,swayY=0,color='#a9784e',drawing=false,grip=30,elasticity=40,tipMass=4,fletching,arrowColor='#a35f3f',weaponType='bow',scopeMounted=false,burstCount=1,grouping=0}={}) {
  if(weaponType==='gun'){drawFirstPersonGun(ctx,w,h,{tier,swayX,swayY,color,grip,scopeMounted});return;}
  if(weaponType==='crossbow'){drawFirstPersonCrossbow(ctx,w,h,{charge,swayX,swayY,color,drawing,grip,elasticity,tipMass,fletching,arrowColor,scopeMounted,burstCount,grouping});return;}
  const pull=Math.max(0,Math.min(1,charge));
  const gripRatio=equipmentValue(grip,30,0,100)/100,elasticRatio=equipmentValue(elasticity,40,0,100)/100;
  const pointMass=equipmentValue(tipMass,4,2,14);
  const size=Math.min(w*.66,h*.45);
  const gripX=w*(w/h>1.5?.39:.32)+Math.max(-12,Math.min(12,swayX*100));
  const gripY=h*.93+Math.max(-7,Math.min(7,swayY*65));
  ctx.save();ctx.translate(gripX,gripY);ctx.scale(size,size);ctx.rotate(-.12);
  ctx.lineJoin='round';ctx.lineCap='round';

  // A soft rim shadow gives the carved limbs a tangible foreground weight.
  const bend=pull*(.025+elasticRatio*.025),limbWidth=.034+elasticRatio*.03;
  const limb=()=>{
    ctx.beginPath();ctx.moveTo(-.11,-.62);
    ctx.bezierCurveTo(-.22,-.55,-.23,-.42,-.12-bend,-.23);
    ctx.bezierCurveTo(-.055-bend,-.13,-.025,-.07,0,0);
    ctx.bezierCurveTo(-.025,.08,-.055-bend,.14,-.12-bend,.25);
    ctx.bezierCurveTo(-.23,.44,-.22,.56,-.11,.64);
  };
  limb();ctx.strokeStyle='rgba(38,48,31,.28)';ctx.lineWidth=limbWidth+.015;ctx.stroke();
  limb();ctx.strokeStyle=color;ctx.lineWidth=limbWidth;ctx.stroke();
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
  const pointLength=.04+pointMass*.003,pointWidth=.012+pointMass*.001;
  shape(ctx,[{x:pointLength,y:0},{x:-.015,y:-pointWidth},{x:-.007,y:0},{x:-.015,y:pointWidth}],'#617769');
  line(ctx,pointLength*.77,-.002,-.01,-pointWidth*.68,'#b6c7aa',.003);ctx.restore();
  ctx.save();ctx.translate(nockX,nockY);ctx.rotate(angle);
  drawFletching(ctx,.012,0,fletching,arrowColor,0,.68);
  ctx.restore();

  if(scopeMounted){line(ctx,0,-.16,.085,-.20,'#5d7258',.022);drawScopeTube(ctx,.09,-.25,.20,.032,angle);}

  // Leather grip, left hand and a small sleeve establish the first-person view.
  line(ctx,-.003,-.074,.005,.085,'#4c4835',.068+gripRatio*.026);
  const gripWraps=4+Math.round(gripRatio*6);
  for(let i=0;i<gripWraps;i++){const y=-.06+i*.125/(gripWraps-1);line(ctx,-.038,y,.037,y+.005,'#a68b62',.006);}
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
