import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaju } from '../games/starlit-saju/engine.mjs';
import { analyzeFortune } from '../games/starlit-saju/fortune-data.mjs';
import { buildDetailedReading } from '../games/starlit-saju/readings.mjs';
import { STAGE_MEANINGS, STAGE_SOURCE_URL } from '../games/starlit-saju/stage-reading.mjs';
import { getReadingSources } from '../games/starlit-saju/sources.mjs';

const now = new Date('2026-11-13T00:00:00Z');
const sample = { year:2005, month:12, day:23, hour:8, minute:37 };
function reading(input=sample, year=2026) {
  const chart=calculateSaju(input,{now});
  const fortune=analyzeFortune(chart,{year,now});
  return {fortune, report:buildDetailedReading(chart,fortune)};
}
const natalStage = report => report.sections.find(section=>section.id==='lifelong').chapters.find(chapter=>chapter.id==='life-stage-meanings');

test('stage meanings explain every confirmed natal position, with sourced metaphors and separate authored questions', () => {
  const {fortune,report}=reading();
  const chapter=natalStage(report);
  assert.ok(chapter, 'lifelong reading must explain the stage labels, not just list them');
  assert.deepEqual(fortune.profile.reference.pillars.map(pillar=>pillar.lifeStage.hanja),['临官','长生','死','墓']);
  assert.equal(chapter.rules.length,4,'do not select only the favourable-sounding stages');
  for (const pillar of fortune.profile.reference.pillars) {
    const factId=`natal.reference.${pillar.pillarKey}.life-stage`;
    const rule=chapter.rules.find(value=>value.factIds.includes(factId));
    assert.ok(rule);
    assert.ok(rule.text.includes(pillar.hanja));
    assert.ok(rule.text.includes(pillar.lifeStage.label));
    assert.ok(rule.text.includes(STAGE_MEANINGS[pillar.lifeStage.hanja].meaning));
    assert.equal(rule.sourceUrl,STAGE_SOURCE_URL);
    assert.ok(chapter.easyParagraphs.includes(rule.text));
    assert.ok(report.copyByCategory.lifelong.includes(rule.text));
  }
  assert.match(chapter.reference.join(' '), /어린 시절부터 노년까지를 순서대로 나눈 표가 아니/);
  assert.match(chapter.reference.join(' '), /오쭈다가 만든 예시/);
  assert.match(chapter.reference.join(' '), /실제 병, 죽음, 수명이나 성공과 실패를 판정하지/);
  assert.match(chapter.easyParagraphs.join(' '), /실제 질병이나 죽음을 뜻하지/);
  for (const question of chapter.practice) {
    assert.ok(!chapter.interpretation.includes(question),'an authored exercise is not a traditional rule');
    assert.ok(report.copyByCategory.lifelong.includes(question));
  }
  const source=getReadingSources('lifelong').find(value=>value.id==='twelve-stage-meanings');
  assert.equal(source.url,STAGE_SOURCE_URL);
  assert.match(source.limitation,/전통 문헌/);
});

test('unknown birth time and a solar-term boundary do not acquire imaginary stage meanings', () => {
  for (const [input,expected] of [
    [{...sample,hour:null},['year','month','day']],
    [{year:2024,month:2,day:4,hour:null},['day']],
  ]) {
    const {fortune,report}=reading(input);
    assert.deepEqual(fortune.profile.reference.pillars.map(pillar=>pillar.pillarKey),expected);
    const chapter=natalStage(report);
    assert.equal(chapter.rules.length,expected.length);
    assert.deepEqual(chapter.factIds.filter(id=>id.endsWith('.life-stage')),
      expected.map(key=>`natal.reference.${key}.life-stage`));
    assert.ok(!chapter.easyParagraphs.some(text=>text.includes('태어난 시간 자리')));
  }
});

test('each period explains its own natal-day-based stage and retains the correct copy scope', () => {
  const {fortune,report}=reading();
  const contexts=[
    {prefix:'annual',topic:'annual',transit:fortune.annual,chapter:report.sections.find(section=>section.id==='annual').chapters.find(chapter=>chapter.id==='annual-stage-meaning')},
    ...report.months.map(month=>({prefix:`month.${month.month}`,topic:'monthly',transit:fortune.months.find(value=>value.month===month.month),chapter:month.chapters.find(chapter=>chapter.id==='month-stage-meaning')})),
  ];
  const stages=new Set();
  for (const {prefix,topic,transit,chapter} of contexts) {
    assert.ok(chapter, `${prefix} needs its own explanation`);
    const pillar=transit.reference.pillars[0];
    const factId=`${prefix}.reference.${pillar.pillarKey}.life-stage`;
    const meaning=STAGE_MEANINGS[pillar.lifeStage.hanja];
    assert.ok(meaning,`unexplained stage ${pillar.lifeStage.hanja}`);
    stages.add(pillar.lifeStage.hanja);
    assert.equal(chapter.rules.length,1);
    assert.deepEqual(chapter.rules[0].factIds,['natal.day-master',factId]);
    assert.ok(chapter.factIds.includes(`${prefix}.period`));
    assert.ok(chapter.factIds.every(id=>id.startsWith('natal.')||id.startsWith(`${prefix}.`)));
    assert.ok(chapter.summary.includes(pillar.lifeStage.label));
    assert.ok(chapter.easyParagraphs.includes(chapter.rules[0].text));
    assert.ok(report.copyByCategory[topic].includes(chapter.rules[0].text));
    assert.ok(report.copyByCategory.all.includes(chapter.rules[0].text));
  }
  assert.equal(stages.size,12,'one full set of monthly branches exercises every stage meaning');
  const next=reading(sample,2027);
  assert.deepEqual(natalStage(report),natalStage(next.report),'changing the selected year must not rewrite the birth reading');
});
