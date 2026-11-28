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

test('lower levels progressively narrow the candidate scores in the same position', async () => {
 const { analyzeJanggiMasterMove } = await import('../games/janggi/master-ai.mjs');
 const root = { b: Array(90).fill(''), n: 30, t: 'c' };
 const values = [0, 15, 45, 90, 180];
 const moves = values.map((_, i) => ({ f: 10, t: 20+i }));
 const rules = {
  moves: () => moves, apply: (state, move) => ({ ...state, n: state.n+1, score: values[move.t-20] }),
  evaluate: state => state.score, isCheck: () => false, isDraw: () => false, captures: () => []
 };
 for (const [level, last] of [['easy',3], ['normal',2], ['hard',1]]) {
  const pick = random => analyzeJanggiMasterMove(root, rules, { level, maxDepth: 1, random }).move;
  assert.deepEqual(pick(() => 0), moves[0]);
  assert.deepEqual(pick(() => 0.999), moves[last]);
 }
});

test('all six worker levels return legal moves under their own search limits', async () => {
 const { createJanggiStart, janggiRules } = await import('../games/janggi/worker-rules.mjs');
 const { JANGGI_LEVELS } = await import('../games/janggi/master-ai.mjs');
 const state = createJanggiStart(), legal = janggiRules.moves(state);
 const replies = [];
 globalThis.self = { postMessage: message => replies.push(message) };
 try {
  await import('../games/janggi/master-worker.mjs');
  for (const [level, config] of Object.entries(JANGGI_LEVELS)) {
   await self.onmessage({ data: { requestId: level, level, budgetMs: 100, state } });
   const reply = replies.at(-1);
   assert.equal(reply.requestId, level);
   assert.equal(reply.error, undefined);
   assert.ok(legal.some(move => move.f === reply.move.f && move.t === reply.move.t));
   assert.ok(reply.nodes > 0 && reply.nodes <= config.nodes);
  }
 } finally { delete globalThis.self; }
});

test('background AI turn applies a verified move and ignores an abandoned match', async () => {
 const move = { f: 54, t: 45 }, queued = [], applied = [];
 const makeSession = () => ({ kind: 'janggi', level: 'master', s: { b: Array(90).fill(''), t: 'h' }, thinking: false });
 const context = vm.createContext({
  E: makeSession(),
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

test('advanced tiers load the revised worker with the independent Janggi release', () => {
 const revision = JSON.parse(fs.readFileSync(path.join(root, 'game-release.json'), 'utf8')).revision;
 const assets = fs.readFileSync(path.join(root, 'shared/games/world-game-assets.js'), 'utf8');
 assert.ok(source.includes('master-worker.mjs?v=20261128-janggi-points1'));
 assert.ok(source.includes(`world-game-assets.js?v=${revision}`));
 assert.ok(assets.includes(`const revision='${revision}'`));
 const version = assets.match(/janggi:'(\d+)\.(\d+)\.(\d+)'/)?.slice(1).map(Number);
 assert.ok(version && (version[0]>1 || version[0]===1 && (version[1]>9 || version[1]===9 && version[2]>=1)),
  'the game has its independent release');
});

test('optimized search agrees with the game arbiter across every starting layout',async()=>{
 const {createJanggiStart,janggiRules}=await import('../games/janggi/worker-rules.mjs');
 const {searchRules}=await import('../games/janggi/search-rules.mjs');
 const layouts=['eheh','ehhe','heeh','hehe'];
 let seed=31;
 for(const c of layouts)for(const h of layouts){
  let state=createJanggiStart({c,h});
  for(let ply=0;ply<50;ply++){
   const legal=janggiRules.moves(state);
   assert.deepEqual(searchRules.moves(state),legal);
   assert.deepEqual(searchRules.captures(state),legal.filter(move=>move.x));
   assert.equal(searchRules.isCheck(state),janggiRules.isCheck(state));
   if(!legal.length)break;
   seed=(Math.imul(1664525,seed)+1013904223)>>>0;
   state=janggiRules.apply(state,legal[seed%legal.length]);
  }
 }
});

test('all advanced levels finish a point win by passing and find a quiet chariot mate',async()=>{
 const {createJanggiStart,janggiRules}=await import('../games/janggi/worker-rules.mjs');
 const {searchRules}=await import('../games/janggi/search-rules.mjs');
 const {analyzeJanggiMasterMove}=await import('../games/janggi/master-ai.mjs');
 const han=janggiRules.apply(createJanggiStart(),{pass:1});
 const b=Array(90).fill('');
 for(const [sq,piece] of [[0,'R'],[12,'a'],[13,'k'],[39,'P'],[41,'H'],[75,'K'],[86,'C'],[89,'p']])b[sq]=piece;
 const puzzle={b,t:'c',n:24,passes:0};
 for(const level of ['pro','master','grandmaster']){
  const choose=state=>analyzeJanggiMasterMove(state,searchRules,{level,budgetMs:150,random:()=>0}).move;
  assert.deepEqual(choose(han),{pass:1});
  assert.equal(janggiRules.status(janggiRules.apply(han,{pass:1})).result,'h');
  assert.deepEqual(choose(puzzle),{f:0,t:5});
  assert.equal(janggiRules.status(janggiRules.apply(puzzle,{f:0,t:5})).reason,'checkmate');
 }
});
