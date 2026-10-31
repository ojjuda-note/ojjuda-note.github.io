// The chip top, bottom and twenty edge panels form an extruded CSS cylinder.
// Its elevation is real translateZ, shared by the table's fixed perspective.
export function addChipDepth(element){
  element.classList.add('physical-chip');
  const bottom=document.createElement('i');bottom.className='chip-bottom';bottom.setAttribute('aria-hidden','true');element.append(bottom);
  for(let side=0;side<20;side++){
    const edge=document.createElement('i');edge.className='chip-side';edge.setAttribute('aria-hidden','true');edge.style.setProperty('--side',side);element.append(edge);
  }
  return element;
}
