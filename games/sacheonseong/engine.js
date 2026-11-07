(function (root) {
  'use strict';
  const EMPTY = -1;
  const MAX_STAGE = 200, MAX_COPIES = 4, RULES_VERSION = 5, FACE_COUNT = 350;
  // Each upper tile sits across the four tile centers directly below it.
  const LAYER_OFFSET = .5;
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
    stageInfo(stage);
    return stage<6?1:stage<11?2:stage<16?3:stage<26?4:stage<41?5:stage<71?6:stage<111?7:8;
  };
  // Each layer keeps its own outline and pairs. A lower tile can be selected
  // whenever none of the still-present upper tiles overlaps its face.
  function stackInfo(stage, columns) {
    const base=stageInfo(stage),count=layerCount(stage);
    if(stage<=2){const info=boardInfo(stage,columns??base.size);return {...info,layerCount:1,floors:[{total:info.total,...mixPlan(info.total)}]};}
    // Alternate top-heavy and bottom-heavy stacks, rather than imposing a
    // fixed number of tiles per floor. Each share remains a whole pair.
    const weights=Array.from({length:count},(_,i)=>1+.28*Math.sin(stage*1.7+i*2.6)+.2*Math.cos(stage*.53-i*.83));
    const totalWeight=weights.reduce((a,b)=>a+b,0),pairTotal=base.total/2;
    const shares=weights.map(weight=>pairTotal*weight/totalWeight),pairs=shares.map(Math.floor);
    const extraPairs=pairTotal-pairs.reduce((a,b)=>a+b,0);
    const order=shares.map((share,i)=>({i,fraction:share-pairs[i]})).sort((a,b)=>b.fraction-a.fraction||a.i-b.i);
    for(let i=0;i<extraPairs;i++)pairs[order[i].i]++;
    const targets=pairs.map(value=>value*2);
    const biggest=Math.max(...targets),cols=columns??Math.ceil(Math.sqrt(biggest/.66));
    if(!Number.isInteger(cols)||cols<2||cols>base.total)throw new RangeError('Invalid stack columns');
    const rows=Math.max(3,Math.ceil(biggest/(cols*.66)));
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

  function path(grid, a, b) {
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
      const grid=grids[above],shift=(layer-above)*LAYER_OFFSET;
      const centerR=r+shift,centerC=c+shift;
      for(let ar=Math.floor(centerR);ar<=Math.ceil(centerR);ar++){
        for(let ac=Math.floor(centerC);ac<=Math.ceil(centerC);ac++){
          if(Math.abs(ar-centerR)<1&&Math.abs(ac-centerC)<1&&grid[ar]?.[ac]!==undefined&&grid[ar][ac]!==EMPTY)return false;
        }
      }
    }
    return true;
  }

  function exposedMoves(grids) {
    for(let layer=0;layer<grids.length;layer++){
      const grid=grids[layer],groups=new Map();
      for(let r=0;r<grid.length;r++)for(let c=0;c<grid[r].length;c++){
        const value=grid[r][c];
        if(value===EMPTY||!isExposed(grids,{layer,r,c}))continue;
        if(!groups.has(value))groups.set(value,[]);
        groups.get(value).push({layer,r,c});
      }
      for(const cells of groups.values())for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){
        const route=path(grid,cells[i],cells[j]);
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
  const SHAPES=['hourglass','cross','ring','steps','islands','diamond','zigzag','castle'];
  function shapedGrid(rows,cols,needed,variant,random) {
    const cells=[];
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
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
      const input=shapedGrid(info.rows,info.cols,floor.total,variant,random);
      const types=mixedValues(palette.slice(offset,offset+floor.typeCount),floor);
      offset+=floor.typeCount;
      return arrange(input,types,random).grid;
    });
    return {grids,info};
  }
  function withinCopyLimit(grid) {
    const counts=new Map();
    for(const value of grid.flat())if(value!==EMPTY){counts.set(value,(counts.get(value)||0)+1);if(counts.get(value)>MAX_COPIES)return false;}
    return [...counts.values()].every(n=>n%2===0);
  }
  const api={EMPTY,MAX_STAGE,MAX_COPIES,RULES_VERSION,FACE_COUNT,LAYER_OFFSET,SHAPES,stageInfo,layerCount,stackInfo,boardInfo,withinCopyLimit,path,moves,isExposed,exposedMoves,generate,generateStack,reshuffle,copy};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.TileGarden=api;
})(typeof globalThis!=='undefined'?globalThis:this);
