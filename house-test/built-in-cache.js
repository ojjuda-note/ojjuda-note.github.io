// Only public built-in artwork belongs here. Owner records stay in custom-store.
const cacheName='ojjuda-house-built-in-art-v1';
export async function readBuiltInAsset(url,{reload=false}={}){
 let cache,response,hit=false;
 try{cache=await globalThis.caches?.open(cacheName);}catch{}
 if(cache&&!reload){try{response=await cache.match(url.href);hit=!!response;}catch{}}
 if(!response)response=await fetch(url,{cache:reload?'reload':'force-cache'});
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
