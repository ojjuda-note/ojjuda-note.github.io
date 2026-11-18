/* Start the first card read while the rest of Park's tools download and initialize. */
(() => {
  'use strict';
  const config=window.OJJUDA_CONFIG;
  if(!config?.supabaseUrl || !config?.supabaseKey || !window.supabase?.createClient)return;
  const client=window.supabase.createClient(config.supabaseUrl,config.supabaseKey);
  let active=true,claimed=false,owner,subscription,timer;
  const controller=new AbortController();
  const cleanup=()=>{
    active=false;controller.abort();clearTimeout(timer);subscription?.unsubscribe();
    window.removeEventListener('pagehide',cleanup);
  };
  window.addEventListener('pagehide',cleanup,{once:true});
  timer=setTimeout(cleanup,15000);
  const request=(async()=>{
    const {data,error}=await client.auth.getSession();
    if(error||!active)return;
    owner=data?.session?.user?.id||null;
    subscription=client.auth.onAuthStateChange((_event,current)=>{
      if((current?.user?.id||null)!==owner)cleanup();
    }).data?.subscription;
    // A deep link needs its card, not an unused page of the general feed.
    if(new URL(location.href).searchParams.has('card'))return;
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
  window.OjjudaParkOpening={client,take(userId){
    if(claimed||!active)return;
    claimed=true;
    return request.then(result=>active&&owner===(userId||null)?result:undefined).finally(cleanup);
  }};
})();
