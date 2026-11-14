const test = require('node:test');
const assert = require('node:assert/strict');
const {
  harness, fixedNow, PROFILE_USER_A, PROFILE_USER_B, pause, deferred, waitFor, selectReadingItem, assertNoReadingScores, assertNoCalculationUI, assertReadingScores, assertReadingScoreCopy
} = require('./helpers/saju-ui-harness.cjs');

// Reading presentation and navigation.
// Separate files give Node a process boundary for fresh jsdom/VM app
// contexts; all original scenarios and assertions remain intact.
test('only the selected monthly product is generated before its explicit ten-ju purchase', async t => {
  const readingsGate=deferred(),purchaseGate=deferred();
  const h=await harness({readingsGate,purchaseGate});t.after(h.close);
  h.fill({topic:'monthly'});h.submit();await pause();await pause();
  assert.equal(h.state.starts.length,0);assert.equal(h.$('result').hidden,true);
  assert.equal(h.window.document.querySelector('.saju-two-line-summary'),null,'a summary is not a free preview of an unpaid reading');
  assertNoReadingScores(h);
  readingsGate.resolve();await waitFor(()=>h.state.starts.length===1);
  assert.equal(h.state.starts[0].topic,'monthly');assert.equal(h.state.starts[0].year,2026);
  assert.equal(h.$('result').hidden,true);
  assert.equal(h.window.document.querySelector('.saju-two-line-summary'),null,'pending payment does not reveal generated summaries');
  assertNoReadingScores(h);
  purchaseGate.resolve();await h.ready('monthly',2026);
  assert.equal(h.state.charges,1);assert.equal(h.state.coins,20);
  assert.ok(h.$('report-content').querySelectorAll('.saju-two-line-summary').length>0,'valid payment reveals summaries with the purchased body');
  assertReadingScores(h.$('report-content'));assertNoCalculationUI(h);
  assert.equal(h.$('report-content').querySelectorAll('.month-reading').length,12);
  assert.equal(h.$('reading-lifelong'),null);assert.equal(h.$('reading-annual'),null);
  assert.ok(h.$('report-content').textContent.length>=10000);
  assert.equal(h.$('reading-month-11').open,true);
  assert.match(h.$('result-warnings').textContent,/태어난 시간을 몰라서.*확인할 수 있는 부분만 풀이/);
});

test('choosing another product never charges or exposes it before the labelled open button', async t => {
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  assert.equal(h.$('other-reading-options').open,false);
  assert.match(h.$('other-reading-options').querySelector('summary').textContent,/다른 풀이 보기.*전체 30쭈.*각각 10쭈/);
  const previous=h.$('report-content').textContent;
  h.pickReport('annual',2026);await pause();
  assert.equal(h.state.starts.length,1);assert.equal(h.$('report-content').textContent,previous);
  assert.equal(h.$('reading-annual'),null);assert.match(h.$('open-product').textContent,/10쭈/);
  h.$('open-product').click();await h.ready('annual',2026);
  assert.equal(h.$('other-reading-options').open,false,'finish the purchase with the reading in front');
  assert.equal(h.state.charges,2);assert.equal(h.$('reading-lifelong'),null);
  h.pickReport('lifelong');assert.match(h.$('open-product').textContent,/0쭈/);
  h.$('open-product').click();await h.ready();
  assert.equal(h.state.starts.length,3);assert.equal(h.state.charges,2);assert.equal(h.$('reading-annual'),null);
});

