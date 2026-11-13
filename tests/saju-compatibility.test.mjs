import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaju } from '../games/starlit-saju/engine.mjs';
import { buildCompatibilityReading } from '../games/starlit-saju/compatibility.mjs';

const now=new Date('2026-11-13T00:00:00Z');
const birthA={year:1990,month:5,day:17,hour:8,minute:37};
const birthB={year:1992,month:3,day:14,hour:10,minute:20};
const chart=input=>calculateSaju(input,{now});
const knownKeys=value=>value.pillars.filter(pillar=>!pillar.uncertain&&pillar.hanja).map(pillar=>pillar.key);
const displayedText=reading=>[reading.title,reading.headline,...reading.paragraphs,...reading.cards.flatMap(card=>[card.label,card.title,...card.paragraphs])].join('\n');

// Actual calculated birth charts spanning one full day-pillar cycle provide
// fixtures for every stem and branch without manufacturing a chart result.
const byStem=new Map(),byBranch=new Map();
for(let offset=0;offset<60;offset++) {
  const date=new Date(Date.UTC(1990,0,1+offset));
  const value=chart({year:date.getUTCFullYear(),month:date.getUTCMonth()+1,day:date.getUTCDate(),hour:9,minute:0});
  const day=value.pillars.find(pillar=>pillar.key==='day');
  if(!byStem.has(day.stem.hanja))byStem.set(day.stem.hanja,value);
  if(!byBranch.has(day.branch.hanja))byBranch.set(day.branch.hanja,value);
}
const dayMatches=(reading,kind)=>reading.interactions.filter(match=>match.selfPillarKey==='day'&&match.partnerPillarKey==='day'&&match.kind===kind);

test('two real charts retain all cross-pillar comparisons, exact facts and every source without mutating inputs',()=>{
  const first=chart(birthA),second=chart(birthB),before=[structuredClone(first),structuredClone(second)];
  const reading=buildCompatibilityReading(first,second);
  assert.deepEqual([first,second],before);
  assert.equal(reading.comparisons.length,16);
  assert.equal(new Set(reading.comparisons.map(value=>value.id)).size,16);
  const facts=new Map(reading.facts.map(value=>[value.id,value]));
  assert.equal(facts.size,reading.facts.length);
  assert.equal(reading.scopeNotice,'');
  for(const comparison of reading.comparisons) {
    assert.ok(facts.has(comparison.id));
    assert.match(facts.get(comparison.id).value,new RegExp(comparison.self.hanja));
    assert.match(facts.get(comparison.id).value,new RegExp(comparison.partner.hanja));
  }
  for(const match of reading.interactions) {
    assert.ok(facts.has(match.id));
    assert.ok(facts.get(match.id).value.includes(match.birthCharacter.hanja));
    assert.ok(facts.get(match.id).value.includes(match.otherCharacter.hanja));
    assert.ok(facts.get(match.id).value.includes(match.selfPillarLabel));
    assert.ok(facts.get(match.id).value.includes(match.partnerPillarLabel));
  }
  for(const card of reading.cards) {
    assert.equal(card.origin,'service-reference');
    assert.ok(card.paragraphs.length>=5);
    assert.ok(card.factIds.length>0);
    for(const id of card.factIds)assert.ok(facts.has(id),id);
  }
  assert.deepEqual(reading,buildCompatibilityReading(first,second),'the comparison does not depend on time, random selection or external state');
});

test('all five known stem combinations and all twelve known branch pairings use actual day pillars',()=>{
  assert.equal(byStem.size,10);
  assert.equal(byBranch.size,12);
  for(const pair of ['甲己','乙庚','丙辛','丁壬','戊癸']) {
    const reading=buildCompatibilityReading(byStem.get(pair[0]),byStem.get(pair[1]));
    assert.deepEqual(dayMatches(reading,'stem-combination').map(match=>match.pairHanja),[pair]);
  }
  for(const [kind,pairs] of [
    ['branch-combination',['子丑','寅亥','卯戌','辰酉','巳申','午未']],
    ['branch-clash',['子午','丑未','寅申','卯酉','辰戌','巳亥']],
  ])for(const pair of pairs) {
    const reading=buildCompatibilityReading(byBranch.get(pair[0]),byBranch.get(pair[1]));
    assert.deepEqual(dayMatches(reading,kind).map(match=>match.pairHanja),[pair]);
    assert.ok(reading.facts.find(fact=>fact.id==='day-branches').value.includes(kind==='branch-clash'?'지지충':'지지육합'));
  }
});

