import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {calculateSaju} from '../games/starlit-saju/engine.mjs';
import {analyzeFortune} from '../games/starlit-saju/fortune-data.mjs';
import {analyzeDaeun} from '../games/starlit-saju/daeun.mjs';
import {buildDetailedReading} from '../games/starlit-saju/readings.mjs';
import {buildCompatibilityReading} from '../games/starlit-saju/compatibility.mjs';
import {renderDetailedReport,renderCompatibilityReport,restoreReadingPage} from '../games/starlit-saju/report-view.mjs';

const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
const {currentStory,chooseStory,followStory,collectStories,assertOriginalParagraphs,
  assertSummaryAndScore,storiesForItem,groupStories,visible}=require('./helpers/saju-story-ui.cjs');
const {selectedGeneralUnits,removedGeneralCards,isRemovedGeneralStory}=require('./helpers/saju-selected-readings.cjs');
const now=new Date('2026-11-13T00:00:00Z');
const chart=calculateSaju({year:1990,month:5,day:17,hour:8,minute:37},{now});
const fortune=analyzeFortune(chart,{year:2026,now});
const reading=buildDetailedReading(chart,fortune,{daeun:analyzeDaeun(chart,{gender:'female',now})});
const originalReading=JSON.stringify(reading);

function mount(topic,{reading:report=reading,fortune:forecast=fortune}={}) {
  const dom=new JSDOM('<!doctype html><nav id="outside"></nav><div id="report-content"></div>',{url:'https://example.test/'});
  const doc=dom.window.document;globalThis.document=doc;doc.documentElement.dataset.reducedMotion='true';
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  const live=doc.getElementById('report-content'),host=doc.createElement('div');
  renderDetailedReport(host,{reading:report,fortune:forecast,topic});live.replaceChildren(host);
  return {dom,doc,host,live,select:host.querySelector('#reading-page-select'),
    current:()=>currentStory(host),outer:id=>followStory(host,id),close:()=>dom.window.close()};
}
function assertNoEvidence(h) {
  assert.equal(h.host.querySelector('#reading-evidence,#reading-method,#reading-sources,#reading-guide,#reading-glossary,.report-chapter,.reading-full-text,.source-entry,[data-fact-id],a[href*="-evidence"],a[href*="-chapter-"]'),null);
  assert.ok([...h.host.querySelectorAll('option,.reading-item-button')].every(item=>!/근거|계산·해석|계산 단원|자료 출처/.test(item.textContent)));
}
// One complete user-driven traversal covers every retained source and meter. Subsequent
// focused scenarios use only the affected topics rather than repeating it.
test('every selected interpretation keeps its original prose and scores while removed readings never return through next',()=>{
  const h=mount('all');
  try {
    const scenes=collectStories(h.host),used=new Set(),units=selectedGeneralUnits(reading);
    assert.equal(units.length,177,'the independent selection fixture covers every retained scored source unit');
    for(const item of units) {
      const parts=storiesForItem(scenes,item,{used}),label=item.id||item.title||item.label||item.headline;
      assertSummaryAndScore(parts,item,label);
      if(item.paragraphs)assertOriginalParagraphs(parts,item.paragraphs,label);
      else if(item.text)assertOriginalParagraphs(parts,[item.text],label);
    }
    const panels=scenes.flatMap(scene=>scene.scores);
    const available=units.filter(item=>item.readingScore.available).length;
    assert.equal(panels.length,units.length);assert.equal(panels.filter(panel=>panel.status==='available').length,available);
    assert.equal(panels.filter(panel=>panel.status==='unavailable').length,units.length-available);
    assert.equal(panels.flatMap(panel=>panel.meters).length,available*2,'every retained item has both original independent bars');
    assert.ok(panels.some(panel=>panel.meters.length===2&&panel.meters[0].value+panel.meters[1].value!==100),
      'independent wind values are never normalized into a complementary pair');
    assert.ok(scenes.every(scene=>!isRemovedGeneralStory(scene)),'removed cards, advice, supplements and timing panels are absent from the actual reading order');
    for(const item of [...reading.reader.supplements.lifelong,...reading.reader.supplements.annual,
      ...reading.reader.supplements.months.flatMap(month=>month.cards)]) {
      assert.equal(scenes.some(scene=>scene.kind==='scope'&&scene.text.includes(item.scopeNotice)),false,
        `${item.id}: an explanation of a deleted supplement does not survive as a guidance page`);
    }
    assert.equal(h.host.querySelector('dialog.story-menu details'),null,'retained items are directly selectable without expanding a group');
    assertNoEvidence(h);assert.equal(JSON.stringify(reading),originalReading,'display changes preserve calculation and complete copy data');
  } finally {h.close();}
});

