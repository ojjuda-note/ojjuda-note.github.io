import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSaju} from '../games/starlit-saju/engine.mjs';
import {analyzeFortune,makeProfile} from '../games/starlit-saju/fortune-data.mjs';
import {analyzeDaeun} from '../games/starlit-saju/daeun.mjs';
import {buildDetailedReading} from '../games/starlit-saju/readings.mjs';
import {buildCompatibilityReading} from '../games/starlit-saju/compatibility.mjs';
import {buildCompatibilityScore} from '../games/starlit-saju/compatibility-score.mjs';
import {compatibilityPeopleText} from '../games/starlit-saju/compatibility-people-view.mjs';
import {compatibilityScoreText} from '../games/starlit-saju/compatibility-score-view.mjs';
import {readingDetailSections,readingDetailText} from '../games/starlit-saju/reading-detail.mjs';

const now=new Date('2026-11-13T00:00:00Z');
const birth={year:1990,month:5,day:17,hour:8,minute:37};
const partner={year:1992,month:3,day:14,hour:10,minute:20};
const chart=input=>calculateSaju(input,{now});
function general(input=birth) {
  const natal=chart(input),fortune=analyzeFortune(natal,{year:2026,now});
  return {chart:natal,fortune,reading:buildDetailedReading(natal,fortune,{daeun:analyzeDaeun(natal,{gender:'female',now})})};
}
function structured(item,label,copy) {
  assert.ok(Array.isArray(item.detailSections)&&item.detailSections.length>0,label+': the authored body has explicit sections');
  assert.ok(item.detailSections.every(section=>typeof section.title==='string'&&section.title.trim()&&Array.isArray(section.paragraphs)&&section.paragraphs.length>0),label+': sections have meaningful headings and complete paragraphs');
  assert.deepEqual(item.detailSections.flatMap(section=>section.paragraphs),item.paragraphs,label+': sectioning cannot drop, reorder or invent a paragraph');
  assert.equal(new Set(item.paragraphs).size,item.paragraphs.length,label+': duplicate text cannot pad the body');
  assert.equal(new Set(item.detailSections.map(section=>section.title)).size,item.detailSections.length,label+': headings distinguish the explanation parts');
  assert.deepEqual(readingDetailText(item),item.detailSections.flatMap(section=>[section.title,...section.paragraphs]));
  if(copy) {
    let offset=0;
    for(const text of readingDetailText(item)) {
      const found=copy.indexOf(text,offset);
      assert.ok(found>=offset,label+': copy retains each heading and paragraph in reading order');
      offset=found+text.length;
    }
  }
  for(const paragraph of item.paragraphs)assert.doesNotMatch(paragraph,/undefined|\[object Object\]|운명적으로|결혼하게 됩니다|이별하게 됩니다|반드시 성공|무조건 당첨/);
}
function withCards(item) { return [item,...item.cards]; }
function generalGroups(report) {
  return {
    lifelong:[...withCards(report.personPortrait),...withCards(report.reader.lifelong),report.daeun,
      ...report.daeun.periods.flatMap(period=>[period,...period.topics,...period.situations]),
      report.reader.symbols,...report.reader.symbols.items.filter(item=>item.paragraphs)],
    annual:withCards(report.reader.annual),
    monthly:[...report.reader.months.flatMap(withCards),report.reader.timings,...report.reader.timings.items],
  };
}

test('every general reading keeps its full structured explanation in the paid category and complete copy',()=>{
  const {reading}=general();
  for(const [category,items] of Object.entries(generalGroups(reading)))for(const item of items) {
    const label=item.id||item.title||item.label;
    structured(item,label,reading.copyByCategory[category]);
    for(const text of readingDetailText(item))assert.ok(reading.copyByCategory.all.includes(text),label+': the complete purchase includes every new explanation');
  }
  for(const copy of Object.values(reading.copyByCategory))assert.doesNotMatch(copy,/계산 근거|점수를 계산한 방법|자료 출처|상세 산식/);
});

test('unknown-time explanations preserve the missing natal hour and state the six-AM decade assumption',()=>{
  const {chart:natal,reading}=general({...birth,hour:null});
  assert.equal(natal.timeKnown,false);
  assert.equal(natal.input.hour,null);
  assert.equal(reading.daeun.available,true);
  assert.equal(reading.daeun.timeAssumed,true);
  assert.match(reading.daeun.birthTimeNotice,/6시 00분/);
  for(const item of withCards(reading.personPortrait)) {
    structured(item,item.id,reading.copyByCategory.lifelong);
    assert.ok(item.factIds.every(id=>!id.startsWith('natal.god.hour.')),'the six-AM calculation cannot add natal personality clues');
  }
  for(const category of ['lifelong','all'])assert.ok(reading.copyByCategory[category].includes(reading.daeun.birthTimeNotice));
});

