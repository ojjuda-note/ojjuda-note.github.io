import KoreanLunarCalendar from './vendor/korean-lunar-0.4.0.mjs?v=20261112-starlit-saju1';
import { Solar } from './vendor/lunar-1.7.8.mjs?v=20261112-starlit-saju1';

export const MIN_YEAR = 1900;
export const MAX_YEAR = 2050;
const HOUR = 3600000;
const ELEMENTS = Object.freeze([
  { key: 'wood', label: '목', hanja: '木', color: '#91bba1' },
  { key: 'fire', label: '화', hanja: '火', color: '#e6a199' },
  { key: 'earth', label: '토', hanja: '土', color: '#d7bc80' },
  { key: 'metal', label: '금', hanja: '金', color: '#cbd0e0' },
  { key: 'water', label: '수', hanja: '水', color: '#91b9df' },
]);
const STEM_DATA = [
  ['甲', '갑', 'wood'], ['乙', '을', 'wood'],
  ['丙', '병', 'fire'], ['丁', '정', 'fire'],
  ['戊', '무', 'earth'], ['己', '기', 'earth'],
  ['庚', '경', 'metal'], ['辛', '신', 'metal'],
  ['壬', '임', 'water'], ['癸', '계', 'water'],
];
const BRANCH_DATA = [
  ['子', '자', 'water', '쥐'], ['丑', '축', 'earth', '소'],
  ['寅', '인', 'wood', '호랑이'], ['卯', '묘', 'wood', '토끼'],
  ['辰', '진', 'earth', '용'], ['巳', '사', 'fire', '뱀'],
  ['午', '오', 'fire', '말'], ['未', '미', 'earth', '양'],
  ['申', '신', 'metal', '원숭이'], ['酉', '유', 'metal', '닭'],
  ['戌', '술', 'earth', '개'], ['亥', '해', 'water', '돼지'],
];
const LABELS = { year: '년주', month: '월주', day: '일주', hour: '시주' };

export class SajuInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SajuInputError';
    this.code = code;
  }
}

function invalid(code, message) { throw new SajuInputError(code, message); }
const pad = value => String(value).padStart(2, '0');
const iso = value => `${value.year}-${pad(value.month)}-${pad(value.day)}`;
const dateLabel = value => `${value.year}년 ${value.month}월 ${value.day}일`;

function character(data, index) {
  const [hanja, hangul, element, animal] = data;
  const info = ELEMENTS.find(item => item.key === element);
  return {
    hanja, hangul, element, elementLabel: info.label,
    elementHanja: info.hanja, color: info.color,
    yinYang: index % 2 ? '음' : '양',
    ...(animal ? { animal } : {}),
  };
}

function pair(hanja) {
  const stemIndex = STEM_DATA.findIndex(item => item[0] === hanja[0]);
  const branchIndex = BRANCH_DATA.findIndex(item => item[0] === hanja[1]);
  if (stemIndex < 0 || branchIndex < 0) throw new Error('사주 글자를 읽지 못했어요. 다시 시도해 주세요.');
  const stem = character(STEM_DATA[stemIndex], stemIndex);
  const branch = character(BRANCH_DATA[branchIndex], branchIndex);
  return { hanja, hangul: stem.hangul + branch.hangul, stem, branch };
}

function pillar(key, candidates, reason = null) {
  const alternatives = [...new Set(candidates)].map(pair);
  const certain = alternatives.length === 1;
  return {
    key, label: LABELS[key],
    ...(certain ? alternatives[0] : { hanja: null, hangul: null, stem: null, branch: null }),
    uncertain: !certain, reason: certain ? null : reason,
    alternatives: certain ? [] : alternatives,
  };
}

// lunar-javascript's solar-term instants are expressed in UTC+8. Only
// year/month boundary comparisons use that clock. Civil day and hour stay
// in the user's explicitly selected modern Korean UTC+9 convention.
function termPillars(solar, hour, minute, second) {
  const chineseClock = new Date(Date.UTC(solar.year, solar.month - 1, solar.day, hour, minute, second) - HOUR);
  const lunar = Solar.fromYmdHms(
    chineseClock.getUTCFullYear(), chineseClock.getUTCMonth() + 1, chineseClock.getUTCDate(),
    chineseClock.getUTCHours(), chineseClock.getUTCMinutes(), chineseClock.getUTCSeconds(),
  ).getLunar();
  return { year: lunar.getYearInGanZhiExact(), month: lunar.getMonthInGanZhiExact() };
}

/**
 * Birth chart calculated entirely on the current device. No storage or requests.
 * `hour: null` means unknown; hour 0 is a known midnight birth.
 * Optional `now` enables stable tests and still enforces a nonfuture birth date.
 */