test('each purchased category starts with one direct summary and exposes only its own topic choices',()=>{
  for(const topic of ['lifelong','annual','monthly','all']) {
    const h=mount(topic);
    try {
      const first=h.current(),source=topic==='annual'?reading.reader.annual:topic==='monthly'?reading.reader.months.find(month=>month.month===11):reading.personPortrait;
      assert.equal(first.querySelector('.story-title').textContent,source.summaryLines[0]);
      assert.equal(first.querySelector('[data-story-summary-index="1"]').textContent,source.summaryLines[1]);
      assert.equal(first.querySelectorAll('.saju-wind-meter[role="meter"]').length,2);
      assert.equal(h.host.querySelector('.reading-map,.map-return,.reading-item-picker'),null);
      assert.equal(h.host.querySelector('dialog.story-menu').open,false);
      const domains=[...h.host.querySelectorAll('.reading-domain-button')].map(button=>button.dataset.readingDomain);
      assert.equal(domains.includes('lifelong'),['lifelong','all'].includes(topic));
      assert.equal(domains.includes('annual'),['annual','all'].includes(topic));
      assert.equal(domains.includes('monthly'),['monthly','all'].includes(topic));
      assert.equal(domains.includes('daeun'),['lifelong','all'].includes(topic));
      assert.ok(domains.includes('information'));
      h.outer('reading-coverage');
      const scope=[];
      for(;;) {
        const scene=h.current();if(scene.dataset.storySource!=='reading-coverage')break;
        scope.push(...scene.querySelectorAll('.story-body > p'));
        const next=h.host.querySelectorAll('.reading-pager-step')[1];if(next.disabled)break;next.click();
      }
      assert.deepEqual(scope.map(p=>p.textContent).slice(0,reading.readingScope.paragraphs.length),reading.readingScope.paragraphs);
      for(const paragraph of reading.readingScope.paragraphs)assert.ok(reading.copyByCategory[topic].includes(paragraph));
      assertNoEvidence(h);
    } finally {h.close();}
  }
});

test('all eight life-topic scope boundaries remain in the chosen story and in its copy',()=>{
  const h=mount('lifelong');
  try {
    const scoped=reading.reader.lifelong.cards.filter(item=>item.scopeNotice);assert.equal(scoped.length,8);
    for(const item of scoped) {
      if(removedGeneralCards.has(item.id))h.outer('reading-coverage');
      else {
        const choice=[...h.host.querySelectorAll('.reading-item-button')].find(button=>button.textContent===item.label);
        assert.ok(choice);chooseStory(h.select,choice.dataset.readingTarget);
      }
      const source=h.current().dataset.storySource,parts=[];
      while(h.current().dataset.storySource===source) {
        parts.push(h.current().textContent);
        const next=h.host.querySelectorAll('.reading-pager-step')[1];if(next.disabled)break;next.click();
      }
      assert.ok(parts.some(text=>text.includes(item.scopeNotice)),`${item.id} scope is reached through next`);
      assert.ok(reading.copyByCategory.lifelong.includes(item.scopeNotice));assert.ok(reading.copyByCategory.all.includes(item.scopeNotice));
    }
  } finally {h.close();}
});

test('existing portrait, monthly and decade anchors reveal the correct flat story before focusing it',()=>{
  const h=mount('all');
  try {
    const first=reading.personPortrait.cards[0];
    const target=h.outer('person-portrait-topic-1');
    assert.equal(target.dataset.portraitCard,first.id);assert.ok(target.contains(h.doc.activeElement));
    for(const id of ['reading-lifelong','reading-annual','reading-months','reading-summary']) {
      const scene=h.outer(id);assert.ok(visible(scene));assert.ok(scene.contains(h.doc.activeElement),id);
    }
    const period=reading.daeun.periods[4],topic=period.situations[0];
    h.outer(topic.id);
    assert.equal(h.current().dataset.daeunTopic,topic.id);
    const context=h.current().querySelector('.story-context').textContent;
    assert.ok(context.includes(period.startLabel)&&context.includes(period.endLabel),'the exact decade dates accompany its topic');
    assert.equal(h.host.querySelector('.daeun-time-notice'),null,'a known time does not acquire an assumed-time warning');
    h.outer('reading-topics');assert.equal(h.host.querySelector('dialog.story-menu').open,true,'old contents anchors open the compact menu');
    assertNoEvidence(h);
  } finally {h.close();}
});

test('an unknown-time decade keeps its six-AM assumption with every chosen period and topic',()=>{
  const unknown=calculateSaju({year:1990,month:5,day:17,hour:null},{now}),forecast=analyzeFortune(unknown,{year:2026,now});
  const report=buildDetailedReading(unknown,forecast,{daeun:analyzeDaeun(unknown,{gender:'female',now})});
  const h=mount('lifelong',{reading:report,fortune:forecast});
  try {
    for(const id of ['reading-daeun',...report.daeun.periods.flatMap(period=>[period.id,...period.topics.map(topic=>topic.id),...period.situations.map(topic=>topic.id)])]) {
      const scene=h.outer(id),context=scene.querySelector('.story-context');
      assert.ok(context&&visible(context));assert.ok(context.textContent.includes(report.daeun.birthTimeNotice),id);
      assert.ok(scene.contains(h.doc.activeElement));
    }
    h.outer('reading-summary');assert.ok(!h.current().textContent.includes(report.daeun.birthTimeNotice),'the assumed time never relabels the natal reading');
    assert.equal(unknown.timeKnown,false);assert.equal(unknown.input.hour,null);
    assert.ok(report.copyByCategory.lifelong.includes(report.daeun.birthTimeNotice));assertNoEvidence(h);
  } finally {h.close();}
});

