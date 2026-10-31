import {Wheel3D} from './wheel-3d.js?v=20261031-roulette-stopzoom1';
import {RouletteWheel2D} from './wheel-2d.js?v=20261031-roulette-stopzoom1';

export class RouletteWheel{
  constructor(canvas,callbacks){
    try{
      const context=canvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'high-performance'});
      if(!context)throw new Error('WebGL2 is unavailable');
      return new Wheel3D(canvas,{...callbacks,context});
    }catch(error){
      // Keep the same game, timing and payouts on devices without WebGL.
      const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);
      replacement.dataset.renderer='canvas';replacement.parentElement.classList.remove('is-3d');
      return new RouletteWheel2D(replacement,callbacks);
    }
  }
}
