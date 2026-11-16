import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaju } from '../games/starlit-saju/engine.mjs';
import { analyzeFortune } from '../games/starlit-saju/fortune-data.mjs';
import { analyzeDaeun } from '../games/starlit-saju/daeun.mjs';
import { buildDetailedReading } from '../games/starlit-saju/readings.mjs';
import { attachPeriodContexts } from '../games/starlit-saju/reading-period-context.mjs';
import { readingDetailSections } from '../games/starlit-saju/reading-detail.mjs';

const now=new Date('2026-11-14T00:00:00Z');
const birth={year:1990,month:5,day:17,hour:8,minute:37};
const codes=value=>[...new Set([value.stemGod.code,value.branchGod.code])];
function build({year=2026,input=birth,gender='female',withDaeun=true}={}) {
  const chart=calculateSaju(input,{now});
  const fortune=analyzeFortune(chart,{year,now});
  const daeun=withDaeun?analyzeDaeun(chart,{gender,now}):null;
  return {chart,fortune,daeun,report:buildDetailedReading(chart,fortune,{daeun})};
}

test('January connects to its previous solar-term year and later months use their own year',()=>{
  const {chart,fortune,report}=build();
  const previous=analyzeFortune(chart,{year:2025,now});
  assert.equal(report.reader.months[0].periodContext.yearHanja,previous.annual.hanja);
  assert.deepEqual(report.reader.months[0].periodContext.yearGodCodes,codes(previous.annual));
  assert.equal(report.reader.months[0].periodContext.solarTermYear,2025);
  for(const month of report.reader.months.slice(1)) {
    assert.equal(month.periodContext.yearHanja,fortune.annual.hanja);
    assert.deepEqual(month.periodContext.yearGodCodes,codes(fortune.annual));
  }
});

test('a decade change inside the selected year and month is split at the actual exclusive boundary',()=>{
  const {report,fortune,daeun}=build({year:2024});
  const annual=report.reader.annual.periodContext;
  assert.equal(annual.segments.length,2);
  assert.equal(annual.segments[0].endsAt,annual.segments[1].startsAt);
  assert.equal(Date.parse(annual.segments[0].startsAt),Date.parse(fortune.annual.start.iso));
  assert.equal(Date.parse(annual.segments[1].endsAt),Date.parse(fortune.annual.end.iso));
  const february=report.reader.months[1].periodContext;
  assert.equal(february.segments.length,2);
  for(const overview of [report.reader.annual,...report.reader.months]) for(const segment of overview.periodContext.segments) {
    const actual=daeun.periods.find(period=>period.index===segment.index);
    assert.ok(Date.parse(segment.startsAt)>=Date.parse(actual.startsAt));
    assert.ok(Date.parse(segment.endsAt)<=Date.parse(actual.endsAt));
    assert.deepEqual(segment.godCodes,codes(actual));
  }
  assert.notEqual(annual.segments[0].index,daeun.currentIndex,'the browser clock cannot replace the selected historical period');
});

test('all combined explanations are copied without duplicate paragraphs and attachment is deterministic',()=>{
  for(const year of [2024,2026]) {
    const {report,fortune}=build({year});
    for(const overview of [report.reader.annual,...report.reader.months]) {
      readingDetailSections(overview);
      const paragraphs=overview.periodContext.sections.flatMap(section=>section.paragraphs);
      assert.equal(new Set(paragraphs).size,paragraphs.length);
      for(const paragraph of paragraphs)assert.ok(report.copyText.includes(paragraph));
    }
    const before=structuredClone(report);
    attachPeriodContexts(report,fortune);
    assert.deepEqual(report,before);
  }
});

test('unknown birth time keeps the natal chart unknown and carries the six oclock assumption into combined periods',()=>{
  const input={year:1990,month:5,day:17,timeUnknown:true};
  const {chart,fortune,daeun,report}=build({input});
  assert.equal(daeun.timeAssumed,true);
  assert.equal(chart.pillars.find(pillar=>pillar.key==='hour').hanja,null);
  const original=structuredClone({chart,fortune,daeun});
  for(const overview of [report.reader.annual,...report.reader.months]) {
    assert.ok(overview.periodContext.sections.flatMap(section=>section.paragraphs).includes(daeun.birthTimeNotice));
  }
  attachPeriodContexts(report,fortune);
  assert.deepEqual({chart,fortune,daeun},original);
});

test('missing gender or decade input still connects year and month without inventing a decade',()=>{
  for(const options of [{gender:null},{withDaeun:false}]) {
    const {report}=build(options);
    assert.equal(report.reader.annual.periodContext,undefined);
    for(const month of report.reader.months) {
      assert.deepEqual(month.periodContext.segments,[]);
      assert.equal(month.periodContext.sections.length,1);
      assert.ok(month.periodContext.yearGodCodes.length>0);
    }
  }
});

test('dates before the first decade and beyond the computed decades never acquire a guessed decade',()=>{
  for(const options of [
    {input:{year:2025,month:8,day:12,hour:8,minute:37}},
    {input:{year:1900,month:5,day:17,hour:8,minute:37}},
  ]) {
    const {report,daeun}=build(options);
    assert.ok(['before-start','after-listed-periods'].includes(daeun.currentState));
    for(const month of report.reader.months) for(const segment of month.periodContext.segments) {
      assert.ok(daeun.periods.some(period=>period.index===segment.index));
    }
    assert.equal(report.reader.annual.periodContext,undefined);
  }
});
