// Shared by the furniture maker and the room renderer. These are authored registrations
// of the original blanket picture's visible folds, never the parent sofa's mesh seams.
const CENTRES={
 left:[300,360,630,730,800,780,730],
 center:[280,330,610,630,660,665,660],
 right:[900,850,620,540,460,460,500]
};
const ROWS=[[0,.38,1.04],[180,.61,.94],[400,1.12,.86],[510,1.44,.82],[1000,1.49,.23],[1150,1.55,.055],[1326,1.75,.025]];
const fail=()=>{throw new RangeError('담요의 접힘 기준점이 올바르지 않습니다.');};

export function getSofaBlanketDrape(direction){
 if(!CENTRES[direction])fail();
 return {kind:'sofa-blanket-drape',version:1,direction,sourceSize:{width:1186,height:1326},referenceDimensions:{width:3.5,depth:1.5,height:1.8},rows:ROWS.map((r,i)=>[...r,CENTRES[direction][i]]),centerU:.81,unitsPerPixel:.00145,surfaceRows:3,columns:8};
}

/** Return a detached, serializable registration. Invalid imports fail closed. */
export function normalizeSofaBlanketDrape(value,sourceSize,direction){
 const v=value,s=v?.sourceSize,r=v?.referenceDimensions;
 if(v?.kind!=='sofa-blanket-drape'||v.version!==1||!CENTRES[v.direction]||direction&&v.direction!==direction)fail();
 if(!s||!['width','height'].every(k=>Number.isInteger(s[k])&&s[k]>0&&s[k]<=8192)||sourceSize&&['width','height'].some(k=>s[k]!==sourceSize[k]))fail();
 if(!r||!['width','depth','height'].every(k=>Number.isFinite(r[k])&&r[k]>0&&r[k]<=7))fail();
 if(!Array.isArray(v.rows)||v.rows.length<3||v.rows.length>64||v.rows.some((row,i)=>!Array.isArray(row)||row.length!==4||!row.every(Number.isFinite)||row[0]<0||row[0]>s.height||i>0&&row[0]<=v.rows[i-1][0]||Math.abs(row[1])>14||Math.abs(row[2])>7||row[3]<0||row[3]>s.width))fail();
 if(v.rows[0][0]!==0||v.rows.at(-1)[0]!==s.height||!Number.isInteger(v.surfaceRows)||v.surfaceRows<1||v.surfaceRows>=v.rows.length-1||!Number.isInteger(v.columns)||v.columns<1||v.columns>32||!Number.isFinite(v.centerU)||Math.abs(v.centerU)>14||!Number.isFinite(v.unitsPerPixel)||v.unitsPerPixel<=0||v.unitsPerPixel>1)fail();
 return {kind:v.kind,version:1,direction:v.direction,sourceSize:{...s},referenceDimensions:{...r},rows:v.rows.map(row=>[...row]),centerU:v.centerU,unitsPerPixel:v.unitsPerPixel,surfaceRows:v.surfaceRows,columns:v.columns};
}

/** Each layer uses blanket-image coordinates and the caller's real roomPoint. */
export function projectSofaBlanketDrape(value,direction,placement,project){
 const r=normalizeSofaBlanketDrape(value,undefined,direction),ref=r.referenceDimensions;
 const p={...placement,width:placement.width??ref.width,depth:placement.depth??ref.depth,height:placement.height??ref.height};
 if(!['x','y','width','depth','height'].every(k=>Number.isFinite(p[k]))||p.width<=0||p.depth<=0||p.height<=0||typeof project!=='function')fail();
 const point=(sourceX,rowIndex)=>{
  const [,depth,height,centre]=r.rows[rowIndex],u=(r.centerU+(sourceX-centre)*r.unitsPerPixel)*p.width/ref.width,v=depth*p.depth/ref.depth;
  const x=direction==='center'?u:direction==='left'?v:p.depth-v;
  const y=direction==='center'?v:direction==='left'?p.width-u:u;
  return project(p.x+x,p.y+y,height*p.height/ref.height);
 };
 const layers={surface:[],front:[]};
 for(let row=0;row<r.rows.length-1;row++)for(let col=0;col<r.columns;col++){
  const x0=r.sourceSize.width*col/r.columns,x1=r.sourceSize.width*(col+1)/r.columns;
  const source=[[x0,r.rows[row][0]],[x1,r.rows[row][0]],[x1,r.rows[row+1][0]],[x0,r.rows[row+1][0]]];
  const target=[point(x0,row),point(x1,row),point(x1,row+1),point(x0,row+1)];
  for(const ids of [[0,1,2],[0,2,3]])layers[row<r.surfaceRows?'surface':'front'].push({source:ids.map(i=>source[i]),target:ids.map(i=>target[i])});
 }
 return layers;
}
