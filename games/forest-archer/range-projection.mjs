// The landscape was photographed from the same 1.65 m eye height as the range.
// A ground ray intersects y=0. Projecting that point back into the original
// photograph keeps the grass under a target in place at any camera position.
const eye = 1.65;

function framing(w, h, iw, ih, skyline) {
  const focal = Math.min(w*1.08, h*1.5);
  const cover = 1.045*Math.max(w/iw, h*.405/(ih*skyline), h*.595/(ih*(1-skyline)));
  return {focal, width:iw*cover, height:ih*cover, skyline};
}

export function landscapeRow(screenY, camera, frame) {
  const slope = (screenY-camera.horizon)/camera.focal;
  // Above the horizon mountains and clouds are effectively at infinity.
  const inverseDepth = Math.max(0,slope)/Math.max(.1,camera.y);
  const magnification = 1+camera.z*inverseDepth;
  const width = frame.width*camera.focal/frame.focal*magnification;
  return {
    x: camera.cx-camera.x*camera.focal*inverseDepth-width*.5,
    width,
    v: frame.skyline + frame.focal/frame.height*
      (slope<0?slope:eye*inverseDepth/magnification)
  };
}

function drawPhotoStrips(ctx,w,h,image,camera,frame) {
  const iw=image.naturalWidth,ih=image.naturalHeight;
  // Clamp the photograph's vertical edge and reflect at its side when the
  // player pans past the original frame. Keep the optical centre free to move.
  function strip(top,bottom,a,b) {
    const mid=landscapeRow((top+bottom)*.5,camera,frame);
    const sy=Math.min(ih-1,Math.max(0,a.v*ih));
    const end=Math.min(ih,Math.max(sy+1e-3,b.v*ih));
    const startTile=Math.floor(-mid.x/mid.width),last=Math.ceil((w-mid.x)/mid.width);
    for(let k=startTile;k<last;k++){
      const left=mid.x+k*mid.width;
      if(k%2===0)ctx.drawImage(image,0,sy,iw,end-sy,left,top,mid.width,bottom-top);
      else{
        ctx.save();ctx.translate(left+mid.width,0);ctx.scale(-1,1);
        ctx.drawImage(image,0,sy,iw,end-sy,0,top,mid.width,bottom-top);ctx.restore();
      }
    }
  }
  const row=y=>landscapeRow(y,camera,frame);
  const seam=Math.max(0,Math.min(h,camera.horizon));
  if(seam>0){
    const edge=Math.min(seam,Math.max(0,camera.horizon-frame.skyline*frame.height*camera.focal/frame.focal));
    if(edge>0)strip(0,edge,row(0),row(edge));
    if(edge<seam)strip(edge,seam,row(edge),row(seam));
  }
  if(seam>=h)return;
  if(Math.abs(camera.z)+Math.abs(camera.x)<1e-6){
    strip(seam,h,row(seam),row(h));return;
  }
  const step=Math.max(2,Math.round(h/170));
  for(let y=seam;y<h;y+=step){
    const bottom=Math.min(h,y+step+.25);
    strip(y,bottom,row(y),row(bottom));
  }
}

