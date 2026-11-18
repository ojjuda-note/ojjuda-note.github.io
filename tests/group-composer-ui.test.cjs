const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const owner='00000000-0000-4000-8000-000000000001';
const room='10000000-0000-4000-8000-000000000001';
const second='10000000-0000-4000-8000-000000000002';
const writing='한글로 적은 긴 기록\n'.repeat(1000).slice(0,10000);

async function settle(page){
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function viewportArea(page,height,top=0){
  await page.evaluate(({height,top})=>{
    Object.assign(window.groupViewport,{height,top});
    visualViewport.dispatchEvent(new Event('resize'));
  },{height,top});
  await settle(page);
}
async function snapshot(page,name){
  if(!process.env.GROUP_COMPOSER_QA_DIR)return;
  fs.mkdirSync(process.env.GROUP_COMPOSER_QA_DIR,{recursive:true});
  await page.screenshot({path:path.join(process.env.GROUP_COMPOSER_QA_DIR,name+'.png')});
}
async function inside(page,selector,{top,bottom},label){
  const target=page.locator(selector),box=await target.boundingBox();
  assert.ok(box&&box.height>0&&box.y>=top-1&&box.y+box.height<=bottom+1,
    label+' remains in the visible area: '+JSON.stringify({box,top,bottom}));
  assert.equal(await target.evaluate(node=>{
    const box=node.getBoundingClientRect(),hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
    return hit===node||node.contains(hit);
  }),true,label+' remains reachable');
}
async function verifyLayout(page,viewport,area,{panel=false}={}){
  const state=await page.evaluate(()=>{
    const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const dialog=document.querySelector('.group-writing-dialog');
    const overflow=[document.documentElement,dialog,...dialog.querySelectorAll('.group-compose-body,.group-compose-options-body')]
      .filter(node=>node.clientWidth&&node.scrollWidth>node.clientWidth+1).map(node=>({class:node.className,width:node.clientWidth,scroll:node.scrollWidth}));
    return {dialog:rect(dialog),toolbar:rect(dialog.querySelector('.group-compose-toolbar')),
      options:rect(dialog.querySelector('.group-compose-options')),overflow,
      tools:[...dialog.querySelectorAll('.group-compose-toolbar [data-group-tool]')].map(button=>({key:button.dataset.groupTool,
        icon:!!button.querySelector('svg'),...rect(button)}))};
  });
  assert.deepEqual(state.overflow,[],`${viewport.width}px has no horizontal overflow`);
  assert.ok(state.dialog.left>=-1&&state.dialog.right<=viewport.width+1,JSON.stringify(state));
  if(viewport.width<640)assert.ok(Math.abs(state.dialog.width-viewport.width)<=1,'mobile writer uses the full width');
  else assert.ok(state.dialog.width<=721,'desktop writer retains a readable maximum width');
  await inside(page,'.group-compose-toolbar',area,'writing toolbar');
  assert.deepEqual(state.tools.map(tool=>tool.key),['post','photo','plan','poll','bet'],'the five categories keep the requested order');
  for(const tool of state.tools){
    assert.ok(tool.icon&&tool.width>=44&&tool.height>=44&&tool.left>=-1&&tool.right<=viewport.width+1
      &&Math.abs(tool.top-state.tools[0].top)<=1,'every picture tool fits in one row with a full touch target: '+JSON.stringify(tool));
    await inside(page,'.group-compose-toolbar [data-group-tool='+tool.key+']',area,tool.key+' writing option');
  }
  if(panel){
    await inside(page,'.group-compose-options',area,'selected option panel');
    assert.ok(state.options.height<=261,'group options keep their compact 260px maximum: '+JSON.stringify(state.options));
    assert.ok(Math.abs(state.options.bottom-state.toolbar.top)<=1,'options open immediately above the toolbar');
    assert.equal(await page.locator('[data-group-panel]:not([hidden])').count(),1,'only the selected options are visible');
  }else await inside(page,'.group-compose-head',area,'close and publish controls');
}
async function visibleEdgeLine(body,edge){
  // Native textarea scroll geometry locates the first/last line without copying
  // the production caret measurement. Real key presses scroll its inner editor.
  const line=await body.evaluate((input,edge)=>{
    const rect=input.getBoundingClientRect(),area=input.closest('.group-compose-body').getBoundingClientRect(),style=getComputedStyle(input);
    const height=parseFloat(style.lineHeight),paddingTop=parseFloat(style.paddingTop),paddingBottom=parseFloat(style.paddingBottom);
    const top=rect.top+input.clientTop+(edge==='start'?paddingTop-input.scrollTop:input.scrollHeight-paddingBottom-input.scrollTop-height);
    return {top,bottom:top+height,visibleTop:Math.max(area.top,rect.top+input.clientTop),
      visibleBottom:Math.min(area.bottom,rect.top+input.clientTop+input.clientHeight),focused:document.activeElement===input,
      field:{top:rect.top,bottom:rect.bottom,height:rect.height,clientTop:input.clientTop,clientHeight:input.clientHeight,
        scrollTop:input.scrollTop,scrollHeight:input.scrollHeight},
      area:{top:area.top,bottom:area.bottom,height:area.height,scrollTop:input.closest('.group-compose-body').scrollTop},
      font:{size:style.fontSize,lineHeight:height,paddingTop,paddingBottom},
      selection:{start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection}};
  },edge);
  await snapshot(body.page(),'group-short-keyboard-'+edge+'-320');
  assert.equal(line.focused,true,'native keyboard movement retains input focus');
  assert.ok(line.top>=line.visibleTop-3&&line.bottom<=line.visibleBottom+3,
    edge+' caret line stays visible in the writing area: '+JSON.stringify(line));
}

async function fixture(browser,viewport){
  const context=await browser.newContext({viewport,isMobile:viewport.width<640,hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    const viewport=new EventTarget();window.groupViewport={height:null,top:0,scale:1};
    Object.defineProperties(viewport,{
      height:{get:()=>window.groupViewport.height??innerHeight},width:{get:()=>innerWidth},
      offsetTop:{get:()=>window.groupViewport.top},offsetLeft:{get:()=>0},scale:{get:()=>window.groupViewport.scale}
    });
    Object.defineProperty(window,'visualViewport',{value:viewport});
  });
  await page.route('**/*',route=>{
    if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><header class="top">오쭈다 아지트</header><main id="app"></main><div id="toast" role="status"></div></body></html>'});
    const url=new URL(route.request().url());
    if(url.origin==='https://group.test'&&url.pathname==='/shared/brand/brand-copy.css')
      return route.fulfill({contentType:'text/css',path:path.join(root,'shared/brand/brand-copy.css')});
    if(url.origin==='https://group.test'&&/^\/assets\/(?:cozy-scenes|screw-flat)\/[a-z0-9-]+\.webp$/.test(url.pathname))
      return route.fulfill({contentType:'image/webp',path:path.join(root,url.pathname.slice(1))});
    return route.abort();
  });
  await page.goto('https://group.test/groups/#room='+room);
  for(const file of ['shared/viewport/mobile-viewport.css','groups/style.css','groups/composer.css','features/groups/appearance.css'])await page.addStyleTag({path:path.join(root,file)});
  await page.evaluate(({owner,room,second})=>{
    const rooms=[{id:room,name:'주말 여행단',owner_id:owner,member_count:2},{id:second,name:'함께 걷기',owner_id:owner,member_count:3}];
    const uploads=new Map();let posts=[];
    window.groupCalls=[];window.groupHoldSave=false;
    window.OJJUDA_CONFIG={supabaseUrl:'https://example.supabase.co',supabaseKey:'public'};
    window.supabase={createClient:()=>({
      auth:{getUser:async()=>({data:{user:{id:owner}}}),onAuthStateChange:()=>{}},
      storage:{from:()=>({
        upload:async(path,file)=>{uploads.set(path,file);return {data:{path}};},
        remove:async paths=>{paths.forEach(path=>uploads.delete(path));return {data:[]};},
        download:async path=>({data:uploads.get(path)})
      })},
      rpc:async(name,args)=>{
        const action=name==='group_home'?'home':args.p_action,payload=args.p_payload||{};
        window.groupCalls.push({action,payload:structuredClone(payload)});
        if(action==='rooms')return {data:rooms};
        if(action==='home')return {data:{rooms,directory:rooms.map(room=>({...room,is_member:true})),invitations:[]}};
        if(action==='feed')return {data:posts.filter(post=>post.room_id===payload.room_id)};
        if(action==='save'){
          const finish=()=>{
            const media=payload.media.map(file=>({...file,mime:uploads.get(file.path)?.type||file.mime,size:uploads.get(file.path)?.size||file.size}));
            const post={...payload,media,room_name:rooms.find(room=>room.id===payload.room_id).name,author_id:owner,author_name:'민준',
              created_at:'2026-11-18T00:00:00Z',updated_at:'2026-11-18T00:01:00Z',comment_count:0};
            posts=[post,...posts.filter(old=>old.id!==post.id)];return {data:post};
          };
          if(window.groupHoldSave)return new Promise(resolve=>{window.groupFinishSave=()=>resolve(finish());});
          return finish();
        }
        if(['received','calendar','members','requests'].includes(action))return {data:[]};
        throw Error('Unexpected fixture action: '+action);
      }
    })};
  },{owner,room,second});
  for(const file of ['groups/activities.js','shared/viewport/mobile-viewport.js','groups/composer.js','shared/art/cozy-scenes.js','groups/app.js'])await page.addScriptTag({path:path.join(root,file)});
  await page.locator('[data-action=compose]').waitFor();
  return {page,context,errors};
}

test('group writing tools, keyboard layout, photos and full drafts stay usable across screen sizes',{timeout:150000},async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    for(const viewport of [{width:320,height:640},{width:390,height:844},{width:1280,height:900}]){
      const {page,context,errors}=await fixture(browser,viewport);
      try{
        await page.locator('[data-action=compose]').tap();
        const writer=page.locator('.group-writing-dialog'),body=writer.locator('[name=body]'),title=writer.locator('[name=title]');
        const tool=key=>writer.locator('[data-group-tool='+key+']');
        const submit=writer.locator('.group-compose-head [type=submit]');
        await writer.waitFor();await settle(page);
        assert.equal(await title.evaluate(node=>document.activeElement===node),true,'opening directly focuses the title for native typing');
        await page.keyboard.insertText('바로 적는 우리 모임');
        assert.equal(await title.inputValue(),'바로 적는 우리 모임','Korean typing reaches the title without a second field tap');
        assert.equal(await writer.locator('[data-group-panel]:not([hidden])').count(),0);
        assert.equal(await tool('plan').isVisible(),true);assert.equal(await tool('room').isDisabled(),false);
        assert.equal(await writer.locator('.group-compose-toolbar [data-group-tool=room]').count(),0);
        await verifyLayout(page,viewport,{top:0,bottom:viewport.height});
        await snapshot(page,'group-writing-'+viewport.width);
        await viewportArea(page,300,17);
        await inside(page,'#composer [name=title]',{top:17,bottom:317},'initial title above the keyboard');
        await verifyLayout(page,viewport,{top:17,bottom:317});
        await snapshot(page,'group-title-keyboard-'+viewport.width);
        await viewportArea(page,viewport.height);

        await tool('poll').tap();
        assert.equal(await writer.locator('[name=kind]').inputValue(),'poll');
        assert.equal(await writer.locator('[data-editor=poll]').isVisible(),true,'the poll icon opens its native editor directly');
        await snapshot(page,'group-poll-'+viewport.width);
        await tool('bet').tap();
        assert.equal(await writer.locator('[name=kind]').inputValue(),'poll','opening bet choices preserves the current kind');
        await verifyLayout(page,viewport,{top:0,bottom:viewport.height},{panel:true});
        await snapshot(page,'group-bet-choices-'+viewport.width);
        for(const kind of ['ladder','wheel']){
          if(await tool('bet').getAttribute('aria-expanded')!=='true')await tool('bet').tap();
          await writer.locator('[data-kind-choice='+kind+']').tap();
          assert.equal(await writer.locator('[name=kind]').inputValue(),kind);
          assert.equal(await writer.locator('[data-editor='+kind+']').isVisible(),true);
          assert.equal(await writer.locator('[data-group-panel]:not([hidden])').count(),0,'a chosen bet opens in the writing body');
          if(kind==='ladder'&&viewport.width<640){
            await settle(page);await snapshot(page,'group-ladder-editor-'+viewport.width);
          }
        }
        await tool('post').tap();
        assert.equal(await writer.locator('[name=kind]').inputValue(),'post');
        assert.equal(await body.isVisible(),true);

        await title.fill('함께 적은 여행 기록');await body.fill(writing);
        await body.evaluate(node=>{node.focus();node.setSelectionRange(12,28,'backward');});
        const selection=()=>body.evaluate(node=>({value:node.value,start:node.selectionStart,end:node.selectionEnd,direction:node.selectionDirection}));
        const before=await selection();
        for(const height of [300,260]){
          await viewportArea(page,height,17);const area={top:17,bottom:17+height};
          await verifyLayout(page,viewport,area);
          await tool('photo').tap();
          assert.equal(await body.evaluate(node=>document.activeElement===node),true,'touching a tool retains native editing focus');
          assert.deepEqual(await selection(),before,'tool selection preserves the full body and selection');
          await verifyLayout(page,viewport,area,{panel:true});
          await snapshot(page,`group-photo-keyboard-${viewport.width}-${height}`);
          await tool('photo').tap();
          assert.equal(await writer.locator('.group-compose-options').isVisible(),false);
          assert.deepEqual(await selection(),before);
        }
        if(viewport.width===320){
          await page.evaluate(()=>{
            document.documentElement.style.setProperty('--app-safe-top','44px');
            document.documentElement.style.setProperty('--app-safe-bottom','34px');
          });
          await viewportArea(page,260,17);
          await body.press('Control+Home');await body.press('ArrowRight');await settle(page);
          assert.equal((await selection()).start,1);await visibleEdgeLine(body,'start');
          await body.press('Control+End');await body.press('ArrowLeft');await settle(page);
          assert.equal((await selection()).start,writing.length-1);await visibleEdgeLine(body,'end');
          assert.equal(await body.inputValue(),writing);
          await verifyLayout(page,viewport,{top:61,bottom:243});
          await snapshot(page,'group-short-keyboard-caret-320');
          await page.evaluate(()=>{
            document.documentElement.style.removeProperty('--app-safe-top');
            document.documentElement.style.removeProperty('--app-safe-bottom');
          });
        }
        await viewportArea(page,viewport.height);
        await tool('photo').tap();await writer.locator('#files').setInputFiles(path.join(root,'apple-touch-icon.png'));
        assert.equal(await writer.locator('#attachments .attachment').count(),1);
        assert.equal(await tool('photo').getAttribute('data-selected'),'true','the toolbar indicates an attachment');
        await writer.locator('[data-remove-file]').tap();assert.equal(await writer.locator('#attachments .attachment').count(),0);
        await writer.locator('#files').setInputFiles(path.join(root,'apple-touch-icon.png'));
        await snapshot(page,'group-photo-attached-'+viewport.width);
        await body.evaluate(node=>{node.focus();node.setSelectionRange(12,28,'backward');});
        const planSelection=await selection();
        await tool('plan').tap();
        assert.equal(await writer.locator('[name=kind]').inputValue(),'event','the plan icon directly starts a new schedule');
        assert.equal(await tool('plan').getAttribute('data-selected'),'true');
        assert.equal(await writer.locator('[data-group-panel=plan]').isVisible(),true,'the plan icon opens date and location settings immediately');
        assert.equal(await writer.locator('[data-group-panel=plan] [data-kind-choice]').count(),0,'no second plan-kind selection is shown');
        assert.equal(await writer.locator('[name=starts_at]').evaluate(node=>node.required),true);
        assert.equal(await writer.locator('[name=ends_at]').evaluate(node=>node.required),true);
        assert.equal(await body.evaluate(node=>document.activeElement===node),true,'starting a plan retains native writing focus');
        assert.deepEqual(await selection(),planSelection,'starting a plan preserves the body and selected range');
        await tool('plan').tap();
        assert.equal(await writer.locator('[data-group-panel=plan]').isVisible(),false,'tapping plan again collapses its settings');
        assert.deepEqual(await selection(),planSelection);
        await tool('plan').tap();
        await writer.locator('[name=all_day]').check();
        await writer.locator('[name=starts_at]').fill('');
        await writer.locator('[name=ends_at]').fill('2026-11-21');
        await writer.locator('[name=location]').fill('서울역');
        await tool('plan').tap();
        await submit.tap();
        assert.equal(await writer.locator('[data-group-panel=plan]').isVisible(),true,'native validation reveals a required field inside a closed options panel');
        assert.equal(await page.evaluate(()=>groupCalls.filter(call=>call.action==='save').length),0,'invalid dates never save a partial post');
        await writer.locator('[name=starts_at]').fill('2026-11-20');
        await verifyLayout(page,viewport,{top:0,bottom:viewport.height},{panel:true});
        await snapshot(page,'group-plan-'+viewport.width);
        await tool('plan').tap();
        assert.equal(await body.inputValue(),writing,'photo and kind changes retain all 10,000 characters');

        await page.evaluate(()=>window.groupHoldSave=true);await submit.tap();
        await page.waitForFunction(()=>typeof groupFinishSave==='function');
        assert.equal(await submit.isDisabled(),true);
        const sent=await page.evaluate(()=>groupCalls.filter(call=>call.action==='save').at(-1).payload);
        assert.equal(sent.body,writing);assert.equal(sent.body.length,10000);assert.equal(sent.kind,'event');assert.equal(sent.room_id,room);
        assert.equal(sent.starts_at,'2026-11-20T00:00:00+09:00');assert.equal(sent.ends_at,'2026-11-21T23:59:59+09:00');assert.equal(sent.location,'서울역');
        assert.equal(sent.media.length,1);assert.equal(sent.media[0].name,'apple-touch-icon.png');
        await writer.locator('[data-close]').evaluate(button=>button.click());await page.keyboard.press('Escape');
        assert.equal(await writer.isVisible(),true,'a saving post cannot be dismissed');
        await page.evaluate(()=>groupFinishSave());await writer.waitFor({state:'detached'});
        await page.locator('[data-edit]').waitFor();
        assert.equal(await page.evaluate(()=>document.body.style.overflow),'','closing restores the document scroll');

        await page.locator('[data-action=compose]').focus();await page.locator('[data-action=compose]').tap();await writer.waitFor();
        assert.equal(await body.inputValue(),'');assert.equal(await writer.locator('[data-group-panel]:not([hidden])').count(),0);
        assert.equal(await title.evaluate(node=>document.activeElement===node),true,'reopening focuses the new empty title');
        await writer.locator('[data-close]').tap();await writer.waitFor({state:'detached'});
        assert.equal(await page.locator('[data-action=compose]').evaluate(node=>document.activeElement===node),true,
          'closing an empty writer restores the focused opener');
        await page.locator('[data-edit]').tap();await writer.waitFor();
        assert.equal(await title.evaluate(node=>document.activeElement===node),true,'editing focuses the existing title');
        const titleEnd=(await title.inputValue()).length;
        assert.deepEqual(await title.evaluate(node=>[node.selectionStart,node.selectionEnd]),
          [titleEnd,titleEnd],'editing places the cursor after the existing title');
        assert.equal(await body.inputValue(),writing);assert.equal(await writer.locator('[name=room_id]').isDisabled(),true);
        assert.equal(await tool('room').isDisabled(),true,'editing retains the original room');
        assert.equal(await tool('plan').getAttribute('data-selected'),'true');
        await body.fill('수정하던 내용을 취소하지 않으면 그대로 남겨요.');
        await writer.locator('[data-close]').tap();await page.locator('[data-no]').tap();
        assert.equal(await body.inputValue(),'수정하던 내용을 취소하지 않으면 그대로 남겨요.');
        await writer.locator('[data-close]').tap();await page.locator('[data-yes]').tap();await writer.waitFor({state:'detached'});
        assert.equal(await page.evaluate(()=>groupCalls.filter(call=>call.action==='save').length),1,'discarding edits does not save again');
        assert.deepEqual(errors,[],viewport.width+'px produces no browser errors');
      }finally{await context.close();}
    }
  }finally{await browser.close();}
});
