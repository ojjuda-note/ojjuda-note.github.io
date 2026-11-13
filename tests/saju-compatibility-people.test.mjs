import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSaju} from '../games/starlit-saju/engine.mjs';
import {analyzeFortune} from '../games/starlit-saju/fortune-data.mjs';
import {buildDetailedReading} from '../games/starlit-saju/readings.mjs';
import {buildCompatibilityReading} from '../games/starlit-saju/compatibility.mjs';

const now=new Date('2026-11-13T00:00:00Z');
const birthA={year:1990,month:5,day:17,hour:8,minute:37};
const birthB={year:1992,month:3,day:14,hour:10,minute:20};
const chart=input=>calculateSaju(input,{now});
const topics=['decisions','relationships','work','pressure','adjustment'];
const labels=['결정하는 방식','사람을 대하는 모습','일하는 모습','힘들 때 반응','오해받기 쉬운 모습'];
const unprefix=id=>id.replace(/^person\.(self|partner)\./,'');
const canonical=person=>{
  const {id,key,marker,title,headline,scopeNotice,summaryLines,cards,factIds,...rest}=person;
  return {...rest,headline:headline.replace(/^[AB]는 /,'X는 '),scopeNotice:scopeNotice.replace(/^[AB]는 /,'X는 '),
    summaryLines:summaryLines.map(text=>text.replace(/^[AB]는 /,'X는 ')),factIds:factIds.map(unprefix),
    cards:cards.map(({id,factIds,...card})=>({...card,factIds:factIds.map(unprefix)}))};
};
const sourceFacts=(reading,key)=>reading.facts.filter(fact=>fact.person===key)
  .map(({id,label,person,...fact})=>({...fact,factIds:fact.factIds?.map(unprefix)}));
const prose=person=>[person.headline,...person.paragraphs,...person.cards.flatMap(card=>[card.title,...card.paragraphs])];

test('each person reuses the actual general natal portrait, five topic stories and selected two-line advice',()=>{
  const charts=[chart(birthA),chart(birthB)],reading=buildCompatibilityReading(...charts);
  assert.deepEqual(reading.people.map(person=>[person.key,person.marker]),[['self','A'],['partner','B']]);
  for(const [index,person] of reading.people.entries()) {
    const ownChart=charts[index];
    const general=buildDetailedReading(ownChart,analyzeFortune(ownChart,{year:2026,now}));
    const original=general.personPortrait;
    assert.equal(person.headline,original.headline.replace(/^당신은 /,person.marker+'는 '));
    assert.deepEqual(person.paragraphs,original.paragraphs);
    assert.deepEqual(person.godCodes,original.godCodes);
    assert.deepEqual(person.anchorCodes,original.anchorCodes);
    assert.deepEqual(person.ruleIds,original.ruleIds);
    assert.deepEqual(person.cards.map(card=>card.topicId),topics);
    assert.deepEqual(person.cards.map(card=>card.label),labels);
    assert.equal(person.summaryLines[0],person.headline);
    assert.equal(person.summaryLines[1],original.summaryLines[1]);
    const originals=new Map(general.facts.map(fact=>[fact.id,fact]));
    for(const fact of reading.facts.filter(fact=>fact.person===person.key&&fact.sourceId?.startsWith('natal.')&&fact.kind!=='interpretation-rule')) {
      assert.equal(fact.value,originals.get(fact.sourceId)?.text,fact.sourceId);
    }
    for(const [cardIndex,card] of person.cards.entries()) {
      const source=original.cards[cardIndex];
      assert.equal(card.title,source.title);
      assert.deepEqual(card.paragraphs,source.paragraphs);
      assert.deepEqual(card.summaryLines,source.summaryLines);
      assert.equal(card.summaryLines[0],card.title);
      assert.deepEqual(card.godCodes,source.godCodes);
      assert.deepEqual(card.sourceFactIds,source.factIds);
      assert.deepEqual(card.factIds.filter(id=>!id.endsWith('.method')).map(unprefix),source.factIds);
    }
  }
});

