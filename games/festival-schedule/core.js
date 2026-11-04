/** Shared date, filtering and calendar-export rules for 축제일정. */
export const CATEGORIES = Object.freeze({
  local: Object.freeze({ label: '지역축제', color: '#e97746', bg: '#fff0e7', ink: '#a84e28', icon: 'sparkles' }),
  fireworks: Object.freeze({ label: '불꽃·불빛', color: '#c17e25', bg: '#fff5df', ink: '#875515', icon: 'sparkles' }),
  campus: Object.freeze({ label: '대학축제', color: '#6d8cdb', bg: '#edf1ff', ink: '#4964ae', icon: 'music' }),
  film: Object.freeze({ label: '영화제', color: '#a278c0', bg: '#f4ecfa', ink: '#805597', icon: 'film' }),
  expo: Object.freeze({ label: '박람회·전시', color: '#419e85', bg: '#e8f6ee', ink: '#25765f', icon: 'grid' })
});

export const REGIONS = Object.freeze([
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'
]);

const FIRST_DATE = '0001-01-01';
const LAST_DATE = '9999-12-31';
const DAY = 86_400_000;
const koCompare = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'ko');
const isAny = value => value == null || value === '' || value === 'all';

/** UTC date-only values avoid device-timezone and daylight-saving shifts. */
export function parseDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!match) throw new RangeError(`Invalid date: ${iso}`);
  const [, y, m, d] = match.map(Number);
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new RangeError(`Invalid date: ${iso}`);
  }
  return date;
}

export function isoDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new RangeError('Invalid Date');
  return date.toISOString().slice(0, 10);
}

export function todayKST(now = new Date()) {
  const date = typeof now === 'function' ? new now() : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid current time');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const part = name => parts.find(p => p.type === name).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function addDays(iso, n) {
  if (!Number.isInteger(n)) throw new RangeError('Day offset must be an integer');
  const date = parseDate(iso);
  date.setTime(date.getTime() + n * DAY);
  return isoDate(date);
}

/** Accepts (year, zero-based month), or the convenient string 'YYYY-MM'. */
export function monthRange(year, monthZero) {
  if (typeof year === 'string' && /^\d{4}-\d{2}$/.test(year)) {
    const [y, m] = year.split('-').map(Number);
    year = y;
    monthZero = m - 1;
  }
  if (!Number.isInteger(year) || !Number.isInteger(monthZero) || monthZero < 0 || monthZero > 11) {
    throw new RangeError('Expected a year and a zero-based month');
  }
  const start = `${String(year).padStart(4, '0')}-${String(monthZero + 1).padStart(2, '0')}-01`;
  const last = parseDate(start);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  return { start, end: isoDate(last) };
}

/** All returned bounds are inclusive. null means no date restriction. */
export function periodRange(period, today = todayKST(), from = '', to = '') {
  const date = parseDate(today);
  if (from && typeof from === 'object') {
    to = from.to ?? '';
    from = from.from ?? '';
  }
  switch (period) {
    case 'all': return null;
    case 'undecided': return null;
    case 'weekend': {
      const weekday = date.getUTCDay();
      // On Sunday, "this weekend" still means the current Saturday and Sunday.
      const saturday = addDays(today, weekday === 0 ? -1 : 6 - weekday);
      return { start: saturday, end: addDays(saturday, 1) };
    }
    case 'month': return monthRange(date.getUTCFullYear(), date.getUTCMonth());
    case 'custom':
      if (!from && !to) return null;
      if (from) parseDate(from);
      if (to) parseDate(to);
      return { start: from || FIRST_DATE, end: to || LAST_DATE };
    case 'upcoming':
    default: return { start: today, end: LAST_DATE };
  }
}

function validDate(iso) {
  try { parseDate(iso); return true; } catch { return false; }
}

/** Only explicitly verified plans may be shown without exact dates. */
export function isDateUndecided(event) {
  return event?.dateStatus === 'undecided'
    && event.start === null && event.end === null
    && typeof event.dateNote === 'string' && event.dateNote.trim().length > 0;
}

