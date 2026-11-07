'use strict';
// Production browser smoke for the standalone festival schedule and arcade route.
// Checks rendered UI, not just the JSON payload.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const origin = 'https://ojjuda.kr';
const snapshotDir = '/tmp/festival-live-ui';
fs.mkdirSync(snapshotDir, { recursive: true });

async function waitLoaded(page) {
  await page.waitForFunction(() => /^[0-9]+$/.test(
    document.getElementById('result-count')?.textContent?.trim() || ''
  ), { timeout: 55000 });
}

async function verifyCard(page, id, name) {
  const card = page.locator('[data-event-card="' + id + '"]');
  await card.waitFor({ state: 'visible', timeout: 35000 });
  const visibleName = await card.locator('.card-title').innerText();
  assert(visibleName.includes(name), 'Wrong visible card: ' + visibleName);
  await card.locator('[data-open-event="' + id + '"]').click();
  const dialog = page.locator('#event-dialog');
  await dialog.waitFor({ state: 'visible', timeout: 12000 });
  const detail = await page.locator('#event-detail').innerText();
  assert(detail.includes(name), 'Missing name in actual detail: ' + id);
  assert(detail.includes('출처:'), 'Missing official source in actual detail: ' + id);
  await page.locator('[data-action="close-event"]').click();
  console.log('PASS visible card and official-source detail: ' + id);
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
  const jsErrors = [];
  page.on('pageerror', error => jsErrors.push(error.message));

  try {
    const dataResp = await page.request.get(origin + '/games/festival-schedule/events.json', {
      timeout: 45000, headers: { 'Cache-Control': 'no-cache' }
    });
    assert.equal(dataResp.status(), 200, 'Deployed events.json unavailable');
    const payload = await dataResp.json();
    const ids = new Set(payload.events.map(event => event.id));
    const added = [
      'iksan-chrysanthemum-2026', 'boryeong-mud-2026', 'gimje-horizon-2026',
      'namwon-chunhyang-2026', 'yesan-apple-festival-2026', 'chungnam-drone-festa-2026',
      'jeongeup-gujeolcho-2026', 'muju-firefly-2026'
    ];
    assert.equal(payload.events.length, 276, 'Live deployed count does not match merged main');
    added.forEach(id => assert(ids.has(id), 'Missing new event in deployed JSON: ' + id));
    assert(ids.has('international-robot-contest-2026'));
    assert(!ids.has('international-robot-contest-2026-daegu'));
    const newer = ['sejong-egg-run-2026', 'sejong-mind-health-reboot-walk-2026',
      'daejeon-energy-walk-2026', 'daejeon-mind-chess-kids-olympiad-2026',
      'daejeon-public-research-results-expo-2026', 'daejeon-world-photovoltaic-exhibition-2026',
      'daejeon-future-education-expo-2026', 'daejeon-pet-fair-2026',
      'daejeon-fruit-industry-expo-2026', 'daejeon-creature-carelog-reptile-2026',
      'daejeon-forest-career-fair-2026'];
    newer.forEach(id => assert(ids.has(id), 'Missing November 7 addition in live JSON: ' + id));
    console.log('PASS production JSON: 276 entries, previous eight and new eleven events, no duplicate robot');

    await page.goto(origin + '/games/festival-schedule/index.html?period=all&category=festival&view=list&q=익산',
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitLoaded(page);
    assert.equal(await page.locator('[data-category="festival"]').count(), 1);
    assert.equal(await page.locator('[data-category="sports"]').count(), 1);
    assert.equal(await page.locator('[data-category="performance"]').count(), 1);
    await verifyCard(page, 'iksan-chrysanthemum-2026', '익산 천만송이 국화축제');

    await page.locator('#search').fill('보령머드축제');
    await verifyCard(page, 'boryeong-mud-2026', '보령머드축제');

    await page.locator('#search').fill('김제지평선축제');
    await verifyCard(page, 'gimje-horizon-2026', '김제지평선축제');
    await page.screenshot({ path: path.join(snapshotDir, 'standalone.png'), fullPage: true });
    console.log('PASS standalone: three festival events actually displayed');

    await page.locator('#search').fill('');
    await page.locator('#period').selectOption('all');
    await page.locator('[data-category="sports"]').click();
    await page.waitForFunction(() => document.querySelector('#result-count')?.textContent?.trim() !== '…');
    assert((await page.locator('.event-card').count()) > 0, 'No sports cards rendered');
    await page.locator('[data-category="performance"]').click();
    assert((await page.locator('.event-card').count()) > 0, 'No performance cards rendered');
    console.log('PASS sports and performance categories render event cards');

    await page.locator('#search').fill('마음건강 걷기대회');
    await page.locator('[data-category="sports"]').click();
    await verifyCard(page, 'sejong-mind-health-reboot-walk-2026', '마음건강 걷기대회');
    await page.locator('#search').fill('대전펫페어');
    await page.locator('[data-category="performance"]').click();
    await verifyCard(page, 'daejeon-pet-fair-2026', '대전펫페어');
    await page.locator('#search').fill('');
    console.log('PASS new 2026 sports and exhibition cards and official-source details');

    const arcade = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
    arcade.on('pageerror', error => jsErrors.push('world: ' + error.message));
    await arcade.goto(origin + '/world.html?game=festival', { waitUntil: 'domcontentloaded', timeout: 60000 });
    // The modal inserts an iframe before navigation finishes; waiting for frames()
    // immediately after the element appears races with the iframe load.
    await arcade.waitForFunction(() => {
      const frame = document.querySelector('.festival-schedule-dialog[open] iframe');
      const text = frame?.contentDocument?.getElementById('result-count')?.textContent?.trim() || '';
      return /^[0-9]+$/.test(text);
    }, { timeout: 60000 });
    const festivalFrame = arcade.frameLocator('.festival-schedule-dialog[open] iframe');
    const arcadeCount = await festivalFrame.locator('[data-event-card]').count();
    assert(arcadeCount > 0, 'Arcade iframe did not render event cards');
    await arcade.screenshot({ path: path.join(snapshotDir, 'world-game-festival.png'), fullPage: true });
    console.log('PASS world.html?game=festival: embedded page rendered ' + arcadeCount + ' cards');
    if(jsErrors.length) console.warn('Non-fatal browser console errors: ' + JSON.stringify(jsErrors.slice(0, 10)));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error('FAIL live production browser smoke:', error.stack || String(error));
  process.exitCode = 1;
});
