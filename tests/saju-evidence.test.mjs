import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaju } from '../games/starlit-saju/engine.mjs';
import { analyzeFortune } from '../games/starlit-saju/fortune-data.mjs';
import { buildDetailedReading } from '../games/starlit-saju/readings.mjs';
import { GROUP_PAIR_RULES, PRACTICE_SUGGESTIONS } from '../games/starlit-saju/readings-data.mjs';

// Independent coverage audit: compare every source record with its published
// fact, body linkage and evidence row. Distinct prose counts are not evidence.
const NOW = new Date('2026-11-13T00:00:00Z');
const examples = [
  {name:'official complete chart',input:{year:2005,month:12,day:23,hour:8,minute:37},year:2026},
  {name:'multiple natal and monthly pairs',input:{year:2015,month:12,day:9,hour:11,minute:37},year:2026},
  {name:'unknown hour',input:{year:2005,month:12,day:23,hour:null},year:2027},
  {name:'ipchun with unknown year/month/hour',input:{year:2024,month:2,day:4,hour:null},year:2026},
  {name:'known birth minute straddles ipchun',input:{year:2024,month:2,day:4,hour:17,minute:27},year:2026},
  {name:'civil-day late Zi hour',input:{year:1991,month:7,day:18,hour:23,minute:30},year:2027},
];

function sample(example) {
  const chart=calculateSaju(example.input,{now:NOW});
  const fortune=analyzeFortune(chart,{year:example.year,now:NOW});
  return {chart,fortune,report:buildDetailedReading(chart,fortune)};
}
function mapFacts(report) {
  const facts=new Map(report.facts.map(value=>[value.id,value]));
  assert.equal(facts.size,report.facts.length,'each observed source record needs its own unambiguous fact ID');
  return facts;
}
function contains(facts,id,...values) {
  const fact=facts.get(id);
  assert.ok(fact,`missing raw fact: ${id}`);
  for (const value of values) {
    assert.ok(typeof value==='string' && value.length>0,`audit expected a populated value for ${id}`);
    assert.ok(fact.text.includes(value),`${id} omitted source value ${value}`);
  }
  return fact;
}
function interactionFacts(facts,prefix,source) {
  const actual=[...facts.values()].filter(value=>value.id.startsWith(`${prefix}.interaction.`));
  assert.equal(actual.length,source.length,`${prefix} must publish every pair, including repeated kinds in different positions`);
  source.forEach((value,index)=>contains(facts,`${prefix}.interaction.${index}`,
    value.birthPillarLabel,value.otherPillarLabel,value.birthCharacter.hanja,value.otherCharacter.hanja,
    value.pairHanja,value.pairHangul,value.label));
  contains(facts,`${prefix}.interaction-count`,'천간합','지지육합','지지충');
}
function transitFacts(facts,prefix,transit) {
  contains(facts,`${prefix}.pillar`,transit.hanja,transit.hangul);
  contains(facts,`${prefix}.period`,transit.start.label,transit.end.label,transit.start.term,transit.end.term);
  for (const position of ['stem','branch']) {
    const value=transit[position],god=transit[position+'God'];
    contains(facts,`${prefix}.character.${position}`,value.hanja,value.hangul,value.elementLabel,value.yinYang);
    contains(facts,`${prefix}.god.${position}`,value.hanja,god.name,god.hanja);
  }
  contains(facts,`${prefix}.god.branch`,transit.branchMainStem.hanja);
  interactionFacts(facts,prefix,transit.interactions);
}
function categoryChapters(report,topic) {
  return topic==='monthly'?report.months.flatMap(value=>value.chapters):report.sections.find(value=>value.id===topic).chapters;
}

