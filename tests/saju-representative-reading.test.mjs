import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {keepGeneralCard,keepPortraitCard,keepCompatibilityCard,keepCompatibilityPersonTopic} from '../games/starlit-saju/reading-selection.mjs';
import {selectRepresentativeReadings} from '../games/starlit-saju/representative-reader.mjs';
import {createStoryReader} from '../games/starlit-saju/story-reader.mjs';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
const {removedGeneralCards,removedCompatibilityCards}=require('./helpers/saju-selected-readings.cjs');

function part(text,key='paragraph',extra={}) {
  return {text,key,start:0,end:text.length,kind:'prose',summaryIndex:null,...extra};
}
function scene(id,extra={}) {
  return {id,source:id,topic:id,domain:'lifelong',period:undefined,semantic:{},context:[],
    label:id,group:'평생운',title:id,kind:'summary',summaryTitle:true,aliases:[],
    paragraphs:[part('고유한 설명과 3.5만 원이라는 예시를 남겨요.',id)],...extra};
}
function select(scenes,mode='general',extraAliases=[]) {
  const aliases=new Map([...scenes.flatMap(item=>[[item.id,item],[item.id+'-anchor',item]]),...extraAliases]);
  return {items:selectRepresentativeReadings(scenes,aliases,{mode}),aliases};
}

test('selection removes exactly the requested 19 general cards and four duplicate pair cards',()=>{
  assert.equal(removedGeneralCards.size,19);
  for(const id of removedGeneralCards)assert.equal(keepGeneralCard(id),false,id);
  for(const id of ['natal-money','natal-contracts','natal-relationships','natal-parents','natal-children',
    'natal-learning','natal-career-examples','natal-helpers','natal-boundaries','natal-health','natal-space','natal-safety',
    'annual-work','annual-cautions','annual-opportunities','month-1-work','month-12-money',
    'natal-work-example','month-13-response','natal-response-extra'])assert.equal(keepGeneralCard(id),true,id);
  for(const id of ['portrait-decisions','portrait-relationships','portrait-work','portrait-pressure','portrait-adjustment'])assert.equal(keepPortraitCard(id),true);
  for(const id of ['overview','decisions','relationships','work','pressure','adjustment'])assert.equal(keepCompatibilityPersonTopic(id),true);
  for(const id of removedCompatibilityCards)assert.equal(keepCompatibilityCard(id),false,id);
  for(const id of ['zodiac','conversation','foundation-extra'])assert.equal(keepCompatibilityCard(id),true,id);
});

test('retained source objects, paragraphs, scores and order remain exact while duplicate cards are removed',()=>{
  const portrait=scene('reading-person-portrait'),work=scene('work',{semantic:{portraitCard:'portrait-work'}}),
    pressure=scene('pressure',{semantic:{portraitCard:'portrait-pressure'}}),money=scene('money',{semantic:{readerCard:'natal-money'},score:{tailwind:81,headwind:37}});
  const removed=[...removedGeneralCards].filter(id=>id.startsWith('natal-')).map(id=>scene(id,{semantic:{readerCard:id}}));
  const items=[portrait,...removed,work,pressure,money],before=structuredClone(items);
  const result=select(items,'general',[['person-portrait-headline',portrait]]);
  assert.deepEqual(result.items,[portrait,work,pressure,money]);
  assert.deepEqual(items,before,'selection never edits the calculated source or retained prose');
  for(const item of result.items)assert.equal(item,items.find(original=>original.id===item.id));
  assert.equal(result.aliases.get('natal-character-anchor'),portrait);
  for(const id of ['natal-aptitude','natal-life-path','natal-work','natal-response'])assert.equal(result.aliases.get(id),work);
  assert.equal(result.aliases.get('natal-cautions'),pressure);
  assert.equal(result.items.at(-1).score,money.score,'the actual independent score object is retained');
});

