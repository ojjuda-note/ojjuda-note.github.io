const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../features/lifetime');
const env = vm.createContext({});
for (const file of ['population', 'research', 'estimate', 'conditions', 'survival']) {
  vm.runInContext(fs.readFileSync(path.join(root, file + '.js'), 'utf8'), env);
}
const { combinedEstimate, lifestyleRisk, population } =
  vm.runInContext('({ combinedEstimate, lifestyleRisk, population })', env);

function* partialAnswers(prefix = []) {
  if (prefix.length === 5) yield prefix;
  else for (const answer of [null, false, true]) yield* partialAnswers([...prefix, answer]);
}

test('smoking stays in its study when an exercise answer is added', () => {
  const age = 43.61;
  const estimate = fields => combinedEstimate(age, { basis: 'men', ...fields });
  const baseline = estimate({});
  const smoker = estimate({ smoke: '2' });
  const combined = estimate({ smoke: '2', exercise: '1' });
  const smokingRow = model => model.rows.find(row => row.key === 'smokingOnly');
  assert.ok(smoker.years < baseline.years);
  assert.ok(combined.years < smoker.years);
  assert.deepEqual(smokingRow(combined), smokingRow(smoker));
  assert.equal(combined.rows.find(row => row.key === 'lifestyle').label, '생활습관 (운동)');
});

test('every partial joint score is bounded by adding the next answer', () => {
  for (const sex of ['men', 'women']) {
    const curve = population.national[sex];
    for (const age of [19, 43.61, 79, 99]) {
      const risk = flags => lifestyleRisk(curve, age, sex, flags);
      const empty = risk(Array(5).fill(null));
      assert.equal(empty.selected, empty.base);
      const scores = new Map();
      for (const flags of partialAnswers()) scores.set(JSON.stringify(flags), risk(flags).selected);
      for (const flags of partialAnswers()) {
        const before = scores.get(JSON.stringify(flags));
        for (const [i, flag] of flags.entries()) {
          if (flag !== null) continue;
          const next = flags.slice();
          next[i] = false;
          assert.ok(scores.get(JSON.stringify(next)) <= before + 1e-12);
          next[i] = true;
          assert.ok(scores.get(JSON.stringify(next)) >= before - 1e-12);
        }
      }
    }
  }
});

test('adding an adverse habit never extends the integrated estimate', () => {
  const habits = ['smoke', 'drink', 'exercise', 'bmi', 'sleepBand'];
  const choices = [['0', '2'], ['2', '3'], ['0', '1'], ['1', '3'], ['2', '3']];
  for (const [age, basis, region] of [[25, 'women', ''], [43.61, 'men', ''], [65, '', '서울']]) {
    const estimates = new Map();
    for (const flags of partialAnswers()) {
      const fields = { basis, region };
      flags.forEach((flag, i) => {
        if (flag !== null) fields[habits[i]] = choices[i][Number(flag)];
      });
      const years = combinedEstimate(age, fields).years;
      assert.ok(Number.isFinite(years));
      estimates.set(JSON.stringify(flags), years);
    }
    for (const flags of partialAnswers()) {
      for (const [i, flag] of flags.entries()) {
        if (flag === true) continue;
        const next = flags.slice();
        next[i] = true;
        assert.ok(estimates.get(JSON.stringify(next)) <= estimates.get(JSON.stringify(flags)) + 1e-9,
          JSON.stringify({ age, basis, flags, adding: habits[i] }));
      }
    }
  }
});

test('detailed and legacy inputs do not duplicate a lifestyle factor', () => {
  const detailed = combinedEstimate(50, { basis: 'men', activity: '2', exercise: '1', smoke: '2',
    metabolic: '1', bmi: '2', sleepBand: '2', drink: '4' });
  const keys = Array.from(detailed.rows, row => row.key).sort();
  assert.deepEqual(keys, ['activity', 'alcoholOnly', 'metabolic', 'sleep', 'smokingOnly']);
  const legacy = combinedEstimate(43, { basis: 'women', smoke: '3', drink: '6', sleepBand: '4' });
  assert.equal(legacy.rows.length, 1);
  assert.equal(legacy.rows[0].key, 'lifestyle');
  assert.ok(Number.isFinite(legacy.years));
});
