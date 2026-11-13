import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {calculateSaju} from '../games/starlit-saju/engine.mjs';
import {analyzeFortune,interactionPairs} from '../games/starlit-saju/fortune-data.mjs';
import {analyzeDaeun} from '../games/starlit-saju/daeun.mjs';
import {buildDetailedReading} from '../games/starlit-saju/readings.mjs';
import {attachReadingScores,readingScoreCopy} from '../games/starlit-saju/reading-score.mjs';
import {READING_SCORE_RULES,READING_SCORE_PAIR_RULES,READING_SCORE_STEM_RULES} from '../games/starlit-saju/reading-score-rules.mjs';

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

const rules=[...READING_SCORE_RULES,...READING_SCORE_PAIR_RULES,...READING_SCORE_STEM_RULES];
const ruleMap=new Map(rules.map(rule=>[rule.id,rule]));
const sourceKey=source=>[source.file,source.collection,source.code,source.field,source.anchor].join('|');
const authoredTables=new Map();
function authoredValue(source) {
  const [name,...nested]=source.collection.split('.'),key=source.file+':'+name;
  if(!authoredTables.has(key)) {
    const file=new URL('../games/starlit-saju/'+source.file,import.meta.url);
    const code=fs.readFileSync(file,'utf8'),declaration=code.indexOf('const '+name);
    assert.ok(declaration>=0,key);
    const literal=code.slice(code.indexOf('{',declaration)),end=/^\}(?:\);|;)/m.exec(literal);
    assert.ok(end,key);
    authoredTables.set(key,vm.runInNewContext('('+literal.slice(0,end.index+1)+')'));
  }
  const entry=nested.reduce((value,part)=>value[part],authoredTables.get(key))[source.code];
  return source.field==='$'?entry:source.field.split('.').reduce((value,part)=>value[part],entry);
}
function ownText(item,report) {
  // The current-decade heading explicitly summarizes its current listed period.
  if(item===report.daeun)item=item.periods.find(period=>period.isCurrent)||item;
  return [...(item.paragraphs||[]),item.text,item.description,item.headline,item.title].filter(value=>typeof value==='string').join('\n');
}
function actualGods(fortune,daeun) {
  const values=new Map();
  for(const entry of fortune.profile.gods)for(const prefix of ['natal','daeun.reading.natal'])values.set(prefix+'.god.'+entry.pillarKey+'.'+entry.position,entry.god);
  for(const [prefix,value]of [['annual',fortune.annual],...fortune.months.map(value=>['month.'+value.month,value]),...daeun.periods.map(value=>['daeun.reading.period.'+value.index,value])]) {
    for(const position of ['stem','branch'])values.set(prefix+'.god.'+position,value[position+'God']);
  }
  return values;
}

test('every fixed cue row has an exact existing authored source, a real relationship code and an explicit 0/1/2 weight',()=>{
  assert.equal(ruleMap.size,rules.length,'rule IDs stay unique');
  const codes=new Set(['companion','competitor','creator','critic','opportunist','manager','challenger','officer','explorer','scholar']);
  for(const rule of rules) {
    for(const axis of ['help','care'])assert.ok([0,1,2].includes(rule[axis]),rule.id);
    if(rule.code)assert.ok(codes.has(rule.code),rule.id);
    const sources=rule.source?[rule.source]:Object.values(rule.sources).flat();
    assert.ok(sources.length,rule.id);
    for(const source of sources) {
      const authored=authoredValue(source);
      assert.equal(typeof authored,'string',sourceKey(source));
      assert.ok(source.anchor.trim()&&authored.includes(source.anchor),sourceKey(source));
    }
  }
  for(const domain of ['relationships','work','money','learning','decisions','pressure','adjustment','opportunities','cautions','response','documents','people']) {
    assert.deepEqual(new Set(READING_SCORE_RULES.filter(rule=>rule.domain===domain).map(rule=>rule.code)),codes,domain);
  }
  assert.equal(READING_SCORE_STEM_RULES.length,10);
});

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

