// Refresh small public metadata independently of application/module versions.
// Stage 1 accepts the existing IDs only; item definitions are migrated separately.
const cacheName='ojjuda-house-item-manifest-v1';
export function validateItemManifest(value,baseline){
 if(value?.schema!==1||!value.assets||typeof value.assets!=='object'||Array.isArray(value.assets))throw new Error('Invalid item manifest');
 const ids=Object.keys(baseline),entries=Object.entries(value.assets);
 if(entries.length!==ids.length)throw new Error('Incomplete item manifest');
 const result={};
 for(const [id,asset]of entries){
  if(!Object.hasOwn(baseline,id)||!asset||!/^[-a-z0-9]+\.runtime\.json$/.test(asset.file)||!/^[a-f0-9]{16}$/.test(asset.revision))throw new Error('Invalid item asset');
  result[id]={file:asset.file,revision:asset.revision};
 }
 return result;
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
  return structuredClone(baseline);
 }finally{clearTimeout(timer);}
}