test('swapping the people reverses every real location and the directed day-master relationship',()=>{
  const first=byStem.get('甲'),second=byStem.get('丙');
  const forward=buildCompatibilityReading(first,second),reverse=buildCompatibilityReading(second,first);
  assert.equal(forward.dayMasterRelation.self.group,'expression');
  assert.equal(forward.dayMasterRelation.partner.group,'resource');
  assert.deepEqual(forward.dayMasterRelation.self,reverse.dayMasterRelation.partner);
  assert.deepEqual(forward.dayMasterRelation.partner,reverse.dayMasterRelation.self);
  const normalized=forward.interactions.map(match=>[match.kind,match.selfPillarKey,match.partnerPillarKey,match.birthCharacter.hanja,match.otherCharacter.hanja].join(':')).sort();
  const reversed=reverse.interactions.map(match=>[match.kind,match.partnerPillarKey,match.selfPillarKey,match.otherCharacter.hanja,match.birthCharacter.hanja].join(':')).sort();
  assert.deepEqual(normalized,reversed);
  assert.equal(forward.comparisons.length,reverse.comparisons.length);
  assert.match(forward.cards[0].paragraphs[0],/^내 쪽에서는 생각을 밖으로/);
  assert.match(reverse.cards[0].paragraphs[0],/^내 쪽에서는 배우고 도움을/);
});

test('individual stem meanings remain distinct even when the broad element relationship is the same',()=>{
  const first=buildCompatibilityReading(byStem.get('甲'),byStem.get('丙'));
  const second=buildCompatibilityReading(byStem.get('乙'),byStem.get('丁'));
  assert.equal(first.dayMasterRelation.self.group,second.dayMasterRelation.self.group);
  assert.notEqual(first.paragraphs[0],second.paragraphs[0]);
  assert.match(first.paragraphs[0],/방향을 정하고 꾸준히/);
  assert.match(second.paragraphs[0],/상황에 맞춰 방법을 바꾸고/);
});

test('identical input means the same actual characters, without invented perfect compatibility or self-clashes',()=>{
  const first=chart(birthA),reading=buildCompatibilityReading(first,first);
  assert.equal(reading.dayMasterRelation.self.code,'companion');
  assert.equal(reading.dayMasterRelation.partner.code,'companion');
  assert.equal(reading.comparisons.length,16);
  const sameLocations=reading.interactions.filter(match=>match.selfPillarKey===match.partnerPillarKey);
  assert.deepEqual(sameLocations,[]);
  assert.match(reading.facts.find(fact=>fact.id==='day-branches').value,/같은 글자/);
  assert.doesNotMatch(displayedText(reading),/완벽한 궁합|최고의 궁합|100%|[0-9]+점/);
});

test('unknown time and an unknown time at an Ipchun boundary never enter guessed year, month or hour pillars',()=>{
  const first=chart({...birthA,hour:null}),second=chart({year:2024,month:2,day:4,hour:null});
  assert.deepEqual(knownKeys(first),['year','month','day']);
  assert.deepEqual(knownKeys(second),['day']);
  const reading=buildCompatibilityReading(first,second);
  assert.equal(reading.comparisons.length,3);
  assert.equal(reading.scope.self.knownCharacterCount,6);
  assert.equal(reading.scope.partner.knownCharacterCount,2);
  assert.match(reading.scopeNotice,/내 사주.*태어난 시간/);
  assert.match(reading.scopeNotice,/상대 사주.*태어난 해.*태어난 달.*태어난 시간/);
  for(const comparison of reading.comparisons) {
    assert.notEqual(comparison.self.key,'hour');
    assert.equal(comparison.partner.key,'day');
  }
  for(const match of reading.interactions) {
    assert.notEqual(match.selfPillarKey,'hour');
    assert.equal(match.partnerPillarKey,'day');
  }
  const factIds=reading.facts.map(fact=>fact.id);
  assert.ok(!factIds.includes('self.pillar.hour'));
  assert.ok(['year','month','hour'].every(key=>!factIds.includes(`partner.pillar.${key}`)));
  assert.ok(['year','month','hour'].every(key=>factIds.includes(`partner.excluded.${key}`)));
});

