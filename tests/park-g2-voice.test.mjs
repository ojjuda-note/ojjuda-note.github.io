import test from 'node:test';
import assert from 'node:assert/strict';
import {createG2Voice} from '../note/glasses-voice.mjs';
import {makeHandler} from '../supabase/functions/park-g2-voice/handler.mjs';

const pcm = new Uint8Array(16000).fill(8);
const answer = {question:'무슨 색이야?',answer:'초록색이에요.'};
const tick = () => new Promise(r=>setImmediate(r));
function device(request, microphone=async()=>true) {
  return createG2Voice({microphone,request,changed(){},forgetToken(){}});
}
test('asks only on demand, remembers follow-ups, never sends silence or audio after release',async()=>{
  const calls=[], mic=[];
  const voice=device(async payload=>{calls.push(payload);return answer;},async on=>{mic.push(on);return true;});
  await voice.start(); assert.equal(voice.phase,'pair');assert.deepEqual(mic,[]);
  voice.setToken('paired');
  await voice.start();voice.audio(pcm);await voice.finish();voice.audio(pcm);
  assert.match(voice.screen(),/초록/);assert.deepEqual(mic,[true,false]);
  await voice.start();voice.audio(pcm);await voice.finish();
  assert.deepEqual(calls[1].history,[answer]);
  await voice.start();voice.audio(new Uint8Array(16000));await voice.finish();
  assert.equal(voice.phase,'error');assert.equal(calls.length,2);
  voice.reset();
});
test('a quick release closes even if the microphone opens late; hiding while waiting drops the answer',async()=>{
  let open, respond;
  const sequence=[];
  const voice=device(()=>new Promise(r=>{respond=r;}),on=>{
    sequence.push(on);return on ? new Promise(r=>{open=r;}) : Promise.resolve(true);
  });
  voice.setToken('paired');const start=voice.start();await tick();
  await voice.finish();open(true);await start;await tick();assert.deepEqual(sequence,[true,false]);
  const again=voice.start();await tick();open(true);await again;
  voice.audio(pcm);const wait=voice.finish();voice.reset();respond(answer);await wait;
  assert.equal(voice.message,'');assert.equal(voice.phase,'idle');
});
test('served endpoint authenticates the device, transcribes valid WAV, returns text, respects quota',async()=>{
  const token='f'.repeat(64), spoken=[],requests=[];
  let allowance='ok';
  const handler=makeHandler({openaiKey:'fixture',rpc:async(name,args)=>{
    if(name==='park_g2_voice_redeem') return token;
    assert.equal(args.p_token,token);return allowance;},send:async(url,options)=>{
    requests.push(url);
    if(url.endsWith('/transcriptions')) {
      const bytes=new Uint8Array(await options.body.get('file').arrayBuffer());
      assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'RIFF');
      assert.equal(new DataView(bytes.buffer).getUint32(24,true),16000);assert.deepEqual(bytes.slice(44),pcm);
      return Response.json({text:answer.question});
    }
    const input=JSON.parse(options.body);spoken.push(input.messages);
    assert.equal(input.store,false);assert.equal(input.messages.at(-1).content,answer.question);
    return Response.json({choices:[{message:{content:answer.answer}}]});
  }});
  const call=(body,key)=>handler(new Request('https://example.test/voice',{method:'POST',
    headers:key?{'x-park-device':key}:{},body:JSON.stringify(body)}));
  assert.equal((await call({})).status,401);
  assert.equal((await (await call({action:'pair',code:'ABCDEF123456'})).json()).token,token);
  assert.equal((await call({pcm:'a'},token)).status,400);
  const payload={pcm:Buffer.from(pcm).toString('base64'),history:[answer]};
  assert.deepEqual(await (await call(payload,token)).json(),answer);
  assert.equal(spoken[0].length,4);
  allowance='limit';assert.equal((await call(payload,token)).status,429);
  assert.equal(requests.length,2);
});
