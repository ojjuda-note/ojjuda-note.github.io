(function (root) {
  'use strict';
  const EMPTY = -1;
  const MAX_STAGE = 15, MAX_COPIES = 4, RULES_VERSION = 3, FACE_COUNT = 350;
  const stageInfo = stage => {
    if(!Number.isInteger(stage)||stage<1||stage>MAX_STAGE)throw new RangeError('Stage must be 1–15');
    return {stage,size:stage*2,total:4*stage*stage,typeCount:stage===1?2:stage*stage};
  };
  const same = (a, b) => a.r === b.r && a.c === b.c;
  const copy = grid => grid.map(row => row.slice());

  function path(grid, a, b) {
    const n = grid.length;
    if (!a || !b || same(a, b) || !grid[a.r] || !grid[b.r] || grid[a.r][a.c] === EMPTY || grid[b.r][b.c] === EMPTY) return null;
    const open = p => same(p, a) || same(p, b) || p.r < 0 || p.c < 0 || p.r >= n || p.c >= n || grid[p.r][p.c] === EMPTY;
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
    for (let r = -1; r <= n; r++) options.push([a,{r,c:a.c},{r,c:b.c},b]);
    for (let c = -1; c <= n; c++) options.push([a,{r:a.r,c},{r:b.r,c},b]);
    let best = null, bestScore = Infinity;
    for (const candidate of options) {
      if (!candidate.slice(1).every((p,i) => line(candidate[i],p))) continue;
      const p = clean(candidate);
      const length = p.slice(1).reduce((sum,x,i) => sum + Math.abs(x.r-p[i].r) + Math.abs(x.c-p[i].c),0);
      const score = p.length * (n * 4 + 4) + length;
      if (score < bestScore) { best = p; bestScore = score; }
    }
    return best;
  }

  function moves(grid) {
    const groups = new Map();
    for (let r=0;r<grid.length;r++) for (let c=0;c<grid.length;c++) {
      const value = grid[r][c];
      if (value !== EMPTY) { if (!groups.has(value)) groups.set(value,[]); groups.get(value).push({r,c}); }
    }
    for (const cells of groups.values()) for (let i=0;i<cells.length;i++) for (let j=i+1;j<cells.length;j++) {
      const route = path(grid,cells[i],cells[j]);
      if (route) return {a:cells[i],b:cells[j],path:route};
    }
    return null;
  }

  function shuffle(values, random = Math.random) {
    for (let i=values.length-1;i>0;i--) { const j = Math.floor(random()*(i+1)); [values[i],values[j]]=[values[j],values[i]]; }
    return values;
  }

  function hasClump(grid) {
    const n=grid.length;
    for(let r=0;r<n;r++)for(let c=0;c<n;c++){
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
    for(let r=0;r<input.length;r++)for(let c=0;c<input.length;c++)if(input[r][c]!==EMPTY)cells.push({r,c});
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

  function generate(stage, random = Math.random) {
    const {size:n,typeCount}=stageInfo(stage);
    const palette=stage<=3?Array.from({length:typeCount},(_,i)=>i):shuffle(Array.from({length:FACE_COUNT},(_,i)=>i),random).slice(0,typeCount);
    const types=Array.from({length:n*n},(_,i)=>palette[i%typeCount]);
    return arrange(Array.from({length:n},()=>Array(n).fill(0)),types,random);
  }
  function reshuffle(grid, random = Math.random) {
    const counts=new Map();grid.flat().forEach(v=>{if(v!==EMPTY) counts.set(v,(counts.get(v)||0)+1);});
    const types=[];
    for(const [type,count] of counts) {if(count%2) throw new Error('Unpaired tile');for(let i=0;i<count;i++) types.push(type);}
    return arrange(grid,types,random);
  }
  function withinCopyLimit(grid) {
    const counts=new Map();
    for(const value of grid.flat())if(value!==EMPTY){counts.set(value,(counts.get(value)||0)+1);if(counts.get(value)>MAX_COPIES)return false;}
    return [...counts.values()].every(n=>n%2===0);
  }
  const api={EMPTY,MAX_STAGE,MAX_COPIES,RULES_VERSION,FACE_COUNT,stageInfo,withinCopyLimit,path,moves,generate,reshuffle,copy};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.TileGarden=api;
})(typeof globalThis!=='undefined'?globalThis:this);
