import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createYutLobby} from '../games/yut/lobby.mjs';
import {openRoom} from '../games/yut/room.mjs';
const {fixture}=createRequire(import.meta.url)('./yut-public-room-fixture.cjs');
const until=async(predicate,ms=2500)=>{
  const deadline=Date.now()+ms;
  while(Date.now()<deadline){if(predicate())return;await new Promise(r=>setTimeout(r,15));}
  assert.fail('room update timeout');
};

test('authenticated lobby joins the signed game, rejects outsiders, starts and releases seats',async t=>{
  const f=await fixture(),bus=new Set(),store=new Map(),lobbies=[],games=[];
  const previous=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)}});
  function transport(actor){return {
    auth:{getSession:async()=>({data:{session:{user:{id:actor,is_anonymous:false}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    rpc:async(name,params)=>{assert.equal(name,'yut_room_service');try{return{data:await f.call(actor,params.p_action,params.p_room,params.p_options)}}catch(error){return{error}}},
    channel(topic){const ch={topic,on(_type,_filter,callback){ch.callback=callback;return ch;},subscribe(callback){bus.add(ch);queueMicrotask(()=>callback('SUBSCRIBED'));return ch;},
      async send({payload}){for(const other of bus)if(other!==ch&&other.topic===topic)queueMicrotask(()=>other.callback({payload:structuredClone(payload)}));return'ok';}};return ch;},
    async removeChannel(ch){bus.delete(ch);}
  };}
  try{
    const [A,B,C]=f.users,hostClient=transport(A),guestClient=transport(B);
    const hostLobby=createYutLobby(hostClient),guestLobby=createYutLobby(guestClient);lobbies.push(hostLobby,guestLobby);
    assert.equal(await hostLobby.enter(),A);assert.equal((await hostLobby.list()).rooms.length,0);
    const seen=[],host=await hostLobby.create({title:'같이 윷놀이',capacity:3,request_id:crypto.randomUUID()},null,v=>seen.push(v));games.push(host);
    assert.equal(host.view().room_no,1001);assert.equal(host.view().directory,true);assert.equal(host.view().isHost,true);
    assert.equal(host.view().players[0].name,'하나 ❤️❤️');
    const guest=await guestLobby.join(1001,()=>{});games.push(guest);
    await until(()=>host.view().seats.length===2&&guest.view().seat===1);
    assert.equal(host.view().names[host.view().seats[1]],'회원 2');
    assert.equal((await guestLobby.list()).mine.room_no,1001);
    store.clear();
    const outsider=await openRoom(host.view().host,()=>{},()=>transport(C));games.push(outsider);
    await new Promise(r=>setTimeout(r,80));
    assert.equal(host.view().seats.length,2,'a valid signed legacy hi cannot claim a server-unregistered public seat');
    await assert.rejects(()=>host.start(2,'island',4,false),error=>error.code==='need_players');
    assert.equal(host.view().game,null);
    await host.start(2,'island',4,true);
    await until(()=>guest.view().game?.phase==='opening');
    assert.deepEqual(host.view().game.computerTeams,[2]);assert.deepEqual(guest.view().game,host.view().game);
    assert.equal((await f.call(A,'heartbeat',1001)).room.status,'playing');
    const created=host.view().game;
    guest.opening({type:'draw-first-seat'});outsider.opening({type:'draw-first-seat'});
    assert.equal(host.view().game,created,'only the signed host controls the opening');
    await guest.close();
    await until(()=>host.view().game.computerTeams.includes(1));
    assert.equal(host.view().seats.length,2,'departed active seats keep their order');
    assert.deepEqual(host.view().game.computerTeams,[2,1]);
    await host.close();
    assert.equal((await f.call(C,'list')).rooms.length,0);
    assert.ok(seen.some(v=>v.players?.length===2));
  }finally{
    await Promise.allSettled(games.map(game=>game.close()));
    await Promise.allSettled(lobbies.map(lobby=>lobby.close()));
    if(previous)Object.defineProperty(globalThis,'sessionStorage',previous);else delete globalThis.sessionStorage;
    await f.close();
  }
});

test('session errors release creation lock and timed-out reads remain retryable',async()=>{
  let authFail=true,unresolved=true,calls=0;
  const client={
    auth:{getSession:async()=>{if(authFail)throw Error('session offline');return{data:{session:{user:{id:'test-user'}}}};}},
    rpc(){calls++;return unresolved?new Promise(()=>{}):Promise.resolve({data:{ok:true,rooms:[],mine:null}});}
  };
  const lobby=createYutLobby(client,{timeoutMs:25});
  await assert.rejects(()=>lobby.create({title:'test',capacity:2},null,()=>{}),/session offline/);
  authFail=false;
  await assert.rejects(()=>lobby.list(),error=>error.code==='unavailable');
  unresolved=false;assert.deepEqual(await lobby.list(),{ok:true,rooms:[],mine:null});
  assert.equal(calls,2);await lobby.close();
});

test('closing during a read prevents a late response from becoming usable',async()=>{
  let resolve;
  const client={auth:{getSession:async()=>({data:{session:{user:{id:'user'}}}})},rpc:()=>new Promise(r=>resolve=r)};
  const lobby=createYutLobby(client);await lobby.enter();const reading=lobby.list();await lobby.close();
  resolve({data:{ok:true,rooms:[{room_no:1001}],mine:null}});
  await assert.rejects(()=>reading,error=>error.code==='not_signed_in');
});

test('a late initial session cannot undo sign-out',async()=>{
  let resolve,authChanged;
  const client={auth:{
    getSession:()=>new Promise(r=>resolve=r),
    onAuthStateChange(callback){authChanged=callback;return{data:{subscription:{unsubscribe(){}}}};}
  }};
  const lobby=createYutLobby(client),entering=lobby.enter();
  authChanged('SIGNED_OUT',null);
  resolve({data:{session:{user:{id:'previous-user'}}}});
  assert.equal(await entering,null);assert.equal(lobby.userId,null);await lobby.close();
});
