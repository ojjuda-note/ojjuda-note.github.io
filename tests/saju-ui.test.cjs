const test = require('node:test');
const assert = require('node:assert/strict');
const {
  harness, fixedNow, PROFILE_USER_A, PROFILE_USER_B, pause, deferred, waitFor, selectReadingItem, assertNoReadingScores, assertNoCalculationUI, assertReadingScores, assertReadingScoreCopy
} = require('./helpers/saju-ui-harness.cjs');

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
  assert.equal(h.$('reading-lifelong').querySelectorAll('.reader-scope-note').length,1,'the unknown-time notice appears once');
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

test('signed-out and anonymous sessions cannot purchase or reveal paid products', async t => {
  for(const user of [null,'anonymous-id']){
    const h=await harness({user,signedIn:false});t.after(h.close);h.fill();h.submit();
    await waitFor(()=>!h.$('form-error').hidden);
    assert.equal(h.state.starts.length,0);assert.equal(h.$('result').hidden,true);
    assert.equal(h.$('login-link').hidden,false);assert.match(h.$('form-error').textContent,/로그인/);
  }
});

test('insufficient balance leaves the paid product hidden and allows an explicit retry', async t => {
  const h=await harness({coins:9});t.after(h.close);h.fill();h.submit();
  await waitFor(()=>!h.$('form-error').hidden);assert.match(h.$('form-error').textContent,/부족/);
  assert.equal(h.state.charges,0);assert.equal(h.$('result').hidden,true);
  h.state.coins=20;h.submit();await h.ready();assert.equal(h.state.charges,1);assert.equal(h.state.coins,10);
});

test('a detail module failure charges nothing and keeps the birth input for retry', async t => {
  const h=await harness({failReadings:1});t.after(h.close);h.fill();h.submit();
  await waitFor(()=>!h.$('form-error').hidden);assert.equal(h.state.starts.length,0);
  assert.equal(h.$('birth-year').value,'1990');assert.equal(h.$('result').hidden,true);
  h.submit();await h.ready();assert.equal(h.state.charges,1);
});

test('failed read-only ownership checks block payment and their retry itself never charges', async t => {
  const h=await harness({failStatus:1});t.after(h.close);h.fill();h.submit();
  await waitFor(()=>!h.$('entry-check-error').hidden);
  assert.equal(h.state.starts.length,0);assert.equal(h.$('open-story').disabled,true);
  h.$('retry-entry-status').click();await waitFor(()=>!h.$('open-story').disabled);
  assert.equal(h.state.starts.length,0);assert.equal(h.$('entry-check-error').hidden,true);
  h.submit();await h.ready();assert.equal(h.state.charges,1);
});

test('a failed product ownership refresh preserves the paid report and retries without charging', async t => {
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  const previous=h.$('report-content').textContent;
  h.state.failStatus=1;h.pickReport('annual',2027);h.$('open-product').click();
  await waitFor(()=>!h.$('report-error').hidden);
  assert.equal(h.state.starts.length,1);assert.ok(h.$('report-content').textContent===previous);
  assert.equal(h.$('open-product').disabled,true);
  h.$('retry-report').click();await waitFor(()=>h.$('report-error').hidden&&!h.$('open-product').disabled);
  assert.equal(h.state.starts.length,1);assert.ok(h.$('report-content').textContent===previous);
  h.$('open-product').click();await h.ready('annual',2027);assert.equal(h.state.charges,2);
});

test('editing birth during a product transition discards the old request before payment', async t => {
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  h.pickReport('annual',2027);h.$('open-product').click();h.$('edit-birth').click();
  assertNoReadingScores(h);
  h.fill({year:2001,month:4,day:9,hour:11,minute:20});h.submit();await h.ready();
  assert.match(h.$('birth-summary').textContent,/2001년 4월 9일/);
  assert.equal(h.state.starts.length,2);assert.ok(h.state.starts.every(value=>value.topic==='lifelong'));
  assert.equal(h.$('report-content').hasAttribute('aria-busy'),false);
});

test('account changes invalidate late payment receipts and erase the previous birth state', async t => {
  const purchaseGate=deferred();const h=await harness({purchaseGate});t.after(h.close);h.fill();h.submit();
  await waitFor(()=>h.state.starts.length===1);h.changeAccount('member-b');purchaseGate.resolve();await pause();await pause();
  assert.equal(h.$('result').hidden,true);assert.equal(h.$('birth-year').value,'');
  assert.equal(h.$('report-content').textContent,'');assert.equal(h.$('copy-reading').disabled,true);
  assert.equal(h.window.document.querySelector('.saju-two-line-summary'),null,'account changes remove all previous summary content');
  assertNoReadingScores(h);
});

test('solar and lunar representations reopen the same purchased product without an extra charge', async t => {
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  const chart=h.state.starts[0].chart;h.$('edit-birth').click();
  h.fill({calendar:'lunar',year:chart.lunar.year,month:chart.lunar.month,day:chart.lunar.day,leap:chart.lunar.leapMonth});
  h.submit();await h.ready();assert.equal(h.state.starts.length,2);assert.equal(h.state.charges,1);
  assert.equal(h.state.starts[1].chart.solar.iso,chart.solar.iso);assert.match(h.$('status').textContent,/추가 차감 없이/);
});

test('legacy bundle recovery and verified admin preview do not create new product charges', async t => {
  for(const mode of [{legacyBundle:true},{adminPreview:true}]){
    const h=await harness(mode);t.after(h.close);h.fill({topic:'annual'});h.submit();await h.ready('annual',2026);
    h.pickReport('monthly',2027);assert.match(h.$('open-product').textContent,/0쭈|미리보기/);
    h.$('open-product').click();await h.ready('monthly',2027);
    h.pickReport('all',2026);assert.match(h.$('open-product').textContent,/0쭈|미리보기/);
    h.$('open-product').click();await h.ready('all',2026);
    assert.equal(h.state.charges,0);assert.equal(h.$('report-content').querySelectorAll('.month-reading').length,12);
  }
});

