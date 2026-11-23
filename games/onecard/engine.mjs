/**
 * Ojjuda One Card — dependency-free rules shared by the browser and server.
 *
 * Cards retain immutable legacy IDs S-A ... C-K, X-B and X-R for saved games.
 * New decks add S-Q-2 ... C-Q-2: two reversals per color, 58 cards in total.
 * Existing rounds keep their stored card set; restoring never adds cards.
 * Display metadata presents a dedicated four-color number/action deck.
 * Full state is private. Only projectState() may leave the authoritative server.
 * Attacks may stack only at the same or a higher printed strength; a normal
 * draw ends the turn; 7/jokers choose a suit; J skips, Q reverses and K repeats.
 * New games start clockwise. Reversal never adds an extra turn in a two-seat game.
 */
export const ENGINE_VERSION = '1.4.0';
export const MAX_HAND_SIZE = 20;
export const SUITS = Object.freeze(['S', 'H', 'D', 'C']);
export const RANKS = Object.freeze(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);
export const SUIT_NAMES = Object.freeze({ S: '파랑', H: '빨강', D: '노랑', C: '초록' });
const SYMBOLS = Object.freeze({ S: '●', H: '◆', D: '▲', C: '■' });
const COLORS = Object.freeze({ S: 'blue', H: 'red', D: 'yellow', C: 'green' });
const NUMBERS = Object.freeze({ 3: '1', 4: '2', 5: '3', 6: '4', 8: '5', 9: '6', 10: '7' });
const ACTIONS = Object.freeze({ A: ['attack', '+3'], 2: ['attack', '+2'], 7: ['change', '색 바꾸기'], J: ['skip', '건너뛰기'], Q: ['reverse', '방향 바꾸기'], K: ['again', '한 번 더'] });
const CARDS = new Map();
for (const suit of SUITS) for (const rank of RANKS) {
  const id = `${suit}-${rank}`;
  const [displayKind, displayValue] = ACTIONS[rank] || ['number', NUMBERS[rank]];
  CARDS.set(id, Object.freeze({ id, suit, rank, symbol: SYMBOLS[suit], label: `${SUIT_NAMES[suit]} ${displayValue}`, color: COLORS[suit], colorName: SUIT_NAMES[suit], displayKind, displayValue, joker: false, attack: rank === 'A' ? 3 : rank === '2' ? 2 : 0 }));
}
for (const [rank, attack] of [['B', 5], ['R', 7]]) {
  const id = `X-${rank}`;
  CARDS.set(id, Object.freeze({ id, suit: 'X', rank, symbol: '✦', label: `전체색 +${attack}`, color: 'wild', colorName: '전체색', displayKind: 'attack', displayValue: `+${attack}`, joker: true, attack }));
}
for (const suit of SUITS) {
  const id = `${suit}-Q-2`;
  CARDS.set(id, Object.freeze({ ...CARDS.get(`${suit}-Q`), id }));
}

export class OneCardError extends Error {
  constructor(code, message) { super(message); this.name = 'OneCardError'; this.code = code; }
}
function fail(code, message) { throw new OneCardError(code, message); }
export function cardInfo(cardId) { return CARDS.get(cardId) || null; }
export function makeDeck() { return [...CARDS.keys()]; }

