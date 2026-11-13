import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaju } from '../games/starlit-saju/engine.mjs';
import { analyzeFortune } from '../games/starlit-saju/fortune-data.mjs';
import { buildDetailedReading } from '../games/starlit-saju/readings.mjs';
import { attachReaderSummary, describePersonalPeriod } from '../games/starlit-saju/reader-summary.mjs';

const now=new Date('2026-11-13T00:00:00Z');
const sample={year:1990,month:5,day:17,hour:8,minute:37};
function reading(input=sample,year=2026) {
  const chart=calculateSaju(input,{now});
  const fortune=analyzeFortune(chart,{year,now});
  const report=buildDetailedReading(chart,fortune);
  const before={facts:structuredClone(report.facts),sections:structuredClone(report.sections),months:structuredClone(report.months)};
  attachReaderSummary(report,chart,fortune);
  return {chart,fortune,report,before};
}
const overviews=report=>[report.reader.lifelong,report.reader.annual,...report.reader.months];
const prose=overview=>[overview.title,overview.headline,...overview.paragraphs,...overview.cards.flatMap(card=>[card.label,card.title,...card.paragraphs])].join('\n');
const coreTopics=['relationships','work','money','learning'];
const paragraphs=overview=>[overview.title,overview.headline,...overview.paragraphs,...overview.cards.flatMap(card=>[card.label,card.title,...card.paragraphs])];

test('the personal summary keeps every original fact and detailed reading intact and links its own sources',()=>{
  const {report,before}=reading();
  assert.deepEqual(report.facts,before.facts);
  assert.deepEqual(report.sections,before.sections);
  assert.deepEqual(report.months,before.months);
  assert.equal(report.reader.scopeNotice,'');
  const facts=new Set(report.facts.map(value=>value.id));
  for(const overview of overviews(report)) {
    assert.equal(overview.origin,'service-reference');
    assert.ok(overview.headline.length>12);
    assert.ok(overview.paragraphs.length>0&&overview.paragraphs.length<=3);
    assert.equal(new Set(overview.cards.map(card=>card.id)).size,overview.cards.length);
    for(const topic of coreTopics)assert.ok(overview.cards.some(card=>card.id.endsWith('-'+topic)),topic);
    for(const block of [overview,...overview.cards]) {
      assert.equal(block.origin,'service-reference');
      assert.ok(block.factIds.length>0);
      assert.equal(new Set(block.factIds).size,block.factIds.length);
      for(const id of block.factIds)assert.ok(facts.has(id),`summary cannot use an uncomputed fact: ${id}`);
      assert.ok(block.paragraphs.every(text=>typeof text==='string'&&text.trim()));
    }
    for(const card of overview.cards) {
      assert.ok(card.paragraphs.length>=5&&card.paragraphs.length<=7,`${card.id} should have connected short paragraphs`);
      assert.equal(new Set(card.paragraphs).size,card.paragraphs.length,`${card.id} must not pad its length with duplicate paragraphs`);
      assert.ok(typeof card.navGroup==='string'&&card.navGroup.trim());
      const example=card.paragraphs.findIndex(text=>/가령|가정해 볼게요|가상의 상황/.test(text));
      assert.ok(example>=3&&example<card.paragraphs.length-1,`${card.id}: meaning and context, then a hypothetical example, then application`);
      assert.notEqual(card.paragraphs[0],card.paragraphs.at(-1));
    }
  }
});

test('first reading answers personal patterns without raw terminology, invented outcomes or strength scores',()=>{
  const {report}=reading();
  assert.match(report.reader.lifelong.headline,/바탕으로 읽혀요/);
  assert.match(prose(report.reader.lifelong),/성향/);
  assert.match(report.reader.annual.headline,/당신, 2026년에는 .+ 일이 우선입니다/);
  assert.match(report.reader.annual.paragraphs[0],/^당신은 .+사람입니다\./);
  for(const overview of overviews(report))for(const text of paragraphs(overview)) {
    assert.doesNotMatch(text,/천간|(?<![가-힣])지지(?![가-힣])|십성|일간|원국|지장간|오행|납음|사주란|사주는|확정된 [0-9]+글자|위쪽 글자|아래쪽 글자/);
    assert.doesNotMatch(text,/반드시|무조건|당첨|합격한다|결혼한다|헤어지게|사망|수명|재물운 [0-9]+|확률|[0-9]+점|용신|신강|신약|대운/);
  }
});

