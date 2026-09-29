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
    const context = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><main id="support"></main>');
    await page.addStyleTag({ content: read('note/operations.css') });
    await page.addScriptTag({ content: read('note/operations.js') });

    const malicious = '<img src=x onerror="window.executed=true"><script>window.executed=true</script>';
    const repo = 'https://github.com/ojjuda-note/ojjuda-note.github.io';
    const base = { kind: 'bug', body: '합성 오류 제보', nickname: '검증용 회원', created_at: '2026-09-29T08:00:00Z', status: 'open' };
    const rows = [
      { ...base, id: 1, body: malicious, ai: { status: 'resolved', priority: 'high', summary: malicious, result: '수정 및 재현 확인\n' + '긴문자'.repeat(180), evidence_url: `${repo}/commit/${'a'.repeat(40)}`, updated_at: base.created_at } },
      { ...base, id: 2, status: 'done', ai: { status: 'blocked', priority: 'normal', result: malicious, evidence_url: 'javascript:window.executed=true' } },
      { ...base, id: 3, ai: { status: 'running', evidence_url: `${repo}/actions/runs/123456` } },
      { ...base, id: 4, ai: { status: 'needs_review', evidence_url: `${repo}/pull/123` } },
      { ...base, id: 5, ai: { status: 'queued', evidence_url: `${repo}.evil.invalid/commit/${'b'.repeat(40)}` } },
      { ...base, id: 6, ai: null },
      { ...base, id: 7, ai: { status: 'constructor', priority: '__proto__', evidence_url: `${repo}/pull/123?redirect=https://evil.invalid` } },
      { ...base, id: 8 },
      { ...base, id: 9, ai: { status: 'blocked', evidence_url: `${repo}/commit/${'c'.repeat(40)}/../../issues` } }
    ];
    await page.evaluate(async fixtures => {
      window.fixtureRows = fixtures;
      window.savedCalls = [];
      window.failedState = null;
      window.deferFeedback = false;
      window.pendingFeedback = [];
      window.OjjudaNoteSupport = { async renderAdmin({ container }) { container.textContent = '문의 관리'; } };
      const client = {
        schema() { return this; },
        auth: {
          onAuthStateChange(handler) { window.authChanged = handler; return { data: { subscription: { unsubscribe() {} } } }; },
          async getSession() { return { data: { session: { user: { id: 'synthetic-admin' } } } }; }
        },
        async rpc(name, args) {
          if (name === 'admin_set_feedback') {
            savedCalls.push(args);
            fixtureRows.find(row => row.id === args.feedback_id).status = args.st;
            return { data: null, error: null };
          }
          if (name !== 'admin_feedback') throw new Error('unexpected RPC');
          if (deferFeedback) await new Promise(resolve => pendingFeedback.push(resolve));
          if (args.st === failedState) return { data: null, error: { code: '42501' } };
          return { data: fixtureRows.filter(row => row.status === args.st), error: null };
        }
      };
      window.options = { client, container: document.getElementById('support') };
      window.supportView = await OjjudaOperations.renderSupport(options);
    }, rows);

    const card = id => page.locator(`[data-operation-id="feedback:${id}"]`);
    await page.getByRole('button', { name: '전체', exact: true }).click();
    assert.equal(await page.locator('.ops-feedback-ai').count(), rows.length);
    assert.match(await card(1).innerText(), /새 의견[\s\S]*수정 확인/);
    assert.match(await card(2).innerText(), /확인함[\s\S]*처리 보류/);
    assert.equal(await card(3).getByText('검토 중', { exact: true }).count(), 1);
    assert.equal(await card(4).getByText('검토 필요', { exact: true }).count(), 1);
    assert.equal(await card(5).getByText('Codex 확인 대기', { exact: true }).count(), 1);
    for (const id of [6, 8]) assert.equal(await card(id).getByText('자동 확인 대기', { exact: true }).count(), 1, 'old RPC and null AI results remain readable');
    assert.equal(await card(7).getByText('처리 상태 확인 필요', { exact: true }).count(), 1);
    assert.equal(await card(1).locator('.ops-content').first().textContent(), malicious);
    assert.equal(await card(2).locator('.ops-feedback-ai .ops-content').textContent(), malicious);
    assert.equal(await page.locator('#support img, #support script').count(), 0, 'member and AI text never become HTML');
    assert.equal(await page.evaluate(() => window.executed), undefined);
    assert.equal(await page.locator('.ops-ai-evidence').count(), 3, 'only exact repository evidence URLs become links');
    assert.deepEqual(await page.locator('.ops-ai-evidence').evaluateAll(links => links.map(link => ({ target: link.target, rel: link.rel }))), Array(3).fill({ target: '_blank', rel: 'noopener noreferrer' }));
    assert.equal(await card(1).locator('.ops-ai-updated').getAttribute('datetime'), '2026-09-29T08:00:00.000Z');
    assert.equal(await page.locator('#support').evaluate(node => node.scrollWidth <= node.clientWidth), true, 'long output fits a 360px mobile screen');

    // Reading an opinion and the AI fix status remain independent, including after a refresh.
    await card(1).getByRole('button', { name: '확인함', exact: true }).click();
    await page.waitForFunction(() => savedCalls.length === 1 && document.querySelector('#support .ops-message').textContent === '확인함으로 표시했어요.');
    assert.deepEqual(await page.evaluate(() => savedCalls), [{ feedback_id: 1, st: 'done' }]);
    assert.equal(await card(1).getByText('수정 확인', { exact: true }).count(), 1);
    assert.equal(await card(1).getByRole('button', { name: '다시 열기' }).count(), 1);

    // A partial permission failure must stay visible instead of looking like an empty healthy queue.
    await page.evaluate(async () => { failedState = 'done'; await supportView.refresh(); });
    assert.match(await page.locator('.ops-warning').innerText(), /확인한 의견 목록을 불러오지 못했어요/);
    assert.match(await page.locator('.ops-summary').innerText(), /일부 목록 확인 필요/);
    assert.equal(await card(3).count(), 1);

    // No pending response may repaint administrator data after the account changes.
    await page.evaluate(() => {
      failedState = null; deferFeedback = true;
      window.pendingRefresh = supportView.refresh();
    });
    await page.waitForFunction(() => pendingFeedback.length === 2);
    await page.evaluate(async () => {
      authChanged('SIGNED_OUT', null);
      pendingFeedback.forEach(resolve => resolve());
      await pendingRefresh;
    });
    assert.equal(await page.locator('.ops-feedback-ai').count(), 0);
    assert.match(await page.locator('#support').innerText(), /계정이 바뀌었어요/);
    assert.deepEqual(errors, []);
    console.log('PASS: feedback AI status, independent seen state, safe evidence/text, legacy fallback, mobile wrapping, partial failure and stale account response');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
