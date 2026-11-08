const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'world.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(root, 'games/janggi/worker-rules.mjs'), 'utf8');
const plain = item => JSON.parse(JSON.stringify(item));

test('background Janggi rules stay identical to the live board rules', async () => {
 const original = source.slice(source.indexOf('var vt='), source.indexOf('var i2=1e5;'));
 assert.ok(original.length > 3000 && workerSource.includes(original), 'a change to Janggi rules must update the worker copy');
 const { createJanggiStart, janggiRules } = await import('../games/janggi/worker-rules.mjs');
 const live = vm.createContext({});
 vm.runInContext(source.slice(source.indexOf('var vt='), source.indexOf('var Xe=')), live);
 for (const [c, h] of [['eheh', 'hehe'], ['heeh', 'ehhe']]) {
  let board = createJanggiStart({ c, h }), expected = live.vp({ c, h });
  for (let turn = 0; turn < 6; turn++) {
   assert.deepEqual(plain(board), plain(expected));
   const moves = janggiRules.moves(board), expectedMoves = live.Dr(expected);
   assert.deepEqual(plain(moves), plain(expectedMoves));
   assert.equal(janggiRules.evaluate(board), live.pl(expected));
   assert.deepEqual(plain(janggiRules.status(board)), plain(live.Mp(expected)));
   const move = moves[turn % moves.length];
   board = janggiRules.apply(board, move);
   expected = live.ca(expected, expectedMoves[turn % expectedMoves.length]);
  }
 }
});

test('master and grandmaster choose legal, immutable and time-bounded opening moves', async () => {
 const { createJanggiStart, janggiRules } = await import('../games/janggi/worker-rules.mjs');
 const { analyzeJanggiMasterMove } = await import('../games/janggi/master-ai.mjs');
 for (const level of ['master', 'grandmaster']) {
  const state = createJanggiStart({ c: 'hehe', h: 'eheh' });
  const before = plain(state);
  const analysis = analyzeJanggiMasterMove(state, janggiRules, { level, budgetMs: 150 });
  assert.ok(janggiRules.moves(state).some(move => move.f === analysis.move.f && move.t === analysis.move.t));
  assert.ok(analysis.depth >= 1, 'a complete search depth is reported');
  assert.ok(analysis.elapsedMs < 1000, 'the engine respects the provided test budget');
  assert.deepEqual(plain(state), before, 'the engine never changes the live board');
 }
});

test('master engine looks past an attractive losing capture', async () => {
 const { chooseJanggiMasterMove } = await import('../games/janggi/master-ai.mjs');
 const nodes = { 0: [{ f: 10, t: 11, to: 1 }, { f: 10, t: 12, to: 2 }], 1: [{ f: 20, t: 21, to: 3 }], 2: [{ f: 20, t: 22, to: 4 }] };
 const make = (id, turn = 'c') => ({ id, t: turn, n: 0, b: Array(90).fill('').map((_, idx) => idx === id ? 'P' : '') });
 const rules = {
  moves: state => nodes[state.id] || [],
  apply: (state, move) => make(move.to, state.t === 'c' ? 'h' : 'c'),
  evaluate: state => ({ 0: 0, 1: -400, 2: -100, 3: -800, 4: 100 })[state.id],
  isCheck: () => false,
  isDraw: () => false,
  status: () => ({ over: false })
 };
 const move = chooseJanggiMasterMove(make(0), rules, { level: 'master', budgetMs: 180, maxDepth: 2 });
 assert.equal(move.to, 2);
});

test('module worker returns a legal move with a matching request ID', async () => {
 const { createJanggiStart, janggiRules } = await import('../games/janggi/worker-rules.mjs');
 const replies = [];
 globalThis.self = { postMessage: message => replies.push(message) };
 try {
  await import('../games/janggi/master-worker.mjs');
  globalThis.self.onmessage({ data: { requestId: 13, level: 'master', budgetMs: 100, state: createJanggiStart() } });
  assert.equal(replies[0].requestId, 13);
  assert.equal(replies[0].error, undefined);
  assert.ok(janggiRules.moves(createJanggiStart()).some(move => move.f === replies[0].move.f && move.t === replies[0].move.t));
 } finally { delete globalThis.self; }
});

test('background AI turn applies a verified move and ignores an abandoned match', async () => {
 const move = { f: 54, t: 45 }, queued = [], applied = [];
 const makeSession = () => ({ kind: 'janggi', level: 'master', s: { b: Array(90).fill(''), t: 'h' }, thinking: false });
 const context = vm.createContext({
  E: makeSession(), JG_MASTER_BUDGETS: { master: 4500 },
  h2: () => {}, Dr: () => [move], hl: () => false,
  jgMasterThink: () => new Promise(resolve => queued.push(resolve)),
  Ka: next => applied.push(next), pa: () => {}, Je: () => {},
  console, setTimeout, qt: false, wn: 520
 });
 vm.runInContext(source.slice(source.indexOf('function Fl(){'), source.indexOf('function g2(t){')), context);
 context.Fl();
 assert.equal(context.E.thinking, true);
 assert.equal(applied.length, 0, 'the board stays responsive while the worker thinks');
 queued.shift()(move);
 await new Promise(setImmediate);
 assert.deepEqual(plain(applied), [move]);
 assert.equal(context.E.thinking, false);

 context.E = makeSession();
 context.Fl();
 const abandoned = context.E;
 context.E = makeSession();
 queued.shift()(move);
 await new Promise(setImmediate);
 assert.equal(abandoned.thinking, true, 'stale AI replies cannot change a departed game');
 assert.equal(applied.length, 1);
});

test('advanced tiers have matching game release and worker cache revisions', () => {
 const revision = JSON.parse(fs.readFileSync(path.join(root, 'game-release.json'), 'utf8')).revision;
 const assets = fs.readFileSync(path.join(root, 'shared/games/world-game-assets.js'), 'utf8');
 assert.ok(source.includes(`master-worker.mjs?v=${revision}`));
 assert.ok(source.includes(`world-game-assets.js?v=${revision}`));
 assert.ok(assets.includes(`const revision='${revision}'`));
 assert.ok(assets.includes("janggi:'1.9.0'"));
});
