import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('./tasks.js', import.meta.url), 'utf8');
const MESSAGE_ID = '08ef9d48-ef85-49f0-94e8-860460923302';
const FEEDBACK_ID = '87940136-a373-4e88-b15b-36d5c7974701';
const USER_ID = '660cd689-368f-4576-8ccc-f4c61439842b';
const message = {
  id: MESSAGE_ID, created_by: USER_ID, room: 'hq', sender_kind: 'human',
  sender_role: 'representative', content: '로그인 버튼이 응답하지 않는 오류를 고쳐 주세요.', target_role: 'quality'
};
const task = {
  message_id: MESSAGE_ID, feedback_id: FEEDBACK_ID, requested_by: USER_ID,
  content: message.content, kind: 'bug', status: 'queued', dispatch_status: 'pending',
  created_at: '2026-11-12T00:00:00Z'
};

function node(tag = '') {
  return {
    tag, children: [], listeners: {}, attributes: {}, textContent: '', disabled: false,
    value: '', className: '', href: '',
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    addEventListener(event, callback) { this.listeners[event] = callback; },
    setAttribute(key, value) { this.attributes[key] = value; }
  };
}

function flatten(item) { return [item, ...(item?.children || []).flatMap(flatten)]; }
function text(item) { return flatten(item).map(x => x?.textContent || '').join(' '); }
function actionParts(action) {
  return { button: action?.children.find(x => x.tag === 'button'), select: action?.children.find(x => x.tag === 'select') };
}

function harness(respond = async () => ({ data: [] })) {
  const window = {};
  vm.runInNewContext(code, { window, document: { createElement: node }, URL, Date, Map, Object, JSON });
  const elements = { list: node('ol'), updated: node('span'), feedback: node('p'), refreshButton: node('button') };
  const calls = [];
  let user = { id: USER_ID }, changes = 0, lost = 0;
  const controller = window.OjjudaMeetingTasks.create({
    client: { rpc: async (name, args) => { calls.push({ name, args }); return respond(name, args); } },
    getUser: () => user, elements, formatTime: value => new Date(value).toISOString(),
    onChange: () => { changes += 1; },
    onAuthLost: () => { lost += 1; user = null; controller.stop(); }
  });
  return { api: window.OjjudaMeetingTasks, controller, elements, calls, get changes() { return changes; },
    get lost() { return lost; }, signOut() { user = null; controller.stop(); } };
}

test('only an own saved human request can expose a work action', () => {
  const h = harness();
  assert.ok(actionParts(h.controller.renderAction(message)).button);
  for (const changed of [
    { created_by: 'another-admin' }, { sender_kind: 'ai' }, { sender_role: 'director' },
    { room: 'other' }, { id: 'not-a-saved-uuid' }, { content: '' },
    { content: '첨부파일을 공유했어요.', file_path: 'private/file.pdf' }
  ]) assert.equal(h.controller.renderAction({ ...message, ...changed }), null);
  const tooLong = h.controller.renderAction({ ...message, content: '가'.repeat(2001) });
  assert.equal(actionParts(tooLong).button, undefined);
  assert.match(text(tooLong), /2,000자/);
  assert.match(text(h.controller.renderAction({ ...message, file_path: 'private/file.pdf' })), /첨부파일 내용은 전달되지 않습니다/);
});

test('an explicit idea action submits only the saved message ID and chosen kind', async () => {
  const h = harness(async name => ({ data: name === 'admin_ai_meeting_create_task' ? { ...task, kind: 'idea' } : [] }));
  const action = actionParts(h.controller.renderAction(message));
  action.select.value = 'idea';
  await action.button.listeners.click();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].name, 'admin_ai_meeting_create_task');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].args)), { p_message_id: MESSAGE_ID, p_kind: 'idea' });
  assert.match(text(h.elements.list), /접수됨 · 실행 대기/);
  assert.doesNotMatch(text(h.elements.list), /완료/);
  assert.equal(actionParts(h.controller.renderAction(message)).button, undefined);
});

test('a selected task kind survives message rerenders while polling', () => {
  const h = harness();
  const first = actionParts(h.controller.renderAction(message));
  first.select.value = 'idea';
  first.select.listeners.change();
  assert.equal(actionParts(h.controller.renderAction(message)).select.value, 'idea');
});

test('lost responses preserve the message and kind for an idempotent retry', async () => {
  let submits = 0;
  const h = harness(async name => {
    if (name === 'admin_ai_meeting_tasks') return { data: [] };
    submits += 1;
    if (submits === 1) throw new Error('network response lost');
    return { data: task };
  });
  await actionParts(h.controller.renderAction(message)).button.listeners.click();
  const retry = actionParts(h.controller.renderAction(message));
  assert.equal(retry.button.textContent, '같은 작업 다시 확인');
  assert.equal(retry.select.disabled, true);
  retry.select.value = 'idea';
  await retry.button.listeners.click();
  assert.equal(submits, 1, 'a changed kind cannot resubmit an uncertain request');
  retry.select.value = 'bug';
  await retry.button.listeners.click();
  assert.equal(submits, 2);
  const writes = h.calls.filter(x => x.name === 'admin_ai_meeting_create_task');
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0].args)), JSON.parse(JSON.stringify(writes[1].args)));
});

test('an accepted request whose response was lost is recovered from the server list', async () => {
  const h = harness(async name => {
    if (name === 'admin_ai_meeting_create_task') throw new Error('response lost');
    return { data: [task] };
  });
  await actionParts(h.controller.renderAction(message)).button.listeners.click();
  assert.equal(actionParts(h.controller.renderAction(message)).button, undefined);
  assert.match(text(h.elements.list), /접수됨/);
  assert.equal(h.calls.filter(x => x.name === 'admin_ai_meeting_create_task').length, 1);
});

