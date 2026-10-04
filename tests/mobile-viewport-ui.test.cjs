const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const stripScripts = html => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
let world = read('world.html').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '')
  .replace('import { screw3d as screwGame } from "./screw3d.js";', 'const screwGame={};');
world = world.replace('<script type="module">', `<script>${read('world-navigation.js')}</script><script type="module">`);
const boot = world.indexOf('j1(()=>H());gm(');
assert.ok(boot > 0);
world = world.slice(0, boot) + 'window.worldTest={state:g,actions:sr,render:H,modal:ct};g.tab="friends";H();' + world.slice(world.indexOf('</script>', boot));

async function snapshot(page, name) {
  if (!process.env.MOBILE_VIEWPORT_QA_DIR) return;
  fs.mkdirSync(process.env.MOBILE_VIEWPORT_QA_DIR, {recursive:true});
  await page.screenshot({path:path.join(process.env.MOBILE_VIEWPORT_QA_DIR, name+'.png')});
}
async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function visibleArea(page, height, top = 0, scale = 1) {
  await page.evaluate(({height, top, scale}) => {
    Object.assign(window.viewportFixture, {height, top, scale});
    visualViewport.dispatchEvent(new Event('resize'));
  }, {height, top, scale});
  await settle(page);
}
async function assertInside(page, locator, {top = 0, bottom}, label) {
  const rect = await locator.boundingBox();
  assert.ok(rect && rect.height > 0 && rect.y >= top - 1 && rect.y + rect.height <= bottom + 1,
    `${label} outside visible area: ${JSON.stringify(rect)}; ${top}..${bottom}`);
  assert.ok(await locator.evaluate(node => {
    const r = node.getBoundingClientRect();
    const target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return node === target || node.contains(target);
  }), `${label} must be reachable, not covered by another control`);
}

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    for (const viewport of [{width:320,height:480}, {width:360,height:640}, {width:640,height:360}, {width:1280,height:800}]) {
      const context = await browser.newContext({viewport, isMobile:viewport.width < 900, hasTouch:true, reducedMotion:'reduce'});
      await context.addInitScript(() => {
        const viewport = new EventTarget();
        window.viewportFixture = {height:null, top:0, scale:1};
        Object.defineProperties(viewport, {
          height:{get:() => window.viewportFixture.height ?? innerHeight},
          offsetTop:{get:() => window.viewportFixture.top},
          scale:{get:() => window.viewportFixture.scale}
        });
        Object.defineProperty(window, 'visualViewport', {value:viewport});
      });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== 'fixture.test') return route.abort();
        if (url.pathname === '/world.html') return route.fulfill({contentType:'text/html',body:world});
        if (url.pathname === '/note/') return route.fulfill({contentType:'text/html',body:stripScripts(read('park/index.html'))});
        if (url.pathname === '/') return route.fulfill({contentType:'text/html',body:stripScripts(read('index.html'))});
        const file = path.join(root, url.pathname);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
        return route.fulfill({path:file});
      });
      for (const source of ['world', 'note']) {
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`https://fixture.test/${source === 'world' ? 'world.html' : 'note/'}`);
        if (source === 'world') await page.waitForFunction(() => window.worldTest);
        else await page.addScriptTag({content:read('note/navigation.js')});
        await page.addScriptTag({content:read('mobile-viewport.js')});
        if (process.env.MOBILE_VIEWPORT_FONT) {
          const font = fs.readFileSync(process.env.MOBILE_VIEWPORT_FONT).toString('base64');
          await page.addStyleTag({content:`@font-face{font-family:ViewportQA;src:url(data:font/ttf;base64,${font})}:root{--font-b:ViewportQA,sans-serif;--font-d:ViewportQA,sans-serif}body{font-family:ViewportQA,sans-serif}`});
          await page.evaluate(() => document.fonts.ready);
        }
        // Park is embedded content: World supplies its only visible navigation.
        if(source==='note')assert.equal(await page.locator('.bottomnav').isVisible(),false,'Park must not duplicate World navigation');
        // Simulate a 48px system navigation area and a top notch.
        await page.addStyleTag({content:':root{--app-safe-bottom:48px;--app-safe-top:24px}html{scroll-behavior:auto}'});
        await settle(page);
        if (viewport.width < 900 && source === 'world') {
          for (const screen of ['friends','home','life','my']) {
            await page.evaluate(tab => worldTest.actions.tab({tab}), screen);
            await settle(page);
            await assertInside(page, page.locator('.bottomnav button').last(), {bottom:viewport.height-48}, `${source}/${screen} navigation`);
          }
          await page.evaluate(() => {const button=document.createElement('button');button.id='last-content';button.textContent='마지막 메뉴';(document.querySelector('#note-my-screen:not([hidden])') || document.querySelector('.main')).append(button);scrollTo(0,document.body.scrollHeight);});
          await settle(page);
          const nav = await page.locator('.bottomnav').boundingBox();
          await assertInside(page, page.locator('#last-content'), {bottom:nav.y}, `${source} last content`);
        }
        await page.addScriptTag({content:read('ju-charge.js')});
        await page.evaluate(source => {
          OjjudaCharge.install({source,getUserId:()=> 'viewport-test',client:{rpc:async()=>({data:{ok:true,enabled:true,coins:70,used:0,limit:5,left:5}})}});
          OjjudaCharge.open();
        }, source);
        await page.waitForFunction(() => !document.querySelector('.ju-charge-checkout').disabled);
        const area = {top:24,bottom:viewport.height-48};
        await assertInside(page, page.locator('.ju-charge-checkout'), area, `${source} charge button`);
        await snapshot(page, `${source}-charge-${viewport.width}`);
        const close = page.locator('.ju-charge-close');
        await assertInside(page, close, area, `${source} charge close`);
        const content = page.locator('.ju-charge-content');
        await content.evaluate(node => node.scrollTop = node.scrollHeight);
        assert.ok(await content.evaluate(node => node.scrollHeight <= node.clientHeight + node.scrollTop + 1));
        await close.click();
        if (viewport.width < 900 && source === 'world') {
          await visibleArea(page, viewport.height-60);
          await assertInside(page, page.locator('.bottomnav button').last(), {bottom:viewport.height-60-48}, `${source} navigation above browser controls`);
          await visibleArea(page, viewport.height);
        }

        if (source === 'note') {
          await page.evaluate(() => {document.querySelector('#composer-backdrop').hidden=false;document.querySelector('#publish-card').disabled=false;});
          await assertInside(page, page.locator('#publish-card'), area, 'note publish');
          await snapshot(page, `note-composer-${viewport.width}`);
          const shortHeight = Math.min(300, viewport.height - 100);
          await visibleArea(page, shortHeight, 30);
          await assertInside(page, page.locator('#publish-card'), {top:54,bottom:shortHeight+30-48}, 'note publish above keyboard');
          assert.ok(await page.locator('.composer-body').evaluate(node => node.clientHeight > 40 && node.scrollHeight > node.clientHeight));
          const beforeZoom = await page.locator('#publish-card').boundingBox();
          await visibleArea(page, 150, 40, 2);
          assert.deepEqual(await page.locator('#publish-card').boundingBox(), beforeZoom, 'pinch zoom must not relayout the composer');
          await visibleArea(page, viewport.height);
          await page.evaluate(() => document.querySelector('#composer-backdrop').hidden=true);
        } else {
          await page.evaluate(() => worldTest.modal('<div style="height:900px">내용</div><button id="modal-save">저장</button>', '설정'));
          await page.locator('.modal').evaluate(node => node.scrollTop = node.scrollHeight);
          await assertInside(page, page.locator('#modal-save'), area, 'world modal save');
          await page.evaluate(() => document.querySelector('#modal-root').innerHTML='');
          await page.addScriptTag({content:read('world-spot-game.js')});
          await page.evaluate(() => OjjudaSpotGame.open());
          const frame = await page.locator('.spot-game-dialog iframe').boundingBox();
          assert.ok(frame.y + frame.height <= viewport.height-48+1, 'embedded game stays above system navigation');
          await page.locator('.spot-game-header button').click();
          await page.evaluate(async () => {
            const {openHouseTest} = await import('/house-test/host.js');
            window.closeHouse = openHouseTest({owner:'viewport-test',authorized:()=>true});
          });
          const house = page.frameLocator('iframe[title="우리집"]');
          await house.locator('#app').waitFor({state:'visible'});
          await assertInside(page, house.locator('nav button').last(), area, 'house navigation');
          await snapshot(page, `house-${viewport.width}`);
          await page.evaluate(() => closeHouse());
        }
        if (process.env.MOBILE_VIEWPORT_QA_DIR) {
          fs.mkdirSync(process.env.MOBILE_VIEWPORT_QA_DIR,{recursive:true});
          await page.screenshot({path:path.join(process.env.MOBILE_VIEWPORT_QA_DIR,`${source}-${viewport.width}.png`)});
        }
        assert.deepEqual(errors, [], `${source} runtime errors`);
        await page.close();
      }
      const portal = await context.newPage();
      await portal.goto('https://fixture.test/');
      await portal.addScriptTag({content:read('mobile-viewport.js')});
      await portal.addStyleTag({content:':root{--app-safe-bottom:48px;--app-safe-top:24px}'});
      await portal.evaluate(() => document.querySelector('#auth-dialog').showModal());
      await visibleArea(portal, Math.min(320,viewport.height), 20);
      await portal.locator('.dialog-shell').evaluate(node => node.scrollTop=node.scrollHeight);
      await assertInside(portal, portal.locator('#auth-submit'), {top:44,bottom:Math.min(320,viewport.height)+20-48}, 'login above keyboard');
      await context.close();
    }
    console.log('PASS: small portrait/landscape/desktop, system safe area, menus, charge, composer, keyboard, pinch zoom, games, house and login');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
