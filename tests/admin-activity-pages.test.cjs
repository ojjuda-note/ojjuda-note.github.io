const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const script = fs.readFileSync(path.resolve(__dirname, '../admin/activity.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

async function history(t) {
  const dom = new JSDOM('<main></main>', { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const { document } = dom.window;
  const container = document.querySelector('main');
  const records = Array.from({ length: 65 }, (_, i) => ({ id: String(65 - i), action: 'edit' }));
  const offsets = [];
  const client = { async rpc(name, { p_offset, p_limit, p_action }) {
    assert.equal(name, 'admin_activity_list');
    offsets.push(p_offset);
    const matching = records.filter(row => !p_action || row.action === p_action);
    return { data: {
      items: matching.slice(p_offset, p_offset + p_limit), total_count: matching.length,
      actions: [{ action: 'edit', count: records.length }]
    } };
  } };
  dom.window.eval(script);
  const controller = dom.window.OjjudaAdminActivity.mount({ container, client, getAdminId: () => 'test-admin' });
  async function click(label) {
    const button = [...container.querySelectorAll('button')].find(node => node.textContent === label);
    assert.ok(button && !button.disabled, label);
    button.click();
    await settle();
  }
  await settle();
  return { container, controller, records, offsets, click };
}

test('refresh keeps the current page and the same open record after rows shift', async t => {
  const { container, controller, records, offsets, click } = await history(t);
  await click('다음');
  const detail = container.querySelector('details');
  detail.open = true;
  const id = detail.querySelector('dd').textContent;
  records.unshift({ id: '66', action: 'edit' });
  await click('새로고침');
  assert.equal(offsets.at(-1), 30);
  assert.notEqual(container.querySelector('details dd').textContent, id);
  assert.equal(container.querySelector('details[open] dd')?.textContent, id);
  await controller.refresh();
  assert.equal(offsets.at(-1), 30);
  assert.equal(container.querySelector('details[open] dd')?.textContent, id);
  const select = container.querySelector('[aria-label="작업 분류"]');
  select.value = 'edit';
  select.dispatchEvent(new select.ownerDocument.defaultView.Event('change'));
  await settle();
  assert.equal(offsets.at(-1), 0);
  assert.equal(container.querySelector('details[open]'), null);
});

test('refresh returns to the last available page when records disappear', async t => {
  const { container, controller, records, offsets, click } = await history(t);
  await click('다음');
  await click('다음');
  records.length = 33;
  await controller.refresh();
  assert.deepEqual(offsets.slice(-2), [60, 30]);
  assert.match(container.querySelector('[role="status"]').textContent, /2 \/ 2페이지/);
  assert.equal(container.querySelectorAll('article').length, 3);
  records.length = 0;
  const before = offsets.length;
  await controller.refresh();
  assert.deepEqual(offsets.slice(before), [30]);
  assert.equal(controller.getState().offset, 0);
  assert.equal(container.querySelectorAll('article').length, 0);
  assert.match(container.querySelector('[role="status"]').textContent, /기록이 없어요/);
});

test('common history names Pajang moderation actions and preserves the card/reply source', async t => {
  const dom = new JSDOM('<main></main>', { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const { document } = dom.window;
  const container = document.querySelector('main'), calls = [];
  const names = [
    ['pajang_answer_hide', '파장 답변 숨김'], ['pajang_answer_restore', '파장 답변 복구'],
    ['pajang_message_hide', '파장 채팅 숨김'], ['pajang_message_restore', '파장 채팅 복구']
  ];
  const records = names.map(([action], index) => ({
    id: String(index + 1), action, admin_nick: '운영자', created_at: '2026-11-19T00:00:00Z',
    reason: '<img src=x onerror=alert(1)> 검토 사유', target: `pajang:${index}`,
    detail: { service: 'pajang', kind: action.includes('_answer_') ? 'answer' : 'message', hidden: action.endsWith('_hide') }
  }));
  const client = { async rpc(name, params) {
    assert.equal(name, 'admin_activity_list'); calls.push(params);
    const source = params.p_source === 'park' ? [{ id: 'park-1', action: 'archive_card' }] : records;
    const matching = source.filter(row => !params.p_action || row.action === params.p_action);
    return { data: { items: matching, total_count: matching.length,
      actions: source.map(row => ({ action: row.action, count: 1 })) } };
  } };
  dom.window.eval(script);
  const controller = dom.window.OjjudaAdminActivity.mount({ container, client, getAdminId: () => 'test-admin' });
  await settle();
  const sources = container.querySelector('[aria-label="기록 종류"]');
  assert.deepEqual([...sources.options].map(option => [option.value, option.textContent]),
    [['world', '공통 운영·파장'], ['park', '카드·답글']]);
  assert.equal(calls[0].p_source, 'world');
  assert.deepEqual([...container.querySelectorAll('.aa-card-head strong')].map(node => node.textContent), names.map(([, label]) => label));
  const actions = container.querySelector('[aria-label="작업 분류"]');
  assert.deepEqual([...actions.options].slice(1).map(option => [option.value, option.textContent]),
    names.map(([code, label]) => [code, `${label} (1)`]));
  assert.equal(container.querySelector('img'), null, 'reasons are rendered as text');
  assert.ok(container.querySelector('.aa-reason').textContent.includes('<img src=x'));
  actions.value = 'pajang_message_restore';
  actions.dispatchEvent(new dom.window.Event('change')); await settle();
  assert.equal(calls.at(-1).p_action, 'pajang_message_restore');
  assert.deepEqual([...container.querySelectorAll('.aa-card-head strong')].map(node => node.textContent), ['파장 채팅 복구']);
  sources.value = 'park'; sources.dispatchEvent(new dom.window.Event('change')); await settle();
  assert.equal(calls.at(-1).p_source, 'park'); assert.equal(calls.at(-1).p_action, null);
  assert.equal(container.querySelector('.aa-card-head strong').textContent, '카드 보관');
  assert.equal(controller.getState().source, 'park');
});
