import test from 'node:test';
import assert from 'node:assert/strict';
import {createG2Voice,readVoiceReply} from '../note/glasses-voice.mjs';
import {openLiveTurn} from '../note/glasses-live.mjs';
import {liveRelay,upsampleG2} from '../supabase/functions/park-g2-voice/live.mjs';
import {makeHandler} from '../supabase/functions/park-g2-voice/handler.mjs';

const pcm = new Uint8Array(16000).fill(8);
const answer = {question:'무슨 색이야?',answer:'초록색이에요.'};
const tick = () => new Promise(r=>setImmediate(r));
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

test('decodes Korean split across network chunks and falls back to an ordinary response',async()=>{
  const bytes=new TextEncoder().encode(JSON.stringify({question:answer.question})+'\n'+JSON.stringify({answer:answer.answer})+'\n');
  const stream=new ReadableStream({start(controller){
    for(const byte of bytes) controller.enqueue(new Uint8Array([byte]));controller.close();
  }});
  const seen=[];
  assert.deepEqual(await readVoiceReply(new Response(stream,{headers:{'content-type':'application/x-ndjson'}}),q=>seen.push(q)),answer);
  assert.deepEqual(seen,[answer.question]);assert.deepEqual(await readVoiceReply(Response.json(answer)),answer);
});

test('hands free: a short pause keeps listening, silence sends once and a new turn clears the draft',async()=>{
  let stream,closed=0,commits=0,frames=0;const mic=[];
  const voice=createG2Voice({microphone:async on=>{mic.push(on);return true;},changed(){},forgetToken(){},
    openTurn:options=>{stream=options;return{audio(){frames++;},finish(){commits++;},close(){closed++;}};}});
  await voice.start();assert.equal(voice.phase,'pair');assert.equal(mic.length,0);
  voice.setToken('paired');await voice.start();
  const frame=new Uint8Array(3200).fill(8), silence=new Uint8Array(3200);
  voice.audio(frame);stream.onText('내가 말하는');assert.equal(voice.phase,'listening');
  const long='가나다라마바사'.repeat(15)+'끝';
  stream.onText(long);assert.ok(voice.screen().endsWith('끝'));assert.equal(voice.question,long);
  for(let i=0;i<14;i++)voice.audio(silence);
  assert.equal(commits,0);voice.audio(frame);
  for(let i=0;i<18;i++)voice.audio(silence);
  assert.equal(commits,1);assert.equal(voice.phase,'sending');voice.finish();assert.equal(commits,1);
  stream.onFinal(answer.question);stream.onAnswer(answer);await tick();assert.deepEqual(mic,[true,false]);
  assert.equal(voice.phase,'answer');assert.ok(frames>=34);assert.equal(closed,1);
  await voice.start();assert.equal(voice.question,'');voice.audio(frame);assert.deepEqual(stream.history,[answer]);
  voice.reset();stream.onText('늦은 자막');assert.equal(voice.question,'');await tick();
  assert.deepEqual(mic,[true,false,true,false]);
});

test('cancels while microphone is opening and does not open a paid session for silence',async()=>{
  let opened;const operations=[];
  const voice=createG2Voice({openTurn:()=>assert.fail('silent stream'),changed(){},forgetToken(){},
    microphone:on=>{operations.push(on);return on?new Promise(r=>{opened=r;}):Promise.resolve(true);}});
  voice.setToken('paired');const start=voice.start();await tick();voice.reset();opened(true);await start;await tick();
  assert.deepEqual(operations,[true,false]);assert.equal(voice.phase,'idle');
  const again=voice.start();await tick();opened(true);await again;
  voice.audio(new Uint8Array(32000));voice.finish();assert.equal(voice.phase,'error');voice.reset();
});

test('relay and phone exchange live audio, deltas before commit, final text and just one answer',async()=>{
  let web,server,up,claim=0;const outbound=[],caption=[],final=[],answers=[];
  class Socket {
    constructor(){
      web=this;this.bufferedAmount=0;
      server={readyState:1,send:message=>this.onmessage({data:message}),close(){}};
      liveRelay({client:server,claim:async()=>{claim++;return 'ok';},connect:()=>up={bufferedAmount:0,close(){},send:s=>outbound.push(JSON.parse(s))},
        answer:async(q,h)=>{assert.equal(q,answer.question);assert.deepEqual(h,[]);return answer.answer;}});
    }
    send(raw){server.onmessage({data:typeof raw==='string'?raw:raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)});}
    close(){}
  }
  const link=openLiveTurn({url:'wss://example.test',token:'a'.repeat(64),history:[],Socket,
    onText:t=>caption.push(t),onFinal:t=>final.push(t),onAnswer:r=>answers.push(r),onError:assert.fail});
  link.audio(pcm);web.onopen();await tick();assert.equal(claim,1);
  up.onopen();assert.equal(outbound[0].session.audio.input.format.rate,24000);
  up.onmessage({data:JSON.stringify({type:'session.updated'})});
  assert.equal(outbound[1].type,'input_audio_buffer.append');
  up.onmessage({data:JSON.stringify({type:'conversation.item.input_audio_transcription.delta',delta:'무슨 색'})});
  await new Promise(r=>setTimeout(r,125));assert.deepEqual(caption,['무슨 색']);assert.equal(final.length,0);
  link.finish();link.finish();assert.equal(outbound.filter(x=>x.type==='input_audio_buffer.commit').length,1);
  up.onmessage({data:JSON.stringify({type:'conversation.item.input_audio_transcription.completed',transcript:answer.question})});
  await tick();assert.deepEqual(final,[answer.question]);assert.deepEqual(answers,[answer]);
  const whole=Buffer.from(upsampleG2()(pcm),'base64'),resample=upsampleG2();
  const split=Buffer.concat([pcm.slice(0,2002),pcm.slice(2002)].map(p=>Buffer.from(resample(p),'base64')));
  assert.deepEqual(whole,split);assert.ok(Math.abs(whole.length-pcm.length*1.5)<=2);
});
