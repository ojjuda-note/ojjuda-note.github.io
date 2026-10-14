import {createTableFlipScene} from './matgo-table-flip.mjs?v=20261013-bonus-pi1';
import {createVentSound} from './matgo-vent-sound.mjs?v=20261014-random-vent1';
export const VENT_EFFECTS = [
  {id:'gun',name:'총 쏘기',word:'탕! 탕!',hits:[330,690],duration:2050},
  {id:'hammer',name:'망치',word:'꽝!',hits:[650],duration:2150},
  {id:'glove',name:'권투장갑',word:'퍽!',hits:[560],duration:2000},
  {id:'bomb',name:'폭탄',word:'펑!',hits:[940],duration:2600},
  {id:'lightning',name:'번개',word:'찌릿!',hits:[650],duration:2300},
  {id:'table',name:'판 뒤집기',word:'와장창!',hits:[850,2300],duration:3200},
  {id:'burst',name:'따발총',word:'두두두두!',hits:[300,420,540,660,780,900,1020,1140],duration:2300},
  {id:'slash',name:'칼질',word:'슈악! 샤악!',hits:[450,900],duration:2150},
  {id:'tomato',name:'토마토 던지기',word:'철퍼덕!',hits:[720],duration:2400},
  {id:'bat',name:'야구 배트',word:'빠악!',hits:[650],duration:2250}
];
export const pickVentEffect=(random=Math.random)=>VENT_EFFECTS[Math.floor(random()*VENT_EFFECTS.length)];
const assetURL=id=>new URL(`./assets/matgo-vent/${id}.png`,import.meta.url).href;
const assetCache=new Map();
function prepareAsset(id){
  if(id==='lightning'||id==='table')return Promise.resolve();
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
function extras(effect){
  if(effect.id==='burst')return effect.hits.map(ms=>`<div class="vent-muzzle" style="--delay:${ms-80}ms"></div><div class="vent-projectile" style="animation-delay:${ms-80}ms"></div><i class="vent-casing" style="--delay:${ms-30}ms"></i>`).join('');
  if(effect.id==='slash')return '<div class="vent-slash-arc"></div><div class="vent-slash-arc reverse"></div>';
  if(effect.id!=='tomato')return '';
  const seeds=Array.from({length:12},(_,i)=>{const a=i*2.4;return `<ellipse cx="${120+Math.cos(a)*(26+i*3)}" cy="${120+Math.sin(a)*(26+i*3)}" rx="3" ry="6" transform="rotate(${i*37} 120 120)"/>`;}).join('');
  return `<svg class="vent-tomato-splat" viewBox="0 0 240 240" aria-hidden="true"><defs><radialGradient id="vent-pulp"><stop stop-color="#ffb43d"/><stop offset=".45" stop-color="#ff6524"/><stop offset="1" stop-color="#d83212"/></radialGradient></defs><path fill="url(#vent-pulp)" stroke="#ff9e39" stroke-width="2" d="M118 48C140 28 145 69 166 59S212 46 197 79 228 112 208 129 234 167 198 171 194 209 165 190 142 225 124 198 91 227 79 199 38 213 50 177 12 155 37 133 9 97 46 94 34 52 72 65 85 25 118 48Z"/><path d="M89 84Q121 58 159 83M58 128Q49 150 77 162" fill="none" stroke="#ffce7388" stroke-width="9" stroke-linecap="round"/><g fill="#ffe89a" stroke="#e9a943">${seeds}</g><path d="M113 113L91 94 117 101 122 79 130 104 155 94 140 117 156 131 132 125 119 146 119 124 96 128Z" fill="#55913b" stroke="#254c28" stroke-width="2"/></svg>`+Array.from({length:7},(_,i)=>`<i class="vent-pulp-drop" style="--drop-x:${(i-3)*22}px;--drop-y:${18+(i%3)*16}px;--delay:${800+i*45}ms"></i>`).join('');
}
export function createVentControls({canPlay=()=>true,purchase,onError=()=>{},onHit=()=>{},onRearrange=()=>{},prepare=prepareAsset,sound=createVentSound(),random=Math.random}={}){
  let tableScene=null;
  let active=null,cooldown=0,resetTimer=null,cleanupTimer=null;
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
      b.setAttribute('aria-label','화풀이 1쭈: 총, 망치, 권투장갑, 폭탄, 번개, 판 뒤집기, 따발총, 칼질, 토마토, 야구 배트 중 무작위 모션과 효과음');
      b.title='1회 1쭈 · 소리는 게임의 소리 설정을 따라요. 패와 점수는 그대로예요.';deck.appendChild(b);
      void prepare('gun').catch(()=>{});
    }
    if(observed!==deck.parentElement){observer?.disconnect();observed=deck.parentElement;if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(resize);observer.observe(observed);}}
    resize();sync();
  }
  function clear(){for(const timer of hitTimers)clearTimeout(timer);hitTimers.clear();clearTimeout(cleanupTimer);sound.stop();tableScene?.clear();tableScene=null;active?.remove();active=null;document.body.classList.remove('matgo-cpu-surprised');document.querySelectorAll('.vent-hit').forEach(el=>el.classList.remove('vent-hit'));}
  async function fire(){
    const b=button(),target=document.querySelector('.zone.op .cpu-portrait')||document.querySelector('.zone.op .who b');
    if(destroyed||purchasing||!b||!target||Date.now()<cooldown||!canPlay()||!purchase)return false;
    const audioReady=sound.unlock();purchasing=true;sync();let effect=pickVentEffect(random);
    try{
      await prepare(effect.id);await audioReady; // Never charge for an image that failed to load.
      if(destroyed||document.hidden||!canPlay())return false;
      const receipt=await purchase(effect.id),confirmed=VENT_EFFECTS.find(item=>item.id===receipt?.purchase?.effect);
      if(!confirmed)throw Error('결제 정보를 확인하지 못했어요. 다시 눌러 주세요.');
      if(confirmed.id!==effect.id)await prepare(confirmed.id);effect=confirmed;
    }catch(error){onError(error);return false;}finally{purchasing=false;sync();}
    if(destroyed)return false;
    clear();
    const start=b.getBoundingClientRect(),end=target.getBoundingClientRect();
    const size=Math.min(230,Math.max(170,innerWidth*.5)),pad=size*.73;
    const sx=Math.min(innerWidth-pad,Math.max(pad,start.left+start.width/2)),sy=start.top+start.height/2;
    const floorRect=document.querySelector('#app .floor')?.getBoundingClientRect();
    const tx=effect.id==='table'&&floorRect?floorRect.left+floorRect.width/2:Math.min(innerWidth-pad,Math.max(pad,end.left+end.width/2));
    const ty=effect.id==='table'&&floorRect?floorRect.top+floorRect.height/2:Math.max(size*(['slash','bat'].includes(effect.id)?.85:effect.id==='glove'?.8:effect.id==='tomato'?.7:.5),end.top+end.height/2);
    const angle=Math.atan2(ty-sy,tx-sx)*180/Math.PI,reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const hits=reduced?[0]:effect.hits,duration=reduced?900:effect.duration;
    const layer=document.createElement('div');layer.className='vent-layer vent-'+effect.id;layer.dataset.effect=effect.id;layer.setAttribute('aria-hidden','true');
    for(const [key,value] of Object.entries({sx:sx+'px',sy:sy+'px',tx:tx+'px',ty:ty+'px',dx:(tx-sx)+'px',dy:(ty-sy)+'px',aim:angle+'deg',hit:effect.hits[0]+'ms','weapon-size':size+'px'}))layer.style.setProperty('--'+key,value);
    const trails=effect.id==='gun'?'<div class="vent-muzzle"></div><div class="vent-projectile"></div><div class="vent-projectile second"></div>':effect.id==='lightning'?lightning:['table','burst','slash'].includes(effect.id)?extras(effect):'<div class="vent-trail"></div>'+extras(effect);
    layer.innerHTML=`${['lightning','table'].includes(effect.id)?'':`<div class="vent-weapon">${weapon(effect.id)}</div>`}${trails}<div class="vent-impact"><div class="vent-aura"></div><div class="vent-flash"></div><div class="vent-ring"></div><div class="vent-ring second"></div>${particles()}<strong class="vent-word">${effect.word}</strong></div>`;
    document.body.appendChild(layer);active=layer;if(effect.id==='table')tableScene=createTableFlipScene(layer,onRearrange,{reduced});cooldown=Date.now()+duration+150;sync();if(!document.hidden)sound.play(effect.id,hits);
    for(const ms of hits){const timer=setTimeout(()=>{hitTimers.delete(timer);if(!layer.isConnected||document.hidden)return;if(effect.id==='table'&&ms===hits[0])tableScene?.rearrange();const portrait=document.querySelector('.zone.op .cpu-portrait');if(portrait){document.body.classList.add('matgo-cpu-surprised');if(!layer.querySelector('.cpu-reaction')){const reaction=portrait.cloneNode(true);reaction.classList.remove('vent-hit');reaction.classList.add('cpu-reaction');layer.prepend(reaction);}}const current=portrait||document.querySelector('.zone.op .who b');if(current&&!reduced&&effect.id!=='table'){current.classList.remove('vent-hit');void current.offsetWidth;current.classList.add('vent-hit');}onHit(effect.id);},ms);hitTimers.add(timer);}
    cleanupTimer=setTimeout(clear,duration);clearTimeout(resetTimer);resetTimer=setTimeout(sync,duration+170);return effect.id;
  }
  function click(event){if(!event.target.closest?.('#matgo-vent'))return;event.preventDefault();event.stopPropagation();void fire();}
  function hide(){if(document.hidden)clear();}
  function destroy(){destroyed=true;clear();clearTimeout(resetTimer);observer?.disconnect();sound.destroy();document.removeEventListener('click',click);document.removeEventListener('visibilitychange',hide);window.removeEventListener('resize',resize);window.removeEventListener('pagehide',destroy);}
  document.addEventListener('click',click);document.addEventListener('visibilitychange',hide);window.addEventListener('resize',resize);window.addEventListener('pagehide',destroy,{once:true});
  return {mount,sync,clear,destroy};
}
