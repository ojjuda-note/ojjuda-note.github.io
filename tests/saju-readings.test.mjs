import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaju } from '../games/starlit-saju/engine.mjs';
import { analyzeFortune } from '../games/starlit-saju/fortune-data.mjs';
import { buildDetailedReading } from '../games/starlit-saju/readings.mjs';
import * as referenceText from '../games/starlit-saju/readings-data.mjs';
import { getReadingSources } from '../games/starlit-saju/sources.mjs';
import { GOD_CONTEXTS, PAIR_CONTEXTS, TOPIC_CONTEXTS } from '../games/starlit-saju/deeper-reading-data.mjs';

const now = new Date('2026-11-13T00:00:00Z');
const sample = { year: 2005, month: 12, day: 23, hour: 8, minute: 37 };
function reading(input = sample, year = 2026) {
  const chart = calculateSaju(input, { now });
  const fortune = analyzeFortune(chart, { year, now });
  return { chart, fortune, report: buildDetailedReading(chart, fortune) };
}
const chaptersOf = report => [
  ...report.sections.flatMap(section => section.chapters),
  ...report.months.flatMap(month => month.chapters),
];
const lifelong = report => report.sections.find(section => section.id === 'lifelong');

// Completeness against the source engine is independently checked in
// saju-evidence.test.mjs. These tests cover explanatory provenance and scope;
// neither text length nor distinct prose is treated as proof of personal truth.
test('every interpretation and service reference links to facts actually printed in its chapter', () => {
  const { report } = reading();
  const facts = new Map(report.facts.map(value => [value.id, value]));
  assert.equal(facts.size, report.facts.length);
  for (const chapter of chaptersOf(report)) {
    assert.equal(new Set(chapter.factIds).size, chapter.factIds.length);
    assert.deepEqual(chapter.calculation, chapter.factIds.map(id => facts.get(id).text));
    assert.deepEqual(chapter.interpretation, chapter.rules.map(value => value.text));
    assert.deepEqual(chapter.paragraphs, [...chapter.calculation, ...chapter.interpretation]);
    for (const value of [...chapter.rules, ...chapter.referenceRules]) {
      assert.ok(value.factIds.length > 0, value.id);
      for (const id of value.factIds) {
        assert.ok(chapter.factIds.includes(id), `${value.id}: ${id}`);
        assert.ok(chapter.calculation.includes(facts.get(id).text), `${value.id}: fact not printed`);
      }
    }
    for (const value of chapter.referenceRules) {
      assert.equal(value.origin, 'service-reference');
      assert.ok(chapter.reference.includes(value.text));
      assert.ok(!chapter.interpretation.includes(value.text));
    }
  }
});

test('common definitions, suggestions and authored combinations stay in labelled reference areas', () => {
  const { fortune, report } = reading();
  assert.equal(referenceText.MONTH_STORIES, undefined);
  const chapters = chaptersOf(report);
  const body = chapters.flatMap(chapter => chapter.paragraphs);
  const definitions = [
    ...Object.values(referenceText.STEM_REFERENCE).map(value => value.description),
    ...Object.values(referenceText.GROUP_REFERENCE).map(value => value.definition),
    ...Object.values(referenceText.GOD_REFERENCE).map(value => value.definition),
    ...Object.values(referenceText.RELATION_REFERENCE).map(value => value.definition),
    ...Object.values(referenceText.PRACTICE_SUGGESTIONS),
  ];
  for (const value of definitions) assert.ok(!body.includes(value), value);
  const combined = lifelong(report).chapters.find(chapter => chapter.id === 'learning-inner');
  const active = referenceText.GROUP_PAIR_RULES.filter(value =>
    fortune.profile.gods.some(entry => entry.god.group === value.left)
    && fortune.profile.gods.some(entry => entry.god.group === value.right));
  assert.deepEqual(combined.referenceRules.map(value => value.id), active.map(value => `natal.pair.${value.id}`));
  assert.ok(combined.rules.every(value => !value.id.startsWith('natal.pair.')));
  for (const value of active) {
    const applied = combined.referenceRules.find(item => item.id === `natal.pair.${value.id}`);
    assert.match(applied.text, /서비스 작성 참고 설명/);
    assert.ok(applied.text.includes(value.reading));
    assert.ok(!combined.interpretation.some(text => text.includes(value.reading)));
  }
  assert.match(report.method.reuseNotice, /같은 글자와 관계가 나오면 같은 설명을 써요/);
  assert.match(report.method.reuseNotice, /오쭈다가 작성했어요.*같은 특징이 나온 풀이에 함께 쓰는 참고 설명/);
});