test('year and month narratives use their own actual pair of relationships and point back to the correct detailed chapters',()=>{
  const {fortune,report}=reading();
  const periods=[{summary:report.reader.annual,transit:fortune.annual,prefix:'annual',chapters:report.sections.find(value=>value.id==='annual').chapters},
    ...report.reader.months.map(summary=>({summary,transit:fortune.months.find(value=>value.month===summary.month),prefix:`month.${summary.month}`,chapters:report.months.find(value=>value.month===summary.month).chapters}))];
  for(const {summary,transit,prefix,chapters} of periods) {
    const expected=[...new Set([transit.stemGod.code,transit.branchGod.code])];
    assert.deepEqual(summary.godCodes,expected);
    assert.ok(summary.factIds.includes(`${prefix}.god.stem`));
    assert.ok(summary.factIds.includes(`${prefix}.god.branch`));
    assert.ok(summary.factIds.includes(`${prefix}.period`));
    assert.ok(summary.factIds.every(id=>id.startsWith('natal.')||id.startsWith(prefix+'.')));
    for(const card of summary.cards) {
      assert.deepEqual(card.godCodes,expected);
      assert.ok(chapters.some(chapter=>chapter.id===card.chapterId),`missing detailed destination: ${card.chapterId}`);
      assert.ok(card.factIds.includes(`${prefix}.god.stem`));
      assert.ok(card.factIds.includes(`${prefix}.god.branch`));
      for(let index=0;index<transit.interactions.length;index++)assert.ok(card.factIds.includes(`${prefix}.interaction.${index}`));
      assert.ok(card.factIds.every(id=>id.startsWith('natal.')||id.startsWith(prefix+'.')));
      for(const topic of ['opportunities','cautions','response'])if(card.id.endsWith('-'+topic)) {
        assert.ok(card.situationRuleIds.includes(`situation.${topic}.${expected[0]}`),'the concrete situation follows the actual first period relationship');
        if(expected[1])assert.ok(card.situationRuleIds.includes(`condition.${topic}.${expected[1]}`),'the second period relationship adds a condition');
        assert.match(card.paragraphs[4],/^가령 .+가정해 볼게요/,'a dedicated hypothetical scene replaces the copied domain example');
      }
    }
  }
  assert.deepEqual(report.reader.months.map(value=>value.month),[1,2,3,4,5,6,7,8,9,10,11,12]);
  assert.notEqual(report.reader.months[0].headline,report.reader.months[10].headline);
  assert.notDeepEqual(report.reader.months[0].cards.map(card=>card.paragraphs),report.reader.months[10].cards.map(card=>card.paragraphs));
});

test('lifelong reading does not change with the selected forecast year',()=>{
  const first=reading(sample,2025),second=reading(sample,2027);
  assert.deepEqual(first.report.reader.lifelong,second.report.reader.lifelong);
  assert.notEqual(first.report.reader.annual.headline,second.report.reader.annual.headline);
});

test('the same day master in another season keeps its shared meaning but changes the connected personal reading',()=>{
  const winter=reading({year:1990,month:1,day:1,hour:9,minute:0});
  const spring=reading({year:1990,month:3,day:2,hour:9,minute:0});
  assert.equal(winter.chart.dayMaster.hanja,spring.chart.dayMaster.hanja);
  assert.equal(winter.report.reader.lifelong.headline,spring.report.reader.lifelong.headline,'shared symbols are not disguised as individually written predictions');
  assert.notDeepEqual(winter.report.reader.lifelong.paragraphs,spring.report.reader.lifelong.paragraphs);
  assert.notDeepEqual(winter.report.reader.annual.paragraphs,spring.report.reader.annual.paragraphs,'actual natal overlap and interactions affect the period reading');
  assert.deepEqual(winter.report.reader.annual.godCodes,spring.report.reader.annual.godCodes);
  assert.notDeepEqual(winter.report.reader.annual.cards.map(card=>card.paragraphs),spring.report.reader.annual.cards.map(card=>card.paragraphs),'the same period symbols still connect to the actual different natal profile');
});

