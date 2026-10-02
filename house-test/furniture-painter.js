// Draw approved picture pixels on a 2D canvas; the grid only warps their anchors.
import {expandBookshelfTriangle} from './bookshelf-art.js?v=20261002-side-table-v2';
const imageCache=new Map();
const compositeCache=new Map();
const assetVersion=new URL(import.meta.url).searchParams.get('v')||'20261002-side-table-v2';
function loadImage(path){
 if(!imageCache.has(path))imageCache.set(path,new Promise((resolve,reject)=>{
  const image=new Image();
  image.onload=()=>resolve(image);
  image.onerror=()=>{imageCache.delete(path);reject(new Error('Furniture image unavailable: '+path));};
  image.src=path+'?v='+encodeURIComponent(assetVersion);
 }));
 return imageCache.get(path);
}
function polygon(ctx,points){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();}
function triangle(ctx,image,source,target,pad){
 const [p,q,r]=source,[a,b,c]=target,ux=q[0]-p[0],uy=q[1]-p[1],vx=r[0]-p[0],vy=r[1]-p[1],det=ux*vy-uy*vx;
 if(Math.abs(det)<1e-8)return;
 const ma=((b.x-a.x)*vy-(c.x-a.x)*uy)/det,mc=((c.x-a.x)*ux-(b.x-a.x)*vx)/det;
 const mb=((b.y-a.y)*vy-(c.y-a.y)*uy)/det,md=((c.y-a.y)*ux-(b.y-a.y)*vx)/det;
 // A subpixel overlap prevents seams between adjoining image triangles.
 const expanded=expandBookshelfTriangle(target,pad);
 ctx.save();polygon(ctx,expanded);ctx.clip();
 ctx.transform(ma,mb,mc,md,a.x-ma*p[0]-mc*p[1],a.y-mb*p[0]-md*p[1]);
 ctx.drawImage(image,0,0);
 ctx.restore();
}
export async function paintFurniture(canvas,geometry){
 const composition=geometry.art.composite;
 const sourceImages=geometry.art.layers?geometry.art.layers.map(layer=>layer.image):composition?composition.layers.map(layer=>layer.image):geometry.art.sprite?[geometry.art.sprite.image]:geometry.art.triangles.map(t=>t.image);
 const paths=[...new Set(sourceImages)],loaded=await Promise.all(paths.map(loadImage));
 if(!canvas.isConnected)return;
 const images=new Map(paths.map((path,i)=>[path,loaded[i]])),density=Math.min(2,devicePixelRatio||1);
 let composed;
 if(composition){
  const key=JSON.stringify(composition);
  composed=compositeCache.get(key);
  if(!composed){
   composed=document.createElement('canvas');[composed.width,composed.height]=composition.canvas;
   const painter=composed.getContext('2d');painter.imageSmoothingEnabled=true;painter.imageSmoothingQuality='high';
   for(const layer of composition.layers){
    const image=images.get(layer.image);
    if(layer.sourceRect)painter.drawImage(image,...layer.sourceRect,...layer.rect);
    else painter.drawImage(image,...layer.rect);
   }
   if(compositeCache.size>=6)compositeCache.delete(compositeCache.keys().next().value);
   compositeCache.set(key,composed);
  }
 }
 canvas.width=Math.max(1,Math.ceil(geometry.width*density));canvas.height=Math.max(1,Math.ceil(geometry.height*density));
 const ctx=canvas.getContext('2d');ctx.scale(density,density);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 if(geometry.art?.layers){
  for(const layer of geometry.art.layers){
   let picture=images.get(layer.image);
   if(layer.rect&&layer.sourceRect){
    const key=JSON.stringify([layer.image,layer.rect,layer.sourceRect,geometry.art.canvas]);
    let framed=compositeCache.get(key);
    if(!framed){
     framed=document.createElement('canvas');[framed.width,framed.height]=geometry.art.canvas;
     framed.getContext('2d').drawImage(picture,...layer.sourceRect,...layer.rect);
     if(compositeCache.size>=6)compositeCache.delete(compositeCache.keys().next().value);
     compositeCache.set(key,framed);
    }
    picture=framed;
   }
   for(const piece of layer.triangles){
    const target=piece.target.map(p=>({x:p.x-geometry.left,y:p.y-geometry.top}));
    triangle(ctx,picture,piece.source,target,.42/density);
   }
  }
 }else if(geometry.art?.sprite){
  const sprite=geometry.art.sprite;ctx.drawImage(images.get(sprite.image),sprite.x-geometry.left,sprite.y-geometry.top,sprite.width,sprite.height);
 }else if(geometry.art?.triangles){
  for(const piece of geometry.art.triangles){
   const target=piece.target.map(p=>({x:p.x-geometry.left,y:p.y-geometry.top}));
   const [a,b,c]=target,area=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
   if(Math.abs(area)<1e-8||!target.every(p=>Number.isFinite(p.x+p.y)))continue;
   triangle(ctx,composed||images.get(piece.image),piece.source,target,.42/density);
  }
 }
 canvas.dataset.sources=paths.join(' ');canvas.dataset.density=String(density);
 if(geometry.art.layers||composition)canvas.dataset.layers=(geometry.art.layers||composition.layers).map(layer=>layer.id).join(' ');
 canvas.parentElement.dataset.renderState='ready';
}
