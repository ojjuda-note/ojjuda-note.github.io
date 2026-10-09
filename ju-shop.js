/* Shared shop. Server is authoritative for prices, ownership and expiration. */
(() => {
 'use strict';
 const LABELS={sticker:'카드 스티커',font:'카드 글꼴',effect:'카드 효과',frame:'프로필 테두리',nickname:'이름 장식',game:'게임 테마'};
 const STICKERS={heart:'♡',clover:'🍀',moon:'🌙',coffee:'☕',flower:'🌷',cheer:'힘내!'};
 let options={},state=null,stateOwner=null,revision=0,busy=false,dialog=null,subscription=null,opener=null;
 let stateRequest=null,decorOwner=null,decorClient=null,decorEpoch=0;
 const decorCache=new Map(),decorPending=new Map(),DECOR_TTL=60000;
 const houseFrames=new Map();
 const pending=new Map();let timer=null;
 const user=()=>options.getUserId?.()||null;
 const owned=key=>stateOwner===user()?state?.owned?.find(x=>x.key===key&&(!x.expires_at||Date.parse(x.expires_at)>Date.now())):undefined;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 async function rpc(name,args={}){const r=await options.client.rpc(name,args).abortSignal(AbortSignal.timeout(15000));if(r.error)throw r.error;return r.data;}
 function refresh({force=false}={}){
  const owner=user(),client=options.client;
  if(!force&&stateRequest?.owner===owner&&stateRequest.client===client)return stateRequest.promise;
  const run=++revision;
  if(stateOwner!==owner){state=null;stateOwner=owner;}
  if(!owner||!client){state=null;render();decorateWorld();return Promise.resolve();}
  const request={owner,client,promise:null};
  request.promise=(async()=>{
   try{const data=await rpc('ju_shop_state');if(run!==revision||user()!==owner||options.client!==client)return;if(!data?.ok)throw Error('state');state=data;options.onBalance?.(data.coins,owner);render();decorateWorld();updateComposer();}
   catch{if(run===revision){state=null;render('상점 정보를 불러오지 못했어요. 다시 열어 주세요.');decorateWorld();}}
   finally{if(stateRequest===request)stateRequest=null;}
  })();
  stateRequest=request;return request.promise;
 }
 function install(next){
  const changed=options.client!==next.client;options=next;
  if(changed){revision++;state=null;stateOwner=null;stateRequest=null;subscription?.unsubscribe?.();subscription=next.client?.auth?.onAuthStateChange?.((event)=>{if(event==='SIGNED_OUT'||stateOwner!==user()){revision++;state=null;stateOwner=null;stateRequest=null;resetDecor();}setTimeout(()=>void refresh(),0);})?.data?.subscription;}
  setTimeout(()=>void refresh(),0);
  clearInterval(timer);timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},60000);
 }
 function message(text){if(dialog)dialog.querySelector('[data-shop-message]').textContent=text;}
 function keyFor(owner,key){return 'ojjuda-shop-request:'+owner+':'+key;}
 function requestId(owner,key){const storageKey=keyFor(owner,key);let id;try{id=localStorage.getItem(storageKey);}catch{}
  if(!/^[a-f0-9-]{36}$/i.test(id||''))id=pending.get(storageKey)||crypto.randomUUID();pending.set(storageKey,id);try{localStorage.setItem(storageKey,id);}catch{}return id;}
 async function buy(product){
  if(busy||!user()||!state)return;
  const owner=user(),wasOwned=owned(product.key);
  if(wasOwned){await equip(product);return;}
  if(!confirm(`${product.name}\n${product.price} ZU · ${product.months?'구매일부터 1개월 · 자동 연장 없음':'한 번 구매하면 계속 사용'}\n구매할까요?`))return;
  busy=true;render();const id=requestId(owner,product.key);
  try{
   const result=await rpc('ju_shop_buy',{p_product:product.key,p_request:id,p_verify_only:false});
   if(user()!==owner)return;
   if(!result?.ok){if(['coins','unavailable','banned','invalid','request_conflict'].includes(result?.reason)){pending.delete(keyFor(owner,product.key));try{localStorage.removeItem(keyFor(owner,product.key));}catch{}}
    throw Error(result?.reason==='coins'?'ZU가 부족해요. 충전 후 다시 이용해 주세요.':'구매하지 못했어요. 차감 내역을 확인해 주세요.');}
   pending.delete(keyFor(owner,product.key));try{localStorage.removeItem(keyFor(owner,product.key));}catch{}
   resetDecor();await refresh({force:true});message(result.spent?`${result.spent} ZU로 구매했어요. 지금 사용하기를 눌러 적용해 보세요.`:'이미 구매한 상품이에요. 추가 차감은 없어요.');
  }catch(error){if(user()===owner)message(error.message?.includes('ZU')?error.message:'결과를 확인하지 못했어요. 같은 상품의 구매 버튼을 다시 누르면 중복 차감 없이 확인해요.');}
  finally{busy=false;if(user()===owner)renderButtons();}
 }
 async function equip(product){
  if(busy||!owned(product.key))return;
  if(['sticker','font','effect'].includes(product.slot)){
   const actor=user();
   if(!options.onUseCardDecoration){message('카드 작성 화면을 불러오지 못했어요. 다시 열어 주세요.');return;}
   if(!close())return;
   try{const used=await options.onUseCardDecoration(product.key,actor);if(used===false&&user()===actor){open();message('카드 작성창을 열지 못했어요. 잠시 후 다시 눌러 주세요.');}}
   catch{if(user()===actor){open();message('꾸미기를 적용하지 못했어요. 다시 시도해 주세요.');}}
   return;
  }
  busy=true;renderButtons();const owner=user();
  try{const r=await rpc('ju_shop_equip',{p_slot:product.slot,p_product:state.selected?.[product.slot]===product.key?null:product.key});if(user()!==owner)return;if(!r.ok)throw Error();resetDecor();await refresh({force:true});message('적용했어요.');}
  catch{if(user()===owner)message('적용하지 못했어요. 다시 시도해 주세요.');}finally{busy=false;renderButtons();}
 }
 function renderButtons(){dialog?.querySelectorAll('[data-shop-product]').forEach(button=>button.disabled=busy||!state);}
 function preview(product){
  const box=el('div','ju-product-preview');box.setAttribute('aria-hidden','true');
  if(product.slot==='sticker')box.textContent='♡ 🍀 🌷';
  if(product.slot==='font'){box.classList.add('ju-font-book');box.textContent='오늘의 한 줄';}
  if(product.slot==='effect'){box.classList.add('ju-effect-foil');box.textContent='오늘 하루 어땠나요';}
  if(product.slot==='frame'){const face=el('span','ju-demo-face','☺');face.dataset.juFrame=product.key;box.append(face);}
  if(product.slot==='nickname'){box.dataset.juNickname=product.key;box.textContent='오쭈다';}
  if(product.slot==='game'){box.classList.add('ju-preview-night');box.textContent='✦  PLAY  ✦';}
  return box;
 }
 function render(error=''){
  if(!dialog)return;const body=dialog.querySelector('[data-shop-products]');body.replaceChildren();
  dialog.querySelector('[data-shop-coins]').textContent=state?`${state.coins.toLocaleString('ko-KR')} ZU`:user()?'확인 중':'로그인이 필요해요';
  if(!user()){const a=el('a','','로그인하기');a.href='/?auth=login&next=world';body.append(a);}
  for(const product of state?.products||[]){
   const card=el('article','ju-product'),ent=owned(product.key);card.append(preview(product),el('small','',LABELS[product.slot]),el('strong','',product.name));
   card.append(el('p',ent?'ju-product-owned':'ju-product-price',ent?ent.expires_at?new Date(ent.expires_at).toLocaleDateString('ko-KR')+'까지':'구매 완료 · 계속 사용':`${product.price} ZU · ${product.months?'1개월':'계속 사용'}`));
   const button=el('button',ent?'':'ju-paid-action',ent?state.selected?.[product.slot]===product.key?'적용 해제':['sticker','font','effect'].includes(product.slot)?'지금 사용하기':'사용하기':`${product.price} ZU로 구매`);button.dataset.shopProduct=product.key;button.onclick=()=>buy(product);card.append(button);body.append(card);
  }
  message(error);renderButtons();
 }
 function open(){
  if(!dialog){dialog=el('dialog','ju-shop-dialog');dialog.setAttribute('aria-label','ZU 상점');dialog.innerHTML='<header><div><h2>ZU 상점</h2><span data-shop-coins></span></div><button type="button" data-shop-close>닫기</button></header><p class="ju-shop-guide">기본 이용은 무료예요. 마음에 드는 꾸미기만 골라 보세요.</p><p data-shop-message role="status"></p><div data-shop-products class="ju-products"></div><footer>월 이용권은 자동 연장되지 않아요. 구매한 상품은 기간 안에 추가 차감 없이 사용해요.</footer>';document.body.append(dialog);dialog.querySelector('[data-shop-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});}
  opener=document.activeElement;render();if(!dialog.open)dialog.showModal();void refresh();
 }
 function close(){if(busy){message('구매 결과를 확인하고 있어요. 잠시만 기다려 주세요.');return false;}dialog?.close();opener?.isConnected&&opener.focus();return true;}
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
  for(const [frame,ownerId]of houseFrames)if(frame.isConnected)void paintHouse(frame,ownerId);else houseFrames.delete(frame);
  document.querySelectorAll('[data-own-profile-photo]').forEach(n=>{n.dataset.juFrame=owner?selected.frame||'':'';});
  document.documentElement.dataset.juGame=owner?selected.game||'':'';
  document.querySelectorAll('[data-ju-own-name]').forEach(n=>n.dataset.juNickname=owner?selected.nickname||'':'');
  const ids=[...new Set([...document.querySelectorAll('[data-ju-user]')].map(n=>n.dataset.juUser).filter(x=>/^[a-f0-9-]{36}$/i.test(x)))].slice(0,100);
  if(ids.length&&owner&&options.client)void publicDecor(ids).then(data=>{if(user()!==owner)return;for(const n of document.querySelectorAll('[data-ju-user]')){if(!ids.includes(n.dataset.juUser))continue;const d=data[n.dataset.juUser]||{};n.querySelector('.pc-av')?.setAttribute('data-ju-frame',decorationKey(d,'frame'));n.querySelector('.pc-name')?.setAttribute('data-ju-nickname',decorationKey(d,'nickname'));}}).catch(()=>{});
 }
 async function paintHouse(frame,ownerId){
  const viewer=user();if(!viewer)return;
  try{const data=await publicDecor([ownerId]);if(user()!==viewer||!frame.isConnected)return;const doc=frame.contentDocument,d=data[ownerId]||{};if(!doc)return;
   if(!doc.querySelector('[data-shop-css]')){const link=doc.createElement('link');link.rel='stylesheet';link.href='/ju-shop.css?v=20261006-shop1';link.dataset.shopCss='';doc.head.append(link);}
   doc.querySelector('#home-profile-photo')?.setAttribute('data-ju-frame',decorationKey(d,'frame'));doc.querySelector('#home-profile-nick')?.setAttribute('data-ju-nickname',decorationKey(d,'nickname'));
  }catch{}
 }
 function bindHouse(frame,owner){const id=String(owner).match(/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/i)?.[0];if(!id)return()=>{};houseFrames.set(frame,id);void paintHouse(frame,id);return()=>houseFrames.delete(frame);}
 function styleFields(){return Object.fromEntries(['Sticker','Font','Effect'].map(k=>['shop'+k,document.querySelector('[data-shop-style="'+k+'"]')?.value||'none']));}
 function setStyle(style={}){installComposer();for(const k of ['Sticker','Font','Effect']){const n=document.querySelector('[data-shop-style="'+k+'"]');if(n)n.value=style['shop'+k]||'none';}}
 function applyProduct(key){
  const selection={card_stickers:['Sticker','heart'],card_fonts:['Font','book'],card_foil:['Effect','foil']}[key];
  if(!selection||!owned(key))return false;
  installComposer();const input=document.querySelector('[data-shop-style="'+selection[0]+'"]');if(!input)return false;
  if(!input.value||input.value==='none')input.value=selection[1];
  input.closest('details').open=true;
  const more=document.querySelector('#compose-more');if(more)more.open=true;
  document.dispatchEvent(new CustomEvent('ojjuda:shop-style'));return true;
 }
 function updateComposer(){for(const [k,product] of [['Sticker','card_stickers'],['Font','card_fonts'],['Effect','card_foil']]){const n=document.querySelector('[data-shop-style="'+k+'"]');if(!n)continue;for(const o of n.options)o.disabled=o.value!=='none'&&!owned(product);if(n.value!=='none'&&!owned(product))n.value='none';}document.dispatchEvent(new CustomEvent('ojjuda:shop-style'));}
 function installComposer(){
  const anchor=document.querySelector('#compose-effect');if(!anchor||document.querySelector('[data-shop-style]'))return;
  const wrap=el('details','ju-compose-tools'),summary=el('summary','','구매한 꾸미기');wrap.append(summary);
  for(const [k,label,choices] of [['Sticker','스티커',Object.entries(STICKERS)],['Font','특별 글꼴',[['book','책갈피'],['letter','손편지'],['poster','포스터']]],['Effect','특별 효과',[['foil','금빛 테두리']]]]){
   const line=el('label','',label),select=el('select');select.dataset.shopStyle=k;select.append(new Option('기본 · 무료','none'));for(const [value,name]of choices)select.append(new Option(name,value));select.onchange=()=>document.dispatchEvent(new CustomEvent('ojjuda:shop-style'));line.append(select);wrap.append(line);
  }
  const b=el('button','','ZU 상점 보기');b.type='button';b.onclick=open;wrap.append(b);anchor.closest('.field')?.after(wrap);if(!wrap.isConnected)anchor.parentElement.after(wrap);updateComposer();
 }
 function decorateCard(element,style={}){
  for(const c of [...element.classList])if(c.startsWith('ju-font-')||c==='ju-effect-foil')element.classList.remove(c);
  if(['book','letter','poster'].includes(style.shopFont)&&((!style.shopFontUntil&&owned('card_fonts'))||Date.parse(style.shopFontUntil)>Date.now()))element.classList.add('ju-font-'+style.shopFont);
  if(style.shopEffect==='foil'&&((!style.shopEffectUntil&&owned('card_foil'))||Date.parse(style.shopEffectUntil)>Date.now()))element.classList.add('ju-effect-foil');
  let sticker=element.querySelector(':scope > .ju-card-sticker');const text=STICKERS[style.shopSticker];
  if(text){if(!sticker){sticker=el('span','ju-card-sticker');element.append(sticker);}sticker.textContent=text;sticker.setAttribute('aria-label','꾸미기 스티커');}else sticker?.remove();
 }
 document.addEventListener('click',e=>{if(e.target.closest?.('[data-ju-shop-open]')){e.preventDefault();open();}});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refresh();});
 window.OjjudaShop={bindHouse,install,open,close,refresh,owned,styleFields,setStyle,applyProduct,decorateCard,decorateWorld,installComposer,isOpen:()=>!!dialog?.open,canLeave:()=>!busy};
})();
