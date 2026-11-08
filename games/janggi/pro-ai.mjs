// Deeper, time-bounded Janggi search. The existing game engine owns every rule.
const PIECE_VALUE = Object.freeze({ R: 1300, C: 700, H: 500, E: 300, A: 300, P: 200, K: 0 });
const MATE = 100000;
const TIMEOUT = Symbol('janggi-ai-timeout');

const moveId = move => move.f * 90 + move.t;
const sameMove = (a, b) => !!a && !!b && a.f === b.f && a.t === b.t;
const pieceValue = piece => PIECE_VALUE[piece?.toUpperCase()] || 0;

// A repeated position is not always equivalent: shuttle and bikjang histories
// also determine which future moves are legal and whether a draw is imminent.
function positionKey(state) {
 const shuttle = state.shuttle || {};
 const shuttleKey = side => {
  const move = shuttle[side];
  return move ? `${move.f},${move.t},${move.run}` : '-';
 };
 const bikjang = state.bikjangKeys ? JSON.stringify(state.bikjangKeys) : '';
 return `${state.t}|${state.b.map(piece => piece || '.').join('')}|${state.passes || 0}|${state.n}|${shuttleKey('c')}|${shuttleKey('h')}|${bikjang}`;
}

export function chooseJanggiProMove(state, rules, budgetMs = 2700) {
 const { moves, apply, evaluate, isCheck, isDraw, status } = rules;
 if (isDraw(state)) return null;

 const legal = moves(state);
 if (!legal.length) return isCheck(state) ? null : { pass: 1 };

 const deadline = Date.now() + Math.max(40, Math.min(5000, budgetMs));
 const table = new Map();
 const history = new Int32Array(90 * 90);
 const killers = Array.from({ length: 16 }, () => []);
 let visited = 0;

 function checkTime() {
  if ((++visited & 63) === 0 && Date.now() >= deadline) throw TIMEOUT;
 }

 function terminal(state, ply) {
  if (isDraw(state)) return 0;
  // Point adjudication is only relevant after consecutive passes or the move cap.
  if ((state.passes || 0) < 2 && state.n < 400) return null;
  const result = status(state);
  if (!result.over) return null;
  return result.result === 'draw' ? 0 : result.result === state.t ? MATE - ply : -MATE + ply;
 }

 function sorted(state, candidates, preferred, ply) {
  const killersHere = killers[Math.min(ply, killers.length - 1)];
  return candidates.map(move => {
   const victim = state.b[move.t];
   const capture = victim ? 100000 + pieceValue(victim) * 20 - pieceValue(state.b[move.f]) : 0;
   const priority = sameMove(move, preferred) ? 1000000 : 0;
   const killer = killersHere.some(item => sameMove(item, move)) ? 80000 : 0;
   return { move, score: priority + capture + killer + history[moveId(move)] };
  }).sort((a, b) => b.score - a.score).map(item => item.move);
 }

 function quiescence(state, alpha, beta, ply, remaining) {
  checkTime();
  const result = terminal(state, ply);
  if (result !== null) return result;

  const checked = isCheck(state);
  const legal = checked ? moves(state) : null;
  if (checked && !legal.length) return -MATE + ply;

  const standPat = evaluate(state);
  if (!checked) {
   if (standPat >= beta) return standPat;
   alpha = Math.max(alpha, standPat);
  }
  if (remaining <= 0) return checked ? standPat : alpha;

  // Resolve forcing captures and check evasions before evaluating a leaf.
  const tactical = checked ? legal : moves(state).filter(move => state.b[move.t]);
  for (const move of sorted(state, tactical, null, ply)) {
   const score = -quiescence(apply(state, move), -beta, -alpha, ply + 1, remaining - 1);
   if (score >= beta) return score;
   alpha = Math.max(alpha, score);
  }
  return alpha;
 }

 function search(state, depth, alpha, beta, ply) {
  checkTime();
  const result = terminal(state, ply);
  if (result !== null) return result;
  if (depth <= 0) return quiescence(state, alpha, beta, ply, 3);

  const key = positionKey(state);
  const cached = table.get(key);
  const originalAlpha = alpha;
  if (cached && cached.depth >= depth) {
   if (cached.bound === 'exact') return cached.score;
   if (cached.bound === 'lower') alpha = Math.max(alpha, cached.score);
   if (cached.bound === 'upper') beta = Math.min(beta, cached.score);
   if (alpha >= beta) return cached.score;
  }

  const legal = moves(state);
  if (!legal.length) {
   if (isCheck(state)) return -MATE + ply;
   return -search(apply(state, { pass: 1 }), depth - 1, -beta, -alpha, ply + 1);
  }

  let best = -Infinity;
  let bestMove = null;
  for (const move of sorted(state, legal, cached?.move, ply)) {
   const score = -search(apply(state, move), depth - 1, -beta, -alpha, ply + 1);
   if (score > best) { best = score; bestMove = move; }
   alpha = Math.max(alpha, score);
   if (alpha >= beta) {
    if (!state.b[move.t]) {
     const id = moveId(move);
     history[id] = Math.min(50000, history[id] + depth * depth);
     const list = killers[Math.min(ply, killers.length - 1)];
     if (!list.some(item => sameMove(item, move))) list.unshift(move);
     if (list.length > 2) list.pop();
    }
    break;
   }
  }

  if (table.size > 20000) table.clear();
  table.set(key, { depth, score: best, move: bestMove, bound: best <= originalAlpha ? 'upper' : best >= beta ? 'lower' : 'exact' });
  return best;
 }

 let root = sorted(state, legal, null, 0);
 let bestMove = root[0];
 // Only a fully completed depth replaces the last reliable answer.
 for (let depth = 1; depth <= 6; depth++) {
  try {
   const ranked = [];
   let alpha = -Infinity;
   for (const move of root) {
    checkTime();
    const score = -search(apply(state, move), depth - 1, -Infinity, -alpha, 1);
    ranked.push({ move, score });
    alpha = Math.max(alpha, score);
   }
   ranked.sort((a, b) => b.score - a.score);
   bestMove = ranked[0].move;
   root = ranked.map(item => item.move);
   if (ranked[0].score >= MATE - 20) break;
  } catch (error) {
   if (error !== TIMEOUT) throw error;
   break;
  }
 }
 return bestMove;
}
