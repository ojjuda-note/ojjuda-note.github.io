/** Pure, shared calendar rules. No clock, network, filesystem, or DOM access. */
export const THEME_IDS = Object.freeze([
  'spring', 'summer', 'autumn', 'winter',
  'newyear', 'seollal', 'chuseok', 'christmas',
]);

const SEASONS = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer',
  'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
const SEASON_IDS = new Set(['spring', 'summer', 'autumn', 'winter']);
const THEMES = new Set(THEME_IDS);
const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;
const EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

function isMonthDay(value) {
  return typeof value === 'string' && /^\d{2}-\d{2}$/.test(value) && isDate(`2000-${value}`);
}

function epochDay(value) {
  return Date.parse(`${value}T00:00:00.000Z`) / DAY_MS;
}

/** Date-only strings already denote a KST calendar day; instants use fixed UTC+09:00. */
export function toKstDate(input) {
  if (typeof input === 'string' && isDate(input)) return input;
  let instant;
  if (input instanceof Date) {
    instant = input.getTime();
  } else if (typeof input === 'number') {
    instant = input;
  } else if (typeof input === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-](\d{2}):(\d{2}))$/i.exec(input);
    if (!match || !isDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 ||
        Number(match[4] || 0) > 59 || Number(match[6] || 0) > 23 || Number(match[7] || 0) > 59) {
      throw new RangeError('Use a valid YYYY-MM-DD date or an ISO timestamp with an explicit timezone.');
    }
    instant = Date.parse(input);
  } else {
    throw new RangeError('Use a Date, epoch milliseconds, or a dated string.');
  }
  if (!Number.isFinite(instant)) throw new RangeError('Invalid date.');
  const shifted = new Date(instant + KST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  if (!Number.isFinite(year) || year < 1 || year > 9999) throw new RangeError('Date is outside supported years 0001–9999.');
  return `${String(year).padStart(4, '0')}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

function validConfig(calendar) {
  if (!calendar || typeof calendar !== 'object' || Array.isArray(calendar) ||
      calendar.schemaVersion !== 1 || calendar.timezone !== 'Asia/Seoul' ||
      !Array.isArray(calendar.themes) || calendar.themes.length !== THEME_IDS.length ||
      new Set(calendar.themes).size !== THEME_IDS.length || !calendar.themes.every(theme => THEMES.has(theme)) ||
      !Array.isArray(calendar.seasons) || calendar.seasons.length !== 4 ||
      !Array.isArray(calendar.annualEvents) || !Array.isArray(calendar.datedEvents) ||
      calendar.annualEvents.length + calendar.datedEvents.length > 512) return false;

  const months = new Set();
  const seasons = new Set();
  for (const season of calendar.seasons) {
    if (!season || !SEASON_IDS.has(season.theme) || seasons.has(season.theme) || !Array.isArray(season.months) || !season.months.length) return false;
    seasons.add(season.theme);
    for (const month of season.months) {
      if (!Number.isInteger(month) || month < 1 || month > 12 || months.has(month)) return false;
      months.add(month);
    }
  }
  return months.size === 12;
}

function withinAnnualRange(value, start, end) {
  return start <= end ? value >= start && value <= end : value >= start || value <= end;
}

function validEvent(event, annual) {
  if (!event || typeof event !== 'object' || typeof event.id !== 'string' || !EVENT_ID.test(event.id) ||
      !THEMES.has(event.theme) || !Number.isInteger(event.priority) || event.priority < 0 || event.priority > 1000) return false;
  const checkDate = annual ? isMonthDay : isDate;
  if (![event.start, event.end, event.eventDate].every(checkDate)) return false;
  return annual
    ? withinAnnualRange(event.eventDate, event.start, event.end)
    : event.start <= event.eventDate && event.eventDate <= event.end;
}

function activeEvent(event, date, annual) {
  if (!annual) {
    if (date < event.start || date > event.end) return null;
    return { event, distance: Math.abs(epochDay(event.eventDate) - epochDay(date)) };
  }
  const monthDay = date.slice(5);
  if (!withinAnnualRange(monthDay, event.start, event.end)) return null;
  let eventYear = Number(date.slice(0, 4));
  if (event.start > event.end) {
    const rangeStartYear = eventYear - (monthDay <= event.end ? 1 : 0);
    eventYear = rangeStartYear + (event.eventDate < event.start ? 1 : 0);
  }
  const eventDate = `${String(eventYear).padStart(4, '0')}-${event.eventDate}`;
  // Annual February 29 events have no observance in a common year.
  if (!isDate(eventDate)) return null;
  return { event, distance: Math.abs(epochDay(eventDate) - epochDay(date)) };
}

/**
 * Inclusive ranges; the event occurring today wins, then priority, then proximity,
 * then ASCII event id. Bad event entries are ignored; bad calendars use seasons.
 */
export function getThemeSelection(input, calendar) {
  const date = toKstDate(input);
  const month = Number(date.slice(5, 7));
  if (!validConfig(calendar)) {
    return { theme: SEASONS[month - 1], date, reason: 'fallback', eventId: null };
  }
  const candidates = [];
  const ids = new Set();
  for (const [events, annual] of [[calendar.annualEvents, true], [calendar.datedEvents, false]]) {
    for (const event of events) {
      if (!validEvent(event, annual) || ids.has(event.id)) continue;
      ids.add(event.id);
      const candidate = activeEvent(event, date, annual);
      if (candidate) candidates.push(candidate);
    }
  }
  candidates.sort((a, b) => Number(b.distance === 0) - Number(a.distance === 0) ||
    b.event.priority - a.event.priority || a.distance - b.distance ||
    (a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0));
  if (candidates.length) {
    const { event } = candidates[0];
    return { theme: event.theme, date, reason: 'event', eventId: event.id };
  }
  const theme = calendar.seasons.find(season => season.months.includes(month)).theme;
  return { theme, date, reason: 'season', eventId: null };
}

export function selectTheme(input, calendar) {
  return getThemeSelection(input, calendar).theme;
}
