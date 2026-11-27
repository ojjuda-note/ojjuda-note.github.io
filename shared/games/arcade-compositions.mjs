// Original game scores. Notes are scale degrees; onsets and lengths are in beats.
const scores = {
  solitaire: ["felt",70,50,[4,2,3,1,2,0,1,0]],
  mines: ["plucks",76,48,[0,2,1,3,2,4,1,0]],
  spot: ["bells",82,53,[0,2,4,2,1,3,1,0]],
  screw: ["plucks",92,53,[3,1,0,2,4,2,1,3]],
  saetbyeol: ["stars",68,52,[0,4,5,3,6,4,2,0]],
  chacha_rush: ["drive",131,50,[0,2,4,5,3,1,3,4]],
  mole: ["bounce",110,51,[3,0,3,1,4,2,1,0]],
  stacker: ["pulse",95,53,[0,1,2,3,4,3,2,1]],
  breakout: ["pulse",123,48,[4,1,3,0,2,5,4,2]],
  janggi: ["wood",68,50,[0,2,1,3,2,4,1,0]],
  chess: ["felt",65,47,[4,3,1,2,0,2,1,0]],
  billiards: ["swing",86,48,[0,3,2,4,1,3,4,2]],
  onecard: ["swing",106,53,[0,2,1,4,3,1,3,0]],
  bang: ["western",88,50,[0,0,4,3,1,0,2,1]],
  tank: ["pulse",100,45,[0,0,1,3,0,2,1,0]],
  yut: ["wood",102,53,[2,3,4,1,0,2,1,0]],
  tour: ["bounce",96,55,[0,2,4,3,5,2,1,0]],
  ttang: ["drive",112,48,[1,0,2,4,0,3,2,1]],
  photo_ttang: ["plucks",89,55,[1,3,2,0,4,2,3,1]],
  matgo: ["wood",93,48,[3,4,1,2,0,3,2,0]],
  croc: ["bounce",98,48,[0,1,0,3,1,0,4,0]],
  bottle: ["swing",92,53,[0,3,2,1,0,1,2,4]],
  bomb: ["pulse",104,46,[0,1,0,2,1,3,1,0]],
  stopwatch: ["stars",72,54,[4,2,1,0,3,1,4,2]],
  liar: ["plucks",79,47,[0,3,1,0,2,1,4,0]],
  king: ["wood",83,52,[0,2,4,5,2,3,1,0]],
  truth: ["felt",74,53,[2,1,3,2,0,4,1,0]],
  initial: ["bounce",108,52,[0,4,1,3,2,5,3,1]],
  minority: ["plucks",86,51,[0,2,0,1,3,1,4,0]],
  mission: ["western",94,52,[3,1,0,2,1,3,0,4]],
  fingers: ["bounce",88,50,[4,3,2,1,0,3,2,1]],
  imagevote: ["bells",84,55,[2,4,1,3,2,0,3,1]],
  updown: ["plucks",91,52,[0,1,2,4,3,2,1,0]],
  secretcount: ["stars",74,48,[0,3,1,2,0,4,2,1]],
  partyroulette: ["western",77,47,[0,1,3,1,0,4,1,0]],
  shapematch: ["bells",90,54,[0,1,4,3,1,2,4,0]],
};
const styles = {
  felt: [[0,2.5],2.8,[0.18,0.04],[0,3,4,0]],
  wood: [[0,1.5,3],1.15,[0.32,0.09],[0,0,3,4]],
  plucks: [[0.5,2,3.5],0.95,[0.28,0.13],[0,4,3,0]],
  bells: [[0,1.5,3.5],1.8,[0.23,0.02],[0,3,1,4]],
  stars: [[0.25,2.75],3.1,[0.09,0.18],[0,1,3,4]],
  swing: [[0.67,2,3.67],1.2,[0.27,0.07],[0,3,1,4]],
  western: [[0,1.5,3],1.5,[0.39,0.13],[0,3,0,4]],
  pulse: [[0,1.5,2.5,3.5],0.85,[0.12,0.22],[0,1,3,0]],
  drive: [[0.5,1.25,2,3.5],1.1,[0.22,0.15],[0,3,1,4]],
  bounce: [[0,1.5,2,3],0.85,[0.23,0.1],[0,3,4,0]],
};

