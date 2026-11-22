/* Start the first card read while the rest of Park's tools download and initialize. */
(() => {
  'use strict';
  if(window.OjjudaParkFeedStarted)return;
  const opening={client:null};
  let active=true,claimed=false,startedRead=false,owner,subscription,timer;
  const controller=new AbortController();
  const cleanup=()=>{
    active=false;controller.abort();clearTimeout(timer);subscription?.unsubscribe();
    window.removeEventListener('pagehide',cleanup);
    // Release the closure holding the response, while keeping the shared client.
    delete window.OjjudaParkOpening?.take;
  };
  window.addEventListener('pagehide',cleanup,{once:true});
  timer=setTimeout(cleanup,8500);
  const request=(async()=>{
    let client;
    try{
      const host=window.parent;
      if(host!==window && host.location.origin===location.origin && host.location.pathname==='/world.html'){
        client=await host.OjjudaGetClient?.();
      }
    }catch{/* Standalone documents use their own authenticated client. */}
    if(!client){
      if(!window.supabase?.createClient && document.readyState==='loading'){
        await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
      }
      const config=window.OJJUDA_CONFIG;
      if(!active||!config?.supabaseUrl||!config?.supabaseKey||!window.supabase?.createClient)return;
      client=opening.client||window.supabase.createClient(config.supabaseUrl,config.supabaseKey);
      opening.client=client;
    }
    // The host client is used only for this short read. The iframe's other tools
    // keep their own client so retired frames cannot leave host auth listeners behind.
    const {data,error}=await client.auth.getSession();
    if(error||!active)return;
    owner=data?.session?.user?.id||null;
    subscription=client.auth.onAuthStateChange((_event,current)=>{
      if((current?.user?.id||null)!==owner)cleanup();
    }).data?.subscription;
    // A deep link needs its card, not an unused page of the general feed.
    if(new URL(location.href).searchParams.has('card'))return;
    // If the full feed has already started, do not issue a redundant warm-up query.
    if(window.OjjudaParkFeedStarted)return;
    startedRead=true;
    const result=await client.schema('ojjuda_note').rpc('list_cards',{
      p_sort:'recent',p_lat:null,p_lon:null,p_radius_m:30000,p_limit:20,p_cursor:{offset:0}
    }).abortSignal(controller.signal);
    if(!active||result.error)return;
    // Only public catalog pictures are warmed. Private uploads still use their normal access checks.
    for(const card of (result.data||[]).filter(card=>card.kind==='memo'&&!card.tags?.includes('19금')).slice(0,3)){
      const key=String(card.photo_key||card.background_key||'');
      if(!/^\d{2,3}$/.test(key)||Number(key)<10||Number(key)>297)continue;
      const image=new Image();image.decoding='async';
      if(document.documentElement.hasAttribute('data-park-webp')){
        image.sizes='min(100vw, 750px)';
        image.srcset=[480,800,1200].map(width=>`/note/assets/cards/${width}/${key}.webp ${width}w`).join(', ');
      }
      image.src=`/note/assets/${key}.jpg`;
    }
    return result;
  })().catch(()=>undefined);
  opening.take=function(userId){
    if(claimed||!active)return;
    claimed=true;
    // Do not hold the visible feed behind a warm-up that never reached the server.
    if(!startedRead){cleanup();return Promise.resolve(undefined);}
    let deadline;
    // The first real feed request has its own deadline. Never wait for two
    // full request timeouts in series when the warm-up is stalled.
    return Promise.race([
      request.then(result=>active&&owner===(userId||null)?result:undefined),
      new Promise(resolve=>{deadline=setTimeout(()=>resolve(undefined),900);})
    ]).finally(()=>{clearTimeout(deadline);cleanup();});
  };
  window.OjjudaParkOpening=opening;
})();
