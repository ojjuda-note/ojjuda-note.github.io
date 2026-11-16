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
    assert.deepEqual(person.detailSections,original.detailSections,'A/B keeps the same structured explanation as the person’s general reading');
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
      assert.deepEqual(card.detailSections,source.detailSections);
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
      assert.ok(block.detailSections.length>1);
      assert.deepEqual(block.detailSections.flatMap(section=>section.paragraphs),block.paragraphs,'the two-line summary accompanies the complete structured explanation');
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
  assert.deepEqual(synthesis.detailSections.flatMap(section=>section.paragraphs),synthesis.paragraphs);
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
  for(const card of relationCards)assert.ok(!synthesis.paragraphs[4].includes(card.summaryLines[1]),'the joint practice explains an exchange instead of pasting the individual advice again');
  assert.ok(synthesis.paragraphs.every(text=>!reading.paragraphs.includes(text)),'synthesis connects the personal stories rather than renaming the old opening');
  assert.doesNotMatch(synthesis.paragraphs.join(' '),/반드시|무조건|운명적으로|결혼하게|이별하게|헤어지게|\d+%|undefined/);
});

const correctionBirths=[birthA,birthB,{year:1988,month:11,day:2,hour:15,minute:20},
  {year:1990,month:1,day:1,hour:9,minute:0},{year:1990,month:3,day:2,hour:9,minute:0},
  {year:1985,month:7,day:26,hour:22,minute:15},{year:1997,month:9,day:9,hour:13,minute:30}];
const correctionPairs=[[0,1],[0,2],[3,4],[1,5],[5,6]];

test('five distinct pairs lead with their own two decision styles and keep the original scores',()=>{
  const charts=correctionBirths.map(chart),readings=correctionPairs.map(([a,b])=>buildCompatibilityReading(charts[a],charts[b]));
  assert.deepEqual(readings.map(reading=>reading.score.total),[66,69,71,66,76]);
  assert.equal(new Set(readings.map(reading=>reading.synthesis.headline)).size,5,'the audited different couples no longer receive one generic opening');
  assert.match(readings[0].synthesis.headline,/설명.*A와.*선택지.*B는.*준비/);
  assert.match(readings[1].synthesis.headline,/설명.*A와.*고칠 점.*B는/);
  for(const [index,reading] of readings.entries()) {
    const [a,b]=correctionPairs[index],reverse=buildCompatibilityReading(charts[b],charts[a]);
    const forwardParts=reading.synthesis.headline.match(/^(.+) A와 (.+) B는 (.+)$/u);
    const reverseParts=reverse.synthesis.headline.match(/^(.+) A와 (.+) B는 (.+)$/u);
    assert.ok(forwardParts&&reverseParts,'each of these fixtures has genuinely different leading decision traits');
    assert.equal(forwardParts[1],reverseParts[2],'the first person’s trait follows that person when the inputs swap');
    assert.equal(forwardParts[2],reverseParts[1],'the second person’s trait follows that person when the inputs swap');
    assert.equal(forwardParts[3],reverseParts[3],'reversing the participants preserves the type of joint explanation');
    assert.equal(reading.synthesis.summaryLines.length,2);
    assert.equal(reading.synthesis.summaryLines[0],reading.synthesis.headline);
    assert.ok(reading.synthesis.paragraphs[5].includes(reading.synthesis.summaryLines[1]),'the second summary line is the joint action actually explained in the body');
    assert.deepEqual(reading.synthesis.detailSections.flatMap(section=>section.paragraphs),reading.synthesis.paragraphs);
  }
});

test('joint pages stop repeating the individual relationship advice and use distinct practice and dialogue contexts',()=>{
  const reading=buildCompatibilityReading(chart(birthA),chart(birthB));
  const body=[...reading.people.flatMap(person=>[...person.paragraphs,...person.cards.flatMap(card=>card.paragraphs)]),
    ...reading.synthesis.paragraphs,...reading.cards.flatMap(card=>card.paragraphs),...reading.score.items.flatMap(item=>item.paragraphs)];
  for(const line of ['챙겨 준 행동에 어떤 마음이 있었는지 짧게 말해 주세요.',
    '서로 의견이 다를 때는 같이 정할 부분과 각자 정해도 되는 부분을 나누어 말해 주세요.']) {
    assert.equal(body.reduce((count,paragraph)=>count+paragraph.split(line).length-1,0),1,'an individual instruction belongs in its personal story, not five joint pages');
  }
  const joint=[...reading.cards,...reading.score.items];
  assert.equal(new Set(joint.map(item=>item.paragraphs.at(-1))).size,joint.length);
  const zodiac=reading.cards.find(card=>card.id==='zodiac'),everyday=reading.cards.find(card=>card.id==='everyday'),daily=reading.score.items.find(item=>item.id==='daily');
  const dialogue=item=>item.detailSections.find(section=>/대화/.test(section.title)).paragraphs.join(' ');
  assert.equal(new Set([zodiac,everyday,daily].map(dialogue)).size,3,'zodiac reflection, daily habits and checking a daily agreement do not repeat one conversation');
  assert.match(zodiac.paragraphs.at(-1),/실제로 편했던|함께 지내면서도/);
  assert.match(everyday.paragraphs.at(-1),/오늘 혼자 쉬고 싶은 시간/);
  assert.match(daily.paragraphs.at(-1),/계속 챙길 수 있는 작은 행동과 쉬어야 할 행동/);
});

test('shared traits stay shared in the new conclusion and an unknown hour cannot supply an action clue',()=>{
  for(const input of [birthA,{...birthA,hour:null},{year:2024,month:2,day:4,hour:null}]) {
    const own=chart(input),reading=buildCompatibilityReading(own,own);
    assert.match(reading.synthesis.headline,/^두 사람 모두/);
    assert.doesNotMatch(reading.synthesis.headline,/A와|B가|서로 다른|완벽|최고/);
    assert.match(reading.synthesis.paragraphs[4],/닮았지만 지금 필요한 배려까지 같다고 보지는/);
    assert.equal(reading.synthesis.summaryLines.length,2);
    for(const item of [...reading.cards,...reading.score.items]) {
      const practice=item.paragraphs.at(-1);
      assert.match(practice,/두 사람 모두/);
      assert.doesNotMatch(practice,/A는 .+ B는/);
    }
    if(input.hour===null) {
      assert.match(reading.scopeNotice,/태어난 시간/);
      assert.ok(reading.people.every(person=>!person.scope.knownPillars.includes('hour')));
      for(const item of [...reading.cards,...reading.score.items])for(const section of item.detailSections) {
        assert.ok(section.factIds.every(id=>!/^person\.(?:self|partner)\.natal\.god\.hour\./u.test(id)));
      }
    }
  }
});
