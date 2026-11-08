// Stronger Janggi engine for the master tiers. Runs in a module Worker, so
// longer searches cannot freeze the board or its close/undo controls.
const VALUES = Object.freeze({ R: 1300, C: 700, H: 500, E: 300, A: 300, P: 200, K: 0 });
const MATE = 100000;
const TIMEOUT = Symbol('janggi-master-timeout');

export const MASTER_LEVELS = Object.freeze({
 master: Object.freeze({ label: '마스터', budgetMs: 4500, maxDepth: 8, quiescence: 4 }),
 grandmaster: Object.freeze({ label: '그랜드마스터', budgetMs: 7500, maxDepth: 10, quiescence: 5 })
});

const sameMove = (a, b) => !!a && !!b && a.f === b.f && a.t === b.t;
const moveId = move => move.f * 90 + move.t;
const pieceValue = piece => VALUES[piece?.toUpperCase()] || 0;

// Repetition, bikjang and two-shuttle history affect the legal continuations.
// Their state must be included in the transposition-table key.
function positionKey(state) {
 const shuttle = state.shuttle || {};
 const shuttleString = side => {
  const last = shuttle[side];
  return last ? `${last.f},${last.t},${last.run}` : '-';
 };
 return `${state.t}|${state.b.map(piece => piece || '.').join('')}|${state.passes || 0}|${state.n}|${shuttleString('c')}|${shuttleString('h')}|${state.bikjangKeys ? JSON.stringify(state.bikjangKeys) : ''}`;
}

export function analyzeJanggiMasterMove(state, rules, options = {}) {
 const config = MASTER_LEVELS[options.level] || MASTER_LEVELS.master;
 const budgetMs = Math.max(60, Math.min(9000, Number(options.budgetMs) || config.budgetMs));
 const maxDepth = Math.max(1, Math.min(12, Number(options.maxDepth) || config.maxDepth));
 const { moves, apply, evaluate, isCheck, isDraw, status } = rules;
 const started = Date.now(), deadline = started + budgetMs;
 const table = new Map(), history = new Int32Array(90 * 90);
 const killers = Array.from({ length: 24 }, () => []);
 let nodes = 0, depthReached = 0;
 const report = move => ({ move, depth: depthReached, nodes, elapsedMs: Date.now() - started });

 if (isDraw(state)) return report(null);
 const legal = moves(state);
 if (!legal.length) return report(isCheck(state) ? null : { pass: 1 });

 function checkTime() {
  if ((++nodes & 63) === 0 && Date.now() >= deadline) throw TIMEOUT;
 }

 function terminal(node, ply) {
  if (isDraw(node)) return 0;
  if ((node.passes || 0) < 2 && node.n < 400) return null;
  const result = status(node);
  if (!result.over) return null;
  return result.result === 'draw' ? 0 : result.result === node.t ? MATE - ply : -MATE + ply;
 }

 function ordered(node, list, pv, ply) {
  const activeKillers = killers[Math.min(ply, killers.length - 1)];
  return list.map(move => {
   const captured = node.b[move.t];
   const captureScore = captured ? 100000 + pieceValue(captured) * 20 - pieceValue(node.b[move.f]) : 0;
   const killerScore = activeKillers.some(killer => sameMove(killer, move)) ? 75000 : 0;
   return { move, priority: (sameMove(move, pv) ? 1000000 : 0) + captureScore + killerScore + history[moveId(move)] };
  }).sort((a, b) => b.priority - a.priority).map(entry => entry.move);
 }

 function quiescence(node, alpha, beta, ply, remaining) {
  checkTime();
  const gameOver = terminal(node, ply);
  if (gameOver !== null) return gameOver;
  const checked = isCheck(node);
  const available = checked ? moves(node) : null;
  if (checked && !available.length) return -MATE + ply;
  const standPat = evaluate(node);
  if (!checked) {
   if (standPat >= beta) return standPat;
   alpha = Math.max(alpha, standPat);
  }
  if (remaining <= 0) return checked ? standPat : alpha;
  const tactical = checked ? available : moves(node).filter(move => node.b[move.t]);
  for (const move of ordered(node, tactical, null, ply)) {
   const score = -quiescence(apply(node, move), -beta, -alpha, ply + 1, remaining - 1);
   if (score >= beta) return score;
   alpha = Math.max(alpha, score);
  }
  return alpha;
 }

 function search(node, depth, alpha, beta, ply) {
  checkTime();
  const gameOver = terminal(node, ply);
  if (gameOver !== null) return gameOver;
  if (depth <= 0) return quiescence(node, alpha, beta, ply, config.quiescence);

  const key = positionKey(node), prior = table.get(key);
  const alphaBefore = alpha, betaBefore = beta;
  if (prior && prior.depth >= depth) {
   if (prior.bound === 'exact') return prior.score;
   if (prior.bound === 'lower') alpha = Math.max(alpha, prior.score);
   if (prior.bound === 'upper') beta = Math.min(beta, prior.score);
   if (alpha >= beta) return prior.score;
  }
  const legal = moves(node);
  if (!legal.length) {
   if (isCheck(node)) return -MATE + ply;
   return -search(apply(node, { pass: 1 }), depth - 1, -beta, -alpha, ply + 1);
  }

  const checked = isCheck(node);
  let bestScore = -Infinity, bestMove = null;
  const nextMoves = ordered(node, legal, prior?.move, ply);
  for (let index = 0; index < nextMoves.length; index++) {
   const move = nextMoves[index], capture = !!node.b[move.t];
   const child = apply(node, move);
   let score;
   // Reduce late, quiet moves, but never checking moves or check evasions.
   const reduced = depth >= 3 && index >= 4 && !capture && !checked && !isCheck(child);
   if (reduced) {
    score = -search(child, depth - 2, -alpha - 1, -alpha, ply + 1);
    if (score > alpha) score = -search(child, depth - 1, -beta, -alpha, ply + 1);
   } else if (index && Number.isFinite(alpha)) {
    score = -search(child, depth - 1, -alpha - 1, -alpha, ply + 1);
    if (score > alpha && score < beta) score = -search(child, depth - 1, -beta, -alpha, ply + 1);
   } else {
    score = -search(child, depth - 1, -beta, -alpha, ply + 1);
   }
   if (score > bestScore) { bestScore = score; bestMove = move; }
   alpha = Math.max(alpha, score);
   if (alpha >= beta) {
    if (!capture) {
     const id = moveId(move);
     history[id] = Math.min(45000, history[id] + depth * depth);
     const list = killers[Math.min(ply, killers.length - 1)];
     if (!list.some(item => sameMove(item, move))) list.unshift(move);
     if (list.length > 2) list.pop();
    }
    break;
   }
  }
  if (table.size >= 40000) table.clear();
  table.set(key, { depth, score: bestScore, move: bestMove,
   bound: bestScore <= alphaBefore ? 'upper' : bestScore >= betaBefore ? 'lower' : 'exact' });
  return bestScore;
 }

 let root = ordered(state, legal, null, 0), chosen = root[0];
 // The previous complete iteration remains safe if the time budget expires.
 for (let depth = 1; depth <= maxDepth; depth++) {
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
   chosen = ranked[0].move;
   root = ranked.map(entry => entry.move);
   depthReached = depth;
   if (ranked[0].score >= MATE - 20) break;
  } catch (error) {
   if (error !== TIMEOUT) throw error;
   break;
  }
 }
 return report(chosen);
}

export function chooseJanggiMasterMove(state, rules, options) {
 return analyzeJanggiMasterMove(state, rules, options).move;
}
