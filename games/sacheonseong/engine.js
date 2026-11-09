(function (root) {
  'use strict';
  const EMPTY = -1;
  const MAX_STAGE = 200, MAX_COPIES = 4, RULES_VERSION = 10, FACE_COUNT = 350;
  // 12×18 is a portrait density reference, not a forced shape. Landscape
  // boards can be wider as long as the full footprint stays compact.
  const MAX_FLOOR_COLS = 28, MAX_FLOOR_ROWS = 24, MAX_FLOOR_CELLS = 216;
  // Alternate half-cell offsets instead of shifting each successive floor
  // farther down and right. Even a 100-floor stack stays inside one footprint.
  const LAYER_OFFSET = .5;
  const layerShift = layer => layer % 2 ? LAYER_OFFSET : 0;
  // Reserve roughly one seventh of all tiles for picture pairs; the rest
  // appear four times. At the inventory ceiling, fall back to four copies.
  function mixPlan(total) {
    const pairs=total/2,maxSingles=Math.max(0,2*FACE_COUNT-pairs);
    let pairOnly=Math.min(Math.floor(total*.07),maxSingles);
    if(pairOnly%2!==pairs%2)pairOnly--;
    pairOnly=Math.max(pairs%2,pairOnly);
    if(total===4)pairOnly=2;
    else if(total>=8&&pairOnly<2&&maxSingles>=2)pairOnly=pairs%2?1:2;
    if(pairOnly===pairs&&pairs>2)pairOnly-=2;
    const quadruple=(pairs-pairOnly)/2;
    return {pairOnly,quadruple,typeCount:pairOnly+quadruple};
  }
  function mixedValues(palette,plan) {
    const values=[];
    for(let i=0;i<plan.quadruple;i++)values.push(palette[i],palette[i],palette[i],palette[i]);
    for(let i=plan.quadruple;i<plan.typeCount;i++)values.push(palette[i],palette[i]);
    return values;
  }
  const stageInfo = stage => {
    if(!Number.isInteger(stage)||stage<1||stage>MAX_STAGE)throw new RangeError('Stage must be 1–200');
    // The original first fifteen stages keep their tile counts. Later stages
    // vary their layers and silhouette without growing into enormous boards.
    const total=stage<=15?4*stage*stage:Math.min(1200,900+24*(stage-15));
    return {stage,size:stage<=15?stage*2:Math.ceil(Math.sqrt(total)),total,typeCount:mixPlan(total).typeCount};
  };
  const layerCount = stage => {
    const total=stageInfo(stage).total;
    // Roughly three times as many pictures per floor as the sparse layout,
    // without pushing later stages beyond the picture inventory limit.
    return stage<=4?1:Math.min(100,Math.ceil(total/88));
  };
  // Reserve an uninterrupted horizontal and vertical passage, each at least
  // one card wide in the projected view. Every alternating floor respects
  // the same physical lanes.
  function walkwayCenter(rows,cols,count){
    const extra=count>1?LAYER_OFFSET:0;
    return {r:Math.floor((rows-1+extra)/2),c:Math.floor((cols-1+extra)/2)};
  }
  function walkwayOpen(rows,cols,count,layer,r,c){
    const mid=walkwayCenter(rows,cols,count),shift=layerShift(layer);
    return (rows<4||Math.abs(r+shift-mid.r)>=1)&&(cols<4||Math.abs(c+shift-mid.c)>=1);
  }
  function walkwayCapacity(rows,cols,count,layer){
    const mid=walkwayCenter(rows,cols,count),shift=layerShift(layer);
    let allowedRows=0,allowedCols=0;
    for(let r=0;r<rows;r++)if(rows<4||Math.abs(r+shift-mid.r)>=1)allowedRows++;
    for(let c=0;c<cols;c++)if(cols<4||Math.abs(c+shift-mid.c)>=1)allowedCols++;
    return allowedRows*allowedCols;
  }
  // Each layer keeps its own outline and pairs. A lower tile can be selected
  // whenever none of the still-present upper tiles overlaps its face.
  function stackInfo(stage, columns) {
    const base=stageInfo(stage),count=layerCount(stage);
    if(stage<=2){
      const cols=columns??base.size;
      if(!Number.isInteger(cols)||cols<1||cols>MAX_FLOOR_COLS)throw new RangeError('Invalid floor columns');
      const info=boardInfo(stage,cols);
      if(info.rows>MAX_FLOOR_ROWS||info.rows*cols>MAX_FLOOR_CELLS)throw new RangeError('Floor footprint is too large');
      return {...info,layerCount:1,floors:[{total:info.total,...mixPlan(info.total)}]};
    }
    // Alternate top-heavy and bottom-heavy stacks, rather than imposing a
    // fixed number of tiles per floor. Each share remains a whole pair.
    const weights=Array.from({length:count},(_,i)=>1+.28*Math.sin(stage*1.7+i*2.6)+.2*Math.cos(stage*.53-i*.83));
    const totalWeight=weights.reduce((a,b)=>a+b,0),pairTotal=base.total/2;
    const shares=weights.map(weight=>pairTotal*weight/totalWeight),pairs=shares.map(Math.floor);
    const extraPairs=pairTotal-pairs.reduce((a,b)=>a+b,0);
    const order=shares.map((share,i)=>({i,fraction:share-pairs[i]})).sort((a,b)=>b.fraction-a.fraction||a.i-b.i);
    for(let i=0;i<extraPairs;i++)pairs[order[i].i]++;
    const targets=pairs.map(value=>value*2);
    const biggest=Math.max(...targets),cols=columns??Math.min(MAX_FLOOR_COLS,Math.ceil(Math.sqrt(biggest/.66)));
    if(!Number.isInteger(cols)||cols<2||cols>MAX_FLOOR_COLS)throw new RangeError('Invalid stack columns');
    // Use the shortest footprint that still leaves clear crossing lanes.
    // The old 66% density guess made the limited-width landscape board tiny.
    let rows=Math.max(3,Math.ceil(biggest/cols));
    while(rows<=MAX_FLOOR_ROWS&&rows*cols<=MAX_FLOOR_CELLS&&targets.some((total,layer)=>walkwayCapacity(rows,cols,count,layer)<total))rows++;
    if(rows>MAX_FLOOR_ROWS||rows*cols>MAX_FLOOR_CELLS)throw new RangeError('Floor footprint is too large');
    if(rows*cols<biggest)throw new RangeError('Stack is too small');
    const floors=targets.map(total=>({total,...mixPlan(total)}));
    const typeCount=floors.reduce((sum,f)=>sum+f.typeCount,0);
    if(typeCount>FACE_COUNT)throw new RangeError('Stack requires more pictures than are available');
    return {...base,rows,cols,layerCount:count,total:targets.reduce((a,b)=>a+b,0),typeCount,floors};
  }
  function boardInfo(stage, columns = stageInfo(stage).size) {
    const base=stageInfo(stage);
    if(!Number.isInteger(columns)||columns<1||columns>base.total)throw new RangeError('Columns must be an integer between 1 and the stage tile count');
    let rows=Math.ceil(base.total/columns);
    if(rows*columns%2)rows++;
    const total=rows*columns,typeCount=mixPlan(total).typeCount;
    if(typeCount>FACE_COUNT)throw new RangeError('Board requires more pictures than are available');
    return {...base,rows,cols:columns,total,typeCount};
  }
  const same = (a, b) => a.r === b.r && a.c === b.c;
  const copy = grid => grid.map(row => row.slice());

  function path(grid, a, b, acceptsRoute) {
    const rows = grid.length, columns = grid[0]?.length || 0;
    const inside = p => p && Number.isInteger(p.r) && Number.isInteger(p.c) && p.r >= 0 && p.r < rows && p.c >= 0 && p.c < columns && p.c < grid[p.r].length;
    if (!inside(a) || !inside(b) || same(a, b) || grid[a.r][a.c] === EMPTY || grid[b.r][b.c] === EMPTY) return null;
    const open = p => same(p, a) || same(p, b) || p.r < 0 || p.c < 0 || p.r >= rows || p.c >= columns || grid[p.r][p.c] === EMPTY;
    function line(p, q) {
      if (p.r !== q.r && p.c !== q.c) return false;
      const dr = Math.sign(q.r - p.r), dc = Math.sign(q.c - p.c);
      let r = p.r, c = p.c;
      for (;;) {
        if (!open({r, c})) return false;
        if (r === q.r && c === q.c) return true;
        r += dr; c += dc;
      }
    }
    function clean(points) {
      const out = [];
      for (const p of points) {
        if (out.length && same(out[out.length - 1], p)) continue;
        while (out.length > 1) {
          const x = out[out.length - 2], y = out[out.length - 1];
          if ((x.r === y.r && y.r === p.r) || (x.c === y.c && y.c === p.c)) out.pop();
          else break;
        }
        out.push(p);
      }
      return out;
    }
    const options = [[a,b], [a,{r:a.r,c:b.c},b], [a,{r:b.r,c:a.c},b]];
    for (let r = -1; r <= rows; r++) options.push([a,{r,c:a.c},{r,c:b.c},b]);
    for (let c = -1; c <= columns; c++) options.push([a,{r:a.r,c},{r:b.r,c},b]);
    let best = null, bestScore = Infinity;
    for (const candidate of options) {
      if (!candidate.slice(1).every((p,i) => line(candidate[i],p))) continue;
      const p = clean(candidate);
      if(acceptsRoute&&!acceptsRoute(p))continue;
      const length = p.slice(1).reduce((sum,x,i) => sum + Math.abs(x.r-p[i].r) + Math.abs(x.c-p[i].c),0);
      const score = p.length * (2 * (rows + columns) + 4) + length;
      if (score < bestScore) { best = p; bestScore = score; }
    }
    return best;
  }

  function moves(grid) {
    const groups = new Map();
    for (let r=0;r<grid.length;r++) for (let c=0;c<grid[r].length;c++) {
      const value = grid[r][c];
      if (value !== EMPTY) { if (!groups.has(value)) groups.set(value,[]); groups.get(value).push({r,c}); }
    }
    for (const cells of groups.values()) for (let i=0;i<cells.length;i++) for (let j=i+1;j<cells.length;j++) {
      const route = path(grid,cells[i],cells[j]);
      if (route) return {a:cells[i],b:cells[j],path:route};
    }
    return null;
  }

  function isExposed(grids, point) {
    const layer=point?.layer, r=point?.r, c=point?.c;
    if(!Number.isInteger(layer)||layer<0||layer>=grids.length||!Number.isInteger(r)||!Number.isInteger(c)||grids[layer]?.[r]?.[c]===undefined||grids[layer][r][c]===EMPTY)return false;
    for(let above=0;above<layer;above++){
      const grid=grids[above],shift=layerShift(layer)-layerShift(above);
      const centerR=r+shift,centerC=c+shift;
      for(let ar=Math.floor(centerR);ar<=Math.ceil(centerR);ar++){
        for(let ac=Math.floor(centerC);ac<=Math.ceil(centerC);ac++){
          if(Math.abs(ar-centerR)<1&&Math.abs(ac-centerC)<1&&grid[ar]?.[ac]!==undefined&&grid[ar][ac]!==EMPTY)return false;
        }
      }
    }
    return true;
  }

  // Covered, faded tiles do not obstruct a visible route, but uncovered
  // cards on ANY floor do. Both the hint and the actual match use this same
  // projected layout so a highlighted line never runs through a white tile.
  function visibleBoard(grids) {
    const obstacles=[];
    const masks=grids.map((grid,layer)=>grid.map((row,r)=>row.map((value,c)=>{
      if(value===EMPTY||!isExposed(grids,{layer,r,c}))return EMPTY;
      const shift=layerShift(layer);
      obstacles.push({layer,r,c,x:c+shift,y:r+shift});
      return value;
    })));
    return {masks,obstacles};
  }
  function routeAvoidsTiles(route,layer,obstacles,a,b) {
    // Half-offset floors leave a thin green seam at +/-0.5 of a cell.
    // Treat that seam as open, but never cross another tile's interior.
    const shift=layerShift(layer),margin=.498;
    const points=route.map(p=>({x:p.c+shift,y:p.r+shift}));
    for(const tile of obstacles){
      if(tile.layer===layer&&(same(tile,a)||same(tile,b)))continue;
      for(let i=1;i<points.length;i++){
        const u=points[i-1],v=points[i];
        if(u.y===v.y){
          if(Math.abs(tile.y-u.y)<margin&&tile.x+margin>Math.min(u.x,v.x)&&tile.x-margin<Math.max(u.x,v.x))return false;
        }else if(u.x===v.x){
          if(Math.abs(tile.x-u.x)<margin&&tile.y+margin>Math.min(u.y,v.y)&&tile.y-margin<Math.max(u.y,v.y))return false;
        }
      }
    }
    return true;
  }
  function visiblePath(grids, a, b) {
    if(!a||!b||a.layer!==b.layer||!isExposed(grids,a)||!isExposed(grids,b))return null;
    const {masks,obstacles}=visibleBoard(grids);
    return path(masks[a.layer],a,b,route=>routeAvoidsTiles(route,a.layer,obstacles,a,b));
  }

  function exposedMoves(grids) {
    const {masks,obstacles}=visibleBoard(grids);
    for(let layer=0;layer<grids.length;layer++){
      const grid=masks[layer],groups=new Map();
      for(let r=0;r<grid.length;r++)for(let c=0;c<grid[r].length;c++){
        const value=grid[r][c];
        if(value===EMPTY)continue;
        if(!groups.has(value))groups.set(value,[]);
        groups.get(value).push({layer,r,c});
      }
      for(const cells of groups.values())for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){
        const route=path(grid,cells[i],cells[j],candidate=>routeAvoidsTiles(candidate,layer,obstacles,cells[i],cells[j]));
        if(route)return {a:cells[i],b:cells[j],path:route};
      }
    }
    return null;
  }

  function shuffle(values, random = Math.random) {
    for (let i=values.length-1;i>0;i--) { const j = Math.floor(random()*(i+1)); [values[i],values[j]]=[values[j],values[i]]; }
    return values;
  }

  function hasClump(grid) {
    for(let r=0;r<grid.length;r++)for(let c=0;c<grid[r].length;c++){
      const v=grid[r][c];if(v===EMPTY)continue;
      let neighbors=0;
      for(const[dr,dc]of[[1,0],[-1,0],[0,1],[0,-1]])if(grid[r+dr]?.[c+dc]===v)neighbors++;
      if(neighbors>1)return true;
    }
    return false;
  }

  // Shuffle individual tiles over all occupied cells, never pre-pair neighbors.
  // Retry dead starts and conspicuous three-tile clumps, not individual pairs.
  function arrange(input, values, random = Math.random) {
    const result=copy(input),cells=[];
    for(let r=0;r<input.length;r++)for(let c=0;c<input[r].length;c++)if(input[r][c]!==EMPTY)cells.push({r,c});
    if(cells.length!==values.length)throw new Error('Tile count mismatch');
    if(!cells.length)return {grid:result};
    const canChange=new Set(values).size>1;
    for(let attempt=0;attempt<32;attempt++){
      shuffle(values,random);
      cells.forEach((p,i)=>{result[p.r][p.c]=values[i];});
      const changed=cells.some(p=>result[p.r][p.c]!==input[p.r][p.c]);
      if((!canChange||(changed&&!hasClump(result)))&&moves(result))return {grid:result};
    }
    if(moves(result))return {grid:result};
    // Bounded recovery for very unlucky / degenerate RNG: repair just one pair
    // by swapping two tile identities. All other random placements stay intact.
    const order=shuffle(cells.slice(),random);
    for(let i=0;i<order.length;i++)for(let j=i+1;j<order.length;j++){
      const a=order[i],b=order[j];
      if(!path(result,a,b))continue;
      const other=order.find(p=>!same(p,a)&&result[p.r][p.c]===result[a.r][a.c]);
      if(!other)throw new Error('Unpaired tile');
      [result[b.r][b.c],result[other.r][other.c]]=[result[other.r][other.c],result[b.r][b.c]];
      return {grid:result};
    }
    throw new Error('No connectable positions');
  }

  function generate(stage, random = Math.random, columns = stageInfo(stage).size) {
    const {rows,cols,total,typeCount}=boardInfo(stage,columns);
    const palette=stage<=3?Array.from({length:typeCount},(_,i)=>i):shuffle(Array.from({length:FACE_COUNT},(_,i)=>i),random).slice(0,typeCount);
    const types=mixedValues(palette,mixPlan(total));
    const grid=Array.from({length:rows},()=>Array(cols).fill(0));
    return arrange(grid,types,random);
  }
  function reshuffle(grid, random = Math.random) {
    const counts=new Map();grid.flat().forEach(v=>{if(v!==EMPTY) counts.set(v,(counts.get(v)||0)+1);});
    const types=[];
    for(const [type,count] of counts) {if(count%2) throw new Error('Unpaired tile');for(let i=0;i<count;i++) types.push(type);}
    return arrange(grid,types,random);
  }
  // A normal single-floor reshuffle can leave every visible pair blocked by
  // another floor. Preserve each floor's pictures and holes, then guarantee
  // one geometrically clear matching pair without charging the player.
  function recoverVisibleStack(grids, random = Math.random) {
    const result=grids.map(copy);
    if(!result.some(grid=>grid.some(row=>row.some(value=>value!==EMPTY)))||exposedMoves(result))return result;
    const top=result.findIndex(grid=>grid.some(row=>row.some(value=>value!==EMPTY)));
    result[top]=reshuffle(result[top],random).grid;
    if(exposedMoves(result))return result;
    const {masks,obstacles}=visibleBoard(result);
    for(let layer=0;layer<result.length;layer++){
      const grid=masks[layer],cells=[];
      for(let r=0;r<grid.length;r++)for(let c=0;c<grid[r].length;c++)if(grid[r][c]!==EMPTY)cells.push({layer,r,c});
      for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){
        const a=cells[i],b=cells[j];
        if(!path(grid,a,b,route=>routeAvoidsTiles(route,layer,obstacles,a,b)))continue;
        const face=result[layer][a.r][a.c];
        if(result[layer][b.r][b.c]!==face){
          const donor=[];
          for(let r=0;r<grid.length;r++)for(let c=0;c<grid[r].length;c++)if((r!==a.r||c!==a.c)&&result[layer][r][c]===face)donor.push({r,c});
          if(!donor.length)throw new Error('Unpaired tile');
          const target=donor[Math.floor(random()*donor.length)];
          [result[layer][b.r][b.c],result[layer][target.r][target.c]]=[result[layer][target.r][target.c],result[layer][b.r][b.c]];
        }
        if(!exposedMoves(result))throw new Error('Visible pair repair failed');
        return result;
      }
    }
    // A tall stack can occasionally leave isolated faces on each floor with
    // no geometrically connectable pair, even after shuffling pictures. Move
    // one existing pair into neighboring free cells of the highest occupied
    // floor. This rare emergency repair preserves every face and floor count.
    const original=copy(result[top]),groups=new Map();
    for(let r=0;r<original.length;r++)for(let c=0;c<original[r].length;c++){
      const face=original[r][c];if(face===EMPTY)continue;
      if(!groups.has(face))groups.set(face,[]);
      groups.get(face).push({r,c});
    }
    for(const [face,donors] of groups){
      if(donors.length<2)continue;
      const [first,second]=donors;
      const movable=(r,c)=>original[r]?.[c]===EMPTY||(r===first.r&&c===first.c)||(r===second.r&&c===second.c);
      for(let r=0;r<original.length;r++)for(let c=0;c<original[r].length;c++){
        if(!movable(r,c))continue;
        for(const [dr,dc] of [[0,1],[1,0]]){
          const nr=r+dr,nc=c+dc;if(!movable(nr,nc))continue;
          result[top]=copy(original);
          result[top][first.r][first.c]=result[top][second.r][second.c]=EMPTY;
          result[top][r][c]=result[top][nr][nc]=face;
          if(visiblePath(result,{layer:top,r,c},{layer:top,r:nr,c:nc}))return result;
        }
      }
    }
    throw new Error('No connectable visible positions');
  }
  const SHAPES=['hourglass','cross','ring','steps','islands','diamond','zigzag','castle'];
  function shapedGrid(rows,cols,needed,variant,random,layer=0,count=1) {
    const cells=[];
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      if(!walkwayOpen(rows,cols,count,layer,r,c))continue;
      let x=(c+.5-cols/2)/(cols/2),y=(r+.5-rows/2)/(rows/2);
      if(variant%2===1)x=-x;
      if(variant%3===2)y=-y;
      let score;
      switch(variant%SHAPES.length){
       case 0: score=1-Math.abs(x)/(.3+.95*Math.abs(y))-.12*Math.abs(y);break; // hourglass
       case 1: score=Math.max(1-2.3*Math.abs(x),1-2.3*Math.abs(y))-.18*(Math.abs(x)+Math.abs(y));break; // cross
       case 2: score=1-1.6*Math.abs(Math.hypot(x,y)-.73);break; // ring and central opening
       case 3: score=1-Math.abs(x-(Math.floor((y+1)*2.5)%4-1.5)*.26)-.25*Math.abs(y);break; // steps
       case 4: score=Math.max(...[[-.6,-.55],[.6,-.5],[-.55,.6],[.55,.55]].map(([a,b])=>1-Math.hypot((x-a)*1.15,(y-b)*1.1)));break; // islands
       case 5: score=1-(Math.abs(x)+Math.abs(y))*.68;break; // diamond
       case 6: score=1-Math.abs(x-Math.sin(y*3.2)*.47)*.9-.12*Math.abs(y);break; // winding path
       default:score=1-Math.max(0,Math.abs(x)-(.4+.3*(Math.floor((y+1)*3)%2)))-.2*Math.abs(y); // castle
      }
      cells.push({r,c,score:score+(random()-.5)*.045});
    }
    cells.sort((a,b)=>b.score-a.score);
    const grid=Array.from({length:rows},()=>Array(cols).fill(EMPTY));
    cells.slice(0,needed).forEach(({r,c})=>{grid[r][c]=0;});
    return grid;
  }
  function generateStack(stage,random=Math.random,columns) {
    const info=stackInfo(stage,columns);
    if(stage<=2)return {grids:[generate(stage,random,info.cols).grid],info};
    const palette=shuffle(Array.from({length:FACE_COUNT},(_,i)=>i),random).slice(0,info.typeCount);
    let offset=0;
    const grids=info.floors.map((floor,i)=>{
      const variant=(stage*3+i*5+Math.floor(random()*SHAPES.length))%SHAPES.length;
      const input=shapedGrid(info.rows,info.cols,floor.total,variant,random,i,info.layerCount);
      const types=mixedValues(palette.slice(offset,offset+floor.typeCount),floor);
      offset+=floor.typeCount;
      return arrange(input,types,random).grid;
    });
    return {grids:recoverVisibleStack(grids,random),info};
  }
  function withinCopyLimit(grid) {
    const counts=new Map();
    for(const value of grid.flat())if(value!==EMPTY){counts.set(value,(counts.get(value)||0)+1);if(counts.get(value)>MAX_COPIES)return false;}
    return [...counts.values()].every(n=>n%2===0);
  }
  const api={EMPTY,MAX_STAGE,MAX_COPIES,MAX_FLOOR_COLS,MAX_FLOOR_ROWS,MAX_FLOOR_CELLS,RULES_VERSION,FACE_COUNT,LAYER_OFFSET,layerShift,SHAPES,stageInfo,layerCount,stackInfo,boardInfo,withinCopyLimit,path,visiblePath,moves,isExposed,exposedMoves,generate,generateStack,reshuffle,recoverVisibleStack,copy};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.TileGarden=api;
})(typeof globalThis!=='undefined'?globalThis:this);