test('year and month response links only target the same period and person',()=>{
  const month=number=>({id:`month-${number}`,label:`2026년 ${number}월`});
  const one=scene('one-work',{domain:'monthly',period:month(1),semantic:{readerCard:'month-1-work',month:'1'}});
  const two=scene('two-work',{domain:'monthly',period:month(2),semantic:{readerCard:'month-2-work',month:'2'}});
  const year=scene('annual-work',{domain:'annual',semantic:{readerCard:'annual-work'}});
  const responses=[scene('one-response',{domain:'monthly',period:month(1),semantic:{readerCard:'month-1-response',month:'1'}}),
    scene('two-response',{domain:'monthly',period:month(2),semantic:{readerCard:'month-2-response',month:'2'}}),
    scene('annual-response',{domain:'annual',semantic:{readerCard:'annual-response'}})];
  const wrongPerson=scene('other-person',{domain:'monthly',period:month(1),semantic:{readerCard:'month-1-response',month:'1',personKey:'partner'}});
  const wrongPeriod=scene('missing-month',{domain:'monthly',period:month(3),semantic:{readerCard:'month-3-response',month:'3'}});
  const result=select([one,two,year,...responses,wrongPerson,wrongPeriod]);
  assert.deepEqual(result.items,[one,two,year]);
  for(const [source,target] of [[responses[0],one],[responses[1],two],[responses[2],year]])assert.equal(result.aliases.get(source.id),target);
  assert.equal(result.aliases.has(wrongPerson.id),false);assert.equal(result.aliases.has(wrongPeriod.id),false);
});

test('advice, supplemental, timing and spotlight interpretations are removed from the reading and unresolved aliases',()=>{
  const retained=scene('reading-person-portrait');
  const redundant=[
    scene('legacy',{semantic:{readingOverview:'legacy-lifelong'}}),
    scene('advice',{semantic:{readingOverview:'advice'}}),scene('advice-item',{semantic:{adviceId:'natal.advice.god.manager'}}),
    scene('supplement',{semantic:{readingSupplement:'natal-supplement-hidden'}}),
    scene('spotlight',{semantic:{readingOverview:'monthly-spotlight'}}),
    scene('timing',{semantic:{readingOverview:'timing'}}),scene('timing-kind',{semantic:{timingKind:'documents'}}),
    scene('reading-timings'),scene('reading-timings-month-12'),
  ];
  const result=select([retained,...redundant],'general',[['person-portrait-headline',retained]]);
  assert.deepEqual(result.items,[retained]);assert.equal(result.aliases.get('legacy'),retained);
  for(const item of redundant.slice(1))assert.equal(result.aliases.has(item.id+'-anchor'),false,item.id);
});

test('pair selection retains all A/B explanations and four real score axes while redirecting only matching duplicate cards',()=>{
  const people=['overview','decisions','relationships','work','pressure','adjustment'].flatMap(topic=>['self','partner'].map((person,index)=>scene(`${person}-${topic}`,
    {domain:'people',semantic:{compatibilityTopic:topic,personKey:person,personMarker:index?'B':'A'}})));
  const synthesis=scene('compatibility-synthesis',{domain:'synthesis'}),graph=scene('compatibility-scores',{domain:'scores',kind:'score',graph:{total:79,items:[81,63,70,77]}});
  const scores=['temperament','complement','harmony','daily'].map(id=>scene('compatibility-score-detail-'+id,{domain:'scores'}));
  const removed=['foundation','connection','differences','everyday'].map(id=>scene(id,{domain:'details',semantic:{readerCard:id}}));
  const keptCards=['zodiac','conversation'].map(id=>scene(id,{domain:'details',semantic:{readerCard:id}}));
  const oldOverview=scene('compatibility-reading-overview',{domain:'details'});
  const items=[synthesis,...people,graph,...scores,oldOverview,...removed,...keptCards],before=structuredClone(items),result=select(items,'compatibility');
  assert.deepEqual(result.items,[synthesis,...people,graph,...scores,...keptCards]);assert.deepEqual(items,before);
  assert.equal(result.aliases.get(oldOverview.id),synthesis);
  for(const [index,item] of removed.entries())assert.equal(result.aliases.get(item.id),scores[index]);
  assert.equal(result.items.find(item=>item.id===graph.id).graph,graph.graph);
  for(const topic of ['overview','decisions','relationships','work','pressure','adjustment']) {
    assert.deepEqual(result.items.filter(item=>item.semantic.compatibilityTopic===topic).map(item=>item.semantic.personMarker),['A','B']);
  }
});

