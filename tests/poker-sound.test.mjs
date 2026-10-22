import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPokerSound,pokerActionCue,pokerVoiceStyles} from '../games/poker/sound.mjs';

function fixture(initial='running'){
  const nodes=[],sources=[];
  const param=()=>({value:0,setValueAtTime(value){this.value=value;},exponentialRampToValueAtTime(){}});
  const node=()=>{const n={connect(){},disconnect(){this.disconnected=true;}};nodes.push(n);return n;};
  const source=()=>{const n=Object.assign(node(),{start(at,offset,duration){Object.assign(this,{at,offset,duration});},stop(at){this.stopped=at===undefined;},frequency:param()});sources.push(n);return n;};
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

const actions=['minimum','quarter','half','check','call','fold','allin','raise'];
assert.equal(Object.keys(pokerVoiceStyles).length,3);
assert.deepEqual(Object.values(pokerVoiceStyles).map(v=>v.gender).sort(),['female','male','male']);
assert.equal(new Set(Object.values(pokerVoiceStyles).map(v=>v.speaker)).size,3);
for(const profile of Object.values(pokerVoiceStyles)){
  assert.deepEqual(Object.keys(profile.cues),actions);
  const file=new URL('../games/poker/'+profile.file,import.meta.url);
  assert.ok(fs.statSync(file).size>1000,'recorded speaker asset is present');
  let end=0;
  for(const [start,duration] of Object.values(profile.cues)){
    assert.ok(Number.isFinite(start)&&start>=end&&duration>.1&&duration<2,'eight nonoverlapping short calls');
    end=start+duration;
  }
}
function voiceFixture(fetcher){
  const f=fixture(),requests=[];
  f.context.decodeAudioData=async bytes=>({duration:20,identity:bytes});
  const audio=createPokerSound({contextFactory:()=>f.context,fetchAudio:async url=>{
    requests.push(String(url));return fetcher?fetcher(url):{ok:true,arrayBuffer:async()=>String(url)};
  }});
  return {...f,audio,requests};
}
const v=voiceFixture();
assert.equal(await v.audio.play('half'),false);assert.equal(v.requests.length,0,'no download or speech before a user gesture');
await v.audio.unlock();
for(const kind of actions){
  const previous=v.sources.at(-1);assert.equal(await v.audio.play(kind),true);
  const source=v.sources.at(-1),cue=pokerVoiceStyles.classic.cues[kind];
  assert.deepEqual([source.offset,source.duration],cue,'only the requested word is played');
  if(previous)assert.ok(previous.stopped&&previous.disconnected,'new calls stop the previous speaker');
}
assert.equal(v.requests.length,1,'all action words share one cached audio download');
const speakerFiles=[];
for(const style of ['classic','calm','bright']){
  v.audio.configure({voiceStyle:style});await v.audio.play('half',{preview:true});
  speakerFiles.push(v.sources.at(-1).buffer.identity);
  assert.equal(v.audio.settings().voiceStyle,style);
}
assert.equal(new Set(speakerFiles).size,3,'three distinct recordings, independent of installed device voices');
assert.equal(v.requests.length,3);
const saved=JSON.parse(JSON.stringify(v.audio.settings()));
v.audio.configure({voiceStyle:'calm'});v.audio.configure(saved);assert.equal(v.audio.settings().voiceStyle,'bright');
for(const invalid of ['unknown','constructor','__proto__',null,42])v.audio.configure({voiceStyle:invalid});
assert.equal(v.audio.settings().voiceStyle,'bright','invalid saved styles cannot select an asset');
await v.audio.play('call');let current=v.sources.at(-1);
v.audio.configure({enabled:false});assert.ok(current.stopped&&current.disconnected);
assert.equal(await v.audio.play('half'),false);
v.audio.configure({enabled:true,volume:0});assert.equal(await v.audio.play('allin'),false);
v.audio.configure({volume:.2});await v.audio.play('call');
assert.equal(v.nodes.find(n=>n.gain).gain.value,.2,'recorded voices use the same volume control');
v.audio.pause();assert.equal(await v.audio.play('check'),false,'background tabs cannot speak');
await v.audio.unlock();await v.audio.play('half');assert.equal(v.requests.length,3,'reopening the audio context retains cached voices');
current=v.sources.at(-1);current.onended();assert.ok(current.disconnected);

let release;
const loading=voiceFixture(()=>new Promise(resolve=>{release=()=>resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});}));
await loading.audio.unlock();const oldCall=loading.audio.play('half'),newCall=loading.audio.play('check');
release();assert.equal(await oldCall,false);assert.equal(await newCall,true);
assert.equal(loading.sources.length,1,'slow downloads never queue old actions');
assert.equal(loading.sources[0].offset,pokerVoiceStyles.classic.cues.check[0]);

let decode;
const cancelled=voiceFixture();cancelled.context.decodeAudioData=()=>new Promise(resolve=>{decode=resolve;});
await cancelled.audio.unlock();const pendingCall=cancelled.audio.play('call',{preview:true});
for(let i=0;i<10&&!decode;i++)await Promise.resolve();
assert.ok(decode);cancelled.audio.pause();decode({duration:20});
assert.equal(await pendingCall,false);assert.equal(cancelled.sources.length,0,'leaving during decoding cannot trigger delayed speech');

const oldDownloads=[];
const switched=voiceFixture(url=>new Promise(resolve=>oldDownloads.push({url:String(url),resolve})));
await switched.audio.unlock();const stale=switched.audio.play('call');
switched.audio.configure({voiceStyle:'bright'});const latest=switched.audio.play('half',{preview:true});
oldDownloads[1].resolve({ok:true,arrayBuffer:async()=>oldDownloads[1].url});assert.equal(await latest,true);
oldDownloads[0].resolve({ok:true,arrayBuffer:async()=>oldDownloads[0].url});assert.equal(await stale,false);
assert.equal(switched.sources.length,1);assert.ok(switched.sources[0].buffer.identity.includes('ainsley'));

const broken=voiceFixture(async()=>{throw Error('offline');});
await broken.audio.unlock();assert.equal(await broken.audio.play('half'),true,'failed recordings fall back to table foley');
assert.ok(broken.sources.length>0);await broken.audio.play('call');assert.equal(broken.requests.length,1,'offline requests have a retry cooldown');
const log=['4구 · 나부터','나 · 삥 100','하프좋아 · 체크'];
assert.equal(pokerActionCue(log,log),null,'unchanged polls never repeat speech');
assert.equal(pokerActionCue(log,log.concat('올인왕 · 다이')),'fold','nickname text does not override the actual action');
assert.equal(pokerActionCue(log,log.concat('나 · 하프 500','정산 완료')),'half','settlement cannot hide the final call');
assert.equal(pokerActionCue(log,log.slice(1).concat('나 · 쿼터 250')),'quarter','capped logs retain overlap');
assert.equal(pokerActionCue(log,log.concat('6구 · 삥부터')),null,'street announcements are not action calls');
console.log('PASS: three recorded male/female voices, action segments, cached downloads, cancellation, mute/volume, saved preferences and foley fallback');
