// Keep the immutable vendor URL shared with engine.mjs to avoid downloading
// the same astronomy library twice. The importing app versions this module.
import { Solar } from './vendor/lunar-1.7.8.mjs?v=20261112-starlit-saju1';
import { makeReference, makeTransitReference } from './reference-data.mjs?v=20261113-saju-reader1';

const HOUR = 3600000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2050;
const ELEMENTS = [
  { key: 'wood', label: '목', hanja: '木', color: '#91bba1' },
  { key: 'fire', label: '화', hanja: '火', color: '#e6a199' },
  { key: 'earth', label: '토', hanja: '土', color: '#d7bc80' },
  { key: 'metal', label: '금', hanja: '金', color: '#cbd0e0' },
  { key: 'water', label: '수', hanja: '水', color: '#91b9df' },
];
const STEMS = [
  ['甲', '갑', 'wood'], ['乙', '을', 'wood'], ['丙', '병', 'fire'], ['丁', '정', 'fire'],
  ['戊', '무', 'earth'], ['己', '기', 'earth'], ['庚', '경', 'metal'], ['辛', '신', 'metal'],
  ['壬', '임', 'water'], ['癸', '계', 'water'],
];
// The last column is the principal hidden stem, not the branch's own parity.
const BRANCHES = [
  ['子', '자', 'water', '쥐', '癸'], ['丑', '축', 'earth', '소', '己'],
  ['寅', '인', 'wood', '호랑이', '甲'], ['卯', '묘', 'wood', '토끼', '乙'],
  ['辰', '진', 'earth', '용', '戊'], ['巳', '사', 'fire', '뱀', '丙'],
  ['午', '오', 'fire', '말', '丁'], ['未', '미', 'earth', '양', '己'],
  ['申', '신', 'metal', '원숭이', '庚'], ['酉', '유', 'metal', '닭', '辛'],
  ['戌', '술', 'earth', '개', '戊'], ['亥', '해', 'water', '돼지', '壬'],
];
const PILLAR_LABELS = { year: '년주', month: '월주', day: '일주', hour: '시주' };
const GROUP_LABELS = { peer: '비겁', expression: '식상', wealth: '재성', authority: '관성', resource: '인성' };
const GODS = [
  { code: 'companion', name: '비견', hanja: '比肩', group: 'peer', keywords: ['주체성', '동료', '자립'] },
  { code: 'competitor', name: '겁재', hanja: '劫財', group: 'peer', keywords: ['협력', '경쟁', '경계'] },
  { code: 'creator', name: '식신', hanja: '食神', group: 'expression', keywords: ['표현', '꾸준함', '돌봄'] },
  { code: 'critic', name: '상관', hanja: '傷官', group: 'expression', keywords: ['발상', '개선', '전달'] },
  { code: 'opportunist', name: '편재', hanja: '偏財', group: 'wealth', keywords: ['기회', '교류', '자원'] },
  { code: 'manager', name: '정재', hanja: '正財', group: 'wealth', keywords: ['관리', '축적', '실행'] },
  { code: 'challenger', name: '편관', hanja: '偏官', group: 'authority', keywords: ['도전', '집중', '책임'], aliases: ['칠살'] },
  { code: 'officer', name: '정관', hanja: '正官', group: 'authority', keywords: ['기준', '신뢰', '역할'] },
  { code: 'explorer', name: '편인', hanja: '偏印', group: 'resource', keywords: ['탐구', '관점', '몰입'] },
  { code: 'scholar', name: '정인', hanja: '正印', group: 'resource', keywords: ['학습', '지원', '회복'] },
];
const SEASONS = [
  { key: 'spring', label: '봄', branches: '寅卯辰', terms: '입춘~입하 전', element: 'wood' },
  { key: 'summer', label: '여름', branches: '巳午未', terms: '입하~입추 전', element: 'fire' },
  { key: 'autumn', label: '가을', branches: '申酉戌', terms: '입추~입동 전', element: 'metal' },
  { key: 'winter', label: '겨울', branches: '亥子丑', terms: '입동~입춘 전', element: 'water' },
];
const TERMS = {
  小寒: '소한', 立春: '입춘', 惊蛰: '경칩', 清明: '청명', 立夏: '입하', 芒种: '망종',
  小暑: '소서', 立秋: '입추', 白露: '백로', 寒露: '한로', 立冬: '입동', 大雪: '대설',
};
const RELATIONS = [
  { kind: 'stem-combination', label: '천간합', position: 'stem', theme: '조율', pairs: ['甲己', '乙庚', '丙辛', '丁壬', '戊癸'] },
  { kind: 'branch-combination', label: '지지육합', position: 'branch', theme: '연결', pairs: ['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'] },
  { kind: 'branch-clash', label: '지지충', position: 'branch', theme: '변화', pairs: ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'] },
];

export class FortuneInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FortuneInputError';
    this.code = code;
  }
}
function invalid(code, message) { throw new FortuneInputError(code, message); }
const pad = value => String(value).padStart(2, '0');