for (const example of examples) {
  test(`${example.name}: all computed records survive into full evidence and linked reading`,()=>{
    const {chart,fortune,report}=sample(example);
    const facts=mapFacts(report),profile=fortune.profile;
    const principal=[...facts.values()].filter(value=>/^natal\.god\./.test(value.id));
    assert.equal(principal.length,profile.gods.length,'hidden stems must not replace or inflate the original principal-stem positions');
    assert.equal(facts.has('natal.god.day.stem'),false,'the day master itself is not another companion god');
    for (const entry of profile.gods) {
      contains(facts,`natal.god.${entry.pillarKey}.${entry.position}`,
        entry.pillarLabel,entry.positionLabel,entry.sourceHanja,entry.stem.hanja,entry.god.name,entry.god.hanja);
    }
    interactionFacts(facts,'natal',profile.interactions);
    transitFacts(facts,'annual',fortune.annual);
    assert.deepEqual(report.months.map(value=>value.month),Array.from({length:12},(_,i)=>i+1));
    for (const month of fortune.months) {
      transitFacts(facts,`month.${month.month}`,month);
      contains(facts,`month.${month.month}.term-year`,String(month.solarTermYear),month.yearHanja);
    }

    const source=profile.reference.source;
    contains(facts,'natal.reference.source',source.name,source.version,source.revision,source.url);
    let hiddenCount=0;
    for (const pillar of profile.reference.pillars) {
      const prefix=`natal.reference.${pillar.pillarKey}`;
      for (const hidden of pillar.hiddenStems) {
        hiddenCount++;
        contains(facts,`${prefix}.hidden.${hidden.order}`,pillar.pillarLabel,pillar.hanja,
          hidden.stem.hanja,hidden.stem.hangul,hidden.stem.elementLabel,hidden.stem.yinYang,hidden.god.name,hidden.god.hanja,
          hidden.isMain?'본기':`자료 순서 ${hidden.order}`);
      }
      contains(facts,`${prefix}.life-stage`,pillar.hanja,pillar.lifeStage.label,pillar.lifeStage.hanja);
      contains(facts,`${prefix}.nayin`,pillar.hanja,pillar.nayin.hanja);
      contains(facts,`${prefix}.xun`,pillar.xun.hanja,pillar.xun.hangul);
      contains(facts,`${prefix}.xun-kong`,pillar.xunKong.hanja,pillar.xunKong.hangul);
    }
    assert.equal([...facts.values()].filter(value=>value.kind==='hidden-stem').length,hiddenCount);
    profile.reference.notes.forEach((note,index)=>assert.equal(facts.get(`natal.reference.note.${index}`).text,note));
    const unknown=chart.pillars.filter(value=>value.uncertain);
    for (const pillar of unknown) {
      assert.equal(profile.reference.pillars.some(value=>value.pillarKey===pillar.key),false);
      assert.equal([...facts.keys()].some(id=>id.startsWith(`natal.god.${pillar.key}.`)),false);
      assert.equal([...facts.keys()].some(id=>id.startsWith(`natal.reference.${pillar.key}.`)),false);
      contains(facts,`natal.pillar.${pillar.key}`,'미확정');
      for (const alternative of pillar.alternatives||[]) contains(facts,`natal.pillar.${pillar.key}`,alternative.hanja);
    }

    for (const topic of ['lifelong','annual','monthly']) {
      const rows=report.evidence[topic].groups.flatMap(value=>value.rows);
      const visible=new Set(rows.map(value=>value.factId));
      const expected=[...facts.keys()].filter(id=>id.startsWith('natal.')
        ||(topic==='annual'&&id.startsWith('annual.'))||(topic==='monthly'&&id.startsWith('month.')));
      assert.deepEqual([...visible].sort(),expected.sort(),`${topic} evidence must contain its complete computed source set`);
      for (const row of rows) {
        assert.equal(row.value,facts.get(row.factId).text,'renderable evidence must preserve the registered source value');
        assert.ok(report.copyByCategory[topic].includes(row.value),`${topic} copy text omitted ${row.factId}`);
      }
      const chapters=categoryChapters(report,topic);
      for (const chapter of chapters) {
        assert.deepEqual(chapter.calculation,chapter.factIds.map(id=>facts.get(id)?.text),`${chapter.id} calculation must consist of registered observations`);
        assert.deepEqual(chapter.interpretation,chapter.rules.map(rule=>rule.text));
        for (const rule of [...chapter.rules,...(chapter.referenceRules||[])]) {
          assert.ok(rule.factIds.length>0,`${rule.id} has no observed condition`);
          for (const id of rule.factIds) {
            assert.ok(visible.has(id),`${rule.id} points outside the published evidence: ${id}`);
            assert.ok(chapter.factIds.includes(id),`${rule.id} is not connected to its chapter calculation`);
          }
        }
      }
      const bodyIds=new Set(chapters.flatMap(value=>value.factIds));
      const requiredBody=expected.filter(id=>(topic==='lifelong'?id.startsWith('natal.')
        :topic==='annual'?id.startsWith('annual.'):id.startsWith('month.'))&&!id.startsWith('natal.reference.note.'));
      for (const id of requiredBody) assert.ok(bodyIds.has(id),`${topic} exposes ${id} only in evidence but omits the promised body linkage`);
    }
  });
}