function secureRandom() {
  if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  return Math.random();
}
function randomFor(state, options = {}) {
  if (typeof options.random === 'function') return options.random;
  if (Number.isInteger(state.rngState)) return () => {
    let x = state.rngState >>> 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    state.rngState = x >>> 0;
    return state.rngState / 4294967296;
  };
  return secureRandom;
}
function shuffle(cards, random) {
  for (let i = cards.length - 1; i > 0; i--) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) fail('INVALID_RANDOM', '셔플 값이 올바르지 않습니다.');
    const j = Math.floor(value * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
function cloneState(state) {
  return { ...state, engineVersion: ENGINE_VERSION, direction: directionOf(state), players: state.players.map(player => ({ ...player, hand: [...player.hand] })), deck: [...state.deck], discard: [...state.discard], winnerIds: [...(state.winnerIds || [])], lastEvents: [] };
}
function emit(state, type, data = {}) {
  state.lastEvents.push({ id: `${state.revision}:${state.lastEvents.length}`, type, ...data });
}
function activeIndices(state) { return state.players.flatMap((player, index) => player.active ? [index] : []); }
function directionOf(state) { return state.direction === -1 ? -1 : 1; }
function nextIndex(state, from, steps = 1) {
  let index = from;
  for (let step = 0; step < steps; step++) {
    for (let checked = 0; checked < state.players.length; checked++) {
      index = (index + directionOf(state) + state.players.length) % state.players.length;
      if (state.players[index].active) break;
    }
  }
  return index;
}
function topCard(state) { return state.topCard || state.discard?.[state.discard.length - 1]; }
function playerById(state, playerId) { return state.players.find(player => player.id === playerId); }
function isWild(card) { return card.joker || card.rank === '7'; }

/** A deterministic seed is for tests / offline play; never expose it online. */
export function createGame({ players, handSize = 7, startIndex = 0, seed } = {}, options = {}) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 5) fail('PLAYER_COUNT', '2명부터 5명까지 함께할 수 있어요.');
  const ids = players.map(player => player?.id);
  if (ids.some(id => typeof id !== 'string' || !id.trim() || id.length > 128) || new Set(ids).size !== ids.length) fail('PLAYER_ID', '참가자 정보가 올바르지 않아요.');
  if (!Number.isInteger(handSize) || handSize < 1 || handSize > 10) fail('HAND_SIZE', '처음 받는 카드는 1~10장이어야 해요.');
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= players.length) fail('START_INDEX', '시작 순서가 올바르지 않아요.');
  if (seed !== undefined && !Number.isSafeInteger(seed)) fail('INVALID_SEED', '셔플 값이 올바르지 않습니다.');
  const state = {
    engineVersion: ENGINE_VERSION,
    players: players.map(player => ({ id: player.id, name: String(player.name || '친구').trim().slice(0, 32) || '친구', bot: player.bot === true, hand: [], active: true, calledOne: false, eliminatedReason: null })),
    deck: makeDeck(), discard: [], currentSuit: 'S', turn: startIndex, direction: 1,
    pendingDraw: 0, pendingOneId: null, status: 'playing', winnerId: null, winnerIds: [],
    finishReason: null, revision: 0, turnCount: 0, dryPasses: 0, lastEvents: [],
  };
  if (seed !== undefined) state.rngState = (seed >>> 0) || 0x9e3779b9;
  shuffle(state.deck, randomFor(state, options));
  // A neutral opening makes the first turn fair, even in a five-seat game.
  const openingIndex = state.deck.findLastIndex(id => ['3', '4', '5', '6', '8', '9', '10'].includes(cardInfo(id).rank));
  const [opening] = state.deck.splice(openingIndex, 1);
  state.discard.push(opening);
  state.currentSuit = cardInfo(opening).suit;
  for (let round = 0; round < handSize; round++) for (const player of state.players) {
    const cardId = state.deck.pop();
    player.hand.push(cardId);
    emit(state, 'deal', { playerId: player.id, cardId, ordinal: round });
  }
  for (const player of state.players) player.calledOne = player.hand.length === 1;
  emit(state, 'opening', { cardId: opening });
  return state;
}

export function isPlayable(cardId, currentCardId, currentSuit, pendingDraw = 0) {
  const card = cardInfo(cardId), top = cardInfo(currentCardId);
  if (!card || !top) return false;
  // Compare the most recently played attack, not the accumulated draw debt.
  if (pendingDraw > 0) return card.attack > 0 && card.attack >= top.attack;
  return card.joker || card.suit === currentSuit || (!top.joker && card.rank === top.rank);
}

export function legalCards(state, playerId) {
  const player = playerById(state, playerId);
  if (state.status !== 'playing' || !player?.active || state.players[state.turn]?.id !== playerId || !Array.isArray(player.hand)) return [];
  return player.hand.filter(cardId => isPlayable(cardId, topCard(state), state.currentSuit, state.pendingDraw));
}
export function canDeclare(state, playerId) {
  const player = playerById(state, playerId);
  if (!player?.active || player.calledOne || state.status !== 'playing') return false;
  const count = player.hand?.length ?? player.handCount;
  return (count === 1 && state.pendingOneId === playerId) || (count === 2 && state.players[state.turn]?.id === playerId);
}

function drawCards(state, player, wanted, random, reason) {
  const cardIds = [];
  for (let i = 0; i < wanted && player.hand.length < MAX_HAND_SIZE; i++) {
    if (!state.deck.length && state.discard.length > 1) {
      const top = state.discard.pop();
      state.deck = shuffle(state.discard, random);
      state.discard = [top];
      emit(state, 'recycle', { count: state.deck.length });
    }
    if (!state.deck.length) break;
    const cardId = state.deck.pop();
    player.hand.push(cardId); cardIds.push(cardId);
  }
  player.calledOne = false;
  if (state.pendingOneId === player.id) state.pendingOneId = null;
  emit(state, 'draw', { playerId: player.id, cardIds, count: cardIds.length, requestedCount: wanted, reason });
  return cardIds.length;
}
function missedOneCard(state, random) {
  const pending = playerById(state, state.pendingOneId);
  state.pendingOneId = null;
  if (pending?.active && pending.hand.length === 1 && !pending.calledOne) drawCards(state, pending, 2, random, 'missed-onecard');
}
function finish(state, winners, reason) {
  state.status = 'finished';
  state.winnerIds = winners.map(player => player.id);
  state.winnerId = winners.length === 1 ? winners[0].id : null;
  state.finishReason = reason;
  state.pendingDraw = 0; state.pendingOneId = null;
  emit(state, 'win', { playerId: state.winnerId, playerIds: [...state.winnerIds], reason });
}
function deactivate(state, player, random, reason) {
  player.active = false; player.calledOne = false; player.eliminatedReason = reason;
  if (state.pendingOneId === player.id) state.pendingOneId = null;
  state.deck.push(...player.hand); player.hand = [];
  shuffle(state.deck, random);
  state.dryPasses = 0;
  const active = state.players.filter(candidate => candidate.active);
  if (active.length <= 1) finish(state, active, 'last-player');
}
function checkBlocked(state) {
  const active = state.players.filter(player => player.active);
  if (state.dryPasses >= active.length) {
    const least = Math.min(...active.map(player => player.hand.length));
    finish(state, active.filter(player => player.hand.length === least), 'blocked');
  }
}

