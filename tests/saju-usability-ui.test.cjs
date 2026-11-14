const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, fixedNow, pause, waitFor } = require('./helpers/saju-ui-harness.cjs');

// Keep these full-report transitions in a separate test worker: Node's VM
// module contexts otherwise accumulate beside the core purchase scenarios.

test('staged paid reports keep decade, month and detailed reading links connected after purchase', async t => {
  const h=await harness({coins:100});t.after(h.close);
  h.fill({topic:'all',gender:'female',hour:null});h.submit();await h.ready('all',2026);
  const doc=h.window.document,host=h.$('report-content'),picker=h.$('reading-page-select');
  const current=()=>host.querySelector('[data-reader-current]');
  const pick=id=>{picker.value=id;h.change(picker);};
  function follow(link) {
    assert.ok(link,'the requested detail link is present');
    const target=h.$(link.hash.slice(1));assert.ok(target);
    link.click();
    assert.equal(target.closest('[hidden]'),null,'clicking '+link.textContent+' reveals its target after the prepared report is moved');
    assert.ok(current()===target||current().contains(target),'the requested target becomes the active page');
    assert.equal(host.querySelectorAll('[data-reader-current]').length,1);
    return target;
  }
  pick('reading-daeun');
  const periods=[...host.querySelectorAll('.daeun-nav a')];assert.equal(periods.length,9);
  for(const index of [0,4,8]) {
    pick('reading-daeun');
    const period=follow(periods[index]).closest('.daeun-period');
    follow(period.querySelector('.reading-page-section-link'));
    assert.equal(host.querySelector('.daeun-time-notice').closest('[hidden]'),null);
  }
  h.$('report-toc').querySelector('a[href="#reading-topics"]').click();
  assert.equal(h.$('reading-topics').closest('[hidden]'),null,'the outer contents opens the live report page');
  follow(h.$('reading-topics').querySelector('a[href^="#"]'));
  for(const month of [1,6,12]) {
    pick('reading-month-'+month);
    follow(h.$('reading-month-'+month).querySelector('.reading-page-section-link'));
  }
  h.pickReport('annual',2026);h.$('open-product').click();await h.ready('annual',2026);
  h.$('report-toc').querySelector('a[href="#reading-topics"]').click();
  const target=h.$(h.$('reading-topics').querySelector('a').hash.slice(1));
  h.$('reading-topics').querySelector('a').click();
  assert.equal(target.closest('[hidden]'),null,'links are connected after switching the purchased product too');
  assert.equal(host.querySelectorAll('[data-reader-current]').length,1);
  assert.deepEqual(h.state.chargedAmounts,[30],'navigation and the already included annual product do not add a charge');
  h.$('copy-reading').click();await pause();assert.equal(h.state.copies.length,1);
  assert.ok(!doc.querySelector('.source-entry,[data-fact-id]'),'navigation does not restore calculation evidence');
});