test('reader size and item navigation preserve the purchased reading and scores without another payment', async t => {
  const h=await harness();t.after(h.close);h.fill({hour:8,minute:37});h.submit();await h.ready();
  const doc=h.window.document;
  const original=h.$('report-content').textContent;
  const scores=assertReadingScores(h.$('report-content'));
  assert.equal(h.$('reading-controls').hidden,false);
  assert.match(h.$('current-reading-title').textContent,/평생운/);
  assert.match(h.$('current-reading-note').textContent,/다시 보기 0쭈/);
  const normal=doc.querySelector('.reading-size-control button[data-reading-size="normal"]');
  const large=doc.querySelector('.reading-size-control button[data-reading-size="large"]');
  assert.equal(normal.getAttribute('aria-pressed'),'true');
  large.click();
  assert.equal(h.$('detailed-reading').dataset.readingSize,'large');
  assert.equal(large.getAttribute('aria-pressed'),'true');
  assert.equal(normal.getAttribute('aria-pressed'),'false');
  assert.equal(h.$('report-content').textContent,original);
  assert.deepEqual(assertReadingScores(h.$('report-content')),scores,'larger text preserves every independent numeric score');
  const picker=h.$('reading-page-select'),firstPage=picker.value,card=doc.querySelector('.portrait-card');
  selectReadingItem(picker,card.id);
  assert.equal(h.$('report-content').querySelector('[data-reader-current]'),card);
  assert.equal(card.closest('[hidden]'),null,'the requested personal item is revealed');
  selectReadingItem(picker,firstPage);
  assertNoCalculationUI(h);
  for(const link of h.$('report-toc').querySelectorAll('a'))assert.ok(h.$(link.hash.slice(1)),`navigation target exists: ${link.hash}`);
  h.pickReport('annual',2027);
  assert.match(h.$('current-reading-title').textContent,/평생운/,'choosing a product does not relabel the current story');
  assert.equal(h.$('report-content').textContent,original);
  normal.click();
  assert.equal(h.$('detailed-reading').dataset.readingSize,'normal');
  assert.equal(normal.getAttribute('aria-pressed'),'true');
  assert.equal(h.state.starts.length,1);
  assert.equal(h.state.charges,1);
});

test('the personal reading keeps its complete body without calculation panels or evidence links',async t=>{
  const h=await harness();t.after(h.close);h.fill({hour:8,minute:37});h.submit();await h.ready();
  const doc=h.window.document,body=h.$('report-content');
  assert.ok(h.$('reading-summary'));
  assert.ok(h.$('reading-topics'));
  assert.equal(doc.querySelector('.report-opening'),null,'there is no duplicate introductory banner before the reading');
  assert.deepEqual([...h.$('report-toc').querySelectorAll('a')].map(link=>link.hash),['#reading-summary','#reading-topics']);
  assertNoCalculationUI(h);
  assert.ok(body.compareDocumentPosition(h.$('other-reading-options'))&h.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'the current reading comes before another purchase panel');
  assert.equal(h.$('report-status').textContent,'');
  const cards=[...body.querySelectorAll('.reader-card')];
  assert.ok(cards.length>=16,'personal life topics have separate detailed sections');
  assert.ok(body.querySelectorAll('.reader-topic-group').length>1,'many topics are grouped in the contents');
  for(const card of cards) {
    assert.ok(card.querySelector('.reader-card-label').textContent.trim());
    assert.ok(card.querySelector('.reader-card-title').textContent.trim());
    assert.ok(card.querySelectorAll('.reader-prose>p').length>=5,'each topic explains its meaning, concrete examples and how to act');
    assert.equal(card.dataset.origin,'service-reference');
    assert.ok(card.dataset.factIds.split(' ').every(id=>id.startsWith('natal.')),'lifelong never leaks a separately purchased period');
    assert.doesNotMatch(card.textContent,/사주는 태어난|이를 .십성|아래쪽 대표 글자|위쪽 글자/);
  }
  assertReadingScores(body);
  doc.querySelector('.other-reading-link').click();
  assert.equal(h.$('other-reading-options').open,true);
  assert.equal(h.state.charges,1,'reading navigation is never a purchase');
  h.$('copy-reading').click();await waitFor(()=>h.state.copies.length===1);
  const copy=h.state.copies[0],headline=body.querySelector('.reader-headline').textContent;
  assert.ok(copy.includes(headline));
  assertReadingScoreCopy(copy,body);
  for(const card of cards)for(const paragraph of card.querySelectorAll('.reader-prose>p'))assert.ok(copy.includes(paragraph.textContent));
  for(const line of body.querySelectorAll('.saju-summary-line'))assert.ok(copy.includes(line.textContent),'the complete copied reading retains each summary unit as well as the full prose');
});

