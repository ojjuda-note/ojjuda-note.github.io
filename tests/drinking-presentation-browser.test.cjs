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
const largerViewports = [{width:720,height:740},{width:768,height:1024},{width:1024,height:768},{width:1600,height:900}];
const gameViewports = [...viewports,...largerViewports];
const themedGames = new Set(kinds);
const themeReviewSizes = ['390x844','844x390','720x740','768x1024','1600x900'];
const suiteReviewSizes = ['390x844','1600x900'];
const themeCaptures = kind => ['croc','bottle'].includes(kind) ? themeReviewSizes :
  ['bomb','truth'].includes(kind) ? ['390x844','844x390','1600x900'] : suiteReviewSizes;
const artifacts = path.join(__dirname,'artifacts/drinking-presentation');
const glassAsset = '/games/drinking/assets/result-glass-v2.webp';
const launchOptions = {headless:true,...(process.env.OJJUDA_CHROMIUM_PATH ? {executablePath:process.env.OJJUDA_CHROMIUM_PATH} : {})};

async function screenshot(page, name) {
  fs.mkdirSync(artifacts,{recursive:true});
  await page.screenshot({path:path.join(artifacts,name+'.png'),fullPage:true});
}

async function painted(page) {
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}

async function settledGame(page) {
  await page.evaluate(async()=>{
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll('#app img,#view img')].map(image=>image.decode().catch(()=>{})));
  });
  await painted(page);
  // Readiness is only a synchronization signal. Assertions below measure
  // visible text, controls and artwork rather than the implementation's scale.
  await page.waitForFunction(()=>!!document.querySelector('[data-dp-fitted="true"]'));
  await painted(page);
}

async function expectGameTheme(page,kind) {
  const themePaths=['/games/'+kind+'/page-theme.css'];
  if(!['croc','bottle'].includes(kind))themePaths.push('/games/drinking/suite-theme.css');
  const themed=await page.evaluate(paths=>paths.every(path=>[...document.styleSheets].some(sheet=>sheet.href&&
    new URL(sheet.href,document.baseURI).pathname===path&&
    !sheet.disabled&&matchMedia(sheet.media.mediaText||'all').matches&&sheet.cssRules.length>0)),themePaths);
  assert.ok(themed,'the entered '+kind+' game loads all required themes: '+themePaths.join(', '));
  const arcadeLinks=await page.locator('#access-content a:visible').evaluateAll(links=>links.filter(link=>{
    const url=new URL(link.href,document.baseURI);
    return /오락실로/.test(link.textContent)||(url.pathname==='/world.html'&&url.searchParams.get('tab')==='arcade');
  }).map(link=>({label:link.textContent.trim(),href:link.getAttribute('href')})));
  assert.deepEqual(arcadeLinks,[],'an entered '+kind+' game returns to the drinking menu');
}

async function expectContentLayout(page,label,{local=false}={}) {
  const layout=await page.evaluate(local=>{
    const pane=local ? document.querySelector('#app .play-body') :
      document.querySelector('#view #game, #view > .card > .inside')||document.querySelector('#view > .card');
    const frame=document.querySelector(local ? '#app .play-shell' : '#view > .card');
    if(!pane||!frame)return null;
    const area=pane.getBoundingClientRect(),card=frame.getBoundingClientRect();
    const visible=element=>{
      if(element.closest('[hidden]'))return false;
      for(let parent=element;parent&&parent!==pane;parent=parent.parentElement){
        const css=getComputedStyle(parent);
        if(css.display==='none'||css.visibility==='hidden'||Number(css.opacity)===0)return false;
        if(parent.tagName==='DETAILS'&&!parent.open&&
          !parent.querySelector(':scope > summary')?.contains(element))return false;
      }
      return true;
    };
    const boxes=[];
    function add(rect,element){
      let top=Math.max(area.top,rect.top),bottom=Math.min(area.bottom,rect.bottom);
      let left=Math.max(area.left,rect.left),right=Math.min(area.right,rect.right);
      // A participant list can legitimately scroll internally. Count only its
      // painted portion, not hidden lines beyond the scroll container.
      for(let parent=element.parentElement;parent&&parent!==pane;parent=parent.parentElement){
        const css=getComputedStyle(parent),clip=parent.getBoundingClientRect();
        if(/(auto|scroll|hidden|clip)/.test(css.overflowY)){top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom);}
        if(/(auto|scroll|hidden|clip)/.test(css.overflowX)){left=Math.max(left,clip.left);right=Math.min(right,clip.right);}
      }
      if(right>left&&bottom>top)boxes.push({top,bottom,left,right});
    }
    // Range boxes measure actual letters. A full-height empty flex child or a
    // stretched heading cannot make sparse, top-aligned content pass.
    const text=document.createTreeWalker(pane,NodeFilter.SHOW_TEXT);
    for(let node=text.nextNode();node;node=text.nextNode()){
      const element=node.parentElement;
      if(!node.textContent.trim()||!visible(element)||element.closest('script,style,[aria-hidden="true"]'))continue;
      const range=document.createRange();range.selectNodeContents(node);
      for(const rect of range.getClientRects())add(rect,element);
    }
    const visual='button,input:not([type="hidden"]),select,textarea,img,svg,.croc-toy,.watch-case,.bottle-dial,.bottle-board,.truth-pair,.truth-hand,.private-card,.role,.mission-card,.mini-art,.bomb-active,.bomb-launch,.initial-word,.updown-range';
    for(const element of pane.querySelectorAll(visual))if(visible(element))add(element.getBoundingClientRect(),element);
    const top=Math.min(...boxes.map(box=>box.top)),bottom=Math.max(...boxes.map(box=>box.bottom));
    return {viewportWidth:innerWidth,viewportHeight:innerHeight,cardWidth:card.width,
      paneTop:area.top,paneHeight:area.height,contentTop:top,contentBottom:bottom,
      contentHeight:bottom-top,center:(top+bottom-2*area.top)/(2*area.height),pieces:boxes.length};
  },local);
  try{
    assert.ok(layout&&layout.pieces>0,label+' contains visible game content');
    assert.ok(layout.cardWidth>=layout.viewportWidth*.9,label+' uses the available screen width: '+JSON.stringify(layout));
    assert.ok(layout.center>=.30&&layout.center<=.70,label+' distributes actual game content within the pane: '+JSON.stringify(layout));
  }catch(error){
    await screenshot(page,'failure-content-'+label.replace(/[^a-z0-9-]/gi,'-'));
    throw error;
  }
}

