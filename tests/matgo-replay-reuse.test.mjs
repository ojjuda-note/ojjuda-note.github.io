import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const source=process.env.MATGO_REPLAY_SOURCE
  ? pathToFileURL(resolve(process.env.MATGO_REPLAY_SOURCE)+'/')
  : new URL('../supabase/functions/matgo/',import.meta.url);
const {createHandler}=await import(new URL('handler.mjs',source));
const {replayOnline,advanceOnline,automaticOnline,onlineView}=await import(new URL('online.mjs',source));
const A='a0000000-0000-4000-8000-000000000001',B='a0000000-0000-4000-8000-000000000002';
const ROOM='b0000000-0000-4000-8000-000000000001';
const clone=value=>structuredClone(value);
const future=()=>new Date(Date.now()+600000).toISOString();
const baseRoom=()=>({id:ROOM,code:'AABBCCDD',status:'active',mode:'private',version:1,round_no:1,
  names:['합성 참가자 1','합성 참가자 2'],seed:'0123456789abcdef'.repeat(4),actions:[],
  start_gold:[5000,5000],gold:[5000,5000],first:0,carry:1,round_rate:100,
  deadline:future(),bots:[false,false],departed:[false,false],ready:[false,false],requests:[]});
const commandFor=({game,prompt:p})=>p.type==='choose'?{type:'choose',index:p.indices[0]}:
  p.type==='gukjin'?{type:'gukjin',choice:'yul'}:p.type==='gostop'?{type:'gostop',decision:'go'}:
  p.type==='chongtong'?{type:'chongtong',decision:'continue'}:{type:'play',card:game.hand[p.p][0]?.id??null};

async function longRoom(){
  let room=baseRoom(),selected;
  for(let i=0;i<100;i++){
    const replay=await replayOnline(room);
    if(!replay.prompt)break;
    const command=commandFor(replay),next=await advanceOnline(room,replay.prompt.p,command);
    if(next.result)break;
    selected={room:clone(room),seat:replay.prompt.p,command};
    room={...room,version:room.version+1,actions:next.actions};
  }
  assert.ok(selected?.room.actions.length>=15,'exercise a substantial recorded transcript');
  return selected;
}

