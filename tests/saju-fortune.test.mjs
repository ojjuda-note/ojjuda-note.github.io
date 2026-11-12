import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaju } from '../games/starlit-saju/engine.mjs';
import { analyzeFortune, getTenGod, FortuneInputError } from '../games/starlit-saju/fortune-data.mjs';
import { Solar } from '../games/starlit-saju/vendor/lunar-1.7.8.mjs';
import { makeReference } from '../games/starlit-saju/reference-data.mjs';

const NOW = new Date('2026-11-13T00:00:00Z');
const birth = calculateSaju({ year: 2005, month: 12, day: 23, hour: 8, minute: 37 }, { now: NOW });
const analyze = (chart = birth, options = {}) => analyzeFortune(chart, { year: 2026, now: NOW, ...options });

test('all hidden stems, twelve-stage labels, nayin and xun match the pinned official EightChar example', () => {
  const profile = analyze().profile;
  const official = Solar.fromYmdHms(2005,12,23,8,37,0).getLunar().getEightChar();
  const names = {比肩:'비견',劫财:'겁재',食神:'식신',伤官:'상관',偏财:'편재',正财:'정재',七杀:'편관',正官:'정관',偏印:'편인',正印:'정인'};
  const slots = ['Year','Month','Day','Time'];
  profile.reference.pillars.forEach((pillar,index) => {
    const slot = slots[index];
    assert.deepEqual(pillar.hiddenStems.map(value=>value.stem.hanja),official[`get${slot}HideGan`]());
    assert.deepEqual(pillar.hiddenStems.map(value=>value.god.name),official[`get${slot}ShiShenZhi`]().map(value=>names[value]));
    assert.equal(pillar.lifeStage.hanja,official[`get${slot}DiShi`]());
    assert.equal(pillar.nayin.hanja,official[`get${slot}NaYin`]());
    assert.equal(pillar.xun.hanja,official[`get${slot}Xun`]());
    assert.equal(pillar.xunKong.hanja,official[`get${slot}XunKong`]());
    assert.deepEqual(pillar.hiddenStems.map(value=>value.order),Array.from({length:pillar.hiddenStems.length},(_,i)=>i+1));
    assert.equal(pillar.hiddenStems.filter(value=>value.isMain).length,1);
  });
  assert.deepEqual(profile.reference.pillars.map(value=>value.hiddenStems.map(stem=>stem.stem.hanja)),[['辛'],['癸'],['丙','庚','戊'],['戊','乙','癸']]);
  assert.deepEqual(profile.reference.pillars.map(value=>value.lifeStage.hanja),['临官','长生','死','墓']);
  assert.deepEqual(profile.reference.pillars.map(value=>value.nayin.hanja),['泉中水','霹雳火','白蜡金','长流水']);
  assert.equal(profile.gods.length,7,'full hidden stems must not inflate the principal-stem god count');
  assert.equal(profile.knownCharacterCount,8);
  assert.equal(profile.reference.pillars.flatMap(value=>value.hiddenStems).length,8);
});

test('reference lookup agrees with all sixty day-pair APIs without recalculating birth time', () => {
  const first = Solar.fromYmdHms(2005,1,1,12,0,0);
  const seen = new Set();
  for (let offset=0; offset<60; offset++) {
    const official = first.next(offset).getLunar().getEightChar();
    const hanja = official.getDay();
    seen.add(hanja);
    const pillar = {key:'day',label:'일주',hanja,hangul:'',stem:{hanja:hanja[0]},branch:{hanja:hanja[1]}};
    const reference = makeReference({dayMaster:pillar.stem,knownPillars:[pillar]},value=>({hanja:value}),getTenGod).pillars[0];
    assert.equal(reference.lifeStage.hanja,official.getDayDiShi());
    assert.equal(reference.nayin.hanja,official.getDayNaYin());
    assert.equal(reference.xun.hanja,official.getDayXun());
    assert.equal(reference.xunKong.hanja,official.getDayXunKong());
  }
  assert.equal(seen.size,60);
});

