import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSaju} from '../games/starlit-saju/engine.mjs';
import {analyzeFortune,interactionPairs} from '../games/starlit-saju/fortune-data.mjs';
import {analyzeDaeun} from '../games/starlit-saju/daeun.mjs';
import {buildDetailedReading} from '../games/starlit-saju/readings.mjs';
import {attachReadingScores,readingScoreCopy} from '../games/starlit-saju/reading-score.mjs';

const now=new Date('2026-11-13T00:00:00Z');
const birth={year:1990,month:5,day:17,hour:8,minute:37};
const groups=['opportunities','people','documents','cautions'];
function fixture(input=birth,{gender='male',year=2026,clock=now}={}) {
  const chart=calculateSaju(input,{now:clock});
  const fortune=analyzeFortune(chart,{year,now:clock});
  const daeun=analyzeDaeun(chart,{gender,now:clock});
  return {chart,fortune,daeun,report:buildDetailedReading(chart,fortune,{daeun})};
}
function units(report) {
  const reader=report.reader;
  return [...[reader.lifelong,reader.annual,...reader.months].flatMap(item=>[item,...item.cards]),
    report.personPortrait,...report.personPortrait.cards,
    reader.symbols,...reader.symbols.items,reader.timings,
    ...reader.timings.items.flatMap(item=>[item,...groups.flatMap(key=>item[key])]),
    report.daeun,...report.daeun.periods.flatMap(period=>[period,...period.topics,...period.situations])];
}
function withoutScores(value) {
  if(Array.isArray(value))return value.map(withoutScores);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='readingScore').map(([key,item])=>[key,withoutScores(item)]));
}
function observedPairs(score,fortune,daeun) {
  const pillars=fortune.profile.knownPillars.filter(pillar=>score.coverage.pillarKeys.includes(pillar.key));
  if(score.coverage.kind==='natal')return pillars.flatMap((left,index)=>pillars.slice(index+1).map(right=>[left,right]));
  let periods;
  if(score.coverage.kind==='annual')periods=[fortune.annual];
  else if(score.coverage.kind==='monthly-summary')periods=fortune.months;
  else if(score.coverage.kind==='monthly') {
    const month=Number(score.factIds.find(id=>/^month\.\d+\.pillar$/.test(id)).split('.')[1]);
    periods=[fortune.months.find(value=>value.month===month)];
  } else {
    const index=Number(score.factIds.find(id=>/^daeun\.reading\.period\.\d+\.comparison\./.test(id)).split('.')[3]);
    periods=[daeun.periods.find(value=>value.index===index)];
  }
  return periods.flatMap(period=>pillars.map(pillar=>[pillar,period]));
}

test('every visible lifelong, yearly, monthly, decade and timing unit has an independent score or an explicit unavailable state',()=>{
  const {report}=fixture();
  const all=units(report),registry=new Set([...report.facts,...report.daeun.facts].map(fact=>fact.id));
  assert.ok(all.length>300);
  for(const item of all) {
    const score=item.readingScore;
    assert.equal(score.version,1,item.id||item.title||item.label);
    assert.equal(score.max,100);
    assert.equal(score.status,score.available?'available':'unavailable');
    assert.equal(score.tailwind.label,'순풍');assert.equal(score.headwind.label,'역풍');
    for(const axis of [score.tailwind,score.headwind]) {
      if(score.available)assert.ok(Number.isInteger(axis.value)&&axis.value>=0&&axis.value<=100);
      else {assert.equal(axis.value,null);assert.ok(score.reason.trim());}
      assert.ok(axis.factIds.every(id=>registry.has(id)));
    }
    assert.ok(score.factIds.every(id=>registry.has(id)));
    assert.equal(new Set(score.factIds).size,score.factIds.length);
  }
  assert.equal(report.reader.months.length,12);
  assert.equal(report.daeun.periods.length,9);
  assert.ok(report.daeun.periods.every(period=>[period,...period.topics,...period.situations].every(item=>item.readingScore.available)));
});

test('all nonempty scores equal the actual confirmed-pair ratios, without ranking personalities or adding a base value',()=>{
  for(const input of [birth,{year:1988,month:11,day:2,hour:15,minute:20}]) {
    const {fortune,daeun,report}=fixture(input);
    for(const item of units(report)) {
      const score=item.readingScore;
      if(!score.available)continue;
      const pairs=observedPairs(score,fortune,daeun);
      const matches=pairs.flatMap(([left,right])=>interactionPairs(left,right,{}));
      const stem=matches.filter(match=>match.kind==='stem-combination').length;
      const branch=matches.filter(match=>match.kind==='branch-combination').length;
      const clash=matches.filter(match=>match.kind==='branch-clash').length;
      assert.equal(score.coverage.comparisonCount,pairs.length);
      assert.equal(score.tailwind.value,Math.round(100*(stem+branch)/(2*pairs.length)));
      assert.equal(score.headwind.value,Math.round(100*clash/pairs.length));
      assert.deepEqual([score.calculation.stemCombinations,score.calculation.branchCombinations,score.calculation.branchClashes],[stem,branch,clash]);
    }
  }
});

test('a real reference chart distinguishes zero signals, simultaneous signals and a denominator that is not a 100-point split',()=>{
  const {report}=fixture();
  const values=item=>[item.readingScore.tailwind.value,item.readingScore.headwind.value];
  assert.deepEqual(values(report.reader.lifelong),[0,0]);
  assert.deepEqual(values(report.reader.annual),[13,0]);
  assert.deepEqual(values(report.reader.months[10]),[13,25]);
  assert.deepEqual(values(report.reader.months[11]),[0,50]);
  assert.match(report.reader.lifelong.readingScore.scopeNotice,/0점은 이 항목에서 해당 표시가 없다는 뜻/);
  assert.equal(report.reader.months[10].readingScore.calculation.tailwindDenominator,8);
  assert.equal(report.reader.months[10].readingScore.calculation.headwindDenominator,4);
});

