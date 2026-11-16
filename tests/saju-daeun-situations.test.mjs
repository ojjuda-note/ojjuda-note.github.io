import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSaju} from '../games/starlit-saju/engine.mjs';
import {analyzeDaeun} from '../games/starlit-saju/daeun.mjs';
import {makeProfile,getTenGod} from '../games/starlit-saju/fortune-data.mjs';
import {buildDaeunReading,copyDaeunReading} from '../games/starlit-saju/daeun-reading.mjs';

const now=new Date('2026-11-13T00:00:00Z');
const births=[
  {year:1990,month:5,day:17,hour:8,minute:37},
  {year:1988,month:11,day:2,hour:15,minute:20},
  {year:2005,month:12,day:23,hour:8,minute:37},
];
function build(birth=births[0],gender='female') {
  const chart=calculateSaju(birth,{now}),calculated=analyzeDaeun(chart,{gender,now});
  return {chart,calculated,reading:buildDaeunReading(chart,calculated)};
}

test('every real decade gains distinct document and people situations with its complete evidence',()=>{
  const {chart,calculated,reading}=build();
  const before=structuredClone(calculated),profile=makeProfile(chart);
  const registry=new Map(reading.facts.map(item=>[item.id,item]));
  for(const [index,period] of reading.periods.entries()) {
    const original=calculated.periods[index];
    const actual=[...new Set([getTenGod(profile.dayMaster,original.stem).code,getTenGod(profile.dayMaster,original.branchMainStem).code])];
    assert.equal(period.situations.length,2);
    assert.deepEqual(period.situations.map(item=>item.label),['문서·계약과 중요한 약속','도움이 될 사람과 거리를 둘 행동']);
    assert.equal(period.startsAt,original.startsAt);
    assert.equal(period.endsAt,original.endsAt);
    const ownFacts=new Set(period.facts.map(item=>item.id));
    for(const situation of period.situations) {
      assert.equal(situation.origin,'service-reference');
      assert.deepEqual(situation.godCodes,actual);
      assert.ok(actual.includes(situation.primaryGodCode));
      assert.ok(situation.natalGodCodes.every(code=>profile.gods.some(item=>item.god.code===code)));
      assert.ok(situation.paragraphs.length>=6);
      assert.equal(new Set(situation.paragraphs).size,situation.paragraphs.length,'no repeated padding within a situation');
      assert.ok(situation.paragraphs.every(paragraph=>paragraph.length>35));
      assert.ok(situation.factIds.length>5);
      for(const id of situation.factIds){assert.ok(registry.has(id));assert.ok(ownFacts.has(id));}
      assert.equal(Object.hasOwn(situation,'eventDate'),false);
      assert.equal(Object.hasOwn(situation,'score'),false);
      assert.doesNotMatch(situation.paragraphs.join('\n'),/대운이란|사주란|[0-9]+%|반드시 만날|계약이 성사됩니다|사고가 일어납니다/);
    }
    assert.notEqual(period.situations[0].title,period.situations[1].title);
    assert.notDeepEqual(period.situations[0].paragraphs,period.situations[1].paragraphs);
  }
  assert.deepEqual(calculated,before);
  assert.deepEqual(reading,buildDaeunReading(chart,calculated),'identical facts produce identical, auditable guidance');
});

test('actual birth charts reach all twenty situation rules and all four computed interaction cases',()=>{
  const codes={documents:new Set(),people:new Set()},titles={documents:new Set(),people:new Set()},patterns=new Set();
  for(const birth of births)for(const gender of ['male','female']) {
    const {reading,calculated}=build(birth,gender);
    for(const [index,period] of reading.periods.entries()) {
      const relationships=calculated.periods[index].interactions;
      const combination=relationships.some(item=>item.kind!=='branch-clash'),clash=relationships.some(item=>item.kind==='branch-clash');
      const expected=combination?(clash?'mixed':'combination'):(clash?'clash':'ordinary');
      for(const situation of period.situations) {
        const domain=situation.id.endsWith('.documents')?'documents':'people';
        codes[domain].add(situation.primaryGodCode);titles[domain].add(situation.title);patterns.add(situation.interactionKind);
        assert.equal(situation.interactionKind,expected);
        assert.ok(situation.ruleIds.every(id=>situation.godCodes.some(code=>id===`daeun-situation.${domain}.${code}`)));
      }
    }
  }
  for(const domain of ['documents','people']) {
    assert.equal(codes[domain].size,10);
    assert.equal(titles[domain].size,10,'different actual relationships have meaningful situation-specific conclusions');
  }
  assert.deepEqual([...patterns].sort(),['clash','combination','mixed','ordinary']);
});

test('the comparison with the previous decade cites both actual periods instead of inventing an event',()=>{
  const {reading,calculated}=build();
  assert.equal(reading.periods[0].paragraphs.some(text=>text.startsWith('앞 구간')),false);
  for(let index=1;index<reading.periods.length;index++) {
    const period=reading.periods[index],previous=calculated.periods[index-1];
    assert.ok(period.paragraphs.some(text=>text.startsWith('앞 구간')));
    for(const id of previous.factIds)assert.ok(period.factIds.includes(id));
    for(const position of ['stem','branch']) {
      const id=`daeun.reading.period.${previous.index}.god.${position}`;
      assert.ok(period.factIds.includes(id));
      assert.ok(period.facts.some(item=>item.id===id));
    }
  }
});

test('the full copy includes every new situation while keeping its source facts internal and missing periods uninvented',()=>{
  for(const {reading} of [build(),build({...births[0],hour:null},'female')]) {
    const copy=copyDaeunReading(reading);
    assert.equal(reading.available,true);
    if(reading.timeAssumed)assert.ok(copy.includes(reading.birthTimeNotice));
    for(const period of reading.periods)for(const situation of period.situations) {
      assert.ok(copy.includes(situation.label));assert.ok(copy.includes(situation.title));
      for(const paragraph of situation.paragraphs)assert.ok(copy.includes(paragraph));
      for(const id of situation.factIds) {
        const entry=reading.facts.find(item=>item.id===id);
        assert.ok(entry,'the situation remains linked to its actual source');
        assert.ok(!copy.includes(entry.label+': '+entry.value));
      }
    }
  }
  for(const [birth,gender] of [[{...births[0],hour:null},null],[births[0],null],[{year:2024,month:2,day:4,hour:17,minute:27},'female']]) {
    const unavailable=build(birth,gender).reading;
    assert.equal(unavailable.available,false);
    assert.deepEqual(unavailable.periods,[]);
    assert.doesNotMatch(copyDaeunReading(unavailable),/문서·계약과 중요한 약속|도움이 될 사람과 거리를 둘 행동/);
  }
});
