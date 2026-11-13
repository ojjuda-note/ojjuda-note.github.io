import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaju } from '../games/starlit-saju/engine.mjs';
import { analyzeDaeun } from '../games/starlit-saju/daeun.mjs';
import { makeProfile, getTenGod, interactionPairs } from '../games/starlit-saju/fortune-data.mjs';
import { GOD_CONTEXTS } from '../games/starlit-saju/deeper-reading-data.mjs';
import { buildDaeunReading, copyDaeunReading } from '../games/starlit-saju/daeun-reading.mjs';

const now=new Date('2026-11-13T00:00:00Z');
const birth={year:1990,month:5,day:17,hour:8,minute:37};
function build(input=birth,gender='male',at=now) {
  const chart=calculateSaju(input,{now:at});
  const daeun=analyzeDaeun(chart,{gender,now:at});
  return {chart,daeun,reading:buildDaeunReading(chart,daeun)};
}
const visible=reading=>[
  reading.title,reading.headline,...reading.paragraphs,
  ...reading.periods.flatMap(period=>[
    period.title,period.subtitle,period.periodLabel,...period.paragraphs,
    ...period.topics.flatMap(topic=>[topic.label,topic.title,...topic.paragraphs]),
  ]),
].join('\n');

test('all actual ten-year periods receive complete personal topics without changing the chart or calculation',()=>{
  const chart=calculateSaju(birth,{now}),daeun=analyzeDaeun(chart,{gender:'male',now});
  const before=[structuredClone(chart),structuredClone(daeun)];
  const reading=buildDaeunReading(chart,daeun);
  assert.deepEqual([chart,daeun],before);
  assert.equal(reading.availability,true);
  assert.equal(reading.available,true);
  assert.equal(reading.periods.length,daeun.periods.length);
  assert.equal(reading.periods.length,9);
  assert.deepEqual(reading.method,daeun.method);
  assert.deepEqual(reading.sources,daeun.sources);
  assert.equal(reading.currentIndex,daeun.currentIndex);
  for (const [index,period] of reading.periods.entries()) {
    const computed=daeun.periods[index];
    assert.equal(period.index,computed.index);
    assert.equal(period.ageLabel,computed.ageLabel);
    assert.equal(period.startsAt,computed.startsAt);
    assert.equal(period.endsAt,computed.endsAt);
    assert.ok(period.periodLabel.includes(computed.startLabel));
    assert.ok(period.periodLabel.endsWith(computed.endLabel+' 전까지'));
    assert.equal(period.isCurrent,computed.isCurrent);
    assert.deepEqual(period.topics.map(topic=>topic.label),['재물과 돈 관리','일과 진로','관계와 연애','공부와 성장']);
    for (const topic of period.topics) {
      assert.equal(topic.origin,'service-reference');
      assert.equal(topic.paragraphs.length,8);
      assert.equal(new Set(topic.paragraphs).size,8,'a topic cannot pad itself with repeated paragraphs');
      assert.ok(topic.paragraphs.some(value=>value.startsWith('생활 속 상황을 가정해 볼게요.')));
      assert.ok(topic.paragraphs.every(value=>typeof value==='string'&&value.length>25));
      assert.ok(topic.title.length>8);
    }
  }
  assert.deepEqual(reading,buildDaeunReading(chart,daeun),'there is no random, wall-clock or external lookup in the explanation');
});

test('every selected relationship is calculated from the natal day and the actual decade pillar',()=>{
  const {chart,daeun,reading}=build();
  const profile=makeProfile(chart);
  const registry=new Map(reading.facts.map(item=>[item.id,item]));
  assert.equal(registry.size,reading.facts.length);
  for (const original of daeun.facts) assert.deepEqual(registry.get(original.id),original);
  for (const [index,period] of reading.periods.entries()) {
    const computed=daeun.periods[index];
    const codes=[...new Set([
      getTenGod(profile.dayMaster,computed.stem).code,
      getTenGod(profile.dayMaster,computed.branchMainStem).code,
    ])];
    assert.deepEqual(period.godCodes,codes);
    const ownFacts=new Set(period.facts.map(item=>item.id));
    for (const block of [period,...period.topics]) {
      assert.deepEqual(block.godCodes,codes);
      assert.ok(block.factIds.length>5);
      assert.equal(new Set(block.factIds).size,block.factIds.length);
      for (const id of block.factIds) {
        assert.ok(registry.has(id),id);
        assert.ok(ownFacts.has(id),id+' must also be accessible in the period evidence');
      }
    }
    for (const [topicIndex,topic] of period.topics.entries()) {
      const key=['money','work','relationships','learning'][topicIndex];
      assert.ok(topic.paragraphs.some(value=>value.includes(GOD_CONTEXTS[codes[0]][key].example)));
      assert.ok(topic.natalGodCodes.every(code=>profile.gods.some(item=>item.god.code===code)));
    }
  }
});

