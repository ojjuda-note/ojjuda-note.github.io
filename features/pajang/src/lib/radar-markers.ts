import {radarPosition, type RadarBand} from './radar';

export const radarBands = [
  {limit:1, ring:100, radius:76},
  {limit:3, ring:128, radius:113},
  {limit:7, ring:157, radius:143},
  {limit:15, ring:186, radius:166},
] as const;

type Peer = {id:string; range:RadarBand; bearing?:number; sameCell?:boolean};
type Point = {x:number; y:number};
type Marker<T> = Point & {person:T; anchor?:Point};

// Display coordinates only: reserve a 64 × 72 box around each circular marker.
// The twelve slots fit the existing maximum of three people per distance band.
const slots:Point[] = [
  {x:148,y:160},{x:252,y:240},{x:148,y:240},{x:252,y:160},
  {x:68,y:160},{x:332,y:160},{x:68,y:240},{x:332,y:240},
  {x:148,y:82},{x:252,y:82},{x:148,y:318},{x:252,y:318},
];
const inside = ({x,y}:Point) => Math.hypot(Math.abs(x-200)+32,Math.abs(y-200)+36)<=196;
const candidates:Point[] = [];
for(let y=40;y<=360;y+=8)for(let x=40;x<=360;x+=8){
  const point={x,y};
  if(inside(point))candidates.push(point);
}
const distance = (a:Point,b:Point) => (a.x-b.x)**2+(a.y-b.y)**2;
function fits(point:Point,placed:Point[]) {
  return inside(point)
    && !(Math.abs(point.x-200)<52&&Math.abs(point.y-200)<56)
    && placed.every(other=>Math.abs(point.x-other.x)>=72||Math.abs(point.y-other.y)>=78);
}
function anchorFor(person:Peer,heading:number):Point {
  const radius=radarBands.find(b=>b.limit===person.range)!.radius;
  const point=radarPosition(person.bearing!,heading,radius);
  return {x:point.x*4,y:point.y*4};
}
function percentages<T>(markers:Marker<T>[]):Marker<T>[] {
  return markers.map(marker=>({...marker,x:marker.x/4,y:marker.y/4,
    anchor:marker.anchor?{x:marker.anchor.x/4,y:marker.anchor.y/4}:undefined}));
}

export function radarMarkers<T extends Peer>(people:T[],heading:number):Marker<T>[] {
  const same=people.filter(p=>p.sameCell===true&&p.bearing===undefined);
  const directional=people.filter(p=>p.bearing!==undefined);
  function finish(placed:Marker<T>[]) {
    // Expanded labels stay still instead of swapping sides with compass noise.
    // Their connecting anchors continue to show the current approximate direction.
    const expanded=same.length>0||placed.some(marker=>marker.anchor&&distance(marker,marker.anchor)>.01);
    return percentages(placed.map(marker=>{
      if(!marker.anchor)return marker;
      const anchor=anchorFor(marker.person,heading);
      return {...marker,...(!expanded?anchor:{}),anchor};
    }));
  }
  function packed() {
    const free=slots.slice();
    const placed:Marker<T>[]=same.map(person=>({person,...free.shift()!}));
    for(const person of directional){
      const anchor=anchorFor(person,0);
      const best=free.reduce((index,p,i)=>distance(p,anchor)<distance(free[index],anchor)?i:index,0);
      placed.push({person,anchor,...free.splice(best,1)[0]});
    }
    return finish(placed);
  }
  // A fixed set of slots keeps every person visible on a crowded mobile dial.
  if(same.length>3||same.length+directional.length>5)return packed();
  const near=same.length===3?[{x:200,y:116},{x:128,y:248},{x:272,y:248}]:[{x:120,y:200},{x:280,y:200}];
  const placed:Marker<T>[]=same.map((person,i)=>({person,...near[i]}));
  for(const person of directional){
    const anchor=anchorFor(person,0);
    const free=[anchor,...candidates].filter(point=>fits(point,placed));
    if(!free.length)return packed();
    const point=free.reduce((best,p)=>distance(p,anchor)<distance(best,anchor)?p:best);
    placed.push({person,anchor,...point});
  }
  // Same-cell positions stay fixed when the compass turns. No bearing is invented.
  return finish(placed);
}
