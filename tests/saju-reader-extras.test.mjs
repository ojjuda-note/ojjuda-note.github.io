import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaju } from '../games/starlit-saju/engine.mjs';
import { analyzeFortune } from '../games/starlit-saju/fortune-data.mjs';
import { buildDetailedReading } from '../games/starlit-saju/readings.mjs';
import { attachReaderExtras } from '../games/starlit-saju/reader-extras.mjs';
import { getReadingSources } from '../games/starlit-saju/sources.mjs';

const now=new Date('2026-11-13T03:00:00Z');
function build(input={year:1990,month:5,day:17,hour:8,minute:37},year=2026) {
  const chart=calculateSaju(input,{now});
  const fortune=analyzeFortune(chart,{year,now});
  return {chart,fortune,report:buildDetailedReading(chart,fortune)};
}

test('traditional symbols follow the confirmed day element and the documented Hetu mapping, never a missing-element guess',()=>{
  const cases=[
    ['2005-12-24','壬','water','검은색','1 · 6','북쪽'],
    ['2005-12-25','癸','water','검은색','1 · 6','북쪽'],
    ['2005-12-26','甲','wood','푸른색','3 · 8','동쪽'],
    ['2005-12-27','乙','wood','푸른색','3 · 8','동쪽'],
    ['2005-12-28','丙','fire','붉은색','2 · 7','남쪽'],
    ['2005-12-29','丁','fire','붉은색','2 · 7','남쪽'],
    ['2005-12-30','戊','earth','노란색','5 · 10','중앙'],
    ['2005-12-31','己','earth','노란색','5 · 10','중앙'],
    ['2006-01-01','庚','metal','흰색','4 · 9','서쪽'],
    ['2006-01-02','辛','metal','흰색','4 · 9','서쪽'],
  ];
  for(const [date,stem,element,color,numbers,direction] of cases) {
    const [year,month,day]=date.split('-').map(Number);
    const {chart,report}=build({year,month,day,hour:null});
    assert.equal(chart.dayMaster.hanja,stem);
    const symbols=report.reader.symbols;
    assert.equal(symbols.element,element);
    assert.deepEqual(symbols.items.map(item=>item.value),[color,numbers,direction]);
    assert.deepEqual(symbols.factIds,['natal.day-master']);
    assert.equal(symbols.origin,'service-reference');
    assert.match(symbols.paragraphs.join(' '),/행운을 보장.*아니에요/);
    assert.deepEqual(symbols.sources.map(source=>source.id),['traditional-colors-directions','hetu-numbers']);
  }
});

test('monthly opportunities and cautions preserve every calculated period and all natal interactions',()=>{
  const {fortune,report}=build();
  const facts=new Set(report.facts.map(value=>value.id));
  assert.equal(report.reader.timings.scope,'monthly');
  assert.deepEqual(report.reader.timings.items.map(item=>item.month),[1,2,3,4,5,6,7,8,9,10,11,12]);
  for(const period of fortune.months) {
    const item=report.reader.timings.items.find(value=>value.month===period.month);
    assert.deepEqual(item.godCodes,[...new Set([period.stemGod.code,period.branchGod.code])]);
    assert.ok(item.periodLabel.includes(period.start.label));
    assert.ok(item.periodLabel.includes(period.end.label));
    assert.ok(item.factIds.every(id=>facts.has(id)));
    period.interactions.forEach((_,i)=>assert.ok(item.factIds.includes(`month.${period.month}.interaction.${i}`)));
    assert.equal(item.people.length,item.godCodes.length);
    assert.equal(item.documents.length,item.godCodes.length);
    assert.ok(item.opportunities.length>=item.godCodes.length);
    assert.ok(item.cautions.length>=item.godCodes.length);
    assert.equal(item.cautions.some(value=>value.topic==='change'),period.interactions.some(value=>value.kind==='branch-clash'));
    assert.ok(report.months.find(value=>value.month===period.month).chapters.some(chapter=>chapter.id===item.chapterId));
  }
});

