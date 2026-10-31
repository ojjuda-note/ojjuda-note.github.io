const clamp=(value,min=0,max=1)=>Math.min(max,Math.max(min,value));

// Recorded marble-on-wood contact; short procedural chip/win accents.
// One reusable loop follows motion without creating nodes every frame.
export class Sound{
  constructor(){
    this.enabled=true;this.ctx=null;this.master=null;this.noiseBuffer=null;
    this.rollBuffer=null;this.impactBuffer=null;this.samplePromise=null;this.disposed=false;
    this.rolling=false;this.loop=null;this.progress=0;this.pose=null;
    this.lastUpdate=-Infinity;this.lastImpact=-Infinity;this.lastChip=-Infinity;
    this.voices=new Set();this.hidden=typeof document!=='undefined'&&document.hidden;
    this.onVisibility=()=>{
      this.hidden=document.hidden;this.applyVolume();
      if(this.hidden){this.endLoop();this.clearVoices()}
      else if(this.rolling)this.ensureLoop();
    };
    if(typeof document!=='undefined')document.addEventListener('visibilitychange',this.onVisibility);
  }
  async unlock(){
    if(this.disposed)return;
    if(!this.ctx){
      const AC=globalThis.AudioContext||globalThis.webkitAudioContext;
      if(!AC)return;
      this.ctx=new AC();
      const c=this.ctx;
      this.master=c.createGain();this.master.gain.value=this.enabled&&!this.hidden?.52:0;
      const limiter=c.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=12;limiter.ratio.value=4;limiter.attack.value=.004;limiter.release.value=.12;
      this.master.connect(limiter);limiter.connect(c.destination);this.limiter=limiter;
      this.noiseBuffer=c.createBuffer(1,c.sampleRate*2,c.sampleRate);
      const data=this.noiseBuffer.getChannelData(0);let previous=0;
      for(let i=0;i<data.length;i++){previous=.72*previous+(Math.random()*2-1)*.28;data[i]=previous*1.8}
      // Taper both ends so the two-second texture loops without a seam.
      const edge=Math.min(128,Math.floor(data.length/100));
      for(let i=0;i<edge;i++){const level=i/edge;data[i]*=level;data[data.length-1-i]*=level}
    }
    if(this.ctx.state==='suspended')await this.ctx.resume();
    await this.loadBallAudio();
    if(this.rolling)this.ensureLoop();
  }
  async loadBallAudio(){
    if(this.rollBuffer&&this.impactBuffer)return;
    if(this.samplePromise)return this.samplePromise;
    const context=this.ctx;
    if(!context||this.disposed)return;
    this.samplePromise=(async()=>{
      try{
        const buffers=await Promise.all(['wood-ball-roll-clean.wav','wood-ball-impact-clean.wav'].map(async file=>{
          const response=await fetch(new URL(`./audio/${file}`,import.meta.url));
          if(!response.ok)throw new Error('Ball audio unavailable');
          return context.decodeAudioData(await response.arrayBuffer());
        }));
        if(this.ctx!==context||this.disposed)return;
        [this.rollBuffer,this.impactBuffer]=buffers;
        if(this.rolling)this.ensureLoop();
      }catch{
        // Stay quiet if loading fails; never replace the ball with noise.
      }
    })();
    try{await this.samplePromise}finally{this.samplePromise=null}
  }
  ready(){return !!this.ctx&&this.ctx.state==='running'&&this.enabled&&!this.hidden}
  applyVolume(){
    if(!this.ctx||!this.master)return;
    const now=this.ctx.currentTime;this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.enabled&&!this.hidden?.52:0,now,.025);
  }
  setEnabled(value){
    this.enabled=!!value;this.applyVolume();
    if(!this.enabled){this.endLoop();this.clearVoices()}
    else if(this.rolling)this.ensureLoop();
  }
  beginRoll(){
    this.rolling=true;this.progress=0;this.pose=null;
    this.lastImpact=-Infinity;this.lastUpdate=-Infinity;this.ensureLoop();
  }
  ensureLoop(){
    if(!this.rolling||!this.ready()||!this.rollBuffer||this.loop)return;
    const c=this.ctx,source=c.createBufferSource(),high=c.createBiquadFilter(),low=c.createBiquadFilter(),gain=c.createGain();
    source.buffer=this.rollBuffer;source.loop=true;
    high.type='highpass';high.frequency.value=85;high.Q.value=.5;
    low.type='lowpass';low.frequency.value=3600;low.Q.value=.4;
    gain.gain.value=0;source.connect(high);high.connect(low);low.connect(gain);gain.connect(this.master);
    const loop={source,high,low,gain};this.loop=loop;
    source.onended=()=>{for(const node of [source,high,low,gain])node.disconnect()};source.start();
    this.lastUpdate=-Infinity;this.updateRoll(this.progress,this.pose);
  }
  updateRoll(progress,pose=null){
    this.progress=clamp(progress);this.pose=pose;
    if(!this.rolling||!this.ready())return;
    if(!this.loop){this.ensureLoop();return}
    const now=this.ctx.currentTime;
    // At most 30 automation updates per second, even on 120Hz displays.
    if(now-this.lastUpdate<1/30)return;
    this.lastUpdate=now;
    // The trajectory supplies contact speed relative to the surface below
    // the ball. A ball resting in a turning pocket has no rolling contact.
    const speed=clamp((Number.isFinite(pose?.surfaceSpeed)?pose.surfaceSpeed:0)/4500);
    const textureSpeed=Math.sqrt(speed);
    const contact=pose&&pose.height>1?0:1;
    const volume=this.progress===1?0:.52*textureSpeed*contact;
    // Slow contacts stay soft and low; faster rolling becomes quicker and
    // clearer. Smoothing keeps bounces and changing speed free of zipper noise.
    this.loop.source.playbackRate.setTargetAtTime(.55+.75*textureSpeed,now,.08);
    this.loop.low.frequency.setTargetAtTime(1900+1800*textureSpeed,now,.08);
    this.loop.gain.gain.setTargetAtTime(volume,now,contact===1?.045:.012);
  }
  endLoop(){
    const loop=this.loop;if(!loop||!this.ctx)return;
    this.loop=null;const now=this.ctx.currentTime;
    loop.gain.gain.cancelScheduledValues(now);loop.gain.gain.setTargetAtTime(0,now,.018);
    loop.source.stop(now+.09);
  }
  stopRoll(){this.rolling=false;this.endLoop()}
  clearVoices(){
    for(const voice of this.voices){try{voice.source.stop()}catch{}}
    this.voices.clear();
  }
  voice(source,nodes,end,when){
    // Prevent rapid taps or resumed frames from stacking a loud audio burst.
    if(this.voices.size>=24){for(const node of [source,...nodes])node.disconnect();return false}
    const voice={source};this.voices.add(voice);
    source.onended=()=>{this.voices.delete(voice);for(const node of [source,...nodes])node.disconnect()};
    source.start(when);source.stop(end);return true;
  }
  noise(when,volume,frequency,decay){
    if(!this.ready())return;
    const c=this.ctx,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
    source.buffer=this.noiseBuffer;source.playbackRate.value=.85+Math.random()*.3;
    filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.7;
    gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(volume,when+.0015);gain.gain.exponentialRampToValueAtTime(.0001,when+decay);
    source.connect(filter);filter.connect(gain);gain.connect(this.master);
    this.voice(source,[filter,gain],when+decay+.015,when);
  }
  resonance(when,frequency,volume,decay){
    if(!this.ready())return;
    const c=this.ctx,source=c.createOscillator(),gain=c.createGain();source.type='sine';source.frequency.value=frequency;
    gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(volume,when+.002);gain.gain.exponentialRampToValueAtTime(.0001,when+decay);
    source.connect(gain);gain.connect(this.master);this.voice(source,[gain],when+decay+.015,when);
  }
  chip(){
    if(!this.ready())return;const now=this.ctx.currentTime;
    if(now-this.lastChip<.045)return;this.lastChip=now;
    const detune=.94+Math.random()*.12;
    // A ceramic edge click with a short, lower body contact against the felt.
    this.noise(now,.21,2100*detune,.025);
    this.resonance(now,1150*detune,.048,.035);
    this.noise(now+.022,.065,720*detune,.032);
  }
  roll(progress,strength){
    if(!strength||!this.rolling||!this.ready()||!this.impactBuffer)return;
    const now=this.ctx.currentTime;if(now-this.lastImpact<.055)return;this.lastImpact=now;
    const energy=clamp(typeof strength==='number'?strength:.6,.12,1.2);
    const c=this.ctx,source=c.createBufferSource(),gain=c.createGain();
    source.buffer=this.impactBuffer;source.playbackRate.value=.96+Math.random()*.08;
    gain.gain.value=.35*energy;source.connect(gain);gain.connect(this.master);
    this.voice(source,[gain],now+this.impactBuffer.duration/source.playbackRate.value,now);
  }
  win(){
    if(!this.ready())return;const now=this.ctx.currentTime;
    // A restrained glass-like two-note cadence, without a sweeping synth beep.
    for(const [delay,frequency] of [[0,659.25],[.14,987.77]]){
      this.resonance(now+delay,frequency,.055,.48);
      this.resonance(now+delay,frequency*2.01,.009,.22);
    }
  }
  dispose(){
    this.disposed=true;
    this.stopRoll();this.clearVoices();
    if(typeof document!=='undefined')document.removeEventListener('visibilitychange',this.onVisibility);
    this.ctx?.close();this.ctx=null;
  }
}
