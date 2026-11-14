import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {calculateSaju} from '../games/starlit-saju/engine.mjs';
import {analyzeFortune} from '../games/starlit-saju/fortune-data.mjs';
import {analyzeDaeun} from '../games/starlit-saju/daeun.mjs';
import {buildDetailedReading} from '../games/starlit-saju/readings.mjs';
import {buildCompatibilityReading} from '../games/starlit-saju/compatibility.mjs';
import {renderDetailedReport,renderCompatibilityReport,restoreReadingPage} from '../games/starlit-saju/report-view.mjs';

const {JSDOM}=createRequire(import.meta.url)('jsdom');
const {selectReadingItem}=createRequire(import.meta.url)('./helpers/saju-ui-harness.cjs');
const now=new Date('2026-11-13T00:00:00Z');
const chart=calculateSaju({year:1990,month:5,day:17,hour:8,minute:37},{now});
const fortune=analyzeFortune(chart,{year:2026,now});
const reading=buildDetailedReading(chart,fortune,{daeun:analyzeDaeun(chart,{gender:'female',now})});
const originalReading=JSON.stringify(reading);

function visible(element) {
  if(!element||element.closest('[hidden]'))return false;
  for(let parent=element.parentElement;parent;parent=parent.parentElement) {
    if(parent.tagName==='DETAILS'&&!parent.open&&!parent.querySelector(':scope > summary')?.contains(element))return false;
  }
  return true;
}
function assertCurrentBody(element) {
  assert.ok(visible(element),'the selected reading is visible');
  assert.equal(element.querySelector('details.reading-body-details'),null,'a selected explanation never needs a second disclosure');
  const owner=element.matches('[data-compatibility-current]')?'[data-compatibility-page]':'[data-reader-page]';
  const paragraphs=[...element.querySelectorAll('.reader-prose > p,.compatibility-person-prose > p')]
    .filter(paragraph=>paragraph.closest(owner)===element);
  assert.ok(paragraphs.every(visible),'all paragraphs owned by the current reading are immediately readable');
}
function mount(topic,{reading:report=reading,fortune:forecast=fortune}={}) {
  const dom=new JSDOM('<!doctype html><nav id="outside"></nav><div id="report-content"></div>',{url:'https://example.test/'});
  const doc=dom.window.document;globalThis.document=doc;
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  const live=doc.getElementById('report-content'),host=doc.createElement('div');
  renderDetailedReport(host,{reading:report,fortune:forecast,topic});
  live.replaceChildren(host);
  const select=doc.getElementById('reading-page-select');
  const current=()=>host.querySelector('[data-reader-current]');
  const pick=id=>selectReadingItem(select,id);
  const outer=id=>{
    const link=doc.createElement('a');link.href='#'+id;
    link.addEventListener('click',event=>event.preventDefault());
    doc.getElementById('outside').append(link);link.click();link.remove();
  };
  const paragraphs=()=>[...host.querySelectorAll('p:not(.reading-page-position)')].map(node=>node.textContent);
  return {dom,doc,host,live,select,current,pick,outer,paragraphs,close:()=>dom.window.close()};
}
function assertSummary(h,element,expected) {
  assert.ok(element,'the requested reading item remains present');
  const group=element.matches('.saju-two-line-summary')?element:element.querySelector('.saju-two-line-summary');
  assert.ok(group,`${element.id||element.className}: the requested item has a two-unit summary`);
  assert.equal(group.getAttribute('role'),'group');
  assert.equal(group.getAttribute('aria-label'),'두 줄 요약');
  const lines=[...group.querySelectorAll('.saju-summary-line')];
  assert.equal(lines.length,2,'headings and paragraphs may both carry a summary unit');
  assert.deepEqual(lines.map(line=>line.textContent),expected);
  const page=element.closest('[data-reader-page]');
  assert.ok(page,'the item is reachable through the existing reading navigation');
  if(h.current()!==page)h.outer(page.id);
  assert.ok(visible(group),'requesting an item exposes both summary units without another disclosure');
  assert.ok(lines.every(visible));
  return group;
}
function assertNoEvidence(h) {
  assert.equal(h.host.querySelector('#reading-evidence,#reading-method,#reading-sources,#reading-guide,#reading-glossary,.report-chapter,.reading-full-text,.source-entry,[data-fact-id],a[href*="-evidence"],a[href*="-chapter-"]'),null,'the report contains no calculation tables, source panels or evidence links');
  assert.ok([...h.select.options].every(option=>!/근거|계산·해석|계산 단원|자료 출처/.test(option.textContent)),'the picker contains reading items without evidence menus');
}
function assertReadingScore(h,summary,expected) {
  assert.ok(expected,'every summarized item declares its scoring availability');
  const point=summary.classList.contains('reader-timing-point');
  const panel=point?summary.querySelector(':scope > .saju-reading-score'):summary.nextElementSibling;
  assert.ok(panel?.classList.contains('saju-reading-score'),'each item keeps its own score immediately after the two summary units');
  assert.equal(panel.dataset.readingScoreStatus,expected.status);
  assert.ok(visible(panel),'the selected item reveals its score or unavailable notice');
  assert.equal(panel.querySelector('details,[data-fact-id]'),null,'score formulas and calculation evidence are not exposed');
  if(point) {
    assert.equal(panel.tagName,'DD','timing points retain their definition-list structure');
    assert.equal(summary.querySelectorAll(':scope > .saju-summary-line')[1].nextElementSibling,panel);
  }
  const meters=[...panel.querySelectorAll('.saju-wind-meter[role="meter"]')];
  if(expected.status==='unavailable') {
    assert.equal(expected.available,false);
    assert.equal(meters.length,0,'unsupported readings never show invented zero scores');
    assert.equal(panel.querySelector('.saju-wind-fill'),null);
    assert.ok(panel.textContent.includes(expected.reason),'the unavailable reason remains readable');
    assert.doesNotMatch(panel.textContent,/(?:순풍|역풍)\s*\d+\s*점/);
    return;
  }
  assert.equal(expected.available,true);assert.equal(meters.length,2);
  const rows=[...panel.querySelectorAll('.saju-wind-item')];
  assert.deepEqual(rows.map(row=>row.dataset.wind),['tailwind','headwind']);
  for(const row of rows) {
    const value=expected[row.dataset.wind],meter=row.querySelector('.saju-wind-meter');
    assert.ok(Number.isInteger(value.value)&&value.value>=0&&value.value<=100);
    assert.equal(meter.getAttribute('aria-valuemin'),'0');assert.equal(meter.getAttribute('aria-valuemax'),'100');
    assert.equal(meter.getAttribute('aria-valuenow'),String(value.value));
    assert.equal(meter.querySelector('.saju-wind-fill').style.width,`${value.value}%`,'each bar uses its own 0–100 score without normalizing the pair');
    const name=meter.getAttribute('aria-label')||(meter.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>h.doc.getElementById(id)?.textContent||'').join(' ');
    assert.ok(name.includes(value.label),'each meter has the correct accessible name');
    assert.ok(row.textContent.includes(value.label)&&row.textContent.includes(`${value.value}점`),'the number and direction are readable without color');
  }
}