test('new personal symbols and period guidance keep the existing product boundaries in copied reading',()=>{
  const {report}=build();
  for(const topic of ['lifelong','annual','monthly','all']) {
    const copy=report.copyByCategory[topic];
    assert.equal(copy.includes(report.reader.symbols.headline),['lifelong','all'].includes(topic));
    assert.equal(copy.includes(report.reader.timings.headline),['monthly','all'].includes(topic));
    if(['monthly','all'].includes(topic)) for(const item of report.reader.timings.items) {
      assert.ok(copy.includes(item.periodLabel));
      for(const key of ['opportunities','people','documents','cautions']) for(const paragraph of item[key]) assert.ok(copy.includes(paragraph.text));
    }
  }
});

test('every warning period explains the actual personal tendency and retains exact dates without predicting an event date',()=>{
  const {fortune,report}=build();
  for(const month of fortune.months) {
    const item=report.reader.timings.items.find(value=>value.month===month.month);
    assert.ok(item.paragraphs.length>0);
    assert.doesNotMatch(item.paragraphs.join(' '),/익숙한 장점을 어디에 쓸지|사고가 발생|질병에 걸|계약이 성공|확률|\d+점/);
    assert.ok(item.natalGodCodes.length>0);
    for(const code of item.natalGodCodes) {
      const entries=fortune.profile.gods.filter(entry=>entry.god.code===code);
      assert.ok(entries.length>0);
      for(const entry of entries)assert.ok(item.factIds.includes(`natal.god.${entry.pillarKey}.${entry.position}`));
    }
    for(const caution of item.cautions.filter(value=>value.topic==='caution')) {
      assert.ok(caution.label.length>15,'the warning title must name an action or situation, not a technical category');
      assert.ok(report.copyByCategory.monthly.includes(caution.label));
    }
    assert.ok(item.periodLabel.includes(month.start.label));
    assert.ok(item.periodLabel.includes(month.end.label));
    for(const paragraph of item.paragraphs)assert.ok(report.copyByCategory.monthly.includes(paragraph));
  }
});

test('the symbolic reading stays identical across selected years while the timing follows its own year',()=>{
  const first=build(undefined,2026),next=build(undefined,2027);
  assert.deepEqual(first.report.reader.symbols,next.report.reader.symbols);
  assert.notDeepEqual(first.report.reader.timings,next.report.reader.timings);
  assert.equal(first.report.copyByCategory.lifelong,next.report.copyByCategory.lifelong);
});

test('uncertain birth pillars do not create fabricated timing evidence or erase confirmed calculations',()=>{
  const {chart,fortune,report}=build({year:2024,month:2,day:4,hour:null});
  const original=structuredClone({facts:report.facts,sections:report.sections,months:report.months});
  attachReaderExtras(report,chart,fortune);
  assert.deepEqual({facts:report.facts,sections:report.sections,months:report.months},original);
  for(const item of report.reader.timings.items) assert.ok(!item.factIds.some(id=>/^natal\.god\.(year|month|hour)\./.test(id)));
  report.facts=report.facts.filter(fact=>fact.id!=='month.7.period');
  assert.throws(()=>attachReaderExtras(report,chart,fortune),/계산 근거/);
});

test('symbolic and real-world safety sources disclose their distinct scope',()=>{
  const lifetime=getReadingSources('lifelong',2026);
  for(const id of ['traditional-colors-directions','hetu-numbers','furniture-safety','drowsy-driving-safety']) {
    const source=lifetime.find(item=>item.id===id);
    assert.ok(source?.usedFor&&source.limitation&&new URL(source.url).protocol==='https:');
    assert.ok(getReadingSources('all',2026).some(item=>item.id===id));
    assert.ok(!getReadingSources('annual',2026).some(item=>item.id===id));
  }
});
