import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createReadingProgress} from '../games/starlit-saju/reader-presentation.mjs';
import {createStoryReader,splitStoryText} from '../games/starlit-saju/story-reader.mjs';
import {createReadingScore} from '../games/starlit-saju/reading-score-view.mjs';
import {calculateSaju} from '../games/starlit-saju/engine.mjs';
import {analyzeFortune} from '../games/starlit-saju/fortune-data.mjs';
import {buildDetailedReading} from '../games/starlit-saju/readings.mjs';
import {buildCompatibilityReading} from '../games/starlit-saju/compatibility.mjs';
import {renderDetailedReport,renderCompatibilityReport} from '../games/starlit-saju/report-view.mjs';

const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
const {currentStory,chooseStory,followStory,collectStories,assertOriginalParagraphs,assertSummaryAndScore,visible}=require('./helpers/saju-story-ui.cjs');
const now=new Date('2026-11-20T00:00:00Z');
const chart=calculateSaju({year:1990,month:5,day:17,hour:8,minute:37},{now});

function environment(html='<nav id="outside"></nav><div id="report"></div>') {
  const dom=new JSDOM('<!doctype html>'+html,{url:'https://example.test/'});
  const doc=dom.window.document;globalThis.document=doc;
  doc.documentElement.dataset.reducedMotion='true';
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  return {dom,doc,host:doc.getElementById('report'),close:()=>dom.window.close()};
}
function checkProgress(host) {
  const progress=host.querySelector('.reading-progress');
  const counter=host.querySelector('.reading-page-position').textContent.match(/(\d+)\s*\/\s*(\d+)$/);
  assert.ok(counter);assert.equal(progress.getAttribute('aria-valuenow'),counter[1]);assert.equal(progress.getAttribute('aria-valuemax'),counter[2]);
  assert.ok(Math.abs(parseFloat(progress.firstChild.style.width)-Number(counter[1])/Number(counter[2])*100)<.0001);
}

test('sentence-sized story pieces preserve every original character and never truncate a long sentence',()=>{
  const text='첫 문장을 그대로 남겨요.  '+ '다음 문장은 생활 속의 예시를 설명해요. '.repeat(24)+'“따옴표도 남겨요!”\n마지막 문장도 보존해요.';
  const pieces=splitStoryText(text);
  assert.ok(pieces.length>2);assert.equal(pieces.map(piece=>piece.text).join(''),text);
  let offset=0;
  for(const piece of pieces) {
    assert.equal(piece.start,offset);assert.equal(piece.end-piece.start,piece.text.length);
    assert.ok(piece.text.length<=240);offset=piece.end;
  }
  const unbroken='생략할 수 없는 한 문장'.repeat(60)+'예요.';
  assert.deepEqual(splitStoryText(unbroken),[{text:unbroken,start:0,end:unbroken.length}]);
  assert.deepEqual(splitStoryText(''),[]);
});

test('source coverage accepts only whole summary repetitions and rejects lost meaning or mixed people',()=>{
  const repeat='이번에 쓸 금액을 먼저 정해 보세요.',unique='다만 이미 약속한 3.5만 원은 따로 남겨 두세요.';
  const snapshots=texts=>[
    {source:'source',topic:'money',kind:'summary',data:{personMarker:'A'},paragraphs:[],
      summaries:[{index:0,text:'지출을 미리 살펴보는 편이에요.'},{index:1,text:repeat}]},
    ...texts.map((text,index)=>({source:'source',topic:'money',kind:'prose',data:{personMarker:'A'},summaries:[],
      paragraphs:[{key:'p'+index,text,start:0,end:text.length}]})),
  ];
  const original=[repeat,repeat+' '+unique,'남은 비용도 서로 확인해 보세요.'];
  assertOriginalParagraphs(snapshots([unique,original[2]]),original,'permitted summary repetitions');
  assertOriginalParagraphs(snapshots(original),original,'uncompacted prose is still complete');
  for(const invalid of [[original[2]],[unique.replace('3.5','5.3'),original[2]],[original[2],unique]]) {
    assert.throws(()=>assertOriginalParagraphs(snapshots(invalid),original),{code:'ERR_ASSERTION'});
  }
  assert.throws(()=>assertOriginalParagraphs(snapshots([unique]),['“'+repeat+'”라는 말을 할 때도 '+unique]),{code:'ERR_ASSERTION'},
    'matching words inside a quoted example never excuse deleting that example');
  const mixed=snapshots([unique]);mixed[0].data.personMarker='B';
  assert.throws(()=>assertOriginalParagraphs(mixed,[repeat+' '+unique]),{code:'ERR_ASSERTION'},
    'another person’s summary cannot account for the omitted sentence');
});

