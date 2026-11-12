import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaju } from '../games/starlit-saju/engine.mjs';
import { analyzeFortune } from '../games/starlit-saju/fortune-data.mjs';
import { buildDetailedReading } from '../games/starlit-saju/readings.mjs';
import * as referenceText from '../games/starlit-saju/readings-data.mjs';

const now = new Date('2026-11-13T00:00:00Z');
const sample = { year: 2005, month: 12, day: 23, hour: 8, minute: 37 };
function reading(input = sample, year = 2026) {
  const chart = calculateSaju(input, { now });
  const fortune = analyzeFortune(chart, { year, now });
  return { chart, fortune, report: buildDetailedReading(chart, fortune) };
}
const chaptersOf = report => [
  ...report.sections.flatMap(section => section.chapters),
  ...report.months.flatMap(month => month.chapters),
];
const lifelong = report => report.sections.find(section => section.id === 'lifelong');

// Completeness against the source engine is independently checked in
// saju-evidence.test.mjs. These tests cover explanatory provenance and scope;
// neither text length nor distinct prose is treated as proof of personal truth.
test('every interpretation and service reference links to facts actually printed in its chapter', () => {
  const { report } = reading();
  const facts = new Map(report.facts.map(value => [value.id, value]));
  assert.equal(facts.size, report.facts.length);
  for (const chapter of chaptersOf(report)) {
    assert.equal(new Set(chapter.factIds).size, chapter.factIds.length);
    assert.deepEqual(chapter.calculation, chapter.factIds.map(id => facts.get(id).text));
    assert.deepEqual(chapter.interpretation, chapter.rules.map(value => value.text));
    assert.deepEqual(chapter.paragraphs, [...chapter.calculation, ...chapter.interpretation]);
    for (const value of [...chapter.rules, ...chapter.referenceRules]) {
      assert.ok(value.factIds.length > 0, value.id);
      for (const id of value.factIds) {
        assert.ok(chapter.factIds.includes(id), `${value.id}: ${id}`);
        assert.ok(chapter.calculation.includes(facts.get(id).text), `${value.id}: fact not printed`);
      }
    }
    for (const value of chapter.referenceRules) {
      assert.equal(value.origin, 'service-reference');
      assert.ok(chapter.reference.includes(value.text));
      assert.ok(!chapter.interpretation.includes(value.text));
    }
  }
});

test('common definitions, suggestions and authored combinations stay in labelled reference areas', () => {
  const { fortune, report } = reading();
  assert.equal(referenceText.MONTH_STORIES, undefined);
  const chapters = chaptersOf(report);
  const body = chapters.flatMap(chapter => chapter.paragraphs);
  const definitions = [
    ...Object.values(referenceText.STEM_REFERENCE).map(value => value.description),
    ...Object.values(referenceText.GROUP_REFERENCE).map(value => value.definition),
    ...Object.values(referenceText.GOD_REFERENCE).map(value => value.definition),
    ...Object.values(referenceText.RELATION_REFERENCE).map(value => value.definition),
    ...Object.values(referenceText.PRACTICE_SUGGESTIONS),
  ];
  for (const value of definitions) assert.ok(!body.includes(value), value);
  const combined = lifelong(report).chapters.find(chapter => chapter.id === 'learning-inner');
  const active = referenceText.GROUP_PAIR_RULES.filter(value =>
    fortune.profile.gods.some(entry => entry.god.group === value.left)
    && fortune.profile.gods.some(entry => entry.god.group === value.right));
  assert.deepEqual(combined.referenceRules.map(value => value.id), active.map(value => `natal.pair.${value.id}`));
  assert.ok(combined.rules.every(value => !value.id.startsWith('natal.pair.')));
  for (const value of active) {
    const applied = combined.referenceRules.find(item => item.id === `natal.pair.${value.id}`);
    assert.match(applied.text, /서비스 작성 참고 설명/);
    assert.ok(applied.text.includes(value.reading));
    assert.ok(!combined.interpretation.some(text => text.includes(value.reading)));
  }
  assert.match(report.method.reuseNotice, /같은 계산 조건에는 같은 문장 규칙/);
  assert.match(report.method.reuseNotice, /이 서비스가 작성한 공통 참고 해설/);
});