export function hasEventDates(event) {
  return (event?.dateStatus === undefined || event.dateStatus === 'confirmed')
    && validDate(event?.start) && validDate(event?.end)
    && event.end >= event.start;
}

export function overlaps(event, start, end) {
  if (!hasEventDates(event)) return false;
  const eventStart = event?.start;
  const eventEnd = event.end;
  const lower = start || FIRST_DATE;
  const upper = end || LAST_DATE;
  return lower <= upper && eventStart <= upper && eventEnd >= lower;
}

/** Cancellation/postponement overrides the old published date range. */
export function eventStatus(event, today = todayKST()) {
  const status = String(event?.status ?? '').toLowerCase();
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  if (status === 'postponed') return 'postponed';
  if (isDateUndecided(event)) return 'undecided';
  if (!hasEventDates(event)) throw new RangeError('Event dates are missing or invalid');
  const end = event.end;
  if (end < today) return 'ended';
  if (event.start > today) return 'upcoming';
  return 'ongoing';
}

function dateOrder(a, b, today) {
  const rank = event => isDateUndecided(event) ? 1 : event.end < today ? 2 : 0;
  const aRank = rank(a), bRank = rank(b);
  if (aRank !== bRank) return aRank - bRank;
  if (aRank === 1) return koCompare(a.title, b.title);
  const direction = aRank === 2 ? -1 : 1;
  return direction * a.start.localeCompare(b.start)
    || direction * a.end.localeCompare(b.end)
    || koCompare(a.title, b.title);
}

/** One shared filter drives the map, list and calendar. Does not mutate input. */
export function filterEvents(events, options = {}, fallbackToday) {
  const {
    query = '', category = 'all', region = 'all', period = 'upcoming',
    from = '', to = '', selectedDate = '', savedOnly = false,
    saved = new Set(), sort = 'date'
  } = options;
  const today = options.today || fallbackToday || todayKST();
  let range;
  try {
    range = periodRange(period, today, from, to);
    if (selectedDate) parseDate(selectedDate);
  } catch {
    return [];
  }
  if (selectedDate && range && (selectedDate < range.start || selectedDate > range.end)) return [];
  const normalized = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ko-KR');
  const terms = normalized(query).trim().split(/\s+/).filter(Boolean);
  const savedIds = saved instanceof Set ? saved : new Set(Array.isArray(saved) ? saved : []);
  const result = events.filter(event => {
    const undecided = isDateUndecided(event);
    if (!undecided && !hasEventDates(event)) return false;
    if (undecided && (!['upcoming', 'all', 'undecided'].includes(period) || selectedDate)) return false;
    if (!undecided && period === 'undecided') return false;
    if (!isAny(category) && event.category !== category) return false;
    if (!isAny(region) && event.region !== region) return false;
    if (savedOnly && !savedIds.has(event.id)) return false;
    if (!undecided && range && !overlaps(event, range.start, range.end)) return false;
    if (selectedDate && !overlaps(event, selectedDate, selectedDate)) return false;
    if (terms.length) {
      const text = normalized([
        event.title, event.region, event.city, event.venue, event.address,
        event.summary, event.dateNote, CATEGORIES[event.category]?.label, ...(event.tags || [])
      ].join(' '));
      if (!terms.every(term => text.includes(term))) return false;
    }
    return true;
  });
  return result.sort((a, b) => {
    if (sort === 'name') return koCompare(a.title, b.title) || dateOrder(a, b, today);
    if (sort === 'region') return koCompare(a.region, b.region) || dateOrder(a, b, today);
    return dateOrder(a, b, today);
  });
}