function character(data, index, branch = false) {
  const [hanja, hangul, element, animal] = data;
  const info = ELEMENTS.find(value => value.key === element);
  return {
    hanja, hangul, element, elementLabel: info.label, elementHanja: info.hanja,
    color: info.color, yinYang: index % 2 ? '음' : '양', ...(branch ? { animal } : {}),
  };
}
function stemCharacter(hanja) {
  const index = STEMS.findIndex(value => value[0] === hanja);
  if (index < 0) invalid('chart', '일간과 사주 글자를 다시 확인해 주세요.');
  return character(STEMS[index], index);
}
function pillarCharacters(hanja) {
  if (typeof hanja !== 'string' || hanja.length !== 2) invalid('chart', '사주를 먼저 펼친 뒤 자세한 풀이를 열어 주세요.');
  const branchIndex = BRANCHES.findIndex(value => value[0] === hanja[1]);
  if (branchIndex < 0) invalid('chart', '사주 글자를 다시 확인해 주세요.');
  const stem = stemCharacter(hanja[0]);
  const branch = character(BRANCHES[branchIndex], branchIndex, true);
  return { hanja, hangul: stem.hangul + branch.hangul, stem, branch };
}
function mainStem(branch) {
  return stemCharacter(BRANCHES.find(value => value[0] === branch.hanja)[4]);
}

/** Ten Gods use the day stem's five-element relation and the target STEM's
 * parity. For a branch, callers pass its principal hidden stem first. */
export function getTenGod(dayStem, targetStem) {
  const day = stemCharacter(typeof dayStem === 'string' ? dayStem : dayStem?.hanja);
  const target = stemCharacter(typeof targetStem === 'string' ? targetStem : targetStem?.hanja);
  const from = ELEMENTS.findIndex(value => value.key === day.element);
  const to = ELEMENTS.findIndex(value => value.key === target.element);
  const relation = (to - from + 5) % 5;
  const opposite = day.yinYang !== target.yinYang;
  const god = GODS[relation * 2 + Number(opposite)];
  return { ...god, groupLabel: GROUP_LABELS[god.group], keywords: [...god.keywords], ...(god.aliases ? { aliases: [...god.aliases] } : {}) };
}

function interactionPairs(first, second, metadata) {
  const found = [];
  for (const relation of RELATIONS) {
    const left = first[relation.position], right = second[relation.position];
    const pairHanja = relation.pairs.find(pair => pair === left.hanja + right.hanja || pair === right.hanja + left.hanja);
    if (!pairHanja) continue;
    const data = relation.position === 'stem' ? STEMS : BRANCHES;
    const pairHangul = [...pairHanja].map(hanja => data.find(value => value[0] === hanja)[1]).join('');
    found.push({
      kind: relation.kind, label: relation.label, position: relation.position,
      theme: relation.theme, pairHanja, pairHangul,
      birthCharacter: { ...left }, otherCharacter: { ...right }, ...metadata,
    });
  }
  return found;
}
function transitInteractions(knownPillars, transit, label) {
  return knownPillars.flatMap(pillar => interactionPairs(pillar, transit, {
    birthPillarKey: pillar.key, birthPillarLabel: pillar.label,
    transitLabel: label, otherPillarLabel: label,
  }));
}