test('reference table never adds an unknown hour or an uncertain ipchun year/month', () => {
  const ordinary = analyze(calculateSaju({year:2005,month:12,day:23,hour:null},{now:NOW})).profile;
  const boundary = analyze(calculateSaju({year:2024,month:2,day:4,hour:null},{now:NOW})).profile;
  assert.deepEqual(ordinary.reference.pillars.map(value=>value.pillarKey),['year','month','day']);
  assert.deepEqual(boundary.reference.pillars.map(value=>value.pillarKey),['day']);
  assert.equal(boundary.gods.length,1);
  assert.equal(boundary.knownCharacterCount,2);
  assert.match(boundary.reference.notes.join(' '),/의학적 질병·사망·수명 예측을 뜻하지/);
  assert.match(boundary.reference.notes.join(' '),/다시 합산하지/);
});

test('all ten gods use the day stem, five-element relation, and target stem parity', () => {
  assert.deepEqual([...('甲乙丙丁戊己庚辛壬癸')].map(value => getTenGod('甲', value).name), [
    '비견', '겁재', '식신', '상관', '편재', '정재', '편관', '정관', '편인', '정인',
  ]);
  assert.deepEqual([...('乙甲丁丙己戊辛庚癸壬')].map(value => getTenGod('乙', value).name), [
    '비견', '겁재', '식신', '상관', '편재', '정재', '편관', '정관', '편인', '정인',
  ]);
  assert.equal(new Set([...('甲乙丙丁戊己庚辛壬癸')].map(value => getTenGod('甲', value).code)).size, 10);
});

test('official 2005 example matches EightChar stem and principal hidden-stem gods', () => {
  const value = analyze().profile;
  const god = (key, position) => value.gods.find(item => item.pillarKey === key && item.position === position);
  assert.equal(god('year', 'stem').god.name, '편재');
  assert.equal(god('month', 'stem').god.name, '정인');
  assert.equal(god('hour', 'stem').god.name, '상관');
  assert.equal(god('year', 'branch').god.name, '비견');
  assert.equal(god('month', 'branch').god.name, '식신');
  assert.equal(god('month', 'branch').stem.hanja, '癸'); // 子's principal stem is yin.
  assert.equal(god('day', 'branch').god.name, '정관');
  assert.equal(god('hour', 'branch').god.name, '정인');
  assert.equal(god('day', 'stem'), undefined); // 日主 is not an extra peer.
  assert.equal(value.gods.length, 7);
  const official = Solar.fromYmdHms(2005, 12, 23, 8, 37, 0).getLunar().getEightChar();
  const toKorean = { 偏财: '편재', 正印: '정인', 伤官: '상관', 比肩: '비견', 食神: '식신', 正官: '정관' };
  assert.equal(god('year', 'stem').god.name, toKorean[official.getYearShiShenGan()]);
  assert.equal(god('month', 'stem').god.name, toKorean[official.getMonthShiShenGan()]);
  assert.equal(god('hour', 'stem').god.name, toKorean[official.getTimeShiShenGan()]);
  assert.equal(god('month', 'branch').god.name, toKorean[official.getMonthShiShenZhi()[0]]);
  assert.equal(god('day', 'branch').god.name, toKorean[official.getDayShiShenZhi()[0]]);
});

test('profile reports known elements, yin/yang, and season without strength scores', () => {
  const value = analyze().profile;
  assert.equal(value.complete, true);
  assert.equal(value.knownCharacterCount, 8);
  assert.equal(value.yinCount + value.yangCount, 8);
  assert.equal(value.season.key, 'winter');
  assert.deepEqual(value.elements.map(item => item.count), birth.elements.map(item => item.count));
  assert.deepEqual(value.dominantElements.map(item => item.key), ['earth', 'metal', 'water']);
  assert.deepEqual(value.missingElements, []);
  assert.equal('score' in value, false);
});

