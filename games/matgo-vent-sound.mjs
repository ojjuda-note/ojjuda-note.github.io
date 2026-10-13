// Small, original Web Audio effects. No media download and no third-party samples.
export function createVentSound({enabled=()=>{try{return window.localStorage.getItem('ojjuda-matgo-sound')!=='off';}catch{return true;}}}={}){
  let ctx=null,bus=null,noiseBuffer=null,destroyed=false;
  const voices=new Set();
  function stop(){for(const voice of voices){try{voice.stop();}catch{}}voices.clear();}
  function sync(){if(!enabled()||document.hidden)stop();}
  function unlock(){
    if(destroyed||!enabled())return;
    try{
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
      if(!ctx){
        ctx=new Audio();bus=ctx.createGain();bus.gain.value=.52;
        const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-16;limiter.knee.value=14;limiter.ratio.value=5;limiter.attack.value=.003;limiter.release.value=.16;
        bus.connect(limiter);limiter.connect(ctx.destination);
        noiseBuffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const samples=noiseBuffer.getChannelData(0);let seed=0x51af19;
        for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;samples[i]=seed/2147483648-1;}
      }
      if(ctx.state==='suspended')return ctx.resume().catch(()=>{});
    }catch{}
  }
  function voice(source,at,duration,gain,attack=.004,filter=null){
    const envelope=ctx.createGain();envelope.gain.setValueAtTime(0,at);envelope.gain.linearRampToValueAtTime(gain,at+attack);envelope.gain.exponentialRampToValueAtTime(.0001,at+duration);
    if(filter){source.connect(filter);filter.connect(envelope);}else source.connect(envelope);
    envelope.connect(bus);voices.add(source);source.onended=()=>{voices.delete(source);source.disconnect();filter?.disconnect();envelope.disconnect();};source.start(at);source.stop(at+duration+.025);
  }
  function noise(at,duration,gain,frequency,type='lowpass',attack=.003,endFrequency=null){
    const source=ctx.createBufferSource();source.buffer=noiseBuffer;
    const filter=ctx.createBiquadFilter();filter.type=type;filter.frequency.setValueAtTime(frequency,at);filter.Q.value=.65;
    if(endFrequency)filter.frequency.exponentialRampToValueAtTime(endFrequency,at+duration);
    voice(source,at,duration,gain,attack,filter);
  }
  function tone(at,duration,gain,frequency,end=frequency,type='sine'){
    const oscillator=ctx.createOscillator();oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,at);oscillator.frequency.exponentialRampToValueAtTime(end,at+duration);voice(oscillator,at,duration,gain);
  }
  function impact(id,at){
    if(id==='gun'){
      noise(at,.12,.83,7500,'lowpass');noise(at+.009,.30,.52,1350);tone(at,.19,.56,150,47);
      noise(at+.062,.19,.14,1800,'bandpass');tone(at+.24,.17,.035,2900,2400);tone(at+.30,.12,.022,3600,3100);
    }else if(id==='hammer'){
      noise(at,.14,.73,4100);tone(at,.24,.65,105,38);
      for(const [frequency,gain] of [[720,.18],[1130,.115],[1850,.055]])tone(at,.62,gain,frequency,frequency*.985);
      noise(at+.035,.30,.17,830);
    }else if(id==='glove'){
      tone(at,.21,.85,190,42);noise(at,.095,.8,900);noise(at+.018,.16,.24,2300,'bandpass');tone(at+.015,.11,.16,330,90);
    }else if(id==='bomb'){
      noise(at,.16,.68,6100);noise(at+.015,1.15,.9,1550,'lowpass',.015,100);tone(at,1.05,.9,105,28);
      noise(at+.09,.95,.36,330);noise(at+.20,.55,.20,2900,'highpass');
    }else if(id==='table'){
      tone(at,.45,.72,90,27);noise(at,.30,.75,1800);noise(at+.06,.8,.45,550,'lowpass',.015,110);
      for(let i=0;i<6;i++){noise(at+.04+i*.055,.09,.18,1000+i*430,'bandpass');tone(at+.10+i*.045,.13,.065,310+i*120,80);}
    }else if(id==='lightning'){
      noise(at,.18,.5,4300,'highpass');tone(at,.3,.18,1600,140,'sawtooth');
      for(let i=0;i<5;i++){noise(at+i*.07,.055,.25,2200+i*480,'bandpass');tone(at+i*.075,.08,.075,700+i*410,120,'square');}
      tone(at,.40,.36,100,42);
    }
  }
  function play(id,hits){
    if(destroyed||!enabled()||document.hidden||ctx?.state!=='running')return false;
    stop();const start=ctx.currentTime+.018,first=(hits[0]||0)/1000;
    if(id==='hammer'||id==='glove'||id==='table')noise(start+Math.max(0,first-.33),.31,.16,450,'bandpass',.08,2600);
    if(id==='bomb')noise(start,.75,.075,5200,'highpass',.05);
    if(id==='lightning'){tone(start,.55,.05,150,1050,'triangle');noise(start,.55,.055,4200,'bandpass',.15);}
    for(const ms of hits)impact(id,start+ms/1000);
    return true;
  }
  function onClick(event){if(event.target.closest?.('#sound'))queueMicrotask(sync);}
  document.addEventListener('click',onClick);document.addEventListener('visibilitychange',sync);window.addEventListener('storage',sync);
  return {unlock,play,stop,destroy(){destroyed=true;stop();document.removeEventListener('click',onClick);document.removeEventListener('visibilitychange',sync);window.removeEventListener('storage',sync);if(ctx)void ctx.close().catch(()=>{});}};
}
