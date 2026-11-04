import test from 'node:test';
import assert from 'node:assert/strict';
import { readCatalog, readSchedule, readHolidays, fetchInventory } from '../supabase/functions/byeolcheonji/provider.mjs';
import { availability } from '../supabase/functions/byeolcheonji/model.mjs';

const date = '2026-11-06';
function catalog(change = {}, from = date) {
  const next = new Date(Date.parse(`${from}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  return { data: { searchBizItem: { id: JSON.stringify({ businessId: '1627625', availableStartDate: from, availableEndDate: next }),
    bizItems: [{ businessId: '1627625', bizItemId: '7618700', name: '201', isImp: true, bizItemSubType: 'ACCOMMODATION_NIGHT',
      isClosedBooking: false, isClosedBookingUser: false, bookableSettingJson: { isOpened: true }, minBookingTime: 1, maxBookingTime: 3,
      typeValues: [{ code: 'CD128', codeValue: '2' }, { code: 'CD129', codeValue: '4' }], ...change }] } } };
}
function schedule(change = {}, totalsChange = {}, from = date) {
  return { data: { schedule: { bizItemSchedule: { daily: {
    date: { [from]: { date: from, stock: 1, bookingCount: 0, occupiedBookingCount: 0, minBookingCount: 1,
      isBusinessDay: true, isSaleDay: true, prices: [{ price: 120000, isImp: true }], ...change } },
    summary: [{ dateKey: from, hasBookableSlots: null, ...totalsChange }],
  } } } } };
}

test('catalog must echo correct facility/dates and valid unique room IDs', () => {
  assert.equal(readCatalog(catalog(), date)[0].capacity, 4);
  assert.equal(readCatalog(catalog({ typeValues: [] }), date)[0].capacity, null);
  assert.equal(readCatalog(catalog({ isClosedBookingUser: true }), date)[0].enabled, false);
  assert.equal(readCatalog(catalog({ bookableSettingJson: {} }), date)[0].enabled, null);
  assert.throws(() => readCatalog(catalog({ businessId: '999' }), date));
  assert.throws(() => readCatalog(catalog({ bizItemId: '../admin' }), date));
  const wrong = catalog(); wrong.data.searchBizItem.id = JSON.stringify({ businessId: '1627625', availableStartDate: date, availableEndDate: '2026-11-09' });
  assert.throws(() => readCatalog(wrong, date));
  const duplicate = catalog(); duplicate.data.searchBizItem.bizItems.push(duplicate.data.searchBizItem.bizItems[0]);
  assert.throws(() => readCatalog(duplicate, date));
});

test('positive availability requires valid stock/sales and respects occupied/reserved quantities', () => {
  assert.deepEqual(readSchedule(schedule(), date, date)[date], { state: 'open', price: 120000 });
  for (const change of [{ occupiedBookingCount: 1 }, { bookingCount: 1 }, { stock: 0 }, { minBookingCount: 2 }, { isSaleDay: false }, { isBusinessDay: false }]) {
    assert.equal(readSchedule(schedule(change), date, date)[date].state, 'closed');
  }
  for (const totals of [{ hasBookableSlots: false }, { isSaleDay: false }, { isBusinessDay: false }]) assert.equal(readSchedule(schedule({}, totals), date, date)[date].state, 'closed');
  for (const change of [{ stock: '1' }, { bookingCount: null }, { occupiedBookingCount: -1 }, { minBookingCount: '2' }, { isSaleDay: undefined }]) {
    assert.equal(readSchedule(schedule(change), date, date)[date].state, 'unknown');
  }
  assert.equal(readSchedule(schedule({ prices: [{ price: '120000' }] }), date, date)[date].price, null);
});

test('missing or mismatched date data can never become an available room', () => {
  assert.equal(readSchedule(schedule(), date, '2026-11-07')['2026-11-07'].state, 'unknown');
  assert.throws(() => readSchedule(schedule({ date: '2026-11-07' }), date, date));
  const missing = schedule(); missing.data.schedule.bizItemSchedule.daily.summary = [];
  assert.equal(readSchedule(missing, date, date)[date].state, 'unknown');
  const repeated = schedule(); repeated.data.schedule.bizItemSchedule.daily.summary.push({ dateKey: date });
  assert.throws(() => readSchedule(repeated, date, date));
});

test('provider uses observed read-only query contract and fixed next45days; holiday failure preserves official fallback', async () => {
  const calls = [];
  const data = await fetchInventory({ now: new Date('2026-11-06T01:00:00Z'), fetcher: async (url, init) => {
    calls.push(url); assert.equal(init.redirect, 'error');
    if (url.startsWith('https://date.nager.at/')) return new Response('', { status: 503 });
    assert.equal(url, 'https://booking.naver.com/graphql');
    const body = JSON.parse(init.body);
    assert.equal(init.method, 'POST'); assert.doesNotMatch(body.query, /mutation/);
    if (body.operationName === 'searchBizItem') return Response.json(catalog());
    assert.deepEqual(body.variables.scheduleParams, { businessId: '1627625', bizItemId: '7618700', businessTypeId: 3,
      startDateTime: `${date}T00:00:00+09:00`, endDateTime: '2026-12-20T23:59:59+09:00', partitionDays: 45 });
    return Response.json(schedule());
  } });
  assert.equal(calls.filter(url => url.includes('/graphql')).length, 2);
  assert.equal(data.rooms.length, 1); assert.equal(data.failedRooms.length, 0);
  assert.deepEqual(data.holidayYears, [2026]);
  assert.ok(data.holidays.includes('2026-12-25'));
  assert.equal(availability(data, { guests: 4 }).matches.length, 1);
});

test('provider rate limits stop scans for HTTP429 and HTTP200 GraphQL errors', async () => {
  for (const answer of [() => new Response('', { status: 429 }), () => Response.json({ errors: [{ extensions: { code: 'BookingAPITooManyRequests' } }] })]) {
    let requests = 0;
    await assert.rejects(() => fetchInventory({ now: new Date('2026-11-06T01:00:00Z'), fetcher: async () => {
      requests++; return requests === 1 ? Response.json(catalog()) : answer();
    } }), { name: 'ProviderRateLimit', limited: true });
    assert.equal(requests, 2, 'no retries, alternate endpoint or holiday request after rate limiting');
  }
});

test('all failed room requests fail the scan; a partially failed room stays unknown', async () => {
  await assert.rejects(() => fetchInventory({ now: new Date('2026-11-06T01:00:00Z'), fetcher: async (_url, init) => {
    return JSON.parse(init.body).operationName === 'searchBizItem' ? Response.json(catalog()) : new Response('', { status: 503 });
  } }), { name: 'ProviderError' });
  const data = await fetchInventory({ now: new Date('2026-11-06T01:00:00Z'), fetcher: async (url, init) => {
    if (url.includes('date.nager.at')) return new Response('', { status: 503 });
    const body = JSON.parse(init.body);
    if (body.operationName === 'searchBizItem') {
      const result = catalog(); result.data.searchBizItem.bizItems.push({ ...result.data.searchBizItem.bizItems[0], bizItemId: '7618711', name: '202' });
      return Response.json(result);
    }
    return body.variables.scheduleParams.bizItemId === '7618711' ? new Response('', { status: 503 }) : Response.json(schedule());
  } });
  assert.deepEqual(data.failedRooms, ['7618711']);
  assert.equal(availability(data, { guests: 2 }).matches.length, 1);
  assert.equal(availability(data, { guests: 2 }).partial, true);
});

test('holiday-eve classification retrieves next-day year at the window boundary', async () => {
  const holidayUrls = [];
  const from = '2027-11-17'; // 45-day inventory ends Dec 31; holiday lookup still needs Jan 1.
  const data = await fetchInventory({ now: new Date(`${from}T01:00:00Z`), fetcher: async (url, init) => {
    if (url.includes('date.nager.at')) { holidayUrls.push(url); return new Response('', { status: 503 }); }
    return Response.json(JSON.parse(init.body).operationName === 'searchBizItem' ? catalog({}, from) : schedule({}, {}, from));
  } });
  assert.equal(data.to, '2027-12-31');
  assert.ok(holidayUrls.some(url => url.endsWith('/2028/KR')));
  assert.deepEqual(data.holidayYearsFailed, [2028]);
});

test('holiday source requires a complete, correctly scoped public calendar', () => {
  const payload = Array.from({ length: 10 }, (_, index) => ({ countryCode: 'KR', global: true, types: ['Public'], date: index === 9 ? '2028-12-25' : `2028-01-${String(index + 1).padStart(2, '0')}` }));
  assert.equal(readHolidays(payload, 2028).length, 10);
  assert.throws(() => readHolidays(payload, 2027));
  assert.throws(() => readHolidays(payload.slice(0, 9), 2028));
  assert.throws(() => readHolidays(payload.map(row => ({ ...row, countryCode: 'US' })), 2028));
});
