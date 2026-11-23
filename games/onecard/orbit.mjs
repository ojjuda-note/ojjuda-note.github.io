// Two broad light ribbons follow the outer ellipse. Their SVG groups rotate
// in circle coordinates, then the viewBox fits the full curves to the table.
export function createDirectionOrbit({element,reduced}) {
  const markers=[...element.querySelectorAll('.orbit-marker')],tau=Math.PI*2;
  let phase=Math.PI/2,direction=1,active=false,paused=false,suspended=false;
  let frame=0,lastTime=null,ready=false;

  function measure(){
    // An entry-to-table transition can still report a zero-size box. Keep the
    // cue hidden until its real layout is available, including reduced motion.
    const rect=element.getBoundingClientRect();
    ready=rect.width>36&&rect.height>36;
    if(!ready){element.dataset.ready='false';return;}
  }
  function paint(){
    if(!ready)return;
    markers.forEach((marker,index)=>{
      const angle=phase+index*tau/markers.length;
      marker.style.transform=`rotate(${angle.toFixed(5)}rad)`;
    });
    if(element.dataset.ready!=='true')element.dataset.ready='true';
  }
  function canRun(){return active&&ready&&!paused&&!suspended&&!document.hidden&&!reduced.matches;}
  function stop(){if(frame)cancelAnimationFrame(frame);frame=0;lastTime=null;}
  function tick(now){
    frame=0;if(!canRun()){lastTime=null;return;}
    // Bound a delayed frame so waking a throttled tab cannot jump around the table.
    if(lastTime!==null)phase=(phase+direction*Math.min(Math.max(0,now-lastTime),64)*tau/18000)%tau;
    lastTime=now;paint();frame=requestAnimationFrame(tick);
  }
  function sync(){
    const state=!active?'idle':reduced.matches?'reduced':canRun()?'running':'paused';
    if(element.dataset.state!==state)element.dataset.state=state;
    if(canRun()){if(!frame)frame=requestAnimationFrame(tick);}else stop();
  }
  function update(next){
    const nextDirection=next.direction===-1?-1:1;
    const changedDirection=nextDirection!==direction,changedActive=!!next.active!==active;
    direction=nextDirection;active=!!next.active;paused=!!next.paused;
    element.hidden=!active;
    const label=direction===-1?'counterclockwise':'clockwise';
    if(element.dataset.direction!==label)element.dataset.direction=label;
    if(changedDirection)markers.forEach(marker=>{
      const flow=marker.querySelector('.orbit-flow');
      if(direction===-1)flow.setAttribute('transform','translate(0 100) scale(1 -1)');
      else flow.removeAttribute('transform');
    });
    const remeasure=active&&(changedActive||!ready);
    if(!active){ready=false;element.dataset.ready='false';}
    else if(remeasure)measure();
    if(changedActive||changedDirection||remeasure){lastTime=null;paint();}
    sync();
  }
  const observer=new ResizeObserver(()=>{if(active){measure();paint();}sync();});
  observer.observe(element);
  const visibility=()=>sync();
  const preference=()=>{paint();sync();};
  const hide=()=>{suspended=true;sync();};
  const show=()=>{suspended=false;if(active){measure();paint();}sync();};
  document.addEventListener('visibilitychange',visibility);
  reduced.addEventListener('change',preference);
  window.addEventListener('pagehide',hide);
  window.addEventListener('pageshow',show);
  return {update,destroy(){
    active=false;element.hidden=true;stop();observer.disconnect();
    document.removeEventListener('visibilitychange',visibility);
    reduced.removeEventListener('change',preference);
    window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);
  }};
}
