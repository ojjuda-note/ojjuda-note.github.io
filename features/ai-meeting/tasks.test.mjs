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
    get lost() { return lost; }, signOut() { user = null; controller.stop(); }, switchUser() { user = { id: 'another-admin' }; } };
}

test('the board only reads server tasks and never renders execution controls', async () => {
  const h = harness(async () => ({ data: [task] }));
  assert.equal(h.controller.renderBadge(message), null);
  await h.controller.refresh();
  const badge = h.controller.renderBadge(message);
  assert.match(text(badge), /실제 작업 · 접수됨/);
  assert.equal(flatten(badge).filter(x => x.tag === 'button' || x.tag === 'select').length, 0);
  assert.deepEqual(Object.keys(h.controller).sort(), ['refresh', 'renderBadge', 'revision', 'stop']);
  assert.deepEqual(h.calls.map(x => x.name), ['admin_ai_meeting_tasks']);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].args)), { p_limit: 30 });
});

test('messages without a server task are never presented as executing work', async () => {
  const h = harness();
  await h.controller.refresh();
  assert.equal(h.controller.renderBadge(message), null);
  assert.match(text(h.elements.list), /수정·개선 지시를 보내면 자동으로 접수/);
  assert.doesNotMatch(text(h.elements.list), /실제 작업 실행/);
});

test('a refresh requested while polling waits for a newer snapshot after the reply', async () => {
  let finishFirst;
  let reads = 0;
  const h = harness(async () => ++reads === 1 ? new Promise(resolve => { finishFirst = resolve; }) : { data: [task] });
  const polling = h.controller.refresh();
  const afterReply = h.controller.refresh({ fresh: true });
  assert.equal(reads, 1);
  finishFirst({ data: [] });
  await Promise.all([polling, afterReply]);
  assert.equal(reads, 2);
  assert.match(text(h.elements.list), /접수됨/);
  assert.match(text(h.controller.renderBadge(message)), /접수됨/);
});

test('ordinary polling shares an in-flight read without an endless refresh chain', async () => {
  let finish;
  const h = harness(async () => new Promise(resolve => { finish = resolve; }));
  const first = h.controller.refresh();
  const poll = h.controller.refresh();
  finish({ data: [task] });
  await Promise.all([first, poll]);
  assert.equal(h.calls.length, 1);
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
  rows = [{ ...task, status: 'resolved', summary: '검증·배포 확인', evidence_url: 'https://github.com/ojjuda-note/ojjuda-note.github.io/commit/abcdef1234567' }];
  await h.controller.refresh();
  assert.match(text(h.elements.list), /완료/);
  const links = flatten(h.elements.list).filter(x => x.tag === 'a');
  assert.equal(links.length, 1);
  assert.equal(links[0].rel, 'noopener noreferrer');
});

test('unknown states and missing task identifiers never imply completion', async () => {
  const h = harness(async () => ({ data: [{ ...task, status: 'unexpected' }, { ...task, message_id: 'invalid', status: 'resolved' }] }));
  await h.controller.refresh();
  assert.match(text(h.elements.list), /상태 확인 필요/);
  assert.doesNotMatch(text(h.elements.list), /완료/);
  assert.equal(h.controller.renderBadge({ ...message, sender_kind: 'ai' }), null);
  assert.equal(h.controller.renderBadge({ ...message, room: 'another-room' }), null);
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

test('a failed refresh keeps the last known state and says that it is stale', async () => {
  let failed = false;
  const h = harness(async () => failed ? { error: { message: 'network unavailable' } } : { data: [task] });
  await h.controller.refresh();
  failed = true;
  await h.controller.refresh();
  assert.match(text(h.elements.list), /접수됨/);
  assert.match(h.elements.feedback.textContent, /마지막으로 확인한 기록/);
  assert.equal(h.elements.updated.textContent, '갱신 실패');
});

test('sign-out stops polling and ignores pending read results', async () => {
  let finish;
  const h = harness(async () => new Promise(resolve => { finish = resolve; }));
  const request = h.controller.refresh();
  h.signOut();
  finish({ data: [task] });
  await request;
  await h.controller.refresh();
  assert.equal(h.calls.length, 1);
  assert.equal(h.elements.list.children.length, 0);
  assert.equal(h.controller.renderBadge(message), null);
});

test('a different session cannot display the previous user pending read', async () => {
  let finish;
  const h = harness(async () => new Promise(resolve => { finish = resolve; }));
  const request = h.controller.refresh();
  h.switchUser();
  finish({ data: [task] });
  await request;
  assert.equal(h.elements.list.children.length, 0);
  assert.equal(h.controller.renderBadge(message), null);
});

test('authorization loss from the server closes task access without retrying', async () => {
  const h = harness(async () => ({ error: { message: 'not_admin' } }));
  await h.controller.refresh();
  await h.controller.refresh();
  assert.equal(h.lost, 1);
  assert.equal(h.calls.length, 1);
});
