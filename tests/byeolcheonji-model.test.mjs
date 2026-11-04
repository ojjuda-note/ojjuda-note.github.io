import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFilters, nextDate, dateNumber, todayInKorea, weekendArrival,
  dateSelected, bookingLink, availability, notificationPlan } from '../supabase/functions/byeolcheonji/model.mjs';

const open = { state: 'open', price: 120000 };
function snapshot(from, to = from, rooms = []) {
  return { from, to, checkedAt: '2026-11-04T10:00:00.000Z', rooms, failedRooms: [], holidayYears: [2026, 2027], holidays: [] };
}
function room(days, change = {}) {
  return { id: '7618700', name: '201', capacity: 4, standard: 2, enabled: true, minNights: 1, maxNights: 3, days, ...change };
}

test('exact filter options and Korean date boundaries', () => {
  assert.deepEqual(parseFilters(), { dateMode: 'all', guests: 'all' });
  for (const dateMode of ['all', 'weekend', 'weekday']) for (const guests of ['all', 2, 4, 6, 8]) assert.deepEqual(parseFilters({ dateMode, guests }), { dateMode, guests });
  for (const guests of [0, 1, 3, 5, 7, 9, '2', true, null]) assert.throws(() => parseFilters({ guests: guests === null ? 'null' : guests }));
  assert.throws(() => parseFilters({ dateMode: 'specific' }));
  assert.deepEqual(parseFilters({ dateMode: 'weekday', guests: '6' }, { query: true }), { dateMode: 'weekday', guests: 6 });
  assert.equal(todayInKorea(new Date('2026-12-31T14:59:59Z')), '2026-12-31');
  assert.equal(todayInKorea(new Date('2026-12-31T15:00:00Z')), '2027-01-01');
  assert.equal(nextDate('2026-12-31'), '2027-01-01');
  assert.equal(nextDate('2028-02-28'), '2028-02-29');
  assert.ok(Number.isNaN(dateNumber('2026-02-30')));
});

test('weekend is Friday/Saturday arrival or a public-holiday eve, with weekday as complement', () => {
  assert.equal(weekendArrival('2026-11-06'), true); // Friday.
  assert.equal(weekendArrival('2026-11-07'), true); // Saturday.
  assert.equal(weekendArrival('2026-11-08'), false); // Ordinary Sunday.
  assert.equal(weekendArrival('2026-11-09'), false); // Ordinary Monday.
  assert.equal(weekendArrival('2026-12-24'), true); // Thursday before Christmas.
  assert.equal(weekendArrival('2026-05-24'), true); // Sunday before substitute holiday.
  assert.equal(weekendArrival('2026-05-25'), false); // Holiday itself is not automatically a weekend arrival.
  assert.equal(dateSelected('2026-05-25', 'weekday', {}), true);
  assert.equal(weekendArrival('2026-12-31', { holidayYears: [2026] }), true); // Jan 1 crosses year.
});

test('facility operating dates follow provider inventory without a hardcoded weekday closure', () => {
  const wednesday = snapshot('2026-11-04', '2026-11-04', [room({ '2026-11-04': open })]);
  assert.equal(availability(wednesday, { dateMode: 'all', guests: 2 }).matches.length, 1);
  wednesday.rooms[0].days['2026-11-04'] = { state: 'closed', price: null };
  assert.equal(availability(wednesday, { dateMode: 'all', guests: 2 }).matches.length, 0);
  assert.equal(availability(wednesday, { dateMode: 'weekday', guests: 2 }).matches.length, 0);
  const tuesday = snapshot('2026-11-03', '2026-11-03', [room({ '2026-11-03': open })]);
  assert.equal(availability(tuesday, { guests: 2 }).matches[0].endDate, '2026-11-04');
});