test('genuine unknown-input notices survive once in guidance and are never converted to a score',()=>{
  const text='출생시각을 몰라 확인하지 못한 내용이 있어요.',cut=14;
  const raw=[scene('notice-a',{kind:'scope',summaryTitle:false,semantic:{readingOverview:'legacy-lifelong'},
    paragraphs:[part(text.slice(0,cut),'scope',{kind:'scope'})]}),
    scene('notice-b',{kind:'scope',summaryTitle:false,semantic:{readingOverview:'legacy-lifelong'},
      paragraphs:[part(text.slice(cut),'scope',{kind:'scope',start:cut,end:text.length})]}),
    scene('same-notice',{kind:'scope',summaryTitle:false,semantic:{readingOverview:'legacy-lifelong'},
      paragraphs:[part(text,'duplicate-scope',{kind:'scope'})]})];
  const coverage=scene('reading-coverage',{domain:'information',kind:'scope'}),before=structuredClone(raw),result=select([coverage,...raw]);
  const notes=result.items.filter(item=>item!==coverage);
  assert.equal(notes.map(item=>item.paragraphs[0].text).join(''),text);
  assert.ok(notes.every(item=>item.source==='reading-coverage'&&item.domain==='information'&&item.kind==='scope'&&!item.score&&!item.graph));
  assert.equal(new Set(result.items.map(item=>item.id)).size,result.items.length);
  assert.deepEqual(raw,before);assert.equal(result.aliases.get('same-notice'),notes[0]);
});

test('removed supplements do not return as explanatory notices at the end of the reading',()=>{
  const coverage=scene('reading-coverage',{domain:'information',kind:'scope'});
  const supplement=scene('supplement-scope',{kind:'scope',summaryTitle:false,
    semantic:{readingSupplement:'natal-supplement-hidden'},paragraphs:[part('삭제한 추가 해설의 설명 범위예요.','supplement',{kind:'scope'})]});
  const result=select([coverage,supplement]);
  assert.deepEqual(result.items,[coverage]);assert.equal(result.aliases.has(supplement.id),false);
  assert.equal(result.aliases.has(supplement.id+'-anchor'),false);
});

test('the actual reader has direct retained choices, shorter next order and safe restoration of a deleted card',()=>{
  const dom=new JSDOM('<!doctype html><div id="report"></div>',{url:'https://example.test/'}),doc=dom.window.document;
  try {
    doc.documentElement.dataset.reducedMotion='true';dom.window.HTMLElement.prototype.scrollIntoView=function(){};
    const host=doc.getElementById('report');
    const pages=[['original-work','portrait-work','portraitCard','남아 있는 일 설명이에요.'],
      ['removed-work','natal-work','readerCard','삭제한 다른 일 설명이에요.'],
      ['retained-money','natal-money','readerCard','재물 설명은 그대로 남아요.']].map(([id,topic,key,text])=>{
      const element=doc.createElement('section');element.id=id;element.dataset[key]=topic;
      const p=doc.createElement('p');p.textContent=text;element.append(p);host.append(element);
      return {id,element,label:id,group:'평생운',domain:'lifelong'};
    });
    const reader=createStoryReader(host,{pages});
    const select=host.querySelector('select.reading-page-select');
    assert.deepEqual([...select.options].map(option=>option.value),['original-work','retained-money']);
    assert.deepEqual([...host.querySelectorAll('[data-reading-target]')].map(button=>button.dataset.readingTarget),['original-work','retained-money']);
    assert.equal(host.querySelector('dialog.story-menu details'),null);
    host.querySelector('.story-next').click();assert.equal(select.value,'retained-money');assert.equal(host.querySelector('.story-next').disabled,true);
    assert.equal(reader.restore('removed-work'),true);assert.equal(select.value,'original-work');
    assert.equal(host.textContent.includes('삭제한 다른 일 설명이에요.'),false);
    assert.equal(host.querySelectorAll('.story-stage > article.story-scene').length,1);
    reader.dispose();
  } finally {dom.window.close();}
});
