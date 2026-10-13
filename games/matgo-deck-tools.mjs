import {createVentSound} from './matgo-vent-sound.mjs?v=20261013-vent2';
export const VENT_EFFECTS = [
  {id:'gun',name:'총 쏘기',word:'탕! 탕!',hits:[330,690],duration:2050},
  {id:'hammer',name:'망치',word:'꽝!',hits:[650],duration:2150},
  {id:'glove',name:'권투장갑',word:'퍽!',hits:[560],duration:2000},
  {id:'bomb',name:'폭탄',word:'펑!',hits:[940],duration:2600},
  {id:'lightning',name:'번개',word:'찌릿!',hits:[650],duration:2300}
];
const assetURL=id=>new URL(`./assets/matgo-vent/${id}.png`,import.meta.url).href;
const assetCache=new Map();
function prepareAsset(id){
  if(id==='lightning')return Promise.resolve();
  if(!assetCache.has(id)){
    const ready=new Promise((resolve,reject)=>{
      const img=new window.Image();img.onload=()=>resolve();
      img.onerror=()=>{assetCache.delete(id);reject(Error('그림을 불러오지 못했어요. 잠시 후 다시 눌러 주세요.'));};
      img.src=assetURL(id);
    });assetCache.set(id,ready);
  }return assetCache.get(id);
}
const weapon=id=>`<img src="${assetURL(id)}" alt="" draggable="false" decoding="sync">`;
const lightning='<svg class="vent-bolt" viewBox="0 0 160 240" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path class="bolt-halo" d="M90 0L65 55 97 76 52 118 88 133 69 178 82 225"/><path class="bolt-core" d="M90 0L65 55 97 76 52 118 88 133 69 178 82 225"/><path class="bolt-branch" d="M65 55L35 66 45 89 18 110M88 133L121 115 131 145 149 154M69 178L42 170 27 199"/></g></svg>';
function particles(){
  return Array.from({length:18},(_,i)=>{const angle=i*137.508*Math.PI/180,radius=42+(i%5)*13;
    return `<i class="vent-spark" style="--px:${(Math.cos(angle)*radius).toFixed(1)}px;--py:${(Math.sin(angle)*radius).toFixed(1)}px;--spin:${i*43}deg;--lag:${(i%4)*22}ms"></i>`;
  }).join('')+Array.from({length:7},(_,i)=>`<i class="vent-smoke" style="--px:${(i-3)*17}px;--py:${-20-(i%3)*19}px;--spin:${i*37}deg;--lag:${i*35}ms"></i>`).join('');
}
export function createVentControls({canPlay=()=>true,purchase,onError=()=>{},onHit=()=>{},prepare=prepareAsset,sound=createVentSound()}={}){
  let index=0,active=null,cooldown=0,resetTimer=null,cleanupTimer=null;
  let observed=null,observer=null,destroyed=false,purchasing=false;
  const hitTimers=new Set(),button=()=>document.getElementById('matgo-vent');
  function sync(){const b=button();if(b){b.disabled=purchasing||Date.now()<cooldown||!canPlay();b.classList.toggle('cooldown',Date.now()<cooldown);b.setAttribute('aria-busy',String(purchasing));}}
  function resize(){const deck=document.querySelector('.deck.deck-tools');if(!deck)return;const h=deck.parentElement.getBoundingClientRect().height;
    const cardHeight=Math.max(27,Math.min(69,h-(deck.querySelector('.tazza-button')?132:84)));
    deck.style.setProperty('--deck-card-height',cardHeight+'px');deck.style.setProperty('--deck-card-width',cardHeight/1.5+'px');
  }
  function mount(){
    if(destroyed)return;const deck=document.querySelector('.deck');if(!deck)return;
    deck.classList.add('deck-tools');deck.parentElement.classList.add('matgo-tools-floor');
    if(!deck.querySelector('#matgo-vent')){
      const b=document.createElement('button');b.id='matgo-vent';b.type='button';b.className='vent-button';
      b.innerHTML=`<span class="vent-icon" aria-hidden="true">${weapon('gun')}</span><span>화풀이<small>1쭈</small></span>`;
      b.setAttribute('aria-label','화풀이 1쭈: 총, 망치, 권투장갑, 폭탄, 번개 모션과 효과음을 차례로 재생');
      b.title='1회 1쭈 · 소리는 게임의 소리 설정을 따라요. 패와 점수는 그대로예요.';deck.appendChild(b);
      void prepare(VENT_EFFECTS[index].id).catch(()=>{});
    }
    if(observed!==deck.parentElement){observer?.disconnect();observed=deck.parentElement;if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(resize);observer.observe(observed);}}
    resize();sync();
  }
  function clear(){for(const timer of hitTimers)clearTimeout(timer);hitTimers.clear();clearTimeout(cleanupTimer);sound.stop();active?.remove();active=null;document.querySelectorAll('.vent-hit').forEach(el=>el.classList.remove('vent-hit'));}
  async function fire(){
    const b=button(),target=document.querySelector('.zone.op .who b');
    if(destroyed||purchasing||!b||!target||Date.now()<cooldown||!canPlay()||!purchase)return false;
    const audioReady=sound.unlock();purchasing=true;sync();let effect=VENT_EFFECTS[index];
    try{
      await prepare(effect.id);await audioReady; // Never charge for an image that failed to load.
      if(destroyed||document.hidden||!canPlay())return false;
      const receipt=await purchase(effect.id),confirmed=VENT_EFFECTS.find(item=>item.id===receipt?.purchase?.effect);
      if(!confirmed)throw Error('결제 정보를 확인하지 못했어요. 다시 눌러 주세요.');
      if(confirmed.id!==effect.id)await prepare(confirmed.id);effect=confirmed;
    }catch(error){onError(error);return false;}finally{purchasing=false;sync();}
    if(destroyed)return false;
    clear();index=(VENT_EFFECTS.indexOf(effect)+1)%VENT_EFFECTS.length;void prepare(VENT_EFFECTS[index].id).catch(()=>{});
    const start=b.getBoundingClientRect(),end=target.getBoundingClientRect();
    const sx=Math.min(innerWidth-62,Math.max(62,start.left+start.width/2)),sy=start.top+start.height/2;
    const tx=Math.min(innerWidth-76,Math.max(76,end.left+end.width/2)),ty=Math.max(80,end.top+end.height/2);
    const angle=Math.atan2(ty-sy,tx-sx)*180/Math.PI,reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const hits=reduced?[0]:effect.hits,duration=reduced?900:effect.duration;
    const layer=document.createElement('div');layer.className='vent-layer vent-'+effect.id;layer.dataset.effect=effect.id;layer.setAttribute('aria-hidden','true');
    for(const [key,value] of Object.entries({sx:sx+'px',sy:sy+'px',tx:tx+'px',ty:ty+'px',dx:(tx-sx)+'px',dy:(ty-sy)+'px',aim:angle+'deg',hit:effect.hits[0]+'ms'}))layer.style.setProperty('--'+key,value);
    const trails=effect.id==='gun'?'<div class="vent-muzzle"></div><div class="vent-projectile"></div><div class="vent-projectile second"></div>':effect.id==='lightning'?lightning:'<div class="vent-trail"></div>';
    layer.innerHTML=`${effect.id==='lightning'?'':`<div class="vent-weapon">${weapon(effect.id)}</div>`}${trails}<div class="vent-impact"><div class="vent-aura"></div><div class="vent-flash"></div><div class="vent-ring"></div><div class="vent-ring second"></div>${particles()}<strong class="vent-word">${effect.word}</strong></div>`;
    document.body.appendChild(layer);active=layer;cooldown=Date.now()+duration+150;sync();if(!document.hidden)sound.play(effect.id,hits);
    for(const ms of hits){const timer=setTimeout(()=>{hitTimers.delete(timer);if(!layer.isConnected||document.hidden)return;const current=document.querySelector('.zone.op .who b');if(current&&!reduced){current.classList.remove('vent-hit');void current.offsetWidth;current.classList.add('vent-hit');}onHit(effect.id);},ms);hitTimers.add(timer);}
    cleanupTimer=setTimeout(clear,duration);clearTimeout(resetTimer);resetTimer=setTimeout(sync,duration+170);return effect.id;
  }
  function click(event){if(!event.target.closest?.('#matgo-vent'))return;event.preventDefault();event.stopPropagation();void fire();}
  function hide(){if(document.hidden)clear();}
  function destroy(){destroyed=true;clear();clearTimeout(resetTimer);observer?.disconnect();sound.destroy();document.removeEventListener('click',click);document.removeEventListener('visibilitychange',hide);window.removeEventListener('resize',resize);window.removeEventListener('pagehide',destroy);}
  document.addEventListener('click',click);document.addEventListener('visibilitychange',hide);window.addEventListener('resize',resize);window.addEventListener('pagehide',destroy,{once:true});
  return {mount,sync,clear,destroy};
}
