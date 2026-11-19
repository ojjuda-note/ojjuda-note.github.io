import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_VERSION, SUITS, makeDeck, cardInfo, createGame, applyAction, legalCards, isPlayable, projectState, chooseBotAction, removePlayer, canDeclare } from '../games/onecard/engine.mjs';

const players = count => Array.from({ length: count }, (_, index) => ({ id: `p${index}`, name: `친구 ${index + 1}`, bot: index > 0 }));
const fullCards = state => [...state.deck, ...state.discard, ...state.players.flatMap(player => player.hand)];
function conserved(state) {
  const cards = fullCards(state);
  assert.equal(cards.length, 54, 'all 54 cards remain in the game');
  assert.equal(new Set(cards).size, 54, 'no card is duplicated');
  assert.ok(cards.every(cardId => cardInfo(cardId)), 'every card ID is valid');
  assert.ok(state.status === 'finished' || state.players[state.turn].active, 'turn always points to an active seat');
  assert.equal(state.direction, 1, 'turn direction always remains clockwise');
}
function table(hands, options = {}) {
  const state = createGame({ players: players(hands.length), seed: 77 });
  const discard = options.discard || [options.top || 'S-4'];
  const used = new Set([...discard, ...hands.flat()]);
  state.players.forEach((player, index) => { player.hand = [...hands[index]]; player.calledOne = false; });
  state.discard = [...discard];
  state.currentSuit = options.suit || cardInfo(discard.at(-1)).suit;
  state.deck = makeDeck().filter(id => !used.has(id));
  state.lastEvents = [];
  Object.assign(state, options);
  return state;
}
function move(state, cardId, extras = {}) {
  return applyAction(state, state.players[state.turn].id, { type: 'play', cardId, ...extras });
}

test('54-card deck, valid setup and a visible neutral opening for 2–5 players', () => {
  assert.equal(ENGINE_VERSION, '1.1.0');
  assert.equal(makeDeck().length, 54);
  assert.equal(new Set(makeDeck()).size, 54);
  assert.equal(cardInfo('X-B').attack, 5);
  assert.equal(cardInfo('X-R').attack, 7);
  assert.equal(cardInfo('H-10').label, '빨강 8');
  assert.equal(cardInfo('not-a-card'), null);
  for (const count of [2, 3, 4, 5]) {
    const state = createGame({ players: players(count), seed: count });
    assert.ok(state.players.every(player => player.hand.length === 7));
    assert.equal(state.deck.length, 53 - count * 7);
    assert.ok(['3', '4', '5', '6', '8', '9', '10'].includes(cardInfo(state.discard[0]).rank));
    assert.equal(state.lastEvents.length, count * 7 + 1);
    assert.deepEqual(state.lastEvents.slice(0, count).map(event => event.playerId), players(count).map(player => player.id));
    conserved(state);
  }
  assert.throws(() => createGame({ players: players(1) }), { code: 'PLAYER_COUNT' });
  assert.throws(() => createGame({ players: players(6) }), { code: 'PLAYER_COUNT' });
  assert.throws(() => createGame({ players: [{ id: 'p0' }, { id: 'p0' }] }), { code: 'PLAYER_ID' });
  assert.throws(() => createGame({ players: players(2), handSize: 27 }), { code: 'HAND_SIZE' });
  assert.throws(() => createGame({ players: players(2), startIndex: 8 }), { code: 'START_INDEX' });
});

