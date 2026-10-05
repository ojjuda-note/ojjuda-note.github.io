// Public item data refreshes independently of application/module versions.
const cacheName='ojjuda-house-item-manifest-v2';
export const isCatalogItem=id=>typeof id==='string'&&/^item-[a-z0-9][a-z0-9-]{0,63}$/.test(id);
const label=value=>typeof value==='string'&&value.trim().length>0&&value.length<=80;
function catalog(value){
 if(!value||!label(value.label)||!label(value.shortLabel)||!['standing','floor','surface'].includes(value.layer))throw new Error('Invalid item definition');
 if(![value.width,value.depth,value.height].every(n=>Number.isFinite(n)&&n>0)||value.width>10||value.depth>7||value.height>4.5)throw new Error('Invalid item dimensions');
 if(!/^assets\/[-a-z0-9]+\.(png|webp|jpg)$/.test(value.preview)||!Number.isInteger(value.order??0)||(value.order??0)<0||(value.order??0)>100000)throw new Error('Invalid item preview/order');
 if(value.hidden!==undefined&&typeof value.hidden!=='boolean')throw new Error('Invalid item visibility');
 return {label:value.label.trim(),shortLabel:value.shortLabel.trim(),width:value.width,depth:value.depth,height:value.height,layer:value.layer,preview:value.preview,order:value.order??0,hidden:value.hidden===true};
}
export function validateItemManifest(value,baseline){
 if(value?.schema!==1||!value.assets||typeof value.assets!=='object'||Array.isArray(value.assets))throw new Error('Invalid item manifest');
 const entries=Object.entries(value.assets);
 if(entries.length>2000||Object.keys(baseline).some(id=>!Object.hasOwn(value.assets,id)))throw new Error('Incomplete item manifest');
 const result={};
 for(const [id,asset]of entries){
  const known=Object.hasOwn(baseline,id);
  if((!known&&!isCatalogItem(id))||!asset||!/^[-a-z0-9]+\.runtime\.json$/.test(asset.file)||!/^[a-f0-9]{16}$/.test(asset.revision))throw new Error('Invalid item asset');
  result[id]={file:asset.file,revision:asset.revision,...(!known?{catalog:catalog(asset.catalog)}:{})};
 }
 return result;
}
export function catalogFurniture(assets){
 return Object.fromEntries(Object.entries(assets).filter(([id,a])=>isCatalogItem(id)&&a.catalog).map(([id,asset])=>{
  const {order,...definition}=catalog(asset.catalog);
  return [id,{...definition,preview:definition.preview+'?v='+asset.revision,depthFill:1,introduced:1000+order,autoPlace:false,directions:['left','center','right'],anchor:'rear',picture:'made',preferred:{direction:'center',x:0,y:0},clearance:definition.layer==='surface'?'높이를 조절하거나 바닥에 놓을 수 있어요.':'원하는 빈자리에 놓아 주세요.'}];
 }));
}
export async function loadItemManifest(url,baseline,{fetcher=globalThis.fetch,storage=globalThis.caches,timeoutMs=5000}={}){
 let cache;try{cache=await storage?.open(cacheName);}catch{}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetcher(url,{cache:'no-cache',signal:controller.signal});
  if(!response.ok)throw new Error('Item manifest unavailable');
  const assets=validateItemManifest(await response.json(),baseline);
  try{await cache?.put(url.href,new Response(JSON.stringify({schema:1,assets}),{headers:{'Content-Type':'application/json'}}));}catch{}
  return assets;
 }catch{
  try{const saved=await cache?.match(url.href);if(saved)return validateItemManifest(await saved.json(),baseline);}catch{}
  // A stage-1 cache is also valid as the initial fallback after this upgrade.
  try{const legacy=await storage?.open('ojjuda-house-item-manifest-v1'),saved=await legacy?.match(url.href);if(saved)return validateItemManifest(await saved.json(),baseline);}catch{}
  return structuredClone(baseline);
 }finally{clearTimeout(timer);}
}
