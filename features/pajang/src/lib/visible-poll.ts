// Resume the normal cadence when the page returns. Each view handles its own immediate refresh.
export function pollWhileVisible(read:()=>void,period:number){
  let timer:number|undefined,away=false;
  function sync(){
    if(away||document.hidden){
      window.clearInterval(timer);timer=undefined;
    }else if(timer===undefined){
      timer=window.setInterval(()=>{if(!away&&!document.hidden)read();},period);
    }
  }
  const hide=()=>{away=true;sync();};
  const show=()=>{away=false;sync();};
  document.addEventListener("visibilitychange",sync);
  window.addEventListener("pagehide",hide);
  window.addEventListener("pageshow",show);
  sync();
  return ()=>{
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange",sync);
    window.removeEventListener("pagehide",hide);
    window.removeEventListener("pageshow",show);
  };
}
