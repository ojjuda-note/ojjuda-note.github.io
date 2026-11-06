// Adrian Kennard's standard 52-card artwork, bundled locally under CC0.
// See assets/cards/CREDITS.txt. Keep the original 5:7 card proportions.
export const CARD_RATIO=7/5;
const SUIT_CODES={spades:'S',hearts:'H',clubs:'C',diamonds:'D'};
export function cardAsset(card){
  if(!card?.up && !card?.rank)return new URL('./assets/cards/ojjuda-back.svg?v=4',import.meta.url).href;
  const rank={1:'A',11:'J',12:'Q',13:'K'}[card.rank]||String(card.rank);
  return new URL(`./assets/cards/${SUIT_CODES[card.suit]}-${rank}.svg`,import.meta.url).href;
}
export function cardFace(card){
  return `<img class="card-art" src="${cardAsset(card)}" alt="" draggable="false" decoding="sync">`;
}