test('every year and month domain connects observed natal habits to the actual period with complete evidence',()=>{
  const {fortune,report}=reading();
  const periods=[{overview:report.reader.annual,transit:fortune.annual,prefix:'annual',label:'이 해'},
    ...report.reader.months.map(overview=>({overview,transit:fortune.months.find(period=>period.month===overview.month),prefix:`month.${overview.month}`,label:'이번 달'}))];
  const natalCodes=new Set(fortune.profile.gods.map(entry=>entry.god.code));
  for(const {overview,transit,prefix,label} of periods)for(const domain of coreTopics) {
    const periodCodes=[...new Set([transit.stemGod.code,transit.branchGod.code])];
    const connection=describePersonalPeriod(fortune.profile,periodCodes,domain,label);
    assert.ok(connection.natalCodes.length>=1&&connection.natalCodes.length<=2);
    assert.equal(new Set(connection.natalCodes).size,connection.natalCodes.length);
    assert.ok(connection.natalCodes.every(code=>natalCodes.has(code)),'no unobserved natal relationship can describe this person');
    assert.equal(connection.paragraphs.length,4);
    assert.equal(connection.reading,connection.paragraphs.join(' '),'short paragraphs preserve the complete connected explanation');
    assert.ok(connection.paragraphs.every(text=>text.length>20&&text.length<=320),'each connected paragraph remains readable');
    assert.match(connection.paragraphs[0],/^당신은 .+사람입니다\./);
    assert.ok(connection.paragraphs[1].startsWith(label+'에는 '));
    assert.match(connection.paragraphs[1],/세요\.$/);
    assert.match(connection.paragraphs[2],/이 성향을 살릴 장면은 .+입니다\..+장점입니다\. 다만 .+\./);
    assert.doesNotMatch(connection.reading,/타고난 바탕|흐름으로 읽|중심으로 읽혀요|반드시|무조건|보장|합격한다|수익이 생깁니다|사고가 납니다/);
    const card=overview.cards.find(value=>value.id.endsWith('-'+domain));
    assert.deepEqual(card.natalGodCodes,connection.natalCodes);
    assert.equal(card.paragraphs[0],connection.paragraphs[0]);
    assert.ok(card.paragraphs[2].includes(connection.paragraphs[1]));
    assert.equal(card.paragraphs[3],connection.paragraphs[2]);
    assert.equal(card.paragraphs.at(-1),connection.paragraphs[3]);
    for(const code of connection.natalCodes)for(const entry of fortune.profile.gods.filter(entry=>entry.god.code===code)) {
      assert.ok(card.factIds.includes(`natal.god.${entry.pillarKey}.${entry.position}`),'the used natal behaviour keeps its actual calculation fact');
    }
    for(const position of ['stem','branch'])assert.ok(card.factIds.includes(`${prefix}.god.${position}`),'both actual period relationships retain their evidence');
    assert.ok(card.factIds.includes(`${prefix}.period`));
  }
});

test('the same day master and period still give different personal conclusions in all four domains',()=>{
  const winter=reading({year:1990,month:1,day:1,hour:9,minute:0});
  const spring=reading({year:1990,month:3,day:2,hour:9,minute:0});
  assert.equal(winter.chart.dayMaster.hanja,spring.chart.dayMaster.hanja);
  const first=[winter.fortune.annual,...winter.fortune.months],second=[spring.fortune.annual,...spring.fortune.months];
  for(const [index,transit] of first.entries()) {
    const codes=[...new Set([transit.stemGod.code,transit.branchGod.code])];
    assert.deepEqual(codes,[...new Set([second[index].stemGod.code,second[index].branchGod.code])]);
    for(const domain of coreTopics) {
      const a=describePersonalPeriod(winter.fortune.profile,codes,domain),b=describePersonalPeriod(spring.fortune.profile,codes,domain);
      assert.notDeepEqual(a.natalCodes,b.natalCodes,`the fixture has different observed ${domain} traits`);
      assert.notEqual(a.paragraphs[0],b.paragraphs[0],`${domain} explains the person's actual surrounding relationships`);
      assert.notEqual(a.reading,b.reading,'a day-master template cannot stand in for the connected person');
    }
  }
  const winterLearning=describePersonalPeriod(winter.fortune.profile,winter.report.reader.annual.godCodes,'learning');
  const springLearning=describePersonalPeriod(spring.fortune.profile,spring.report.reader.annual.godCodes,'learning');
  assert.equal(winterLearning.natalCodes[0],springLearning.natalCodes[0]);
  assert.notEqual(winterLearning.natalCodes[1],springLearning.natalCodes[1],'a second actual trait matters even when the first shared meaning is the same');
});