test('a natal portrait never borrows the partner chart and follows its own chart when the inputs swap',()=>{
  const a=chart(birthA),b=chart(birthB),c=chart({year:1988,month:11,day:2,hour:15,minute:20});
  const ab=buildCompatibilityReading(a,b),ac=buildCompatibilityReading(a,c),ba=buildCompatibilityReading(b,a);
  assert.deepEqual(ab.people[0],ac.people[0]);
  assert.deepEqual(sourceFacts(ab,'self'),sourceFacts(ac,'self'));
  assert.deepEqual(canonical(ab.people[0]),canonical(ba.people[1]));
  assert.deepEqual(canonical(ab.people[1]),canonical(ba.people[0]));
  assert.deepEqual(sourceFacts(ab,'self'),sourceFacts(ba,'partner'));
  assert.deepEqual(sourceFacts(ab,'partner'),sourceFacts(ba,'self'));
  assert.equal(ab.score.total,ba.score.total);
  assert.deepEqual(ab.score.items.map(item=>item.value),ba.score.items.map(item=>item.value));
});

test('display names and gender do not change natal stories, synthesis, evidence or the existing score',()=>{
  const a=chart(birthA),b=chart(birthB),before=[structuredClone(a),structuredClone(b)];
  const first=buildCompatibilityReading(a,b);
  assert.deepEqual([a,b],before);
  assert.deepEqual(first,buildCompatibilityReading(a,b));
  const renamed=[a,b].map((value,index)=>({...structuredClone(value),name:index?'다른 이름 B':'다른 이름 A',gender:index?'female':'male',
    input:{...value.input,name:'표시용',gender:index?'male':'female'}}));
  assert.deepEqual(buildCompatibilityReading(...renamed),first);
  assert.equal(first.score.total,66);
  assert.deepEqual(first.score.items.map(item=>item.value),[60,83,65,54]);
});

test('same day masters retain distinct observed natal personalities instead of sharing a whole template',()=>{
  const winter=chart({year:1990,month:1,day:1,hour:9,minute:0});
  const spring=chart({year:1990,month:3,day:2,hour:9,minute:0});
  assert.equal(winter.dayMaster.hanja,spring.dayMaster.hanja);
  const reading=buildCompatibilityReading(winter,spring);
  assert.notDeepEqual(reading.people[0].paragraphs,reading.people[1].paragraphs);
  assert.notDeepEqual(reading.people[0].cards.map(card=>card.paragraphs),reading.people[1].cards.map(card=>card.paragraphs));
  assert.equal(reading.synthesis.comparison.samePortrait,false);
  assert.doesNotMatch(reading.synthesis.paragraphs.join(' '),/두 사람의 성향 풀이는 같아요/);
});

test('identical charts share their traits without an invented personality difference or a perfect match claim',()=>{
  for(const input of [birthA,{year:1988,month:11,day:2,hour:15,minute:20},{year:2024,month:2,day:4,hour:null}]) {
    const value=chart(input),reading=buildCompatibilityReading(value,value);
    assert.deepEqual(canonical(reading.people[0]),canonical(reading.people[1]));
    assert.deepEqual(reading.synthesis.comparison,{samePortrait:true,sameLeadingDecision:true,sameLeadingRelationship:true});
    const text=reading.synthesis.paragraphs.join(' ');
    assert.match(text,/두 사람의 성향 풀이는 같아요/);
    assert.match(text,/두 사람 모두/);
    assert.doesNotMatch(text,/서로 다른 성향|서로 다른 것을 먼저|완벽한 궁합|최고의 궁합|100%/);
    assert.notEqual(reading.score.total,100);
  }
});