test('the explicit thirty-ju full purchase opens all three readings and each can reopen free', async t => {
  const h=await harness();t.after(h.close);h.fill({topic:'all',hour:8,minute:37,gender:'female'});
  await waitFor(()=>h.state.statusCalls.length>0&&!h.$('open-story').disabled);
  assert.equal(h.$('entry-year-field').hidden,false);
  assert.match(h.$('entry-price-value').textContent,/2026.*전체 풀이.*30쭈/);
  assert.match(h.$('open-story').textContent,/30쭈로.*전체 풀이/);
  for(const topic of ['lifelong','annual','monthly']) {
    assert.equal(h.window.document.querySelector(`[data-entry-price="${topic}"]`).textContent,'10쭈');
  }
  assert.match(h.$('entry-price-note').textContent,/결제 후 24시간.*다시 보기 0쭈.*다시 결제.*이용 시간이 남은 항목/);
  assert.equal(h.state.starts.length,0,'selecting the full product only checks ownership');
  h.submit();await h.ready('all',2026);
  assert.deepEqual(h.state.chargedAmounts,[30]);assert.equal(h.state.coins,0);
  assert.equal(h.state.starts.length,1);assert.equal(h.state.starts[0].topic,'all');
  assert.equal(h.state.receipts.size,3);
  assert.ok(h.$('reading-lifelong'));assert.ok(h.$('reading-annual'));
  assert.equal(h.$('report-content').querySelectorAll('.month-reading').length,12);
  assert.equal(h.$('reading-all').querySelectorAll('a').length,3);
  for (const link of [...h.$('reading-all').querySelectorAll('a'),...h.$('report-toc').querySelectorAll('a')]) assert.ok(h.$(link.hash.slice(1)));
  const ids=[...h.$('report-content').querySelectorAll('[id]')].map(item=>item.id);
  assert.equal(new Set(ids).size,ids.length,'the combined view has no duplicate section IDs');
  const scores=assertReadingScores(h.$('report-content'));
  assert.ok(scores.some(score=>score.status==='available'&&score.tailwind+score.headwind!==100),'the real fixture exercises independent values, not a complementary total');
  assertNoCalculationUI(h);
  h.$('copy-reading').click();await waitFor(()=>h.state.copies.length===1);
  assert.match(h.state.copies[0],/평생운/);assert.match(h.state.copies[0],/2026년/);assert.match(h.state.copies[0],/12월/);
  assert.doesNotMatch(h.state.copies[0],/1990-05-17|1990년\s*5월\s*17일/);
  assertReadingScoreCopy(h.state.copies[0],h.$('report-content'));
  for (const topic of ['lifelong','annual','monthly','all']) {
    h.pickReport(topic,2026);
    assert.match(h.$('open-product').textContent,/0쭈/);
    h.$('open-product').click();await h.ready(topic,topic==='lifelong'?0:2026);
    const includesPortrait=topic==='lifelong'||topic==='all';
    assert.equal(h.$('report-content').querySelectorAll('.person-portrait').length,includesPortrait?1:0,'the personal portrait belongs only to lifelong and full readings');
    assert.equal(h.$('report-content').querySelectorAll('.portrait-summary-table').length,includesPortrait?1:0);
    assert.equal(h.$('report-content').querySelectorAll('.timing-summary-table').length,topic==='monthly'||topic==='all'?1:0,
      'the monthly overview stays inside the opened monthly or full product');
    if(includesPortrait) {
      assert.equal(h.$('report-content').querySelectorAll('.portrait-card').length,5);
      assert.equal(h.$('reading-summary').parentElement,h.$('reading-person-portrait'));
      assert.equal(h.$('reading-topics').parentElement,h.$('reading-person-portrait'));
    }
    assertReadingScores(h.$('report-content'));assertNoCalculationUI(h);
    const count=h.state.copies.length;
    h.$('copy-reading').click();await waitFor(()=>h.state.copies.length===count+1);
    assertReadingScoreCopy(h.state.copies.at(-1),h.$('report-content'));
  }
  assert.deepEqual(h.state.chargedAmounts,[30]);assert.equal(h.state.coins,0);
});

test('full purchase deducts only missing products and another year keeps lifelong free', async t => {
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  const before=h.$('report-content').textContent;
  h.pickReport('all',2026);
  assert.match(h.$('product-offer').textContent,/전체 풀이.*남은 20쭈/);
  assert.match(h.$('open-product').textContent,/남은 20쭈로/);
  assert.equal(h.window.document.querySelector('[data-report-price="all"]').textContent,'남은 20쭈');
  assert.equal(h.state.starts.length,1);assert.equal(h.$('report-content').textContent,before);
  h.$('copy-reading').click();await waitFor(()=>h.state.copies.length===1);
  assert.doesNotMatch(h.state.copies[0],/2026년 12월/,'the old purchased copy remains active before full purchase');
  h.$('open-product').click();await h.ready('all',2026);
  assert.deepEqual(h.state.chargedAmounts,[10,20]);assert.equal(h.state.coins,0);
  h.pickReport('all',2027);
  assert.equal(h.$('report-content').dataset.year,'2026');
  assert.match(h.$('open-product').textContent,/남은 20쭈로.*2027/);
  assert.equal(h.state.starts.length,2,'changing the full-reading year never starts a purchase');
  h.state.coins=20;
  h.$('open-product').click();await h.ready('all',2027);
  assert.deepEqual(h.state.chargedAmounts,[10,20,20]);assert.equal(h.state.coins,0);
  assert.equal(h.state.receipts.size,5,'lifelong has one entitlement across years');
  assert.equal(h.$('reading-months-title').textContent,'2027년, 열두 달의 이야기');
});

test('three separate purchases unlock the combined reading at zero extra ju', async t => {
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  for (const topic of ['annual','monthly']) {h.pickReport(topic);h.$('open-product').click();await h.ready(topic,2026);}
  assert.deepEqual(h.state.chargedAmounts,[10,10,10]);assert.equal(h.state.coins,0);
  h.pickReport('all');assert.match(h.$('open-product').textContent,/0쭈/);
  assert.equal(h.window.document.querySelector('[data-report-price="all"]').textContent,'이용 가능');
  h.$('open-product').click();await h.ready('all',2026);
  assert.deepEqual(h.state.chargedAmounts,[10,10,10]);assert.equal(h.state.coins,0);
  h.$('edit-birth').click();h.fill({topic:'all'});
  await waitFor(()=>!h.$('open-story').disabled&&/0쭈/.test(h.$('open-story').textContent));
  h.submit();await h.ready('all',2026);
  assert.deepEqual(h.state.chargedAmounts,[10,10,10]);
});

test('an insufficient full-reading balance exposes no partial report or purchase', async t => {
  const h=await harness({coins:29});t.after(h.close);h.fill({topic:'all'});h.submit();
  await waitFor(()=>!h.$('form-error').hidden);
  assert.match(h.$('form-error').textContent,/30쭈/);
  assert.equal(h.$('result').hidden,true);assert.equal(h.state.coins,29);
  assertNoReadingScores(h);
  assert.equal(h.state.charges,0);assert.equal(h.state.receipts.size,0);
  h.state.coins=30;h.submit();await h.ready('all',2026);
  assert.deepEqual(h.state.chargedAmounts,[30]);assert.equal(h.state.receipts.size,3);
});