test('the personal portrait keeps every paragraph and topic while calculation evidence stays absent',async t=>{
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  const {analyzeFortune}=await import('../games/starlit-saju/fortune-data.mjs');
  const {buildDetailedReading}=await import('../games/starlit-saju/readings.mjs');
  const fortune=analyzeFortune(h.state.starts[0].chart,{year:2026,now:new Date(fixedNow)});
  const reading=buildDetailedReading(h.state.starts[0].chart,fortune),expected=reading.personPortrait;
  const doc=h.window.document,portrait=h.$('reading-person-portrait'),summary=h.$('reading-summary'),topics=h.$('reading-topics');
  assert.ok(expected,'the personal portrait must be built from the actual chart');
  assert.equal(h.$('reading-lifelong-title').textContent,expected.title);
  assert.equal(summary.parentElement,portrait,'the main summary opens the new personal conclusion');
  assert.equal(summary.querySelector('.portrait-headline').textContent,expected.headline);
  assert.deepEqual([...summary.querySelectorAll('.portrait-prose>p')].map(p=>p.textContent),expected.paragraphs);
  const portraitTable=summary.querySelector('table.portrait-summary-table');
  assert.equal(portraitTable.caption.textContent,'한눈에 보는 나');
  assert.deepEqual([...portraitTable.tHead.rows[0].cells].map(cell=>[cell.scope,cell.textContent]),[['col','상황'],['col','내 모습']]);
  assert.ok(summary.querySelector('.portrait-headline').compareDocumentPosition(portraitTable)&h.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'the personal conclusion precedes its overview table');
  assert.ok(portraitTable.compareDocumentPosition(summary.querySelector('.portrait-prose'))&h.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'the overview table precedes every full introductory paragraph');
  const portraitRows=[...portraitTable.tBodies[0].rows];
  assert.equal(portraitRows.length,expected.cards.length);
  for(const [index,row] of portraitRows.entries()) {
    const item=expected.cards[index],link=row.querySelector('th a');
    assert.equal(row.cells[0].scope,'row');
    assert.equal(link.firstChild.textContent,item.label);
    assert.equal(row.querySelector('.summary-cell-text').textContent,item.title);
    assert.equal(link.hash,`#person-portrait-topic-${index+1}`);
    link.click();assert.equal(doc.activeElement,h.$(link.hash.slice(1)),'each row reaches its own detailed personality topic');
  }
  assert.equal(topics.parentElement,portrait);
  assert.equal(topics.querySelector('.portrait-topic-group'),null,'the overview rows replace the duplicate five personality buttons');
  assert.equal([...h.$('reading-lifelong').querySelectorAll('.reader-scope-note')]
    .filter(note=>note.textContent===reading.reader.scopeNotice).length,1,
  'the unknown-time notice appears once while each restored life-topic scope remains separate');
  assert.equal(summary.querySelector('.reader-scope-note').textContent,reading.reader.scopeNotice);
  assert.equal(portrait.querySelectorAll('.portrait-card').length,5);
  for(const item of expected.cards) {
    const card=[...portrait.querySelectorAll('.portrait-card')].find(value=>value.dataset.portraitCard===item.id);
    assert.ok(card,`the portrait keeps ${item.id}`);
    assert.equal(card.querySelector('.portrait-card-label').lastChild.textContent,item.label);
    assert.equal(card.querySelector('.portrait-card-title').textContent,item.title);
    assert.deepEqual([...card.querySelectorAll('.portrait-prose>p')].map(p=>p.textContent),item.paragraphs);
    assert.equal(card.dataset.origin,item.origin||expected.origin||'service-reference');
    assert.deepEqual(card.dataset.factIds.split(' '),item.factIds);
    const heading=card.querySelector('.portrait-card-label');
    const link=portraitTable.querySelector(`a[href="#${heading.id}"]`);
    assert.ok(link,`the overview row reaches ${item.label}`);
    link.click();assert.equal(doc.activeElement,heading);
  }
  const previous=h.$('reading-personality-more');
  assert.equal(previous.open,false,'the previous three explanations do not repeat before the new portrait');
  assert.deepEqual([...previous.querySelectorAll('.reader-card')].map(card=>card.dataset.readerCard),['natal-character','natal-aptitude','natal-life-path']);
  assert.equal(h.$('reading-lifelong').querySelectorAll('.reader-card').length,reading.reader.lifelong.cards.length,'all prior personal topics remain available');
  for(const item of reading.reader.lifelong.cards) {
    const card=[...h.$('reading-lifelong').querySelectorAll('.reader-card')].find(value=>value.dataset.readerCard===item.id);
    assert.deepEqual([...card.querySelectorAll('.reader-prose>p')].map(p=>p.textContent),item.paragraphs);
    const heading=card.querySelector('.reader-card-label');
    const link=topics.querySelector(`a[href="#${heading.id}"]`);
    assert.ok(link,`the contents still reach ${item.label}`);
    link.click();assert.equal(doc.activeElement,heading);
    if(card.closest('#reading-personality-more'))assert.equal(previous.open,true,'a topic link reveals a folded prior explanation');
  }
  const storyParagraphs=[...h.$('reading-lifelong').querySelectorAll('.reader-prose>p')];
  const splitParagraphs=storyParagraphs.filter(paragraph=>paragraph.querySelector('.reader-sentence-group'));
  assert.ok(splitParagraphs.length>0,'long personal explanations gain visible sentence groups');
  for(const paragraph of splitParagraphs) {
    const groups=[...paragraph.querySelectorAll(':scope>span.reader-sentence-group')];
    assert.ok(groups.length>1,'a long paragraph is divided into more than one readable group');
    assert.ok(groups.every(group=>group.textContent.trim()),'visual breaks do not create empty groups');
    assert.equal(groups.map(group=>group.textContent).join(''),paragraph.textContent,'sentence groups retain every character and its original order');
  }
  const shortParagraphs=storyParagraphs.filter(paragraph=>paragraph.textContent.length<100);
  assert.ok(shortParagraphs.length>0);
  for(const paragraph of shortParagraphs)assert.equal(paragraph.children.length,0,'short explanations retain their plain paragraph text');
  assertNoCalculationUI(h);
  assertReadingScores(portrait);
  for(const id of ['reading-summary','reading-topics']) {
    h.$('report-toc').querySelector(`a[href="#${id}"]`).click();
    await waitFor(()=>h.window.location.hash===`#${id}`,'the main contents should navigate to the personal reading');
    assert.equal(h.$(id).tabIndex,-1,'the requested summary or contents is focusable in the browser');
  }
  assert.equal(h.state.starts.length,1);assert.equal(h.state.charges,1,'reading links never start a new purchase');
  h.$('copy-reading').click();await waitFor(()=>h.state.copies.length===1);
  const copy=h.state.copies[0];
  assert.ok(copy.includes(expected.headline));
  assert.ok(copy.indexOf(expected.headline)<copy.indexOf(reading.reader.lifelong.headline));
  for(const paragraph of [...expected.paragraphs,...expected.cards.flatMap(card=>card.paragraphs)])assert.ok(copy.includes(paragraph));
  assertReadingScoreCopy(copy,h.$('report-content'));
});

