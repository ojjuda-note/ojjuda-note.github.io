import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaju } from '../games/starlit-saju/engine.mjs';
import { makeProfile } from '../games/starlit-saju/fortune-data.mjs';
import { buildCompatibilityReading } from '../games/starlit-saju/compatibility.mjs';
import { buildCompatibilityScore } from '../games/starlit-saju/compatibility-score.mjs';

const now=new Date('2026-11-13T00:00:00Z');
const birthA={year:1990,month:5,day:17,hour:8,minute:37};
const birthB={year:1992,month:3,day:14,hour:10,minute:20};
const chart=input=>calculateSaju(input,{now});
const item=(reading,id)=>reading.score.items.find(value=>value.id===id);
const values=reading=>reading.score.items.map(value=>value.value);
const byStem=new Map(),byBranch=new Map();
for(let offset=0;offset<60;offset++) {
  const date=new Date(Date.UTC(1990,0,1+offset));
  const value=chart({year:date.getUTCFullYear(),month:date.getUTCMonth()+1,day:date.getUTCDate(),hour:9,minute:0});
  const day=value.pillars.find(pillar=>pillar.key==='day');
  if(!byStem.has(day.stem.hanja))byStem.set(day.stem.hanja,value);
  if(!byBranch.has(day.branch.hanja))byBranch.set(day.branch.hanja,value);
}

test('the public score has four bounded integer categories, an equal-weight total and linked evidence',()=>{
  const reading=buildCompatibilityReading(chart(birthA),chart(birthB)),score=reading.score;
  assert.equal(score.version,1);assert.equal(score.max,100);
  assert.deepEqual(score.items.map(({id,label})=>[id,label]),[
    ['temperament','기본 성향'],['complement','서로의 보완'],['daily','일상 호흡'],['harmony','관계 조화'],
  ]);
  assert.deepEqual(score.coverage,{self:8,partner:8,partial:false});
  for(const value of [score.total,...score.items.map(item=>item.value)]){
    assert.ok(Number.isInteger(value));assert.ok(value>=0&&value<=100);
  }
  assert.equal(score.total,Math.round(values(reading).reduce((sum,value)=>sum+value,0)/4));
  assert.match(score.methodNotice,/오쭈다 고정 규칙으로 비교한 참고 점수/);
  assert.match(score.methodNotice,/성공 확률이나 미래 예측은 아니/);
  const facts=new Map(reading.facts.map(fact=>[fact.id,fact]));
  assert.equal(facts.size,reading.facts.length);
  for(const value of score.items){
    assert.ok(value.summary.length>10);assert.ok(value.reason.length>10);
    assert.ok(value.factIds.includes(`score.${value.id}`));
    for(const id of value.factIds)assert.ok(facts.has(id),id);
    assert.equal(facts.get(`score.${value.id}`).origin,'service-reference');
  }
  assert.equal(facts.get('self.elements').origin,'calculation');
  assert.equal(facts.get('partner.elements').origin,'calculation');
  assert.equal(facts.get('score.overall').origin,'service-reference');
});

test('a fixed real birth pair has reproducible points and every count behind the harmony score is exposed',()=>{
  const first=chart(birthA),second=chart(birthB),before=[structuredClone(first),structuredClone(second)];
  const reading=buildCompatibilityReading(first,second);
  // Day masters water/earth: 60; reciprocal normalized complement 2/3: 83;
  // day branches have no direct combination/clash: 65; 2 stem + 1 branch
  // combinations in 16 pillar pairs: round(50 + 70/16) = 54; mean = 66.
  assert.deepEqual(values(reading),[60,83,65,54]);assert.equal(reading.score.total,66);
  assert.match(item(reading,'harmony').reason,/16쌍.*천간합 2쌍, 육합 1쌍, 충 0쌍/);
  assert.match(item(reading,'complement').reason,/66\.7%·66\.7%/);
  assert.match(item(reading,'complement').reason,/용신이나 실제로 필요한 오행을 정하는 방법은 아니/);
  assert.deepEqual(buildCompatibilityReading(first,second),reading);
  assert.deepEqual([first,second],before);
});

test('reversing the two people preserves every numeric score for all day-master combinations',()=>{
  assert.equal(byStem.size,10);
  for(const first of byStem.values())for(const second of byStem.values()) {
    const forward=buildCompatibilityReading(first,second),reverse=buildCompatibilityReading(second,first);
    assert.equal(forward.score.total,reverse.score.total);
    assert.deepEqual(values(forward),values(reverse));
    assert.deepEqual(forward.score.items.map(({id,label,summary,reason})=>({id,label,summary,reason})),
      reverse.score.items.map(({id,label,summary,reason})=>({id,label,summary,reason})));
    assert.ok(forward.score.items.every(value=>Number.isInteger(value.value)&&value.value>=0&&value.value<=100));
  }
});

