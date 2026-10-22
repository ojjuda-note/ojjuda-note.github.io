// Layered table foley. No downloads or autoplay; every source is cleaned up.
export function createPokerSound({contextFactory=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)()}={}){
  let context=null,master=null,noise=null,resuming=null,epoch=0,enabled=true,volume=.45;
  const voices=new Set(),settings=()=>({enabled,volume});
  function stop(){
    epoch++;
    for(const source of [...voices]){try{source.stop();}catch{}source.onended?.();}
  }
  function configure(value={}){
    if(typeof value.enabled==='boolean')enabled=value.enabled;
    if(Number.isFinite(value.volume))volume=Math.max(0,Math.min(1,value.volume));
    if(!enabled||!volume)stop();
    if(master)master.gain.setValueAtTime(enabled?volume:0,context.currentTime);
    return settings();
  }
  function unlock(){
    if(!enabled||!volume)return Promise.resolve(false);
    try{
      if(!context){
        context=contextFactory();master=context.createGain();master.gain.value=volume;
        if(context.createDynamicsCompressor){
          const limiter=context.createDynamicsCompressor();
          limiter.threshold.value=-16;limiter.knee.value=12;limiter.ratio.value=5;
          limiter.attack.value=.003;limiter.release.value=.16;
          master.connect(limiter);limiter.connect(context.destination);
        }else master.connect(context.destination);
        noise=context.createBuffer(1,Math.ceil(context.sampleRate*.6),context.sampleRate);
        const data=noise.getChannelData(0);let previous=0;
        for(let i=0;i<data.length;i++){previous=previous*.55+(Math.random()*2-1)*.45;data[i]=previous;}
      }
      if(context.state==='running')return Promise.resolve(true);
      if(!resuming)resuming=Promise.resolve(context.resume()).then(()=>context.state==='running',()=>false).finally(()=>{resuming=null;});
      return resuming;
    }catch{return Promise.resolve(false);}
  }
  function voice(source,at,duration,level,filter=null,pan=0,attack=.003){
    if(voices.size>=64){const oldest=voices.values().next().value;try{oldest.stop();}catch{}oldest.onended?.();}
    const gain=context.createGain(),panner=context.createStereoPanner?.();
    gain.gain.setValueAtTime(.0001,at);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002,level),at+attack);
    gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(filter||gain);if(filter)filter.connect(gain);
    if(panner){panner.pan.value=Math.max(-.65,Math.min(.65,pan));gain.connect(panner);panner.connect(master);}else gain.connect(master);
    let ended=false;voices.add(source);
    source.onended=()=>{if(ended)return;ended=true;voices.delete(source);source.disconnect();filter?.disconnect();gain.disconnect();panner?.disconnect();};
    source.start(at);source.stop(at+duration+.015);
  }
  function tone(hz,delay=0,duration=.1,level=.06,end=hz,pan=0){
    const at=context.currentTime+.008+delay,osc=context.createOscillator();osc.type='sine';
    osc.frequency.setValueAtTime(hz,at);osc.frequency.exponentialRampToValueAtTime(end,at+duration);
    voice(osc,at,duration,level,null,pan);
  }
  function brush(delay=0,duration=.1,hz=1800,level=.2,pan=0){
    const source=context.createBufferSource(),filter=context.createBiquadFilter();source.buffer=noise;
    if(source.playbackRate)source.playbackRate.value=.92+Math.random()*.16;
    filter.type='bandpass';filter.frequency.value=hz;filter.Q.value=.55;
    voice(source,context.currentTime+.008+delay,duration,level,filter,pan,.008);
  }
  function chip(delay,weight=1,pan=0){
    const pitch=.94+Math.random()*.12;
    brush(delay,.035,3900,.11*weight,pan);
    tone(2240*pitch,delay,.095,.035*weight,1980*pitch,pan);
    tone(3460*pitch,delay+.002,.055,.016*weight,3300*pitch,pan);
    tone(460,delay,.038,.04*weight,310,pan);
  }
  function chips(count,weight=1){for(let i=0;i<count;i++)chip(i*.048+Math.random()*.009,weight,(i%2?1:-1)*.16);}
  async function play(kind,{pan=0}={}){
    if(!enabled||!volume||!context)return false;
    const ticket=epoch;
    if(context.state!=='running'&&!(await (resuming||Promise.resolve(false))))return false;
    if(ticket!==epoch||!enabled||!volume||context.state!=='running')return false;
    try{
      switch(kind){
        case 'deal':for(let i=0;i<3;i++)brush(i*.075,.12,1400+i*230,.2,pan);break;
        case 'card':brush(0,.13,1800,.23,pan);brush(.045,.045,3400,.12,pan);tone(170,.095,.04,.07,95,pan);break;
        case 'select':brush(0,.035,2600,.13);tone(390,0,.035,.035,310);break;
        case 'discard':brush(0,.18,1000,.25,pan);tone(130,.11,.04,.045,80,pan);break;
        case 'reveal':brush(0,.15,2300,.22,pan);brush(.08,.055,1100,.19,pan);break;
        case 'check':for(const delay of [0,.105]){tone(165,delay,.055,.13,90,pan);brush(delay,.025,700,.12,pan);}break;
        case 'fold':brush(0,.16,800,.2,pan);break;
        case 'call':chips(2);break;
        case 'raise':chips(4);break;
        case 'allin':brush(0,.24,950,.2);chips(7,1.1);tone(100,.22,.17,.11,65);break;
        case 'turn':tone(523.25,0,.22,.055);tone(783.99,.09,.32,.035);break;
        case 'timer':tone(659.25,0,.11,.045);tone(659.25,.17,.11,.035);break;
        case 'win':chips(4,.7);[523.25,659.25,783.99,1046.5].forEach((hz,i)=>tone(hz,.12+i*.075,.62,.035));break;
        case 'end':brush(0,.15,1000,.12);tone(261.63,.03,.36,.035);tone(392,.08,.32,.022);break;
        default:return false;
      }
      return true;
    }catch{stop();return false;}
  }
  function pause(){stop();try{void context?.suspend().catch(()=>{});}catch{}}
  return Object.freeze({settings,configure,unlock,play,stop,pause});
}