test('same day master in another season changes actual evidence and the applicable relation rule', () => {
  const winter = reading({year:1990,month:1,day:1,hour:9,minute:0});
  const spring = reading({year:1990,month:3,day:2,hour:9,minute:0});
  assert.equal(winter.chart.dayMaster.hanja, spring.chart.dayMaster.hanja);
  assert.equal(winter.fortune.profile.season.key, 'winter');
  assert.equal(spring.fortune.profile.season.key, 'spring');
  const first = lifelong(winter.report).chapters.find(chapter => chapter.id === 'day-season');
  const second = lifelong(spring.report).chapters.find(chapter => chapter.id === 'day-season');
  assert.match(first.calculation.join(' '), /겨울/);
  assert.match(second.calculation.join(' '), /봄/);
  assert.notEqual(first.rules[0].id, second.rules[0].id);
  assert.notDeepEqual(first.rules[0].factIds, second.rules[0].factIds);
  assert.equal(first.reference[0], second.reference[0], 'shared day-stem definition stays visibly common');
});

test('unknown pillars retain every candidate and never gain fabricated characters, gods or reference classifications', () => {
  const { chart, fortune, report } = reading({year:2024,month:2,day:4,hour:null});
  assert.equal(fortune.profile.knownCharacterCount, 2);
  const facts = new Map(report.facts.map(value => [value.id, value]));
  for (const pillar of chart.pillars.filter(value => value.uncertain)) {
    const fact = facts.get(`natal.pillar.${pillar.key}`);
    assert.match(fact.text, /미확정/);
    for (const alternative of pillar.alternatives || []) assert.ok(fact.text.includes(alternative.hanja));
    assert.ok(!report.facts.some(value => value.id.startsWith(`natal.character.${pillar.key}.`)));
    assert.ok(!report.facts.some(value => value.id.startsWith(`natal.god.${pillar.key}.`)));
    assert.ok(!report.facts.some(value => value.id.startsWith(`natal.reference.${pillar.key}.`)));
  }
  const season = lifelong(report).chapters.find(chapter => chapter.id === 'day-season');
  assert.equal(season.rules[0].id, 'natal.season-unavailable');
  assert.doesNotMatch(season.interpretation.join(' '), /봄|여름|가을|겨울/);
  assert.match(report.intro, /확정된 2글자/);
  assert.match(lifelong(report).chapters[0].summary, /2글자/);
  assert.match(season.easyParagraphs.join(' '), /계절.*(?:정하지|정할 수 없|확인할 수 없)/);

  // A known hour can still leave year/month unresolved when the supplied
  // minute straddles a solar term. Do not call that an unknown birth time.
  const timed = reading({year:2024,month:2,day:4,hour:17,minute:27});
  assert.equal(timed.chart.timeKnown, true);
  assert.equal(timed.fortune.profile.knownCharacterCount, 4);
  const timedChapters = lifelong(timed.report).chapters;
  const timedPicture = timedChapters.find(chapter => chapter.id === 'natal-picture');
  const timedSeason = timedChapters.find(chapter => chapter.id === 'day-season');
  assert.match(timedPicture.summary, /4글자/);
  assert.doesNotMatch(timedPicture.easyParagraphs.join(' '), /모르는 시간|시간을 (?:몰라|모르)/);
  assert.match(timedSeason.easyParagraphs.join(' '), /계절.*(?:정하지|정할 수 없|확인할 수 없)/);
});

test('category copies and advertised scope include only their selected periods and no birth date', () => {
  const first = reading(sample,2026), next = reading(sample,2027);
  assert.deepEqual(lifelong(first.report), lifelong(next.report));
  assert.deepEqual(first.report.adviceByCategory.lifelong, next.report.adviceByCategory.lifelong);
  assert.equal(first.report.copyByCategory.lifelong, next.report.copyByCategory.lifelong);
  assert.doesNotMatch(first.report.methodByCategory.lifelong.calculated.join(' '), /세운|절기월/);
  assert.ok(next.report.methodByCategory.annual.calculated.some(text => text.includes('2027년') && text.includes('세운')));
  assert.doesNotMatch(next.report.methodByCategory.annual.calculated.join(' '), /절기월/);
  assert.ok(next.report.methodByCategory.monthly.calculated.some(text => text.includes('2027년 12개월') && text.includes('월운')));
  assert.doesNotMatch(next.report.methodByCategory.monthly.calculated.join(' '), /세운/);
  assert.doesNotMatch(next.report.copyByCategory.lifelong, /2027년/);
  assert.doesNotMatch(next.report.copyByCategory.annual, /2027년 [1-9][0-2]?월 월운/);
  assert.ok(next.report.copyByCategory.monthly.includes(next.fortune.months[0].start.label));
  for (const text of Object.values(first.report.copyByCategory)) {
    assert.ok(!text.includes(first.chart.solar.iso));
    assert.doesNotMatch(text, /2005년 12월 23일|08:37|8시 37분/);
    assert.doesNotMatch(text, /\[공통 참고 설명\]/);
    assert.doesNotMatch(text, /\[적용한 전통 해석 규칙\]/);
  }
});

