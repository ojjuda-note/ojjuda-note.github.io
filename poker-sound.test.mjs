import assert from 'node:assert/strict';
import {createPokerSound,pokerActionCue} from '../games/poker/sound.mjs';

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
    createDynamicsCompressor:()=>Object.assign(node(),{threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()}),
    createStereoPanner:()=>Object.assign(node(),{pan:param()}),
    resume:async()=>{context.state='running';},suspend:async()=>{context.state='suspended';}};
  let created=0;const audio=createPokerSound({contextFactory:()=>{created++;return context;}});
  return {audio,context,sources,nodes,created:()=>created};
}

const f=fixture();
assert.equal(await f.audio.play('deal'),false);assert.equal(f.created(),0,'no audio context or autoplay on page load');
assert.equal(await f.audio.unlock(),true);
for(const cue of ['deal','card','select','discard','reveal','check','fold','call','raise','allin','turn','timer','win','end']){
  const before=f.sources.length;assert.equal(await f.audio.play(cue),true,cue);
  const added=f.sources.slice(before);assert.ok(added.length>0,cue+' produces sound');assert.ok(added.every(s=>s.at>=f.context.currentTime));
  added.forEach(s=>s.onended());assert.ok(added.every(s=>s.disconnected),'finished audio nodes disconnect');
}
await f.audio.play('card',{pan:1});assert.ok(f.nodes.filter(n=>n.pan).every(n=>Math.abs(n.pan.value)<=.65),'stereo never loses a seat at an extreme');
for(let i=0;i<8;i++)await f.audio.play('allin');
assert.ok(f.sources.filter(s=>!s.disconnected).length<=64,'bursts keep a bounded number of sound voices');
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

const spoken=[],korean={lang:'ko-KR',localService:true},english={lang:'en-US',default:true};
let available=[english,korean],cancels=0;
const speech={getVoices:()=>available,speak:u=>spoken.push(u),cancel:()=>{cancels++;}};
const voice=createPokerSound({contextFactory:()=>f.context,speech,utteranceFactory:text=>({text})});
assert.equal(await voice.play('half'),false,'no speech before a user gesture');
await voice.unlock();
for(const [cue,word] of Object.entries({minimum:'삥',quarter:'쿼터',half:'하프',check:'체크',call:'콜',fold:'다이',allin:'올인',raise:'베팅'})){
  assert.equal(await voice.play(cue),true);assert.equal(spoken.at(-1).text,word);assert.equal(spoken.at(-1).voice,korean);
  assert.equal(spoken.at(-1).lang,'ko-KR');assert.equal(spoken.at(-1).volume,.45);
}
assert.equal(cancels,7,'new calls replace unfinished speech instead of growing a delayed queue');
voice.configure({enabled:false});assert.equal(cancels,8,'mute cancels voice immediately');
assert.equal(await voice.play('half'),false);
voice.configure({enabled:true,volume:.2});await voice.play('call');assert.equal(spoken.at(-1).volume,.2);
voice.pause();assert.equal(await voice.play('check'),false,'hidden tab cannot speak');
await voice.unlock();available=[];await voice.play('half');assert.equal(spoken.at(-1).lang,'ko-KR','voices may load asynchronously');
available=[english,korean];await voice.play('check');assert.equal(spoken.at(-1).voice,korean,'later Korean voice is used');
const sourceCount=f.sources.length;spoken.at(-1).onerror();await Promise.resolve();assert.ok(f.sources.length>sourceCount,'speech errors fall back to the matching table cue');
voice.configure({volume:0});assert.equal(await voice.play('allin'),false);
const log=['4구 · 나부터','나 · 삥 100','하프좋아 · 체크'];
assert.equal(pokerActionCue(log,log),null,'unchanged polls never repeat speech');
assert.equal(pokerActionCue(log,log.concat('올인왕 · 다이')),'fold','nickname text does not override the actual action');
assert.equal(pokerActionCue(log,log.concat('나 · 하프 500','정산 완료')),'half','settlement cannot hide the final call');
assert.equal(pokerActionCue(log,log.slice(1).concat('나 · 쿼터 250')),'quarter','capped logs retain overlap');
assert.equal(pokerActionCue(log,log.concat('6구 · 삥부터')),null,'street announcements are not action calls');
console.log('PASS: all poker cues, gesture unlock, mute/volume, cleanup, hidden tab and blocked audio');