test('all legacy identities expose the dedicated four-color number/action deck', () => {
  const colors = { S: ['blue', '파랑', '●'], H: ['red', '빨강', '◆'], D: ['yellow', '노랑', '▲'], C: ['green', '초록', '■'] };
  const numbers = { Q: '1', 3: '2', 4: '3', 5: '4', 6: '5', 8: '6', 9: '7', 10: '8' };
  const actions = { A: ['attack', '+3', 3], 2: ['attack', '+2', 2], 7: ['change', '색 바꾸기', 0], J: ['skip', '건너뛰기', 0], K: ['again', '한 번 더', 0] };
  for (const [suit, [color, colorName, symbol]] of Object.entries(colors)) {
    for (const [rank, displayValue] of Object.entries(numbers)) {
      const card = cardInfo(`${suit}-${rank}`);
      assert.equal(card.rank, rank); assert.equal(card.suit, suit);
      assert.equal(card.color, color); assert.equal(card.colorName, colorName); assert.equal(card.symbol, symbol);
      assert.equal(card.displayKind, 'number'); assert.equal(card.displayValue, displayValue);
      assert.equal(card.label, `${colorName} ${displayValue}`); assert.equal(card.attack, 0);
    }
    for (const [rank, [kind, value, attack]] of Object.entries(actions)) {
      const card = cardInfo(`${suit}-${rank}`);
      assert.equal(card.rank, rank); assert.equal(card.displayKind, kind); assert.equal(card.displayValue, value);
      assert.equal(card.label, `${colorName} ${value}`); assert.equal(card.attack, attack);
    }
  }
  for (const [id, attack] of [['X-B', 5], ['X-R', 7]]) {
    const card = cardInfo(id);
    assert.equal(card.color, 'wild'); assert.equal(card.colorName, '전체색');
    assert.equal(card.label, `전체색 +${attack}`); assert.equal(card.displayKind, 'attack');
    assert.equal(card.displayValue, `+${attack}`); assert.equal(card.attack, attack); assert.equal(card.joker, true);
  }
  assert.ok(makeDeck().every(id => !/[♠♥♦♣]|스페이드|하트|다이아|클로버|조커|에이스|잭|퀸|킹/.test(cardInfo(id).label)));
  const state = table([['S-7', 'H-8'], ['D-3', 'C-6']]);
  assert.throws(() => move(state, 'S-7'), error => error.code === 'SUIT_REQUIRED' && error.message === '다음 색을 골라 주세요.');
  assert.throws(() => move(state, 'H-8'), error => error.code === 'CARD_NOT_PLAYABLE' && error.message.includes('같은 색'));
  const next = move(state, 'S-7', { suit: 'D' });
  assert.equal(next.currentSuit, 'D'); assert.ok(next.lastEvents.some(event => event.type === 'play' && event.suit === 'D'));
  conserved(next);
});

test('seeded and injected shuffles are reproducible; supplied random is checked', () => {
  const first = createGame({ players: players(5), seed: 20261120 });
  const second = createGame({ players: players(5), seed: 20261120 });
  assert.deepEqual(first, second);
  assert.notDeepEqual(first.deck, createGame({ players: players(5), seed: 20261121 }).deck);
  assert.deepEqual(createGame({ players: players(2) }, { random: () => 0.25 }), createGame({ players: players(2) }, { random: () => 0.25 }));
  assert.throws(() => createGame({ players: players(2) }, { random: () => 1 }), { code: 'INVALID_RANDOM' });
});

test('ordinary matching, seven/joker suit choice and illegal moves remain atomic', () => {
  let state = table([['S-7', 'H-4', 'D-9', 'X-R'], ['H-8', 'C-6']], { top: 'S-4' });
  assert.deepEqual(legalCards(state, 'p0'), ['S-7', 'H-4', 'X-R']);
  assert.deepEqual(legalCards(state, 'p1'), []);
  const before = structuredClone(state);
  assert.throws(() => move(state, 'D-9'), { code: 'CARD_NOT_PLAYABLE' });
  assert.throws(() => move(state, 'S-7'), { code: 'SUIT_REQUIRED' });
  assert.throws(() => move(state, 'S-A'), { code: 'CARD_NOT_OWNED' });
  assert.throws(() => applyAction(state, 'p1', { type: 'draw' }), { code: 'NOT_YOUR_TURN' });
  assert.deepEqual(state, before);
  state = move(state, 'S-7', { suit: 'H' });
  assert.equal(state.currentSuit, 'H');
  assert.ok(legalCards(state, 'p1').includes('H-8'));
  assert.equal(state.revision, 1);
  assert.equal(isPlayable('D-7', 'S-7', 'H'), true, 'same rank remains legal after a seven');
  assert.equal(isPlayable('S-8', 'X-R', 'H'), false, 'joker has no ordinary rank match');
  conserved(state);
});

