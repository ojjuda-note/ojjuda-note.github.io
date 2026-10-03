// Measured on the approved, unmodified chair PNGs. The endpoints follow the
// visible wooden legs; the existing mesh still owns their room coordinates.
const regions={
 left:[[[278,930],[188,1400],49],[[461,985],[375,1592],53],[[621,974],[643,1332],40],[[782,947],[860,1532],50]],
 center:[[[464,696],[440,975],29],[[822,696],[845,975],29],[[400,686],[309,1184],43],[[880,686],[963,1184],43]],
 right:[[[385,966],[352,1305],39],[[173,933],[96,1460],49],[[729,920],[826,1405],48],[[501,986],[580,1599],53]]
};
// The back panel uses its own top and seat-back corners. A seat-front anchor
// must not make a diagonal through the back posts. Only triangle connectivity
// changes: all measured source pixels and world/contact anchors stay unchanged.
const panels={"left":{"remove":[[0,1,2],[2,1,4],[3,2,4]],"add":[[0,1,3],[0,3,2],[1,4,3]]},"right":{"remove":[[1,0,4],[2,1,4],[2,4,5]],"add":[[1,0,5],[0,4,5],[1,5,2]]}};
// One leg at a time: the near rear leg in the left picture runs from seat
// anchor 3 to foot 7. The old edge 6--8 crossed its shaft and created a knee.
// Flip just that diagonal; source coverage and all registered points stay put.
const leftRearLeg={remove:[[6,3,8],[7,6,8]],add:[[3,7,6],[3,8,7]]};
function repairMesh(mesh,direction){
 for(const panel of [panels[direction],direction==='left'?leftRearLeg:null]){
  if(panel&&panel.remove.every(q=>mesh.indices.some(t=>q.every(i=>t.includes(i)))))mesh.indices=[...mesh.indices.filter(t=>!panel.remove.some(q=>q.every(i=>t.includes(i)))),...panel.add.map(t=>[...t])];
 }
 mesh.straightRegions??=regions[direction].map(([a,b,radius])=>({start:{x:a[0],y:a[1]},end:{x:b[0],y:b[1]},radius,feather:radius*1.5}));
 // Fade the left near-front shaft correction into its fixed foot. An abrupt
 // end pulled the thin tip triangles across that foot and halved the entire
 // correction. Preserve any separately authored region or fade setting.
 const front=mesh.straightRegions[3];
 if(direction==='left'&&front?.start.x===782&&front.start.y===947&&front.end.x===860&&front.end.y===1532&&front.radius===50&&front.feather===75)front.endFade??=120;
 return mesh;
}
export function straightenChairLegs(runtime){
 for(const direction of Object.keys(regions))repairMesh(runtime.views[direction].mesh,direction);
 return runtime;
}

const originals={"left":{"sourceSha256":["874258558ed90c63f8c2710a73170f53dc6705ee4ff21f976aca0c395b42f9b3","1f77346c6b253b1e7629003e4d60fa93514bc1a0b24ababed120c34573032d7d"],"geometrySha256":["5d2c3aa88d60f838b0a806be2fc6cf6d125def3d1bac90824cfde1f83c341221","29c97d2306210149d9f973b135cd5ea960770d80405e9cd328e53894fc33b96b","3456a8dfc541cf15f42ba1597b786d386eeb4bc2bdb674198171308dc1f78f2f"]},"center":{"sourceSha256":["ec5bee57b8b4015474cd4e074acab9e08eaff2320334539f1fa486ff70f9328e","bac7dfe6c401e01d59d9dcaa8a0a7891a752af6ee4843983badc77ae7ebf5400"],"geometrySha256":["04a5fa56b52ca3e9e7111e502e45ae3421f2e48dc44caca1c0259866665637ab","04a5fa56b52ca3e9e7111e502e45ae3421f2e48dc44caca1c0259866665637ab"]},"right":{"sourceSha256":["48285dec98232e15a2c0b10c0e39191cfcdf4bed65bf1c121e16953dba0f6943","b09e53d69683cd85964a524b9930e09b276bdb59dcfb1ad6ec163788bd348219"],"geometrySha256":["2f5b8ff54bb783b374e63dc5bfc98956bc83882b6362eab5aed7fe6b7eb1dd03","bdb3d74ae129cfb739643d4fa9921ad6866141d20d3ec406079fda4f88121cb2"]}};
const canonical=mesh=>JSON.stringify([mesh.anchors.map(a=>[a.source.x,a.source.y,a.world.x,a.world.y,a.world.z,a.kind||'physical']),mesh.indices.map(t=>[...t].sort((a,b)=>a-b)).sort((a,b)=>a.join(',').localeCompare(b.join(','))),mesh.referenceDimensions]);
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const imageHashes=new Map();
/** Upgrade only the exact approved picture AND its unchanged registration.
 * Edited geometry, unrelated pictures and filenames are never used as evidence.
 * The same correction therefore survives studio reopen/save/apply without
 * replacing an owner's own work or changing its position or dimensions.
 */
export async function recoverKnownChairProject(project){
 const known=originals[project?.placement?.direction],data=project?.source?.data,mesh=project?.mesh;
 if(!known||!mesh||!Array.isArray(mesh.anchors)||!Array.isArray(mesh.indices)||typeof data!=='string'||!data.startsWith('data:image/png;base64,')||!globalThis.crypto?.subtle)return project;
 let geometry;try{geometry=canonical(mesh);}catch{return project;}
 if(!known.geometrySha256.includes(await digest(new TextEncoder().encode(geometry))))return project;
 if(!imageHashes.has(data)){
  if(imageHashes.size>=6)imageHashes.delete(imageHashes.keys().next().value);
  imageHashes.set(data,digest(Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0))));
 }
 if(!known.sourceSha256.includes(await imageHashes.get(data)))return project;
 const repaired=JSON.parse(JSON.stringify(project));repairMesh(repaired.mesh,repaired.placement.direction);return repaired;
}
