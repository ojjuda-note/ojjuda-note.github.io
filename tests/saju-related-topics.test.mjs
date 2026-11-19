import test from 'node:test';
import assert from 'node:assert/strict';
import {getReadingTheme} from '../games/starlit-saju/related-topics.mjs';
import {arrangeRelatedReadings} from '../games/starlit-saju/related-reader.mjs';
import {attachAdvice} from '../games/starlit-saju/advice.mjs';

function scene(id,{domain='lifelong',period,semantic={},source=id,topic=source,...extra}={}) {
  const text='고유한 설명과 3.5만 원이라는 예시를 남겨요.';
  return {id,source,topic,domain,period,semantic,label:'원래 항목 이름',title:'원래 제목',
    context:['원래 기간과 입력 범위'],kind:'prose',aliases:[`${id}-anchor`],
    paragraphs:[{key:`${id}-paragraph`,text,start:0,end:text.length}],...extra};
}

function payload(item) {
  const {theme,...original}=item;
  return original;
}

function authoredAdvice(code,interactions=[]) {
  const god={code,name:'확인한 관계'},months=Array.from({length:12},(_,index)=>({month:index+1}));
  const report={months},fortune={year:2026,
    profile:{gods:[{god,pillarKey:'month',position:'stem'}],interactions},
    annual:{stemGod:god,branchGod:god,interactions},
    months:months.map(({month})=>({month,stemGod:god,branchGod:god,interactions}))};
  attachAdvice(report,fortune);
  return [...report.adviceByCategory.lifelong,...report.adviceByCategory.annual,...report.months.flatMap(month=>month.advice)];
}

test('general themes follow exact authored subject identities across the original card types',()=>{
  const cases=[
    [{portraitCard:'portrait-decisions'},'character'],
    [{portraitCard:'portrait-relationships'},'relationships'],
    [{portraitCard:'portrait-work'},'work'],
    [{portraitCard:'portrait-pressure'},'lifestyle'],
    [{portraitCard:'portrait-adjustment'},'relationships'],
    [{readerCard:'natal-character'},'character'],
    [{readerCard:'natal-life-path'},'overview'],
    [{readerCard:'natal-parents'},'relationships'],
    [{readerCard:'natal-children'},'relationships'],
    [{readerCard:'natal-boundaries'},'relationships'],
    [{readerCard:'natal-aptitude'},'work'],
    [{readerCard:'natal-career-examples'},'work'],
    [{readerCard:'natal-learning'},'work'],
    [{readerCard:'natal-money'},'money'],
    [{readerCard:'natal-contracts'},'money'],
    [{readerCard:'natal-health'},'lifestyle'],
    [{readerCard:'natal-space'},'lifestyle'],
    [{readerCard:'natal-safety'},'lifestyle'],
    [{readerCard:'natal-cautions'},'timing'],
    [{readerCard:'natal-response'},'timing'],
  ];
  for(const [semantic,expected] of cases)assert.equal(getReadingTheme(scene('source',{semantic})).id,expected,JSON.stringify(semantic));
});

test('year, month and decade subjects share themes without changing their distinct period identities',()=>{
  const subjects={relationships:'relationships',work:'work',money:'money',learning:'work',
    opportunities:'timing',cautions:'timing',response:'timing'};
  for(const [subject,expected] of Object.entries(subjects)) {
    assert.equal(getReadingTheme(scene('annual',{semantic:{readerCard:`annual-${subject}`}})).id,expected);
    for(let month=1;month<=12;month++) {
      const item=scene(`month-${month}`,{domain:'monthly',period:{id:`month-${month}`,label:`${month}월`},
        semantic:{readerCard:`month-${month}-${subject}`,month:String(month)}});
      const before=structuredClone(item);
      assert.equal(getReadingTheme(item).id,expected);assert.deepEqual(item,before);
    }
  }
  for(const [subject,expected] of Object.entries({money:'money',documents:'money',work:'work',learning:'work',relationships:'relationships',people:'relationships'})) {
    assert.equal(getReadingTheme(scene('decade',{semantic:{daeunTopic:`daeun.reading.period.4.${subject}`}})).id,expected);
  }
});