test('each score is exactly the independent ratio of actual matched cues, with no base or missing-cue contribution',()=>{
  for(const input of [birth,{year:1988,month:11,day:2,hour:15,minute:20}]) {
    const {fortune,daeun,report}=fixture(input);
    const gods=actualGods(fortune,daeun);
    for(const item of units(report)) {
      const score=item.readingScore;
      if(!score.available)continue;
      const calculation=score.calculation,text=ownText(item,report);
      assert.equal(calculation.rule,'confirmed-reading-cues-v2');
      assert.equal(calculation.cueCount,calculation.cues.length);
      assert.ok(calculation.cueCount>0);
      assert.equal(new Set(calculation.cues.map(cue=>cue.id)).size,calculation.cueCount);
      for(const cue of calculation.cues) {
        assert.ok([0,1,2].includes(cue.help)&&[0,1,2].includes(cue.care));
        assert.ok(cue.help||cue.care,'an absent signal never occupies denominator space');
        if(cue.kind==='interaction') {
          assert.deepEqual([cue.help,cue.care],cue.interactionKind==='branch-clash'?[0,2]:[2,0]);
          assert.equal(cue.factIds.length,1);
          continue;
        }
        const selected=cue.ruleIds.map(id=>{assert.ok(ruleMap.has(id),id);return ruleMap.get(id);});
        for(const axis of ['help','care']) {
          const expectedSources=[],weights=[];
          for(const rule of selected) {
            const candidates=rule.source?[rule.source]:rule.sources[cue.kind==='ten-god'&&cue.scope!=='natal'?'period'+(axis==='help'?'Help':'Care'):axis];
            const present=candidates.filter(source=>text.includes(source.anchor));
            if(present.length&&rule[axis]){weights.push(rule[axis]);expectedSources.push(...present);}
          }
          assert.equal(cue[axis],weights.length?Math.max(...weights):0,cue.id+':'+axis);
          assert.deepEqual(new Set(cue.sources[axis].map(sourceKey)),new Set(expectedSources.map(sourceKey)),cue.id+':'+axis);
          assert.equal(new Set(cue.sources[axis].map(sourceKey)).size,cue.sources[axis].length,'same source is counted once');
        }
        if(cue.kind==='ten-god') {
          assert.equal(cue.factIds.length,1);
          assert.equal(gods.get(cue.factIds[0])?.code,cue.code,cue.id);
          assert.ok(selected.every(rule=>rule.code===cue.code));
        } else if(cue.kind==='god-pair') {
          const observations=cue.factIds.map(id=>gods.get(id));
          assert.ok(observations.every(Boolean));
          assert.ok(new Set(observations.map(value=>value.code)).size>=2,'repeated positions of one code do not create a pair');
          assert.deepEqual(new Set(observations.map(value=>value.group)),new Set(selected[0].groups));
          assert.equal(cue.scope==='natal',selected[0].source.file==='person-portrait.mjs'||score.coverage.kind==='natal','the pair follows the reading source, not the other period');
        } else {
          assert.equal(cue.kind,'day-master');
          assert.equal(cue.code,fortune.profile.dayMaster.hanja);
        }
      }
      const help=calculation.cues.reduce((sum,cue)=>sum+cue.help,0),care=calculation.cues.reduce((sum,cue)=>sum+cue.care,0),denominator=2*calculation.cueCount;
      assert.equal(calculation.tailwindNumerator,help);assert.equal(calculation.headwindNumerator,care);
      assert.equal(calculation.tailwindDenominator,denominator);assert.equal(calculation.headwindDenominator,denominator);
      assert.equal(score.tailwind.value,Math.round(100*help/denominator));
      assert.equal(score.headwind.value,Math.round(100*care/denominator));
      const pairs=observedPairs(score,fortune,daeun);
      const matches=pairs.flatMap(([left,right])=>interactionPairs(left,right,{}));
      const stem=matches.filter(match=>match.kind==='stem-combination').length;
      const branch=matches.filter(match=>match.kind==='branch-combination').length;
      const clash=matches.filter(match=>match.kind==='branch-clash').length;
      assert.equal(score.coverage.comparisonCount,pairs.length);
      assert.deepEqual([calculation.stemCombinations,calculation.branchCombinations,calculation.branchClashes],[stem,branch,clash]);
      assert.equal(calculation.cues.filter(cue=>cue.kind==='interaction').length,matches.length,'only an actual combination or clash creates an interaction cue');
    }
  }
});

