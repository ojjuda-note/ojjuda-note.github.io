import {getSofaBlanketDrape,projectSofaBlanketDrape} from '../sofa-blanket-drape.js?v=20261004-chairlegs1';
import {normalizeParts,getPartCanvases,getRenderOrder,renderParts} from './parts.js?v=20261004-chairlegs1';

// Upgrade only exact known original PNG bytes, never a similarly named upload.
const KNOWN_PNG_SHA256={"left":{"db7c0767fdc607b96a5ad6c1e4ab90febaebc016a7f585ca36c1bf87d15b7004":"blanket-sofa","b570d882eb500ea1ffb89195e4e842f2979bdd10dc5e4a5af60340f36f82bb1f":"peach-cushion","26f39f7078601fdb3838853de9fc27bc9670805777bf3b60cd2e368d6a3f1f60":"cream-floral-cushion","24c0d468a8721a7788d2c7a78df2dc1fd9431448ecde4a95d1e2823d10216d3d":"sage-cushion","8c72632d3ac42b669fa420815c196397fcba22db743b258f3b5caf3a23aecec6":"pink-check-cushion"},"center":{"8af7208aac8c1daca4999ea0ff8d854199aaad84fc0cbd0dd2e24789b4718c9e":"blanket-sofa","14403fd7b7af20be6b0a845539cfe4f094b990da6a8dc75fc0c5f0f9416d4c7b":"peach-cushion","ba84612025978a99133ac3eaedfcdefe604555e5c37e2bb412e25608a0d9cb59":"cream-floral-cushion","dd352291a3d053c72ba2ff78cf286e776d4fccb37d46474373104cfc918723ab":"sage-cushion","ab6ec2524b8c402f00fe0626905b163aaf749291592146094fbd0c90b97b0a6f":"pink-check-cushion"},"right":{"0d30746b5b457d7f80f2d5dc5dd33303d4ff6c83fc6abaf95ad5c5fefe2d47b2":"blanket-sofa","0e62cd78711a468858002a0857ce2a3d853f91ac0c8a583a73402e94e451275d":"peach-cushion","11b831bb8bb107b5d0cc9861bfeaefa94f23bdd4ea360e25dbbe63c3c8d658dd":"cream-floral-cushion","e126fe53421d3ba40482ac922327ba1acdf30de3b5bfbe06876b9c2a41a4f39e":"sage-cushion","ffc19c65412d01a785e5f511825cca2680d0cf75be52f94a38c594f83e2b42e4":"pink-check-cushion"}};
const digestCache=new Map();
export async function upgradeSofaBlankets(value){
 const parts=normalizeParts(value);
 if(parts.preset!=='sofa')return parts;
 for(const object of parts.objects){
  if(object.registration||object.sofaAccessoryId)continue;
  const data=object.source.data;
  if(!digestCache.has(data))digestCache.set(data,crypto.subtle.digest('SHA-256',Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0))).then(bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')));
  const knownId=KNOWN_PNG_SHA256[parts.direction][await digestCache.get(data)];if(!knownId)continue;
  if(knownId!=='blanket-sofa'){object.sofaAccessoryId=knownId;continue;}
  object.registration=getSofaBlanketDrape(parts.direction);object.slot='surface';
  if(!parts.order.includes('slot:surface'))parts.order.splice(parts.order.indexOf('body')+1,0,'slot:surface');
  if(!parts.order.includes('slot:front'))parts.order.push('slot:front');
 }
 return normalizeParts(parts);
}

export const hasDrapedObjects=parts=>!!parts?.objects.some(o=>!!o.registration);

/** Keep the parent's source planes for its own picture, with independent
 * drape-image coordinates in the original back-to-front drawing order. */
export function drapedPartsPlan(baseImage,value,imageMap){
 const parts=normalizeParts(value),canvases=getPartCanvases(baseImage,parts,imageMap),objects=new Map(parts.objects.map(o=>[o.id,o]));
 const parentOnly={...parts,objects:parts.objects.filter(o=>!o.registration)};
 const parentImage=renderParts(baseImage,parentOnly,imageMap);
 const layers=getRenderOrder(parts).map(entry=>{
  if(entry.type==='part')return {image:canvases.get(entry.id),id:entry.id};
  const object=objects.get(entry.id),image=imageMap.get(entry.id);
  if(entry.segment)return {id:entry.id,image,registration:object.registration,segment:entry.segment};
  const canvas=document.createElement('canvas');Object.assign(canvas,parts.frame);const r=object.rect;canvas.getContext('2d').drawImage(image,r.x,r.y,r.width,r.height);return {id:entry.id,image:canvas};
 });
 return {parentImage,layers};
}

export function drawDrapedLayer(ctx,layer,direction,placement,roomPoint){
 const triangles=projectSofaBlanketDrape(layer.registration,direction,placement,roomPoint)[layer.segment];
 const transform=ctx.getTransform(),density=Math.max(1,Math.hypot(transform.a,transform.b)),pad=.42/density;
 for(const {source,target} of triangles){
  const [p,q,r]=source,[a,b,c]=target,ux=q[0]-p[0],uy=q[1]-p[1],vx=r[0]-p[0],vy=r[1]-p[1],det=ux*vy-uy*vx;
  const ma=((b.x-a.x)*vy-(c.x-a.x)*uy)/det,mc=((c.x-a.x)*ux-(b.x-a.x)*vx)/det,mb=((b.y-a.y)*vy-(c.y-a.y)*uy)/det,md=((c.y-a.y)*ux-(b.y-a.y)*vx)/det;
  const centre={x:(a.x+b.x+c.x)/3,y:(a.y+b.y+c.y)/3},expanded=target.map(p=>{const dx=p.x-centre.x,dy=p.y-centre.y,n=Math.hypot(dx,dy)||1;return {x:p.x+dx/n*pad,y:p.y+dy/n*pad};});
  ctx.save();ctx.beginPath();expanded.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.clip();ctx.transform(ma,mb,mc,md,a.x-ma*p[0]-mc*p[1],a.y-mb*p[0]-md*p[1]);ctx.drawImage(layer.image,0,0);ctx.restore();
 }
}
