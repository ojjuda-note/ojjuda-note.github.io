import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {createG2Link} from '../note/glasses-link.mjs';
import {makeHandler} from '../supabase/functions/park-g2-voice/handler.mjs';

test('phone approval survives reopening and only the challenge appears in navigation',async()=>{
  let saved='',token='',approved=false,calls=0,clock=Date.now();
  const options={now:()=>clock,cryptoApi:webcrypto,load:async()=>saved,save:async v=>{saved=v;return true;},
    accept:async value=>{token=value;},change(){},complete:async()=>{calls++;return approved;}};
  let app=createG2Link(options);
  await app.prepare();
  const {proof,until}=JSON.parse(saved);
  const hash=createHash('sha256').update('park-g2-link-v1:'+until+':'+proof).digest('hex');
  assert.equal(app.href,'https://ojjuda.kr/park/g2-connect.html#'+hash+'.'+until);
  assert.ok(!app.href.includes(proof));
  await app.check();assert.equal(calls,0);
  assert.equal(app.opened(),true);
  await app.check();assert.equal(token,'');
  app=createG2Link(options);await app.prepare();
  assert.ok(app.href.includes(hash));
  approved=true;await app.check(true);
  assert.equal(token,proof);assert.equal(saved,'');
  await app.prepare();clock+=601000;
  assert.equal(app.opened(),false);assert.equal(app.href,'');
  await app.prepare();assert.notEqual(JSON.parse(saved).proof,proof);
});

test('pair completion validates the proof and never invokes a model or sends credentials in its reply',async()=>{
  const proof='a'.repeat(64);const until=1795682400;
  const handler=makeHandler({rpc:async(name,args)=>{
    assert.equal(name,'park_g2_voice_complete');assert.deepEqual(args,{p_proof:proof,p_until:until});return true;
  },send:()=>assert.fail()});
  const invoke=(p,t)=>handler(new Request('https://example.test/',{method:'POST',headers:{'x-park-device':p},
    body:JSON.stringify({action:'complete-link',until:t})}));
  assert.equal((await invoke('',until)).status,400);
  assert.equal((await invoke(proof,'bad')).status,400);
  assert.deepEqual(await (await invoke(proof,until)).json(),{linked:true});
});