test('the real no-combination chart uses its existing strengths and cautions without importing a different card weakness',()=>{
  const {fortune,report}=fixture();
  const values=item=>[item.readingScore.tailwind.value,item.readingScore.headwind.value];
  assert.deepEqual(fortune.profile.interactions,[]);
  const work=report.reader.lifelong.cards.find(item=>item.id==='natal-work');
  assert.deepEqual(values(work),[83,0],'two concrete work strengths plus the actual positive work-pair sentence; no unrelated stress');
  assert.deepEqual(work.readingScore.calculation.cues.map(cue=>[cue.help,cue.care]),[[2,0],[2,0],[1,0]]);
  const relationships=report.reader.lifelong.cards.find(item=>item.id==='natal-relationships');
  const challenger=relationships.readingScore.calculation.cues.find(cue=>cue.code==='challenger');
  assert.deepEqual([challenger.help,challenger.care],[0,2],'taking on too many expectations is a caution, not a strength');
  const pressure=report.personPortrait.cards.find(item=>item.id==='portrait-pressure');
  assert.deepEqual(values(pressure),[0,75],'only the two directly described burden cues are present here');
  assert.ok(report.personPortrait.readingScore.calculation.cues.some(cue=>cue.care&&cue.sources.care.some(source=>source.collection==='PAIRS'&&source.code==='wealth-resource')));
  assert.ok(report.personPortrait.readingScore.calculation.cues.some(cue=>cue.kind==='day-master'&&cue.care&&cue.sources.care.some(source=>source.field==='reason')));
  assert.ok(report.reader.lifelong.readingScore.tailwind.value>0);
  assert.equal(report.reader.lifelong.readingScore.headwind.value,0,'this overview has strength wording but no caution wording');
  assert.match(report.reader.lifelong.readingScore.scopeNotice,/순풍은 살릴 점, 역풍은 살필 점/);
  for(const overview of [report.reader.annual,...report.reader.months])for(const card of overview.cards.filter(item=>['money','work','relationships','learning'].some(domain=>item.id.endsWith('-'+domain)))) {
    const cues=card.readingScore.calculation.cues.filter(cue=>cue.kind==='ten-god');
    assert.ok(cues.some(cue=>cue.scope==='natal'),card.id+' natal');
    assert.ok(cues.some(cue=>cue.scope!=='natal'),card.id+' period');
  }
  for(const period of report.daeun.periods)for(const card of period.topics) {
    const cues=card.readingScore.calculation.cues.filter(cue=>cue.kind==='ten-god');
    assert.ok(cues.some(cue=>cue.scope==='natal'),card.id+' natal');
    assert.ok(cues.some(cue=>cue.scope==='daeun.reading.period.'+period.index),card.id+' period');
  }
});

test('missing hours and unresolved solar-term boundaries are excluded from both numerator and denominator',()=>{
  for(const input of [{...birth,hour:null},{year:2024,month:2,day:4,hour:null},{year:2024,month:2,day:4,hour:17,minute:27}]) {
    const {fortune,daeun,report}=fixture(input),actual=actualGods(fortune,daeun);
    const known=fortune.profile.knownPillars.map(pillar=>pillar.key);
    for(const item of units(report)) {
      const score=item.readingScore;
      assert.ok(score.coverage.pillarKeys.every(key=>known.includes(key)));
      assert.equal(score.coverage.partial,true);
      if(!score.available)continue;
      const pairs=observedPairs(score,fortune,daeun);
      assert.equal(score.calculation.comparisonCount,pairs.length);
      assert.equal(score.calculation.tailwindDenominator,2*score.calculation.cues.length);
      assert.equal(score.calculation.headwindDenominator,2*score.calculation.cues.length);
      for(const cue of score.calculation.cues)if(cue.kind==='ten-god')assert.equal(actual.get(cue.factIds[0])?.code,cue.code);
      for(const id of score.factIds) {
        const match=id.match(/natal\.(?:god|pillar)\.(year|month|day|hour)/);
        if(match)assert.ok(known.includes(match[1]),id);
      }
    }
    assert.equal(report.reader.annual.readingScore.coverage.comparisonCount,known.length);
    if(known.length===1) {
      assert.ok(report.reader.lifelong.cards.find(item=>item.id==='natal-character').readingScore.available,'one confirmed day master has its own authored character cues');
      assert.equal(report.reader.annual.readingScore.available,true,'one confirmed natal pillar can still be compared with an actual period');
    }
    assert.equal(report.daeun.readingScore.available,false);
  }
});

test('confirmed relationships without a matching authored cue never turn into a filler number',()=>{
  const {chart,fortune,report}=fixture(),modified=withoutScores(report);
  const work=modified.reader.lifelong.cards.find(item=>item.id==='natal-work');
  work.paragraphs=[];work.title='';work.headline='';
  attachReadingScores(modified,chart,fortune);
  assert.equal(work.readingScore.available,false);
  assert.equal(work.readingScore.tailwind.value,null);assert.equal(work.readingScore.headwind.value,null);
  assert.equal(work.readingScore.calculation,null);
  assert.ok(work.godCodes.length>0,'the real input remains; only absent prose cues are not scored');
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
