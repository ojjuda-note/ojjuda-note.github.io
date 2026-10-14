// Identical browser/server helper. Ordinary and online deals never call this.
// Evaluate only the opening hand and public floor, not future draws or outcomes.
export function openingValue(game, player = 0) {
  const hand = game.hand[player], floor = game.floor.flat();
  const months = new Set(hand.filter(c => c.k !== 'bonus').map(c => c.m));
  const available = floor.filter(c => months.has(c.m));
  const count = new Map();
  for (const c of hand) if (c.k !== 'bonus') count.set(c.m, (count.get(c.m) || 0) + 1);
  // Do not seek an instant chongtong win: keep a playable, favorable opening.
  if ([...count.values()].some(n => n === 4)) return -1000;
  const value = c => c.k === 'bonus' ? c.pv * 4 : c.k === 'gwang' ? 5 : c.k === 'ssang' ? 4 : c.tag === 'bird' ? 4 : c.k === 'tti' ? 2.5 : c.k === 'yul' ? 2 : 1;
  let total = hand.reduce((s, c) => s + value(c), 0) * .7;
  total += available.reduce((s, c) => s + value(c), 0);
  total += new Set(available.map(c => c.m)).size * 7;
  total += [...count.values()].filter(n => n >= 2).length * 1.5;
  const potential = [...hand, ...available];
  for (const tag of ['bird', 'hong', 'cheong', 'cho']) {
    const n = potential.filter(c => c.tag === tag).length;
    total += n >= 3 ? (tag === 'bird' ? 12 : 8) : n === 2 ? 3 : 0;
  }
  if (potential.filter(c => c.k === 'gwang').length >= 3) total += 8;
  return total;
}

export function selectTazzaSeed(round, { Game, seededRandom }) {
  const candidate = new Game({});
  candidate.bank = [round.gold, 5000];
  candidate.first = round.first;
  candidate.carry = round.carry;
  let bestSeed = round.seed >>> 0, best = -Infinity;
  for (let i = 0; i < 64; i++) {
    const seed = ((round.seed >>> 0) + Math.imul(i, 0x9e3779b9)) >>> 0;
    candidate.random = seededRandom(seed);
    candidate.deal();
    const mine = openingValue(candidate, 0), other = openingValue(candidate, 1);
    const value = mine <= -1000 || other <= -1000 ? -Infinity : mine - other * .45;
    if (value > best) { best = value; bestSeed = seed; }
  }
  return bestSeed;
}

export const TAZZA_MODES = Object.freeze({
  tan: '탄쓰기 · 승리 보장', peek: '상대 패 보기', ssang: '쌍피 몰아받기', gwang: '광 몰아받기',
  godori: '고도리 몰아받기', cheong: '청단 몰아받기', hong: '홍단 몰아받기', cho: '초단 몰아받기'
});
export const TAZZA_DETAILS = Object.freeze({
  tan: '어떤 패를 내도 승리 · 최소 7점 보장', peek: '이번 판 상대 손패 공개', ssang: '쌍피·2피 보너스·구쌍피를 내 손패로',
  gwang: '광 5장을 내 손패로', godori: '고도리 3장을 내 손패로', cheong: '청단 3장을 내 손패로',
  hong: '홍단 3장을 내 손패로', cho: '초단 3장을 내 손패로'
});
export function isTazzaCard(card, mode) {
  if (mode === 'ssang') return card.k === 'ssang' || (card.k === 'bonus' && card.pv === 2) || card.tag === 'gukjin';
  if (mode === 'gwang') return card.k === 'gwang';
  return !!({godori:'bird',cheong:'cheong',hong:'hong',cho:'cho'}[mode]) && card.tag === {godori:'bird',cheong:'cheong',hong:'hong',cho:'cho'}[mode];
}
// Reproduce one legal 50-card deal through the unchanged engine's shuffle.
// Targets go into the player's ten-card hand; available matching cards go on the floor.
// This does not grant captured points or force a win.
function targetDeal(game, mode) {
  const pool = [...game.hand.flat(), ...game.deck, ...game.floor.flat(), ...game.caps.flat()];
  const mine = pool.filter(c => isTazzaCard(c, mode));
  const rest = pool.filter(c => !isTazzaCard(c, mode));
  const floor = [];
  for (const month of new Set(mine.filter(c => c.k !== 'bonus').map(c => c.m))) {
    const i = rest.findIndex(c => c.m === month);
    if (i >= 0) floor.push(...rest.splice(i, 1));
  }
  const canAdd = (hand, c) => c.k === 'bonus' || hand.filter(h => h.m === c.m).length < 3;
  while (mine.length < 10) mine.push(...rest.splice(rest.findIndex(c => canAdd(mine, c)), 1));
  while (floor.length < 8) floor.push(...rest.splice(rest.findIndex(c => c.k !== 'bonus' && canAdd(floor, c)), 1));
  const other = [];
  while (other.length < 10) other.push(...rest.splice(rest.findIndex(c => canAdd(other, c)), 1));
  const desired = [...floor, ...mine, ...other, ...rest].map(c => c.id);
  const ids = Array.from({length:50}, (_, i) => i), draws = [];
  for (let i = 49; i > 0; i--) {
    const j = ids.indexOf(desired[i]);
    draws.push((j + .5) / (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const random = game.random; let step = 0;
  game.random = () => draws[step++] ?? random();
  game.deal(); game.random = random;
}

export function dealSoloRound(game, round, engine) {
  const mode = round.tazza_mode ?? null;
  if (mode !== null && !Object.hasOwn(TAZZA_MODES, mode)) throw Error('invalid_mode');
  const seed = mode === 'tan' ? selectTazzaSeed(round, engine) : round.seed;
  game.random = engine.seededRandom(seed);
  if (!game.deal()) return false;
  if (mode && !['tan', 'peek'].includes(mode)) targetDeal(game, mode);
  game.tazzaMode = mode;
  if (mode) game.actions.unshift({ type: 'tazza', p: 0, mode });
  return true;
}

// Capture the choice before a start request, consume only after a successful deal.
export function createTazzaQueue() {
  let queued = false, starting = false;
  return {
    get queued() { return queued; },
    get starting() { return starting; },
    toggle() { if (!starting) queued = !queued; return queued; },
    begin() { starting = true; return queued; },
    finish(applied) { if (applied) queued = false; starting = false; }
  };
}