test('a foreground solar-term boundary refreshes only the open paid month and preserves reading controls',async t=>{
  const h=await harness();t.after(h.close);
  const boundary=Date.parse('2026-12-07T11:52:32+09:00');
  h.advance(boundary-30000-Date.parse(fixedNow));
  h.fill({topic:'monthly',hour:8,minute:37});h.submit();await h.ready('monthly',2026);
  const host=h.$('report-content'),doc=h.window.document;
  assert.equal(host.querySelector('.month-reading.is-current').id,'reading-month-11');
  h.$('reading-page-select').value='reading-month-6';h.change(h.$('reading-page-select'));
  h.$('reading-month-6').querySelector('.reading-page-section-link').click();
  const selected=host.querySelector('[data-reader-current]').id;
  doc.querySelector('[data-reading-size="large"]').click();
  h.pickReport('annual',2027);
  h.$('reading-page-select').focus();
  const receipt=JSON.stringify([...h.state.receipts.values()]),note=h.$('current-reading-note').textContent;
  h.advance(60000);
  await waitFor(()=>host.querySelector('.month-reading.is-current')?.id==='reading-month-12'&&!h.$('report-product-picker').disabled);
  assert.equal(host.dataset.topic,'monthly');assert.equal(host.dataset.year,'2026');
  assert.equal(host.querySelector('[data-reader-current]').id,selected,'a detailed page stays selected after a clock update');
  assert.equal(h.$('reading-page-select').value,selected);
  assert.equal(doc.activeElement,h.$('reading-page-select'),'the live replacement keeps keyboard focus');
  assert.equal(h.$('detailed-reading').dataset.readingSize,'large');
  assert.equal(h.$('other-reading-options').open,true);
  assert.equal(doc.querySelector('input[name="report-topic"]:checked').value,'annual');
  assert.equal(h.$('fortune-year').value,'2027');
  assert.equal(h.$('reading-annual'),null,'a merely selected unpaid product is not generated or displayed');
  assert.equal(h.state.starts.length,1);assert.deepEqual(h.state.chargedAmounts,[10]);
  assert.equal(JSON.stringify([...h.state.receipts.values()]),receipt);assert.equal(h.$('current-reading-note').textContent,note);
  const unchanged=host.firstElementChild,checks=h.state.statusCalls.length;
  h.window.dispatchEvent(new h.window.Event('focus'));
  await waitFor(()=>h.state.statusCalls.length>checks&&!h.$('report-product-picker').disabled);
  assert.equal(host.firstElementChild,unchanged,'an unchanged time period does not replace the reader');
});

test('a resumed decade boundary keeps the same detailed topic and assumed-time notice without buying again',async t=>{
  const {calculateSaju}=await import('../games/starlit-saju/engine.mjs');
  const {analyzeDaeun}=await import('../games/starlit-saju/daeun.mjs');
  const chart=calculateSaju({year:1990,month:5,day:17,hour:null},{now:new Date(fixedNow)});
  const periods=analyzeDaeun(chart,{gender:'female',now:new Date(fixedNow)}).periods;
  const ending=periods.find(period=>Date.parse(period.endsAt)>Date.parse(fixedNow));
  const boundary=Date.parse(ending.endsAt);
  const h=await harness();t.after(h.close);
  h.advance(boundary-30000-Date.parse(fixedNow));
  h.fill({gender:'female',hour:null});h.submit();await h.ready();
  const host=h.$('report-content');
  const oldCurrent=host.querySelector('.daeun-period.is-current');
  assert.equal(oldCurrent.dataset.daeunPeriod,'reading-daeun-period-'+ending.index);
  h.$('reading-page-select').value='reading-daeun';h.change(h.$('reading-page-select'));
  host.querySelector(`.daeun-nav a[href="#${oldCurrent.dataset.daeunPeriod}-title"]`).click();
  oldCurrent.querySelector('.reading-page-section-link').click();
  const selected=host.querySelector('[data-reader-current]').dataset.daeunTopic;
  const receipt=JSON.stringify([...h.state.receipts.values()]);
  h.advance(60000,{runTimers:false,focus:true});
  await waitFor(()=>host.querySelector('.daeun-period.is-current')?.dataset.daeunPeriod==='reading-daeun-period-'+(ending.index+1)&&!h.$('report-product-picker').disabled);
  assert.equal(host.querySelector('[data-reader-current]').dataset.daeunTopic,selected,'reordering the current decade does not change the chosen topic');
  assert.equal(host.querySelector('.daeun-time-notice').closest('[hidden]'),null);
  assert.match(host.querySelector('.daeun-time-notice').textContent,/오전 6시 00분을 기준/);
  assert.equal(h.state.starts.length,1);assert.deepEqual(h.state.chargedAmounts,[10]);
  assert.equal(JSON.stringify([...h.state.receipts.values()]),receipt);
  h.$('copy-reading').click();await pause();
  assert.ok(h.state.copies[0].includes(periods[ending.index].startLabel+'부터'),'copy uses the newly current period');
  assert.match(h.state.copies[0],/태어난 시간을 몰라 대운은 오전 6시 00분을 기준으로 계산했어요/);
});

