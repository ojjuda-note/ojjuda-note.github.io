const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    // Actual application modules, synthetic data only: no live requests or storage changes.
    await context.route('**/*', route => route.abort());
    const errors = [];
    let acceptDialogs = true;
    async function pageFor(files) {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => acceptDialogs ? dialog.accept() : dialog.dismiss());
      await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><main id="host"></main>');
      for (const file of files) await page.addScriptTag({ content: read(file) });
      return page;
    }

    const support = await pageFor(['note/support.js', 'note/operations.js']);
    await support.evaluate(async () => {
      window.calls = [];
      window.hostChanges = 0;
      window.inquiries = Array.from({ length: 30 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        body: `검증용 문의 ${index + 1}`, reply: '', status: 'open',
        created_at: '2026-10-04T00:00:00Z', updated_at: '2026-10-04T00:00:00Z'
      }));
      window.replyResponse = null;
      window.deferInquiryRead = false;
      window.inquiryResponse = null;
      window.client = {
        schema() { return this; },
        auth: {
          onAuthStateChange(handler) { window.authChanged = handler; return { data: { subscription: { unsubscribe() {} } } }; },
          async getSession() { return { data: { session: { user: { id: 'synthetic-admin' } } } }; }
        },
        async rpc(name, args) {
          calls.push({ name, args });
          if (name === 'admin_inquiries') {
            if (deferInquiryRead) return new Promise(resolve => { inquiryResponse = resolve; });
            return { data: inquiries.map(row => ({ ...row })), error: null };
          }
          if (name === 'admin_feedback') return { data: [], error: null };
          if (name === 'admin_reply_inquiry') {
            const result = await new Promise(resolve => { replyResponse = resolve; });
            if (!result.error) Object.assign(inquiries.find(row => row.id === args.p_id), {
              reply: args.p_reply, status: 'resolved', updated_at: '2026-10-04T00:01:00Z'
            });
            return result;
          }
          throw new Error(`Unexpected RPC: ${name}`);
        }
      };
      window.controller = await OjjudaOperations.renderSupport({
        client, container: document.getElementById('host'),
        onChanged() { hostChanges++; throw new Error('Synthetic host refresh failure'); }
      });
    });
    const inquiryArea = support.locator('.ops-inquiries');
    const reply = inquiryArea.locator('textarea').first();
    const replyCard = inquiryArea.locator('.note-inquiry').first();
    assert.equal(await support.evaluate(() => typeof controller.canLeave), 'function', 'operations exposes inquiry navigation guard');
    assert.equal(await support.evaluate(() => controller.hasDraft()), false);
    await reply.fill('실패하더라도 보존할 관리자 답변');
    assert.equal(await support.evaluate(() => controller.hasDraft()), true, 'operations relays child draft state');
    await replyCard.getByRole('button', { name: '답변 등록', exact: true }).click();
    await support.waitForFunction(() => typeof replyResponse === 'function');
    assert.equal(await inquiryArea.locator('button, textarea').evaluateAll(nodes => nodes.every(node => node.disabled)), true,
      'filters, pagination, other replies and current textarea are locked while saving');
    assert.equal(await support.evaluate(() => controller.canLeave()), false, 'host navigation is blocked while a reply is in flight');
    const requestsBeforeRefresh = await support.evaluate(() => calls.filter(call => call.name === 'admin_inquiries').length);
    await support.evaluate(async () => { await controller.refresh(); });
    assert.equal(await support.evaluate(() => calls.filter(call => call.name === 'admin_inquiries').length), requestsBeforeRefresh,
      'host refresh cannot replace an in-flight inquiry');
    assert.equal(await reply.inputValue(), '실패하더라도 보존할 관리자 답변');
    await support.evaluate(() => replyResponse({ data: null, error: { code: 'XX000' } }));
    await replyCard.getByText(/답변을 저장하지 못했어요/).waitFor();
    assert.equal(await reply.inputValue(), '실패하더라도 보존할 관리자 답변');
    assert.equal(await reply.isEnabled(), true);
    assert.equal(await inquiryArea.getByRole('button', { name: '전체', exact: true }).isEnabled(), true);
    assert.equal(await support.evaluate(() => controller.hasDraft()), true);
    acceptDialogs = false;
    assert.equal(await support.evaluate(() => controller.canLeave()), true, 'failed save releases the in-flight guard; hasDraft remains true');
    await support.evaluate(async () => { await controller.refresh(); });
    assert.equal(await reply.inputValue(), '실패하더라도 보존할 관리자 답변', 'cancelled refresh keeps the failed reply');
    assert.equal(await support.evaluate(() => calls.filter(call => call.name === 'admin_inquiries').length), requestsBeforeRefresh);
    await inquiryArea.getByRole('button', { name: '전체', exact: true }).click();
    assert.equal(await reply.inputValue(), '실패하더라도 보존할 관리자 답변', 'cancelled filter change keeps the failed reply');
    acceptDialogs = true;
    const secondReply = inquiryArea.locator('textarea').nth(1);
    const secondCard = inquiryArea.locator('.note-inquiry').nth(1);
    await secondReply.fill('다른 문의에 아직 저장하지 않은 답변');
    await support.evaluate(() => { replyResponse = null; });
    await replyCard.getByRole('button', { name: '답변 등록', exact: true }).click();
    await support.waitForFunction(() => typeof replyResponse === 'function');
    await support.evaluate(() => {
      // Another administrator updates the second inquiry before this view reloads.
      inquiries[1].updated_at = '2026-10-04T00:02:00Z';
      replyResponse({ data: null, error: null });
    });
    await replyCard.getByRole('button', { name: '답변 수정', exact: true }).waitFor();
    assert.equal(await secondReply.inputValue(), '다른 문의에 아직 저장하지 않은 답변',
      'saving one reply preserves a draft in a different inquiry');
    assert.equal(await support.evaluate(() => controller.hasDraft()), true, 'the preserved second reply is still an unsaved draft');
    await secondReply.fill('');
    assert.equal(await support.evaluate(() => controller.hasDraft()), false,
      'reverting the second draft restores a clean view; the committed first reply is already clean');
    assert.equal(await support.evaluate(() => controller.canLeave()), true);
    assert.equal(await support.evaluate(() => hostChanges), 1, 'host notification runs only after a committed reply');
    assert.equal(await reply.inputValue(), '실패하더라도 보존할 관리자 답변');
    assert.equal(await replyCard.getByText(/답변을 저장하지 못했어요/).count(), 0, 'host refresh failure cannot misreport a saved reply');
    await secondReply.fill('다른 문의에 아직 저장하지 않은 답변');
    await support.evaluate(() => { replyResponse = null; });
    await secondCard.getByRole('button', { name: '답변 등록', exact: true }).click();
    await support.waitForFunction(() => typeof replyResponse === 'function');
    assert.equal(await support.evaluate(() => calls.filter(call => call.name === 'admin_reply_inquiry').at(-1).args.p_expected_updated_at),
      '2026-10-04T00:00:00Z', 'preserving a draft also preserves the original version for concurrent-edit conflict detection');
    await support.evaluate(() => replyResponse({ data: null, error: { code: '40001' } }));
    await secondCard.getByText(/다른 관리자가 답변을 바꿨어요/).waitFor();
    assert.equal(await secondReply.inputValue(), '다른 문의에 아직 저장하지 않은 답변', 'a concurrent-edit conflict also preserves the draft');
    assert.equal(await support.evaluate(() => hostChanges), 1);

    // A committed reply followed by a failed automatic list refresh must retain other drafts.
    await reply.fill('첫 문의에 저장할 수정 답변');
    await support.evaluate(() => { replyResponse = null; deferInquiryRead = true; });
    await replyCard.getByRole('button', { name: '답변 수정', exact: true }).click();
    await support.waitForFunction(() => typeof replyResponse === 'function');
    await support.evaluate(() => replyResponse({ data: null, error: null }));
    await support.waitForFunction(() => typeof inquiryResponse === 'function');
    assert.equal(await support.evaluate(() => controller.canLeave()), false, 'the automatic refresh remains guarded until its result arrives');
    assert.equal(await secondReply.inputValue(), '다른 문의에 아직 저장하지 않은 답변', 'pending reload keeps the existing draft visible');
    await support.evaluate(() => inquiryResponse({ data: null, error: { code: 'XX000' } }));
    await inquiryArea.getByText('답변은 저장됐지만 목록을 다시 불러오지 못했어요. 다른 작성 내용은 유지됩니다.', { exact: true }).waitFor();
    assert.equal(await reply.inputValue(), '첫 문의에 저장할 수정 답변');
    assert.equal(await secondReply.inputValue(), '다른 문의에 아직 저장하지 않은 답변');
    assert.equal(await support.evaluate(() => controller.hasDraft()), true);
    assert.equal(await support.evaluate(() => controller.canLeave()), true);
    assert.equal(await secondReply.isEnabled(), true);
    assert.equal(await support.evaluate(() => hostChanges), 2, 'the refresh failure does not undo a committed reply');
    await support.evaluate(() => { replyResponse = null; });
    await secondCard.getByRole('button', { name: '답변 등록', exact: true }).click();
    await support.waitForFunction(() => typeof replyResponse === 'function');
    assert.equal(await support.evaluate(() => calls.filter(call => call.name === 'admin_reply_inquiry').at(-1).args.p_reply),
      '다른 문의에 아직 저장하지 않은 답변', 'the retained form still submits after an automatic reload failure');
    await support.evaluate(() => replyResponse({ data: null, error: { code: '40001' } }));
    await support.waitForFunction(() => controller.canLeave());
    await support.evaluate(() => { deferInquiryRead = false; });
    await inquiryArea.getByRole('button', { name: '다시 시도', exact: true }).click();
    await support.waitForFunction(() => !document.querySelector('[data-inquiry-reload-error]'));
    assert.equal(await reply.inputValue(), '첫 문의에 저장할 수정 답변');
    assert.equal(await secondReply.inputValue(), '다른 문의에 아직 저장하지 않은 답변', 'recovery retry also preserves the other inquiry draft');
    assert.equal(await support.evaluate(() => controller.hasDraft()), true);

    const admin = await pageFor(['note/admin.js']);
    await admin.evaluate(async () => {
      window.calls = [];
      window.removals = [];
      window.cleanupLookupFails = false;
      window.threadPageFails = true;
      window.changedTabs = [];
      window.card = {
        id: '10000000-0000-4000-8000-000000000001', author_id: '20000000-0000-4000-8000-000000000001',
        kind: 'card', body: '검증용 카드 원문', tags: [], hidden: false, total_count: 1,
        created_at: '2026-10-04T00:00:00Z'
      };
      window.archived = { ...card, id: '30000000-0000-4000-8000-000000000001',
        body: '보관 중인 검증용 카드', archived_at: '2026-10-04T00:00:00Z', purge_after: '2026-11-04T00:00:00Z',
        archive_reason: 'admin', reply_count: 100 };
      window.OjjudaMap = { create() { return { setMarkers() {}, focusOn() {}, destroy() {} }; } };
      window.client = {
        schema() { return this; },
        auth: {
          onAuthStateChange(handler) { window.authChanged = handler; return { data: { subscription: { unsubscribe() {} } } }; },
          async getSession() { return { data: { session: { user: { id: 'synthetic-admin' } } } }; }
        },
        storage: { from(bucket) { return { async remove(paths) { removals.push({ bucket, paths }); return { error: null }; } }; } },
        async rpc(name, args) {
          calls.push({ name, args });
          if (name === 'is_note_moderator') return { data: true, error: null };
          if (name === 'admin_cards') return { data: [{ ...card, hidden: args.p_state === 'hidden' }], error: null };
          if (name === 'admin_risk_cards') return { data: [{ ...card, body: '합성 위험 신호 카드' }], error: null };
          if (name === 'admin_card_locations') return { data: [{ ...card, lat: 37.57, lon: 126.98 }], error: null };
          if (name === 'admin_archived_cards') return { data: [{ ...archived }], error: null };
          if (name === 'admin_expired_archive_queue') return { data: [], error: null };
          if (name === 'admin_pending_photo_cleanup') return cleanupLookupFails
            ? { data: null, error: { code: 'XX000' } }
            : { data: [{ bucket_id: 'note-card-photos', photo_path: 'synthetic-user/deleted.jpg' }], error: null };
          if (name === 'admin_archived_thread') {
            if (args.p_offset === 100 && threadPageFails) return { data: null, error: { code: 'XX000' } };
            return { data: Array.from({ length: args.p_offset === 0 ? 100 : 1 }, (_, index) => ({
              ...archived, id: `thread-${args.p_offset + index}`, kind: args.p_offset + index ? 'comment' : 'card',
              body: `보관 원문·답글 ${args.p_offset + index}`, total_count: 101
            })), error: null };
          }
          throw new Error(`Unexpected RPC: ${name}`);
        }
      };
      await OjjudaNoteAdmin.mount(document.getElementById('host'), {
        client, initialTab: 'cards', onTabChange: id => changedTabs.push(id)
      });
    });
    const content = admin.locator('#note-admin-content');
    assert.equal(await admin.evaluate(() => typeof OjjudaNoteAdmin.refresh), 'function');
    assert.equal(await admin.evaluate(() => typeof OjjudaNoteAdmin.canLeave), 'function');
    assert.equal(await admin.evaluate(() => typeof OjjudaNoteAdmin.hasDraft), 'function');
    assert.equal(await admin.evaluate(() => OjjudaNoteAdmin.getTabs().some(tab => tab.id === 'risk' && tab.label.includes('위험'))), true,
      'risk signals are directly available to the host navigation');
    await admin.evaluate(async () => { await OjjudaNoteAdmin.selectTab('risk'); });
    assert.match(await content.locator('h3').textContent(), /위험/);
    let lastRisk = await admin.evaluate(() => calls.filter(call => call.name === 'admin_risk_cards').at(-1));
    assert.deepEqual(lastRisk.args, { p_query: '', p_state: 'all', p_limit: 30, p_offset: 0 });
    const risksBeforeRefresh = await admin.evaluate(() => calls.filter(call => call.name === 'admin_risk_cards').length);
    await admin.evaluate(async () => { await OjjudaNoteAdmin.refresh(); });
    assert.equal(await admin.evaluate(() => calls.filter(call => call.name === 'admin_risk_cards').length), risksBeforeRefresh + 1);
    assert.equal(await admin.evaluate(() => changedTabs.at(-1)), 'risk', 'refresh stays on the selected risk tab');

    await admin.evaluate(async () => { await OjjudaNoteAdmin.selectTab('cards'); });
    await content.locator('.na-search select').selectOption('hidden');
    await content.locator('.na-search').getByRole('button', { name: '검색', exact: true }).click();
    await admin.waitForFunction(() => calls.filter(call => call.name === 'admin_cards').at(-1).args.p_state === 'hidden');
    await content.locator('.na-more-actions summary').click();
    await content.getByRole('button', { name: '이 작성자의 카드 모두 보기', exact: true }).click();
    await admin.waitForFunction(() => calls.filter(call => call.name === 'admin_cards').at(-1).args.p_query === card.author_id);
    assert.equal(await admin.evaluate(() => calls.filter(call => call.name === 'admin_cards').at(-1).args.p_state), 'all',
      'author all-cards lookup clears a previously hidden-only filter');
    assert.equal(await content.locator('.na-search select').inputValue(), 'all');
    await content.locator('.na-search select').selectOption('hidden');
    await content.locator('.na-search').getByRole('button', { name: '검색', exact: true }).click();
    await admin.waitForFunction(() => calls.filter(call => call.name === 'admin_cards').at(-1).args.p_state === 'hidden');
    await admin.evaluate(async () => { await OjjudaNoteAdmin.selectTab('map'); });
    await content.getByRole('button', { name: '카드 관리에서 보기', exact: true }).click();
    await admin.waitForFunction(() => calls.filter(call => call.name === 'admin_cards').at(-1).args.p_query === card.id);
    assert.equal(await admin.evaluate(() => calls.filter(call => call.name === 'admin_cards').at(-1).args.p_state), 'all',
      'map-to-card lookup clears a previously hidden-only filter');

    // An edit draft must survive a rejected host refresh and navigation attempt.
    await content.getByRole('button', { name: '본문·태그 수정', exact: true }).click();
    const body = content.locator('textarea').first();
    await body.fill('저장 전 수정 내용');
    assert.equal(await admin.evaluate(() => OjjudaNoteAdmin.hasDraft()), true);
    acceptDialogs = false;
    assert.equal(await admin.evaluate(() => OjjudaNoteAdmin.canLeave()), true, 'an unsaved draft is distinct from an in-flight write');
    await admin.evaluate(async () => { await OjjudaNoteAdmin.refresh(); });
    assert.equal(await body.inputValue(), '저장 전 수정 내용');
    await admin.evaluate(async () => { await OjjudaNoteAdmin.selectTab('archive'); });
    assert.equal(await body.inputValue(), '저장 전 수정 내용');
    acceptDialogs = true;

    await admin.evaluate(async () => { await OjjudaNoteAdmin.selectTab('archive'); });
    await content.getByRole('button', { name: '원문·답글 보기', exact: true }).waitFor();
    assert.deepEqual(await admin.evaluate(() => removals), [], 'opening the archive never deletes stored photos');
    await admin.evaluate(async () => { await OjjudaNoteAdmin.refresh(); });
    assert.deepEqual(await admin.evaluate(() => removals), [], 'refreshing the archive never deletes stored photos');
    assert.equal(await content.getByRole('button', { name: /사진 파일 정리/ }).count(), 1, 'photo cleanup is an explicit action');
    await admin.evaluate(async () => { cleanupLookupFails = true; await OjjudaNoteAdmin.refresh(); });
    assert.match(await content.innerText(), /사진.*(?:확인|불러오).*(?:못|실패)/,
      'cleanup lookup failure remains visible beside readable archived content');
    assert.equal(await content.getByRole('button', { name: '원문·답글 보기', exact: true }).count(), 1);
    assert.deepEqual(await admin.evaluate(() => removals), []);

    await content.getByRole('button', { name: '원문·답글 보기', exact: true }).click();
    await content.getByRole('button', { name: '답글 더 보기', exact: true }).waitFor();
    assert.equal(await content.locator('.na-action-form .na-item').count(), 100);
    await content.getByRole('button', { name: '답글 더 보기', exact: true }).click();
    const retry = content.getByRole('button', { name: /다시 시도|다시 불러오기/ });
    await retry.waitFor();
    assert.equal(await content.locator('.na-action-form .na-item').count(), 100,
      'a failed later page preserves the already loaded original and replies');
    assert.equal(await content.getByText('보관 원문·답글 0', { exact: true }).count(), 1);
    await admin.evaluate(() => { threadPageFails = false; });
    await retry.click();
    await content.getByText('보관 원문·답글 100', { exact: true }).waitFor();
    assert.equal(await content.locator('.na-action-form .na-item').count(), 101);
    assert.deepEqual(await admin.evaluate(() => calls.filter(call => call.name === 'admin_archived_thread').map(call => call.args.p_offset)), [0, 100, 100],
      'retry repeats the failed offset without skipping or duplicating earlier rows');
    assert.deepEqual(await admin.evaluate(() => removals), []);
    assert.deepEqual(errors, []);
    console.log('PASS: reply draft/in-flight navigation and refresh guards, operations controller relay, risk navigation, author/map filter resets, explicit archive cleanup and preserved thread pagination retry.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
