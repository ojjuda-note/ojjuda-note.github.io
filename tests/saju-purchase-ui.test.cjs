const test = require('node:test');
const assert = require('node:assert/strict');
const {
  harness, fixedNow, PROFILE_USER_A, PROFILE_USER_B, pause, deferred, waitFor, selectReadingItem, assertNoReadingScores, assertNoCalculationUI, assertReadingScores, assertReadingScoreCopy
} = require('./helpers/saju-ui-harness.cjs');

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
