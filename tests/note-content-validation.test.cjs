const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const preview = read('note/preview.js');
const bootAt = preview.lastIndexOf('\nif (client) {\n  client.auth.onAuthStateChange');
assert.ok(bootAt > 0);
const html = read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<link\b[^>]*>/gi, '');
const USER = '00000000-0000-4000-8000-000000000001';
const CARD = '00000000-0000-4000-8000-000000000002';
const PARENT = '00000000-0000-4000-8000-000000000003';
const NETWORK = { code: '503', message: 'Service temporarily unavailable' };
const ORIGINAL = '앞말 검사표현 뒷말';
const CANONICAL = '앞말 ❤️❤️ 뒷말';
// Only the mocked server transforms text; the actual client must trust the next read.
// Dictionary normalization and matching are covered by the database test.
const serverText = value => value.replaceAll('검사표현', '❤️❤️').replaceAll('검사태그', '❤️❤️');
const settle = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));

function domFor(t, markup = '<main id="app"></main>') {
  const dom = new JSDOM(markup, { url: 'https://fixture.invalid/park/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.confirm = () => true;
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollTo = () => {};
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  t.after(() => window.close());
  return { window, document: window.document, run: code => new vm.Script(code).runInContext(dom.getInternalVMContext()) };
}

function composer(t, { kind = 'memo', edit = false, guest = false, suggest = () => [] } = {}) {
  const fixture = domFor(t, html), { window, document, run } = fixture;
  const writes = [], effects = [], drafts = { cancelled: 0, cleared: 0 };
  let error = null, stored;
  const write = (name, args) => {
    writes.push({ name, args: plain(args) });
    if (error) return { error };
    stored = { body: serverText(args.p_body ?? args.body), tags: (args.p_tags ?? args.tags ?? []).map(serverText) };
    return { data: { id: CARD, card_id: CARD, tags: stored.tags }, error: null };
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    schema() { return {
      async rpc(name, args) {
        if (name === 'suggest_card_tags') return { data: await suggest(args.p_body) };
        if (name.startsWith('publish_') || name === 'update_my_event') return write(name, args);
        assert.ok(['set_my_gender', 'set_card_style'].includes(name), `unexpected RPC: ${name}`);
        return { data: {} };
      },
      from(table) {
        assert.equal(table, 'cards');
        let value;
        const query = {
          update(args) { value = args; return query; },
          eq(column, id) { assert.equal(column, 'id'); assert.equal(id, CARD); return query; },
          select() { return query; },
          async maybeSingle() { return write('update_card', value); }
        };
        return query;
      }
    }; }
  };
  window.OJJUDA_CONFIG = { supabaseUrl: 'https://fixture.invalid', supabaseKey: 'fixture' };
  window.supabase = { createClient: () => client };
  window.console.warn = () => {};
  run(preview.slice(0, bootAt));
  window.__readFeed = value => {
    effects.push(value);
    document.getElementById('feed-list').textContent = [stored.body, ...stored.tags].join(' ');
  };
  document.addEventListener('ojjuda:card-published', () => effects.push('published'));
  // Keep the actual publisher, input controls, validation, error display and close logic.
  // Layout measurement and successful feed loads do not participate in content validation.
  run(`composerPhotoOverflows = () => false; cardPhotoOverflows = () => false;
    resizeComposerText = () => {}; syncComposeInk = () => {};
    showPublishedFeed = async () => window.__readFeed('feed');
    refreshCards = async () => window.__readFeed('refresh');
    loadWorldBalance = async () => {};
    session = ${guest ? 'null' : JSON.stringify({ user: { id: USER } })};
    composerUserId = ${guest ? 'null' : JSON.stringify(USER)};
    kind = ${JSON.stringify(kind)}; editingId = ${edit ? JSON.stringify(CARD) : 'null'};
    parentId = ${kind === 'comment' ? JSON.stringify(PARENT) : 'null'};
    authKnown = true; ready = true; noteState = { is_restricted: false };
    myIdentity = { gender: 'private' }; myIdentityReady = true; myGender = 'private';
    backgroundKey = '42'; publishRequestId = '00000000-0000-4000-8000-000000000004';
    writingPosition = eventPosition = { latitude: 37, longitude: 127 };
    backdrop.hidden = false;
    text.value = ${JSON.stringify(ORIGINAL)}; tags.value = ${guest ? "''" : "'검사태그'"};
    document.querySelector('input[name="gender"][value="private"]').checked = true;
    setComposerInputs(); updateComposer();`);
  if (!guest && !edit && kind !== 'event') {
    window.__draft = {
      async preparePublish() {
        return { content: { body: document.getElementById('compose-text').value,
          tags: document.getElementById('compose-tags').value, kind,
          parent_id: kind === 'comment' ? PARENT : null, background_key: '42' } };
      },
      cancelPublish() { drafts.cancelled++; },
      async published() { drafts.cleared++; return { cleared: true }; }
    };
    run('draftController = window.__draft');
  }
  return { ...fixture, writes, effects, drafts, setError: value => { error = value; },
    send: () => run('publishCard()'),
    message: () => document.getElementById('compose-message').textContent };
}

for (const options of [
  { kind: 'memo' }, { kind: 'memo', edit: true },
  { kind: 'comment' }, { kind: 'comment', edit: true },
  { kind: 'event' }, { kind: 'event', edit: true },
  { kind: 'memo', guest: true }, { kind: 'comment', guest: true }
]) {
  test(`Park ${options.guest ? 'guest' : 'member'} ${options.kind} ${options.edit ? 'edit' : 'create'} preserves network failures and accepts server-masked content`, async t => {
    const f = composer(t, options), text = f.document.getElementById('compose-text');
    const tags = f.document.getElementById('compose-tags'), initialTags = tags.value;
    f.setError(NETWORK);
    await f.send();
    assert.match(f.message(), /못했어요/);
    assert.equal(text.value, ORIGINAL);
    assert.equal(tags.value, initialTags);
    assert.equal(text.disabled, false);
    assert.equal(f.document.getElementById('publish-card').disabled, false);
    assert.equal(f.document.getElementById('composer-backdrop').hidden, false);
    assert.deepEqual(f.effects, [], 'a failed save cannot close, refresh or announce publication');
    assert.equal(f.drafts.cleared, 0, 'failed publication cannot clear a prepared draft');
    if (!options.guest && !options.edit && options.kind !== 'event') assert.equal(f.drafts.cancelled, 1);
    f.setError(null);
    await f.send();
    assert.equal(f.writes.length, 2);
    assert.equal(f.writes.at(-1).args.p_body ?? f.writes.at(-1).args.body, ORIGINAL);
    if (!options.guest) assert.deepEqual(f.writes.at(-1).args.p_tags ?? f.writes.at(-1).args.tags, ['검사태그']);
    assert.equal(text.value, '');
    assert.equal(f.document.getElementById('composer-backdrop').hidden, true);
    assert.ok(f.effects.length > 0, 'only a confirmed save leaves the editor and refreshes content');
    assert.ok(f.document.getElementById('feed-list').textContent.startsWith(CANONICAL));
    assert.doesNotMatch(f.document.getElementById('feed-list').textContent, /검사표현|검사태그/);
    if (!options.guest && !options.edit && options.kind !== 'event') assert.equal(f.drafts.cleared, 1);
  });
}

test('actual constraint and rate failures retain their normal explanation and draft', async t => {
  const f = composer(t, { guest: true });
  f.setError({ code: '23514', message: 'valid_note_body constraint' });
  await f.send();
  assert.doesNotMatch(f.message(), /사용할 수 없는 표현/);
  f.setError({ code: 'PNS02', message: 'note_post_rate_limit', details: JSON.stringify({ window_seconds: 60, max_posts: 2, retry_after_seconds: 18 }) });
  await f.send();
  assert.match(f.message(), /1분에 2개/);
  assert.match(f.message(), /18초/);
  assert.equal(f.document.getElementById('compose-text').value, ORIGINAL);
});

function support(t, view) {
  const f = domFor(t), { window, document, run } = f;
  let error = null, stored = [];
  const writes = [], client = {
    auth: { onAuthStateChange() {} },
    schema() { return { async rpc(name, args) {
      if (name === 'get_note_state') return { data: {} };
      if (name === 'list_my_inquiries') return { data: stored };
      assert.equal(name, 'submit_inquiry');
      writes.push({ name, args: plain(args) });
      if (error) return { error };
      stored = [{ id: CARD, body: serverText(args.p_body), status: 'open', created_at: '2026-11-19T00:00:00Z' }];
      return { data: { ok: true } };
    } }; },
    from(table) { assert.equal(table, 'feedback'); return { async insert(args) {
      writes.push({ name: table, args: plain(args) });
      return { error };
    } }; }
  };
  run(read('note/support.js'));
  window.OjjudaNoteSupport.install({ client, getUserId: () => USER, source: 'note' });
  if (view === 'feedback') window.OjjudaNoteSupport.openFeedback();
  else window.OjjudaNoteSupport.open();
  return { ...f, writes, setError: value => { error = value; },
    field: () => document.querySelector('.note-support-content textarea'),
    message: () => document.querySelector('.note-support-layer .management-message').textContent,
    async send() {
      document.querySelector('.note-support-content form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
      await settle();
    }
  };
}

for (const view of ['inquiries', 'feedback']) {
  test(`shared support ${view} retains failed input then accepts a successful server-masked submission`, async t => {
    const f = support(t, view);
    await settle();
    const field = f.field();
    field.value = ORIGINAL;
    f.setError(NETWORK);
    await f.send();
    assert.match(f.message(), /작성한 내용은 유지/);
    assert.equal(f.field(), field, 'the failed form must remain mounted');
    assert.equal(field.value, ORIGINAL);
    assert.equal(field.disabled, false);
    assert.equal(f.window.OjjudaNoteSupport.isOpen(), true);
    assert.doesNotMatch(f.document.querySelector('.note-support-content').textContent, /잘 받았어요/);
    f.setError(null);
    await f.send();
    assert.equal(f.writes.length, 2);
    assert.equal(f.writes.at(-1).args.p_body ?? f.writes.at(-1).args.body, ORIGINAL);
    assert.match(f.message(), view === 'inquiries' ? /문의를 접수/ : /의견을 확인/);
    if (view === 'inquiries') {
      assert.equal(f.field().value, '');
      assert.equal(f.document.querySelector('.note-inquiry p').textContent, CANONICAL);
    }
    else assert.match(f.document.querySelector('.note-support-content').textContent, /의견을 잘 받았어요/);
    assert.doesNotMatch(f.document.querySelector('.note-support-content').textContent, /검사표현/);
  });
}

test('shared support preserves the separate inquiry rate-limit explanation', async t => {
  const f = support(t, 'inquiries');
  await settle();
  f.field().value = '문의';
  f.setError({ code: '22023', message: 'daily_inquiry_limit' });
  await f.send();
  assert.match(f.message(), /24시간.*3건/);
  assert.doesNotMatch(f.message(), /사용할 수 없는 표현/);
  assert.equal(f.field().value, '문의');
});

test('admin inquiry reply preserves network failures and reads back the canonical saved reply', async t => {
  const { window, document, run } = domFor(t);
  let error = NETWORK, changed = 0;
  const writes = [], item = { id: CARD, body: '문의', reply: '기존 답변', status: 'open',
    created_at: '2026-11-19T00:00:00Z', updated_at: '2026-11-19T00:00:00Z' };
  const client = { schema() { return { async rpc(name, args) {
    if (name === 'admin_inquiries') return { data: [plain(item)] };
    assert.equal(name, 'admin_reply_inquiry');
    writes.push(plain(args));
    if (error) return { error };
    item.reply = serverText(args.p_reply); item.updated_at = '2026-11-19T00:01:00Z';
    return { data: null };
  } }; } };
  run(read('note/support.js'));
  const container = document.getElementById('app');
  await window.OjjudaNoteSupport.renderAdmin({ client, container, onChanged: () => { changed++; } });
  const field = container.querySelector('textarea');
  field.value = ORIGINAL;
  const send = async () => {
    field.form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await settle();
  };
  await send();
  assert.match(field.form.querySelector('[role="status"]').textContent, /답변을 저장하지 못했어요/);
  assert.equal(field.value, ORIGINAL);
  assert.equal(field.defaultValue, '기존 답변');
  assert.equal(field.disabled, false);
  assert.equal(changed, 0);
  error = null;
  await send();
  assert.equal(changed, 1);
  assert.equal(container.querySelector('textarea').value, CANONICAL);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].p_expected_updated_at, writes[1].p_expected_updated_at);
});

test('a committed reply followed by a read failure cannot display the unmasked submission as saved', async t => {
  const { window, document, run } = domFor(t);
  let failRead = false, writes = 0;
  const rows = [CARD, PARENT].map(id => ({ id, body: '문의', reply: '', status: 'open',
    created_at: '2026-11-19T00:00:00Z', updated_at: '2026-11-19T00:00:00Z' }));
  const client = { schema() { return { async rpc(name, args) {
    if (name === 'admin_inquiries') return failRead ? { error: NETWORK } : { data: plain(rows) };
    assert.equal(name, 'admin_reply_inquiry'); writes++;
    rows.find(row => row.id === args.p_id).reply = serverText(args.p_reply);
    failRead = true;
    return { data: null };
  } }; } };
  run(read('note/support.js'));
  const container = document.getElementById('app');
  const controller = await window.OjjudaNoteSupport.renderAdmin({ client, container });
  const [field, otherDraft] = container.querySelectorAll('textarea');
  field.value = ORIGINAL; otherDraft.value = '다른 문의의 작성 중인 답변';
  field.form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  assert.equal(writes, 1);
  assert.equal(field.value, '');
  assert.equal(field.disabled, true);
  assert.match(container.textContent, /답변은 저장됐지만 목록을 다시 불러오지 못했어요/);
  assert.doesNotMatch(container.textContent, /답변을 저장하지 못했어요/);
  assert.equal(otherDraft.value, '다른 문의의 작성 중인 답변');
  assert.equal(otherDraft.disabled, false);
  assert.equal(controller.hasDraft(), true);
  failRead = false;
  container.querySelector('[data-inquiry-reload-error] button').click();
  await settle();
  assert.equal(writes, 1, 'canonical reload does not send the reply again');
  assert.equal(container.querySelector('textarea').value, CANONICAL);
  assert.equal(container.querySelector('textarea').disabled, false);
  assert.equal(container.querySelectorAll('textarea')[1].value, '다른 문의의 작성 중인 답변');
});

test('Park masked body and tag limits match the shared code-point counter and permit canonical edits', async t => {
  const { maskedTextLength, textInputMaxLength } = await import('../shared/content/text-length.mjs');
  const f = composer(t, { edit: true });
  for (const value of ['', '가나다', '❤️❤️', '앞❤️❤️뒤', '😀❤️❤️가', '👩‍💻', '❤️❤️'.repeat(20), '❤️', '❤️❤️❤️❤️']) {
    assert.equal(f.run(`maskedTextLength(${JSON.stringify(value)})`), maskedTextLength(value));
    assert.equal(f.run(`textInputMaxLength(${JSON.stringify(value)},200)`), textInputMaxLength(value, 200));
  }
  const body = '가'.repeat(199) + '❤️❤️', tag = '나'.repeat(19) + '❤️❤️';
  f.run(`text.value=${JSON.stringify(body)};tags.value=${JSON.stringify(tag)};updateComposer();`);
  assert.equal(f.document.getElementById('compose-count').textContent, '200 / 200자');
  assert.equal(f.document.getElementById('compose-text').maxLength, body.length);
  assert.equal(f.document.getElementById('publish-card').disabled, false);
  assert.equal(f.run(`validEventBody(${JSON.stringify(body)})`), true);
  assert.equal(f.run(`validEventBody(${JSON.stringify(body + '가')})`), false);
  await f.send();
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].args.body, body);
  assert.deepEqual(f.writes[0].args.tags, [tag]);
  f.run(`backdrop.hidden=false;text.value='가'.repeat(201);tags.value='안전';updateComposer();`);
  assert.equal(f.document.getElementById('publish-card').disabled, true);
  await f.send();
  assert.equal(f.writes.length, 1, 'ordinary text retains its original 200-character limit');
});