test('the reusable period connector rejects missing evidence and never substitutes an uncertain natal relationship',()=>{
  const ordinary=reading();
  const limited=reading({year:2024,month:2,day:4,hour:null});
  for(const domain of coreTopics) {
    const connection=describePersonalPeriod(limited.fortune.profile,['explorer','scholar'],domain);
    assert.deepEqual(connection.natalCodes,['companion']);
    assert.match(connection.paragraphs[1],/^이 시기에는 /);
  }
  for(const codes of [[],['invented'],['companion','creator','officer']])assert.throws(()=>describePersonalPeriod(ordinary.fortune.profile,codes,'work'),/확인된 성향과 시기/);
  assert.throws(()=>describePersonalPeriod({...ordinary.fortune.profile,gods:[]},['creator'],'work'),/확인된 성향과 시기/);
  assert.throws(()=>describePersonalPeriod(ordinary.fortune.profile,['creator'],'unknown'),/확인된 성향과 시기/);
  assert.throws(()=>describePersonalPeriod(ordinary.fortune.profile,['creator'],'__proto__'),/확인된 성향과 시기/);
  assert.throws(()=>describePersonalPeriod(ordinary.fortune.profile,['creator'],'work',''),/확인된 성향과 시기/);
});

test('unknown birth time and seasonal-boundary candidates never gain fabricated personal evidence',()=>{
  const {chart,fortune,report}=reading({year:2024,month:2,day:4,hour:null});
  assert.equal(fortune.profile.knownCharacterCount,2);
  assert.ok(chart.pillars.some(value=>value.uncertain));
  assert.match(report.reader.scopeNotice,/태어난 시각에 따라 달라질 수 있는 부분.*확인된 내용만/);
  const known=new Set(fortune.profile.gods.map(entry=>`natal.god.${entry.pillarKey}.${entry.position}`));
  for(const overview of overviews(report))for(const block of [overview,...overview.cards]) {
    for(const id of block.factIds.filter(id=>id.startsWith('natal.god.')))assert.ok(known.has(id),id);
    assert.ok(!block.factIds.some(id=>/^natal\.(character|god)\.(hour|month|year)\./.test(id)));
  }
  assert.equal(report.reader.lifelong.paragraphs.some(text=>text.startsWith('여기에')),false,'a missing season does not get a selected candidate interpretation');
  const ordinary=reading({...sample,hour:null}).report;
  assert.match(ordinary.reader.scopeNotice,/태어난 시간을 몰라/);
  assert.ok(overviews(ordinary).every(overview=>!overview.paragraphs.includes(ordinary.reader.scopeNotice)),'one common scope notice is not repeated in every reading');
  for(const value of [report,ordinary])for(const topic of ['lifelong','annual','monthly','all']) {
    const copy=value.copyByCategory[topic];
    assert.equal(copy.split('\n')[2],value.reader.scopeNotice,'the purchase copy presents its scope before the readings');
    assert.equal(copy.split(value.reader.scopeNotice).length-1,1,'the short common notice appears only once per product');
    for(const warning of value.methodByCategory[topic].warnings)assert.ok(copy.includes(warning),'the original scope warnings remain available');
  }
});

test('the expanded lifelong topics stay grouped, trace actual observed relationships and point to existing full chapters',()=>{
  const {fortune,report}=reading();
  const expected=['character','aptitude','life-path','relationships','parents','children','work','career-examples','learning','money','contracts','helpers','boundaries','health','space','safety','cautions','response'];
  assert.deepEqual(report.reader.lifelong.cards.map(card=>card.id),expected.map(key=>'natal-'+key));
  const chapters=report.sections.find(section=>section.id==='lifelong').chapters;
  const actual=new Set(fortune.profile.gods.map(entry=>entry.god.code));
  for(const card of report.reader.lifelong.cards) {
    assert.ok(chapters.some(chapter=>chapter.id===card.chapterId),card.chapterId);
    for(const code of card.godCodes)assert.ok(actual.has(code),`an unobserved natal relationship cannot supply ${card.id}`);
    for(const paragraph of card.paragraphs)assert.ok(report.copyByCategory.lifelong.includes(paragraph),'expanded prose is included without truncation in the product copy');
    assert.ok(card.factIds.every(id=>id.startsWith('natal.')),'long-term topics do not borrow a future period');
  }
  assert.deepEqual(new Set(report.reader.lifelong.cards.map(card=>card.navGroup)),new Set(['나의 바탕','사랑과 가족','일과 배움','돈과 문서','관계와 생활']));
  for(const overview of [report.reader.annual,...report.reader.months])for(const key of ['opportunities','cautions','response'])assert.ok(overview.cards.some(card=>card.id.endsWith('-'+key)));
});

