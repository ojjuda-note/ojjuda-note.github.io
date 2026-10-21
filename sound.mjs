// Short, locally synthesized effects; audio starts only after a player gesture.
export function createPokerSound({contextFactory=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)()}={}){
  let context=null,master=null,noise=null,resuming=null,epoch=0,enabled=true,volume=.45;
  const voices=new Set();
  const settings=()=>({enabled,volume});
  function stop(){
    epoch++;
    for(const voice of [...voices]){try{voice.stop();}catch{}voice.onended?.();}
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
        context=contextFactory();master=context.createGain();master.gain.value=volume;master.connect(context.destination);
        noise=context.createBuffer(1,Math.ceil(context.sampleRate*.25),context.sampleRate);
        const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
      }
      if(context.state==='running')return Promise.resolve(true);
      if(!resuming)resuming=Promise.resolve(context.resume()).then(()=>context.state==='running',()=>false).finally(()=>{resuming=null;});
      return resuming;
    }catch{return Promise.resolve(false);}
  }
  function voice(source,at,duration,level,filter=null){
    const gain=context.createGain();gain.gain.setValueAtTime(.0001,at);
    gain.gain.exponentialRampToValueAtTime(level,at+.005);
    gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(filter||gain);if(filter)filter.connect(gain);gain.connect(master);
    voices.add(source);source.onended=()=>{voices.delete(source);source.disconnect();filter?.disconnect();gain.disconnect();};
    source.start(at);source.stop(at+duration+.01);
  }
  function tone(hz,delay=0,duration=.12,level=.12,end=hz,type='sine'){
    const at=context.currentTime+.012+delay,osc=context.createOscillator();osc.type=type;
    osc.frequency.setValueAtTime(hz,at);osc.frequency.exponentialRampToValueAtTime(end,at+duration);
    voice(osc,at,duration,level);
  }
  function brush(delay=0,duration=.09,hz=1700,level=.22){
    const source=context.createBufferSource(),filter=context.createBiquadFilter();source.buffer=noise;
    filter.type='bandpass';filter.frequency.value=hz;filter.Q.value=.8;
    voice(source,context.currentTime+.012+delay,duration,level,filter);
  }
  function chips(count=3){for(let i=0;i<count;i++){brush(i*.055,.045,3200,.18);tone(1600+i*110,i*.055,.055,.055,1100);}}
  async function play(kind){
    if(!enabled||!volume||!context)return false;
    const ticket=epoch;
    if(context.state!=='running'&&!(await (resuming||Promise.resolve(false))))return false;
    if(ticket!==epoch||!enabled||!volume||context.state!=='running')return false;
    try{
      switch(kind){
        case 'deal':for(let i=0;i<4;i++)brush(i*.075,.08,1200+i*180,.25);break;
        case 'card':brush(0,.1,1600);tone(280,.065,.06,.07,200);break;
        case 'select':tone(620,0,.06,.07,760);break;
        case 'discard':brush(0,.12,950,.18);break;
        case 'reveal':brush(0,.12,2300,.2);tone(740,.06,.14,.09,880);break;
        case 'check':tone(155,0,.06,.15,95);tone(155,.095,.06,.12,95);break;
        case 'fold':brush(0,.11,700,.15);break;
        case 'call':chips(2);break;
        case 'raise':chips(4);break;
        case 'allin':chips(6);[330,440,660].forEach((hz,i)=>tone(hz,.12+i*.085,.2,.09));break;
        case 'turn':tone(440,0,.13,.06);tone(554.37,.11,.16,.05);break;
        case 'win':chips(4);[293.66,369.99,440,587.33].forEach((hz,i)=>tone(hz,.1+i*.07,.5,.065));break;
        case 'end':tone(392,0,.22,.07);tone(330,.14,.3,.055);break;
        default:return false;
      }
      return true;
    }catch{stop();return false;}
  }
  function pause(){stop();try{void context?.suspend().catch(()=>{});}catch{}}
  return Object.freeze({settings,configure,unlock,play,stop,pause});
}