test('every reading family exposes two summary units and its complete body without a second click',()=>{
  const h=mount('all');
  try {
    const before=h.paragraphs(),checks=[];
    const add=(element,source,selector=':scope > .reader-prose > p',paragraphs=source.paragraphs)=>checks.push({element,source,selector,paragraphs});
    const overview=(id,source)=>{
      add(h.doc.querySelector(`#${id} .reader-intro`),source);
      for(const card of source.cards)add(h.host.querySelector(`[data-reader-card="${card.id}"]`),card);
    };
    overview('reading-lifelong-summary',reading.reader.lifelong);
    overview('reading-annual-summary',reading.reader.annual);
    for(const month of reading.reader.months)overview(`reading-month-${month.month}-summary`,month);
    add(h.host.querySelector('.portrait-intro'),reading.personPortrait);
    for(const card of reading.personPortrait.cards)add(h.host.querySelector(`.portrait-card[data-portrait-card="${card.id}"]`),card);
    for(const card of h.host.querySelectorAll('.month-spotlight-card')) {
      const month=Number(card.querySelector('a').hash.match(/(\d+)$/)[1]);
      add(card,reading.reader.months.find(item=>item.month===month),null,null);
    }
    add(h.doc.querySelector('#reading-daeun > .reader-prose'),reading.daeun,':scope > p');
    for(const period of reading.daeun.periods) {
      add(h.host.querySelector(`[data-daeun-period="${period.id}"]`),period,'.daeun-period-body > .reader-prose > p');
      for(const topic of [...period.topics,...(period.situations||[])])add(h.host.querySelector(`[data-daeun-topic="${topic.id}"]`),topic);
    }
    add(h.doc.querySelector('#reading-symbols .reader-intro'),reading.reader.symbols);
    const symbols=[...h.host.querySelectorAll('.reader-symbol-item')];
    assert.equal(symbols.length,reading.reader.symbols.items.length);
    reading.reader.symbols.items.forEach((item,index)=>add(symbols[index],item,':scope > .reader-prose > p',item.paragraphs||[item.description]));
    add(h.doc.querySelector('#reading-timings .reader-intro'),reading.reader.timings);
    for(const item of reading.reader.timings.items) {
      const article=h.host.querySelector(`.reader-timing-card[data-month="${item.month}"]`);
      add(article,item,'.reader-timing-content > .reader-prose > p');
      const points=[...article.querySelectorAll('.reader-timing-point')];
      const expected=[...item.cautions,...item.opportunities,...item.people,...item.documents];
      assert.equal(points.length,expected.length);
      expected.forEach((point,index)=>{
        add(points[index],point,null,null);
        assert.equal([...points[index].querySelectorAll(':scope > dd:not(.saju-reading-score)')].map(part=>part.textContent).join(''),point.text,'the summary and remaining timing explanation retain every original character');
      });
    }
    for(const {element,source,selector,paragraphs} of checks) {
      const group=assertSummary(h,element,source.summaryLines);
      assertReadingScore(h,group,source.readingScore);
      if(!selector)continue;
      const body=[...element.querySelectorAll(selector)].filter(paragraph=>!paragraph.closest('.saju-two-line-summary'));
      assert.deepEqual(body.map(paragraph=>paragraph.textContent),paragraphs,'summary presentation preserves every original body paragraph');
      assert.ok(body.length>0&&body.every(visible),'selecting the item immediately reveals every authored paragraph');
      assert.ok(body.every(paragraph=>!paragraph.closest('details.reading-body-details')),'the summary cannot replace the purchased full explanation');
      if(source.detailSections) {
        const prose=body[0].parentElement;
        assert.deepEqual([...prose.querySelectorAll(':scope > .reading-body-heading')].map(heading=>heading.textContent),source.detailSections.map(section=>section.title),'meaningful section headings retain their authored order');
        assert.deepEqual(body.map(paragraph=>Number(paragraph.dataset.readingDetailSection)),source.detailSections.flatMap((section,index)=>section.paragraphs.map(()=>index)),'every paragraph stays attached to its own explanation heading');
        assert.deepEqual(source.detailSections.flatMap(section=>section.paragraphs),paragraphs);
      }
      assert.ok(group.compareDocumentPosition(body[0])&h.dom.window.Node.DOCUMENT_POSITION_FOLLOWING,'the two summary units precede the full explanation');
    }
    assert.deepEqual(h.paragraphs(),before,'visiting summaries never rewrites or removes the purchased prose');
    assert.equal(JSON.stringify(reading),originalReading,'rendering summaries leaves calculation and copied report data intact');
    assertNoEvidence(h);
    assert.ok(checks.some(({source})=>source.readingScore.available),'supported interpretation items retain their two independent scores');
    assert.ok(checks.some(({source})=>!source.readingScore.available),'unsupported interpretation items retain an unavailable explanation');
  } finally {h.close();}
});

