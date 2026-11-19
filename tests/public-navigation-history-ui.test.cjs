const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),origin='https://public-history.test';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin)return route.abort();
   if(url.pathname==='/before')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><a href="/guide.html?from=my">사용법</a><a href="/terms.html?from=my">약관</a>'});
   if(url.pathname==='/world.html')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><p>서비스 메인</p>'});
   const file=path.resolve(root,'.'+url.pathname);
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg'};
   return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/before');await page.getByText('사용법',{exact:true}).click();
  await page.waitForFunction(()=>window.OjjudaSectionNavigation?.hasPreviousPage);
  const guide=page.url();
  await page.locator('footer a[href="/terms.html"]').click();await page.waitForURL(origin+'/terms.html');
  await page.waitForFunction(()=>window.OjjudaSectionNavigation?.hasPreviousPage);
  await page.locator('footer a[href="/privacy.html"]').click();await page.waitForURL(origin+'/privacy.html');
  await page.waitForFunction(()=>window.OjjudaSectionNavigation?.hasPreviousPage);
  await page.goBack();assert.equal(new URL(page.url()).pathname,'/terms.html');
  await page.goBack();assert.equal(page.url(),guide);
  await page.goForward();assert.equal(new URL(page.url()).pathname,'/terms.html');
  await page.locator('[data-section-return]').click();await page.waitForURL(guide);
  await page.locator('[data-zoom]').first().click();
  await page.waitForFunction(()=>document.getElementById('image-viewer').open&&history.state?.ojjudaPublicDialog);
  await page.goBack();await page.waitForFunction(()=>!document.getElementById('image-viewer').open);
  assert.equal(page.url(),guide);
  await page.goForward();await page.waitForFunction(()=>document.getElementById('image-viewer').open);
  await page.goBack();await page.waitForFunction(()=>!document.getElementById('image-viewer').open);
  await page.locator('.header-back').click();await page.waitForURL(origin+'/before');
  const direct=await context.newPage();direct.on('pageerror',error=>errors.push(error.message));
  await direct.goto(origin+'/terms.html?from=park');
  await direct.waitForFunction(()=>history.state?.ojjudaSectionBack);
  await direct.goBack();await direct.waitForURL(origin+'/world.html?tab=park');
  assert.deepEqual(errors,[]);
  console.log('Public Back/Forward, visible Back, viewer closure and direct-entry fallback passed.');
  await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
