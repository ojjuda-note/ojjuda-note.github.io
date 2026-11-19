const test = require('node:test');
const assert = require('node:assert/strict');
const {harness,fixedNow,pause,deferred,waitFor,assertNoReadingScores,assertNoCalculationUI,
  assertReadingScores,assertReadingScoreCopy}=require('./helpers/saju-ui-harness.cjs');
const {visible,currentStory,chooseStory,followStory,collectStories,collectCurrentTopic,
  assertOriginalParagraphs,assertSummaryAndScore,storiesForItem}=require('./helpers/saju-story-ui.cjs');

async function model(h,topic=h.$('report-content').dataset.topic,year=Number(h.$('report-content').dataset.year)||2026) {
  const [{analyzeFortune},{buildDetailedReading},{analyzeDaeun}]=await Promise.all([
    import('../games/starlit-saju/fortune-data.mjs'),import('../games/starlit-saju/readings.mjs'),import('../games/starlit-saju/daeun.mjs')]);
  const chart=h.state.starts.at(-1).chart,now=new Date(fixedNow),fortune=analyzeFortune(chart,{year,now});
  const daeun=['lifelong','all'].includes(topic)?analyzeDaeun(chart,{gender:h.$('person-gender').value||null,now}):null;
  return {fortune,reading:buildDetailedReading(chart,fortune,{daeun})};
}
async function copy(h) {
  h.openTools();const count=h.state.copies.length;h.$('copy-reading').click();await waitFor(()=>h.state.copies.length===count+1);
  return h.state.copies.at(-1);
}
function choices(h) {return [...h.$('report-content').querySelectorAll('.reading-item-button')];}
function chooseLabel(h,label) {
  const choice=choices(h).find(button=>button.textContent===label);assert.ok(choice,`${label} is available in the paid contents`);
  return chooseStory(h.$('reading-page-select'),choice.dataset.readingTarget);
}

// The real app, calculator and renderer run behind fake authentication/billing.
// These checks preserve payment, privacy and complete-copy contracts while
// observing the story that the user can actually read.
test('only the selected monthly product appears after its explicit ten-ju purchase receipt',async t=>{
  const readingsGate=deferred(),purchaseGate=deferred(),h=await harness({readingsGate,purchaseGate});t.after(h.close);
  h.fill({topic:'monthly'});h.submit();await pause();await pause();
  assert.equal(h.state.starts.length,0);assert.equal(h.$('result').hidden,true);
  assert.equal(h.window.document.querySelector('.story-scene'),null);assertNoReadingScores(h);
  readingsGate.resolve();await waitFor(()=>h.state.starts.length===1);
  assert.equal(h.state.starts[0].topic,'monthly');assert.equal(h.state.starts[0].year,2026);
  assert.equal(h.$('result').hidden,true);assert.equal(h.window.document.querySelector('.story-scene'),null);assertNoReadingScores(h);
  purchaseGate.resolve();await h.ready('monthly',2026);
  assert.equal(h.state.charges,1);assert.equal(h.state.coins,20);
  const first=currentStory(h.$('report-content'));
  assert.equal(first.dataset.storySource,'reading-month-11');assertReadingScores(first);assertNoCalculationUI(h);
  const domains=[...h.$('report-content').querySelectorAll('.reading-domain-button')].map(button=>button.dataset.readingDomain);
  assert.ok(!domains.includes('lifelong')&&!domains.includes('annual'));
  for(let month=1;month<=12;month++)assert.ok(choices(h).some(button=>button.dataset.readingTarget===`reading-month-${month}`));
  assert.match(h.$('result-warnings').textContent,/태어난 시간을 몰라서.*확인할 수 있는 부분만 풀이/);
  const {reading}=await model(h),text=await copy(h);
  assert.ok(text.endsWith(reading.copyByCategory.monthly));assert.ok(text.length>=10000,'the short screen preserves the complete paid reading');
});

