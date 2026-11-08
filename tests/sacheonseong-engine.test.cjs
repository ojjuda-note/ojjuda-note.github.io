const assert=require('node:assert/strict');
const E=require('../games/sacheonseong/engine.js');
const faces=require('../games/sacheonseong/faces.js');
assert.equal(faces.length,E.FACE_COUNT);
assert.equal(new Set(faces.map(f=>f.symbol||f.emoji)).size,faces.length,'Each picture must be unique');
assert.equal(new Set(faces.map(f=>f.name)).size,faces.length,'Each picture needs a distinct name');
assert(E.MAX_STAGE-4>=10,'At least 10 stages must follow the 64-tile stage');
assert.throws(()=>E.generate(E.MAX_STAGE+1),RangeError);
assert.throws(()=>E.boardInfo(E.MAX_STAGE+1),RangeError);
for(const columns of [0,-1,1.5,17,'4',null,NaN,Infinity]){
  assert.throws(()=>E.boardInfo(2,columns),RangeError);assert.throws(()=>E.generate(2,Math.random,columns),RangeError);
}
for(let stage=1;stage<=15;stage++)assert.deepEqual(E.boardInfo(stage),{...E.stageInfo(stage),rows:stage*2,cols:stage*2},'Original fifteen square boards stay compatible');
for(const stage of [16,18,40,100,200]){const info=E.boardInfo(stage);assert(info.total<=1400);assert.equal(info.cols,E.stageInfo(stage).size);}
for(const [stage,cols,rows,total,typeCount]of [[1,3,2,6,2],[6,11,14,154,43],[7,11,18,198,56],[2,7,4,28,8],[15,21,44,924,263],[15,700,2,1400,350]]){
  assert.deepEqual(E.boardInfo(stage,cols),{stage,size:stage*2,rows,cols,total,typeCount},'Fill spare cells and add a whole row when odd-by-odd dimensions would leave an unpaired tile');
}
for(const columns of [351,701,899]){
  assert.throws(()=>E.boardInfo(15,columns),RangeError,'Shapes cannot exceed the available picture inventory');
  assert.throws(()=>E.generate(15,Math.random,columns),RangeError);
}
assert(!E.withinCopyLimit([[0,0,0],[0,0,0]]),'Six copies must be rejected');
assert(!E.withinCopyLimit([[0,0],[0,-1]]),'Odd counts must be rejected');
assert(E.withinCopyLimit([[0,0],[0,0]]));
assert(E.withinCopyLimit([[-1,-1],[-1,-1]]));
let seed=97241;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
function oracle(grid,a,b){
  const rows=grid.length,columns=grid[0].length,dirs=[[1,0],[-1,0],[0,1],[0,-1]],q=[[a.r,a.c,-1,0]],seen=new Map();
  for(let h=0;h<q.length;h++){
    const[r,c,d,t]=q[h];
    for(let nd=0;nd<4;nd++){
      const nr=r+dirs[nd][0],nc=c+dirs[nd][1],nt=t+(d<0||nd===d?0:1);
      if(nt>2||nr< -1||nc< -1||nr>rows||nc>columns)continue;
      if(nr===b.r&&nc===b.c)return true;
      if(nr>=0&&nc>=0&&nr<rows&&nc<columns&&grid[nr][nc]!==-1)continue;
      const key=[nr,nc,nd].join(',');if((seen.get(key)??99)<=nt)continue;
      seen.set(key,nt);q.push([nr,nc,nd,nt]);
    }
  }
  return false;
}
let paths=0,boards=0,filledBoards=0,recoveries=0;
function checkPath(grid,a,b){const route=E.path(grid,a,b);assert.equal(!!route,oracle(grid,a,b),JSON.stringify({grid,a,b}));paths++;return route;}
function histogram(grid){return grid.flat().slice().sort((a,b)=>a-b);}
function adjacentPairs(grid){let total=0;for(let r=0;r<grid.length;r++)for(let c=0;c<grid[r].length;c++){const v=grid[r][c];if(v===-1)continue;if(c+1<grid[r].length&&grid[r][c+1]===v)total++;if(r+1<grid.length&&grid[r+1][c]===v)total++;}return total;}
function removeMove(grid,move){assert(move);assert.equal(grid[move.a.r][move.a.c],grid[move.b.r][move.b.c]);assert(E.path(grid,move.a,move.b));grid[move.a.r][move.a.c]=grid[move.b.r][move.b.c]=-1;}
function playToEnd(input){let grid=E.copy(input),left=grid.flat().filter(v=>v!==-1).length;while(left){let move=E.moves(grid);if(!move){const shuffled=E.reshuffle(grid,random).grid;assert.deepEqual(histogram(shuffled),histogram(grid));grid.forEach((row,r)=>row.forEach((v,c)=>assert.equal(v===-1,shuffled[r][c]===-1)));grid=shuffled;assert(E.withinCopyLimit(grid));move=E.moves(grid);assert(move,'Deadlock recovery must create a legal move');recoveries++;}removeMove(grid,move);left-=2;}assert(grid.flat().every(v=>v===-1));}
for(const [rows,columns]of [[2,2],[4,4],[6,6],[8,8],[10,10],[2,7],[7,2],[3,8],[8,3],[6,9],[9,6],[1,8],[8,1]])for(let trial=0;trial<100;trial++){
  const grid=Array.from({length:rows},()=>Array.from({length:columns},()=>random()<.55?-1:0));
  const a={r:Math.floor(random()*rows),c:Math.floor(random()*columns)},b={r:Math.floor(random()*rows),c:Math.floor(random()*columns)};
  if(a.r===b.r&&a.c===b.c)continue;grid[a.r][a.c]=0;grid[b.r][b.c]=0;
  checkPath(grid,a,b);
}
// Outside routes use each axis's own boundary; removed cells remain traversable.
assert.deepEqual(checkPath([[1,0],[2,3],[4,0],[5,6]],{r:0,c:1},{r:2,c:1}),[{r:0,c:1},{r:0,c:2},{r:2,c:2},{r:2,c:1}]);
assert.deepEqual(checkPath([[1,2,4,5],[0,3,0,6]],{r:1,c:0},{r:1,c:2}),[{r:1,c:0},{r:2,c:0},{r:2,c:2},{r:1,c:2}]);
assert.deepEqual(checkPath([[1,2,0],[0,-1,-1]],{r:0,c:2},{r:1,c:0}),[{r:0,c:2},{r:1,c:2},{r:1,c:0}]);
assert.equal(checkPath([[1,1,0,2,3],[4,4,5,6,0]],{r:0,c:2},{r:1,c:4}),null,'Wide-board interior columns are not an outside lane');
assert.deepEqual(E.moves([[1,2,3,4,5],[6,7,8,0,0]])?.a,{r:1,c:3},'Find pairs beyond the row count on a wide board');
assert.equal(E.moves([[0,1],[2,3],[4,5]]),null,'A tall board has no phantom columns or undefined pairs');
assert(E.path([[0,1]],{r:0,c:0},{r:0,c:1}),'Recovery may test a route between different pictures');
const boundsGrid=[[0,0,0],[0,0,0]],origin={r:0,c:0};
for(const point of [null,undefined,{},{r:-1,c:0},{r:2,c:0},{r:0,c:-1},{r:0,c:3},{r:.5,c:0},{r:0,c:.5},{r:'0',c:1},{r:0,c:Infinity},{r:NaN,c:0}]){
  assert.equal(E.path(boundsGrid,origin,point),null);assert.equal(E.path(boundsGrid,point,origin),null);
}
assert.equal(E.path(boundsGrid,origin,origin),null);
assert.equal(E.path([[0,-1]],origin,{r:0,c:1}),null);
assert.equal(E.path([],origin,{r:0,c:1}),null);
for(const stage of [...Array.from({length:15},(_,i)=>i+1),16,18,41,111,200]){
 const baseTotal=4*stage*stage,layouts=[...Array(5).fill(undefined),Math.max(1,Math.floor(stage*1.6)),Math.min(baseTotal,Math.ceil(stage*2.6))];
 if(stage>15){layouts.length=1;}
 if(stage===2)layouts.push(1,baseTotal,7);
 if(stage===6)layouts.push(11);
 for(const columns of layouts){
  const width=columns??E.stageInfo(stage).size,info=E.boardInfo(stage,columns),made=E.generate(stage,random,columns),occupied=made.grid.flat().filter(v=>v!==-1);
  assert.equal(made.grid.length,info.rows);assert(made.grid.every(row=>row.length===width));
  assert.equal(made.grid.flat().length,info.total);assert.equal(occupied.length,info.total,'Every cell of every row contains a real tile');
  assert.equal(info.total%2,0,'Full rectangles contain complete pairs');assert(info.total>=E.stageInfo(stage).total);
  assert(info.rows<=Math.ceil(E.stageInfo(stage).total/width)+1,'At most one extra row is needed to keep the tile count even');
  if(columns===undefined&&stage<=15){assert.equal(info.total,baseTotal);assert.equal(info.typeCount,E.stageInfo(stage).typeCount);}
  if(info.total>E.stageInfo(stage).total)filledBoards++;
  assert(E.withinCopyLimit(made.grid),`Stage ${stage}: more than four copies`);
  const counts=new Map();occupied.forEach(v=>{assert(faces[v]);counts.set(v,(counts.get(v)||0)+1);});
  assert.equal(counts.size,info.typeCount);assert(info.typeCount<=E.FACE_COUNT);
  assert([...counts.values()].every(n=>n===2||n===4),'Additional tiles are whole pairs with no more than four copies per picture');
  if(columns===undefined&&stage>=2&&info.total<1400){assert([...counts.values()].some(n=>n===2)&&[...counts.values()].some(n=>n===4),'Standard games mix pairs and quadruples');}
  assert(E.moves(made.grid),'Every fresh random board must have an opening move');
  playToEnd(made.grid);
  // Remove some legal pairs and verify a mid-game shuffle preserves holes and faces.
  const partial=E.copy(made.grid);for(let i=0;i<Math.floor(info.total/6);i++){const move=E.moves(partial);if(!move)break;removeMove(partial,move);}
  const remade=E.reshuffle(partial,random),remaining=E.copy(remade.grid);
  assert(E.withinCopyLimit(remaining),`Stage ${stage} reshuffle broke the copy limit`);
  assert.deepEqual(partial.flat().slice().sort(),remaining.flat().slice().sort());
  partial.forEach((row,r)=>row.forEach((v,c)=>assert.equal(v===-1,remaining[r][c]===-1)));
  if(remaining.flat().some(v=>v!==-1))assert(E.moves(remaining));
  playToEnd(remaining);boards++;
 }
}
assert(filledBoards>0,'Full playthroughs include newly added bottom-row pairs');
const inventory=E.generate(15,random,700).grid;
assert.equal(inventory.flat().length,1400);assert(inventory.flat().every(value=>faces[value]));
assert.equal(new Set(inventory.flat()).size,E.FACE_COUNT);assert(E.withinCopyLimit(inventory),'The largest supported picture inventory still respects the copy limit');
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
const silhouettes=new Set();
for(let stage=1;stage<=E.MAX_STAGE;stage++){
 const {grids,info}=E.generateStack(stage,random),all=grids.flat(2).filter(x=>x!==E.EMPTY),types=new Map();
 assert.equal(grids.length,E.layerCount(stage),`Stage ${stage}: floor count`);
 assert.equal(all.length,info.total,`Stage ${stage}: total playable tiles`);
 assert.equal(info.total%2,0);
 assert(info.total<=1200,`Stage ${stage}: capped tile count for performance`);
 assert(info.typeCount<=E.FACE_COUNT,`Stage ${stage}: available pictures`);
 for(const value of all)types.set(value,(types.get(value)||0)+1);
 assert.equal(types.size,info.typeCount);
 assert([...types.values()].every(count=>count===2||count===4),`Stage ${stage}: no duplicated faces across floors`);
 for(const grid of grids){
  assert.equal(grid.length,info.rows);
  assert(grid.every(row=>row.length===info.cols));
  assert(E.moves(grid),`Stage ${stage}: an opening pair exists on each floor`);
  if(stage>=3)assert(grid.flat().includes(E.EMPTY),`Stage ${stage}: irregular outlines have actual voids`);
 }
 silhouettes.add(grids[0].map(row=>row.map(v=>v===E.EMPTY?'_':'#').join('')).join('|'));
 assert(E.exposedMoves(grids),`Stage ${stage}: a visible opening pair always exists`);
 if([1,5,6,10,11,12,15,16,18,26,41,71,111,200].includes(stage))for(const grid of grids)playToEnd(grid);
}
assert(silhouettes.size>150,'Procedural silhouettes create many distinct layouts across 200 stages');
assert.equal(E.layerCount(6),2);assert.equal(E.layerCount(12),3);assert.equal(E.layerCount(18),4);assert.equal(E.layerCount(200),8);
assert.equal(E.LAYER_OFFSET,.5,'Each higher tile is centered between four tiles on the floor below');
const stackedTop=Array.from({length:4},()=>Array(4).fill(E.EMPTY));
stackedTop[1][1]=9;stackedTop[3][3]=9;
const stackedBottom=Array.from({length:4},()=>Array(4).fill(E.EMPTY));
for(let r=0;r<2;r++)for(let c=0;c<2;c++)stackedBottom[r][c]=7;
const stack=[stackedTop,stackedBottom];
for(let r=0;r<2;r++)for(let c=0;c<2;c++)assert.equal(E.isExposed(stack,{layer:1,r,c}),false,'One upper tile covers four lower tiles');
assert(E.isExposed(stack,{layer:0,r:1,c:1}),'Upper faces remain selectable');
assert.equal(E.exposedMoves(stack)?.a.layer,0,'A covered lower pair cannot become a hint');
stackedTop[1][1]=E.EMPTY;
for(let r=0;r<2;r++)for(let c=0;c<2;c++)assert(E.isExposed(stack,{layer:1,r,c}),'Removing one upper tile exposes all four lower tiles');
assert.equal(E.exposedMoves(stack)?.a.layer,1,'An exposed lower floor can be played without clearing the upper floor');
stackedTop[1][1]=9;
const third=Array.from({length:4},()=>Array(4).fill(E.EMPTY));third[0][0]=third[0][1]=11;
assert.equal(E.isExposed([stackedTop,stackedBottom,third],{layer:2,r:0,c:0}),false,'Any overlapping upper floor blocks a face');
// A faded tile may be passed via the narrow visible seam beside a half-step
// upper floor, while its covered position remains in the board inventory.
const ghostTop=Array.from({length:5},()=>Array(5).fill(E.EMPTY));ghostTop[2][2]=99;
const ghostBottom=Array.from({length:5},(_,r)=>Array.from({length:5},(_,c)=>20+r*5+c));
ghostBottom[2]=[7,E.EMPTY,8,E.EMPTY,7];
const ghostStack=[ghostTop,ghostBottom],shirtA={layer:1,r:2,c:0},shirtB={layer:1,r:2,c:4};
assert(E.isExposed(ghostStack,shirtA)&&E.isExposed(ghostStack,shirtB),'Both matching lower tiles are exposed');
assert.equal(E.isExposed(ghostStack,{layer:1,r:2,c:2}),false,'The middle blocker is covered by the upper floor');
assert.equal(E.path(ghostBottom,shirtA,shirtB),null,'The raw lower grid contains a hidden blocker');
assert.deepEqual(E.visiblePath(ghostStack,shirtA,shirtB),[shirtA,shirtB],'The visible seam lets the shirts connect');
assert.equal(E.visiblePath(ghostStack,{layer:1,r:2,c:2},shirtB),null,'A covered endpoint cannot be selected');
assert.equal(E.visiblePath(ghostStack,{layer:0,r:2,c:2},shirtB),null,'Separate floors cannot be paired');
assert.deepEqual(E.exposedMoves(ghostStack)?.a,shirtA,'Hints recognize the open lane');
// A route may also be falsely accepted when it crosses an exposed tile on
// another floor. Seek a genuine two-turn detour, or reject the pair.
const crossingTop=Array.from({length:5},()=>Array(5).fill(9));
crossingTop[2]=[7,E.EMPTY,E.EMPTY,E.EMPTY,7];crossingTop[3][2]=crossingTop[3][3]=E.EMPTY;
const crossingMiddle=Array.from({length:5},()=>Array(5).fill(E.EMPTY));
const crossingBottom=Array.from({length:5},()=>Array(5).fill(E.EMPTY));crossingBottom[1][1]=8;
const crossingStack=[crossingTop,crossingMiddle,crossingBottom],acrossA={layer:0,r:2,c:0},acrossB={layer:0,r:2,c:4};
assert(E.isExposed(crossingStack,{layer:2,r:1,c:1}),'The aligned tile on another floor is exposed');
assert(E.path(crossingTop,acrossA,acrossB),'The old single-floor test missed an overlapping card');
assert.equal(E.visiblePath(crossingStack,acrossA,acrossB),null,'The actual view blocks that misleading connection');
const detourTop=Array.from({length:5},()=>Array(5).fill(E.EMPTY));detourTop[2][0]=detourTop[2][4]=7;
const detour=E.visiblePath([detourTop,crossingMiddle,crossingBottom],acrossA,acrossB);
assert(detour&&detour.length>=3,'A clear path around the other floor remains available');
const floorVariants=Array.from({length:60},(_,i)=>E.stackInfo(i+6).floors.map(f=>f.total));
assert(floorVariants.some(sizes=>sizes[0]>sizes[1]),'Some stages have more tiles on top');
assert(floorVariants.some(sizes=>sizes[0]<sizes[1]),'Some stages have more tiles below');
for(const stage of [6,12,18,40,200]){
 const grids=E.generateStack(stage,random).grids;
 let left=grids.flat(2).filter(v=>v!==E.EMPTY).length,automaticShuffles=0;
 while(left){
  let move=E.exposedMoves(grids);
  if(!move){
   const before=grids.map(grid=>histogram(grid));
   const remade=E.recoverVisibleStack(grids,random);
   remade.forEach((grid,i)=>{
    assert.deepEqual(histogram(grid),before[i],`Stage ${stage}: automatic repair preserves pictures on floor ${i}`);
    grids[i]=grid;
   });
   move=E.exposedMoves(grids);automaticShuffles++;
  }
  assert(move,`Stage ${stage} always recovers an uncovered pair`);
  assert(E.isExposed(grids,move.a)&&E.isExposed(grids,move.b));
  const grid=grids[move.a.layer];assert(E.visiblePath(grids,move.a,move.b));
  grid[move.a.r][move.a.c]=grid[move.b.r][move.b.c]=E.EMPTY;
  left-=2;
 }
 assert(grids.flat(2).every(v=>v===E.EMPTY),`Stage ${stage} is completable with real overlap rules`);
 assert(automaticShuffles<600,`Stage ${stage} avoids excessive deadlocks`);
}
console.log(`PASS: ${E.MAX_STAGE} stages, ${silhouettes.size} varied silhouettes, ${paths} independent path checks, ${boards} full legacy boards (${filledBoards} with added pairs), all stacked stage openings and selected complete games, ${recoveries} deadlock recoveries, copy limits and RNG fallback.`);

