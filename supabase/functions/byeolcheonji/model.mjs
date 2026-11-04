// New Ojjuda vacancy service. All filtering applies to the check-in date in Korea.
export const BUSINESS_ID = '1627625';
export const SEARCH_DAYS = 45;
export const SCAN_SECONDS = 120;
const DAY_MS = 86_400_000;

export function dateNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const result = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(result) && new Date(result).toISOString().slice(0, 10) === value ? result : NaN;
}

export function nextDate(value, count = 1) {
  if (!Number.isFinite(dateNumber(value)) || !Number.isInteger(count)) throw new Error('invalid_date');
  return new Date(dateNumber(value) + count * DAY_MS).toISOString().slice(0, 10);
}

export function todayInKorea(now = new Date()) {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

export function dateRange(from, to) {
  const count = (dateNumber(to) - dateNumber(from)) / DAY_MS + 1;
  if (!Number.isInteger(count) || count < 1 || count > SEARCH_DAYS) throw new Error('invalid_window');
  return Array.from({ length: count }, (_, index) => nextDate(from, index));
}

export function parseFilters(input = {}, { query = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('조건을 확인해 주세요.');
  let guests = input.guests ?? 'all';
  if (query && typeof guests === 'string' && /^(2|4|6|8)$/.test(guests)) guests = Number(guests);
  const dateMode = input.dateMode ?? 'all';
  if (!['all', 'weekend', 'weekday'].includes(dateMode) || !['all', 2, 4, 6, 8].includes(guests)) {
    throw new Error('입실일과 인원을 다시 선택해 주세요.');
  }
  return { dateMode, guests };
}

// KASA calendar releases, verified 2026-11-04. Includes original and substitute dates.
// https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=431
// Public holiday additions (Labour Day/Constitution Day) apply from 2026.
export const HOLIDAYS = {
  2026: ['01-01', '02-16', '02-17', '02-18', '03-01', '03-02', '05-01', '05-05', '05-24', '05-25', '06-03', '06-06', '07-17', '08-15', '08-17', '09-24', '09-25', '09-26', '10-03', '10-05', '10-09', '12-25'],
  2027: ['01-01', '02-06', '02-07', '02-08', '02-09', '03-01', '05-01', '05-03', '05-05', '05-13', '06-06', '07-17', '07-19', '08-15', '08-16', '09-14', '09-15', '09-16', '10-03', '10-04', '10-09', '10-11', '12-25', '12-27'],
};

export function holidayDates(year) {
  return (HOLIDAYS[year] || []).map(day => `${year}-${day}`);
}

function publicHoliday(date, calendar = {}) {
  const year = Number(date.slice(0, 4));
  if (holidayDates(year).includes(date) || calendar.holidays?.includes(date)) return true;
  return HOLIDAYS[year] || calendar.holidayYears?.includes(year) ? false : null;
}

/** true = weekend, false = weekday, null = next day's holiday calendar unavailable. */
export function weekendArrival(date, calendar = {}) {
  const value = dateNumber(date);
  if (!Number.isFinite(value)) throw new Error('invalid_date');
  const day = new Date(value).getUTCDay();
  if (day === 5 || day === 6) return true;
  return publicHoliday(nextDate(date), calendar);
}

export function dateSelected(date, dateMode, calendar) {
  // Operating days come solely from Naver inventory; do not hardcode facility closures.
  if (dateMode === 'all') return true;
  const weekend = weekendArrival(date, calendar);
  return weekend === null ? null : dateMode === 'weekend' ? weekend : !weekend;
}

export function bookingLink(roomId, date, guests = 'all') {
  if (!/^[1-9]\d{0,19}$/.test(String(roomId)) || !Number.isFinite(dateNumber(date))) throw new Error('invalid_booking');
  parseFilters({ guests });
  const url = new URL(`https://booking.naver.com/booking/3/bizes/${BUSINESS_ID}/items/${roomId}`);
  // The exact-room Naver route reads these keys (the listing uses startDate/endDate).
  url.searchParams.set('startDateTime', `${date}T00:00:00`);
  url.searchParams.set('endDateTime', `${nextDate(date)}T00:00:00`);
  if (guests !== 'all') url.searchParams.set('guests', String(guests));
  return url.href;
}

function roomOnDate(room, date, filters) {
  if (!room) return 'unknown';
  if (room.enabled === false || room.minNights > 1 || (room.maxNights !== null && room.maxNights < 1)) return 'closed';
  if (room.enabled !== true) return 'unknown';
  if (filters.guests !== 'all') {
    if (!Number.isInteger(room.capacity) || room.capacity < 1) return 'unknown';
    if (room.capacity < filters.guests) return 'closed';
  }
  return room.days?.[date]?.state || 'unknown';
}

export function availability(snapshot, input = {}) {
  const filters = parseFilters(input), matches = [], unknown = new Set();
  for (const date of dateRange(snapshot.from, snapshot.to)) {
    const selected = dateSelected(date, filters.dateMode, snapshot);
    if (selected === null) { unknown.add(date); continue; }
    if (!selected) continue;
    for (const room of snapshot.rooms) {
      const state = roomOnDate(room, date, filters);
      if (state === 'unknown') { unknown.add(date); continue; }
      if (state !== 'open') continue;
      matches.push({ date, endDate: nextDate(date), roomId: room.id, roomName: room.name,
        capacity: room.capacity, standard: room.standard, price: room.days[date].price,
        bookingUrl: bookingLink(room.id, date, filters.guests) });
    }
  }
  return {
    checkedAt: snapshot.checkedAt, window: { from: snapshot.from, to: snapshot.to },
    rooms: snapshot.rooms.map(({ id, name, capacity, standard }) => ({ id, name, capacity, standard })),
    matches, unknownDates: unknown.size,
    partial: Boolean(snapshot.failedRooms?.length || unknown.size || snapshot.holidayYearsFailed?.length),
  };
}

export function notificationPlan(snapshot, input, previous = [], projection = null) {
  const filters = parseFilters(input), result = projection || availability(snapshot, filters);
  const old = new Set(Array.isArray(previous) ? previous.filter(key => typeof key === 'string') : []);
  const keyOf = item => `${item.date}/${item.roomId}`;
  const current = new Set(result.matches.map(keyOf));
  for (const key of old) {
    if (current.has(key)) continue;
    const [date, roomId] = key.split('/');
    if (!Number.isFinite(dateNumber(date)) || date < snapshot.from || date > snapshot.to) continue;
    const selected = dateSelected(date, filters.dateMode, snapshot);
    if (selected === false) continue;
    const room = snapshot.rooms.find(item => item.id === roomId);
    // An incomplete calendar is not evidence of a closure/reopening.
    if (selected === null || roomOnDate(room, date, filters) === 'unknown') current.add(key);
  }
  const fresh = result.matches.filter(item => !old.has(keyOf(item)));
  if (!fresh.length) return { seen: [...current], payload: null, count: 0 };
  const first = fresh[0], url = new URL('https://ojjuda.kr/byeolcheonji/');
  url.searchParams.set('date', first.date);
  url.searchParams.set('room', first.roomId);
  url.searchParams.set('guests', String(filters.guests));
  return { seen: [...current], count: fresh.length, payload: {
    title: '별천지 빈방이 나왔어요',
    body: `${Number(first.date.slice(5, 7))}월 ${Number(first.date.slice(8))}일 · ${first.roomName}호${fresh.length > 1 ? ` 외 ${fresh.length - 1}건` : ''}\n눌러서 날짜·객실을 확인하고 예약하세요.`,
    url: url.pathname + url.search, tag: 'byeolcheonji-vacancy',
  } };
}