test('choosing another product never charges or exposes it before the labelled open button',async t=>{
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  assert.equal(h.$('reading-tools').open,false);assert.equal(h.$('other-reading-options').open,false);
  assert.match(h.$('other-reading-options').querySelector('summary').textContent,/다른 풀이 보기.*전체 30쭈.*각각 10쭈/);
  const previous=h.$('report-content').textContent;
  h.pickReport('annual',2026);await pause();
  assert.equal(h.$('reading-tools').open,true);assert.equal(h.state.starts.length,1);assert.equal(h.$('report-content').textContent,previous);
  assert.equal(h.$('report-content').dataset.topic,'lifelong');assert.match(h.$('open-product').textContent,/10쭈/);
  h.$('open-product').click();await h.ready('annual',2026);
  assert.equal(h.$('reading-tools').open,false);assert.equal(h.$('other-reading-options').open,false);
  assert.equal(h.state.charges,2);
  h.pickReport('lifelong');assert.match(h.$('open-product').textContent,/0쭈/);
  h.$('open-product').click();await h.ready();
  assert.equal(h.state.starts.length,3);assert.equal(h.state.charges,2);assert.equal(h.$('report-content').dataset.topic,'lifelong');
});

test('reader settings, text size and topic navigation preserve the story and actual scores without payment',async t=>{
  const h=await harness();t.after(h.close);h.fill({hour:8,minute:37});h.submit();await h.ready();
  const doc=h.window.document,host=h.$('report-content'),original=host.textContent,scores=assertReadingScores(host);
  const tools=h.$('reading-tools'),trigger=doc.querySelector('[data-reader-tools="reading-tools"]');
  assert.equal(tools.open,false);assert.equal(trigger.getAttribute('aria-expanded'),'false');
  assert.equal(visible(h.$('copy-reading')),false);assert.equal(visible(h.$('edit-birth')),false);
  assert.match(h.$('current-reading-title').textContent,/평생운/);assert.match(h.$('current-reading-note').textContent,/다시 보기 0쭈/);
  trigger.click();assert.equal(tools.open,true);assert.equal(trigger.getAttribute('aria-expanded'),'true');
  assert.equal(doc.activeElement,tools.querySelector('[data-reader-tools-close]'));
  const normal=doc.querySelector('button[data-reading-size="normal"]'),large=doc.querySelector('button[data-reading-size="large"]');
  large.click();assert.equal(h.$('detailed-reading').dataset.readingSize,'large');assert.equal(large.getAttribute('aria-pressed'),'true');
  assert.equal(normal.getAttribute('aria-pressed'),'false');assert.equal(tools.open,false);assert.equal(doc.activeElement,trigger);
  assert.equal(host.textContent,original);assert.deepEqual(assertReadingScores(host),scores);
  const picker=h.$('reading-page-select'),first=picker.value;
  chooseStory(picker,choices(h)[1].dataset.readingTarget);assert.notEqual(currentStory(host).id,first);
  chooseStory(picker,first);assert.equal(host.textContent,original);assertNoCalculationUI(h);
  h.pickReport('annual',2027);assert.match(h.$('current-reading-title').textContent,/평생운/);assert.equal(host.textContent,original);
  normal.click();assert.equal(h.$('detailed-reading').dataset.readingSize,'normal');assert.equal(normal.getAttribute('aria-pressed'),'true');
  h.openTools();tools.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert.equal(tools.open,false);assert.equal(doc.activeElement,trigger);
  assert.equal(h.state.starts.length,1);assert.equal(h.state.charges,1);
});

test('the initial personal story has one conclusion, one short paragraph and visible meters while every full topic remains readable',async t=>{
  const h=await harness();t.after(h.close);h.fill({hour:8,minute:37});h.submit();await h.ready();
  const host=h.$('report-content'),result=h.$('result'),first=currentStory(host),{reading}=await model(h);
  assert.equal(first.querySelectorAll('.story-title').length,1);
  assert.equal(first.querySelector('.story-title').textContent,reading.personPortrait.summaryLines[0]);
  assert.equal(first.querySelectorAll('.story-body > p').length,1);
  assert.equal(first.querySelector('.story-body > p').textContent,reading.personPortrait.summaryLines[1]);
  for(const sentence of reading.personPortrait.summaryLines)assert.equal(first.textContent.split(sentence).length-1,1,'the first summary does not repeat its own wording');
  assert.equal(first.querySelectorAll('.saju-wind-meter[role="meter"]').length,2);
  assert.equal(host.querySelector('.reading-map,.map-return,.report-opening,details.reading-story-details'),null);
  assert.ok([...result.querySelectorAll('button,a,select,summary')].filter(visible).length<=6,'the closed result exposes only its reading/navigation controls');
  const scenes=collectStories(host),cards=reading.reader.lifelong.cards;
  assert.ok(cards.length>=16);
  for(const item of cards) {
    const parts=storiesForItem(scenes,item);assertOriginalParagraphs(parts,item.paragraphs,item.id);assertSummaryAndScore(parts,item,item.id);
    assert.ok(item.factIds.every(id=>id.startsWith('natal.')),'the actual lifelong model contains no unpaid period');
    assert.doesNotMatch(parts.map(part=>part.text).join(''),/사주는 태어난|이를 .십성|아래쪽 대표 글자|위쪽 글자/);
  }
  assertNoCalculationUI(h);assert.equal(h.$('report-status').textContent,'');
  const text=await copy(h);assert.ok(text.endsWith(reading.copyByCategory.lifelong),'copy retains every original heading, paragraph, example and score');
  assertReadingScoreCopy(text,first);assert.equal(h.state.charges,1);
});