test('family, wellness, document, home and safety lenses disclose their real scope and keep concrete hypothetical scenes',()=>{
  const {report}=reading();
  const card=key=>{const item=report.reader.lifelong.cards.find(card=>card.id==='natal-'+key);assert.ok(item.scopeNotice);assert.ok(report.copyByCategory.lifelong.includes(item.scopeNotice));return [...item.paragraphs,item.scopeNotice].join('\n');};
  assert.match(card('parents'),/본인의 관계 성향을 부모나 보호자와의 대화에 적용/);
  assert.match(card('children'),/자녀의 유무나 미래를 정하는 풀이가 아니라/);
  assert.match(card('health'),/건강이나 질병을 진단한 내용은 아니며/);
  assert.match(card('health'),/실제 상태를 확인할 수 있는 의료 상담/);
  assert.match(card('helpers'),/특정 인물이나 만나는 날짜를 정한 것은 아니에요/);
  assert.match(card('boundaries'),/누가 나쁜 사람인지 사주로 정하는 내용이 아니라/);
  assert.match(card('contracts'),/서명할 날짜나 계약의 결과를 계산한 내용은 아니에요/);
  assert.match(card('space'),/집의 도면을 보고 방위를 판단한 내용은 아니며/);
  assert.match(card('safety'),/사고가 생길 시기·장소·종류를 예측한 내용은 아니며/);
  for(const key of ['parents','children','health','helpers','boundaries','contracts','space','safety']) {
    const item=report.reader.lifelong.cards.find(card=>card.id==='natal-'+key);
    assert.match(item.paragraphs[0],/^당신은 .+사람입니다\./,'the subject starts with the observed personal behaviour');
    assert.doesNotMatch(item.title,/살펴요|확인해요|세워요|알아봐요|나눠요|함께 봐요/,'a subject title gives a personal conclusion rather than a general instruction');
    assert.match(card(key),/가령.+해 볼게요/);
    assert.doesNotMatch(card(key),/아이를 갖게|자녀가 [0-9]|사고가 (나|생길 것이)|질병이 (오|생길 것이)|계약이 성사|[0-9]+일에 만나|[0-9]+월에 만나|특정 장기가|취약한 장기/);
  }
});

test('multiple real birth inputs retain complete narratives while varying the actual component meanings',()=>{
  const inputs=[sample,{year:1987,month:12,day:11,hour:22,minute:15},{year:2002,month:7,day:25,hour:6,minute:40},{year:1974,month:9,day:3,hour:13,minute:5},{year:2024,month:2,day:4,hour:null}];
  const results=inputs.map(input=>reading(input));
  for(const {fortune,report} of results) {
    const actual=new Set(fortune.profile.gods.map(entry=>entry.god.code));
    for(const card of report.reader.lifelong.cards) {
      assert.ok(card.paragraphs.length>=5&&card.paragraphs.length<=7,card.id);
      assert.ok(card.godCodes.every(code=>actual.has(code)));
    }
    for(const overview of overviews(report))for(const card of overview.cards)assert.ok(card.paragraphs.every(text=>!text.includes('undefined')&&!text.includes('[object')));
  }
  const bodies=results.map(({report})=>prose(report.reader.lifelong));
  assert.equal(new Set(bodies).size,inputs.length);
  const scenes=results.map(({report})=>report.reader.lifelong.cards.find(card=>card.id==='natal-career-examples').paragraphs[4]);
  assert.ok(new Set(scenes).size>=3,'career examples follow different actual tendencies');
});

test('a missing calculation source blocks the summary rather than silently supplying generic text',()=>{
  const {chart,fortune,report}=reading();
  report.facts=report.facts.filter(value=>value.id!=='month.7.god.stem');
  assert.throws(()=>attachReaderSummary(report,chart,fortune),/계산 근거/);
});
