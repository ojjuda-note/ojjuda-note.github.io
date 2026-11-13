(() => {
  'use strict';
  const read=k=>{try{return localStorage.getItem('oj.party.'+k)!=='off'}catch{return true}};
  const prefs={sound:read('sound'),vibration:read('vibration')};
  let ctx,master;
  const voices=new Set();
  // Local recordings: Kenney's mouseclick1 and switch12 and kim.headlee's child laugh (both CC0).
  const buttonClick=new Audio('/games/croc/audio/switch-click.wav');
  const crocLaugh=new Audio('/games/croc/audio/croc-laugh.wav');
  buttonClick.preload=crocLaugh.preload='auto';
  crocLaugh.loop=true;
  let biteTimer=null;

  function playRecording(clip){
    clip.currentTime=0;
    clip.play().catch(()=>{});
  }
  function vibrate(ms){
    try{navigator.vibrate?.(ms)}catch{}
  }
  function startBite(){
    if(document.hidden||biteTimer!==null)return;
    if(prefs.sound)playRecording(crocLaugh);
    // Renew the motor before its current uninterrupted burst expires.
    const sustain=()=>{if(prefs.vibration&&!document.hidden)vibrate(3000)};
    sustain();
    biteTimer=setInterval(sustain,1500);
  }
  function unlock(){
    if(!prefs.sound)return;
    try{
      if(!ctx){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
        ctx=new Audio();master=ctx.createGain();master.gain.value=.32;master.connect(ctx.destination)}
      if(ctx.state==='suspended')ctx.resume().catch(()=>{});
    }catch{}
  }
  // Each note is [offset, initial Hz, final Hz, duration, oscillator].
  const scores={
    tap:[[0,450,660,.055,'sine']], deal:[[0,290,440,.05,'triangle'],[.075,410,550,.06,'triangle']],
    turn:[[0,390,480,.055,'triangle'],[.07,585,675,.09,'triangle']],
    spin:[[0,710,435,.04,'triangle']], stop:[[0,660,660,.08,'sine'],[.09,880,880,.16,'triangle']],
    tick:[[0,780,540,.05,'square']], boom:[[0,165,34,.42,'sawtooth'],[.05,78,28,.52,'triangle']],
    flip:[[0,270,460,.13,'sine']], king:[[0,392,392,.11,'triangle'],[.12,523,523,.13,'triangle'],[.26,659,659,.23,'triangle']],
    truth:[[0,523,587,.1,'sine'],[.1,698,784,.18,'sine']], vote:[[0,290,390,.07,'triangle']],
    count:[[0,860,800,.08,'triangle']], result:[[0,523,523,.10,'triangle'],[.11,659,659,.12,'triangle'],[.24,784,784,.22,'triangle']]
  };
  const buzz={tap:9,deal:14,turn:[14,28,14],tooth:18,snap:[70,32,95],spin:8,stop:[32,28,52],tick:12,boom:[130,55,180],flip:14,king:[28,30,28,30,68],truth:18,vote:14,count:14,result:[24,36,44]};
  function play(id){
    if(document.hidden)return;
    if(prefs.vibration)vibrate(buzz[id]||8);
    if(id==='tooth'||id==='snap'){
      if(prefs.sound)playRecording(buttonClick);
      return;
    }
    if(!prefs.sound||!ctx||ctx.state!=='running')return;
    const now=ctx.currentTime;
    for(const [delay,f1,f2,dur,type] of scores[id]||scores.tap){
      const osc=ctx.createOscillator(),gain=ctx.createGain(),at=now+delay;
      osc.type=type;osc.frequency.setValueAtTime(f1,at);osc.frequency.exponentialRampToValueAtTime(f2,at+dur);
      gain.gain.setValueAtTime(.001,at);gain.gain.exponentialRampToValueAtTime(type==='square'?.095:.21,at+.009);gain.gain.exponentialRampToValueAtTime(.001,at+dur);
      osc.connect(gain);gain.connect(master);voices.add(osc);
      osc.onended=()=>{voices.delete(osc);osc.disconnect();gain.disconnect()};
      osc.start(at);osc.stop(at+dur+.01);
    }
  }
  function silenceAudio(){
    buttonClick.pause();
    crocLaugh.pause();
    for(const voice of voices)try{voice.stop()}catch{}
  }
  function quiet(){
    clearInterval(biteTimer);
    biteTimer=null;
    silenceAudio();
    vibrate(0);
  }
  function change(key,on){
    prefs[key]=on;
    try{localStorage.setItem('oj.party.'+key,on?'on':'off')}catch{}
    if(key==='sound'){
      if(on){
        unlock();
        if(biteTimer!==null&&!document.hidden)playRecording(crocLaugh);
      }else silenceAudio();
    }else if(!on)vibrate(0);
    else if(biteTimer!==null&&!document.hidden)vibrate(3000);
  }
  document.addEventListener('pointerdown',unlock,{capture:true});document.addEventListener('keydown',unlock,{capture:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)quiet()});
  window.PartyFX={play,unlock,quiet,prefs,change,startBite};
})();