test('the compact picker keeps every purchased paragraph while exposing only the selected reading unit',()=>{
  for(const topic of ['lifelong','annual','monthly','all']) {
    const h=mount(topic);
    try {
      const before=h.paragraphs();
      assert.equal(h.host.firstElementChild.className,'reading-pager');
      assertNoEvidence(h);
      assert.ok(visible(h.current()));
      assertCurrentBody(h.current());
      assert.equal(h.current().id,topic==='monthly'?'reading-month-11':'reading-summary');
      assert.ok([...h.select.options].filter(option=>option.closest('optgroup')?.label!=='생활 제안').length<=60,'month and decade details keep the primary reading list compact while existing practical suggestions remain reachable');
      for(const option of [...h.select.options]) {
        h.pick(option.value);assert.ok(visible(h.current()),option.textContent);
        assert.equal(h.host.querySelectorAll('[data-reader-current]').length,1);
        assertCurrentBody(h.current());
      }
      assert.deepEqual(h.paragraphs(),before,'navigation neither rewrites nor removes the original prose');
      assert.equal(Boolean(h.doc.getElementById('reading-lifelong')),['lifelong','all'].includes(topic));
      assert.equal(Boolean(h.doc.getElementById('reading-annual')),['annual','all'].includes(topic));
      assert.equal(h.host.querySelectorAll('.month-reading').length,['monthly','all'].includes(topic)?12:0);
      assert.equal(JSON.stringify(reading),originalReading,'the report and its complete copied readings are unchanged');
    } finally {h.close();}
  }
});

