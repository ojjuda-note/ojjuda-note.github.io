// Share the pinned astronomy dependency and natal helpers with the main reader.
// This module does not save names, change the chart or call payment services.
import { Solar } from './vendor/lunar-1.7.8.mjs?v=20261112-starlit-saju1';
import { makeProfile, getTenGod, interactionPairs } from './fortune-data.mjs?v=20261114-saju-correction1';

const HOUR = 3600000;
const PERIOD_COUNT = 9;
const ASSUMED_BIRTH_HOUR = 6;
const ASSUMED_BIRTH_NOTICE = '태어난 시간을 몰라 대운은 오전 6시 00분을 기준으로 계산했어요.';
const STEMS = [
  ['甲', '갑', 'wood'], ['乙', '을', 'wood'], ['丙', '병', 'fire'], ['丁', '정', 'fire'],
  ['戊', '무', 'earth'], ['己', '기', 'earth'], ['庚', '경', 'metal'], ['辛', '신', 'metal'],
  ['壬', '임', 'water'], ['癸', '계', 'water'],
];
const BRANCHES = [
  ['子', '자', 'water', '쥐', '癸'], ['丑', '축', 'earth', '소', '己'],
  ['寅', '인', 'wood', '호랑이', '甲'], ['卯', '묘', 'wood', '토끼', '乙'],
  ['辰', '진', 'earth', '용', '戊'], ['巳', '사', 'fire', '뱀', '丙'],
  ['午', '오', 'fire', '말', '丁'], ['未', '미', 'earth', '양', '己'],
  ['申', '신', 'metal', '원숭이', '庚'], ['酉', '유', 'metal', '닭', '辛'],
  ['戌', '술', 'earth', '개', '戊'], ['亥', '해', 'water', '돼지', '壬'],
];
const ELEMENTS = {
  wood: ['목', '木', '#91bba1'], fire: ['화', '火', '#e6a199'],
  earth: ['토', '土', '#d7bc80'], metal: ['금', '金', '#cbd0e0'], water: ['수', '水', '#91b9df'],
};
const TERMS = {
  小寒: '소한', 立春: '입춘', 惊蛰: '경칩', 清明: '청명', 立夏: '입하', 芒种: '망종',
  小暑: '소서', 立秋: '입추', 白露: '백로', 寒露: '한로', 立冬: '입동', 大雪: '대설',
};
const CYCLE = Array.from({ length: 60 }, (_, index) => STEMS[index % 10][0] + BRANCHES[index % 12][0]);
const SOURCES = [
  {
    id: 'daeun-library', title: '대운 순서와 시작 시점을 계산하는 공식 문서',
    publisher: '6tail · lunar-javascript 1.7.8', url: 'https://6tail.cn/calendar/lunar.bazi.html',
    usedFor: '월주에서 이어지는 대운 순서와 getYun의 분 단위 기산법(sect=2)을 확인합니다.',
    limitation: '전통 계산법의 구현 자료입니다. 미래 사건의 정확도를 검증한 자료는 아닙니다.',
  },
  {
    id: 'daeun-classic', title: '순행·역행과 3일을 1년으로 바꾸는 전통 근거',
    publisher: '《삼명통회》 「論大運」 · 고금도서집성 예술전 제598권',
    url: encodeURI('https://zh.wikisource.org/zh/欽定古今圖書集成/博物彙編/藝術典/第598卷'),
    usedFor: '양남·음녀는 다음 절까지, 음남·양녀는 앞선 절부터 생일까지 세는 원칙을 확인합니다.',
    limitation: '고전의 계산 원칙을 참고합니다. 원문의 수명·질병·사건 단정을 개인 예측으로 옮기지 않습니다.',
  },
  {
    id: 'daeun-method-review', title: '대운 시작 시점이 계산법마다 다른 이유',
    publisher: '최재봉·최정준, 「사주명리의 대운계산법 검토」, 동방문화와 사상 18, 2025',
    url: 'https://www.kci.go.kr/kciportal/landing/article.kci?arti_id=ART003221050',
    usedFor: '생년 천간과 성별에 따른 순역 규칙, 고전과 현대 역법의 기산 차이를 확인합니다.',
    limitation: '선택한 기산법의 차이를 설명하는 연구이며 특정 날짜의 실제 사건을 보증하지 않습니다.',
  },
];
const METHOD = {
  id: 'lunar-1.7.8-yun-sect2-kst-v1', label: '분 단위 절기 간격으로 계산', sect: 2,
  timezone: 'Asia/Seoul', utcOffset: '+09:00', periodYears: 10, periodCount: PERIOD_COUNT,
  ageConvention: '만 나이 · 한국 양력 생일 기준', precision: 'minute',
  notes: [
    '입춘으로 정한 출생 연간이 양이면 남성은 순행·여성은 역행, 음이면 남성은 역행·여성은 순행해요.',
    '월주를 기준으로 순행은 다음 간지, 역행은 앞 간지부터 시작해요. 각각 10년씩 9개 구간을 보여줘요.',
    '한국 출생 시각을 UTC+8로 한 시간 옮겨 절기 시각과 비교해요. 한국의 일주·시주는 바꾸지 않아요.',
    '순행은 다음 절까지, 역행은 앞선 절부터 출생까지의 분 차이를 써요. 4,320분은 1년, 360분은 1개월, 12분은 1일, 나머지 1분은 2시간으로 바꿔요.',
    '환산한 연·월·일·시간을 한국의 양력 출생 시각에 차례대로 더해 시작 시각을 정해요. 해당 월에 같은 일이 없으면 그달 말일을 써요.',
    '생일의 초는 입력받지 않아 분 단위로 계산해요. 표시한 시각은 이 계산법의 결과이며 그때 실제 사건이 생긴다는 뜻은 아니에요.',
    '구간은 시작 시각을 포함하고 다음 구간 시작 시각은 포함하지 않아요. 나이 표시는 한국 양력 생일로 센 만 나이이며 세는나이를 쓰지 않아요.',
    '기산법과 역법에 따라 다른 만세력과 시작 시점이 다를 수 있어요. 출생지 태양시·과거 표준시·서머타임은 보정하지 않아요.',
    '9개 구간은 표시 범위예요. 수명이나 살아갈 기간을 예측한 값이 아니에요.',
  ],
};

