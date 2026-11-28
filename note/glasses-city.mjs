import polygons from './glasses-city-data.mjs';

function inRing(x,y,ring) {
  let inside=false;
  for(let i=0,j=ring.length-2;i<ring.length;j=i,i+=2) {
    const ax=ring[i],ay=ring[i+1],bx=ring[j],by=ring[j+1];
    if((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
  }
  return inside;
}

export function cityAt(latitude,longitude) {
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return '';
  const x=longitude*10000,y=latitude*10000;
  for(const [name,[west,south,east,north],rings] of polygons) {
    if(x<west||x>east||y<south||y>north)continue;
    if(inRing(x,y,rings[0]) && !rings.slice(1).some(hole=>inRing(x,y,hole)))return name;
  }
  return '';
}
