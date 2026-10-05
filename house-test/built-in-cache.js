// Only public built-in artwork belongs here. Owner records stay in custom-store.
const cacheName='ojjuda-house-built-in-art-v1';
export async function readBuiltInAsset(url,{reload=false}={}){
 let cache,response,hit=false;
 try{cache=await globalThis.caches?.open(cacheName);}catch{}
 if(cache&&!reload){try{response=await cache.match(url.href);hit=!!response;}catch{}}
 if(!response)response=await fetch(url,{cache:reload?'reload':'force-cache'});
 const revision=url.searchParams.get('v');
 if(!/^[a-f0-9]{16}$/.test(revision||''))throw new Error('Artwork revision is missing.');
 const matches=async r=>{
  if(!r.ok)return false;
  const digest=await crypto.subtle.digest('SHA-256',await r.clone().arrayBuffer());
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('').startsWith(revision);
 };
 if(!await matches(response)){
  try{await cache?.delete(url.href);}catch{}
  // An outdated/corrupt HTTP or CacheStorage entry gets one automatic retry.
  response=await fetch(url,{cache:'reload'});hit=false;
  if(!await matches(response))throw new Error('Artwork bytes do not match their revision.');
 }
 const copy=!hit&&cache&&response.ok?response.clone():null;
 return {
  response,
  // Call only after runtime, artwork and catalog dimensions have been validated.
  async keep(){
   if(!copy)return;
   try{
    await cache.put(url.href,copy);
    // Keep the old revision until the new, valid one was stored successfully.
    for(const request of await cache.keys()){
     const old=new URL(request.url);
     if(old.origin===url.origin&&old.pathname===url.pathname&&old.href!==url.href)await cache.delete(request);
    }
   }catch{} // Full or unavailable storage must never prevent opening a room.
  },
  async discard(){try{await cache?.delete(url.href);}catch{}}
 };
}
