const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..');
const tarotOnly = process.argv.includes('--tarot-only');
const artifacts = path.join(__dirname, 'artifacts', 'fortune-readings');
fs.mkdirSync(artifacts, { recursive: true });
const { chromium } = require('playwright');

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff': 'font/woff' };
// Real entry markup and flow controller, without account or billing code.
// The isolated form only supplies native select options and time/calendar
// visibility normally initialized by the app. Validation stays in production.
const entryFixtureScript = `<script type="module">
import {attachEntryFlow} from '/games/starlit-saju/entry-flow.mjs';
import {openCatalogChoice} from '/games/starlit-saju/service-directory.mjs';
const form=document.querySelector('form[data-entry-flow]');
if(document.getElementById('saju-catalog')) openCatalogChoice(document);
for(const prefix of ['birth','self','partner']) {
  if(!document.getElementById(prefix+'-year'))continue;
  for(const [field,start,end,suffix] of [['month',1,12,'월'],['day',1,31,'일'],['hour',0,23,'시'],['minute',0,59,'분']]) {
    const select=document.getElementById(prefix+'-'+field);
    for(let value=start;value<=end;value++){const option=document.createElement('option');option.value=String(value);option.textContent=String(value)+suffix;select.append(option);}
  }
  const unknown=document.getElementById(prefix==='birth'?'time-unknown':prefix+'-time-unknown');
  const timeFields=document.getElementById(prefix==='birth'?'time-fields':prefix+'-time-fields');
  const syncTime=()=>{timeFields.hidden=unknown.checked;for(const field of ['hour','minute'])document.getElementById(prefix+'-'+field).disabled=unknown.checked;};
  unknown.addEventListener('change',syncTime);syncTime();
  const calendar=prefix==='birth'?form.querySelectorAll('input[name="calendar"]'):[document.getElementById(prefix+'-calendar')];
  const syncCalendar=()=>{
    const value=prefix==='birth'?form.querySelector('input[name="calendar"]:checked').value:calendar[0].value;
    document.getElementById(prefix==='birth'?'leap-option':prefix+'-leap-option').hidden=value!=='lunar';
  };
  for(const element of calendar)element.addEventListener('change',syncCalendar);syncCalendar();
}
const year=document.getElementById('entry-year');
if(year)for(let value=2025;value<=2028;value++){const option=document.createElement('option');option.value=String(value);option.textContent=value+'년';year.append(option);}
if(year)year.value='2026';
attachEntryFlow(form);
globalThis.__entryFixture={businessSubmits:0};
form.addEventListener('submit',event=>{event.preventDefault();globalThis.__entryFixture.businessSubmits++;});
form.dataset.fixtureReady='true';
</script>`;
const sajuEntryFixture = tarotOnly ? '' : fs.readFileSync(path.join(repo,'games/starlit-saju/index.html'),'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .replace('<head>','<head><base href="/games/starlit-saju/">')
  .replace('</body>',entryFixtureScript+'</body>');
const compatibilityEntryFixture = tarotOnly ? '' : fs.readFileSync(path.join(repo,'games/starlit-saju/compatibility.html'),'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .replace('<head>','<head><base href="/games/starlit-saju/">')
  .replace('</body>',entryFixtureScript+'</body>');
// Isolated rendering fixture. It uses production calculation and reading modules
// with a published example date, and never loads authentication or billing code.
const sajuFixture = `<!doctype html><html lang="ko" data-reduced-motion="true"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/games/moonlit-tarot/assets/favicon.svg"><link rel="stylesheet" href="/games/starlit-saju/style.css"><link rel="stylesheet" href="/games/starlit-saju/report.css"><link rel="stylesheet" href="/games/starlit-saju/reading-summary.css"><link rel="stylesheet" href="/games/starlit-saju/reading-score.css"><link rel="stylesheet" href="/games/starlit-saju/readable-design.css"><link rel="stylesheet" href="/games/starlit-saju/flow-design.css"><link rel="stylesheet" href="/games/starlit-saju/reading-detail.css"><link rel="stylesheet" href="/games/starlit-saju/almanac.css"><link rel="stylesheet" href="/games/starlit-saju/directory.css"><link rel="stylesheet" href="/games/starlit-saju/clean-reader.css"></head><body class="saju-readable saju-flow saju-edition saju-directory saju-clean"><main><section class="result"><label for="fixture-topic">검사할 풀이</label><select id="fixture-topic"><option value="lifelong">평생운</option><option value="annual">올해운</option><option value="monthly">월별운</option><option value="all">전체 풀이</option></select><div class="detailed-reading" id="report-content"></div></section></main><script type="module">
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
globalThis.__sajuReadingFixture=reading;
globalThis.__sajuScoreFixture = {key:fixtureCase,birth:births[fixtureCase],nativeInteractionCount:fortune.profile.interactions.length,
  daeun:{natalTimeKnown:chart.timeKnown,natalHour:chart.input.hour,available:reading.daeun.available,timeAssumed:reading.daeun.timeAssumed,
    assumedBirthTime:reading.daeun.assumedBirthTime,notice:reading.daeun.birthTimeNotice,periodCount:reading.daeun.periods.length,
    currentPeriodLabel:reading.daeun.periods.find(period=>period.isCurrent)?.periodLabel},
  items:[{key:'portrait-overview',reading:reading.personPortrait},
    {key:'portrait-decisions',reading:reading.personPortrait.cards.find(item=>item.id==='portrait-decisions')},
    {key:'lifelong-overview',reading:reading.reader.lifelong}]};
const target = document.getElementById('report-content');
const select = document.getElementById('fixture-topic');
function show(){
  const content=document.createElement('div');
  renderDetailedReport(content,{reading,fortune,topic:select.value});
  target.replaceChildren(content);
  target.dataset.ready=select.value;
}
select.addEventListener('change',show);show();
</script></body></html>`;
const compatibilityFixture = `<!doctype html><html lang="ko" data-reduced-motion="true"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/games/moonlit-tarot/assets/favicon.svg"><link rel="stylesheet" href="/games/starlit-saju/style.css"><link rel="stylesheet" href="/games/starlit-saju/report.css"><link rel="stylesheet" href="/games/starlit-saju/compatibility.css"><link rel="stylesheet" href="/games/starlit-saju/readable-design.css"><link rel="stylesheet" href="/games/starlit-saju/flow-design.css"><link rel="stylesheet" href="/games/starlit-saju/reading-detail.css"><link rel="stylesheet" href="/games/starlit-saju/almanac.css"><link rel="stylesheet" href="/games/starlit-saju/directory.css"><link rel="stylesheet" href="/games/starlit-saju/clean-reader.css"></head><body class="saju-readable saju-flow saju-edition saju-directory saju-clean"><main class="compatibility-main"><section class="result"><label for="fixture-pair">검사할 두 사람</label><select id="fixture-pair"><option value="confirmed">말띠와 양띠</option><option value="uncertain">입춘일 · 시간 모름</option></select><p id="fixture-zodiac" class="birth-summary"></p><div class="detailed-reading" id="report-content"></div></section></main><script type="module">
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
  globalThis.__compatibilityReadingFixture=reading;
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
    await page.waitForFunction(() => !document.querySelector('#summon-button').disabled);
    await page.locator('#welcome-next').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(artifacts, 'tarot-welcome-mobile.png') });
    const tarotEntryViews = {};
    async function inspectTarotEntry(label, view) {
      const selectors = view === 'welcome' ? '#welcome-title, #welcome-next'
        : '#game-title, #topics button, #intro-context-select, #summon-button';
      const geometry = await page.evaluate(selectors => ({
        view: document.querySelector('#app').dataset.view,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        controls: [...document.querySelectorAll(selectors)].map(element => {
          const box = element.getBoundingClientRect();
          return { id: element.id || element.dataset.topic, visible: box.width > 0 && box.height > 0,
            fits: box.left >= -1 && box.right <= innerWidth + 1 && element.scrollWidth <= element.clientWidth + 1 };
        })
      }), selectors);
      assert.equal(geometry.view, view);
      assert.equal(geometry.horizontalOverflow, false, label + ': the entry fits horizontally');
      assert.ok(geometry.controls.every(control => control.visible && control.fits), label + ': headings and controls remain readable and unclipped');
      const primary = page.locator(view === 'welcome' ? '#welcome-next' : '#summon-button');
      await primary.scrollIntoViewIfNeeded();
      assert.ok(await primary.evaluate(button => {
        const box = button.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return box.width >= 44 && box.height >= 44 && box.top >= -1 && box.bottom <= innerHeight + 1
          && (hit === button || button.contains(hit));
      }), label + ': the primary button is reachable with a full touch target');
      return geometry;
    }
    for (const viewport of [{ width: 320, height: 640 }, { width: 750, height: 750 }]) {
      const label = `${viewport.width}x${viewport.height}`;
      await page.setViewportSize(viewport);
      const welcome = await inspectTarotEntry(label + ' welcome', 'welcome');
      await page.locator('#welcome-next').click();
      const topics = await inspectTarotEntry(label + ' topics', 'topics');
      assert.equal(await page.locator('#app').getAttribute('data-phase'), 'intro', 'welcome and topic navigation do not start a draw');
      tarotEntryViews[label] = { welcome, topics };
      await page.locator('#tarot-back').click();
      await page.locator('#welcome-next').waitFor({ state: 'visible' });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#welcome-next').click();
    await page.locator('#summon-button:not([disabled])').waitFor();
    await page.locator('[data-topic="money"]').click();
    assert.equal(await page.locator('.tarot-price strong').textContent(), '1회 10쭈');
    assert.equal(await page.locator('[data-topic="money"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-topic="overall"]').getAttribute('aria-pressed'), 'false');
    await page.screenshot({ path: path.join(artifacts, 'tarot-intro-mobile.png'), animations: 'disabled' });
    await page.locator('#summon-button').click();
    await page.waitForFunction(() => document.querySelector('#app').dataset.phase === 'choosing');
    await page.screenshot({ path: path.join(artifacts, 'tarot-choice-mobile.png') });
    await page.locator('.card[data-index="0"]').click();
    await page.waitForFunction(() => document.querySelector('#app').dataset.phase === 'choosing');
    await page.locator('.card[data-index="1"]').click();
    await page.waitForFunction(() => document.querySelector('#app').dataset.phase === 'reading');
    const roles = ['지금의 문제', '현재 상황', '해결 방법과 결과'];
    const revealedNames = [];
    async function inspectReaderPage(expected, prefix = 'result') {
      const article = page.locator('#' + prefix + '-reader-page');
      await page.waitForFunction(({prefix,id}) => document.getElementById(prefix + '-reader-page')?.dataset.pageId === id,
        {prefix,id:expected.id});
      assert.equal(await article.getAttribute('data-chapter-id'), expected.chapterId);
      assert.equal(await article.getAttribute('data-group-id'), expected.groupId);
      assert.equal(await page.locator('#' + prefix + '-reader-body [data-page-id]:visible').count(), 1,
        'exactly one current reading page is visible');
      assert.equal(await page.locator('#' + prefix + '-title').textContent(), expected.title);
      assert.deepEqual(await article.locator('.reader-subtitle').allTextContents(), expected.subtitle ? [expected.subtitle] : [],
        'the original source explanation is rendered below its title');
      assert.deepEqual(await article.locator('.reader-paragraph').allTextContents(), expected.paragraphs || []);
      assert.deepEqual(await article.locator('.reader-summary-line').allTextContents(), expected.summaryLines || []);
      assert.deepEqual(await article.locator('.reader-art-caption').allTextContents(), expected.artCaption ? [expected.artCaption] : [],
        'the advice caption identifies the actual drawn card without adding another reading');
      if (expected.art) assert.equal(await article.locator('.reader-art').getAttribute('aria-label'), expected.art.name + ' 카드');
    }
    async function openReaderMenu(prefix = 'result') {
      if (!await page.locator('#' + prefix + '-reader-menu').isVisible()) await page.locator('#' + prefix + '-reader-menu-toggle').click();
      assert.equal(await page.locator('#' + prefix + '-reader-menu-toggle').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#' + prefix + '-reader-body').getAttribute('aria-hidden'), 'true',
        'the reading behind the contents menu is excluded from navigation');
    }
    async function goToReaderPage(expected, pages, prefix = 'result') {
      const first = pages.find(item => item.chapterId === expected.chapterId);
      await openReaderMenu(prefix);
      await page.locator('#' + prefix + '-reader-menu [data-reader-target="' + first.id + '"]').click();
      assert.equal(await page.locator('#' + prefix + '-reader-menu').isVisible(), false);
      const start = pages.findIndex(item => item.id === first.id);
      const target = pages.findIndex(item => item.id === expected.id);
      for (let index = start; index < target; index++) await page.locator('#' + prefix + '-reader-next').click();
      await inspectReaderPage(expected, prefix);
    }
    async function inspectReaderLayout(label, prefix = 'result') {
      const geometry = await page.evaluate(prefix => {
        const dialog = document.getElementById(prefix + '-dialog');
        const body = document.getElementById(prefix + '-reader-body');
        const title = document.getElementById(prefix + '-title');
        const close = document.getElementById(prefix + '-reader-close').getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(title);
        const titleClear = [...range.getClientRects()].every(line =>
          line.right <= close.left || line.left >= close.right || line.bottom <= close.top || line.top >= close.bottom);
        const controls = ['reader-prev','reader-next','reader-menu-toggle','reader-close'].map(name => {
          const button = document.getElementById(prefix + '-' + name), box = button.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return {id:button.id,width:box.width,height:box.height,inside:box.left >= -1 && box.right <= innerWidth + 1
            && box.top >= -1 && box.bottom <= innerHeight + 1,hit:hit === button || button.contains(hit),
            left:box.left,top:box.top,right:box.right,bottom:box.bottom,
            hitElement:hit ? {tag:hit.tagName,id:hit.id,className:hit.className} : null};
        });
        const prose = [...body.querySelectorAll('.reader-paragraph,.reader-summary-line')].map(node => {
          const style = getComputedStyle(node);
          return {text:node.textContent, font:parseFloat(style.fontSize), fits:node.scrollWidth <= node.clientWidth + 1
            && node.scrollHeight <= node.clientHeight + 1, clamp:style.webkitLineClamp, ellipsis:style.textOverflow === 'ellipsis'};
        });
        const dialogBox=dialog.getBoundingClientRect(), dialogStyle=getComputedStyle(dialog);
        const viewportDiagnostics={innerWidth,innerHeight,visualWidth:visualViewport?.width,visualHeight:visualViewport?.height,
          mqDesktop:matchMedia('(min-width:601px)').matches,
          dialog:{left:dialogBox.left,top:dialogBox.top,right:dialogBox.right,bottom:dialogBox.bottom},
          style:{width:dialogStyle.width,height:dialogStyle.height,position:dialogStyle.position,margin:dialogStyle.margin,top:dialogStyle.top,bottom:dialogStyle.bottom}};
        return {viewportDiagnostics,horizontalOverflow:document.documentElement.scrollWidth > innerWidth + 1
          || dialog.scrollWidth > dialog.clientWidth + 1 || body.scrollWidth > body.clientWidth + 1,
          titleClear,controls,prose,scrollable:body.scrollHeight > body.clientHeight + 1,
          bodyHeight:body.clientHeight,scrollStyle:getComputedStyle(body).overflowY};
      }, prefix);
      assert.equal(geometry.horizontalOverflow, false, label + ': the reader has no horizontal overflow');
      assert.equal(geometry.titleClear, true, label + ': the full title stays clear of the close button');
      const reachableControls = geometry.controls.every(control => control.inside && control.hit && control.width >= 43.9 && control.height >= 43.9);
      if (!reachableControls) {
        const name = 'tarot-controls-failure-' + label.replace(/[^a-z0-9-]+/gi, '-');
        fs.writeFileSync(path.join(artifacts, name + '.json'), JSON.stringify(geometry, null, 2));
        await page.screenshot({path:path.join(artifacts, name + '.png'),animations:'disabled'});
        console.error('Tarot control geometry:', JSON.stringify({ viewport: geometry.viewportDiagnostics, controls: geometry.controls }));
      }
      assert.ok(reachableControls,
        label + ': the previous, next, contents and close controls stay reachable with 44px targets');
      assert.ok(geometry.bodyHeight > 100 && /auto|scroll/.test(geometry.scrollStyle), label + ': long content has its own usable scroll area');
      assert.ok(geometry.prose.length && geometry.prose.every(item => item.text && item.font >= 16 && item.fits
        && ['none','','unset'].includes(item.clamp) && !item.ellipsis), label + ': whole original sentences wrap without clipping or ellipses');
      if (geometry.scrollable) {
        const before = await page.locator('#' + prefix + '-reader-page').getAttribute('data-page-id');
        await page.locator('#' + prefix + '-reader-body').evaluate(body => { body.scrollTop = body.scrollHeight; });
        assert.ok(await page.locator('#' + prefix + '-reader-body').evaluate(body => body.scrollTop > 0),
          label + ': the complete page can be scrolled');
        assert.equal(await page.locator('#' + prefix + '-reader-page').getAttribute('data-page-id'), before,
          'vertical reading does not navigate to another page');
        await page.locator('#' + prefix + '-reader-body').evaluate(body => { body.scrollTop = 0; });
      }
      return geometry;
    }
    for (const [slot, index] of [2, 4, 3].entries()) {
      await page.locator('.card[data-index="' + index + '"]').click();
      await page.waitForFunction(phase => document.querySelector('#app').dataset.phase === phase, slot === 2 ? 'complete' : 'reading');
      assert.equal(await page.locator('#reading-dialog').isVisible(), false, 'revealing a card keeps the visitor at the table');
      assert.equal(await page.locator('#result-dialog').isVisible(), false, 'results wait for an explicit action');
      const name = await page.locator('.card[data-index="' + index + '"] .front-title strong').textContent();
      revealedNames.push(name);
      await page.locator('.card[data-index="' + index + '"]').click();
      await page.locator('#reading-dialog[open]').waitFor();
      const cardModel = await page.evaluate(async ({index,slot,role}) => {
        const {DECK,getReading} = await import('/games/moonlit-tarot/readings.js');
        const {buildCardPages} = await import('/games/moonlit-tarot/reading-pages.js');
        const name = document.querySelector('.card[data-index="' + index + '"] .front-title strong').textContent;
        const card = DECK.find(item => item.name === name), reading = getReading(card,'money',slot);
        const positionLabel = ['첫 번째','두 번째','세 번째'][slot] + ' 자리 · ' + role;
        return {pages:buildCardPages(card,reading,{positionLabel}),paragraphs:reading.paragraphs,meaning:reading.meaning,reference:reading.reference.url};
      }, {index,slot,role:roles[slot]});
      assert.ok(cardModel.paragraphs.join('').length >= 350, 'individual card explanations retain their full detail');
      await inspectReaderPage(cardModel.pages[0], 'reading');
      assert.ok((await page.locator('#reading-reader-page').textContent()).includes(roles[slot]));
      const sourcePage = cardModel.pages.find(item => item.links?.some(link => link.url === cardModel.reference));
      assert.ok(sourcePage, 'original card references remain a reachable reader page');
      if (slot === 0) {
        await inspectReaderLayout('individual mobile', 'reading');
        await page.screenshot({path:path.join(artifacts,'tarot-card-mobile.png'),animations:'disabled'});
        await goToReaderPage(sourcePage, cardModel.pages, 'reading');
        assert.match(await page.locator('#reading-reader-page a.reader-source-link').first().getAttribute('href'), /^https:\/\/en\.wikisource\.org\//);
        await page.screenshot({path:path.join(artifacts,'tarot-source-mobile.png'),animations:'disabled'});
      }
      await page.locator('#reading-reader-close').click();
    }
    assert.equal(await page.locator('#action-button').isVisible(), true);
    await page.locator('#action-button').click();
    await page.locator('#result-dialog[open]').waitFor({timeout:15000});
    async function summaryModel(contextId = '') {
      return page.evaluate(async contextId => {
        const {DECK,getSummary,getReading} = await import('/games/moonlit-tarot/readings.js');
        const {buildSummaryPages} = await import('/games/moonlit-tarot/reading-pages.js');
        const {buildPersonalReading,personalReadingCopyLines} = await import('/games/moonlit-tarot/personal-reading.js');
        const {getFortune} = await import('/games/moonlit-tarot/fortune-corpus/index.js');
        const cards = [2,4,3].map(index => {
          const name = document.querySelector('.card[data-index="' + index + '"] .front-title strong').textContent;
          return DECK.find(card => card.name === name);
        });
        const summary = getSummary(cards,'money');
        const report = contextId ? buildPersonalReading({cards,topicId:'money',contextId}) : null;
        return {pages:buildSummaryPages(summary,{cards,personalReport:report}),summary,record:getFortune('money',summary.source.pattern),
          firstCardMeaning:getReading(cards[0],'money',0).meaning,personalCopy:report ? personalReadingCopyLines(report).filter(Boolean) : [],
          personalOptions:report?.comparison?.options || []};
      }, contextId);
    }
    const selectedSource = await summaryModel();
    const tarotViews = {entry:tarotEntryViews,reader:{pages:selectedSource.pages.length,layouts:{}}};
    await inspectReaderPage(selectedSource.pages[0]);
    assert.equal(await page.locator('#result-reader-prev').isDisabled(), true);
    await openReaderMenu();
    const targets = await page.locator('#result-reader-menu [data-reader-target]').evaluateAll(buttons => buttons.map(button => button.dataset.readerTarget));
    const chapterFirst = selectedSource.pages.filter((item,index,pages) => !index || item.chapterId !== pages[index - 1].chapterId);
    assert.deepEqual([...targets].sort(), chapterFirst.map(item => item.id).sort(), 'each distinct topic and appendix has one contents entry');
    assert.equal(await page.locator('#result-context-select option').count(), 4, 'the money reading keeps its three scoped situations');
    const omittedReadingIds = new Set([
      'domains-core-problem','domains-problem-solving','domains-possible-results',
      'domains-past-influence','domains-past-achievements','domains-future-changes',
      'timeline-present-luck','domains-present-flow','domains-my-tendencies','domains-my-strengths',
      'domains-past-hardships','domains-cautions-and-risks','domains-prepare-for-difficulties',
      'domains-concentration-obstacles','domains-spending-habits','domains-life-balance',
      'domains-rest-and-recovery','domains-unexpected-help','domains-life-direction','domains-family-role'
    ]);
    const retainedGroups = selectedSource.summary.groups.map(group => ({...group,
      sections:group.sections.filter(part => !omittedReadingIds.has(group.id + '-' + part.id))}));
    const retainedIds = new Set(retainedGroups.flatMap(group => group.sections.map(part => group.id + '-' + part.id)));
    assert.equal(retainedIds.size, 45);
    assert.equal(chapterFirst.filter(item => retainedIds.has(item.chapterId)).length, 45,
      'all forty-five retained main chapters remain available alongside card-specific references');
    const compact = value => String(value).replace(/\s/gu,'');
    const textValues = value => typeof value === 'string' ? [value]
      : value && typeof value === 'object' ? Object.values(value).flatMap(textValues) : [];
    function assertRemovedReadingText(text, extraAllowed = []) {
      const retainedText = compact(textValues({groups:retainedGroups,details:selectedSource.summary.detailSections,
        ritual:selectedSource.summary.ritual,oneLine:selectedSource.summary.oneLine,extraAllowed}).join('\n'));
      const retainedTitles = new Set(retainedGroups.flatMap(group => group.sections.map(part => part.title)));
      const headings = text.split('\n').map(line => line.replace(/^\s*\d+\.\s*/u,'').trim());
      const actual = compact(text);
      let uniqueSentences = 0;
      for (const group of selectedSource.summary.groups) for (const part of group.sections) {
        const sourceId = group.id + '-' + part.id;
        if (!omittedReadingIds.has(sourceId)) continue;
        if (!retainedTitles.has(part.title)) assert.ok(!headings.includes(part.title), 'an omitted title is not displayed or copied');
        for (const paragraph of [...part.paragraphs,...(part.summaryLines || [])]) {
          for (const sentence of paragraph.split(/(?<=[.!?])\s+/u).filter(Boolean)) {
            const candidate = compact(sentence);
            if (retainedText.includes(candidate)) continue;
            uniqueSentences++;
            assert.ok(!actual.includes(candidate), sourceId + ': its unique prose is not displayed or copied');
          }
        }
      }
      assert.ok(uniqueSentences > 0, 'the removal check includes unique omitted sentences');
    }
    const originals = new Map(selectedSource.summary.groups.flatMap(group => group.sections.map(part => [group.id + '-' + part.id,part])));
    assert.equal(omittedReadingIds.size, 20);
    for (const [sourceId,original] of originals) {
      if (omittedReadingIds.has(sourceId)) {
        assert.ok(!selectedSource.pages.some(item => item.chapterId === sourceId || item.sourceId === sourceId
          || item.sourceIds?.includes(sourceId)), 'a removed reading is absent from both chapters and appended sources');
        continue;
      }
      const sourcePages = selectedSource.pages.filter(item => item.chapterId === sourceId);
      assert.ok(sourcePages.length && sourcePages.every(item => item.sourceId === sourceId && item.sourceIds?.length === 1
        && item.sourceIds[0] === sourceId && item.title === original.title && item.chapterTitle === original.title
        && item.subtitle === (original.subtitle || '')), 'each retained chapter contains only its original reading');
      assert.equal(await page.locator('#result-reader-menu [data-reader-target="' + sourcePages[0].id + '"] .reader-contents-label').textContent(), original.title);
      const text = compact(sourcePages.flatMap(item => [...item.paragraphs,...(item.summaryLines || [])]).join(''));
      for (const paragraph of original.paragraphs) assert.ok(text.includes(compact(paragraph)), 'every retained paragraph remains complete');
    }
    assertRemovedReadingText(selectedSource.pages.flatMap(item => [item.title,item.chapterTitle,item.subtitle,
      ...item.paragraphs,...(item.summaryLines || [])]).filter(Boolean).join('\n'));
    const domainChapters = chapterFirst.filter(item => item.groupId.startsWith('domains:'));
    assert.equal(domainChapters.length, 31);
    assert.equal(new Set(domainChapters.map(item => item.groupId)).size, 9);
    assert.equal(await page.locator('#result-reader-menu .reader-contents-group').evaluateAll(groups =>
      groups.filter(group => group.querySelector('[data-reader-target^="domains-"]')).length), 9,
    'only populated domain categories appear in the menu');
    const domainSource = selectedSource.summary.groups.find(group => group.id === 'domains');
    assert.equal(domainSource.sections.length, 50, 'the raw catalog is unchanged by presentation filtering');
    assert.equal(domainSource.categories.length, 10, 'the raw category catalog stays unchanged');
    for (const category of domainSource.categories) {
      const chapters = domainChapters.filter(item => item.groupId === 'domains:' + category.id);
      assert.equal(chapters.length, domainSource.sections.filter(part => part.categoryId === category.id && !omittedReadingIds.has('domains-' + part.id)).length);
      if (!chapters.length) continue;
      await goToReaderPage(chapters[0], selectedSource.pages);
      await openReaderMenu();
      assert.equal(await page.locator('#result-reader-menu [aria-current="page"]').getAttribute('data-reader-target'), chapters[0].id);
    }
    const solution = selectedSource.pages.filter(item => item.chapterId === 'problem-solution');
    assert.ok(solution.length, 'the retained solution remains readable');
    await goToReaderPage(solution[0], selectedSource.pages);
    await inspectReaderLayout('retained solution first page');
    await page.screenshot({path:path.join(artifacts,'tarot-retained-topic-first-mobile.png'),animations:'disabled'});
    const nextSolutionPage = selectedSource.pages[selectedSource.pages.findIndex(item => item.id === solution[0].id) + 1];
    assert.ok(nextSolutionPage, 'the next reading remains available even when the solution fits on one page');
    await page.locator('#result-reader-next').click();
    await inspectReaderPage(nextSolutionPage);
    await inspectReaderLayout('retained solution next page');
    await page.screenshot({path:path.join(artifacts,'tarot-retained-topic-next-mobile.png'),animations:'disabled'});
    tarotViews.reader.retainedTopic = {chapterId:'problem-solution',sources:solution[0].sourceIds,pages:solution.length};
    const strengths = selectedSource.pages.filter(item => item.chapterId === 'timeline-strengths');
    await goToReaderPage(strengths[0], selectedSource.pages);
    assert.equal(await page.locator('#result-title').textContent(), originals.get('timeline-strengths').title);
    await inspectReaderLayout('retained strengths');
    await page.screenshot({path:path.join(artifacts,'tarot-retained-strengths-mobile.png'),animations:'disabled'});
    await goToReaderPage(strengths[strengths.length - 1], selectedSource.pages);
    const following = selectedSource.pages[selectedSource.pages.findIndex(item => item.id === strengths[strengths.length - 1].id) + 1];
    assert.notEqual(following.chapterId, 'timeline-strengths');
    assert.equal(await page.locator('#result-reader-next').textContent(), '다음 풀이');
    await page.locator('#result-reader-next').click();
    await inspectReaderPage(following);
    tarotViews.reader.prunedTopic = {chapterId:'timeline-strengths',sources:strengths[0].sourceIds,
      pages:strengths.length,nextChapter:following.chapterId};
    const firstStory = chapterFirst.find(item => item.groupId === 'problem');
    await goToReaderPage(firstStory, selectedSource.pages);
    await page.locator('#result-reader-body').focus();
    await page.locator('#result-reader-body').press('ArrowRight');
    await inspectReaderPage(selectedSource.pages[selectedSource.pages.findIndex(item => item.id === firstStory.id) + 1]);
    await page.locator('#result-reader-body').focus();
    await page.locator('#result-reader-body').press('ArrowLeft');
    await inspectReaderPage(firstStory);
    await openReaderMenu();
    await page.locator('#result-reader-menu-toggle').press('Escape');
    assert.equal(await page.locator('#result-reader-menu').isVisible(), false);
    assert.equal(await page.locator('#result-reader-menu-toggle').evaluate(button => button === document.activeElement), true);

    const longPage = selectedSource.pages.slice(0, -1).filter(item => item.paragraphs?.length && !item.links?.length)
      .reduce((longest,item) => item.paragraphs.join('').length > longest.paragraphs.join('').length ? item : longest);
    for (const [label,viewport] of [
      ['small-phone',{width:320,height:640}], ['mobile',{width:390,height:844}], ['desktop',{width:750,height:750}]
    ]) {
      await page.setViewportSize(viewport);
      // Chromium may retain the old top-layer <dialog> dimensions for one paint
      // while a live reading is open. Verify that responsive layout really settled
      // before hit-testing; a persistent off-screen control still fails.
      await page.waitForFunction(size => {
        const dialog = document.getElementById('result-dialog');
        const bounds = dialog?.getBoundingClientRect();
        return innerWidth === size.width && innerHeight === size.height
          && !!bounds && bounds.top >= -1 && bounds.left >= -1
          && bounds.bottom <= size.height + 1 && bounds.right <= size.width + 1;
      }, viewport, { timeout: 3500 });
      await goToReaderPage(longPage, selectedSource.pages);
      tarotViews.reader.layouts[label] = await inspectReaderLayout(label);
      await page.screenshot({path:path.join(artifacts,'tarot-reader-' + label + '.png'),animations:'disabled'});
      await page.locator('#result-reader-body').evaluate(body => { body.scrollTop = body.scrollHeight; });
      const index = selectedSource.pages.findIndex(item => item.id === longPage.id);
      await page.locator('#result-reader-next').click();
      await inspectReaderPage(selectedSource.pages[index + 1]);
      assert.equal(await page.locator('#result-reader-body').evaluate(body => body.scrollTop), 0, 'changing the page resets its own scroll');
      await page.locator('#result-reader-prev').click();
      await inspectReaderPage(longPage);
      await openReaderMenu();
      const menuGeometry = await page.locator('#result-reader-menu').evaluate(menu => ({
        overflow:menu.scrollWidth > menu.clientWidth + 1,
        entries:[...menu.querySelectorAll('[data-reader-target]')].map(button => {
          const box = button.getBoundingClientRect();
          return {width:box.width,height:box.height,fits:button.scrollWidth <= button.clientWidth + 1};
        })
      }));
      assert.equal(menuGeometry.overflow, false);
      assert.ok(menuGeometry.entries.every(button => button.width >= 44 && button.height >= 44 && button.fits),
        label + ': every contents entry has a readable full-size button');
    }
    await page.setViewportSize({width:390,height:844});
    let currentModel = selectedSource;
    for (const contextId of ['money-spending','money-saving','money-agreement']) {
      await openReaderMenu();
      await page.locator('#result-context-select').selectOption(contextId);
      currentModel = await summaryModel(contextId);
      const firstPersonal = currentModel.pages.find(item => item.groupId === 'personal');
      await inspectReaderPage(firstPersonal);
      assert.equal(await page.locator('#result-reader-menu').isVisible(), false, 'choosing a situation moves directly to its own first page');
      const personalPages = currentModel.pages.filter(item => item.groupId === 'personal');
      for (const option of currentModel.personalOptions) {
        const chapterId = 'personal-' + option.id;
        const choicePages = personalPages.filter(item => item.chapterId === chapterId);
        assert.ok(choicePages.length, 'each personal choice has one contents chapter');
        const choiceText = choicePages.flatMap(item => [...item.paragraphs,...(item.summaryLines || [])]).join('').replace(/\s/gu,'');
        for (const [key,subtitle] of [['gain','이 선택의 장점'],['burden','감수할 부담'],['prepare','먼저 준비할 것']]) {
          assert.ok(!personalPages.some(item => item.chapterId === chapterId + '-' + key), 'choice criteria do not repeat as separate topics');
          assert.ok(choicePages.some(item => item.subtitle === subtitle), 'each criterion keeps its readable subtitle');
          assert.ok(choiceText.includes(option[key].replace(/\s/gu,'')), 'the complete choice criterion remains on its pages');
        }
        await goToReaderPage(choicePages[0], currentModel.pages);
      }
      await goToReaderPage(personalPages[personalPages.length - 1], currentModel.pages);
    }
    await page.evaluate(() => {
      globalThis.__tarotCopiedReading = '';
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{async writeText(text){globalThis.__tarotCopiedReading=text;}}});
    });
    await openReaderMenu();
    await page.locator('#copy-result').click();
    await page.waitForFunction(() => globalThis.__tarotCopiedReading.length > 0);
    const copiedTarot = await page.evaluate(() => globalThis.__tarotCopiedReading);
    const copiedOrder = ['\n카드 소개\n','\n나의 이야기\n','\n과거·현재·미래\n','\n분야별 풀이\n','\n내 상황 · ']
      .map(heading => copiedTarot.indexOf(heading));
    assert.ok(copiedOrder.every((position,index) => position >= 0 && (!index || position > copiedOrder[index - 1])));
    for (const group of retainedGroups) for (const section of group.sections) {
      for (const paragraph of section.paragraphs) assert.ok(copiedTarot.includes(paragraph), 'copy includes every retained paragraph on unseen pages');
    }
    assertRemovedReadingText(copiedTarot, currentModel.personalCopy);
    const copiedTitles = copiedTarot.split('\n').map(line => line.replace(/^\d+\.\s*/u,''));
    for (const part of retainedGroups.find(group => group.id === 'domains').sections) {
      assert.equal(copiedTitles.filter(title => title === part.title).length, 1, 'copy includes each retained domain title once');
    }
    for (const source of selectedSource.summary.detailSections) assert.ok(copiedTarot.includes(source.body));
    for (const text of [selectedSource.record.body,selectedSource.record.action]) assert.equal(copiedTarot.split(text).length - 1, 1);
    for (const line of currentModel.personalCopy) assert.ok(copiedTarot.includes(line), 'copy keeps every personal answer and both choices');
    assert.ok(copiedTarot.slice(copiedOrder[0],copiedOrder[1]).includes(selectedSource.firstCardMeaning));
    const sourcePage = currentModel.pages.find(item => item.chapterId === 'problem-detail-0' && item.paragraphs.length);
    await goToReaderPage(sourcePage, currentModel.pages);
    await inspectReaderLayout('selected source');
    await page.screenshot({path:path.join(artifacts,'tarot-source-interpretation-mobile.png'),animations:'disabled'});
    await page.locator('#result-reader-close').click();
    await page.locator('#action-button').click();
    await page.locator('#result-dialog[open]').waitFor();
    await inspectReaderPage(sourcePage);
    await openReaderMenu();
    assert.equal(await page.locator('#result-context-select').inputValue(), 'money-agreement', 'reopening preserves the chosen situation');
    await page.locator('#result-reader-menu-toggle').click();
    tarotViews.sourceInterpretation = {record:selectedSource.record.id,completeRetainedCopy:true,removedReadings:20,
      domainChapters:31,domainGroups:9,contexts:3,widths:[320,390,750]};
    if (tarotOnly) {
      assert.deepEqual(errors,[]);
      assert.deepEqual(failed,[]);
      console.log(JSON.stringify({localPreviewOnly:true,tarotViews,errors,failed}));
      return;
    }
    const saju = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
    saju.on('pageerror', error => errors.push(error.message));
    saju.on('response', response => { if (response.status() >= 400) failed.push([response.status(), response.url()]); });
    await saju.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    const sajuEntryViews={},compatibilityEntryViews={},sajuNavigation={},sajuReadableViews={};
    async function inspectReadableSurface(label,{text,body='',minimumBody=18,minimumLabel=14,minimumInput=16,
      minimumTargetWidth=44,minimumTargetHeight=44,controls='',placeholders=false}={}) {
      const view=await saju.evaluate(({text,body,minimumBody,minimumLabel,minimumTargetWidth,minimumTargetHeight,controls,placeholders})=>{
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
          smallText:samples.filter(item=>item.font<minimumLabel),clippedText:samples.filter(item=>item.overflow||item.textOverflow==='ellipsis'||!['none','','unset'].includes(item.lineClamp)),
          prose,smallProse:prose.filter(item=>item.font<minimumBody),smallTargets:targets.filter(item=>item.height<minimumTargetHeight-.1||item.width<minimumTargetWidth-.1),
          minimumTargetHeight:targets.length?Math.min(...targets.map(item=>item.height)):null,
          horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
          inputs:[...document.querySelectorAll('input[type=text],input[type=number],select')].filter(shown).map(element=>({id:element.id,font:parseFloat(getComputedStyle(element).fontSize),scheme:getComputedStyle(element).colorScheme}))};
      },{text,body,minimumBody,minimumLabel,minimumTargetWidth,minimumTargetHeight,controls,placeholders});
      assert.ok(view.samples>0,label+': representative text is visible');
      assert.deepEqual(view.unresolvedBackgrounds,[],label+': contrast uses the actual solid surfaces behind text');
      assert.deepEqual(view.contrastFailures,[],label+': text contrast is at least 4.5:1');
      assert.deepEqual(view.smallText,[],label+': labels follow the selected readable size');
      assert.deepEqual(view.clippedText,[],label+': complete text remains visible without clamping or horizontal clipping');
      if(body)assert.ok(view.prose.length>0,label+': the current story has readable body text');
      assert.deepEqual(view.smallProse,[],label+': reading text follows the normal/large size');
      assert.deepEqual(view.smallTargets,[],label+': actionable controls retain their intended touch target');
      assert.equal(view.horizontalOverflow,false,label+': the redesigned page stays inside the viewport');
      assert.ok(view.inputs.every(input=>input.font>=minimumInput&&input.scheme==='dark'),label+': readable input text and native menus use the dark surface');
      sajuReadableViews[label]={samples:view.samples,minimumContrast:view.minimumContrast,minimumBodyFont:view.prose.length?Math.min(...view.prose.map(item=>item.font)):null,minimumTargetHeight:view.minimumTargetHeight};
      return view;
    }
    const entryText='h1,h2,.intro-description,.compatibility-intro>p,.entry-benefits li,.entry-steps li,.form-step-title,.field-label,fieldset legend,.field-hint,.form-note,.saju-price-note,.saju-price strong,.product-option strong,.product-option small,.product-option b,.check-row span,.reading-service-nav strong,.reading-service-nav>a>span,.method-preview summary,button:not(:disabled),.back-link,.segmented span,.pair-calendar>label,.pair-privacy,.entry-heading>p,.flow-step-note,.flow-privacy,.flow-review-person h3,.flow-review dt,.flow-review dd,.flow-confirm-title';
    const entryControls='button,input[type=text],input[type=number],select,.check-row,.segmented label,.product-options>label,.reading-service-nav>a,.header-nav .back-link';
    const readingText='.story-label,.story-title,.story-body p,.story-context,.saju-wind-label,.saju-wind-value,.saju-reading-score-reason';
    const compatibilityText='.story-label,.story-title,.story-body p,.story-context,.compatibility-score-eyebrow,.compatibility-score-number strong,.compatibility-score-number>span,.compatibility-score-number small,.compatibility-score-label,.compatibility-score-item-heading h5,.compatibility-score-item-value,.compatibility-score-notice';
    const sajuFlowViews={};
    const entrySizes=[['phone-small',{width:320,height:844}],['phone',{width:390,height:844}],['desktop',{width:1280,height:900}]];
    async function assertFlowStage(form,expected,label) {
      await saju.waitForFunction(({id,expected})=>{const node=document.getElementById(id);return node.dataset.flowBusy!=='true'&&node.dataset.flowStep===String(expected);},{id:await form.getAttribute('id'),expected});
      const stages=form.locator('[data-flow-step]:visible');
      assert.equal(await stages.count(),1,label+': only the current input stage is shown');
      assert.equal(await stages.first().getAttribute('data-flow-step'),String(expected));
      assert.equal(await saju.evaluate(()=>globalThis.__entryFixture.businessSubmits),0,label+': moving between input stages never reaches the purchase handler');
    }
    async function nextFlow(form,expected,label) {
      await form.locator('[data-flow-next]:visible').click();
      await assertFlowStage(form,expected,label);
    }
    async function formSnapshot(form) {
      return form.locator('input,select').evaluateAll(nodes=>nodes.map(node=>({id:node.id||node.name,value:node.value,checked:node.checked,disabled:node.disabled})));
    }
    async function fillEntry(prefix,{name,gender='female',year,month,day}) {
      const identity=prefix==='birth'?'person':prefix;
      const optional=saju.locator('.optional-person').filter({has:saju.locator('#'+identity+'-name')});
      if(!await optional.evaluate(node=>node.open))await optional.locator('summary').click();
      await saju.locator('#'+identity+'-name').fill(name);
      await saju.locator('#'+identity+'-gender').selectOption(gender);
      await saju.locator('#'+prefix+'-year').fill(String(year));
      await saju.locator('#'+prefix+'-month').selectOption(String(month));
      await saju.locator('#'+prefix+'-day').selectOption(String(day));
    }
    async function entryScreens(kind,viewport,step) {
      if(viewport==='phone')return;
      await saju.evaluate(()=>window.scrollTo(0,0));
      await saju.screenshot({path:path.join(artifacts,'saju-flow-'+kind+'-'+viewport+'-'+step+'.png'),fullPage:true});
      if(step==='information'||step==='person-a') {
        await saju.screenshot({path:path.join(artifacts,'saju-readable-entry-'+kind+'-'+viewport+'-top.png')});
        await saju.screenshot({path:path.join(artifacts,'saju-readable-entry-'+kind+'-'+viewport+'.png'),fullPage:true});
      }
    }
    for(const [viewport,size] of entrySizes) {
      await saju.setViewportSize(size);await saju.goto(new URL('/__saju_entry_fixture',url).href);
      const catalog=saju.locator('#saju-catalog');
      await catalog.waitFor();
      assert.equal(await saju.locator('#birth-year').isVisible(),false);
      assert.equal(await catalog.locator('.catalog-list a').count(),5);
      await inspectReadableSurface('service catalog '+viewport,{text:'.catalog-cover h1,.catalog-index h2,.catalog-caption strong,.catalog-caption small,.catalog-price,.catalog-saved',controls:'.catalog-row,.catalog-saved'});
      await saju.screenshot({path:path.join(artifacts,'saju-directory-'+viewport+'.png'),fullPage:true});
      await saju.route('**/games/starlit-saju/?reading=*',route=>route.fulfill({contentType:'text/html',body:sajuEntryFixture}));
      await catalog.locator('a[href="?reading=annual"]').click();
      const form=saju.locator('#birth-form');await form.locator('[data-flow-step="0"]').waitFor();
      assert.equal(await form.locator('[name="entry-topic"]:checked').inputValue(),'annual');
      await form.and(saju.locator('[data-fixture-ready="true"]')).waitFor();
      await assertFlowStage(form,0,'general '+viewport);
      const date=await saju.locator('#birth-year').boundingBox();
      assert.ok(date&&date.y>=0&&date.y+date.height<=size.height,'general '+viewport+': the birth date is reachable in the first viewport');
      assert.equal(await saju.locator('#entry-product-picker').isVisible(),false,'product choices wait until the information stage is complete');
      assert.equal(await saju.locator('#open-story').isVisible(),false,'the purchase action is not mixed into the birth-input stage');
      const optional=form.locator('.optional-person');
      assert.equal(await optional.evaluate(node=>node.open),false,'optional identity starts folded');
      await entryScreens('general',viewport,'information');
      await optional.locator('summary').click();
      const geometry=await form.evaluate(form=>{
        const shown=element=>element.getBoundingClientRect().width>0&&element.getBoundingClientRect().height>0;
        const fonts=selector=>Array.from(form.querySelectorAll(selector)).filter(shown).map(element=>({id:element.id||element.className,size:parseFloat(getComputedStyle(element).fontSize)}));
        const gender=form.querySelector('#person-gender'),style=getComputedStyle(gender),measure=document.createElement('canvas').getContext('2d');
        measure.font=style.fontWeight+' '+style.fontSize+' '+style.fontFamily;
        return {inputs:fonts('input[type=number],input[type=text],select'),notices:fonts('.field-hint,.form-note'),
          gender:{textWidth:measure.measureText(gender.selectedOptions[0].textContent).width,availableWidth:gender.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-16},
          checks:Array.from(form.querySelectorAll('.check-row')).filter(shown).map(element=>element.getBoundingClientRect().height),
          overflow:document.documentElement.scrollWidth>innerWidth||form.scrollWidth>form.clientWidth+1};
      });
      assert.ok(geometry.inputs.length>=5&&geometry.inputs.every(field=>field.size>=16),viewport+': input text remains readable');
      assert.ok(geometry.notices.every(field=>field.size>=14),viewport+': input instructions remain readable');
      assert.ok(geometry.checks.length>0&&geometry.checks.every(height=>height>=44));
      assert.equal(geometry.overflow,false);assert.ok(geometry.gender.textWidth<=geometry.gender.availableWidth);
      sajuEntryViews[viewport]=geometry;
      await inspectReadableSurface('general entry '+viewport,{text:entryText,controls:entryControls,placeholders:true});
      assert.equal(await form.locator('.person-inputs .field-label:visible,.date-inputs .field-label:visible').count(),5,'name, gender, year, month and day have visible labels');
      if(viewport==='phone-small')await saju.locator('.birth-panel').screenshot({path:path.join(artifacts,'saju-entry-phone-small.png')});
      await fillEntry('birth',{name:'예시 이름',year:1990,month:2,day:31});
      await nextFlow(form,0,'invalid February date '+viewport);
      assert.ok(await form.locator('[data-flow-step="0"] [data-flow-error]:visible').textContent(),'a real calendar error explains why the step cannot continue');
      await saju.locator('#birth-month').selectOption('5');await saju.locator('#birth-day').selectOption('17');
      await saju.locator('#time-unknown').uncheck();
      assert.equal(await saju.locator('#birth-hour').inputValue(),'');assert.equal(await saju.locator('#birth-minute').inputValue(),'');
      await saju.locator('#birth-hour').selectOption('8');
      await nextFlow(form,0,'missing minute '+viewport);
      assert.equal(await saju.locator('#birth-minute').inputValue(),'','a missing minute is never silently replaced by zero');
      await saju.locator('#birth-minute').selectOption('37');
      await saju.locator('#birth-year').focus();await saju.locator('#birth-year').press('Tab');
      assert.equal(await saju.evaluate(()=>document.activeElement?.id),'birth-month');
      assert.ok(await saju.locator('#birth-month').evaluate(element=>parseFloat(getComputedStyle(element).outlineWidth)>=2));
      await saju.locator('#birth-year').press('Enter');
      await assertFlowStage(form,1,'general Enter '+viewport);
      assert.equal(await saju.locator('#entry-product-picker').isVisible(),false);
      await saju.locator('#change-product > summary').click();
      assert.equal(await saju.locator('#entry-product-picker').isVisible(),true);
      assert.equal(await saju.locator('#birth-year').isVisible(),false);
      const review=form.locator('[data-flow-review]:visible');
      assert.ok((await review.textContent()).includes('1990'),'confirmation repeats the entered birth information');
      const selectedProduct=saju.locator('input[name="entry-topic"][value="annual"]');
      await selectedProduct.focus();await selectedProduct.press('Space');assert.equal(await selectedProduct.isChecked(),true);
      const optionStyles=await saju.locator('#entry-product-picker .product-option').evaluateAll(options=>options.slice(0,2).map(option=>{
        const style=getComputedStyle(option);return [style.backgroundColor,style.backgroundImage,style.borderColor,style.borderWidth,style.boxShadow];
      }));
      assert.notDeepEqual(optionStyles[0],optionStyles[1],'the chosen product is visibly marked');
      const values=await formSnapshot(form);
      await form.locator('[data-flow-back]:visible').click();await assertFlowStage(form,0,'general back '+viewport);
      assert.deepEqual(await formSnapshot(form),values,'going back preserves all birth fields and the selected product');
      await nextFlow(form,1,'general continue '+viewport);assert.deepEqual(await formSnapshot(form),values);
      await saju.locator('input[name="entry-topic"][value="lifelong"]').check();
      await inspectReadableSurface('general entry choice '+viewport,{text:entryText,controls:entryControls});
      await entryScreens('general',viewport,'choice');
      sajuFlowViews['general '+viewport]={stages:2,firstViewportDate:true,calendarRejected:true,missingMinuteRejected:true,enterAdvances:true,retained:true,purchaseSubmits:0};
    }
    await saju.evaluate(()=>{
      const error=document.getElementById('form-error');error.textContent='입력한 생년월일을 확인해 주세요.';error.hidden=false;
      document.getElementById('payment-status').textContent='선택한 풀이와 금액을 확인해 주세요.';document.getElementById('open-story').disabled=false;
    });
    await inspectReadableSurface('general entry feedback',{text:'#form-error,#payment-status,#open-story'});
    for(const [viewport,size] of entrySizes) {
      await saju.setViewportSize(size);await saju.goto(new URL('/__compatibility_entry_fixture',url).href);
      const form=saju.locator('#compatibility-form');await form.and(saju.locator('[data-fixture-ready="true"]')).waitFor();
      await assertFlowStage(form,0,'compatibility A '+viewport);
      assert.equal(await saju.locator('.compatibility-person:visible').count(),1,'one person is filled at a time');
      assert.equal(await saju.locator('#partner-year').isVisible(),false);
      assert.equal(await saju.locator('#compatibility-open').isVisible(),false);
      const date=await saju.locator('#self-year').boundingBox();
      assert.ok(date&&date.y>=0&&date.y+date.height<=size.height,'compatibility '+viewport+': A’s birth date is in the first viewport');
      const view=await inspectReadableSurface('compatibility entry '+viewport,{text:entryText,controls:entryControls,placeholders:true});
      await entryScreens('compatibility',viewport,'person-a');
      await fillEntry('self',{name:'예시 A',year:1990,month:5,day:17});
      await saju.locator('#self-year').press('Enter');await assertFlowStage(form,1,'compatibility Enter '+viewport);
      assert.equal(await saju.locator('#partner-year').isVisible(),true);
      assert.equal(await saju.locator('#self-year').isVisible(),false);
      await nextFlow(form,1,'empty B '+viewport);
      assert.equal(await form.locator('[data-flow-step="1"] [data-flow-error]:visible').count(),1,'B has its own required-field feedback');
      await fillEntry('partner',{name:'예시 B',gender:'male',year:1992,month:3,day:14});
      await inspectReadableSurface('compatibility entry B '+viewport,{text:entryText,controls:entryControls});
      await entryScreens('compatibility',viewport,'person-b');
      await nextFlow(form,2,'compatibility confirm '+viewport);
      const values=await formSnapshot(form),review=await form.locator('[data-flow-review]:visible').textContent();
      assert.ok(['예시 A','예시 B','1990','1992'].every(value=>review.includes(value)),'the confirmation keeps both people distinguishable');
      assert.equal(await saju.locator('#compatibility-price').textContent(),'궁합 · 20쭈');
      await form.locator('[data-flow-back]:visible').click();await assertFlowStage(form,1,'compatibility back B '+viewport);
      assert.deepEqual(await formSnapshot(form),values);
      await form.locator('[data-flow-back]:visible').click();await assertFlowStage(form,0,'compatibility back A '+viewport);
      assert.deepEqual(await formSnapshot(form),values);
      await nextFlow(form,1,'compatibility resume B '+viewport);await nextFlow(form,2,'compatibility resume confirm '+viewport);
      assert.deepEqual(await formSnapshot(form),values,'A and B retain all fields through a full back/forward round trip');
      await inspectReadableSurface('compatibility entry confirm '+viewport,{text:entryText,controls:entryControls});
      await entryScreens('compatibility',viewport,'confirm');
      compatibilityEntryViews[viewport]={minimumContrast:view.minimumContrast,inputs:view.inputs.length};
      sajuFlowViews['compatibility '+viewport]={stages:3,firstViewportDate:true,emptyBRejected:true,enterAdvances:true,retained:true,purchaseSubmits:0};
    }
    await saju.evaluate(()=>{
      const error=document.getElementById('compatibility-error');error.textContent='두 사람의 생년월일을 확인해 주세요.';error.hidden=false;
      document.getElementById('compatibility-status').textContent='입력한 정보를 확인해 주세요.';document.getElementById('compatibility-open').disabled=false;
    });
    await inspectReadableSurface('compatibility entry feedback',{text:'#compatibility-error,#compatibility-status,#compatibility-open'});
    // The production reader starts on a flat story. Contents, period choices
    // and complete text are inspected through that same visible reading flow.
    async function assertCurrentExplanation(page,currentAttribute,{requireBody=false}={}) {
      const current=page.locator('['+currentAttribute+']');
      assert.equal(await current.count(),1,'exactly one live story is mounted');
      const state=await current.evaluate(element=>{
        const shown=node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden';};
        const body=[...element.querySelectorAll('.story-body > p')],reader=element.closest('.story-reader');
        const progress=reader.querySelector('.reading-progress'),counter=reader.querySelector('.story-position').textContent.match(/(\d+)\s*\/\s*(\d+)/);
        return {id:element.id,source:element.dataset.storySource,topic:element.dataset.storyTopic,
          title:element.querySelector('.story-title')?.textContent,titleCount:element.querySelectorAll('.story-title').length,
          paragraphs:body.length,hiddenParagraphs:body.filter(p=>!shown(p)).map(p=>p.textContent),
          oldStructure:element.querySelectorAll('.reading-map,.reader-card,.portrait-card,.compatibility-person-reading,details').length,
          selected:reader.querySelector('.reading-page-select').value,
          now:Number(progress.getAttribute('aria-valuenow')),max:Number(progress.getAttribute('aria-valuemax')),
          counter:counter?.slice(1).map(Number),width:parseFloat(progress.firstElementChild.style.width),
          overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.ok(state.source&&state.topic&&state.title.trim());assert.equal(state.titleCount,1);
      assert.equal(state.oldStructure,0,'nested source reports are absent from the selected story');
      assert.ok(state.paragraphs<=2,'one story has at most two short paragraphs');
      if(requireBody)assert.ok(state.paragraphs>0,'the selected story exposes its authored text directly');
      assert.deepEqual(state.hiddenParagraphs,[]);assert.equal(state.selected,state.id);
      assert.deepEqual(state.counter,[state.now,state.max]);assert.ok(state.now>=1&&state.now<=state.max);
      assert.ok(Math.abs(state.width-state.now/state.max*100)<.001,'progress matches the current topic position');
      assert.equal(state.overflow,false,'a story fits the viewport width');return state;
    }
    async function selectVisibleReading(page,pickerId,id,{keyboard=false}={}) {
      const picker=page.locator('#'+pickerId),nav=page.locator('#'+pickerId+'-navigator');
      const options=await picker.locator('option').evaluateAll(nodes=>nodes.map(node=>node.value));
      const target=options.indexOf(id);assert.ok(target>=0,id+': the entitled scene exists');
      const choices=new Set(await nav.locator('[data-reading-target]').evaluateAll(nodes=>nodes.map(node=>node.dataset.readingTarget)));
      let first=target;while(first>=0&&!choices.has(options[first]))first--;
      assert.ok(first>=0,id+': a contents topic reaches this scene');
      const dialog=nav.locator('dialog.story-menu'),toggle=nav.locator('.story-menu-button');
      if(await dialog.getAttribute('open')===null)await toggle.click();
      const item=nav.locator('[data-reading-target="'+options[first]+'"]');
      const domain=await item.getAttribute('data-reading-domain');
      const field=nav.locator('.reading-domain-button[data-reading-domain="'+domain+'"]');
      if(await field.getAttribute('aria-pressed')!=='true')await field.click();
      const period=await item.getAttribute('data-reading-period');
      if(period&&await nav.locator('.story-period-select').inputValue()!==period)await nav.locator('.story-period-select').selectOption(period);
      assert.equal(await item.isVisible(),true,id+': its field and period reveal the requested topic');
      if(keyboard){await item.focus();await item.press('Enter');}else await item.click();
      assert.equal(await dialog.getAttribute('open'),null,'choosing a topic closes contents');
      assert.equal(await toggle.evaluate(element=>element===document.activeElement),true,'contents returns keyboard focus to its opening button');
      for(let index=first;index<target;index++)await page.locator('.story-next').click();
      assert.equal(await picker.inputValue(),id);
      return assertCurrentExplanation(page,pickerId==='reading-page-select'?'data-reader-current':'data-compatibility-current');
    }
    async function followStoryAlias(id) {
      await saju.evaluate(id=>{const link=document.createElement('a');link.id='fixture-story-alias';link.href='#'+id;link.textContent='풀이로 이동';document.body.append(link);},id);
      await saju.locator('#fixture-story-alias').click();
      await saju.locator('#fixture-story-alias').evaluate(link=>link.remove());
      assert.equal(await saju.locator('.story-title').evaluate(element=>element===document.activeElement),true,'an old anchor reveals and focuses the visible scene title');
    }
    async function collectStories(page,pickerId,{firstId,topicOnly=false,restore=true}={}) {
      const picker=page.locator('#'+pickerId),saved=await picker.inputValue();
      await selectVisibleReading(page,pickerId,firstId||await picker.locator('option').first().getAttribute('value'));
      const records=await page.evaluate(({pickerId,topicOnly})=>{
        const picker=document.getElementById(pickerId),reader=picker.closest('.story-reader'),next=reader.querySelector('.story-next');
        const current=()=>reader.querySelector('[data-reader-current],[data-compatibility-current]');
        const topic=current().dataset.storyTopic,records=[];
        for(let count=0;count<picker.options.length;count++) {
          const scene=current();if(topicOnly&&scene.dataset.storyTopic!==topic)break;
          const ids=[...scene.querySelectorAll('[id]')].map(node=>node.id);ids.push(scene.id);
          records.push({id:scene.id,source:scene.dataset.storySource,topic:scene.dataset.storyTopic,kind:scene.dataset.storyKind,
            data:{...scene.dataset},title:scene.querySelector('.story-title').textContent,label:scene.querySelector('.story-label').textContent,
            context:scene.querySelector('.story-context')?.textContent||'',text:scene.textContent,uniqueIds:new Set(ids).size===ids.length,
            summaries:[...scene.querySelectorAll('[data-story-summary-index]')].map(node=>({index:Number(node.dataset.storySummaryIndex),text:node.textContent})),
            paragraphs:[...scene.querySelectorAll('.story-body > p')].map(node=>({key:node.dataset.storyParagraph,start:Number(node.dataset.storyStart),end:Number(node.dataset.storyEnd),text:node.textContent})),
            scores:[...scene.querySelectorAll('.saju-reading-score')].map(panel=>({status:panel.dataset.readingScoreStatus,
              reason:panel.querySelector('.saju-reading-score-reason')?.textContent||'',values:[...panel.querySelectorAll('.saju-wind-item')].map(row=>({key:row.dataset.wind,
                value:Number(row.querySelector('[role="meter"]').getAttribute('aria-valuenow')),width:row.querySelector('.saju-wind-fill').style.width}))})),
            graph:scene.querySelector('.compatibility-scoreboard')?{total:Number(scene.querySelector('[data-score-total]').textContent),
              values:[...scene.querySelectorAll('.compatibility-score-meter')].map(meter=>Number(meter.getAttribute('aria-valuenow')))}:null});
          if(next.disabled)break;next.click();
        }
        return records;
      },{pickerId,topicOnly});
      assert.ok(records.length);assert.ok(records.every(record=>record.uniqueIds),'current scenes have no duplicate IDs');
      if(!topicOnly)assert.equal(records.length,await picker.locator('option').count(),'normal next reaches every entitled scene');
      if(restore)await selectVisibleReading(page,pickerId,saved);return records;
    }
    function summaryLines(records) {
      const lines=new Map();for(const part of records.flatMap(record=>record.summaries))lines.set(part.index,(lines.get(part.index)||'')+part.text);
      return [...lines.values()];
    }
    // Share the outcome-based Saju validator: omitted body units must remain
    // complete in this same topic's visible summary; unique prose stays intact.
    const {assertOriginalParagraphs:assertVisibleProse}=require('./helpers/saju-story-ui.cjs');
    const {isRemovedGeneralStory,removedGeneralCards,removedCompatibilityCards}=require('./helpers/saju-selected-readings.cjs');
    function storyParts(records,item) {
      const groups=new Map();for(const record of records){if(!groups.has(record.topic))groups.set(record.topic,[]);groups.get(record.topic).push(record);}
      const choices=[...groups.values()].filter(group=>JSON.stringify(summaryLines(group))===JSON.stringify(item.summaryLines));
      const exact=item.id&&choices.find(group=>group.some(record=>[record.source,record.topic,record.data.readerCard,record.data.portraitCard,record.data.daeunTopic,record.data.readingSupplement].includes(item.id)));
      const complete=item.paragraphs&&choices.find(group=>{
        try {assertVisibleProse(group,item.paragraphs);return true;}
        catch(error){if(error.code==='ERR_ASSERTION')return false;throw error;}
      });
      const found=exact||complete||choices[0];assert.ok(found,(item.id||item.label||item.headline)+': its original summary is reachable');return found;
    }
    function assertSourceStory(parts,item,{scoreValue=false}={}) {
      assert.deepEqual(summaryLines(parts),item.summaryLines,'both selected summary units survive the story sequence');
      if(item.paragraphs)assertVisibleProse(parts,scoreValue?[item.value+'점 / 100점',...item.paragraphs]:item.paragraphs,
        'the story keeps its unique prose and displays each omitted complete sentence in its own summary');
      if(item.readingScore) {
        const panels=parts.flatMap(record=>record.scores);assert.equal(panels.length,1);assert.equal(parts.find(record=>record.kind==='summary').scores.length,1);
        const score=item.readingScore;assert.equal(panels[0].status,score.status);
        if(score.available)assert.deepEqual(panels[0].values,['tailwind','headwind'].map(key=>({key,value:score[key].value,width:score[key].value+'%'})));
        else {assert.equal(panels[0].values.length,0);assert.equal(panels[0].reason,score.reason);}
      }
    }
    async function inspectReadingControls(label,pickerId,currentAttribute) {
      const picker=saju.locator('#'+pickerId),nav=saju.locator('#'+pickerId+'-navigator'),dialog=nav.locator('dialog.story-menu');
      const first=await picker.locator('option').first().getAttribute('value');await selectVisibleReading(saju,pickerId,first);
      assert.equal(await picker.isVisible(),false);assert.equal(await dialog.getAttribute('open'),null);
      await nav.locator('.story-menu-button').click();const domains=nav.locator('.reading-domain-button');
      const ids=await domains.evaluateAll(nodes=>nodes.map(node=>node.dataset.readingDomain));assert.ok(ids.length>=2);
      const before=await picker.inputValue();await domains.first().focus();await domains.first().press('ArrowRight');
      assert.equal(await domains.nth(1).getAttribute('aria-pressed'),'true');assert.equal(await picker.inputValue(),before,'filtering contents does not turn the story behind it');
      await domains.nth(1).press('ArrowLeft');assert.equal(await domains.first().getAttribute('aria-pressed'),'true');
      await dialog.press('Escape');assert.equal(await dialog.getAttribute('open'),null);
      const topicIds=await nav.locator('[data-reading-target]').evaluateAll(nodes=>nodes.slice(1,3).map(node=>node.dataset.readingTarget));
      for(const id of topicIds)await selectVisibleReading(saju,pickerId,id,{keyboard:true});
      await selectVisibleReading(saju,pickerId,first);const next=saju.locator('.story-next'),previous=saju.locator('.story-previous');
      await next.focus();for(let count=0;count<2;count++){await next.press('Enter');await assertCurrentExplanation(saju,currentAttribute);assert.equal(await next.evaluate(node=>node===document.activeElement),true);}
      await previous.focus();await previous.press('Enter');await previous.press('Enter');assert.equal(await picker.inputValue(),first);
      sajuNavigation[label]={domainKeyboard:true,contentsFocus:true,nextSteps:2,previousSteps:2};
    }
    const sajuScoreViews={},sajuScoreRegressions={},sajuDaeunAssumptionViews={},sajuSummaryViews={},sajuSupplementViews={};
    const compatibilityPeople={},compatibilityScores={};
    const storySizes=[['phone-small',{width:320,height:844}],['phone',{width:390,height:844}],['desktop',{width:1280,height:900}]];
    async function inspectStorySurface(label,{compatibility=false,textSize='normal'}={}) {
      await inspectReadableSurface(label,{text:compatibility?compatibilityText:readingText,body:'.story-body > p',minimumBody:textSize==='large'?21:18,
        minimumLabel:compatibility?12:13,minimumTargetWidth:40,minimumTargetHeight:44,controls:'.story-previous,.story-next'});
    }
    async function inspectSajuScores(label,expected) {
      const panel=saju.locator('[data-reader-current] > .saju-reading-score');assert.equal(await panel.count(),1);
      const value=await panel.evaluate(element=>{
        const box=element.getBoundingClientRect();
        const rows=[...element.querySelectorAll('.saju-wind-item')].map(row=>{
          const meter=row.querySelector('[role="meter"]'),fill=row.querySelector('.saju-wind-fill'),track=meter.getBoundingClientRect(),filled=fill.getBoundingClientRect(),bounds=row.getBoundingClientRect();
          return {key:row.dataset.wind,value:Number(meter.getAttribute('aria-valuenow')),min:Number(meter.getAttribute('aria-valuemin')),max:Number(meter.getAttribute('aria-valuemax')),
            width:fill.style.width,visible:track.width>0&&track.height>0,exact:Math.abs(filled.width-track.width*Number(meter.getAttribute('aria-valuenow'))/100)<=2,
            text:row.textContent,left:bounds.left,right:bounds.right,top:bounds.top,bottom:bounds.bottom};
        });
        return {status:element.dataset.readingScoreStatus,reason:element.querySelector('.saju-reading-score-reason')?.textContent||'',rows,
          inside:box.left>=-1&&box.right<=innerWidth+1,overflow:element.scrollWidth>element.clientWidth+1,height:box.height};
      });
      assert.equal(value.status,expected.status);assert.ok(value.inside&&!value.overflow);
      if(expected.available) {
        assert.equal(value.rows.length,2);assert.ok(value.height<=44,'the two independent meters occupy one compact line');
        assert.ok(Math.abs(value.rows[0].top-value.rows[1].top)<2&&value.rows[1].left>=value.rows[0].right-1,'both directions share a single row without overlap');
        for(const row of value.rows){assert.equal(row.value,expected[row.key].value);assert.equal(row.width,row.value+'%');assert.equal(row.min,0);assert.equal(row.max,100);assert.ok(row.visible&&row.exact&&row.text.includes(row.value+'점'));}
      } else {assert.equal(value.rows.length,0);assert.equal(value.reason,expected.reason);}
      sajuScoreViews[label]=value.rows.map(row=>row.value);return value;
    }
    async function inspectSummary(parts,item,label,{compatibility=false,textSize='normal'}={}) {
      const id=parts.find(record=>record.kind==='summary').id,pickerId=compatibility?'compatibility-page-select':'reading-page-select';
      await selectVisibleReading(saju,pickerId,id);
      assert.equal(await saju.locator('.story-title').textContent(),item.summaryLines[0],'the first core sentence appears once as the title');
      await inspectStorySurface(label,{compatibility,textSize});
      if(item.readingScore)await inspectSajuScores(label,item.readingScore);
      return saju.locator('.story-body > p').first().evaluate(node=>parseFloat(getComputedStyle(node).fontSize));
    }
    for(const [kind,urlPath,attribute] of [['general','/__saju_fixture','data-reader-current'],['pair','/__compatibility_fixture','data-compatibility-current']]) {
      await saju.goto(new URL(urlPath,url).href);await saju.locator('#report-content[data-ready]').waitFor();
      assert.equal(await saju.locator('.reading-map,.map-return,.reading-item-picker').count(),0,'first render directly presents a story without an overview step');
      assert.equal(await saju.locator('dialog.story-menu').getAttribute('open'),null);
      for(const [viewport,size] of storySizes){await saju.setViewportSize(size);await assertCurrentExplanation(saju,attribute,{requireBody:true});await inspectStorySurface(kind+' first story '+viewport,{compatibility:kind==='pair'});await saju.screenshot({path:path.join(artifacts,'saju-story-first-'+kind+'-'+viewport+'.png')});}
    }
    await saju.goto(new URL('/__saju_fixture',url).href);await saju.locator('#report-content[data-ready="lifelong"]').waitFor();
    assert.equal(await saju.locator('#report-content > .story-reader').count(),1);await inspectReadingControls('general','reading-page-select','data-reader-current');
    for(const topic of ['lifelong','annual','monthly','all']) {
      await saju.locator('#fixture-topic').selectOption(topic);await saju.locator('#report-content[data-ready="'+topic+'"]').waitFor();
      const expected=await saju.evaluate(topic=>{const r=globalThis.__sajuReadingFixture;return topic==='annual'?r.reader.annual:topic==='monthly'?r.reader.months.find(item=>item.month===11):r.personPortrait;},topic);
      assert.equal(await saju.locator('.story-title').textContent(),expected.summaryLines[0]);
      await assertCurrentExplanation(saju,'data-reader-current',{requireBody:true});await inspectSajuScores(topic+' initial',expected.readingScore);
      assert.equal(await saju.locator('.report-chapter,.reading-full-text,.source-entry,[data-fact-id],a[href*="-evidence"],a[href*="-chapter-"]').count(),0);
      assert.ok(await saju.locator('#reading-page-select option').evaluateAll(options=>options.every(option=>!/근거|계산·해석|계산 단원|자료 출처/.test(option.textContent))));
    }
    const sourceJSON=await saju.evaluate(()=>JSON.stringify(globalThis.__sajuReadingFixture));
    const allStories=await collectStories(saju,'reading-page-select');
    assert.equal(await saju.evaluate(()=>JSON.stringify(globalThis.__sajuReadingFixture)),sourceJSON,'story navigation does not rewrite the original reading or copy model');
    const model=await saju.evaluate(()=>{
      const r=globalThis.__sajuReadingFixture,current=r.daeun.periods.find(period=>period.isCurrent)||r.daeun.periods[0];
      return {examples:[['portrait',r.personPortrait],['portrait decisions',r.personPortrait.cards.find(item=>item.id==='portrait-decisions')],['lifelong money',r.reader.lifelong.cards.find(item=>item.id==='natal-money')],['annual',r.reader.annual],['month',r.reader.months.find(item=>item.month===11)],['month money',r.reader.months.find(item=>item.month===11).cards.find(item=>item.id.endsWith('-money'))],['decade',r.daeun],['decade period',current],['decade topic',current.topics[0]],['symbols',r.reader.symbols]],
        supplements:[...r.reader.supplements.lifelong,...r.reader.supplements.annual,...r.reader.supplements.months.find(item=>item.month===11).cards],
        scopes:r.reader.lifelong.cards.filter(item=>item.scopeNotice),coverage:r.readingScope.paragraphs};
    });
    assert.ok(allStories.every(record=>!isRemovedGeneralStory(record)),'removed duplicate sources are absent from the complete next sequence');
    assert.equal(await saju.locator('dialog.story-menu details').count(),0,'the purchased contents contains no expandable subject groups');
    for(const [,item] of model.examples)assertSourceStory(storyParts(allStories,item),item);
    for(const [viewport,size] of storySizes) {
      await saju.setViewportSize(size);let normalFont;
      for(const textSize of ['normal','large']) {
        await saju.locator('#report-content').evaluate((node,size)=>{node.dataset.readingSize=size;},textSize);
        const checked=[];
        for(const [family,item] of model.examples) {
          const parts=storyParts(allStories,item),label=viewport+' '+textSize+' '+family;
          const font=await inspectSummary(parts,item,label,{textSize});checked.push(family);
          if(family==='portrait'){if(textSize==='normal')normalFont=font;else assert.ok(font>normalFont,'large text enlarges the actual story body');await saju.screenshot({path:path.join(artifacts,'saju-story-'+viewport+'-'+textSize+'.png')});}
        }
        sajuSummaryViews[viewport+' '+textSize]=checked;
      }
    }
    // A period selector exposes one month or one ten-year interval, while all
    // topics and scene values remain available through normal navigation.
    await saju.locator('.story-menu-button').click();
    const menu=saju.locator('dialog.story-menu');
    for(const domain of ['monthly','daeun']) {
      await menu.locator('.reading-domain-button[data-reading-domain="'+domain+'"]').click();
      const period=menu.locator('.story-period-select');assert.equal(await period.isVisible(),true);
      const values=await period.locator('option').evaluateAll(nodes=>nodes.map(node=>node.value));assert.ok(values.length>=10);
      await period.selectOption(values[1]);
      const visible=await menu.locator('[data-reading-target]:visible').evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.readingTarget,period:node.dataset.readingPeriod})));
      assert.ok(visible.length>0&&visible.length<40);assert.ok(visible.every(item=>item.period===values[1]));
      const before=await saju.locator('#reading-page-select').inputValue();await period.selectOption(values[2]);assert.equal(await saju.locator('#reading-page-select').inputValue(),before);
      sajuNavigation[domain]={periods:values.length,visibleTopics:visible.length};
    }
    await menu.locator('.story-menu-close').click();
    for(const id of ['reading-lifelong','reading-annual','reading-months','person-portrait-topic-1']){await followStoryAlias(id);await assertCurrentExplanation(saju,'data-reader-current');}
    const coverage=allStories.filter(record=>record.source==='reading-coverage');
    for(const item of model.supplements) {
      assert.equal(allStories.some(record=>record.kind!=='scope'&&record.data.readingSupplement===item.id),false,'supplemental explanation is removed rather than folded');
      assert.equal(coverage.some(record=>record.text.includes(item.scopeNotice)),false,'an explanation of a deleted supplement does not become another guidance page');
    }
    for(const item of model.scopes){const parts=removedGeneralCards.has(item.id)?coverage:storyParts(allStories,item);assert.ok(parts.some(part=>part.text.includes(item.scopeNotice)));}
    for(const text of model.coverage)assert.ok(coverage.some(record=>record.text.includes(text)));
    sajuSupplementViews.complete={removedReadings:model.supplements.length,scopeNotices:model.scopes.length,coverage:true};
    await saju.goto(new URL('/__saju_fixture?score-case=original-zero',url).href);await saju.locator('#report-content[data-ready]').waitFor();
    const regression=await saju.evaluate(()=>globalThis.__sajuScoreFixture);assert.equal(regression.nativeInteractionCount,0);
    const regressionStories=await collectStories(saju,'reading-page-select');
    for(const {key,reading:item} of regression.items) {
      assert.equal(item.readingScore.calculation.rule,'confirmed-reading-cues-v2');
      const authored=[...item.paragraphs,item.title,item.headline].filter(Boolean).join('\n');
      for(const axis of key==='lifelong-overview'?['tailwind']:['tailwind','headwind']){
        const signal=axis==='tailwind'?'help':'care',cues=item.readingScore.calculation.cues.filter(cue=>cue[signal]>0);
        assert.ok(cues.length&&cues.every(cue=>cue.sources[signal].every(source=>source.anchor&&authored.includes(source.anchor))));assert.ok(item.readingScore[axis].value>0);
      }
      if(key==='lifelong-overview') {
        assert.ok(regressionStories.every(record=>record.data.readingOverview!=='legacy-lifelong'));
        sajuScoreRegressions[key]={tailwind:item.readingScore.tailwind.value,headwind:item.readingScore.headwind.value,displayed:false};
        continue;
      }
      const parts=storyParts(regressionStories,item);assertSourceStory(parts,item);
      for(const [viewport,size] of storySizes){await saju.setViewportSize(size);for(const textSize of ['normal','large']){await saju.locator('#report-content').evaluate((node,size)=>{node.dataset.readingSize=size;},textSize);await inspectSummary(parts,item,'original-zero '+key+' '+viewport+' '+textSize,{textSize});}}
      sajuScoreRegressions[key]={tailwind:item.readingScore.tailwind.value,headwind:item.readingScore.headwind.value,completeParagraphs:item.paragraphs.length};
    }
    await saju.goto(new URL('/__saju_fixture?score-case=unknown-daeun',url).href);await saju.locator('#report-content[data-ready]').waitFor();
    const assumed=await saju.evaluate(()=>({meta:globalThis.__sajuScoreFixture.daeun,reading:globalThis.__sajuReadingFixture.daeun}));
    assert.equal(assumed.meta.natalTimeKnown,false);assert.equal(assumed.meta.natalHour,null);assert.equal(assumed.meta.timeAssumed,true);
    assert.deepEqual(assumed.meta.assumedBirthTime,{hour:6,minute:0,timezone:'Asia/Seoul'});assert.equal(assumed.meta.periodCount,9);
    for(const [viewport,size] of [storySizes[0],storySizes[2]]) {
      await saju.setViewportSize(size);const textSize=viewport==='phone-small'?'large':'normal';
      await saju.locator('#report-content').evaluate((node,size)=>{node.dataset.readingSize=size;},textSize);
      for(const period of assumed.reading.periods)for(const id of [period.id,period.topics[0].id]) {
        await selectVisibleReading(saju,'reading-page-select',id);
        const context=saju.locator('.story-context');assert.equal(await context.isVisible(),true);
        const text=await context.textContent();assert.ok(text.includes(assumed.meta.notice)&&text.includes(period.periodLabel),'dates and the six-AM assumption accompany the selected period');
        await assertCurrentExplanation(saju,'data-reader-current');
      }
      await inspectStorySurface('assumed daeun '+viewport,{textSize});await saju.screenshot({path:path.join(artifacts,'saju-story-assumed-daeun-'+viewport+'.png')});
      sajuDaeunAssumptionViews[viewport]={...assumed.meta,textSize};
    }
    await saju.goto(new URL('/__compatibility_fixture',url).href);await saju.locator('#report-content[data-ready]').waitFor();
    await inspectReadingControls('compatibility','compatibility-page-select','data-compatibility-current');
    assert.equal(await saju.locator('#compatibility-page-select').inputValue(),'compatibility-synthesis');
    for(const pair of ['confirmed','uncertain']) {
      await saju.locator('#fixture-pair').selectOption(pair);await saju.locator('#report-content[data-ready="'+pair+'"]').waitFor();
      const source=await saju.evaluate(()=>globalThis.__compatibilityReadingFixture),records=await collectStories(saju,'compatibility-page-select');
      assert.ok(records.every(record=>!removedCompatibilityCards.has(record.data.readerCard)&&record.source!=='compatibility-reading-overview'));
      assert.match(await saju.locator('#fixture-zodiac').textContent(),pair==='confirmed'?/말띠.*양띠.*입춘/:/토끼띠 \/ 용띠/);
      const graphs=records.filter(record=>record.graph);assert.equal(graphs.length,1,'the full score panel is in the ordinary next sequence');
      assert.deepEqual(graphs[0].graph,{total:source.score.total,values:source.score.items.map(item=>item.value)});
      for(const [index,person] of source.people.entries())for(const item of [person,...person.cards]) {
        const parts=storyParts(records,item);assertSourceStory(parts,item);assert.ok(parts.every(part=>part.data.personMarker===(index===0?'A':'B')));
        assert.ok(parts[0].label.includes(index===0?'A · 길게 입력한 첫 번째 예시 이름':'B · 길게 입력한 두 번째 예시 이름'));
      }
      assertSourceStory(storyParts(records,source.synthesis),source.synthesis);
      for(const item of source.score.items){const parts=records.filter(record=>record.source==='compatibility-score-detail-'+item.id);assertSourceStory(parts,item,{scoreValue:true});assert.equal(summaryLines(parts).join('\n'),item.summary);}
      for(const text of source.readingScope.paragraphs)assert.ok(records.filter(record=>record.source==='compatibility-reading-coverage').some(record=>record.text.includes(text)));
      const zodiac=records.filter(record=>record.data.readerCard==='zodiac');assert.ok(zodiac.length);assert.match(zodiac.map(record=>record.text).join(' '),pair==='confirmed'?/말띠.*양띠/s:/토끼띠 \/ 용띠/);
      for(const [viewport,size] of storySizes) {
        await saju.setViewportSize(size);
        for(const textSize of ['normal','large']) {
          await saju.locator('#report-content').evaluate((node,size)=>{node.dataset.readingSize=size;},textSize);
          for(const [index,person] of source.people.entries()) {
            const parts=storyParts(records,person);await inspectSummary(parts,person,pair+' '+viewport+' '+textSize+' person '+index,{compatibility:true,textSize});
            await saju.screenshot({path:path.join(artifacts,'saju-story-person-'+pair+'-'+index+'-'+viewport+'-'+textSize+'.png')});
          }
          await inspectSummary(storyParts(records,source.synthesis),source.synthesis,pair+' '+viewport+' '+textSize+' synthesis',{compatibility:true,textSize});
          await selectVisibleReading(saju,'compatibility-page-select',graphs[0].id);
          const geometry=await saju.locator('.compatibility-scoreboard').evaluate(board=>{
            const box=board.getBoundingClientRect();return {total:Number(board.querySelector('[data-score-total]').textContent),inside:box.left>=-1&&box.right<=innerWidth+1,
              meters:[...board.querySelectorAll('.compatibility-score-meter')].map(meter=>{const track=meter.getBoundingClientRect(),fill=meter.querySelector('.compatibility-score-fill').getBoundingClientRect(),value=Number(meter.getAttribute('aria-valuenow'));return {value,min:meter.getAttribute('aria-valuemin'),max:meter.getAttribute('aria-valuemax'),visible:track.width>0&&track.height>0,exact:Math.abs(fill.width-track.width*value/100)<=2};})};
          });
          assert.equal(geometry.total,source.score.total);assert.equal(geometry.meters.length,4);assert.ok(geometry.inside);
          assert.deepEqual(geometry.meters.map(meter=>meter.value),source.score.items.map(item=>item.value));assert.ok(geometry.meters.every(meter=>meter.visible&&meter.exact&&meter.min==='0'&&meter.max==='100'));
          await inspectStorySurface(pair+' '+viewport+' '+textSize+' scores',{compatibility:true,textSize});
          await saju.screenshot({path:path.join(artifacts,'saju-story-score-'+pair+'-'+viewport+'-'+textSize+'.png')});
          // Each bar's explanation is now its own reachable story, so no hidden
          // duplicate summary or obsolete back-link is clicked on the chart.
          for(const item of source.score.items){const parts=records.filter(record=>record.source==='compatibility-score-detail-'+item.id);await inspectSummary(parts,item,pair+' '+viewport+' '+textSize+' '+item.id,{compatibility:true,textSize});}
          compatibilityPeople[pair+' '+viewport+' '+textSize]={people:2,separateStories:true,completeProse:true};
          compatibilityScores[pair+' '+viewport+' '+textSize]={total:geometry.total,items:geometry.meters.map(meter=>meter.value)};
        }
      }
      for(const id of ['compatibility-scores','compatibility-score-title','compatibility-score-temperament-summary']){await followStoryAlias(id);assert.equal(await saju.locator('.story-scene[data-compatibility-current]').getAttribute('data-story-source'),'compatibility-scores');}
      assert.equal(await saju.locator('.source-entry,[data-fact-id],a[href*="-evidence"]').count(),0);
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
          const picker=swipe.locator('#'+pickerId),current=swipe.locator('['+currentAttribute+']'),pager=swipe.locator('.story-steps');
          const first=await current.getAttribute('id');
          const controls=pager.locator('.reading-pager-step');
          await controls.last().click();
          const second=await current.getAttribute('id');
          await controls.first().click();assert.equal(await current.getAttribute('id'),first);

          // Start on actual paragraph glyphs, so PC dragging is verified over
          // reading text rather than only over blank card padding.
          async function paragraphPoints(direction) {
            await assertCurrentExplanation(swipe,currentAttribute,{requireBody:true});
            const paragraph=current.locator('.story-body > p:visible').first();
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
          await assertCurrentExplanation(swipe,currentAttribute,{requireBody:true});
          swipeStage='right text drag';points=await paragraphPoints(1);await gesture(points.from,points.to);
          assert.equal(await current.getAttribute('id'),first,label+': a right drag returns to the prior reading');
          await assertCurrentExplanation(swipe,currentAttribute,{requireBody:true});
          swipeStage='first page boundary';points=await paragraphPoints(1);await gesture(points.from,points.to);
          assert.equal(await current.getAttribute('id'),first,label+': the first reading does not wrap');

          let verticalScroll=null;
          if(cdp) {
            swipeStage='native vertical scroll';
            points=await paragraphPoints(-1);
            const from={x:points.from.x,y:Math.max(230,points.from.y)},to={x:points.from.x+3,y:Math.max(230,points.from.y)-160};
            const before=await swipe.evaluate(()=>({y:scrollY,available:document.documentElement.scrollHeight-innerHeight-scrollY}));await gesture(from,to);
            // A short story can fit without vertical overflow. When it has room
            // to scroll, native movement still works and never turns a story.
            if(before.available>40)await swipe.waitForFunction(before=>scrollY>before+10,before.y);
            verticalScroll=(await swipe.evaluate(()=>scrollY))-before.y;
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
            await current.locator('.story-body > p:visible').first().evaluate(element=>{
              const range=document.createRange();range.selectNodeContents(element);
              getSelection().removeAllRanges();getSelection().addRange(range);
            });
            points=await paragraphPoints(-1);await gesture(points.from,points.to);
            assert.equal(await current.getAttribute('id'),first,label+': an existing selected passage is not a swipe');
            await swipe.evaluate(()=>getSelection().removeAllRanges());
          }
          swipeStage='paging controls';
          await pager.evaluate(element=>element.scrollIntoView({block:'start',behavior:'instant'}));
          const touchAction=await pager.evaluate(element=>getComputedStyle(element.closest('.reading-swipe-enabled')).touchAction);
          assert.equal(await pager.locator('.reading-swipe-hint').count(),0,'page controls work without extra gesture instructions');
          assert.ok(touchAction.includes('pan-y')&&touchAction.includes('pinch-zoom'),label+': native vertical scrolling and zoom remain available');
          assert.equal(await swipe.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,label+': swipe UI fits the viewport');
          sajuSwipeViews[label]={first,second,leftSteps:1,rightSteps:1,bounded:true,verticalScroll,touchAction};
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
          const current=slide.locator('['+currentAttribute+']'),pager=slide.locator('.story-steps'),steps=pager.locator('.reading-pager-step');
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
            await settled();await assertCurrentExplanation(slide,currentAttribute);return value;
          }
          async function points(direction,distance=120) {
            await assertCurrentExplanation(slide,currentAttribute,{requireBody:true});
            const paragraph=current.locator('.story-body > p:visible').first();
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
          assert.equal(await slide.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'다음 이야기',label+': the next control retains focus');
          await steps.last().click();await settled();
          await steps.first().click();assert.equal(await current.getAttribute('id'),second);await inspectSlide(-1);
          assert.equal(await slide.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'이전 이야기',label+': the previous control retains focus');
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
    console.log(JSON.stringify({ localPreviewOnly: true, tarotViews, sajuTopics: ['lifelong', 'annual', 'monthly', 'all'], sajuEntryViews, compatibilityEntryViews, sajuFlowViews, sajuReadableViews, sajuNavigation, sajuSummaryViews, sajuSupplementViews, sajuScoreViews, sajuScoreRegressions, sajuDaeunAssumptionViews, compatibilityPeople, compatibilityScores, sajuSwipeViews, sajuMotionViews, viewport: '320×844, 390×844 and 1280×900', errors, failed }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