test('the reading closes exactly 24 hours after payment and only a new explicit click renews it',async t=>{
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  const original=h.$('report-content').textContent;
  const first=[...h.state.receipts.values()][0];
  assert.match(h.$('current-reading-note').textContent,/11월 14일.*12:00까지/);
  h.advance(86400000-1);
  assert.equal(h.$('report-content').textContent,original);
  h.advance(1);
  assert.equal(h.$('report-content').textContent,'');
  assert.equal(h.$('copy-reading').disabled,true);
  assert.equal(h.$('reading-controls').hidden,true);
  assertNoReadingScores(h);assertNoCalculationUI(h);
  assert.equal(h.$('other-reading-options').open,true);
  assert.match(h.$('report-status').textContent,/24시간 이용이 끝났어요/);
  assert.match(h.$('open-product').textContent,/10쭈/);
  assert.deepEqual(h.state.chargedAmounts,[10]);
  h.$('open-product').click();await h.ready();
  assert.deepEqual(h.state.chargedAmounts,[10,10]);
  assert.equal(h.$('report-content').textContent,original,'repurchase does not invent a different natal reading');
  assertReadingScores(h.$('report-content'));assertNoCalculationUI(h);
  const renewed=[...h.state.receipts.values()][0];
  assert.notEqual(renewed.request_id,first.request_id);
  assert.equal(Date.parse(renewed.expires_at)-Date.parse(first.expires_at),86400000);
});

test('reopening inside the access window is free and does not extend the original deadline',async t=>{
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  const originalExpiry=[...h.state.receipts.values()][0].expires_at;
  h.advance(23*3600000);h.$('edit-birth').click();h.submit();await h.ready();
  assert.deepEqual(h.state.chargedAmounts,[10]);
  assert.equal([...h.state.receipts.values()][0].expires_at,originalExpiry);
  h.advance(3600000);
  assert.equal(h.$('report-content').textContent,'');
  assert.deepEqual(h.state.chargedAmounts,[10]);
});

test('a stale free entry offer cannot silently charge when the ownership check finds it expired',async t=>{
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();h.$('edit-birth').click();
  await waitFor(()=>/0쭈/.test(h.$('open-story').textContent)&&!h.$('open-story').disabled);
  h.advance(86400000,{runTimers:false});
  assert.equal(h.$('open-story').dataset.expectedCharge,'0');
  h.submit();await waitFor(()=>!h.$('form-error').hidden);
  assert.match(h.$('form-error').textContent,/금액.*바뀌/);
  assert.equal(h.$('result').hidden,true);
  assert.deepEqual(h.state.chargedAmounts,[10]);
  assert.equal(h.state.starts.at(-1).expectedCharge,0);
  assert.match(h.$('open-story').textContent,/10쭈/);
  h.submit();await h.ready();assert.deepEqual(h.state.chargedAmounts,[10,10]);
});

test('a stale free product offer requires a second explicit click after the price increases',async t=>{
  const h=await harness({coins:50});t.after(h.close);h.fill();h.submit();await h.ready();
  h.pickReport('annual');h.$('open-product').click();await h.ready('annual',2026);
  h.pickReport('lifelong');h.$('open-product').click();await h.ready();
  h.pickReport('annual');assert.equal(h.$('open-product').dataset.expectedCharge,'0');
  h.advance(86400000,{runTimers:false});
  h.$('open-product').click();await waitFor(()=>!h.$('report-error').hidden);
  assert.equal(h.$('report-content').textContent,'');
  assert.deepEqual(h.state.chargedAmounts,[10,10]);
  assert.equal(h.state.starts.at(-1).expectedCharge,0);
  assert.match(h.$('open-product').textContent,/10쭈/);
  h.$('open-product').click();await h.ready('annual',2026);
  assert.deepEqual(h.state.chargedAmounts,[10,10,10]);
});

test('a partially expired full reading charges only the expired part and preserves active deadlines',async t=>{
  const h=await harness({coins:60});t.after(h.close);h.fill();h.submit();await h.ready();
  h.advance(3600000);
  h.pickReport('all');h.$('open-product').click();await h.ready('all',2026);
  assert.deepEqual(h.state.chargedAmounts,[10,20]);
  const annual=[...h.state.receipts.values()].find(item=>item.topic==='annual');
  h.advance(23*3600000);
  assert.equal(h.$('report-content').textContent,'');
  assert.match(h.$('open-product').textContent,/남은 10쭈/);
  assert.equal(h.window.document.querySelector('[data-report-price="annual"]').textContent,'이용 가능');
  h.$('open-product').click();await h.ready('all',2026);
  assert.deepEqual(h.state.chargedAmounts,[10,20,10]);
  assert.equal([...h.state.receipts.values()].find(item=>item.topic==='annual').expires_at,annual.expires_at);
  h.advance(3600000);
  assert.equal(h.$('report-content').textContent,'');
  assert.match(h.$('open-product').textContent,/남은 20쭈/);
  assert.deepEqual(h.state.chargedAmounts,[10,20,10]);
});

test('copying and returning to a sleeping tab check expiry before showing or copying the old report',async t=>{
  for(const resume of ['copy','focus','pageshow','visibility']) {
    const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
    h.advance(86400000,{runTimers:false});
    if(resume==='copy')h.$('copy-reading').click();
    else if(resume==='visibility')h.window.document.dispatchEvent(new h.window.Event('visibilitychange'));
    else h.window.dispatchEvent(new h.window.Event(resume));
    assert.equal(h.$('report-content').textContent,'');
    assert.equal(h.$('copy-reading').disabled,true);
    assert.equal(h.window.document.querySelector('.saju-two-line-summary'),null,'expired summaries follow the same access gate as the full reading');
    assertNoReadingScores(h);
    assert.equal(h.state.copies.length,0);
    assert.deepEqual(h.state.chargedAmounts,[10]);
  }
});

test('an old bundle expires at its original payment time and a status retry never renews it',async t=>{
  const h=await harness({legacyBundle:true});t.after(h.close);h.fill({topic:'all'});h.submit();await h.ready('all',2026);
  assert.deepEqual(h.state.chargedAmounts,[]);
  h.advance(86400000);
  h.$('retry-report').click();await waitFor(()=>!h.$('open-product').disabled);
  assert.equal(h.$('report-content').textContent,'');assert.match(h.$('open-product').textContent,/30쭈/);
  assert.deepEqual(h.state.chargedAmounts,[]);
  h.$('open-product').click();await h.ready('all',2026);
  assert.deepEqual(h.state.chargedAmounts,[30]);
});

