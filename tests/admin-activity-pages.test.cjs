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