export function calculateSaju(input, { now = new Date() } = {}) {
  if (!input || typeof input !== 'object') invalid('input', '생년월일을 입력해 주세요.');
  const { year, month, day, calendar = 'solar', leapMonth = false } = input;
  const hour = input.hour ?? null;
  const minute = hour === null ? 0 : (input.minute ?? 0);
  const timeKnown = hour !== null;
  if (!['solar', 'lunar'].includes(calendar)) invalid('calendar', '양력 또는 음력을 선택해 주세요.');
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    invalid('year', `${MIN_YEAR}년부터 현재까지의 출생 연도를 입력해 주세요.`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) {
    invalid('date', '태어난 월과 일을 다시 확인해 주세요.');
  }
  if (typeof leapMonth !== 'boolean' || (calendar === 'solar' && leapMonth)) {
    invalid('leap-month', '윤달은 음력 생일일 때만 선택해 주세요.');
  }
  if (timeKnown && (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59)) {
    invalid('time', '태어난 시간을 0~23시, 0~59분으로 입력해 주세요.');
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) invalid('clock', '현재 시간을 확인할 수 없어요. 기기의 날짜를 확인해 주세요.');

  const converter = new KoreanLunarCalendar();
  const valid = calendar === 'lunar'
    ? converter.setLunarDate(year, month, day, leapMonth)
    : converter.setSolarDate(year, month, day);
  if (!valid) {
    invalid('date', calendar === 'lunar'
      ? '음력 날짜나 윤달 여부가 맞지 않아요. 생일을 다시 확인해 주세요.'
      : '존재하지 않는 날짜예요. 생년월일을 다시 확인해 주세요.');
  }
  const solarValue = converter.getSolarCalendar();
  const lunarValue = converter.getLunarCalendar();
  const koreaNow = new Date(now.getTime() + 9 * HOUR);
  const today = { year: koreaNow.getUTCFullYear(), month: koreaNow.getUTCMonth() + 1, day: koreaNow.getUTCDate() };
  if (iso(solarValue) > iso(today)
      || (timeKnown && Date.UTC(solarValue.year, solarValue.month - 1, solarValue.day, hour, minute) > koreaNow.getTime())) {
    invalid('future', '미래의 날짜와 시간은 생일로 입력할 수 없어요.');
  }
  if (solarValue.year < MIN_YEAR || solarValue.year > MAX_YEAR) invalid('range', `${MIN_YEAR}년 이후의 양력 생일을 입력해 주세요.`);

  // With unknown time, both ends of the Korean civil day must agree.
  // With minute precision, both ends of that minute must agree. A birth in
  // the same minute as a solar-term transition is not silently rounded.
  const first = termPillars(solarValue, timeKnown ? hour : 0, timeKnown ? minute : 0, 0);
  const last = termPillars(solarValue, timeKnown ? hour : 23, timeKnown ? minute : 59, 59);
  const dayHanja = converter.getChineseGapja().day.slice(0, 2);
  const dayStemIndex = STEM_DATA.findIndex(item => item[0] === dayHanja[0]);
  const hourBranchIndex = timeKnown ? Math.floor((hour + 1) / 2) % 12 : null;
  // Match lunar-javascript's published sect=2 (split Zi hour) convention:
  // the day pillar changes at 00:00, but the Zi-hour pillar is continuous
  // from 23:00 through the next date's 00:59, using the next day's stem.
  const hourDayStemIndex = (dayStemIndex + (hour === 23 ? 1 : 0)) % 10;
  const hourHanja = timeKnown
    ? STEM_DATA[(hourDayStemIndex % 5 * 2 + hourBranchIndex) % 10][0] + BRANCH_DATA[hourBranchIndex][0]
    : null;
  const pillars = [
    pillar('year', [first.year, last.year], 'solar-term-boundary'),
    pillar('month', [first.month, last.month], 'solar-term-boundary'),
    pillar('day', [dayHanja]),
    pillar('hour', timeKnown ? [hourHanja] : [], 'birth-time-unknown'),
  ];
  const counts = Object.fromEntries(ELEMENTS.map(item => [item.key, 0]));
  let knownCharacterCount = 0;
  for (const value of pillars) {
    if (!value.stem || !value.branch) continue;
    counts[value.stem.element] += 1;
    counts[value.branch.element] += 1;
    knownCharacterCount += 2;
  }
  const warnings = [];
  if (!timeKnown) warnings.push('태어난 시간을 모르므로 시주는 표시하지 않아요.');
  const ambiguous = pillars.filter(value => value.reason === 'solar-term-boundary');
  if (ambiguous.length) {
    warnings.push(timeKnown
      ? `입력한 분 안에 절기가 바뀌어 ${ambiguous.map(value => value.label).join('·')}를 하나로 정할 수 없어요. 두 후보를 함께 보여드려요.`
      : `이 날은 절기가 바뀌어 태어난 시간에 따라 ${ambiguous.map(value => value.label).join('·')}가 달라져요. 두 후보를 함께 보여드려요.`);
  }
  if (knownCharacterCount < 8) warnings.push(`오행은 확정된 ${knownCharacterCount}글자만 세었어요. 전체 사주의 오행 비율은 아니에요.`);
  const solar = { ...solarValue, iso: iso(solarValue), label: dateLabel(solarValue) };
  const lunar = {
    year: lunarValue.year, month: lunarValue.month, day: lunarValue.day,
    leapMonth: lunarValue.intercalation,
    label: `${lunarValue.year}년 ${lunarValue.intercalation ? '윤' : ''}${lunarValue.month}월 ${lunarValue.day}일`,
  };
  return {
    input: { year, month, day, calendar, leapMonth, hour, minute },
    solar, lunar, timeKnown,
    timeLabel: timeKnown ? `${pad(hour)}:${pad(minute)}` : '태어난 시간 모름',
    pillars, dayMaster: { ...pillars[2].stem },
    elements: ELEMENTS.map(item => ({ ...item, count: counts[item.key] })),
    knownCharacterCount, uncertain: pillars.some(value => value.uncertain), warnings,
    conventions: [
      '현대 한국 표준시(UTC+9)를 기준으로 계산해요.',
      '년주는 입춘, 월주는 절기가 바뀌는 정확한 시각을 기준으로 정해요.',
      '일주는 자정에 바뀌며, 자시의 시주는 23시부터 다음 날 0시 59분까지 이어지는 야자시 분리 기준이에요.',
      '출생지의 태양시·과거 표준시·서머타임은 보정하지 않아요.',
      '오행은 드러난 천간·지지를 같은 비중으로 세며, 지장간·계절의 세기는 반영하지 않아요.',
    ],
  };
}