test('all twelve months keep grounded service suggestions, including repeated symbols late in the year', () => {
  const inputs=[sample,{year:2015,month:12,day:9,hour:11,minute:37},{year:2024,month:2,day:4,hour:null}];
  const observedCodes=new Set();
  let sawNoPair=false,sawBothKinds=false,sawSameGod=false;
  for(const input of inputs){
    const {fortune,report}=reading(input);
    const facts=new Map(report.facts.map(value=>[value.id,value]));
    const nativeCodes=[...new Set(fortune.profile.gods.map(value=>value.god.code))];
    const natalCards=report.adviceByCategory.lifelong;
    assert.deepEqual(natalCards.filter(value=>value.id.includes('.god.')).map(value=>value.id.split('.').at(-1)),nativeCodes,
      'natal suggestions must cover every observed principal ten-god without substituting another name');
    const contexts=[
      {prefix:'natal',topic:'lifelong',source:fortune.profile,cards:natalCards},
      {prefix:'annual',topic:'annual',source:fortune.annual,cards:report.adviceByCategory.annual},
      ...report.months.map(month=>({prefix:`month.${month.month}`,topic:'monthly',source:fortune.months.find(value=>value.month===month.month),cards:month.advice})),
    ];
    for(const context of contexts){
      const {prefix,topic,source,cards}=context;
      const evidence=new Set(report.evidence[topic].groups.flatMap(value=>value.rows.map(row=>row.factId)));
      assert.equal(new Set(cards.map(value=>value.id)).size,cards.length,'the same suggestion must not be duplicated inside one period');
      if(prefix!=='natal'){
        const codes=[...new Set([source.stemGod.code,source.branchGod.code])];
        assert.deepEqual(cards.filter(value=>value.id.includes('.god.')).map(value=>value.id.split('.').at(-1)),codes,
          'period suggestions must follow its two actual computed ten-gods');
        assert.ok(cards.length>=2&&cards.length<=4,`${prefix} lost its practical suggestions`);
        for(const code of codes)observedCodes.add(code);
        if(codes.length===1)sawSameGod=true;
        for(const position of ['stem','branch']){
          const card=cards.find(value=>value.id===`${prefix}.advice.god.${source[position+'God'].code}`);
          assert.ok(card.factIds.includes(`${prefix}.god.${position}`),'both positions remain linked when they share one god');
        }
      }
      const connections=source.interactions.filter(value=>value.kind!=='branch-clash');
      const clashes=source.interactions.filter(value=>value.kind==='branch-clash');
      if(!source.interactions.length){
        sawNoPair=true;
        const card=cards.find(value=>value.id===`${prefix}.advice.no-pair`);
        assert.ok(card?.factIds.includes(`${prefix}.interaction-count`));
      }
      if(connections.length&&clashes.length)sawBothKinds=true;
      assert.equal(cards.some(value=>value.id===`${prefix}.advice.connect`),connections.length>0);
      assert.equal(cards.some(value=>value.id===`${prefix}.advice.clash`),clashes.length>0);
      source.interactions.forEach((value,index)=>{
        const card=cards.find(item=>item.id===`${prefix}.advice.${value.kind==='branch-clash'?'clash':'connect'}`);
        assert.ok(card.factIds.includes(`${prefix}.interaction.${index}`),'grouped advice must retain every actual pair as a reason');
      });
      for(const card of cards){
        assert.equal(card.origin,'service-advice');
        for(const field of ['title','why','action','caution']){
          assert.ok(typeof card[field]==='string'&&card[field].trim(),`${card.id}: missing ${field}`);
          assert.equal(report.copyByCategory[topic].includes(card[field]),field!=='why',`${card.id}: copy visibility differs for ${field}`);
        }
        assert.ok(card.factIds.length>0,'a suggestion needs an observed condition');
        for(const id of card.factIds){
          assert.ok(facts.has(id)&&evidence.has(id),`${card.id}: invalid or out-of-product reason ${id}`);
          assert.ok(id.startsWith('natal.')||id.startsWith(prefix+'.'),`${card.id}: borrowed another period's reason ${id}`);
        }
        assert.ok(!report.facts.some(value=>value.text.includes(card.action)),'service suggestions are not calculated data');
        assert.ok(!chaptersOf(report).some(chapter=>chapter.interpretation.includes(card.action)),
          'service suggestions must stay distinct from traditional interpretation');
      }
    }
    assert.match(report.adviceNotice,/오쭈다가 쓴 생활 제안/);
    assert.match(report.method.reuseNotice,/같은 글자와 관계가 나오면 같은 설명을 써요/);
    assert.ok(report.months.at(-1).advice.length>=2,'December must not lose suggestions through a shared annual deduplication set');
  }
  assert.equal(observedCodes.size,10,'fixtures exercise all ten actual relationship types');
  assert.ok(sawNoPair&&sawBothKinds&&sawSameGod,'fixtures need absent, mixed and repeated relationships');
});

