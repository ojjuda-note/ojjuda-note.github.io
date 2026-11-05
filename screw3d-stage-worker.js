// Build the next 3D screw puzzle outside the animation / touch thread.
// The worker never touches coins, the user's account, or game progress.
import {makeLevel} from './screw3d.js?v=20261105-screwbox-connected-plush1';

self.onmessage=event=>{
  const stage=Number(event.data?.stage);
  if(!Number.isInteger(stage)||stage<1||stage>1000)return;
  try{
    const level=makeLevel(stage);
    self.postMessage({stage,level});
  }catch(error){
    self.postMessage({stage,error:String(error?.message||error)});
  }
};