test('attacks stack across suits and are paid once before passing the turn', () => {
  let state = table([['S-2', 'C-9'], ['D-A', 'D-8'], ['X-B', 'H-4'], ['X-R', 'C-3']], { top: 'S-4' });
  for (const [cardId, total, suit] of [['S-2', 2], ['D-A', 5], ['X-B', 10, 'C'], ['X-R', 17, 'H']]) {
    state = move(state, cardId, { declare: true, ...(suit ? { suit } : {}) });
    assert.equal(state.pendingDraw, total);
    conserved(state);
  }
  const before = state.players[0].hand.length;
  assert.deepEqual(legalCards(state, 'p0'), []);
  state = applyAction(state, 'p0', { type: 'draw' });
  assert.equal(state.players[0].hand.length, before + 17);
  assert.equal(state.pendingDraw, 0);
  assert.equal(state.turn, 1);
  assert.equal(state.lastEvents.at(-1).requestedCount, 17);
  conserved(state);
});

test('J skips clockwise, Q is ordinary and K grants another turn', () => {
  for (const rank of ['J', 'Q', 'K']) {
    const state = table([[`S-${rank}`, 'D-5'], ['C-3', 'H-8']], { top: 'S-4' });
    const next = move(state, `S-${rank}`, { declare: true });
    assert.equal(next.turn, rank === 'Q' ? 1 : 0, `two-player ${rank} follows its current rule`);
    assert.equal(next.direction, 1);
    assert.ok(!next.lastEvents.some(event => event.type === 'reverse'));
  }
  let state = table([['S-Q', 'C-3'], ['S-J', 'C-4'], ['S-8', 'C-5'], ['S-K', 'C-6'], ['S-9', 'C-7']]);
  state = move(state, 'S-Q', { declare: true });
  assert.equal(state.turn, 1, 'Q passes to the immediate clockwise seat');
  state = move(state, 'S-J', { declare: true });
  assert.equal(state.turn, 3, 'J skips one clockwise seat');
  state = move(state, 'S-K', { declare: true });
  assert.equal(state.turn, 3);
  state = applyAction(state, 'p3', { type: 'draw' });
  assert.equal(state.turn, 4);
  state = move(state, 'S-9', { declare: true });
  assert.equal(state.turn, 0, 'clockwise travel wraps around the five seats');
  conserved(state);
});

test('older reverse-direction states normalize without changing caller seat order', () => {
  const ordered = players(5).reverse();
  const fresh = createGame({ players: ordered, startIndex: 3, seed: 904 });
  assert.deepEqual(fresh.players.map(player => player.id), ordered.map(player => player.id));
  assert.equal(fresh.turn, 3, 'only the caller chooses shuffled seats and starter');
  const state = table([['S-Q', 'H-8'], ['C-3', 'D-5'], ['S-9', 'C-6']], { direction: -1 });
  state.lastEvents = [{ id: '0:0', type: 'reverse', playerId: 'p0', direction: -1 }];
  const view = projectState(state, 'p0');
  assert.equal(view.direction, 1);
  assert.equal(view.lastEvents.length, 0, 'old reversal events are not shown as a current rule');
  const next = move(state, 'S-Q', { declare: true });
  assert.equal(state.direction, -1, 'normalization does not mutate the supplied save');
  assert.equal(next.turn, 1);
  assert.equal(next.engineVersion, ENGINE_VERSION);
  conserved(next);
  const departure = removePlayer(state, 'p0');
  assert.equal(departure.turn, 1);
  conserved(departure);
});

