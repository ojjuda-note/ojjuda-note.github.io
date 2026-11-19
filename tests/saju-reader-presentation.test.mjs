import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {presentReadingStories,createReadingProgress} from '../games/starlit-saju/reader-presentation.mjs';
import {calculateSaju} from '../games/starlit-saju/engine.mjs';
import {analyzeFortune} from '../games/starlit-saju/fortune-data.mjs';
import {buildDetailedReading} from '../games/starlit-saju/readings.mjs';
import {buildCompatibilityReading} from '../games/starlit-saju/compatibility.mjs';
import {renderDetailedReport,renderCompatibilityReport} from '../games/starlit-saju/report-view.mjs';

const {JSDOM}=createRequire(import.meta.url)('jsdom');
const now=new Date('2026-11-20T00:00:00Z');
const chart=calculateSaju({year:1990,month:5,day:17,hour:8,minute:37},{now});

function environment(html='<nav id="outside"></nav><div id="report"></div>') {
  const dom=new JSDOM('<!doctype html>'+html,{url:'https://example.test/'});
  const doc=dom.window.document;globalThis.document=doc;
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  return {dom,doc,host:doc.getElementById('report'),close:()=>dom.window.close()};
}
function follow(link) {link.addEventListener('click',event=>event.preventDefault(),{once:true});link.click();}
function visible(element) {
  if(!element||element.closest('[hidden]'))return false;
  for(let parent=element.parentElement;parent;parent=parent.parentElement) {
    if(parent.tagName==='DETAILS'&&!parent.open&&!parent.querySelector(':scope > summary')?.contains(element))return false;
  }
  return true;
}

test('a native disclosure preserves the actual prose nodes and keeps uncertainty outside it',()=>{
  const h=environment(`<div id="report"><article id="summarized">
    <h4>내 모습</h4><div class="saju-two-line-summary"><p>핵심 풀이</p><p>해볼 일</p></div>
    <div id="story" class="report-prose reader-prose" data-original="yes"><h5 class="reading-body-heading">생활 속 모습</h5><p id="first">원래 첫 문단</p><p>원래 두 번째 문단</p><p class="reader-scope-note">태어난 시간은 확인하지 못했어요.</p></div>
    </article><article id="unsummarized"><h4>기본 설명</h4><div class="reader-prose"><p>별도의 요약이 없는 설명은 바로 읽을 수 있어야 해요.</p></div></article></div>`);
  try {
    const first=h.doc.getElementById('first');
    presentReadingStories(h.host);
    const details=h.doc.getElementById('story');
    assert.equal(details.tagName,'DETAILS');assert.equal(details.open,false);
    assert.equal(details.dataset.original,'yes');assert.equal(h.doc.getElementById('first'),first);
    assert.deepEqual([...details.querySelectorAll(':scope > p')].map(p=>p.textContent),['원래 첫 문단','원래 두 번째 문단']);
    assert.ok(visible(h.host.querySelector('.saju-two-line-summary')));
    const notice=h.host.querySelector('.reader-scope-note');assert.ok(visible(notice));
    assert.equal(notice.closest('.reading-story-details'),null);
    assert.equal(visible(first),false);
    details.querySelector('summary').click();assert.ok(visible(first));
    details.querySelector('summary').click();assert.equal(visible(first),false);
    assert.equal(h.doc.getElementById('unsummarized').querySelector('details'),null);
    assert.ok(visible(h.doc.getElementById('unsummarized').querySelector('p')));
    presentReadingStories(h.host);assert.equal(h.host.querySelectorAll('details').length,1,'presentation is idempotent');
  } finally {h.close();}
});