test('monthly readers see the current and next actual flow before all twelve detailed months',async t=>{
  const h=await harness();t.after(h.close);h.fill({topic:'monthly'});h.submit();await h.ready('monthly',2026);
  const spotlight=h.$('reading-summary');
  assert.ok(spotlight.classList.contains('months-spotlight'));
  const links=[...spotlight.querySelectorAll('a')];
  assert.deepEqual(links.map(link=>link.hash),['#month-title-11','#month-title-12']);
  assert.equal(h.$('report-content').querySelector('.month-reading').id,'reading-month-11','the current detailed result appears before the other collapsed months');
  assert.equal(h.$('reading-month-11').querySelector('.reader-headline'),null,'the month result heading is not repeated inside its open body');
  for(const month of h.$('report-content').querySelectorAll('.month-reading')) {
    assert.ok(month.querySelector(':scope>summary .month-headline').textContent.trim());
    assert.equal(month.querySelector('.reading-full-text'),null);
  }
  h.$('reading-month-11').open=false;
  h.$('report-toc').querySelector('a[href="#reading-topics"]').click();
  assert.equal(h.$('reading-month-11').open,true,'the topic navigation opens its current month automatically');
  assert.equal(h.$('reading-month-11-details'),null,'calculation lessons are not part of the reading');
  links[1].click();
  assert.equal(h.$('reading-month-12').open,true);
  assert.equal(h.window.document.activeElement.id,'month-title-12');
  assert.equal(h.state.charges,1);
});