test('mixed supplemental interpretations stay in their own accurate theme for every product and month',()=>{
  const ids=['natal-supplement-hidden','natal-supplement-stages','annual-supplement-hidden','annual-supplement-stages',
    ...Array.from({length:12},(_,index)=>[`month-${index+1}-supplement-hidden`,`month-${index+1}-supplement-stages`]).flat()];
  for(const id of ids) {
    const item=scene(id,{semantic:{readingSupplement:id},title:'재물과 관계, 일과 배움을 함께 살펴보는 설명'});
    assert.deepEqual(getReadingTheme(item),{id:'supplements',label:'생활 속 추가 해설',order:75},id);
  }
});

test('timing cards use their semantic subject before the generic timing source',()=>{
  const cases=[
    [{timingKind:'people'},'relationships'],[{timingKind:'documents'},'money'],
    [{timingKind:'opportunities'},'timing'],[{timingKind:'cautions'},'timing'],
    [{timingTopic:'people'},'relationships'],[{timingTopic:'document'},'money'],
    [{timingTopic:'opportunity'},'timing'],[{timingTopic:'coordination'},'timing'],
    [{timingTopic:'caution'},'timing'],[{timingTopic:'change'},'timing'],
  ];
  for(const [semantic,expected] of cases) {
    assert.equal(getReadingTheme(scene('timing-point',{source:'reading-timings',semantic})).id,expected);
  }
  assert.equal(getReadingTheme(scene('fallback',{semantic:{readingOverview:'annual'}})).id,'overview');
  assert.equal(getReadingTheme(scene('fallback',{semantic:{readingOverview:'lifelong'}})).id,'character');
  assert.equal(getReadingTheme(scene('month-spotlight',{semantic:{readingOverview:'monthly'}})).id,'overview');
  assert.equal(getReadingTheme(scene('advice-intro',{semantic:{readingOverview:'advice'}})).id,'lifestyle');
});

test('all ten authored advice subjects use their actual generated identities in every product and month',()=>{
  const expected={companion:'relationships',competitor:'money',creator:'work',critic:'work',
    opportunist:'money',manager:'money',challenger:'work',officer:'work',explorer:'work',scholar:'work'};
  for(const [code,theme] of Object.entries(expected)) {
    const cards=authoredAdvice(code).filter(card=>card.id.includes('.advice.god.'));
    assert.deepEqual(cards.map(card=>card.id),['natal','annual',...Array.from({length:12},(_,index)=>`month.${index+1}`)]
      .map(prefix=>`${prefix}.advice.god.${code}`),'the fixture uses IDs emitted by advice.mjs itself');
    for(const card of cards) {
      const item=scene('advice-source',{semantic:{adviceId:card.id,readingOverview:'advice'},
        title:card.title,paragraphs:[card.action,card.caution]});
      const before=structuredClone(item);
      assert.equal(getReadingTheme(item).id,theme,card.id);
      assert.deepEqual(item,before,'classifying service suggestions never edits their actions or cautions');
    }
  }
});

test('authored connection, clash and no-pair advice are classified without guessing from their wording',()=>{
  for(const [interactions,suffix,expected] of [
    [[{kind:'stem-combination'}],'connect','relationships'],
    [[{kind:'branch-combination'}],'connect','relationships'],
    [[{kind:'branch-clash'}],'clash','relationships'],
    [[],'no-pair','timing'],
  ]) {
    const cards=authoredAdvice('companion',interactions).filter(card=>!card.id.includes('.advice.god.'));
    assert.equal(cards.length,14,'natal, annual and all twelve months keep their own suggestion');
    for(const card of cards) {
      assert.ok(card.id.endsWith(`.advice.${suffix}`));
      assert.equal(getReadingTheme(scene('advice-source',{semantic:{adviceId:card.id,readingOverview:'advice'}})).id,expected,card.id);
    }
  }
  for(const adviceId of ['month.0.advice.god.manager','month.13.advice.god.manager','month.01.advice.connect','natal.advice.god.manager-extra']) {
    assert.equal(getReadingTheme(scene('unknown-advice',{semantic:{adviceId,readingOverview:'advice'}})).id,'lifestyle',
      'unrecognized IDs retain the broad advice group rather than borrowing a partial match');
  }
});

