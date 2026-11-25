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
    page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(12000);
    const errors=[];
    page.on('pageerror', error => errors.push(error.message));
    const touch = await page.context().newCDPSession(page);
    await page.addInitScript(room => {
      const user = {id:'10000000-0000-4000-8000-000000000002'};
      window.supabase = {createClient:() => ({
        auth:{getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:{user}}}),onAuthStateChange(){}},
        from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{value:'공지'}})})})}),
        schema:()=>({rpc:async()=>({data:[]})}),
        rpc:async(name,args) => ({data:name==='group_home_sorted' ? {rooms:[room],directory:[room],invitations:[]} :
          args?.p_action==='rooms'?[room]:args?.p_action==='preview_link'?{group_name:room.name}:[]})
      })};
      window.OjjudaGetClient=async()=>window.ojjudaSupabase ||= window.supabase.createClient();
    }, group);
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/world.html') {
        // Render the real screen and install the production gesture handlers without starting account bootstrap.
        let html = fs.readFileSync(path.join(root,'world.html'),'utf8')
          .replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>/g,(tag,src) =>
            /app\/world\/world-(?:group-tab|navigation|themes)\.js|shared\/viewport\/mobile-viewport\.js|shared\/pwa\/app-identity\.js|features\/home\/agit-hub\.js/.test(src) ? tag : '')
          .replace('import { screw3d as screwGame } from "./games/screw/screw3d.js";','const screwGame={};');
        const boot = html.indexOf('j1(()=>H());gm(');
        assert.ok(boot > 0);
        html = html.slice(0,boot) + '$.coins=127;window.revokeGroupAccount=()=>invalidateWorldAuth();gm();sr.tab({tab:new URL(location.href).searchParams.get("tab")||"hub"});' + html.slice(html.indexOf('</script>',boot));
        return route.fulfill({contentType:'text/html', body:html});
      }
      const file = path.join(root,url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname);
      return fs.existsSync(file) && fs.statSync(file).isFile() ? route.fulfill({path:file}) : route.abort();
    });
    await page.goto(origin + '/world.html?tab=hub'+(store?'&play_store=1':''));
    await page.evaluate(()=>{window.testDocument=document;});
    const chrome=()=>page.evaluate(()=>['.topbar','.bottomnav'].map(sel=>{
      const el=document.querySelector(sel),r=el.getBoundingClientRect();
      return [r.x,r.y,r.width,r.height,getComputedStyle(el).backgroundColor];
    }));
    const hubChrome=await chrome();
    async function checkWallet(){
      const wallet=page.locator('.topbar .coinpill');
      assert.ok(await wallet.isVisible());
      assert.equal(await wallet.locator('.ojjuda-service-amount').textContent(),'127');
    }
    await checkWallet();
    await page.locator('.bottomnav [data-tab=hub][aria-current]').waitFor();
    const icon = page.locator('.bottomnav [data-tab=group] use');
    await page.waitForFunction(() => document.querySelector('.bottomnav [data-tab=group] use')?.getBBox().width > 10);
    assert.ok(await icon.evaluate(el => el.getBBox().height > 10));

    async function slideWorld(from, dx) {
      const box = await page.locator('.bottomnav [data-tab='+from+']').boundingBox();
      await swipe(touch, dx<0 ? 285 : 100,box.y+box.height/2,dx);
    }
    const groups=page.locator('#world-group-tab');
    async function slideGroups(dx) {
      const box = await groups.locator('.group-card').first().boundingBox();
      await swipe(touch, dx<0 ? 285 : 100, box.y+24, dx);
    }
    const hero = await page.locator('.agit-hero, .agit-guest-hero, .agit-checkin').first().boundingBox();
    await swipe(touch,285,Math.max(80,hero.y+25),-155);
    await page.waitForURL('**tab=group*');
    const card = groups.locator('.group-card').first();
    await card.waitFor();
    assert.deepEqual(await chrome(),hubChrome);
    await checkWallet();
    assert.equal(await groups.locator('iframe,.group-main-nav,.top,#group-service-notice').count(),0);
    assert.equal(await groups.evaluate(el=>el.ownerDocument===window.testDocument),true);
    const groupRequests=()=>page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname.startsWith('/groups/')).length);
    const firstLoad=await groupRequests();
    for(const dark of [true,false]){
      await page.emulateMedia({colorScheme:dark?'dark':'light'});
      await page.waitForFunction(isDark=>{
        const html=document.documentElement,host=document.querySelector('#world-group-tab'),main=host.shadowRoot.querySelector('main');
        const token=(el,k)=>getComputedStyle(el).getPropertyValue(k).trim();
        const sample=document.createElement('span');
        sample.style.color='var(--accent)';main.append(sample);
        const accent=getComputedStyle(sample).color;sample.remove();
        return getComputedStyle(main.querySelector('.group-card-footer .primary')).backgroundColor===accent &&
          (html.dataset.theme==='dark')===isDark && token(main,'--accent')===token(html,'--accent') &&
          token(main,'--bg')===token(html,'--bg') && getComputedStyle(host).backgroundColor==='rgba(0, 0, 0, 0)';
      },dark);
    }
    await card.waitFor();
    for (const width of [320,390,750,1280]) {
      await page.setViewportSize({width,height:844});
      if(width<900)await page.waitForFunction(()=>Math.abs(document.querySelector('#world-group-tab').getBoundingClientRect().bottom-document.querySelector('.bottomnav').getBoundingClientRect().top)<2);
      const frameBox=await page.locator('#world-group-tab').boundingBox(),nav=await page.locator('.bottomnav').boundingBox();
      assert.ok(frameBox.height>400 && (width>=900 || frameBox.y+frameBox.height<=nav.y+3),JSON.stringify({frameBox,nav}));
      const size = await groups.evaluate(host => {
        const pos = s => host.shadowRoot.querySelector(s).getBoundingClientRect();
        return {controls:pos('.directory-toolbar').bottom-pos('.group-directory-hero').top,
          width:document.documentElement.scrollWidth, searchY:pos('#directory-query').y,sortY:pos('.directory-sort').y,
          cardTitle:parseFloat(getComputedStyle(host.shadowRoot.querySelector('.group-card h3')).fontSize)};
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
    assert.equal(await groups.locator('dialog:modal').count(),1);
    await swipe(touch,275,390,-145);
    assert.equal(new URL(page.url()).searchParams.get('tab'),'group');
    await groups.locator('dialog[open] [data-close]').click();
    await page.waitForFunction(()=>!document.getElementById('world-group-tab').shadowRoot.querySelector('dialog[open]') && !history.state?.ojjudaGroupDialog);
    await slideGroups(-155);
    await page.locator('.bottomnav [data-tab=arcade][aria-current]').waitFor();
    assert.equal(await page.locator('.arcade-ranking-entry').isVisible(),true);
    assert.equal(await page.locator('[data-arcade-games=solo]').count(),store?0:1);
    await checkWallet();
    await page.goBack();
    await card.waitFor();
    assert.equal(await groups.locator('[data-sort=members]').getAttribute('aria-pressed'),'true');
    await page.locator('.bottomnav [data-tab=arcade]').tap();
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
    const blank=await groups.boundingBox();
    await swipe(touch,100,blank.y+blank.height-18,155);
    await page.locator('.bottomnav [data-tab=hub][aria-current]').waitFor();
    assert.equal(await page.evaluate(()=>window.testDocument===document),true);
    assert.equal(await groupRequests(),firstLoad);
    await page.goto(origin + '/groups/');
    await page.waitForURL('**tab=group');
    await card.waitFor();
    await page.locator('.bottomnav [data-tab=arcade]').tap();
    await page.locator('.arcade-ranking-entry').waitFor();
    await page.evaluate(()=>window.revokeGroupAccount());
    assert.equal(await groups.count(),0,'sign-out clears a hidden private group board');
    await page.goto(origin+'/groups/?ref='+group.id+'#room='+group.id);
    await groups.locator('.group-room-hero').waitFor();
    assert.equal(new URL(page.url()).pathname,'/world.html');
    assert.equal(new URL(page.url()).searchParams.get('ref'),group.id);
    assert.equal(new URL(page.url()).hash,'#room='+group.id);
    await page.locator('.bottomnav [data-tab=arcade]').tap();
    assert.equal(new URL(page.url()).hash,'');
    await page.locator('.bottomnav [data-tab=group]').tap();
    await groups.locator('.group-room-hero').waitFor();
    assert.equal(new URL(page.url()).hash,'#room='+group.id);
    await page.goto(origin+'/groups/#invite='+group.id);
    await groups.getByRole('dialog',{name:'그룹 초대'}).waitFor();
    assert.equal(new URL(page.url()).pathname,'/world.html');
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
});
