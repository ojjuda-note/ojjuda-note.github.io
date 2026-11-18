const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const stripScripts = html => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
let world = read('world.html').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '')
  .replace('import { screw3d as screwGame } from "./games/screw/screw3d.js";', 'const screwGame={};');
world = world.replace('<script type="module">', `<script>${read('app/world/world-navigation.js')}</script><script type="module">`);
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
const writingTools = ['photo','font','color','box','effect','location','settings'];
async function checkPanelLayout(page,key,viewport,area,keyboard=false){
  const label=`${key} options ${viewport.width}px${keyboard?' above keyboard':''}`;
  const panel=page.locator('#compose-more');
  await snapshot(page,`note-composer-option-${key}-${keyboard?'keyboard':'compact'}-${viewport.width}`);
  await assertInside(page,panel,area,label);
  const geometry=await panel.evaluate(panel=>{
    const box=panel.getBoundingClientRect(),toolbar=document.querySelector('.compose-toolbar').getBoundingClientRect();
    const content=panel.querySelector('.compose-more-content');
    return {height:box.height,left:box.left,right:box.right,bottom:box.bottom,toolbarTop:toolbar.top,
      contentWidth:content.clientWidth,contentScrollWidth:content.scrollWidth};
  });
  const limit=key==='color'?140:key==='box'?200:key==='font'?220:280;
  assert.ok(geometry.height<=limit+1,label+' keeps its compact height: '+JSON.stringify({limit,...geometry}));
  assert.ok(geometry.left>=-1&&geometry.right<=viewport.width+1&&Math.abs(geometry.bottom-geometry.toolbarTop)<=2,
    label+' stays in the viewport directly above the toolbar: '+JSON.stringify(geometry));
  assert.ok(geometry.contentScrollWidth<=geometry.contentWidth+1,label+' has no horizontal page scrolling: '+JSON.stringify(geometry));
  assert.equal(await page.locator('[data-compose-panel]:not([hidden])').count(),1,'only the selected option panel is visible');
  assert.equal(await page.locator('[data-compose-panel="'+key+'"]').isVisible(),true);
}
async function checkAllCompactPanels(page,viewport,area,keyboard=false){
  assert.deepEqual(await page.locator('[data-compose-tool]').evaluateAll(buttons=>buttons.map(button=>button.dataset.composeTool)),writingTools);
  const state=()=>page.evaluate(()=>{
    const input=document.activeElement;
    return {body:document.querySelector('#compose-text').value,tags:document.querySelector('#compose-tags').value,
      focused:input.id,start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection};
  });
  const before=await state();
  for(const key of writingTools){
    const button=page.locator('[data-compose-tool="'+key+'"]');
    const target=await button.boundingBox();
    assert.ok(target.width>=44&&target.height>=44,key+' retains a full touch target');
    await assertInside(page,button,area,key+' writing option');
    if(await button.getAttribute('aria-expanded')!=='true')await button.tap();
    await settle(page);
    assert.deepEqual(await state(),before,'opening '+key+' keeps the native input, text and selection');
    await checkPanelLayout(page,key,viewport,area,keyboard);
  }
  await page.locator('[data-compose-tool="settings"]').tap();
  assert.equal(await page.locator('[data-compose-panel]:not([hidden])').count(),0,'the final tool closes without changing the draft');
  assert.deepEqual(await state(),before);
}
async function checkCompactColors(page, viewport, area, keyboard = false) {
  const label = `color options ${viewport.width}px${keyboard ? ' above keyboard' : ''}`;
  const state = () => page.locator('#compose-text').evaluate(input => ({
    body:input.value, start:input.selectionStart, end:input.selectionEnd, direction:input.selectionDirection
  }));
  const before = await state();
  const content = page.locator('#compose-more-content');
  for(const [group,key] of [['textColor','color'],['boxColor','box']]){
    const button=page.locator('[data-compose-tool="'+key+'"]');
    if(await button.getAttribute('aria-expanded')!=='true')await button.tap();
    await checkPanelLayout(page,key,viewport,area,keyboard);
    const other=group==='textColor'?'boxColor':'textColor';
    assert.equal(await page.locator(`[data-color-field="${other}"]`).isVisible(),false,'the other color palette stays in its own panel');
    const choices=page.locator(`[data-color-field="${group}"] .note-color-choice`);
    assert.equal(await choices.count(),8,group+' keeps all eight colors');
    const row=await choices.evaluateAll(choices=>choices.map(choice=>{
      const box=choice.getBoundingClientRect();
      return {left:box.left,right:box.right,top:box.top,width:box.width,height:box.height};
    }));
    assert.ok(row.every((box,index)=>box.width>=44&&box.height>=44
      &&Math.abs(box.top-row[0].top)<=1&&(!index||box.left>=row[index-1].right-1)),
      label+' '+group+' keeps eight separate 44px touch targets in its scrolling row: '+JSON.stringify(row));
    for(const choice of await choices.all()){
      await choice.scrollIntoViewIfNeeded();
      await assertInside(page,choice,area,label+' '+group+' color');
      const value=await choice.getAttribute('data-color');
      await choice.tap();
      assert.equal(await choice.locator('input').isChecked(),true,group+' '+value+' responds to touch');
      assert.equal(await page.evaluate(group=>currentStyle()[group],group),value,group+' '+value+' reaches the card style');
    }
  }
  const slider=page.locator('#compose-box-transparency'), number=page.locator('#compose-box-transparency-value');
  await number.scrollIntoViewIfNeeded();
  await assertInside(page,slider,area,label+' opacity slider');
  await assertInside(page,number,area,label+' opacity number');
  for(const [key,value] of [['Home','0'],['End','100']]){
    await slider.press(key);
    assert.equal(await number.inputValue(),value,'slider updates the opacity number');
  }
  await number.fill('37');
  assert.equal(await slider.inputValue(),'37','numeric opacity updates the slider');
  assert.equal(await page.evaluate(()=>currentStyle().boxTransparency),37,'numeric opacity reaches the card style');
  assert.deepEqual(await state(),before,label+' preserves the original writing and selected range');
  await snapshot(page,`note-composer-box-${keyboard?'keyboard-opacity':'compact-opacity'}-${viewport.width}`);
  await content.evaluate(node=>node.scrollTop=0);
  await page.locator('[data-color-field="boxColor"] [data-color="default"]').tap();
  await number.fill('25');
  await page.locator('[data-compose-tool="color"]').tap();
  await page.locator('[data-color-field="textColor"] [data-color="default"]').tap();
  assert.equal(await page.locator('[data-compose-tool="color"]').getAttribute('data-selected'),'false');
  assert.equal(await page.locator('[data-compose-tool="box"]').getAttribute('data-selected'),'false');
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
        else {
          await page.addScriptTag({content:read('note/calligraphy.js')});
          await page.addScriptTag({content:read('note/composer-tools.js')});
          await page.addScriptTag({content:read('note/preview.js')});
          await page.addScriptTag({content:read('note/navigation.js')});
          await page.evaluate(() => {
            authKnown=ready=true; session={user:{id:'viewport-test'}};
            myIdentity={gender:'private'};myIdentityReady=true;myGender='private';
            autoWritingLocation=()=>{};
          });
        }
        await page.addScriptTag({content:read('shared/viewport/mobile-viewport.js')});
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
          for (const screen of ['arcade','park','my']) {
            await page.evaluate(tab => worldTest.actions.tab({tab}), screen);
            await settle(page);
            await assertInside(page, page.locator('.bottomnav button').last(), {bottom:viewport.height-48}, `${source}/${screen} navigation`);
          }
          await page.evaluate(() => {const button=document.createElement('button');button.id='last-content';button.textContent='마지막 메뉴';(document.querySelector('#note-my-screen:not([hidden])') || document.querySelector('.main')).append(button);scrollTo(0,document.body.scrollHeight);});
          await settle(page);
          const nav = await page.locator('.bottomnav').boundingBox();
          await assertInside(page, page.locator('#last-content'), {bottom:nav.y}, `${source} last content`);
        }
        await page.addScriptTag({content:read('features/wallet/ju-charge.js')});
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
          await page.evaluate(async () => {await openComposer('memo');document.querySelector('#publish-card').disabled=false;});
          assert.equal(await page.locator('#compose-text').evaluate(input=>document.activeElement===input),true,
            'the initial writer focuses the native text field at every viewport size');
          await page.keyboard.insertText('열자마자 한글 입력');
          assert.equal(await page.locator('#compose-text').inputValue(),'열자마자 한글 입력');
          await assertInside(page, page.locator('#publish-card'), area, 'note publish');
          for (const button of await page.locator('[data-compose-tool]').all()) {
            await assertInside(page, button, area, 'note option toolbar');
          }
          await snapshot(page, `note-composer-${viewport.width}`);
          if(viewport.width<=360){
            await page.locator('#compose-text').fill('색상을 바꾸는 중\n남아 있는 글');
            await page.locator('#compose-text').evaluate(input=>input.setSelectionRange(2,5,'backward'));
            await checkAllCompactPanels(page,viewport,area);
            await page.locator('[data-compose-tool="color"]').tap();
            assert.equal(await page.locator('#compose-text').evaluate(input=>document.activeElement===input),true,
              'opening the color panel keeps the writing input focused');
            assert.deepEqual(await page.locator('#compose-text').evaluate(input=>[input.selectionStart,input.selectionEnd,input.selectionDirection]),
              [2,5,'backward'],'opening the color panel preserves the selected writing range');
            await checkCompactColors(page,viewport,area);
            await page.locator('[data-compose-tool="color"]').tap();
          }
          await page.locator('#compose-text').fill('입력 중');
          const shortHeight = Math.min(300, viewport.height - 100);
          await visibleArea(page, shortHeight, 30);
          await assertInside(page, page.locator('#publish-card'), {top:54,bottom:shortHeight+30-48}, 'note publish above keyboard');
          for (const button of await page.locator('[data-compose-tool]').all()) {
            await assertInside(page, button, {top:54,bottom:shortHeight+30-48}, 'note toolbar above keyboard');
          }
          const checkWritingLine = async (lineIndex, label) => {
            const readPosition = ({lineIndex, visibleOnly=false, bottom}) => {
              const input=document.getElementById('compose-text');
              const box=input.getBoundingClientRect(), body=input.closest('.composer-body').getBoundingClientRect();
              const style=getComputedStyle(input), line=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.4;
              const x=box.left+box.width/2, y=box.top+parseFloat(style.paddingTop)+(lineIndex+.5)*line-input.scrollTop;
              const hit=document.elementFromPoint(x,y);
              const result={focused:document.activeElement===input, atEnd:input.selectionEnd===input.value.length,
                x, y, top:body.top, bottom:body.bottom, visible:y>=body.top&&y<=body.bottom&&hit===input};
              return visibleOnly ? result.focused&&result.atEnd&&result.visible&&y>=54&&y<=bottom : result;
            };
            // The viewport resize, body ResizeObserver and scoped scroll run in separate frames.
            // Wait for the real cursor line, then retain precise geometry in any assertion failure.
            await page.waitForFunction(readPosition,{lineIndex,visibleOnly:true,bottom:shortHeight+30-48},{timeout:5000})
              .catch(error=>{if(error.name!=='TimeoutError')throw error;});
            const caret=await page.evaluate(readPosition,{lineIndex});
            assert.equal(caret.focused,true,label+': the writing input keeps focus');
            assert.equal(caret.atEnd,true,label+': the cursor stays at the end of the entered text');
            assert.ok(caret.visible && caret.y>=54 && caret.y<=shortHeight+30-48,
              label+': the current text line must stay visible above the keyboard: '+JSON.stringify(caret));
          };
          await checkWritingLine(0,'single line');
          await snapshot(page, `note-composer-caret-${viewport.width}`);
          await page.locator('#compose-text').fill('첫째\n둘째\n셋째');
          await visibleArea(page, shortHeight, 30);
          await checkWritingLine(2,'third explicit line');
          await page.locator('#compose-tags').fill('태그');
          await visibleArea(page, shortHeight, 30);
          const readTagPosition = visibleOnly => {
            const input=document.getElementById('compose-tags');
            const box=input.getBoundingClientRect(), body=input.closest('.composer-body').getBoundingClientRect();
            const x=box.left+box.width/2,y=box.top+box.height/2;
            const result={focused:document.activeElement===input,x,y,top:body.top,bottom:body.bottom,
              visible:y>=body.top&&y<=body.bottom&&document.elementFromPoint(x,y)===input};
            return visibleOnly ? result.focused&&result.visible : result;
          };
          await page.waitForFunction(readTagPosition,true,{timeout:5000})
            .catch(error=>{if(error.name!=='TimeoutError')throw error;});
          const tagPosition=await page.evaluate(readTagPosition,false);
          assert.equal(tagPosition.focused,true,'editing tags keeps focus above the keyboard');
          assert.equal(tagPosition.visible,true,'the tag input stays visible inside the scrollable body: '+JSON.stringify(tagPosition));
          await assertInside(page, page.locator('#compose-tags'), {top:54,bottom:shortHeight+30-48}, 'tag input above keyboard');
          assert.equal(await page.locator('#compose-text').inputValue(),'첫째\n둘째\n셋째','moving to tags preserves all written lines');
          await snapshot(page, `note-composer-tags-${viewport.width}`);
          if(viewport.width<=360){
            await checkAllCompactPanels(page,viewport,{top:54,bottom:shortHeight+30-48},true);
            await page.locator('[data-compose-tool="color"]').tap();
            assert.equal(await page.locator('#compose-tags').evaluate(input=>document.activeElement===input),true,
              'opening color options also keeps tag editing focused above the keyboard');
          }
          else await page.locator('[data-compose-tool="color"]').click();
          for (const button of await page.locator('[data-compose-tool]').all()) {
            await assertInside(page, button, {top:54,bottom:shortHeight+30-48}, 'note toolbar with keyboard and color panel');
          }
          await snapshot(page, `note-composer-keyboard-${viewport.width}`);
          if(viewport.width<=360)await checkCompactColors(page,viewport,{top:54,bottom:shortHeight+30-48},true);
          await page.locator('[data-compose-tool="color"]').click();
          const fontTool=page.locator('[data-compose-tool="font"]');
          const pressFont=()=>viewport.width<900?fontTool.tap():fontTool.click();
          await pressFont();
          await page.locator('#compose-font').selectOption('calligraphy');
          await page.locator('#compose-text').fill('첫째\n둘째\n셋째');
          await visibleArea(page,shortHeight,30);
          await page.waitForFunction(()=>document.querySelector('.compose-photo').classList.contains('park-ink-writing'));
          assert.equal(await page.locator('#compose-text').evaluate(input=>input.parentElement.matches('.compose-photo')),true,
            'calligraphy edits stay on the photo while the keyboard is open');
          await checkWritingLine(2,'calligraphy third explicit line');
          await snapshot(page,`note-composer-calligraphy-caret-${viewport.width}`);
          const writingSelection=await page.locator('#compose-text').evaluate(input=>[input.selectionStart,input.selectionEnd,input.selectionDirection]);
          await pressFont();
          assert.equal(await fontTool.getAttribute('aria-expanded'),'true');
          assert.equal(await page.locator('#compose-text').evaluate(input=>document.activeElement===input),true,
            'touching an option while typing keeps the writing input focused');
          assert.deepEqual(await page.locator('#compose-text').evaluate(input=>[input.selectionStart,input.selectionEnd,input.selectionDirection]),
            writingSelection,'opening an option preserves the writing selection');
          const fontPanel=await page.locator('#compose-more').boundingBox();
          const toolbar=await page.locator('.compose-toolbar').boundingBox();
          assert.ok(fontPanel&&toolbar&&Math.abs(fontPanel.y+fontPanel.height-toolbar.y)<=2,
            'the option panel opens directly above the writing toolbar: '+JSON.stringify({fontPanel,toolbar}));
          for(const id of ['compose-font','compose-size']){
            await assertInside(page,page.locator('#'+id),{top:54,bottom:shortHeight+30-48},id+' is immediately available above the keyboard');
          }
          assert.equal(await page.locator('#compose-more-content').evaluate(node=>node.scrollTop),0,
            'font and size are visible without first scrolling the panel');
          await snapshot(page,`note-composer-calligraphy-font-${viewport.width}`);
          await pressFont();
          assert.equal(await fontTool.getAttribute('aria-expanded'),'false');
          await checkWritingLine(2,'calligraphy after closing the font panel');
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
          await page.addScriptTag({content:read('shared/games/puzzle-record-queue.js')});
          await page.addScriptTag({content:read('games/spot-difference/world-spot-game.js')});
          await page.evaluate(() => OjjudaSpotGame.open());
          const frame = await page.locator('.spot-game-dialog iframe').boundingBox();
          assert.ok(frame.y + frame.height <= viewport.height-48+1, 'embedded game stays above system navigation');
          await page.locator('.spot-game-header .arcade-return').click();

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
      await portal.addScriptTag({content:read('shared/viewport/mobile-viewport.js')});
      await portal.addStyleTag({content:':root{--app-safe-bottom:48px;--app-safe-top:24px}'});
      await portal.evaluate(() => document.querySelector('#auth-dialog').showModal());
      await visibleArea(portal, Math.min(320,viewport.height), 20);
      await portal.locator('.dialog-shell').evaluate(node => node.scrollTop=node.scrollHeight);
      await assertInside(portal, portal.locator('#auth-submit'), {top:44,bottom:Math.min(320,viewport.height)+20-48}, 'login above keyboard');
      await context.close();
    }
    console.log('PASS: small portrait/landscape/desktop, system safe area, menus, charge, composer, keyboard, pinch zoom, games and login');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
