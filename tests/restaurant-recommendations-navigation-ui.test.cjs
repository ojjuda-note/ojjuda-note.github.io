/* Targeted real-browser coverage for the directory -> member child boundary. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const origin = 'https://nesting.test';
const owner = '11111111-1111-4111-8111-111111111111';
const shell = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/world-restaurant-guide.css"><link rel="stylesheet" href="/recommended-restaurants.css">
<button id="open">인증맛집</button><script>${read('recommended-restaurants.js')}\n${read('world-restaurant-guide.js')}</script>
<script>
 const user={id:${JSON.stringify(owner)}},calls=[];
 const client={auth:{onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}};}},
  rpc:async(name,args)=>{calls.push({name,args,owner:user.id});if(name!=='list_restaurant_recommendations')throw Error('Unexpected navigation mutation');return{data:{rows:[],total:0,offset:0,limit:24},error:null};},
  storage:{from(){throw Error('Navigation must not touch photo storage');}}};
 const member=OjjudaRecommendedRestaurants.create({client,getUser:()=>user,returnLabel:'인증맛집'});
 window.nestingFixture={member,guide:OjjudaRestaurantGuide,calls};
 document.getElementById('open').onclick=()=>OjjudaRestaurantGuide.open({owner:user.id,authorized:()=>user.id===${JSON.stringify(owner)},recommendations:member});
</script>`;

test('370px nested member view preserves the actual directory filters, list, scroll and dirty draft', { timeout: 60000 }, async () => {
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
 try {
  const context=await browser.newContext({viewport:{width:370,height:740},reducedMotion:'reduce'});
  await context.addInitScript(()=>Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:async()=>({state:'denied'})}}));
  const escaped=[],errors=[];let directoryLoads=0;
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin){escaped.push(url.href);return route.abort();}
   if(url.pathname==='/fixture.html')return route.fulfill({contentType:'text/html',body:shell});
   if(url.pathname==='/games/certified-restaurants/index.html')directoryLoads++;
   if(!url.pathname.startsWith('/games/certified-restaurants/')&&!['/world-restaurant-guide.css','/recommended-restaurants.css'].includes(url.pathname))return route.abort();
   const file=path.resolve(root,'.'+url.pathname);
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.abort();
   return route.fulfill({path:file});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/fixture.html');await page.locator('#open').click();
  const directory=page.frameLocator('.restaurant-guide-dialog iframe');
  await directory.locator('#cards .card-main').first().waitFor();
  assert.equal(await directory.locator('#back-link').isVisible(),false);
  assert.equal(await directory.locator('#recommendations-link').getAttribute('href'),'/world.html?game=restaurants&restaurantView=recommendations');
  for(const width of [320,370]){
   await page.setViewportSize({width,height:740});
   const fit=await directory.locator('#recommendations-link').evaluate(link=>{const r=link.getBoundingClientRect();return{page:document.documentElement.scrollWidth<=innerWidth+1,link:r.left>=0&&r.right<=innerWidth+1,text:link.scrollWidth<=link.clientWidth+1};});
   assert.deepEqual(fit,{page:true,link:true,text:true},'the directory member entry fits '+width+'px without clipping');
   assert.equal(await page.locator('.restaurant-guide-header').evaluate(header=>{const r=header.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&header.scrollWidth<=header.clientWidth+1;}),true);
  }
  await directory.locator('[data-category="한식"]').click();await directory.locator('#filter-toggle').click();
  await directory.locator('#region').selectOption('서울');await directory.locator('#search').fill('서울');await directory.locator('#search').press('Enter');
  await directory.locator('body').evaluate(()=>scrollTo(0,180));
  const snapshot=()=>directory.locator('body').evaluate(()=>({query:document.querySelector('#search').value,region:document.querySelector('#region').value,
   category:document.querySelector('[data-category][aria-pressed=true]').dataset.category,filters:document.querySelector('#filter-toggle').getAttribute('aria-expanded'),
   total:document.querySelector('#result-count').dataset.total,ids:[...document.querySelectorAll('#cards [data-restaurant-id]')].map(node=>node.dataset.restaurantId),scroll:scrollY}));
  const before=await snapshot();assert.ok(Number(before.total)>0);assert.ok(before.scroll>0,'the preserved position is a scrolled directory');
  await page.evaluate(()=>{nestingFixture.frame=document.querySelector('.restaurant-guide-dialog iframe');});
  await directory.locator('#recommendations-link').evaluate(link=>link.click());
  await page.getByRole('button',{name:'+ 맛집 추천하기',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>nestingFixture.calls[0].owner),owner,'the nested view uses the same authenticated member');
  assert.equal(await page.locator('[data-rr=close]').innerText(),'← 인증맛집');
  assert.equal(await page.locator('.rr-header').evaluate(header=>{const r=header.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&header.scrollWidth<=header.clientWidth+1;}),true,'the member return control fits a 370px screen');
  await page.getByRole('button',{name:'+ 맛집 추천하기',exact:true}).click();await page.locator('[data-rr=field-name]').fill('보존할 추천 초안');
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
  await directory.locator('#recommendations-link').evaluate(link=>link.click());await page.getByRole('button',{name:'+ 맛집 추천하기',exact:true}).waitFor();
  await page.evaluate(()=>nestingFixture.guide.back());await page.locator('[data-rr=dialog]').waitFor({state:'detached'});
  assert.equal(await page.locator('.restaurant-guide-dialog').isVisible(),true);
  await page.evaluate(()=>nestingFixture.guide.back());await page.locator('.restaurant-guide-dialog').waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>document.body.classList.contains('gaming')),false);
  assert.deepEqual(errors,[]);assert.deepEqual(escaped,[]);
  await context.close();
 } finally { await browser.close(); }
});