test('portrait topics and original anchors retain complete explanations and never start a purchase',async t=>{
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  const host=h.$('report-content'),{reading}=await model(h),portrait=reading.personPortrait;
  assert.ok(portrait);assert.equal(portrait.cards.length,5);
  let parts=collectCurrentTopic(host);assertOriginalParagraphs(parts,portrait.paragraphs,'the personal portrait');assertSummaryAndScore(parts,portrait);
  assert.ok(parts.some(part=>part.text.includes(reading.reader.scopeNotice)),'the unknown-time scope is retained with the personal reading');
  for(const [index,item] of portrait.cards.entries()) {
    const scene=followStory(host,`person-portrait-topic-${index+1}`);
    assert.equal(scene.dataset.portraitCard,item.id);assert.ok(scene.contains(h.window.document.activeElement));
    parts=collectCurrentTopic(host);assertOriginalParagraphs(parts,item.paragraphs,item.id);assertSummaryAndScore(parts,item,item.id);
  }
  followStory(host,'reading-topics');assert.equal(host.querySelector('dialog.story-menu').open,true);
  host.querySelector('.story-menu-close').click();assert.equal(host.querySelector('dialog.story-menu').open,false);
  assertNoCalculationUI(h);assert.equal(h.state.starts.length,1);assert.equal(h.state.charges,1);
  const text=await copy(h);assert.ok(text.endsWith(reading.copyByCategory.lifelong));
  assert.ok(text.indexOf(portrait.headline)<text.indexOf(reading.reader.lifelong.headline));
});

test('monthly readers begin with the actual current month and can read the next month directly',async t=>{
  const h=await harness();t.after(h.close);h.fill({topic:'monthly'});h.submit();await h.ready('monthly',2026);
  const host=h.$('report-content'),{reading}=await model(h);
  assert.equal(currentStory(host).dataset.storySource,'reading-month-11');
  for(const month of [11,12]) {
    followStory(host,`month-title-${month}`);
    assert.equal(currentStory(host).dataset.storySource,`reading-month-${month}`);
    const source=reading.reader.months.find(item=>item.month===month),parts=collectCurrentTopic(host);
    assertSummaryAndScore(parts,source);assertOriginalParagraphs(parts,source.paragraphs);
  }
  assert.equal(h.state.charges,1);
});

test('the paid monthly stories preserve calculated periods, opportunities and cautions with their complete copy',async t=>{
  const h=await harness();t.after(h.close);h.fill({topic:'monthly',hour:8,minute:37});h.submit();await h.ready('monthly',2026);
  const host=h.$('report-content'),{reading}=await model(h);
  for(const item of reading.reader.timings.items) {
    followStory(host,`reading-timings-month-${item.month}`);
    assert.equal(currentStory(host).dataset.month,String(item.month));
    assert.ok(currentStory(host).querySelector('.story-context').textContent.includes(item.periodLabel));
    const parts=collectCurrentTopic(host);assertOriginalParagraphs(parts,item.paragraphs,item.title);assertSummaryAndScore(parts,item,item.title);
  }
  const text=await copy(h);assert.ok(text.endsWith(reading.copyByCategory.monthly));
  for(const item of reading.reader.timings.items)for(const point of [...item.cautions,...item.opportunities,...item.people,...item.documents]) {
    assert.ok(text.includes(point.label));assert.ok(text.includes(point.text));
  }
  assert.equal(h.state.starts.length,1);assert.equal(h.state.charges,1);
});

