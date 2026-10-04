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
    await page.setContent(read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
    await page.addStyleTag({ content: read('note/style.css') });
    await page.addStyleTag({ content: read('note/features.css') });
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
    // A crowded tag row must not shrink a short quote or the photo beneath it.
    for (const width of [320, 360, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const results = await page.evaluate(() => {
        const host = document.createElement('div');
        host.style.width = `${Math.min(innerWidth - 24, 560)}px`;
        document.body.append(host);
        const result = [];
        for (const variant of ['feed', 'detail', 'reply', 'event']) {
          const wrapper = document.createElement('div');
          if (variant === 'detail') wrapper.className = 'detail-card-slot';
          host.append(wrapper);
          const make = tags => cardElement({ kind: variant === 'event' ? 'event' : 'memo',
            body: '오늘도 좋은 하루', tags, background_key: 'plain', created_at: new Date().toISOString() }, variant === 'reply');
          const plain = make([]), crowded = make(['기분좋은하루', '따뜻한위로', '작은행복찾기', '오늘도화이팅', '즐거운일상']);
          wrapper.append(plain, crowded);
          const photo = crowded.querySelector('.photo'), quote = crowded.querySelector('.card-quote'), tags = crowded.querySelector('.card-tags');
          const cardWidth = crowded.clientWidth;
          const originalHeight = variant === 'reply' ? 250 : variant === 'event' ? Math.max(210, cardWidth * .347)
            : variant === 'detail' ? Math.max(430, cardWidth * .768) : Math.max(370, cardWidth * .694);
          refreshExpandedBodies();
          const first = { height: photo.getBoundingClientRect().height, font: parseFloat(getComputedStyle(quote).fontSize) };
          refreshExpandedBodies();
          result.push({ variant, originalHeight, ...first,
            plainHeight: plain.querySelector('.photo').getBoundingClientRect().height,
            plainFont: parseFloat(getComputedStyle(plain.querySelector('.card-quote')).fontSize),
            stableHeight: photo.getBoundingClientRect().height, stableFont: parseFloat(getComputedStyle(quote).fontSize),
            clipped: photoQuoteClipped(photo, quote, tags), tagsOverflow: tags.scrollWidth > tags.clientWidth + 1 });
        }
        // Very long tags wrap independently; long bodies may grow, but never collapse a card.
        const long = cardElement({ kind: 'memo', body: '긴 글도 빠짐없이 보여요. '.repeat(14),
          tags: Array(5).fill('가나다라마바사아자차카타파하가나다라마바'), background_key: 'plain' });
        host.append(long); refreshExpandedBodies();
        const photo = long.querySelector('.photo'), quote = long.querySelector('.card-quote'), tags = long.querySelector('.card-tags');
        result.push({ variant: 'long', height: photo.getBoundingClientRect().height,
          minimum: Math.max(370, long.clientWidth * .694) * 2 / 3, clipped: photoQuoteClipped(photo, quote, tags) });
        host.remove();
        return result;
      });
      for (const result of results) {
        const label = `${width}px ${result.variant}: ${JSON.stringify(result)}`;
        assert.equal(result.clipped, false, label);
        if (result.variant === 'long') { assert.ok(result.height >= result.minimum - 1, label); continue; }
        assert.ok(Math.abs(result.height - result.originalHeight * 2 / 3) < 1, label);
        assert.equal(result.tagsOverflow, false, label);
        assert.equal(result.height, result.plainHeight, label);
        if (result.variant === 'event') assert.ok(result.font > 12, label);
        else assert.equal(result.font, result.plainFont, label);
        assert.equal(result.height, result.stableHeight, label);
        assert.equal(result.font, result.stableFont, label);
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS: expanded-card tags remain clickable and keyboard accessible without reopening the card');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