export class DaeunInputError extends Error {
  constructor(code, message) { super(message); this.name = 'DaeunInputError'; this.code = code; }
}
const invalid = (code, message) => { throw new DaeunInputError(code, message); };
const pad = value => String(value).padStart(2, '0');
const fact = (id, label, value) => ({ id, label, value, origin: 'calculation' });
const method = () => ({ ...METHOD, notes: [...METHOD.notes] });
const sources = () => SOURCES.map(value => ({ ...value }));

function character(data, index, branch = false) {
  const [hanja, hangul, element, animal] = data;
  const [elementLabel, elementHanja, color] = ELEMENTS[element];
  return { hanja, hangul, element, elementLabel, elementHanja, color, yinYang: index % 2 ? '음' : '양', ...(branch ? { animal } : {}) };
}
function pair(hanja) {
  if (!CYCLE.includes(hanja)) invalid('chart', '사주 글자를 다시 계산해 주세요.');
  const stemIndex = STEMS.findIndex(value => value[0] === hanja[0]);
  const branchIndex = BRANCHES.findIndex(value => value[0] === hanja[1]);
  const mainIndex = STEMS.findIndex(value => value[0] === BRANCHES[branchIndex][4]);
  const stem = character(STEMS[stemIndex], stemIndex), branch = character(BRANCHES[branchIndex], branchIndex, true);
  return { hanja, hangul: stem.hangul + branch.hangul, stem, branch, branchMainStem: character(STEMS[mainIndex], mainIndex) };
}
function stamp(solar) {
  const year = solar.getYear(), month = solar.getMonth(), day = solar.getDay();
  const time = `${pad(solar.getHour())}:${pad(solar.getMinute())}:${pad(solar.getSecond())}`;
  return {
    iso: `${year}-${pad(month)}-${pad(day)}T${time}+09:00`,
    label: `${year}년 ${month}월 ${day}일 ${time.slice(0, 5)}`,
    dateLabel: `${year}년 ${month}월 ${day}일`,
  };
}
function completedAge(birth, target) {
  // Civil birthday age, not the vendor's birth-year-based nominal age.
  const beforeBirthday = target.getMonth() < birth.getMonth()
    || (target.getMonth() === birth.getMonth() && target.getDay() < birth.getDay());
  return target.getYear() - birth.getYear() - Number(beforeBirthday);
}
function validateChart(chart, now) {
  if (!chart || !chart.input || typeof chart.timeKnown !== 'boolean') invalid('chart', '생년월일로 사주를 먼저 펼쳐 주세요.');
  if (!Array.isArray(chart.pillars) || chart.pillars.length !== 4
      || ['year', 'month', 'day', 'hour'].some(key => chart.pillars.filter(value => value?.key === key).length !== 1)) invalid('chart', '네 기둥의 사주 정보를 다시 계산해 주세요.');
  const { year, month, day } = chart.solar || {};
  if (![year, month, day].every(Number.isInteger) || year < 1900 || year > 2050
      || month < 1 || month > 12 || day < 1 || day > 31) invalid('chart', '양력 생일을 다시 확인해 주세요.');
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) invalid('chart', '양력 생일을 다시 확인해 주세요.');
  const { hour, minute } = chart.input;
  if (chart.timeKnown && (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59)) invalid('chart', '태어난 시간을 다시 확인해 주세요.');
  if (!chart.timeKnown && (hour !== null || minute !== 0)) invalid('chart', '출생시각 정보를 다시 확인해 주세요.');
  const koreaNow = new Date(now.getTime() + 9 * HOUR);
  if (Date.UTC(year, month - 1, day, chart.timeKnown ? hour : 0, chart.timeKnown ? minute : 0) > koreaNow.getTime()) invalid('future', '미래의 생일로는 대운을 계산할 수 없어요.');
  let profile;
  try { profile = makeProfile(chart); } catch { invalid('chart', '사주 정보를 다시 계산해 주세요.'); }
  for (const pillar of profile.knownPillars) pair(pillar.hanja);
  return profile;
}
function unavailable(gender, reason, message) {
  return {
    available: false, reason, message, gender, direction: null, directionLabel: null,
    startAge: null, startsAt: null, startLabel: null, birthAt: null, referenceTerm: null,
    currentIndex: null, currentState: 'unavailable', periods: [], facts: [], method: method(), sources: sources(),
  };
}

