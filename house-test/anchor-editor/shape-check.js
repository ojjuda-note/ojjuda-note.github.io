import {projectMesh} from './mesh.js?v=20261005-shapeguard1';
import {projectPictureLayers} from './layered-mesh.js?v=20261005-shapeguard1';
import {homography,project} from './warp.js?v=20261005-shapeguard1';
import {checkShape,sourceWeights} from '../picture-quality.js?v=20261005-shapeguard1';

const weightsCache=new WeakMap();
function affine(s,t){
 const [p,q,r]=s,[u,v,w]=t,det=(q.x-p.x)*(r.y-p.y)-(r.x-p.x)*(q.y-p.y);
 return [((v.x-u.x)*(r.y-p.y)-(w.x-u.x)*(q.y-p.y))/det,((v.y-u.y)*(r.y-p.y)-(w.y-u.y)*(q.y-p.y))/det,((w.x-u.x)*(q.x-p.x)-(v.x-u.x)*(r.x-p.x))/det,((w.y-u.y)*(q.x-p.x)-(v.y-u.y)*(r.x-p.x))/det];
}
export function shapeTriangles(view,placement=view.placement,planeTarget){
 if(view.mesh)return projectMesh(view.mesh,placement).triangles;
 if(view.pictureLayers)return projectPictureLayers(view.pictureLayers,placement,view.pictureLayerRules).flatMap(l=>l.projected.triangles);
 const triangles=[];
 for(const layer of view.layers){
  const s=layer.source,h=homography(s,planeTarget(layer,placement));
  // Sample the same projective plane, rather than treating a whole trapezoid
  // as a single affine triangle. This also catches distortion at either edge.
  const point=(x,y)=>({x:(1-y)*((1-x)*s[0].x+x*s[1].x)+y*((1-x)*s[3].x+x*s[2].x),y:(1-y)*((1-x)*s[0].y+x*s[1].y)+y*((1-x)*s[3].y+x*s[2].y)});
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
   const q=[point(x/8,y/8),point((x+1)/8,y/8),point((x+1)/8,(y+1)/8),point(x/8,(y+1)/8)];
   for(const ids of [[0,1,2],[0,2,3]]){const source=ids.map(i=>q[i]),target=source.map(p=>project(h,p));triangles.push({source,target,matrix:affine(source,target)});}
  }
 }
 return triangles;
}
export function pictureShape(view,image,planeTarget,placement=view.placement){
 const triangles=shapeTriangles(view,placement,planeTarget),key=JSON.stringify(triangles.map(t=>t.source));
 let cached=weightsCache.get(image);
 if(cached?.key!==key){
  const c=document.createElement('canvas');c.width=image.naturalWidth||image.width;c.height=image.naturalHeight||image.height;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  cached={key,weights:sourceWeights(triangles,ctx.getImageData(0,0,c.width,c.height))};weightsCache.set(image,cached);
 }
 return {...checkShape(triangles,cached.weights),weights:cached.weights};
}