async function expectGlassImage(result) {
  await result.locator('[data-drinking-glass][data-glass-ready="true"]').waitFor({state:'visible'});
  const images=result.locator('image[data-drinking-glass-image]');
  assert.equal(await images.count(),1,'the result uses one static glass image');
  const image=await images.evaluate(async element=>{
    const source=new URL(element.getAttribute('href'),document.baseURI);
    const decoded=new Image();decoded.src=source.href;await decoded.decode();
    const box=element.getBoundingClientRect();
    return {path:source.pathname,origin:source.origin,complete:decoded.complete,
      width:decoded.naturalWidth,height:decoded.naturalHeight,
      visibleWidth:box.width,visibleHeight:box.height,
      decorative:!!element.closest('[aria-hidden="true"]')};
  });
  assert.equal(image.path,glassAsset,'the glass comes from the approved static asset');
  assert.equal(image.origin,origin,'the asset is loaded from the game origin');
  assert.ok(image.complete&&image.width>0&&image.height>0,'the actual glass image decodes successfully');
  assert.ok(image.visibleWidth>0&&image.visibleHeight>0,'the decoded glass is visible');
  assert.ok(image.decorative,'decorative artwork does not duplicate the result announcement');
}

async function liquidGeometry(page) {
  return page.locator('[data-drinking-liquid]').evaluate(element=>{
    const css=getComputedStyle(element),matrix=new DOMMatrix(css.transform),bounds=element.getBBox();
    const owner=element.parentElement.closest('[clip-path]');
    const clipId=owner?.getAttribute('clip-path')?.match(/^url\(#(.+)\)$/)?.[1];
    const clip=clipId&&document.getElementById(clipId)?.querySelector('path');
    const clipBounds=clip?.getBBox();
    return {y:matrix.f,opacity:Number(css.opacity),liquidTop:bounds.y+matrix.f,
      clipBottom:clipBounds ? clipBounds.y+clipBounds.height : null,
      fixedClip:!!owner&&owner!==element};
  });
}

async function glassMoment(page, progress) {
  await page.locator('[data-drinking-glass][data-glass-ready="true"]').waitFor({state:'visible'});
  const timing=await page.locator('[data-drinking-glass]').evaluate((art,progress)=>{
    const liquid=art.querySelector('[data-drinking-liquid]');
    const drain=liquid?.getAnimations().find(item=>item.animationName==='dp-empty');
    if(!drain)return null;
    const timing=drain.effect.getTiming();
    const delay=Number(timing.delay),duration=Number(timing.duration);
    // All glass layers share one clock. This makes full/mid/empty review images
    // show a coherent frame instead of a paused drink in a still-moving vessel.
    for(const animation of art.getAnimations({subtree:true})){
      animation.pause();animation.currentTime=delay+duration*progress;
    }
    return {delay,duration};
  },progress);
  assert.ok(timing&&timing.duration>0,'the liquid has a real browser animation');
  await painted(page);
  return liquidGeometry(page);
}

async function expectViewport(page, label, {dialog = false, local = false} = {}) {
  if(dialog)await page.locator('[data-drinking-dialog]').evaluate(panel=>
    Promise.all(panel.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
  if(dialog)await painted(page);else await settledGame(page);
  const measurement = await page.evaluate(({dialog,local}) => {
    const w=innerWidth,h=innerHeight;
    const area=dialog ? document.querySelector('[data-drinking-dialog]') : document.getElementById('access-content');
    const selectors=dialog ? '[data-drinking-close]' :
      (local ? '#app button,#app input,#app select,#app textarea,#app summary,#local-back,[data-drinking-help]' : '#view button,#view input,#view select,#view textarea,#view summary,#access-content > header .drinks-home,[data-drinking-help]');
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
    // The photographed glass has transparent pixels outside the cropped SVG
    // viewBox. Its inner g's bounds include those pixels; only the clipped SVG
    // viewport can paint over the copy. Keep that clip contract explicit.
    const artAreas=copy ? [...area.querySelectorAll('.dp-glass-art')] : [];
    const unclippedArt=artAreas.filter(art=>{
      const css=getComputedStyle(art);
      return !/^(hidden|clip)$/.test(css.overflowX)||!/^(hidden|clip)$/.test(css.overflowY);
    }).map(art=>art.getAttribute('class'));
    const artOverlaps=artAreas.flatMap(art=>{
      const r=art.getBoundingClientRect();
      const separate=r.right<=copy.left+2||r.left>=copy.right-2||r.bottom<=copy.top+2||r.top>=copy.bottom-2;
      return separate ? [] : [{art:art.getAttribute('class'),bottom:Math.round(r.bottom),copyTop:Math.round(copy.top),
        left:Math.round(r.left),right:Math.round(r.right),copyLeft:Math.round(copy.left),copyRight:Math.round(copy.right)}];
    });
    return {width:w,height:h,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,
      controls:controls.length,clipped,unclippedArt,artOverlaps,area:box&&{x:box.x,y:box.y,right:box.right,bottom:box.bottom},
      playing:document.body.classList.contains('dp-playing')};
  },{dialog,local});
  try {
    assert.ok(measurement.playing,label+' activates only the entered game');
    assert.ok(measurement.controls>0,label+' has reachable play controls');
    assert.ok(measurement.documentWidth<=measurement.width+2,label+' must not scroll horizontally: '+JSON.stringify(measurement));
    assert.ok(measurement.documentHeight<=measurement.height+2,label+' fits one browser viewport: '+JSON.stringify(measurement));
    assert.deepEqual(measurement.clipped,[],label+' controls fit without document or clipped-container scrolling');
    assert.deepEqual(measurement.unclippedArt,[],label+' keeps all glass artwork inside its measured viewport');
    assert.deepEqual(measurement.artOverlaps,[],label+' glass artwork does not overlap the result text');
    assert.ok(measurement.area&&measurement.area.x>=-1&&measurement.area.y>=-1&&measurement.area.right<=measurement.width+1&&measurement.area.bottom<=measurement.height+1,label+' play area fits the viewport');
  } catch(error) {
    await screenshot(page,'failure-'+label.replace(/[^a-z0-9-]/gi,'-'));
    throw error;
  }
}

async function allSizes(page,label,options={}) {
  for(const viewport of options.dialog ? viewports : gameViewports) {
    await page.setViewportSize(viewport);
    const size=viewport.width+'x'+viewport.height;
    await expectViewport(page,label+'-'+size,options);
    if(!options.dialog&&viewport.width>=700&&viewport.height>=650)await expectContentLayout(page,label+'-'+size,options);
    if(options.capture?.includes(size))await screenshot(page,label+'-'+size);
  }
  await page.setViewportSize(viewports[0]);
  if(options.dialog)await painted(page);else await settledGame(page);
}

test('13 native games and 13 local games fill actual viewports and return to the right menu', {timeout:240000}, async t => {
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
        const back=online.page.locator('#access-content > header .drinks-home');
        assert.equal(await back.count(),1,'each shared game has one primary return link');
        const destination=new URL(await back.getAttribute('href'),origin);
        assert.equal(destination.pathname,'/games/drinking/');
        assert.equal(destination.searchParams.get('resume'),parent.code,'the shared room remains available from the drinking menu');
        if(themedGames.has(kind))await expectGameTheme(online.page,kind);
        await allSizes(online.page,'native-'+kind,{capture:themedGames.has(kind)?themeCaptures(kind):[]});
        if(['king','fingers','truth'].includes(kind))await screenshot(online.page,'native-'+kind+'-390x844');
        if(kind==='truth') {
          // Expanding this editor changes content without resizing the pane.
          // The input and submit action must remain visible after refitting.
          await online.page.setViewportSize({width:1024,height:768});
          await settledGame(online.page);
          await online.page.locator('#truth-editor > summary').click();
          await online.page.locator('#truth-question').fill('새 화면 크기에서도 남아 있어야 하는 질문');
          await expectViewport(online.page,'native-truth-editor-open-1024x768');
          await expectContentLayout(online.page,'native-truth-editor-open-1024x768');
          await screenshot(online.page,'native-truth-editor-open-1024x768');
          await online.page.locator('#truth-editor > summary').click();
          await expectViewport(online.page,'native-truth-editor-closed-1024x768');
          assert.equal(await online.page.locator('#truth-question').inputValue(),'새 화면 크기에서도 남아 있어야 하는 질문','refitting preserves an unsent question draft');
          await online.page.setViewportSize(viewports[0]);
        }
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
          await back.click();
          const resume=online.page.locator('#resume-drinks');
          await resume.waitFor({state:'visible'});
          const resumed=new URL(await resume.getAttribute('href'),online.page.url());
          assert.equal(resumed.pathname,'/games/drinking/');
          assert.equal(resumed.searchParams.get('room'),parent.code,'the main page offers the same shared room');
          assert.equal(await online.page.locator('body.dp-playing').count(),0);
          assert.equal(await online.page.locator('[data-drinking-dialog]').count(),0);
          assert.equal((await db.publicRpc(db.users[0],'croc_multiplayer',['state',parent.child,{}])).revision,state.revision,'returning to the menu does not reset the room');
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
  assert.equal(await local.page.locator('#local-back').getAttribute('href'),'/world.html?tab=arcade');
  assert.equal((await local.page.locator('[data-local-back-label]').textContent()).trim(),'오락실로');
  assert.equal(await local.page.locator('.mode-back').isVisible(),true);
  for(const kind of kinds) {
    await t.test('local '+kind,async()=>{
      await local.page.locator('[data-action="open"][data-value="'+kind+'"]').click();
      await local.page.locator('[data-drinking-dialog="guide"]').waitFor({state:'visible'});
      await expectViewport(local.page,'local-'+kind+'-guide',{dialog:true});
      await dismissGuide(local.page);
      assert.equal(await local.page.locator('#local-back').getAttribute('href'),'#menu');
      assert.equal((await local.page.locator('[data-local-back-label]').textContent()).trim(),'술게임으로');
      assert.equal(await local.page.locator('.menu-nav').count(),0,'the top link is the single game-menu navigation');
      assert.equal(await local.page.locator('.mode-back').isVisible(),false);
      if(themedGames.has(kind))await expectGameTheme(local.page,kind);
      await allSizes(local.page,'local-'+kind+'-entry',{local:true,capture:themedGames.has(kind)?themeCaptures(kind):[]});
      if(kind==='bomb')await local.page.locator('[data-action="confirm-bomb-time"]').click();
      else await local.page.locator('[data-action="start"]').click();
      await local.page.waitForFunction(()=>!document.querySelector('#app [data-action="start"]'));
      if(themedGames.has(kind))await expectGameTheme(local.page,kind);
      await allSizes(local.page,'local-'+kind+(kind==='bottle'?'-setup':'-play'),{local:true,capture:themedGames.has(kind)?themeCaptures(kind):[]});
      if(['truth','liar'].includes(kind))await screenshot(local.page,'local-'+kind+'-390x844');
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
      await local.page.locator('#local-back').click();
      await local.page.locator('.game-card').first().waitFor({state:'visible'});
      assert.equal(await local.page.locator('body.dp-playing').count(),0);
      assert.equal(await local.page.locator('[data-drinking-dialog]').count(),0);
      assert.equal(await local.page.locator('#local-back').getAttribute('href'),'/world.html?tab=arcade');
      assert.equal((await local.page.locator('[data-local-back-label]').textContent()).trim(),'오락실로');
      assert.equal(await local.page.locator('.mode-back').isVisible(),true);
      assert.equal(await local.page.evaluate(()=>document.activeElement?.dataset.value),kind,'returning keeps keyboard focus on the game just played');
    });
    // Recover the menu after a failed geometry subtest so the remaining games
    // still receive their own meaningful measurements and failure screenshots.
    if(await local.page.locator('body.dp-playing').count()) {
      await local.page.evaluate(()=>{window.DrinkingPresentation.leave();location.hash='menu';});
      await local.page.locator('.game-card').first().waitFor({state:'visible'});
    }
  }
  assert.deepEqual(errors,[]);
  t.diagnostic('13 native and 13 local game entries, eight game viewport sizes, four dialog sizes, real 12-player SQL state, content placement, primary navigation and native/local completion paths.');
});

test('actual crocodile, stopwatch and bottle play surfaces grow with the available screen', {timeout:90000}, async t => {
  const browser=await chromium.launch(launchOptions);t.after(()=>browser.close());
  const f=await browserSession(browser,{actor:'responsive-local-member',rpc:()=>({}),localPlayers:['하나','둘','셋','넷']});
  const compact={width:375,height:667};
  const playSpace=()=>f.page.locator('.play-body').evaluate(pane=>{
    const css=getComputedStyle(pane);
    return {width:pane.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight),
      height:pane.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom)};
  });
  for(const [kind,selector] of [['croc','.croc-toy'],['stopwatch','.watch-board .watch-case'],['bottle','.bottle-dial']]){
    await t.test(kind+' actual play surface',async()=>{
      await f.page.setViewportSize(compact);
      await f.page.goto(origin+'/games/drinking/local/#'+kind);
      await dismissGuide(f.page);
      await f.page.locator('[data-action="start"]').click();
      if(kind==='stopwatch')await f.page.locator('[data-action="watch-go"]').click();
      if(kind==='bottle'){
        await f.page.locator('[data-action="set-bottle-table"]').click();
        for(const [x,y] of [[.16,.5],[.5,.16],[.84,.5],[.5,.84]]){
          await settledGame(f.page);
          const surface=f.page.locator('.seat-surface'),box=await surface.boundingBox();
          assert.ok(box,'the bottle table accepts a real participant position');
          await surface.click({position:{x:box.width*x,y:box.height*y}});
        }
        await f.page.locator('[data-action="spin"]').click();
      }
      await expectViewport(f.page,'local-'+kind+'-active-375x667',{local:true});
      const baseline=await f.page.locator(selector).boundingBox();
      const compactSpace=await playSpace();
      assert.ok(baseline&&baseline.width>0&&baseline.height>0);
      assert.ok(compactSpace.width>0&&compactSpace.height>0);
      if(kind==='bottle'){
        await f.page.setViewportSize(viewports[0]);
        await expectViewport(f.page,'local-bottle-active-390x844',{local:true});
        await screenshot(f.page,'local-bottle-active-390x844');
      }
      for(const viewport of largerViewports){
        const size=viewport.width+'x'+viewport.height,label='local-'+kind+'-active-'+size;
        await f.page.setViewportSize(viewport);
        await expectViewport(f.page,label,{local:true});
        await expectContentLayout(f.page,label,{local:true});
        const enlarged=await f.page.locator(selector).boundingBox();
        const availableSpace=await playSpace();
        // The board shares extra room with larger text and controls. A screen
        // that adds only a little height must not demand a larger percentage
        // increase than that space can support. Substantial extra room keeps
        // the 12% minimum, while a fixed-size board still fails modest growth.
        const spaceGain=Math.max(0,Math.min(availableSpace.width/compactSpace.width,availableSpace.height/compactSpace.height)-1);
        const requiredRatio=1+Math.min(.12,spaceGain*.75);
        try{
          assert.ok(enlarged&&enlarged.width>=baseline.width*requiredRatio&&enlarged.height>=baseline.height*requiredRatio,
            label+' enlarges the actual artwork and hit surface: '+JSON.stringify({compact:baseline,larger:enlarged,compactSpace,availableSpace,requiredRatio}));
        }catch(error){await screenshot(f.page,'failure-growth-'+label);throw error;}
        if(viewport.width===768||viewport.width===1600||(kind==='bottle'&&viewport.width===720))await screenshot(f.page,label);
      }
      if(kind==='stopwatch')assert.equal(await f.page.locator('[data-action="watch-stop"]').isVisible(),true,'resizing keeps the same stopwatch running');
      if(kind==='bottle'){
        assert.equal((await f.page.locator('#bottle-title').textContent()).trim(),'병이 돌고 있어요','resizing does not brake or restart the bottle');
        assert.equal(await f.page.locator('.bottle-dial .seat').count(),4,'all selected places survive resizing');
      }
      await f.page.locator('#local-back').click();
      await f.page.locator('.game-card').first().waitFor({state:'visible'});
      assert.equal(await f.page.locator('[data-drinking-dialog]').count(),0);
    });
  }
  assert.deepEqual(f.errors,[]);
  assert.deepEqual(f.calls.filter(call=>(call.name.endsWith('_multiplayer')||call.name==='drinking_room')&&
    !['state','mine'].includes(call.args.p_action)),[],'layout changes do not submit game actions');
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
  await expectGlassImage(result);
  assert.equal(await result.locator('img').count(),0,'result strings cannot create HTML images');
  assert.equal(await result.locator('[onerror],[onload],script').count(),0,'untrusted strings cannot insert active HTML');
  assert.equal(await f.page.evaluate(()=>window.__injected),undefined);
  assert.ok((await result.textContent()).includes(malicious));
  await allSizes(f.page,'result-12-names',{dialog:true});
  await result.locator('[data-drinking-close]').first().click();

  // Art review uses normal game copy, separate from the adversarial HTML case.
  await f.page.evaluate(()=>{
    window.DrinkingPresentation.update({phase:'ready',roundKey:'round-2',result:null});
    window.DrinkingPresentation.update({phase:'done',roundKey:'round-2',result:{
      key:'result-2',title:'민지님 당첨!',body:'악어를 깨운 사람은 민지님이에요.',names:['민지']
    }});
  });
  await result.waitFor({state:'visible'});
  const full=await glassMoment(f.page,0);
  await expectGlassImage(result);
  // Keep the liquid full while the panel and its backdrop finish appearing;
  // screenshots must show the settled, opaque UI rather than a fade-in frame.
  await result.evaluate(panel=>Promise.all([
    ...panel.getAnimations(),...panel.parentElement.getAnimations()
  ].map(animation=>animation.finished.catch(()=>{}))));
  await expectViewport(f.page,'result-glass-full',{dialog:true});
  await screenshot(f.page,'result-glass-full');
  const middle=await glassMoment(f.page,.5);
  assert.ok(full.fixedClip&&full.clipBottom!==null,'the liquid drains through a fixed glass-shaped clip');
  assert.ok(middle.y>full.y+1&&middle.liquidTop<middle.clipBottom&&middle.opacity>.1,'a visible intermediate waterline moves downward');
  await expectViewport(f.page,'result-glass-mid',{dialog:true});
  await screenshot(f.page,'result-glass-mid');
  const empty=await glassMoment(f.page,1);
  assert.ok(Math.abs(full.y)<1&&empty.y>middle.y&&empty.liquidTop>=empty.clipBottom&&empty.opacity<.05,'the visible liquid exits the glass and becomes transparent');
  await expectViewport(f.page,'result-glass-empty',{dialog:true});
  await screenshot(f.page,'result-glass-empty');
  await allSizes(f.page,'result-art',{dialog:true});
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
  await expectGlassImage(reducedResult);
  const active=await reducedResult.evaluate(panel=>panel.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length);
  const reducedLiquid=await liquidGeometry(reduced.page);
  assert.equal(active,0,'reduced-motion avoids running effects');
  assert.ok(reducedLiquid.liquidTop>=reducedLiquid.clipBottom&&reducedLiquid.opacity<.05,'reduced-motion shows the completed empty-glass state');
  await reducedResult.locator('[data-drinking-close]').first().click();
  assert.deepEqual(reduced.errors,[]);

  const unavailable=await browserSession(browser,{actor:'presentation-member',rpc:()=>({})});
  await unavailable.context.route('**/games/drinking/assets/result-glass-v2.webp*',route=>route.abort());
  await unavailable.page.goto(origin+'/tests/drinking-presentation-frame.html');
  await unavailable.page.waitForFunction(()=>!!window.DrinkingPresentation);
  await unavailable.page.evaluate(()=>{
    window.DrinkingPresentation.enter('croc');
    window.DrinkingPresentation.update({phase:'done',roundKey:'unavailable-1',result:{
      key:'unavailable-1',title:'민지님 당첨!',body:'악어를 깨운 사람은 민지님이에요.'
    }});
  });
  const fallback=unavailable.page.locator('[data-drinking-dialog="result"]');
  await fallback.waitFor({state:'visible'});
  const failedArt=fallback.locator('[data-drinking-glass][data-glass-ready="error"]');
  await failedArt.waitFor({state:'attached'});
  assert.equal(await failedArt.isVisible(),false,'a failed image does not leave an unfinished artwork area');
  assert.ok((await fallback.textContent()).includes('민지님 당첨!'),'the confirmed result survives an image failure');
  await allSizes(unavailable.page,'result-art-unavailable',{dialog:true});
  await fallback.locator('[data-drinking-primary]').click();
  await fallback.waitFor({state:'hidden'});
  assert.equal(await unavailable.page.locator('#access-content > [inert]').count(),0,'a missing image never locks the game');
  assert.deepEqual(unavailable.errors,[]);
});

test('a long native king result opens after consent and stays readable on every viewport', {timeout:60000}, async t => {
  const browser=await chromium.launch(launchOptions);t.after(()=>browser.close());
  const players=['도윤','민지','준호','서연','지우','수빈','시우','하윤','예준','나은','민재','유진'];
  const mission='지목된 두 사람은 서로의 첫인상을 한 문장씩 말하고, 오늘 처음 알게 된 매력을 하나씩 이야기해 주세요. 부담스러운 내용은 편하게 넘겨도 돼요.';
  assert.ok(mission.length<=80,'the long review fixture remains a valid mission');
  let state={code:'KING01',revision:1,players,me:1,capacity:12,title:'함께하는 술자리',
    round:1,phase:'response',king:0,card:1,number:1,recipient:1,second:2,secondRecipient:2,
    mission,accepted:[2],declined:null};
  const f=await browserSession(browser,{actor:'king-presentation-member',rpc:(name,args)=>{
    assert.equal(name,'king_multiplayer');
    assert.equal(args.p_code,state.code);
    if(args.p_action==='accept'){
      assert.equal(args.p_options.round,1);
      state={...state,revision:state.revision+1,phase:'done',accepted:[1,2]};
    } else assert.equal(args.p_action,'state','presentation never submits an unrelated action');
    return structuredClone(state);
  }});
  await f.page.goto(origin+'/games/king/?room=KING01');
  await dismissGuide(f.page);
  const destination=new URL(await f.page.locator('#access-content > header .drinks-home').getAttribute('href'),origin);
  assert.equal(destination.pathname,'/games/drinking/');
  assert.equal(destination.searchParams.get('resume'),'KING01','a direct room keeps its resumable game code');
  assert.equal(destination.searchParams.get('gameFrom'),'king','a direct room keeps its game type');
  assert.equal(await f.page.locator('[data-drinking-dialog="result"]').count(),0,'a pending consent is not a completed result');
  await f.page.locator('[data-do="accept"]').click();
  const result=f.page.locator('[data-drinking-dialog="result"]');
  await result.waitFor({state:'visible'});
  await expectGlassImage(result);
  const text=await result.textContent();
  assert.ok(text.includes('왕의 명령이 정해졌어요'));
  assert.ok(text.includes(mission)&&text.includes('민지')&&text.includes('준호'),'the complete mission and both recipients remain visible as text');
  assert.ok(text.includes('두 사람 모두 동의했어요'),'the result preserves the actual consent outcome');
  await allSizes(f.page,'native-king-long-result',{dialog:true});
  await screenshot(f.page,'native-king-long-result-390x844');
  await f.page.setViewportSize({width:844,height:390});
  await expectViewport(f.page,'native-king-long-result-landscape',{dialog:true});
  await screenshot(f.page,'native-king-long-result-844x390');
  const writes=f.calls.filter(call=>call.name==='king_multiplayer'&&call.args.p_action!=='state').length;
  await result.locator('[data-drinking-close]').first().click();
  await result.waitFor({state:'hidden'});
  assert.equal(f.calls.filter(call=>call.name==='king_multiplayer'&&call.args.p_action!=='state').length,writes,'closing the artwork does not alter the king game');
  assert.equal(state.phase,'done');
  assert.deepEqual(f.errors,[]);
});

test('the secret count button has a private total and a closed lid for the waiting seat', {timeout:90000}, async t=>{
  const browser=await chromium.launch(launchOptions);
  t.after(()=>browser.close());
  for(const multi of [false,true]){
    let game={phase:'setup'};
    let revision=1;
    const f=await browserSession(browser,{actor:'secret-host',localPlayers:['가','나','다','라'],rpc:(name,args)=>{
      if(name!=='party_live_multiplayer')return {};
      if(args.p_action==='sc_start'){assert.equal(args.p_options.target,5);game={phase:'press',current:0,turn:0,used:0};revision++;}
      if(args.p_action==='sc_press'){game={...game,used:game.used+1};revision++;}
      if(args.p_action==='sc_pass'){game={phase:'press',current:1,turn:1};revision++;}
      return {code:'SC1234',revision,me:0,round:1,phase:game.phase,game,players:['가','나','다','라'],capacity:4,title:'시크릿 카운트'};
    }});
    const p=f.page;
    await p.goto(origin+(multi?'/games/secretcount/?room=SC1234':'/games/drinking/local/#secretcount'));
    await dismissGuide(p);
    const form=p.locator('.sc-setup');
    await form.locator('label').filter({hasText:'직접 정하기'}).click();
    assert.equal(await p.locator('body').evaluate(el=>getComputedStyle(el).getPropertyValue('--suite-accent').trim()),'#e6ca94');
    const selected=form.locator('fieldset label:has(:checked)');
    assert.deepEqual(await selected.evaluate(el=>[getComputedStyle(el).color,getComputedStyle(el).backgroundColor]),['rgb(53, 46, 33)','rgb(230, 202, 148)']);
    const slider=form.getByRole('slider',{name:'비밀 숫자'});
    await slider.press('End');assert.equal(await form.locator('output').innerText(),'36');
    await slider.press('Home');assert.equal(await form.locator('output').innerText(),'5');
    await screenshot(p,'secretcount-slider-'+(multi?'multi':'local'));
    await form.locator('[type=submit]').click();
    const hit=p.locator('[data-sc-press]'),pass=p.locator('[data-sc-pass]');
    await hit.waitFor({state:'visible'});
    await p.waitForFunction(()=>document.body.dataset.dpPhase==='press');
    for(const viewport of [viewports[0],viewports[1],viewports[3],viewports[2]]){
      await p.setViewportSize(viewport);await painted(p);
      for(const control of [hit,pass,p.locator('.sc-turn')]){
        const r=await control.boundingBox();
        assert.ok(r&&r.width>=44&&r.height>=(control===hit||control===pass?36:18)&&r.x>=-1&&r.y>=-1&&r.x+r.width<=viewport.width+1&&r.y+r.height<=viewport.height+1,'buttons fit '+JSON.stringify({multi,viewport,r}));
      }
      assert.equal((await p.locator('#access-content').innerText()).trim().replace(/\s+/g,' '),'1번 · 가님 차례 턴 넘기기');
    }
    await p.setViewportSize(viewports[0]);
    for(let i=0;i<3;i++)await hit.click();
    assert.equal(await hit.isDisabled(),true);
    assert.equal((await p.locator('#access-content').innerText()).trim().replace(/\s+/g,' '),'1번 · 가님 차례 턴 넘기기');
    await p.waitForFunction(()=>getComputedStyle(document.querySelector('[data-sc-press]')).transform!=='none');
    await p.waitForFunction(()=>!document.querySelector('[data-sc-press]').classList.contains('sc-pressed'));
    assert.notEqual(await hit.evaluate(el=>getComputedStyle(el).transform),'none','the third press stays visibly depressed until pass');
    await screenshot(p,'secretcount-open-'+(multi?'multi':'local'));
    await pass.click();
    await p.getByText('2번 · 나님 차례',{exact:true}).waitFor({state:'visible'});
    if(multi){
      await p.locator('.sc-closed').waitFor();
      assert.equal(await hit.isDisabled(),true);assert.equal(await pass.count(),0);
      await screenshot(p,'secretcount-closed-multi');
    }else{
      await hit.click();await hit.click();
      await p.getByRole('heading',{name:'나님 당첨!'}).first().waitFor({state:'attached'});
    }
    assert.deepEqual(f.errors,[]);
    await f.context.close();
  }
});

test('entry shows a moving pub door until access is ready and both modes use one table header',async t=>{
  const browser=await chromium.launch(launchOptions);t.after(()=>browser.close());
  for(const multi of [false,true]){
    const f=await browserSession(browser,{actor:'door-host',reducedMotion:'no-preference',localPlayers:['하나','두리'],
      rpc:()=>({code:'SC1234',revision:1,round:1,me:0,capacity:2,phase:'setup',game:{phase:'setup'},players:['하나','두리']})});
    let release;
    const hold=new Promise(resolve=>{release=resolve;});
    await f.context.route('**/games/drinking/table-view.js*',async route=>{await hold;await route.fallback();});
    await f.page.goto(origin+(multi?'/games/secretcount/?room=SC1234':'/games/drinking/local/#secretcount'),{waitUntil:'domcontentloaded'});
    const gate=f.page.locator('#access-screen');
    try{
      await gate.waitFor({state:'visible'});
      assert.equal(await gate.locator('#access-message').textContent(),'술집 들어가는 중');
      assert.equal(await gate.evaluate(el=>getComputedStyle(el,'::before').animationName),'pub-door');
      assert.equal(await f.page.locator('#access-content').isVisible(),false);
      await f.page.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await gate.evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
    }finally{release();}
    await dismissGuide(f.page);
    assert.equal(await gate.isVisible(),false);
    assert.equal((await f.page.locator('.table-heading').innerText()).replace(/\s+/g,' ').trim(),'시크릿 카운트 2명 플레이');
    await screenshot(f.page,'shared-pub-table-'+(multi?'multi':'local'));
    assert.deepEqual(f.errors,[]);await f.context.close();
  }
});

test('one phone can choose or write prompts inline and read the fingers recommendation', {timeout:90000}, async t=>{
  const browser=await chromium.launch(launchOptions);
  t.after(()=>browser.close());
  const banks={
    king:['동물 흉내 내기','노래 한 소절 부르기','둘이 손으로 하트 만들기'],
    truth:{mild:['요즘 즐겨 듣는 노래는?'],spicy:['가장 설렜던 데이트는?']},
    imagevote:['여행 계획을 잘 짤 사람은?','요리를 즐길 사람은?'],
    minority:[['바다 여행','산 여행'],['커피','차']],
    fingers:['운동화를 신은 사람 접어','오늘 커피 마신 사람 접어']
  };
  const session=await browserSession(browser,{actor:'inline-prompt-player',localPlayers:['가을','겨울','봄'],
    rpc(name){return name==='drinking_content'?{banks}:{ok:true};}});
  const page=session.page;
  for(const kind of ['fingers','king','truth','minority','imagevote']){
    await page.goto(origin+'/games/drinking/local/#'+kind);
    await dismissGuide(page);
    if(kind==='truth'){
      assert.equal(await page.locator('.truth-settings,.question-picker').count(),0);
      await page.getByRole('button',{name:'설정',exact:true}).click();
      await page.getByRole('radio',{name:'반반',exact:true}).check();
      await page.getByRole('radio',{name:'보이기',exact:true}).check();
      await page.getByRole('button',{name:'질문 고르기'}).click();
    }else await page.locator('[data-action="start"]').click();
    if(kind==='king')for(let i=0;i<3;i++){
      await page.locator('[data-action="reveal"]').click();
      await page.locator('[data-action="hide"]').click();
    }
    if(kind==='fingers'){
      const button=page.locator('[data-finger-random]');
      await button.waitFor({state:'visible'});
      const colors=await button.evaluate(el=>[getComputedStyle(el).color,getComputedStyle(el).backgroundColor]);
      function luminance(css){
        const rgb=css.match(/\d+/g).slice(0,3).map(Number).map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
        return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
      }
      const [light,dark]=colors.map(luminance).sort((a,b)=>b-a);
      assert.ok((light+.05)/(dark+.05)>=4.5,'readable recommendation on the actual game theme');
      continue;
    }
    const picker=page.locator('.question-picker');
    const select=picker.locator('[data-question]');
    await select.waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('[data-question]')?.options.length>0);
    assert.equal(await picker.locator('[data-mode="list"]').getAttribute('aria-pressed'),'true');
    await page.setViewportSize({width:844,height:390});
    await expectViewport(page,'inline-landscape-'+kind,{local:true});
    await page.setViewportSize({width:390,height:844});
    await select.selectOption({index:0});
    if(kind==='king'){
      const text=await select.locator('option:checked').textContent();
      await picker.locator('[type=submit]').click();
      await page.locator('.king-order h2').filter({hasText:text}).waitFor({state:'attached'});
    }else{
      await picker.locator('[data-mode="write"]').click();
      const value=kind==='minority'?'바닷가':'누가 여행 계획을 가장 잘 짤까요?';
      await picker.locator('textarea').first().fill(value);
      if(kind==='minority'){
        await picker.locator('textarea').nth(1).fill(value);
        assert.equal(await picker.locator('[type=submit]').isDisabled(),true);
        await picker.locator('textarea').nth(1).fill('산속');
      }
      await picker.locator('[data-mode="list"]').click();
      await picker.locator('[data-mode="write"]').click();
      assert.equal(await picker.locator('textarea').first().inputValue(),value);
      if(kind==='truth'){
        await picker.locator('[data-prompt-flavor]').selectOption('mixed');
        await picker.locator('[data-write-level] select').selectOption('mild');
      }
      await picker.locator('[type=submit]').click();
      if(kind==='truth'){
        await page.getByRole('button',{name:'설정 완료'}).click();
        await page.getByRole('button',{name:'게임 시작',exact:true}).click();
        assert.equal(await page.locator('.truth-back').count(),2);
        await page.getByRole('button',{name:/순한맛 카드 뒤집기/}).click();
      }else await page.locator('[data-action="open-vote"]').click();
      assert.ok((await page.locator('.play-body').innerText()).includes(value));
    }
  }
  assert.deepEqual(session.errors,[]);
});

async function expectRouletteStage(page,rotated) {
  await page.waitForFunction(expected=>{
    const angle=document.getElementById('access-content')?.dataset.rouletteAngle;
    return angle!=null && (Math.abs(Number(angle))===90)===expected;
  },rotated,{timeout:3000});
  await page.locator('.roulette-scene img').evaluate(image=>image.decode());
  const stage=await page.locator('.roulette-table').evaluate(table=>{
    const host=document.getElementById('access-content'),scene=table.querySelector('.roulette-scene');
    const frame=scene.getBoundingClientRect(),photo=scene.querySelector('.pr-prop').getBoundingClientRect();
    const edgeToEdge=Math.abs(frame.left)<2&&Math.abs(frame.top)<2&&
      Math.abs(frame.right-innerWidth)<2&&Math.abs(frame.bottom-innerHeight)<2;
    const long=Math.max(innerWidth,innerHeight),short=Math.min(innerWidth,innerHeight);
    const targetWidth=Math.min(long,short*2.3);
    return {turned:getComputedStyle(host).getPropertyValue('--roulette-rotated').trim()==='1',
      edgeToEdge,fullSize:Math.abs(Math.max(photo.width,photo.height)-targetWidth)<2};
  });
  assert.deepEqual(stage,{turned:rotated,edgeToEdge:true,fullSize:true});
}

test('local roulette loads in portrait then turns for play without a target picker',async t=>{
  const browser=await chromium.launch(launchOptions);t.after(()=>browser.close());
  const session=await browserSession(browser,{actor:'wheel-member',localPlayers:['보리','나리','마루'],
    rpc:(_name,args)=>args.p_action==='mine'?{room:null}:{rooms:[]}});
  const page=session.page;
  const {revision}=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../game-release.json'),'utf8'));
  await page.goto(origin+'/games/drinking/local/?v='+revision+'#partyroulette');
  await dismissGuide(page);
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-action="start"]').click();
  assert.equal(await page.locator('.pr-target').count(),0);
  assert.equal(await page.locator('#access-content').getAttribute('data-roulette-angle'),null);
  await page.getByRole('button',{name:'장전하기'}).click();
  await expectRouletteStage(page,true);
  await page.getByRole('button',{name:'메뉴',exact:true}).click();
  await page.locator('#local-back').waitFor({state:'visible'});
  await page.getByRole('button',{name:'게임으로',exact:true}).click();
  await page.getByRole('button',{name:'방향 전환'}).click();
  assert.equal(await page.locator('#access-content').getAttribute('data-roulette-angle'),'-90');
  await page.getByRole('button',{name:'시작',exact:true}).click();
  await expectRouletteStage(page,true);
  await page.getByRole('button',{name:'방아쇠 누르기'}).click({trial:true});
  await page.setViewportSize({width:844,height:390});
  await expectRouletteStage(page,false);
  await page.getByRole('button',{name:'방아쇠 누르기'}).click({trial:true});
  await screenshot(page,'local-partyroulette-fullscreen-landscape');
  await page.goto(origin+'/games/partyroulette/');
  await page.waitForURL('**/games/drinking/?mode=multi');
  await page.locator('#open-create').waitFor();
  assert.deepEqual(session.errors,[]);
});

