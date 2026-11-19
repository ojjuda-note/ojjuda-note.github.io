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
    assert(payload.events.length >= 715, 'Deployed data missing latest 715 events');
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
    const newest = ['paju-hope-sharing-art-festival-2026', 'seongnam-hip-festa-20261121',
      'paju-municipal-gu-hospital-musical-20261120', 'pro-kovo-202627-20261117-ibk-red',
      'pro-kovo-202627-20261120-hipass-ibk', 'pro-kovo-202627-20261125-ibk-hipass',
      'pro-kovo-202627-20261128-red-ibk'];
    newest.forEach(id => assert(ids.has(id), 'Missing November 14 update in live JSON: ' + id));
    assert.equal(payload.events.find(e => e.id === 'hoengseong-hanwoo-2026')?.attendance?.count,
      400163, 'Missing official 2026 Hoengseong attendance');
    const hasNovember15Update = ids.has('giverun-busan-20261121');
    if (hasNovember15Update) {
      assert(ids.has('changwon-tongil-marathon-20261115'), 'Missing official Changwon marathon');
      assert.equal(payload.events.find(e => e.id === 'gimhae-buncheong-2026')?.attendance?.count,
        97887, 'Missing Gimhae 2026 official attendance');
      assert(payload.events.length >= 717, 'Deployed events count must include November 15 updates');
      console.log('PASS production JSON: November 15 sports additions and Gimhae official attendance');
    }
    // November 18 official Jeonbuk sports and previous-year festival attendance.
    const n61Sports = [
      'jeonju-education-chief-jumprope-20261121',
      'muju-firefly-peace-marathon-20261122',
      'jeonbuk-residents-tennis-20261121',
      'gimje-trail-race-revenge-20261128',
      'gochang-moyangseong-cup-tennis-20261128',
      'moak-trailrun-20261205',
      'jeongeup-hometown-love-marathon-20261206',
      'sunchang-jangryu-tennis-20261129',
      'jeonbuk-tennis-association-club-cup-20261205'
    ];
    assert(payload.events.length >= 745, 'Deployed data missing November 18 sports');
    n61Sports.forEach(id => assert(ids.has(id), 'Missing November 18 live sports event: ' + id));
    const sunchang = payload.events.find(e => e.id === 'sunchang-tteokbokki-2026');
    assert.equal(sunchang?.attendance?.count, 40000);
    assert.equal(sunchang?.attendance?.kind, 'previous');
    assert.equal(sunchang?.attendance?.year, 2025);
    console.log('PASS November 18 live JSON: nine sports and previous 2025 attendance');
    // November 19: official Daejeon/Sejong/Chungbuk performing arts and exhibition.
    const n62Performances = [
      'cheongju-linephilharmonic-nostalgia-20261121',
      'daejeon-sumi-jo-continuum-20261231',
      'sejong-play-the-dresser-20261218'
    ];
    assert(payload.events.length >= 770, 'Deployed data missing November 19 additions');
    n62Performances.forEach(id => assert(ids.has(id), 'Missing November 19 live performance: ' + id));
    console.log('PASS November 19 live JSON: 770 events and sampled new official performances');
    // November 20: newly published Gangwon/Jeju festivals, exhibitions and K League 2 matches.
    const n63Events = [
      'gangneung-coffee-festival-2026', 'gangneung-dandan-festival-2026',
      'donghae-mukho-dojjaebi-festa-2026', 'jeju-local-issue-festa-2026',
      'cheorwon-hantangang-ice-trekking-2027', 'jeju-bookation-week-2026',
      'jeju-santa-watsuda-2026', 'jeju-furniture-fair-movein-2-2026',
      'pro-kleague2-2026-r34-yongin-paju', 'pro-kleague2-2026-r34-gimhae-seongnam'
    ];
    assert(payload.events.length >= 780, 'Deployed data missing November 20 events');
    n63Events.forEach(id => assert(ids.has(id), 'Missing November 20 live event: ' + id));
    const gimjangAttendance = payload.events.find(e => e.id === 'pyeongchang-gimjang-2026')?.attendance;
    assert.equal(gimjangAttendance?.count, 80000);
    assert.equal(gimjangAttendance?.kind, 'actual');
    assert.equal(gimjangAttendance?.year, 2026);
    console.log('PASS November 20 live JSON: 780 events and 2026 official Gimjang attendance');
    console.log('PASS production JSON: at least 715 entries, November 14 updates and official attendance');

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
    await page.locator('#search').fill('성남 HIP:FESTA');
    await verifyCard(page, 'seongnam-hip-festa-20261121', '성남 HIP:FESTA');
    await page.locator('#search').fill('단단단페스티벌');
    await verifyCard(page, 'gangneung-dandan-festival-2026', '단단단페스티벌');
    await page.locator('#search').fill('제주권 로컬페스타');
    await verifyCard(page, 'jeju-local-issue-festa-2026', '로컬페스타');
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
    await page.locator('#search').fill('구내과병원');
    await verifyCard(page, 'paju-municipal-gu-hospital-musical-20261120', '구내과병원');
    await page.locator('#search').fill('라인필하모닉');
    await verifyCard(page, 'cheongju-linephilharmonic-nostalgia-20261121', '라인필하모닉');
    await page.locator('#search').fill('조수미');
    await verifyCard(page, 'daejeon-sumi-jo-continuum-20261231', '조수미');
    await page.locator('#search').fill('더 드레서');
    await verifyCard(page, 'sejong-play-the-dresser-20261218', '더 드레서');
    await page.locator('#search').fill('북케이션 위크');
    await verifyCard(page, 'jeju-bookation-week-2026', '북케이션 위크');
    await page.locator('#search').fill('산타왔수다');
    await verifyCard(page, 'jeju-santa-watsuda-2026', '산타왔수다');
    await page.locator('#search').fill('IBK기업은행 vs 정관장');
    await page.locator('[data-category="sports"]').click();
    await verifyCard(page, 'pro-kovo-202627-20261117-ibk-red', 'IBK기업은행 vs 정관장');
    await page.locator('#search').fill('');
    await page.locator('#search').fill('무주반딧불 평화마라톤대회');
    await verifyCard(page, 'muju-firefly-peace-marathon-20261122', '무주반딧불 평화마라톤대회');
    await page.locator('#search').fill('모악트레일런');
    await verifyCard(page, 'moak-trailrun-20261205', '모악트레일런');
    await page.locator('#search').fill('순창장류배');
    await verifyCard(page, 'sunchang-jangryu-tennis-20261129', '순창장류배');
    await page.locator('#search').fill('전북특별자치도협회장기 클럽');
    await verifyCard(page, 'jeonbuk-tennis-association-club-cup-20261205', '전북특별자치도협회장기');
    await page.locator('#search').fill('용인FC vs 파주');
    await verifyCard(page, 'pro-kleague2-2026-r34-yongin-paju', '용인FC vs 파주');
    await page.locator('#search').fill('김해FC vs 성남FC');
    await verifyCard(page, 'pro-kleague2-2026-r34-gimhae-seongnam', '김해FC vs 성남FC');
    await page.locator('#search').fill('');
    if (hasNovember15Update) {
      await page.locator('#search').fill('GIVE RUN 2026 부산');
      await verifyCard(page, 'giverun-busan-20261121', 'GIVE RUN 2026 부산');
      await page.locator('#search').fill('창원통일마라톤');
      await verifyCard(page, 'changwon-tongil-marathon-20261115', '창원통일마라톤');
      await page.locator('#search').fill('');
      console.log('PASS November 15 sports event cards and official sources');
    }
    console.log('PASS newly added festival, V-League, performance cards and official-source details');

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
    await festivalFrame.locator('#period').selectOption('all');
    await festivalFrame.locator('[data-category="festival"]').click();
    await festivalFrame.locator('#search').fill('성남 HIP:FESTA');
    await verifyCard(festivalFrame, 'seongnam-hip-festa-20261121', '성남 HIP:FESTA');
    await festivalFrame.locator('#search').fill('단단단페스티벌');
    await verifyCard(festivalFrame, 'gangneung-dandan-festival-2026', '단단단페스티벌');
    await festivalFrame.locator('#search').fill('');
    await festivalFrame.locator('[data-category="sports"]').click();
    await festivalFrame.locator('#search').fill('무주반딧불 평화마라톤대회');
    await verifyCard(festivalFrame, 'muju-firefly-peace-marathon-20261122', '무주반딧불 평화마라톤대회');
    await festivalFrame.locator('#search').fill('순창장류배');
    await verifyCard(festivalFrame, 'sunchang-jangryu-tennis-20261129', '순창장류배');
    await festivalFrame.locator('#search').fill('전북특별자치도협회장기 클럽');
    await verifyCard(festivalFrame, 'jeonbuk-tennis-association-club-cup-20261205', '전북특별자치도협회장기');
    await festivalFrame.locator('#search').fill('용인FC vs 파주');
    await verifyCard(festivalFrame, 'pro-kleague2-2026-r34-yongin-paju', '용인FC vs 파주');
    await festivalFrame.locator('#search').fill('라인필하모닉');
    await festivalFrame.locator('[data-category="performance"]').click();
    await verifyCard(festivalFrame, 'cheongju-linephilharmonic-nostalgia-20261121', '라인필하모닉');
    await festivalFrame.locator('#search').fill('조수미');
    await verifyCard(festivalFrame, 'daejeon-sumi-jo-continuum-20261231', '조수미');
    await festivalFrame.locator('#search').fill('북케이션 위크');
    await verifyCard(festivalFrame, 'jeju-bookation-week-2026', '북케이션 위크');
    await festivalFrame.locator('#search').fill('');
    await arcade.screenshot({ path: path.join(snapshotDir, 'world-game-festival.png'), fullPage: true });
    if (hasNovember15Update) {
      await festivalFrame.locator('#search').fill('');
      await festivalFrame.locator('[data-category="sports"]').click();
      await festivalFrame.locator('#search').fill('GIVE RUN 2026 부산');
      await verifyCard(festivalFrame, 'giverun-busan-20261121', 'GIVE RUN 2026 부산');
    }
    console.log('PASS world.html?game=festival: embedded page rendered ' + arcadeCount + ' cards');
    if(jsErrors.length) console.warn('Non-fatal browser console errors: ' + JSON.stringify(jsErrors.slice(0, 10)));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error('FAIL live production browser smoke:', error.stack || String(error));
  process.exitCode = 1;
});