test('a flat story shows its two real meters beside the summary and reconstructs all prose through next',()=>{
  const h=environment();
  try {
    const fortune=analyzeFortune(chart,{year:2026,now}),item=buildDetailedReading(chart,fortune).personPortrait;
    const source=h.doc.createElement('section');source.id='original-topic';source.dataset.readerCard='synthetic-story';
    source.innerHTML='<h3 class="reader-headline"></h3><div class="saju-two-line-summary"></div><div class="reader-prose"></div>';
    source.querySelector('h3').textContent=item.summaryLines[0];
    item.summaryLines.forEach(text=>{const p=h.doc.createElement('p');p.className='saju-summary-line';p.textContent=text;source.querySelector('.saju-two-line-summary').append(p);});
    source.querySelector('.saju-two-line-summary').after(createReadingScore(item.readingScore));
    for(const [index,text] of item.paragraphs.entries()) {
      const p=h.doc.createElement('p');p.textContent=text;p.id='paragraph-'+index;source.querySelector('.reader-prose').append(p);
    }
    h.host.append(source);
    const reader=createStoryReader(h.host,{pages:[{id:source.id,element:source,label:'성격',group:'평생운',domain:'lifelong'}]});
    const first=currentStory(h.host);
    assert.equal(first.querySelector('.story-title').textContent,item.summaryLines[0]);
    assert.equal(first.querySelectorAll('.saju-wind-meter[role="meter"]').length,2);
    assert.ok([...first.querySelectorAll('.saju-wind-meter')].every(visible));
    assert.equal(h.host.querySelector('dialog.story-menu').open,false);
    assert.equal(h.host.querySelector('.story-stage .reading-map,.story-stage details'),null);
    const scenes=collectStories(h.host);
    assertSummaryAndScore(scenes,item,'the synthetic topic');
    assertOriginalParagraphs(scenes,item.paragraphs,'the synthetic topic');
    assert.ok(scenes.every(scene=>scene.kind!=='score'),'general scores stay with their topic summary instead of taking another screen');
    assert.equal(reader.restore('paragraph-2'),true);
    const restored=currentStory(h.host);assert.ok(restored.querySelector('.story-body').textContent.includes(item.paragraphs[2].slice(0,30)));
    assert.equal(reader.restore('missing-paragraph'),false);assert.equal(currentStory(h.host),restored);
  } finally {h.close();}
});

test('reading progress exposes real positions and hides unsupported locations',()=>{
  const h=environment();
  try {
    const progress=createReadingProgress(h.doc);h.host.append(progress.element);
    progress.update(2,5,'5개 중 2번째 · 재물운');
    assert.equal(progress.element.getAttribute('role'),'progressbar');
    assert.equal(progress.element.getAttribute('aria-valuemin'),'0');
    assert.equal(progress.element.getAttribute('aria-valuemax'),'5');
    assert.equal(progress.element.getAttribute('aria-valuenow'),'2');
    assert.equal(progress.element.getAttribute('aria-valuetext'),'5개 중 2번째 · 재물운');
    assert.equal(progress.element.firstChild.style.width,'40%');
    progress.update(5,5);assert.equal(progress.element.firstChild.style.width,'100%');
    progress.update(0,5);assert.equal(progress.element.hidden,true);
    progress.update(1,3);assert.equal(progress.element.hidden,false);
  } finally {h.close();}
});