test('a paid previous year remains selectable across New Year for the rest of its 24-hour window',async t=>{
  const h=await harness();t.after(h.close);
  h.advance(Date.parse('2026-12-31T14:00:00Z')-Date.parse(fixedNow));
  h.fill({topic:'annual',fortuneYear:2025});h.submit();await h.ready('annual',2025);
  h.advance(2*3600000,{focus:true});
  await waitFor(()=>!h.$('report-product-picker').disabled);
  assert.ok([...h.$('fortune-year').options].some(option=>option.value==='2025'));
  h.$('edit-birth').click();h.fill({topic:'annual',fortuneYear:2025});
  await waitFor(()=>!h.$('open-story').disabled&&/0쭈/.test(h.$('open-story').textContent));
  assert.ok([...h.$('entry-year').options].some(option=>option.value==='2025'));
  h.submit();await h.ready('annual',2025);assert.deepEqual(h.state.chargedAmounts,[10]);
  const previousChecks=h.state.statusCalls.length;
  h.changeAccount('member-b');h.fill({topic:'annual'});
  await waitFor(()=>h.state.statusCalls.length>previousChecks&&!h.$('open-story').disabled);
  assert.equal([...h.$('entry-year').options].some(option=>option.value==='2025'),false,'the next account cannot inherit an owned historical year');
});

test('completed birth input automatically saves, survives reload, and restores every field without a purchase',async t=>{
  const h=await harness();t.after(h.close);
  const key='ojjuda-saju-profiles-v1:'+PROFILE_USER_A,host=h.$('saved-profiles');
  h.fill({name:'자동 저장',gender:'female',year:2023,month:2,day:10,calendar:'lunar',leap:true,hour:8,minute:37});
  h.advance(599);assert.equal(host.querySelectorAll('.profile-picker-use').length,0);
  h.advance(1);await waitFor(()=>host.querySelectorAll('.profile-picker-use').length===1);
  const first=JSON.parse(h.window.localStorage.getItem(key)).profiles[0];
  assert.deepEqual(first.birth,{year:2023,month:2,day:10,calendar:'lunar',leapMonth:true,hour:8,minute:37});
  const name=h.$('person-name');
  name.dispatchEvent(new h.window.CompositionEvent('compositionstart',{bubbles:true}));
  name.value='한';name.dispatchEvent(new h.window.InputEvent('input',{bubbles:true,isComposing:true}));
  h.advance(600);assert.equal(JSON.parse(h.window.localStorage.getItem(key)).profiles[0].name,'자동 저장','an unfinished IME composition is not stored');
  name.value='한별';name.dispatchEvent(new h.window.CompositionEvent('compositionend',{bubbles:true}));
  h.advance(600);await waitFor(()=>host.querySelector('.profile-picker-use').textContent.includes('한별'));
  const edited=JSON.parse(h.window.localStorage.getItem(key)).profiles;
  assert.equal(edited.length,1);assert.equal(edited[0].id,first.id);assert.equal(edited[0].name,'한별');
  const stored=h.window.localStorage.getItem(key);
  h.$('entry-year').value='2027';h.change(h.$('entry-year'));
  const product=h.window.document.querySelector('input[name="entry-topic"][value="annual"]');product.checked=true;h.change(product);
  h.advance(600);assert.equal(h.window.localStorage.getItem(key),stored,'product and forecast-year controls never edit a saved person');
  const reloaded=await harness({initialStorage:{[key]:stored}});t.after(reloaded.close);
  const saved=reloaded.$('saved-profiles').querySelector('.profile-picker-use');assert.ok(saved);saved.click();
  assert.equal(reloaded.$('person-name').value,'한별');assert.equal(reloaded.$('person-gender').value,'female');
  assert.equal(reloaded.window.document.querySelector('input[name="calendar"]:checked').value,'lunar');
  assert.equal(reloaded.$('leap-month').checked,true);assert.equal(reloaded.$('time-unknown').checked,false);
  assert.deepEqual(['birth-year','birth-month','birth-day','birth-hour','birth-minute'].map(id=>reloaded.$(id).value),['2023','2','10','8','37']);
  for(const page of [h,reloaded]){assert.equal(page.state.starts.length,0);assert.equal(page.state.charges,0);}
});

test('incomplete birth input waits quietly and valid pending edits flush synchronously before leaving the page',async t=>{
  const h=await harness();t.after(h.close);
  const key='ojjuda-saju-profiles-v1:'+PROFILE_USER_A,host=h.$('saved-profiles'),name=h.$('person-name');
  name.value='작성 중';name.dispatchEvent(new h.window.Event('input',{bubbles:true}));h.advance(600);
  assert.equal(host.querySelectorAll('.profile-picker-use').length,0);
  assert.notEqual(host.querySelector('.profile-picker-status').dataset.state,'error');
  h.fill({name:'이동 전 저장',gender:'male',hour:null});
  h.window.dispatchEvent(new h.window.Event('pagehide'));
  assert.equal(JSON.parse(h.window.localStorage.getItem(key)).profiles[0].name,'이동 전 저장','pagehide saves before returning from the event');
  name.value='포커스 이동';name.dispatchEvent(new h.window.Event('input',{bubbles:true}));
  name.dispatchEvent(new h.window.FocusEvent('focusout',{bubbles:true,relatedTarget:h.$('open-story')}));
  assert.equal(JSON.parse(h.window.localStorage.getItem(key)).profiles[0].name,'포커스 이동');
  name.value='화면을 닫기 전';name.dispatchEvent(new h.window.Event('input',{bubbles:true}));
  Object.defineProperty(h.window.document,'visibilityState',{configurable:true,value:'hidden'});
  h.window.document.dispatchEvent(new h.window.Event('visibilitychange'));
  assert.equal(JSON.parse(h.window.localStorage.getItem(key)).profiles[0].name,'화면을 닫기 전');
  assert.equal(host.querySelectorAll('.profile-picker-use').length,1);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);
});