for (const view of ['inquiries', 'feedback']) {
  test(`shared support ${view} counts the exact masking token once without extending ordinary limits`, async t => {
    const f = support(t, view);
    await settle();
    const field = f.field(), body = '가'.repeat(1999) + '❤️❤️';
    field.value = body; field.dispatchEvent(new f.window.Event('input', { bubbles: true }));
    assert.equal(field.maxLength, body.length);
    assert.equal(field.checkValidity(), true);
    field.value = body + '가'; field.dispatchEvent(new f.window.Event('input', { bubbles: true }));
    assert.equal(field.checkValidity(), false);
    field.form.requestSubmit();
    await settle();
    assert.equal(f.writes.length, 0);
    field.value = body; field.dispatchEvent(new f.window.Event('input', { bubbles: true }));
    await f.send();
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].args.p_body ?? f.writes[0].args.body, body);
  });
}

test('Park composer rejects server word fragments on input and publish without changing manual and removed tags', async t => {
  const body = '돈가스를 먹고 사랑니 때문에 병원에 갔다. 친구랑 산책했어요.';
  const oldBody = '옛날에 게임했어요.';
  let completeOld, completeCurrent;
  const oldResponse = new Promise(resolve => { completeOld = resolve; });
  const currentResponse = new Promise(resolve => { completeCurrent = resolve; });
  let matchingRequests = 0;
  const {window, document, run, send, writes} = composer(t, {suggest: text => {
    if (text === oldBody) return oldResponse;
    assert.equal(text, body);
    if (++matchingRequests === 1) return currentResponse;
    return ['돈', '사랑', '친구', '산책', '돈가스'];
  }});
  const timers = [];
  window.setTimeout = callback => { timers.push(callback); return timers.length; };
  window.clearTimeout = () => {};
  document.getElementById('compose-text').value = oldBody;
  run("autoTagMode = true; manualTags = ['사용자태그']; refreshAutoTags(); scheduleServerAutoTags()");
  const pendingOld = timers.shift()();
  const input = document.getElementById('compose-tags');
  document.getElementById('compose-text').value = body;
  run('refreshAutoTags(); scheduleServerAutoTags()');
  assert.match(input.value, /돈가스|사랑니|병원/);
  const pendingCurrent = timers.shift()();
  completeCurrent(['돈', '사랑', '병원', '친구', '산책']); await pendingCurrent;
  assert.equal(input.value, '사용자태그, 병원, 친구, 산책');
  completeOld(['게임']); await pendingOld;
  assert.equal(input.value, '사용자태그, 병원, 친구, 산책', 'late response cannot replace tags for newer body');
  input.value = '사용자태그, 병원, 산책'; run('noteTagEdit()');
  await send();
  assert.deepEqual(writes.at(-1).args.p_tags, ['사용자태그', '산책', '돈가스']);
});