test('a known rejected request explains the reason and allows choosing the existing kind', async () => {
  let submits = 0;
  const h = harness(async name => {
    if (name === 'admin_ai_meeting_tasks') return { data: [] };
    if (++submits === 1) return { error: { message: 'task_kind_conflict', code: '22023' } };
    return { data: { ...task, kind: 'idea' } };
  });
  await actionParts(h.controller.renderAction(message)).button.listeners.click();
  const action = h.controller.renderAction(message);
  const retry = actionParts(action);
  assert.equal(retry.select.disabled, false);
  assert.equal(retry.button.textContent, '실제 작업 실행');
  assert.match(text(action), /이미 다른 종류로 접수/);
  retry.select.value = 'idea';
  await retry.button.listeners.click();
  assert.equal(submits, 2);
});

test('an unavailable executor is not described as an uncertain network response', async () => {
  const h = harness(async name => name === 'admin_ai_meeting_tasks'
    ? { data: [] } : { error: { message: 'executor_unavailable' } });
  await actionParts(h.controller.renderAction(message)).button.listeners.click();
  assert.match(h.elements.feedback.textContent, /실행기 연결이 준비되지 않아 접수하지 못했어요/);
  assert.equal(actionParts(h.controller.renderAction(message)).select.disabled, false);
});

test('duplicate clicks during an in-flight call never start a second mutation', async () => {
  let finish;
  const h = harness(async () => new Promise(resolve => { finish = resolve; }));
  const action = actionParts(h.controller.renderAction(message));
  const first = action.button.listeners.click();
  await action.button.listeners.click();
  assert.equal(h.calls.length, 1);
  assert.equal(actionParts(h.controller.renderAction(message)).button.disabled, true);
  finish({ data: task });
  await first;
});

test('a stale list response cannot erase a newly accepted task', async () => {
  let finishList;
  const h = harness(async name => name === 'admin_ai_meeting_tasks'
    ? new Promise(resolve => { finishList = resolve; }) : { data: task });
  const loading = h.controller.refresh();
  await actionParts(h.controller.renderAction(message)).button.listeners.click();
  finishList({ data: [] });
  await loading;
  assert.match(text(h.elements.list), /접수됨/);
  assert.equal(actionParts(h.controller.renderAction(message)).button, undefined);
});

test('reloading reconstructs server states and only resolved is shown complete', async () => {
  let rows = [{ ...task, status: 'running', dispatch_status: 'dispatched' }];
  const h = harness(async () => ({ data: rows }));
  await h.controller.refresh();
  assert.match(text(h.elements.list), /작업 중/);
  assert.doesNotMatch(text(h.elements.list), /완료/);
  rows = [{ ...task, dispatch_status: 'failed', dispatch_error: '오늘 실행 한도를 초과했습니다.' }];
  await h.controller.refresh();
  assert.match(text(h.elements.list), /실행 전달 실패/);
  assert.match(text(h.elements.list), /오늘 실행 한도를 초과했습니다/);
  assert.equal(actionParts(h.controller.renderAction(message)).button, undefined);
  rows = [{ ...task, status: 'resolved', summary: '검증·배포 확인', evidence_url: 'https://github.com/ojjuda-note/ojjuda-note.github.io/commit/abcdef1234567' }];
  await h.controller.refresh();
  assert.match(text(h.elements.list), /완료/);
  const links = flatten(h.elements.list).filter(x => x.tag === 'a');
  assert.equal(links.length, 1);
  assert.equal(links[0].rel, 'noopener noreferrer');
});

test('server content remains text and only exact GitHub evidence hosts and repositories link', async () => {
  const h = harness(async () => ({ data: [{ ...task, content: '<img src=x onerror=alert(1)>', summary: '<script>alert(1)</script>', evidence_url: 'javascript:alert(1)' }] }));
  await h.controller.refresh();
  assert.match(text(h.elements.list), /<img src=x/);
  assert.equal(flatten(h.elements.list).filter(x => x.tag === 'a' || x.tag === 'img' || x.tag === 'script').length, 0);
  for (const value of [
    'https://github.com.evil.example/ojjuda-note/ojjuda-note.github.io/pull/1',
    'https://github.com@evil.example/ojjuda-note/ojjuda-note.github.io/pull/1',
    'https://github.com/another-owner/project/pull/1',
    'http://github.com/ojjuda-note/ojjuda-note.github.io/pull/1',
    'https://github.com/ojjuda-note/ojjuda-note.github.io/pull/1?redirect=https://evil.example'
  ]) assert.equal(h.api.evidenceUrl(value), null);
  assert.ok(h.api.evidenceUrl('https://github.com/ojjuda-note/ojjuda-codex-worker/actions/runs/123'));
});

test('sign-out stops polling and ignores a pending write response', async () => {
  let finish;
  const h = harness(async () => new Promise(resolve => { finish = resolve; }));
  const request = actionParts(h.controller.renderAction(message)).button.listeners.click();
  h.signOut();
  finish({ data: task });
  await request;
  await h.controller.refresh();
  assert.equal(h.calls.length, 1);
  assert.equal(h.elements.list.children.length, 0);
  assert.equal(h.controller.renderAction(message), null);
});

test('authorization loss from the server closes task access without retrying', async () => {
  const h = harness(async () => ({ error: { message: 'not_admin' } }));
  await h.controller.refresh();
  await h.controller.refresh();
  assert.equal(h.lost, 1);
  assert.equal(h.calls.length, 1);
});
