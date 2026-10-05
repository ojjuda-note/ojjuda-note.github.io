// Four measured picture corners -> four room-guide corners. Canvas 2D only.
// Points may be {x,y} objects or [x,y] tuples and must follow the outline.
const xy = point => Array.isArray(point) ? {x:point[0],y:point[1]} : point;
const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);

export function validQuad(points) {
  if (!Array.isArray(points) || points.length !== 4) return false;
  const q = points.map(xy);
  if (!q.every(finitePoint)) return false;
  const extent = Math.max(...q.map(p=>p.x))-Math.min(...q.map(p=>p.x));
  const height = Math.max(...q.map(p=>p.y))-Math.min(...q.map(p=>p.y));
  const tolerance = Math.max(1,extent,height)**2*1e-12;
  const turns = q.map((p,i)=>cross(p,q[(i+1)%4],q[(i+2)%4]));
  if (!turns.every(v=>v>tolerance) && !turns.every(v=>v<-tolerance)) return false;
  return Math.abs(cross(q[0],q[1],q[2])+cross(q[0],q[2],q[3]))/2 > 1;
}

function multiply(a,b) {
  return Array.from({length:9},(_,i)=>{
    const row=Math.floor(i/3),col=i%3;
    return a[row*3]*b[col]+a[row*3+1]*b[3+col]+a[row*3+2]*b[6+col];
  });
}

function normalize(points) {
  const x=points.reduce((sum,p)=>sum+p.x,0)/4;
  const y=points.reduce((sum,p)=>sum+p.y,0)/4;
  const scale=Math.SQRT2/(points.reduce((sum,p)=>sum+Math.hypot(p.x-x,p.y-y),0)/4);
  return {
    points:points.map(p=>({x:(p.x-x)*scale,y:(p.y-y)*scale})),
    matrix:[scale,0,-x*scale,0,scale,-y*scale,0,0,1],
    inverse:[1/scale,0,x,0,1/scale,y,0,0,1]
  };
}

function solve(rows) {
  for (let col=0;col<8;col++) {
    let pivot=col;
    for (let row=col+1;row<8;row++) if (Math.abs(rows[row][col])>Math.abs(rows[pivot][col])) pivot=row;
    [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
    const divisor=rows[col][col];
    if (!Number.isFinite(divisor) || Math.abs(divisor)<1e-12) return null;
    for (let j=col;j<=8;j++) rows[col][j]/=divisor;
    for (let row=0;row<8;row++) if (row!==col) {
      const factor=rows[row][col];
      for (let j=col;j<=8;j++) rows[row][j]-=factor*rows[col][j];
    }
  }
  return [...rows.map(row=>row[8]),1];
}

export function project(H,point) {
  const p=xy(point);
  if (!H || H.length!==8 || !finitePoint(p)) return {x:NaN,y:NaN};
  const denominator=H[6]*p.x+H[7]*p.y+1;
  if (!Number.isFinite(denominator) || Math.abs(denominator)<1e-12) return {x:NaN,y:NaN};
  return {x:(H[0]*p.x+H[1]*p.y+H[2])/denominator,y:(H[3]*p.x+H[4]*p.y+H[5])/denominator};
}

export function homography(src4,dst4) {
  if (!validQuad(src4) || !validQuad(dst4)) return null;
  const source=src4.map(xy),target=dst4.map(xy);
  const a=normalize(source),b=normalize(target),rows=[];
  a.points.forEach(({x,y},i)=>{
    const {x:u,y:v}=b.points[i];
    rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);
  });
  const normalized=solve(rows);
  if (!normalized) return null;
  const matrix=multiply(multiply(b.inverse,normalized),a.matrix);
  if (Math.abs(matrix[8])<1e-12) return null;
  const H=matrix.slice(0,8).map(value=>value/matrix[8]);
  if (!H.every(Number.isFinite)) return null;
  // A horizon crossing the selected face cannot be painted as one finite face.
  const denominators=source.map(p=>H[6]*p.x+H[7]*p.y+1);
  if (!denominators.every(v=>v>1e-12) && !denominators.every(v=>v<-1e-12)) return null;
  return H;
}

function outline(ctx,points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x,points[0].y);
  for (let i=1;i<points.length;i++) ctx.lineTo(points[i].x,points[i].y);
  ctx.closePath();
}

function triangleTransform(source,target) {
  const [p,q,r]=source,[a,b,c]=target;
  const x1=q.x-p.x,y1=q.y-p.y,x2=r.x-p.x,y2=r.y-p.y;
  const det=x1*y2-x2*y1;
  if (!Number.isFinite(det) || Math.abs(det)<1e-14) return null;
  const ux=b.x-a.x,uy=b.y-a.y,vx=c.x-a.x,vy=c.y-a.y;
  const m0=(ux*y2-vx*y1)/det,m2=(vx*x1-ux*x2)/det;
  const m1=(uy*y2-vy*y1)/det,m3=(vy*x1-uy*x2)/det;
  const m=[m0,m1,m2,m3,a.x-m0*p.x-m2*p.y,a.y-m1*p.x-m3*p.y];
  return m.every(Number.isFinite)?m:null;
}

