/* Existing decorations only. Sales are retired; the server keeps ownership and expiry authoritative. */
(() => {
 'use strict';
 const STICKERS={heart:'♡',clover:'🍀',moon:'🌙',coffee:'☕',flower:'🌷',cheer:'힘내!'};
 let options={},state=null,stateOwner=null,revision=0,subscription=null;
 let stateRequest=null,decorOwner=null,decorClient=null,decorEpoch=0;
 const decorCache=new Map(),decorPending=new Map(),DECOR_TTL=60000;
 let timer=null;
 const user=()=>options.getUserId?.()||null;
 const owned=key=>stateOwner===user()?state?.owned?.find(x=>x.key===key&&(!x.expires_at||Date.parse(x.expires_at)>Date.now())):undefined;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 async function rpc(name,args={}){const r=await options.client.rpc(name,args).abortSignal(AbortSignal.timeout(15000));if(r.error)throw r.error;return r.data;}
 function refresh({force=false}={}){
  const owner=user(),client=options.client;
  if(!force&&stateRequest?.owner===owner&&stateRequest.client===client)return stateRequest.promise;
  const run=++revision;
  if(stateOwner!==owner){state=null;stateOwner=owner;}
  if(!owner||!client){state=null;decorateWorld();updateComposer();return Promise.resolve();}
  const request={owner,client,promise:null};
  request.promise=(async()=>{
   try{const data=await rpc('ju_shop_state');if(run!==revision||user()!==owner||options.client!==client)return;if(!data?.ok)throw Error('state');state=data;options.onBalance?.(data.coins,owner);decorateWorld();updateComposer();}
   catch{if(run===revision){state=null;decorateWorld();updateComposer();}}
   finally{if(stateRequest===request)stateRequest=null;}
  })();
  stateRequest=request;return request.promise;
 }
 function install(next){
  const changed=options.client!==next.client;options=next;
  if(changed){revision++;state=null;stateOwner=null;stateRequest=null;subscription?.unsubscribe?.();subscription=next.client?.auth?.onAuthStateChange?.((event)=>{if(event==='SIGNED_OUT'||stateOwner!==user()){revision++;state=null;stateOwner=null;stateRequest=null;resetDecor();}setTimeout(()=>void refresh(),0);})?.data?.subscription;}
  setTimeout(()=>void refresh(),0);
  clearInterval(timer);timer=setInterval(()=>{if(document.visibilityState==='visible'){decorateWorld();updateComposer();}},60000);
 }
 function resetDecor(){decorEpoch++;decorCache.clear();decorPending.clear();decorOwner=user();decorClient=options.client;}
 async function publicDecor(ids){
  if(decorOwner!==user()||decorClient!==options.client)resetDecor();
  const epoch=decorEpoch,missing=ids.filter(id=>!decorPending.has(id)&&(!decorCache.has(id)||Date.now()-decorCache.get(id).at>=DECOR_TTL));
  if(missing.length){
   const request=rpc('ju_shop_public_decor',{p_users:missing}).then(data=>{
    if(epoch!==decorEpoch||decorOwner!==user()||decorClient!==options.client)return;
    for(const id of missing)decorCache.set(id,{data:data?.[id]||{},at:Date.now()});
    // Keep only a small, short-lived set while browsing many neighbours.
    while(decorCache.size>200)decorCache.delete(decorCache.keys().next().value);
   }).finally(()=>{for(const id of missing)if(decorPending.get(id)===request)decorPending.delete(id);});
   for(const id of missing)decorPending.set(id,request);
  }
  await Promise.all([...new Set(ids.map(id=>decorPending.get(id)).filter(Boolean))]);
  if(epoch!==decorEpoch||decorOwner!==user()||decorClient!==options.client)throw Error('stale_decor_request');
  return Object.fromEntries(ids.map(id=>[id,decorCache.get(id)?.data||{}]));
 }
 function decorationKey(data,slot){const entry=data?.[slot];return entry&&(!entry.expires_at||Date.parse(entry.expires_at)>Date.now())?entry.key||'':'';}
 function decorateWorld(){
  const owner=user(),selected=Object.fromEntries(Object.entries(state?.selected||{}).filter(([,key])=>owned(key)));
  document.querySelectorAll('[data-own-profile-photo]').forEach(n=>{n.dataset.juFrame=owner?selected.frame||'':'';});
  document.documentElement.dataset.juGame=owner?selected.game||'':'';
  document.querySelectorAll('[data-ju-own-name]').forEach(n=>n.dataset.juNickname=owner?selected.nickname||'':'');
  const ids=[...new Set([...document.querySelectorAll('[data-ju-user]')].map(n=>n.dataset.juUser).filter(x=>/^[a-f0-9-]{36}$/i.test(x)))].slice(0,100);
  if(ids.length&&owner&&options.client)void publicDecor(ids).then(data=>{if(user()!==owner)return;for(const n of document.querySelectorAll('[data-ju-user]')){if(!ids.includes(n.dataset.juUser))continue;const d=data[n.dataset.juUser]||{};n.querySelector('.pc-av')?.setAttribute('data-ju-frame',decorationKey(d,'frame'));n.querySelector('.pc-name')?.setAttribute('data-ju-nickname',decorationKey(d,'nickname'));}}).catch(()=>{});
 }
 function styleFields(){return Object.fromEntries(['Sticker','Font','Effect'].map(k=>['shop'+k,document.querySelector('[data-shop-style="'+k+'"]')?.value||'none']));}
 function setStyle(style={}){installComposer();for(const k of ['Sticker','Font','Effect']){const n=document.querySelector('[data-shop-style="'+k+'"]');if(n)n.value=style['shop'+k]||'none';}}
 function updateComposer(){for(const [k,product] of [['Sticker','card_stickers'],['Font','card_fonts'],['Effect','card_foil']]){const n=document.querySelector('[data-shop-style="'+k+'"]');if(!n)continue;for(const o of n.options)o.disabled=o.value!=='none'&&!owned(product);n.closest('label').hidden=!owned(product);if(n.value!=='none'&&!owned(product))n.value='none';}const wrap=document.querySelector('.ju-compose-tools');if(wrap)wrap.hidden=!['card_stickers','card_fonts','card_foil'].some(owned);document.dispatchEvent(new CustomEvent('ojjuda:decoration-style'));}
 function installComposer(){
  const anchor=document.querySelector('#compose-effect');if(!anchor||document.querySelector('[data-shop-style]'))return;
  const wrap=el('details','ju-compose-tools'),summary=el('summary','','구매한 꾸미기');wrap.append(summary);
  for(const [k,label,choices] of [['Sticker','스티커',Object.entries(STICKERS)],['Font','특별 글꼴',[['book','책갈피'],['letter','손편지'],['poster','포스터']]],['Effect','특별 효과',[['foil','금빛 테두리']]]]){
   const line=el('label','',label),select=el('select');select.dataset.shopStyle=k;select.append(new Option('기본 · 무료','none'));for(const [value,name]of choices)select.append(new Option(name,value));select.onchange=()=>document.dispatchEvent(new CustomEvent('ojjuda:decoration-style'));line.append(select);wrap.append(line);
  }
  anchor.closest('.field')?.after(wrap);if(!wrap.isConnected)anchor.parentElement.after(wrap);updateComposer();
 }
 function decorateCard(element,style={}){
  for(const c of [...element.classList])if(c.startsWith('ju-font-')||c==='ju-effect-foil')element.classList.remove(c);
  if(['book','letter','poster'].includes(style.shopFont)&&((!style.shopFontUntil&&owned('card_fonts'))||Date.parse(style.shopFontUntil)>Date.now()))element.classList.add('ju-font-'+style.shopFont);
  if(style.shopEffect==='foil'&&((!style.shopEffectUntil&&owned('card_foil'))||Date.parse(style.shopEffectUntil)>Date.now()))element.classList.add('ju-effect-foil');
  let sticker=element.querySelector(':scope > .ju-card-sticker');const text=STICKERS[style.shopSticker];
  if(text){if(!sticker){sticker=el('span','ju-card-sticker');element.append(sticker);}sticker.textContent=text;sticker.setAttribute('aria-label','꾸미기 스티커');}else sticker?.remove();
 }
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refresh();});
 window.OjjudaDecorations={install,refresh,owned,styleFields,setStyle,decorateCard,decorateWorld,installComposer};
})();
