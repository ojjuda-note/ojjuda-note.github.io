const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..');
const artifacts = path.join(__dirname, 'artifacts', 'fortune-readings');
fs.mkdirSync(artifacts, { recursive: true });
const { chromium } = require('playwright');

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff': 'font/woff' };
// The real entry markup and styles, with account and billing scripts omitted.
const sajuEntryFixture = fs.readFileSync(path.join(repo,'games/starlit-saju/index.html'),'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .replace('<head>','<head><base href="/games/starlit-saju/">');
const compatibilityEntryFixture = fs.readFileSync(path.join(repo,'games/starlit-saju/compatibility.html'),'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .replace('<head>','<head><base href="/games/starlit-saju/">');
// Isolated rendering fixture. It uses production calculation and reading modules
// with a published example date, and never loads authentication or billing code.
const sajuFixture = `<!doctype html><html lang="ko" data-reduced-motion="true"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/games/moonlit-tarot/assets/favicon.svg"><link rel="stylesheet" href="/games/starlit-saju/style.css"><link rel="stylesheet" href="/games/starlit-saju/report.css"><link rel="stylesheet" href="/games/starlit-saju/reading-summary.css"><link rel="stylesheet" href="/games/starlit-saju/reading-score.css"><link rel="stylesheet" href="/games/starlit-saju/readable-design.css"></head><body class="saju-readable"><main><section class="result"><label for="fixture-topic">검사할 풀이</label><select id="fixture-topic"><option value="lifelong">평생운</option><option value="annual">올해운</option><option value="monthly">월별운</option><option value="all">전체 풀이</option></select><div class="detailed-reading" id="report-content"></div></section></main><script type="module">
import { calculateSaju } from '/games/starlit-saju/engine.mjs';
import { analyzeFortune } from '/games/starlit-saju/fortune-data.mjs';
import { analyzeDaeun } from '/games/starlit-saju/daeun.mjs';
import { buildDetailedReading } from '/games/starlit-saju/readings.mjs';
import { renderDetailedReport } from '/games/starlit-saju/report-view.mjs';
const now = new Date('2026-11-13T00:00:00Z');
const fixtureCase = new URLSearchParams(location.search).get('score-case') || 'standard';
const births = {standard:{year:2005,month:12,day:23,hour:8,minute:37},'original-zero':{year:1990,month:5,day:17,hour:8,minute:37},
  'unknown-daeun':{year:1990,month:5,day:17,hour:null,minute:0}};
if (!Object.hasOwn(births,fixtureCase)) throw new Error('Unknown local score fixture');
const chart = calculateSaju(births[fixtureCase],{now});
const fortune = analyzeFortune(chart,{year:2026,now});
const reading = buildDetailedReading(chart,fortune,{daeun:analyzeDaeun(chart,{gender:'female',now})});
// Test-only model references let the browser compare rendered values with the
// actual source reading. Nothing is added to the public app or result DOM.
globalThis.__sajuScoreFixture = {key:fixtureCase,birth:births[fixtureCase],nativeInteractionCount:fortune.profile.interactions.length,
  daeun:{natalTimeKnown:chart.timeKnown,natalHour:chart.input.hour,available:reading.daeun.available,timeAssumed:reading.daeun.timeAssumed,
    assumedBirthTime:reading.daeun.assumedBirthTime,notice:reading.daeun.birthTimeNotice,periodCount:reading.daeun.periods.length,
    currentPeriodLabel:reading.daeun.periods.find(period=>period.isCurrent)?.periodLabel},
  items:[{key:'portrait-overview',selector:'.portrait-intro',reading:reading.personPortrait},
    {key:'portrait-decisions',selector:'.portrait-card[data-portrait-card="portrait-decisions"]',reading:reading.personPortrait.cards.find(item=>item.id==='portrait-decisions')},
    {key:'lifelong-overview',selector:'#reading-lifelong-summary .reader-intro',reading:reading.reader.lifelong}]};
const target = document.getElementById('report-content');
const select = document.getElementById('fixture-topic');
function show(){
  const content=document.createElement('div');
  renderDetailedReport(content,{reading,fortune,topic:select.value});
  target.replaceChildren(content);target.dataset.ready=select.value;
}
select.addEventListener('change',show);show();
</script></body></html>`;
const compatibilityFixture = `<!doctype html><html lang="ko" data-reduced-motion="true"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/games/moonlit-tarot/assets/favicon.svg"><link rel="stylesheet" href="/games/starlit-saju/style.css"><link rel="stylesheet" href="/games/starlit-saju/report.css"><link rel="stylesheet" href="/games/starlit-saju/compatibility.css"><link rel="stylesheet" href="/games/starlit-saju/readable-design.css"></head><body class="saju-readable"><main class="compatibility-main"><section class="result"><label for="fixture-pair">검사할 두 사람</label><select id="fixture-pair"><option value="confirmed">말띠와 양띠</option><option value="uncertain">입춘일 · 시간 모름</option></select><p id="fixture-zodiac" class="birth-summary"></p><div class="detailed-reading" id="report-content"></div></section></main><script type="module">
import { calculateSaju } from '/games/starlit-saju/engine.mjs';
import { buildCompatibilityReading } from '/games/starlit-saju/compatibility.mjs';
import { renderCompatibilityReport } from '/games/starlit-saju/report-view.mjs';
const now = new Date('2026-11-13T00:00:00Z');
const partner = calculateSaju({year:1991,month:5,day:10,hour:9,minute:0},{now});
const target = document.getElementById('report-content');
const select = document.getElementById('fixture-pair');
function show(){
  const birth = select.value === 'confirmed' ? {year:1990,month:5,day:10,hour:9,minute:0} : {year:2024,month:2,day:4,hour:null};
  const reading = buildCompatibilityReading(calculateSaju(birth,{now}),partner);
  document.getElementById('fixture-zodiac').textContent = reading.zodiac.self.label + ' · ' + reading.zodiac.partner.label + ' · 사주 기준 · 입춘';
  const content=document.createElement('div');
  renderCompatibilityReport(content,reading,{names:[{name:'길게 입력한 첫 번째 예시 이름'},{name:'길게 입력한 두 번째 예시 이름'}]});
  target.replaceChildren(...content.childNodes);
  target.dataset.ready=select.value;
}
select.addEventListener('change',show);show();
</script></body></html>`;
const server = http.createServer((request, response) => {
  let name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (name === '/__saju_entry_fixture') { response.writeHead(200, { 'content-type': mime['.html'] }); response.end(sajuEntryFixture); return; }
  if (name === '/__compatibility_entry_fixture') { response.writeHead(200, { 'content-type': mime['.html'] }); response.end(compatibilityEntryFixture); return; }
  if (name === '/__saju_fixture') { response.writeHead(200, { 'content-type': mime['.html'] }); response.end(sajuFixture); return; }
  if (name === '/__compatibility_fixture') { response.writeHead(200, { 'content-type': mime['.html'] }); response.end(compatibilityFixture); return; }
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
    const revealedNames = [];
    for (const [slot, index] of [2, 4, 3].entries()) {
      await page.locator(`.card[data-index="${index}"]`).click();
      await page.locator('#reading-dialog[open]').waitFor();
      assert.ok((await page.locator('#reading-position').textContent()).endsWith(roles[slot]));
      assert.ok((await page.locator('#reading-introduction').textContent()).length > 20);
      assert.ok((await page.locator('#reading-title').textContent()).length > 0);
      const paragraphs = await page.locator('#reading-sections > p').allTextContents();
      assert.ok(paragraphs.length >= 5, 'card meaning, topic, position, example and caution remain detailed; actions continue in the combined view');
      assert.ok(paragraphs.every(text => text.trim().length > 20));
      assert.ok(paragraphs.join('').length >= 350, 'the individual reading remains detailed');
      assert.equal(await page.locator('#reading-sections h3').count(), 0);
      const cardName = await page.locator('#reading-title').textContent();
      revealedNames.push(cardName);
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
    const solutionSummary = page.locator('#summary-panel-problem [data-section-id="solution"] > .reading-two-line-summary');
    assert.equal(await solutionSummary.locator('.reading-summary-line').count(), 2, 'the direct reading keeps two complete summary sentences');
    const solutionLines = await solutionSummary.locator('.reading-summary-line').allTextContents();
    assert.ok(solutionLines.every(line => /[.!?]$/u.test(line.trim())), 'the reason and the action remain complete sentences');
    assert.notEqual(solutionLines[0], solutionLines[1], 'the action does not merely repeat the explanation');
    assert.equal(await page.locator('#summary-panel-problem > .reading-part').first().getAttribute('data-section-id'), 'together', 'the person’s combined story comes before the action sections');
    assert.equal((await page.locator('#summary-panel-problem [data-section-id="possible-outcome"] h3').textContent()).replace(/^\d+\s*/u, ''), '대처 뒤 확인할 변화', 'the outcome is presented as a change to check after acting');
    assert.match(await page.locator('#summary-panel-problem [data-section-id="problem-now"] .reading-summary-full').textContent(), /카드가 짚는 핵심 문제야/, 'the full explanation states the reading directly');
    const tarotViews = {};
    const domainCategories = [['self', 5], ['timeline', 5], ['solutions', 5], ['love', 7], ['family', 4], ['career', 5], ['study', 5], ['money', 5], ['wellbeing', 4], ['opportunities', 5]];
    const captureCategories = new Set(['self', 'love', 'money', 'wellbeing']);
    const overflowState = () => page.evaluate(() => ({ document: document.documentElement.scrollWidth > innerWidth, modal: document.querySelector('#result-dialog').scrollWidth > document.querySelector('#result-dialog').clientWidth }));
    async function inspectUnclippedSummaries(scope, label) {
      const geometry = await scope.locator('.reading-summary-line:visible').evaluateAll(lines => lines.map(line => {
        const style = getComputedStyle(line);
        return { text: line.textContent.trim(), fits: line.scrollWidth <= line.clientWidth + 1 && line.scrollHeight <= line.clientHeight + 1,
          wraps: style.whiteSpace !== 'nowrap', clamp: style.webkitLineClamp, overflow: style.textOverflow };
      }));
      assert.ok(geometry.length >= 2, label + ': both summary meaning units are visible');
      assert.ok(geometry.every(line => line.text && line.fits && line.wraps && ['none', '', 'unset'].includes(line.clamp) && line.overflow !== 'ellipsis'), label + ': complete sentences wrap naturally without clipping or an ellipsis');
    }
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
        assert.equal(await visible.locator(':scope > .reading-two-line-summary > .reading-summary-line:visible').count(), count * 2, category + ': every topic starts with its own two-line summary');
        assert.equal(await visible.locator('.reading-summary-full:visible').count(), 0, category + ': full explanations remain folded until requested');
        assert.ok(await visible.locator('.reading-card-name:visible').count() > 0, category + ': actual card names remain easy to find');
        await inspectUnclippedSummaries(visible, category + ' ' + viewport);
        const overflow = await overflowState();
        assert.deepEqual(overflow, { document: false, modal: false }, category + ': the ' + viewport + ' reading fits');
        checks.push({ category, count, overflow });
        if (captureCategories.has(category)) await page.screenshot({ path: path.join(artifacts, `tarot-domains-${category}-${viewport}.png`) });
      }
      assert.equal(firstNumber, 51, 'all fifty topics were reached through the native selector');
      await select.selectOption('self');
      return checks;
    }
    async function inspectPersonal(viewport) {
      await page.locator('#summary-tab-personal').click();
      const panel = page.locator('#summary-panel-personal');
      await panel.waitFor({ state: 'visible' });
      assert.equal(await page.locator('#result-context-select option').count(), 4, 'the money topic has three scoped situations');
      await page.locator('#result-context-select').selectOption('money-spending');
      const reading = page.locator('#personal-reading');
      const paragraphs = await reading.locator('.personal-card-guides .reading-part').allTextContents();
      assert.equal(paragraphs.length, 3);
      for (let i = 0; i < 3; i++) assert.ok(paragraphs[i].includes(revealedNames[i]), 'personal guidance keeps the actual reveal order');
      assert.ok((await page.locator('#personal-card-connections').textContent()).length > 300);
      assert.equal(await reading.locator('.personal-card-guides .reading-summary-line:visible, .personal-card-connections .reading-summary-line:visible').count(), 8, 'three roles and their connection each show two summary lines');
      assert.equal(await reading.locator('.personal-card-guides .reading-summary-full:visible, .personal-card-connections .reading-summary-full:visible').count(), 0);
      assert.equal(await page.locator('#personal-basis').getAttribute('open'), null);
      assert.equal(await page.locator('#personal-followups details').count(), 3);
      await page.locator('#result-context-select').scrollIntoViewIfNeeded();
      assert.deepEqual(await overflowState(), { document: false, modal: false }, 'personal ' + viewport + ': no horizontal overflow');
      await page.screenshot({ path: path.join(artifacts, `tarot-personal-${viewport}.png`) });
      await page.locator('#personal-comparison > summary').click();
      assert.equal(await page.locator('#personal-comparison .personal-choice:visible').count(), 2);
      assert.equal(await page.locator('.personal-comparison-basis .reading-summary-line:visible').count(), 2, 'the card-based comparison criteria have their own overview');
      assert.equal(await page.locator('.personal-choice > .reading-two-line-summary > .reading-summary-line:visible').count(), 4, 'both choices preview their gain and burden');
      assert.equal(await page.locator('#personal-comparison dt:visible').count(), 0, 'each choice keeps its original detailed criteria folded');
      await inspectUnclippedSummaries(page.locator('#personal-comparison'), 'comparison ' + viewport);
      await page.locator('#personal-comparison > summary').scrollIntoViewIfNeeded();
      assert.deepEqual(await overflowState(), { document: false, modal: false }, 'comparison ' + viewport + ': no horizontal overflow');
      await page.screenshot({ path: path.join(artifacts, `tarot-comparison-${viewport}.png`) });
      for (const choice of await page.locator('#personal-comparison .personal-choice').all()) {
        await choice.locator('.reading-summary-details > summary').click();
        assert.equal(await choice.locator('dt:visible').count(), 3, 'expanding a choice shows gain, burden and preparation');
      }
      assert.equal(await page.locator('#personal-comparison dt:visible').count(), 6);
      assert.deepEqual(await page.locator('#personal-comparison dt:visible').allTextContents(), ['이 선택의 장점', '감수할 부담', '먼저 준비할 것', '이 선택의 장점', '감수할 부담', '먼저 준비할 것']);
      const following = page.locator('#personal-followups details').first();
      assert.equal(await following.getAttribute('open'), null);
      assert.equal(await following.locator('summary .reading-summary-line:visible').count(), 2, 'a closed follow-up already previews its actual answer');
      assert.equal(await following.locator('.personal-answer').isVisible(), false);
      await following.locator('summary').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(artifacts, `tarot-followup-summary-${viewport}.png`) });
      await following.locator('summary').click();
      await following.scrollIntoViewIfNeeded();
      assert.ok((await following.locator('.personal-answer').textContent()).length > 100);
      assert.deepEqual(await overflowState(), { document: false, modal: false }, 'follow-up ' + viewport + ': no horizontal overflow');
      await page.screenshot({ path: path.join(artifacts, `tarot-followup-${viewport}.png`) });
      const firstText = await reading.textContent();
      await page.locator('#result-context-select').selectOption('money-saving');
      assert.notEqual(await reading.textContent(), firstText, 'changing situations changes the substantive guidance');
      await page.locator('#result-context-select').selectOption('money-agreement');
      assert.notEqual(await reading.textContent(), firstText);
      tarotViews.personal = { situations: 3, revealedNames, mobile: true, desktop: viewport === 'desktop' };
    }
    for (const [group, expectedSections] of [['problem', 5], ['timeline', 7], ['domains', 50]]) {
      await page.locator(`#summary-tab-${group}`).click();
      const panel = page.locator(`#summary-panel-${group}`);
      await panel.waitFor({ state: 'visible' });
      assert.equal(await page.locator(`#summary-tab-${group}`).getAttribute('aria-selected'), 'true');
      assert.equal(await panel.getAttribute('aria-labelledby'), `summary-tab-${group}`);
      assert.equal(await panel.locator('.reading-part').count(), expectedSections);
      const sectionDetails = await panel.locator('.reading-part').evaluateAll(sections => sections.every(section => {
        const overview = section.querySelector(':scope > .reading-two-line-summary');
        const details = section.querySelector(':scope > .reading-summary-details');
        return section.querySelector('h3')?.textContent.trim() && overview?.querySelectorAll('.reading-summary-line').length === 2
          && [...overview.children].every(line => line.textContent.trim()) && !overview.closest('details')
          && details && !details.open && details.querySelector('summary')?.textContent === '자세히 읽기'
          && details.querySelectorAll('.reading-summary-full p').length >= 2 && !section.closest('details');
      }));
      assert.ok(sectionDetails, group + ': every title and two-line overview precede the intact folded explanation');
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
      const firstSection = panel.locator('.reading-part:visible').first();
      const firstDetail = firstSection.locator(':scope > .reading-summary-details');
      const originalText = await firstDetail.locator('.reading-summary-full').textContent();
      assert.equal(await firstDetail.locator('.reading-summary-full').isVisible(), false);
      await firstDetail.locator('summary').focus();
      await firstDetail.locator('summary').press('Enter');
      assert.equal(await firstDetail.locator('.reading-summary-full').isVisible(), true, group + ': keyboard Enter opens the original explanation');
      assert.equal(await firstDetail.locator('.reading-summary-full').textContent(), originalText, group + ': expanding changes no original text');
      if (group === 'problem') await page.screenshot({ path: path.join(artifacts, 'tarot-summary-expanded-mobile.png') });
      await firstDetail.locator('summary').press('Space');
      assert.equal(await firstDetail.locator('.reading-summary-full').isVisible(), false, group + ': keyboard Space folds the explanation again');
      await inspectUnclippedSummaries(panel, group + ' mobile');
      await firstSection.locator('.reading-two-line-summary').scrollIntoViewIfNeeded();
      const overflow = await overflowState();
      assert.deepEqual(overflow, { document: false, modal: false }, group + ': the mobile reading fits the viewport');
      tarotViews[group] = { sections: expectedSections, overflow };
      if (categoryChecks) tarotViews[group].mobileCategories = categoryChecks;
      await page.screenshot({ path: path.join(artifacts, group === 'problem' ? 'tarot-result-mobile.png' : `tarot-${group}-mobile.png`) });
      if (group === 'problem') await page.screenshot({ path: path.join(artifacts, 'tarot-summary-mobile.png') });
    }
    assert.ok((await page.locator('#summary-ritual').textContent()).length > 20);
    await inspectPersonal('mobile');
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const group of ['problem', 'timeline', 'domains']) {
      await page.locator(`#summary-tab-${group}`).click();
      if (group === 'domains') tarotViews[group].desktopCategories = await inspectDomainCategories('desktop');
      const overflow = await overflowState();
      assert.deepEqual(overflow, { document: false, modal: false }, group + ': the desktop reading fits the viewport');
      await inspectUnclippedSummaries(page.locator(`#summary-panel-${group}`), group + ' desktop');
      await page.screenshot({ path: path.join(artifacts, group === 'problem' ? 'tarot-result-desktop.png' : `tarot-${group}-desktop.png`) });
      if (group === 'problem') await page.screenshot({ path: path.join(artifacts, 'tarot-summary-desktop.png') });
    }
    await inspectPersonal('desktop');
    await page.setViewportSize({ width: 320, height: 844 });
    await page.locator('#summary-tab-problem').click();
    await inspectUnclippedSummaries(page.locator('#summary-panel-problem'), 'small phone');
    assert.deepEqual(await overflowState(), { document: false, modal: false }, 'complete summary sentences fit a 320px phone without cropping');
    await page.locator('#summary-panel-problem .reading-two-line-summary').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts, 'tarot-summary-small-phone.png') });
    const saju = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
    saju.on('pageerror', error => errors.push(error.message));
    saju.on('response', response => { if (response.status() >= 400) failed.push([response.status(), response.url()]); });
    await saju.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    const sajuEntryViews={},compatibilityEntryViews={},sajuNavigation={},sajuReadableViews={};
    async function inspectReadableSurface(label,{text,body='',minimumBody=18,controls='',placeholders=false}={}) {
      const view=await saju.evaluate(({text,body,minimumBody,controls,placeholders})=>{
        const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
        const context=canvas.getContext('2d',{willReadFrequently:true});
        const rgba=value=>{
          context.clearRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);
          const values=[...context.getImageData(0,0,1,1).data];values[3]/=255;return values;
        };
        const over=(front,back)=>{
          const alpha=front[3]+back[3]*(1-front[3]);
          if(alpha===0)return [0,0,0,0];
          return [...front.slice(0,3).map((value,index)=>(value*front[3]+back[index]*back[3]*(1-front[3]))/alpha),alpha];
        };
        const luminance=color=>color.slice(0,3).map(value=>value/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4)
          .reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
        const ratio=(a,b)=>{const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);};
        const shown=element=>{
          const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
          return rect.width>1&&rect.height>1&&!element.closest('[hidden],.reading-slide-outgoing')&&style.visibility!=='hidden'&&style.display!=='none';
        };
        function sample(element,pseudo=null) {
          const style=getComputedStyle(element,pseudo),images=[];
          let foreground=rgba(style.color),background=[0,0,0,0];
          if(pseudo)foreground[3]*=Number(style.opacity);
          // Compare a text pixel with its adjacent background through each
          // ancestor's paint group. This resolves transparent surfaces and
          // group opacity together; a visible gradient is never guessed.
          for(let parent=element;parent;parent=parent.parentElement) {
            const parentStyle=getComputedStyle(parent),color=rgba(parentStyle.backgroundColor);
            if(background[3]<.999&&parentStyle.backgroundImage!=='none')images.push(parent.id||parent.className||parent.tagName);
            foreground=over(foreground,color);background=over(background,color);
            const opacity=Number(parentStyle.opacity);foreground[3]*=opacity;background[3]*=opacity;
          }
          foreground=over(foreground,[255,255,255,1]);background=over(background,[255,255,255,1]);
          const content=pseudo==='::placeholder'?element.getAttribute('placeholder'):pseudo?style.content:element.textContent;
          return {target:(element.id||element.className||element.tagName)+(pseudo||''),
            text:String(content??'').trim().slice(0,70),
            contrast:ratio(foreground,background),font:parseFloat(style.fontSize),images,
            lineClamp:style.webkitLineClamp,textOverflow:style.textOverflow,overflow:element.clientWidth>0&&element.scrollWidth>element.clientWidth+1.5};
        }
        const nodes=[...document.querySelectorAll(text)].filter(element=>shown(element)&&element.textContent.trim()&&!element.closest(':disabled'));
        const samples=nodes.map(element=>sample(element));
        if(placeholders)for(const element of document.querySelectorAll('input[placeholder]'))if(shown(element)&&!element.value&&!element.disabled)samples.push(sample(element,'::placeholder'));
        for(const element of document.querySelectorAll('.daeun-period-summary'))if(shown(element)) {
          const style=getComputedStyle(element,'::after');
          if(!['none','normal','""',''].includes(style.content)&&style.display!=='none'&&style.visibility!=='hidden')samples.push(sample(element,'::after'));
        }
        const prose=body?[...document.querySelectorAll(body)].filter(shown).map(element=>({target:element.className,font:parseFloat(getComputedStyle(element).fontSize)})):[];
        const targets=controls?[...document.querySelectorAll(controls)].filter(shown).map(element=>{const box=element.getBoundingClientRect();return {target:element.id||element.className,height:box.height,width:box.width};}):[];
        return {samples: samples.length,minimumContrast:Math.min(...samples.map(item=>item.contrast)),
          contrastFailures:samples.filter(item=>item.contrast<4.5),unresolvedBackgrounds:samples.filter(item=>item.images.length),
          smallText:samples.filter(item=>item.font<14),clippedText:samples.filter(item=>item.overflow||item.textOverflow==='ellipsis'||!['none','','unset'].includes(item.lineClamp)),
          prose,smallProse:prose.filter(item=>item.font<minimumBody),smallTargets:targets.filter(item=>item.height<43.9||item.width<43.9),
          minimumTargetHeight:targets.length?Math.min(...targets.map(item=>item.height)):null,
          horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
          inputs:[...document.querySelectorAll('input[type=text],input[type=number],select')].filter(shown).map(element=>({id:element.id,font:parseFloat(getComputedStyle(element).fontSize),scheme:getComputedStyle(element).colorScheme}))};
      },{text,body,minimumBody,controls,placeholders});
      assert.ok(view.samples>0,label+': representative text is visible');
      assert.deepEqual(view.unresolvedBackgrounds,[],label+': contrast uses the actual solid surfaces behind text');
      assert.deepEqual(view.contrastFailures,[],label+': text contrast is at least 4.5:1');
      assert.deepEqual(view.smallText,[],label+': labels and explanatory text are at least 14px');
      assert.deepEqual(view.clippedText,[],label+': complete text remains visible without clamping or horizontal clipping');
      if(body)assert.ok(view.prose.length>0,label+': the full reading body remains present');
      assert.deepEqual(view.smallProse,[],label+': reading text follows the normal/large size');
      assert.deepEqual(view.smallTargets,[],label+': actionable controls have at least a 44px touch target');
      assert.equal(view.horizontalOverflow,false,label+': the redesigned page stays inside the viewport');
      assert.ok(view.inputs.every(input=>input.font>=16&&input.scheme==='light'),label+': readable input text and native menus use the light surface');
      sajuReadableViews[label]={samples:view.samples,minimumContrast:view.minimumContrast,minimumBodyFont:view.prose.length?Math.min(...view.prose.map(item=>item.font)):null,minimumTargetHeight:view.minimumTargetHeight};
      return view;
    }
    const entryText='h1,h2,.intro-description,.compatibility-intro>p,.entry-benefits li,.entry-steps li,.form-step-title,.field-label,fieldset legend,.field-hint,.form-note,.saju-price-note,.saju-price strong,.product-option strong,.product-option small,.product-option b,.check-row span,.reading-service-nav strong,.reading-service-nav>a>span,.method-preview summary,button:not(:disabled),.back-link,.segmented span,.pair-calendar>label,.pair-privacy';
    const entryControls='button,input[type=text],input[type=number],select,.check-row,.segmented label,.product-options>label,.reading-service-nav>a,.header-nav .back-link';
    const readingText='.reading-pager-label,.reading-page-position,.reading-swipe-hint,.reader-label,.reader-headline,.reader-card-title,.reader-prose p,.saju-summary-line,.saju-reading-score-title,.saju-reading-score-scale,.saju-wind-label,.saju-wind-value,.saju-reading-score-notice,.saju-reading-score-unavailable,.saju-reading-score-reason,.daeun-age,.daeun-dates,.daeun-time-notice,.daeun-sequence-note,.reading-summary-table th,.reading-summary-table td';
    const compatibilityText='.reading-pager-label,.reading-page-position,.reading-swipe-hint,.compatibility-people-title,.compatibility-person-name,.compatibility-summary-line,.compatibility-person-prose p,.compatibility-person-scope,.compatibility-synthesis-people,.compatibility-score-heading h4,.compatibility-score-heading>p,.compatibility-score-eyebrow,.compatibility-score-number strong,.compatibility-score-number>span,.compatibility-score-number small,.compatibility-score-label,.compatibility-score-summary,.compatibility-score-item-heading h5,.compatibility-score-item-value,.compatibility-score-item-summary,.compatibility-score-notice';
    await saju.goto(new URL('/__saju_entry_fixture',url).href);
    for(const [viewport,size] of [['phone-small',{width:320,height:844}],['phone',{width:390,height:844}],['desktop',{width:1280,height:900}]]) {
      await saju.setViewportSize(size);
      const geometry=await saju.locator('#birth-form').evaluate(form=>{
        const shown=element=>element.getBoundingClientRect().width>0&&element.getBoundingClientRect().height>0;
        const fonts=selector=>Array.from(form.querySelectorAll(selector)).filter(shown).map(element=>({id:element.id||element.className,size:parseFloat(getComputedStyle(element).fontSize)}));
        const gender=form.querySelector('#person-gender'),style=getComputedStyle(gender);
        const measure=document.createElement('canvas').getContext('2d');
        measure.font=style.fontWeight+' '+style.fontSize+' '+style.fontFamily;
        const selectedText=gender.selectedOptions[0].textContent;
        return {inputs:fonts('input[type=number],input[type=text],select'),notices:fonts('.field-hint,.form-note'),
          gender:{label:selectedText,textWidth:measure.measureText(selectedText).width,
            availableWidth:gender.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-16},
          checks:Array.from(form.querySelectorAll('.check-row')).filter(shown).map(element=>element.getBoundingClientRect().height),
          overflow:document.documentElement.scrollWidth>innerWidth||form.scrollWidth>form.clientWidth+1};
      });
      assert.ok(geometry.inputs.length>=5&&geometry.inputs.every(field=>field.size>=16),viewport+': birth inputs remain at least 16px');
      assert.ok(geometry.notices.length>=4&&geometry.notices.every(field=>field.size>=13),viewport+': birth assumptions and privacy notes remain at least 13px');
      assert.ok(geometry.checks.length>0&&geometry.checks.every(height=>height>=44),viewport+': unknown-time controls have a 44px touch target');
      assert.equal(geometry.overflow,false,viewport+': larger entry text keeps the form within the viewport');
      assert.ok(geometry.gender.textWidth<=geometry.gender.availableWidth,viewport+': the default gender label fits beside the native select arrow');
      sajuEntryViews[viewport]=geometry;
      await inspectReadableSurface('general entry '+viewport,{text:entryText,controls:entryControls,placeholders:true});
      const visibleLabels=await saju.locator('#birth-form .person-inputs .field-label,#birth-form .date-inputs .field-label').evaluateAll(nodes=>nodes.filter(node=>{
        const box=node.getBoundingClientRect();return box.width>1&&box.height>1;
      }).length);
      assert.equal(visibleLabels,5,viewport+': name, gender, year, month and day have visible labels');
      if(viewport==='phone-small')await saju.locator('.birth-panel').screenshot({path:path.join(artifacts,'saju-entry-phone-small.png')});
      if(viewport!=='phone') {
        await saju.evaluate(()=>window.scrollTo(0,0));
        await saju.screenshot({path:path.join(artifacts,'saju-readable-entry-general-'+viewport+'-top.png')});
        await saju.screenshot({path:path.join(artifacts,'saju-readable-entry-general-'+viewport+'.png'),fullPage:true});
      }
    }
    const selectedProduct=saju.locator('input[name="entry-topic"][value="annual"]');
    await selectedProduct.focus();await selectedProduct.press('Space');
    assert.equal(await selectedProduct.isChecked(),true,'a keyboard choice selects the requested reading');
    const optionStyles=await saju.locator('#entry-product-picker .product-option').evaluateAll(options=>options.slice(0,2).map(option=>{
      const style=getComputedStyle(option);return [style.backgroundColor,style.backgroundImage,style.borderColor,style.borderWidth,style.boxShadow];
    }));
    assert.notDeepEqual(optionStyles[0],optionStyles[1],'the selected product has a visible boundary or surface distinct from another choice');
    await saju.locator('#birth-year').focus();await saju.locator('#birth-year').press('Tab');
    assert.equal(await saju.evaluate(()=>document.activeElement?.id),'birth-month','birth fields keep their keyboard reading order');
    assert.ok(await saju.locator('#birth-month').evaluate(element=>parseFloat(getComputedStyle(element).outlineWidth)>=2),'the focused birth field has a visible outline');
    await saju.evaluate(()=>{
      const error=document.getElementById('form-error');error.textContent='입력한 생년월일을 확인해 주세요.';error.hidden=false;
      document.getElementById('payment-status').textContent='선택한 풀이와 금액을 확인해 주세요.';
      document.getElementById('open-story').disabled=false;
    });
    await inspectReadableSurface('general entry feedback',{text:'#form-error,#payment-status,#open-story'});
    await saju.goto(new URL('/__compatibility_entry_fixture',url).href);
    for(const [viewport,size] of [['phone-small',{width:320,height:844}],['phone',{width:390,height:844}],['desktop',{width:1280,height:900}]]) {
      await saju.setViewportSize(size);
      const view=await inspectReadableSurface('compatibility entry '+viewport,{text:entryText,controls:entryControls,placeholders:true});
      const geometry=await saju.locator('.compatibility-person').evaluateAll(people=>people.map(person=>{
        const box=person.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom};
      }));
      assert.equal(geometry.length,2,'the compatibility form keeps both A and B');
      assert.ok(geometry.every(person=>person.left>=-1&&person.right<=size.width+1),'both birth forms fit the screen');
      if(viewport==='desktop')assert.ok(geometry[1].left>=geometry[0].right-1,'desktop aligns A/B input forms beside each other');
      else assert.ok(geometry[1].top>=geometry[0].bottom-1,'phone input keeps A then B in a single reading order');
      assert.equal(await saju.locator('#compatibility-price').textContent(),'궁합 · 20쭈','the redesign preserves the separate compatibility price');
      compatibilityEntryViews[viewport]={minimumContrast:view.minimumContrast,inputs:view.inputs.length,geometry};
      if(viewport!=='phone') {
        await saju.evaluate(()=>window.scrollTo(0,0));
        await saju.screenshot({path:path.join(artifacts,'saju-readable-entry-compatibility-'+viewport+'-top.png')});
        await saju.screenshot({path:path.join(artifacts,'saju-readable-entry-compatibility-'+viewport+'.png'),fullPage:true});
      }
    }
    await saju.evaluate(()=>{
      const error=document.getElementById('compatibility-error');error.textContent='두 사람의 생년월일을 확인해 주세요.';error.hidden=false;
      document.getElementById('compatibility-status').textContent='입력한 정보를 확인해 주세요.';
      document.getElementById('compatibility-open').disabled=false;
    });
    await inspectReadableSurface('compatibility entry feedback',{text:'#compatibility-error,#compatibility-status,#compatibility-open'});
    await saju.setViewportSize({width:390,height:844});
    await saju.goto(new URL('/__saju_fixture', url).href);
    assert.equal(await saju.locator('#report-content > [data-reader-paged="true"]').count(),1,'the prepared report keeps its mounted pager host when attached after purchase');
    async function inspectReadingControls(label,pickerId,currentAttribute) {
      const picker=saju.locator('#'+pickerId),current=saju.locator('['+currentAttribute+']');
      const options=await picker.locator('option').evaluateAll(nodes=>nodes.map(node=>node.value));
      await picker.selectOption(options[0]);await picker.focus();
      for(const id of options.slice(1,3)) {
        await picker.press('ArrowDown');
        assert.equal(await picker.inputValue(),id,label+': consecutive arrow keys select consecutive entries');
        assert.equal(await current.getAttribute('id'),id);
        assert.equal(await picker.evaluate(element=>element===document.activeElement),true,label+': the picker retains keyboard focus');
      }
      const controls=picker.locator('..').locator('.reading-pager-step'),previous=controls.first(),next=controls.last();
      const start=await current.getAttribute('id');
      await next.focus();
      for(let step=0;step<2;step++) {
        const before=await current.getAttribute('id');await next.press('Enter');
        assert.notEqual(await current.getAttribute('id'),before);
        assert.equal(await next.evaluate(element=>element===document.activeElement),true,label+': repeated next presses keep focus on the button');
      }
      await previous.focus();await previous.press('Enter');await previous.press('Enter');
      assert.equal(await current.getAttribute('id'),start);
      assert.equal(await previous.evaluate(element=>element===document.activeElement),true,label+': repeated previous presses keep focus on the button');
      const sizes=await picker.locator('..').locator('select,button').evaluateAll(nodes=>nodes.map(element=>element.getBoundingClientRect().height));
      assert.ok(sizes.every(height=>height>=44),label+': pager controls remain large enough to tap');
      assert.ok(await previous.evaluate(element=>parseFloat(getComputedStyle(element).outlineWidth)>=2),label+': the focused control keeps a visible outline');
      sajuNavigation[label]={arrowChoices:2,nextSteps:2,previousSteps:2,minimumControlHeight:Math.min(...sizes)};
      await picker.selectOption(options[0]);
    }
    await inspectReadingControls('general','reading-page-select','data-reader-current');
    async function selectReadingPage(id) {
      const picker=saju.locator('#reading-page-select');
      if(await picker.locator('option[value="'+id+'"]').count()) await picker.selectOption(id);
      else await saju.locator('a[href="#'+id+'"]:visible').first().click();
      await saju.locator('[data-reader-current][id="'+id+'"]').waitFor({state:'visible'});
    }
    const sajuScoreViews={},sajuScoreRegressions={},sajuDaeunAssumptionViews={};
    async function inspectSajuScores(label) {
      const panels=await saju.locator('[data-reader-current] .saju-reading-score:visible').evaluateAll(elements=>elements.map(panel=>{
        const box=panel.getBoundingClientRect();
        const contained=(inner,outer)=>inner.left>=outer.left-1&&inner.right<=outer.right+1&&inner.top>=outer.top-1&&inner.bottom<=outer.bottom+1;
        const fits=element=>{
          const rect=element.getBoundingClientRect();
          if(element.scrollWidth>element.clientWidth+1||element.scrollHeight>element.clientHeight+1)return false;
          for(let parent=element.parentElement;parent&&parent!==document.body;parent=parent.parentElement) {
            const style=getComputedStyle(parent),bounds=parent.getBoundingClientRect();
            if((/hidden|clip/.test(style.overflowX)&&(rect.left<bounds.left-1||rect.right>bounds.right+1))||
              (/hidden|clip/.test(style.overflowY)&&(rect.top<bounds.top-1||rect.bottom>bounds.bottom+1)))return false;
          }
          return ['none','','unset'].includes(getComputedStyle(element).webkitLineClamp)&&getComputedStyle(element).textOverflow!=='ellipsis';
        };
        const rows=Array.from(panel.querySelectorAll('.saju-wind-item')).map(row=>{
          const meter=row.querySelector('.saju-wind-meter'),fill=meter.querySelector('.saju-wind-fill'),style=getComputedStyle(meter);
          const track=meter.getBoundingClientRect(),filled=fill.getBoundingClientRect(),value=Number(meter.getAttribute('aria-valuenow'));
          const width=meter.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
          const name=meter.getAttribute('aria-label')||(meter.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ');
          return {key:row.dataset.wind,name,role:meter.getAttribute('role'),value,min:Number(meter.getAttribute('aria-valuemin')),max:Number(meter.getAttribute('aria-valuemax')),
            text:row.textContent,visible:track.width>0&&track.height>0,inside:contained(track,box)&&contained(filled,track),
            exact:fill.style.width===value+'%'&&Math.abs(filled.width-width*value/100)<=2};
        });
        return {status:panel.dataset.readingScoreStatus,rows,meters:panel.querySelectorAll('[role="meter"]').length,
          reason:panel.querySelector('.saju-reading-score-reason')?.textContent.trim(),
          inside:box.left>=-1&&box.right<=innerWidth+1,
          overflow:panel.scrollWidth>panel.clientWidth+1||panel.scrollHeight>panel.clientHeight+1,
          textFits:Array.from(panel.querySelectorAll('p,.saju-wind-label,.saju-wind-value')).every(fits)};
      }));
      assert.ok(panels.length>0,label+': every selected reading declares its score or unavailable reason');
      for(const panel of panels) {
        assert.ok(panel.inside&&!panel.overflow&&panel.textFits,label+': complete score labels, numbers and notices fit without clipping');
        if(panel.status==='unavailable') {
          assert.equal(panel.meters,0,label+': unsupported items have no numeric meters');
          assert.equal(panel.rows.length,0);assert.ok(panel.reason);
          continue;
        }
        assert.equal(panel.status,'available');assert.equal(panel.meters,2);
        assert.deepEqual(panel.rows.map(row=>row.key),['tailwind','headwind']);
        for(const row of panel.rows) {
          assert.ok(Number.isInteger(row.value)&&row.value>=0&&row.value<=100,label+': scores stay within their independent 0–100 scales');
          assert.ok(row.role==='meter'&&row.min===0&&row.max===100&&row.visible&&row.inside&&row.exact,label+': each accessible bar represents its exact numeric score');
          assert.ok(row.name.includes(row.key==='tailwind'?'순풍':'역풍')&&row.text.includes(row.value+'점'),label+': direction and score remain readable without color');
        }
      }
      assert.equal(await saju.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,label+': scores do not widen the page');
      sajuScoreViews[label]={available:panels.filter(panel=>panel.status==='available').length,unavailable:panels.filter(panel=>panel.status==='unavailable').length};
    }
    async function inspectSajuSummaries(label) {
      const current=saju.locator('[data-reader-current]');
      const groups=await current.locator('.saju-two-line-summary:visible').evaluateAll(elements=>elements.map(group=>({
        role:group.getAttribute('role'),label:group.getAttribute('aria-label'),
        lines:Array.from(group.querySelectorAll('.saju-summary-line')).map(line=>{
          const style=getComputedStyle(line),rect=line.getBoundingClientRect();
          let clipped=false;
          for(let parent=line.parentElement;parent&&parent!==document.body;parent=parent.parentElement) {
            const parentStyle=getComputedStyle(parent),box=parent.getBoundingClientRect();
            if((/hidden|clip/.test(parentStyle.overflowX)&&(rect.left<box.left-1||rect.right>box.right+1))||
              (/hidden|clip/.test(parentStyle.overflowY)&&(rect.top<box.top-1||rect.bottom>box.bottom+1)))clipped=true;
          }
          return {text:line.textContent.trim(),font:parseFloat(style.fontSize),visible:rect.width>0&&rect.height>0&&style.visibility==='visible',
            fits:line.scrollWidth<=line.clientWidth+1&&line.scrollHeight<=line.clientHeight+1&&!clipped,
            wraps:!['nowrap','pre'].includes(style.whiteSpace),clamp:style.webkitLineClamp,overflow:style.textOverflow};
        })
      })));
      assert.ok(groups.length>0,label+': the selected item has visible summaries');
      assert.ok(groups.every(group=>group.role==='group'&&group.label==='두 줄 요약'&&group.lines.length===2),label+': every summary retains exactly two authored units');
      assert.ok(groups.every(group=>group.lines.every(line=>line.text&&line.visible&&line.fits&&line.wraps&&['none','','unset'].includes(line.clamp)&&line.overflow!=='ellipsis')),label+': complete summary units wrap without cropping, clamping or ellipses');
      assert.equal(await saju.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,label+': the selected reading fits the viewport');
      await inspectSajuScores(label);
      return groups[0].lines[0].font;
    }
    for (const topic of ['lifelong', 'annual', 'monthly', 'all']) {
      await saju.locator('#fixture-topic').selectOption(topic);
      await saju.locator('#report-content[data-ready="' + topic + '"]').waitFor();
      assert.ok(await saju.locator('#reading-page-select option').evaluateAll(options=>options.filter(option=>option.closest('optgroup')?.label!=='생활 제안').length)<=60,'the primary picker stays compact and keeps practical suggestions separately');
      assert.equal(await saju.locator('[data-reader-current]').count(),1,'one reading unit is selected');
      const defaultPage=await saju.locator('[data-reader-current]').getAttribute('id');
      assert.equal(await saju.locator('.report-chapter,.reading-full-text,.source-entry,[data-fact-id],a[href*="-evidence"],a[href*="-chapter-"]').count(),0,topic+': calculation material and evidence links are absent');
      assert.ok(await saju.locator('#reading-page-select option').evaluateAll(options=>options.every(option=>!/근거|계산·해석|계산 단원|자료 출처/.test(option.textContent))),topic+': the picker has no evidence menus');
      if(topic==='lifelong') await saju.screenshot({path:path.join(artifacts,'saju-portrait-mobile.png')});
      if(topic==='monthly') {
        await selectReadingPage('reading-timings');
        assert.equal(await saju.locator('.reader-timing-navigation a:visible').count(),12);
        const comparison=saju.locator('.timing-table-details');
        await comparison.locator('summary').click();
        assert.equal(await comparison.locator('tbody tr').count(),12);
        assert.equal(await saju.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await inspectReadableSurface('monthly comparison phone',{text:'.timing-table-details summary,.timing-table-details th,.timing-table-details td'});
        await comparison.scrollIntoViewIfNeeded();
        await saju.screenshot({path:path.join(artifacts,'saju-month-table-mobile.png')});
        await comparison.locator('summary').click();
        await selectReadingPage(defaultPage);
      }
      const personal=topic==='lifelong'||topic==='all';
      const cardId=await saju.locator(personal?'.portrait-card':topic==='monthly'?'[data-reader-current] .reader-card':'.reader-card').first().getAttribute('id');
      await selectReadingPage(cardId);
      const card=saju.locator('[data-reader-current]');
      const readerOrdered=await card.evaluate(element=>{
        const label=element.querySelector('.portrait-card-label,.reader-card-label'),summary=element.querySelector(':scope > .saju-two-line-summary'),prose=element.querySelector(':scope > .reader-prose');
        return label&&summary&&prose&&prose.querySelectorAll('p').length>=4&&
          !!(label.compareDocumentPosition(summary)&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(summary.compareDocumentPosition(prose)&Node.DOCUMENT_POSITION_FOLLOWING);
      });
      assert.ok(readerOrdered,topic+': the selected unit retains topic, conclusion and all paragraphs');
      assert.equal(await saju.locator('.portrait-card:visible,.reader-card:visible').count(),1);
      await inspectSajuScores(topic+' paid reading');
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
    const sajuSummaryViews={};
    await saju.locator('#fixture-topic').selectOption('all');
    await saju.locator('#report-content[data-ready="all"]').waitFor();
    const summaryTargets={
      portrait:await saju.locator('.portrait-card').first().getAttribute('id'),
      lifelong:await saju.locator('#reading-lifelong .reader-card').last().getAttribute('id'),
      annual:await saju.locator('#reading-annual .reader-intro').getAttribute('id'),
      spotlight:await saju.locator('.months-spotlight').getAttribute('id'),
      monthCard:await saju.locator('#reading-month-11 .reader-card').first().getAttribute('id')
    };
    for(const [viewport,size] of [['phone-small',{width:320,height:844}],['phone',{width:390,height:844}],['desktop',{width:1280,height:900}]]) {
      await saju.setViewportSize(size);
      let normalFont;
      for(const textSize of ['normal','large']) {
        await saju.locator('#report-content').evaluate((report,value)=>{report.dataset.readingSize=value;},textSize);
        const label=viewport+' '+textSize,checked=[];
        const inspect=async family=>{checked.push(family);return inspectSajuSummaries(label+' '+family);};
        await selectReadingPage('reading-summary');
        const font=await inspect('portrait intro');
        if(textSize==='normal')normalFont=font;
        else assert.ok(font>normalFont,label+': the large-text setting actually enlarges summary text');
        await selectReadingPage(summaryTargets.portrait);await inspect('portrait card');
        await inspectReadableSurface('general reading '+label,{text:readingText,body:'.reader-prose p',minimumBody:textSize==='large'?21:18,controls:'.reading-pager select,.reading-pager button,.reading-page-section-link'});
        await saju.locator('[data-reader-current] .saju-reading-score').first().screenshot({path:path.join(artifacts,'saju-reading-scores-'+viewport+'-'+textSize+'.png')});
        await saju.locator('.reading-pager').scrollIntoViewIfNeeded();
        await saju.screenshot({path:path.join(artifacts,'saju-two-line-summaries-'+viewport+'-'+textSize+'.png')});
        if(viewport!=='phone')await saju.screenshot({path:path.join(artifacts,'saju-readable-general-'+viewport+'-'+textSize+'.png')});
        await selectReadingPage(summaryTargets.lifelong);await inspect('lifelong card');
        await selectReadingPage(summaryTargets.annual);await inspect('annual intro');
        await selectReadingPage(summaryTargets.spotlight);await inspect('month spotlight');
        await selectReadingPage('reading-month-11');await inspect('month intro');
        await selectReadingPage(summaryTargets.monthCard);await inspect('month card');
        await selectReadingPage('reading-timings');
        const comparison=saju.locator('.timing-table-details');
        if(await comparison.getAttribute('open')===null)await comparison.locator('summary').click();
        await inspectReadableSurface('monthly table '+label,{text:'.timing-table-details summary,.timing-table-details th,.timing-table-details td'});
        await comparison.locator('summary').click();
        await selectReadingPage('reading-daeun');await inspect('decade intro');
        const periodHeading=await saju.locator('.daeun-period.is-current .daeun-age').getAttribute('id');
        await saju.locator('.daeun-nav a[href="#'+periodHeading+'"]').click();
        await inspect('decade period');
        const topicId=await saju.locator('[data-reader-current] .daeun-topic').first().getAttribute('id');
        await selectReadingPage(topicId);await inspect('decade topic');
        await selectReadingPage('reading-symbols');await inspect('symbols intro and items');
        await selectReadingPage('reading-timings');await inspect('timing intro');
        await saju.locator('.reader-timing-navigation a[href="#reading-timings-month-11"]').click();
        await inspect('timing month');
        const timingGroup=await saju.locator('[data-reader-current] .reader-timing-group').first().getAttribute('id');
        await selectReadingPage(timingGroup);await inspect('timing points');
        sajuSummaryViews[label]=checked;
      }
    }
    await saju.locator('#report-content').evaluate(report=>{report.dataset.readingSize='normal';});
    await saju.setViewportSize({width:1280,height:900});
    await saju.locator('#fixture-topic').selectOption('lifelong');
    await saju.locator('#report-content[data-ready="lifelong"]').waitFor();
    await selectReadingPage(await saju.locator('.portrait-card').first().getAttribute('id'));
    await saju.locator('.reading-pager').scrollIntoViewIfNeeded();
    await saju.screenshot({path:path.join(artifacts,'saju-lifelong-desktop.png')});
    // This exact birth has no natal stem combinations, branch combinations or
    // clashes. Its authored character/decision readings still contain strengths
    // and cautions; the previous pair-only rule dropped all of those signals.
    await saju.goto(new URL('/__saju_fixture?score-case=original-zero',url).href);
    await saju.locator('#report-content[data-ready="lifelong"]').waitFor();
    await saju.locator('#fixture-topic').selectOption('all');
    await saju.locator('#report-content[data-ready="all"]').waitFor();
    const regression=await saju.evaluate(()=>{
      const fixture=globalThis.__sajuScoreFixture;
      return {key:fixture.key,birth:fixture.birth,nativeInteractionCount:fixture.nativeInteractionCount,
        items:fixture.items.map(({key,selector,reading})=>({key,selector,score:reading.readingScore,
          title:reading.title,headline:reading.headline,paragraphs:reading.paragraphs,summaryLines:reading.summaryLines}))};
    });
    assert.equal(regression.key,'original-zero');
    assert.deepEqual(regression.birth,{year:1990,month:5,day:17,hour:8,minute:37});
    assert.equal(regression.nativeInteractionCount,0,'the regression keeps the original no-combination/no-clash chart');
    for(const item of regression.items) {
      assert.equal(item.score.status,'available',item.key+': this named fixture has confirmed reading contexts');
      assert.equal(item.score.calculation.rule,'confirmed-reading-cues-v2',item.key+': the regression uses authored reading cues instead of pair counts alone');
      assert.ok(item.paragraphs.length>0&&item.summaryLines.length===2,item.key+': the score belongs to an existing authored reading');
      // The lifelong introduction states strengths but has no direct caution
      // sentence. A zero headwind there is legitimate and must not be filled in.
      const authoredAxes=item.key==='lifelong-overview'?['tailwind']:['tailwind','headwind'];
      const authoredText=[...item.paragraphs,item.title,item.headline].filter(Boolean).join('\n');
      for(const key of authoredAxes) {
        const signal=key==='tailwind'?'help':'care';
        const cues=item.score.calculation.cues.filter(cue=>cue[signal]>0);
        assert.ok(cues.length>0&&cues.every(cue=>cue.sources[signal].length>0&&cue.sources[signal].every(source=>source.anchor&&authoredText.includes(source.anchor))),
          item.key+' '+key+': actual sentences in this reading support each positive cue before requiring a nonzero score');
        assert.ok(item.score.calculation[key+'Numerator']>0,
          item.key+' '+key+': this fixture supplies an authored context independently of natal pairs');
        assert.ok(item.score[key].value>0,
          item.key+' '+key+': actual positive source contexts must not disappear into a zero result');
      }
    }
    for(const [viewport,size] of [['phone-small',{width:320,height:844}],['phone',{width:390,height:844}],['desktop',{width:1280,height:900}]]) {
      await saju.setViewportSize(size);
      for(const textSize of ['normal','large']) {
        await saju.locator('#report-content').evaluate((report,value)=>{report.dataset.readingSize=value;},textSize);
        const label='original-zero '+viewport+' '+textSize;
        const values={};
        for(const item of regression.items) {
          const source=saju.locator(item.selector);
          const pageId=await source.evaluate(element=>element.closest('[data-reader-page]').id);
          await selectReadingPage(pageId);
          await inspectSajuScores(label+' '+item.key);
          const actual=await source.locator(':scope > .saju-reading-score .saju-wind-item').evaluateAll(rows=>rows.map(row=>({
            key:row.dataset.wind,value:Number(row.querySelector('[role="meter"]').getAttribute('aria-valuenow')),
            width:row.querySelector('.saju-wind-fill').style.width,text:row.textContent
          })));
          assert.deepEqual(actual.map(row=>[row.key,row.value,row.width]),['tailwind','headwind'].map(key=>[key,item.score[key].value,item.score[key].value+'%']),
            label+' '+item.key+': displayed scores and bar widths come from the actual reading model');
          assert.ok(actual.every(row=>row.text.includes(row.value+'점')),label+': positive scores remain explicit text');
          const paragraphs=await source.locator(':scope > .reader-prose > p').allTextContents();
          assert.deepEqual(paragraphs,item.paragraphs,label+' '+item.key+': the original strength and caution paragraphs remain intact');
          values[item.key]=actual.map(row=>row.value);
          if(item.key==='portrait-decisions'&&((viewport==='phone-small'&&textSize==='large')||(viewport==='desktop'&&textSize==='normal')))
            await source.locator(':scope > .saju-reading-score').screenshot({path:path.join(artifacts,'saju-reading-scores-original-zero-'+viewport+'-'+textSize+'.png')});
          if(item.key==='portrait-decisions'&&viewport==='desktop'&&textSize==='normal')
            await source.screenshot({path:path.join(artifacts,'saju-reading-score-regression-context-desktop.png')});
        }
        assert.equal(await saju.locator('.source-entry,[data-fact-id],a[href*="-evidence"],#reading-evidence').count(),0,label+': score corrections do not restore evidence UI');
        sajuScoreRegressions[label]=values;
      }
    }
    await saju.goto(new URL('/__saju_fixture?score-case=unknown-daeun',url).href);
    await saju.locator('#report-content[data-ready="lifelong"]').waitFor();
    const assumedDaeun=await saju.evaluate(()=>globalThis.__sajuScoreFixture.daeun);
    assert.equal(assumedDaeun.natalTimeKnown,false);assert.equal(assumedDaeun.natalHour,null);
    assert.equal(assumedDaeun.available,true);assert.equal(assumedDaeun.timeAssumed,true);
    assert.deepEqual(assumedDaeun.assumedBirthTime,{hour:6,minute:0,timezone:'Asia/Seoul'});
    assert.equal(assumedDaeun.notice,'태어난 시간을 몰라 대운은 오전 6시 00분을 기준으로 계산했어요.');
    assert.equal(assumedDaeun.periodCount,9);
    assert.equal(await saju.locator('#reading-daeun .daeun-period').count(),9,'the unknown-time reading renders all nine explicitly assumed periods');
    async function inspectDaeunAssumption(label) {
      const notices=saju.locator('#reading-daeun .daeun-time-notice:visible');
      assert.equal(await notices.count(),1,label+': the assumption is visible once in the current reading context');
      assert.equal(await notices.textContent(),assumedDaeun.notice);
      const geometry=await notices.evaluate(element=>{
        const box=element.getBoundingClientRect(),style=getComputedStyle(element);
        return {inside:box.left>=-1&&box.right<=innerWidth+1,
          fits:element.scrollWidth<=element.clientWidth+1&&element.scrollHeight<=element.clientHeight+1,
          font:parseFloat(style.fontSize),
          readingFont:parseFloat(getComputedStyle(document.getElementById('report-content')).getPropertyValue('--reading-font-size')),
          unclipped:['none','','unset'].includes(style.webkitLineClamp)&&style.textOverflow!=='ellipsis'};
      });
      assert.ok(geometry.inside&&geometry.fits&&geometry.unclipped,label+': the complete 06:00 notice wraps without clipping');
      assert.equal(geometry.font,geometry.readingFont,label+': the birth-time assumption follows the selected reading text size');
      assert.equal(await saju.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,label+': the assumed-time reading fits the viewport');
    }
    for(const [viewport,size,textSize] of [['phone-small',{width:320,height:844},'large'],['desktop',{width:1280,height:900},'normal']]) {
      const label='unknown daeun '+viewport+' '+textSize;
      await saju.setViewportSize(size);
      await saju.locator('#report-content').evaluate((report,value)=>{report.dataset.readingSize=value;},textSize);
      await selectReadingPage('reading-daeun');await inspectDaeunAssumption(label+' intro');
      const periodHeading=await saju.locator('.daeun-period.is-current .daeun-age').getAttribute('id');
      await saju.locator('.daeun-nav a[href="#'+periodHeading+'"]').click();
      await inspectDaeunAssumption(label+' period');await inspectSajuScores(label+' period');
      assert.equal(await saju.locator('.daeun-dates:visible').textContent(),assumedDaeun.currentPeriodLabel,'visible dates come from the actual 06:00 calculation');
      await inspectReadableSurface('daeun '+viewport+' '+textSize,{text:readingText,controls:'.reading-pager select,.reading-pager button,.daeun-nav a'});
      await saju.locator('#reading-daeun').screenshot({path:path.join(artifacts,'saju-daeun-assumed-six-'+viewport+'-'+textSize+'.png')});
      await saju.locator('.reading-pager').evaluate(element=>element.scrollIntoView({block:'start',behavior:'instant'}));
      await saju.screenshot({path:path.join(artifacts,'saju-readable-daeun-'+viewport+'-'+textSize+'.png')});
      const topicId=await saju.locator('[data-reader-current] .daeun-topic').first().getAttribute('id');
      await selectReadingPage(topicId);await inspectDaeunAssumption(label+' topic');
      assert.equal(await saju.locator('.source-entry,[data-fact-id],a[href*="-evidence"]').count(),0,label+': an assumption notice does not restore calculation evidence');
      sajuDaeunAssumptionViews[viewport]={...assumedDaeun,textSize};
    }
    await saju.setViewportSize({width:390,height:844});
    await saju.goto(new URL('/__compatibility_fixture', url).href);
    await saju.locator('#report-content[data-ready="confirmed"]').waitFor();
    await inspectReadingControls('compatibility','compatibility-page-select','data-compatibility-current');
    async function selectCompatibilityPage(id) {
      await saju.locator('#compatibility-page-select').selectOption(id);
      await saju.locator('[data-compatibility-current][id="'+id+'"]').waitFor({state:'visible'});
      assert.equal(await saju.locator('[data-compatibility-current]').count(),1,'compatibility shows one selected reading page');
    }
    assert.equal(await saju.locator('#compatibility-page-select').inputValue(),'compatibility-people-overview','compatibility starts with A and B’s character and traits');
    assert.match(await saju.locator('#fixture-zodiac').textContent(), /말띠.*양띠.*입춘/);
    const zodiacCard=saju.locator('[data-reader-card="zodiac"]');
    assert.equal(await zodiacCard.count(),1);
    assert.match(await zodiacCard.textContent(), /말띠.*양띠/s);
    assert.ok(await zodiacCard.locator('.reader-prose p').count()>=3);
    await selectCompatibilityPage(await zodiacCard.getAttribute('id'));
    await zodiacCard.scrollIntoViewIfNeeded();
    assert.equal(await saju.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'the two zodiac reading fits on mobile');
    await saju.screenshot({path:path.join(artifacts,'saju-zodiac-compatibility-mobile.png')});
    await saju.locator('#fixture-pair').selectOption('uncertain');
    await saju.locator('#report-content[data-ready="uncertain"]').waitFor();
    assert.match(await saju.locator('#fixture-zodiac').textContent(), /토끼띠 \/ 용띠/);
    assert.match(await zodiacCard.textContent(), /토끼띠 \/ 용띠/);
    await selectCompatibilityPage(await zodiacCard.getAttribute('id'));
    await zodiacCard.scrollIntoViewIfNeeded();
    assert.equal(await saju.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'the two candidate labels wrap on mobile');
    await saju.screenshot({path:path.join(artifacts,'saju-zodiac-boundary-mobile.png')});
    await saju.setViewportSize({width:1280,height:900});
    await saju.locator('#fixture-pair').selectOption('confirmed');
    await selectCompatibilityPage(await zodiacCard.getAttribute('id'));
    await zodiacCard.scrollIntoViewIfNeeded();
    await saju.screenshot({path:path.join(artifacts,'saju-zodiac-compatibility-desktop.png')});
    async function inspectCompatibilityPeople(label,personCount) {
      const current=saju.locator('[data-compatibility-current]');
      const geometry=await current.evaluate(page=>{
        const contained=(inner,outer)=>inner.left>=outer.left-1&&inner.right<=outer.right+1&&inner.top>=outer.top-1&&inner.bottom<=outer.bottom+1;
        function fits(element) {
          const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
          if(!rect.width||!rect.height||style.visibility==='hidden'||element.scrollWidth>element.clientWidth+1||element.scrollHeight>element.clientHeight+1)return false;
          for(let parent=element.parentElement;parent&&parent!==document.body;parent=parent.parentElement) {
            const box=parent.getBoundingClientRect(),parentStyle=getComputedStyle(parent);
            if((/hidden|clip/.test(parentStyle.overflowX)&&(rect.left<box.left-1||rect.right>box.right+1))||
              (/hidden|clip/.test(parentStyle.overflowY)&&(rect.top<box.top-1||rect.bottom>box.bottom+1)))return false;
          }
          return !['nowrap','pre'].includes(style.whiteSpace)&&style.textOverflow!=='ellipsis'&&['none','','unset'].includes(style.webkitLineClamp);
        }
        const box=page.getBoundingClientRect();
        const people=Array.from(page.querySelectorAll('.compatibility-person-reading')).map(person=>{
          const rect=person.getBoundingClientRect();
          return {key:person.dataset.personKey,marker:person.dataset.personMarker,name:person.querySelector('.compatibility-person-name').textContent,
            left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,inside:contained(rect,box)};
        });
        const groups=Array.from(page.querySelectorAll('.compatibility-two-line-summary')).map(group=>({role:group.getAttribute('role'),label:group.getAttribute('aria-label'),
          lines:Array.from(group.querySelectorAll('.compatibility-summary-line')).map(line=>({text:line.textContent.trim(),fits:fits(line)}))}));
        const prose=Array.from(page.querySelectorAll('.compatibility-person-prose p'));
        return {people,groups,bodyFont:parseFloat(getComputedStyle(prose[0]).fontSize),summaryFont:parseFloat(getComputedStyle(page.querySelector('.compatibility-summary-line')).fontSize),
          proseFits:prose.length>0&&prose.every(fits),labelsFit:Array.from(page.querySelectorAll('.compatibility-person-name,.compatibility-people-title')).every(fits),
          horizontalOverflow:document.documentElement.scrollWidth>innerWidth||page.scrollWidth>page.clientWidth+1,
          insideViewport:box.left>=-1&&box.right<=innerWidth+1};
      });
      assert.equal(geometry.people.length,personCount,label+': both people are present on a comparison page');
      assert.equal(geometry.groups.length,personCount||1,label+': each person or synthesis has its own summary');
      assert.ok(geometry.groups.every(group=>group.role==='group'&&group.label==='두 줄 요약'&&group.lines.length===2&&group.lines.every(line=>line.text&&line.fits)),label+': two complete summary units wrap without clipping');
      assert.ok(geometry.proseFits&&geometry.labelsFit,label+': names, headings and full paragraphs remain readable');
      assert.equal(geometry.horizontalOverflow,false,label+': the reading fits the available width');
      assert.ok(geometry.insideViewport,label+': the complete reading card fits the viewport width');
      if(personCount) {
        assert.deepEqual(geometry.people.map(person=>person.key),['self','partner'],label+': A precedes B in reading order');
        assert.deepEqual(geometry.people.map(person=>person.marker),['A','B']);
        assert.deepEqual(geometry.people.map(person=>person.name),['A · 길게 입력한 첫 번째 예시 이름','B · 길게 입력한 두 번째 예시 이름']);
        assert.ok(geometry.people.every(person=>person.inside),label+': both person cards stay inside the reading');
        const [a,b]=geometry.people;
        if((await saju.viewportSize()).width===1280)assert.ok(b.left>=a.right-1&&Math.abs(a.top-b.top)<=1,label+': desktop places the matching A/B items side by side');
        else assert.ok(b.top>=a.bottom-1,label+': a phone stacks A above B');
      }
      return geometry;
    }
    const compatibilityPeople={};
    for(const [viewport,size] of [['phone-small',{width:320,height:844}],['phone',{width:390,height:844}],['desktop',{width:1280,height:900}]]) {
      await saju.setViewportSize(size);
      for(const textSize of ['normal','large']) {
        await saju.locator('#fixture-pair').selectOption('confirmed');
        await saju.locator('#report-content').evaluate((report,value)=>{report.dataset.readingSize=value;},textSize);
        const topics=viewport==='phone-small'?['overview','decisions','relationships','work','pressure','adjustment']:['overview'];
        const label=viewport+' '+textSize;
        for(const topic of topics) {
          await selectCompatibilityPage('compatibility-people-'+topic);
          const geometry=await inspectCompatibilityPeople(label+' '+topic,2);
          if(topic==='overview') {
            await inspectReadableSurface('compatibility people '+label,{text:compatibilityText,body:'.compatibility-person-prose p',minimumBody:textSize==='large'?21:18,controls:'.reading-pager select,.reading-pager button'});
            compatibilityPeople[label]={topics,bodyFont:geometry.bodyFont,summaryFont:geometry.summaryFont};
            if(textSize==='large') {
              assert.ok(geometry.bodyFont>compatibilityPeople[viewport+' normal'].bodyFont,label+': the large setting increases the body text');
              assert.ok(geometry.summaryFont>compatibilityPeople[viewport+' normal'].summaryFont,label+': the large setting increases the summary text');
            }
            if(viewport!=='phone')await saju.locator('[data-compatibility-current]').screenshot({path:path.join(artifacts,'saju-compatibility-people-'+viewport+'-'+textSize+'.png')});
            if(viewport!=='phone') {
              await saju.locator('.reading-pager').evaluate(element=>element.scrollIntoView({block:'start',behavior:'instant'}));
              await saju.screenshot({path:path.join(artifacts,'saju-readable-compatibility-'+viewport+'-'+textSize+'.png')});
            }
          }
        }
        await selectCompatibilityPage('compatibility-synthesis');
        await inspectCompatibilityPeople(label+' synthesis',0);
        await inspectReadableSurface('compatibility synthesis '+label,{text:compatibilityText,body:'.compatibility-person-prose p',minimumBody:textSize==='large'?21:18});
        if(viewport!=='phone'&&textSize==='normal')await saju.locator('[data-compatibility-current]').screenshot({path:path.join(artifacts,'saju-compatibility-synthesis-'+viewport+'.png')});
        assert.equal(await saju.locator('#compatibility-reading-evidence,.compatibility-evidence-link,.compatibility-score-details,[data-fact-id],a[href*="-evidence"]').count(),0,label+': compatibility has no calculation material or evidence links');
        assert.ok(await saju.locator('#compatibility-page-select option').evaluateAll(options=>options.every(option=>!/근거|계산|자료|출처/.test(option.textContent))),label+': compatibility has no evidence menus');
      }
    }
    await saju.setViewportSize({width:320,height:844});
    await saju.locator('#fixture-pair').selectOption('uncertain');
    await saju.locator('#report-content').evaluate(report=>{report.dataset.readingSize='large';});
    await selectCompatibilityPage('compatibility-people-overview');
    await inspectCompatibilityPeople('unknown birth time phone-small large',2);
    await selectCompatibilityPage('compatibility-synthesis');
    await inspectCompatibilityPeople('unknown birth time phone-small large synthesis',0);
    const compatibilityScores={};
    for(const [viewport,size] of [['phone-small',{width:320,height:844}],['phone',{width:390,height:844}],['desktop',{width:1280,height:900}]]) {
      await saju.setViewportSize(size);
      await saju.locator('#report-content').evaluate(report=>{report.dataset.readingSize='normal';});
      compatibilityScores[viewport]={};
      for(const pair of ['confirmed','uncertain']) {
        await saju.locator('#fixture-pair').selectOption(pair);
        await saju.locator('#report-content[data-ready="'+pair+'"]').waitFor();
        await selectCompatibilityPage('compatibility-scores');
        const scoreboard=saju.locator('section.compatibility-scoreboard');
        await scoreboard.waitFor({state:'visible'});
        assert.equal(await scoreboard.count(),1,'one score summary is rendered per pair');
        assert.equal(await scoreboard.locator('article[data-score-item]').count(),4,'all four score components remain available');
        assert.equal(await scoreboard.locator('.compatibility-score-meter[role="meter"]').count(),4,'each component has its own accessible meter');
        const geometry=await scoreboard.evaluate(board=>{
          const box=board.getBoundingClientRect();
          const contained=(inner,outer)=>inner.left>=outer.left-1&&inner.right<=outer.right+1&&inner.top>=outer.top-1&&inner.bottom<=outer.bottom+1;
          const total=board.querySelector('strong[data-score-total]');
          const meters=Array.from(board.querySelectorAll('article[data-score-item]')).map(item=>{
            const meter=item.querySelector('.compatibility-score-meter[role="meter"]'),fill=meter?.querySelector('.compatibility-score-fill');
            if(!meter||!fill)return {valid:false};
            const trackBox=meter.getBoundingClientRect(),fillBox=fill.getBoundingClientRect(),style=getComputedStyle(meter);
            const value=Number(meter.getAttribute('aria-valuenow'));
            const contentWidth=meter.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
            return {value,min:Number(meter.getAttribute('aria-valuemin')),max:Number(meter.getAttribute('aria-valuemax')),
              valid:Number.isInteger(value)&&value>=0&&value<=100,
              visible:trackBox.width>0&&trackBox.height>0&&getComputedStyle(meter).visibility==='visible',
              inside:contained(trackBox,item.getBoundingClientRect())&&contained(item.getBoundingClientRect(),box)&&contained(fillBox,trackBox),
              fillMatches:Math.abs(fillBox.width-contentWidth*value/100)<=2};
          });
          const summaries=Array.from(board.querySelectorAll('article[data-score-item]')).map(item=>{
            const summary=item.querySelector('.compatibility-score-item-summary');
            if(!summary)return {id:item.dataset.scoreItem,visible:false};
            const rect=summary.getBoundingClientRect(),style=getComputedStyle(summary);
            const contentHeight=rect.height-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)-parseFloat(style.borderTopWidth)-parseFloat(style.borderBottomWidth);
            return {id:item.dataset.scoreItem,height:contentHeight,lineHeight:parseFloat(style.lineHeight),
              meaningUnits:summary.textContent.trim().split(/\n+/).map(line=>line.trim()).filter(Boolean),
              visible:rect.width>0&&rect.height>0&&style.visibility==='visible',
              unclipped:summary.scrollWidth<=summary.clientWidth+1&&summary.scrollHeight<=summary.clientHeight+1&&
                style.textOverflow!=='ellipsis'&&['none','','unset'].includes(style.webkitLineClamp)&&
                contained(rect,item.getBoundingClientRect())&&contained(rect,box)};
          });
          const clippedAncestors=[];
          for(let parent=board.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
            const style=getComputedStyle(parent),rect=parent.getBoundingClientRect();
            if((/hidden|clip/.test(style.overflowX)&&(box.left<rect.left-1||box.right>rect.right+1))||
              (/hidden|clip/.test(style.overflowY)&&(box.top<rect.top-1||box.bottom>rect.bottom+1)))clippedAncestors.push(parent.id||parent.className||parent.tagName);
          }
          return {total:Number(total?.textContent.trim()),meters,summaries,
            selectedPage:board.hasAttribute('data-compatibility-current')&&document.getElementById('compatibility-page-select').value==='compatibility-scores',
            totalVisible:!!total&&total.getBoundingClientRect().width>0&&contained(total.getBoundingClientRect(),box),
            documentOverflow:document.documentElement.scrollWidth>innerWidth,
            boardOverflow:board.scrollWidth>board.clientWidth+1||board.scrollHeight>board.clientHeight+1,
            clippedAncestors,
            insideViewport:box.left>=-1&&box.right<=innerWidth+1,
            clippedText:Array.from(board.querySelectorAll('h2,h3,h4,h5,h6,p,strong,small,summary,dt,dd')).filter(element=>element.clientWidth>0&&element.scrollWidth>element.clientWidth+1).length};
        });
        const label=pair+' '+viewport;
        assert.ok(geometry.selectedPage,label+': scores remain available through the reading picker');
        assert.ok(Number.isInteger(geometry.total)&&geometry.total>=0&&geometry.total<=100,label+': the total is an explicit 0–100 score');
        assert.ok(geometry.totalVisible,label+': the total is visible inside its score summary');
        assert.ok(geometry.meters.every(meter=>meter.valid&&meter.min===0&&meter.max===100&&meter.visible&&meter.inside&&meter.fillMatches),label+': all four bars fit and represent their exact values');
        assert.equal(geometry.summaries.length,4,label+': all four bars have a summary');
        for(const summary of geometry.summaries) {
          assert.ok(summary.visible,label+' '+summary.id+': the summary is visible at regular text size');
          assert.equal(summary.meaningUnits.length,2,label+' '+summary.id+': the summary keeps its two complete meaning units');
          assert.ok(summary.lineHeight>0&&summary.height>=2*summary.lineHeight-1,label+' '+summary.id+': the two summary units can wrap naturally at a readable size');
          assert.ok(summary.unclipped,label+' '+summary.id+': both summary lines fit without clipping');
        }
        assert.equal(geometry.documentOverflow,false,label+': the page does not overflow horizontally');
        assert.equal(geometry.boardOverflow,false,label+': no score content is clipped by its own container');
        assert.deepEqual(geometry.clippedAncestors,[],label+': no report ancestor clips the score summary');
        assert.ok(geometry.insideViewport,label+': the complete score summary fits the viewport width');
        assert.equal(geometry.clippedText,0,label+': long labels and explanations remain readable');
        const values={total:geometry.total,items:geometry.meters.map(meter=>meter.value)};
        if(compatibilityScores['phone-small'][pair])assert.deepEqual(values,compatibilityScores['phone-small'][pair],label+': layout changes preserve every score');
        compatibilityScores[viewport][pair]=values;
        await inspectReadableSurface('compatibility scores '+label+' normal',{text:compatibilityText,body:'.compatibility-score-summary,.compatibility-score-item-summary',minimumBody:18});
        await scoreboard.scrollIntoViewIfNeeded();
        await scoreboard.screenshot({path:path.join(artifacts,'saju-compatibility-scores-'+pair+'-'+viewport+'.png')});
        if(pair==='confirmed') {
          await saju.locator('#report-content').evaluate(report=>{report.dataset.readingSize='large';});
          await inspectReadableSurface('compatibility scores '+label+' large',{text:compatibilityText,body:'.compatibility-score-summary,.compatibility-score-item-summary',minimumBody:21});
          const enlargedSummaries=await scoreboard.locator('.compatibility-score-item-summary').evaluateAll(nodes=>nodes.map(node=>{
            const style=getComputedStyle(node);
            return {units:node.textContent.trim().split(/\n+/).map(line=>line.trim()).filter(Boolean).length,
              complete:node.scrollWidth<=node.clientWidth+1&&node.scrollHeight<=node.clientHeight+1&&style.textOverflow!=='ellipsis'&&['none','','unset'].includes(style.webkitLineClamp)};
          }));
          assert.ok(enlargedSummaries.every(summary=>summary.units===2&&summary.complete),label+': large text preserves both complete score summary units');
          if(viewport!=='phone')await scoreboard.screenshot({path:path.join(artifacts,'saju-readable-compatibility-scores-'+viewport+'-large.png')});
          await saju.locator('#report-content').evaluate(report=>{report.dataset.readingSize='normal';});
        }
      }
    }
    const sajuSwipeViews={};
    for(const [kind,fixture,pickerId,currentAttribute] of [
      ['general','/__saju_fixture','reading-page-select','data-reader-current'],
      ['compatibility','/__compatibility_fixture','compatibility-page-select','data-compatibility-current']
    ]) {
      for(const [viewport,size,textSize,input] of [
        ['phone-small',{width:320,height:844},'large','touch'],
        ['phone',{width:390,height:844},'normal','touch'],
        ['desktop',{width:1280,height:900},'normal','mouse']
      ]) {
        const swipe=await browser.newPage({viewport:size,reducedMotion:'reduce',deviceScaleFactor:1,hasTouch:input==='touch'});
        const cdp=input==='touch'?await swipe.context().newCDPSession(swipe):null;
        const label=kind+' '+viewport+' '+textSize+' '+input;let swipeStage='initializing';
        try {
          swipe.on('pageerror',error=>errors.push(error.message));
          swipe.on('response',response=>{if(response.status()>=400)failed.push([response.status(),response.url()]);});
          await swipe.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
          await swipe.goto(new URL(fixture,url).href);
          await swipe.locator('#report-content[data-ready]').waitFor();
          await swipe.locator('#report-content').evaluate((element,value)=>{element.dataset.readingSize=value;},textSize);
          await swipe.evaluate(attribute=>{
            globalThis.__sajuSwipeTrace=[];
            const record=event=>{
              const host=document.querySelector('.reading-swipe-enabled');
              const trace=globalThis.__sajuSwipeTrace;
              trace.push({type:event.type,target:event.target.id||event.target.tagName,pointer:event.pointerId,
                x:event.clientX,y:event.clientY,button:event.button,buttons:event.buttons,primary:event.isPrimary,time:Math.round(event.timeStamp),
                captured:host?.hasPointerCapture(event.pointerId||0),dragging:host?.classList.contains('reading-swipe-dragging'),
                selected:document.querySelector('['+attribute+']')?.id,selection:getSelection()?.toString().length||0});
              if(trace.length>80)trace.shift();
            };
            for(const name of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture'])document.addEventListener(name,record,true);
          },currentAttribute);
          const picker=swipe.locator('#'+pickerId),current=swipe.locator('['+currentAttribute+']'),pager=swipe.locator('.reading-pager');
          const first=await current.getAttribute('id');
          const controls=pager.locator('.reading-pager-step');
          await controls.last().click();
          const second=await current.getAttribute('id');
          await controls.first().click();assert.equal(await current.getAttribute('id'),first);

          // Start on actual paragraph glyphs, so PC dragging is verified over
          // reading text rather than only over blank card padding.
          async function paragraphPoints(direction) {
            const paragraph=current.locator('.reader-prose p:visible').first();
            await paragraph.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));
            return paragraph.evaluate((element,direction)=>{
              const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
              let text,rect;
              while((text=walker.nextNode())) {
                if(!text.textContent.trim())continue;
                const range=document.createRange();range.selectNodeContents(text);
                rect=Array.from(range.getClientRects()).find(box=>box.width>110&&box.top>=0&&box.bottom<=innerHeight);
                if(rect)break;
              }
              if(!rect)throw new Error('No visible paragraph line wide enough for a real drag');
              const distance=Math.min(140,rect.width-12),left=rect.left+6,right=left+distance,y=rect.top+rect.height/2;
              return direction<0?{from:{x:right,y},to:{x:left,y}}:{from:{x:left,y},to:{x:right,y}};
            },direction);
          }
          async function gesture(from,to) {
            await swipe.evaluate(()=>{globalThis.__sajuSwipeTrace=[];});
            if(cdp) {
              const point=(x,y)=>({x,y,id:1,radiusX:2,radiusY:2,force:1});
              await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(from.x,from.y)]});
              for(let step=1;step<=8;step++) {
                await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(from.x+(to.x-from.x)*step/8,from.y+(to.y-from.y)*step/8)]});
              }
              await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
            } else {
              await swipe.mouse.move(from.x,from.y);await swipe.mouse.down();
              await swipe.mouse.move(to.x,to.y,{steps:8});await swipe.mouse.up();
            }
            await swipe.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          }
          swipeStage='left text drag';
          let points=await paragraphPoints(-1);await gesture(points.from,points.to);
          assert.equal(await current.getAttribute('id'),second,label+': a left drag over text advances exactly one reading');
          assert.equal(await picker.inputValue(),second,label+': the picker follows the drag');
          swipeStage='right text drag';points=await paragraphPoints(1);await gesture(points.from,points.to);
          assert.equal(await current.getAttribute('id'),first,label+': a right drag returns to the prior reading');
          swipeStage='first page boundary';points=await paragraphPoints(1);await gesture(points.from,points.to);
          assert.equal(await current.getAttribute('id'),first,label+': the first reading does not wrap');

          let verticalScroll=null;
          if(cdp) {
            swipeStage='native vertical scroll';
            points=await paragraphPoints(-1);
            const from={x:points.from.x,y:Math.max(230,points.from.y)},to={x:points.from.x+3,y:Math.max(230,points.from.y)-160};
            const before=await swipe.evaluate(()=>scrollY);await gesture(from,to);
            await swipe.waitForFunction(before=>scrollY>before+40,before);
            verticalScroll=(await swipe.evaluate(()=>scrollY))-before;
            assert.equal(await current.getAttribute('id'),first,label+': vertical touch scrolling does not turn the page');
            await swipe.evaluate(async()=>{
              let last=scrollY,stable=0;const deadline=performance.now()+1200;
              while(stable<3&&performance.now()<deadline) {
                await new Promise(requestAnimationFrame);
                stable=Math.abs(scrollY-last)<1?stable+1:0;last=scrollY;
              }
            });
          } else {
            swipeStage='existing text selection';
            // A user's existing selection remains usable instead of becoming a
            // page turn. The selection itself is created only in this fixture.
            await current.locator('.reader-prose p:visible').first().evaluate(element=>{
              const range=document.createRange();range.selectNodeContents(element);
              getSelection().removeAllRanges();getSelection().addRange(range);
            });
            points=await paragraphPoints(-1);await gesture(points.from,points.to);
            assert.equal(await current.getAttribute('id'),first,label+': an existing selected passage is not a swipe');
            await swipe.evaluate(()=>getSelection().removeAllRanges());
          }
          swipeStage='hint layout';
          await pager.evaluate(element=>element.scrollIntoView({block:'start',behavior:'instant'}));
          const hint=await pager.locator('.reading-swipe-hint').evaluate(element=>{
            const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
            return {text:element.textContent,font:parseFloat(style.fontSize),fits:element.scrollWidth<=element.clientWidth+1&&element.scrollHeight<=element.clientHeight+1,
              inside:rect.left>=-1&&rect.right<=innerWidth+1,wraps:!['nowrap','pre'].includes(style.whiteSpace),
              touchAction:getComputedStyle(element.closest('.reading-swipe-enabled')).touchAction};
          });
          assert.ok(hint.text.includes('왼쪽')&&hint.text.includes('오른쪽')&&hint.fits&&hint.inside&&hint.wraps,label+': directions remain readable without clipping');
          assert.ok(hint.font>=13,label+': swipe directions remain readable');
          assert.ok(hint.touchAction.includes('pan-y')&&hint.touchAction.includes('pinch-zoom'),label+': native vertical scrolling and zoom remain available');
          assert.equal(await swipe.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,label+': swipe UI fits the viewport');
          sajuSwipeViews[label]={first,second,leftSteps:1,rightSteps:1,bounded:true,verticalScroll,hint};
          if(viewport!=='phone')await swipe.screenshot({path:path.join(artifacts,'saju-swipe-'+kind+'-'+viewport+'-'+textSize+'.png')});
          if(viewport==='phone-small')await pager.screenshot({path:path.join(artifacts,'saju-swipe-pager-'+kind+'-'+viewport+'-'+textSize+'.png')});
        } catch(error) {
          console.error(JSON.stringify({swipeFailure:label,stage:swipeStage,events:await swipe.evaluate(()=>globalThis.__sajuSwipeTrace||[]).catch(()=>[])}));
          await swipe.screenshot({path:path.join(artifacts,'saju-swipe-failure-'+kind+'-'+viewport+'.png')}).catch(()=>{});
          throw error;
        } finally {if(cdp)await cdp.detach();await swipe.close();}
      }
    }
    const sajuMotionViews={};
    for(const [kind,fixture,currentAttribute,fixturePicker,alternate] of [
      ['general','/__saju_fixture','data-reader-current','fixture-topic','annual'],
      ['compatibility','/__compatibility_fixture','data-compatibility-current','fixture-pair','uncertain']
    ]) {
      for(const [viewport,size,input,textSize] of [
        ['phone-small',{width:320,height:844},'touch','large'],
        ['desktop',{width:1280,height:900},'mouse','normal']
      ]) {
        const record=input==='touch';
        const context=await browser.newContext({viewport:size,reducedMotion:'no-preference',deviceScaleFactor:1,hasTouch:input==='touch',
          ...(record?{recordVideo:{dir:path.join(artifacts,'motion-recordings'),size}}:{})});
        const slide=await context.newPage(),video=record?slide.video():null;
        const cdp=input==='touch'?await context.newCDPSession(slide):null;
        const label=kind+' '+viewport+' '+input;let motionStage='initializing';
        try {
          slide.on('pageerror',error=>errors.push(error.message));
          slide.on('response',response=>{if(response.status()>=400)failed.push([response.status(),response.url()]);});
          await slide.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
          await slide.goto(new URL(fixture,url).href);
          await slide.locator('#report-content[data-ready]').waitFor();
          await slide.evaluate(textSize=>{document.documentElement.dataset.reducedMotion='false';document.getElementById('report-content').dataset.readingSize=textSize;},textSize);
          const current=slide.locator('['+currentAttribute+']'),pager=slide.locator('.reading-pager'),steps=pager.locator('.reading-pager-step');
          const first=await current.getAttribute('id');
          const settled=()=>slide.waitForFunction(()=>!document.querySelector('.reading-slide-outgoing,.reading-slide-incoming,.reading-slide-dragging')
            &&![...document.querySelectorAll('[data-reader-current],[data-compatibility-current]')].some(el=>el.style.transform&&el.style.transform!=='none'),null,{timeout:2500});
          function readMotionFrame({attribute,waitForProgress=false}) {
            const current=document.querySelector('['+attribute+']');
            const frames=[...document.querySelectorAll('.reading-slide-incoming,.reading-slide-outgoing')].map(el=>({
              incoming:el.classList.contains('reading-slide-incoming'),outgoing:el.classList.contains('reading-slide-outgoing'),
              x:new DOMMatrixReadOnly(getComputedStyle(el).transform).m41,
              hidden:el.getAttribute('aria-hidden'),inert:el.inert,duplicateIds:el.classList.contains('reading-slide-outgoing')?el.querySelectorAll('[id]').length:0
            }));
            const animations=document.getAnimations().filter(a=>a.effect?.target?.closest('#report-content'))
              .map(a=>({state:a.playState,currentTime:a.currentTime,pending:a.pending,duration:a.effect.getComputedTiming().duration}));
            if(waitForProgress&&(animations.length<2||!animations.every(a=>a.state==='running'&&!a.pending&&a.currentTime>0&&a.currentTime<a.duration)))return false;
            return {current:current?.id,frames,overflow:document.documentElement.scrollWidth>innerWidth,
              livePages:document.querySelectorAll('['+attribute+']').length,animations};
          }
          const frame=()=>slide.evaluate(readMotionFrame,{attribute:currentAttribute});
          async function inspectSlide(direction) {
            // Observe a real advancing animation frame, preserving that exact
            // snapshot instead of assuming a fixed number of rAFs starts WAAPI.
            const snapshot=await slide.waitForFunction(readMotionFrame,{attribute:currentAttribute,waitForProgress:true},{timeout:2500});
            const value=await snapshot.jsonValue();await snapshot.dispose();
            assert.equal(value.livePages,1,label+': visual copies are not additional live readings');
            const incoming=value.frames.find(item=>item.incoming),outgoing=value.frames.find(item=>item.outgoing);
            assert.ok(incoming&&outgoing,label+': both readings participate in the horizontal transition');
            assert.ok(direction>0?incoming.x>0.5:incoming.x<-.5,label+': the new reading enters from the correct side');
            assert.ok(direction>0?outgoing.x<-.5:outgoing.x>.5,label+': the previous reading exits toward the gesture');
            assert.equal(outgoing.hidden,'true');assert.equal(outgoing.inert,true);assert.equal(outgoing.duplicateIds,0);
            assert.equal(value.overflow,false,label+': moving content never widens the document');
            assert.ok(value.animations.some(a=>a.state==='running'&&a.duration>=150&&a.duration<=500),label+': an eased transition is actually running');
            await settled();return value;
          }
          async function points(direction,distance=120) {
            const paragraph=current.locator('.reader-prose p:visible').first();
            await paragraph.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
            return paragraph.evaluate((el,{direction,distance})=>{
              const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let text,rect;
              while((text=walker.nextNode())) {
                if(!text.textContent.trim())continue;
                const range=document.createRange();range.selectNodeContents(text);
                rect=[...range.getClientRects()].find(box=>box.width>110&&box.top>=0&&box.bottom<=innerHeight);if(rect)break;
              }
              if(!rect)throw new Error('No visible line for motion gesture');
              const travel=Math.min(distance,rect.width-12),left=rect.left+6,right=left+travel,y=rect.top+rect.height/2;
              return direction<0?{from:{x:right,y},to:{x:left,y}}:{from:{x:left,y},to:{x:right,y}};
            },{direction,distance});
          }
          async function begin(from,to) {
            if(cdp) {
              const point=(x,y)=>({x,y,id:1,radiusX:2,radiusY:2,force:1});
              await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(from.x,from.y)]});
              for(let n=1;n<=6;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(from.x+(to.x-from.x)*n/6,from.y+(to.y-from.y)*n/6)]});
            } else {await slide.mouse.move(from.x,from.y);await slide.mouse.down();await slide.mouse.move(to.x,to.y,{steps:6});}
          }
          async function release() {
            if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await slide.mouse.up();
          }

          motionStage='drag follows pointer';
          let gesturePath=await points(-1),before=await current.evaluate(el=>el.getBoundingClientRect().left);
          await begin(gesturePath.from,gesturePath.to);
          const offset=(await current.evaluate(el=>el.getBoundingClientRect().left))-before;
          assert.ok(offset<-20&&offset>=-150,label+': the live reading follows the pressed pointer before release');
          assert.equal(await current.getAttribute('id'),first,label+': dragging alone has not changed the item');
          assert.equal(await slide.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,label+': dragging remains inside the screen');
          if(record)await slide.screenshot({path:path.join(artifacts,'saju-slide-drag-'+kind+'-phone-small.png')});
          await release();
          const second=await current.getAttribute('id');assert.notEqual(second,first,label+': release commits one new item');
          const left=await inspectSlide(1);

          motionStage='reverse slide';gesturePath=await points(1);await begin(gesturePath.from,gesturePath.to);await release();
          assert.equal(await current.getAttribute('id'),first);const right=await inspectSlide(-1);
          motionStage='short and boundary return';
          for(const [direction,distance] of [[-1,30],[1,110]]) {
            gesturePath=await points(direction,distance);await begin(gesturePath.from,gesturePath.to);await release();await settled();
            assert.equal(await current.getAttribute('id'),first,label+': a short or unavailable turn returns to the same reading');
          }
          motionStage='previous and next controls';
          await steps.last().click();assert.equal(await current.getAttribute('id'),second);await inspectSlide(1);
          assert.equal(await slide.evaluate(()=>document.activeElement?.textContent),'다음',label+': the next control retains focus');
          await steps.last().click();await settled();
          await steps.first().click();assert.equal(await current.getAttribute('id'),second);await inspectSlide(-1);
          assert.equal(await slide.evaluate(()=>document.activeElement?.textContent),'이전',label+': the previous control retains focus');
          await steps.first().click();assert.equal(await current.getAttribute('id'),first);await settled();

          if(input==='mouse') {
            motionStage='rapid direction change';
            await steps.last().click();await steps.first().click();await settled();
            assert.equal(await current.getAttribute('id'),first,label+': rapid control input has no stale final page');
            motionStage='reduced motion and expiry cleanup';
            await steps.last().click();
            await slide.evaluate(()=>{document.documentElement.dataset.reducedMotion='true';});await settled();
            assert.equal(await current.getAttribute('id'),second);
            await steps.first().click();assert.equal(await current.getAttribute('id'),first);
            assert.equal((await frame()).frames.length,0,label+': reduced motion has no moving copies');
            await slide.evaluate(()=>{document.documentElement.dataset.reducedMotion='false';});
            await steps.last().click();
            await slide.evaluate(()=>{document.getElementById('report-content').hidden=true;});await settled();
            await slide.evaluate(()=>{document.getElementById('report-content').hidden=false;});
            assert.equal(await current.getAttribute('id'),second,label+': hiding an expiring result never changes its selected item');
            await steps.first().click();
            await slide.evaluate(()=>{globalThis.__oldMotionHost=document.querySelector('.reading-swipe-enabled');});
            await slide.locator('#'+fixturePicker).selectOption(alternate);
            await slide.waitForFunction(()=>!globalThis.__oldMotionHost.querySelector('.reading-slide-outgoing,.reading-slide-incoming,.reading-slide-dragging'));
            assert.equal((await frame()).frames.length,0,label+': replacing the report leaves no former personal reading visible');
          }
          sajuMotionViews[label]={first,second,dragOffset:offset,left,right,settled:true,reducedAndRemovalChecked:input==='mouse'};
        } catch(error) {
          console.error(JSON.stringify({motionFailure:label,stage:motionStage,state:await slide.evaluate(()=>({
            current:document.querySelector('[data-reader-current],[data-compatibility-current]')?.id,
            copies:document.querySelectorAll('.reading-slide-outgoing').length,
            moving:[...document.querySelectorAll('.reading-slide-incoming,.reading-slide-dragging')].map(el=>({id:el.id,transform:getComputedStyle(el).transform})),
            animations:document.getAnimations().map(a=>({state:a.playState,time:a.currentTime,duration:a.effect?.getComputedTiming().duration}))
          })).catch(()=>null)}));
          await slide.screenshot({path:path.join(artifacts,'saju-slide-failure-'+kind+'-'+viewport+'.png')}).catch(()=>{});throw error;
        } finally {
          if(cdp)await cdp.detach();await context.close();
          if(video)fs.renameSync(await video.path(),path.join(artifacts,'saju-slide-'+kind+'-preview.webm'));
        }
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    console.log(JSON.stringify({ localPreviewOnly: true, tarotViews, sajuTopics: ['lifelong', 'annual', 'monthly', 'all'], sajuEntryViews, compatibilityEntryViews, sajuReadableViews, sajuNavigation, sajuSummaryViews, sajuScoreViews, sajuScoreRegressions, sajuDaeunAssumptionViews, compatibilityPeople, compatibilityScores, sajuSwipeViews, sajuMotionViews, viewport: '320×844, 390×844 and 1280×900', errors, failed }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
