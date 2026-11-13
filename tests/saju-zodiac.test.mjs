import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaju } from '../games/starlit-saju/engine.mjs';
import { zodiacFromBirth, zodiacFromChart } from '../games/starlit-saju/zodiac.mjs';

const now = new Date('2026-11-13T03:00:00Z');
const birth = (input) => zodiacFromBirth({ calendar: 'solar', leapMonth: false, ...input }, { now });
const chart = (input) => calculateSaju({ calendar: 'solar', leapMonth: false, ...input }, { now });

test('all twelve animal labels come from the calculated year branches', () => {
  const expected = [
    [2008, '쥐', '子', '자'], [2009, '소', '丑', '축'],
    [2010, '호랑이', '寅', '인'], [2011, '토끼', '卯', '묘'],
    [2012, '용', '辰', '진'], [2013, '뱀', '巳', '사'],
    [2014, '말', '午', '오'], [2015, '양', '未', '미'],
    [2016, '원숭이', '申', '신'], [2017, '닭', '酉', '유'],
    [2018, '개', '戌', '술'], [2019, '돼지', '亥', '해'],
  ];
  for (const [year, animal, hanja, hangul] of expected) {
    const result = birth({ year, month: 6, day: 15, hour: null });
    assert.deepEqual(result, {
      status: 'confirmed', label: `${animal}띠`, animal,
      candidates: [{ animal, label: `${animal}띠`, hanja, hangul }],
      basis: '입춘 기준', note: '사주에서는 입춘부터 띠가 바뀌어요.',
    });
  }
});

test('January and the time before Li Chun keep the preceding animal', () => {
  assert.equal(birth({ year: 2024, month: 1, day: 1, hour: null }).label, '토끼띠');
  assert.equal(birth({ year: 2024, month: 2, day: 4, hour: 17, minute: 26 }).label, '토끼띠');
  assert.equal(birth({ year: 2024, month: 2, day: 4, hour: 16, minute: 28 }).label, '토끼띠');
  assert.equal(birth({ year: 2024, month: 2, day: 4, hour: 17, minute: 28 }).label, '용띠');
});

test('Li Chun changes the animal even while the Korean lunar year is unchanged', () => {
  const result = chart({ year: 2024, month: 2, day: 5, hour: 12, minute: 0 });
  assert.equal(result.lunar.year, 2023);
  assert.equal(zodiacFromChart(result).label, '용띠');
  assert.deepEqual(zodiacFromBirth({
    year: result.lunar.year, month: result.lunar.month, day: result.lunar.day,
    calendar: 'lunar', leapMonth: result.lunar.leapMonth, hour: 12, minute: 0,
  }, { now }), zodiacFromChart(result));
});

test('unknown birth time on Li Chun preserves both animal candidates', () => {
  const result = birth({ year: 2024, month: 2, day: 4, hour: null });
  assert.equal(result.status, 'uncertain');
  assert.equal(result.label, '토끼띠 / 용띠');
  assert.equal(result.animal, null);
  assert.deepEqual(result.candidates, [
    { animal: '토끼', label: '토끼띠', hanja: '卯', hangul: '묘' },
    { animal: '용', label: '용띠', hanja: '辰', hangul: '진' },
  ]);
  assert.match(result.note, /태어난 시간/);
});

test('the transition minute remains uncertain instead of rounding the animal', () => {
  const result = birth({ year: 2024, month: 2, day: 4, hour: 17, minute: 27 });
  assert.equal(result.status, 'uncertain');
  assert.equal(result.label, '토끼띠 / 용띠');
  assert.equal(result.animal, null);
  assert.match(result.note, /입력한 분 안/);
});

test('uncertainty in another pillar does not make the year animal uncertain', () => {
  const result = birth({ year: 2005, month: 12, day: 23, hour: null });
  assert.equal(result.status, 'confirmed');
  assert.equal(result.label, '닭띠');
});

test('a Korean leap-month birthday and its solar date share the same animal', () => {
  const lunar = birth({ year: 2017, month: 5, day: 1, calendar: 'lunar', leapMonth: true, hour: 9, minute: 30 });
  const solar = birth({ year: 2017, month: 6, day: 24, hour: 9, minute: 30 });
  assert.deepEqual(lunar, solar);
  assert.equal(lunar.label, '닭띠');
});

test('invalid, incomplete, future, and unsupported births keep engine errors', () => {
  for (const input of [
    { year: 2023, month: 2, day: 29 },
    { year: 2017, month: 6, day: 1, calendar: 'lunar', leapMonth: true },
    { year: 2024, month: 0, day: 0 },
    { year: 2027, month: 1, day: 1 },
    { year: 1899, month: 12, day: 1 },
    { year: 2024, month: 2, day: 4, hour: 24 },
  ]) assert.throws(() => birth(input), error => error.name === 'SajuInputError', JSON.stringify(input));
});

test('missing or incomplete chart data does not guess a year animal', () => {
  for (const value of [null, {}, { pillars: [] }, { pillars: [{ key: 'year', branch: null, alternatives: [] }] }]) {
    assert.deepEqual(zodiacFromChart(value), {
      status: 'unavailable', label: '띠 확인 필요', animal: null,
      candidates: [], basis: '입춘 기준', note: '출생 정보를 확인해 주세요.',
    });
  }
});

test('chart and birth input stay unchanged and display candidates are detached', () => {
  const input = Object.freeze({ year: 2024, month: 2, day: 4, hour: null });
  const value = chart(input), before = structuredClone(value);
  const first = zodiacFromChart(value);
  first.candidates[0].animal = '변경';
  assert.deepEqual(value, before);
  assert.equal(zodiacFromChart(value).candidates[0].animal, '토끼');
  assert.deepEqual(birth(input), birth(input));
});
