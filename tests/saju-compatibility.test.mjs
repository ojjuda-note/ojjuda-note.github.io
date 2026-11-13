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
const zodiacCard=reading=>reading.cards.find(card=>card.id==='zodiac');
const yearMatches=reading=>reading.interactions.filter(match=>match.selfPillarKey==='year'&&match.partnerPillarKey==='year'&&match.position==='branch');
const byYearBranch=new Map(Array.from({length:12},(_,offset)=>{
  const value=chart({year:1996+offset,month:6,day:15,hour:12,minute:0});
  return [value.pillars.find(pillar=>pillar.key==='year').branch.hanja,value];
}));

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
  assert.notEqual(reading.score.total,100,'identical input does not imply perfect compatibility');
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

test('friendly stories retain concrete examples while the separate reference score discloses its limits',()=>{
  for(const [first,second] of [[byStem.get('甲'),byStem.get('甲')],[byStem.get('甲'),byStem.get('丙')],[byStem.get('甲'),byStem.get('戊')],[byStem.get('戊'),byStem.get('甲')],[byBranch.get('子'),byBranch.get('午')]]) {
    const reading=buildCompatibilityReading(first,second),text=displayedText(reading);
    assert.deepEqual(reading.cards.map(card=>card.id),['foundation','zodiac','connection','differences','everyday','conversation']);
    assert.ok(reading.cards.slice(0,4).every(card=>card.paragraphs.some(paragraph=>paragraph.startsWith('예를 들어'))));
    assert.equal(new Set(reading.cards.flatMap(card=>card.paragraphs)).size,reading.cards.reduce((sum,card)=>sum+card.paragraphs.length,0),'a reading does not repeat its own paragraphs');
    assert.doesNotMatch(text,/반드시|무조건|운명적으로|결혼하게|이별하게|헤어지게|[0-9]+점|[0-9]+%|최고의 궁합|최악의 궁합/);
    assert.match(reading.methodNotice,/같은 관계에는 같은 설명/);
    assert.match(reading.methodNotice,/실제 사건은 계산하지/);
    assert.equal(reading.score.max,100);
    assert.match(reading.score.methodNotice,/오쭈다 고정 규칙으로 비교한 참고 점수/);
    assert.match(reading.score.methodNotice,/성공 확률이나 미래 예측은 아니/);
  }
});

test('the zodiac card uses all twelve actual year branches and only their six combinations and six clashes',()=>{
  assert.equal(byYearBranch.size,12);
  for(const [kind,pairs] of [
    ['combination',['子丑','寅亥','卯戌','辰酉','巳申','午未']],
    ['clash',['子午','丑未','寅申','卯酉','辰戌','巳亥']],
  ])for(const pair of pairs) {
    const first=byYearBranch.get(pair[0]),second=byYearBranch.get(pair[1]);
    const reading=buildCompatibilityReading(first,second),reverse=buildCompatibilityReading(second,first);
    assert.equal(reading.zodiacRelation,kind,pair);
    assert.equal(reverse.zodiacRelation,kind,pair+' reversed');
    assert.deepEqual(reading.zodiac.self,reverse.zodiac.partner);
    assert.deepEqual(reading.zodiac.partner,reverse.zodiac.self);
    assert.equal(reading.zodiac.self.animal,first.pillars.find(pillar=>pillar.key==='year').branch.animal);
    assert.equal(reading.zodiac.partner.animal,second.pillars.find(pillar=>pillar.key==='year').branch.animal);
    assert.deepEqual(yearMatches(reading).map(match=>match.pairHanja),[pair]);
    const card=zodiacCard(reading),text=card.paragraphs.join('\n');
    assert.equal(card.label,'두 사람의 띠');
    assert.ok(text.includes(reading.zodiac.self.label));
    assert.ok(text.includes(reading.zodiac.partner.label));
    assert.ok(card.paragraphs.some(paragraph=>paragraph.startsWith('예를 들어')));
    assert.ok(['self.pillar.year','partner.pillar.year','self.zodiac','partner.zodiac','zodiac.comparison'].every(id=>card.factIds.includes(id)));
    assert.deepEqual(card.factIds.filter(id=>id.startsWith('interaction.')),yearMatches(reading).map(match=>match.id));
    const facts=new Map(reading.facts.map(fact=>[fact.id,fact]));
    for(const id of card.factIds)assert.ok(facts.has(id),id);
    assert.match(facts.get('self.zodiac').value,/입춘 기준/);
    assert.match(facts.get('zodiac.comparison').value,new RegExp(pair));
    assert.doesNotMatch(text,/천생연분|최고의 궁합|최악의 궁합|결혼하게|이별하게|헤어지게|[0-9]+점|[0-9]+%/);
  }
});