test('personal supplementary explanations remain behind the main topics and keep their full copy without evidence or invented scores',()=>{
  const h=mount('all');
  try {
    const before=h.paragraphs();
    const supplements=reading.reader.supplements;
    const contexts=[
      {source:supplements.lifelong,scope:h.doc.getElementById('reading-lifelong'),last:reading.reader.lifelong.cards.at(-1)},
      {source:supplements.annual,scope:h.doc.getElementById('reading-annual'),last:reading.reader.annual.cards.at(-1)},
      ...supplements.months.map(month=>({source:month.cards,scope:h.doc.getElementById(`reading-month-${month.month}`),
        last:reading.reader.months.find(value=>value.month===month.month).cards.at(-1)})),
    ];
    for(const {source,scope,last} of contexts) {
      const main=scope.querySelector(`[data-reader-card="${last.id}"]`);
      const pickPage=element=>{
        if(scope.classList.contains('month-reading')) {
          h.pick(scope.id);
          const link=scope.querySelector(`.reading-page-sections a[href="#${element.id}"]`);
          assert.ok(link,`${element.id}: the month overview links to its additional explanation`);
          link.click();
        } else h.pick(element.id);
      };
      for(const item of source) {
        const element=scope.querySelector(`[data-reading-supplement="${item.id}"]`);
        assert.ok(element,`${item.id}: a useful explanation cannot disappear with its calculation chapter`);
        assert.ok(main.compareDocumentPosition(element)&h.dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
          'the main personal topics remain before optional additional explanations');
        pickPage(element);
        assert.equal(h.current(),element);assertCurrentBody(element);
        assertSummary(h,element,item.summaryLines);
        assert.deepEqual([...element.querySelectorAll(':scope > .reader-prose > p')].map(p=>p.textContent),item.paragraphs);
        assert.deepEqual([...element.querySelectorAll('.reading-body-heading')].map(p=>p.textContent),item.detailSections.map(section=>section.title));
        const notice=element.querySelector(':scope > .reader-scope-note');
        assert.equal(notice.textContent,item.scopeNotice);assert.ok(visible(notice));
        assert.equal(element.querySelector('.saju-reading-score,[role="meter"]'),null,
          'the source classification is not converted into an unsupported score');
        assert.equal(element.querySelector(':scope > .reader-label').textContent,'추가 해설');
        assert.equal(h.host.querySelectorAll('[data-reader-current]').length,1);
        let cursor=0;
        for(const text of [item.label,'추가 해설',...item.summaryLines,...item.detailSections.flatMap(section=>[section.title,...section.paragraphs]),item.scopeNotice]) {
          const index=reading.copyByCategory.all.indexOf(text,cursor);
          assert.ok(index>=cursor,`${item.id}: visible text is missing or reordered in the copy`);cursor=index+text.length;
        }
      }
      pickPage(main);
      h.host.querySelectorAll('.reading-pager-step')[1].click();
      assert.equal(h.current().dataset.readingSupplement,source[0].id,
        'the next-reading action reaches additional interpretation after the main topics');
    }
    assertNoEvidence(h);
    assert.deepEqual(h.paragraphs(),before,'visiting added explanations does not rewrite any purchased paragraph');
  } finally {h.close();}
});

test('all eight existing life-topic scope notices are visible with their selected body and retained in copies',()=>{
  const h=mount('lifelong');
  try {
    const scoped=reading.reader.lifelong.cards.filter(item=>item.scopeNotice);
    assert.equal(scoped.length,8,'the requested family, health and life-situation boundaries are all covered');
    for(const item of scoped) {
      const element=h.host.querySelector(`[data-reader-card="${item.id}"]`);
      h.pick(element.id);
      const notice=element.querySelector(':scope > .reader-scope-note');
      assert.ok(notice,`${item.id}: a scope note must not disappear when calculation records are hidden`);
      assert.equal(notice.textContent,item.scopeNotice);assert.ok(visible(notice));
      assert.ok(reading.copyByCategory.lifelong.includes(item.scopeNotice));
      assert.ok(reading.copyByCategory.all.includes(item.scopeNotice));
      assert.equal(notice.closest('.reading-full-text,.support-details,.chapter-evidence'),null);
    }
    assertNoEvidence(h);
  } finally {h.close();}
});