test('source records remain available internally but are not appended to purchased reading copies', () => {
  for(const year of [2026,2027]){
    const {report}=reading(sample,year);
    for(const topic of ['lifelong','annual','monthly']){
      for(const source of getReadingSources(topic,year)){
        for(const field of ['title','publisher','usedFor','limitation','url']){
          assert.ok(source[field],`${topic}: missing internal source ${source.id}/${field}`);
          assert.ok(!report.copyByCategory[topic].includes(source[field]),`${topic}: exposed source ${source.id}/${field}`);
        }
      }
    }
  }
});

test('every purchased topic copies its visible personal explanation while keeping the old source appendix internal', () => {
  const { report } = reading();
  assert.ok(report.guide?.title);
  assert.ok(report.guide.paragraphs.every(text => typeof text === 'string' && text.trim()));
  assert.ok(report.guide.paragraphs.length > 0, 'the reader needs an introduction to the symbols');
  assert.ok(Array.isArray(report.glossary) && report.glossary.length > 0);
  for (const entry of report.glossary) {
    assert.ok(entry.term && entry.meaning, 'a term needs a usable explanation');
    assert.notEqual(entry.meaning, entry.term, 'repeating a term is not an explanation');
  }
  for (const term of ['원국','일간','오행','십성','재성','합','충','세운','월운','지장간','공망']) {
    assert.ok(report.glossary.some(entry => entry.term.includes(term)), `missing explanation of ${term}`);
  }
  for (const topic of ['lifelong','annual','monthly']) {
    const chapters = topic === 'monthly'
      ? report.months.flatMap(month => month.chapters)
      : report.sections.find(section => section.id === topic).chapters;
    const text = report.copyByCategory[topic];
    assert.ok(!text.includes(report.evidence[topic].title),'the user removed the evidence appendix from copies');
    for (const chapter of chapters) {
      assert.ok(chapter.title && chapter.summary, `${topic}/${chapter.id}: a heading and its key point are required`);
      assert.ok(Array.isArray(chapter.easyParagraphs) && chapter.easyParagraphs.length > 0,
        `${topic}/${chapter.id}: the easy explanation is missing`);
      for (const paragraph of chapter.easyParagraphs) {
        assert.ok(typeof paragraph === 'string' && paragraph.trim());
      }
    }
    const overviews=topic==='monthly'?report.reader.months:[report.reader[topic]];
    for(const overview of overviews)for(const item of [overview,...overview.cards]) {
      assert.ok(text.includes(item.title));
      for(const paragraph of item.paragraphs)assert.ok(text.includes(paragraph),`${topic}/${item.id||item.title}: visible prose was omitted`);
    }
  }
});