function makeProfile(chart) {
  if (!chart || !Array.isArray(chart.pillars)) invalid('chart', '생년월일로 사주를 먼저 펼쳐 주세요.');
  const knownPillars = [];
  for (const key of ['year', 'month', 'day', 'hour']) {
    const matches = chart.pillars.filter(value => value?.key === key);
    if (matches.length > 1) invalid('chart', '사주 정보를 다시 계산해 주세요.');
    const pillar = matches[0];
    if (!pillar || pillar.uncertain || !pillar.hanja || !pillar.stem || !pillar.branch) continue;
    knownPillars.push({ key, label: PILLAR_LABELS[key], ...pillarCharacters(pillar.hanja), uncertain: false });
  }
  const dayPillar = knownPillars.find(value => value.key === 'day');
  if (!dayPillar || chart.dayMaster?.hanja !== dayPillar.stem.hanja) invalid('chart', '확정된 일간이 있어야 자세한 풀이를 볼 수 있어요.');
  const counts = Object.fromEntries(ELEMENTS.map(value => [value.key, 0]));
  let yinCount = 0, yangCount = 0;
  const gods = [];
  for (const pillar of knownPillars) {
    for (const position of ['stem', 'branch']) {
      const source = pillar[position];
      counts[source.element]++;
      if (source.yinYang === '음') yinCount++; else yangCount++;
      // The day stem itself is 日主, not an extra 比肩 in the profile.
      if (pillar.key === 'day' && position === 'stem') continue;
      const stem = position === 'branch' ? mainStem(source) : source;
      gods.push({
        pillarKey: pillar.key, pillarLabel: pillar.label, position,
        positionLabel: position === 'stem' ? '천간' : '지지 본기',
        sourceHanja: source.hanja, sourceHangul: source.hangul,
        stem: { ...stem }, god: getTenGod(dayPillar.stem, stem),
      });
    }
  }
  const elements = ELEMENTS.map(value => ({ ...value, count: counts[value.key] }));
  const maximum = Math.max(...elements.map(value => value.count));
  const monthPillar = knownPillars.find(value => value.key === 'month');
  const birthSeason = monthPillar && SEASONS.find(value => value.branches.includes(monthPillar.branch.hanja));
  const interactions = [];
  for (let first = 0; first < knownPillars.length; first++) {
    for (let second = first + 1; second < knownPillars.length; second++) {
      const left = knownPillars[first], right = knownPillars[second];
      interactions.push(...interactionPairs(left, right, {
        birthPillarKey: left.key, birthPillarLabel: left.label,
        otherPillarKey: right.key, otherPillarLabel: right.label,
      }));
    }
  }
  return {
    dayMaster: { ...dayPillar.stem }, knownPillars,
    knownCharacterCount: knownPillars.length * 2, complete: knownPillars.length === 4,
    elements, dominantElements: elements.filter(value => value.count === maximum),
    missingElements: elements.filter(value => value.count === 0), yinCount, yangCount,
    season: birthSeason ? { key: birthSeason.key, label: birthSeason.label, terms: birthSeason.terms, element: birthSeason.element, branch: { ...monthPillar.branch } } : null,
    gods, interactions,
  };
}

// Astronomy returns China standard time (UTC+8); expose the same instant in
// Korea standard time (UTC+9), including midnight/date/year rollovers.
function termMoment(solar, term) {
  const koreanClock = new Date(Date.UTC(solar.getYear(), solar.getMonth() - 1, solar.getDay(), solar.getHour(), solar.getMinute(), solar.getSecond()) + HOUR);
  const year = koreanClock.getUTCFullYear(), month = koreanClock.getUTCMonth() + 1, day = koreanClock.getUTCDate();
  const time = `${pad(koreanClock.getUTCHours())}:${pad(koreanClock.getUTCMinutes())}:${pad(koreanClock.getUTCSeconds())}`;
  return {
    iso: `${year}-${pad(month)}-${pad(day)}T${time}+09:00`,
    label: `${year}년 ${month}월 ${day}일 ${time}`,
    shortLabel: `${month}월 ${day}일 ${time.slice(0, 5)}`,
    term: TERMS[term] || term,
  };
}
function springMoment(year) {
  return termMoment(Solar.fromYmd(year, 6, 15).getLunar().getJieQiTable()['立春'], '立春');
}
const within = (now, start, end) => now.getTime() >= Date.parse(start.iso) && now.getTime() < Date.parse(end.iso);
function transitData(hanja, profile, { label, key, scope }) {
  const value = pillarCharacters(hanja);
  const branchMainStem = mainStem(value.branch);
  return {
    ...value, branchMainStem,
    stemGod: getTenGod(profile.dayMaster, value.stem),
    branchGod: getTenGod(profile.dayMaster, branchMainStem),
    interactions: transitInteractions(profile.knownPillars, value, label),
    reference: makeTransitReference(profile, value, { label, key, scope }, stemCharacter, getTenGod),
  };
}

/** Analysis facts for traditional symbolic readings, not a future predictor.
 * No gender, name, external requests, storage, fortune scores or ten-year
 * Da-Yun cycle is needed or inferred. Input is calculateSaju's result. */