test('portrait tables, outer contents and decade topics reveal their reading without evidence menus',()=>{
  const h=mount('all');
  try {
    assert.equal(h.host.querySelector('.daeun-time-notice'),null,'a known birth time has no assumption notice');
    const first=h.host.querySelector('.portrait-card');assert.equal(visible(first),false);
    h.host.querySelector('.portrait-summary-table tbody a').click();
    assert.equal(h.current(),first);assert.ok(visible(first));
    assert.equal([...h.host.querySelectorAll('.portrait-card,.reader-card')].filter(visible).length,1);
    assertNoEvidence(h);
    for(const id of ['reading-topics','reading-lifelong','reading-annual','reading-months','reading-summary']) {
      h.outer(id);assert.ok(visible(h.doc.getElementById(id)),id);assert.ok(visible(h.current()));
      assert.equal(h.doc.activeElement,h.doc.getElementById(id));
    }
    h.pick('reading-daeun');
    assert.match(h.select.selectedOptions[0].textContent,/대운 · 10년 흐름/);
    h.doc.querySelector('#reading-daeun .daeun-nav a').click();
    const period=h.current();assert.ok(period.classList.contains('daeun-period'));
    const situation=[...period.querySelectorAll('.daeun-topic')][4];assert.ok(situation,'the actual extra decade situations are navigable');
    period.querySelector(`.reading-page-sections a[href="#${situation.id}"]`).click();
    assert.equal(h.current(),situation);assert.ok(visible(situation));
    assert.ok(visible(period.querySelector('.daeun-dates')),'period dates remain visible beside a selected decade topic');
    assert.equal([...period.querySelectorAll('.daeun-topic')].filter(visible).length,1);
  } finally {h.close();}
});

test('an unknown-time decade stays reachable and keeps its six-AM notice beside every selected period and topic',()=>{
  const unknownChart=calculateSaju({year:1990,month:5,day:17,hour:null},{now});
  const forecast=analyzeFortune(unknownChart,{year:2026,now});
  const report=buildDetailedReading(unknownChart,forecast,{daeun:analyzeDaeun(unknownChart,{gender:'female',now})});
  const h=mount('lifelong',{reading:report,fortune:forecast});
  try {
    h.pick('reading-daeun');
    const notice=h.host.querySelector('.daeun-time-notice');
    assert.equal(notice.textContent,report.daeun.birthTimeNotice);
    assert.ok(visible(notice));
    assert.ok(notice.previousElementSibling.classList.contains('report-section-heading'),'the assumption is stated immediately below the decade heading');
    h.doc.querySelector('#reading-daeun .daeun-nav a').click();
    const period=h.current();
    assert.ok(period.classList.contains('daeun-period'));assert.ok(visible(notice));
    const topic=period.querySelector('.daeun-topic');
    period.querySelector(`.reading-page-sections a[href="#${topic.id}"]`).click();
    assert.equal(h.current(),topic);assert.ok(visible(topic));assert.ok(visible(notice));
    assert.ok(visible(period.querySelector('.daeun-dates')));
    assert.equal(h.host.querySelectorAll('.daeun-time-notice').length,1);
    assert.equal(unknownChart.timeKnown,false);
    assertNoEvidence(h);
    h.pick('reading-summary');assert.equal(visible(notice),false,'the decade assumption does not relabel the natal reading');
  } finally {h.close();}
});

test('a chosen month opens one inner topic and every comparison-table destination without evidence',()=>{
  const h=mount('monthly');
  try {
    const before=h.paragraphs();h.pick('reading-month-12');
    const month=h.current(),card=month.querySelector('.reader-card');
    month.querySelector(`.reading-page-sections a[href="#${card.id}"]`).click();
    assert.equal(h.current(),card);assert.ok(visible(card));
    assert.ok(visible(month.querySelector('.month-period')));
    assert.equal([...h.host.querySelectorAll('.reader-card')].filter(visible).length,1);
    assertNoEvidence(h);
    h.pick('reading-timings');
    const timing=h.current();
    assert.equal([...timing.querySelectorAll('.reader-timing-navigation a')].filter(visible).length,12);
    timing.querySelector('.timing-table-details > summary').click();
    for(const link of [...timing.querySelectorAll('.timing-summary-table tbody a')]) {
      h.pick('reading-timings');link.click();
      assert.ok(h.current().classList.contains('reader-timing-card'));assert.ok(visible(h.current()));
      assert.equal(h.current().dataset.month,link.hash.match(/(\d+)$/)[1]);
    }
    h.outer('reading-month-12-summary');assert.equal(h.current(),month);
    assert.deepEqual(h.paragraphs(),before);
  } finally {h.close();}
});

