const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let world = read('world.html').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,
  tag => /world-admin-loader\.js|note\/operations\.js/.test(tag) ? tag : '');
const boot = world.indexOf('j1(()=>H());gm(');
assert.ok(boot > 0, 'replace the live service boot only');
function fixtureBoot() {
  const fixture = window.worldAdminFixture = {renders:0, mounts:[], destroys:[]};
  const render = H;
  H = () => { fixture.renders++; return render(); };
  fixture.open = tab => { D.isAdmin = true; g.tab = 'admin'; L.area = 'support'; L.tab = tab || 'reports'; H(); };
  fixture.leave = () => { D.isAdmin = false; g.tab = 'my'; H(); };
  D.online = true; D.user = {id:'synthetic-member'}; D.isAdmin = false; g.tab = 'my'; H();
}
world = world.slice(0, boot) + `(${fixtureBoot.toString()})();\n` + world.slice(world.indexOf('</script>', boot));
const operations = `
  (() => {
    const mount = (name, options) => {
      worldAdminFixture.mounts.push(name);
      options.container.textContent = name + ' module ready';
      return {canLeave:()=>true, hasDraft:()=>false, destroy(){worldAdminFixture.destroys.push(name);}};
    };
    window.OjjudaOperations = {
      renderReports:options=>Promise.resolve(mount('reports', options)),
      renderSupport:options=>Promise.resolve(mount('support', options))
    };
  })();`;

(async () => {
  const browser = await chromium.launch({headless:true,
    executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args:['--no-sandbox', '--disable-dev-shm-usage']});
  try {
    for (const failFirst of [false, true]) {
      const context = await browser.newContext({viewport:{width:390, height:844}});
      const requests = [], errors = [];
      let hold = null, release = null, failures = failFirst ? 1 : 0;
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname !== 'fixture.test') return route.abort();
        const pathname = url.pathname;
        requests.push(pathname);
        if (pathname === '/world.html') return route.fulfill({contentType:'text/html', body:world});
        if (pathname === '/admin/world-admin-loader.js') return route.fulfill({contentType:'text/javascript', body:read('admin/world-admin-loader.js')});
        if (pathname === '/note/operations.js') {
          if (failures) { failures--; return route.abort(); }
          if (hold) await hold;
          return route.fulfill({contentType:'text/javascript', body:operations});
        }
        if (pathname.endsWith('.css')) return route.fulfill({contentType:'text/css', body:''});
        if (pathname.endsWith('.js')) return route.fulfill({contentType:'text/javascript', body:'/* synthetic administrator module */'});
        return route.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      const count = filename => requests.filter(value => value === '/note/' + filename).length;
      try {
        await page.goto('https://fixture.test/world.html', {waitUntil:'domcontentloaded'});
        await page.waitForFunction(() => window.worldAdminFixture?.renders > 0);
        assert.equal(count('operations.js'), 0, 'an ordinary member does not request the administrator module');
        assert.equal(count('operations.css'), 0, 'an ordinary member does not request administrator styles');
        const before = await page.evaluate(() => worldAdminFixture.renders);
        hold = new Promise(resolve => { release = resolve; });
        await page.evaluate(() => worldAdminFixture.open());
        await page.locator('#world-operations').waitFor();
        if (failFirst) {
          const retry = page.locator('#world-operations').getByRole('button', {name:'다시 시도'});
          await retry.waitFor(); await retry.click();
        }
        assert.equal(await page.evaluate(() => window.OjjudaOperations), undefined, 'the first administrator screen waits for its delayed module');
        release(); hold = null;
        await page.locator('#world-operations').getByText('reports module ready', {exact:true}).waitFor();
        assert.ok(await page.evaluate(before => worldAdminFixture.renders > before + 1, before), 'successful loading rerenders the real World shell');
        assert.deepEqual(await page.evaluate(() => worldAdminFixture.mounts), ['reports']);
        assert.equal(count('operations.js'), failFirst ? 2 : 1, 'retry requests only the failed script');
        assert.equal(count('operations.css'), 1, 'styles load once with the administrator tools');
        await page.evaluate(() => worldAdminFixture.open('feedback'));
        await page.locator('#world-operations').getByText('support module ready', {exact:true}).waitFor();
        await page.evaluate(() => { worldAdminFixture.leave(); worldAdminFixture.open(); });
        await page.locator('#world-operations').getByText('reports module ready', {exact:true}).waitFor();
        assert.equal(count('operations.js'), failFirst ? 2 : 1, 'subsequent administrator screens reuse the loaded module');
        assert.equal(count('operations.css'), 1);
        assert.deepEqual(errors, []);
      } finally { release?.(); await context.close(); }
    }
    console.log('PASS: ordinary members skip operations assets; first administrator opening, delayed loading, shell rerender, failed-script retry and later screen reuse');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