test('missing hours and unresolved solar-term boundaries are excluded from both numerator and denominator',()=>{
  for(const input of [{...birth,hour:null},{year:2024,month:2,day:4,hour:null},{year:2024,month:2,day:4,hour:17,minute:27}]) {
    const {fortune,daeun,report}=fixture(input);
    const known=fortune.profile.knownPillars.map(pillar=>pillar.key);
    for(const item of units(report)) {
      const score=item.readingScore;
      assert.ok(score.coverage.pillarKeys.every(key=>known.includes(key)));
      assert.equal(score.coverage.partial,true);
      if(!score.available)continue;
      const pairs=observedPairs(score,fortune,daeun);
      assert.equal(score.calculation.comparisonCount,pairs.length);
      assert.equal(score.calculation.tailwindDenominator,2*pairs.length);
      assert.equal(score.calculation.headwindDenominator,pairs.length);
    }
    assert.equal(report.reader.annual.readingScore.coverage.comparisonCount,known.length);
    if(known.length===1) {
      assert.equal(report.reader.lifelong.readingScore.available,false);
      assert.equal(report.reader.lifelong.readingScore.tailwind.value,null);
      assert.equal(report.reader.annual.readingScore.available,true,'one confirmed natal pillar can still be compared with an actual period');
    }
    assert.equal(report.daeun.readingScore.available,false);
  }
});

test('health, accident and symbol pages never gain invented probabilities, and decade overviews do not borrow another time',()=>{
  const {report}=fixture();
  for(const id of ['natal-health','natal-safety']) {
    const item=report.reader.lifelong.cards.find(card=>card.id===id);
    assert.equal(item.readingScore.available,false);assert.equal(item.readingScore.tailwind.value,null);
  }
  for(const item of [report.reader.symbols,...report.reader.symbols.items])assert.equal(item.readingScore.available,false);
  const before=fixture({year:2022,month:3,day:9,hour:21,minute:51}).report.daeun;
  assert.equal(before.currentState,'before-start');assert.equal(before.readingScore.available,false);
  assert.ok(before.periods.every(period=>period.readingScore.available));
  const after=fixture({year:1900,month:1,day:1,hour:8,minute:0}).report.daeun;
  assert.equal(after.currentState,'after-listed-periods');assert.equal(after.readingScore.available,false);
  const missing=fixture(birth,{gender:null}).report.daeun;
  assert.equal(missing.available,false);assert.equal(missing.readingScore.headwind.value,null);
  const active=report.daeun.periods.find(period=>period.isCurrent);
  assert.deepEqual(report.daeun.readingScore,active.readingScore);
});

test('attaching scores is deterministic, preserves original data and fails atomically when a source is missing',()=>{
  const {chart,fortune,report}=fixture();
  const original=withoutScores(report),before=structuredClone(original);
  const inputs=[structuredClone(chart),structuredClone(fortune)];
  attachReadingScores(original,chart,fortune);
  assert.deepEqual(withoutScores(original),before);
  assert.deepEqual([chart,fortune],inputs);
  const once=structuredClone(original);
  attachReadingScores(original,{...chart,name:'다른 표시 이름',input:{...chart.input,name:'이름'}},fortune);
  assert.deepEqual(original,once);
  const broken=withoutScores(report);
  broken.facts=broken.facts.filter(fact=>fact.id!=='month.12.pillar');
  const failedBefore=structuredClone(broken);
  assert.throws(()=>attachReadingScores(broken,chart,fortune));
  assert.deepEqual(broken,failedBefore);
});

test('copies preserve visible stories, advice, scope and scores while omitting internal facts, sources and formulas',()=>{
  const {report}=fixture();
  const copy=report.copyByCategory.all;
  for(const item of units(report)) {
    for(const paragraph of item.paragraphs||[])assert.ok(copy.includes(paragraph),item.id||item.title);
    for(const line of item.summaryLines||[])assert.ok(copy.includes(line),line);
    for(const line of readingScoreCopy(item))assert.ok(copy.includes(line),line);
  }
  for(const advice of [...report.adviceByCategory.lifelong,...report.adviceByCategory.annual,...report.months.flatMap(month=>month.advice)]) {
    assert.ok(copy.includes(advice.action));assert.ok(copy.includes(advice.caution));
    assert.ok(!copy.includes(advice.why),'the calculation reason stays internal');
  }
  assert.doesNotMatch(copy,/원래의 계산과 해석 전체|이 성격 풀이의 근거|대운 계산 근거|자료를 확인한 곳|\[계산에서 확인한 내용\]|\[적용한 해석 규칙\]|confirmed-pair-ratios|tailwindNumerator|round\(100/);
  assert.ok(!copy.includes(report.personPortrait.methodNotice));
  assert.ok(!copy.includes(report.personPortrait.selectionNotice));
  assert.ok(!copy.includes(report.daeun.methodNotice));
  for(const source of report.daeun.sources)assert.ok(!copy.includes(source.url));
  for(const period of report.daeun.periods)assert.ok(copy.includes(period.periodLabel));
  const partial=fixture({...birth,hour:null}).report;
  assert.ok(partial.copyByCategory.lifelong.includes(partial.reader.scopeNotice));
  assert.ok(partial.facts.some(fact=>fact.id==='natal.scope'),'the hidden evidence remains intact internally');
});
