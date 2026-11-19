import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,roll,move,moves,position,FINISH,tileEffect,lastThrowSeed,computerAction,restoreGame,act,FIRST_SEAT_SPIN_MS} from '../games/yut/rules.mjs';
import {ANIMALS,animalFor} from '../games/yut/zodiac.mjs';

import {roundStandings} from '../games/yut/results.mjs';
test('mixed team sizes share ranks for equal finished proportions',()=>{
  const pawns=[[[],[FINISH]],[[FINISH],[FINISH],[FINISH]],[[FINISH],[],[FINISH],[]],[[],[],[]]];
  assert.deepEqual(roundStandings(pawns).map(r=>[r.team,r.rank]),[[1,1],[0,2],[2,2],[3,4]]);
});

const ordinary=(...args)=>({...newGame(...args),eventTiles:{},islandTiles:{}});
const faces=n=>Array.from({length:4},(_,i)=>+(i<n&&n<5));
function setup(at,steps){const g=ordinary(2,2,'island',2);g.pawns[0][0]=at;return roll(g,faces(steps));}
test('the chosen seat starts and normal turns wrap around the numbered seats',t=>{
  const board=ordinary(4);
  const random=t.mock.method(Math,'random',()=>.6);
  for(const [draw,expected] of [[.6,[3,4,1,2]],[0,[1,2,3,4]]]){
    random.mock.mockImplementation(()=>draw);
    const opening={...board,phase:'opening'};
    const start=act(opening,{type:'draw-first-seat'});
    assert.equal(act(start,{type:'begin-play'}),start);
    let game=act({...start,firstSeatAt:Date.now()-FIRST_SEAT_SPIN_MS},{type:'begin-play'});
    const order=[];
    for(let turn=0;turn<4;turn++){
      order.push(game.team+1);
      game=roll(game,[0,0,0,1]); // No pawn can move back, so pass to the next seat.
    }
    assert.deepEqual(order,expected);
  }
});
test('new games give every team four pieces and enable island obstacles by default',()=>{
  for(const count of [2,3,4,5,6,7,8]){
    const game=newGame(count);
    assert.equal(game.mode,'island');
    assert.deepEqual(game.pawns.map(team=>team.length),Array(count).fill(4));
    assert.deepEqual(game.islandTiles,{});
    assert.equal(new Set(game.teamAnimals).size,count);
    assert.deepEqual(game.teamAnimals,game.pawns.map((_,t)=>animalFor(t,0,game.zodiacOffset)));
  }
  for(const count of [1,9,7.5,'8'])assert.throws(()=>newGame(count));
});
test('old boards retain a single back square and retire wind and whirlpools',()=>{
  for(const [tile,end] of [[3,2],[16,16],[8,8],[13,13],[6,6],[18,18]]){
    const trail=Array.from({length:tile-1},(_,i)=>i+1);
    const easy=ordinary(2,2,'easy');easy.pawns[0][0]=trail;
    assert.equal(position(move(roll(easy,faces(1)),0).pawns[0][0]),tile);
    const legacy={...easy};delete legacy.mode;delete legacy.eventTiles;delete legacy.islandTiles;
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
    game=thrown;
    if(game.phase==='move'){
      game=move(game,0,false,steps);
      assert.equal(lastThrowSeed(JSON.parse(JSON.stringify(game))),seed);
      while(game.phase==='move')game=move(game,0,false,game.pendingRolls[0]);
    }
    assert.equal(lastThrowSeed(JSON.parse(JSON.stringify(game))),seed);
  }
});
test('only one square can send a pawn one step back, including saved boards with rocks',()=>{
  const g=ordinary();g.eventTiles={7:'back',12:'back'};g.islandTiles={4:'stone',18:'stone'};
  const backSquares=()=>Array.from({length:FINISH},(_,n)=>n).filter(n=>tileEffect(g,n)==='back');
  assert.deepEqual(backSquares(),[7]);assert.equal(tileEffect(g,4),undefined);assert.equal(tileEffect(g,12),undefined);
  g.pawns[0][0]=[1,2,3];
  assert.equal(position(move(roll(g,faces(1)),0).pawns[0][0]),4);
  g.eventTiles={};
  assert.deepEqual(backSquares(),[4]);delete g.islandTiles;assert.deepEqual(backSquares(),[3]);
});
test('regular throws keep their movement and invalid or repeated actions cannot advance the turn',()=>{
  for(let n=1;n<=5;n++){
    const s=roll(ordinary(),faces(n));assert.equal(s.steps,n);
    if(n>=4){assert.equal(s.phase,'roll');assert.equal(move(s,0),s);continue;}
    assert.equal(roll(s,faces(1)),s);
    assert.equal(move(s,1,true),s);
    const next=move(s,0);assert.equal(next.team,n>=4?0:1);
  }
});
test('only the marked stick alone changes do into backdo',()=>{
  for(let bits=0;bits<16;bits++){
    const sticks=Array.from({length:4},(_,i)=>(bits>>i)&1);
    const g=ordinary();g.pawns[0][0]=[1,2,3];
    const result=roll(g,sticks),count=sticks.reduce((sum,n)=>sum+n,0);
    assert.equal(result.steps,bits===8?-1:count||5);
    if(bits===8){
      assert.deepEqual(moves(result),[{index:0,shortcut:false,to:2}]);
      assert.equal(move(result,1),result);
      assert.deepEqual(move(result,0).pawns[0][0],[1,2]);
    }
  }
});
test('backdo retraces the actual shortcut, carries a stack and grants a capture throw',()=>{
  const g=ordinary();const trail=[1,2,3,4,5,20,21,22];
  g.pawns[0]=[[...trail],[...trail],[],[FINISH]];
  g.pawns[1][0]=trail.slice(0,-1);
  const rolled=roll(g,[0,0,0,1]);
  assert.deepEqual(moves(rolled),[{index:0,shortcut:false,to:21}]);
  const action=computerAction(rolled);
  assert.deepEqual(action,{type:'move',index:0,steps:-1,shortcut:false});
  const next=act(rolled,action);
  assert.deepEqual(next.pawns[0].slice(0,2),[trail.slice(0,-1),trail.slice(0,-1)]);
  assert.deepEqual(next.pawns[1][0],[]);assert.equal(next.team,0);
  assert.equal(next.lastMove.captured,1);assert.deepEqual(next.lastMove.frames,[21]);
});
test('backdo from the first do square goes to the exit, where the next forward step finishes',()=>{
  const first=ordinary();first.pawns[0]=[[1],[1],[],[FINISH]];first.pawns[1][0]=[19,0];
  const backdo=roll(first,[0,0,0,1]);
  assert.deepEqual(moves(backdo),[{index:0,shortcut:false,to:0}]);
  const back=move(backdo,0);
  assert.deepEqual(back.lastMove.frames,[0]);assert.deepEqual(back.pawns[0].slice(0,2),[[0],[0]]);
  assert.deepEqual(back.pawns[1][0],[]);assert.equal(back.lastMove.captured,1);
  const finished=move(roll(back,faces(1)),0);
  assert.deepEqual(finished.lastMove.frames,[FINISH]);assert.equal(position(finished.pawns[0][1]),FINISH);
  const fartherBack=move(roll(back,[0,0,0,1]),0);assert.deepEqual(fartherBack.lastMove.frames,[19]);
});
test('an unusable backdo waits for other banked moves and passes only when none can be played',()=>{
  const sticks=[0,0,0,1];const g=ordinary();
  const pass=roll(g,sticks);assert.equal(pass.phase,'roll');assert.equal(pass.team,1);
  assert.deepEqual(pass.pendingRolls,[]);assert.equal(pass.passedBackdo,true);
  const waiting=roll(roll(g,faces(4)),sticks);
  assert.deepEqual(waiting.pendingRolls,[4,-1]);assert.deepEqual(moves(waiting,-1),[]);
  const out=move(waiting,1,false,4);assert.deepEqual(out.pendingRolls,[-1]);
  assert.deepEqual(moves(out),[{index:1,shortcut:false,to:3}]);
  assert.equal(position(move(out,1).pawns[0][1]),3);
  const reset=move({...waiting,eventTiles:{4:'home'}},0,false,4);
  assert.equal(reset.team,1);assert.equal(reset.phase,'roll');assert.deepEqual(reset.pendingRolls,[]);
  const legacy={...out,steps:1,pendingRolls:[1]};assert.deepEqual(restoreGame(legacy).pendingRolls,[1]);
});
test('yut, mo and geol can be spent in any order on different pawns after all throws',()=>{
  let g=ordinary(),original=g.pawns;
  for(const n of [4,5,3]){
    g=roll(g,faces(n));assert.equal(g.pawns,original);
    if(n>=4){assert.deepEqual(moves(g,n),[]);assert.equal(move(g,0,false,n),g);}
  }
  assert.deepEqual(g.pendingRolls,[4,5,3]);
  assert.equal(roll(g,faces(1)),g);assert.equal(move(g,0),g);assert.equal(move(g,0,false,1),g);
  g=move(g,2,false,5);assert.equal(position(g.pawns[0][2]),5);assert.deepEqual(g.pendingRolls,[4,3]);
  g=move(g,0,false,3);assert.equal(position(g.pawns[0][0]),3);
  g=move(g,1,false,4);assert.equal(position(g.pawns[0][1]),4);
  assert.equal(g.team,1);assert.equal(g.turn,2);assert.deepEqual(g.pendingRolls,[]);
});
test('duplicate results are spent one at a time; captures preserve unused results and saved games resume',()=>{
  let g=ordinary();g.pawns[1][1]=[2];
  for(const n of [4,4,2])g=roll(g,faces(n));
  g=move(g,0,false,2);assert.equal(g.phase,'roll');assert.deepEqual(g.pendingRolls,[4,4]);
  g=roll(g,faces(3));g=move(g,1,false,4);assert.deepEqual(g.pendingRolls,[4,3]);
  assert.deepEqual(restoreGame(JSON.parse(JSON.stringify(g))),g);
  const action=computerAction(g);assert.ok(g.pendingRolls.includes(action.steps));assert.equal(act(g,action).pendingRolls.length,1);
  const legacy={...g,phase:'move',steps:5};delete legacy.pendingRolls;
  const restored=restoreGame(legacy);assert.equal(restored.phase,'roll');assert.deepEqual(restored.pendingRolls,[5]);
  assert.deepEqual(restoreGame({...legacy,phase:'roll'}).pendingRolls,[]);
  g=ordinary();g.pawns[1][0]=[4];g=roll(roll(g,faces(4)),faces(1));
  g=move(g,0,false,4);assert.equal(g.lastMove.captured,1);assert.equal(g.phase,'move');assert.deepEqual(g.pendingRolls,[1]);
});
test('retired obstacle squares are ordinary even on a saved shortcut',()=>{
  const g=ordinary();
  g.eventTiles={2:'home',4:'back'};g.islandTiles={21:'whirl',1:'breeze'};
  const land=(trail,steps)=>{
    g.pawns[0][0]=trail;
    return move(roll(g,faces(steps)),0).pawns[0][0];
  };
  assert.deepEqual(land([],1),[1]);
  assert.deepEqual(land([1,2],1),[1,2,3]);
  assert.deepEqual(land([1,2,3],1),[1,2,3]);
  assert.deepEqual(land([5,20],1),[5,20,21]);
  assert.deepEqual(land([1,2,3],2),[1,2,3,4,5]);
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
  assert.deepEqual(action,{type:'move',index:1,shortcut:false,steps:2});
  assert.equal(move(turn,action.index).phase,'won');
});
test('new games deal one of each tile without overlap and keep the layout throughout play',t=>{
  let seed=43;
  t.mock.method(Math,'random',()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/2**32));
  for(const mode of ['easy','island']){
    const locations=new Map();
    for(let i=0;i<300;i++){
      const g=newGame(4,11,mode,4);
      const entries=Object.entries(g.eventTiles).concat(Object.entries(g.islandTiles));
      assert.deepEqual(Object.values(g.eventTiles).sort(),['back','carry','home']);
      assert.deepEqual(g.islandTiles,{});
      const nodes=entries.map(([n])=>Number(n));
      assert.equal(new Set(nodes).size,nodes.length);
      assert.ok(nodes.every(n=>n>0&&n<FINISH));
      for(const [node,effect] of entries){
        if(!locations.has(effect))locations.set(effect,new Set());
        locations.get(effect).add(Number(node));
      }
      for(let n=0;n<FINISH;n++)assert.equal(tileEffect(g,n),g.eventTiles[n]??g.islandTiles[n]);
      const thrown=roll(g,faces(2)),next=move(thrown,3);
      assert.deepEqual(next.eventTiles,g.eventTiles);
      assert.deepEqual(next.islandTiles,g.islandTiles);
      const saved=JSON.parse(JSON.stringify(thrown));
      assert.deepEqual(move(saved,3),next);
    }
    for(const positions of locations.values()){
      for(const junction of [5,10,15,22])assert.ok(positions.has(junction));
    }
  }
});
test('fork events apply once on landing, and a carried pair can take either available exit',()=>{
  const routes=[[5,[4],6,20],[10,[9],11,25],[22,[5,20,21],23,27]];
  for(const [junction,trail,outer,inner] of routes){
    for(const effect of ['back','carry','home']){
      const s=ordinary();s.pawns[0][0]=trail;s.eventTiles={[junction]:effect};
      const landed=move(roll(s,faces(1)),0);
      assert.equal(landed.lastMove.event,effect);
      if(effect==='carry'){
        assert.equal(position(landed.pawns[0][1]),junction);
        const again=roll({...landed,team:0},faces(1));
        assert.deepEqual(moves(again).filter(m=>m.index===0).map(m=>m.to),[outer,inner]);
        assert.equal(position(move(again,0,true).pawns[0][1]),inner);
      }else assert.equal(position(landed.pawns[0][0]),effect==='back'?trail.at(-1):-1);
      const passed=move(roll(s,faces(2)),0);
      assert.equal(passed.lastMove.event,null);assert.equal(position(passed.pawns[0][0]),outer);
    }
  }
});
test('carry takes exactly one waiting teammate and both travel on the same trail',()=>{
  const g=newGame(2,11,'easy',4);
  g.eventTiles={3:'carry'};
  let s=move(roll(g,faces(3)),2);
  assert.deepEqual(s.pawns[0],[[1,2,3],[],[1,2,3],[]]);assert.equal(s.lastMove.pickedUp,0);
  assert.deepEqual(s.lastMove.indices,[2]);assert.deepEqual(g.pawns[0],[[],[],[],[]]);
  s=move(roll({...s,team:0,eventTiles:{5:'carry'}},faces(2)),0);
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
test('a back tile landing on carry picks up one reserve and the saved pair moves together',()=>{
  const g=ordinary();g.eventTiles={3:'carry',4:'back'};g.pawns[0][2]=[1,2];
  const landed=move(roll(g,faces(2)),2);
  assert.deepEqual(landed.pawns[0],[[1,2,3],[],[1,2,3],[]]);
  assert.equal(landed.lastMove.pickedUp,0);assert.equal(landed.lastMove.event,'back');
  assert.equal(landed.lastMove.landing,4);assert.deepEqual(landed.lastMove.frames,[3,4,3]);
  assert.match(landed.note,/뒤로/);assert.match(landed.note,/업기/);
  assert.equal(landed.team,1);assert.equal(landed.phase,'roll');
  assert.deepEqual(g.pawns[0],[[],[],[1,2],[]]);
  const resumed=restoreGame(JSON.parse(JSON.stringify(landed)));
  const continued=move(roll({...resumed,team:0},faces(2)),0);
  assert.deepEqual(continued.pawns[0],[[1,2,3,4,5],[],[1,2,3,4,5],[]]);
  assert.deepEqual(continued.lastMove.indices,[0,2]);
});
test('backdo and a back tile both pick up on carry while preserving shortcut history',()=>{
  const trail=[1,2,3,4,5,20,21];
  for(const useBackdo of [false,true]){
    const g=ordinary();g.eventTiles={21:'carry',22:'back'};
    g.pawns[0][1]=useBackdo?[...trail,22]:[...trail];
    const landed=move(roll(g,useBackdo?[0,0,0,1]:faces(1)),1);
    assert.deepEqual(landed.pawns[0],[[...trail],[...trail],[],[]]);
    assert.equal(landed.lastMove.pickedUp,0);
    assert.deepEqual(landed.lastMove.frames,useBackdo?[21]:[22,21]);
    const again=move(roll({...landed,team:0},[0,0,0,1]),0);
    assert.deepEqual(again.pawns[0],[[1,2,3,4,5,20],[1,2,3,4,5,20],[],[]]);
    assert.deepEqual(again.lastMove.indices,[0,1]);
  }
});
test('back-to-carry does not add a reserve to an existing stack or invent a reserve',()=>{
  for(const [pawns,expected] of [
    [[[1,2],[1,2],[],[]],[[1,2,3],[1,2,3],[],[]]],
    [[[1,2],[3],[],[]],[[1,2,3],[1,2,3],[],[]]],
    [[[1,2],[8],[FINISH],[20]],[[1,2,3],[8],[FINISH],[20]]]
  ]){
    const g=ordinary();g.eventTiles={3:'carry',4:'back'};g.pawns[0]=pawns;
    const landed=move(roll(g,faces(2)),0);
    assert.deepEqual(landed.pawns[0],expected);assert.equal(landed.lastMove.pickedUp,null);
    assert.equal(landed.lastMove.event,'back');assert.equal(landed.team,1);
  }
});
test('back-to-carry captures the destination stack, grants one throw and preserves banked results',()=>{
  const g=ordinary();g.eventTiles={3:'carry',4:'back'};g.pawns[0][0]=[1,2];
  g.pawns[1]=[[1,2,3],[1,2,3],[],[]];
  const banked=roll(roll(g,faces(4)),faces(2));
  const landed=move(banked,0,false,2);
  assert.deepEqual(landed.pawns[0],[[1,2,3],[1,2,3],[],[]]);
  assert.deepEqual(landed.pawns[1],[[],[],[],[]]);
  assert.equal(landed.lastMove.captured,2);assert.equal(landed.lastMove.pickedUp,1);
  assert.equal(landed.team,0);assert.equal(landed.turn,g.turn);assert.equal(landed.phase,'roll');
  assert.deepEqual(landed.pendingRolls,[4]);
  const thrown=roll(landed,faces(1));
  assert.equal(thrown.phase,'move');assert.deepEqual(thrown.pendingRolls,[4,1]);
  const continued=move(thrown,0,false,4);
  assert.deepEqual(continued.pawns[0],[[1,2,3,4,5,6,7],[1,2,3,4,5,6,7],[],[]]);
  assert.equal(continued.phase,'move');assert.deepEqual(continued.pendingRolls,[1]);
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
  const first=move(roll(g,faces(1)),2);
  assert.deepEqual(first.lastMove.frames,[1,0]);assert.deepEqual(first.pawns[0],[[],[],[0]]);
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
  t=move(roll(roll(t,faces(4)),faces(1)),0,true,4);assert.equal(t.phase,'won');assert.equal(t.winner,0);
  assert.equal(position(t.pawns[0][0]),FINISH);
});
test('every 2–8 team game reaches a winner within bounded play',()=>{
  let v=12345;const rnd=()=>((v=(Math.imul(1664525,v)+1013904223)>>>0)/2**32);
  for(const mode of ['easy','island'])for(const n of [2,3,4,5,6,7,8])for(let run=0;run<50;run++){
    let g=newGame(n,2,mode,2+run%3),count=0;
    while(g.phase!=='won'&&count++<3000){
      if(g.phase==='roll'){g=roll(g,Array.from({length:4},()=>+(rnd()<.5)));continue;}
      const usable=g.pendingRolls.filter(steps=>moves(g,steps).length);
      const steps=usable[Math.floor(rnd()*usable.length)],options=moves(g,steps);
      assert.ok(options.length);const m=options[Math.floor(rnd()*options.length)];g=move(g,m.index,m.shortcut,steps);
      for(const team of g.pawns)for(const p of team)for(const node of p)assert.ok(node>=0&&node<=29);
    }
    assert.equal(g.phase,'won');
  }
});

import {openRoom,roomCode} from '../games/yut/room.mjs';
test('eight distinct seats can play a full turn each and the ninth cannot act',async t=>{
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
  const until=async (check,limit=150)=>{for(let i=0;i<limit;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('network update timeout');};
  try{
    const counts=[2,3,4,4,3,2,4,3],animals=[11,9,5,8,0,1,2,3];
    const host=await openRoom(null,()=>{},mock,{count:8,counts,mode:'easy',offset:8,animals});clients.push(host);
    assert.equal(roomCode('https://example.test/#room='+host.view().host),host.view().host);assert.equal(roomCode('bogus'),null);
    for(let i=1;i<=8;i++){store.clear();clients.push(await openRoom(host.view().host,()=>{},mock));if(i<8)await until(()=>clients[i].view().seat===i);}
    await until(()=>clients[8].view().status.includes('찼'));
    let tile=0; // Put the home obstacle on square one so every seat ends its turn there.
    const rand=t.mock.method(Math,'random',()=>[.99,.99,0,.26][tile++]??0);
    host.start();await until(()=>clients.slice(0,8).every(c=>c.view().game?.revision===0));
    const game=clients[7].view().game;
    assert.equal(game.phase,'opening');
    assert.equal(game.firstSeatAt,undefined);
    assert.equal(game.mode,'easy');assert.equal(game.zodiacOffset,8);assert.deepEqual(game.islandTiles,{});
    assert.deepEqual(game.pawns.map(p=>p.length),counts);assert.deepEqual(game.teamAnimals,animals);
    assert.deepEqual(game.eventTiles,host.view().game.eventTiles);
    assert.equal(Object.keys(game.eventTiles).length,3);assert.equal(game.eventTiles[1],'home');
    clients[2].opening({type:'draw-first-seat'});
    assert.equal(host.view().game.firstSeatAt,undefined);
    host.opening({type:'draw-first-seat'});
    await until(()=>clients.slice(0,8).every(c=>c.view().game?.team===2));
    const drawn=host.view().game;
    assert.equal(clients[7].view().game.firstSeatAt,drawn.firstSeatAt);
    host.opening({type:'draw-first-seat'});
    host.opening({type:'begin-play'});
    clients[2].action({type:'roll'});
    await new Promise(resolve=>setTimeout(resolve,60));
    assert.equal(host.view().game,drawn);
    await until(()=>Date.now()>=drawn.firstSeatAt+FIRST_SEAT_SPIN_MS,500);
    assert.equal(host.view().game.phase,'opening');
    clients[2].opening({type:'begin-play'});
    assert.equal(host.view().game.phase,'opening');
    host.opening({type:'begin-play'});
    await until(()=>clients.slice(0,8).every(c=>c.view().game?.phase==='roll'));
    let face=0;rand.mock.mockImplementation(()=>face++%4===0?.1:.9);
    for(let turn=0;turn<8;turn++){
      const seat=(2+turn)%8;
      assert.equal(host.view().game.team,seat);
      clients[(seat+1)%8].action({type:'roll'});clients[8].action({type:'roll'});
      await new Promise(r=>setTimeout(r,20));assert.equal(host.view().game.revision,turn*2);
      clients[seat].action({type:'roll'});await until(()=>clients[seat].view().game?.phase==='move');
      clients[seat].action({type:'move',...moves(clients[seat].view().game)[0]});
      await until(()=>clients.slice(0,8).every(c=>c.view().game?.revision===(turn+1)*2));
    }
    assert.equal(host.view().game.team,2);assert.deepEqual(clients[7].view().game,host.view().game);
    const send=async action=>{
      const next=host.view().game.revision+1;clients[2].action(action);
      await until(()=>clients.slice(0,8).every(c=>c.view().game.revision===next));
    };
    for(const n of [4,5,3]){
      let i=0;rand.mock.mockImplementation(()=>i++%4<n&&n<5?.1:.9);
      await send({type:'roll'});
    }
    assert.deepEqual(clients[7].view().game.pendingRolls,[4,5,3]);
    await send({type:'move',index:1,steps:5});
    assert.deepEqual(clients[7].view().game.pendingRolls,[4,3]);
    assert.equal(position(clients[7].view().game.pawns[2][1]),5);
    assert.equal(clients[8].view().seat,-1);
  }finally{await Promise.all(clients.map(c=>c.close()));if(previous)Object.defineProperty(globalThis,'sessionStorage',previous);else delete globalThis.sessionStorage;}
});
