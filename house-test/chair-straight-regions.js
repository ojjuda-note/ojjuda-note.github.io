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
function repairMesh(mesh,direction){
 const panel=panels[direction];
 if(panel&&panel.remove.every(q=>mesh.indices.some(t=>q.every(i=>t.includes(i)))))mesh.indices=[...mesh.indices.filter(t=>!panel.remove.some(q=>q.every(i=>t.includes(i)))),...panel.add.map(t=>[...t])];
 mesh.straightRegions??=regions[direction].map(([a,b,radius])=>({start:{x:a[0],y:a[1]},end:{x:b[0],y:b[1]},radius,feather:radius*1.5}));
 return mesh;
}
export function straightenChairLegs(runtime){
 for(const direction of Object.keys(regions))repairMesh(runtime.views[direction].mesh,direction);
 return runtime;
}

const originals={"left":{"sourceSha256":"874258558ed90c63f8c2710a73170f53dc6705ee4ff21f976aca0c395b42f9b3","geometrySha256":["5d2c3aa88d60f838b0a806be2fc6cf6d125def3d1bac90824cfde1f83c341221","29c97d2306210149d9f973b135cd5ea960770d80405e9cd328e53894fc33b96b"]},"center":{"sourceSha256":"ec5bee57b8b4015474cd4e074acab9e08eaff2320334539f1fa486ff70f9328e","geometrySha256":["04a5fa56b52ca3e9e7111e502e45ae3421f2e48dc44caca1c0259866665637ab","04a5fa56b52ca3e9e7111e502e45ae3421f2e48dc44caca1c0259866665637ab"]},"right":{"sourceSha256":"48285dec98232e15a2c0b10c0e39191cfcdf4bed65bf1c121e16953dba0f6943","geometrySha256":["2f5b8ff54bb783b374e63dc5bfc98956bc83882b6362eab5aed7fe6b7eb1dd03","bdb3d74ae129cfb739643d4fa9921ad6866141d20d3ec406079fda4f88121cb2"]}};
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
 if(await imageHashes.get(data)!==known.sourceSha256)return project;
 const repaired=JSON.parse(JSON.stringify(project));repairMesh(repaired.mesh,repaired.placement.direction);return repaired;
}
