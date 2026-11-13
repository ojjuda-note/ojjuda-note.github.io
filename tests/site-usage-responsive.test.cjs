const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    headless: true,
    args: ['--no-sandbox']
  });
  try {
    for (const width of [360, 768, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 920 }, deviceScaleFactor: 1 });
      await page.setContent(`<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
        *,*::before,*::after{box-sizing:border-box}
        html,body{margin:0;width:100%;color:#263831;background:#f5f4f0;font-family:system-ui,sans-serif}
        main{min-width:0;max-width:1160px;margin:0 auto;padding:16px}
      </style></head><body><main id="host"></main></body></html>`);
      await page.addStyleTag({ content: read('admin/visitors.css') });
      await page.addStyleTag({ content: read('admin/visitors-charts.css') });
      await page.addScriptTag({ content: read('admin/visitors.js') });
      await page.evaluate(() => {
        const stats = {
          started_at: '2026-11-11T00:00:00Z', today_date: '2026-11-11', today: 9, month: 60, total: 60,
          daily: Array.from({ length: 30 }, (_, i) =>
            ({ period: new Date(Date.UTC(2026, 9, 13 + i)).toISOString().slice(0, 10), visits: (i * 17) % 13 })),
          hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, visits: (hour * 3) % 11 })),
          weekday: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, visits: i * 3 + 1 })),
          features: ['arcade', 'park', 'settings', 'portal', 'group', 'fanpages', 'restaurants',
            'festival', 'game_stacker', 'game_mole', 'game_runner', 'game_photo_ttang']
            .map((feature, index) => ({ feature, uses: 12 - index })),
          sources: ['direct', 'naver', 'google', 'search', 'social', 'external', 'internal', 'campaign']
            .map((source, i) => ({ source, visits: 10 - i })),
          guest_games: [{ feature: 'game_mole', uses: 7 }, { feature: 'game_stacker', uses: 5 }],
          guest_boards: [{ feature: 'park', uses: 12 }, { feature: 'fanpages', uses: 4 }],
          agit_details: [{ detail: 'agit_stamp', uses: 8 }, { detail: 'agit_group', uses: 4 }],
          arcade_details: [{ detail: 'arcade_game_mole', uses: 7 }, { detail: 'arcade_game_stacker', uses: 3 }],
          fortune_visits: {
            started_at: '2026-11-10T15:00:00Z',
            biorhythm_started_at: '2026-11-10T15:00:00Z',
            daily: Array.from({ length: 30 }, (_, i) => ({
              period: new Date(Date.UTC(2026, 9, 13 + i)).toISOString().slice(0, 10),
              tarot: i === 29 ? 5 : 0, saju: 0, biorhythm: i === 29 ? 2 : null
            }))
          }
        };
        const legacy = { today: 5, month: 40, total: 130, started_at: '2026-10-27T00:00:00Z', daily: [], monthly: [] };
        const client = {
          rpc: async name => {
            if (name === 'admin_guest_visit_stats') return { data: legacy };
            if (name === 'admin_site_usage_stats') return { data: stats };
            throw new Error('Unexpected statistics RPC: ' + name);
          },
          auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }
        };
        window.OjjudaAdminVisitors.mount({ container: document.querySelector('#host'), client, getAdminId: () => 'admin' });
      });
      await page.locator('.visitor-chart-card').last().waitFor();
      const layout = await page.evaluate(() => {
        const grid = document.querySelector('.visitor-insights > .visitor-chart-grid');
        const chart = grid.querySelector('.visitor-chart-card');
        const dateScroll = grid.querySelector('.visitor-chart-scroll');
        const features = document.querySelector('[data-chart="features"]');
        const featureRows = [...features.querySelectorAll('.visitor-rank-row')];
        const notes = [...features.querySelectorAll('.visitor-feature-note')];
        return {
          viewport: innerWidth, rootWidth: document.documentElement.scrollWidth,
          charts: grid.children.length, columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
          chartWidth: Math.round(chart.getBoundingClientRect().width),
          dateScrollWidth: dateScroll.scrollWidth, dateClientWidth: dateScroll.clientWidth,
          focusable: dateScroll.tabIndex === 0,
          totalCharts: document.querySelectorAll('.visitor-chart-card').length,
          separateFortunePanels: document.querySelectorAll('.visitor-fortune,.visitor-fortune-grid,.visitor-fortune-cards').length,
          featureCharts: document.querySelectorAll('[data-chart="features"]').length,
          featureRows: featureRows.map(row => ({
            feature: row.dataset.feature, count: Number(row.querySelector('strong').textContent.replace(/[^0-9]/g, '')),
            fill: parseFloat(row.querySelector('.visitor-rank-fill').style.width),
            scroll: row.scrollWidth, client: row.clientWidth
          })),
          notes: notes.map(note => ({ collection: note.dataset.collection, text: note.textContent,
            scroll: note.scrollWidth, client: note.clientWidth }))
        };
      });
      assert.equal(layout.charts, 9, `${width}px: all chart cards`);
      assert.equal(layout.totalCharts, 9, `${width}px: fortune visits share an existing chart`);
      assert.equal(layout.separateFortunePanels, 0, `${width}px: no separate fortune panel or date graphs`);
      assert.equal(layout.featureCharts, 1, `${width}px: a single merged feature chart`);
      assert.equal(layout.featureRows.length, 15, `${width}px: all three service rows remain alongside all twelve existing features`);
      assert.equal(new Set(layout.featureRows.map(row => row.feature)).size, 15);
      assert.ok(layout.featureRows.every((row, index, rows) => index === 0 || rows[index - 1].count >= row.count),
        `${width}px: all features share descending order`);
      assert.ok(layout.featureRows.every(row => Math.abs(row.fill - row.count / 12 * 100) < 0.001),
        `${width}px: service and existing rows use the same bar scale`);
      assert.equal(layout.featureRows.find(row => row.feature === 'tarot').count, 5);
      assert.equal(layout.featureRows.find(row => row.feature === 'saju').count, 0);
      assert.equal(layout.featureRows.find(row => row.feature === 'biorhythm').count, 2);
      assert.ok(layout.featureRows.every(row => row.scroll <= row.client + 1), `${width}px: all feature labels and values fit their rows`);
      assert.match(layout.notes.find(note => note.collection === 'fortune').text, /타로·사주.*2026년 11월 11일/);
      assert.match(layout.notes.find(note => note.collection === 'biorhythm').text, /바이오리듬.*2026년 11월 11일/);
      assert.ok(layout.notes.every(note => note.scroll <= note.client + 1), `${width}px: separate collection notes wrap within the feature card`);
      assert.ok(layout.rootWidth <= layout.viewport + 1, `${width}px: no horizontal page overflow (${JSON.stringify(layout)})`);
      assert.equal(layout.columns, width > 760 ? 2 : 1, `${width}px: chart grid changes with viewport`);
      assert.ok(layout.chartWidth > 240, `${width}px: content remains readable`);
      assert.ok(layout.focusable, `${width}px: keyboard-scrollable detailed charts`);
      if (width === 360) assert.ok(layout.dateScrollWidth > layout.dateClientWidth,
        '360px: long date chart scrolls inside its own card');
      if (process.env.SITE_USAGE_SCREENSHOT_DIR) {
        await page.screenshot({
          path: path.join(process.env.SITE_USAGE_SCREENSHOT_DIR, `site-usage-${width}.png`),
          fullPage: true
        });
      }
      console.log(`PASS: analytics layout ${width}px, ${layout.columns} column(s), document width ${layout.rootWidth}px`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
