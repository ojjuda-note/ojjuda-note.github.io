import { BUSINESS_ID, SEARCH_DAYS, HOLIDAYS, todayInKorea, nextDate, dateNumber, dateRange, holidayDates } from './model.mjs';

const GRAPHQL = 'https://booking.naver.com/graphql';
export const CATALOG_QUERY = `query searchBizItem($bizItemSearchParams: BizItemSearchParams) {
 searchBizItem(input: $bizItemSearchParams) {
  id bizItems { businessId bizItemId bizItemSubType name isClosedBooking isClosedBookingUser isImp
    minBookingTime maxBookingTime bookableSettingJson typeValues { code codeValue }
  }
 }
}`;
export const SCHEDULE_QUERY = `query schedule($scheduleParams: ScheduleParams) {
 schedule(input: $scheduleParams) { bizItemSchedule { daily { date summary {
  dateKey minBookingCount maxBookingCount bookingCount stock isBusinessDay isSaleDay hasBookableSlots
 } } } }
}`;

export class ProviderError extends Error {
  constructor(message = '예약처의 빈방 정보를 확인하지 못했어요.', limited = false) {
    super(message); this.name = limited ? 'ProviderRateLimit' : 'ProviderError'; this.limited = limited;
  }
}

async function query(operationName, queryText, variables, fetcher) {
  let response;
  try {
    response = await fetcher(GRAPHQL, { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ operationName, query: queryText, variables }), signal: AbortSignal.timeout(12_000) });
  } catch { throw new ProviderError(); }
  if (response.status === 429) throw new ProviderError('예약처 요청이 많아 잠시 쉬고 있어요. 5분 뒤 다시 확인해 주세요.', true);
  if (!response.ok) throw new ProviderError();
  let body;
  try { body = await response.json(); } catch { throw new ProviderError(); }
  if (body?.errors?.length) {
    const limited = body.errors.some(error => error?.extensions?.code === 'BookingAPITooManyRequests' || error?.message === 'BookingAPITooManyRequests');
    throw new ProviderError(limited ? '예약처 요청이 많아 잠시 쉬고 있어요. 5분 뒤 다시 확인해 주세요.' : undefined, limited);
  }
  return body;
}

export function readCatalog(payload, from) {
  const result = payload?.data?.searchBizItem;
  if (!Array.isArray(result?.bizItems) || result.bizItems.length > 50) throw new ProviderError();
  let echoed;
  try { echoed = JSON.parse(result.id); } catch { throw new ProviderError('예약처의 조회 날짜를 확인하지 못했어요.'); }
  if (String(echoed.businessId) !== BUSINESS_ID || echoed.availableStartDate !== from || echoed.availableEndDate !== nextDate(from)) {
    throw new ProviderError('예약처에서 받은 날짜가 요청한 날짜와 달라요.');
  }
  const ids = new Set();
  const rooms = result.bizItems.filter(item => item?.isImp === true).map(item => {
    const id = String(item.bizItemId);
    if (String(item.businessId) !== BUSINESS_ID || !/^[1-9]\d{0,19}$/.test(id) || ids.has(id)
      || typeof item.name !== 'string' || !item.name.trim() || item.bizItemSubType !== 'ACCOMMODATION_NIGHT') throw new ProviderError('객실 정보를 확인하지 못했어요.');
    ids.add(id);
    const count = code => {
      const raw = item.typeValues?.find(value => value.code === code)?.codeValue;
      const value = raw == null ? NaN : Number(raw);
      return Number.isInteger(value) && value > 0 && value <= 100 ? value : null;
    };
    const closed = item.isClosedBooking === true || item.isClosedBookingUser === true || item.bookableSettingJson?.isOpened === false;
    const open = item.isClosedBooking === false && item.isClosedBookingUser === false && item.bookableSettingJson?.isOpened === true;
    return { id, name: item.name.trim().slice(0, 60), capacity: count('CD129'), standard: count('CD128'),
      enabled: closed ? false : open ? true : null,
      minNights: Number.isFinite(item.minBookingTime) && item.minBookingTime > 0 ? item.minBookingTime : 1,
      maxNights: Number.isFinite(item.maxBookingTime) && item.maxBookingTime > 0 ? item.maxBookingTime : null,
      days: {} };
  });
  if (!rooms.length || rooms.length > 30) throw new ProviderError('객실 목록이 비어 있어 확인을 멈췄어요.');
  return rooms.sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
}

