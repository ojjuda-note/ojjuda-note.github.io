import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const tasksCode = readFileSync(new URL('./tasks.js', import.meta.url), 'utf8');
const HUMAN = '08ef9d48-ef85-49f0-94e8-860460923302';
const NOW = '2026-11-09T12:00:00.000Z';

function fakeNode(id = '') {
  return {
    id, className: '', textContent: '', hidden: false, disabled: false,
    value: '', files: [], children: [], listeners: {},
    scrollHeight: 0, scrollTop: 0, clientHeight: 600,
    addEventListener(event, listener) { this.listeners[event] = listener; },
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
    setAttribute() {}, focus() {}
  };
}

async function tick() { await new Promise(resolve => setImmediate(resolve)); }

async function harness({ initial = [], fail = false } = {}) {
  const nodes = new Map();
  const getNode = id => {
    if (!nodes.has(id)) nodes.set(id, fakeNode(id));
    return nodes.get(id);
  };
  getNode('target').value = 'quality';
  const rows = [...initial];
  let finishInvoke;
  const called = { invoke: 0 };
  const client = {
    rpc: async () => ({ data: [] }),
    auth: {
      getUser: async () => ({ data: { user: { id: 'admin-user' } } }),
      onAuthStateChange() {}
    },
    from(table) {
      if (table === 'app_admins') return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: 'admin-user' } }) }) })
      };
      if (table !== 'ai_meeting_messages') throw Error(`Unknown table ${table}`);
      return {
        select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [...rows].reverse() }) }) }) }),
        insert(record) {
          rows.push({ ...record, id: HUMAN, created_at: NOW });
          return { select: () => ({ single: async () => ({ data: { id: HUMAN } }) }) };
        }
      };
    },
    functions: {
      invoke: () => {
        called.invoke += 1;
        return new Promise(resolve => { finishInvoke = () => {
          if (!fail) rows.push({ id: 'ai-reply', created_at: NOW, sender_kind: 'ai', sender_role: 'quality', content: '검토 결과입니다.', reply_to: HUMAN });
          resolve(fail ? { data: { error: 'ai_upstream_unavailable' } } : { data: { ok: true } });
        }; });
      }
    }
  };
  const document = {
    hidden: false,
    getElementById: getNode,
    createElement: tag => fakeNode(tag),
    addEventListener() {}
  };
  vm.runInNewContext(tasksCode + '\n' + code, {
    document, window: {
      OJJUDA_CONFIG: { supabaseUrl: 'https://demo.supabase.co', supabaseKey: 'publishable' },
      supabase: { createClient: () => client }
    },
    Intl, Date, Math, Set, Map, URL,
    setInterval: () => 1,
    clearInterval: () => {}
  });
  await tick();
  await tick();
  return { nodes, getNode, called, resolve: () => finishInvoke(), rows };
}

test('idle is honestly shown when no request has been sent', async () => {
  const { getNode, called } = await harness();
  assert.equal(getNode('work-state').textContent, '현재 대기');
  assert.match(getNode('work-detail').textContent, /진행 중인 회의 요청이 없습니다/);
  assert.match(getNode('messages').children[0].textContent, /첫 회의를 시작/);
  assert.equal(called.invoke, 0);
});

test('work appears during an actual call and completion follows saved replies', async () => {
  const h = await harness();
  h.getNode('message').value = '오류 확인해 주세요.';
  const sending = h.getNode('send').listeners.click();
  await tick();
  assert.equal(h.called.invoke, 1);
  assert.equal(h.getNode('work-state').textContent, '실제 요청 처리 중');
  assert.ok(h.getNode('work-steps').children.some(item => item.children.some(v => /AI 서버에 응답 요청/.test(v.textContent))));
  h.resolve();
  await sending;
  assert.equal(h.getNode('work-state').textContent, '완료 · 현재 대기');
  assert.match(h.getNode('work-detail').textContent, /저장/);
  assert.ok(h.getNode('work-history').children.some(item => item.children.some(v => /답변 1개 저장/.test(v.textContent))));
});

test('failed AI requests stop displaying as active and provide retry', async () => {
  const h = await harness({ fail: true });
  h.getNode('message').value = '확인해 주세요.';
  const sending = h.getNode('send').listeners.click();
  await tick();
  h.resolve();
  await sending;
  assert.equal(h.getNode('work-state').textContent, '오류 · 현재 대기');
  assert.equal(h.getNode('retry-box').hidden, false);
});

test('old unanswered messages are not mistaken for work in progress', async () => {
  const h = await harness({ initial: [{ id: HUMAN, sender_kind: 'human', sender_role: 'representative', content: '과거 요청', created_at: NOW }] });
  assert.equal(h.getNode('work-state').textContent, '현재 대기');
  assert.ok(h.getNode('work-history').children[0].children.some(v => /답변 기록 없음/.test(v.textContent)));
});