/** Atomic: invalid actions never mutate input, including pending penalties. */
export function applyAction(state, playerId, action, options = {}) {
  if (!state || state.status !== 'playing') fail('GAME_FINISHED', '이미 끝난 게임이에요.');
  const player = playerById(state, playerId);
  if (!player?.active) fail('NOT_PLAYER', '참가자만 게임을 진행할 수 있어요.');
  if (!action || !['play', 'draw', 'declare'].includes(action.type)) fail('INVALID_ACTION', '할 수 없는 동작이에요.');
  if (action.type === 'declare') {
    if (!canDeclare(state, playerId)) fail('CANNOT_DECLARE', '카드가 두 장일 때부터 원카드를 외칠 수 있어요.');
    const next = cloneState(state); next.revision++;
    playerById(next, playerId).calledOne = true;
    if (next.pendingOneId === playerId) next.pendingOneId = null;
    emit(next, 'onecard', { playerId });
    return next;
  }
  if (state.players[state.turn]?.id !== playerId) fail('NOT_YOUR_TURN', '내 차례를 기다려 주세요.');
  let card;
  if (action.type === 'play') {
    card = cardInfo(action.cardId);
    if (!card || !player.hand.includes(action.cardId)) fail('CARD_NOT_OWNED', '내 손에 없는 카드예요.');
    if (!isPlayable(action.cardId, topCard(state), state.currentSuit, state.pendingDraw)) fail('CARD_NOT_PLAYABLE', state.pendingDraw ? '같거나 더 큰 숫자의 공격 카드를 내거나 카드를 가져오세요.' : '같은 색, 숫자 또는 기능의 카드를 내세요.');
    if (isWild(card) && !SUITS.includes(action.suit)) fail('SUIT_REQUIRED', '다음 색을 골라 주세요.');
  }
  const next = cloneState(state); next.revision++; next.turnCount++;
  const random = randomFor(next, options);
  missedOneCard(next, random);
  const actor = playerById(next, playerId);
  if (action.type === 'draw') {
    const count = drawCards(next, actor, next.pendingDraw || 1, random, next.pendingDraw ? 'attack' : 'draw');
    next.pendingDraw = 0;
    next.dryPasses = count ? 0 : next.dryPasses + 1;
    if (actor.hand.length >= MAX_HAND_SIZE) {
      emit(next, 'eliminate', { playerId, reason: 'too-many-cards', count: actor.hand.length });
      deactivate(next, actor, random, 'too-many-cards');
    }
    next.turn = nextIndex(next, next.turn);
    if (next.status === 'playing') checkBlocked(next);
    return next;
  }
  const armed = actor.calledOne;
  actor.hand.splice(actor.hand.indexOf(action.cardId), 1);
  actor.calledOne = false;
  next.discard.push(action.cardId);
  next.currentSuit = isWild(card) ? action.suit : card.suit;
  next.dryPasses = 0;
  emit(next, 'play', { playerId, cardId: action.cardId, suit: next.currentSuit });
  if (card.rank === 'Q') {
    next.direction *= -1;
    emit(next, 'reverse', { playerId, direction: next.direction });
  }
  if (actor.hand.length === 0) {
    finish(next, [actor], 'empty-hand');
    return next;
  }
  if (actor.hand.length === 1) {
    actor.calledOne = action.declare === true || armed;
    next.pendingOneId = actor.calledOne ? null : playerId;
    if (actor.calledOne) emit(next, 'onecard', { playerId });
  }
  let steps = 1;
  if (card.attack) {
    next.pendingDraw += card.attack;
    emit(next, 'attack', { playerId, count: next.pendingDraw });
  } else if (card.rank === 'J') {
    steps = 2;
    emit(next, 'skip', { playerId, skippedPlayerId: next.players[nextIndex(next, next.turn)].id });
  } else if (card.rank === 'K') {
    steps = 0;
    emit(next, 'again', { playerId });
  }
  next.turn = nextIndex(next, next.turn, steps);
  return next;
}