test('three phones choose a target during loading and reveal the same winner',async t=>{
  const browser=await chromium.launch(launchOptions);t.after(()=>browser.close());
  const n=3,ready=new Set(),pressed=new Set(),targets=new Map();let phase='prepare',revision=1,opensAt=0,revealAt=0;
  const sessions=await Promise.all([0,1,2].map(async seat=>{
    return browserSession(browser,{actor:'roulette-device-'+seat,reducedMotion:'no-preference',viewport:seat===0?{width:360,height:640}:{width:844,height:390},rpc:(_name,args)=>{
      const act=args.p_action;
      if(act==='roulette_ready'&&phase==='prepare'){
        targets.set(seat,args.p_options.target);ready.add(seat);revision++;
        if(ready.size===n){phase='together';opensAt=Date.now()+3000;}
      }else if(act==='roulette_press'&&phase==='together'){
        if(Date.now()<opensAt)throw Error('countdown_running');
        pressed.add(seat);revision++;
        if(pressed.size===n){phase='done';revealAt=Date.now()+900;}
      }
      const marks=phase==='prepare'?ready:pressed;
      return {code:'GRP001',title:'함께',capacity:n,players:['1번','2번','3번'],me:seat,revision,round:1,
        phase,serverMs:Date.now(),hostSeat:2,game:phase==='done'?{phase,fired:seat===1,shooter:1,target:targets.get(1),revealAt}:{phase,count:marks.size,mine:marks.has(seat),opensAt,myTarget:targets.get(seat)}};
    }});
  }));
  const pages=sessions.map(s=>s.page);
  await Promise.all(pages.map(async (p,i)=>{
    await p.goto(origin+'/games/partyroulette/?room=GRP001');await dismissGuide(p);
    await p.evaluate(() => {
      window.revealEvents = [];
      const play = window.PartyFX.play;
      window.PartyFX.play = (id, ...args) => {
        if (id === 'shot' || id === 'dry') window.revealEvents.push(id);
        return play(id, ...args);
      };
      new MutationObserver(records => {
        for (const record of records) for (const light of record.addedNodes) {
          if (!light.matches?.('.pr-screen-flash')) continue;
          const box = light.getBoundingClientRect();
          window.revealEvents.push(box.width === innerWidth && box.height === innerHeight ? 'viewport' : 'partial');
        }
      }).observe(document.body, {childList:true});
    });
    assert.equal(await p.getByRole('button',{name:'장전하기'}).isDisabled(),true);
    const select=p.getByLabel('누구를 쏘실건가요?',{exact:true});
    assert.equal(await select.locator('option[value="'+i+'"]').count(),0);
    await select.selectOption(String((i+1)%n));
    await p.getByRole('button',{name:'장전하기'}).click();
    await expectRouletteStage(p,i===0);
    await p.getByRole('button',{name:'시작',exact:true}).click();
  }));
  await Promise.all(pages.map(p=>p.getByRole('button',{name:'방아쇠 누르기'}).click()));
  for(const [i,p] of pages.entries()){
    const result=p.locator('[data-drinking-dialog="result"]');
    await result.waitFor();assert.match(await result.innerText(),/3번 당첨!/);
    assert.deepEqual(await p.evaluate(() => window.revealEvents), i === 1 ? ['shot','viewport'] : ['dry']);
    assert.deepEqual(sessions[i].errors,[]);
  }
});

