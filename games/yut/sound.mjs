// Wood and tabletop recording credits live beside their WAVs.
const recordings={
  wood:'/games/roulette/audio/wood-ball-impact-clean.wav',
  roll:'/games/roulette/audio/wood-ball-roll-clean.wav',
  table:'/games/drinking/audio/table-foley-v1.wav',
  // Trimmed from “Cheer 1 short” by jayfrosting (CC0), https://freesound.org/s/333405/
  cheer:'/games/yut/audio/bonus-cheer.mp3'
};
const preference='ojjuda.yut.sound';
export function createTableSounds(){
  const buffers=new Map(),active=new Set();
  let context,enabled=true,generation=0;
  try{enabled=window.localStorage.getItem(preference)!=='off';}catch{}
  function load(key){
    if(!buffers.has(key)){
      const pending=window.fetch(recordings[key]).then(response=>{
        if(!response.ok)throw Error('sound unavailable');
        return response.arrayBuffer();
      }).then(bytes=>context.decodeAudioData(bytes)).catch(()=>{buffers.delete(key);return null;});
      buffers.set(key,pending);
    }
    return buffers.get(key);
  }
  function unlock(){
    if(!enabled||document.hidden)return;
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)return;
    try{
      context??=new Audio();
      if(context.state!=='running')void context.resume().catch(()=>{});
      for(const key of Object.keys(recordings))void load(key);
    }catch{}
  }
  function stop(){
    generation++;
    for(const source of active)source.stop();
    active.clear();
  }
  function setEnabled(value){
    enabled=value;
    try{window.localStorage.setItem(preference,enabled?'on':'off');}catch{}
    if(enabled)unlock();else stop();
  }
  function play(key,delay,level,rate,offset=0,length){
    if(!enabled||document.hidden||!context)return;
    const token=generation,target=performance.now()+delay;
    void load(key).then(buffer=>{
      if(!buffer||generation!==token||!enabled||document.hidden||context.state!=='running')return;
      const remaining=target-performance.now();
      if(remaining < -100)return; // A late download must not replay an old turn.
      const start=context.currentTime+Math.max(0,remaining)/1000;
      const source=context.createBufferSource(),gain=context.createGain();
      const span=Math.min(length??buffer.duration-offset,buffer.duration-offset);
      source.buffer=buffer;source.playbackRate.value=rate;
      gain.gain.setValueAtTime(0,start);
      gain.gain.linearRampToValueAtTime(level,start+.002);
      const end=start+span/rate;
      gain.gain.setValueAtTime(level,Math.max(start+.002,end-.016));
      gain.gain.linearRampToValueAtTime(0,end);
      source.connect(gain);gain.connect(context.destination);active.add(source);
      source.onended=()=>{active.delete(source);source.disconnect();gain.disconnect();};
      source.start(start,offset,span);
    }).catch(()=>{});
  }
  function throwSticks(plan){
    play('wood',0,.32,1.38);play('wood',42,.28,1.19);
    for(const rod of plan.rods){
      const impact=rod.delay+rod.flight,rate=.87+rod.index*.11;
      play('wood',impact,.60,rate);
      play('wood',impact+rod.bounce,.26,rate*1.08);
      if(rod.index===plan.upper)play('roll',impact+rod.bounce+9,.27,1.12,.45,.22);
    }
  }
  function quickThrow(){
    play('wood',0,.53,.96);play('wood',37,.38,1.15);play('wood',94,.21,1.03);
  }
  function cheer(){
    play('cheer',0,.60,1);
  }
  function land(kind,delay=0,step=0){
    // A single landing for the whole stack, with an extra physical contact on special moves.
    play('table',delay,.74,1+(step%3)*.065,0,.09646);
    if(kind==='carry'||kind==='capture')play('table',delay+61,.65,.94,.92292,.08950);
    if(kind==='back')play('roll',delay+7,.40,.89,.77,.17);
    if(kind==='home')play('wood',delay+44,.56,.74);
    if(kind==='finish')play('table',delay+85,.57,1.04,1.48375,.29342);
  }
  return {unlock,stop,setEnabled,get enabled(){return enabled;},throwSticks,quickThrow,cheer,land};
}