test('unknown holiday data withholds weekday/weekend classifications but not all-date inventory', () => {
  assert.equal(weekendArrival('2028-01-06'), null);
  const data = snapshot('2028-01-06', '2028-01-06', [room({ '2028-01-06': open })]);
  data.holidayYears = []; data.holidayYearsFailed = [2028];
  const result = availability(data, { dateMode: 'weekday', guests: 2 });
  assert.equal(result.matches.length, 0); assert.equal(result.unknownDates, 1); assert.equal(result.partial, true);
  assert.deepEqual(notificationPlan(data, { dateMode: 'weekday', guests: 2 }, ['2028-01-06/7618700']).seen, ['2028-01-06/7618700']);
  assert.equal(availability(data, { dateMode: 'all', guests: 2 }).matches.length, 1);
});

test('real known capacity is required for selected parties; unavailable and multi-night-only rooms excluded', () => {
  const date = '2026-11-06', data = snapshot(date, date, [
    room({ [date]: open }), room({ [date]: open }, { id: '7618751', name: '206', capacity: 8, standard: 6 }),
    room({ [date]: open }, { id: '7618711', capacity: null }),
    room({ [date]: open }, { id: '7618722', minNights: 2 }),
    room({ [date]: open }, { id: '7618727', enabled: false }),
    room({}, { id: '7618739' }),
  ]);
  assert.deepEqual(availability(data, { guests: 6 }).matches.map(item => item.roomId), ['7618751']);
  assert.deepEqual(availability(data, { guests: 4 }).matches.map(item => item.roomId), ['7618700', '7618751']);
  assert.equal(availability(data, { guests: 'all' }).matches.length, 3);
  assert.equal(availability(data, { guests: 2 }).unknownDates, 1);
  assert.equal(availability(data, { guests: 2 }).partial, true);
});

test('booking URL chooses actual room and exact one-night dates using Naver item route parameters', () => {
  const url = new URL(bookingLink('7618700', '2026-12-31', 4));
  assert.equal(url.origin, 'https://booking.naver.com');
  assert.equal(url.pathname, '/booking/3/bizes/1627625/items/7618700');
  assert.equal(url.searchParams.get('startDateTime'), '2026-12-31T00:00:00');
  assert.equal(url.searchParams.get('endDateTime'), '2027-01-01T00:00:00');
  assert.equal(url.searchParams.get('guests'), '4');
  assert.equal(new URL(bookingLink('7618700', '2026-11-06', 'all')).searchParams.has('guests'), false);
  assert.throws(() => bookingLink('../elsewhere', '2026-11-06', 4));
  assert.throws(() => bookingLink('7618700', '2026-02-30', 4));
});

test('one digest per new vacancy; unknown observations do not manufacture reopening alerts', () => {
  const date = '2026-11-06', key = `${date}/7618700`, filters = { dateMode: 'weekend', guests: 4 };
  const data = snapshot(date, date, [room({ [date]: open })]);
  const first = notificationPlan(data, filters, []);
  assert.equal(first.count, 1); assert.deepEqual(first.seen, [key]);
  assert.equal(first.payload.url, '/byeolcheonji/?date=2026-11-06&room=7618700&guests=4');
  assert.equal(notificationPlan(data, filters, first.seen).payload, null);
  data.rooms[0].days[date] = { state: 'unknown', price: null };
  const uncertain = notificationPlan(data, filters, first.seen);
  assert.deepEqual(uncertain.seen, [key]); assert.equal(uncertain.payload, null);
  data.rooms[0].days[date] = open;
  assert.equal(notificationPlan(data, filters, uncertain.seen).payload, null);
  data.rooms[0].days[date] = { state: 'closed', price: null };
  assert.deepEqual(notificationPlan(data, filters, first.seen).seen, []);
  data.rooms[0].days[date] = open;
  assert.equal(notificationPlan(data, filters, []).count, 1);
});

test('missing catalog room is unknown, whereas a positively closed room clears old vacancy', () => {
  const data = snapshot('2026-11-06', '2026-11-06', []), previous = ['2026-11-06/7618700'];
  assert.deepEqual(notificationPlan(data, { guests: 4 }, previous).seen, previous);
  data.rooms = [room({}, { enabled: false })];
  assert.deepEqual(notificationPlan(data, { guests: 4 }, previous).seen, []);
});
