const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..');
const artifacts = path.join(__dirname, 'artifacts', 'fortune-readings');
fs.mkdirSync(artifacts, { recursive: true });
const { chromium } = require('playwright');

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff': 'font/woff' };
// Isolated rendering fixture. It uses production calculation and reading modules
// with a published example date, and never loads authentication or billing code.
const sajuFixture = `<!doctype html><html lang="ko" data-reduced-motion="true"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/games/moonlit-tarot/assets/favicon.svg"><link rel="stylesheet" href="/games/starlit-saju/style.css"><link rel="stylesheet" href="/games/starlit-saju/report.css"></head><body><main><section class="result"><label for="fixture-topic">검사할 풀이</label><select id="fixture-topic"><option value="lifelong">평생운</option><option value="annual">올해운</option><option value="monthly">월별운</option><option value="all">전체 풀이</option></select><div class="detailed-reading" id="report-content"></div></section></main><script type="module">
import { calculateSaju } from '/games/starlit-saju/engine.mjs';
import { analyzeFortune } from '/games/starlit-saju/fortune-data.mjs';
import { analyzeDaeun } from '/games/starlit-saju/daeun.mjs';
import { buildDetailedReading } from '/games/starlit-saju/readings.mjs';
import { renderDetailedReport } from '/games/starlit-saju/report-view.mjs';
const now = new Date('2026-11-13T00:00:00Z');
const chart = calculateSaju({year:2005,month:12,day:23,hour:8,minute:37},{now});
const fortune = analyzeFortune(chart,{year:2026,now});
const reading = buildDetailedReading(chart,fortune,{daeun:analyzeDaeun(chart,{gender:'female',now})});
const target = document.getElementById('report-content');
const select = document.getElementById('fixture-topic');
function show(){renderDetailedReport(target,{reading,fortune,topic:select.value});target.dataset.ready=select.value;}
select.addEventListener('change',show);show();
</script></body></html>`;
const server = http.createServer((request, response) => {
  let name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (name === '/__saju_fixture') { response.writeHead(200, { 'content-type': mime['.html'] }); response.end(sajuFixture); return; }
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(repo, '.' + name);
  if (!file.startsWith(repo + path.sep) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
  let bytes = fs.readFileSync(file);
  // The production billing flag is disabled only in this isolated local fixture.
  if (name === '/games/moonlit-tarot/index.html') bytes = Buffer.from(bytes.toString().replace('data-billing="ojjuda"', 'data-billing="preview"'));
  response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  response.end(bytes);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/games/moonlit-tarot/`;
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
    const errors = [], failed = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failed.push([response.status(), response.url()]); });
    await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    await page.goto(url);
    await page.locator('#summon-button:not([disabled])').waitFor();
    await page.locator('[data-topic="money"]').click();
    assert.equal(await page.locator('.tarot-price strong').textContent(), '1회 10쭈');
    await page.screenshot({ path: path.join(artifacts, 'tarot-intro-mobile.png') });
    await page.locator('#summon-button').click();
    await page.waitForFunction(() => document.querySelector('#app').dataset.phase === 'discard');
    await page.screenshot({ path: path.join(artifacts, 'tarot-choice-mobile.png') });
    await page.locator('.card[data-index="0"]').click();
    await page.waitForFunction(() => document.querySelector('#app').dataset.phase === 'discard');
    await page.locator('.card[data-index="1"]').click();
    await page.waitForFunction(() => document.querySelector('#app').dataset.phase === 'reading');
    const roles = ['지금의 문제', '현재 상황', '해결 방법과 결과'];
    for (const [slot, index] of [2, 4, 3].entries()) {
      await page.locator(`.card[data-index="${index}"]`).click();
      await page.locator('#reading-dialog[open]').waitFor();
      assert.ok((await page.locator('#reading-position').textContent()).endsWith(roles[slot]));
      assert.ok((await page.locator('#reading-introduction').textContent()).length > 20);
      assert.ok((await page.locator('#reading-title').textContent()).length > 0);
      const paragraphs = await page.locator('#reading-sections > p').allTextContents();
      assert.ok(paragraphs.length >= 5, 'card meaning, situation, example, action and caution remain readable without repeated introductions');
      assert.ok(paragraphs.every(text => text.trim().length > 20));
      assert.ok(paragraphs.join('').length >= 350, 'the individual reading remains detailed');
      assert.equal(await page.locator('#reading-sections h3').count(), 0);
      const cardName = await page.locator('#reading-title').textContent();
      assert.ok((await page.locator('#reading-introduction .reading-card-name').allTextContents()).some(text => text.includes(cardName)), 'the actual card name is subtly emphasized');
      assert.ok(await page.locator('#reading-detail-sections .reading-part').count() > 0, 'original meanings and cautions remain available');
      assert.match(await page.locator('#reading-source-link').getAttribute('href'), /^https:\/\/en\.wikisource\.org\//);
      if (index === 2) {
        await page.screenshot({ path: path.join(artifacts, 'tarot-card-mobile.png') });
        await page.locator('#reading-source-link').locator('xpath=ancestor::details[1]').locator('summary').click();
        await page.locator('#reading-source-link').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(artifacts, 'tarot-source-mobile.png') });
      }
      await page.locator('#reading-dialog .modal-close').click();
    }
    assert.equal(await page.locator('#reading-open span').textContent(), '종합 점괘 자세히 보기');
    await page.locator('#reading-open').click();
    await page.locator('#result-dialog[open]').waitFor({ timeout: 15000 });
    assert.equal(await page.locator('#summary-tab-problem').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#summary-panel-timeline').isVisible(), false);
    const tarotViews = {};
    const domainCategories = [['self', 5], ['timeline', 5], ['solutions', 5], ['love', 7], ['family', 4], ['career', 5], ['study', 5], ['money', 5], ['wellbeing', 4], ['opportunities', 5]];
    const captureCategories = new Set(['self', 'love', 'money', 'wellbeing']);
    const overflowState = () => page.evaluate(() => ({ document: document.documentElement.scrollWidth > innerWidth, modal: document.querySelector('#result-dialog').scrollWidth > document.querySelector('#result-dialog').clientWidth }));
    async function inspectDomainCategories(viewport) {
      const panel = page.locator('#summary-panel-domains');
      const select = page.locator('#summary-domain-category');
      assert.equal(await select.locator('option').count(), 10);
      assert.equal(await page.locator('label[for="summary-domain-category"]').textContent(), '풀이 분야');
      assert.equal(await page.locator('#summary-domain-total').textContent(), '50개 풀이 · 10개 분야');
      const checks = [];
      let firstNumber = 1;
      for (const [category, count] of domainCategories) {
        await select.selectOption(category);
        assert.equal(await select.inputValue(), category);
        assert.ok((await select.locator('option:checked').textContent()).endsWith(` · ${count}개`));
        const visible = panel.locator('.reading-part:visible');
        assert.equal(await visible.count(), count, category + ': only the chosen category is visible');
        assert.ok((await visible.evaluateAll(sections => sections.map(section => section.dataset.categoryId))).every(id => id === category));
        const numbers = (await visible.locator('.reading-part-number').allTextContents()).map(Number);
        assert.deepEqual(numbers, Array.from({ length: count }, (_, index) => firstNumber + index), category + ': original topic numbers are retained');
        firstNumber += count;
        assert.equal(await panel.locator('.reading-part').count(), 50, 'all original topics remain in the DOM');
        assert.ok(await visible.locator('.reading-card-name:visible').count() > 0, category + ': actual card names remain easy to find');
        const overflow = await overflowState();
        assert.deepEqual(overflow, { document: false, modal: false }, category + ': the ' + viewport + ' reading fits');
        checks.push({ category, count, overflow });
        if (captureCategories.has(category)) await page.screenshot({ path: path.join(artifacts, `tarot-domains-${category}-${viewport}.png`) });
      }
      assert.equal(firstNumber, 51, 'all fifty topics were reached through the native selector');
      await select.selectOption('self');
      return checks;
    }
    for (const [group, expectedSections] of [['problem', 5], ['timeline', 7], ['domains', 50]]) {
      await page.locator(`#summary-tab-${group}`).click();
      const panel = page.locator(`#summary-panel-${group}`);
      await panel.waitFor({ state: 'visible' });
      assert.equal(await page.locator(`#summary-tab-${group}`).getAttribute('aria-selected'), 'true');
      assert.equal(await panel.getAttribute('aria-labelledby'), `summary-tab-${group}`);
      assert.equal(await panel.locator('.reading-part').count(), expectedSections);
      const sectionDetails = await panel.locator('.reading-part').evaluateAll(sections => sections.every(section => section.querySelector('h3')?.textContent.trim() && section.querySelectorAll('p').length >= 2 && !section.closest('details')));
      assert.ok(sectionDetails, group + ': each section keeps a clear title and its full paragraphs');
      let categoryChecks;
      if (group === 'domains') {
        const basis = page.locator('#summary-domain-basis');
        assert.equal(await basis.getAttribute('open'), null);
        assert.equal(await basis.locator('summary').textContent(), '풀이 기준');
        assert.ok((await basis.locator('p').textContent()).includes('같은 세 장'));
        await basis.locator('summary').click();
        assert.equal(await basis.locator('p').isVisible(), true);
        await basis.locator('summary').click();
        categoryChecks = await inspectDomainCategories('mobile');
      } else assert.equal(await panel.locator('.reading-part:visible').count(), expectedSections, group + ': every main section stays visible');
      const overflow = await overflowState();
      assert.deepEqual(overflow, { document: false, modal: false }, group + ': the mobile reading fits the viewport');
      tarotViews[group] = { sections: expectedSections, overflow };
      if (categoryChecks) tarotViews[group].mobileCategories = categoryChecks;
      await page.screenshot({ path: path.join(artifacts, group === 'problem' ? 'tarot-result-mobile.png' : `tarot-${group}-mobile.png`) });
    }
    assert.ok((await page.locator('#summary-ritual').textContent()).length > 20);
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const group of ['problem', 'timeline', 'domains']) {
      await page.locator(`#summary-tab-${group}`).click();
      if (group === 'domains') tarotViews[group].desktopCategories = await inspectDomainCategories('desktop');
      const overflow = await overflowState();
      assert.deepEqual(overflow, { document: false, modal: false }, group + ': the desktop reading fits the viewport');
      await page.screenshot({ path: path.join(artifacts, group === 'problem' ? 'tarot-result-desktop.png' : `tarot-${group}-desktop.png`) });
    }
    const saju = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
    saju.on('pageerror', error => errors.push(error.message));
    saju.on('response', response => { if (response.status() >= 400) failed.push([response.status(), response.url()]); });
    await saju.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    await saju.goto(new URL('/__saju_fixture', url).href);
    async function selectReadingPage(id) {
      const picker=saju.locator('#reading-page-select');
      if(await picker.locator('option[value="'+id+'"]').count()) await picker.selectOption(id);
      else await saju.locator('a[href="#'+id+'"]:visible').first().click();
      await saju.locator('[data-reader-current][id="'+id+'"]').waitFor({state:'visible'});
    }
    for (const topic of ['lifelong', 'annual', 'monthly', 'all']) {
      await saju.locator('#fixture-topic').selectOption(topic);
      await saju.locator('#report-content[data-ready="' + topic + '"]').waitFor();
      assert.ok(await saju.locator('#reading-page-select option').count()<=60,'the primary picker stays compact');
      assert.equal(await saju.locator('[data-reader-current]').count(),1,'one reading unit is selected');
      const defaultPage=await saju.locator('[data-reader-current]').getAttribute('id');
      const ordered=await saju.locator('.report-chapter').evaluateAll(chapters=>chapters.length>0&&chapters.every(chapter=>chapter.children[0].classList.contains('chapter-title')&&chapter.children[1].classList.contains('chapter-summary')&&chapter.children[2].classList.contains('easy-reading')));
      assert.ok(ordered,topic+': all original calculation chapters remain in their original order');
      if(topic==='lifelong') await saju.screenshot({path:path.join(artifacts,'saju-portrait-mobile.png')});
      if(topic==='monthly') {
        await selectReadingPage('reading-timings');
        assert.equal(await saju.locator('.reader-timing-navigation a:visible').count(),12);
        const comparison=saju.locator('.timing-table-details');
        await comparison.locator('summary').click();
        assert.equal(await comparison.locator('tbody tr').count(),12);
        assert.equal(await saju.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await comparison.scrollIntoViewIfNeeded();
        await saju.screenshot({path:path.join(artifacts,'saju-month-table-mobile.png')});
        await comparison.locator('summary').click();
        await selectReadingPage(defaultPage);
      }
      const personal=topic==='lifelong'||topic==='all';
      const cardId=await saju.locator(personal?'.portrait-card':topic==='monthly'?'[data-reader-current] .reader-card':'.reader-card').first().getAttribute('id');
      await selectReadingPage(cardId);
      const card=saju.locator('[data-reader-current]');
      const readerOrdered=await card.evaluate(element=>element.children[0].matches('.portrait-card-label,.reader-card-label')&&element.children[1].matches('.portrait-card-title,.reader-card-title')&&element.children[2].classList.contains('reader-prose')&&element.children[2].querySelectorAll('p').length>=4);
      assert.ok(readerOrdered,topic+': the selected unit retains topic, conclusion and all paragraphs');
      assert.equal(await saju.locator('.portrait-card:visible,.reader-card:visible').count(),1);
      await card.locator('.reader-detail-link:not(.reading-back-to-picker)').first().click();
      await saju.locator('[data-reader-current]').waitFor({state:'visible'});
      await saju.locator('.reading-pager-step').first().click();
      assert.equal(await saju.locator('[data-reader-current]').getAttribute('id'),cardId);
      assert.equal(await saju.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,topic+': the selected mobile reading fits');
      await saju.locator('.reading-pager').scrollIntoViewIfNeeded();
      await saju.screenshot({path:path.join(artifacts,'saju-'+topic+'-mobile.png')});
      if(topic==='lifelong') {
        await selectReadingPage('reading-daeun');
        const periodHeading=await saju.locator('.daeun-period.is-current .daeun-age').getAttribute('id');
        await saju.locator('.daeun-nav a[href="#'+periodHeading+'"]').click();
        const situationId=await saju.locator('[data-reader-current] .daeun-topic').nth(4).getAttribute('id');
        await selectReadingPage(situationId);
        assert.equal(await saju.locator('.daeun-topic:visible').count(),1);
        assert.equal(await saju.locator('.daeun-dates:visible').count(),1);
        await saju.locator('.reading-pager').scrollIntoViewIfNeeded();
        await saju.screenshot({path:path.join(artifacts,'saju-daeun-contracts-mobile.png')});
      }
    }
    await saju.setViewportSize({width:1280,height:900});
    await saju.locator('#fixture-topic').selectOption('lifelong');
    await saju.locator('#report-content[data-ready="lifelong"]').waitFor();
    await selectReadingPage(await saju.locator('.portrait-card').first().getAttribute('id'));
    await saju.locator('.reading-pager').scrollIntoViewIfNeeded();
    await saju.screenshot({path:path.join(artifacts,'saju-lifelong-desktop.png')});
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    console.log(JSON.stringify({ localPreviewOnly: true, tarotViews, sajuTopics: ['lifelong', 'annual', 'monthly', 'all'], viewport: '390×844 and 1280×900', errors, failed }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
