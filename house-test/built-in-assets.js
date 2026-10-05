import {loadItemManifest} from './item-manifest.js?v=2';
// Offline fallback for existing installations. Publish routine artwork updates
// in item-assets.json; do not change application versions or module imports.
const fallbackAssets = {
 'floor-blanket': {"file":"floor-blanket-v1.runtime.json","revision":"e2e6a987089eba44"},
 'sofa-blanket': {"file":"sofa-blanket-v1.runtime.json","revision":"8b23c66e0210bda3"},
 'sofa-cushions': {"file":"sofa-cushions-v1.runtime.json","revision":"a03469c53a043506"},
 sofa: {"file":"sofa-registration-v1.runtime.json","revision":"8f93f54a9bca3a0c"},
 'open-book': {file:'open-book-v1.runtime.json',revision:'f6b1f38b7e985386'},
 'pencil-cup': {file:'pencil-cup-v1.runtime.json',revision:'f28707be042aed33'},
 'table-succulent': {file:'table-succulent-v1.runtime.json',revision:'9e6c1afee5ce0abe'},
 'table-books': {file:'table-books-v1.runtime.json',revision:'ec7e48f63572779f'},
 'clover-mug': {file:'clover-mug-v1.runtime.json',revision:'e75c9edd9b59fe67'},
 'table-plant': {file:'table-plant-v1.runtime.json',revision:'43b6bf826c07c1ca'},
 'botanical-frame': {file:'botanical-frame-v1.runtime.json',revision:'10ac6b76bf260a1d'},
 'window-plant': {file:'window-plant-v1.runtime.json',revision:'b54dd51df66a1c9b'},
 'desk-lamp': {file:'desk-lamp-v1.runtime.json',revision:'7651472259287326'},
 'coffee-table': {file:'coffee-table-v2.runtime.json',revision:'6d939409557f4648'},
 carpet: {file:'carpet-v1.runtime.json',revision:'ee94f69c2d007509'},
 chair: {file:'chair-v1.runtime.json',revision:'cd68eb181d23d7d7'},
 'floor-lamp': {file:'floor-lamp-v1.runtime.json',revision:'1913d26469adebeb'}
};

const manifestURL=new URL('./item-assets.json',import.meta.url);
export const builtInAssets=structuredClone(fallbackAssets);
let pendingManifest;
// Do not await network at module evaluation: the room must install its parent
// message listener before the iframe load event delivers initialization.
export function loadBuiltInAssetList(){
 return pendingManifest??=(async()=>{
  if(/^https?:$/.test(manifestURL.protocol))Object.assign(builtInAssets,await loadItemManifest(manifestURL,fallbackAssets));
  return builtInAssets;
 })();
}
