// Local, fixed-clock Chromium regression. All external requests are blocked.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : '/usr/bin/chromium'), headless: true, args: ['--no-sandbox'] });
  try {
    for (const now of ['2026-11-15T14:59:59Z', '2026-11-15T15:00:00Z', '2026-11-16T02:30:00Z', '2026-11-16T03:30:00Z', '2026-11-16T07:59:59Z', '2026-11-16T08:00:00Z']) {
      const page = await browser.newPage({ timezoneId: 'Europe/London' });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(now => {
        const NativeDate = Date;
        window.Date = class extends NativeDate {
          constructor(...args) { super(...(args.length ? args : [now])); }
          static now() { return new NativeDate(now).getTime(); }
        };
      }, now);
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== 'https://fan.test' || url.pathname === '/config.js') return route.fulfill({ status: 200, body: '', contentType: 'application/javascript' });
        const file = path.join(root, decodeURIComponent(url.pathname));
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
        let body = fs.readFileSync(file);
        // Exercise default timezone, range end date, invalid-zone fallback and sorting through the real catalog.
        if (url.pathname.endsWith('/artists-extra.js')) body = body.toString() + `\nwindow.OJJUDA_FAN_ARTISTS.find(a=>a.id==='boynextdoor').appearances.push(
          {date:'2026-11-15',timeZone:'America/Los_Angeles',title:'KNOCK ON Vol.2 · 시애틀',sub:'fixture only',href:'https://boynextdoortour.com/'},
          {date:'2026-11-15',title:'Korean default',sub:'test',href:'https://example.org'},
          {date:'2026-11-14',endDate:'2026-11-15',timeZone:'America/Los_Angeles',title:'Local range',sub:'test',href:'https://example.org'},
          {date:'2026-11-15',timeZone:'Invalid/Zone',title:'Invalid fallback',sub:'test',href:'https://example.org'});`;
        return route.fulfill({ status: 200, body, contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
      });
      await page.goto('https://fan.test/features/fanpages/artist.html?group=boynextdoor');
      await page.waitForSelector('.event-card');
      const cards = await page.locator('.event-card').evaluateAll(nodes => nodes.map(n => ({ title: n.querySelector('.event-card-info strong').textContent, date: n.querySelector('time').getAttribute('datetime'), display: n.querySelector('time strong').textContent })));
      const seattle = cards.find(c => c.title.includes('시애틀'));
      assert.equal(Boolean(seattle), now < '2026-11-16T08:00:00Z', now);
      if (seattle) { assert.equal(seattle.date, '2026-11-15'); assert.equal(seattle.display, '11.15'); }
      assert.equal(cards.some(c => c.title === 'Korean default'), now < '2026-11-15T15:00:00Z');
      assert.equal(cards.some(c => c.title === 'Invalid fallback'), now < '2026-11-15T15:00:00Z');
      assert.equal(cards.some(c => c.title === 'Local range'), now < '2026-11-16T08:00:00Z');
      assert.deepEqual(cards.map(c => c.date), cards.map(c => c.date).sort());
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS: six fixed clocks; Seattle survives Seoul midnight, doors/show and local 23:59:59; expires local midnight; display, sort, range, Seoul default and invalid-zone fallback preserved.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
