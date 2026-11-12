import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaju, SajuInputError } from '../games/starlit-saju/engine.mjs';

const now = new Date('2026-11-12T12:00:00Z');
const chart = (input) => calculateSaju({ calendar: 'solar', leapMonth: false, ...input }, { now });
const hanja = value => value.pillars.map(item => item.hanja);

test('published 6tail example produces the known four pillars and eight elements', () => {
  const result = chart({ year: 2005, month: 12, day: 23, hour: 8, minute: 37 });
  assert.deepEqual(hanja(result), ['乙酉', '戊子', '辛巳', '壬辰']);
  assert.equal(result.dayMaster.hangul, '신');
  assert.equal(result.knownCharacterCount, 8);
  assert.equal(result.elements.reduce((sum, item) => sum + item.count, 0), 8);
  assert.deepEqual(result.elements.map(item => item.count), [1, 1, 2, 2, 2]);
});

test('Korean leap-month example maps to the same chart as the solar birth date', () => {
  const solar = chart({ year: 2017, month: 6, day: 24, hour: 9, minute: 30 });
  const lunar = chart({ year: 2017, month: 5, day: 1, calendar: 'lunar', leapMonth: true, hour: 9, minute: 30 });
  assert.deepEqual(hanja(lunar), hanja(solar));
  assert.equal(lunar.solar.iso, '2017-06-24');
  assert.equal(solar.lunar.leapMonth, true);
  assert.equal(solar.pillars[2].hanja, '壬午');
});

test('Korean solar/lunar published 1956 conversion keeps day pillar', () => {
  const result = chart({ year: 1956, month: 1, day: 21, calendar: 'lunar', hour: null });
  assert.equal(result.solar.iso, '1956-03-03');
  assert.equal(result.pillars[2].hanja, '己巳');
});

test('uses the Korean lunar date on a date that differs from the Chinese lunar calendar', () => {
  const solar = chart({ year: 1982, month: 11, day: 16, hour: 12 });
  const lunar = chart({ year: 1982, month: 10, day: 1, calendar: 'lunar', hour: 12 });
  assert.equal(solar.lunar.month, 10);
  assert.equal(solar.lunar.day, 1);
  assert.equal(lunar.solar.iso, '1982-11-16');
  assert.deepEqual(hanja(solar), hanja(lunar));
});

test('nonexistent dates, invalid leap month, future date, and invalid time are rejected', () => {
  for (const input of [
    { year: 2023, month: 2, day: 29 },
    { year: 2024, month: 4, day: 31 },
    { year: 2017, month: 6, day: 1, calendar: 'lunar', leapMonth: true },
    { year: 2026, month: 11, day: 13 },
    { year: 2026, month: 11, day: 12, hour: 22 },
    { year: 2005, month: 12, day: 23, hour: 24 },
    { year: 2005, month: 12, day: 23, hour: 9, minute: 60 },
    { year: 2005.5, month: 12, day: 23 },
    { year: 1899, month: 12, day: 23 },
    { year: 2005, month: 12, day: 23, leapMonth: true },
  ]) assert.throws(() => chart(input), SajuInputError, JSON.stringify(input));
  assert.equal(chart({ year: 2024, month: 2, day: 29 }).solar.iso, '2024-02-29');
  assert.equal(chart({ year: 1900, month: 1, day: 1 }).solar.iso, '1900-01-01');
});

test('published sect=2 at 23:00 keeps the civil day and continues the Zi hour through midnight', () => {
  const late = chart({ year: 1988, month: 2, day: 15, hour: 23, minute: 30 });
  const early = chart({ year: 1988, month: 2, day: 15, hour: 0, minute: 30 });
  const next = chart({ year: 1988, month: 2, day: 16, hour: 0, minute: 0 });
  assert.equal(late.pillars[2].hanja, '庚子');
  assert.equal(late.pillars[3].hanja, '戊子');
  assert.equal(early.pillars[3].hanja, '丙子');
  assert.equal(next.pillars[2].hanja, '辛丑');
  assert.equal(next.pillars[3].hanja, '戊子');
  assert.equal(late.pillars[3].hanja, next.pillars[3].hanja);
  assert.equal(early.timeKnown, true);
});

test('2024 ipchun uses 17:27 Korea time, not 16:27 China time', () => {
  const prior = chart({ year: 2024, month: 2, day: 4, hour: 17, minute: 26 });
  const after = chart({ year: 2024, month: 2, day: 4, hour: 17, minute: 28 });
  const chineseHour = chart({ year: 2024, month: 2, day: 4, hour: 16, minute: 28 });
  assert.deepEqual(hanja(prior).slice(0, 2), ['癸卯', '乙丑']);
  assert.deepEqual(hanja(chineseHour).slice(0, 2), ['癸卯', '乙丑']);
  assert.deepEqual(hanja(after).slice(0, 2), ['甲辰', '丙寅']);
  assert.equal(prior.pillars[2].hanja, after.pillars[2].hanja);
  assert.equal(prior.pillars[3].hanja, after.pillars[3].hanja);
});

test('solar-term minute is not silently rounded to a definite year/month', () => {
  const result = chart({ year: 2024, month: 2, day: 4, hour: 17, minute: 27 });
  assert.equal(result.pillars[0].hanja, null);
  assert.deepEqual(result.pillars[0].alternatives.map(item => item.hanja), ['癸卯', '甲辰']);
  assert.deepEqual(result.pillars[1].alternatives.map(item => item.hanja), ['乙丑', '丙寅']);
  assert.equal(result.knownCharacterCount, 4);
  assert.match(result.warnings.join(' '), /입력한 분/);
});

test('unknown hour has six known characters on an ordinary day', () => {
  const result = chart({ year: 2005, month: 12, day: 23, hour: null });
  assert.equal(result.timeKnown, false);
  assert.equal(result.pillars[3].hanja, null);
  assert.equal(result.pillars[3].reason, 'birth-time-unknown');
  assert.equal(result.knownCharacterCount, 6);
  assert.equal(result.elements.reduce((sum, item) => sum + item.count, 0), 6);
});

test('unknown time on ipchun keeps only the day pillar definite', () => {
  const result = chart({ year: 2024, month: 2, day: 4, hour: null });
  assert.equal(result.pillars[0].hanja, null);
  assert.equal(result.pillars[1].hanja, null);
  assert.equal(result.pillars[2].hanja, '戊戌');
  assert.equal(result.pillars[3].hanja, null);
  assert.equal(result.knownCharacterCount, 2);
  assert.equal(result.elements.reduce((sum, item) => sum + item.count, 0), 2);
  assert.match(result.warnings.join(' '), /절기/);
});

test('Korea midnight does not inherit the previous Chinese civil day', () => {
  const result = chart({ year: 2005, month: 12, day: 23, hour: 0, minute: 0 });
  assert.equal(result.pillars[2].hanja, '辛巳');
  assert.equal(result.pillars[3].hanja, '戊子');
});

test('input values are not mutated or stored and repeated calculations are deterministic', () => {
  const input = Object.freeze({ year: 2005, month: 12, day: 23, hour: 8, minute: 37 });
  assert.deepEqual(chart(input), chart(input));
});
