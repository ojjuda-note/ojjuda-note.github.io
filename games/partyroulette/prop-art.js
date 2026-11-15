(() => {
  'use strict';
  const photo = '/games/drinking/local/art/partyroulette.webp';
  // Coordinates in the existing 840 × 627 tabletop photograph.
  const crop = {x:468, y:176, width:110, height:116};
  const frames = new Map();
  const views = new WeakMap();
  const pitch = Math.PI / 3;
  let surface;

  function markup() {
    return '<div class="pr-prop"><div class="pr-facing">'+
      '<div class="pr-photo"><img class="pr-still" src="'+photo+'" alt="탁자 위의 게임용 리볼버" draggable="false"></div>'+
      '<canvas class="pr-roll" aria-hidden="true" width="110" height="116"></canvas>'+
      '<i class="pr-flash" aria-hidden="true"></i>'+
      '<button type="button" class="pr-swipe" aria-label="쓸어내려 탄창 돌리기"></button>'+
      '<button type="button" class="pr-trigger" aria-label="방아쇠 누르기" hidden></button>'+
      '</div></div>';
  }

  function readSurface(image) {
    const {width, height, x, y} = crop;
    const tile = document.createElement('canvas');
    tile.width=width; tile.height=height;
    const ctx=tile.getContext('2d', {willReadFrequently:true});
    if(!ctx)return null;
    ctx.drawImage(image,x,y,width,height,0,0,width,height);
    const pixels=ctx.getImageData(0,0,width,height).data;
    // Estimate the fixed studio lighting from an unfluted strip of the metal.
    const shade=Array.from({length:height},(_,row)=>{
      let sum=0, samples=0;
      for(let j=Math.max(0,row-4);j<=Math.min(height-1,row+4);j++){
        for(let i=76;i<82;i++){
          const k=(j*width+i)*4;
          sum+=pixels[k]*.3+pixels[k+1]*.59+pixels[k+2]*.11; samples++;
        }
      }
      return Math.max(22,sum/samples);
    });
    return {ctx,pixels,shade};
  }

  function frame(index) {
    if(frames.has(index))return frames.get(index);
    const {width,height}=crop, {ctx,pixels,shade}=surface;
    const result=ctx.createImageData(width,height), mid=55, radius=55;
    for(let y=0;y<height;y++){
      const face=Math.asin(Math.max(-1,Math.min(1,(y-mid)/radius)));
      const phase=face-index*pitch/32;
      const u=phase-pitch*Math.floor(phase/pitch+.5);
      const sample=mid+radius*Math.sin(u), first=Math.floor(sample), fraction=sample-first;
      for(let x=0;x<width;x++){
        const a=(first*width+x)*4, b=a+4*width, out=(y*width+x)*4;
        for(let c=0;c<3;c++)result.data[out+c]=shade[y]*(pixels[a+c]/shade[first]*(1-fraction)+pixels[b+c]/shade[first+1]*fraction);
        result.data[out+3]=255;
      }
    }
    frames.set(index,result);
    return result;
  }

  function rotate(prop,radians) {
    if(!prop||!Number.isFinite(radians))return;
    let view=views.get(prop);
    if(!view){view={image:prop.querySelector('.pr-still'),canvas:prop.querySelector('.pr-roll'),frame:-1};views.set(prop,view);}
    view.angle=radians;
    if(!view.image.complete||!view.image.naturalWidth){
      if(!view.listening){view.listening=true;view.image.addEventListener('load',()=>rotate(prop,view.angle),{once:true});}
      return;
    }
    const step=Math.round(radians*32/pitch), index=((step%32)+32)%32;
    if(index===view.frame)return;
    const ctx=view.canvas.getContext('2d');
    if(!ctx)return;
    view.frame=index;
    if(index===0){ctx.clearRect(0,0,crop.width,crop.height);return;}
    surface??=readSurface(view.image);
    if(surface)ctx.putImageData(frame(index),0,0);
  }

  function flash(prop) {
    if(!prop || document.hidden)return;
    // The prop is rotated and clipped on portrait phones. Put the light above the entire game.
    const surface = document.fullscreenElement || document.body;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && !document.querySelector('.pr-screen-flash')) {
      const light = document.createElement('div');
      light.className = 'pr-screen-flash';
      light.setAttribute('aria-hidden','true');
      surface.append(light);
      light.addEventListener('animationend', () => light.remove(), {once:true});
      window.setTimeout(() => light.remove(), 360);
    }
    const element=prop.querySelector('.pr-flash');
    element.classList.add('pr-lit');
    window.setTimeout(()=>element.classList.remove('pr-lit'),220);
  }
  window.PartyRouletteArt={markup,rotate,flash};
})();