// Render once, then loop a single buffer. No note timers run during gameplay.
export function renderLoop(game) {
  const garden = game==='sacheonseong';
  const [style,tempo,key,motif] = garden ? ['felt',76,50,[]] : scores[game];
  const [onsets,sustain,harmonics,chords] = styles[style];
  const beat=60/tempo, bars=16, duration=bars*4*beat, rate=22050;
  const Offline=window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const context=new Offline(1,Math.round((duration+3.5)*rate),rate);
  const mixed=context.createGain();
  mixed.gain.value=.87; mixed.connect(context.destination);
  const echo=context.createDelay(.5), tail=context.createGain();
  echo.delayTime.value=.25; tail.gain.value=.1;
  mixed.connect(echo); echo.connect(tail); tail.connect(context.destination);
  const wave=context.createPeriodicWave(new Float32Array(4),new Float32Array([0,1,...harmonics]));
  function note(tick,midi,seconds,level) {
    const start=tick*beat, end=start+seconds;
    const tone=context.createOscillator(), envelope=context.createGain();
    tone.setPeriodicWave(wave);tone.frequency.value=440*2**((midi-69)/12);
    envelope.gain.setValueAtTime(.0001,start);
    envelope.gain.exponentialRampToValueAtTime(level,start+.024);
    envelope.gain.exponentialRampToValueAtTime(level*.06,end-.08);
    envelope.gain.exponentialRampToValueAtTime(.0001,end);
    tone.connect(envelope);envelope.connect(mixed);tone.start(start);tone.stop(end);
  }
  if (garden) {
    const harmony=[[50,57,62,66],[47,54,59,62],[43,50,59,62],[45,52,61,64],
      [50,57,62,66],[42,49,57,61],[43,50,59,62],[45,52,59,64],
      [47,54,59,62],[42,49,57,61],[43,50,59,62],[50,57,62,66],
      [40,47,55,59],[45,52,57,61],[43,50,59,62],[45,52,59,64]];
    const phrases=[[[0,69],[1.5,66],[3,64]],[[1,62],[2.5,66]],[[0,67],[2,69]],[[1,64]]];
    harmony.forEach((chord,bar)=>{
      [0,2,1,3].forEach((index,tick)=>note(4*bar+tick,chord[index],2.5,tick===0?.14:.085));
      for(const [tick,pitch] of phrases[bar%4])note(4*bar+tick,pitch+(bar<8?0:[0,2,0,-2][bar%4]),2.9,.105);
    });
  } else {
    const minor=['western','pulse'].includes(style)||['mines','liar','chess'].includes(game);
    const scale=minor?[0,3,5,7,10]:[0,2,4,7,9];
    const pitch=degree=>key+12*Math.floor(degree/5)+scale[(degree%5+5)%5];
    for (let bar=0;bar<bars;bar++) {
      const chord=chords[bar%4], start=4*bar;
      note(start,pitch(chord-5),beat*2.7,.13);
      note(start+2,pitch(chord-2),beat*1.7,.085);
      note(start+1,pitch(chord+2),beat*1.8,.065);
      if (['drive','pulse','swing','bounce'].includes(style))note(start+3,pitch(chord),beat,.08);
      onsets.forEach((offset,i)=>{
        if (bar%4===3 && i===onsets.length-1) return;
        const degree=motif[(bar*onsets.length+i)%motif.length]+[0,1,-1,0][Math.floor(bar/4)]+5;
        note(start+offset,pitch(degree),sustain*beat,.11);
      });
    }
  }
  return context.startRendering().then(buffer=>{
    const samples=buffer.getChannelData(0), frames=Math.round(duration*rate);
    for(let i=frames;i<samples.length;i++)samples[i-frames]+=samples[i];
    return {buffer,loopEnd:frames/rate};
  });
}