export function readSchedule(payload, from, to) {
  const daily = payload?.data?.schedule?.bizItemSchedule?.daily;
  if (!daily?.date || typeof daily.date !== 'object' || Array.isArray(daily.date) || !Array.isArray(daily.summary)) throw new ProviderError('예약처의 달력 형식을 확인하지 못했어요.');
  const summary = new Map();
  for (const item of daily.summary) {
    if (!item || !Number.isFinite(dateNumber(item.dateKey)) || summary.has(item.dateKey)) throw new ProviderError('예약처의 날짜가 올바르지 않아요.');
    summary.set(item.dateKey, item);
  }
  return Object.fromEntries(dateRange(from, to).map(date => {
    const day = daily.date[date], totals = summary.get(date);
    const unknown = { state: 'unknown', price: null };
    if (!day || !totals) return [date, unknown];
    if (day.date !== date) throw new ProviderError('예약처에서 받은 날짜가 요청한 날짜와 달라요.');
    if (typeof day.isBusinessDay !== 'boolean' || typeof day.isSaleDay !== 'boolean') return [date, unknown];
    if (!day.isBusinessDay || !day.isSaleDay || totals.hasBookableSlots === false || totals.isBusinessDay === false || totals.isSaleDay === false) return [date, { state: 'closed', price: null }];
    const occupied = day.occupiedBookingCount ?? 0;
    if (![day.stock, day.bookingCount, occupied].every(value => Number.isInteger(value) && value >= 0)) return [date, unknown];
    if (day.minBookingCount != null && (!Number.isInteger(day.minBookingCount) || day.minBookingCount < 0)) return [date, unknown];
    const required = Math.max(1, day.minBookingCount || 1);
    const remaining = day.stock - day.bookingCount - occupied;
    if (remaining < required || (Number.isFinite(day.maxBookingCount) && day.maxBookingCount > 0 && day.maxBookingCount < required)) return [date, { state: 'closed', price: null }];
    const prices = (Array.isArray(day.prices) ? day.prices : []).filter(price => price.isImp !== false && typeof price.price === 'number' && Number.isFinite(price.price) && price.price >= 0).map(price => price.price);
    return [date, { state: 'open', price: prices.length ? Math.min(...prices) : null }];
  }));
}

export function readHolidays(payload, year) {
  if (!Array.isArray(payload) || payload.length < 10 || payload.length > 100) throw new Error('holiday_data_missing');
  const dates = new Set();
  for (const item of payload) {
    if (item.countryCode !== 'KR' || item.global !== true || !item.types?.includes('Public')) continue;
    if (!Number.isFinite(dateNumber(item.date)) || !item.date.startsWith(`${year}-`)) throw new Error('holiday_year_mismatch');
    dates.add(item.date);
  }
  if (!dates.has(`${year}-01-01`) || !dates.has(`${year}-12-25`)) throw new Error('holiday_data_missing');
  return [...dates];
}

const holidayCache = new Map();
async function loadHolidays(from, to, fetcher) {
  // A Dec 31 check-in depends on Jan 1, even when the visible window ends in December.
  const years = [...new Set([Number(from.slice(0, 4)), Number(nextDate(to).slice(0, 4))])];
  const holidays = new Set(), holidayYears = [], holidayYearsFailed = [];
  await Promise.all(years.map(async year => {
    const fixed = holidayDates(year);
    for (const date of fixed) holidays.add(date);
    let remote = holidayCache.get(year);
    try {
      if (!remote || remote.until <= Date.now()) {
        const response = await fetcher(`https://date.nager.at/api/v3/PublicHolidays/${year}/KR`, {
          headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error('holiday_service_unavailable');
        remote = { dates: readHolidays(await response.json(), year), until: Date.now() + 86_400_000 };
        holidayCache.set(year, remote);
      }
      for (const date of remote.dates) holidays.add(date);
      holidayYears.push(year);
    } catch {
      if (HOLIDAYS[year]) holidayYears.push(year);
      else holidayYearsFailed.push(year);
    }
  }));
  return { holidays: [...holidays].sort(), holidayYears, holidayYearsFailed };
}

export async function fetchInventory({ fetcher = fetch, now = new Date() } = {}) {
  const deadline = Date.now() + 85_000;
  const from = todayInKorea(now), to = nextDate(from, SEARCH_DAYS - 1);
  const payload = await query('searchBizItem', CATALOG_QUERY, { bizItemSearchParams: {
    businessId: BUSINESS_ID, projections: 'resource,min-max-price', isAvailableBooking: false,
    availableStartDate: from, availableEndDate: nextDate(from),
  } }, fetcher);
  const rooms = readCatalog(payload, from), failedRooms = [];
  let cursor = 0, failure = null, successfulRooms = 0;
  async function worker() {
    while (cursor < rooms.length && !failure) {
      const room = rooms[cursor++];
      if (room.enabled !== true || room.minNights > 1) continue;
      if (Date.now() > deadline) { failedRooms.push(room.id); continue; }
      try {
        const result = await query('schedule', SCHEDULE_QUERY, { scheduleParams: {
          businessId: BUSINESS_ID, bizItemId: room.id, businessTypeId: 3,
          startDateTime: `${from}T00:00:00+09:00`, endDateTime: `${to}T23:59:59+09:00`, partitionDays: SEARCH_DAYS,
        } }, fetcher);
        room.days = readSchedule(result, from, to); successfulRooms++;
      } catch (error) {
        if (error?.limited) failure = error;
        else failedRooms.push(room.id);
      }
    }
  }
  await Promise.all([worker(), worker()]);
  if (failure) throw failure;
  if (!successfulRooms && rooms.some(room => room.enabled === true && room.minNights <= 1)) throw new ProviderError();
  const holidayData = await loadHolidays(from, to, fetcher);
  return { from, to, checkedAt: new Date().toISOString(), rooms, failedRooms, ...holidayData };
}
