const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../shared/games/chacha-rush-portal.js'),'utf8')
  .replace('export function installChachaRushPortal','function installChachaRushPortal');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((done,no)=>{resolve=done;reject=no;});return {promise,resolve,reject};};

function fixture(t,{blockedStorage=false}={}){
  const dom=new JSDOM('<body><button id="entry">차차 러시</button></body>',{url:'https://ojjuda.kr/world.html',runScripts:'outside-only'});
  const w=dom.window,calls=[],saved=[],responses=[];
  let owner='member-a',now=1000,submit=async()=>({ok:true}),frame,nonce,origin;
  w.Date.now=()=>now;
  if(blockedStorage)for(const method of ['getItem','setItem','removeItem'])w.Storage.prototype[method]=()=>{throw Error('storage blocked');};
  w.eval(source+'\nwindow.installChachaRushPortal=installChachaRushPortal;');
  const api=w.installChachaRushPortal({currentOwner:()=>owner,
    submitScore:score=>{calls.push({owner,score});return submit(score);},onSaved:value=>saved.push(value)});
  const open=()=>{
    api.open();frame=w.document.querySelector('iframe');
    const url=new URL(frame.src);origin=url.origin;nonce=new URLSearchParams(url.hash.slice(1)).get('ojjuda_run');
    frame.contentWindow.postMessage=(data,targetOrigin)=>responses.push({data,targetOrigin});
  };
  const send=data=>w.dispatchEvent(new w.MessageEvent('message',{origin,source:frame.contentWindow,data:{channel:'ojjuda:chacha-rush',nonce,...data}}));
  const close=()=>w.document.querySelector('[aria-label="차차 러시 닫기"]')?.click();
  t.after(()=>{close();w.close();});
  open();
  return {w,calls,saved,responses,send,open,close,
    start:round=>{now+=1000;send({action:'start',round});},
    finish:(round,score)=>{now+=1000;send({action:'finish',round,score});},
    advance:milliseconds=>{now+=milliseconds;},
    owner:value=>{owner=value;},submit:handler=>{submit=handler;}};
}

for(const blockedStorage of [false,true])test('Chacha sequential scores remain tied to their rounds'+(blockedStorage?' with storage blocked':''),async t=>{
  const f=fixture(t,{blockedStorage});
  f.send({action:'hello'});
  assert.equal(f.responses[0].data.signedIn,true);
  f.start(1);f.finish(1,137);await tick();
  f.finish(1,137);await tick();
  f.start(2);f.finish(2,250);await tick();
  assert.deepEqual(f.calls,[{owner:'member-a',score:137},{owner:'member-a',score:250}]);
  assert.deepEqual(f.responses.filter(r=>r.data.action==='result').map(r=>[r.data.round,r.data.ok]),[[1,true],[2,true]]);
  assert.deepEqual(f.saved,['member-a','member-a']);
});

for(const failure of ['rejected','exception'])test('Chacha reports '+failure+' saves without announcing a saved record',async t=>{
  const f=fixture(t);
  f.submit(async()=>{if(failure==='exception')throw Error('offline');return {ok:false,reason:'too_fast'};});
  f.start(1);f.finish(1,137);await tick();
  assert.equal(f.responses.at(-1).data.round,1);
  assert.equal(f.responses.at(-1).data.ok,false);
  assert.match(f.responses.at(-1).data.message,failure==='exception'?/연결 오류/:/잠깐 기다린/);
  assert.deepEqual(f.saved,[]);
  f.submit(async()=>({ok:true}));f.start(2);f.finish(2,150);await tick();
  assert.equal(f.responses.at(-1).data.round,2);assert.equal(f.responses.at(-1).data.ok,true);
  assert.deepEqual(f.saved,['member-a']);
});

for(const score of [10_000_183,1_999_999_999])test('Chacha submits a valid long-game score of '+score,async t=>{
  const f=fixture(t,{blockedStorage:true});
  f.start(1);f.advance(score===10_000_183?1_500_000:20_000_000);f.finish(1,score);await tick();
  assert.deepEqual(f.calls,[{owner:'member-a',score}]);
  assert.equal(f.responses.at(-1).data.ok,true);
  assert.deepEqual(f.saved,['member-a']);
});

test('Chacha keeps its integer boundary and elapsed-time checks',async t=>{
  const f=fixture(t);
  f.start(1);f.finish(1,10_000_183);await tick();
  assert.equal(f.responses.at(-1).data.ok,false,'an impossible one-second score still fails');
  f.start(2);f.advance(20_000_000);f.finish(2,2_000_000_000);await tick();
  assert.equal(f.responses.at(-1).data.ok,false,'a score above the database boundary still fails');
  assert.deepEqual(f.calls,[]);assert.deepEqual(f.saved,[]);
});

for(const outcome of ['success','rejected','exception'])test('Chacha ignores an earlier round’s late '+outcome+' after the next round starts',async t=>{
  const f=fixture(t),pending=deferred();f.submit(()=>pending.promise);
  f.start(1);f.finish(1,137);f.start(2);
  if(outcome==='exception')pending.reject(Error('offline'));
  else pending.resolve(outcome==='success'?{ok:true}:{ok:false,reason:'too_fast'});
  await tick();
  assert.equal(f.responses.filter(r=>r.data.action==='result').length,0,'a previous score cannot label the unfinished new round');
  assert.deepEqual(f.saved,[],'stale round responses do not dispatch a save notification');
  f.submit(async()=>({ok:true}));f.finish(2,250);await tick();
  assert.deepEqual(f.responses.map(r=>[r.data.round,r.data.ok]),[[2,true]]);
  assert.deepEqual(f.saved,['member-a']);
});

for(const change of ['close','account'])test('Chacha ignores a pending receipt after '+change,async t=>{
  const f=fixture(t),pending=deferred();f.submit(()=>pending.promise);
  f.start(1);f.finish(1,137);
  if(change==='close')f.close();else f.owner('member-b');
  pending.resolve({ok:true});await tick();
  assert.deepEqual(f.saved,[]);assert.equal(f.responses.length,0);
  f.submit(async()=>({ok:true}));f.open();f.start(1);f.finish(1,250);await tick();
  assert.equal(f.responses.at(-1).data.round,1);assert.equal(f.responses.at(-1).data.ok,true);
  assert.deepEqual(f.saved,[change==='account'?'member-b':'member-a']);
});

test('Chacha refuses to submit a round after its account changes',async t=>{
  const f=fixture(t);f.start(1);f.owner('member-b');f.finish(1,137);await tick();
  assert.deepEqual(f.calls,[]);assert.deepEqual(f.saved,[]);
  assert.equal(f.responses.at(-1).data.ok,false);assert.match(f.responses.at(-1).data.message,/로그인/);
});
