// Rectangles use viewport coordinates, so zoom and scrolling need no correction.
export function overlappingTarget(dragged, candidates) {
  let best=null, bestArea=-1, bestDistance=Infinity;
  for (const candidate of candidates) {
    const r=candidate.rect;
    const width=Math.min(dragged.right,r.right)-Math.max(dragged.left,r.left);
    const height=Math.min(dragged.bottom,r.bottom)-Math.max(dragged.top,r.top);
    if(width<0 || height<0)continue;
    const area=width*height;
    const distance=Math.hypot((dragged.left+dragged.right-r.left-r.right)/2,(dragged.top+dragged.bottom-r.top-r.bottom)/2);
    if(area>bestArea || (area===bestArea && distance<bestDistance)) {
      best=candidate;bestArea=area;bestDistance=distance;
    }
  }
  return best;
}