/** Accepts an event, or (start, end). Includes years for archived events. */
export function formatRange(eventOrStart, suppliedEnd) {
  if (isDateUndecided(eventOrStart)) return `${eventOrStart.dateNote.trim()} · 날짜 미정`;
  if (eventOrStart && typeof eventOrStart === 'object' && !hasEventDates(eventOrStart)) {
    throw new RangeError('Event dates are missing or invalid');
  }
  const start = eventOrStart && typeof eventOrStart === 'object' ? eventOrStart.start : eventOrStart;
  const end = (eventOrStart && typeof eventOrStart === 'object' ? eventOrStart.end : suppliedEnd) || start;
  const first = parseDate(start), last = parseDate(end);
  const full = d => `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  if (start === end) return full(first);
  if (first.getUTCFullYear() !== last.getUTCFullYear()) return `${full(first)} ~ ${full(last)}`;
  if (first.getUTCMonth() === last.getUTCMonth()) return `${full(first)} ~ ${last.getUTCDate()}일`;
  return `${full(first)} ~ ${last.getUTCMonth() + 1}월 ${last.getUTCDate()}일`;
}

function escapeICSText(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

/** RFC 5545 folding counts UTF-8 octets, including continuation whitespace. */
function foldICSLine(line) {
  const encoder = new TextEncoder();
  let current = '', octets = 0;
  const output = [];
  for (const point of line) {
    const bytes = encoder.encode(point).length;
    if (octets + bytes > 75) {
      output.push(current);
      current = ' ';
      octets = 1;
    }
    current += point;
    octets += bytes;
  }
  output.push(current);
  return output.join('\r\n');
}

export function createICS(event, { now = new Date() } = {}) {
  if (isDateUndecided(event)) throw new RangeError('Cannot export an event before its dates are confirmed');
  if (!hasEventDates(event)) throw new RangeError('Event dates are missing or invalid');
  const start = event.start, end = event.end;
  if (!event.id) throw new TypeError('Event ID is required');
  const stamp = new Date(now);
  if (!Number.isFinite(stamp.getTime())) throw new RangeError('Invalid timestamp');
  const status = String(event.status ?? '').toLowerCase();
  const cancelled = status === 'cancelled' || status === 'canceled';
  const postponed = status === 'postponed';
  const statusNote = cancelled ? '취소된 행사입니다.' : postponed ? '연기된 행사입니다. 새 일정은 공식 안내를 확인하세요.' : '';
  const summary = `${cancelled ? '취소 · ' : postponed ? '연기 · ' : ''}${event.title}`;
  let sourceURL = '';
  try {
    const url = new URL(event.sourceUrl);
    if (url.protocol === 'https:' || url.protocol === 'http:') sourceURL = url.href;
  } catch { /* A missing source must not produce an invalid URI property. */ }
  const description = [
    statusNote, event.summary,
    event.scheduleNote && `운영 시간: ${event.scheduleNote}`,
    event.priceNote && `요금: ${event.priceNote}`,
    event.accessNote,
    event.sourceCheckedAt && `정보 확인일: ${event.sourceCheckedAt}`,
    sourceURL && `공식 안내: ${sourceURL}`,
    '방문 전 공식 안내에서 변경 사항을 확인하세요. 내려받은 일정은 자동으로 갱신되지 않습니다.'
  ].filter(Boolean).join('\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ojjuda//FestivalSchedule//KO',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:festival-${encodeURIComponent(String(event.id))}@ojjuda.kr`,
    `DTSTAMP:${stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`,
    `DTSTART;VALUE=DATE:${start.replaceAll('-', '')}`,
    `DTEND;VALUE=DATE:${addDays(end, 1).replaceAll('-', '')}`,
    `SUMMARY:${escapeICSText(summary)}`,
    `LOCATION:${escapeICSText([event.venue, event.address].filter(Boolean).join(' · '))}`,
    `DESCRIPTION:${escapeICSText(description)}`,
    ...(sourceURL ? [`URL:${sourceURL}`] : []),
    `STATUS:${cancelled ? 'CANCELLED' : postponed ? 'TENTATIVE' : 'CONFIRMED'}`,
    'TRANSP:TRANSPARENT', 'END:VEVENT', 'END:VCALENDAR'
  ];
  return `${lines.map(foldICSLine).join('\r\n')}\r\n`;
}
