(function(){
  'use strict';
  window.OjjudaPlaces3D={install(app){
    let stage=null,frame=null,engine=null,owner=null,timer=null,observer=null;
    const current=()=>frame?.isConnected&&stage?.isConnected&&owner===app.identity();
    function visible(){const rect=stage?.getBoundingClientRect();return !!rect&&!document.hidden&&!document.querySelector('#gov, #modal-root .modal')&&rect.bottom>=-80&&rect.top<=innerHeight+80;}
    function dispose(){clearTimeout(timer);observer?.disconnect();engine?.dispose();stage=frame=engine=observer=null;}
    function fallback(){if(!stage)return;stage.classList.remove('place3d-ready');frame.hidden=true;stage.querySelector('#place-svg')?.removeAttribute('aria-hidden');stage.querySelector('.place3d-status').textContent='기본 화면으로 열었어요.';engine?.setActive(false);clearTimeout(timer);}
    function sync(){owner=app.identity();if(!current()||!engine||frame.hidden)return false;try{engine.applyPlace(app.snapshot());const source=frame,identity=owner;engine.hooks.onPlaceTap=hit=>{if(frame===source&&owner===identity&&current())app.tap(hit);};engine.setActive(visible());return true;}catch(error){console.warn('Place preview unavailable',error);fallback();return false;}}
    function ready(){if(!current()||engine)return;engine=frame.contentWindow.Ojjuda3D;if(!engine?.applyPlace)return fallback();const source=frame;engine.hooks.onError=()=>{if(frame===source)fallback();};if(!sync())return;clearTimeout(timer);stage.classList.add('place3d-ready');stage.querySelector('#place-svg')?.setAttribute('aria-hidden','true');stage.querySelector('.place3d-status').textContent='';observer=new IntersectionObserver(()=>engine?.setActive(visible()),{rootMargin:'80px'});observer.observe(stage);}
    function mount(){const next=document.querySelector('#pstage');if(next===stage){sync();return;}dispose();if(!next)return;stage=next;owner=app.identity();stage.classList.add('place3d-stage');frame=document.createElement('iframe');frame.className='place3d-frame';frame.title=app.snapshot().name+' 입체 공간';frame.src='/room3d/index.html?view=place&v=20261001-catcoats1';
      const status=document.createElement('span');status.className='place3d-status';status.setAttribute('role','status');status.textContent='공간을 준비하고 있어요…';
      const controls=document.createElement('div');controls.className='place3d-tools';controls.dataset.worldSwipe='off';
      for(const [label,text,delta] of [['공간 축소','−',-.15],['공간 맞춤','맞춤',0],['공간 확대','+',.15]]){const button=document.createElement('button');button.type='button';button.textContent=text;button.setAttribute('aria-label',label);button.addEventListener('click',()=>engine?.zoom(delta));controls.append(button);}
      stage.append(frame,status,controls);frame.addEventListener('load',()=>{if(frame?.contentWindow.Ojjuda3D)ready();});timer=setTimeout(fallback,20000);
    }
    addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame?.contentWindow||!current())return;if(event.data?.type==='ojjuda-room-ready')ready();if(event.data?.type==='ojjuda-room-error')fallback();});
    addEventListener('pagehide',dispose);addEventListener('pageshow',()=>{if(!frame)mount();});
    return {mount,sync,dispose};
  }};
})();
