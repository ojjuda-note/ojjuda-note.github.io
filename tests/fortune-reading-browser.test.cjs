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
const sajuFixture = `<!doctype html><html lang="ko" data-reduced-motion="true"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/games/moonlit-tarot/assets/favicon.svg"><link rel="stylesheet" href="/games/starlit-saju/style.css"><link rel="stylesheet" href="/games/starlit-saju/report.css"><link rel="stylesheet" href="/games/starlit-saju/reading-summary.css"></head><body><main><section class="result"><label for="fixture-topic">검사할 풀이</label><select id="fixture-topic"><option value="lifelong">평생운</option><option value="annual">올해운</option><option value="monthly">월별운</option><option value="all">전체 풀이</option></select><div class="detailed-reading" id="report-content"></div></section></main><script type="module">
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
const compatibilityFixture = `<!doctype html><html lang="ko" data-reduced-motion="true"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/games/moonlit-tarot/assets/favicon.svg"><link rel="stylesheet" href="/games/starlit-saju/style.css"><link rel="stylesheet" href="/games/starlit-saju/report.css"><link rel="stylesheet" href="/games/starlit-saju/compatibility.css"></head><body><main class="compatibility-main"><section class="result"><label for="fixture-pair">검사할 두 사람</label><select id="fixture-pair"><option value="confirmed">말띠와 양띠</option><option value="uncertain">입춘일 · 시간 모름</option></select><p id="fixture-zodiac" class="birth-summary"></p><div class="detailed-reading" id="report-content"></div></section></main><script type="module">
import { calculateSaju } from '/games/starlit-saju/engine.mjs';
import { buildCompatibilityReading } from '/games/starlit-saju/compatibility.mjs';
import { renderCompatibilityReport } from '/games/starlit-saju/report-view.mjs';
import { createCompatibilityScoreboard } from '/games/starlit-saju/compatibility-score-view.mjs';
const now = new Date('2026-11-13T00:00:00Z');
const partner = calculateSaju({year:1991,month:5,day:10,hour:9,minute:0},{now});
const target = document.getElementById('report-content');
const select = document.getElementById('fixture-pair');
function show(){
  const birth = select.value === 'confirmed' ? {year:1990,month:5,day:10,hour:9,minute:0} : {year:2024,month:2,day:4,hour:null};
  const reading = buildCompatibilityReading(calculateSaju(birth,{now}),partner);
  document.getElementById('fixture-zodiac').textContent = reading.zodiac.self.label + ' · ' + reading.zodiac.partner.label + ' · 사주 기준 · 입춘';
  renderCompatibilityReport(target,reading);
  target.querySelector('#compatibility-reading > .report-section-heading').after(createCompatibilityScoreboard(reading.score));
  target.dataset.ready=select.value;
}
select.addEventListener('change',show);show();
</script></body></html>`;
const server = http.createServer((request, response) => {
  let name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
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
    assert.match(await solutionSummary.locator('.reading-summary-line').first().textContent(), /(?:봐|보렴|보자|해|하렴|둬|두렴|나눠|적어|골라|멈춰|줘|주렴|거야)[.!?]$/u, 'the solution summary gives a concrete action instead of an invitation to interpret it');
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
    await saju.goto(new URL('/__saju_fixture', url).href);
    async function selectReadingPage(id) {
      const picker=saju.locator('#reading-page-select');
      if(await picker.locator('option[value="'+id+'"]').count()) await picker.selectOption(id);
      else await saju.locator('a[href="#'+id+'"]:visible').first().click();
      await saju.locator('[data-reader-current][id="'+id+'"]').waitFor({state:'visible'});
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
      return groups[0].lines[0].font;
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
      const readerOrdered=await card.evaluate(element=>{
        const label=element.querySelector('.portrait-card-label,.reader-card-label'),summary=element.querySelector(':scope > .saju-two-line-summary'),prose=element.querySelector(':scope > .reader-prose');
        return label&&summary&&prose&&prose.querySelectorAll('p').length>=4&&
          !!(label.compareDocumentPosition(summary)&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(summary.compareDocumentPosition(prose)&Node.DOCUMENT_POSITION_FOLLOWING);
      });
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
        await saju.locator('.reading-pager').scrollIntoViewIfNeeded();
        await saju.screenshot({path:path.join(artifacts,'saju-two-line-summaries-'+viewport+'-'+textSize+'.png')});
        await selectReadingPage(summaryTargets.lifelong);await inspect('lifelong card');
        await selectReadingPage(summaryTargets.annual);await inspect('annual intro');
        await selectReadingPage(summaryTargets.spotlight);await inspect('month spotlight');
        await selectReadingPage('reading-month-11');await inspect('month intro');
        await selectReadingPage(summaryTargets.monthCard);await inspect('month card');
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
    await saju.setViewportSize({width:390,height:844});
    await saju.goto(new URL('/__compatibility_fixture', url).href);
    await saju.locator('#report-content[data-ready="confirmed"]').waitFor();
    assert.match(await saju.locator('#fixture-zodiac').textContent(), /말띠.*양띠.*입춘/);
    const zodiacCard=saju.locator('[data-reader-card="zodiac"]');
    assert.equal(await zodiacCard.count(),1);
    assert.match(await zodiacCard.textContent(), /말띠.*양띠/s);
    assert.ok(await zodiacCard.locator('.reader-prose p').count()>=3);
    await zodiacCard.scrollIntoViewIfNeeded();
    assert.equal(await saju.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'the two zodiac reading fits on mobile');
    await saju.screenshot({path:path.join(artifacts,'saju-zodiac-compatibility-mobile.png')});
    await saju.locator('#fixture-pair').selectOption('uncertain');
    await saju.locator('#report-content[data-ready="uncertain"]').waitFor();
    assert.match(await saju.locator('#fixture-zodiac').textContent(), /토끼띠 \/ 용띠/);
    assert.match(await zodiacCard.textContent(), /토끼띠 \/ 용띠/);
    await zodiacCard.scrollIntoViewIfNeeded();
    assert.equal(await saju.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'the two candidate labels wrap on mobile');
    await saju.screenshot({path:path.join(artifacts,'saju-zodiac-boundary-mobile.png')});
    await saju.setViewportSize({width:1280,height:900});
    await saju.locator('#fixture-pair').selectOption('confirmed');
    await zodiacCard.scrollIntoViewIfNeeded();
    await saju.screenshot({path:path.join(artifacts,'saju-zodiac-compatibility-desktop.png')});
    const compatibilityScores={};
    for(const [viewport,size] of [['phone-small',{width:320,height:844}],['phone',{width:390,height:844}],['desktop',{width:1280,height:900}]]) {
      await saju.setViewportSize(size);
      await saju.locator('#report-content').evaluate(report=>{report.dataset.readingSize='normal';});
      compatibilityScores[viewport]={};
      for(const pair of ['confirmed','uncertain']) {
        await saju.locator('#fixture-pair').selectOption(pair);
        await saju.locator('#report-content[data-ready="'+pair+'"]').waitFor();
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
              visible:rect.width>0&&rect.height>0&&style.visibility==='visible',
              unclipped:summary.scrollWidth<=summary.clientWidth+1&&summary.scrollHeight<=summary.clientHeight+1&&
                contained(rect,item.getBoundingClientRect())&&contained(rect,box)};
          });
          const clippedAncestors=[];
          for(let parent=board.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
            const style=getComputedStyle(parent),rect=parent.getBoundingClientRect();
            if((/hidden|clip/.test(style.overflowX)&&(box.left<rect.left-1||box.right>rect.right+1))||
              (/hidden|clip/.test(style.overflowY)&&(box.top<rect.top-1||box.bottom>rect.bottom+1)))clippedAncestors.push(parent.id||parent.className||parent.tagName);
          }
          return {total:Number(total?.textContent.trim()),meters,summaries,
            followsHeading:board.previousElementSibling?.classList.contains('report-section-heading')===true,
            totalVisible:!!total&&total.getBoundingClientRect().width>0&&contained(total.getBoundingClientRect(),box),
            documentOverflow:document.documentElement.scrollWidth>innerWidth,
            boardOverflow:board.scrollWidth>board.clientWidth+1||board.scrollHeight>board.clientHeight+1,
            clippedAncestors,
            insideViewport:box.left>=-1&&box.right<=innerWidth+1,
            clippedText:Array.from(board.querySelectorAll('h2,h3,h4,h5,h6,p,strong,small,summary,dt,dd')).filter(element=>element.clientWidth>0&&element.scrollWidth>element.clientWidth+1).length};
        });
        const label=pair+' '+viewport;
        assert.ok(geometry.followsHeading,label+': scores follow the report heading');
        assert.ok(Number.isInteger(geometry.total)&&geometry.total>=0&&geometry.total<=100,label+': the total is an explicit 0–100 score');
        assert.ok(geometry.totalVisible,label+': the total is visible inside its score summary');
        assert.ok(geometry.meters.every(meter=>meter.valid&&meter.min===0&&meter.max===100&&meter.visible&&meter.inside&&meter.fillMatches),label+': all four bars fit and represent their exact values');
        assert.equal(geometry.summaries.length,4,label+': all four bars have a summary');
        for(const summary of geometry.summaries) {
          assert.ok(summary.visible,label+' '+summary.id+': the summary is visible at regular text size');
          assert.ok(summary.lineHeight>0&&Math.abs(summary.height-2*summary.lineHeight)<=1,label+' '+summary.id+': the rendered summary occupies exactly two lines');
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
        await scoreboard.scrollIntoViewIfNeeded();
        await scoreboard.screenshot({path:path.join(artifacts,'saju-compatibility-scores-'+pair+'-'+viewport+'.png')});
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    console.log(JSON.stringify({ localPreviewOnly: true, tarotViews, sajuTopics: ['lifelong', 'annual', 'monthly', 'all'], sajuSummaryViews, compatibilityScores, viewport: '320×844, 390×844 and 1280×900', errors, failed }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