test('one-card can be armed or called promptly; missed calls draw two without changing turn', () => {
  let state = table([['S-3', 'H-8'], ['S-5', 'C-9']]);
  assert.equal(canDeclare(state, 'p0'), true);
  const armed = applyAction(state, 'p0', { type: 'declare' });
  assert.equal(armed.turn, 0);
  assert.equal(armed.players[0].calledOne, true);
  assert.equal(move(armed, 'S-3').pendingOneId, null);
  state = move(state, 'S-3');
  assert.equal(state.pendingOneId, 'p0');
  assert.equal(canDeclare(state, 'p0'), true);
  const called = applyAction(state, 'p0', { type: 'declare' });
  assert.equal(called.pendingOneId, null);
  assert.equal(called.turn, 1);
  assert.equal(move(called, 'S-5', { declare: true }).players[0].hand.length, 1);
  const snapshot = structuredClone(state);
  assert.throws(() => applyAction(state, 'p1', { type: 'play', cardId: 'C-9' }), { code: 'CARD_NOT_PLAYABLE' });
  assert.deepEqual(state, snapshot, 'rejected actions do not apply a missed-call penalty');
  state = move(state, 'S-5', { declare: true });
  assert.equal(state.players[0].hand.length, 3);
  assert.equal(state.turn, 0);
  assert.equal(state.lastEvents[0].reason, 'missed-onecard');
  assert.throws(() => applyAction(state, 'p0', { type: 'declare' }), { code: 'CANNOT_DECLARE' });
  conserved(state);
});

test('an undeclared last card after K cannot evade the penalty by immediately winning', () => {
  let state = table([['S-K', 'S-8'], ['C-6', 'D-9']]);
  state = move(state, 'S-K');
  assert.equal(state.turn, 0);
  state = move(state, 'S-8');
  assert.equal(state.status, 'playing');
  assert.equal(state.players[0].hand.length, 2);
  assert.equal(state.lastEvents[0].reason, 'missed-onecard');
  conserved(state);
});

test('discard recycling preserves the top card and never duplicates cards', () => {
  const hands = [['H-8'], ['C-9']];
  const deck = ['D-4'];
  const discard = makeDeck().filter(id => ![...hands.flat(), ...deck, 'S-4'].includes(id)).concat('S-4');
  let state = table(hands, { discard, deck, pendingDraw: 12 });
  state = applyAction(state, 'p0', { type: 'draw' });
  assert.equal(state.players[0].hand.length, 13);
  assert.deepEqual(state.discard, ['S-4']);
  assert.equal(state.currentSuit, 'S');
  assert.ok(state.lastEvents.some(event => event.type === 'recycle'));
  conserved(state);
});

test('an empty deck cannot hang the table; one dry round resolves the result', () => {
  const cards = makeDeck().filter(id => id !== 'S-4');
  let state = table([cards.slice(0, 17), cards.slice(17, 35), cards.slice(35)], { deck: [] });
  state = applyAction(state, 'p0', { type: 'draw' });
  assert.equal(state.status, 'playing');
  assert.equal(state.lastEvents[0].count, 0);
  state = applyAction(state, 'p1', { type: 'draw' });
  state = applyAction(state, 'p2', { type: 'draw' });
  assert.equal(state.status, 'finished');
  assert.equal(state.finishReason, 'blocked');
  assert.equal(state.winnerId, 'p0');
  conserved(state);
});

test('20 cards eliminate a seat, recycle its cards privately and stop overdraw', () => {
  const largeHand = makeDeck().filter(id => !['S-4', 'H-8', 'C-9'].includes(id)).slice(0, 18);
  let state = table([largeHand, ['H-8'], ['C-9']], { pendingDraw: 7 });
  state = applyAction(state, 'p0', { type: 'draw' });
  assert.equal(state.players[0].active, false);
  assert.equal(state.players[0].eliminatedReason, 'too-many-cards');
  assert.equal(state.players[0].hand.length, 0);
  assert.equal(state.deck.length, 51);
  assert.equal(state.pendingDraw, 0);
  assert.equal(state.turn, 1);
  assert.equal(state.status, 'playing');
  assert.equal(state.lastEvents.find(event => event.type === 'draw').count, 2);
  assert.equal(state.lastEvents.find(event => event.type === 'draw').requestedCount, 7);
  assert.equal(state.lastEvents.find(event => event.type === 'eliminate').count, 20);
  assert.equal(projectState(state, 'p1').lastEvents.find(event => event.type === 'draw').cardIds, undefined);
  assert.throws(() => applyAction(state, 'p0', { type: 'draw' }), { code: 'NOT_PLAYER' });
  conserved(state);
});

