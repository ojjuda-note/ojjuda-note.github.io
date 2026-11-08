const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../world.html'), 'utf8');
const rules = vm.createContext({ Date, Math });
vm.runInContext(source.slice(source.indexOf('var Yh='), source.indexOf('var Xe=')), rules);
const api = {
 moves: rules.Dr, apply: rules.ca, evaluate: rules.pl,
 isCheck: rules.hl, isDraw: rules.jgBikjangDraw, status: rules.Mp
};
const plain = value => JSON.parse(JSON.stringify(value));

test('the Janggi menu has four levels, without adding pro to chess', async () => {
 vm.runInContext(source.slice(source.indexOf('var Xe='), source.indexOf('function pa(')), rules);
 vm.runInContext(source.slice(source.indexOf('function jgChooser('), source.indexOf('async function vn(')), rules);
 vm.runInContext(source.slice(source.indexOf('var Qp={'), source.indexOf('var to=[]')), rules);
 rules.g = {};
 rules.D = { online: false };
 rules.document = { getElementById: () => null };
 rules.ln = async () => '';
 rules.newPracticeStreakRound = () => null;

 const janggi = await rules.Hp('janggi');
 const chess = await rules.Hp('chess');
 assert.deepEqual([...janggi.matchAll(/data-act="bd-lv" data-v="([^"]+)"/g)].map(match => match[1]), ['easy', 'normal', 'hard', 'pro']);
 assert.deepEqual([...chess.matchAll(/data-act="bd-lv" data-v="([^"]+)"/g)].map(match => match[1]), ['easy', 'normal', 'hard']);

 rules.Qp['bd-lv']({ k: 'janggi', v: 'pro' });
 assert.equal(rules.g.bdLevel, 'pro');
 let launched;
 rules.zp = (kind, mode, options) => { launched = { kind, mode, ...options }; };
 rules.Qp['bd-start']({ k: 'janggi', mode: 'ai' });
 assert.equal(launched.level, 'pro');
 assert.equal(launched.kind, 'janggi');
});

test('pro AI chooses only legal moves and never changes the current board', async () => {
 const { chooseJanggiProMove } = await import('../games/janggi/pro-ai.mjs');
 for (const [c, h] of [['eheh', 'hehe'], ['heeh', 'ehhe']]) {
  const state = rules.vp({ c, h });
  const before = plain(state);
  const move = chooseJanggiProMove(state, api, 120);
  assert.ok(move, 'AI has an opening move');
  assert.ok(rules.Dp(state, move), 'the game engine accepts the chosen move');
  assert.deepEqual(plain(state), before, 'search does not mutate the live game');
 }
});

test('pro search can see beyond a tempting shallow move', async () => {
 const { chooseJanggiProMove } = await import('../games/janggi/pro-ai.mjs');
 const root = { id: 0, t: 'c', n: 0 };
 const nodes = {
  0: [{ f: 10, t: 11, to: 1 }, { f: 10, t: 12, to: 2 }],
  1: [{ f: 20, t: 21, to: 3 }],
  2: [{ f: 20, t: 22, to: 4 }]
 };
 const makeState = state => ({ ...state, b: Array(90).fill('').map((_, i) => i === state.id ? 'P' : '') });
 const fakeRules = {
  moves: s => nodes[s.id] || [],
  apply: (s, move) => makeState({ id: move.to, t: s.t === 'c' ? 'h' : 'c', n: move.to > 2 ? 400 : s.n + 1 }),
  evaluate: s => ({ 0: 0, 1: -400, 2: -100, 3: -800, 4: 100 })[s.id],
  isCheck: () => false,
  isDraw: () => false,
  status: s => ({ over: s.n >= 400, result: s.id === 3 ? 'h' : 'c' })
 };
 const move = chooseJanggiProMove(makeState(root), fakeRules, 200);
 assert.deepEqual(plain(move), nodes[0][1], 'AI avoids the immediate reward that loses next turn');
});

test('pro results use the existing hard leaderboard until a separate pro rank exists', async () => {
 const start = source.indexOf('async function savePracticeStreak(');
 const end = source.indexOf('\n}\n', start) + 2;
 const calls = [];
 const ctx = vm.createContext({
  D: { online: true, user: { id: 'member' } },
  S: { rpc: async (_name, data) => { calls.push(data); return { data: { ok: true } }; } },
  notifyStreakSaved: () => {}, console
 });
 vm.runInContext(source.slice(start, end), ctx);
 const round = { id: 'round', owner: 'member', saved: false, pending: false, retry: { remove() {} } };
 await ctx.savePracticeStreak({ kind: 'janggi', mode: 'ai', level: 'pro', me: 'c', owner: 'member', streakRound: round }, 'c');
 assert.equal(calls[0].p_difficulty, 'hard');
 assert.equal(round.saved, true);
});
