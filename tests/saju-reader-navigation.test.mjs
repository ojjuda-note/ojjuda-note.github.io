import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {calculateSaju} from '../games/starlit-saju/engine.mjs';
import {analyzeFortune} from '../games/starlit-saju/fortune-data.mjs';
import {analyzeDaeun} from '../games/starlit-saju/daeun.mjs';
import {buildDetailedReading} from '../games/starlit-saju/readings.mjs';
import {renderDetailedReport} from '../games/starlit-saju/report-view.mjs';

const {JSDOM}=createRequire(import.meta.url)('jsdom');
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
function mount(topic) {
  const dom=new JSDOM('<!doctype html><nav id="outside"></nav><div id="report-content"></div>',{url:'https://example.test/'});
  const doc=dom.window.document;globalThis.document=doc;
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  const host=doc.getElementById('report-content');renderDetailedReport(host,{reading,fortune,topic});
  const select=doc.getElementById('reading-page-select');
  const current=()=>host.querySelector('[data-reader-current]');
  const pick=id=>{select.value=id;assert.equal(select.value,id);select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
  const outer=id=>{
    const link=doc.createElement('a');link.href='#'+id;
    link.addEventListener('click',event=>event.preventDefault());
    doc.getElementById('outside').append(link);link.click();link.remove();
  };
  const paragraphs=()=>[...host.querySelectorAll('p:not(.reading-page-position)')].map(node=>node.textContent);
  return {dom,doc,host,select,current,pick,outer,paragraphs,close:()=>dom.window.close()};
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

test('every reading family keeps two authored summary units before its complete body when requested',()=>{
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
    reading.reader.symbols.items.forEach((item,index)=>add(symbols[index],item,':scope > .reader-prose > p',[item.description]));
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
      assert.ok(body.length>0&&body.every(visible),'the requested full explanation is not collapsed behind its summary');
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
      assert.equal(h.current().id,topic==='monthly'?'reading-month-11':'reading-summary');
      assert.ok([...h.select.options].filter(option=>option.closest('optgroup')?.label!=='생활 제안').length<=60,'month and decade details keep the primary reading list compact while existing practical suggestions remain reachable');
      for(const option of [...h.select.options]) {
        h.pick(option.value);assert.ok(visible(h.current()),option.textContent);
        assert.equal(h.host.querySelectorAll('[data-reader-current]').length,1);
      }
      assert.deepEqual(h.paragraphs(),before,'navigation neither rewrites nor removes the original prose');
      assert.equal(Boolean(h.doc.getElementById('reading-lifelong')),['lifelong','all'].includes(topic));
      assert.equal(Boolean(h.doc.getElementById('reading-annual')),['annual','all'].includes(topic));
      assert.equal(h.host.querySelectorAll('.month-reading').length,['monthly','all'].includes(topic)?12:0);
      assert.equal(JSON.stringify(reading),originalReading,'the report and its complete copied readings are unchanged');
    } finally {h.close();}
  }
});

test('portrait tables, outer contents and decade topics reveal their reading without evidence menus',()=>{
  const h=mount('all');
  try {
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