test('delayed identity and wallet failure still allow local saving while rapid account changes cancel old edits',async t=>{
  const identityGate=deferred(),h=await harness({identityGate,failInit:Infinity});t.after(h.close);
  const key=owner=>'ojjuda-saju-profiles-v1:'+owner,host=h.$('saved-profiles');
  h.fill({name:'첫 로그인 전에 입력',gender:'female',hour:8,minute:37});h.advance(600);
  assert.equal(host.querySelectorAll('.profile-picker-use').length,0);
  identityGate.resolve();await waitFor(()=>h.state.instances[0].identityReady);
  assert.equal(h.$('person-name').value,'첫 로그인 전에 입력','the first confirmed owner does not erase the current input');
  h.advance(600);await waitFor(()=>host.querySelectorAll('.profile-picker-use').length===1);
  assert.equal(h.state.instances[0].ready,false,'a failed wallet initialization remains separate from local identity');
  const beforeInitCalls=h.state.initCalls;
  h.$('person-name').value='잔액 확인 없이 수정';h.change(h.$('person-name'));
  host.querySelector('.profile-picker-save').click();
  await waitFor(()=>host.querySelector('.profile-picker-status').dataset.state==='success');
  assert.equal(h.state.initCalls,beforeInitCalls,'manual saving does not retry wallet or auth initialization');
  assert.ok(!h.state.moduleRequests.some(url=>/\/(readings|fortune-data|daeun)\.mjs/.test(url)),'the local zodiac preview does not load paid readings or start a purchase');
  const storedA=h.window.localStorage.getItem(key(PROFILE_USER_A));
  h.$('person-name').value='취소되어야 할 수정';h.change(h.$('person-name'));
  h.changeAccount(PROFILE_USER_B);
  assert.equal(h.$('person-name').value,'');assert.equal(h.$('birth-year').value,'');
  assert.equal(host.querySelectorAll('.profile-picker-use').length,0,'a real account change clears even before any wallet initialization succeeds');
  h.changeAccount(PROFILE_USER_A);h.changeAccount(PROFILE_USER_B);h.advance(600);await pause();
  assert.equal(h.window.localStorage.getItem(key(PROFILE_USER_A)),storedA);
  assert.equal(h.window.localStorage.getItem(key(PROFILE_USER_B)),null,'an old pending edit cannot enter a different account');
  h.fill({name:'두 번째 회원',gender:'male',year:1994,month:11,day:8,hour:null});h.advance(600);
  assert.equal(JSON.parse(h.window.localStorage.getItem(key(PROFILE_USER_B))).profiles[0].name,'두 번째 회원');
  h.$('person-name').value='로그아웃 전 미완료';h.change(h.$('person-name'));h.changeAccount(null,false);h.advance(600);await pause();
  assert.equal(h.$('person-name').value,'');assert.equal(host.querySelectorAll('.profile-picker-use').length,0);
  assert.equal(JSON.parse(h.window.localStorage.getItem(key(PROFILE_USER_B))).profiles[0].name,'두 번째 회원');
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);
});

test('saved people restore every birth field, render names as text, and allow edits and deletion without payment',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  const host=h.$('saved-profiles'),uses=()=>[...host.querySelectorAll('.profile-picker-use')];
  const save=async()=>{
    host.querySelector('.profile-picker-save').click();
    await waitFor(()=>host.querySelector('.profile-picker-status').dataset.state==='success'&&!host.querySelector('.profile-picker-save').disabled,'profile save did not settle');
  };
  h.fill({name:'한별',gender:'female',year:2023,month:2,day:10,calendar:'lunar',leap:true,hour:8,minute:37});
  await save();assert.equal(uses().length,1);
  assert.match(uses()[0].textContent,/한별.*여성.*음력.*윤달.*08:37/);
  host.querySelector('.profile-picker-new').click();
  assert.equal(h.$('person-name').value,'');assert.equal(h.$('birth-year').value,'');
  assert.equal(host.querySelectorAll('.is-selected').length,0);
  const markup='<img src=x onerror=alert(1)>';
  h.fill({name:markup,gender:'male',year:1994,month:11,day:8,hour:null});
  await save();assert.equal(uses().length,2);
  assert.ok(uses().some(button=>button.textContent.includes(markup)));
  assert.equal(host.querySelector('img,script,[onerror]'),null,'a stored name never becomes markup');
  uses().find(button=>button.textContent.includes('한별')).click();
  assert.equal(h.$('person-name').value,'한별');assert.equal(h.$('person-gender').value,'female');
  assert.equal(h.window.document.querySelector('input[name="calendar"]:checked').value,'lunar');
  assert.deepEqual(['birth-year','birth-month','birth-day','birth-hour','birth-minute'].map(id=>h.$(id).value),['2023','2','10','8','37']);
  assert.equal(h.$('leap-month').checked,true);assert.equal(h.$('time-unknown').checked,false);
  assert.equal(host.querySelectorAll('.is-selected').length,1);
  h.$('person-name').value='한별 수정';h.change(h.$('person-name'));await save();
  assert.equal(uses().length,2,'saving an edited selected person updates that record');
  assert.ok(uses().some(button=>button.textContent.includes('한별 수정')));
  uses().find(button=>button.textContent.includes(markup)).click();
  assert.equal(h.$('time-unknown').checked,true);assert.equal(h.$('birth-hour').value,'');assert.equal(h.$('birth-minute').value,'');
  assert.equal(h.$('leap-month').checked,false);assert.equal(h.window.document.querySelector('input[name="calendar"]:checked').value,'solar');
  host.querySelector('.is-selected .profile-picker-delete').click();
  assert.equal(uses().length,1);assert.equal(host.textContent.includes(markup),false);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);assert.equal(h.$('result').hidden,true);
});

