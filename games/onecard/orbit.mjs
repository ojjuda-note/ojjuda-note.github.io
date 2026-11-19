// A quiet direction cue around the players. Only the three small markers move;
// geometry is measured on resize, never inside the animation frame.
export function createDirectionOrbit({element,reduced}) {
  const markers=[...element.querySelectorAll('.orbit-marker')],tau=Math.PI*2;
  let phase=Math.PI/2,direction=1,active=false,paused=false,suspended=false;
  let frame=0,lastTime=null,width=0,height=0,rx=0,ry=0;

  function measure(){
    const rect=element.getBoundingClientRect();width=rect.width;height=rect.height;
    rx=Math.max(0,width/2-18);ry=Math.max(0,height/2-18);
  }
  function paint(){
    markers.forEach((marker,index)=>{
      const angle=phase+index*tau/markers.length;
      const x=width/2+Math.cos(angle)*rx,y=height/2+Math.sin(angle)*ry;
      const tangent=Math.atan2(Math.cos(angle)*ry,-Math.sin(angle)*rx)+(direction===-1?Math.PI:0);
      marker.style.transform=`translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${tangent.toFixed(5)}rad)`;
    });
  }
  function canRun(){return active&&!paused&&!suspended&&!document.hidden&&!reduced.matches&&rx>0&&ry>0;}
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
    if(changedActive&&active)measure();
    if(changedActive||changedDirection){lastTime=null;paint();}
    sync();
  }
  const observer=new ResizeObserver(()=>{measure();paint();sync();});
  observer.observe(element);
  const visibility=()=>sync();
  const preference=()=>{paint();sync();};
  const hide=()=>{suspended=true;sync();};
  const show=()=>{suspended=false;measure();paint();sync();};
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