/** Permanent departure only. Temporary connection loss should use a draw timeout. */
export function removePlayer(state, playerId, options = {}) {
  const player = playerById(state, playerId);
  if (!player) fail('NOT_PLAYER', '참가자를 찾을 수 없어요.');
  if (!player.active || state.status !== 'playing') return state.direction === directionOf(state) ? state : { ...state, direction: directionOf(state) };
  const next = cloneState(state); next.revision++;
  const actor = playerById(next, playerId);
  emit(next, 'leave', { playerId });
  deactivate(next, actor, randomFor(next, options), 'left');
  if (next.status === 'playing' && next.players[next.turn].id === playerId) next.turn = nextIndex(next, next.turn);
  return next;
}

/** Build explicitly: adding a private state field never silently leaks it. */
export function projectState(state, viewerId) {
  const viewer = playerById(state, viewerId);
  if (!viewer) fail('NOT_PLAYER', '참가자만 게임을 볼 수 있어요.');
  return {
    engineVersion: ENGINE_VERSION,
    viewerId,
    players: state.players.map(player => ({ id: player.id, name: player.name, bot: player.bot, active: player.active, calledOne: player.calledOne, eliminatedReason: player.eliminatedReason || null, handCount: player.hand.length, ...(player.id === viewerId ? { hand: [...player.hand] } : {}) })),
    topCard: topCard(state), deckCount: state.deck.length, discardCount: state.discard.length,
    currentSuit: state.currentSuit, turn: state.turn, direction: directionOf(state),
    pendingDraw: state.pendingDraw, pendingOneId: state.pendingOneId, status: state.status,
    winnerId: state.winnerId, winnerIds: [...state.winnerIds], finishReason: state.finishReason,
    revision: state.revision, turnCount: state.turnCount,
    legalCardIds: legalCards(state, viewerId), canDeclare: canDeclare(state, viewerId),
    lastEvents: state.lastEvents.map(event => {
      const visible = { id: event.id, type: event.type };
      for (const key of ['playerId', 'count', 'requestedCount', 'ordinal', 'reason', 'suit', 'direction', 'skippedPlayerId']) if (event[key] !== undefined) visible[key] = event[key];
      if (Array.isArray(event.playerIds)) visible.playerIds = [...event.playerIds];
      if (event.cardId && (['opening', 'play'].includes(event.type) || (event.type === 'deal' && event.playerId === viewerId))) visible.cardId = event.cardId;
      if (event.type === 'draw' && event.cardIds && event.playerId === viewerId) visible.cardIds = [...event.cardIds];
      return visible;
    }),
  };
}

/** Bots use only their own cards and the visible table, never opponents' hands. */
export function chooseBotAction(state, playerId = state.players[state.turn]?.id, options = {}) {
  const player = playerById(state, playerId);
  if (!player?.active || state.status !== 'playing' || state.players[state.turn]?.id !== playerId) return null;
  const playable = legalCards(state, playerId);
  if (!playable.length) return { type: 'draw' };
  const hand = player.hand;
  const nextPlayer = state.players[nextIndex(state, state.turn)];
  const pressure = (nextPlayer?.handCount ?? nextPlayer?.hand?.length ?? 7) <= 2;
  const score = cardId => {
    const card = cardInfo(cardId), remaining = hand.filter(id => id !== cardId);
    const suitCount = remaining.filter(id => cardInfo(id).suit === card.suit).length;
    const repeat = card.rank === 'K' || (activeIndices(state).length === 2 && card.rank === 'J');
    let value = suitCount * 5 + (repeat ? 14 : 0) + (card.attack ? (pressure ? 30 : 4) + card.attack : 0);
    if (isWild(card) && hand.length > 2 && !state.pendingDraw) value -= card.joker ? 18 : 9;
    return value;
  };
  const best = Math.max(...playable.map(score));
  const choices = playable.filter(cardId => score(cardId) === best);
  const random = typeof options.random === 'function' ? options.random : () => 0;
  const roll = random();
  const cardId = choices[Math.floor(Math.max(0, Math.min(0.999999999, Number.isFinite(roll) ? roll : 0)) * choices.length)];
  const card = cardInfo(cardId), action = { type: 'play', cardId, declare: true };
  if (isWild(card)) {
    const remaining = hand.filter(id => id !== cardId);
    action.suit = SUITS.reduce((bestSuit, suit) => remaining.filter(id => cardInfo(id).suit === suit).length > remaining.filter(id => cardInfo(id).suit === bestSuit).length ? suit : bestSuit, SUITS[0]);
  }
  return action;
}
