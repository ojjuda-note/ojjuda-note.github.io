// Rasterize the calibrated faces before CSS scaling/filtering. Android WebView
// can clip large perspective-transformed <img> layers before their clip-path.
const imageCache=new Map();
const assetVersion=new URL(import.meta.url).searchParams.get('v')||'20261001-renderfix1';
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
function triangle(ctx,image,source,target){
 const [p,q,r]=source,[a,b,c]=target,ux=q[0]-p[0],uy=q[1]-p[1],vx=r[0]-p[0],vy=r[1]-p[1],det=ux*vy-uy*vx;
 if(Math.abs(det)<1e-8)return;
 const ma=((b.x-a.x)*vy-(c.x-a.x)*uy)/det,mc=((c.x-a.x)*ux-(b.x-a.x)*vx)/det;
 const mb=((b.y-a.y)*vy-(c.y-a.y)*uy)/det,md=((c.y-a.y)*ux-(b.y-a.y)*vx)/det;
 const cx=(a.x+b.x+c.x)/3,cy=(a.y+b.y+c.y)/3;
 // A subpixel overlap prevents antialias seams between adjoining triangles.
 const expanded=target.map(p=>{const d=Math.hypot(p.x-cx,p.y-cy)||1;return {x:p.x+(p.x-cx)*.3/d,y:p.y+(p.y-cy)*.3/d};});
 ctx.save();polygon(ctx,expanded);ctx.clip();
 ctx.transform(ma,mb,mc,md,a.x-ma*p[0]-mc*p[1],a.y-mb*p[0]-md*p[1]);
 const left=Math.min(...source.map(p=>p[0])),top=Math.min(...source.map(p=>p[1])),right=Math.max(...source.map(p=>p[0])),bottom=Math.max(...source.map(p=>p[1]));
 ctx.drawImage(image,left,top,right-left,bottom-top,left,top,right-left,bottom-top);ctx.restore();
}
export async function paintFurniture(canvas,geometry,project){
 const paths=[...new Set(geometry.faces.map(face=>face.image))],loaded=await Promise.all(paths.map(loadImage));
 if(!canvas.isConnected)return;
 const images=new Map(paths.map((path,i)=>[path,loaded[i]])),density=Math.min(2,devicePixelRatio||1);
 canvas.width=Math.max(1,Math.ceil(geometry.width*density));canvas.height=Math.max(1,Math.ceil(geometry.height*density));
 const ctx=canvas.getContext('2d');ctx.scale(density,density);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 for(const face of geometry.faces){
  if(!face.matrix)continue;
  const local=p=>({x:p.x-geometry.left,y:p.y-geometry.top}),outline=face.outline.map(local);
  const xs=face.clip.map(p=>p[0]),ys=face.clip.map(p=>p[1]),left=Math.min(...xs),top=Math.min(...ys),width=Math.max(...xs)-left,height=Math.max(...ys)-top;
  const nx=Math.max(1,Math.min(10,Math.ceil(width/140))),ny=Math.max(1,Math.min(12,Math.ceil(height/140)));
  ctx.save();polygon(ctx,outline);ctx.clip();
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
   const x0=left+width*x/nx,x1=left+width*(x+1)/nx,y0=top+height*y/ny,y1=top+height*(y+1)/ny;
   const source=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],target=source.map(p=>local(project(face.matrix,p)));
   if(!target.every(p=>Number.isFinite(p.x+p.y)))continue;
   triangle(ctx,images.get(face.image),[source[0],source[1],source[2]],[target[0],target[1],target[2]]);
   triangle(ctx,images.get(face.image),[source[0],source[2],source[3]],[target[0],target[2],target[3]]);
  }
  ctx.restore();
 }
 canvas.dataset.sources=paths.join(' ');canvas.dataset.density=String(density);
 canvas.parentElement.dataset.renderState='ready';
}
