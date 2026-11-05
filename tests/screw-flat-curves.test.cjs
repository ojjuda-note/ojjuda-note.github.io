const assert=require('node:assert/strict');
const Matter=require('../vendor/matter-0.20.0.min.js');
const P=require('../screw-flat-physics.js');
const types=new Set(),counts=new Map();
const pointKey=p=>p.x.toFixed(5)+','+p.y.toFixed(5);
function edges(plate){
  const world=plate.contour.map(q=>P.worldPoint(plate,q));
  return world.map((a,i)=>({a,b:world[(i+1)%world.length]}));
}
for(let stage=1;stage<=1000;stage++){
  const level=P.makeFlatLevel(stage),pairs=new Map();
  let area=0;
  for(const p of level.plates){
    area+=Matter.Vertices.area(p.contour);
    for(const mount of p.mounts)assert.ok(P.polygonDistance(p.contour,mount.x,mount.y)<0,'every screw is on its sheet');
    const perimeter=edges(p);
    for(const seam of p.seams){
      if(!pairs.has(seam.id))pairs.set(seam.id,[]);
      pairs.get(seam.id).push({p,seam,perimeter});
    }
  }
  const silhouette=level.silhouette.reduce((sum,poly)=>sum+Matter.Vertices.area(poly),0);
  assert.ok(Math.abs(area-silhouette)<.05,`stage ${stage}: sheets cover the original picture without missing or extra area`);
  if(stage>1)assert.ok(pairs.size>0,`stage ${stage}: at least one pair has a shaped seam`);
  for(const [id,pair] of pairs){
    assert.equal(pair.length,2,'one toolpath cuts two neighbours');
    const [a,b]=pair, {type,cx,cy,extent}=a.seam;
    assert.equal(type,b.seam.type);types.add(type);counts.set(type,(counts.get(type)||0)+1);
    const near=q=>Math.hypot(q.x-cx,q.y-cy)<extent*1.55+1e-4;
    const other=new Set(b.perimeter.map(({a,b})=>[pointKey(a),pointKey(b)].sort().join('|')));
    const shared=a.perimeter.filter(e=>near(e.a)&&near(e.b)&&other.has([pointKey(e.a),pointKey(e.b)].sort().join('|')));
    const segments={round:16,oval:16,wave:12,square:3,triangle:2}[type];
    assert.ok(shared.length>=segments,`stage ${stage} seam ${id}: the full ${type} cut fits both plates`);
    // The very same side of a cut is metal on one sheet and air on the other.
    const e=shared[Math.floor(shared.length/2)],dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,length=Math.hypot(dx,dy);
    const x=(e.a.x+e.b.x)/2,y=(e.a.y+e.b.y)/2;
    for(const sign of [-1,1]){
      const qx=x-sign*dy/length*.04,qy=y+sign*dx/length*.04;
      assert.notEqual(P.plateCovers(a.p,qx,qy),P.plateCovers(b.p,qx,qy),`stage ${stage}, seam ${id}: complementary tool access`);
    }
  }
}
assert.deepEqual([...types].sort(),['oval','round','square','triangle','wave']);
console.log('PASS: 1000 assembled silhouettes, seated mounts and matching physical cut edges.',Object.fromEntries(counts));
