import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,roll,move,moves,position,FINISH,lastThrowSeed,computerAction} from '../games/yut/rules.mjs';
import {ANIMALS,animalFor} from '../games/yut/zodiac.mjs';

const ordinary=(...args)=>({...newGame(...args),eventTiles:{}});
const faces=n=>Array.from({length:4},(_,i)=>+(i<n&&n<5));
function setup(at,steps){const g=ordinary(2,2,'island',2);g.pawns[0][0]=at;return roll(g,faces(steps));}
test('new games give every team four pieces and enable island obstacles by default',()=>{
  for(const count of [2,3,4]){
    const game=newGame(count);
    assert.equal(game.mode,'island');
    assert.deepEqual(game.pawns.map(team=>team.length),Array(count).fill(4));
    game.pawns[0][0]=[1,2];
    assert.equal(position(move(roll(game,faces(1)),0).pawns[0][0]),2);
  }
});
test('easy games land on the rolled square while older snapshots keep their island effects',()=>{
  for(const [tile,end] of [[3,2],[16,15],[8,6],[13,11],[6,8],[18,0]]){
    const trail=Array.from({length:tile-1},(_,i)=>i+1);
    const easy=ordinary(2,2,'easy');easy.pawns[0][0]=trail;
    assert.equal(position(move(roll(easy,faces(1)),0).pawns[0][0]),tile);
    const legacy={...easy};delete legacy.mode;delete legacy.eventTiles;
    assert.equal(position(move(roll(legacy,faces(1)),0).pawns[0][0]),end);
  }
  assert.throws(()=>newGame(2,2,'unknown'));
});
test('all pieces of a team share its zodiac animal and throws reproduce after the turn',()=>{
  assert.equal(new Set(ANIMALS).size,12);
  for(let offset=0;offset<12;offset++){
    const game=newGame(4,offset);
    const roster=game.pawns.flatMap((team,t)=>team.map((_,i)=>animalFor(t,i,game.zodiacOffset)));
    assert.equal(roster[0],offset);assert.equal(new Set(roster).size,4);
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
    const s=roll(ordinary(),faces(n));assert.equal(s.steps,n);assert.equal(roll(s,faces(1)),s);
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
  const turn=roll(ordinary(2,2,'island',2),faces(1));
  assert.deepEqual(moves(turn).map(m=>m.index),[0,1]);
  assert.deepEqual(move(turn,1).pawns[0],[[],[1]]);
  const stack=setup([1,2,3,4],1);stack.pawns[0][1]=[1,2,3,4];
  assert.deepEqual(moves(stack).map(m=>m.index),[0]);
  assert.deepEqual(move(stack,0).pawns[0],[[1,2,3,4,5],[1,2,3,4,5]]);
});
test('three or four pieces stack by square even without pawn one; computer may finish a stack',()=>{
  const g=newGame(3,11,'easy',[4,2,3],[1,2],[11,0,6]);
  assert.deepEqual(g.pawns.map(team=>team.length),[4,2,3]);
  assert.ok(g.pawns[0].every((_,i)=>ANIMALS[animalFor(0,i,g.zodiacOffset,g.teamAnimals)]==='돼지'));
  assert.ok(g.pawns[1].every((_,i)=>ANIMALS[animalFor(1,i,g.zodiacOffset,g.teamAnimals)]==='쥐'));
  assert.throws(()=>newGame(2,11,'easy',[1,4]));
  assert.throws(()=>newGame(2,11,'easy',[4,4],[],[12,0]));
  g.pawns[0]=[[FINISH],[19],[19],[19]];
  const turn=roll(g,faces(2)),action=computerAction(turn);
  assert.deepEqual(moves(turn).map(m=>m.index),[1]);
  assert.deepEqual(action,{type:'move',index:1,shortcut:false});
  assert.equal(move(turn,action.index).phase,'won');
});
test('new games deal four distinct event squares and moves keep the dealt board',t=>{
  let seed=43;
  t.mock.method(Math,'random',()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/2**32));
  for(const mode of ['easy','island']){
    const layouts=new Set();
    for(let i=0;i<50;i++){
      const g=newGame(4,11,mode,4),map=g.eventTiles;
      const nodes=Object.keys(map).map(Number);
      assert.deepEqual(Object.values(map).sort(),['back','carry','carry','home']);
      assert.ok(nodes.every(n=>n>0&&n<FINISH&&![5,10,15,22].includes(n)));
      if(mode==='island')assert.ok(nodes.every(n=>![3,6,8,13,16,18].includes(n)));
      layouts.add(JSON.stringify(map));
      const thrown=roll(g,faces(2)),next=move(thrown,3);
      assert.deepEqual(next.eventTiles,map);
      const saved=JSON.parse(JSON.stringify(thrown));
      assert.deepEqual(move(saved,3),next);
    }
    assert.ok(layouts.size>1);
  }
});
test('carry takes exactly one waiting teammate and both travel on the same trail',()=>{
  const g=newGame(2,11,'easy',4);
  g.eventTiles={3:'carry',5:'carry'};
  let s=move(roll(g,faces(3)),2);
  assert.deepEqual(s.pawns[0],[[1,2,3],[],[1,2,3],[]]);assert.equal(s.lastMove.pickedUp,0);
  assert.deepEqual(s.lastMove.indices,[2]);assert.deepEqual(g.pawns[0],[[],[],[],[]]);
  s=move(roll({...s,team:0},faces(2)),0);
  assert.deepEqual(s.pawns[0],[[1,2,3,4,5],[],[1,2,3,4,5],[]]);
  assert.equal(s.lastMove.pickedUp,null);
  const noReserve={...g,pawns:[[[1],[8],[FINISH],[20]],g.pawns[1]]};
  assert.equal(move(roll(noReserve,faces(2)),0).lastMove.pickedUp,null);
  const ally={...g,pawns:[[[1],[3],[],[]],g.pawns[1]]};
  assert.deepEqual(move(roll(ally,faces(2)),0).pawns[0],[[1,2,3],[1,2,3],[],[]]);
  const foe={...g,pawns:[g.pawns[0],[[1,2,3],[],[],[]]]};
  const capture=move(roll(foe,faces(3)),2);
  assert.equal(capture.team,0);assert.equal(capture.lastMove.pickedUp,0);
  assert.deepEqual(capture.pawns[1],[[],[],[],[]]);
});
test('back and home apply on landing, once, and affect only the arriving group',()=>{
  const g=newGame(2,2,'easy',3);g.eventTiles={20:'back',5:'home'};
  g.pawns[0]=[[4,5],[4,5],[12]];
  const back=move(roll(g,faces(1)),0,true);
  assert.deepEqual(back.pawns[0],[[4,5],[4,5],[12]]);
  assert.deepEqual(back.lastMove.frames,[20,5]);
  g.pawns[0]=[[3],[3],[12]];g.pawns[1][0]=[5];
  const home=move(roll(g,faces(2)),0);
  assert.deepEqual(home.pawns[0],[[],[],[12]]);assert.deepEqual(home.pawns[1][0],[5]);assert.deepEqual(home.lastMove.frames,[4,5,-1]);
  assert.equal(position(move(roll(g,faces(3)),0).pawns[0][0]),6);
  g.eventTiles={1:'back'};g.pawns[0]=[[],[],[]];
  assert.deepEqual(move(roll(g,faces(1)),2).pawns[0],[[],[],[]]);
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
  for(const mode of ['easy','island'])for(const n of [2,3,4])for(let run=0;run<50;run++){
    let g=newGame(n,2,mode,2+run%3),count=0;
    while(g.phase!=='won'&&count++<3000){
      g=roll(g,Array.from({length:4},()=>+(rnd()<.5)));const options=moves(g);
      assert.ok(options.length);const m=options[Math.floor(rnd()*options.length)];g=move(g,m.index,m.shortcut);
      for(const team of g.pawns)for(const p of team)for(const node of p)assert.ok(node>=0&&node<=29);
    }
    assert.equal(g.phase,'won');
  }
});

