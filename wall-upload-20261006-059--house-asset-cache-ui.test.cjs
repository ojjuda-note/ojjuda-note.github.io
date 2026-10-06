const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const {builtInAssets:fallbackAssets}=await import(pathToFileURL(path.join(root,'house-test/built-in-assets.js')));
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'house-test/item-assets.json')));
 const builtInAssets={...fallbackAssets,...manifest.assets};
 for(const asset of Object.values(builtInAssets))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'house-test/assets',asset.file))).digest('hex').slice(0,16),asset.revision,'changed artwork must have a new cache revision');
 const assetCount=Object.keys(builtInAssets).length;
 const changedChair=Buffer.concat([fs.readFileSync(path.join(root,'house-test/assets',builtInAssets.chair.file)),Buffer.from('\n')]);
 const changedRevision=crypto.createHash('sha256').update(changedChair).digest('hex').slice(0,16);
 const sofaData=JSON.parse(fs.readFileSync(path.join(root,'house-test/assets',builtInAssets.sofa.file)));sofaData.views.right.source='manifest-refresh-test';
 const sofaBytes=Buffer.from(JSON.stringify(sofaData)),sofaRevision=crypto.createHash('sha256').update(sofaBytes).digest('hex').slice(0,16);
 const cushionData=JSON.parse(fs.readFileSync(path.join(root,'house-test/assets',builtInAssets['sofa-cushions'].file)));
 cushionData.cushions['sage-cushion'].seat.u=1.8;
 cushionData.cushions['sage-cushion'].views.center.sourceRect[0]=1;
 const cushionBytes=Buffer.from(JSON.stringify(cushionData)),cushionRevision=crypto.createHash('sha256').update(cushionBytes).digest('hex').slice(0,16);
 const blanketData=JSON.parse(fs.readFileSync(path.join(root,'house-test/assets',builtInAssets['sofa-blanket'].file)));
 blanketData.views.center.drape.centerU=.82;
 const blanketBytes=Buffer.from(JSON.stringify(blanketData)),blanketRevision=crypto.createHash('sha256').update(blanketBytes).digest('hex').slice(0,16);
 const floorData=JSON.parse(fs.readFileSync(path.join(root,'house-test/assets',builtInAssets['floor-blanket'].file)));
 floorData.views.center.sourceCorners[0][0]+=1;
 const floorBytes=Buffer.from(JSON.stringify(floorData)),floorRevision=crypto.createHash('sha256').update(floorBytes).digest('hex').slice(0,16);
 let changedFloor=false;
 let changedBlanket=false;
 let changedCushions=false;
 const requests=[];let changed=false,changedSofa=false,broken=false,manifestUnavailable=false;
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/fixture'){
   res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store');
   res.end(`<!doctype html><script type="module">import{loadBuiltInItems}from'/house-test/custom-furniture.js?v=${url.searchParams.get('app')}';window.loadItems=async ids=>{const start=performance.now();await Promise.all([loadBuiltInItems(ids),loadBuiltInItems(ids)]);return performance.now()-start};</script>`);return;
  }
  if(manifestUnavailable&&url.pathname.endsWith('/item-assets.json')){res.writeHead(503);res.end();return;}
  const file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  const runtime=file.endsWith('.runtime.json');
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':runtime?'application/json':'application/octet-stream');
  // Expire HTTP freshness immediately: force-cache must still reuse valid bytes.
  res.setHeader('Cache-Control',runtime?'public, max-age=0':'no-store');
  if(runtime){requests.push({path:url.pathname,revision:url.searchParams.get('v'),bytes:broken?2:fs.statSync(file).size});if(broken){res.end('{}');return;}}
  if(changedFloor&&file.endsWith('item-assets.json')){res.end(fs.readFileSync(file,'utf8').replace(builtInAssets['floor-blanket'].revision,floorRevision));return;}
  if(changedFloor&&file.endsWith(builtInAssets['floor-blanket'].file)){res.end(floorBytes);return;}
  if(changedBlanket&&file.endsWith('item-assets.json')){res.end(fs.readFileSync(file,'utf8').replace(builtInAssets['sofa-blanket'].revision,blanketRevision));return;}
  if(changedBlanket&&file.endsWith(builtInAssets['sofa-blanket'].file)){res.end(blanketBytes);return;}
  if(changedCushions&&file.endsWith('item-assets.json')){res.end(fs.readFileSync(file,'utf8').replace(builtInAssets['sofa-cushions'].revision,cushionRevision));return;}
  if(changedCushions&&file.endsWith(builtInAssets['sofa-cushions'].file)){res.end(cushionBytes);return;}
  if(changedSofa&&file.endsWith('item-assets.json')){res.end(fs.readFileSync(file,'utf8').replace(builtInAssets.sofa.revision,sofaRevision));return;}
  if(changedSofa&&file.endsWith(builtInAssets.sofa.file)){res.end(sofaBytes);return;}
  if(changed&&file.endsWith('item-assets.json')){res.end(fs.readFileSync(file,'utf8').replace(builtInAssets.chair.revision,changedRevision));return;}
  if(changed&&file.endsWith('chair-v1.runtime.json')){res.end(changedChair);return;}
  fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  const origin='http://127.0.0.1:'+server.address().port,context=await browser.newContext(),errors=[];
  const open=async(ctx,app)=>{const page=await ctx.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/fixture?app='+app);await page.waitForFunction(()=>typeof window.loadItems==='function');return page;};
  let page=await open(context,'first'),start=requests.length;
  const coldMs=await page.evaluate(()=>loadItems());
  assert.equal(requests.length-start,assetCount,'only one request per asset despite concurrent loading');
  const coldBytes=requests.slice(start).reduce((sum,r)=>sum+r.bytes,0);await page.close();
  page=await open(context,'unrelated-app-update');start=requests.length;
  await context.setOffline(true);
  const warmMs=await page.evaluate(()=>loadItems());
  assert.equal(requests.length-start,0,'reopening after an app version change reuses all expired cached assets, even offline');await context.setOffline(false);await page.close();
  changed=true;page=await open(context,'first');start=requests.length;await page.evaluate(()=>loadItems());
  assert.deepEqual(requests.slice(start).map(r=>path.basename(r.path)),['chair-v1.runtime.json'],'manifest-only change with the same app version fetches only that asset');await page.close();
  manifestUnavailable=true;page=await open(context,'first');start=requests.length;await page.evaluate(()=>loadItems(['chair']));assert.equal(requests.length,start,'unavailable manifest preserves the last valid revision and cached artwork');await page.close();manifestUnavailable=false;changed=false;
  changedSofa=true;page=await open(context,'first');start=requests.length;await page.evaluate(()=>loadItems(['sofa']));
  assert.deepEqual(requests.slice(start).map(r=>path.basename(r.path)),[builtInAssets.sofa.file],'same app URL loads only the revised sofa data');
  assert.equal(await page.evaluate(async()=>{const {SOFA_V1}=await import('/house-test/sofa-v1-registration.js?v=20261006-wall1');return SOFA_V1.right.source;}),'manifest-refresh-test','the rendering registration receives the downloaded data');
  await page.close();changedSofa=false;
  page=await open(context,'first');await page.evaluate(()=>loadItems(['sofa']));await page.close();
  changedCushions=true;page=await open(context,'first');start=requests.length;await page.evaluate(()=>loadItems(['sage-cushion']));
  assert.deepEqual(requests.slice(start).map(r=>path.basename(r.path)),[builtInAssets['sofa-cushions'].file],'same app URL fetches only changed cushion data');
  assert.deepEqual(await page.evaluate(async()=>{
   const {SOFA_CUSHION_SEATS}=await import('/house-test/sofa-cushion-placement.js?v=20261006-wall1');
   const {SOFA_ACCESSORY_IMAGES}=await import('/house-test/sofa-v1-registration.js?v=20261006-wall1');
   const {FURNITURE}=await import('/house-test/furniture-catalog.js?v=20261006-wall1');
   return [SOFA_CUSHION_SEATS['sage-cushion'].u,SOFA_ACCESSORY_IMAGES['sage-cushion'].center.sourceRect[0],FURNITURE['sage-cushion'].preferred.x];
  }),[1.8,1,4.42],'rendering and new-placement metadata use the downloaded cushion registration');
  await page.close();changedCushions=false;
  changedBlanket=true;page=await open(context,'first');start=requests.length;await page.evaluate(()=>loadItems(['blanket-floor']));
  assert.deepEqual(requests.slice(start).map(r=>path.basename(r.path)),[builtInAssets['sofa-blanket'].file],'same app URL fetches only changed blanket data');
  assert.equal(await page.evaluate(async()=>{const {getSofaBlanketDrape}=await import('/house-test/sofa-blanket-drape.js?v=20261006-wall1');return getSofaBlanketDrape('center').centerU;}),.82,'the renderer uses downloaded fold registration');
  await page.close();changedBlanket=false;
  page=await open(context,'first');await page.evaluate(()=>loadItems(['blanket-floor']));await page.close();
  changedFloor=true;page=await open(context,'first');start=requests.length;await page.evaluate(()=>loadItems(['blanket-floor']));
  assert.deepEqual(requests.slice(start).map(r=>path.basename(r.path)),[builtInAssets['floor-blanket'].file],'same app URL fetches only changed floor blanket data');
  assert.equal(await page.evaluate(async()=>{const {FLOOR_BLANKET_REGISTRATION}=await import('/house-test/floor-blanket-registration.js?v=20261006-wall1');return FLOOR_BLANKET_REGISTRATION.center.sourceCorners[0][0];}),267,'rendering registration uses downloaded floor corners');
  await page.close();changedFloor=false;
  // Correct URL, wrong but syntactically valid bytes: dimensions alone cannot
  // detect this stale entry. Repair it without requiring the user to retry.
  page=await open(context,'poison-cache');
  await page.evaluate(async asset=>{
   const url=new URL('/house-test/assets/'+asset.file,location.origin);url.searchParams.set('v',asset.revision);
   const cache=await caches.open('ojjuda-house-built-in-art-v1'),response=await cache.match(url.href);
   await cache.put(url.href,new Response((await response.text())+'\n',{headers:{'Content-Type':'application/json'}}));
  },builtInAssets['coffee-table']);
  start=requests.length;await page.evaluate(()=>loadItems(['coffee-table']));
  assert.deepEqual(requests.slice(start).map(r=>path.basename(r.path)),['coffee-table-v2.runtime.json'],'tampered warm cache automatically reloads only the affected artwork');await page.close();
  // A cacheable but invalid response cannot trap retries on those invalid bytes.
  const retryContext=await browser.newContext();broken=true;page=await open(retryContext,'retry');start=requests.length;
  assert.equal(await page.evaluate(async()=>{try{await loadItems(['coffee-table']);return false;}catch{return true;}}),true);
  broken=false;await page.evaluate(()=>loadItems(['coffee-table']));
  assert.equal(requests.length-start,3,'retry bypasses the malformed cached response and prepares the valid runtime');
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
  const result={coldRequests:assetCount,coldRuntimeBytes:coldBytes,warmRequests:0,warmRuntimeBytes:0,coldLocalMs:Math.round(coldMs),warmLocalMs:Math.round(warmMs),changedAssetOnly:true,malformedCacheRetry:true,tamperedWarmCacheRepaired:true,offlineArtwork:true,storageDeniedOrFullFallback:true};
  if(process.env.HOUSE_CACHE_PROOF){fs.mkdirSync(path.dirname(process.env.HOUSE_CACHE_PROOF),{recursive:true});fs.writeFileSync(process.env.HOUSE_CACHE_PROOF,JSON.stringify(result,null,2));}
  console.log('HOUSE ASSET CACHE PASS',JSON.stringify(result));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