test('the monthly overview preserves every calculated period, opportunity and caution and opens the correct details',async t=>{
  const h=await harness();t.after(h.close);h.fill({topic:'monthly',hour:8,minute:37});h.submit();await h.ready('monthly',2026);
  const {analyzeFortune}=await import('../games/starlit-saju/fortune-data.mjs');
  const {buildDetailedReading}=await import('../games/starlit-saju/readings.mjs');
  const fortune=analyzeFortune(h.state.starts[0].chart,{year:2026,now:new Date(fixedNow)});
  const reading=buildDetailedReading(h.state.starts[0].chart,fortune);
  const expected=[...reading.reader.timings.items].sort((a,b)=>a.month-b.month);
  const doc=h.window.document,section=h.$('reading-timings'),table=section.querySelector('table.timing-summary-table');
  const navigation=section.querySelector('.reader-timing-navigation'),comparison=section.querySelector('details.timing-table-details');
  assert.ok(comparison,'the twelve-month comparison has its own expandable section');
  assert.equal(comparison.open,false,'the dense comparison starts folded behind the monthly shortcuts');
  assert.equal(navigation.nextElementSibling,comparison,'monthly shortcuts come before the comparison');
  assert.equal(comparison.nextElementSibling,section.querySelector('.reader-timing-list'),'detailed readings follow the folded comparison');
  assert.equal(table.parentElement,comparison.querySelector(':scope>div.timing-table-body'));
  const comparisonToggle=comparison.querySelector(':scope>summary.full-reading-toggle');
  assert.ok(comparisonToggle.textContent.startsWith('열두 달 비교표'));
  assert.equal(comparisonToggle.querySelector('small').textContent,'12개월');
  const monthShortcut=navigation.querySelector('a'),shortcutTarget=h.$(monthShortcut.hash.slice(1));
  shortcutTarget.closest('details').open=false;
  monthShortcut.click();
  assert.equal(shortcutTarget.closest('details').open,true);
  assert.equal(doc.activeElement,shortcutTarget);
  assert.equal(comparison.open,false,'a monthly shortcut reaches its reading without opening the comparison');
  comparisonToggle.click();
  assert.equal(comparison.open,true,'the reader explicitly opens the complete twelve-month comparison');
  assert.equal(table.caption.textContent,'월별 기회와 주의점 한눈에 보기');
  assert.deepEqual([...table.tHead.rows[0].cells].map(cell=>[cell.scope,cell.textContent]),
    [['col','월과 기간'],['col','살릴 기회'],['col','조심할 상황']]);
  assert.ok(table.compareDocumentPosition(section.querySelector('.reader-timing-list'))&h.window.Node.DOCUMENT_POSITION_FOLLOWING);
  const rows=[...table.tBodies[0].rows];
  assert.equal(rows.length,12);
  assert.deepEqual(rows.map(row=>Number(row.dataset.month)),expected.map(item=>item.month));
  for(const [index,row] of rows.entries()) {
    const item=expected[index],link=row.querySelector('th a');
    assert.equal(row.cells[0].scope,'row');
    assert.equal(link.firstChild.textContent,`${item.month}월`);
    assert.equal(link.hash,`#reading-timings-month-${item.month}`);
    assert.equal(row.querySelector('.summary-period').textContent,item.periodLabel,'the exact calculated time range stays visible');
    assert.deepEqual([...row.querySelectorAll('.summary-opportunities li')].map(point=>point.textContent),item.opportunities.map(point=>point.label));
    assert.deepEqual([...row.querySelectorAll('.summary-cautions li')].map(point=>point.textContent),item.cautions.map(point=>point.label));
    const heading=h.$(link.hash.slice(1)),article=heading.closest('details');
    article.open=false;link.click();
    assert.equal(article.open,true);assert.equal(doc.activeElement,heading);
    assert.equal(article.dataset.month,String(item.month));
    assert.deepEqual([...article.querySelectorAll('.reader-timing-content>.reader-prose>p')].map(p=>p.textContent),item.paragraphs);
    assert.equal(article.querySelector('details.reading-body-details'),null,'a chosen period exposes its explanation without a second disclosure');
    assert.deepEqual([...article.querySelectorAll('.reader-timing-point')].map(point=>[point.querySelector('dt').textContent,[...point.querySelectorAll(':scope > dd:not(.saju-reading-score)')].map(part=>part.textContent).join('')]),
      [...item.cautions,...item.opportunities,...item.people,...item.documents].map(point=>[point.label,point.text]),
      'all detailed text remains present, with cautions before opportunities');
  }
  comparisonToggle.click();assert.equal(comparison.open,false,'the comparison can close again without removing any month');
  assert.equal(section.querySelectorAll('.reader-timing-card').length,12);
  assert.equal(h.$('report-content').querySelectorAll('.month-reading').length,12,'the table does not replace the original twelve monthly readings');
  assert.equal(h.$('report-content').querySelector('.portrait-summary-table'),null,'a monthly purchase reveals no lifelong portrait');
  assert.equal(h.state.starts.length,1);assert.equal(h.state.charges,1,'table navigation never purchases a reading');
});

