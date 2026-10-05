// Shared seat positions and painter order for the original cushion drawings.
export const SOFA_CUSHION_SEATS={
 'peach-cushion':{u:.63,v:.30,width:.68,height:.69,bottom:.89},
 'cream-floral-cushion':{u:.66,v:.58,width:.78,height:.74,bottom:.81},
 'sage-cushion':{u:1.79,v:.48,width:.76,height:.72,bottom:.81},
 'pink-check-cushion':{u:2.91,v:.49,width:.74,height:.72,bottom:.81}
};

// Cushions sharing one seat are ordered back-to-front on that seat. Across
// seats, the wall-facing direction decides which seat is farther into the room.
// This keeps the small peach cushion behind the floral one in every view.
export function sofaCushionOrder(ids,direction){
 if(!['left','center','right'].includes(direction))throw new RangeError('Unknown sofa direction');
 return [...ids].sort((first,second)=>{
  const a=SOFA_CUSHION_SEATS[first],b=SOFA_CUSHION_SEATS[second];
  if(!a||!b)return 0;
  const sameSeat=Math.abs(a.u-b.u)<(a.width+b.width)/2;
  if(direction==='center'||sameSeat)return a.v-b.v;
  return direction==='left'?b.u-a.u:a.u-b.u;
 });
}
