const test = require('node:test');
const assert = require('node:assert/strict');
const {harness, waitFor} = require('./helpers/saju-ui-harness.cjs');

test('the catalog opens real products before collecting a birthday',async t=>{
  const h=await harness({entrySearch:''});t.after(h.close);
  assert.equal(h.$('saju-catalog').hidden,false);
  assert.equal(h.$('intro').hidden,true);
  assert.deepEqual([...h.$('saju-catalog').querySelectorAll('a')].map(a=>a.getAttribute('href')),
    ['?reading=lifelong','?reading=annual','?reading=monthly','?reading=all','./compatibility.html','?reading=saved']);
  h.changeAccount('20000000-0000-4000-8000-000000000002');
  assert.equal(h.$('intro').hidden,true);
  assert.equal(h.state.starts.length,0);
});
test('the free return path only opens an active ticket and cannot charge after expiry',async t=>{
  const h=await harness({entrySearch:'?reading=saved'});t.after(h.close);
  assert.equal(h.$('birth-form').querySelector('.saved-people-disclosure').open,true);
  const pairLink=h.window.document.querySelector('.saved-reading-nav a[href*=compatibility]');
  assert.equal(pairLink.closest('[hidden]'),null);
  assert.equal(pairLink.search,'?reading=saved');
  h.fill();await h.flow.next();
  await waitFor(()=>h.$('ticket-list').textContent.includes('없어요'));
  assert.equal(h.$('open-story').disabled,true);
  h.$('birth-form').dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(h.state.starts.length,0);
  const purchased=await harness();t.after(purchased.close);
  purchased.fill({topic:'annual'});await purchased.submit();await purchased.ready('annual',2026);
  for(const [key,receipt] of purchased.state.receipts)h.state.receipts.set(key,receipt);
  h.window.dispatchEvent(new h.window.Event('focus'));
  await waitFor(()=>h.$('ticket-list').querySelector('button'));
  assert.equal(h.$('ticket-list').querySelectorAll('button').length,1);
  assert.equal(h.$('open-story').dataset.expectedCharge,'0');
  await h.submit();await h.ready('annual',2026);
  assert.equal(h.state.charges,0);
  h.$('edit-birth').click();h.advance(86400001,{focus:true});await h.flow.next();
  await waitFor(()=>!h.$('ticket-list').querySelector('button'));
  await h.submit();
  assert.equal(h.state.starts.length,1);
  assert.equal(h.state.charges,0);
});
