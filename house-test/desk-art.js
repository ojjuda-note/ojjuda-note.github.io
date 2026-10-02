import {DESK_V7} from './desk-v7-registration.js?v=20261002-desk-v7';
import {registeredArtwork} from './registered-artwork.js?v=20261002-desk-v7';

// Each direction is a separate finished picture from the furniture maker.
// Movement remaps its registered wood regions with the actual room projection.
export function deskArtwork(item,placement,contact,size){
 const registration=DESK_V7[placement.direction];
 if(!registration)throw new RangeError('Unknown desk picture direction');
 return registeredArtwork(registration,placement,contact,size);
}
