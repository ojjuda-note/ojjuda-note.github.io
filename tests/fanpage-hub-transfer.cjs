// Compare the shipped site with its original hub on a throttled, isolated origin.
const {chromium} = require('playwright');
const {createServer} = require('node:http');
const {readFile} = require('node:fs/promises');
const {gzipSync} = require('node:zlib');
const {resolve, extname, sep} = require('node:path');
const assert = require('node:assert/strict');
const site = resolve(process.argv[2]);
const fan = '/features/fanpages/';
const endpoint = "const query={select(){return this},order(){return this},range(){return this},abortSignal(){return Promise.resolve({data:[]})}};window.ojjudaSupabase={from:()=>query,auth:{onAuthStateChange(){}}};";
async function serve(req,res) {
  const pathname = new URL(req.url,'http://localhost').pathname;
  const target = resolve(site,'.'+pathname);
  if (!target.startsWith(site+sep)) {res.writeHead(404).end();return;}
  let body;
  try {
    if(pathname===fan+'baseline-hub.html') body = await readFile('features/fanpages/index.html');
    else if(pathname==='/config.js') body = Buffer.from(endpoint);
    else body = await readFile(target);
  } catch {res.writeHead(404).end();return;}
  const ext=extname(target);
  const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml'}[ext]||'application/octet-stream';
  const compressed=['.js','.html','.css'].includes(ext);
  body=compressed?gzipSync(body):body;
  res.writeHead(200,{'Content-Type':type,'Content-Length':body.length,...(compressed?{'Content-Encoding':'gzip'}:{}),'Cache-Control':'public,max-age=3600','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"}).end(body);
}
async function sample(browser,origin,pageName) {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:2,reducedMotion:'reduce'});
 try {
  const page=await context.newPage(), cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:187500,uploadThroughput:93750});
  await page.addInitScript(()=>new MutationObserver((_,obs)=>{
   const node=document.querySelector('.artist-tile, #artist-root h1');
   if(node){obs.disconnect();requestAnimationFrame(()=>requestAnimationFrame(()=>{window.firstCard=performance.now()}));}
  }).observe(document,{subtree:true,childList:true}));
  await page.goto(origin+fan+pageName,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.firstCard>0);
  assert.equal(await page.locator('.artist-tile').count(),30);
  const first=await page.evaluate(()=>({ms:Math.round(window.firstCard), bytes:performance.getEntriesByType('resource').filter(r=>/\/(artists|artists-extra|hub-artists|photo-manifest)\.js\?/.test(r.name)).reduce((n,r)=>n+r.encodedBodySize,0)}));
  assert.ok(first.bytes>0);
  await page.locator('.artist-tile a[href*="group=ive"]').first().click();
  await page.waitForFunction(()=>window.firstCard>0&&document.querySelector('#artist-root h1'));
  assert.equal(await page.locator('#artist-root h1').innerText(),'IVE');
  return {...first,detail:await page.evaluate(()=>Math.round(window.firstCard))};
 } finally {await context.close();}
}
(async()=>{
 const server=createServer((req,res)=>serve(req,res).catch(()=>res.destroy()));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 try {
  const samples={before:[],after:[]};
  for(let i=0;i<5;i++)for(const k of i%2?['after','before']:['before','after']){
    samples[k].push(await sample(browser,'http://127.0.0.1:'+server.address().port,k==='before'?'baseline-hub.html':'index.html'));
  }
  for(const [key,rows] of Object.entries(samples)){
   const med=k=>rows.map(r=>r[k]).sort((a,b)=>a-b)[2];
   console.log('HUB_BENCH',key,'gzip_bytes',med('bytes'),'first_card_ms',med('ms'),'detail_ms',med('detail'));
  }
  assert.ok(samples.after[0].bytes<samples.before[0].bytes);
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
