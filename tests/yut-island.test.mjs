import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,roll,move,moves,position,FINISH,lastThrowSeed} from '../games/yut/rules.mjs';
import {ANIMALS,animalFor} from '../games/yut/zodiac.mjs';

const faces=n=>Array.from({length:4},(_,i)=>+(i<n&&n<5));
function setup(at,steps){const g=newGame();g.pawns[0][0]=at;return roll(g,faces(steps));}
test('a pair may start with any zodiac animal and the settled throw reproduces after the turn',()=>{
  assert.equal(new Set(ANIMALS).size,12);
  for(let offset=0;offset<12;offset++){
    const game=newGame(4,offset);
    const roster=game.pawns.flatMap((team,t)=>team.map((_,i)=>animalFor(t,i,game.zodiacOffset)));
    assert.equal(roster[0],offset);assert.equal(new Set(roster).size,8);
    assert.ok(roster.every(n=>Number.isInteger(n)&&n>=0&&n<12));
  }
  assert.equal(animalFor(0,0,undefined),animalFor(0,0,newGame().zodiacOffset));
  let game=newGame();assert.equal(lastThrowSeed(game),null);
  for(const steps of [1,4,2,2]){
    const thrown=roll(game,faces(steps)),seed=lastThrowSeed(thrown);
    game=move(thrown,moves(thrown)[0].index);
    assert.equal(lastThrowSeed(JSON.parse(JSON.stringify(game))),seed);
  }
});
test('four sticks give five outcomes and invalid or repeated actions cannot advance the turn',()=>{
  for(let n=1;n<=5;n++){
    const s=roll(newGame(),faces(n));assert.equal(s.steps,n);assert.equal(roll(s,faces(1)),s);
    assert.equal(move(s,1,true),s);
    const next=move(s,0);assert.equal(next.team,n>=4?0:1);
  }
});
test('an event applies once and retreats along the actual trail',()=>{
  assert.equal(position(move(setup([1,2],1),0).pawns[0][0]),2);
  assert.equal(position(move(setup([1,2,3,4,5,6,7],1),0).pawns[0][0]),6);
  assert.equal(position(move(setup([1,2,3,4,5],1),0).pawns[0][0]),8);
});
test('either waiting pawn may start, while touching a stack still moves both together',()=>{
  const turn=roll(newGame(),faces(1));
  assert.deepEqual(moves(turn).map(m=>m.index),[0,1]);
  assert.deepEqual(move(turn,1).pawns[0],[[],[1]]);
  const stack=setup([1,2,3,4],1);stack.pawns[0][1]=[1,2,3,4];
  assert.deepEqual(moves(stack).map(m=>m.index),[0]);
  assert.deepEqual(move(stack,0).pawns[0],[[1,2,3,4,5],[1,2,3,4,5]]);
});
test('shortcuts remember entry at the center, and a stop there offers the finish route',()=>{
  const corner=setup([5],3);assert.deepEqual(moves(corner).filter(x=>x.index===0).map(x=>x.to),[8,22]);
  assert.equal(position(move(corner,0,true).pawns[0][0]),22);
  assert.equal(position(move(setup([5,20,21],2),0).pawns[0][0]),23);
  assert.equal(position(move(setup([10,25,26],2),0).pawns[0][0]),27);
  assert.equal(position(move(setup([5,20,21,22],1),0,true).pawns[0][0]),27);
});
test('friendly stack moves together, captures a full stack, and both pieces can finish at once',()=>{
  const s=setup([5,20],1);s.pawns[0][1]=[5,20,21];
  let t=move(s,0);assert.deepEqual(t.pawns[0][0],t.pawns[0][1]);
  t.team=0;t.pawns[1]=[[10,25,26,22],[10,25,26,22]];
  t=move(roll(t,faces(1)),0);assert.equal(t.team,0);assert.deepEqual(t.pawns[1],[[],[]]);
  t=move(roll(t,faces(4)),0,true);assert.equal(t.phase,'won');assert.equal(t.winner,0);
  assert.equal(position(t.pawns[0][0]),FINISH);
});
test('every 2–4 team game reaches a winner within bounded play',()=>{
  let v=12345;const rnd=()=>((v=(Math.imul(1664525,v)+1013904223)>>>0)/2**32);
  for(const n of [2,3,4])for(let run=0;run<50;run++){
    let g=newGame(n),count=0;
    while(g.phase!=='won'&&count++<3000){
      g=roll(g,Array.from({length:4},()=>+(rnd()<.5)));const options=moves(g);
      assert.ok(options.length);const m=options[Math.floor(rnd()*options.length)];g=move(g,m.index,m.shortcut);
      for(const team of g.pawns)for(const p of team)for(const node of p)assert.ok(node>=0&&node<=29);
    }
    assert.equal(g.phase,'won');
  }
});

import {openRoom} from '../games/yut/room.mjs';
test('invitees occupy up to four distinct seats; only the active seat can advance the game',async()=>{
  const bus=new Set(), store=new Map(), clients=[];
  const tempStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
  const previous=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  Object.defineProperty(globalThis,'sessionStorage',{value:tempStorage,configurable:true});
  const mock=()=>({
    channel(topic){const ch={topic,on(_type,_opts,cb){ch.cb=cb;return ch;},
      subscribe(cb){bus.add(ch);queueMicrotask(()=>cb('SUBSCRIBED'));},
      async send({payload}){for(const other of bus)if(other!==ch&&other.topic===topic)queueMicrotask(()=>other.cb({payload:structuredClone(payload)}));return 'ok';}};
      return ch;},async removeChannel(ch){bus.delete(ch);}
  });
  const until=async check=>{for(let i=0;i<150;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('network update timeout');};
  try{
    const host=await openRoom(null,()=>{},mock);clients.push(host);
    for(let i=1;i<=4;i++){store.clear();clients.push(await openRoom(host.view().host,()=>{},mock));if(i<4)await until(()=>clients[i].view().seat===i);}
    await until(()=>clients[4].view().status.includes('찼'));
    host.start(8);await until(()=>clients[3].view().game?.revision===0);
    assert.equal(clients[3].view().game.zodiacOffset,8);
    clients[2].action({type:'roll'});await new Promise(r=>setTimeout(r,20));assert.equal(host.view().game.revision,0);
    host.action({type:'roll'});await until(()=>clients[1].view().game?.phase==='move');
    const opt=moves(host.view().game)[0];host.action({type:'move',...opt});
    await until(()=>clients[2].view().game?.revision===2);
    assert.deepEqual(clients[2].view().game,host.view().game);
  }finally{await Promise.all(clients.map(c=>c.close()));if(previous)Object.defineProperty(globalThis,'sessionStorage',previous);else delete globalThis.sessionStorage;}
});
