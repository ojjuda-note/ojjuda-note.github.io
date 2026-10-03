// Measured on the approved, unmodified chair PNGs. The endpoints follow the
// visible wooden legs; the existing mesh still owns their room coordinates.
const regions={
 left:[[[278,930],[188,1400],49],[[461,985],[375,1592],53],[[621,974],[643,1332],40],[[782,947],[860,1532],50]],
 center:[[[464,696],[440,975],29],[[822,696],[845,975],29],[[400,686],[309,1184],43],[[880,686],[963,1184],43]],
 right:[[[385,966],[352,1305],39],[[173,933],[96,1460],49],[[729,920],[826,1405],48],[[501,986],[580,1599],53]]
};
export function straightenChairLegs(runtime){
 for(const [direction,lines]of Object.entries(regions)){
  runtime.views[direction].mesh.straightRegions=lines.map(([a,b,radius])=>({
   start:{x:a[0],y:a[1]},end:{x:b[0],y:b[1]},radius,feather:radius*1.5
  }));
 }
 return runtime;
}