test('general and compatibility controls retain focus for consecutive choices while reading links still focus their target',()=>{
  const h=mount('all');
  try {
    const check=(pickerId,currentSelector)=>{
      const select=h.doc.getElementById(pickerId),options=[...select.options];
      const current=()=>h.host.querySelector(currentSelector);
      assertCurrentBody(current());
      const toggle=h.doc.getElementById(pickerId+'-toggle');
      assert.equal(select.hidden,true,'visible field and item buttons replace the long select');
      for(const option of options.slice(1,3)) {
        selectReadingItem(select,option.value);
        assert.equal(current().id,option.value);assert.ok(visible(current()));
        assertCurrentBody(current());
        assert.equal(h.doc.activeElement,toggle,'choosing an item leaves focus on the visible collapsed list');
      }
      const [previous,next]=select.parentElement.querySelectorAll('.reading-pager-step');
      const start=current().id;
      next.focus();
      for(let count=0;count<2;count++) {
        const before=current().id;next.click();assert.notEqual(current().id,before);
        assertCurrentBody(current());
        assert.equal(h.doc.activeElement,next,'the next button supports repeated keyboard activation');
      }
      previous.focus();previous.click();previous.click();
      assert.equal(h.doc.activeElement,previous);assert.equal(current().id,start);
      previous.blur();const untouched=h.doc.activeElement;next.click();
      assert.equal(h.doc.activeElement,untouched,'a click without focused controls does not force focus into the text');
    };
    check('reading-page-select','[data-reader-current]');
    h.outer('reading-daeun');assert.equal(h.doc.activeElement,h.doc.getElementById('reading-daeun'));
    const partner=calculateSaju({year:1992,month:3,day:14,hour:10,minute:20},{now});
    renderCompatibilityReport(h.host,buildCompatibilityReading(chart,partner),{names:[{name:'예시 A'},{name:'예시 B'}]});
    check('compatibility-page-select','[data-compatibility-current]');
    h.outer('compatibility-synthesis');assert.equal(h.doc.activeElement,h.doc.getElementById('compatibility-synthesis'));
    h.host.querySelector('[data-compatibility-current] .reading-back-to-picker').click();
    assert.equal(h.doc.activeElement,h.doc.getElementById('compatibility-page-select-toggle'));
  } finally {h.close();}
});

test('a refreshed reading restores the same decade topic after the current period moves to the front',()=>{
  const h=mount('all');
  try {
    h.pick('reading-daeun');
    const period=h.host.querySelector('.daeun-period.is-current'),topic=period.querySelector('.daeun-topic');
    h.host.querySelector(`.daeun-nav a[href="#${period.id}-title"]`).click();
    period.querySelector(`.reading-page-sections a[href="#${topic.id}"]`).click();
    const savedPage=h.current().id,savedPeriod=period.dataset.daeunPeriod;
    assert.equal(savedPage,topic.dataset.daeunTopic);
    const later=new Date('2036-11-13T00:00:00Z');
    const forecast=analyzeFortune(chart,{year:2026,now:later});
    const updated=buildDetailedReading(chart,forecast,{daeun:analyzeDaeun(chart,{gender:'female',now:later})});
    const prepared=h.doc.createElement('div');
    renderDetailedReport(prepared,{reading:updated,fortune:forecast,topic:'all'});
    assert.notEqual(prepared.querySelector('.daeun-period.is-current').dataset.daeunPeriod,savedPeriod);
    const focusTarget=h.doc.getElementById('reading-page-select-toggle');focusTarget.focus();let scrolls=0;
    h.dom.window.HTMLElement.prototype.scrollIntoView=function(){scrolls++;};
    assert.equal(restoreReadingPage(prepared,savedPage),true,'a detail absent from the initial picker can still be restored');
    assert.equal(h.doc.activeElement,focusTarget);assert.equal(scrolls,0,'preparing a refresh does not move focus or scroll');
    h.live.replaceChildren(prepared);
    const restored=prepared.querySelector('[data-reader-current]');
    assert.equal(restored.dataset.daeunTopic,savedPage);
    assert.equal(restored.closest('.daeun-period').dataset.daeunPeriod,savedPeriod);
    assert.ok(visible(restored));
    assert.equal(restoreReadingPage(prepared,'missing-reading-page'),false);
    assert.equal(prepared.querySelector('[data-reader-current]'),restored);
  } finally {h.close();}
});