test('conditional service commentary and common advice remain distinct from calculated records',()=>{
  const {fortune,report}=sample(examples[1]);
  assert.ok(fortune.profile.interactions.length>=4,'fixture exercises a source list longer than the previous three-item summary');
  assert.ok(fortune.months.some(value=>value.interactions.length>=4));
  const allChapters=[...report.sections.flatMap(value=>value.chapters),...report.months.flatMap(value=>value.chapters)];
  const allCalculations=allChapters.flatMap(value=>value.calculation).join('\n');
  const allInterpretations=allChapters.flatMap(value=>value.interpretation).join('\n');
  const allReferences=allChapters.flatMap(value=>value.reference).join('\n');
  const pairRules=allChapters.flatMap(value=>value.referenceRules||[]).filter(value=>value.id.startsWith('natal.pair.'));
  assert.equal(allChapters.flatMap(value=>value.rules).some(value=>value.id.startsWith('natal.pair.')||value.origin==='service-reference'),false,
    'service-authored links must not remain in the traditional interpretation rules');
  for (const definition of GROUP_PAIR_RULES) {
    const left=fortune.profile.gods.filter(value=>value.god.group===definition.left);
    const right=fortune.profile.gods.filter(value=>value.god.group===definition.right);
    const matches=pairRules.filter(value=>value.id===`natal.pair.${definition.id}`);
    assert.equal(matches.length,left.length&&right.length?1:0,'service links may only run for two groups actually observed');
    if(matches.length) {
      assert.equal(matches[0].origin,'service-reference');
      assert.match(matches[0].text,/서비스(?:가)? 작성/);
      assert.ok(allReferences.includes(matches[0].text),'the observed condition and its service origin must be visible in reference');
      assert.ok(!allInterpretations.includes(matches[0].text),'service linkage conditions belong in reference, not interpretation');
      assert.ok(allReferences.includes(definition.reading),'service-authored shared explanation is disclosed as reference');
    }
    assert.ok(!allCalculations.includes(definition.reading),'shared linkage prose must not be recorded as a computed observation');
    assert.ok(!allInterpretations.includes(definition.reading),'shared linkage prose must not be presented as a traditional reading');
  }
  for (const text of Object.values(PRACTICE_SUGGESTIONS)) {
    assert.ok(!allCalculations.includes(text),'general life advice must stay outside calculation');
    assert.ok(!report.facts.some(value=>value.text.includes(text)),'a recommendation is not source data');
  }
  assert.match(report.method.reuseNotice,/공통 참고 해설/);
  const limits=report.method.notCalculated.join(' ');
  assert.match(limits,/대운/);
  assert.match(limits,/용신/);
  assert.match(limits,/신살/);
  assert.ok(report.method.notCalculated.some(text=>text.includes('공망')&&/영향|적용|효력/.test(text)),
    'the raw xun-kong names are available, but their claimed effect on life is not calculated');
  assert.ok(!/신살·12운성|지지 본기 이외의 중기·여기/.test(limits),'newly provided raw classifications cannot still be advertised as omitted');
});