test('every confirmed natal comparison and every detected combination or clash remains available',()=>{
  const {chart,daeun,reading}=build();
  const profile=makeProfile(chart);
  for (const [index,period] of reading.periods.entries()) {
    const computed=daeun.periods[index];
    for (const pillar of profile.knownPillars) {
      const expected=interactionPairs(pillar,computed,{birthPillarKey:pillar.key});
      const entry=period.facts.find(item=>item.id==='daeun.reading.period.'+period.index+'.comparison.'+pillar.key);
      assert.ok(entry);
      assert.ok(entry.value.includes(pillar.hanja));
      assert.ok(entry.value.includes(computed.hanja));
      for (const match of expected) assert.ok(entry.value.includes(match.pairHanja));
      if (!expected.length) assert.ok(entry.value.includes('해당하는 짝 없음'));
    }
    const actual=period.facts.filter(item=>item.id.startsWith('daeun.reading.period.'+period.index+'.interaction.'));
    assert.equal(actual.length,computed.interactions.length);
    for (const [position,match] of computed.interactions.entries()) {
      assert.ok(actual[position].value.includes(match.birthCharacter.hanja));
      assert.ok(actual[position].value.includes(match.otherCharacter.hanja));
      assert.ok(actual[position].value.includes(match.pairHanja));
    }
  }
});

test('decade changes use their own rules and natal links, not one repeated lifelong report',()=>{
  const {reading}=build();
  const periods=reading.periods;
  assert.ok(new Set(periods.map(period=>period.godCodes.join('|'))).size>4);
  assert.ok(new Set(periods.map(period=>period.subtitle)).size>4);
  assert.equal(new Set(periods.map(period=>period.topics.map(topic=>topic.paragraphs[0]).join('|'))).size,1,'a different decade cannot invent a different natal personality');
  assert.ok(new Set(periods.map(period=>period.topics.map(topic=>topic.paragraphs[1]).join('|'))).size>4,'the actual decade changes the period explanation');
  assert.ok(new Set(periods.map(period=>period.topics[0].personalParagraphs.join(' '))).size>1,'the actual period is connected to the natal relationships');
  assert.ok(new Set(periods.map(period=>period.topics[0].paragraphs[4])).size>1,'the actual natal interactions affect the prose');
  for (const period of periods) {
    assert.ok(period.topics.every(topic=>topic.id.startsWith('daeun.reading.period.'+period.index+'.')));
    assert.equal(period.topics.length,4,'only the relevant period domains are added, rather than duplicating all lifelong chapters');
  }
});

test('the two traditional direction inputs receive their own actual periods and interpretations',()=>{
  const forward=build(birth,'male'),reverse=build(birth,'female');
  assert.notEqual(forward.daeun.direction,reverse.daeun.direction);
  assert.notEqual(forward.reading.periods[0].hanja,reverse.reading.periods[0].hanja);
  assert.notEqual(forward.reading.periods[0].startsAt,reverse.reading.periods[0].startsAt);
  assert.notDeepEqual(forward.reading.periods[0].godCodes,reverse.reading.periods[0].godCodes);
  assert.notDeepEqual(forward.reading.periods[0].topics,reverse.reading.periods[0].topics);
  for (const value of [forward,reverse]) {
    assert.equal(value.reading.direction,value.daeun.direction);
    assert.equal(value.reading.directionLabel,value.daeun.directionLabel);
  }
});

test('each decade connects the actual person to money, work, relationships and study in distinct everyday terms',()=>{
  for(const input of [birth,{year:1988,month:11,day:2,hour:15,minute:20}]) {
    const {chart,reading}=build(input);
    const profile=makeProfile(chart);
    for(const period of reading.periods) {
      const connections=period.topics.map(topic=>topic.personalParagraphs.join(' '));
      assert.equal(new Set(connections).size,4,'one abstract personality paragraph must not fill all four life domains');
      for(const topic of period.topics) {
        assert.doesNotMatch(topic.personalParagraphs.join(' '),/익숙한 장점을 살리면서 같은 어려움|타고난 바탕에서는/);
        assert.ok(topic.personalParagraphs.join(' ').includes('이 10년 동안'));
        assert.equal(topic.paragraphs[0],topic.personalParagraphs[0],'start with the person before the period');
        for(const paragraph of topic.personalParagraphs)assert.ok(topic.paragraphs.includes(paragraph));
        assert.ok(topic.natalGodCodes.length>0);
        for(const code of topic.natalGodCodes) {
          const positions=profile.gods.filter(entry=>entry.god.code===code);
          assert.ok(positions.length>0);
          for(const entry of positions)assert.ok(topic.factIds.includes(`daeun.reading.natal.god.${entry.pillarKey}.${entry.position}`));
        }
      }
    }
  }
});

