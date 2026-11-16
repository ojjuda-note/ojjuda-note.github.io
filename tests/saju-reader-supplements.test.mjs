import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSaju} from '../games/starlit-saju/engine.mjs';
import {analyzeFortune} from '../games/starlit-saju/fortune-data.mjs';
import {buildDetailedReading} from '../games/starlit-saju/readings.mjs';
import {attachReaderSupplements,copyReaderSupplements} from '../games/starlit-saju/reader-supplements.mjs';
import {readingDetailText} from '../games/starlit-saju/reading-detail.mjs';
import {PLAIN_GOD_EXPLANATIONS} from '../games/starlit-saju/plain-language.mjs';
import {STAGE_MEANINGS} from '../games/starlit-saju/stage-reading.mjs';

const now=new Date('2026-11-13T00:00:00Z');
const sample={year:2005,month:12,day:23,hour:8,minute:37};
function build(input=sample,year=2026) {
  const chart=calculateSaju(input,{now});
  const fortune=analyzeFortune(chart,{year,now});
  return {chart,fortune,report:buildDetailedReading(chart,fortune)};
}
const fixture=build();
function contexts({fortune,report}) {
  const supplements=report.reader.supplements;
  assert.ok(supplements,'the actual reading builder must attach the missing personal explanations');
  return [
    {prefix:'natal',topic:'lifelong',source:fortune.profile,cards:supplements.lifelong},
    {prefix:'annual',topic:'annual',source:fortune.annual,cards:supplements.annual},
    ...fortune.months.map(source=>({prefix:`month.${source.month}`,topic:'monthly',month:source.month,source,
      cards:supplements.months.find(value=>value.month===source.month).cards})),
  ];
}

test('supplementary traits retain every confirmed hidden stem without counting it as another strength result',()=>{
  const facts=new Set(fixture.report.facts.map(fact=>fact.id));
  for(const {prefix,source,cards} of contexts(fixture)) {
    const card=cards.find(value=>value.kind==='hidden');
    assert.ok(card,`${prefix}: the hidden-stem interpretation remains available`);
    const entries=source.reference.pillars.flatMap(pillar=>pillar.hiddenStems.map(hidden=>({
      code:hidden.god.code,id:`${prefix}.reference.${pillar.pillarKey}.hidden.${hidden.order}`,
    })));
    assert.deepEqual(card.godCodes,[...new Set(entries.map(entry=>entry.code))]);
    assert.deepEqual(card.detailSections.flatMap(section=>section.factIds).sort(),entries.map(entry=>entry.id).sort(),
      'both main and additional hidden stems remain linked, including duplicate meanings in different positions');
    assert.equal(card.detailSections.length,card.godCodes.length,'the same meaning is explained once without losing its contributing positions');
    for(const section of card.detailSections) {
      assert.ok(section.factIds.every(id=>entries.some(entry=>entry.id===id&&entry.code===section.code)));
      assert.ok(section.paragraphs.some(text=>text.includes(PLAIN_GOD_EXPLANATIONS[section.code].example)),
        'the already-authored life example survives the removal of calculation panels');
      assert.match(section.paragraphs.join(' '),/가상 장면/,'the life example is never recast as a real experience');
    }
    assert.ok(card.factIds.every(id=>facts.has(id)));
    assert.equal(Object.hasOwn(card,'readingScore'),false,'classification explanations do not acquire invented scores');
  }
});

test('stage supplements preserve every actual metaphor and authored question, including difficult-sounding stages',()=>{
  const observed=new Set();
  for(const {prefix,source,cards} of contexts(fixture)) {
    const card=cards.find(value=>value.kind==='stages');
    const expected=source.reference.pillars.map(pillar=>({code:pillar.lifeStage.hanja,
      id:`${prefix}.reference.${pillar.pillarKey}.life-stage`}));
    assert.deepEqual(card.stageCodes,[...new Set(expected.map(value=>value.code))]);
    assert.deepEqual(card.detailSections.flatMap(section=>section.factIds).sort(),expected.map(value=>value.id).sort());
    for(const section of card.detailSections) {
      const original=STAGE_MEANINGS[section.code];
      observed.add(section.code);
      assert.ok(section.paragraphs.includes(original.meaning),'a stage meaning is kept, not replaced with an unrelated positive sentence');
      assert.ok(section.paragraphs.some(text=>text.includes(original.question)),'the source-authored reflection survives');
      assert.ok(section.factIds.every(id=>expected.some(value=>value.id===id&&value.code===section.code)));
    }
    assert.match(card.scopeNotice,/병·죽음·수명이나 성공과 실패를 판정한 내용은 아니/);
    if(prefix==='natal')assert.match(card.scopeNotice,/어린 시절부터 노년까지의 순서로 읽지는 않/);
    else assert.match(card.scopeNotice,/실제로 일이 시작되거나 끝나는 때를 정한 것은 아니/);
  }
  assert.equal(observed.size,12,'all twelve meanings are covered by the actual selected monthly periods');
});

