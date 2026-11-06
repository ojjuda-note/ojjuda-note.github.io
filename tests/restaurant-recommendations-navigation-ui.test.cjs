/* Targeted real-browser coverage for the directory -> member child boundary. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('playwright');
const { installRecommendedRestaurantsFixture } = require('./helpers/recommended-restaurants-fixture.cjs');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const origin = 'https://nesting.test';
const owner = '11111111-1111-4111-8111-111111111111';
const shell = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/games/certified-restaurants/world-restaurant-guide.css"><link rel="stylesheet" href="/games/certified-restaurants/vendor/leaflet.css"><link rel="stylesheet" href="/games/certified-restaurants/restaurant-location-picker.css"><link rel="stylesheet" href="/games/certified-restaurants/restaurant-ratings.css"><link rel="stylesheet" href="/games/certified-restaurants/recommended-restaurants.css">
<button id="open">인증맛집</button><script src="/games/certified-restaurants/vendor/leaflet.js"></script><script src="/games/certified-restaurants/restaurant-location-picker.js"></script><script>${read('games/certified-restaurants/restaurant-ratings.js')}\n${read('games/certified-restaurants/recommended-restaurants.js')}\n${read('games/certified-restaurants/world-restaurant-guide.js')}</script>
<script>
 (${installRecommendedRestaurantsFixture.toString()})(window,{user:{id:${JSON.stringify(owner)}}});
 const member=OjjudaRecommendedRestaurants.create({client:rrFixture.client,getUser:rrFixture.getUser,returnLabel:'인증맛집'});
 window.nestingFixture={member,guide:OjjudaRestaurantGuide,calls:rrFixture.calls};
 document.getElementById('open').onclick=()=>OjjudaRestaurantGuide.open({owner:${JSON.stringify(owner)},authorized:()=>rrFixture.getUser()?.id===${JSON.stringify(owner)},recommendations:member});
</script>`;

test('370px nested member view preserves directory state and half-point ratings share the authenticated parent', { timeout: 90000 }, async () => {
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
 try {
  const context=await browser.newContext({viewport:{width:370,height:740},reducedMotion:'reduce'});
  await context.addInitScript(()=>Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:async()=>({state:'denied'})}}));
  const escaped=[],errors=[];let directoryLoads=0;
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin==='https://tile.openstreetmap.org'&&/^\/\d+\/\d+\/\d+\.png$/.test(url.pathname))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path fill="#edf0e4" d="M0 0h256v256H0z"/><path stroke="#fff" stroke-width="10" d="M0 128h256M128 0v256"/></svg>'});
   if(url.origin!==origin){escaped.push(url.href);return route.abort();}
   if(url.pathname==='/fixture.html')return route.fulfill({contentType:'text/html',body:shell});
   if(url.pathname==='/games/certified-restaurants/index.html')directoryLoads++;
   if(!url.pathname.startsWith('/games/certified-restaurants/')&&!['/games/certified-restaurants/world-restaurant-guide.css','/games/certified-restaurants/recommended-restaurants.css','/games/certified-restaurants/restaurant-ratings.js','/games/certified-restaurants/restaurant-ratings.css','/games/certified-restaurants/restaurant-location-picker.js','/games/certified-restaurants/restaurant-location-picker.css'].includes(url.pathname))return route.abort();
   const file=path.resolve(root,'.'+url.pathname);
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.abort();
   return route.fulfill({path:file});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/fixture.html');await page.locator('#open').click();
  const directory=page.frameLocator('.restaurant-guide-dialog iframe');
  await directory.locator('#cards .card-main').first().waitFor();
  assert.equal(new URL(await page.locator('.restaurant-guide-dialog iframe').getAttribute('src'),origin).searchParams.get('member-ratings'),'1','authenticated ratings are explicitly enabled on the actual directory frame');
  assert.equal(await directory.locator('#back-link').isVisible(),false);
  assert.equal(await directory.locator('#recommendations-link').getAttribute('href'),'/world.html?game=restaurants&restaurantView=recommendations');
  for(const width of [320,370]){
   await page.setViewportSize({width,height:740});
   const fit=await directory.locator('#recommendations-link').evaluate(link=>{const r=link.getBoundingClientRect();return{page:document.documentElement.scrollWidth<=innerWidth+1,link:r.left>=0&&r.right<=innerWidth+1,text:link.scrollWidth<=link.clientWidth+1};});
   assert.deepEqual(fit,{page:true,link:true,text:true},'the directory member entry fits '+width+'px without clipping');
   assert.equal(await page.locator('.restaurant-guide-header').evaluate(header=>{const r=header.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&header.scrollWidth<=header.clientWidth+1;}),true);
  }
  await directory.locator('#category').selectOption('한식');await directory.locator('#filter-toggle').click();
  await directory.locator('#region').selectOption('서울');await directory.locator('#search').fill('서울');await directory.locator('#search').press('Enter');
  await directory.locator('body').evaluate(()=>scrollTo(0,180));
  const snapshot=()=>directory.locator('body').evaluate(()=>({query:document.querySelector('#search').value,region:document.querySelector('#region').value,
   category:document.querySelector('#category').value,filters:document.querySelector('#filter-toggle').getAttribute('aria-expanded'),
   total:document.querySelector('#result-count').dataset.total,ids:[...document.querySelectorAll('#cards [data-restaurant-id]')].map(node=>node.dataset.restaurantId),scroll:scrollY}));
  const before=await snapshot();assert.ok(Number(before.total)>0);assert.ok(before.scroll>0,'the preserved position is a scrolled directory');
  await page.evaluate(()=>{nestingFixture.frame=document.querySelector('.restaurant-guide-dialog iframe');});
  await directory.locator('#recommendations-link').evaluate(link=>link.click());
  await page.getByRole('button',{name:'+ 맛집 추천하기',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>nestingFixture.calls[0].owner),owner,'the nested view uses the same authenticated member');
  assert.equal(await page.locator('[data-rr=close]').innerText(),'← 인증맛집');
  assert.equal(await page.locator('.rr-header').evaluate(header=>{const r=header.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&header.scrollWidth<=header.clientWidth+1;}),true,'the member return control fits a 370px screen');
  await page.getByRole('button',{name:'+ 맛집 추천하기',exact:true}).click();await page.locator('[data-rr=field-name]').fill('보존할 추천 초안');
  await page.locator('[data-rr=location-open]').click();await page.locator('[data-rlp=dialog]').waitFor();
  await page.locator('[data-rlp=map] .leaflet-tile-loaded').first().waitFor();
  await page.evaluate(()=>nestingFixture.guide.back());await page.locator('[data-rlp=dialog]').waitFor({state:'detached'});
  assert.equal(await page.locator('[data-rr=editor]').isVisible(),true,'nested Back closes the map picker before the recommendation draft');
  assert.equal(await page.locator('[data-rr=field-name]').inputValue(),'보존할 추천 초안');
  assert.equal(await page.locator('[data-rr=confirm-dialog]').count(),0,'returning from the picker does not ask to discard the outer draft');
  assert.equal(await page.evaluate(()=>document.querySelector('.restaurant-guide-dialog iframe')===nestingFixture.frame),true,'the third-level picker keeps the original directory frame alive');
  const pending=await page.evaluate(()=>{const first=nestingFixture.guide.close(),second=nestingFixture.guide.close();nestingFixture.pending=first;return{async:!!first?.then,same:first===second};});
  assert.deepEqual(pending,{async:true,same:true},'repeated parent close shares one actual dirty-child decision');
  await page.locator('[data-rr=confirm-dialog]').waitFor();await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>nestingFixture.pending),false);
  assert.equal(await page.locator('[data-rr=field-name]').inputValue(),'보존할 추천 초안');
  assert.equal(await page.evaluate(()=>document.querySelector('.restaurant-guide-dialog iframe')===nestingFixture.frame),true);
  await page.locator('[data-rr=close]').click();await page.locator('[data-rr=confirm-accept]').click();
  await page.locator('[data-rr=dialog]').waitFor({state:'detached'});
  assert.equal(await page.locator('.restaurant-guide-dialog').isVisible(),true);
  assert.deepEqual(await snapshot(),before,'return preserves the actual search, category, region, expanded filters, list and scroll');
  assert.equal(directoryLoads,1,'opening and closing the member view does not reload the directory');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('gaming')),true);
  const ratedId=await directory.locator('#cards [data-restaurant-id]').first().getAttribute('data-restaurant-id');
  await directory.locator('#cards .card-main').first().click();
  const ratingEditor=directory.locator('#detail .detail-ratings');
  await ratingEditor.locator('.orr-fieldset:not([disabled])').waitFor();
  assert.deepEqual(await ratingEditor.locator('[data-orr="choice"]').evaluateAll(inputs=>inputs.map(input=>Number(input.value))),[1,1.5,2,2.5,3,3.5,4,4.5,5]);
  await ratingEditor.getByText('1.5점',{exact:true}).click();await ratingEditor.locator('[data-orr="save"]').click();
  await ratingEditor.locator('.orr-status').filter({hasText:'1.5점으로 저장했어요'}).waitFor();
  assert.equal(await ratingEditor.locator('.orr-average').textContent(),'1.5');
  assert.equal(await ratingEditor.locator('.orr-count').textContent(),'· 1명');
  await ratingEditor.getByText('4.5점',{exact:true}).click();await ratingEditor.locator('[data-orr="save"]').click();
  await ratingEditor.locator('.orr-status').filter({hasText:'4.5점으로 저장했어요'}).waitFor();
  assert.equal(await ratingEditor.locator('.orr-average').textContent(),'4.5');
  assert.equal(await ratingEditor.locator('.orr-count').textContent(),'· 1명','a second save updates the same member vote through the frame bridge');
  assert.deepEqual(await page.evaluate(id=>nestingFixture.calls.filter(call=>call.name==='set_restaurant_rating'&&call.parameters.p_id===id).map(call=>({kind:call.parameters.p_kind,score:call.parameters.p_score,owner:call.owner})),ratedId),[1.5,4.5].map(score=>({kind:'certified',score,owner})));
  for(const width of [320,370]){
   await page.setViewportSize({width,height:740});
   await ratingEditor.locator('.orr-choices').scrollIntoViewIfNeeded();
   assert.equal(await ratingEditor.evaluate(editor=>{const dialog=document.querySelector('#detail'),rect=editor.getBoundingClientRect(),bounds=dialog.getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth+1&&dialog.scrollWidth<=dialog.clientWidth+1&&editor.scrollWidth<=editor.clientWidth+1&&bounds.left>=-1&&bounds.right<=innerWidth+1&&rect.left>=-1&&rect.right<=innerWidth+1;}),true,'directory rating choices stay inside the '+width+'px frame and detail dialog');
  }
  await directory.locator('#close-detail').click();
  assert.equal(await directory.locator('[data-rating-id="'+ratedId+'"] .orr-average').textContent(),'4.5','saving immediately updates the directory card summary');
  await directory.locator('#cards .card-main').first().click();
  await ratingEditor.locator('[data-orr="choice"][value="4.5"]:checked').waitFor({state:'attached'});
  assert.equal(await ratingEditor.locator('.orr-count').textContent(),'· 1명','reopening the same directory detail restores the saved score');
  await directory.locator('body').evaluate(()=>{
   window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
   window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
  });
  await ratingEditor.locator('.orr-fieldset:not([disabled])').waitFor();
  assert.equal(await ratingEditor.locator('[data-orr="choice"][value="4.5"]').isChecked(),true,'restoring a cached page remounts the editor with the saved score');
  await directory.locator('#close-detail').click();
  const unexpectedWrites=await page.evaluate(async id=>{
   const before=nestingFixture.calls.filter(call=>call.name==='set_restaurant_rating').length,requestId='wrong-source-rating';
   await new Promise(resolve=>{const received=event=>{if(event.data?.requestId!==requestId)return;window.removeEventListener('message',received);resolve();};window.addEventListener('message',received);window.postMessage({type:'ojjuda:restaurants:ratings',requestId,action:'save',id,score:5},location.origin);});
   return nestingFixture.calls.filter(call=>call.name==='set_restaurant_rating').length-before;
  },ratedId);
  assert.equal(unexpectedWrites,0,'a same-origin message from the parent instead of the owned frame cannot save a rating');
  assert.equal(directoryLoads,1,'rating edits do not replace the preserved directory frame');
  await directory.locator('#recommendations-link').evaluate(link=>link.click());await page.getByRole('button',{name:'+ 맛집 추천하기',exact:true}).waitFor();
  await page.evaluate(()=>nestingFixture.guide.back());await page.locator('[data-rr=dialog]').waitFor({state:'detached'});
  assert.equal(await page.locator('.restaurant-guide-dialog').isVisible(),true);
  await page.evaluate(()=>nestingFixture.guide.back());await page.locator('.restaurant-guide-dialog').waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>document.body.classList.contains('gaming')),false);
  assert.deepEqual(errors,[]);assert.deepEqual(escaped,[]);
  await context.close();
 } finally { await browser.close(); }
});
