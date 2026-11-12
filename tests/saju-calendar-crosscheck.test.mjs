import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaju } from '../games/starlit-saju/engine.mjs';
import { analyzeFortune } from '../games/starlit-saju/fortune-data.mjs';
import { getReadingSources } from '../games/starlit-saju/sources.mjs';

// Independent, minute-precision calendar facts from KASI's 2026 calendar data:
// https://astro.kasi.re.kr/kor/life/post/calendarData?search_year=2026
// The page explicitly labels these as preliminary data, not the announced
// official almanac. This comparison does not certify second-level precision.
const JIE_2026 = [
  ['소한', '2026-01-05T17:23:00+09:00'],
  ['입춘', '2026-02-04T05:02:00+09:00'],
  ['경칩', '2026-03-05T22:59:00+09:00'],
  ['청명', '2026-04-05T03:40:00+09:00'],
  ['입하', '2026-05-05T20:49:00+09:00'],
  ['망종', '2026-06-06T00:48:00+09:00'],
  ['소서', '2026-07-07T10:57:00+09:00'],
  ['입추', '2026-08-07T20:43:00+09:00'],
  ['백로', '2026-09-07T23:41:00+09:00'],
  ['한로', '2026-10-08T15:29:00+09:00'],
  ['입동', '2026-11-07T18:52:00+09:00'],
  ['대설', '2026-12-07T11:53:00+09:00'],
];

test('the twelve 2026 month boundaries agree with independent KASI minute data', () => {
  const now = new Date('2026-11-13T00:00:00+09:00');
  const chart = calculateSaju({ year: 2005, month: 12, day: 23, hour: 8, minute: 37 }, { now });
  const fortune = analyzeFortune(chart, { year: 2026, now });
  assert.equal(fortune.months.length, JIE_2026.length);
  fortune.months.forEach((month, index) => {
    const [term, minuteIso] = JIE_2026[index];
    assert.equal(month.start.term, term);
    const secondsDifference = Math.abs(Date.parse(month.start.iso) - Date.parse(minuteIso)) / 1000;
    assert.ok(secondsDifference <= 30, `${term}: ${secondsDifference}s difference from minute reference`);
  });
  assert.equal(fortune.annual.start.iso, fortune.months[1].start.iso);
});

test('source scopes preserve lifelong year independence and limit the calendar claim to 2026', () => {
  assert.deepEqual(getReadingSources('lifelong', 2026), getReadingSources('lifelong', 2027));
  for (const topic of ['annual', 'monthly']) {
    const calendar = getReadingSources(topic, 2026).find(source => source.id === 'kasi-2026-calendar-check');
    assert.ok(calendar);
    assert.match(calendar.limitation, /공식 월력요항 발표 전/);
    assert.match(calendar.limitation, /2026년 12절/);
    assert.equal(getReadingSources(topic, 2027).some(source => source.id === calendar.id), false);
  }
});
