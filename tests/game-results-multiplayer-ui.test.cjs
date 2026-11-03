const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const fixtures = [
  { game: 'bang', file: 'games/bang/index.html', body: '<div id="overlay" class="overlay"><section class="modal response-modal result-modal" data-result-host></section></div>', extra: '<p>3연승 · 저장 완료</p>' },
  { game: 'poker', file: 'games/poker/index.html', bodyClass: 'poker-playing', body: '<main id="app"><section class="felt" style="height:calc(100dvh - 150px);margin-top:70px"><div class="table-start-overlay"><section class="table-start-card" data-result-host></section></div></section></main>', outcome: 'gold-loss', metric: '-200 G' },
  { game: 'tank', file: 'games/tank/index.html', body: '<div id="over" class="ov"><div id="tankResult" data-result-host></div></div>' },
  { game: 'mines', file: 'games/mines/index.html', body: '<div id="result" class="on"><div id="minesResultCard" data-result-host></div></div>', metric: '고급 · 123초' },
  { game: 'tour', file: 'games/ojjuda-tour/index.html', body: '<div id="sheet2" class="sheet result-view"><div class="sheet-card panel"><div class="sheet-head"></div><div id="s2Body"></div><div id="s2Btns" data-result-host></div></div></div>', extra: '<p id="tourRecordStatus">기록 저장 완료</p>' },
  { game: 'matgo', file: 'games/matgo.html', body: '<div class="modal"><div class="card result-card" data-result-host></div></div>', metric: '+400 G', extra: '<p>7점</p>' },
  { game: 'matgo', file: 'games/matgo-online.html', body: '<div class="dialog"><div class="card result-card" data-result-host></div></div>', metric: '+400 G', extra: '<p>7점</p>' },
  { game: 'ttang', file: 'games/ttang.html', body: '<div class="overlay"><div class="panel" data-result-host></div></div>', metric: '내 땅 50.1% · 120초' },
  { game: 'photo_ttang', file: 'games/photo-ttang.html', body: '<div class="overlay"><div class="panel" data-result-host></div></div>', metric: '9단계 · 사진 공개', extra: '<img class="fullimg" alt="공개된 사진" style="width:100%;object-fit:contain;border-radius:16px" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 400%22%3E%3Crect width=%22300%22 height=%22400%22 fill=%22%23e8eee2%22/%3E%3C/svg%3E"><button id="report">사진 신고</button>' },
  { game: 'roulette', file: 'games/roulette/index.html', body: '', native: true, outcome: 'gold-gain', metric: '+1,000 G', extra: '<p>당첨 번호 12</p>' }
];

test('game styles preserve readable results and reachable share/replay controls on narrow and short screens', async t => {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const fixture = fixtures.find(item => '/' + item.file === url.pathname);
    if (fixture && url.searchParams.has('result-fixture')) {
      const html = fs.readFileSync(path.join(root, fixture.file), 'utf8');
      const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)[1].replace(/<script\b[\s\S]*?<\/script>/gi, '');
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html lang="ko"><head>' + head + '</head><body class="' + (fixture.bodyClass || '') + '">' + fixture.body + '<script src="/game-results.js"></script></body></html>');
      return;
    }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
    const types = { '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') || route.request().url().startsWith('data:') ? route.continue() : route.abort());
  const origin = 'http://127.0.0.1:' + server.address().port;
  for (const fixture of fixtures) {
    for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) {
      await t.test(fixture.file + ' at ' + width + '×' + height, async () => {
        await page.setViewportSize({ width, height });
        await page.goto(origin + '/' + fixture.file + '?result-fixture', { waitUntil: 'load' });
        await page.evaluate(fixture => {
          window.shareCalls = 0;
          navigator.share = async () => { window.shareCalls++; };
          const options = { game: fixture.game, outcome: fixture.outcome || 'success', metric: fixture.metric || '게임 종료', extra: fixture.extra || '', key: fixture.file };
          if (fixture.native) OjjudaGameResults.show({ ...options, actions: [{ label: '다음 판', onClick: () => false }] });
          else document.querySelector('[data-result-host]').innerHTML = OjjudaGameResults.markup({ ...options, actions: (['photo_ttang', 'poker'].includes(fixture.game) ? '<button id="next">다음 판</button>' : '') + '<button id="play">다시 하기</button><button id="inspect">결과 보기</button>' });
        }, fixture);
        await page.locator('.game-result-card').waitFor();
        // Let the existing sheet entry transform finish before checking hit targets.
        await page.waitForTimeout(360);
        const layout = await page.evaluate(() => {
          const card = document.querySelector('.game-result-card');
          const bounds = card.getBoundingClientRect();
          const metric = getComputedStyle(card.querySelector('.game-result-metric'));
          const buttons = [...card.querySelectorAll('.game-result-actions button, .game-result-share')].map(button => {
            const r = button.getBoundingClientRect();
            const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return { label: button.textContent, height: r.height, top: r.top, bottom: r.bottom, reachable: button.contains(target) };
          });
          return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: innerWidth, height: innerHeight, metricSize: parseFloat(metric.fontSize), metricColor: metric.color, buttons };
        });
        if (process.env.GAME_RESULTS_MULTIPLAYER_SCREENSHOTS) {
          fs.mkdirSync(process.env.GAME_RESULTS_MULTIPLAYER_SCREENSHOTS, { recursive: true });
          await page.screenshot({ path: path.join(process.env.GAME_RESULTS_MULTIPLAYER_SCREENSHOTS, fixture.file.replaceAll('/', '-') + '-' + width + '.png') });
        }
        assert.ok(layout.left >= -1 && layout.right <= width + 1, JSON.stringify(layout));
        assert.ok(layout.metricSize >= 16, JSON.stringify(layout));
        assert.equal(layout.metricColor, 'rgb(64, 87, 74)', JSON.stringify(layout));
        assert.ok(layout.buttons.every(button => button.height >= 44 && button.reachable && button.top >= 0 && button.bottom <= height), JSON.stringify(layout));
        await page.getByRole('button', { name: '공유하기', exact: true }).click();
        assert.equal(await page.evaluate(() => window.shareCalls), 1);
      });
    }
  }
  assert.deepEqual(errors, []);
});
