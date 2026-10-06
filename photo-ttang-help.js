/* Optional Photo Ttang help. Prices, membership and debits are checked by SQL. */
(() => {
 'use strict';
 if(typeof World!=='function'||typeof Comm!=='object'||PUBLIC_DEMO)return;
 const products={heart:{price:3,label:'하트 1개',description:'확보한 땅을 유지하고 하트 1개로 이어해요.'},time:{price:5,label:'시간 +30초',description:'현재 판의 제한 시간을 30초 늘려요.'},slow:{price:3,label:'적 감속 5초',description:'몬스터와 컴퓨터가 5초간 절반 속도로 움직여요.'}};
 let busy=false,slowUntil=0,owner=null,status=null;
 const memory=new Map(),applied=new Set();
 const key=(uid,kind)=>'ojjuda-photo-help:'+uid+':'+kind;
 function pending(uid,kind){try{const value=localStorage.getItem(key(uid,kind));if(/^[a-f0-9-]{36}$/i.test(value||''))return value;}catch{}return memory.get(key(uid,kind));}
 function save(uid,kind,id){memory.set(key(uid,kind),id);localStorage.setItem(key(uid,kind),id);}
 function clear(uid,kind){memory.delete(key(uid,kind));try{localStorage.removeItem(key(uid,kind));}catch{}}
 function say(text){if(status?.isConnected)status.textContent=text;else toast(text);}
 function eligible(kind){return !!world&&!!me&&mode==='play'&&revealT<0&&photoAllowed()&&(kind==='heart'?lives<LIVES:kind==='time'?true:!over&&me.alive&&world.time>=slowUntil);}
 function controls(){document.querySelectorAll('[data-photo-help]').forEach(b=>{const kind=b.dataset.photoHelp,p=products[kind],recover=owner&&pending(owner,kind);b.disabled=busy||!eligible(kind);b.querySelector('.photo-help-label').textContent=recover?'결제 확인':p.label;b.querySelector('.photo-help-price').textContent=p.price+'쭈';b.setAttribute('aria-label',(recover?'이전 결제 확인 · ':'')+p.label+' · '+p.price+'쭈');});}
 function appendControls(overlay){
  if(!overlay||!world||mode!=='play'||revealT>=0||!photoAllowed())return;
  const host=overlay.querySelector('.panel');if(!host||host.querySelector('.photo-help'))return;
  host.classList.add('photo-help-panel');
  const free=document.createElement('div');free.className='photo-help-free-actions';
  host.querySelectorAll(':scope > button.big').forEach(button=>free.append(button));if(free.children.length)host.append(free);
  const group=document.createElement('section');group.className='photo-help';group.setAttribute('aria-label','쭈로 도움받기');
  const title=document.createElement('div');title.className='photo-help-heading';title.innerHTML='<strong>쭈로 도움받기</strong><small>선택 후 구매 확인</small>';group.append(title);
  const grid=document.createElement('div');grid.className='photo-help-grid';group.append(grid);
  const icons={heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',time:'<circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 5V2m0 7v4l3 2M19 5l2 2"/>',slow:'<path d="M11 6 4 12l7 6V6Zm9 0-7 6 7 6V6Z"/>'};
  for(const [kind,p]of Object.entries(products)){const b=document.createElement('button');b.type='button';b.className='photo-help-button ju-paid-soft';b.dataset.photoHelp=kind;b.title=p.description;b.innerHTML='<span class="photo-help-icon" aria-hidden="true"><svg viewBox="0 0 24 24">'+icons[kind]+'</svg></span><span class="photo-help-label"></span><span class="photo-help-price"></span>';b.onclick=()=>void buy(kind);grid.append(b);}
  status=document.createElement('p');status.className='photo-help-status';status.setAttribute('role','status');group.append(status);host.append(group);controls();
  void Comm.ready().then(ok=>{if(ok){owner=Comm.uid;controls();}});
 }
 function open(){
  if(busy||!world||mode!=='play'||revealT>=0)return;paused=true;closePanels();
  const html='<h2>쭈로 도움받기</h2><p>하트는 최대 3개예요. 적 감속은 효과가 끝난 뒤 다시 사용할 수 있어요.</p>'+(over?'<button class="big a" id="help-again">무료로 다시 도전</button><button class="big g" id="help-list">사진 목록</button>':'<button class="big a" id="help-back">계속하기</button>');
  panel(html,{'help-back':()=>{paused=false;},'help-again':()=>{lives=LIVES;startStage(stage);},'help-list':()=>toMenu()});
 }

 async function buy(kind){
  if(busy||!eligible(kind))return;
  busy=true;controls();const purchasedWorld=world,p=products[kind];let uid,id;
  try{
   if(!await Comm.ready()||!Comm.sb)throw Error('로그인 연결을 확인해 주세요.');
   const identity=await Comm.sb.auth.getUser();uid=identity.data?.user?.id;if(!uid||uid!==Comm.uid||!photoAllowed())throw Error('게임을 시작한 계정으로 로그인해 주세요.');owner=uid;
   id=pending(uid,kind);
   if(!id){if(!confirm(p.label+' · '+p.price+'쭈\n'+p.description+'\n구매할까요?'))return;id=crypto.randomUUID();try{save(uid,kind,id);}catch{clear(uid,kind);throw Error('구매 기록을 저장할 수 없어 차감하지 않았어요. 브라우저 저장 공간을 확인해 주세요.');}}
   const response=await Comm.sb.rpc('photo_help_buy',{p_kind:kind,p_request_id:id,p_verify_only:false}).abortSignal(AbortSignal.timeout(15000));
   if(response.error)throw Error('결과를 확인하지 못했어요. 이전 결제 확인을 누르면 중복 차감 없이 다시 확인해요.');
   const r=response.data;if(!r?.ok){if(['coins','invalid','banned','membership','request_conflict'].includes(r?.reason))clear(uid,kind);throw Error(r?.reason==='coins'?'쭈가 부족해요.':r?.reason==='membership'?'입장 가능한 회원만 사용할 수 있어요.':'구매하지 못했어요. 다시 확인해 주세요.');}
   const current=await Comm.sb.auth.getUser();if(current.data?.user?.id!==uid||!photoAllowed()||world!==purchasedWorld||!eligible(kind))throw Error('구매한 도움은 보관했어요. 다음 판에서 이전 결제 확인을 눌러 주세요.');
   if(!applied.has(id)){
    if(kind==='heart'){lives=Math.min(LIVES,lives+1);if(!me.alive){respawnMe();me.shieldT=5;me.freezeT=3;me.born=world.time-1;frzLast=4;}}
    else if(kind==='time')endAt=Math.max(endAt,world.time)+r.duration_seconds;
    else slowUntil=world.time+r.duration_seconds;
    world.photoAssisted=true;applied.add(id);
   }
   clear(uid,kind);over=lives<=0||endAt<=world.time;paused=over;hud();closePanels();
   busy=false;if(over)open();else toast(p.label+' 적용 · 남은 '+r.coins+'쭈','#F2C14E');
   try{void parent.OjjudaShop?.refresh();}catch{}
  }catch(error){say(error.message||'구매 결과를 다시 확인해 주세요.');}
  finally{busy=false;controls();}
 }
 const originalPanel=panel;panel=function(...args){const o=originalPanel(...args);appendControls(o);return o;};
 const originalStart=startStage;startStage=function(...args){if(busy)return false;slowUntil=0;return originalStart(...args);};
 const originalMenu=toMenu;toMenu=function(...args){if(busy){say('구매 결과를 확인 중이에요.');return false;}return originalMenu(...args);};
 const originalEvents=handleEvents;handleEvents=function(...args){const r=originalEvents(...args);if(over&&lives<=0)paused=true;return r;};
 const originalTimeUp=timeUp;timeUp=function(...args){const r=originalTimeUp(...args);paused=true;return r;};
 const originalMobs=updateMobs;updateMobs=function(dt){return originalMobs(dt*(world&&world.time<slowUntil?0.5:1));};
 const originalStep=World.prototype.step;World.prototype.step=function(dt){const slowed=this===world&&this.time<slowUntil?this.players.filter(p=>p.bot):[];for(const p of slowed)p.speed*=.5;try{return originalStep.call(this,dt);}finally{for(const p of slowed)p.speed*=2;}};
 const originalHud=hud;hud=function(...args){const r=originalHud(...args);if(world&&world.time<slowUntil)$('eff').textContent+=' · 감속 '+Math.ceil(slowUntil-world.time)+'초';return r;};
 // Prevent leaving only while a debit is in flight; account revocation can still close the game.
 document.addEventListener('click',e=>{if(busy&&e.target.closest('button,a')&&!e.target.closest('[data-photo-help]')){e.preventDefault();e.stopImmediatePropagation();say('구매 결과를 확인 중이에요.');}},true);
 document.addEventListener('keydown',e=>{if(busy&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();}},true);
 const b=document.createElement('button');b.type='button';b.className='rb photo-help-entry ju-paid-soft';b.textContent='＋';b.setAttribute('aria-label','쭈로 도움받기');b.onclick=open;$('btns').prepend(b);
 window.OjjudaPhotoTtang.canLeave=()=>!busy;
 window.OjjudaPhotoTtang.menu=toMenu;
 window.OjjudaPhotoHelp={open,isBusy:()=>busy};
})();