test('a paid report enters the story directly and its modal contents retain keyboard focus',()=>{
  const h=environment();
  try {
    const fortune=analyzeFortune(chart,{year:2026,now}),reading=buildDetailedReading(chart,fortune),copy=reading.copyByCategory.annual;
    renderDetailedReport(h.host,{reading,fortune,topic:'annual'});
    const first=currentStory(h.host);
    assert.equal(h.host.querySelector('.reading-map,.map-return'),null,'there is no extra map or repeated return control before the story');
    assert.equal(first.querySelectorAll('.saju-wind-meter[role="meter"]').length,2,'the initial summary visibly includes both independent bars');
    const select=h.host.querySelector('#reading-page-select'),toggle=h.doc.getElementById(select.id+'-toggle'),menu=h.host.querySelector('dialog.story-menu');
    assert.equal(menu.open,false);assert.equal(select.hidden,true);
    toggle.click();assert.equal(menu.open,true);assert.equal(toggle.getAttribute('aria-expanded'),'true');
    const domain=menu.querySelector('.reading-domain-button');domain.focus();domain.click();
    assert.equal(h.doc.activeElement,domain);assert.equal(menu.open,true);
    menu.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    assert.equal(menu.open,false);assert.equal(h.doc.activeElement,toggle);
    const choice=menu.querySelectorAll('[data-reading-target]')[1];chooseStory(select,choice.dataset.readingTarget);
    assert.equal(h.doc.activeElement,toggle,'choosing another topic returns focus to the closed contents button');
    checkProgress(h.host);
    const next=h.host.querySelectorAll('.reading-pager-step')[1];next.focus();const before=select.value;next.click();
    assert.notEqual(select.value,before);assert.equal(h.doc.activeElement,next);checkProgress(h.host);
    const target=followStory(h.host,'reading-annual-summary');
    assert.ok(target.contains(h.doc.activeElement),'a source anchor reveals its story before focusing it');
    assert.equal(reading.copyByCategory.annual,copy,'presentation never rewrites the copied report');
  } finally {h.close();}
});

test('related contents open one theme at a time while single choices and source links stay reachable',()=>{
  const h=environment();
  try {
    const ids=['portrait-decisions','natal-character','natal-money','natal-contracts','reading-symbols'];
    const pages=ids.map(id=>{
      const source=h.doc.createElement('section');source.id=id;source.dataset.readerCard=id;
      const heading=h.doc.createElement('h3');heading.className='reader-headline';heading.textContent=id;
      const prose=h.doc.createElement('p');prose.textContent=id+' 항목의 고유 설명이에요.';source.append(heading,prose);h.host.append(source);
      return {id,element:source,label:id,group:'평생운',domain:'lifelong'};
    });
    const reader=createStoryReader(h.host,{pages});
    const select=h.host.querySelector('#reading-page-select'),toggle=h.host.querySelector('.story-menu-button');
    const menu=h.host.querySelector('dialog.story-menu');toggle.click();
    const groups=[...menu.querySelectorAll('details.story-theme-group')];
    assert.deepEqual(groups.map(group=>group.dataset.readingTheme),['character','money','symbols']);
    const multi=groups.filter(group=>!group.classList.contains('story-theme-single'));
    assert.equal(multi.length,2);assert.ok(multi.every(group=>!group.open),'related subtopics begin collapsed');
    assert.ok(multi.every(group=>visible(group.querySelector('summary'))));
    assert.ok(multi.every(group=>[...group.querySelectorAll('.reading-item-button')].every(button=>!visible(button))));
    const single=groups.at(-1);assert.equal(single.open,true);
    assert.equal(single.querySelector('summary').hidden,true);assert.ok(visible(single.querySelector('.reading-item-button')),
      'a theme with one source needs no extra expanding step');
    const first=multi[0].querySelector('summary'),second=multi[1].querySelector('summary');
    first.focus();first.click();assert.equal(multi[0].open,true);assert.equal(h.doc.activeElement,first);
    second.focus();second.click();assert.equal(multi[0].open,false);assert.equal(multi[1].open,true);assert.equal(h.doc.activeElement,second);
    const before=select.value;
    second.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
    assert.equal(select.value,before,'keyboard activity in a theme never turns the background story');
    const target=multi[1].querySelectorAll('.reading-item-button')[1];assert.ok(visible(target));target.click();
    assert.equal(menu.open,false);assert.equal(h.doc.activeElement,toggle);
    assert.equal(currentStory(h.host).dataset.storySource,'natal-contracts');
    assert.equal(currentStory(h.host).dataset.readingTheme,'money');
    assert.equal(reader.restore('portrait-decisions'),true);
    const linked=currentStory(h.host);
    assert.equal(linked.dataset.storyTopic,'portrait-decisions');assert.equal(linked.dataset.readingTheme,'character');
    assert.equal(h.doc.activeElement,toggle,'passive restoration preserves the controls focus');
    toggle.click();
    const current=menu.querySelector('.reading-item-button[aria-current="page"]');assert.equal(current.dataset.readingTarget,linked.id);
    assert.equal(current.closest('.story-theme-group').classList.contains('is-current'),true);
    menu.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    assert.equal(menu.open,false);assert.equal(h.doc.activeElement,toggle);
  } finally {h.close();}
});

