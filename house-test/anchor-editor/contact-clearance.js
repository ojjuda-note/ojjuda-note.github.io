// Clearance below an object's actual support contacts. The source pixels and
// the editor's registered picture mesh are authoritative; transparent margins
// do not become a second collision box around the whole plant.
import {normalizeMesh} from './mesh.js?v=20261006-vine1';

const cache=new WeakMap(),EPS=1e-7;
const meshes=view=>view?.pictureLayers?.map(layer=>layer.mesh)||(view?.mesh?[view.mesh]:[]);
export const hasBelowContact=view=>meshes(view).some(mesh=>mesh.anchors?.some(a=>Number.isFinite(a.world?.z)&&a.world.z<-EPS));
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
export function belowContactPixels(mesh,pixels){
 const {width,height,data}=pixels,m=normalizeMesh(mesh);
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>16000000||data.length!==width*height*4)throw new Error('그림 크기를 확인해 주세요.');
 const boxes=[];let minimum=0;
 for(const ids of m.indices){
  const a=ids.map(i=>m.anchors[i]),s=a.map(v=>v.source),det=cross(...s);
  if(a.every(v=>v.world.z>=0))continue;
  const coefficients=Object.fromEntries(['x','y','z'].map(k=>{
   const u=a[1].world[k]-a[0].world[k],v=a[2].world[k]-a[0].world[k];
   const dx=(u*(s[2].y-s[0].y)-v*(s[1].y-s[0].y))/det,dy=(v*(s[1].x-s[0].x)-u*(s[2].x-s[0].x))/det;
   return [k,{dx,dy,origin:a[0].world[k],pad:(Math.abs(dx)+Math.abs(dy))*.5}];
  }));
  const groups=new Map(),sign=Math.sign(det);
  const left=Math.max(0,Math.floor(Math.min(...s.map(p=>p.x)))),right=Math.min(width,Math.ceil(Math.max(...s.map(p=>p.x))));
  const top=Math.max(0,Math.floor(Math.min(...s.map(p=>p.y)))),bottom=Math.min(height,Math.ceil(Math.max(...s.map(p=>p.y))));
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
   if(data[(y*width+x)*4+3]<8)continue;
   const p={x:x+.5,y:y+.5};if(!s.every((v,i)=>sign*cross(v,s[(i+1)%3],p)>=-EPS))continue;
   const z=coefficients.z.origin+coefficients.z.dx*(p.x-s[0].x)+coefficients.z.dy*(p.y-s[0].y);
   if(z-coefficients.z.pad>=-EPS)continue;
   const key=(y>>5)*Math.ceil(width/32)+(x>>5);
   let b=groups.get(key);if(!b){b={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:0,maxZ:-Infinity};groups.set(key,b);}
   for(const k of ['x','y','z']){
    const c=coefficients[k],value=c.origin+c.dx*(p.x-s[0].x)+c.dy*(p.y-s[0].y),axis=k.toUpperCase();
    b['min'+axis]=Math.min(b['min'+axis],value-c.pad);b['max'+axis]=Math.max(b['max'+axis],k==='z'?Math.min(0,value+c.pad):value+c.pad);
   }
  }
  for(const b of groups.values()){minimum=Math.min(minimum,b.minZ);boxes.push(b);}
 }
 return {minimum,boxes,referenceDimensions:m.referenceDimensions};
}
export function pictureBelowContact(view,image){
 if(!hasBelowContact(view))return {minimum:0,boxes:[],referenceDimensions:view.mesh?.referenceDimensions};
 const key=JSON.stringify([meshes(view),view.placement]),previous=cache.get(image);if(previous?.key===key)return previous.value;
 const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
 const pixels=ctx.getImageData(0,0,width,height),p={...view.placement,x:0,y:0,elevation:0};
 const boxes=meshes(view).flatMap(mesh=>placedContactBoxes(belowContactPixels(mesh,pixels),p));
 const value={minimum:boxes.reduce((min,b)=>Math.min(min,b.minZ),0),boxes,referenceDimensions:{width:p.width,depth:p.depth,height:p.height}};cache.set(image,{key,value});return value;
}
export function placedContactBoxes(profile,p){
 const ref=profile.referenceDimensions,front=p.direction==='center';
 const sx=ref?(front?p.width/ref.width:p.depth/ref.depth):1,sy=ref?(front?p.depth/ref.depth:p.width/ref.width):1,sz=ref?p.height/ref.height:1;
 return profile.boxes.map(b=>({minX:p.x+b.minX*sx,maxX:p.x+b.maxX*sx,minY:p.y+b.minY*sy,maxY:p.y+b.maxY*sy,minZ:(p.elevation??0)+b.minZ*sz,maxZ:(p.elevation??0)+b.maxZ*sz}));
}
export const contactBoxesOverlap=(a,b)=>a.minX<b.maxX-EPS&&b.minX<a.maxX-EPS&&a.minY<b.maxY-EPS&&b.minY<a.maxY-EPS&&a.minZ<b.maxZ-EPS&&b.minZ<a.maxZ-EPS;
export const contactBoxesInsideRoom=boxes=>boxes.every(b=>b.minX>=-EPS&&b.minY>=-EPS&&b.minZ>=-EPS&&b.maxX<=10+EPS&&b.maxY<=7+EPS&&b.maxZ<=4.5+EPS);
