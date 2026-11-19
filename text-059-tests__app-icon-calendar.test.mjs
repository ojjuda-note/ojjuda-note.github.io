import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getThemeSelection, selectTheme, toKstDate } from '../shared/app-icons/selector.mjs';

const calendar = JSON.parse(readFileSync(new URL('../shared/app-icons/calendar.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(calendar);
const dayAfter = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// KASI normal-month 01-01 / 08-15 responses, independently cross-checked with
// korean-lunar-calendar 0.4.0. These are actual days, not substitute holidays.
const lunarDays = [
  [2026, '2026-02-17', '2026-09-25'],
  [2027, '2027-02-07', '2027-09-15'],
  [2028, '2028-01-27', '2028-10-03'],
  [2029, '2029-02-13', '2029-09-22'],
  [2030, '2030-02-03', '2030-09-12'],
  [2031, '2031-01-23', '2031-10-01'],
  [2032, '2032-02-11', '2032-09-19'],
  [2033, '2033-01-31', '2033-09-08'],
  [2034, '2034-02-19', '2034-09-27'],
  [2035, '2035-02-08', '2035-09-16'],
];

test('all four seasons cover the KST month boundaries', () => {
  for (const [date, theme] of [
    ['2026-02-28', 'winter'], ['2026-03-01', 'spring'],
    ['2026-05-31', 'spring'], ['2026-06-01', 'summer'],
    ['2026-08-31', 'summer'], ['2026-09-01', 'autumn'],
    ['2026-11-30', 'autumn'], ['2026-12-01', 'winter'],
    ['2028-02-29', 'winter'],
  ]) assert.equal(selectTheme(date, calendar), theme, date);
});

test('verified lunar events start at D-7, keep D+1, and then restore the season', () => {
  assert.deepEqual(calendar.lunarCoverage, { startYear: 2026, endYear: 2035 });
  assert.equal(calendar.datedEvents.length, 20);
  for (const [year, seollal, chuseok] of lunarDays) {
    for (const [theme, date, season] of [['seollal', seollal, 'winter'], ['chuseok', chuseok, 'autumn']]) {
      const id = `${theme}-${year}`;
      const event = calendar.datedEvents.find(item => item.id === id);
      assert.equal(event.eventDate, date, id);
      assert.equal(event.start, dayAfter(date, -7), id);
      assert.equal(event.end, dayAfter(date, 1), id);
      const before = dayAfter(date, -8);
      // 2033 Chuseok starts on September 1; D-8 is still August (summer).
      const beforeSeason = before.slice(5, 7) === '08' ? 'summer' : season;
      assert.equal(selectTheme(before, calendar), beforeSeason, `${id} D-8`);
      assert.equal(selectTheme(dayAfter(date, -7), calendar), theme, `${id} D-7`);
      assert.equal(selectTheme(date, calendar), theme, `${id} D`);
      assert.equal(selectTheme(dayAfter(date, 1), calendar), theme, `${id} D+1`);
      assert.equal(selectTheme(dayAfter(date, 2), calendar), season, `${id} D+2`);
    }
  }
});

test('Christmas wins on December 25; New Year follows until January 1 inclusive', () => {
  for (const [date, theme] of [
    ['2026-12-17', 'winter'], ['2026-12-18', 'christmas'],
    ['2026-12-24', 'christmas'], ['2026-12-25', 'christmas'],
    ['2026-12-26', 'newyear'], ['2026-12-31', 'newyear'],
    ['2027-01-01', 'newyear'], ['2027-01-02', 'winter'],
  ]) assert.equal(selectTheme(date, calendar), theme, date);
  const onlyNewYear = clone();
  onlyNewYear.annualEvents = onlyNewYear.annualEvents.filter(event => event.id === 'newyear');
  assert.equal(selectTheme('2026-12-24', onlyNewYear), 'winter');
  assert.equal(selectTheme('2026-12-25', onlyNewYear), 'newyear');
});

test('instants use Korean midnight regardless of the device timezone', () => {
  assert.equal(toKstDate('2026-12-17T14:59:59.999Z'), '2026-12-17');
  assert.equal(toKstDate('2026-12-17T15:00:00Z'), '2026-12-18');
  assert.equal(selectTheme('2026-12-17T14:59:59.999Z', calendar), 'winter');
  assert.equal(selectTheme('2026-12-17T15:00:00Z', calendar), 'christmas');
  assert.equal(selectTheme('2026-12-25T14:59:59.999Z', calendar), 'christmas');
  assert.equal(selectTheme('2026-12-25T15:00:00Z', calendar), 'newyear');
  assert.equal(selectTheme('2027-01-01T15:00:00Z', calendar), 'winter');
  assert.equal(toKstDate('2026-12-17T07:00:00-08:00'), '2026-12-18');
  assert.equal(toKstDate(new Date('2026-12-17T15:00:00Z')), '2026-12-18');
  assert.equal(toKstDate(Date.parse('2026-12-17T15:00:00Z')), '2026-12-18');
  assert.equal(toKstDate('2026-12-17'), '2026-12-17');
});

test('an event occurring today outranks a future higher-priority event', () => {
  const config = clone();
  config.annualEvents.find(event => event.id === 'newyear').priority = 1000;
  assert.equal(selectTheme('2026-12-25', config), 'christmas');
  config.datedEvents.push({
    id: 'anniversary', theme: 'spring', start: '2026-12-19', end: '2026-12-26',
    eventDate: '2026-12-26', priority: 0,
  });
  assert.equal(selectTheme('2026-12-26', config), 'spring');
});

test('priority, proximity, then ASCII id decide overlapping events deterministically', () => {
  const config = clone();
  config.datedEvents = [
    { id: 'z-near', theme: 'summer', start: '2026-07-09', end: '2026-07-16', eventDate: '2026-07-16', priority: 300 },
    { id: 'a-far', theme: 'autumn', start: '2026-07-10', end: '2026-07-17', eventDate: '2026-07-17', priority: 300 },
  ];
  assert.equal(selectTheme('2026-07-10', config), 'summer');
  config.datedEvents[1].priority = 301;
  assert.equal(selectTheme('2026-07-10', config), 'autumn');
  config.datedEvents[1].priority = 300;
  config.datedEvents[1].eventDate = '2026-07-16';
  assert.equal(selectTheme('2026-07-10', config), 'autumn');
  config.datedEvents.reverse();
  assert.equal(selectTheme('2026-07-10', config), 'autumn');
});

test('malformed calendars safely fall back to the date’s normal season', () => {
  const duplicatedMonth = clone();
  duplicatedMonth.seasons[0].months.push(12);
  const wrongTheme = clone();
  wrongTheme.themes[0] = 'remote-code';
  const tooManyEvents = clone();
  tooManyEvents.datedEvents = Array(513).fill(null);
  for (const invalid of [null, {}, { ...calendar, schemaVersion: 2 }, { ...calendar, timezone: 'UTC' },
    duplicatedMonth, wrongTheme, tooManyEvents, { ...calendar, datedEvents: {} }]) {
    assert.deepEqual(getThemeSelection('2026-12-25', invalid), {
      theme: 'winter', date: '2026-12-25', reason: 'fallback', eventId: null,
    });
  }
});

test('a malformed event cannot suppress valid events or load an unknown theme', () => {
  const config = clone();
  const base = { id: 'custom', theme: 'summer', start: '2026-12-18', end: '2026-12-25', eventDate: '2026-12-25', priority: 1000 };
  config.datedEvents.push(
    null, { ...base, id: '../bad' }, { ...base, theme: 'downloaded' },
    { ...base, start: '2026-02-30' }, { ...base, end: '2026-12-17' },
    { ...base, eventDate: '2026-12-26' }, { ...base, priority: 1001 },
    { ...base, priority: 1.5 }, { ...base, eventDate: undefined },
  );
  assert.equal(selectTheme('2026-12-25', config), 'christmas');
});

test('unsupported or ambiguous date inputs fail without inventing a date', () => {
  for (const invalid of [undefined, null, true, NaN, Infinity, new Date(NaN), 'not-a-date',
    '2026-02-30', '2026-12-18T00:00:00', '2026-12-18T24:00:00Z', '2026-02-30T00:00:00Z',
    '2026-12-18T00:00:00+24:00', '0000-01-01']) {
    assert.throws(() => toKstDate(invalid), RangeError, String(invalid));
  }
});

test('selection is pure and never guesses future lunar dates beyond the verified range', () => {
  const before = JSON.stringify(calendar);
  assert.deepEqual(getThemeSelection('2026-02-17', calendar), {
    theme: 'seollal', date: '2026-02-17', reason: 'event', eventId: 'seollal-2026',
  });
  assert.equal(selectTheme('2036-02-17', calendar), 'winter');
  assert.equal(selectTheme('2036-09-15', calendar), 'autumn');
  assert.equal(selectTheme('2036-12-25', calendar), 'christmas');
  assert.equal(JSON.stringify(calendar), before);
});
