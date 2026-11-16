const test = require('node:test');
const assert = require('node:assert/strict');
const {
  harness, fixedNow, PROFILE_USER_A, PROFILE_USER_B, pause, deferred, waitFor, selectReadingItem, assertNoReadingScores, assertNoCalculationUI, assertReadingScores, assertReadingScoreCopy
} = require('./helpers/saju-ui-harness.cjs');

// Entitlement expiration and renewal.
// Separate files give Node a process boundary for fresh jsdom/VM app
// contexts; all original scenarios and assertions remain intact.
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