import {openRoom,roomCode} from '../games/yut/room.mjs';
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
    const host=await openRoom(null,()=>{},mock,{count:4,counts:[2,3,4,4],mode:'easy',offset:8,animals:[11,9,5,8]});clients.push(host);
    assert.equal(roomCode('https://example.test/#room='+host.view().host),host.view().host);assert.equal(roomCode('bogus'),null);
    for(let i=1;i<=4;i++){store.clear();clients.push(await openRoom(host.view().host,()=>{},mock));if(i<4)await until(()=>clients[i].view().seat===i);}
    await until(()=>clients[4].view().status.includes('찼'));
    host.start(8,'easy');await until(()=>clients[3].view().game?.revision===0);
    assert.equal(clients[3].view().game.mode,'easy');
    assert.deepEqual(clients[3].view().game.eventTiles,host.view().game.eventTiles);
    assert.equal(Object.keys(host.view().game.eventTiles).length,4);
    assert.deepEqual(clients[3].view().game.pawns.map(p=>p.length),[2,3,4,4]);assert.deepEqual(clients[3].view().game.teamAnimals,[11,9,5,8]);
    assert.equal(clients[3].view().game.zodiacOffset,8);
    clients[2].action({type:'roll'});await new Promise(r=>setTimeout(r,20));assert.equal(host.view().game.revision,0);
    host.action({type:'roll'});await until(()=>clients[1].view().game?.phase==='move');
    const opt=moves(host.view().game)[0];host.action({type:'move',...opt});
    await until(()=>clients[2].view().game?.revision===2);
    assert.deepEqual(clients[2].view().game,host.view().game);
  }finally{await Promise.all(clients.map(c=>c.close()));if(previous)Object.defineProperty(globalThis,'sessionStorage',previous);else delete globalThis.sessionStorage;}
});