test('a new annual year is a separate explicit purchase and changing the selection preserves old copy', async t => {
  const h=await harness();t.after(h.close);h.fill({topic:'annual'});h.submit();await h.ready('annual',2026);
  const previous=h.$('reading-annual').textContent;
  h.pickReport('annual',2027);await pause();
  assert.equal(h.state.starts.length,1);assert.equal(h.$('reading-annual').textContent,previous);
  assert.match(h.$('open-product').textContent,/2027.*10쭈|10쭈.*2027/);
  h.$('copy-reading').click();await waitFor(()=>h.state.copies.length===1);
  assert.match(h.state.copies[0],/2026년 (운세|연간운|올해운)/);assert.doesNotMatch(h.state.copies[0],/2027년 (운세|연간운|올해운)/);
  h.$('open-product').click();await h.ready('annual',2027);
  assert.equal(h.state.charges,2);assert.notEqual(h.$('reading-annual').textContent,previous);
  h.pickReport('annual',2026);assert.match(h.$('open-product').textContent,/0쭈/);
  h.$('open-product').click();await h.ready('annual',2026);assert.equal(h.state.charges,2);
});

test('all twelve monthly chapters and their controls reuse the same product entitlement', async t => {
  const h=await harness();t.after(h.close);h.fill({topic:'monthly'});h.submit();await h.ready('monthly',2026);
  h.$('toggle-all-months').click();assert.equal(h.$('report-content').querySelectorAll('.month-reading[open]').length,12);
  assert.equal(h.$('toggle-all-months').getAttribute('aria-expanded'),'true');
  h.$('toggle-all-months').click();assert.equal(h.$('report-content').querySelectorAll('.month-reading[open]').length,0);
  h.window.document.querySelector('.month-jump[aria-controls="reading-month-4"]').click();
  assert.equal(h.$('reading-month-4').open,true);assert.equal(h.window.document.activeElement.id,'month-title-4');
  assert.equal(h.state.starts.length,1);assert.equal(h.state.charges,1);
});