test('another saved birthday costs ten ju only on opening and returning to the first keeps its original free access deadline',async t=>{
  const h=await harness();t.after(h.close);
  const host=h.$('saved-profiles'),uses=()=>[...host.querySelectorAll('.profile-picker-use')];
  const pick=name=>uses().find(button=>button.textContent.includes(name)).click();
  const save=async()=>{
    host.querySelector('.profile-picker-save').click();
    await waitFor(()=>host.querySelector('.profile-picker-status').dataset.state==='success'&&!host.querySelector('.profile-picker-save').disabled);
  };
  const quote=async(iso,amount)=>waitFor(()=>h.state.statusCalls.at(-1)?.solar.iso===iso
    &&h.$('open-story').dataset.expectedCharge===String(amount)&&!h.$('open-story').disabled);
  h.fill({name:'먼저 볼 사람',gender:'female',year:1990,month:5,day:17,hour:8,minute:37,topic:'annual',fortuneYear:2026});
  h.advance(600);await waitFor(()=>uses().length===1);
  host.querySelector('.profile-picker-new').click();
  h.fill({name:'다른 생일의 사람',gender:'male',year:1994,month:11,day:8,hour:8,minute:37,topic:'annual',fortuneYear:2026});
  await save();assert.equal(uses().length,2);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0,'entering and saving two birthdays never purchases a reading');

  pick('먼저 볼 사람');await quote('1990-05-17',10);
  assert.equal(h.state.starts.length,0,'selecting a saved person only checks the quote');
  h.submit();await h.ready('annual',2026);
  assert.deepEqual(h.state.chargedAmounts,[10]);
  const [firstKey,first]=[...h.state.receipts.entries()][0],original={...first},originalNote=h.$('current-reading-note').textContent;
  h.advance(60*60*1000);
  h.$('edit-birth').click();pick('다른 생일의 사람');await quote('1994-11-08',10);
  await save();
  assert.equal(h.state.starts.length,1);assert.equal(h.state.charges,1,'switching or saving the second birthday does not debit');
  assert.equal(h.$('result').hidden,true);
  h.submit();await h.ready('annual',2026);
  assert.equal(h.state.starts[1].expectedCharge,10);assert.equal(h.state.starts[1].chart.solar.iso,'1994-11-08');
  assert.deepEqual(h.state.chargedAmounts,[10,10],'the second birthday costs ten total, with no separate surcharge');
  assert.equal(h.state.receipts.size,2);assert.deepEqual(h.state.receipts.get(firstKey),original);

  h.advance(2*60*60*1000);
  h.$('edit-birth').click();pick('먼저 볼 사람');await quote('1990-05-17',0);
  await save();
  assert.equal(h.state.starts.length,2);assert.equal(h.state.charges,2);
  assert.deepEqual(h.state.receipts.get(firstKey),original,'selecting and saving an existing birthday does not renew its paid access');
  h.submit();await h.ready('annual',2026);
  assert.equal(h.state.starts[2].expectedCharge,0);assert.equal(h.state.starts[2].chart.solar.iso,'1990-05-17');
  assert.equal(h.state.starts[2].year,2026);assert.deepEqual(h.state.chargedAmounts,[10,10]);
  assert.equal(h.state.coins,10);assert.equal(h.state.receipts.size,2);
  assert.deepEqual(h.state.receipts.get(firstKey),original,'the original request, payment time and expiry remain unchanged');
  assert.equal(h.$('current-reading-note').textContent,originalNote,'the displayed deadline also remains the original one');
});

test('saved people persist on reopening and remain isolated after account changes and sign-out',async t=>{
  const original=await harness({user:PROFILE_USER_A});t.after(original.close);
  original.fill({name:'내가 저장한 사람',gender:'male',hour:4,minute:12});
  original.$('saved-profiles').querySelector('.profile-picker-save').click();
  await waitFor(()=>original.$('saved-profiles').querySelectorAll('.profile-picker-use').length===1);
  const storage=original.window.localStorage;
  const initialStorage=Object.fromEntries(Array.from({length:storage.length},(_,index)=>{const key=storage.key(index);return [key,storage.getItem(key)];}));
  const h=await harness({user:PROFILE_USER_A,initialStorage});t.after(h.close);
  const host=h.$('saved-profiles');
  assert.equal(host.querySelectorAll('.profile-picker-use').length,1);
  host.querySelector('.profile-picker-use').click();
  assert.equal(h.$('person-name').value,'내가 저장한 사람');assert.equal(h.$('birth-hour').value,'4');
  h.changeAccount(PROFILE_USER_B);await pause();
  assert.equal(host.querySelectorAll('.profile-picker-use').length,0);assert.equal(host.textContent.includes('내가 저장한 사람'),false);
  assert.equal(h.$('person-name').value,'');assert.equal(h.$('person-gender').value,'');assert.equal(h.$('birth-year').value,'');
  h.changeAccount(PROFILE_USER_A);await pause();
  assert.equal(host.querySelectorAll('.profile-picker-use').length,1);
  h.changeAccount(null,false);await pause();
  assert.equal(host.querySelectorAll('.profile-picker-use').length,0);assert.equal(host.querySelector('.profile-picker-save').disabled,true);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);assert.equal(original.state.starts.length,0);
});

test('a device storage failure is visible and preserves the entered information without claiming a save or charging',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  h.fill({name:'지워지면 안 되는 입력',gender:'female',hour:8,minute:37});
  const host=h.$('saved-profiles');
  h.window.Storage.prototype.setItem=function(){throw new h.window.DOMException('storage full','QuotaExceededError');};
  host.querySelector('.profile-picker-save').click();
  await waitFor(()=>host.querySelector('.profile-picker-status').dataset.state==='error');
  const status=host.querySelector('.profile-picker-status');
  assert.match(status.textContent,/저장 공간.*부족/);assert.equal(status.getAttribute('role'),'alert');
  assert.doesNotMatch(status.textContent,/저장했어요/);assert.equal(host.querySelectorAll('.profile-picker-use').length,0);
  assert.equal(h.$('person-name').value,'지워지면 안 되는 입력');assert.equal(h.$('person-gender').value,'female');
  assert.equal(h.$('birth-hour').value,'8');assert.equal(h.$('birth-minute').value,'37');
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);assert.equal(h.$('result').hidden,true);
});

test('name and gender edits reuse the original entitlement while the actual ten-year reading follows the selected gender',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  h.fill({name:'민준',gender:'male',hour:8,minute:37});h.submit();await h.ready();
  assert.equal(h.$('reading-daeun').querySelectorAll('.daeun-period[data-daeun-period]').length,9);
  const firstDaeun=h.$('reading-daeun').textContent,receipt=[...h.state.receipts.values()][0],expiry=receipt.expires_at;
  const firstBirth=JSON.stringify(h.state.starts[0].chart.input);
  assert.equal(h.$('saved-profiles').querySelectorAll('.profile-picker-use').length,1,'opening a reading also saves its entered person');
  h.$('edit-birth').click();
  h.$('person-name').value='민준 이름 수정';h.change(h.$('person-name'));
  h.$('person-gender').value='female';h.change(h.$('person-gender'));
  await waitFor(()=>h.$('open-story').dataset.expectedCharge==='0'&&!h.$('open-story').disabled);
  assert.equal(h.state.starts.length,1,'changing display details never purchases automatically');
  h.submit();await h.ready();
  assert.notEqual(h.$('reading-daeun').textContent,firstDaeun);
  assert.equal(h.state.starts.at(-1).expectedCharge,0);assert.equal(h.state.charges,1);
  assert.equal(JSON.stringify(h.state.starts.at(-1).chart.input),firstBirth);
  assert.equal([...h.state.receipts.values()][0].expires_at,expiry);
  h.$('edit-birth').click();h.$('person-name').value='<svg/onload=alert(1)>';h.change(h.$('person-name'));
  await waitFor(()=>h.$('open-story').dataset.expectedCharge==='0'&&!h.$('open-story').disabled);
  h.submit();await h.ready();assert.equal(h.state.charges,1);
  assert.equal(h.$('birth-summary').querySelector('[onload],script'),null);
  assert.equal(h.$('saved-profiles').querySelector('[onload],script'),null);
  h.pickReport('all',2026);h.$('open-product').click();await h.ready('all',2026);
  assert.equal(h.$('reading-daeun').querySelectorAll('.daeun-period[data-daeun-period]').length,9);
  assert.deepEqual(h.state.chargedAmounts,[10,20],'the ten-year reading adds no fee to lifelong or full access');
});

