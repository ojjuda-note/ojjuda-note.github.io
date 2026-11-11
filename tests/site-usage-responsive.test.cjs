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
        const growthRows = ['stacker', 'mole'].flatMap(game => ['challenge', 'direct'].map(source =>
          ({ game, source, visits: 1, starts: 1, completes: 1, shares: 0 })));
        const stats = {
          started_at: '2026-11-11T00:00:00Z', today_date: '2026-11-11', today: 9, month: 60, total: 60,
          daily: Array.from({ length: 30 }, (_, i) =>
            ({ period: new Date(Date.UTC(2026, 9, 13 + i)).toISOString().slice(0, 10), visits: (i * 17) % 13 })),
          hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, visits: (hour * 3) % 11 })),
          weekday: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, visits: i * 3 + 1 })),
          features: [{ feature: 'arcade', uses: 12 }, { feature: 'game_stacker', uses: 8 }],
          sources: ['direct', 'naver', 'google', 'search', 'social', 'external', 'internal', 'campaign']
            .map((source, i) => ({ source, visits: 10 - i }))
        };
        const legacy = { today: 5, month: 40, total: 130, started_at: '2026-10-27T00:00:00Z', daily: [], monthly: [] };
        const growth = { started_at: '2026-11-01T00:00:00Z', today_date: '2026-11-11', today: growthRows, month: growthRows };
        const client = {
          rpc: async name => ({ data: name === 'admin_guest_visit_stats' ? legacy
            : name === 'admin_game_growth_stats' ? growth : stats }),
          auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }
        };
        window.OjjudaAdminVisitors.mount({ container: document.querySelector('#host'), client, getAdminId: () => 'admin' });
      });
      await page.locator('.visitor-chart-card').last().waitFor();
      const layout = await page.evaluate(() => {
        const chart = document.querySelector('.visitor-chart-card');
        const grid = document.querySelector('.visitor-chart-grid');
        const dateScroll = document.querySelector('.visitor-chart-scroll');
        return {
          viewport: innerWidth, rootWidth: document.documentElement.scrollWidth,
          charts: grid.children.length, columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
          chartWidth: Math.round(chart.getBoundingClientRect().width),
          dateScrollWidth: dateScroll.scrollWidth, dateClientWidth: dateScroll.clientWidth,
          focusable: dateScroll.tabIndex === 0
        };
      });
      assert.equal(layout.charts, 5, `${width}px: all chart cards`);
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
