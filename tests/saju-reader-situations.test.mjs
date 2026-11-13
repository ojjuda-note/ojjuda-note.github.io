import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaju } from '../games/starlit-saju/engine.mjs';
import { analyzeFortune } from '../games/starlit-saju/fortune-data.mjs';
import { buildDetailedReading } from '../games/starlit-saju/readings.mjs';
import { buildReaderSituation } from '../games/starlit-saju/reader-situations.mjs';

const now=new Date('2026-11-13T00:00:00Z');
const sample={year:1990,month:5,day:17,hour:8,minute:37};
const topics=['opportunities','cautions','response'];
const codes=['companion','competitor','creator','critic','opportunist','manager','challenger','officer','explorer','scholar'];
const unique=values=>[...new Set(values)];

function reading(input=sample) {
  const chart=calculateSaju(input,{now});
  const fortune=analyzeFortune(chart,{year:2026,now});
  return {chart,fortune,report:buildDetailedReading(chart,fortune)};
}

function periodOverviews(report) {return [report.reader.annual,...report.reader.months];}
function flowCards(overview) {return overview.cards.filter(card=>topics.some(topic=>card.id.endsWith('-'+topic)));}

test('each confirmed relationship has a distinct opportunity, caution and response situation, with explicit hypothetical examples',()=>{
  const all=[];
  for(const code of codes)for(const topic of topics) {
    const input={topic,codes:[code],natalCodes:[code],periodLabel:'이 시기'};
    const result=buildReaderSituation(input);
    assert.deepEqual(result,buildReaderSituation(input),'same evidence must give the same shared explanation');
    assert.equal(result.origin,'service-reference');
    assert.deepEqual(result.godCodes,[code]);
    assert.deepEqual(result.natalGodCodes,[code]);
    assert.equal(result.paragraphs.length,6);
    assert.equal(new Set(result.paragraphs).size,6);
    assert.match(result.paragraphs[4],/^가령 .+가정해 볼게요/);
    assert.ok(result.paragraphs.every(text=>text.length>30&&text.length<340),'the case has connected, readable paragraphs');
    assert.doesNotMatch(result.paragraphs.join(' '),/사고가 (나|생길)|질병이 (오|생길)|당첨|반드시|무조건|[0-9]+월 [0-9]+일|[0-9]+세에|[0-9]+%|신강|신약|용신|undefined/);
    all.push(result);
  }
  assert.equal(new Set(all.map(value=>value.title)).size,30,'three different purposes must not be the same guidance with new labels');
  assert.equal(new Set(all.map(value=>value.paragraphs[4])).size,30,'the purpose changes the situation rather than merely shuffling words');
});

test('the same actual period gives different reactions and next steps for different natal profiles',()=>{
  const winter=reading({year:1990,month:1,day:1,hour:9,minute:0});
  const spring=reading({year:1990,month:3,day:2,hour:9,minute:0});
  assert.equal(winter.chart.dayMaster.hanja,spring.chart.dayMaster.hanja);
  assert.deepEqual(winter.report.reader.annual.godCodes,spring.report.reader.annual.godCodes);
  const first=flowCards(winter.report.reader.annual),second=flowCards(spring.report.reader.annual);
  for(let index=0;index<first.length;index++) {
    assert.deepEqual(first[index].godCodes,second[index].godCodes);
    assert.notDeepEqual(first[index].natalGodCodes,second[index].natalGodCodes,'these fixtures have different confirmed personal clues');
    assert.equal(first[index].paragraphs[4],second[index].paragraphs[4],'shared period clues keep their shared example honestly');
    assert.notEqual(first[index].paragraphs[1],second[index].paragraphs[1],'the person’s reaction is grounded in their own profile');
    assert.notEqual(first[index].paragraphs.at(-1),second[index].paragraphs.at(-1),'the practical adjustment must change too, not only a personality introduction');
  }
});

test('the actual second relationship changes the decision conditions even when the first month relationship repeats',()=>{
  const {report}=reading();
  const pair=report.reader.months.flatMap((left,index)=>report.reader.months.slice(index+1).map(right=>[left,right]))
    .find(([left,right])=>left.godCodes[0]===right.godCodes[0]&&left.godCodes[1]&&right.godCodes[1]&&left.godCodes[1]!==right.godCodes[1]);
  assert.ok(pair,'the calendar fixture contains two months with a shared first and distinct second clue');
  const [left,right]=pair.map(flowCards);
  for(let index=0;index<left.length;index++) {
    assert.equal(left[index].paragraphs[0],right[index].paragraphs[0]);
    assert.equal(left[index].paragraphs[4],right[index].paragraphs[4]);
    assert.notEqual(left[index].paragraphs[2],right[index].paragraphs[2],'the actual second clue alters what must be checked before deciding');
    const topic=topics[index];
    assert.ok(left[index].situationRuleIds.includes(`condition.${topic}.${pair[0].godCodes[1]}`));
    assert.ok(right[index].situationRuleIds.includes(`condition.${topic}.${pair[1].godCodes[1]}`));
  }
});

