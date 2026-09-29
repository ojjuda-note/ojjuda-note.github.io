const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(read('note/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
    await page.addStyleTag({ content: read('note/style.css') });
    await page.addScriptTag({ content: read('note/preview.js') });
    await page.evaluate(() => {
      window.tagSearches = [];
      searchTagFn = tag => window.tagSearches.push(tag);
      feed.hidden = true; detail.hidden = false;
      slot.replaceChildren(cardElement({ id: '00000000-0000-4000-8000-000000000010',
        kind: 'memo', body: '상세 화면에서도 태그를 누를 수 있어야 해요.', tags: ['응원'],
        background_key: 'plain', created_at: new Date().toISOString() }, false, true));
    });
    const tag = page.getByRole('button', { name: '#응원', exact: true });
    const cdp = await context.newCDPSession(page);
    const ax = await cdp.send('Accessibility.getFullAXTree');
    const accessibleTag = ax.nodes.find(node => node.role?.value === 'button' && node.name?.value === '#응원');
    assert.ok(accessibleTag, 'the tag is exposed to assistive technology');
    assert.notEqual(accessibleTag.properties?.find(property => property.name === 'disabled')?.value?.value, true,
      'assistive technology must not see the tag as disabled');
    assert.equal(await tag.isEnabled(), true, 'expanded-card tags cannot inherit a disabled button');
    await tag.click();
    await tag.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Space');
    assert.deepEqual(await page.evaluate(() => tagSearches), ['응원', '응원', '응원']);
    assert.equal(await page.locator('#detail-card-slot [data-open]').count(), 0, 'a detail card cannot reopen itself');
    assert.deepEqual(errors, []);
    console.log('PASS: expanded-card tags remain clickable and keyboard accessible without reopening the card');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
