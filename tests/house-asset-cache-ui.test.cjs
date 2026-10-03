const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const {builtInAssets}=await import(pathToFileURL(path.join(root,'house-test/built-in-assets.js')));
 for(const asset of Object.values(builtInAssets))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'house-test/assets',asset.file))).digest('hex').slice(0,16),asset.revision,'changed artwork must have a new cache revision');
 const requests=[];let changed=false,broken=false;
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/fixture'){
   res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store');
   res.end(`<!doctype html><script type="module">import{loadBuiltInItems}from'/house-test/custom-furniture.js?v=${url.searchParams.get('app')}';window.loadItems=async ids=>{const start=performance.now();await Promise.all([loadBuiltInItems(ids),loadBuiltInItems(ids)]);return performance.now()-start};</script>`);return;
  }
  const file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  const runtime=file.endsWith('.runtime.json');
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':runtime?'application/json':'application/octet-stream');
  // Expire HTTP freshness immediately: force-cache must still reuse valid bytes.
  res.setHeader('Cache-Control',runtime?'public, max-age=0':'no-store');
  if(runtime){requests.push({path:url.pathname,revision:url.searchParams.get('v'),bytes:broken?2:fs.statSync(file).size});if(broken){res.end('{}');return;}}
  if(changed&&file.endsWith('built-in-assets.js')){res.end(fs.readFileSync(file,'utf8').replace(builtInAssets.chair.revision,builtInAssets.chair.revision+'-fixture-update'));return;}
  fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  const origin='http://127.0.0.1:'+server.address().port,context=await browser.newContext(),errors=[];
  const open=async(ctx,app)=>{const page=await ctx.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/fixture?app='+app);await page.waitForFunction(()=>typeof window.loadItems==='function');return page;};
  let page=await open(context,'first'),start=requests.length;
  const coldMs=await page.evaluate(()=>loadItems());
  assert.equal(requests.length-start,4,'only one request per asset despite concurrent loading');
  const coldBytes=requests.slice(start).reduce((sum,r)=>sum+r.bytes,0);await page.close();
  page=await open(context,'unrelated-app-update');start=requests.length;
  await context.setOffline(true);
  const warmMs=await page.evaluate(()=>loadItems());
  assert.equal(requests.length-start,0,'reopening after an app version change reuses all four expired cached assets, even offline');await context.setOffline(false);await page.close();
  changed=true;page=await open(context,'changed-artwork');start=requests.length;await page.evaluate(()=>loadItems());
  assert.deepEqual(requests.slice(start).map(r=>path.basename(r.path)),['chair-v1.runtime.json'],'a changed artwork revision fetches only that asset');await page.close();changed=false;
  // A cacheable but invalid response cannot trap retries on those invalid bytes.
  const retryContext=await browser.newContext();broken=true;page=await open(retryContext,'retry');start=requests.length;
  assert.equal(await page.evaluate(async()=>{try{await loadItems(['coffee-table']);return false;}catch{return true;}}),true);
  broken=false;await page.evaluate(()=>loadItems(['coffee-table']));
  assert.equal(requests.length-start,2,'retry bypasses the malformed cached response and prepares the valid runtime');
  const before=requests.length;await page.evaluate(()=>loadItems(['coffee-table']));assert.equal(requests.length,before,'a successful retry is reused');
  for(const failure of ['denied','full']){
   const unavailable=await browser.newContext();
   await unavailable.addInitScript(failure=>{
    if(failure==='denied')CacheStorage.prototype.open=async()=>{throw new DOMException('blocked','SecurityError');};
    else Cache.prototype.put=async()=>{throw new DOMException('full','QuotaExceededError');};
   },failure);
   const fallback=await open(unavailable,'storage-'+failure);await fallback.evaluate(()=>loadItems(['floor-lamp']));await unavailable.close();
  }
  assert.deepEqual(errors,[]);
  const result={coldRequests:4,coldRuntimeBytes:coldBytes,warmRequests:0,warmRuntimeBytes:0,coldLocalMs:Math.round(coldMs),warmLocalMs:Math.round(warmMs),changedAssetOnly:true,malformedCacheRetry:true,offlineArtwork:true,storageDeniedOrFullFallback:true};
  if(process.env.HOUSE_CACHE_PROOF){fs.mkdirSync(path.dirname(process.env.HOUSE_CACHE_PROOF),{recursive:true});fs.writeFileSync(process.env.HOUSE_CACHE_PROOF,JSON.stringify(result,null,2));}
  console.log('HOUSE ASSET CACHE PASS',JSON.stringify(result));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
