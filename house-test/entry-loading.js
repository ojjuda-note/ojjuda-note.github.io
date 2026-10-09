const css=`
.house-entry-loading{position:absolute;inset:0;z-index:1;display:grid;place-items:center;overflow:hidden;background:#fff;pointer-events:none}
.house-entry-scene{position:relative;width:min(430px,100%);aspect-ratio:1;overflow:hidden;border-radius:24px;opacity:0}
.house-entry-scene[data-art-ready]{opacity:1}
.house-entry-house{display:block;width:100%;height:100%;object-fit:cover}
.house-entry-walk{position:absolute;left:50%;top:91%;width:33%;transform:translate3d(-50%,-95.625%,0);transform-origin:50% 95.625%;will-change:transform,opacity}
.house-entry-jjuda{display:block;width:100%;height:auto}
.house-entry-white{position:absolute;inset:0;z-index:2;background:#fff;opacity:0}
@media(prefers-reduced-motion:reduce){.house-entry-walk{display:none}}
`;
export function createHouseEntryLoading(){
 const root=document.createElement('div');root.className='house-entry-loading';root.dataset.phase='artwork';root.setAttribute('role','img');root.setAttribute('aria-label','쭈다가 집으로 걸어 들어가는 뒷모습');
 const style=document.createElement('style');style.textContent=css;
 const scene=document.createElement('div');scene.className='house-entry-scene';
 const house=document.createElement('img');house.className='house-entry-house';house.alt='';house.decoding='async';house.fetchPriority='high';
 const walk=document.createElement('div');walk.className='house-entry-walk';
 const jjuda=document.createElement('img');jjuda.className='house-entry-jjuda';jjuda.alt='';jjuda.decoding='async';
 const white=document.createElement('div');white.className='house-entry-white';
 walk.append(jjuda);scene.append(house,walk);root.append(style,scene,white);
 const motion=window.matchMedia('(prefers-reduced-motion:reduce)'),timers=new Map(),animations=new Set(),frames=new Set();
 let disposed=false,finishing=false,finishPromise=null,releaseCancelled;
 const cancelled=new Promise(resolve=>{releaseCancelled=resolve;});
 const delay=ms=>new Promise(resolve=>{const id=setTimeout(()=>{timers.delete(id);resolve(true);},ms);timers.set(id,resolve);});
 const nextPaint=()=>Promise.race([new Promise(resolve=>{const tick=()=>{const id=requestAnimationFrame(()=>{frames.delete(id);resolve(true);});frames.add(id);};const id=requestAnimationFrame(()=>{frames.delete(id);tick();});frames.add(id);}),cancelled]);
 const fit=()=>{const bounds=root.getBoundingClientRect(),size=Math.min(430,bounds.width,bounds.height);if(size>0){scene.style.width=size+'px';scene.style.height=size+'px';}};
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(fit):null;observer?.observe(root);
 const onResize=()=>fit();window.addEventListener('resize',onResize,{passive:true});
 const reduceMotion=()=>{if(motion.matches)for(const animation of animations){try{animation.finish();}catch(_){animation.cancel();}}};
 motion.addEventListener?.('change',reduceMotion);
 async function play(element,keyframes,duration){
  if(disposed||(finishing&&element!==root))return false;
  if(motion.matches||duration===0)return true;
  let animation;
  try{animation=element.animate(keyframes,{duration,easing:'linear',fill:'forwards',iterations:1});animations.add(animation);}catch(_){return !disposed;}
  await Promise.race([animation.finished.catch(()=>{}),delay(duration+120),cancelled]);
  if(!disposed&&(!finishing||element===root)){for(const [name,value]of Object.entries(keyframes[keyframes.length-1]))if(!['offset','easing','composite'].includes(name))element.style[name]=String(value);}
  animation.cancel();animations.delete(animation);
  return !disposed;
 }
 function imageReady(image){
  return new Promise(resolve=>{
   const done=async()=>{if(!image.naturalWidth){resolve(false);return;}try{if(image.decode)await image.decode();resolve(true);}catch(_){resolve(false);}};
   image.onload=done;image.onerror=()=>resolve(false);if(image.complete&&image.currentSrc)void done();
  });
 }
 house.src=new URL('./assets/entry-house-v1.webp',import.meta.url).href;
 jjuda.src=new URL('./assets/entry-jjuda-back-v1.webp',import.meta.url).href;
 const prepared=(async()=>{
  const ready=await Promise.race([Promise.all([imageReady(house),imageReady(jjuda)]).then(results=>results.every(Boolean)),delay(4000).then(()=>false),cancelled]);
  house.onload=house.onerror=jjuda.onload=jjuda.onerror=null;
  if(disposed||finishing)return false;
  fit();
  if(!ready){white.style.opacity='1';root.dataset.phase='waiting';return true;}
  scene.dataset.artReady='';
  await play(scene,[{opacity:0},{opacity:1}],120);if(disposed||finishing)return false;
  if(!motion.matches){
   root.dataset.phase='walking';
   // The transparent sprite's feet are at 459/480 of its image height.
   // The sprite is 33% of the scene wide and 49.5% tall. Translate its feet
   // from 91% to 61% of the scene without changing layout on every frame.
   void play(jjuda,[{transform:'translateY(0) rotate(-.6deg)'},{transform:'translateY(-2px) rotate(.6deg)'},{transform:'translateY(0) rotate(-.6deg)'},{transform:'translateY(-2px) rotate(.6deg)'},{transform:'translateY(0) rotate(-.6deg)'},{transform:'translateY(-2px) rotate(.6deg)'},{transform:'translateY(0) rotate(-.6deg)'},{transform:'translateY(-2px) rotate(.6deg)'},{transform:'translateY(0) rotate(-.6deg)'},{transform:'translateY(-2px) rotate(.6deg)'},{transform:'translateY(0) rotate(0)'}],1600);
   await play(walk,[{transform:'translate3d(-50%,-95.625%,0) scale(1)',opacity:1,offset:0},{transform:'translate3d(-50%,-148.1503%,0) scale(.70)',opacity:1,offset:.82},{transform:'translate3d(-50%,-156.2311%,0) scale(.64)',opacity:0,offset:1}],1600);
   if(disposed||finishing)return false;
  }
  walk.style.opacity='0';
  // Finish the entrance as one sequence, even when the room is still loading.
  // Slow loading waits behind white instead of freezing the empty house image.
  root.dataset.phase='covering';await play(white,[{opacity:0},{opacity:1}],320);if(disposed||finishing)return false;
  white.style.opacity='1';root.dataset.phase='waiting';return true;
 })();
 function cleanup(){
  observer?.disconnect();window.removeEventListener('resize',onResize);motion.removeEventListener?.('change',reduceMotion);
  house.onload=house.onerror=jjuda.onload=jjuda.onerror=null;
  for(const [id,resolve]of timers){clearTimeout(id);resolve(false);}timers.clear();
  for(const animation of animations)animation.cancel();animations.clear();
  for(const id of frames)cancelAnimationFrame(id);frames.clear();
 }
 root.finish=onCovered=>{
  if(finishPromise)return finishPromise;
  finishPromise=(async()=>{
   if(disposed)return;
   // The entrance fills real loading time, never delays an already painted room.
   // Cancel artwork waits and the remaining walk before handing over to the room.
   finishing=true;cleanup();white.style.opacity='1';root.dataset.phase='covering';
   if(typeof onCovered==='function')onCovered();if(disposed)return;
   await nextPaint();if(disposed)return;
   root.dataset.phase='revealing';await play(root,[{opacity:1},{opacity:0}],160);if(disposed)return;
   root.style.opacity='0';root.dataset.phase='done';cleanup();root.remove();
  })();return finishPromise;
 };
 root.dispose=()=>{if(disposed)return;disposed=true;releaseCancelled(false);cleanup();root.dataset.phase='disposed';root.remove();};
 return root;
}

// App initialization can finish before its visible background and furniture paint.
// Observe only the selected room, never lazy menu thumbnails or other rooms.
export function waitForHousePaint(frame,onReady){
 const doc=frame.contentDocument;if(!doc)return()=>{};
 let stopped=false,raf=0;
 const stop=()=>{stopped=true;cancelAnimationFrame(raf);observer.disconnect();doc.removeEventListener('load',schedule,true);doc.removeEventListener('error',schedule,true);};
 const check=()=>{
  raf=0;if(stopped)return;
  const room=doc.querySelector('.room.selected');if(!room)return;
  if(room.querySelector('[data-render-state="loading"]')||[...room.querySelectorAll('img')].some(image=>!image.complete))return;
  stop();onReady();
 };
 const schedule=()=>{if(!stopped&&!raf)raf=requestAnimationFrame(check);};
 const observer=new MutationObserver(schedule);observer.observe(doc,{childList:true,subtree:true,attributes:true,attributeFilter:['class','src','data-render-state']});
 doc.addEventListener('load',schedule,true);doc.addEventListener('error',schedule,true);schedule();return stop;
}
