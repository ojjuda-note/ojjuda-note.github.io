import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSaju} from '../games/starlit-saju/engine.mjs';
import {analyzeFortune} from '../games/starlit-saju/fortune-data.mjs';
import {buildDetailedReading} from '../games/starlit-saju/readings.mjs';
import {buildPersonPortrait} from '../games/starlit-saju/person-portrait.mjs';

const now=new Date('2026-11-13T00:00:00Z');
const sample={year:1990,month:5,day:17,hour:8,minute:37};
function fixture(input=sample,year=2026){
  const chart=calculateSaju(input,{now});
  const fortune=analyzeFortune(chart,{year,now});
  const report=buildDetailedReading(chart,fortune);
  return {chart,fortune,report,portrait:report.personPortrait};
}
const prose=portrait=>[portrait.headline,...portrait.paragraphs,...portrait.cards.flatMap(card=>[card.title,...card.paragraphs])];

test('the opening portrait explains a person through several confirmed natal clues without replacing the calculation',()=>{
  const {fortune,report,portrait}=fixture();
  assert.ok(portrait&&portrait.headline.length>15);
  assert.ok(portrait.paragraphs.length>=2&&portrait.paragraphs.length<=4);
  assert.equal(portrait.cards.length,5);
  assert.equal(new Set(portrait.cards.map(card=>card.id)).size,5);
  const ids=new Set(report.facts.map(fact=>fact.id));
  for(const block of [portrait,...portrait.cards]){
    assert.equal(block.origin,'service-reference');
    assert.ok(block.factIds.length>0);
    assert.equal(new Set(block.factIds).size,block.factIds.length);
    for(const id of block.factIds){assert.ok(ids.has(id),id);assert.ok(id.startsWith('natal.'),id);}
  }
  assert.ok(portrait.factIds.some(id=>id.startsWith('natal.god.')),'the person is not described by the day stem alone');
  for(const card of portrait.cards){
    assert.ok(card.paragraphs.length>=4&&card.paragraphs.length<=5);
    assert.equal(new Set(card.paragraphs).size,card.paragraphs.length);
    assert.ok(card.paragraphs.some(text=>/예를|가령|가정|가상의|한다고 해 볼게요/.test(text)),'each trait should be recognizable in a hypothetical everyday scene');
  }
  const input={profile:fortune.profile,facts:report.facts,chapters:report.sections.find(section=>section.id==='lifelong').chapters};
  const before=structuredClone(input);
  assert.deepEqual(buildPersonPortrait(input),portrait);
  assert.deepEqual(input,before,'the original calculation and its evidence remain unchanged');
});

test('the same day master is interpreted with its different observed relationships, not one whole personality template',()=>{
  const winter=fixture({year:1990,month:1,day:1,hour:9,minute:0});
  const spring=fixture({year:1990,month:3,day:2,hour:9,minute:0});
  assert.equal(winter.chart.dayMaster.hanja,spring.chart.dayMaster.hanja);
  assert.notDeepEqual(winter.portrait.paragraphs,spring.portrait.paragraphs);
  assert.notDeepEqual(winter.portrait.cards.map(card=>card.paragraphs),spring.portrait.cards.map(card=>card.paragraphs));
  assert.match(winter.portrait.methodNotice,/공통|같은|공유/);
});

test('a different forecast year never changes the natal person, and personal text belongs only to lifelong and complete copies',()=>{
  const first=fixture(sample,2025),second=fixture(sample,2027);
  assert.deepEqual(first.portrait,second.portrait);
  for(const text of [first.portrait.title,...prose(first.portrait)]){
    assert.ok(first.report.copyByCategory.lifelong.includes(text),text);
    assert.ok(first.report.copyByCategory.all.includes(text),text);
  }
  assert.ok(!first.report.copyByCategory.annual.includes(first.portrait.paragraphs[0]));
  assert.ok(!first.report.copyByCategory.monthly.includes(first.portrait.paragraphs[0]));
  assert.ok(first.report.copyByCategory.lifelong.includes(first.portrait.methodNotice));
  assert.ok(first.report.copyByCategory.lifelong.includes(first.portrait.selectionNotice));
  if(first.portrait.scopeNotice)assert.ok(first.report.copyByCategory.lifelong.includes(first.portrait.scopeNotice));
});

test('unknown hours and a term-boundary birth never acquire traits attributed to unconfirmed positions',()=>{
  for(const input of [{...sample,hour:null},{year:2024,month:2,day:4,hour:null}]){
    const {fortune,portrait,report}=fixture(input);
    const confirmed=new Set(fortune.profile.gods.map(entry=>`natal.god.${entry.pillarKey}.${entry.position}`));
    const registry=new Set(report.facts.map(fact=>fact.id));
    for(const block of [portrait,...portrait.cards])for(const id of block.factIds){
      assert.ok(registry.has(id),id);
      if(id.startsWith('natal.god.'))assert.ok(confirmed.has(id),id);
      assert.ok(!id.startsWith('natal.god.hour.'),id);
    }
    assert.ok(!prose(portrait).join('\n').includes('태어난 시간에서'));
  }
});

test('portrait prose leads with recognizable behavior and never invents a psychological score or a future event',()=>{
  for(const input of [sample,{year:1988,month:11,day:2,hour:15,minute:20},{year:2001,month:2,day:4,hour:null}]){
    const {portrait}=fixture(input);
    for(const text of prose(portrait)){
      assert.doesNotMatch(text,/바탕으로 읽혀요|모습으로 풀 수 있어요|사주란|사주는|천간|십성|일간|신강|신약|용신/);
      assert.doesNotMatch(text,/반드시|무조건|사망|수명|확률|\d+점|합격한다|결혼한다|헤어지게/);
    }
    assert.ok(portrait.cards.some(card=>card.paragraphs.join(' ').match(/부탁|약속|대화|친구|상대/)));
    assert.ok(portrait.cards.some(card=>card.paragraphs.join(' ').match(/맡|일을|업무|마감/)));
  }
});

test('missing evidence stops a paid portrait instead of filling the gap with an ungrounded description',()=>{
  const {fortune,report}=fixture();
  const chapters=report.sections.find(section=>section.id==='lifelong').chapters;
  assert.throws(()=>buildPersonPortrait({profile:fortune.profile,facts:report.facts.filter(fact=>fact.id!=='natal.day-master'),chapters}));
});
