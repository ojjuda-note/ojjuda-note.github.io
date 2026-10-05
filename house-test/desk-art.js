import {DESK_V7} from './desk-v7-registration.js?v=20261005-sofalegs3';
import {registeredArtwork} from './registered-artwork.js?v=20261005-sofalegs3';

// Each direction is a separate finished picture from the furniture maker.
// Movement remaps its registered wood regions with the actual room projection.
export function deskArtwork(item,placement,contact,size){
 const registration=DESK_V7[placement.direction];
 if(!registration)throw new RangeError('Unknown desk picture direction');
 return registeredArtwork(registration,placement,contact,size);
}
// Keep the near end of the approved desk picture in front of a tucked chair.
// Source pixels and registration remain unchanged; no new surfaces are drawn.
export function deskChairForeground(placement,contact,size){
 const parts={right:['solid-end-panel','solid-end-bevel','top-side-lip'],left:['left-pedestal-outer','left-pedestal-front','left-lip-side']}[placement.direction];
 return parts?registeredArtwork(DESK_V7[placement.direction],placement,contact,size,parts):null;
}