/** Traditional 10-year periods from a calculateSaju result.
 * An unknown birth time uses 06:00 KST only for decade order and start dates.
 * Natal gods/interactions still use the original confirmed profile; neither the
 * chart nor its unknown hour is changed. Known times retain their exact output.
 * `now` marks the current interval only. A display name is never read here. */
export function analyzeDaeun(chart, { gender = null, now = new Date() } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) invalid('clock', '현재 날짜를 확인할 수 없어요. 기기 시간을 확인해 주세요.');
  if (gender !== null && gender !== 'male' && gender !== 'female') invalid('gender', '대운 계산에 사용할 성별을 다시 선택해 주세요.');
  const profile = validateChart(chart, now);
  if (gender === null) return unavailable(gender, 'gender-required', '성별을 선택하면 10년마다 바뀌는 흐름을 함께 볼 수 있어요.');
  const timeAssumed = !chart.timeKnown;
  const knownYear = profile.knownPillars.find(value => value.key === 'year');
  const knownMonth = profile.knownPillars.find(value => value.key === 'month');
  if (!timeAssumed && (!knownYear || !knownMonth)) return unavailable(gender, 'solar-term-uncertain', '절기가 바뀌는 경계에 태어나 대운의 시작 시기와 순서를 확정할 수 없어요.');
  const birthHour = timeAssumed ? ASSUMED_BIRTH_HOUR : chart.input.hour;
  const birthMinute = timeAssumed ? 0 : chart.input.minute;
  // The assumed clock is a calculation convention, not a claimed birth time.
  // validateChart already rejects an actual future date or known birth time.
  const birth = Solar.fromYmdHms(chart.solar.year, chart.solar.month, chart.solar.day, birthHour, birthMinute, 0);
  const chinaBirth = birth.nextHour(-1);
  const lunar = chinaBirth.getLunar();
  const minuteEnd = Solar.fromYmdHms(chinaBirth.getYear(), chinaBirth.getMonth(), chinaBirth.getDay(), chinaBirth.getHour(), chinaBirth.getMinute(), 59).getLunar();
  if (!timeAssumed && (lunar.getYearInGanZhiExact() !== minuteEnd.getYearInGanZhiExact()
      || lunar.getMonthInGanZhiExact() !== minuteEnd.getMonthInGanZhiExact())) return unavailable(gender, 'solar-term-uncertain', '입력한 분 안에 절기가 바뀌어 대운의 시작 시기와 순서를 확정할 수 없어요.');
  // The explicitly assumed instant also resolves a term-boundary day for the
  // decade clock. It never resolves the corresponding unknown natal pillars.
  const year = timeAssumed ? pair(lunar.getYearInGanZhiExact()) : knownYear;
  const month = timeAssumed ? pair(lunar.getMonthInGanZhiExact()) : knownMonth;
  // Only the term-derived YEAR and MONTH use UTC+8. Keep the original Korean
  // day stem and natal interactions, including births shortly after midnight.
  if ((knownYear && knownYear.hanja !== lunar.getYearInGanZhiExact())
      || (knownMonth && knownMonth.hanja !== lunar.getMonthInGanZhiExact())) invalid('chart', '출생시각과 사주 글자가 맞지 않아요. 사주를 다시 펼쳐 주세요.');
  const yun = lunar.getEightChar().getYun(gender === 'male' ? 1 : 0, 2);
  const forward = yun.isForward();
  const expectedForward = year.stem.yinYang === '양' ? gender === 'male' : gender === 'female';
  if (forward !== expectedForward) invalid('calculation', '대운의 순서를 확인하지 못했어요. 다시 펼쳐 주세요.');
  const direction = forward ? 'forward' : 'reverse', directionLabel = forward ? '순행' : '역행';
  const startAge = { years: yun.getStartYear(), months: yun.getStartMonth(), days: yun.getStartDay(), hours: yun.getStartHour() };
  startAge.label = `태어난 뒤 ${startAge.years}년 ${startAge.months}개월 ${startAge.days}일 ${startAge.hours}시간`;
  // Apply the converted calendar duration in the USER'S civil calendar. Applying
  // it in UTC+8 and shifting afterwards can clip a different month-end date.
  const firstStart = birth.nextYear(startAge.years).nextMonth(startAge.months).next(startAge.days).nextHour(startAge.hours);
  const start = stamp(firstStart), birthStamp = stamp(birth);
  const jie = forward ? lunar.getNextJie(false) : lunar.getPrevJie(false);
  const referenceTerm = { ...stamp(jie.getSolar().nextHour(1)), term: TERMS[jie.getName()] || jie.getName(), hanja: jie.getName() };
  const facts = [
    fact('daeun.birth', timeAssumed ? '대운 계산에 가정한 출생시각' : '대운 계산의 출생시각', `${birthStamp.label} · 한국 표준시`+(timeAssumed ? ' · 실제 출생시각 미확정' : '')),
    fact('daeun.direction', timeAssumed ? '오전 6시 가정에 따른 대운의 순서' : '대운의 순서', `${year.hangul}년의 ${year.stem.hangul}(${year.stem.hanja})은 ${year.stem.yinYang} · ${gender === 'male' ? '남성' : '여성'} · ${directionLabel}`),
    fact('daeun.month', timeAssumed ? '오전 6시 가정으로 대운을 세는 출발 글자' : '대운을 세는 출발 글자', `${month.hangul}(${month.hanja}) 월주`),
    fact('daeun.term', '시작 계산에 사용한 절기', `${referenceTerm.term} · ${referenceTerm.label} · 한국 표준시`),
    fact('daeun.start', timeAssumed ? '오전 6시 가정에 따른 첫 대운의 시작' : '첫 대운의 계산상 시작', `${start.label} · ${startAge.label} · 만 ${completedAge(birth, firstStart)}세`),
  ];
  const monthIndex = CYCLE.indexOf(month.hanja);
  const officialPairs = yun.getDaYun(PERIOD_COUNT + 1).slice(1).map(value => value.getGanZhi());
  const periods = Array.from({ length: PERIOD_COUNT }, (_, offset) => {
    const index = offset + 1;
    const hanja = CYCLE[(monthIndex + (forward ? index : -index) + 60) % 60];
    if (hanja !== officialPairs[offset]) invalid('calculation', '대운의 글자를 확인하지 못했어요. 다시 펼쳐 주세요.');
    const value = pair(hanja);
    const periodStart = firstStart.nextYear(offset * 10), periodEnd = firstStart.nextYear(index * 10);
    const from = stamp(periodStart), to = stamp(periodEnd);
    const startAgeYears = completedAge(birth, periodStart);
    const lastInstant = new Date(Date.parse(to.iso) - 1 + 9 * HOUR);
    const lastDate = Solar.fromYmd(lastInstant.getUTCFullYear(), lastInstant.getUTCMonth() + 1, lastInstant.getUTCDate());
    const endAgeYears = completedAge(birth, lastDate);
    const factId = `daeun.period.${index}`;
    const ageLabel = `만 ${startAgeYears}~${endAgeYears}세`;
    facts.push(fact(factId, `${index}번째 10년 흐름`, `${value.hangul}(${value.hanja}) · ${from.label}부터 ${to.label} 전까지 · ${ageLabel}`));
    return {
      index, key: factId, label: `${index}번째 10년 흐름`, ...value,
      stemGod: getTenGod(profile.dayMaster, value.stem), branchGod: getTenGod(profile.dayMaster, value.branchMainStem),
      interactions: profile.knownPillars.flatMap(pillar => interactionPairs(pillar, value, {
        birthPillarKey: pillar.key, birthPillarLabel: pillar.label,
        transitLabel: `${index}번째 대운`, otherPillarLabel: `${index}번째 대운`,
      })),
      startsAt: from.iso, endsAt: to.iso, startLabel: from.label, endLabel: to.label,
      startAgeYears, endAgeYears, ageLabel,
      isCurrent: now.getTime() >= Date.parse(from.iso) && now.getTime() < Date.parse(to.iso),
      factIds: ['daeun.direction', 'daeun.month', 'daeun.start', factId],
    };
  });
  const currentIndex = periods.find(value => value.isCurrent)?.index ?? null;
  const currentState = currentIndex !== null ? 'active' : now.getTime() < Date.parse(start.iso) ? 'before-start' : 'after-listed-periods';
  return {
    available: true, reason: null, message: null, gender, direction, directionLabel,
    ...(timeAssumed ? { timeAssumed: true, assumedBirthTime: { hour: ASSUMED_BIRTH_HOUR, minute: 0, timezone: 'Asia/Seoul' }, birthTimeNotice: ASSUMED_BIRTH_NOTICE } : {}),
    startAge, startsAt: start.iso, startLabel: start.label, birthAt: birthStamp.iso, referenceTerm,
    currentIndex, currentState, periods, facts, method: method(), sources: sources(),
  };
}
