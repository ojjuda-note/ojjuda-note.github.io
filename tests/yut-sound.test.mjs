import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createThrow} from '../games/yut/toss.mjs';
import {createTableSounds} from '../games/yut/sound.mjs';

test('recorded sounds follow each stick contact, pawn action and mute preference',async t=>{
  const starts=[],requests=[],prefs=new Map();
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  class AudioContext {
    currentTime=3;
    state='suspended';
    async resume(){this.state='running';}
    async decodeAudioData(bytes){
      const wav=Buffer.from(bytes),data=wav.indexOf('data');
      if(wav.toString('ascii',0,3)==='ID3'){
        assert.ok(wav.includes(Buffer.from('Info')));
        return {duration:1.48,cheering:true};
      }
      assert.equal(wav.toString('ascii',0,4),'RIFF');
      assert.equal(wav.toString('ascii',8,12),'WAVE');
      assert.ok(data>0);
      const duration=wav.readUInt32LE(data+4)/wav.readUInt32LE(28);
      return {duration};
    }
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}};}
    createBufferSource(){
      return {playbackRate:{},connect(){},disconnect(){},
        start(time,offset,duration){starts.push({time,offset,duration,source:this});},
        stop(){this.stopped=true;}};
    }
  }
  globalThis.document={hidden:false};
  globalThis.window={AudioContext,localStorage:{getItem:key=>prefs.get(key),setItem:(key,value)=>prefs.set(key,value)},
    async fetch(path){
      requests.push(path);
      const wav=readFileSync(new URL('..'+path,import.meta.url));
      return {ok:true,arrayBuffer:async()=>wav.buffer.slice(wav.byteOffset,wav.byteOffset+wav.byteLength)};
    }};
  t.mock.method(performance,'now',()=>1000);
  const sound=createTableSounds(),plan=createThrow([0,1,1,0],32);
  sound.unlock();sound.unlock();sound.throwSticks(plan);
  await flush();
  assert.equal(requests.length,4);
  assert.ok(requests.includes('/games/yut/audio/bonus-cheer.mp3'));
  assert.equal(starts.length,11);
  assert.ok(starts.every(cue=>cue.duration>0));
  for(const rod of plan.rods){
    for(const t of [rod.delay+rod.flight,rod.delay+rod.flight+rod.bounce]){
      assert.ok(starts.some(cue=>Math.abs(cue.time-3-t/1000)<.00001));
    }
  }
  for(const [kind,extra] of [[null,0],['capture',1],['carry',1],['home',1],['back',1],['finish',1]]){
    const n=starts.length;
    sound.land(kind,265);
    await flush();
    assert.equal(starts.length-n,1+extra);
    assert.equal(starts[n].time,3.265);
    assert.ok(starts.slice(n).every(cue=>cue.duration>0));
  }
  const beforeCheer=starts.length;sound.cheer();await flush();
  assert.deepEqual(starts.slice(beforeCheer).map(cue=>[cue.time,cue.offset,cue.source.buffer.cheering]),[[3,0,true]]);
  const n=starts.length;
  sound.quickThrow();sound.setEnabled(false);
  await flush();
  assert.equal(starts.length,n);
  assert.ok(starts.every(cue=>cue.source.stopped));
  assert.equal(createTableSounds().enabled,false);
  sound.setEnabled(true);document.hidden=true;sound.land('home');
  await flush();assert.equal(starts.length,n);
  document.hidden=false;sound.quickThrow();
  await flush();assert.equal(starts.length,n+3);
});
