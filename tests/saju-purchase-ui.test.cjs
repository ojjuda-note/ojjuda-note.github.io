const test = require('node:test');
const assert = require('node:assert/strict');
const {
  harness, fixedNow, PROFILE_USER_A, PROFILE_USER_B, pause, deferred, waitFor, selectReadingItem, assertNoReadingScores, assertNoCalculationUI, assertReadingScores, assertReadingScoreCopy
} = require('./helpers/saju-ui-harness.cjs');
const {currentStory,chooseStory,followStory,collectStories}=require('./helpers/saju-story-ui.cjs');

const choices=h=>[...h.$('report-content').querySelectorAll('.reading-item-button')];
const monthChoices=h=>choices(h).filter(button=>/^reading-month-\d+$/.test(button.dataset.readingTarget));
async function model(h) {
  const [{analyzeFortune},{buildDetailedReading},{analyzeDaeun}]=await Promise.all([
    import('../games/starlit-saju/fortune-data.mjs'),import('../games/starlit-saju/readings.mjs'),import('../games/starlit-saju/daeun.mjs')]);
  const chart=h.state.starts.at(-1).chart,now=new Date(fixedNow),year=Number(h.$('report-content').dataset.year)||2026;
  const topic=h.$('report-content').dataset.topic,daeun=['lifelong','all'].includes(topic)?analyzeDaeun(chart,{gender:h.$('person-gender').value,now}):null;
  return buildDetailedReading(chart,analyzeFortune(chart,{year,now}),{daeun});
}
async function copy(h) {
  h.openTools();const count=h.state.copies.length;h.$('copy-reading').click();
  await waitFor(()=>h.state.copies.length===count+1);return h.state.copies.at(-1);
}

// Purchase, authorization and failed request handling.
// Separate files give Node a process boundary for fresh jsdom/VM app
// contexts; all original scenarios and assertions remain intact.
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
  const h=await harness({failStatus:1});t.after(h.close);h.fill();await h.flow.next();
  await waitFor(()=>!h.$('entry-check-error').hidden);
  await h.submit();
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
  const chart=h.state.starts[0].chart;h.openTools();h.$('edit-birth').click();
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
    assert.equal(h.state.charges,0);assert.equal(monthChoices(h).length,12);
    for(const button of monthChoices(h))assert.equal(chooseStory(h.$('reading-page-select'),button.dataset.readingTarget).dataset.storySource,button.dataset.readingTarget);
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
  const host=h.$('report-content'),domains=[...host.querySelectorAll('.reading-domain-button')].map(button=>button.dataset.readingDomain);
  for(const topic of ['lifelong','annual','monthly'])assert.ok(domains.includes(topic),'all three purchased categories remain available');
  assert.equal(monthChoices(h).length,12);
  for(const id of ['reading-lifelong','reading-annual','reading-months'])assert.equal(followStory(host,id),currentStory(host));
  assert.equal(h.$('report-toc'),null,'the legacy outer contents is replaced by the story menu');
  const ids=[...h.$('report-content').querySelectorAll('[id]')].map(item=>item.id);
  assert.equal(new Set(ids).size,ids.length,'the combined view has no duplicate section IDs');
  const scenes=collectStories(host),scores=scenes.flatMap(scene=>scene.scores);
  assert.ok(scores.length>0);
  for(const score of scores) {
    if(score.status==='unavailable') {
      assert.equal(score.meters.length,0,'unsupported items never become zero scores');assert.ok(score.reason.trim());continue;
    }
    assert.equal(score.status,'available');assert.equal(score.meters.length,2);
    assert.deepEqual(score.meters.map(meter=>meter.wind),['tailwind','headwind']);
    for(const meter of score.meters) {
      const label=meter.wind==='tailwind'?'순풍':'역풍';
      assert.ok(Number.isInteger(meter.value)&&meter.value>=0&&meter.value<=100);
      assert.equal(meter.min,'0');assert.equal(meter.max,'100');assert.equal(meter.width,`${meter.value}%`);
      assert.ok(meter.name.includes(label));assert.ok(meter.text.includes(label)&&meter.text.includes(`${meter.value}점`));
    }
  }
  assert.ok(scores.some(score=>score.status==='available'&&score.meters.reduce((sum,meter)=>sum+meter.value,0)!==100),'the real fixture exercises independent values, not a complementary total');
  assert.equal(new Set(scenes.map(scene=>scene.id)).size,scenes.length,'every purchased scene has a unique identifier');
  assertNoCalculationUI(h);
  await copy(h);
  assert.match(h.state.copies[0],/평생운/);assert.match(h.state.copies[0],/2026년/);assert.match(h.state.copies[0],/12월/);
  assert.doesNotMatch(h.state.copies[0],/1990-05-17|1990년\s*5월\s*17일/);
  assertReadingScoreCopy(h.state.copies[0],h.$('report-content'));
  assert.ok(h.state.copies[0].endsWith((await model(h)).copyByCategory.all),'copy retains the complete authored combined reading');
  for (const topic of ['lifelong','annual','monthly','all']) {
    h.pickReport(topic,2026);
    assert.match(h.$('open-product').textContent,/0쭈/);
    h.$('open-product').click();await h.ready(topic,topic==='lifelong'?0:2026);
    const includesPortrait=topic==='lifelong'||topic==='all';
    const reading=await model(h),portraitChoices=choices(h).filter(button=>reading.personPortrait.cards.some(card=>card.title===button.textContent||card.label===button.textContent));
    assert.equal(portraitChoices.length,includesPortrait?5:0,'the five personal topics belong only to lifelong and full readings');
    assert.equal(monthChoices(h).length,topic==='monthly'||topic==='all'?12:0,'all monthly overviews stay inside the opened monthly or full product');
    if(includesPortrait) {
      for(const [index,card] of reading.personPortrait.cards.entries())assert.equal(followStory(host,`person-portrait-topic-${index+1}`).dataset.portraitCard,card.id);
      followStory(host,'reading-summary');
    }
    assertReadingScores(h.$('report-content'));assertNoCalculationUI(h);
    await copy(h);
    assertReadingScoreCopy(h.state.copies.at(-1),h.$('report-content'));
    assert.ok(h.state.copies.at(-1).endsWith(reading.copyByCategory[topic]),`${topic} retains exactly the complete copy of its purchased scope`);
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
  await copy(h);
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
  assert.equal(monthChoices(h).length,12);
  chooseStory(h.$('reading-page-select'),'reading-month-12');
  assert.match(currentStory(h.$('report-content')).querySelector('.story-context').textContent,/2027/);
  assert.match(await copy(h),/2027년 12월/);
});

test('three separate purchases unlock the combined reading at zero extra ju', async t => {
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  for (const topic of ['annual','monthly']) {h.pickReport(topic);h.$('open-product').click();await h.ready(topic,2026);}
  assert.deepEqual(h.state.chargedAmounts,[10,10,10]);assert.equal(h.state.coins,0);
  h.pickReport('all');assert.match(h.$('open-product').textContent,/0쭈/);
  assert.equal(h.window.document.querySelector('[data-report-price="all"]').textContent,'이용 가능');
  h.$('open-product').click();await h.ready('all',2026);
  assert.deepEqual(h.state.chargedAmounts,[10,10,10]);assert.equal(h.state.coins,0);
  h.openTools();h.$('edit-birth').click();h.fill({topic:'all'});
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