test('compatibility score stories preserve every existing score rule and point only to real pair facts',()=>{
  for(const input of [birth,{...birth,hour:null},{year:2024,month:2,day:4,hour:null}]) {
    const a=chart(input),b=chart(partner),reading=buildCompatibilityReading(a,b);
    const original=buildCompatibilityScore({profiles:{self:makeProfile(a),partner:makeProfile(b)},comparisons:reading.comparisons,interactions:reading.interactions}).score;
    const {items,...scoreFields}=reading.score,{items:originalItems,...originalFields}=original;
    assert.deepEqual(scoreFields,originalFields,'adding full explanations does not change the total, scope or score rules');
    const registry=new Set(reading.facts.map(fact=>fact.id));
    const copy=compatibilityScoreText(reading.score);
    for(const [index,item] of items.entries()) {
      const {paragraphs,detailSections,summaryLines,...scoreItem}=item;
      assert.deepEqual(scoreItem,originalItems[index],'each original numeric value, two-line summary, formula and fact link stays unchanged');
      assert.equal(summaryLines.length,2);
      structured(item,item.id,copy);
      assert.ok(detailSections.some(section=>/예시|대화/.test(section.title)&&section.paragraphs.some(paragraph=>/가상|예시|해 볼게요/.test(paragraph))),'the everyday scene is explicitly hypothetical');
      for(const section of detailSections)for(const id of section.factIds)assert.ok(registry.has(id),id);
      assert.ok(detailSections.some(section=>section.factIds.some(id=>id.startsWith('person.self.'))&&section.factIds.some(id=>id.startsWith('person.partner.'))),'the new explanation connects both actual people');
      assert.equal(copy.includes(item.reason),false,'the full story does not expose the hidden score formula');
    }
    for(const card of reading.cards) {
      structured(card,card.id);
      for(const section of card.detailSections)for(const id of section.factIds)assert.ok(registry.has(id),id);
    }
    const peopleCopy=compatibilityPeopleText(reading);
    for(const person of reading.people)for(const item of withCards(person))structured(item,item.id,peopleCopy);
    structured(reading.synthesis,'combined explanation',peopleCopy);
    for(const person of reading.people)for(const missing of person.scope.excludedPillars) {
      assert.ok(reading.facts.every(fact=>!fact.id.startsWith(`person.${person.key}.natal.god.${missing.key}.`)),'unknown pillars never gain invented personal clues');
    }
  }
});

const connectedTopics={
  connection:['work','함께 일할 때 살릴 장점'],
  differences:['adjustment','의도와 다르게 들리기 쉬운 말'],
  everyday:['relationships','가까운 사이에서 편한 표현'],
  conversation:['pressure','힘들 때 달라지는 대화'],
};
test('changing only the partner changes the relevant joint explanation while preserving the first person',()=>{
  const a=chart(birth),partners=[partner,{year:1988,month:11,day:2,hour:15,minute:20},{year:1987,month:12,day:11,hour:22,minute:15},{year:2002,month:7,day:25,hour:6,minute:40}];
  const readings=partners.map(input=>buildCompatibilityReading(a,chart(input)));
  for(const reading of readings)assert.deepEqual(reading.people[0],readings[0].people[0]);
  for(const [id,[topic,heading]] of Object.entries(connectedTopics)) {
    const examples=readings.map(reading=>({code:reading.people[1].cards.find(card=>card.topicId===topic).godCodes.slice(0,2).join('|'),
      story:reading.cards.find(card=>card.id===id).detailSections.find(section=>section.title===heading).paragraphs.join(' ')}));
    assert.ok(new Set(examples.map(example=>example.code)).size>1,id+': the fixture compares genuinely different observed traits');
    for(const left of examples)for(const right of examples)if(left.code!==right.code)assert.notEqual(left.story,right.story,id+': the partner’s actual trait changes the connected explanation');
  }
});

test('the same leading traits receive shared wording without an invented A/B contrast',()=>{
  const a=chart(birth),reading=buildCompatibilityReading(a,a);
  for(const [id,[,heading]] of Object.entries(connectedTopics)) {
    const item=reading.cards.find(card=>card.id===id),section=item.detailSections.find(section=>section.title===heading);
    assert.match(section.paragraphs.join(' '),/두 사람 모두/);
    assert.doesNotMatch(section.paragraphs.join(' '),/A는 .+ B는|완벽한 궁합|최고의 궁합|100%/);
    const scene=item.detailSections.find(section=>section.title==='이렇게 대화해 보세요');
    assert.match(scene.paragraphs.join(' '),/가상 장면/);
    assert.match(scene.paragraphs.join(' '),/공통으로 보이는/);
  }
});

test('detail metadata fails closed when it could hide, reorder or add purchased prose',()=>{
  const item={paragraphs:['설명 첫 문단','생활 예시 문단'],detailSections:[{title:'내 모습',paragraphs:['설명 첫 문단']},{title:'생활 예시',paragraphs:['생활 예시 문단']}]};
  assert.deepEqual(readingDetailSections(item),item.detailSections);
  assert.deepEqual(readingDetailText({paragraphs:item.paragraphs}),item.paragraphs,'a legacy complete explanation remains readable without metadata');
  for(const detailSections of [[],[{title:'',paragraphs:item.paragraphs}],[{title:'내 모습',paragraphs:[]}],
    [{title:'내 모습',paragraphs:[item.paragraphs[0]]}],
    [{title:'내 모습',paragraphs:[...item.paragraphs].reverse()}],
    [{title:'내 모습',paragraphs:[...item.paragraphs,'임의로 덧붙인 문단']}],
  ])assert.throws(()=>readingDetailText({...item,detailSections}),/자세한 풀이|설명이 빠짐없이/);
});
