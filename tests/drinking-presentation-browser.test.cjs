'use strict';

// Chromium is installed and launched by drinking-room-stability.yml. This file
// measures actual layout, focus, animation and game lifecycles; JSDOM is not a
// substitute for these checks. Accounts and transport remain fixture-only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const test = require('node:test');
const {chromium} = require('playwright');
const {fixture} = require('./drinking-room-fixture.cjs');
const {browserSession, dismissGuide, origin} = require('./helpers/drinking-browser-fixture.cjs');

const kinds = ['croc','bottle','bomb','stopwatch','liar','king','truth','initial','minority','mission','fingers','imagevote','updown'];
const viewports = [{width:390,height:844},{width:375,height:667},{width:1366,height:900},{width:844,height:390}];
const artifacts = path.join(__dirname,'artifacts/drinking-presentation');
const launchOptions = {headless:true,...(process.env.OJJUDA_CHROMIUM_PATH ? {executablePath:process.env.OJJUDA_CHROMIUM_PATH} : {})};

async function screenshot(page, name) {
  fs.mkdirSync(artifacts,{recursive:true});
  await page.screenshot({path:path.join(artifacts,name+'.png'),fullPage:true});
}

async function painted(page) {
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}

async function expectViewport(page, label, {dialog = false, local = false} = {}) {
  if(dialog)await page.locator('[data-drinking-dialog]').evaluate(panel=>
    Promise.all(panel.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
  await painted(page);
  const measurement = await page.evaluate(({dialog,local}) => {
    const w=innerWidth,h=innerHeight;
    const area=dialog ? document.querySelector('[data-drinking-dialog]') : document.getElementById('access-content');
    const selectors=dialog ? '[data-drinking-close]' :
      (local ? '#app button,#app input,#app select,#app textarea,#app summary,[data-drinking-help]' : '#view button,#view input,#view select,#view textarea,#view summary,[data-drinking-help]');
    const controls=[...new Set([...document.querySelectorAll(selectors)].map(el =>
      el.matches('input[type="radio"],input[type="checkbox"]')&&Number(getComputedStyle(el).opacity)===0 ? el.labels?.[0]||el : el
    ))].filter(el => {
      // Chromium can retain layout boxes for the contents of a closed details
      // element. Its summary is usable; the undisclosed form is not on screen.
      for(let parent=el.parentElement;parent;parent=parent.parentElement)
        if(parent.tagName==='DETAILS'&&!parent.open&&![...parent.children].find(child=>child.tagName==='SUMMARY')?.contains(el))return false;
      const css=getComputedStyle(el),box=el.getBoundingClientRect();
      return !el.closest('[hidden]')&&css.display!=='none'&&css.visibility!=='hidden'&&box.width>0&&box.height>0;
    });
    const clipped=controls.flatMap(el=>{
      const r=el.getBoundingClientRect();
      // Long lists may scroll internally, but actual play controls may not be
      // put below the screen and concealed with overflow:hidden.
      let parent=el.parentElement,clip=null;
      while(parent&&parent!==document.body){
        const css=getComputedStyle(parent);
        if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) {
          const p=parent.getBoundingClientRect();
          if(r.top<p.top-1||r.bottom>p.bottom+1) {clip=parent.id||parent.className;break;}
        }
        parent=parent.parentElement;
      }
      if(r.left>=-1&&r.top>=-1&&r.right<=w+1&&r.bottom<=h+1&&!clip)return [];
      return [{control:el.id||el.dataset.action||el.dataset.do||el.dataset.gameAction||el.getAttribute('aria-label')||el.textContent.trim().slice(0,45),
        x:Math.round(r.x),y:Math.round(r.y),right:Math.round(r.right),bottom:Math.round(r.bottom),clip}];
    });
    const box=area?.getBoundingClientRect();
    const copy=dialog&&area?.querySelector('.dp-result-copy')?.getBoundingClientRect();
    const artOverlaps=copy ? [...area.querySelectorAll('.dp-glass-art,.dp-glass-vessel')].flatMap(art=>{
      const r=art.getBoundingClientRect();
      const separate=r.right<=copy.left+2||r.left>=copy.right-2||r.bottom<=copy.top+2||r.top>=copy.bottom-2;
      return separate ? [] : [{art:art.getAttribute('class'),bottom:Math.round(r.bottom),copyTop:Math.round(copy.top),
        left:Math.round(r.left),right:Math.round(r.right),copyLeft:Math.round(copy.left),copyRight:Math.round(copy.right)}];
    }) : [];
    return {width:w,height:h,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,
      controls:controls.length,clipped,artOverlaps,area:box&&{x:box.x,y:box.y,right:box.right,bottom:box.bottom},
      playing:document.body.classList.contains('dp-playing')};
  },{dialog,local});
  try {
    assert.ok(measurement.playing,label+' activates only the entered game');
    assert.ok(measurement.controls>0,label+' has reachable play controls');
    assert.ok(measurement.documentWidth<=measurement.width+2,label+' must not scroll horizontally: '+JSON.stringify(measurement));
    assert.ok(measurement.documentHeight<=measurement.height+2,label+' fits one browser viewport: '+JSON.stringify(measurement));
    assert.deepEqual(measurement.clipped,[],label+' controls fit without document or clipped-container scrolling');
    assert.deepEqual(measurement.artOverlaps,[],label+' glass artwork does not overlap the result text');
    assert.ok(measurement.area&&measurement.area.x>=-1&&measurement.area.y>=-1&&measurement.area.right<=measurement.width+1&&measurement.area.bottom<=measurement.height+1,label+' play area fits the viewport');
  } catch(error) {
    await screenshot(page,'failure-'+label.replace(/[^a-z0-9-]/gi,'-'));
    throw error;
  }
}

async function allSizes(page,label,options) {
  for(const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expectViewport(page,label+'-'+viewport.width+'x'+viewport.height,options);
  }
  await page.setViewportSize(viewports[0]);
}

test('13 native games and 13 local games fit actual viewports with 12 participants', {timeout:240000}, async t => {
  const db=await fixture();let browser;
  t.after(async()=>{await browser?.close();await db.close();});
  browser=await chromium.launch(launchOptions);
  const errors=[];
  const online=await browserSession(browser,{db,actor:db.users[0],errors});
  const room=(action,code='',options={})=>db.publicRpc(db.users[0],'drinking_room',[action,code,options]);
  let parent=await room('create','',{title:'12인 화면 검사',capacity:12,password:'layout-pass',request_id:randomUUID()});
  await Promise.all(db.users.slice(1,12).map(actor=>db.publicRpc(actor,'drinking_room',['join',parent.code,{password:'layout-pass'}])));
  parent=await room('state',parent.code);
  for(const kind of kinds) {
    await t.test('native '+kind,async()=>{
      parent=await room('start',parent.code,{kind,revision:parent.revision,request_id:randomUUID()});
      try {
        await online.page.goto(origin+'/games/'+kind+'/?party='+parent.code+'&room='+parent.child);
        await online.page.locator('[data-drinking-dialog="guide"]').waitFor({state:'visible'});
        await expectViewport(online.page,'native-'+kind+'-guide',{dialog:true});
        await dismissGuide(online.page);
        await online.page.locator('#view .card').waitFor({state:'visible'});
        await allSizes(online.page,'native-'+kind);
        if(['croc','king','fingers','truth'].includes(kind))await screenshot(online.page,'native-'+kind+'-390x844');
        if(kind==='croc') {
          // Finish a real SQL round. Neither the overlay nor its close button
          // is allowed to invent a game result or submit a next-round action.
          // This privileged fixture read only chooses a deterministic tooth;
          // the browser still makes the normal authenticated game action.
          const trap=(await db.db.query('select trap from ojjuda_arcade_internal.croc_rooms where code=$1',[parent.child])).rows[0].trap;
          await online.page.evaluate(()=>{
            window.__biteCalls={starts:0,quiets:0};
            for(const [method,key] of [['startBite','starts'],['quiet','quiets']]) {
              const original=window.PartyFX[method];
              window.PartyFX[method]=(...args)=>{window.__biteCalls[key]++;return original(...args);};
            }
          });
          await online.page.locator('[data-action="tooth"][data-value="'+trap+'"]').click();
          const result=online.page.locator('[data-drinking-dialog="result"]');
          await result.waitFor({state:'visible'});
          const state=await db.publicRpc(db.users[0],'croc_multiplayer',['state',parent.child,{}]);
          assert.equal(state.phase,'done');assert.equal(state.loser,0);
          assert.match(await result.textContent(),new RegExp(db.names[state.loser]));
          await allSizes(online.page,'native-croc-result',{dialog:true});
          const writes=online.calls.filter(c=>!['state','mine'].includes(c.args.p_action)&&c.name!=='get_my_member_identity').length;
          await result.locator('[data-drinking-close]').first().click();
          await online.page.evaluate(()=>window.dispatchEvent(new Event('focus')));
          await painted(online.page);
          assert.equal(await result.count(),0,'a dismissed confirmed result does not replay after polling');
          assert.equal(online.calls.filter(c=>!['state','mine'].includes(c.args.p_action)&&c.name!=='get_my_member_identity').length,writes);
          assert.equal(await online.page.locator('[data-do="ack"]').count(),0,'one result confirmation also acknowledges the crocodile effect');
          const bite=await online.page.evaluate(()=>window.__biteCalls);
          assert.equal(bite.starts,1);assert.ok(bite.quiets>=1);
          await online.context.setOffline(true);
          await online.page.waitForFunction(()=>document.getElementById('access-content').hidden);
          await online.context.setOffline(false);
          await online.page.locator('#access-content').waitFor({state:'visible'});
          assert.equal((await online.page.evaluate(()=>window.__biteCalls)).starts,bite.starts,'reconnection does not restart an acknowledged bite');
          assert.equal(await online.page.locator('[data-do="ack"]').count(),0);
          assert.equal(await result.count(),0);
          const recovered=await db.publicRpc(db.users[0],'croc_multiplayer',['state',parent.child,{}]);
          assert.equal(recovered.revision,state.revision,'dismissing a result and reconnecting do not mutate the game');
        }
      } finally {
        parent=await room('state',parent.code);
        parent=await room('return',parent.code,{revision:parent.revision,request_id:randomUUID()});
      }
    });
  }
  await online.page.goto(origin+'/games/drinking/?mode=multi&room='+parent.code);
  await online.page.locator('#lobby').waitFor({state:'visible'});
  assert.equal(await online.page.locator('body.dp-playing').count(),0,'the shared room/main keeps its original layout');
  assert.equal(await online.page.locator('[data-drinking-dialog]').count(),0,'the main page has no game-entry popup');
  await online.context.close();

  const local=await browserSession(browser,{db,actor:db.users[12],errors,localPlayers:db.names.slice(0,12)});
  await local.page.goto(origin+'/games/drinking/local/#menu');
  await local.page.locator('.game-card').first().waitFor({state:'visible'});
  assert.equal(await local.page.locator('body.dp-playing').count(),0,'the local game menu keeps its original layout');
  assert.equal(await local.page.locator('[data-drinking-dialog]').count(),0);
  for(const kind of kinds) {
    await t.test('local '+kind,async()=>{
      await local.page.locator('[data-action="open"][data-value="'+kind+'"]').click();
      await local.page.locator('[data-drinking-dialog="guide"]').waitFor({state:'visible'});
      await expectViewport(local.page,'local-'+kind+'-guide',{dialog:true});
      await dismissGuide(local.page);
      await allSizes(local.page,'local-'+kind+'-entry',{local:true});
      if(kind==='bomb')await local.page.locator('[data-action="confirm-bomb-time"]').click();
      else await local.page.locator('[data-action="start"]').click();
      await local.page.waitForFunction(()=>!document.querySelector('#app [data-action="start"]'));
      await allSizes(local.page,'local-'+kind+'-play',{local:true});
      if(['bottle','truth','liar'].includes(kind))await screenshot(local.page,'local-'+kind+'-390x844');
      if(kind==='updown') {
        for(let attempt=0;attempt<7&&await local.page.locator('#updown-value').count();attempt++) {
          const numbers=(await local.page.locator('#updown-range strong').textContent()).match(/\d+/g).map(Number);
          const guess=Math.floor((numbers[0]+numbers.at(-1))/2);
          await local.page.locator('#updown-value').fill(String(guess));
          await local.page.locator('#updown-form [type="submit"]').click();
        }
        const result=local.page.locator('[data-drinking-dialog="result"]');
        await result.waitFor({state:'visible'});
        assert.match(await result.textContent(),/정답/);
        await allSizes(local.page,'local-updown-result',{dialog:true});
        await screenshot(local.page,'local-updown-result');
        await result.locator('[data-drinking-close]').first().click();
        await local.page.locator('[data-action="start"]').click();
        await local.page.locator('#updown-value').waitFor({state:'visible'});
        assert.equal(await result.count(),0,'native next-round behavior is still controlled by the local game');
      }
      await local.page.locator('.menu-nav').click();
      await local.page.locator('.game-card').first().waitFor({state:'visible'});
      assert.equal(await local.page.locator('body.dp-playing').count(),0);
      assert.equal(await local.page.locator('[data-drinking-dialog]').count(),0);
    });
    // Recover the menu after a failed geometry subtest so the remaining games
    // still receive their own meaningful measurements and failure screenshots.
    if(await local.page.locator('body.dp-playing').count()) {
      await local.page.evaluate(()=>{window.DrinkingPresentation.leave();location.hash='menu';});
      await local.page.locator('.game-card').first().waitFor({state:'visible'});
    }
  }
  assert.deepEqual(errors,[]);
  t.diagnostic('13 native and 13 local game entries, four viewport sizes, real 12-player SQL state, and actual native/local completion paths.');
});

test('browser focus, Escape, auth conceal and an actually draining glass remain usable', {timeout:60000}, async t => {
  const browser=await chromium.launch(launchOptions);t.after(()=>browser.close());
  const f=await browserSession(browser,{actor:'presentation-member',rpc:()=>({}),reducedMotion:'no-preference'});
  await f.page.goto(origin+'/tests/drinking-presentation-frame.html');
  await f.page.waitForFunction(()=>!!window.DrinkingPresentation);
  await f.page.locator('#game-control').focus();
  await f.page.evaluate(()=>window.DrinkingPresentation.enter('croc'));
  const guide=f.page.locator('[data-drinking-dialog="guide"]');
  await guide.waitFor({state:'visible'});
  for(const key of ['Tab','Tab','Shift+Tab','Shift+Tab']) {
    await f.page.keyboard.press(key);
    assert.ok(await guide.evaluate(panel=>panel.contains(document.activeElement)),'keyboard focus stays in the visible dialog');
  }
  await f.page.keyboard.press('Escape');await guide.waitFor({state:'hidden'});
  assert.equal(await f.page.evaluate(()=>document.activeElement.id),'game-control');
  assert.equal(await f.page.locator('#access-content > [inert]').count(),0,'closing restores background controls');
  await f.page.locator('[data-drinking-help]').click();
  await allSizes(f.page,'guide-focus',{dialog:true});
  await screenshot(f.page,'guide-how-to-play-390x844');
  await f.page.keyboard.press('Escape');

  const malicious='<img src=x onerror="window.__injected=true">';
  await f.page.evaluate(text=>window.DrinkingPresentation.update({phase:'done',roundKey:'round-1',
    result:{key:'result-1',title:'이번 판 결과',body:'술잔이 비워지는 애니메이션',names:[text,...Array.from({length:11},(_,i)=>'참가자 '+(i+2))]}}),malicious);
  const result=f.page.locator('[data-drinking-dialog="result"]');await result.waitFor({state:'visible'});
  assert.equal(await result.locator('img').count(),0);
  assert.equal(await f.page.evaluate(()=>window.__injected),undefined);
  assert.ok((await result.textContent()).includes(malicious));
  const liquid=f.page.locator('[data-drinking-liquid]');
  const animation=await liquid.evaluate(element=>{
    const drain=element.getAnimations().find(item=>item.animationName==='dp-empty');
    if(!drain)return null;
    const timing=drain.effect.getTiming();drain.pause();drain.currentTime=Number(timing.delay);
    return {delay:Number(timing.delay),duration:Number(timing.duration)};
  });
  assert.ok(animation&&animation.duration>0,'the liquid has a real browser animation');
  // Keep the liquid full while the panel and its backdrop finish appearing;
  // screenshots must show the settled, opaque UI rather than a fade-in frame.
  await result.evaluate(panel=>Promise.all([
    ...panel.getAnimations(),...panel.parentElement.getAnimations()
  ].map(animation=>animation.finished.catch(()=>{}))));
  const full=await liquid.evaluate(element=>new DOMMatrix(getComputedStyle(element).transform).d);
  await expectViewport(f.page,'result-glass-full',{dialog:true});
  await screenshot(f.page,'result-glass-full');
  await liquid.evaluate((element,timing)=>{
    const drain=element.getAnimations().find(item=>item.animationName==='dp-empty');
    drain.currentTime=timing.delay+timing.duration;
  },animation);
  await painted(f.page);
  const empty=await liquid.evaluate(element=>({scale:new DOMMatrix(getComputedStyle(element).transform).d,opacity:Number(getComputedStyle(element).opacity)}));
  assert.ok(full>.95&&empty.scale<full*.05&&empty.opacity<.05,'the visible liquid actually empties');
  await expectViewport(f.page,'result-glass-empty',{dialog:true});
  await screenshot(f.page,'result-glass-empty');
  await allSizes(f.page,'result-12-names',{dialog:true});
  await f.page.evaluate(()=>{
    window.OjjudaDrinkingAccessReady=false;
    document.dispatchEvent(new CustomEvent('ojjuda:drinking-access',{detail:{allowed:false}}));
    document.getElementById('access-content').hidden=true;
  });
  await result.waitFor({state:'hidden'});
  assert.equal(await f.page.locator('#access-content > [inert]').count(),0,'auth conceal releases the focus trap');
  assert.equal(await f.page.locator('[data-drinking-overlay]:visible').count(),0);
  assert.deepEqual(f.errors,[]);

  const reduced=await browserSession(browser,{actor:'presentation-member',rpc:()=>({}),reducedMotion:'reduce'});
  await reduced.page.goto(origin+'/tests/drinking-presentation-frame.html');
  await reduced.page.waitForFunction(()=>!!window.DrinkingPresentation);
  await reduced.page.evaluate(()=>{
    window.DrinkingPresentation.enter('croc');
    window.DrinkingPresentation.update({phase:'done',roundKey:'reduced-1',result:{key:'reduced-1',title:'결과',body:'움직임 줄이기'}});
  });
  const reducedResult=reduced.page.locator('[data-drinking-dialog="result"]');
  await reducedResult.waitFor({state:'visible'});
  const motion=await reducedResult.evaluate(panel=>({
    active:panel.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length,
    liquidHeight:panel.querySelector('[data-drinking-liquid]').getBoundingClientRect().height
  }));
  assert.equal(motion.active,0,'reduced-motion avoids running effects');
  assert.ok(motion.liquidHeight<1,'reduced-motion shows the completed empty-glass state');
  await reducedResult.locator('[data-drinking-close]').first().click();
  assert.deepEqual(reduced.errors,[]);
});
