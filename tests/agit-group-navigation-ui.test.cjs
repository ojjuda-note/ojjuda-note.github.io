const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://agit.test';
const group = { id:'10000000-0000-4000-8000-000000000001', name:'간편 요리 레시피', description:'오늘의 요리', member_count:2, is_member:true };

async function swipe(session, x, y, dx, dy = 0) {
  const send = (type, points) => session.send('Input.dispatchTouchEvent', { type, touchPoints:points });
  await send('touchStart', [{x, y}]);
  for (let i = 1; i <= 6; i++) {
    await send('touchMove', [{x:x + dx*i/6, y:y + dy*i/6}]);
  }
  await send('touchEnd', []);
}

for (const store of [false,true]) test('group switches in the same document by swipe, tap and history (Play Store: '+store+')', async () => {
  const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const errors=[];
    page.on('pageerror', error => errors.push(error.message));
    const touch = await page.context().newCDPSession(page);
    await page.addInitScript(room => {
      const user = {id:'10000000-0000-4000-8000-000000000002'};
      window.supabase = {createClient:() => ({
        auth:{getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:{user}}}),onAuthStateChange(){}},
        from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{value:'공지'}})})})}),
        schema:()=>({rpc:async()=>({data:[]})}),
        rpc:async(name) => ({data:name==='group_home_sorted' ? {rooms:[room],directory:[room],invitations:[]} : []})
      })};
    }, group);
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/world.html') {
        // Render the real screen and install the production gesture handlers without starting account bootstrap.
        let html = fs.readFileSync(path.join(root,'world.html'),'utf8')
          .replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>/g,(tag,src) =>
            /app\/world\/world-(?:group-tab|navigation)\.js|shared\/pwa\/app-identity\.js|features\/home\/agit-hub\.js/.test(src) ? tag : '')
          .replace('import { screw3d as screwGame } from "./games/screw/screw3d.js";','const screwGame={};');
        const boot = html.indexOf('j1(()=>H());gm(');
        assert.ok(boot > 0);
        html = html.slice(0,boot) + 'gm();sr.tab({tab:new URL(location.href).searchParams.get("tab")||"hub"});' + html.slice(html.indexOf('</script>',boot));
        return route.fulfill({contentType:'text/html', body:html});
      }
      const file = path.join(root,url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname);
      return fs.existsSync(file) && fs.statSync(file).isFile() ? route.fulfill({path:file}) : route.abort();
    });
    await page.goto(origin + '/world.html?tab=hub'+(store?'&play_store=1':''));
    await page.evaluate(()=>{window.testDocument=document;});
    await page.locator('.bottomnav [data-tab=hub][aria-current]').waitFor();
    const icon = page.locator('.bottomnav [data-tab=group] use');
    await page.waitForFunction(() => document.querySelector('.bottomnav [data-tab=group] use')?.getBBox().width > 10);
    assert.ok(await icon.evaluate(el => el.getBBox().height > 10));

    async function slideWorld(from, dx) {
      const box = await page.locator('.bottomnav [data-tab='+from+']').boundingBox();
      await swipe(touch, dx<0 ? 285 : 100,box.y+box.height/2,dx);
    }
    const groups=page.frameLocator('#world-group-tab');
    async function slideGroups(dx) {
      const box = await groups.locator('.group-card').first().boundingBox();
      await swipe(touch, dx<0 ? 285 : 100, box.y+24, dx);
    }
    const hero = await page.locator('.agit-hero, .agit-guest-hero, .agit-checkin').first().boundingBox();
    await swipe(touch,285,Math.max(80,hero.y+25),-155);
    await page.waitForURL('**tab=group*');
    const card = groups.locator('.group-card').first();
    await card.waitFor();
    const child=page.frames().find(f=>new URL(f.url()).pathname==='/groups/');
    await child.waitForFunction(()=>document.querySelector('.group-main-nav [aria-current] use')?.getBBox().height>10);
    await card.waitFor();
    for (const width of [320,390,750]) {
      await page.setViewportSize({width,height:844});
      const size = await child.evaluate(() => {
        const pos = s => document.querySelector(s).getBoundingClientRect();
        return {controls:pos('.directory-toolbar').bottom-pos('.group-directory-hero').top,
          width:document.documentElement.scrollWidth, searchY:pos('#directory-query').y,sortY:pos('.directory-sort').y,
          cardTitle:parseFloat(getComputedStyle(document.querySelector('.group-card h3')).fontSize)};
      });
      assert.ok(size.controls <= 104, width+'px directory controls occupy two rows');
      assert.ok(Math.abs(size.searchY-size.sortY)<6);
      assert.ok(size.cardTitle>=16 && size.cardTitle<=20);
      assert.ok(size.width<=width);
    }
    await page.setViewportSize({width:390,height:844});
    await groups.locator('[data-sort=members]').click();
    assert.equal(await groups.locator('[data-sort=members]').getAttribute('aria-pressed'),'true');
    const search = await groups.locator('#directory-query').boundingBox();
    await swipe(touch,search.x+20,search.y+16,130);
    assert.equal(new URL(page.url()).searchParams.get('tab'),'group');
    const create = groups.locator('[data-action=create]');
    await create.click();
    await groups.locator('dialog[open]').waitFor();
    await swipe(touch,275,390,-145);
    assert.equal(new URL(page.url()).searchParams.get('tab'),'group');
    await groups.locator('dialog[open] [data-close]').click();
    await child.waitForFunction(()=>!document.querySelector('dialog[open]') && !history.state?.ojjudaGroupDialog);
    await slideGroups(-155);
    await page.locator('.bottomnav [data-tab=arcade][aria-current]').waitFor();
    assert.equal(await page.locator('.arcade-ranking-entry').isVisible(),true);
    assert.equal(await page.locator('[data-arcade-games=solo]').count(),store?0:1);
    await page.goBack();
    await card.waitFor();
    assert.equal(await groups.locator('[data-sort=members]').getAttribute('aria-pressed'),'true');
    await groups.locator('.group-main-nav [data-tab=arcade]').tap();
    await page.locator('.bottomnav [data-tab=arcade][aria-current]').waitFor();
    await page.goBack();
    await card.waitFor();
    await page.goForward();
    await page.locator('.bottomnav [data-tab=arcade][aria-current]').waitFor();
    await slideWorld('arcade',-155);
    await page.locator('.bottomnav [data-tab=my][aria-current]').waitFor();
    await slideWorld('my',155);
    await page.locator('.bottomnav [data-tab=arcade][aria-current]').waitFor();
    await slideWorld('arcade',155);
    await card.waitFor();
    await slideGroups(155);
    await page.locator('.bottomnav [data-tab=hub][aria-current]').waitFor();
    assert.equal(await page.evaluate(()=>window.testDocument===document),true);
    await page.goto(origin + '/groups/');
    await page.waitForURL('**tab=group');
    await card.waitFor();
    await groups.locator('.group-main-nav [data-tab=arcade]').tap();
    await page.locator('.arcade-ranking-entry').waitFor();
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
});
