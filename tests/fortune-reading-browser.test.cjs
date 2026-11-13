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
const sajuFixture = `<!doctype html><html lang="ko" data-reduced-motion="true"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/games/moonlit-tarot/assets/favicon.svg"><link rel="stylesheet" href="/games/starlit-saju/style.css"><link rel="stylesheet" href="/games/starlit-saju/report.css"></head><body><main><section class="result"><label for="fixture-topic">검사할 풀이</label><select id="fixture-topic"><option value="lifelong">평생운</option><option value="annual">올해운</option><option value="monthly">월별운</option></select><div id="report-content"></div></section></main><script type="module">
import { calculateSaju } from '/games/starlit-saju/engine.mjs';
import { analyzeFortune } from '/games/starlit-saju/fortune-data.mjs';
import { buildDetailedReading } from '/games/starlit-saju/readings.mjs';
import { renderDetailedReport } from '/games/starlit-saju/report-view.mjs';
const now = new Date('2026-11-13T00:00:00Z');
const chart = calculateSaju({year:2005,month:12,day:23,hour:8,minute:37},{now});
const fortune = analyzeFortune(chart,{year:2026,now});
const reading = buildDetailedReading(chart,fortune);
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
      assert.ok((await page.locator('#reading-introduction').textContent()).length > 40);
      assert.ok((await page.locator('#reading-title').textContent()).length > 0);
      const paragraphs = await page.locator('#reading-sections > p').allTextContents();
      assert.ok(paragraphs.length >= 7, 'the complete explanation remains visible in shorter paragraphs');
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
    for (const [group, expectedSections] of [['problem', 5], ['timeline', 7], ['domains', 12]]) {
      await page.locator(`#summary-tab-${group}`).click();
      const panel = page.locator(`#summary-panel-${group}`);
      await panel.waitFor({ state: 'visible' });
      assert.equal(await page.locator(`#summary-tab-${group}`).getAttribute('aria-selected'), 'true');
      assert.equal(await panel.getAttribute('aria-labelledby'), `summary-tab-${group}`);
      assert.equal(await panel.locator('.reading-part').count(), expectedSections);
      const sectionDetails = await panel.locator('.reading-part').evaluateAll(sections => sections.every(section => section.querySelector('h3')?.textContent.trim() && section.querySelectorAll('p').length >= 2 && !section.closest('details')));
      assert.ok(sectionDetails, group + ': each section has a clear title and full visible paragraphs');
      if (group === 'domains') {
        const headings = await panel.locator('h3').allTextContents();
        for (const domain of ['건강', '인연', '금전', '학업', '가족', '문서·계약', '악운', '천운', '직업', '운명', '행운', '궁합']) assert.ok(headings.some(title => title.includes(domain)), domain + ': a distinct domain heading is visible');
      }
      const overflow = await page.evaluate(() => ({ document: document.documentElement.scrollWidth > innerWidth, modal: document.querySelector('#result-dialog').scrollWidth > document.querySelector('#result-dialog').clientWidth }));
      assert.deepEqual(overflow, { document: false, modal: false }, group + ': the mobile reading fits the viewport');
      tarotViews[group] = { sections: expectedSections, overflow };
      await page.screenshot({ path: path.join(artifacts, group === 'problem' ? 'tarot-result-mobile.png' : `tarot-${group}-mobile.png`) });
    }
    assert.ok((await page.locator('#summary-ritual').textContent()).length > 20);
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const group of ['problem', 'timeline', 'domains']) {
      await page.locator(`#summary-tab-${group}`).click();
      await page.screenshot({ path: path.join(artifacts, group === 'problem' ? 'tarot-result-desktop.png' : `tarot-${group}-desktop.png`) });
    }
    const saju = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
    saju.on('pageerror', error => errors.push(error.message));
    saju.on('response', response => { if (response.status() >= 400) failed.push([response.status(), response.url()]); });
    await saju.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    await saju.goto(new URL('/__saju_fixture', url).href);
    async function openSajuEvidence() {
      const details = saju.locator('.reading-full-text').first();
      const toggle = details.locator(':scope > summary');
      const chapter = details.locator('.report-chapter').first();
      assert.equal(await details.evaluate(element => element.open), false, 'calculation evidence starts collapsed');
      await toggle.click();
      await chapter.waitFor({ state: 'visible' });
      await toggle.click();
      await chapter.waitFor({ state: 'hidden' });
      assert.equal(await details.evaluate(element => element.open), false, 'the evidence can be collapsed again');
      await toggle.click();
      await chapter.waitFor({ state: 'visible' });
    }
    for (const topic of ['lifelong', 'annual', 'monthly']) {
      await saju.locator('#fixture-topic').selectOption(topic);
      await saju.locator('#report-content[data-ready="' + topic + '"]').waitFor();
      const ordered = await saju.locator('.report-chapter').evaluateAll(chapters => chapters.length > 0 && chapters.every(chapter => chapter.children[0].classList.contains('chapter-title') && chapter.children[1].classList.contains('chapter-summary') && chapter.children[2].classList.contains('easy-reading')));
      assert.ok(ordered, topic + ': title, plain takeaway, then explanation');
      assert.equal(await saju.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, topic + ': mobile report fits the viewport');
      await openSajuEvidence();
      await saju.locator('.report-chapter:visible').first().scrollIntoViewIfNeeded();
      await saju.screenshot({ path: path.join(artifacts, 'saju-' + topic + '-mobile.png') });
    }
    await saju.setViewportSize({ width: 1280, height: 900 });
    await saju.locator('#fixture-topic').selectOption('lifelong');
    await openSajuEvidence();
    await saju.locator('.report-chapter:visible').first().scrollIntoViewIfNeeded();
    await saju.screenshot({ path: path.join(artifacts, 'saju-lifelong-desktop.png') });
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    console.log(JSON.stringify({ localPreviewOnly: true, tarotViews, sajuTopics: ['lifelong', 'annual', 'monthly'], viewport: '390×844 and 1280×900', errors, failed }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