test('same or otherwise unpaired zodiacs do not inherit a combination or clash from other pillar positions',()=>{
  const rat=byYearBranch.get('子');
  const same=buildCompatibilityReading(rat,chart({year:2008,month:9,day:18,hour:8,minute:0}));
  assert.equal(same.zodiacRelation,'same');
  assert.match(zodiacCard(same).paragraphs[0],/같은 쥐띠/);
  assert.equal(yearMatches(same).length,0);
  const unpaired=buildCompatibilityReading(rat,byYearBranch.get('寅'));
  assert.equal(unpaired.zodiacRelation,'none');
  assert.ok(unpaired.interactions.length>0,'other parts of the actual charts still have their own relationships');
  assert.equal(yearMatches(unpaired).length,0);
  assert.deepEqual(zodiacCard(unpaired).factIds.filter(id=>id.startsWith('interaction.')),[]);
  assert.match(zodiacCard(unpaired).paragraphs[0],/직접 연결되는 짝에 해당하지 않아요/);
  assert.doesNotMatch(zodiacCard(unpaired).title,/나쁜|최악|흉|불리|좋지 않/);
});

test('Ipchun uncertainty is shown as both zodiac candidates and never selected to invent a year pairing',()=>{
  const confirmed=chart(birthA);
  for(const input of [
    {year:2024,month:2,day:4,hour:null},
    {year:2024,month:2,day:4,hour:17,minute:27},
  ]) {
    const uncertain=chart(input),reading=buildCompatibilityReading(confirmed,uncertain);
    assert.equal(reading.zodiac.self.label,'말띠');
    assert.equal(reading.zodiac.partner.status,'uncertain');
    assert.equal(reading.zodiac.partner.animal,null);
    assert.deepEqual(reading.zodiac.partner.candidates.map(value=>value.label),['토끼띠','용띠']);
    assert.equal(reading.zodiacRelation,'unconfirmed');
    assert.deepEqual(yearMatches(reading),[]);
    const card=zodiacCard(reading),text=card.paragraphs.join('\n');
    assert.match(text,/상대 띠 후보: 토끼띠 \/ 용띠/);
    assert.match(text,/육합·충은 확정하지 않았어요/);
    assert.ok(card.factIds.includes('partner.excluded.year'));
    assert.ok(!card.factIds.includes('partner.pillar.year'));
    assert.ok(!card.factIds.some(id=>id.startsWith('interaction.')));
    const facts=new Map(reading.facts.map(fact=>[fact.id,fact]));
    for(const id of card.factIds)assert.ok(facts.has(id),id);
    assert.match(facts.get('partner.zodiac').value,/후보 토끼띠 \/ 용띠/);
    assert.match(facts.get('zodiac.comparison').value,/비교를 보류함/);
    const reversed=buildCompatibilityReading(uncertain,confirmed);
    assert.equal(reversed.zodiacRelation,'unconfirmed');
    assert.deepEqual(reversed.zodiac.self,reading.zodiac.partner);
  }
});

test('confirmed zodiacs follow actual Ipchun boundaries rather than the civil or lunar year number',()=>{
  const before=chart({year:2024,month:2,day:4,hour:17,minute:26});
  const after=chart({year:2024,month:2,day:4,hour:17,minute:28});
  const reading=buildCompatibilityReading(before,after);
  assert.equal(reading.zodiac.self.label,'토끼띠');
  assert.equal(reading.zodiac.partner.label,'용띠');
  assert.equal(reading.zodiacRelation,'none');
  assert.ok(zodiacCard(reading).factIds.includes('self.pillar.year'));
  assert.ok(zodiacCard(reading).factIds.includes('partner.pillar.year'));
  const january=chart({year:1990,month:1,day:1,hour:12,minute:0});
  const januaryReading=buildCompatibilityReading(january,chart(birthA));
  assert.equal(januaryReading.zodiac.self.label,'뱀띠');
  assert.equal(januaryReading.zodiac.partner.label,'말띠');
  const lunar=chart({...after.lunar,calendar:'lunar',hour:17,minute:28});
  assert.deepEqual(buildCompatibilityReading(before,lunar).zodiac,reading.zodiac);
});

test('an unavailable year displays a missing zodiac without changing the confirmed day comparison',()=>{
  const missing=structuredClone(chart(birthA));
  missing.pillars=missing.pillars.filter(pillar=>pillar.key!=='year');
  const reading=buildCompatibilityReading(missing,chart(birthB));
  assert.equal(reading.zodiac.self.status,'unavailable');
  assert.equal(reading.zodiac.self.label,'띠 확인 필요');
  assert.equal(reading.zodiacRelation,'unconfirmed');
  assert.ok(zodiacCard(reading).factIds.includes('self.excluded.year'));
  assert.ok(reading.comparisons.some(comparison=>comparison.id==='comparison.day.day'));
  const facts=new Set(reading.facts.map(fact=>fact.id));
  for(const card of reading.cards)for(const id of card.factIds)assert.ok(facts.has(id),id);
});