test('same day master in another season changes actual evidence and the applicable relation rule', () => {
  const winter = reading({year:1990,month:1,day:1,hour:9,minute:0});
  const spring = reading({year:1990,month:3,day:2,hour:9,minute:0});
  assert.equal(winter.chart.dayMaster.hanja, spring.chart.dayMaster.hanja);
  assert.equal(winter.fortune.profile.season.key, 'winter');
  assert.equal(spring.fortune.profile.season.key, 'spring');
  const first = lifelong(winter.report).chapters.find(chapter => chapter.id === 'day-season');
  const second = lifelong(spring.report).chapters.find(chapter => chapter.id === 'day-season');
  assert.match(first.calculation.join(' '), /겨울/);
  assert.match(second.calculation.join(' '), /봄/);
  assert.notEqual(first.rules[0].id, second.rules[0].id);
  assert.notDeepEqual(first.rules[0].factIds, second.rules[0].factIds);
  assert.equal(first.reference[0], second.reference[0], 'shared day-stem definition stays visibly common');
});

test('unknown pillars retain every candidate and never gain fabricated characters, gods or reference classifications', () => {
  const { chart, fortune, report } = reading({year:2024,month:2,day:4,hour:null});
  assert.equal(fortune.profile.knownCharacterCount, 2);
  const facts = new Map(report.facts.map(value => [value.id, value]));
  for (const pillar of chart.pillars.filter(value => value.uncertain)) {
    const fact = facts.get(`natal.pillar.${pillar.key}`);
    assert.match(fact.text, /미확정/);
    for (const alternative of pillar.alternatives || []) assert.ok(fact.text.includes(alternative.hanja));
    assert.ok(!report.facts.some(value => value.id.startsWith(`natal.character.${pillar.key}.`)));
    assert.ok(!report.facts.some(value => value.id.startsWith(`natal.god.${pillar.key}.`)));
    assert.ok(!report.facts.some(value => value.id.startsWith(`natal.reference.${pillar.key}.`)));
  }
  const season = lifelong(report).chapters.find(chapter => chapter.id === 'day-season');
  assert.equal(season.rules[0].id, 'natal.season-unavailable');
  assert.doesNotMatch(season.interpretation.join(' '), /봄|여름|가을|겨울/);
  assert.match(report.intro, /확정된 2글자/);
});

test('category copies and advertised scope include only their selected periods and no birth date', () => {
  const first = reading(sample,2026), next = reading(sample,2027);
  assert.deepEqual(lifelong(first.report), lifelong(next.report));
  assert.equal(first.report.copyByCategory.lifelong, next.report.copyByCategory.lifelong);
  assert.doesNotMatch(first.report.methodByCategory.lifelong.calculated.join(' '), /세운|절기월/);
  assert.match(next.report.methodByCategory.annual.calculated.join(' '), /2027년 세운/);
  assert.doesNotMatch(next.report.methodByCategory.annual.calculated.join(' '), /절기월/);
  assert.match(next.report.methodByCategory.monthly.calculated.join(' '), /2027년 12개 절기월/);
  assert.doesNotMatch(next.report.methodByCategory.monthly.calculated.join(' '), /세운/);
  assert.doesNotMatch(next.report.copyByCategory.lifelong, /2027년/);
  assert.doesNotMatch(next.report.copyByCategory.annual, /2027년 [1-9][0-2]?월 월운/);
  assert.ok(next.report.copyByCategory.monthly.includes(next.fortune.months[0].start.label));
  for (const text of Object.values(first.report.copyByCategory)) {
    assert.ok(!text.includes(first.chart.solar.iso));
    assert.doesNotMatch(text, /2005년 12월 23일|08:37|8시 37분/);
    assert.match(text, /\[공통 참고 설명\]/);
    assert.doesNotMatch(text, /\[적용한 전통 해석 규칙\]/);
  }
});

test('all ten day masters and different years produce valid values and Korean particles', () => {
  const stems = new Set();
  // Strip parenthesized Hanja before checking adjacent Korean particles.
  const badParticles = /(?:화|토|수|무|기|계|자|묘|사|오|미|유|해)은(?=\s)|(?:화|토|수)은(?=\s)|(?:화|토|수)을(?=\s)|(?:화|토|수)과(?=\s)|(?:정재|편재|겁재)으로|(?:병화|정화|무토|기토|임수|계수)이에요|바다이라는|개이에요/;
  for (let day = 1; day <= 10; day++) {
    for (const year of [2024,2027]) {
      const { chart, report } = reading({year:1990,month:5,day,hour:9,minute:30},year);
      stems.add(chart.dayMaster.hanja);
      assert.doesNotMatch(report.copyText, /undefined|NaN|\[object Object\]/);
      assert.doesNotMatch(report.copyText.replace(/\([^()]*\)/g,''), badParticles, `${chart.dayMaster.hanja}, ${year}`);
      assert.equal(report.year,year);
      for (const month of report.months) assert.equal(month.year,year);
    }
  }
  assert.equal(stems.size,10);
});