test('drinking menu buttons keep square artwork and identify the scare before selection', async t => {
  const browser = await chromium.launch(launchOptions);
  t.after(() => browser.close());
  const {page} = await browserSession(browser, {actor:'menu-buttons', rpc:async()=>[]});
  await page.goto(origin+'/games/drinking/local/#menu');
  const cards = page.locator('.games .table-card');
  await cards.first().waitFor();
  for (const kind of ['stopwatch', 'secretcount', 'shapematch']) {
    const thumbnail = page.locator('.games [data-value="' + kind + '"] .card-art img');
    await thumbnail.evaluate(img => img.decode());
    assert.deepEqual(await thumbnail.evaluate(img => [img.naturalWidth, img.naturalHeight]), [508, 508]);
    assert.equal(await thumbnail.getAttribute('src'), '/games/drinking/local/art/' + kind + '.webp');
  }
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({width, height:800});
    await painted(page);
    for (const art of await cards.locator('.card-art').all()) {
      const bounds = await art.boundingBox();
      assert.ok(bounds.width > 0 && Math.abs(bounds.width - bounds.height) < 1, 'square artwork at '+width);
    }
    const cropped = await cards.locator('img').evaluateAll(images =>
      images.filter(img => getComputedStyle(img).objectFit !== 'contain').length);
    assert.equal(cropped, 0);
    const sound = await page.locator('#effects').boundingBox();
    assert.equal(sound.width, sound.height);
  }
  await page.locator('[data-action="filter"][data-value="순발력"]').click();
  const warned = cards.filter({has:page.locator('.card-warning')});
  assert.equal(await warned.count(), 1);
  assert.equal(await warned.getAttribute('data-value'), 'shapematch');
  const badge = warned.getByText('주의', {exact:true});
  assert.ok(await badge.isVisible());
  assert.equal(await badge.evaluate(el => getComputedStyle(el).color), 'rgb(180, 35, 35)');
});