test('a failed clock refresh keeps the paid reading and an explicit retry never charges again',async t=>{
  const h=await harness();t.after(h.close);
  h.advance(Date.parse('2026-12-07T11:52:02+09:00')-Date.parse(fixedNow));
  h.fill({topic:'monthly'});h.submit();await h.ready('monthly',2026);
  const host=h.$('report-content'),original=host.firstElementChild;
  h.state.failStatus=1;h.advance(60000);
  await waitFor(()=>!h.$('report-error').hidden&&!h.$('retry-report').disabled);
  assert.equal(host.firstElementChild,original);assert.equal(h.state.starts.length,1);
  h.$('retry-report').click();
  await waitFor(()=>host.querySelector('.month-reading.is-current')?.id==='reading-month-12'&&!h.$('report-product-picker').disabled);
  assert.equal(h.$('report-error').hidden,true);assert.equal(h.state.starts.length,1);
  assert.deepEqual(h.state.chargedAmounts,[10]);
});

test('New Year updates the birth-year limit on resume, input and submit while future dates still fail before payment',async t=>{
  const h=await harness();t.after(h.close);
  assert.equal(h.$('birth-year').max,'2026');
  h.advance(Date.parse('2027-01-01T01:00:00+09:00')-Date.parse(fixedNow),{runTimers:false,focus:true});
  assert.equal(h.$('birth-year').max,'2027');
  h.$('birth-year').max='2026';
  h.fill({year:2027,month:1,day:1,fortuneYear:2027,hour:null});
  assert.equal(h.$('birth-year').max,'2027','input updates max before native form validation can block submit');
  assert.equal(h.$('birth-year').validity.rangeOverflow,false);assert.equal(h.$('birth-form').checkValidity(),true);
  h.$('birth-year').max='2026';h.submit();await h.ready();
  assert.equal(h.$('birth-year').max,'2027');assert.equal(h.state.starts.length,1);
  h.$('edit-birth').click();h.fill({year:2027,month:1,day:2,fortuneYear:2027,hour:null});h.submit();
  await waitFor(()=>!h.$('form-error').hidden);
  assert.match(h.$('form-error').textContent,/미래의 날짜와 시간/);
  assert.equal(h.state.starts.length,1);assert.deepEqual(h.state.chargedAmounts,[10]);
});

test('today with unknown birth time opens before the assumed 06:00 and resuming after it never buys again',async t=>{
  const h=await harness();t.after(h.close);
  h.advance(Date.parse('2026-11-14T05:59:00+09:00')-Date.parse(fixedNow));
  h.fill({year:2026,month:11,day:14,hour:null,gender:'female'});h.submit();await h.ready();
  const host=h.$('report-content'),notice='태어난 시간을 몰라 대운은 오전 6시 00분을 기준으로 계산했어요.';
  assert.equal(h.$('reading-daeun').querySelectorAll('.daeun-period[data-daeun-period]').length,9);
  assert.equal(host.querySelector('.daeun-time-notice').textContent,notice);
  assert.equal(h.$('form-error').hidden,true);
  const chart=h.state.starts[0].chart;
  assert.equal(chart.timeKnown,false);assert.equal(chart.input.hour,null);
  assert.equal(chart.pillars.find(pillar=>pillar.key==='hour').hanja,null);
  const receipts=JSON.stringify([...h.state.receipts.values()]),checks=h.state.statusCalls.length;
  h.advance(60000,{focus:true});
  await waitFor(()=>h.state.statusCalls.length>checks&&!h.$('report-product-picker').disabled);
  assert.equal(h.$('result').hidden,false);assert.equal(host.dataset.topic,'lifelong');
  assert.equal(h.$('reading-daeun').querySelectorAll('.daeun-period[data-daeun-period]').length,9);
  assert.equal(host.querySelector('.daeun-time-notice').textContent,notice);
  assert.equal(h.state.starts.length,1);assert.deepEqual(h.state.chargedAmounts,[10]);
  assert.equal(JSON.stringify([...h.state.receipts.values()]),receipts,'the original 24-hour deadline stays unchanged');
});