test('finishing on any special card ends immediately and further actions are rejected', () => {
  for (const cardId of ['S-3', 'S-A', 'S-7', 'S-J', 'S-Q', 'S-K', 'X-R']) {
    const state = table([[cardId], ['C-9', 'D-5']]);
    const result = move(state, cardId, { suit: 'H' });
    assert.equal(result.status, 'finished');
    assert.equal(result.winnerId, 'p0');
    assert.deepEqual(result.winnerIds, ['p0']);
    assert.equal(result.pendingDraw, 0);
    assert.throws(() => applyAction(result, 'p1', { type: 'draw' }), { code: 'GAME_FINISHED' });
    conserved(result);
  }
});

test('private projection reveals only own hand and own draws/deals; returned data is detached', () => {
  let state = createGame({ players: players(5), seed: 1101 });
  state.secretFutureField = 'never send';
  let view = projectState(state, 'p0');
  assert.equal(view.deck, undefined);
  assert.equal(view.discard, undefined);
  assert.equal(view.rngState, undefined);
  assert.equal(view.secretFutureField, undefined);
  assert.equal(view.players[0].hand.length, 7);
  assert.ok(view.players.slice(1).every(player => !('hand' in player) && player.handCount === 7));
  assert.equal(view.lastEvents.filter(event => event.type === 'deal' && event.cardId).length, 7);
  assert.equal(view.lastEvents.filter(event => event.type === 'deal').length, 35);
  assert.throws(() => projectState(state, 'outsider'), { code: 'NOT_PLAYER' });
  view.players[0].hand.pop();
  assert.equal(state.players[0].hand.length, 7);
  state = applyAction(state, 'p0', { type: 'draw' });
  assert.equal(projectState(state, 'p1').lastEvents.find(event => event.type === 'draw').cardIds, undefined);
  view = projectState(state, 'p0');
  assert.equal(view.lastEvents.find(event => event.type === 'draw').cardIds.length, 1);
  assert.deepEqual(view.legalCardIds, legalCards(state, 'p0'));
});

test('departure returns cards, retains attack, skips inactive seats, and last survivor wins', () => {
  let state = table([['S-2', 'H-4'], ['D-8', 'C-9'], ['D-A', 'H-8']]);
  state = move(state, 'S-2', { declare: true });
  state = removePlayer(state, 'p1');
  assert.equal(state.players[1].active, false);
  assert.deepEqual(state.players[1].hand, []);
  assert.equal(state.turn, 2);
  assert.equal(state.pendingDraw, 2);
  assert.equal(removePlayer(state, 'p1'), state, 'repeated departure is idempotent');
  conserved(state);
  state = removePlayer(state, 'p0');
  assert.equal(state.status, 'finished');
  assert.equal(state.winnerId, 'p2');
  conserved(state);
});

test('bot decisions depend on public information, never hidden card identities or deck order', () => {
  const state = createGame({ players: players(5), seed: 992 });
  const action = chooseBotAction(state, 'p0');
  assert.deepEqual(action, chooseBotAction(projectState(state, 'p0'), 'p0'));
  state.players.slice(1).forEach(player => player.hand.reverse());
  state.deck.reverse();
  assert.deepEqual(chooseBotAction(state, 'p0'), action);
  const other = state.players[1].hand;
  [other[0], state.deck[0]] = [state.deck[0], other[0]];
  assert.deepEqual(chooseBotAction(state, 'p0'), action);
  assert.equal(chooseBotAction(state, 'p1'), null);
});

test('240 complete solo/multiplayer simulations preserve cards and terminate with legal moves', () => {
  let totalTurns = 0, maxTurns = 0;
  for (const count of [2, 3, 4, 5]) for (let seed = 1; seed <= 60; seed++) {
    let state = createGame({ players: players(count), seed: seed + count * 10000 });
    let turns = 0;
    while (state.status === 'playing') {
      assert.ok(++turns <= 1500, `${count}-player game ${seed} did not finish`);
      const id = state.players[state.turn].id;
      const action = chooseBotAction(projectState(state, id), id);
      assert.ok(action);
      state = applyAction(state, id, action);
      conserved(state);
      assert.ok(SUITS.includes(state.currentSuit));
    }
    assert.ok(state.winnerIds.length);
    totalTurns += turns; maxTurns = Math.max(maxTurns, turns);
  }
  console.log(`One Card: 240 games, ${totalTurns} turns, longest ${maxTurns} turns.`);
});