test('shape match enters from the local catalog and reveals the slowest player using the shared glass', {timeout:90000}, async t => {
  const browser=await chromium.launch(launchOptions);
  t.after(()=>browser.close());
  const f=await browserSession(browser,{actor:'shape-fixture',localPlayers:['참가자 4','참가자 1'],rpc:async()=>[],reducedMotion:'no-preference'});
  const p=f.page;
  await p.goto(origin+'/games/drinking/local/#menu');
  await p.locator('[data-value="shapematch"]').click();
  await dismissGuide(p);
  await p.locator('[data-action="start"]').click();
  await p.evaluate(() => {
    window.screamPlayback = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(when, offset, duration) {
      if (document.querySelector('.sm-ghost:not([hidden])') && this.buffer) {
        const rate = this.buffer.sampleRate;
        const samples = this.buffer.getChannelData(0).subarray(Math.round(offset*rate), Math.round((offset+duration)*rate));
        const audible = samples.some(sample => Math.abs(sample) > .1);
        window.screamPlayback.push({duration, audible});
      }
      return start.apply(this, arguments);
    };
  });
  const seenGhosts = new Set();
  const scores=[];
  for(const delay of [120,950]) {
    if (scores.length) {
      await p.locator('#effects').click();
      await p.locator('#audio-check').uncheck();
      await p.locator('#fx-close').click();
    }
    await p.locator('[data-action="shape-go"]').click();
    const field=p.locator('.sm-field');
    assert.equal(await field.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(0, 0, 0)');
    assert.equal(await field.locator('.sm-piece').count(),1);
    const ghost=field.locator('.sm-ghost');
    await ghost.waitFor({state:'visible',timeout:8000});
    await ghost.evaluate(img=>img.decode());
    const ghostPath = await ghost.evaluate(img => new URL(img.currentSrc).pathname);
    assert.ok(['/games/shapematch/ghost.svg', '/games/shapematch/ghosts/black-eyes.webp',
      '/games/shapematch/ghosts/white-eyes.webp'].includes(ghostPath));
    assert.ok(!seenGhosts.has(ghostPath), 'consecutive players see different ghosts');
    seenGhosts.add(ghostPath);
    if (ghostPath.endsWith('.webp')) {
      assert.equal(await ghost.evaluate(img => getComputedStyle(img).backgroundColor), 'rgb(0, 0, 0)');
    }
    await ghost.waitFor({state:'hidden'});
    const sounds = await p.evaluate(() => window.screamPlayback);
    assert.equal(sounds.length,1,'one scream on the first reveal, silence on the muted second turn');
    assert.ok(sounds[0].audible && sounds[0].duration >= 1 && sounds[0].duration <= 1.14);
    await p.locator('.sm-live').getByText('녹색 동그라미').waitFor({state:'attached'});
    await new Promise(resolve=>setTimeout(resolve,delay));
    await field.click();
    scores.push(parseInt(await p.locator('.play-body h2').innerText(),10));
    await p.locator('[data-action="shape-next"]').click();
  }
  const panel=p.locator('[data-drinking-dialog="result"]');
  await panel.waitFor({state:'visible'});
  assert.ok(scores[1]>scores[0]);
  assert.match(await panel.innerText(),/참가자 1 당첨!/);
  assert.ok((await panel.innerText()).includes(String(scores[1])));
  assert.ok(await panel.locator('[data-drinking-glass] [data-drinking-glass-image]').count());
  await panel.locator('[data-drinking-close]').first().click();
  const table=p.getByRole('table',{name:'참가자별 반응 시간'});
  const rows=table.locator('tbody tr');
  assert.deepEqual(await rows.locator('th').allTextContents(),['참가자 4','참가자 1 당첨']);
  assert.deepEqual(await rows.locator('td').allTextContents(),scores.map(ms=>ms+' ms'));
  for (const width of [320, 768]) {
    await p.setViewportSize({width,height:844});
    await settledGame(p);
    for (const row of await rows.all()) {
      const gap=await row.evaluate(row=>{
        const textBox=node=>{
          const range=document.createRange();
          range.selectNodeContents(node);
          return range.getBoundingClientRect();
        };
        return textBox(row.cells[1]).left-textBox(row.cells[0]).right;
      });
      assert.ok(gap>=8,'keep names visibly separate from times at '+width+'px');
    }
  }
  assert.deepEqual(f.errors,[]);
});
