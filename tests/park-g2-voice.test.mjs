import test from 'node:test';
import assert from 'node:assert/strict';
import {createG2Voice,readVoiceReply} from '../note/glasses-voice.mjs';
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

test('reads back the question on the G2 before the answer, retaining it after success or failure',async()=>{
  let release;
  const handler=makeHandler({openaiKey:'fixture',rpc:async()=>'ok',send:async url=>{
    if(url.endsWith('transcriptions')) return Response.json({text:answer.question});
    return new Promise(resolve=>{release=resolve;});
  }});
  const voice=device(async(payload,token,signal,onQuestion)=>{
    const res=await handler(new Request('https://example.test/voice',{method:'POST',signal,
      headers:{accept:'application/x-ndjson','x-park-device':token},body:JSON.stringify(payload)}));
    return readVoiceReply(res,onQuestion);
  });
  voice.setToken('b'.repeat(64));
  for(const fail of [false,true]){
    await voice.start();assert.equal(voice.question,'');voice.audio(pcm);
    const complete=voice.finish();
    await tick();
    assert.equal(voice.phase,'sending');assert.equal(voice.question,answer.question);
    assert.match(voice.screen().replaceAll('\n',''),/내 질문 · 무슨 색이야\?/);
    release(fail?new Response(null,{status:500}):Response.json({choices:[{message:{content:answer.answer}}]}));
    await complete;
    assert.equal(voice.phase,fail?'error':'answer');assert.equal(voice.question,answer.question);
    assert.equal(voice.dismiss(),true);assert.equal(voice.screen(),'');
  }
});

test('paginates a long question and answer in full and ignores events after closing',async()=>{
  let submitted,finish;
  const long={question:'오늘의 산책길은 어때요? '.repeat(7).trim(),answer:'산책을 즐겨 보세요. '.repeat(6).trim()};
  const voice=device((_payload,_token,_signal,onQuestion)=>{
    submitted=onQuestion;return new Promise(resolve=>{finish=resolve;});
  });
  voice.setToken('paired');await voice.start();voice.audio(pcm);const wait=voice.finish();
  submitted(long.question);finish(long);await wait;
  let joined='';
  const total=Number(voice.screen().match(/^1\/(\d+)/)[1]);
  for(let page=0;page<total;page++){joined+=voice.screen().split('\n').slice(1).join('');voice.scroll(1);}
  assert.equal(joined,'내 질문 · '+long.question+'GPT · '+long.answer);
  voice.reset();submitted('지난 질문');assert.equal(voice.question,'');
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
