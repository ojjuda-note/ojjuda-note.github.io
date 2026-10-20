const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'world.html'), 'utf8');
const start = html.indexOf('var uh=500'), end = html.indexOf('var H0={}');
assert.ok(start > 0 && end > start);
function engine(seed = 101, clock = Date) {
  const math = Object.create(Math);
  math.random = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
  return Function('Math', 'Date', html.slice(start, end) + `;return {
    init:nn, shot:Ys, plan:blPlanAiShot, simulate:ta, judge:ea, canPlace:Qa,
    track:blUpdateAiRun, setPlanner:fn=>{blPlanAiShot=fn}
  };`)(math, clock);
}
const fixtures = [
  ['carom4', {dx:-.239983, dy:-.970777, v:1900, top:.7, side:0}],
  ['carom3', {dx:.656498, dy:-.754328, v:2400, top:.3, side:-.6}]
];
for (const [mode, planned] of fixtures) {
  const e = engine(), st = e.init(mode, 5); st.turn = 'p2';
  assert.equal(e.judge(st, e.simulate(st, planned, false)).keep, true, mode + ': fixture really scores');
  e.setPlanner(() => planned);
  const before = JSON.stringify(st), totals = {};
  for (const level of ['easy', 'normal', 'hard']) {
    for (const run of [0, 2]) {
      let score = 0;
      const sample = engine(101); sample.setPlanner(() => planned);
      for (let n = 0; n < 256; n++) {
        const shot = sample.shot(st, level, run);
        assert.ok(Number.isFinite(shot.dx) && Number.isFinite(shot.dy));
        assert.ok(Math.abs(Math.hypot(shot.dx, shot.dy) - 1) < .000002);
        assert.ok(shot.v >= 120 && shot.v <= 3100);
        score += Number(sample.judge(st, sample.simulate(st, shot, false)).keep);
      }
      totals[level + run] = score;
    }
  }
  assert.equal(JSON.stringify(st), before, 'AI planning never changes the table or score');
  assert.ok(totals.normal0 > 10 && totals.normal0 < 240, mode + ': normal can both score and miss');
  assert.ok(totals.normal2 < totals.normal0 * .8, mode + ': accuracy falls after consecutive scores');
  assert.ok(totals.easy0 < totals.normal0 && totals.normal0 < totals.hard0, mode + ': difficulties remain distinct');
  console.log(mode, totals);
}
// Budget-expired fallback shots must receive the same execution error.
for (const mode of ['carom4', 'carom3']) {
  let now = 0; const e = engine(217, {now:()=>now += 5000});
  const st = e.init(mode), planned = e.plan(st), actual = e.shot(st);
  assert.notDeepEqual(actual, planned, mode + ': fallback no longer fires a perfect shot');
}
// A legal pocket-ball placement survives execution error, including a break.
for (const breaking of [true, false]) {
  const e = engine(301), st = e.init('pool8'); st.turn='p2'; st.breakShot=breaking;
  const before = JSON.stringify(st), actual = e.shot(st, 'normal', 2);
  assert.ok(e.canPlace(st, actual.cx, actual.cy), 'AI keeps its legal ball-in-hand placement');
  assert.equal(JSON.stringify(st), before);
  const result = e.judge(st, e.simulate(st, actual, false));
  assert.ok(['p1','p2'].includes(result.st.turn));
}
const e = engine(), game = {mode:'ai', me:'p1', st:{turn:'p2'}, aiRun:0};
const keep = {keep:true, st:{over:null}}, miss = {keep:false, st:{over:null}};
e.track(game, keep); e.track(game, keep); assert.equal(game.aiRun, 2);
e.track(game, miss); assert.equal(game.aiRun, 0, 'a missed shot resets the AI run');
game.aiRun=3; game.st.turn='p1'; e.track(game, keep); assert.equal(game.aiRun, 0, 'player shots cannot extend the AI run');
for (const mode of ['online','local']) {
  const other = {mode, me:'p1', st:{turn:'p2'}, aiRun:4};
  e.track(other, keep); assert.equal(other.aiRun, 4, mode + ' rules remain untouched');
}
assert.match(html, /Ys\(k\.st,k\.level,k\.aiRun\)/, 'controller passes the current run');
assert.match(html, /blUpdateAiRun\(k,r\);k\.anim=null/, 'run is updated once on shot completion');
const factory = html.slice(html.indexOf('function tp('), html.indexOf('var go=()=>'));
const newGame = Function('D','g','newPracticeStreakRound','nn', factory+';return tp;')({online:false}, {}, ()=>null, e.init);
assert.equal(newGame('carom4','ai').aiRun, 0, 'new games reset the AI run');
console.log('PASS: billiards AI errors, difficulty, consecutive scoring, placement and turn reset');