test('overview, symbols and uncertainty guidance retain their clear reader groups',()=>{
  const cases=[
    [scene('reading-person-portrait'),'character'],
    [scene('reading-summary',{domain:'lifelong'}),'character'],
    [scene('reading-summary',{domain:'annual'}),'overview'],
    [scene('reading-month-12',{domain:'monthly'}),'overview'],
    [scene('daeun.reading.period.9',{domain:'daeun'}),'overview'],
    [scene('reading-daeun-period-4',{domain:'daeun'}),'overview'],
    [scene('reading-daeun',{domain:'daeun'}),'overview'],
    [scene('reading-symbols'),'symbols'],
    [scene('reading-month-periods'),'information'],
    [scene('reading-coverage'),'information'],
    [scene('notice',{domain:'information',semantic:{readerCard:'natal-money'}}),'information'],
  ];
  for(const [item,expected] of cases)assert.equal(getReadingTheme(item).id,expected,item.source);
});

test('compatibility groups preserve the semantic difference between personality, relationships and daily life',()=>{
  const people={overview:'character',decisions:'character',relationships:'relationships',work:'work',pressure:'lifestyle',adjustment:'relationships'};
  for(const [subject,expected] of Object.entries(people))for(const person of ['self','partner']) {
    const item=scene(`person-${person}-${subject}`,{domain:'people',semantic:{personKey:person,compatibilityTopic:subject}});
    assert.equal(getReadingTheme(item,{mode:'compatibility'}).id,expected);
  }
  for(const [id,expected] of Object.entries({foundation:'character',zodiac:'relationships',connection:'relationships',differences:'relationships',everyday:'lifestyle',conversation:'relationships'})) {
    assert.equal(getReadingTheme(scene(id,{semantic:{readerCard:id}}),{mode:'compatibility'}).id,expected);
  }
  for(const [id,expected] of Object.entries({temperament:'character',complement:'relationships',daily:'lifestyle',harmony:'relationships'})) {
    assert.equal(getReadingTheme(scene(`compatibility-score-detail-${id}`,{domain:'scores'}),{mode:'compatibility'}).id,expected);
  }
  assert.equal(getReadingTheme(scene('compatibility-scores',{domain:'scores'}),{mode:'compatibility'}).label,'궁합 점수');
  assert.equal(getReadingTheme(scene('compatibility-synthesis',{domain:'synthesis'}),{mode:'compatibility'}).label,'종합 궁합');
  assert.equal(getReadingTheme(scene('compatibility-reading-coverage'),{mode:'compatibility'}).id,'information');
});

test('unrecognized identifiers and changed display labels never fabricate a matching subject',()=>{
  for(const id of ['natal-money-extra','month-13-money','daeun.reading.period.0.money','toString','constructor','__proto__']) {
    assert.equal(getReadingTheme(scene(id,{label:'재물·계약',title:'연애와 일 이야기',semantic:{readerCard:id}})).id,'other',id);
  }
  const item=scene('known',{semantic:{readerCard:'natal-money'},label:'성격과 건강',title:'관계를 살펴보세요.'});
  const before=structuredClone(item),theme=getReadingTheme(item);
  assert.equal(theme.id,'money');assert.deepEqual(item,before,'classification never edits the source payload');
  theme.label='바뀐 표시';
  assert.equal(getReadingTheme(item).label,'재물·계약','one caller cannot modify a shared theme definition');
});

test('related reading order keeps complete topics together while preserving scene identities, scores and authored order',()=>{
  const score={available:true,tailwind:{value:81},headwind:{value:37}},scope={text:'태어난 시간 미상은 그대로 남겨요.'};
  const items=[
    scene('portrait-summary',{source:'reading-person-portrait',kind:'summary',score}),
    scene('money-summary',{topic:'natal-money',semantic:{readerCard:'natal-money'},kind:'summary'}),
    scene('money-body',{topic:'natal-money',semantic:{readerCard:'natal-money'}}),
    scene('work-summary',{topic:'natal-work',semantic:{readerCard:'natal-work'},kind:'summary'}),
    scene('relationship-summary',{topic:'natal-parents',semantic:{readerCard:'natal-parents'},kind:'summary'}),
    scene('life-path',{semantic:{readerCard:'natal-life-path'},kind:'summary'}),
    scene('guide',{domain:'information',kind:'scope',scope}),
  ];
  const before=structuredClone(items),originalIds=items.map(item=>item.id),result=arrangeRelatedReadings(items);
  assert.deepEqual(result.map(item=>item.id),['portrait-summary','life-path','relationship-summary','work-summary','money-summary','money-body','guide']);
  assert.deepEqual(items.map(item=>item.id),originalIds,'the supplied list is not sorted in place');
  assert.equal(new Set(result).size,items.length,'every original scene appears exactly once');
  for(const [index,item] of items.entries()) {
    assert.equal(result.find(value=>value.id===item.id),item,'aliases can keep pointing to the same scene object');
    assert.deepEqual(payload(item),before[index],'only theme metadata is added');
  }
  assert.equal(result[0].score,score);assert.equal(result.at(-1).scope,scope);
  assert.deepEqual(result.filter(item=>item.topic==='natal-money').map(item=>item.id),['money-summary','money-body']);
});