const buffers=new WeakMap();
function isolatedBuffer(ctx,target) {
  // Add premultiplied edge coverage in an isolated transparent layer. Drawing
  // adjacent antialiased triangles straight onto the room would leave seams.
  const transform=ctx.getTransform?.();
  const scale=transform?Math.min(4,Math.max(1,Math.hypot(transform.a,transform.b),Math.hypot(transform.c,transform.d))):1;
  const left=Math.floor(Math.min(...target.map(p=>p.x)))-1;
  const top=Math.floor(Math.min(...target.map(p=>p.y)))-1;
  const width=Math.ceil((Math.max(...target.map(p=>p.x))-left+1)*scale);
  const height=Math.ceil((Math.max(...target.map(p=>p.y))-top+1)*scale);
  if (width>16384||height>16384||width*height>32000000) return null;
  let canvas=buffers.get(ctx);
  if (!canvas) {
    if (typeof OffscreenCanvas!=='undefined') canvas=new OffscreenCanvas(width,height);
    else if (ctx.canvas?.ownerDocument) canvas=ctx.canvas.ownerDocument.createElement('canvas');
    else return null;
    buffers.set(ctx,canvas);
  }
  // Setting dimensions also clears the previous frame and resets context state.
  canvas.width=width;canvas.height=height;
  const painter=canvas.getContext('2d');
  if (!painter) return null;
  painter.setTransform(scale,0,0,scale,-left*scale,-top*scale);
  painter.globalCompositeOperation='lighter';
  return {canvas,painter,left,top,width:width/scale,height:height/scale};
}

export function drawWarp(ctx,image,src4,dst4,{steps=16}={}) {
  const H=homography(src4,dst4);
  const width=image&&(image.naturalWidth||image.videoWidth||image.width);
  const height=image&&(image.naturalHeight||image.videoHeight||image.height);
  if (!H || !ctx || !Number.isFinite(width) || !Number.isFinite(height) || width<=0 || height<=0) return false;
  if ('complete' in image && !image.complete) return false;
  const source=src4.map(xy),target=dst4.map(xy);
  const n=Number.isFinite(steps)?Math.max(1,Math.min(64,Math.round(steps))):16;
  const grid=[];
  for (let row=0;row<=n;row++) for (let col=0;col<=n;col++) {
    const u=col/n,v=row/n;
    const point={
      x:(1-v)*((1-u)*source[0].x+u*source[1].x)+v*((1-u)*source[3].x+u*source[2].x),
      y:(1-v)*((1-u)*source[0].y+u*source[1].y)+v*((1-u)*source[3].y+u*source[2].y)
    };
    const mapped=project(H,point);
    if (!finitePoint(mapped)) return false;
    grid.push({source:point,target:mapped});
  }
  // Build the complete mesh before touching the canvas, so bad points cannot
  // leave a partly painted result. There are no opaque fills or alpha changes.
  const triangles=[];
  for (let row=0;row<n;row++) for (let col=0;col<n;col++) {
    const i=row*(n+1)+col;
    for (const ids of [[i,i+1,i+n+2],[i,i+n+2,i+n+1]]) {
      const s=ids.map(index=>grid[index].source),d=ids.map(index=>grid[index].target);
      const matrix=triangleTransform(s,d);
      if (!matrix) return false;
      triangles.push({source:s,target:d,matrix});
    }
  }
  const buffer=isolatedBuffer(ctx,target);
  const painter=buffer?.painter||ctx;
  painter.save();
  try {
    if (!buffer) {outline(painter,target);painter.clip();}
    for (const triangle of triangles) {
      painter.save();
      try {
        outline(painter,triangle.target);
        painter.clip();
        painter.transform(...triangle.matrix);
        // This additional source-space clip explicitly excludes pixels beyond
        // the selected picture quad, even when the file includes other objects.
        outline(painter,source);
        painter.clip();
        painter.drawImage(image,0,0);
      } finally {
        painter.restore();
      }
    }
  } catch {
    return false;
  } finally {
    painter.restore();
  }
  if (buffer) {
    ctx.save();
    try {
      outline(ctx,target);ctx.clip();
      ctx.drawImage(buffer.canvas,buffer.left,buffer.top,buffer.width,buffer.height);
    } catch {
      return false;
    } finally {
      ctx.restore();
    }
  }
  return true;
}
