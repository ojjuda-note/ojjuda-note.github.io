import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { CYCLES, isoToDay, dayToISO, todayInSeoul, addDays, calculate, makeSeries } from '../features/biorhythm/engine.mjs';

const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be close to ${expected}`);

test('Gregorian dates distinguish century leap years and reject normalized inputs', () => {
  assert.equal(addDays('2000-02-28', 1), '2000-02-29');
  assert.equal(addDays('2000-02-28', 2), '2000-03-01');
  assert.equal(addDays('1900-02-28', 1), '1900-03-01');
  assert.equal(addDays('2100-02-28', 1), '2100-03-01');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  for (const value of ['1900-02-29', '2100-02-29', '2026-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00']) {
    assert.throws(() => isoToDay(value), RangeError, value);
  }
  for (const value of ['2026-2-01', '2026-01-1', '2026/01/01', '2026-01-01T00:00:00Z', ' 2026-01-01', '', null, new Date()]) {
    assert.throws(() => isoToDay(value), TypeError);
  }
});

test('the supported date endpoints round-trip and reject out-of-range arithmetic', () => {
  for (const value of ['1900-01-01', '1970-01-01', '2000-02-29', '2026-11-13', '2100-12-31']) {
    assert.equal(dayToISO(isoToDay(value)), value);
  }
  assert.equal(isoToDay('1970-01-01'), 0);
  assert.throws(() => isoToDay('1899-12-31'), RangeError);
  assert.throws(() => isoToDay('2101-01-01'), RangeError);
  assert.throws(() => addDays('1900-01-01', -1), RangeError);
  assert.throws(() => addDays('2100-12-31', 1), RangeError);
  assert.throws(() => addDays('2026-01-01', 0.5), TypeError);
  assert.throws(() => dayToISO(NaN), TypeError);
});

test('birth is day zero and an independently counted long interval includes leap days', () => {
  const born = calculate('2000-01-01', '2000-01-01');
  assert.equal(born.days, 0);
  assert.deepEqual(born.cycles.map(cycle => cycle.value), [0, 0, 0]);
  assert.deepEqual(born.cycles.map(cycle => cycle.phase), [0, 0, 0]);
  assert.deepEqual(born.cycles.map(cycle => cycle.direction), ['rising', 'rising', 'rising']);
  assert.equal(calculate('2000-01-01', '2026-11-13').days, 9813);
  assert.throws(() => calculate('2026-11-13', '2026-11-12'), /생일/);
});

test('each cycle returns to zero, without negative zero, after its full period', () => {
  assert.deepEqual(CYCLES.map(cycle => cycle.period), [23, 28, 33]);
  for (const cycle of CYCLES) {
    for (const multiple of [1, 10, 1000]) {
      const result = calculate('1900-01-01', addDays('1900-01-01', cycle.period * multiple)).cycles.find(item => item.id === cycle.id);
      assert.equal(result.value, 0);
      assert.equal(Object.is(result.value, -0), false);
      assert.equal(Object.is(result.rounded, -0), false);
      assert.equal(result.phase, 0);
    }
  }
});

test('known quarter-cycle reference points have the correct signed values and direction', () => {
  const emotionAt = day => calculate('2000-01-01', addDays('2000-01-01', day)).cycles[1];
  assert.equal(emotionAt(7).value, 100);
  assert.equal(emotionAt(7).direction, 'turning');
  assert.equal(emotionAt(14).value, 0);
  assert.equal(emotionAt(14).direction, 'falling');
  assert.equal(emotionAt(21).value, -100);
  assert.equal(emotionAt(21).direction, 'turning');
  assert.equal(emotionAt(28).direction, 'rising');
  assert.equal(emotionAt(7).phase, 0.25);
  assert.equal(emotionAt(21).phase, 0.75);
  close(calculate('2000-01-01', '2000-01-02').cycles[0].value, 26.979677115702427);
  close(calculate('2000-01-01', '2000-01-02').cycles[2].value, 18.92512443604102);
});

test('positive and negative positions are classified separately from slope', () => {
  const emotionAt = day => calculate('2000-01-01', addDays('2000-01-01', day)).cycles[1];
  assert.equal(emotionAt(1).band, 'positive');
  assert.equal(emotionAt(3).band, 'high');
  assert.equal(emotionAt(14).band, 'neutral');
  assert.equal(emotionAt(15).band, 'negative');
  assert.equal(emotionAt(17).band, 'low');
  assert.equal(emotionAt(10).direction, 'falling');
  assert.ok(emotionAt(10).value > 0);
  assert.equal(emotionAt(25).direction, 'rising');
  assert.ok(emotionAt(25).value < 0);
});

test('the default graph covers 31 consecutive dates and matches selected-day calculations', () => {
  const series = makeSeries('2000-01-01', '2026-11-13');
  assert.equal(series.length, 31);
  assert.equal(series[0].date, '2026-10-29');
  assert.equal(series[15].date, '2026-11-13');
  assert.equal(series.at(-1).date, '2026-11-28');
  for (const row of series) {
    const report = calculate('2000-01-01', row.date);
    assert.equal(row.days, report.days);
    for (const cycle of report.cycles) {
      assert.equal(row[cycle.id], cycle.value);
      assert.ok(row[cycle.id] >= -100 && row[cycle.id] <= 100);
    }
  }
  assert.equal(makeSeries('2000-01-01', '2026-11-13', 1)[0].date, '2026-11-13');
});

test('graph windows clip at birth and the date range without inventing pre-birth readings', () => {
  const birth = makeSeries('2026-11-13', '2026-11-13');
  assert.equal(birth.length, 16);
  assert.equal(birth[0].date, '2026-11-13');
  assert.equal(birth[0].days, 0);
  assert.equal(birth.at(-1).date, '2026-11-28');
  const end = makeSeries('2000-01-01', '2100-12-31');
  assert.equal(end.length, 16);
  assert.equal(end.at(-1).date, '2100-12-31');
  const beginning = makeSeries('1900-01-01', '1900-01-01');
  assert.equal(beginning[0].date, '1900-01-01');
  assert.throws(() => makeSeries('2026-11-13', '2026-11-12'), /생일/);
  for (const span of [0, -1, 1.5, Infinity, '31']) assert.throws(() => makeSeries('2000-01-01', '2026-11-13', span));
});

test('today changes at midnight in Seoul, including leap-day and year boundaries', () => {
  assert.equal(todayInSeoul(new Date('2026-11-12T14:59:59Z')), '2026-11-12');
  assert.equal(todayInSeoul(new Date('2026-11-12T15:00:00Z')), '2026-11-13');
  assert.equal(todayInSeoul(new Date('2024-02-28T15:00:00Z')), '2024-02-29');
  assert.equal(todayInSeoul(new Date('2026-12-31T15:00:00Z')), '2027-01-01');
  assert.throws(() => todayInSeoul(new Date(NaN)), TypeError);
});

test('calendar-day results stay identical in multiple host zones and through DST changes', () => {
  const engineURL = new URL('../features/biorhythm/engine.mjs', import.meta.url).href;
  const script = `import { calculate, todayInSeoul, addDays } from ${JSON.stringify(engineURL)};
    process.stdout.write(JSON.stringify({ spring: calculate('2026-03-07', '2026-03-09'), fall: calculate('2026-10-31', '2026-11-02'), next: addDays('2026-03-08', 1), today: todayInSeoul(new Date('2026-11-12T15:00:00Z')) }));`;
  const outputs = ['UTC', 'Asia/Seoul', 'America/New_York', 'Europe/Berlin', 'Pacific/Kiritimati'].map(TZ => execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' }));
  for (const output of outputs) assert.equal(output, outputs[0]);
  const result = JSON.parse(outputs[0]);
  assert.equal(result.spring.days, 2);
  assert.equal(result.fall.days, 2);
  assert.equal(result.next, '2026-03-09');
  assert.equal(result.today, '2026-11-13');
});