test('confirmed combinations and clashes remain separate conditions, including when both are present',()=>{
  const {fortune}=reading();
  const actual=fortune.months.flatMap(month=>month.interactions);
  const connect=actual.find(value=>value.kind!=='branch-clash'),clash=actual.find(value=>value.kind==='branch-clash');
  assert.ok(connect&&clash,'the cases use actual computed interactions');
  for(const topic of topics) {
    const base={topic,codes:['creator','officer'],natalCodes:['manager','scholar']};
    const results=[[],[connect],[clash],[connect,clash]].map(interactions=>buildReaderSituation({...base,interactions}));
    assert.deepEqual(results.map(value=>value.interactionKind),[null,'connect','clash','both']);
    assert.equal(new Set(results.map(value=>value.paragraphs[3])).size,4,'opposing and connecting conditions are not flattened into the same advice');
    assert.ok(!results[0].ruleIds.some(id=>id.startsWith('interaction.')),'absence of a checked interaction must not create one');
    assert.ok(results[3].ruleIds.includes(`interaction.${topic}.both`));
  }
});

test('annual and monthly cards no longer duplicate whole guidance paragraphs across topics, and their complete text stays in copy',()=>{
  const inputs=[sample,{year:2002,month:11,day:9,hour:17,minute:40},{year:1987,month:12,day:11,hour:22,minute:15},{year:2024,month:2,day:4,hour:null}];
  for(const input of inputs) {
    const {report}=reading(input);
    for(const overview of periodOverviews(report)) {
      const paragraphs=overview.cards.flatMap(card=>card.paragraphs);
      assert.equal(new Set(paragraphs).size,paragraphs.length,`${input.year}/${input.month}/${input.day}: ${overview.title} should not repeat a domain's guidance in the opportunity/caution/response cards`);
      const copy=overview.month?report.copyByCategory.monthly:report.copyByCategory.annual;
      for(const card of flowCards(overview))for(const paragraph of card.paragraphs)assert.ok(copy.includes(paragraph),'deduplication must not silently cut the new situation from saved/copied text');
    }
  }
});

test('all selected situation clues keep their actual source facts, including limited input and every checked interaction',()=>{
  for(const input of [sample,{...sample,hour:null},{year:2024,month:2,day:4,hour:null}]) {
    const {fortune,report}=reading(input),registry=new Set(report.facts.map(fact=>fact.id));
    const periods=[{overview:report.reader.annual,transit:fortune.annual,prefix:'annual'},
      ...report.reader.months.map(overview=>({overview,transit:fortune.months.find(month=>month.month===overview.month),prefix:`month.${overview.month}`}))];
    for(const {overview,transit,prefix} of periods)for(const card of flowCards(overview)) {
      assert.deepEqual(card.godCodes,unique([transit.stemGod.code,transit.branchGod.code]));
      assert.ok(card.factIds.includes(`${prefix}.period`));
      assert.ok(card.factIds.includes(`${prefix}.god.stem`));
      assert.ok(card.factIds.includes(`${prefix}.god.branch`));
      for(const entry of fortune.profile.gods)assert.ok(card.factIds.includes(`natal.god.${entry.pillarKey}.${entry.position}`));
      for(let index=0;index<transit.interactions.length;index++)assert.ok(card.factIds.includes(`${prefix}.interaction.${index}`),'neither combination nor clash evidence may be omitted');
      for(const code of card.natalGodCodes)assert.ok(fortune.profile.gods.some(entry=>entry.god.code===code));
      for(const id of card.factIds)assert.ok(registry.has(id),'an uncertain input must not produce an invented source');
    }
  }
});

test('missing or unknown situation clues are rejected rather than replaced with a generic case',()=>{
  const input={topic:'opportunities',codes:['creator'],natalCodes:['manager']};
  for(const override of [{topic:'missing'},{topic:'__proto__'},{codes:[]},{codes:['invented']},{codes:codes.slice(0,3)},
    {natalCodes:[]},{natalCodes:['invented']},{interactions:[{kind:'invented'}]},{periodLabel:''}]) {
    assert.throws(()=>buildReaderSituation({...input,...override}),/확인된 성향과 시기/);
  }
  assert.throws(()=>buildReaderSituation(),/확인된 성향과 시기/);
  const duplicate=buildReaderSituation({...input,codes:['creator','creator'],natalCodes:['manager','manager']});
  const single=buildReaderSituation(input);
  assert.deepEqual(duplicate,single,'the same clue in two confirmed positions does not generate a second distinct prediction');
});
