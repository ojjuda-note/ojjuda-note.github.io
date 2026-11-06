// Adrian Kennard's standard 52-card artwork, bundled locally under CC0.
// See assets/cards/CREDITS.txt. Keep the original 5:7 card proportions.
import {cardFallback} from './card-fallback.js?v=20261106-solitaire-images1';
export const CARD_RATIO=7/5;
const SUIT_CODES={spades:'S',hearts:'H',clubs:'C',diamonds:'D'};
export function cardAsset(card){
  if(!card?.up && !card?.rank)return new URL('./assets/cards/ojjuda-back.svg?v=4',import.meta.url).href;
  const rank={1:'A',11:'J',12:'Q',13:'K'}[card.rank]||String(card.rank);
  return new URL(`./assets/cards/${SUIT_CODES[card.suit]}-${rank}.svg?v=20261106-solitaire-red2`,import.meta.url).href;
}
export function cardFace(card){
  const src=cardAsset(card);
  return `${cardFallback(card)}<img class="card-art" src="${src}" data-card-asset="${src}" data-card-image="pending" alt="" draggable="false" decoding="sync" hidden>`;
}

const RETRY_DELAYS=[250,1000,3000],installed=new WeakSet();
export function installCardImageRecovery(root){
  if(installed.has(root))return;installed.add(root);
  const win=root.defaultView,attempts=new WeakMap(),timers=new WeakMap();
  const ours=image=>image?.matches?.('img.card-art[data-card-asset]');
  function clear(image){const timer=timers.get(image);if(timer!==undefined)win.clearTimeout(timer);timers.delete(image);}
  function retry(image){
    if(!image.isConnected)return;
    const count=attempts.get(image)||0;if(count>=RETRY_DELAYS.length)return;
    attempts.set(image,count+1);clear(image);
    timers.set(image,win.setTimeout(()=>{
      timers.delete(image);if(!image.isConnected)return;
      const url=new URL(image.dataset.cardAsset);url.searchParams.set('retry',`${Date.now()}-${count+1}`);
      image.src=url.href;
    },RETRY_DELAYS[count]));
  }
  const loaded=image=>{clear(image);image.hidden=false;image.dataset.cardImage='ready';attempts.delete(image);};
  const failed=image=>{image.hidden=true;image.dataset.cardImage='failed';retry(image);};
  root.addEventListener('load',event=>{if(ours(event.target))loaded(event.target);},true);
  root.addEventListener('error',event=>{if(ours(event.target))failed(event.target);},true);
  // Warmed cards load while detached from the board, where document events
  // cannot see them. Reconcile their result when reused or cloned for a drag.
  function inspect(node){
    const images=ours(node)?[node]:node.querySelectorAll?.('img.card-art[data-card-asset]')||[];
    for(const image of images)if(image.complete){if(image.naturalWidth>0)loaded(image);else if(image.dataset.cardImage!=='failed')failed(image);}
  }
  new win.MutationObserver(changes=>changes.forEach(change=>change.addedNodes.forEach(inspect))).observe(root,{childList:true,subtree:true});
  inspect(root);
  win.addEventListener('online',()=>root.querySelectorAll('img.card-art[data-card-image="failed"]').forEach(image=>{clear(image);attempts.delete(image);retry(image);}));
}
if(typeof document!=='undefined')installCardImageRecovery(document);