function fixture(initial,{conflict=false,afterCommit}={}){
  let room=clone(initial);
  const calls={auth:0,read:0,commit:0},commits=[];
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
  const handler=createHandler({env:name=>({SUPABASE_URL:'https://fixture.invalid',
    SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service'})[name],
    fetchImpl:async(url,options)=>{
      if(url.endsWith('/auth/v1/user')){
        calls.auth++;const id=options.headers.authorization.slice('Bearer '.length);
        return [A,B].includes(id)?json({id,is_anonymous:false}):json({},401);
      }
      assert.ok(url.endsWith('/rest/v1/rpc/matgo_online_service'));
      const args=JSON.parse(options.body),seat=[A,B].indexOf(args.p_actor);
      assert.equal(args.p_room,room.id);assert.ok(seat>=0);
      if(args.p_action==='read')calls.read++;
      else if(args.p_action==='commit'){
        calls.commit++;commits.push(clone(args.p_next));
        if(conflict||args.p_expected!==room.version)return json({message:'state_conflict'},409);
        room={...room,actions:clone(args.p_next.actions),version:room.version+1,
          requests:[...room.requests,args.p_request],deadline:future(),
          status:args.p_next.result?'finished':'active',result:args.p_next.result};
        if(afterCommit)room=afterCommit(room);
      }else throw Error('unexpected RPC action');
      return json({room,seat});
    }});
  return {calls,commits,room:()=>clone(room),async call(actor,body){
    const response=await handler(new Request('https://fixture.invalid/functions/v1/matgo',{
      method:'POST',headers:{authorization:'Bearer '+actor,origin:'https://ojjuda.kr'},
      body:JSON.stringify(body)}));
    return {status:response.status,...await response.json()};
  }};
}

// Count the real deterministic replays at their AES-CTR operation, rather than
// stubbing the game engine or adding production-only instrumentation.
const cryptoDescriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto'),nativeCrypto=globalThis.crypto;
let replays=0;
const subtle=new Proxy(nativeCrypto.subtle,{get(target,key){
  if(key==='encrypt')return (...args)=>{if(args[0]?.name==='AES-CTR')replays++;return target.encrypt(...args);};
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
}});
Object.defineProperty(globalThis,'crypto',{configurable:true,value:new Proxy(nativeCrypto,{get(target,key){
  if(key==='subtle')return subtle;
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
}})});

try{
  const sample=await longRoom(),readBody={action:'online_read',room_id:ROOM};
  const moveBody={action:'online_move',room_id:ROOM,version:sample.room.version,
    request_id:crypto.randomUUID(),command:sample.command};
  const actor=[A,B][sample.seat];
  const read=fixture(sample.room);replays=0;
  const a=await read.call(A,readBody),b=await read.call(B,readBody);
  assert.equal(a.status,200);assert.equal(b.status,200);
  assert.equal(replays,2,'one replay per read; separate authenticated requests never share a cache');
  assert.deepEqual(read.calls,{auth:2,read:2,commit:0});
  for(const response of [a,b]){
    assert.equal('seed' in response.room,false);assert.equal('actions' in response.room,false);
    assert.equal('deck' in response.room.game,false);assert.equal('otherHand' in response.room.game,false);
    for(const event of response.room.events)if(event.type==='draw'&&event.p!==response.room.seat)assert.equal(event.card,undefined);
  }
  assert.notDeepEqual(a.room.game.hand,b.room.game.hand,'each seat receives only its own hand');

  const moved=fixture(sample.room);replays=0;
  const result=await moved.call(actor,moveBody);
  assert.equal(result.status,200,JSON.stringify(result));
  assert.equal(replays,2,'a move validates before and after exactly once');
  assert.deepEqual(moved.calls,{auth:1,read:1,commit:1},'Auth and CAS writes remain authoritative');
  const expected=JSON.parse(JSON.stringify(await onlineView(moved.room(),sample.seat)));
  delete expected.serverTime;const actual=clone(result.room);delete actual.serverTime;
  assert.deepEqual(actual,expected,'reused replay projects the same complete public response');
  replays=0;
  const retry=await moved.call(actor,moveBody);
  assert.equal(retry.status,200);assert.equal(retry.room.version,result.room.version);
  assert.equal(replays,1);assert.equal(moved.calls.commit,1,'idempotent retry cannot commit twice');

  const changed=fixture(sample.room,{afterCommit:r=>({...r,start_gold:[7000,8000]})});replays=0;
  const changedResult=await changed.call(actor,moveBody);
  assert.equal(changedResult.status,200);assert.equal(replays,3,'changed committed replay inputs invalidate the candidate');
  assert.deepEqual(changedResult.room.game.bank,[7000,8000]);
  const rejected=fixture(sample.room,{conflict:true});replays=0;
  assert.equal((await rejected.call(actor,moveBody)).error,'state_conflict');
  assert.equal(rejected.calls.commit,1);
  const wrongTurn=fixture(sample.room);
  assert.equal((await wrongTurn.call([A,B][1-sample.seat],moveBody)).error,'not_your_turn');
  assert.equal(wrongTurn.calls.commit,0);

  // AI selection consumes its Game's RNG. Its replay must stay fresh even when
  // the request already checked the same prompt while catching up the room.
  for(const reason of ['timeout','left']){
    const room=clone(sample.room),before=await replayOnline(room);
    if(reason==='timeout')room.deadline=new Date(Date.now()-1000).toISOString();
    else room.bots[before.prompt.p]=true;
    const expected=await automaticOnline(room),automatic=fixture(room);
    const result=await automatic.call(A,readBody);
    assert.equal(result.status,200,JSON.stringify(result));
    assert.deepEqual(automatic.commits[0],{...expected,auto:{p:before.prompt.p,reason}},'AI actions retain the original random stream');
    assert.ok(result.room.version>room.version);
  }
  console.log('PASS: request-local Matgo replay counts (read 1, move 2), long transcript, hidden hands, request isolation, authoritative snapshot invalidation, turn/CAS/idempotency and unchanged timeout/AI random streams');
}finally{
  if(cryptoDescriptor)Object.defineProperty(globalThis,'crypto',cryptoDescriptor);
  else delete globalThis.crypto;
}
