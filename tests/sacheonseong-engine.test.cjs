const assert=require('node:assert/strict');
const E=require('../games/sacheonseong/engine.js');
const faces=require('../games/sacheonseong/faces.js');
assert.equal(faces.length,E.FACE_COUNT);
assert.equal(new Set(faces.map(f=>f.symbol||f.emoji)).size,faces.length,'Each picture must be unique');
assert.equal(new Set(faces.map(f=>f.name)).size,faces.length,'Each picture needs a distinct name');
assert(E.MAX_STAGE-4>=10,'At least 10 stages must follow the 64-tile stage');
assert.throws(()=>E.generate(E.MAX_STAGE+1),RangeError);
assert(!E.withinCopyLimit([[0,0,0],[0,0,0]]),'Six copies must be rejected');
assert(!E.withinCopyLimit([[0,0],[0,-1]]),'Odd counts must be rejected');
assert(E.withinCopyLimit([[0,0],[0,0]]));
assert(E.withinCopyLimit([[-1,-1],[-1,-1]]));
let seed=97241;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
function oracle(grid,a,b){
  const n=grid.length,dirs=[[1,0],[-1,0],[0,1],[0,-1]],q=[[a.r,a.c,-1,0]],seen=new Map();
  for(let h=0;h<q.length;h++){
    const[r,c,d,t]=q[h];
    for(let nd=0;nd<4;nd++){
      const nr=r+dirs[nd][0],nc=c+dirs[nd][1],nt=t+(d<0||nd===d?0:1);
      if(nt>2||nr< -1||nc< -1||nr>n||nc>n)continue;
      if(nr===b.r&&nc===b.c)return true;
      if(nr>=0&&nc>=0&&nr<n&&nc<n&&grid[nr][nc]!==-1)continue;
      const key=[nr,nc,nd].join(',');if((seen.get(key)??99)<=nt)continue;
      seen.set(key,nt);q.push([nr,nc,nd,nt]);
    }
  }
  return false;
}
let paths=0,boards=0,recoveries=0;
function histogram(grid){return grid.flat().slice().sort((a,b)=>a-b);}
function adjacentPairs(grid){let total=0;for(let r=0;r<grid.length;r++)for(let c=0;c<grid.length;c++){const v=grid[r][c];if(v===-1)continue;if(c+1<grid.length&&grid[r][c+1]===v)total++;if(r+1<grid.length&&grid[r+1][c]===v)total++;}return total;}
function removeMove(grid,move){assert(move);assert.equal(grid[move.a.r][move.a.c],grid[move.b.r][move.b.c]);assert(E.path(grid,move.a,move.b));grid[move.a.r][move.a.c]=grid[move.b.r][move.b.c]=-1;}
function playToEnd(input){let grid=E.copy(input),left=grid.flat().filter(v=>v!==-1).length;while(left){let move=E.moves(grid);if(!move){const shuffled=E.reshuffle(grid,random).grid;assert.deepEqual(histogram(shuffled),histogram(grid));grid.forEach((row,r)=>row.forEach((v,c)=>assert.equal(v===-1,shuffled[r][c]===-1)));grid=shuffled;assert(E.withinCopyLimit(grid));move=E.moves(grid);assert(move,'Deadlock recovery must create a legal move');recoveries++;}removeMove(grid,move);left-=2;}assert(grid.flat().every(v=>v===-1));}
for(let n=2;n<=10;n+=2)for(let trial=0;trial<100;trial++){
  const grid=Array.from({length:n},()=>Array.from({length:n},()=>random()<.55?-1:0));
  const a={r:Math.floor(random()*n),c:Math.floor(random()*n)},b={r:Math.floor(random()*n),c:Math.floor(random()*n)};
  if(a.r===b.r&&a.c===b.c)continue;grid[a.r][a.c]=0;grid[b.r][b.c]=0;
  assert.equal(!!E.path(grid,a,b),oracle(grid,a,b),JSON.stringify({grid,a,b}));paths++;
}
for(let stage=1;stage<=E.MAX_STAGE;stage++)for(let trial=0;trial<5;trial++){
  let made=E.generate(stage,random);assert.equal(made.grid.flat().length,(stage*2)**2);
  assert(E.withinCopyLimit(made.grid),`Stage ${stage}: more than four copies`);
  const counts=new Map();made.grid.flat().forEach(v=>{assert(faces[v]);counts.set(v,(counts.get(v)||0)+1);});
  assert.equal(counts.size,E.stageInfo(stage).typeCount);
  assert([...counts.values()].every(n=>n===(stage===1?2:4)));
  assert(E.moves(made.grid),'Every fresh random board must have an opening move');
  playToEnd(made.grid);
  // Remove some legal pairs and verify a mid-game shuffle preserves holes and faces.
  const partial=E.copy(made.grid);for(let i=0;i<Math.floor(made.grid.flat().length/6);i++){const move=E.moves(partial);if(!move)break;removeMove(partial,move);}
  const remade=E.reshuffle(partial,random),remaining=E.copy(remade.grid);
  assert(E.withinCopyLimit(remaining),`Stage ${stage} reshuffle broke the copy limit`);
  assert.deepEqual(partial.flat().slice().sort(),remaining.flat().slice().sort());
  partial.forEach((row,r)=>row.forEach((v,c)=>assert.equal(v===-1,remaining[r][c]===-1)));
  if(remaining.flat().some(v=>v!==-1))assert(E.moves(remaining));
  playToEnd(remaining);boards++;
}
// This catches the old layout's neighbor pairing rather than mirroring the shuffle.
// A random 16x16 board has about six touching pairs, versus ~100 in the old layout.
let generatedAdjacency=0,shuffledAdjacency=0;const layouts=new Set(),samples=60;
for(let i=0;i<samples;i++){const grid=E.generate(8,random).grid;generatedAdjacency+=adjacentPairs(grid);const shuffled=E.reshuffle(grid,random).grid;shuffledAdjacency+=adjacentPairs(shuffled);assert.notDeepEqual(grid,shuffled,'Shuffle should visibly change a multi-picture board');layouts.add(JSON.stringify(grid));}
assert.equal(layouts.size,samples);assert(generatedAdjacency/samples<12,'Generated boards cluster matching tiles');assert(shuffledAdjacency/samples<12,'Manual shuffles cluster matching tiles');
let calls=0;const stuckRng=()=>++calls===1?.3:.999999;
const blocked=[[0,1],[1,0]];assert.equal(E.moves(blocked),null);
const repaired=E.reshuffle(blocked,stuckRng).grid;assert(E.moves(repaired));assert.deepEqual(histogram(blocked),histogram(repaired));assert(calls>=96,'Exercise bounded fallback after repeated unplayable rolls');
assert.deepEqual(E.reshuffle([[-1,-1],[-1,-1]],random).grid,[[-1,-1],[-1,-1]]);
assert.throws(()=>E.reshuffle([[0,-1],[-1,-1]],random),/Unpaired/);
console.log(`PASS: ${E.MAX_STAGE} stages, ${paths} independent path checks, ${boards} complete games plus mid-game reshuffles, ${recoveries} deadlock recoveries, copy limits, holes, and RNG fallback. Mean touching pairs on 256-tile boards: new ${(generatedAdjacency/samples).toFixed(2)}, shuffle ${(shuffledAdjacency/samples).toFixed(2)} (${samples} samples each).`);
