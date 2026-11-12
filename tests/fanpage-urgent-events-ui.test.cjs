// Real Chromium layout and original image loading; no production writes or login.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),out=path.join(__dirname,'artifacts/fanpage-urgent-events');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN || (fs.existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':'/usr/bin/chromium'),headless:true,args:['--no-sandbox']});
 try {
 const report=[];
 for(const group of ['tws','ateez','nctdream']) {
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const D=Date;window.Date=class extends D{constructor(...a){super(...(a.length?a:['2026-11-12T14:00:00Z']))}static now(){return new D('2026-11-12T14:00:00Z').getTime()}}});
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin!=='https://fan.test') return route.request().resourceType()==='image'?route.continue():route.abort();
  if(u.pathname.endsWith('/vendor/supabase.js'))return route.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{onAuthStateChange:()=>{}},from:()=>({select(){return this},order(){return this},range(){return this},abortSignal:async()=>({data:[],error:null})})})};'});
  const file=path.join(root,decodeURIComponent(u.pathname));if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.abort();
  return route.fulfill({path:file,contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'})[path.extname(file)]});
 });
 await page.goto('https://fan.test/features/fanpages/artist.html?group='+group);await page.waitForSelector('.event-card');
 const cards=await page.locator('.event-card').evaluateAll(nodes=>nodes.map(n=>({text:n.innerText,href:n.href,target:n.target,rel:n.rel})));
 assert.equal(cards.length,{tws:2,ateez:4,nctdream:6}[group]);
 for(const card of cards){assert.ok(card.href.startsWith('https://'));assert.equal(card.target,'_blank');assert.match(card.rel,/noopener/)}
 if(group==='nctdream'){assert.match(cards[0].text,/11\/8~11\/16/);assert.match(cards[0].text,/12:00~20:00/);assert.ok(cards.every(c=>!c.text.includes('The Harvest Day')))}
 for(const width of [320,390,768]){
  await page.setViewportSize({width,height:844});await page.locator('#schedule').scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),group+' horizontal overflow '+width);
  const clipped=await page.locator('.event-card-info').evaluateAll(nodes=>nodes.some(n=>n.scrollWidth>n.clientWidth+1));assert.equal(clipped,false,group+' clipped schedule '+width);
  await page.locator('#schedule').screenshot({path:path.join(out,`${group}-${width}-schedule.png`)});
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('#photos').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>[...document.querySelectorAll('#photos img')].every(i=>i.complete),null,{timeout:30000});
 const images=await page.locator('#photos img').evaluateAll(nodes=>nodes.map(n=>({src:n.currentSrc,loaded:n.complete&&n.naturalWidth>0})));
 assert.ok(images.length>0);assert.ok(images.every(i=>i.loaded),group+' original gallery image failed');
 await page.locator('#photos').screenshot({path:path.join(out,`${group}-photos.png`)});
 assert.deepEqual(errors,[]);report.push({group,cards,images,widths:[320,390,768],pageErrors:errors});await page.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log('PASS: three groups, 12 verified events, 320/390/768px layouts, safe links, original gallery images and no runtime errors.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
