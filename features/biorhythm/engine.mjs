/**
 * Calendar-only arithmetic for the traditional 23 / 28 / 33 day model.
 * These values describe a mathematical curve, not a measurement of health,
 * mood, ability, or the likelihood of future events.
 */

const DAY_MS = 86_400_000;
const TAU = 2 * Math.PI;
const MIN_DAY = Date.UTC(1900, 0, 1) / DAY_MS;
const MAX_DAY = Date.UTC(2100, 11, 31) / DAY_MS;
const DATE_RANGE_MESSAGE = '1900년 1월 1일부터 2100년 12월 31일까지의 날짜를 선택해 주세요.';

export const CYCLES = Object.freeze([
  Object.freeze({ id: 'physical', label: '신체', period: 23 }),
  Object.freeze({ id: 'emotional', label: '감정', period: 28 }),
  Object.freeze({ id: 'intellectual', label: '지성', period: 33 }),
]);

/** Return an integer UTC calendar day. Reject normalized or ambiguous dates. */
export function isoToDay(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new TypeError('날짜를 YYYY-MM-DD 형식으로 입력해 주세요.');
  }
  const [year, month, day] = iso.split('-').map(Number);
  if (year < 1900 || year > 2100) throw new RangeError(DATE_RANGE_MESSAGE);
  const milliseconds = Date.UTC(year, month - 1, day);
  const date = new Date(milliseconds);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new RangeError('실제로 있는 날짜를 입력해 주세요.');
  }
  return milliseconds / DAY_MS;
}

/** Convert an integer UTC calendar day to a supported ISO date. */
export function dayToISO(day) {
  if (!Number.isSafeInteger(day)) throw new TypeError('날짜의 일수는 정수여야 해요.');
  if (day < MIN_DAY || day > MAX_DAY) throw new RangeError(DATE_RANGE_MESSAGE);
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** "Today" always uses the service's Asia/Seoul calendar, not the device zone. */
export function todayInSeoul(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError('올바른 현재 시각을 입력해 주세요.');
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const iso = `${values.year.padStart(4, '0')}-${values.month}-${values.day}`;
  isoToDay(iso);
  return iso;
}

export function addDays(iso, offset) {
  if (!Number.isSafeInteger(offset)) throw new TypeError('더할 일수는 정수여야 해요.');
  return dayToISO(isoToDay(iso) + offset);
}

function normalizeZero(value) {
  return Math.abs(value) < 1e-10 ? 0 : value;
}

function curveAt(days, cycle) {
  // Reduce the argument before sin/cos to keep exact cycle boundaries stable.
  const phase = (days % cycle.period) / cycle.period;
  const angle = phase * TAU;
  const value = normalizeZero(Math.max(-100, Math.min(100, Math.sin(angle) * 100)));
  const slope = Math.cos(angle);
  return {
    ...cycle,
    value,
    rounded: normalizeZero(Math.round(value)),
    band: value >= 60 ? 'high' : value > 15 ? 'positive' : value >= -15 ? 'neutral' : value > -60 ? 'negative' : 'low',
    direction: Math.abs(slope) <= 0.08 ? 'turning' : slope > 0 ? 'rising' : 'falling',
    phase,
  };
}

function checkedDays(birthISO, targetISO) {
  const birthDay = isoToDay(birthISO);
  const targetDay = isoToDay(targetISO);
  if (targetDay < birthDay) throw new RangeError('살펴볼 날짜는 생일과 같거나 이후여야 해요.');
  return { birthDay, targetDay, days: targetDay - birthDay };
}

/** phase is the fraction of a cycle completed, in [0, 1). */
export function calculate(birthISO, targetISO) {
  const { days } = checkedDays(birthISO, targetISO);
  return {
    birthDate: birthISO,
    targetDate: targetISO,
    days,
    cycles: CYCLES.map(cycle => curveAt(days, cycle)),
  };
}

/**
 * A centered calendar window, clipped at birth and the supported date limits.
 * A 31-day window means center - 15 through center + 15, inclusive.
 * Even spans place the extra day after the center. Clipping does not extend
 * the other end. Each row contains unrounded curve values.
 */
export function makeSeries(birthISO, centerISO, span = 31) {
  if (!Number.isSafeInteger(span) || span < 1) {
    throw new RangeError('그래프 기간은 1일 이상의 정수여야 해요.');
  }
  const { birthDay, targetDay } = checkedDays(birthISO, centerISO);
  const before = Math.floor((span - 1) / 2);
  const after = span - 1 - before;
  const start = Math.max(birthDay, MIN_DAY, targetDay - before);
  const end = Math.min(MAX_DAY, targetDay + after);
  const series = [];
  for (let day = start; day <= end; day += 1) {
    const days = day - birthDay;
    const row = { date: dayToISO(day), days };
    for (const cycle of CYCLES) row[cycle.id] = curveAt(days, cycle).value;
    series.push(row);
  }
  return series;
}