test('plain pair summaries keep the exact connection and clash counts, including months with no pairs', () => {
  const { fortune, report } = reading({year:2015,month:12,day:9,hour:11,minute:37});
  function sameCounts(chapter, pairs) {
    const clashes = pairs.filter(value => value.kind === 'branch-clash').length;
    const connections = pairs.length - clashes;
    assert.ok(chapter.summary.includes(`어울리는 조합(합) ${connections}쌍`), chapter.summary);
    assert.ok(chapter.summary.includes(`차이가 부딪히는 조합(충) ${clashes}쌍`), chapter.summary);
    const detail = chapter.easyParagraphs.join(' ');
    assert.ok(detail.includes(`합은 ${connections}쌍`), detail);
    assert.ok(detail.includes(`충은 ${clashes}쌍`), detail);
  }
  sameCounts(lifelong(report).chapters.find(chapter => chapter.id === 'natal-interactions'), fortune.profile.interactions);
  sameCounts(report.sections.find(section => section.id === 'annual').chapters.find(chapter => chapter.id === 'annual-interactions'), fortune.annual.interactions);
  assert.ok(fortune.months.some(month => month.interactions.length === 0));
  assert.ok(fortune.months.some(month => month.interactions.length >= 4));
  for (const month of fortune.months) {
    const chapter = report.months.find(value => value.month === month.month).chapters.find(value => value.id === 'month-interactions');
    sameCounts(chapter, month.interactions);
  }
});

test('all ten day masters and different years produce valid values and Korean particles', () => {
  const stems = new Set();
  // Strip parenthesized Hanja before checking adjacent Korean particles.
  const badParticles = /(?:화|토|수|무|기|계|자|묘|사|오|미|유|해)은(?=\s)|(?:화|토|수)은(?=\s)|(?:화|토|수)을(?=\s)|(?:화|토|수)과(?=\s)|(?:정재|편재|겁재)으로|(?:병화|정화|무토|기토|임수|계수)이에요|바다이라는|개이에요|(?:나무|쇠)(?:은|을|과)(?=\s)|(?:불|흙|물)(?:는|를|와)(?=\s)/;
  for (let day = 1; day <= 10; day++) {
    for (const year of [2024,2027]) {
      const { chart, report } = reading({year:1990,month:5,day,hour:9,minute:30},year);
      stems.add(chart.dayMaster.hanja);
      assert.doesNotMatch(report.copyText, /undefined|NaN|\[object Object\]/);
      assert.doesNotMatch(report.copyText.replace(/\([^()]*\)/g,''), badParticles, `${chart.dayMaster.hanja}, ${year}`);
      assert.equal(report.year,year);
      for (const month of report.months) assert.equal(month.year,year);
    }
  }
  assert.equal(stems.size,10);
});

test('natal combined themes explain only two groups actually observed and disclose authored examples', () => {
  let sawNoPair=false;
  for(const input of [sample,{year:2015,month:12,day:9,hour:11,minute:37},{year:2024,month:2,day:4,hour:null}]){
    const {fortune,report}=reading(input);
    const chapter=lifelong(report).chapters.find(value=>value.id==='natal-combined-themes');
    assert.ok(chapter,'the two-theme explanation must be a readable chapter');
    const active=referenceText.GROUP_PAIR_RULES.filter(value=>
      fortune.profile.gods.some(entry=>entry.god.group===value.left)
      &&fortune.profile.gods.some(entry=>entry.god.group===value.right));
    assert.deepEqual(chapter.referenceRules.map(value=>value.id),active.map(value=>`natal.deep-pair.${value.id}`));
    assert.deepEqual(chapter.interpretation,[],'the service-authored combination is not a traditional verdict');
    const text=chapter.easyParagraphs.join(' ');
    assert.match(chapter.reference.join(' '),/저희가 쓴 참고 풀이/);
    assert.match(chapter.reference.join(' '),/같은 조합에는 같은 설명 규칙/);
    if(!active.length)sawNoPair=true;
    for(const pair of active){
      const applied=chapter.referenceRules.find(value=>value.id===`natal.deep-pair.${pair.id}`);
      const expected=fortune.profile.gods.filter(value=>[pair.left,pair.right].includes(value.god.group));
      assert.deepEqual([...applied.factIds].sort(),expected.map(value=>`natal.god.${value.pillarKey}.${value.position}`).sort());
      for(const value of Object.values(PAIR_CONTEXTS[pair.id]))assert.ok(text.includes(value),'the actual pair keeps meaning, example and a usable question');
      for(const entry of expected)assert.ok(text.includes(entry.god.name));
      assert.equal(applied.origin,'service-reference');
    }
  }
  assert.ok(sawNoPair,'an uncertain chart must exercise the absent-condition branch');
});