test('unknown birth time assumes 06:00 only for daeun while preserving stored input and the original paid access',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  h.fill({name:'시간 미상 예시',gender:'female',hour:null});h.submit();await h.ready();
  const notice='태어난 시간을 몰라 대운은 오전 6시 00분을 기준으로 계산했어요.';
  assert.equal(h.$('reading-daeun').querySelectorAll('.daeun-period[data-daeun-period]').length,9);
  assert.equal(h.$('reading-daeun').querySelector('.daeun-time-notice').textContent,notice);
  const chart=h.state.starts[0].chart,originalChart=JSON.stringify(chart);
  assert.equal(chart.timeKnown,false);assert.equal(chart.input.hour,null);assert.equal(chart.input.minute,0);
  const hourPillar=chart.pillars.find(pillar=>pillar.key==='hour');
  assert.equal(hourPillar.uncertain,true);assert.equal(hourPillar.hanja,null,'the general natal chart must not acquire a made-up hour pillar');
  assert.equal(hourPillar.reason,'birth-time-unknown');
  assert.match(h.$('birth-summary').textContent,/시간 모름/);
  const storageKey='ojjuda-saju-profiles-v1:'+PROFILE_USER_A;
  const stored=()=>JSON.parse(h.window.localStorage.getItem(storageKey)).profiles[0].birth;
  assert.equal(stored().hour,null);assert.equal(stored().minute,0);
  assert.equal(h.$('time-unknown').checked,true);
  const [receiptKey,receipt]=[...h.state.receipts.entries()][0],originalReceipt={...receipt};
  assert.match(receiptKey,/\|unknown\|lifelong\|0$/,'the payment identity remains the original unknown-time birth');
  assert.deepEqual(h.state.chargedAmounts,[10],'the assumed daeun adds no surcharge');
  h.$('copy-reading').click();await waitFor(()=>h.state.copies.length===1);
  assert.ok(h.state.copies[0].includes(notice),'the copy clearly discloses the daeun-only assumption');
  assertNoCalculationUI(h);

  h.advance(2*3600000);h.$('edit-birth').click();
  h.$('time-unknown').checked=false;h.change(h.$('time-unknown'));
  h.$('birth-hour').value='6';h.change(h.$('birth-hour'));
  h.$('birth-minute').value='0';h.change(h.$('birth-minute'));
  await waitFor(()=>h.state.statusCalls.at(-1)?.timeKnown===true&&h.$('open-story').dataset.expectedCharge==='10'&&!h.$('open-story').disabled);
  assert.equal(h.state.statusCalls.at(-1).input.hour,6,'an explicitly entered 06:00 remains a different birth identity');
  assert.equal(h.state.starts.length,1,'editing the time only refreshes the quote');
  h.$('time-unknown').checked=true;h.change(h.$('time-unknown'));
  await waitFor(()=>h.state.statusCalls.at(-1)?.timeKnown===false&&h.$('open-story').dataset.expectedCharge==='0'&&!h.$('open-story').disabled);
  h.submit();await h.ready();
  assert.equal(h.state.starts.at(-1).expectedCharge,0);assert.deepEqual(h.state.chargedAmounts,[10]);
  assert.equal(JSON.stringify(h.state.starts.at(-1).chart),originalChart,'daeun preparation leaves every original chart field unchanged');
  assert.deepEqual(h.state.receipts.get(receiptKey),originalReceipt,'reopening keeps the request, payment time and 24-hour deadline');
  assert.equal(stored().hour,null);assert.equal(stored().minute,0);
  assert.equal(h.$('reading-daeun').querySelectorAll('.daeun-period[data-daeun-period]').length,9);
  h.advance(Date.parse(originalReceipt.expires_at)-h.window.Date.now());
  assert.equal(h.$('report-content').textContent,'');assert.equal(h.$('copy-reading').disabled,true);
  assert.deepEqual(h.state.chargedAmounts,[10],'the assumed-time reading never renews itself');
});

test('a known but uncertain solar-term minute still does not fabricate ten-year periods',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  h.fill({name:'절기 경계',gender:'male',year:2024,month:2,day:4,hour:17,minute:27});h.submit();await h.ready();
  assert.equal(h.$('reading-daeun').querySelectorAll('.daeun-period[data-daeun-period]').length,0);
  const score=h.$('reading-daeun').querySelector('.saju-reading-score');
  assert.equal(score.dataset.readingScoreStatus,'unavailable');
  assert.equal(score.querySelector('[role="meter"]'),null,'a known boundary minute is not replaced by 06:00');
  assert.match(h.$('reading-daeun').textContent,/절기/);
  assert.equal(h.state.chargedAmounts[0],10);
});

test('unchecking the main unknown-time box leaves hour and minute unselected until both are explicitly entered',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);h.fill({gender:'male',hour:null});
  for(const id of ['birth-hour','birth-minute']) {assert.equal(h.$(id).value,'');assert.equal(h.$(id).required,true);assert.equal(h.$(id).disabled,true);}
  h.$('time-unknown').checked=false;h.change(h.$('time-unknown'));
  assert.equal(h.$('birth-hour').value,'');assert.equal(h.$('birth-minute').value,'');
  assert.equal(h.$('birth-form').checkValidity(),false);h.submit();await pause();assert.equal(h.state.starts.length,0);
  h.$('birth-hour').value='0';h.change(h.$('birth-hour'));
  assert.equal(h.$('birth-form').checkValidity(),false);h.submit();await pause();assert.equal(h.state.starts.length,0);
  h.$('birth-minute').value='0';h.change(h.$('birth-minute'));
  await waitFor(()=>!h.$('open-story').disabled);h.submit();await h.ready();
  assert.equal(h.state.starts[0].chart.input.hour,0);assert.equal(h.state.starts[0].chart.input.minute,0);
  assert.equal(h.state.starts[0].chart.timeKnown,true);assert.deepEqual(h.state.chargedAmounts,[10]);
});

