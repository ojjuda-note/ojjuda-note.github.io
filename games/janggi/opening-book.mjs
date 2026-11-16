// Only move counts from matching positions are used. The caller supplies moves
// it has already scored as nearly equal, in their unmodified board orientation.
export const BOOK_PLIES = 16;
export const BOOK_FILE = 'openings-20261115.json';

export function bookKey(state) {
 return state.t + state.b.map(piece => piece || '.').join('');
}

let positions, loading;
export function warmOpeningBook() {
 if (!loading && typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) {
  loading = fetch(new URL(BOOK_FILE, import.meta.url)).then(async response => {
   if (!response.ok) throw new Error('Opening book unavailable');
   positions = (await response.json()).positions;
  }).catch(() => { loading = undefined; });
 }
 return loading;
}

export function openingCounts(state, book = positions) {
 if (!book || state.n >= BOOK_PLIES || state.passes || !Array.isArray(state.b)) return null;
 return book[bookKey(state)] || null;
}

export function pickOpeningMove(moves, counts, random = Math.random) {
 if (moves.length === 1) return moves[0];
 const weights = moves.map(move => Math.sqrt(counts?.[move.f * 90 + move.t] || 0));
 const total = weights.reduce((sum, weight) => sum + weight, 0);
 if (!total) return moves[Math.floor(random() * moves.length)];
 let ticket = random() * total;
 for (let i = 0; i < moves.length; i++) {
  ticket -= weights[i];
  if (ticket < 0) return moves[i];
 }
 return moves[moves.length - 1];
}