test('yearly work and money and every monthly life topic follow their actual ten-gods and natal comparison', () => {
  const observedCodes=new Set();
  let sawRepeatedGod=false,sawSameNative=false,sawRelatedNative=false,sawNoNative=false,sawNoPair=false;
  const topicNames=Object.keys(TOPIC_CONTEXTS);
  for(const input of [sample,{year:2015,month:12,day:9,hour:11,minute:37},{year:2024,month:2,day:4,hour:null}]){
    const {fortune,report}=reading(input);
    const contexts=[
      {source:fortune.annual,prefix:'annual',topic:'annual',chapters:report.sections.find(value=>value.id==='annual').chapters,
        ids:{work:'annual-career-detail',money:'annual-money-detail'}},
      ...report.months.map(month=>({source:fortune.months.find(value=>value.month===month.month),prefix:`month.${month.month}`,topic:'monthly',chapters:month.chapters,
        ids:Object.fromEntries(topicNames.map(topic=>[topic,`month-${topic}-detail`]))})),
    ];
    for(const {source,prefix,topic,chapters,ids} of contexts){
      const codes=[...new Set([source.stemGod.code,source.branchGod.code])];
      if(codes.length===1)sawRepeatedGod=true;
      if(!source.interactions.length)sawNoPair=true;
      for(const [lifeTopic,id] of Object.entries(ids)){
        const chapter=chapters.find(value=>value.id===id);
        assert.ok(chapter,`${prefix} is missing its ${lifeTopic} explanation`);
        assert.deepEqual(chapter.interpretation,[],'a life application remains visibly service-authored');
        const text=chapter.easyParagraphs.join(' ');
        assert.match(chapter.reference.join(' '),/저희가 쓴 생활 풀이/);
        const explanations=chapter.referenceRules.filter(value=>codes.some(code=>value.id===`${prefix}.life-topic.${lifeTopic}.${code}`));
        assert.deepEqual(explanations.map(value=>value.id),codes.map(code=>`${prefix}.life-topic.${lifeTopic}.${code}`),
          'one explanation per observed code; repeated positions share the actual rule');
        for(const code of codes){
          observedCodes.add(code);
          const applied=explanations.find(value=>value.id===`${prefix}.life-topic.${lifeTopic}.${code}`);
          for(const position of ['stem','branch'])if(source[position+'God'].code===code)assert.ok(applied.factIds.includes(`${prefix}.god.${position}`));
          for(const value of Object.values(GOD_CONTEXTS[code][lifeTopic]))assert.ok(text.includes(value),`${prefix}/${lifeTopic}/${code} lost meaning, example or question`);
          const same=fortune.profile.gods.filter(value=>value.god.code===code);
          const god=source.stemGod.code===code?source.stemGod:source.branchGod;
          const related=fortune.profile.gods.filter(value=>value.god.group===god.group&&value.god.code!==code);
          if(same.length){
            sawSameNative=true;
            for(const entry of same)assert.ok(applied.factIds.includes(`natal.god.${entry.pillarKey}.${entry.position}`));
          }else{
            if(related.length)sawRelatedNative=true;else sawNoNative=true;
            for(const entry of fortune.profile.gods)assert.ok(applied.factIds.includes(`natal.god.${entry.pillarKey}.${entry.position}`),
              'an absence claim must be backed by the complete observed principal-god set');
          }
        }
        source.interactions.forEach((pair,index)=>{
          const type=pair.kind==='branch-clash'?'clash':'connect';
          const applied=chapter.referenceRules.find(value=>value.id===`${prefix}.life-topic.${lifeTopic}.${type}`);
          assert.ok(applied?.factIds.includes(`${prefix}.interaction.${index}`));
          assert.ok(text.includes(pair.pairHanja),'the explanation keeps the actual pair, not just its count');
        });
        for(const factId of chapter.factIds)assert.ok(factId.startsWith('natal.')||factId.startsWith(prefix+'.'),`${prefix} borrowed another period's evidence`);
        const overview=topic==='annual'?report.reader.annual:report.reader.months.find(month=>month.month===source.month);
        const visible=overview.cards.find(card=>card.id.endsWith('-'+lifeTopic));
        assert.ok(visible,'the same life topic remains in the visible reader');
        for(const paragraph of visible.paragraphs){
          assert.ok(report.copyByCategory[topic].includes(paragraph));
          assert.ok(report.copyByCategory.all.includes(paragraph),'the complete copy must keep every visible personal paragraph');
        }
      }
    }
  }
  assert.equal(observedCodes.size,10,'fixtures exercise all ten rules rather than a small selection');
  assert.ok(sawRepeatedGod&&sawSameNative&&sawRelatedNative&&sawNoNative&&sawNoPair);
});