export function analyzeFortune(chart, { year, now = new Date() } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) invalid('clock', '현재 날짜를 확인할 수 없어요. 기기 시간을 확인해 주세요.');
  const koreanClock = new Date(now.getTime() + 9 * HOUR);
  const currentYear = koreanClock.getUTCFullYear();
  const currentMonth = koreanClock.getUTCMonth() + 1;
  const selectedYear = year ?? currentYear;
  if (!Number.isInteger(selectedYear) || selectedYear < MIN_YEAR || selectedYear > MAX_YEAR) invalid('year', `${MIN_YEAR}~${MAX_YEAR}년 중 풀이할 연도를 선택해 주세요.`);
  const profile = makeProfile(chart);
  profile.reference = makeReference(profile, stemCharacter, getTenGod);
  if (Number.isInteger(chart.solar?.year) && selectedYear < chart.solar.year) invalid('year', '태어난 연도 이후의 운세를 선택해 주세요.');
  const currentSolarTermYear = now.getTime() < Date.parse(springMoment(currentYear).iso) ? currentYear - 1 : currentYear;
  const start = springMoment(selectedYear), end = springMoment(selectedYear + 1);
  const annual = {
    year: selectedYear,
    ...transitData(Solar.fromYmdHms(selectedYear, 6, 15, 11, 0, 0).getLunar().getYearInGanZhiExact(), profile, { label: `${selectedYear}년 세운`, key: 'annual', scope: 'annual' }),
    start, end, isCurrent: within(now, start, end),
    notes: ['세운은 1월 1일이 아니라 입춘 순간부터 다음 입춘 전까지 이어져요.'],
  };
  if (selectedYear === currentYear && currentSolarTermYear !== selectedYear) annual.notes.push(`지금은 입춘 전이므로 ${currentSolarTermYear}년의 세운에 해당해요.`);
  const months = [];
  for (let month = 1; month <= 12; month++) {
    // A fixed noon-KST midpoint selects the relevant 절 month; it is not
    // the interval boundary. Boundaries come from astronomical Jie instants.
    const lunar = Solar.fromYmdHms(selectedYear, month, 15, 11, 0, 0).getLunar();
    const previous = lunar.getPrevJie(false), next = lunar.getNextJie(false);
    const periodStart = termMoment(previous.getSolar(), previous.getName());
    const periodEnd = termMoment(next.getSolar(), next.getName());
    const yearPair = pillarCharacters(lunar.getYearInGanZhiExact());
    months.push({
      year: selectedYear, month, key: `${selectedYear}-${pad(month)}`,
      ...transitData(lunar.getMonthInGanZhiExact(), profile, { label: `${selectedYear}년 ${month}월 월운`, key: `month.${month}`, scope: 'monthly' }),
      yearHanja: yearPair.hanja, yearHangul: yearPair.hangul,
      solarTermYear: month === 1 ? selectedYear - 1 : selectedYear,
      start: periodStart, end: periodEnd, isCurrent: within(now, periodStart, periodEnd),
      notes: month === 1 ? [`입춘 전의 절기월이므로 년주는 ${yearPair.hangul}(${yearPair.hanja}), 절기년은 ${selectedYear - 1}년이에요.`] : [],
    });
  }
  const notes = ['1~12월은 각 양력월 중순이 속한 절기월이에요. 달력의 1일~말일과 다르므로 표시된 시작·종료 시각을 함께 봐 주세요.'];
  if (selectedYear === currentYear && now.getTime() < Date.parse(months[0].start.iso)) {
    notes.push(`지금은 소한 전이라 ${selectedYear - 1}년 12월의 절기월에 해당해요. ${selectedYear}년 1월 월운은 표시된 소한 시각부터 시작해요.`);
  }
  const limitations = [
    '평생운은 확인된 원국의 장기적인 주제를 읽는 풀이예요. 나이별 10년 대운이나 특정 사건의 시점을 계산한 결과는 아니에요.',
    '십성은 일간과 다른 천간·지지 본기의 관계를 보여줘요. 일간 본인은 십성 개수에서 제외해요.',
    '주요 십성 집계는 지지 본기만 사용해요. 전체 지장간은 별도 참고표로 제공하며 신강신약·용신·격국을 종합 판정하지 않아요.',
    '합과 충은 글자 사이에 해당 짝이 있다는 뜻이에요. 합화의 성립이나 길흉·사건 발생을 단정하지 않아요.',
    '현대 한국 표준시(UTC+9) 기준이며 출생지 태양시·역사적 표준시·서머타임은 보정하지 않아요.',
    '오행·음양 개수는 확정된 글자를 같은 비중으로 센 값이에요. 강약 점수나 미래의 성적표가 아니에요.',
  ];
  if (!profile.complete) limitations.unshift(`확정된 ${profile.knownCharacterCount}글자만 해석해요. 보이지 않는 오행은 확정된 부분에서만 없는 것이며, 미확정 년주·월주·시주는 추정하지 않아요.`);
  if (!profile.season) limitations.push('월주를 확정할 수 없어 태어난 절기 계절의 해석은 생략해요.');
  return { year: selectedYear, currentYear, currentMonth, currentSolarTermYear, profile, annual, months, notes, limitations };
}