test('each supplement has two complete units and every visible paragraph, heading and scope is copied in the same order',()=>{
  for(const {topic,month,cards} of contexts(fixture)) {
    const copied=copyReaderSupplements(fixture.report,topic,{month:month??null}).join('\n');
    assert.ok(fixture.report.copyByCategory[topic].includes(copied),'the real category copy contains the complete supplementary block');
    assert.ok(fixture.report.copyByCategory.all.includes(copied),'the all-reading copy also retains the block');
    for(const card of cards) {
      assert.equal(card.summaryLines.length,2);
      assert.notEqual(card.summaryLines[0],card.summaryLines[1]);
      assert.deepEqual(card.detailSections.flatMap(section=>section.paragraphs),card.paragraphs);
      assert.ok(!card.label.includes('지장간')&&!card.label.includes('십이운성'),'the reading menu leads with ordinary life topics');
      const ordered=[card.label,'추가 해설',...card.summaryLines,...readingDetailText(card),card.scopeNotice];
      let offset=0;
      for(const text of ordered) {
        const found=copied.indexOf(text,offset);
        assert.ok(found>=offset,`${card.id}: omitted or reordered visible text`);offset=found+text.length;
      }
      assert.doesNotMatch(ordered.join('\n'),/https?:|natal\.|\.reference\.|자료 순서|출처|계산 근거|산식|[甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥]/u,
        'source records and technical classification tables do not return with the interpretation');
    }
  }
});

test('supplements respect unknown pillars and their own period instead of inventing a birth time or borrowing another year',()=>{
  for(const [input,expected] of [
    [{...sample,hour:null},['year','month','day']],
    [{year:2024,month:2,day:4,hour:null},['day']],
  ]) {
    const value=build(input),natal=contexts(value)[0];
    const available=new Set(expected);
    for(const card of natal.cards) {
      assert.match(card.scopeNotice,/확인하지 못한 출생 정보/);
      for(const id of card.detailSections.flatMap(section=>section.factIds)) {
        assert.ok(available.has(id.split('.')[2]),`${id}: an unknown pillar was filled in`);
      }
    }
    assert.equal(value.chart.pillars.find(pillar=>pillar.key==='hour').hanja,null);
  }
  const next=build(sample,2027);
  assert.deepEqual(next.report.reader.supplements.lifelong,fixture.report.reader.supplements.lifelong,
    'changing the reading year cannot change a birth interpretation');
  assert.notDeepEqual(next.report.reader.supplements.annual,fixture.report.reader.supplements.annual,
    'annual supplements use the actual chosen-year classifications');
  for(const {prefix,cards} of contexts(fixture).filter(value=>value.prefix!=='natal'))for(const card of cards) {
    assert.ok(card.factIds.every(id=>id.startsWith('natal.')||id.startsWith(prefix+'.')),
      `${prefix}: supplementary explanation borrowed another period`);
  }
});

test('supplement attachment neither rewrites the existing reading nor accepts an unregistered classification',()=>{
  const value=build();
  const before=JSON.stringify({facts:value.report.facts,reader:value.report.reader.lifelong,annual:value.report.reader.annual,
    months:value.report.reader.months,portrait:value.report.personPortrait,chart:value.chart});
  attachReaderSupplements(value.report,value.fortune);
  assert.equal(JSON.stringify({facts:value.report.facts,reader:value.report.reader.lifelong,annual:value.report.reader.annual,
    months:value.report.reader.months,portrait:value.report.personPortrait,chart:value.chart}),before);
  const invalid=structuredClone(value.report);
  const missing=invalid.reader.supplements.lifelong[0].detailSections[0].factIds[0];
  invalid.facts=invalid.facts.filter(fact=>fact.id!==missing);
  assert.throws(()=>attachReaderSupplements(invalid,value.fortune),/추가 해설/,
    'missing calculated evidence blocks the explanation instead of inventing it');
});
