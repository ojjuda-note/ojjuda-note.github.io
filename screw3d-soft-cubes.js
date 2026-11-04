/* Convex rounded-cube mesh shared by rendering and physical ray tests.
 * The smooth mesh defines the real rounded contact surface. The lower-detail
 * mesh is used only for distant/crowded frames. Both are watertight.
 * Real diagonal screws mount on the 45-degree rounded bevels.
 */
export function createSoftCubeGeometry(halfSide, smooth = true) {
  const h = [halfSide, halfSide, halfSide], radius = halfSide * 0.29;
  const inner = h.map(v => v - radius), divisions = smooth ? 2 : 1;
  const verts = [], faces = [], verticesByKey = new Map();
  const side = (axis, sign) => axis * 2 + (sign > 0 ? 1 : 0);
  const vertex = xyz => {
    const key = xyz.map(v => v.toFixed(8)).join(',');
    if (verticesByKey.has(key)) return verticesByKey.get(key);
    const index = verts.length;
    verts.push(xyz); verticesByKey.set(key, index);
    return index;
  };
  const push = (points, sides, center = false) => {
    let indices = points.map(vertex);
    const A = verts[indices[0]], B = verts[indices[1]], C = verts[indices[2]];
    const ab = B.map((v,i) => v - A[i]), ac = C.map((v,i) => v - A[i]);
    let normal = [
      ab[1]*ac[2] - ab[2]*ac[1],
      ab[2]*ac[0] - ab[0]*ac[2],
      ab[0]*ac[1] - ab[1]*ac[0]
    ];
    const centroid = [0,1,2].map(i => indices.reduce((sum,k) => sum + verts[k][i], 0) / indices.length);
    if (normal.reduce((sum,v,i) => sum + v*centroid[i], 0) < 0) {
      indices = indices.reverse(); normal = normal.map(v => -v);
    }
    const length = Math.hypot(...normal);
    if (length < 1e-10) throw new Error('degenerate rounded cube surface');
    faces.push({idx:indices, n:normal.map(v => v/length), sides, center});
  };
  // Six broad panels. Each surface stays in the cube's original plane so
  // screw heads remain flush with the material, not floating above it.
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1,1]) {
    const other = [0,1,2].filter(a => a !== axis);
    const positions = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v]) => {
      const pt = [0,0,0];
      pt[axis] = sign * h[axis];
      pt[other[0]] = u * inner[other[0]];
      pt[other[1]] = v * inner[other[1]];
      return pt;
    });
    push(positions, [side(axis,sign)], true);
  }
  // 12 softened edges, one or two subdivisions depending on device load.
  const edgePoint = (a,b,sa,sb,otherSign,theta) => {
    const k = 3-a-b, pt = [0,0,0];
    pt[a] = sa*(inner[a]+radius*Math.cos(theta));
    pt[b] = sb*(inner[b]+radius*Math.sin(theta));
    pt[k] = otherSign*inner[k];
    return pt;
  };
  for (let a=0;a<3;a++) for (let b=a+1;b<3;b++)
    for (const sa of [-1,1]) for (const sb of [-1,1]) {
      const sides = [side(a,sa),side(b,sb)];
      for (let t=0;t<divisions;t++) {
        const t0 = t*Math.PI/2/divisions, t1 = (t+1)*Math.PI/2/divisions;
        push([
          edgePoint(a,b,sa,sb,-1,t0),edgePoint(a,b,sa,sb,1,t0),
          edgePoint(a,b,sa,sb,1,t1),edgePoint(a,b,sa,sb,-1,t1)
        ], sides);
      }
    }
  // Eight rounded corners join the curved edge bands without gaps.
  for (const sx of [-1,1]) for (const sy of [-1,1]) for (const sz of [-1,1]) {
    const p = [sx,sy,sz], sides = [side(0,sx),side(1,sy),side(2,sz)];
    const cornerAxis = axis => inner.map((v,i) => p[i]*(v+(i===axis?radius:0)));
    const between = (a,b) => inner.map((v,i) => p[i]*(v+(i===a||i===b?radius/Math.sqrt(2):0)));
    const px=cornerAxis(0),py=cornerAxis(1),pz=cornerAxis(2);
    if (divisions === 1) push([px,py,pz],sides);
    else {
      const pxy=between(0,1),pxz=between(0,2),pyz=between(1,2);
      push([px,pxy,pxz],sides);
      push([py,pyz,pxy],sides);
      push([pz,pxz,pyz],sides);
      push([pxy,pyz,pxz],sides);
    }
  }
  return {verts, faces, half:h, soft:true};
}