test('changing names, gender, report year and non-pillar metadata cannot change a score',()=>{
  const first=chart(birthA),second=chart(birthB),before=buildCompatibilityReading(first,second).score;
  const renamedFirst=structuredClone(first),renamedSecond=structuredClone(second);
  Object.assign(renamedFirst,{name:'다른 이름',gender:'female',year:2031});
  Object.assign(renamedSecond,{name:'새 이름',gender:'male',year:2027});
  assert.deepEqual(buildCompatibilityReading(renamedFirst,renamedSecond).score,before);
});

test('unknown hours and uncertain Ipchun pillars use only confirmed coverage without an extra penalty',()=>{
  const first=chart({...birthA,hour:null}),second=chart({year:2024,month:2,day:4,hour:null});
  const reading=buildCompatibilityReading(first,second),reverse=buildCompatibilityReading(second,first);
  assert.deepEqual(reading.score.coverage,{self:6,partner:2,partial:true});
  assert.deepEqual(reverse.score.coverage,{self:2,partner:6,partial:true});
  assert.deepEqual(values(reading),[60,79,65,50]);assert.equal(reading.score.total,64);
  assert.deepEqual(values(reading),values(reverse));
  assert.equal(reading.comparisons.length,3);
  assert.match(item(reading,'harmony').reason,/확정된 기둥 3쌍/);
  const polluted=structuredClone(second);
  for(const pillar of polluted.pillars.filter(value=>value.key!=='day')){
    // Even plausible characters attached to an explicitly uncertain pillar
    // remain excluded. The engine's ambiguity must never become a guess.
    Object.assign(pillar,{...structuredClone(first.pillars.find(value=>value.key==='day')),key:pillar.key,uncertain:true});
  }
  assert.deepEqual(buildCompatibilityReading(first,polluted).score,reading.score);
  for(const entry of reading.score.items)for(const id of entry.factIds){
    assert.doesNotMatch(id,/^partner\.pillar\.(year|month|hour)$/);
  }
});

test('omitting an ordinary unknown hour changes evidence, rather than automatically subtracting points',()=>{
  const full=buildCompatibilityReading(chart(birthA),chart(birthB));
  const partial=buildCompatibilityReading(chart({...birthA,hour:null}),chart({...birthB,hour:null}));
  assert.deepEqual(partial.score.coverage,{self:6,partner:6,partial:true});
  assert.deepEqual(values(partial),[60,95,65,53]);assert.equal(partial.score.total,68);
  assert.equal(item(full,'temperament').value,item(partial,'temperament').value);
  assert.equal(item(full,'daily').value,item(partial,'daily').value);
  assert.ok(partial.score.total>full.score.total,'a smaller confirmed scope has no automatic missing-data penalty');
});

test('day-branch combination, clash, equal and unpaired scores come from the actual day branches only',()=>{
  for(const pair of ['子丑','寅亥','卯戌','辰酉','巳申','午未']){
    const reading=buildCompatibilityReading(byBranch.get(pair[0]),byBranch.get(pair[1]));
    assert.equal(item(reading,'daily').value,90,pair);
  }
  for(const pair of ['子午','丑未','寅申','卯酉','辰戌','巳亥']){
    const reading=buildCompatibilityReading(byBranch.get(pair[0]),byBranch.get(pair[1]));
    assert.equal(item(reading,'daily').value,40,pair);
  }
  assert.equal(item(buildCompatibilityReading(byBranch.get('子'),byBranch.get('子')),'daily').value,80);
  assert.equal(item(buildCompatibilityReading(byBranch.get('子'),byBranch.get('寅')),'daily').value,65);
});

test('day-master reference rules retain the distinction between same, generating, controlling and combining pairs',()=>{
  assert.equal(item(buildCompatibilityReading(byStem.get('甲'),byStem.get('乙')),'temperament').value,80);
  assert.equal(item(buildCompatibilityReading(byStem.get('甲'),byStem.get('丙')),'temperament').value,85);
  assert.equal(item(buildCompatibilityReading(byStem.get('甲'),byStem.get('戊')),'temperament').value,60);
  for(const pair of ['甲己','乙庚','丙辛','丁壬','戊癸']){
    assert.equal(item(buildCompatibilityReading(byStem.get(pair[0]),byStem.get(pair[1])),'temperament').value,70,pair);
  }
});

test('proportion normalization is invariant under repetition of identical confirmed evidence',()=>{
  const first=chart(birthA),second=chart(birthB),reading=buildCompatibilityReading(first,second);
  const profiles={self:makeProfile(first),partner:makeProfile(second)};
  const base=buildCompatibilityScore({profiles,comparisons:reading.comparisons,interactions:reading.interactions}).score;
  // This is a mathematical normalization check, not a manufactured birth chart.
  const repeated=structuredClone(profiles);
  for(const profile of Object.values(repeated)){
    profile.knownCharacterCount*=2;
    for(const element of profile.elements)element.count*=2;
  }
  const result=buildCompatibilityScore({profiles:repeated,
    comparisons:[...reading.comparisons,...reading.comparisons],
    interactions:[...reading.interactions,...reading.interactions]}).score;
  assert.deepEqual(result.items.map(value=>value.value),base.items.map(value=>value.value));
  assert.equal(result.total,base.total);
});
