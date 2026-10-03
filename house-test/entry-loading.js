const css=`
.house-entry-loading{position:absolute;inset:0;z-index:1;display:grid;place-items:center;overflow:hidden;background:#fff9f1;pointer-events:none}
.house-entry-scene{position:relative;width:min(430px,calc(100vw - 40px),calc(var(--app-viewport-height,100dvh) - 100px));aspect-ratio:1;border-radius:28px;overflow:hidden;box-shadow:0 14px 48px #8a684f12;opacity:0;transition:opacity .15s}
.house-entry-scene[data-art-ready]{opacity:1}
.house-entry-house{display:block;width:100%;height:100%;object-fit:cover}
.house-entry-walk{position:absolute;left:35.5%;top:44%;width:33%;transform-origin:50% 95%;animation:house-entry-walk 3.8s linear infinite}
.house-entry-jjuda{display:block;width:100%;height:auto;animation:house-entry-step .38s ease-in-out infinite alternate}
@keyframes house-entry-walk{0%{opacity:1;transform:translate(0,0) scale(1)}8%{opacity:1}72%{opacity:1;transform:translate(3%,-48%) scale(.8)}88%,100%{opacity:1;transform:translate(3%,-55%) scale(.76)}}
@keyframes house-entry-step{from{transform:translateY(0) rotate(-.6deg)}to{transform:translateY(-2px) rotate(.6deg)}}
@media(prefers-reduced-motion:reduce){.house-entry-scene{transition:none}.house-entry-walk,.house-entry-jjuda{animation:none}.house-entry-walk{transform:translate(2%,-22%) scale(.9)}}
`;
export function createHouseEntryLoading(){
 const root=document.createElement('div');root.className='house-entry-loading';root.setAttribute('role','img');root.setAttribute('aria-label','쭈다가 집으로 걸어 들어가는 뒷모습');
 const style=document.createElement('style');style.textContent=css;
 const scene=document.createElement('div');scene.className='house-entry-scene';
 const house=document.createElement('img');house.className='house-entry-house';house.alt='';house.decoding='async';house.fetchPriority='high';house.src=new URL('./assets/entry-house-v1.webp',import.meta.url).href;
 const walk=document.createElement('div');walk.className='house-entry-walk';
 const jjuda=document.createElement('img');jjuda.className='house-entry-jjuda';jjuda.alt='';jjuda.decoding='async';jjuda.src=new URL('./assets/entry-jjuda-back-v1.webp',import.meta.url).href;
 house.onload=house.onerror=()=>{scene.dataset.artReady='';};jjuda.onerror=()=>{jjuda.style.visibility='hidden';};
 if(house.complete)scene.dataset.artReady='';
 walk.append(jjuda);scene.append(house,walk);root.append(style,scene);return root;
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
