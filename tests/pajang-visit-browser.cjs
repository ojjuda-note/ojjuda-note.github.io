const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://ojjuda.kr';
const now = new Date();
const today = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const clientFixture = `<script>
  window.__calls=[];window.__clientReads=0;
  const db={auth:{
    getSession:async()=>({data:{session:null}}),
    onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
  },rpc:async(name,args)=>{
    if(name!=='record_site_usage')throw Error('unexpected_smoke_rpc:'+name);
    window.__calls.push({name,args});
    return {data:{ok:true,day:${json(today)},server_now:${json(now.toISOString())}}};
  }};
  window.ojjudaSupabase=db;
  window.OjjudaGetClient=()=>{window.__clientReads++;return Promise.resolve(db);};
</script>`;

async function entryHtml(filename) {
  const actual = await fs.readFile(path.join(root, 'features/pajang', filename), 'utf8');
  const shell = actual.match(/<script type="module" src="\.\/shell\.mjs\?[^\"]+"><\/script>/)?.[0];
  const config = actual.match(/<script src="\/config\.js\?[^\"]+"><\/script>/)?.[0];
  assert.ok(shell && config, 'the real published page supplies the current script URLs');
  // Keep the production script order and module graph; unrelated member content
  // is omitted so every database request comes from the measurement under test.
  return `<!doctype html><html><head><meta charset="utf-8">${shell}</head>
    <body><main>파장 방문 연결 검사</main>${clientFixture}${config}</body></html>`;
}

function adminHtml() {
  const keys = ['agit', 'arcade', 'park', 'settings', 'portal', 'group', 'fanpages', 'restaurants', 'festival', 'game_stacker', 'game_mole', 'game_runner'];
  const stats = {
    started_at: now.toISOString(), today_date: today, today: 0, month: 0, total: 0,
    daily: Array.from({ length: 30 }, (_, i) => ({ period: new Date(Date.parse(today) - (29 - i) * 86400000).toISOString().slice(0, 10), visits: 0 })),
    hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, visits: 0 })),
    weekday: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, visits: 0 })),
    features: keys.map((feature, i) => ({ feature, uses: 100 - i })),
    sources: ['direct', 'naver', 'google', 'search', 'social', 'external', 'internal', 'campaign'].map(source => ({ source, visits: 0 })),
    guest_games: [], guest_boards: [], agit_details: [], arcade_details: [],
    pajang_visits: { started_at: now.toISOString(), uses: 1 }
  };
  const legacy = { today: 0, month: 0, total: 0, started_at: now.toISOString(), daily: [], monthly: [] };
  return `<!doctype html><html><meta charset="utf-8"><body><main id="host"></main>
    <script src="/admin/visitors.js"></script><script>
      OjjudaAdminVisitors.mount({container:document.getElementById('host'),getAdminId:()=> 'smoke-admin',client:{rpc:async name=>
        name==='admin_site_usage_stats'?{data:${json(stats)}}:name==='admin_guest_visit_stats'?{data:${json(legacy)}}:{error:{message:'unavailable'}}
      }});
    </script></body></html>`;
}

(async () => {
  const failures = [], requested = new Set();
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      let body, type = 'text/html; charset=utf-8';
      if (pathname === '/features/pajang/' || pathname === '/features/pajang/index.html') body = await entryHtml('index.html');
      else if (pathname === '/features/pajang/station.html') body = await entryHtml('station.html');
      else if (pathname === '/world.html') body = `<!doctype html><html><body>${clientFixture}
        <dialog class="agit-pajang-dialog"><iframe src="/features/pajang/?embed=1"></iframe></dialog></body></html>`;
      else if (pathname === '/admin/visitor-smoke.html') body = adminHtml();
      else if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
      else {
        const filename = path.resolve(root, '.' + pathname);
        if (!filename.startsWith(root + path.sep)) throw Error('invalid_fixture_path');
        body = await fs.readFile(filename);
        type = ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(filename)] || 'application/octet-stream';
      }
      response.writeHead(200, { 'Content-Type': type }); response.end(body);
    } catch (error) {
      failures.push(error.message);
      response.writeHead(404); response.end('Fixture unavailable');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const local = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const context = await browser.newContext({ serviceWorkers: 'block', locale: 'ko-KR' });
    // The production origin gives normal storage/crypto semantics. Every request
    // is fulfilled by the local HTTP fixture; no production traffic is allowed.
    await context.route('**/*', async route => {
      const target = new URL(route.request().url());
      if (target.origin !== origin) {
        failures.push('Unexpected external request: ' + target.origin);
        await route.abort(); return;
      }
      requested.add(target.pathname + target.search);
      const response = await context.request.get(local + target.pathname + target.search);
      await route.fulfill({ response });
    });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    await page.goto(origin + '/features/pajang/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__calls?.length === 2);
    const calls = await page.evaluate(() => window.__calls);
    assert.deepEqual(calls.map(call => call.args.p_event), ['visit', 'feature']);
    assert.equal(calls[1].args.p_feature, 'pajang');
    const currentShell = (await fs.readFile(path.join(root, 'features/pajang/index.html'), 'utf8'))
      .match(/\.\/shell\.mjs\?v=([^"]+)/)?.[1];
    assert.ok(currentShell && requested.has('/features/pajang/shell.mjs?v='+currentShell),
      'browser loaded the currently published Pajang shell');
    for (const request of [
      '/features/pajang/usage.mjs',
      '/shared/analytics/site-usage.js',
      '/features/pajang/member.mjs',
      '/config.js'
    ]) {
      const loaded = [...requested].some(value => {
        const url = new URL(value, origin);
        return url.pathname === request && Boolean(url.searchParams.get('v'));
      });
      assert.ok(loaded, 'browser resolved the versioned module: ' + request);
    }
    await page.goto(origin + '/features/pajang/station.html', { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => window.__calls.length), 0, 'entry to member station deduplicates against the same browser/day');
    console.log('PASS: real Pajang shell imports usage, member client and analytics; direct visits deduplicate');

    await page.evaluate(() => localStorage.clear());
    await page.goto(origin + '/world.html', { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => window.__calls.length), 0, 'closed embedded entry is not counted');
    await page.evaluate(() => document.querySelector('dialog').showModal());
    await page.waitForFunction(() => window.__calls.length === 2);
    assert.equal(await page.evaluate(() => window.__calls[1].args.p_feature), 'pajang');
    assert.equal(await page.locator('iframe').contentFrame().locator('main').textContent(), '파장 방문 연결 검사');
    console.log('PASS: opening the real embedded module graph records Pajang through the mocked host client');

    await page.goto(origin + '/admin/visitor-smoke.html', { waitUntil: 'networkidle' });
    const row = page.locator('[data-chart="features"] [data-feature="pajang"]');
    await row.waitFor();
    assert.equal(await row.locator('.visitor-rank-top span').textContent(), '파장');
    assert.equal(await row.locator('strong').textContent(), '1회');
    assert.equal(await page.locator('[data-chart="features"] .visitor-rank-row').count(), 13);
    assert.equal(await row.locator('.visitor-rank-fill').evaluate(node => node.style.width), '1%');
    assert.deepEqual(failures, []);
    console.log('PASS: real administrator script renders Pajang beside all twelve existing features');
    await context.close();
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