test('all twelve months keep their original date ranges while removed timing links cannot restore a duplicate report',()=>{
  const h=mount('monthly');
  try {
    for(const month of reading.reader.months) {
      h.outer(`reading-month-${month.month}-summary`);
      assert.equal(h.current().dataset.storySource,`reading-month-${month.month}`);
      assert.ok(h.current().querySelector('.story-context').textContent.includes(reading.months.find(item=>item.month===month.month).periodLabel));
      const current=h.current();
      assert.equal(restoreReadingPage(h.host,`reading-timings-month-${month.month}`),false,'a deleted timing-only anchor cannot reopen its old duplicate report');
      assert.equal(h.current(),current);
      assert.equal(h.current().dataset.storySource,`reading-month-${month.month}`);
      assert.ok(h.current().querySelector('.story-context').textContent.includes(reading.months.find(item=>item.month===month.month).periodLabel));
      assert.ok(h.current().contains(h.doc.activeElement));
    }
    h.outer('reading-month-periods');
    const source=h.current().dataset.storySource,texts=[];
    while(h.current().dataset.storySource===source) {
      texts.push(h.current().textContent);const next=h.host.querySelectorAll('.reading-pager-step')[1];if(next.disabled)break;next.click();
    }
    for(const month of reading.months)assert.ok(texts.join('').includes(month.periodLabel));
    assertNoEvidence(h);
  } finally {h.close();}
});

test('general and compatibility controls retain focus for repeated choices and deep links focus the visible scene',()=>{
  const h=mount('annual');
  try {
    const check=()=>{
      const select=h.host.querySelector('select.reading-page-select'),toggle=h.doc.getElementById(select.id+'-toggle');
      const options=[...select.options];
      chooseStory(select,options[2].value);assert.equal(h.doc.activeElement,toggle);
      const [previous,next]=h.host.querySelectorAll('.reading-pager-step'),start=select.value;
      next.focus();next.click();next.click();assert.equal(h.doc.activeElement,next);
      previous.focus();previous.click();previous.click();assert.equal(select.value,start);assert.equal(h.doc.activeElement,previous);
      previous.blur();const untouched=h.doc.activeElement;next.click();assert.equal(h.doc.activeElement,untouched);
      assert.ok(visible(currentStory(h.host)));
    };
    check();h.outer('reading-annual-summary');assert.ok(h.current().contains(h.doc.activeElement));
    const partner=calculateSaju({year:1992,month:3,day:14,hour:10,minute:20},{now});
    renderCompatibilityReport(h.host,buildCompatibilityReading(chart,partner));check();
    h.outer('compatibility-synthesis');assert.ok(h.current().contains(h.doc.activeElement));
  } finally {h.close();}
});

test('refresh restores the same paragraph of the same decade topic even when another period becomes current',()=>{
  const h=mount('lifelong');
  try {
    const period=reading.daeun.periods.find(item=>item.isCurrent),topic=period.topics[0];
    h.outer(topic.id);h.host.querySelectorAll('.reading-pager-step')[1].click();
    const saved=h.current().id;assert.equal(h.current().dataset.daeunTopic,topic.id);
    const later=new Date('2036-11-13T00:00:00Z'),forecast=analyzeFortune(chart,{year:2026,now:later});
    const updated=buildDetailedReading(chart,forecast,{daeun:analyzeDaeun(chart,{gender:'female',now:later})});
    assert.notEqual(updated.daeun.periods.find(item=>item.isCurrent).id,period.id);
    const prepared=h.doc.createElement('div');renderDetailedReport(prepared,{reading:updated,fortune:forecast,topic:'lifelong'});
    const focused=h.doc.getElementById('reading-page-select-toggle');focused.focus();let scrolls=0;
    h.dom.window.HTMLElement.prototype.scrollIntoView=function(){scrolls++;};
    assert.equal(restoreReadingPage(prepared,saved),true);assert.equal(h.doc.activeElement,focused);assert.equal(scrolls,0);
    h.live.replaceChildren(prepared);const restored=currentStory(prepared);
    assert.equal(restored.id,saved);assert.equal(restored.dataset.daeunTopic,topic.id);
    assert.ok(restored.querySelector('.story-context').textContent.includes(period.startLabel));
    assert.equal(restoreReadingPage(prepared,'missing-reading-page'),false);assert.equal(currentStory(prepared),restored);
  } finally {h.close();}
});
