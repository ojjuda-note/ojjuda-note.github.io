import assert from 'node:assert/strict';
import {createPokerSound} from '../games/poker/sound.mjs';

function fixture(initial='running'){
  const nodes=[],sources=[];
  const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});
  const node=()=>{const n={connect(){},disconnect(){this.disconnected=true;}};nodes.push(n);return n;};
  const source=()=>{const n=Object.assign(node(),{start(at){this.at=at;},stop(at){this.stopped=at===undefined;},frequency:param()});sources.push(n);return n;};
  const context={state:initial,sampleRate:8000,currentTime:2,destination:{},
    createGain:()=>Object.assign(node(),{gain:param()}),
    createBuffer:(_channels,length)=>({getChannelData:()=>new Float32Array(length)}),
    createOscillator:source,createBufferSource:source,
    createBiquadFilter:()=>Object.assign(node(),{frequency:param(),Q:param()}),
    resume:async()=>{context.state='running';},suspend:async()=>{context.state='suspended';}};
  let created=0;const audio=createPokerSound({contextFactory:()=>{created++;return context;}});
  return {audio,context,sources,nodes,created:()=>created};
}

const f=fixture();
assert.equal(await f.audio.play('deal'),false);assert.equal(f.created(),0,'no audio context or autoplay on page load');
assert.equal(await f.audio.unlock(),true);
for(const cue of ['deal','card','select','discard','reveal','check','fold','call','raise','allin','turn','win','end']){
  const before=f.sources.length;assert.equal(await f.audio.play(cue),true,cue);
  const added=f.sources.slice(before);assert.ok(added.length>0,cue+' produces sound');assert.ok(added.every(s=>s.at>=f.context.currentTime));
  added.forEach(s=>s.onended());assert.ok(added.every(s=>s.disconnected),'finished audio nodes disconnect');
}
await f.audio.play('allin');const active=f.sources.filter(s=>!s.disconnected);
f.audio.configure({enabled:false});assert.ok(active.every(s=>s.stopped&&s.disconnected),'mute cancels scheduled tones immediately');
assert.equal(await f.audio.play('win'),false);
f.audio.configure({enabled:true,volume:0});assert.equal(await f.audio.play('win'),false);
f.audio.configure({volume:.25});assert.equal(f.audio.settings().volume,.25);
await f.audio.play('deal');f.audio.pause();assert.equal(f.context.state,'suspended');assert.equal(await f.audio.play('card'),false,'hidden tab cannot auto-resume audio');
assert.ok(f.sources.every(s=>s.disconnected));

const delayed=fixture('suspended');let resume;
delayed.context.resume=()=>new Promise(resolve=>{resume=()=>{delayed.context.state='running';resolve();};});
const unlocking=delayed.audio.unlock(),pending=delayed.audio.play('win');
delayed.audio.configure({enabled:false});resume();await unlocking;
assert.equal(await pending,false);assert.equal(delayed.sources.length,0,'muting during unlock cancels queued cue');
const rejected=fixture('suspended');rejected.context.resume=()=>Promise.reject(Error('blocked'));
assert.equal(await rejected.audio.unlock(),false);assert.equal(await rejected.audio.play('deal'),false);
const unsupported=createPokerSound({contextFactory:()=>{throw Error('unsupported');}});
assert.equal(await unsupported.unlock(),false);assert.equal(await unsupported.play('deal'),false);
console.log('PASS: all poker cues, gesture unlock, mute/volume, cleanup, hidden tab and blocked audio');