test('same themes in other products, months and decade periods never collapse into one reading context',()=>{
  const month1={id:'month-1',label:'2026년 1월'},month2={id:'month-2',label:'2026년 2월'},decade={id:'period-4',label:'만 33~43세'};
  const items=[
    scene('feb-money',{domain:'monthly',period:month2,semantic:{readerCard:'month-2-money'}}),
    scene('annual-money',{domain:'annual',semantic:{readerCard:'annual-money'}}),
    scene('jan-money',{domain:'monthly',period:month1,semantic:{readerCard:'month-1-money'}}),
    scene('feb-work',{domain:'monthly',period:month2,semantic:{readerCard:'month-2-work'}}),
    scene('annual-work',{domain:'annual',semantic:{readerCard:'annual-work'}}),
    scene('jan-work',{domain:'monthly',period:month1,semantic:{readerCard:'month-1-work'}}),
    scene('decade-money',{domain:'daeun',period:decade,semantic:{daeunTopic:'daeun.reading.period.4.money'}}),
  ];
  const result=arrangeRelatedReadings(items);
  assert.deepEqual(result.map(item=>item.id),['feb-work','feb-money','annual-work','annual-money','jan-work','jan-money','decade-money']);
  assert.deepEqual(result.map(item=>[item.domain,item.period?.id]),[
    ['monthly','month-2'],['monthly','month-2'],['annual',undefined],['annual',undefined],
    ['monthly','month-1'],['monthly','month-1'],['daeun','period-4'],
  ]);
  assert.equal(result[0].period,month2);assert.equal(result[4].period,month1);assert.equal(result[6].period,decade);
});

test('compatibility sorting keeps both people and each original A then B comparison in order',()=>{
  const items=['overview','work','relationships','pressure'].flatMap(subject=>['self','partner'].map((person,index)=>{
    const text=`${person}의 고유한 ${subject} 설명`;
    return scene(`${person}-${subject}`,{source:`person-${person}-${subject}`,topic:`person-${person}-${subject}`,domain:'people',
      semantic:{compatibilityTopic:subject,personKey:person,personMarker:index===0?'A':'B'},
      paragraphs:[{key:`${person}-${subject}`,text,start:0,end:text.length}]});
  }));
  const result=arrangeRelatedReadings(items,{mode:'compatibility'});
  assert.deepEqual(result.map(item=>item.id),['self-overview','partner-overview','self-relationships','partner-relationships','self-work','partner-work','self-pressure','partner-pressure']);
  for(const subject of ['overview','work','relationships','pressure']) {
    assert.deepEqual(result.filter(item=>item.semantic.compatibilityTopic===subject).map(item=>item.semantic.personMarker),['A','B']);
  }
  assert.equal(new Set(result.map(item=>item.topic)).size,8,'the theme never becomes a replacement source topic');
});

test('empty and already organized readings remain stable',()=>{
  assert.deepEqual(arrangeRelatedReadings([]),[]);
  const items=[scene('character',{semantic:{readerCard:'natal-character'}}),
    scene('work',{semantic:{readerCard:'natal-work'}}),scene('money',{semantic:{readerCard:'natal-money'}})];
  const first=arrangeRelatedReadings(items),second=arrangeRelatedReadings(first);
  assert.deepEqual(second,first);assert.ok(second.every((item,index)=>item===first[index]));
});