test('removing only an ordinary unknown hour removes its comparisons while retaining all remaining pairs',()=>{
  const first=chart(birthA),unknown=chart({...birthA,hour:null}),second=chart(birthB);
  const full=buildCompatibilityReading(first,second),partial=buildCompatibilityReading(unknown,second);
  assert.equal(partial.comparisons.length,12);
  assert.deepEqual(partial.comparisons,full.comparisons.filter(comparison=>comparison.self.key!=='hour'));
  assert.deepEqual(partial.interactions,full.interactions.filter(match=>match.selfPillarKey!=='hour'));
});

test('known adjacent birth times at an Ipchun boundary use their own confirmed pillars',()=>{
  const before=chart({year:2024,month:2,day:4,hour:17,minute:26});
  const after=chart({year:2024,month:2,day:4,hour:17,minute:28});
  const reading=buildCompatibilityReading(before,after);
  assert.equal(reading.comparisons.length,16);
  assert.equal(reading.scopeNotice,'');
  for(const key of ['year','month']) {
    const first=before.pillars.find(pillar=>pillar.key===key),second=after.pillars.find(pillar=>pillar.key===key);
    assert.notEqual(first.hanja,second.hanja);
    assert.ok(reading.facts.find(fact=>fact.id===`self.pillar.${key}`).value.includes(first.hanja));
    assert.ok(reading.facts.find(fact=>fact.id===`partner.pillar.${key}`).value.includes(second.hanja));
  }
});

test('same traditional pair in different positions is retained as separate calculated evidence',()=>{
  const reading=buildCompatibilityReading(chart(birthA),chart(birthB));
  const repeated=reading.interactions.filter(match=>match.kind==='stem-combination'&&match.pairHanja==='甲己');
  assert.equal(repeated.length,2);
  assert.deepEqual(repeated.map(match=>[match.selfPillarKey,match.partnerPillarKey]),[['hour','day'],['hour','hour']]);
  assert.equal(new Set(repeated.map(match=>match.id)).size,2);
  assert.ok(repeated.every(match=>reading.facts.some(fact=>fact.id===match.id)));
});

test('invalid, duplicated or unconfirmed day pillars fail instead of supplying generic compatibility',()=>{
  const valid=chart(birthA);
  assert.throws(()=>buildCompatibilityReading(null,valid),error=>error.code==='self-chart');
  assert.throws(()=>buildCompatibilityReading(valid,null),error=>error.code==='partner-chart');
  const mismatch=structuredClone(valid);mismatch.dayMaster.hanja='甲';
  assert.throws(()=>buildCompatibilityReading(valid,mismatch),error=>error.code==='partner-chart');
  const unknown=structuredClone(valid);unknown.pillars.find(pillar=>pillar.key==='day').uncertain=true;
  assert.throws(()=>buildCompatibilityReading(unknown,valid),error=>error.code==='self-chart');
  const duplicate=structuredClone(valid);duplicate.pillars.push(structuredClone(duplicate.pillars[0]));
  assert.throws(()=>buildCompatibilityReading(duplicate,valid),error=>error.code==='self-chart');
});

test('friendly stories contain concrete hypothetical examples and disclose shared interpretation without fate scores',()=>{
  for(const [first,second] of [[byStem.get('甲'),byStem.get('甲')],[byStem.get('甲'),byStem.get('丙')],[byStem.get('甲'),byStem.get('戊')],[byStem.get('戊'),byStem.get('甲')],[byBranch.get('子'),byBranch.get('午')]]) {
    const reading=buildCompatibilityReading(first,second),text=displayedText(reading);
    assert.deepEqual(reading.cards.map(card=>card.id),['foundation','connection','differences','everyday','conversation']);
    assert.ok(reading.cards.slice(0,4).every(card=>card.paragraphs.some(paragraph=>paragraph.startsWith('예를 들어'))));
    assert.equal(new Set(reading.cards.flatMap(card=>card.paragraphs)).size,reading.cards.reduce((sum,card)=>sum+card.paragraphs.length,0),'a reading does not repeat its own paragraphs');
    assert.doesNotMatch(text,/반드시|무조건|운명적으로|결혼하게|이별하게|헤어지게|[0-9]+점|[0-9]+%|최고의 궁합|최악의 궁합/);
    assert.match(reading.methodNotice,/같은 관계에는 같은 설명/);
    assert.match(reading.methodNotice,/실제 사건은 계산하지/);
    assert.equal(Object.hasOwn(reading,'score'),false);
  }
});