test('A and B remain identifiable in sequential stories and compatibility meters remain in the reading order',()=>{
  const h=environment();
  try {
    const partner=calculateSaju({year:1992,month:3,day:14,hour:10,minute:20},{now});
    const reading=buildCompatibilityReading(chart,partner);
    renderCompatibilityReport(h.host,reading,{names:[{name:'예시 A'},{name:'예시 B'}]});
    const scenes=collectStories(h.host);
    for(const [index,person] of reading.people.entries())for(const item of [person,...person.cards]) {
      const relevant=scenes.filter(scene=>scene.topic===item.id);
      assert.ok(relevant.length,`${item.id} is in the normal reading order`);
      assert.ok(relevant.every(scene=>scene.data.personMarker===(index===0?'A':'B')));
      assert.ok(relevant[0].label.includes(index===0?'A · 예시 A':'B · 예시 B'));
      assertSummaryAndScore(relevant,item,item.id);assertOriginalParagraphs(relevant,item.paragraphs,item.id);
    }
    const scores=scenes.filter(scene=>scene.kind==='score');assert.equal(scores.length,1);
    chooseStory(h.host.querySelector('#compatibility-page-select'),scores[0].id);
    const current=currentStory(h.host);
    assert.equal(current.querySelectorAll('.compatibility-score-meter[role="meter"]').length,reading.score.items.length);
    assert.equal(Number(current.querySelector('[data-score-total]').textContent.match(/\d+/)[0]),reading.score.total);
    checkProgress(h.host);
  } finally {h.close();}
});

test('replacing a paid reader binds one keyboard turn and never turns the story from its open contents',()=>{
  const h=environment();
  try {
    const fortune=analyzeFortune(chart,{year:2026,now}),reading=buildDetailedReading(chart,fortune);
    const partner=calculateSaju({year:1992,month:3,day:14,hour:10,minute:20},{now});
    for(const render of [
      ()=>renderDetailedReport(h.host,{reading,fortune,topic:'lifelong'}),
      ()=>renderDetailedReport(h.host,{reading,fortune,topic:'annual'}),
      ()=>renderCompatibilityReport(h.host,buildCompatibilityReading(chart,partner)),
    ]) {
      render();const select=h.host.querySelector('select.reading-page-select'),options=[...select.options];
      const before=options.findIndex(option=>option.value===select.value);
      currentStory(h.host).dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
      assert.equal(select.value,options[before+1].value,'one key advances one scene after each replacement');
      h.doc.getElementById(select.id+'-toggle').click();const saved=select.value,menu=h.host.querySelector('dialog.story-menu');
      menu.querySelector('.story-menu-title').dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
      assert.equal(select.value,saved,'keyboard activity in the open contents never advances the background story');
      menu.querySelector('.story-menu-close').click();
    }
  } finally {h.close();}
});