test('returning to the saju tab refreshes people saved or deleted in another tab without purchasing',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  const other=await harness({user:PROFILE_USER_A});t.after(other.close);
  const host=h.$('saved-profiles'),otherHost=other.$('saved-profiles');
  assert.equal(host.querySelectorAll('.profile-picker-use').length,0);
  other.fill({name:'다른 탭에서 저장',gender:'female',year:1993,month:7,day:12,hour:9,minute:25});
  otherHost.querySelector('.profile-picker-save').click();
  await waitFor(()=>otherHost.querySelectorAll('.profile-picker-use').length===1);
  const key='ojjuda-saju-profiles-v1:'+PROFILE_USER_A;
  const saved=other.window.localStorage.getItem(key);assert.ok(saved);
  h.window.localStorage.setItem(key,saved);
  assert.equal(host.querySelectorAll('.profile-picker-use').length,0,'storage synchronization alone does not manipulate the existing DOM');
  h.window.dispatchEvent(new h.window.Event('focus'));
  await waitFor(()=>host.querySelectorAll('.profile-picker-use').length===1);
  assert.match(host.querySelector('.profile-picker-use').textContent,/다른 탭에서 저장.*여성.*09:25/);
  assert.equal(h.$('person-name').value,'');assert.equal(h.$('birth-year').value,'','refreshing the list does not fill or purchase a person automatically');
  otherHost.querySelector('.profile-picker-delete').click();
  const deleted=other.window.localStorage.getItem(key);
  if(deleted===null)h.window.localStorage.removeItem(key);else h.window.localStorage.setItem(key,deleted);
  assert.equal(host.querySelectorAll('.profile-picker-use').length,1);
  h.window.dispatchEvent(new h.window.StorageEvent('storage',{key,oldValue:saved,newValue:deleted,storageArea:h.window.localStorage,url:other.window.location.href}));
  await waitFor(()=>host.querySelectorAll('.profile-picker-use').length===0);
  assert.equal(host.textContent.includes('다른 탭에서 저장'),false);
  for(const tab of [h,other]) {assert.equal(tab.state.starts.length,0);assert.equal(tab.state.charges,0);assert.equal(tab.$('result').hidden,true);}
});


test('zodiac preview follows the actual birth date before login and clears incomplete or invalid inputs',async t=>{
  const h=await harness({user:null,signedIn:false});t.after(h.close);
  assert.equal(h.$('birth-zodiac').hidden,true);
  h.fill({year:1990,month:1,day:1});
  await waitFor(()=>!h.$('birth-zodiac').hidden);
  assert.match(h.$('birth-zodiac').textContent,/뱀띠.*사주에서는 입춘부터 띠가 바뀌어요/);
  h.fill({year:2024,month:2,day:4,hour:null});
  await waitFor(()=>h.$('birth-zodiac').textContent.includes('토끼띠 / 용띠'));
  assert.match(h.$('birth-zodiac').textContent,/태어난 시간을 알아야/);
  h.fill({year:2024,month:2,day:4,hour:20,minute:0});
  await waitFor(()=>h.$('birth-zodiac').querySelector('strong')?.textContent==='용띠');
  h.fill({year:2024,month:2,day:30});
  assert.equal(h.$('birth-zodiac').hidden,true);await pause();
  assert.equal(h.$('birth-zodiac').textContent,'');
  h.fill({year:2024,month:1,day:1,calendar:'lunar'});
  await waitFor(()=>h.$('birth-zodiac').querySelector('strong')?.textContent==='용띠');
  h.$('birth-month').value='';h.change(h.$('birth-month'));
  assert.equal(h.$('birth-zodiac').hidden,true);assert.equal(h.$('birth-zodiac').textContent,'');
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);
});

test('zodiac labels appear in saved people, restore on selection, and accompany the result and copy',async t=>{
  const h=await harness();t.after(h.close);
  h.fill({year:1990,month:1,day:1,name:'연초 생일'});h.advance(600);
  const host=h.$('saved-profiles');
  await waitFor(()=>host.querySelector('.profile-picker-zodiac')?.textContent.includes('뱀띠'));
  host.querySelector('.profile-picker-new').click();
  assert.equal(h.$('birth-zodiac').hidden,true);
  host.querySelector('.profile-picker-use').click();
  await waitFor(()=>h.$('birth-zodiac').querySelector('strong')?.textContent==='뱀띠');
  assert.equal(h.$('birth-year').value,'1990');assert.equal(h.$('birth-month').value,'1');
  assert.equal(h.state.starts.length,0);
  h.submit();await h.ready();
  assert.match(h.$('result-zodiac').textContent,/뱀띠.*입춘/);
  h.$('copy-reading').click();await waitFor(()=>h.state.copies.length===1);
  assert.match(h.state.copies[0],/뱀띠 · 사주에서는 입춘부터 띠가 바뀌어요/);
  assert.equal(h.state.charges,1);
  h.changeAccount(PROFILE_USER_B);
  assert.equal(h.$('result-zodiac').hidden,true);assert.equal(h.$('result-zodiac').textContent,'');
  assert.equal(h.$('birth-zodiac').hidden,true);assert.equal(h.$('birth-zodiac').textContent,'');
  await waitFor(()=>h.state.instances[0].ready);await pause();
});

test('a delayed zodiac module never blocks saving or restores a cleared or previous-account preview',async t=>{
  const zodiacGate=deferred(),h=await harness({zodiacGate,failInit:Infinity});t.after(h.close);
  h.fill({year:1990,month:1,day:1,name:'먼저 저장'});h.advance(600);
  const host=h.$('saved-profiles');
  await waitFor(()=>host.querySelectorAll('.profile-picker-use').length===1);
  assert.equal(h.$('birth-zodiac').hidden,true);
  assert.equal(JSON.parse(h.window.localStorage.getItem('ojjuda-saju-profiles-v1:'+PROFILE_USER_A)).profiles[0].name,'먼저 저장');
  host.querySelector('.profile-picker-new').click();h.changeAccount(PROFILE_USER_B);
  zodiacGate.resolve();await waitFor(()=>h.state.moduleRequests.some(url=>/zodiac\.mjs/.test(url)));await pause();
  assert.equal(h.$('birth-zodiac').hidden,true);assert.equal(h.$('birth-zodiac').textContent,'');
  assert.equal(host.querySelectorAll('.profile-picker-zodiac').length,0);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);
});