test('missing required inputs never acquire a guessed decade, starting age or personal period story',()=>{
  for (const [input,gender] of [[{...birth,hour:null},'male'],[birth,null],[{year:2024,month:2,day:4,hour:null},'female']]) {
    const {daeun,reading}=build(input,gender);
    assert.equal(daeun.available,false);
    assert.equal(reading.availability,false);
    assert.equal(reading.reason,daeun.reason);
    assert.equal(reading.headline,daeun.message);
    assert.deepEqual(reading.periods,[]);
    assert.deepEqual(reading.paragraphs,[]);
    assert.deepEqual(reading.facts,daeun.facts);
    assert.equal(Object.hasOwn(reading,'startAge'),false);
    const copy=copyDaeunReading(reading);
    assert.ok(copy.includes(daeun.message));
    assert.ok(!copy.includes('대운 계산 근거'));
    assert.ok(!copy.includes('재물과 돈 관리'));
  }
});

test('before the first decade and after the displayed range do not invent a current period or lifespan',()=>{
  const before=build({year:2022,month:3,day:9,hour:21,minute:51});
  assert.equal(before.daeun.currentState,'before-start');
  assert.equal(before.reading.currentIndex,null);
  assert.ok(before.reading.headline.startsWith('첫 흐름'));
  assert.ok(before.reading.paragraphs.join(' ').includes(before.daeun.startLabel));
  const after=build({year:1900,month:1,day:1,hour:8,minute:0});
  assert.equal(after.daeun.currentState,'after-listed-periods');
  assert.equal(after.reading.currentIndex,null);
  assert.ok(after.reading.periods.every(period=>!period.isCurrent));
  assert.match(after.reading.headline,/이전 시기/);
  assert.doesNotMatch(visible(after.reading),/수명|죽음|사망|살 수 없|죽게|생을 마치/);
});

test('readings lead with personal results and examples while shared-rule and scope details remain separate',()=>{
  for (const gender of ['male','female']) {
    const {reading}=build(birth,gender);
    const prose=visible(reading);
    assert.doesNotMatch(prose,/사주란|사주는 태어난|대운이란|천간|지장간|십성|아래쪽 글자|위쪽 글자|본기/);
    assert.doesNotMatch(prose,/반드시|무조건|당첨|합격한다|결혼한다|헤어지게|질병이|사고가 생|사망|수명|[0-9]+점|[0-9]+%|용신|신강|신약/);
    assert.match(reading.methodNotice,/같은 관계에는 같은 해석 규칙/);
    assert.match(reading.methodNotice,/예시는 실제로 일어난 일이나 앞으로 생길 사건을 뜻하지/);
    assert.equal(Object.hasOwn(reading,'score'),false);
    assert.ok(reading.periods.every(period=>!Object.hasOwn(period,'score')));
  }
});

test('copy includes every period, full personal prose, all calculation facts, method notes and sources',()=>{
  const {reading}=build();
  const copy=copyDaeunReading(reading);
  assert.ok(copy.length>25000);
  for (const period of reading.periods) {
    assert.ok(copy.includes(period.title));
    assert.ok(copy.includes(period.periodLabel));
    for (const paragraph of period.paragraphs) assert.ok(copy.includes(paragraph));
    for (const topic of period.topics) {
      assert.ok(copy.includes(topic.label));
      assert.ok(copy.includes(topic.title));
      for (const paragraph of topic.paragraphs) assert.ok(copy.includes(paragraph));
    }
  }
  for (const item of reading.facts) assert.ok(copy.includes(item.label+': '+item.value));
  for (const note of reading.method.notes) assert.ok(copy.includes(note));
  for (const source of reading.sources) {
    assert.ok(copy.includes(source.title));
    assert.ok(copy.includes(source.publisher));
    assert.ok(copy.includes(source.url));
    assert.ok(copy.includes(source.usedFor));
    assert.ok(copy.includes(source.limitation));
  }
  assert.ok(copy.includes(reading.methodNotice));
});

test('corrupted or mismatched calculation data fails instead of filling missing facts with generic stories',()=>{
  const {chart,daeun}=build();
  const changed=work=>{const value=structuredClone(daeun);work(value);return value;};
  for (const malformed of [
    changed(value=>{value.birthAt='1990-05-18T08:37:00+09:00';}),
    changed(value=>{value.periods[0].stemGod.code='invalid';}),
    changed(value=>{value.periods[0].branchGod.code=value.periods[0].branchGod.code==='manager'?'creator':'manager';}),
    changed(value=>{value.periods[0].factIds.push('does-not-exist');}),
    changed(value=>{value.facts.push({...value.facts[0]});}),
    changed(value=>{value.periods[1].index=1;}),
    changed(value=>{value.periods[1].startsAt=value.periods[2].startsAt;}),
    changed(value=>{value.periods.find(period=>period.interactions.length).interactions.pop();}),
    changed(value=>{value.periods.forEach(period=>{period.isCurrent=true;});}),
    changed(value=>{value.available=false;value.reason='birth-time-required';value.message='시간을 입력해 주세요.';}),
  ]) assert.throws(()=>buildDaeunReading(chart,malformed),/확인된 대운 계산/);
  assert.throws(()=>buildDaeunReading(null,daeun));
  assert.throws(()=>buildDaeunReading(chart,null));
});