test('2026 and 2027 annual pillars start at Korean ipchun, not New Year', () => {
  const thisYear = analyze();
  const nextYear = analyze(birth, { year: 2027 });
  assert.equal(thisYear.annual.hanja, '丙午');
  assert.equal(thisYear.annual.hangul, '병오');
  assert.equal(nextYear.annual.hanja, '丁未');
  assert.equal(thisYear.annual.start.iso, '2026-02-04T05:02:08+09:00');
  assert.equal(thisYear.annual.end.iso, '2027-02-04T10:46:18+09:00');
  assert.equal(thisYear.annual.end.iso, nextYear.annual.start.iso);
  assert.equal(thisYear.annual.branchMainStem.hanja, '丁'); // 午 uses 丁, not yang 丙.
  assert.equal(thisYear.annual.stemGod.name, '정관');
  assert.equal(thisYear.annual.branchGod.name, '편관');
});

test('twelve month pillars follow chronological solar-term intervals', () => {
  const { months } = analyze();
  assert.deepEqual(months.map(item => item.month), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(months.map(item => item.hanja), ['己丑', '庚寅', '辛卯', '壬辰', '癸巳', '甲午', '乙未', '丙申', '丁酉', '戊戌', '己亥', '庚子']);
  assert.deepEqual(months.map(item => item.start.term), ['소한', '입춘', '경칩', '청명', '입하', '망종', '소서', '입추', '백로', '한로', '입동', '대설']);
  for (let index = 0; index < 12; index++) {
    assert.ok(Date.parse(months[index].start.iso) < Date.parse(months[index].end.iso));
    if (index < 11) assert.equal(months[index].end.iso, months[index + 1].start.iso);
  }
  assert.equal(months[11].end.iso, '2027-01-05T23:09:58+09:00');
  assert.equal(months.filter(item => item.isCurrent).length, 1);
  assert.equal(months.find(item => item.isCurrent).month, 11);
});

test('KST conversion preserves solar-term midnight and year rollovers', () => {
  const value = analyze();
  assert.equal(value.months[5].start.iso, '2026-06-06T00:48:21+09:00');
  const chinese = Solar.fromYmdHms(2026, 6, 15, 11, 0, 0).getLunar().getPrevJie(false).getSolar();
  assert.equal(chinese.toYmdHms(), '2026-06-05 23:48:21');
  assert.equal(value.months[0].yearHanja, '乙巳');
  assert.equal(value.months[0].solarTermYear, 2025);
  assert.equal(value.months[1].yearHanja, '丙午');
  assert.equal(value.months[1].solarTermYear, 2026);
  assert.equal(analyze(birth, { year: 2027 }).months[0].yearHanja, '丙午');
});

test('current period uses inclusive start and exclusive end to the second', () => {
  const edge = '2026-02-04T05:02:08+09:00';
  const before = analyze(birth, { now: new Date(Date.parse(edge) - 1) });
  const at = analyze(birth, { now: new Date(edge) });
  assert.equal(before.annual.isCurrent, false);
  assert.equal(before.currentSolarTermYear, 2025);
  assert.equal(before.months.find(item => item.isCurrent).month, 1);
  assert.equal(at.annual.isCurrent, true);
  assert.equal(at.currentSolarTermYear, 2026);
  assert.equal(at.months.find(item => item.isCurrent).month, 2);
});

test('January before Sohan belongs to the previous December, with an explicit note', () => {
  const value = analyze(birth, { now: new Date('2026-01-01T00:00:00+09:00') });
  assert.equal(value.year, 2026);
  assert.equal(value.currentYear, 2026);
  assert.equal(value.currentMonth, 1);
  assert.equal(value.currentSolarTermYear, 2025);
  assert.equal(value.annual.isCurrent, false);
  assert.equal(value.months.some(item => item.isCurrent), false);
  assert.match(value.notes.join(' '), /2025년 12월/);
  const previous = analyze(birth, { year: 2025, now: new Date('2026-01-01T00:00:00+09:00') });
  assert.equal(previous.months.find(item => item.isCurrent).month, 12);
  assert.equal(previous.annual.isCurrent, true);
});

test('known symbolic stem combinations, branch combinations, and clashes are detected', () => {
  // A synthetic chart isolates pair matching; it is not presented as a birth.
  const pillars = ['甲子', '己丑', '庚午', '乙未'].map((hanja, index) => ({
    key: ['year', 'month', 'day', 'hour'][index], hanja, uncertain: false,
    stem: { hanja: hanja[0] }, branch: { hanja: hanja[1] },
  }));
  const value = analyze({ pillars, dayMaster: { hanja: '庚' } });
  const found = value.profile.interactions;
  const pairs = kind => found.filter(item => item.kind === kind).map(item => item.pairHanja).sort();
  assert.deepEqual(pairs('stem-combination'), ['乙庚', '甲己'].sort());
  assert.deepEqual(pairs('branch-combination'), ['子丑', '午未'].sort());
  assert.deepEqual(pairs('branch-clash'), ['子午', '丑未'].sort());
  assert.ok(found.every(item => item.birthPillarKey !== item.otherPillarKey));
  assert.ok(value.annual.interactions.some(item => item.kind === 'branch-clash' && item.birthPillarKey === 'year'));
  assert.ok(value.annual.interactions.some(item => item.kind === 'branch-combination' && item.birthPillarKey === 'hour'));
});

test('unknown birth time excludes the hour and does not manufacture extra gods', () => {
  const unknown = calculateSaju({ year: 2005, month: 12, day: 23, hour: null }, { now: NOW });
  const value = analyze(unknown);
  assert.equal(value.profile.complete, false);
  assert.equal(value.profile.knownCharacterCount, 6);
  assert.equal(value.profile.gods.length, 5);
  assert.ok(value.profile.gods.every(item => item.pillarKey !== 'hour'));
  for (const period of [value.annual, ...value.months]) assert.ok(period.interactions.every(item => item.birthPillarKey !== 'hour'));
  assert.match(value.limitations.join(' '), /확정된 6글자/);
});

test('ambiguous ipchun without birth time uses only the day and omits the season', () => {
  const unknown = calculateSaju({ year: 2024, month: 2, day: 4, hour: null }, { now: NOW });
  const value = analyze(unknown);
  assert.deepEqual(value.profile.knownPillars.map(item => item.key), ['day']);
  assert.equal(value.profile.knownCharacterCount, 2);
  assert.equal(value.profile.season, null);
  assert.equal(value.profile.gods.length, 1);
  assert.equal(value.profile.yinCount + value.profile.yangCount, 2);
  assert.equal(value.profile.elements.reduce((sum, item) => sum + item.count, 0), 2);
  for (const period of [value.annual, ...value.months]) assert.ok(period.interactions.every(item => item.birthPillarKey === 'day'));
  assert.match(value.limitations.join(' '), /월주를 확정할 수 없어/);
});

test('no sex or name is required; repeated output is deterministic and input stays untouched', () => {
  const before = JSON.stringify(birth);
  const first = analyze();
  const second = analyze();
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(birth), before);
  assert.equal('gender' in birth, false);
  assert.equal('name' in birth, false);
  first.annual.stemGod.keywords.push('mutation');
  assert.equal(analyze().annual.stemGod.keywords.includes('mutation'), false);
});

test('invalid chart, year, prebirth year, and clock produce clear errors', () => {
  assert.throws(() => analyze(null), FortuneInputError);
  assert.throws(() => analyze(birth, { year: 2051 }), FortuneInputError);
  assert.throws(() => analyze(birth, { year: 2026.5 }), FortuneInputError);
  assert.throws(() => analyze(birth, { year: 2004 }), /태어난 연도 이후/);
  assert.throws(() => analyze(birth, { now: new Date('invalid') }), FortuneInputError);
  assert.throws(() => getTenGod('子', '甲'), FortuneInputError);
});
