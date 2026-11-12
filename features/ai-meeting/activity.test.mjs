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
function allNodes(node) { return [node, ...(node?.children || []).flatMap(allNodes)]; }
function nodeText(node) { return allNodes(node).map(item => item?.textContent || '').join(' '); }

async function harness({ initial = [], fail = false, autoTask = false, outcomes = [] } = {}) {
  const nodes = new Map();
  const getNode = id => {
    if (!nodes.has(id)) nodes.set(id, fakeNode(id));
    return nodes.get(id);
  };
  getNode('target').value = 'quality';
  const rows = [...initial];
  const tasks = [];
  let finishInvoke;
  let authChanged;
  const called = { invoke: 0, invocations: [], rpc: [], inserted: 0 };
  const client = {
    rpc: async (name, args) => {
      called.rpc.push({ name, args });
      if (name !== 'admin_ai_meeting_tasks') throw new Error('browser must not create tasks');
      return { data: [...tasks] };
    },
    auth: {
      getUser: async () => ({ data: { user: { id: 'admin-user' } } }),
      onAuthStateChange(callback) { authChanged = callback; }
    },
    from(table) {
      if (table === 'app_admins') return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: 'admin-user' } }) }) })
      };
      if (table !== 'ai_meeting_messages') throw Error(`Unknown table ${table}`);
      return {
        select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [...rows].reverse() }) }) }) }),
        insert(record) {
          called.inserted += 1;
          rows.push({ ...record, id: HUMAN, created_at: NOW });
          return { select: () => ({ single: async () => ({ data: { id: HUMAN } }) }) };
        }
      };
    },
    functions: {
      invoke: (name, args) => {
        called.invoke += 1;
        called.invocations.push({ name, args });
        const outcome = outcomes[called.invoke - 1] ?? (fail ? 'ai_upstream_unavailable' : 'ok');
        return new Promise(resolve => { finishInvoke = () => {
          if (autoTask && !tasks.length) tasks.push({
            message_id: HUMAN, feedback_id: '87940136-a373-4e88-b15b-36d5c7974701',
            content: rows.find(row => row.id === HUMAN)?.content, kind: 'bug', status: 'queued',
            dispatch_status: 'pending', created_at: NOW
          });
          if (outcome === 'ok') rows.push({ id: 'ai-reply', created_at: NOW, sender_kind: 'ai', sender_role: 'quality', content: '검토 결과입니다.', reply_to: HUMAN });
          resolve(outcome === 'ok' ? { data: { ok: true } } : { data: { error: outcome } });
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
  return { nodes, getNode, called, resolve: () => finishInvoke(), rows, tasks, signOut: () => authChanged('SIGNED_OUT', null) };
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

test('sending a work instruction refreshes its server task without a second action', async () => {
  const h = await harness({ autoTask: true });
  h.getNode('message').value = '로그인 오류를 고쳐 주세요.';
  const sending = h.getNode('send').listeners.click();
  await tick();
  assert.equal(h.called.invoke, 1);
  assert.equal(h.called.inserted, 1);
  assert.doesNotMatch(nodeText(h.getNode('messages')), /실제 작업 실행/);
  h.resolve();
  await sending;
  assert.match(nodeText(h.getNode('task-list')), /접수됨 · 실행 대기/);
  assert.match(nodeText(h.getNode('messages')), /실제 작업 · 접수됨/);
  assert.ok(h.called.rpc.length >= 2);
  assert.ok(h.called.rpc.every(call => call.name === 'admin_ai_meeting_tasks'));
  assert.equal(allNodes(h.getNode('messages')).filter(node => node.id === 'button' || node.id === 'select').length, 0);
});

test('an unconfirmed submission retries the same saved message once automatically', async () => {
  const h = await harness({ autoTask: true, outcomes: ['task_submission_unconfirmed', 'ok'] });
  h.getNode('message').value = '메뉴 오류를 수정해 주세요.';
  const sending = h.getNode('send').listeners.click();
  await tick();
  h.resolve();
  await tick();
  assert.equal(h.called.invoke, 2);
  assert.equal(h.called.inserted, 1);
  h.resolve();
  await sending;
  assert.equal(h.called.invoke, 2);
  assert.deepEqual(h.called.invocations.map(call => call.args.body.message_id), [HUMAN, HUMAN]);
  assert.match(nodeText(h.getNode('task-list')), /접수됨/);
  assert.equal(h.getNode('retry-box').hidden, true);
});

test('repeated unconfirmed responses stop after one automatic retry and retain the request', async () => {
  const h = await harness({ autoTask: true, outcomes: ['task_submission_unconfirmed', 'task_submission_unconfirmed'] });
  h.getNode('message').value = '가입 화면을 개선해 주세요.';
  const sending = h.getNode('send').listeners.click();
  await tick();
  h.resolve();
  await tick();
  h.resolve();
  await sending;
  assert.equal(h.called.invoke, 2);
  assert.equal(h.called.inserted, 1);
  assert.equal(h.getNode('retry-box').hidden, false);
  assert.match(h.getNode('feedback').textContent, /같은 요청 다시 확인/);
  assert.match(nodeText(h.getNode('task-list')), /접수됨/);
});

test('ordinary model failures are not automatically retried', async () => {
  const h = await harness({ fail: true });
  h.getNode('message').value = '의견을 들려줘.';
  const sending = h.getNode('send').listeners.click();
  await tick();
  h.resolve();
  await sending;
  assert.equal(h.called.invoke, 1);
  assert.equal(h.called.inserted, 1);
  assert.equal(h.getNode('retry-box').hidden, false);
});

test('known submission errors explain the next step without automatic retry', async () => {
  for (const [error, expected] of [
    ['task_request_too_long', /2,000자 이내/],
    ['task_request_needs_details', /메시지에 직접/],
    ['executor_unavailable', /실행기 연결이 준비되지 않아/]
  ]) {
    const h = await harness({ outcomes: [error] });
    h.getNode('message').value = '수정해 주세요.';
    const sending = h.getNode('send').listeners.click();
    await tick();
    h.resolve();
    await sending;
    assert.equal(h.called.invoke, 1);
    assert.equal(h.called.inserted, 1);
    assert.match(h.getNode('feedback').textContent, expected);
    assert.equal(h.getNode('retry-box').hidden, false);
  }
});

test('a completed request after sign-out cannot refresh tasks or retry submission', async () => {
  const h = await harness({ autoTask: true, outcomes: ['task_submission_unconfirmed'] });
  h.getNode('message').value = '오류를 수정해 주세요.';
  const sending = h.getNode('send').listeners.click();
  await tick();
  const readsBeforeLogout = h.called.rpc.length;
  h.signOut();
  h.resolve();
  await sending;
  assert.equal(h.called.invoke, 1);
  assert.equal(h.called.rpc.length, readsBeforeLogout);
  assert.equal(h.getNode('task-list').children.length, 0);
  assert.equal(h.getNode('room').hidden, true);
});