test('an inline decade summary and its score stay visible while the full paragraph order is preserved',()=>{
  const h=environment(`<div id="report"><div class="reader-prose"><h4 class="reader-headline">긴 흐름</h4>
    <div class="saju-two-line-summary"><p>첫 요약</p><p>둘째 요약</p></div><div class="saju-reading-score">순풍 40점</div>
    <h5 class="reading-body-heading">이번 구간</h5><p>첫 문단</p><h5 class="reading-body-heading">생활 예시</h5><p>두 번째 문단</p>
    <p class="reader-scope-note">오전 6시를 기준으로 계산했어요.</p></div></div>`);
  try {
    presentReadingStories(h.host);
    const details=h.host.querySelector('.reading-story-inline');assert.ok(details);assert.equal(details.open,false);
    assert.deepEqual([...details.children].slice(1).map(item=>item.textContent),['이번 구간','첫 문단','생활 예시','두 번째 문단']);
    for(const selector of ['.saju-two-line-summary','.saju-reading-score','.reader-scope-note','.reader-headline'])assert.ok(visible(h.host.querySelector(selector)));
    details.querySelector('summary').click();assert.ok([...details.querySelectorAll('p')].every(visible));
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

test('the report starts with summaries, keeps fields inside its menu and expands deep links before focus',()=>{
  const h=environment();
  try {
    const fortune=analyzeFortune(chart,{year:2026,now}),reading=buildDetailedReading(chart,fortune);
    const copy=reading.copyByCategory.annual;
    renderDetailedReport(h.host,{reading,fortune,topic:'annual'});
    follow(h.host.querySelector('.map-deep-link'));
    const current=h.host.querySelector('[data-reader-current]');
    const details=current.querySelector('.reading-story-details');
    assert.ok(details);assert.equal(details.open,false);
    assert.ok(visible(current.querySelector('.saju-two-line-summary')));
    assert.ok(visible(current.querySelector('.saju-reading-score')));
    const picker=h.host.querySelector('.reading-item-picker');
    assert.equal(picker.open,false);assert.ok(picker.contains(h.host.querySelector('.reading-domain-nav')));
    picker.querySelector('summary').click();assert.equal(picker.open,true);
    const active=h.host.querySelector('.reading-domain-button[aria-pressed="true"]');
    active.focus();active.click();assert.equal(picker.open,true);assert.equal(h.doc.activeElement,active);
    picker.querySelector('summary').click();assert.equal(picker.open,false);
    const target=details.querySelector('p');target.id='full-story-target';target.tabIndex=-1;
    const link=h.doc.createElement('a');link.href='#'+target.id;h.doc.getElementById('outside').append(link);
    follow(link);assert.equal(details.open,true);assert.ok(visible(target));assert.equal(h.doc.activeElement,target);
    const progress=h.host.querySelector('.reading-progress');
    const check=()=>{
      const counter=h.host.querySelector('.reading-page-position').textContent.match(/(\d+) \/ (\d+)$/);
      assert.ok(counter);assert.equal(progress.getAttribute('aria-valuenow'),counter[1]);assert.equal(progress.getAttribute('aria-valuemax'),counter[2]);
      assert.ok(Math.abs(parseFloat(progress.firstChild.style.width)-Number(counter[1])/Number(counter[2])*100)<.0001);
    };
    check();const before=h.host.querySelector('[data-reader-current]');
    h.host.querySelectorAll('.reading-pager-step')[1].click();
    assert.notEqual(h.host.querySelector('[data-reader-current]'),before);check();
    assert.equal(reading.copyByCategory.annual,copy,'display changes do not alter the complete copied reading');
  } finally {h.close();}
});

test('each person keeps an independent closed explanation and compatibility progress follows its controls',()=>{
  const h=environment();
  try {
    const partner=calculateSaju({year:1992,month:3,day:14,hour:10,minute:20},{now});
    renderCompatibilityReport(h.host,buildCompatibilityReading(chart,partner));
    follow(h.host.querySelector('.map-topic[href="#compatibility-people-overview"]'));
    const current=h.host.querySelector('[data-compatibility-current]');
    const details=[...current.querySelectorAll('.compatibility-person-reading .reading-story-details')];
    assert.equal(details.length,2);assert.ok(details.every(item=>!item.open));
    assert.ok([...current.querySelectorAll('.compatibility-two-line-summary')].every(visible));
    details[0].querySelector('summary').click();assert.equal(details[0].open,true);assert.equal(details[1].open,false);
    const progress=h.host.querySelector('.reading-progress'),before=Number(progress.getAttribute('aria-valuenow'));
    h.host.querySelector('[data-compatibility-step="next"]').click();
    assert.equal(Number(progress.getAttribute('aria-valuenow')),before+1);
    h.host.querySelector('[data-compatibility-step="previous"]').click();
    assert.equal(Number(progress.getAttribute('aria-valuenow')),before);
  } finally {h.close();}
});