test('a new annual year is a separate explicit purchase and changing selection preserves the old copy',async t=>{
  const h=await harness();t.after(h.close);h.fill({topic:'annual'});h.submit();await h.ready('annual',2026);
  const host=h.$('report-content'),previous=host.textContent;
  h.pickReport('annual',2027);await pause();assert.equal(h.state.starts.length,1);assert.equal(host.textContent,previous);
  assert.match(h.$('open-product').textContent,/2027.*10쭈|10쭈.*2027/);
  const oldCopy=await copy(h);assert.match(oldCopy,/2026년 (운세|연간운|올해운)/);assert.doesNotMatch(oldCopy,/2027년 (운세|연간운|올해운)/);
  h.$('open-product').click();await h.ready('annual',2027);assert.equal(h.state.charges,2);assert.notEqual(host.textContent,previous);
  h.pickReport('annual',2026);assert.match(h.$('open-product').textContent,/0쭈/);h.$('open-product').click();await h.ready('annual',2026);assert.equal(h.state.charges,2);
});

test('all twelve month choices reuse the same paid entitlement',async t=>{
  const h=await harness();t.after(h.close);h.fill({topic:'monthly'});h.submit();await h.ready('monthly',2026);
  for(let month=1;month<=12;month++) {
    chooseStory(h.$('reading-page-select'),`reading-month-${month}`);
    assert.equal(currentStory(h.$('report-content')).dataset.storySource,`reading-month-${month}`);
    assert.equal(h.$('report-content').querySelector('dialog.story-menu').open,false);
  }
  assert.equal(h.state.starts.length,1);assert.equal(h.state.charges,1);
});

test('copy contains only the opened reading and its scores without birth inputs or calculation evidence',async t=>{
  const h=await harness();t.after(h.close);h.fill({hour:8,minute:37});h.submit();await h.ready();
  const text=await copy(h);assert.match(text,/평생운/);assert.doesNotMatch(text,/2026년 운세|2026년 12월|1990-05-17|1990년\s*5월\s*17일/);
  assertNoCalculationUI(h);assertReadingScores(h.$('report-content'));assertReadingScoreCopy(text,h.$('report-content'));
  const {reading}=await model(h);assert.ok(text.endsWith(reading.copyByCategory.lifelong));
});

test('every paid category keeps all actual interpretations and practical suggestions in its complete copy',async t=>{
  const h=await harness({adminPreview:true});t.after(h.close);h.fill({hour:8,minute:37});h.submit();await h.ready();
  for(const topic of ['lifelong','annual','monthly','all']) {
    if(topic!=='lifelong'){h.pickReport(topic,2026);h.$('open-product').click();await h.ready(topic,2026);}
    const host=h.$('report-content'),{reading}=await model(h),text=await copy(h);
    assert.ok(text.endsWith(reading.copyByCategory[topic]));assertNoCalculationUI(h);assertReadingScores(host);
    const overviews=topic==='all'?[reading.reader.lifelong,reading.reader.annual,...reading.reader.months]:topic==='monthly'?reading.reader.months:[reading.reader[topic]];
    for(const overview of overviews)for(const item of overview.cards)for(const value of [...item.summaryLines,...item.paragraphs])assert.ok(text.includes(value));
    const advice=topic==='all'?[...reading.adviceByCategory.lifelong,...reading.adviceByCategory.annual,...reading.months.flatMap(month=>month.advice)]
      :topic==='monthly'?reading.months.flatMap(month=>month.advice):reading.adviceByCategory[topic];
    assert.ok(advice.length>0);
    for(const item of advice) {
      assert.ok(text.includes(item.title));assert.ok(text.includes(item.action));assert.ok(text.includes(item.caution));
      assert.ok(choices(h).some(button=>button.textContent===item.title),'every grounded suggestion remains in the visible contents choices');
    }
    assert.equal(host.querySelector('.advice-notice,.advice-why'),null);assert.match(reading.adviceNotice,/오쭈다가 쓴 생활 제안/);
  }
  assert.equal(h.state.starts.length,4);assert.equal(h.state.charges,0);
});