test('unknown hours and unresolved year/month boundaries retain separate scopes and never acquire inferred natal clues',()=>{
  const inputs=[{...birthA,hour:null},{year:2024,month:2,day:4,hour:null},{year:2024,month:2,day:4,hour:17,minute:27}];
  for(const input of inputs) {
    const own=chart(input),reading=buildCompatibilityReading(own,chart(birthB)),person=reading.people[0];
    const confirmed=own.pillars.filter(pillar=>!pillar.uncertain&&pillar.hanja).map(pillar=>pillar.key);
    assert.deepEqual(person.scope.knownPillars,confirmed);
    assert.equal(person.scope.knownCharacterCount,confirmed.length*2);
    assert.ok(person.scopeNotice.includes(`확인된 ${confirmed.length*2}글자`));
    assert.equal(reading.people[1].scopeNotice,'');
    for(const missing of person.scope.excludedPillars) {
      assert.ok(person.scopeNotice.includes(missing.label));
      for(const fact of reading.facts.filter(fact=>fact.person==='self')) {
        assert.ok(!fact.id.startsWith(`person.self.natal.god.${missing.key}.`),fact.id);
        assert.ok(!fact.id.startsWith(`person.self.natal.character.${missing.key}.`),fact.id);
      }
    }
    if(!confirmed.includes('month')) {
      assert.ok(!person.ruleIds.some(id=>id.startsWith('natal.season.')));
      assert.match(reading.facts.find(fact=>fact.id==='person.self.natal.season').value,/미확정/);
      assert.ok(reading.facts.some(fact=>fact.id==='person.self.rule.natal.season-unavailable'));
    }
    assert.doesNotMatch(prose(person).join(' '),/태어난 시간에서/);
  }
  const before=chart({year:2024,month:2,day:4,hour:17,minute:26});
  const after=chart({year:2024,month:2,day:4,hour:17,minute:28});
  const resolved=buildCompatibilityReading(before,after);
  assert.ok(resolved.people.every(person=>person.scopeNotice===''&&person.scope.knownCharacterCount===8));
  for(const key of ['year','month'])assert.notEqual(
    resolved.facts.find(fact=>fact.id===`person.self.natal.pillar.${key}`).value,
    resolved.facts.find(fact=>fact.id===`person.partner.natal.pillar.${key}`).value);
});

test('all new facts are namespaced and every visible block and synthesis paragraph links its actual sources',()=>{
  const reading=buildCompatibilityReading(chart(birthA),chart(birthB));
  const registry=new Map(reading.facts.map(fact=>[fact.id,fact]));
  assert.equal(registry.size,reading.facts.length);
  for(const person of reading.people) {
    assert.match(person.methodNotice,/공통 참고 해설/);
    assert.match(person.selectionNotice,/강약을 순위로 매긴 결과가 아니/);
    for(const block of [person,...person.cards]) {
      assert.equal(block.origin,'service-reference');
      assert.equal(block.summaryLines.length,2);
      assert.ok(block.summaryLines.every(line=>typeof line==='string'&&line.trim()));
      assert.notEqual(...block.summaryLines);
      for(const id of block.factIds) {
        assert.ok(registry.has(id),id);
        assert.ok(id.startsWith(`person.${person.key}.`),id);
      }
    }
    const knownGods=reading.facts.filter(fact=>fact.person===person.key&&fact.kind==='ten-god').map(fact=>fact.id);
    for(const id of knownGods)assert.ok(person.factIds.includes(id),'each observed natal relationship remains represented: '+id);
    const interactions=reading.facts.filter(fact=>fact.person===person.key&&fact.kind==='interaction');
    for(const fact of interactions)assert.ok(person.factIds.includes(fact.id),fact.id);
  }
  const synthesis=reading.synthesis;
  assert.deepEqual(synthesis.paragraphIds,['strength','relationships','differences','example','adjustment','agreement']);
  assert.equal(synthesis.paragraphs.length,synthesis.paragraphFactIds.length);
  assert.equal(synthesis.summaryLines[0],synthesis.headline);
  for(const ids of synthesis.paragraphFactIds) {
    assert.ok(ids.some(id=>id.startsWith('person.self.')));
    assert.ok(ids.some(id=>id.startsWith('person.partner.')));
    assert.ok(ids.includes('day-master.self-to-partner'));
    for(const id of ids)assert.ok(registry.has(id),id);
  }
  assert.match(synthesis.methodNotice,/공통 참고 풀이/);
  assert.match(synthesis.methodNotice,/가상 장면/);
  assert.match(synthesis.paragraphs[3],/^예를 들어 둘이 주말 약속을 정한다고 해 볼게요/);
  assert.ok(synthesis.paragraphs[0].includes(reading.people[0].headline));
  assert.ok(synthesis.paragraphs[0].includes(reading.people[1].headline));
  const relationCards=reading.people.map(person=>person.cards.find(card=>card.topicId==='relationships'));
  for(const card of relationCards)assert.ok(synthesis.paragraphs[4].includes(card.summaryLines[1]));
  assert.ok(synthesis.paragraphs.every(text=>!reading.paragraphs.includes(text)),'synthesis connects the personal stories rather than renaming the old opening');
  assert.doesNotMatch(synthesis.paragraphs.join(' '),/반드시|무조건|운명적으로|결혼하게|이별하게|헤어지게|\d+%|undefined/);
});