// A seamless swatch sampled from the same meadow supplies detail beyond the
// foreground in the photograph. The trail repeats along the course in metres.
const groundTiles=new WeakMap();
const surface=(w,h)=>typeof OffscreenCanvas==='function'?new OffscreenCanvas(w,h):Object.assign(document.createElement('canvas'),{width:w,height:h});
function groundTile(image){
  let tile=groundTiles.get(image);if(tile)return tile;
  const size=512,half=size/2;
  function swatch(x,y,sw,sh){
    const canvas=surface(size,size),ctx=canvas.getContext('2d',{willReadFrequently:true});
    for(let j=0;j<2;j++)for(let i=0;i<2;i++){
      ctx.save();ctx.translate(i?size:0,j?size:0);ctx.scale(i?-1:1,j?-1:1);
      ctx.drawImage(image,x*image.naturalWidth,y*image.naturalHeight,sw*image.naturalWidth,sh*image.naturalHeight,0,0,half,half);ctx.restore();
    }
    return canvas;
  }
  tile=swatch(.24,.735,.17,.14);
  const ctx=tile.getContext('2d'),grass=swatch(.58,.70,.105,.09);
  const pattern=ctx.createPattern(grass,'repeat');ctx.save();ctx.globalAlpha=.38;
  ctx.translate(256,256);ctx.rotate(Math.PI/2);ctx.scale(.5,.5);
  ctx.fillStyle=pattern;ctx.fillRect(-512,-512,1024,1024);ctx.restore();
  const trail=surface(size,size),trailCtx=trail.getContext('2d',{willReadFrequently:true});
  const color=surface(1,1).getContext('2d');
  color.drawImage(image,image.naturalWidth*.49,image.naturalHeight*.84,image.naturalWidth*.025,image.naturalHeight*.06,0,0,1,1);
  const [red,green,blue]=color.getImageData(0,0,1,1).data;
  trailCtx.fillStyle='rgb('+[red,green,blue].join(',')+')';trailCtx.fillRect(0,0,size,size);
  let seed=93802;
  const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  // Scatter small pieces of gravel over the path in plan view. A photographed
  // path already contains perspective and would stretch into horizontal bands.
  for(let i=0;i<1400;i++){
    const x=size*(.415+random()*.17),y=random()*size,r=.28+random()**3*1.75;
    trailCtx.fillStyle=i%3?'rgba(29,24,19,.21)':'rgba(248,231,202,.43)';
    trailCtx.beginPath();trailCtx.ellipse(x,y,r*1.45,r,random()*Math.PI,0,Math.PI*2);trailCtx.fill();
  }
  for(let i=0;i<2200;i++){
    const x=random()*size,y=random()*size,l=1+random()*2;
    ctx.fillStyle=i%4?'rgba(20,34,16,.19)':'rgba(237,227,174,.35)';
    ctx.fillRect(x,y,l,1);
  }
  trailCtx.globalCompositeOperation='destination-in';
  const edge=trailCtx.createLinearGradient(0,0,size,0);
  for(const [at,alpha] of [[0,0],[.42,0],[.462,.7],[.48,.94],[.52,.96],[.543,.7],[.582,0],[1,0]])edge.addColorStop(at,'rgba(0,0,0,'+alpha+')');
  trailCtx.fillStyle=edge;trailCtx.fillRect(0,0,size,size);ctx.drawImage(trail,0,0);
  if(tile.transferToImageBitmap)tile=tile.transferToImageBitmap();
  groundTiles.set(image,tile);return tile;
}
const groundPatterns=new WeakMap();
function drawGroundDetail(ctx,w,h,camera,image){
  if(camera.z<=2)return;
  let entry=groundPatterns.get(ctx);
  if(entry?.image!==image){entry={image,texture:ctx.createPattern(groundTile(image),'repeat')};groundPatterns.set(ctx,entry);}
  const texture=entry.texture;
  if(!texture)return;
  const start=Math.max(0,camera.horizon+.006*camera.focal),step=Math.max(2,Math.round(h/190));
  const blend=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  const originalAlpha=ctx.globalAlpha;
  for(let y=start;y<h;y+=step){
    const bottom=Math.min(h,y+step+.26),down=((y+bottom)*.5-camera.horizon)/camera.focal;
    const depth=camera.y/down,zoom=camera.focal/depth,worldZ=camera.z+depth;
    const pixelX=18/512*zoom,pixelY=pixelX*down;
    const left=camera.cx-(camera.x+9)*zoom+Math.sin(worldZ*.17)*.28*zoom;
    const top=(y+bottom)*.5+worldZ/18*512*pixelY;
    ctx.save();ctx.globalAlpha=originalAlpha*blend((camera.z-2)/14)*blend((down-.006)/.11);
    ctx.translate(left,top);ctx.scale(pixelX,pixelY);ctx.fillStyle=texture;
    ctx.fillRect(-left/pixelX,(y-top)/pixelY,w/pixelX,(bottom-y)/pixelY);ctx.restore();
  }
}

const scheduled=new WeakSet();
export function prepareRangeLandscape(image){
  if(scheduled.has(image))return;
  scheduled.add(image);
  const warm=()=>groundTile(image);
  if(typeof requestIdleCallback==='function')requestIdleCallback(warm,{timeout:900});
  else setTimeout(warm,80);
}

export function drawRangeLandscape(ctx,w,h,camera,image,skyline) {
  const frame=framing(w,h,image.naturalWidth,image.naturalHeight,skyline);
  drawPhotoStrips(ctx,w,h,image,camera,frame);
  drawGroundDetail(ctx,w,h,camera,image);
}