test('copy contains only the opened reading and its scores without calculation evidence', async t => {
  const h=await harness();t.after(h.close);h.fill({hour:8,minute:37});h.submit();await h.ready();
  h.$('copy-reading').click();await waitFor(()=>h.state.copies.length===1);
  const copy=h.state.copies[0];
  assert.match(copy,/평생운/);assert.doesNotMatch(copy,/2026년 운세|2026년 12월|1990-05-17|1990년\s*5월\s*17일/);
  assertNoCalculationUI(h);
  assertReadingScores(h.$('report-content'));
  assertReadingScoreCopy(copy,h.$('report-content'));
});

test('every product keeps its personal interpretations and practical suggestions without calculation material', async t => {
  const h=await harness({adminPreview:true});t.after(h.close);
  h.fill({hour:8,minute:37});h.submit();await h.ready();
  const {analyzeFortune}=await import('../games/starlit-saju/fortune-data.mjs');
  const {buildDetailedReading}=await import('../games/starlit-saju/readings.mjs');
  const fortune=analyzeFortune(h.state.starts[0].chart,{year:2026,now:new Date(fixedNow)});
  const expected=buildDetailedReading(h.state.starts[0].chart,fortune);
  for (const topic of ['lifelong','annual','monthly','all']) {
    if(topic!=='lifelong') {h.pickReport(topic,2026);h.$('open-product').click();await h.ready(topic,2026);}
    const first=h.$('report-content').querySelector(':scope > [data-reader-paged] > :not(.reading-pager)');
    assert.equal(first.id,topic==='all'?'reading-all':topic==='monthly'?'reading-months':`reading-${topic}`,'the requested reading leads the product');
    assertNoCalculationUI(h);assertReadingScores(h.$('report-content'));
    const overviews=topic==='all'?[expected.reader.lifelong,expected.reader.annual,...expected.reader.months]:topic==='monthly'?expected.reader.months:[expected.reader[topic]];
    for(const overview of overviews)for(const item of overview.cards) {
      const card=h.$('report-content').querySelector(`[data-reader-card="${item.id}"]`);
      assert.ok(card,'every actual personal interpretation remains available');
      assert.deepEqual([...card.querySelectorAll(':scope > .reader-prose > p')].map(paragraph=>paragraph.textContent),item.paragraphs);
      assert.equal(card.querySelector('details.reading-body-details'),null,'the full explanation is part of the selected reading');
      assert.deepEqual([...card.querySelectorAll('.saju-summary-line')].map(line=>line.textContent),item.summaryLines);
    }
    const advice=topic==='all'?[...expected.adviceByCategory.lifelong,...expected.adviceByCategory.annual,...expected.months.flatMap(month=>month.advice)]:topic==='monthly'?expected.months.flatMap(month=>month.advice):expected.adviceByCategory[topic];
    const cards=[...h.$('report-content').querySelectorAll('.advice-card')];
    assert.ok(advice.length>0);
    assert.equal(cards.length,advice.length,'show every grounded suggestion without truncation');
    for (const item of advice) {
      const card=cards.find(value=>value.dataset.adviceId===item.id);
      assert.ok(card,'each month retains its own complete advice');
      assert.equal(card.dataset.adviceId,item.id);
      assert.equal(card.dataset.origin,'service-advice');
      assert.equal(card.querySelector('h4').textContent,item.title);
      assert.equal(card.querySelector('.advice-why,h5'),null,'the calculation rationale is not shown with the practical suggestion');
      assert.equal(card.querySelector('.advice-action > span').textContent,item.action);
      assert.equal(card.querySelector('.advice-caution > span').textContent,item.caution);
    }
    if (topic==='monthly'||topic==='all') for (const month of expected.months) assert.equal(h.$(`reading-month-${month.month}`).querySelectorAll('.advice-card').length,month.advice.length);
    const notices=h.$('report-content').querySelectorAll('.advice-notice');
    assert.equal(notices.length,0,'the removed source guide does not reappear beside the practical suggestions');
    assert.match(expected.adviceNotice,/오쭈다가 쓴 생활 제안/);
  }
  assert.equal(h.state.starts.length,4,'only the four explicit product buttons open purchases');
  assert.equal(h.state.charges,0,'verified preview and reading navigation never create a payment');
});
