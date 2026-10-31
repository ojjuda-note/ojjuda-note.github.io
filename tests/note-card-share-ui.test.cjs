const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const origin='https://card-share.test',proof=process.env.CARD_SHARE_PROOF_DIR||'/tmp/ojjuda-card-share-proof';
const source=read('note/preview.js'),boot=source.lastIndexOf('\nif (client) {\n  client.auth.onAuthStateChange');assert.ok(boot>0);
const html=read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
fs.mkdirSync(proof,{recursive:true});

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',acceptDownloads:true});
  let vendorLoads=0,failBackground=false,downloads=0;
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
   if(url.pathname==='/park/')return route.fulfill({contentType:'text/html',body:html});
   if(url.pathname==='/note/assets/189.jpg'&&failBackground)return route.fulfill({status:404,body:'missing test image'});
   if(url.pathname==='/vendor/html2canvas-1.4.1.min.js'){
    vendorLoads++;
    // Render with the shipped library. Observe only the captured subtree and
    // hold selected completions to reproduce stale asynchronous work.
    return route.fulfill({contentType:'text/javascript',body:read('vendor/html2canvas-1.4.1.min.js')+`
     window.actualHtml2Canvas=window.html2canvas;
     window.html2canvas=async function(target,options){
      const scope={text:target.textContent,privateNodes:target.querySelectorAll('.card-photo-thumb,.card-meta,.card-actions').length,
       background:getComputedStyle(target).backgroundImage};
      window.captureScopes.push(scope);
      const result=await actualHtml2Canvas(target,options);
      if(window.holdNextCapture){window.holdNextCapture=false;await new Promise(resolve=>window.releaseCapture=resolve);}
      return result;
     };`});
   }
   const file=path.resolve(root,'.'+url.pathname);
   return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
  });
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(12000);
  page.on('pageerror',error=>errors.push(error.message));page.on('download',()=>downloads++);
  await page.goto(origin+'/park/');
  await page.addStyleTag({content:'@font-face{font-family:"Jua";src:url("/assets/game-media/jua-cb995145eb03.woff2") format("woff2")}@font-face{font-family:"Noto Sans KR";src:url("/assets/game-media/jua-cb995145eb03.woff2") format("woff2");font-weight:100 900}@font-face{font-family:"Gowun Dodum";src:url("/assets/game-media/jua-cb995145eb03.woff2") format("woff2")}'});
  await page.evaluate(async()=>{
   await document.fonts.load('30px "Jua"');await document.fonts.ready;
   window.OJJUDA_CONFIG={supabaseUrl:'https://fixture.invalid',supabaseKey:'fixture'};
   const query={select:()=>query,eq:()=>query,not:()=>query,order:()=>query,contains:()=>query,lte:()=>query,gte:()=>query,or:()=>query,limit:()=>query,
    maybeSingle:async()=>({data:null}),then:resolve=>Promise.resolve({data:[]}).then(resolve)};
   window.supabase={createClient:()=>({schema:()=>({from:()=>query,rpc:async()=>({data:[]})}),from:()=>query,rpc:async()=>({data:[]})})};
   window.sharedPayloads=[];window.copiedLinks=[];window.copyAttempts=[];window.captureScopes=[];window.nativeCalls=[];window.canSharePayloads=[];
   window.filesSupported=true;window.combinedSupported=true;window.shareOutcome='success';window.clipboardOutcome='success';
   Object.defineProperty(navigator,'canShare',{configurable:true,value:data=>{
    window.canSharePayloads.push(data);
    return !!(window.filesSupported&&data.files?.length&&data.files[0] instanceof File
     &&(window.combinedSupported||!data.url&&!data.text&&!data.title));
   }});
   Object.defineProperty(navigator,'share',{configurable:true,value:data=>{
    window.nativeCalls.push('share');window.sharedPayloads.push(data);
    if(window.shareOutcome==='sync-denied')throw new DOMException('Activation expired','NotAllowedError');
    if(window.shareOutcome==='cancel')return Promise.reject(new DOMException('Canceled','AbortError'));
    if(window.shareOutcome==='denied')return Promise.reject(new DOMException('Activation expired','NotAllowedError'));
    return Promise.resolve();
   }});
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:text=>{
    window.nativeCalls.push('copy');window.copyAttempts.push(text);
    if(window.clipboardOutcome==='throw')throw new DOMException('Clipboard unavailable','NotAllowedError');
    if(window.clipboardOutcome==='denied')return Promise.reject(new DOMException('Clipboard denied','NotAllowedError'));
    if(window.clipboardOutcome==='pending')return new Promise(resolve=>{
     window.releaseClipboard=()=>{window.copiedLinks.push(text);resolve();};
    });
    window.copiedLinks.push(text);return Promise.resolve();
   }}});
  });
  await page.addScriptTag({content:read('note/share-image.js')});
  await page.addScriptTag({content:source.slice(0,boot)});
  await page.evaluate(()=>{
   const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
   window.shareCards=[
    {id:id(1),kind:'memo',body:'미소 바보',tags:['미소','일상'],background_key:'10',style:{font:'round'},display_name:'PRIVATE AUTHOR'},
    {id:id(2),kind:'comment',body:'다른 카드의 답글\n오늘도 웃어요',tags:['답글'],background_key:'24',style:{font:'round'}},
    {id:id(3),kind:'memo',body:'그림이 없는 카드',tags:['메모'],background_key:'plain',style:{font:'round'}},
    {id:id(4),kind:'event',body:'범위 제한 이벤트',tags:['이벤트'],background_key:'10',is_mine:false},
    {id:id(5),kind:'memo',body:'깨진 사진은 공유하지 않아요',tags:['검증'],background_key:'189',style:{font:'round'}}
   ].map(card=>({...card,created_at:'2026-10-31T00:00:00Z'}));
   window.deniedCards=new Set();
   noteRpc=async(name,args)=>name==='get_card'?shareCards.find(card=>card.id===args.p_id&&!deniedCards.has(card.id))||null:name==='list_cards'?shareCards:[];
   session={user:{id:'share-owner'}};authKnown=ready=true;myIdentityReady=true;
   // Only suppress unrelated account refresh requests; retain receiveAuth's
   // real epoch, cache, modal and prior-account-content cleanup.
   loadWorldBalance=loadModerator=loadNoteState=loadAccountProfile=loadMyGender=loadPhotoEntitlements=loadFeed=async()=>{};
   window.seedShareCards=()=>{
    feed.hidden=false;detail.hidden=true;list.replaceChildren();
    for(const card of shareCards){cache.set(card.id,card);list.append(cardElement(card));}
    const item=list.querySelector('article');
    const privateThumb=item.querySelector('.card-photo-thumb');privateThumb.hidden=false;privateThumb.textContent='PRIVATE ATTACHMENT';privateThumb.style.cssText='display:block;background:rgb(0,255,0);width:80px;height:80px';
    item.querySelector('.card-meta').textContent='PRIVATE AUTHOR AND DATE';item.querySelector('.card-actions').append(document.createTextNode('PRIVATE ACTIONS'));
   };
   seedShareCards();
  });
  const action=name=>page.locator(`[data-card-share-action="${name}"]`);
  const open=async n=>{await page.evaluate(id=>shareCard(id),id(n));await page.locator('#note-share-url').waitFor();};
  const ready=async()=>page.waitForFunction(()=>{const button=document.querySelector('[data-card-share-action="share"],[data-card-share-action="save"]');return button&&!button.disabled;});
  const close=()=>page.evaluate(()=>closeManagement(true));
  const count=()=>page.evaluate(()=>sharedPayloads.length);
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(vendorLoads,0,'opening the Park does not load the image renderer');

  for(const width of [320,390]){
   const copiesBeforeOpen=await page.evaluate(()=>copyAttempts.length);
   await page.setViewportSize({width,height:844});await open(1);await ready();
   assert.equal(await action('share').textContent(),'카드와 링크 공유');
   assert.equal(await page.locator('#management-backdrop .management-footer .primary').count(),1,'one main share action is emphasized');
   assert.equal(await action('share').evaluate(button=>button.classList.contains('primary')),true);
   assert.equal(await page.evaluate(()=>copyAttempts.length),copiesBeforeOpen,'opening the menu alone does not change the clipboard');
   await page.evaluate(()=>{nativeCalls=[];});
   const before=await count();await action('share').click();await page.waitForFunction(n=>sharedPayloads.length===n+1,before);
   const payload=await page.evaluate(async()=>{
    const data=sharedPayloads.at(-1),file=data.files?.[0];
    const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,colors=new Set();
    for(let i=0;i<pixels.length;i+=64)colors.add([pixels[i]>>3,pixels[i+1]>>3,pixels[i+2]>>3].join(','));
    return {name:file.name,type:file.type,size:file.size,isFile:file instanceof File,count:data.files.length,title:data.title,url:data.url,text:data.text,
     width:bitmap.width,height:bitmap.height,colors:colors.size,signature:Array.from(new Uint8Array(await file.slice(0,8).arrayBuffer())),scope:captureScopes.at(-1)};
   });
   assert.equal(payload.isFile,true);assert.equal(payload.count,1);assert.equal(payload.type,'image/png');assert.match(payload.name,/\.png$/);
   assert.deepEqual(payload.signature,[137,80,78,71,13,10,26,10]);assert.ok(payload.width>=256&&payload.height>=128&&payload.size>3000&&payload.colors>60,'a decoded PNG contains the actual photo and drawn card');
   const expectedCardUrl=origin+'/world.html?place=park&card='+id(1);
   assert.equal(payload.url,undefined,'the image payload carries its link in the caption without a duplicate URL field');
   assert.deepEqual(payload.text.split('\n'),[expectedCardUrl,'https://ojjuda.com'],'the caption starts with the actual card link and retains the requested website');
   assert.equal(await page.evaluate(()=>copiedLinks.at(-1)),expectedCardUrl,'the combined share also copies this exact card link');
   assert.deepEqual(await page.evaluate(()=>nativeCalls),['copy','share'],'copy and native share start within the same click');
   await page.waitForFunction(()=>document.querySelector('.management-message').textContent.includes('링크도 복사했어요'));
   assert.match(payload.title,/미소 바보/);assert.equal(payload.scope.privateNodes,0);assert.doesNotMatch(payload.scope.text,/PRIVATE/);
   assert.match(payload.scope.text,/미소 바보/);assert.match(payload.scope.text,/#미소/);assert.match(payload.scope.text,/#일상/);
   const bytes=await page.evaluate(async()=>Array.from(new Uint8Array(await sharedPayloads.at(-1).files[0].arrayBuffer())));
   fs.writeFileSync(path.join(proof,`shared-card-${width}.png`),Buffer.from(bytes));
   await page.screenshot({path:path.join(proof,`share-menu-${width}.png`)});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'mobile share menu fits');
   await close();
  }
  assert.equal(vendorLoads,1,'all image shares reuse the one lazily loaded vendor');

  // Manual link copy and link-only sharing remain available as secondary actions.
  await open(2);await ready();await action('copy').click();
  assert.equal(await page.evaluate(()=>copiedLinks.at(-1)),origin+'/world.html?place=park&card='+id(2));
  const beforeLink=await count();await action('link').click();await page.waitForFunction(n=>sharedPayloads.length===n+1,beforeLink);
  assert.equal(await page.evaluate(()=>sharedPayloads.at(-1).files),undefined);
  assert.equal(await page.evaluate(()=>sharedPayloads.at(-1).url),origin+'/world.html?place=park&card='+id(2));
  await action('share').click();assert.match(await page.evaluate(()=>sharedPayloads.at(-1).title),/다른 카드/);
  assert.equal(await page.evaluate(()=>sharedPayloads.at(-1).files.length),1,'a reply also shares its own image');await close();

  // Clipboard permissions or a stalled write must never consume the share gesture by being awaited.
  for(const outcome of ['pending','denied','throw']){
   await page.evaluate(value=>{clipboardOutcome=value;releaseClipboard=null;nativeCalls=[];},outcome);
   await open(1);await ready();const before=await count(),copies=await page.evaluate(()=>copiedLinks.length);
   await action('share').click();await page.waitForFunction(n=>sharedPayloads.length===n+1,before);
   assert.deepEqual(await page.evaluate(()=>nativeCalls),['copy','share'],outcome+' clipboard still starts exactly one native share');
   assert.equal(await page.evaluate(()=>copiedLinks.length),copies,'unresolved or rejected clipboard work is not reported as success');
   if(outcome==='pending'){
    assert.equal(await page.evaluate(()=>typeof releaseClipboard),'function');
    await page.evaluate(()=>releaseClipboard());
    await page.waitForFunction(()=>document.querySelector('.management-message').textContent.includes('링크도 복사했어요'));
   }else{
    await page.waitForFunction(()=>document.querySelector('.management-message').textContent.includes('링크 복사'));
    assert.doesNotMatch(await page.locator('.management-message').textContent(),/링크도 복사했어요/);
   }
   assert.equal(await action('share').isEnabled(),true);await close();
  }
  await page.evaluate(()=>{clipboardOutcome='success';});

  // A native-share exception is recoverable, including the synchronous browser API path.
  for(const outcome of ['denied','sync-denied']){
   await page.evaluate(value=>{shareOutcome=value;},outcome);
   await open(1);await ready();const before=await count();await action('share').click();
   await page.waitForFunction(n=>sharedPayloads.length===n+1,before);
   await page.waitForFunction(()=>document.querySelector('.management-message').textContent.includes('공유하지 못했어요'));
   assert.equal(await action('share').isEnabled(),true);await close();
  }
  await page.evaluate(()=>{shareOutcome='success';});

  // Some browsers accept a file alone but reject the same file with a caption.
  await page.evaluate(()=>{combinedSupported=false;canSharePayloads=[];});
  await open(1);await ready();const beforeFileOnly=await count();
  await action('share').click();await page.waitForFunction(n=>sharedPayloads.length===n+1,beforeFileOnly);
  assert.equal(await page.evaluate(()=>sharedPayloads.at(-1).files.length),1);
  assert.deepEqual(await page.evaluate(()=>Object.keys(sharedPayloads.at(-1))),['files'],'a caption-incompatible browser receives a validated file-only payload');
  assert.equal(await page.evaluate(()=>copiedLinks.at(-1)),origin+'/world.html?place=park&card='+id(1),'the fallback still preserves the card link for pasting');
  assert.equal(await page.evaluate(()=>canSharePayloads.some(data=>data.files?.length&&typeof data.text==='string'&&data.text.includes('card='))),true,'support is checked for the full intended payload');
  assert.equal(await page.evaluate(()=>canSharePayloads.some(data=>Object.keys(data).length===1&&data.files?.length)),true,'a file-only fallback is also checked before sharing');
  await close();await page.evaluate(()=>{combinedSupported=true;});

  await page.evaluate(()=>{filesSupported=false;});await open(3);await ready();
  const beforeSave=await count(),downloadEvent=page.waitForEvent('download');await action('save').click();
  const download=await downloadEvent;assert.match(download.suggestedFilename(),/\.png$/);
  const saved=fs.readFileSync(await download.path());assert.deepEqual([...saved.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(await count(),beforeSave,'unsupported file sharing offers PNG save without sending a link instead');await close();

  await page.evaluate(()=>{filesSupported=true;shareOutcome='cancel';});await open(1);await ready();
  const canceledBefore=await count(),copiesBefore=await page.evaluate(()=>copiedLinks.length),downloadsBefore=downloads;
  await action('share').click();await page.waitForFunction(n=>sharedPayloads.length===n+1,canceledBefore);await settle();
  assert.equal(await page.evaluate(()=>copiedLinks.length),copiesBefore+1,'cancel leaves the link already copied by the requested share action');
  assert.equal(await count(),canceledBefore+1,'cancel never launches another share');
  assert.equal(downloads,downloadsBefore,'cancel never downloads a file');
  assert.equal(await action('share').isEnabled(),true);await close();await page.evaluate(()=>{shareOutcome='success';});

  failBackground=true;await open(5);await action('retry').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-card-share-action="share"]:enabled,[data-card-share-action="save"]:enabled').count(),0,'a missing public background cannot silently produce a blank successful export');
  const missingCount=await count();assert.ok(await page.locator('.management-message').textContent());await close();assert.equal(await count(),missingCount);failBackground=false;
  await page.evaluate(()=>{window.originalToBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(){throw new DOMException('Tainted canvas','SecurityError');};});
  await open(1);await action('retry').waitFor({state:'visible'});assert.equal(await page.locator('[data-card-share-action="share"]:enabled,[data-card-share-action="save"]:enabled').count(),0,'CORS/tainted export fails closed');
  await close();await page.evaluate(()=>{HTMLCanvasElement.prototype.toBlob=originalToBlob;});

  // Actual canvas rendering finishes late after the menu or identity changed.
  for(const transition of ['close','other-card','logout','account']){
   await page.evaluate(()=>{session={user:{id:'share-owner'}};seedShareCards();holdNextCapture=true;releaseCapture=null;});
   await open(1);await page.waitForFunction(()=>typeof releaseCapture==='function');
   const before=await count();
   if(transition==='other-card'){await open(2);await ready();}
   else if(transition==='close')await close();
   else await page.evaluate(mode=>receiveAuth(mode==='logout'?null:{user:{id:'replacement-owner'}}),transition);
   await page.evaluate(()=>releaseCapture());await settle();
   if(transition==='other-card'){
    await action('share').click();assert.equal(await count(),before+1);assert.match(await page.evaluate(()=>sharedPayloads.at(-1).title),/다른 카드/);await close();
   }else{
    assert.equal(await page.locator('#management-backdrop').isVisible(),false,transition+' never reopens the old share dialog');
    assert.equal(await count(),before,transition+' cannot share late prior-account/card content');
   }
  }

  // A clipboard write can settle after its share dialog or signed-in account changed.
  for(const transition of ['close','other-card','logout','account']){
   await page.evaluate(()=>{session={user:{id:'share-owner'}};seedShareCards();clipboardOutcome='pending';releaseClipboard=null;});
   await open(1);await ready();const before=await count();await action('share').click();
   await page.waitForFunction(n=>sharedPayloads.length===n+1&&typeof releaseClipboard==='function',before);
   if(transition==='other-card'){await open(2);await ready();}
   else if(transition==='close')await close();
   else await page.evaluate(mode=>receiveAuth(mode==='logout'?null:{user:{id:'replacement-owner'}}),transition);
   await page.evaluate(()=>releaseClipboard());await settle();
   assert.equal(await count(),before+1,transition+' does not cause a delayed second share');
   if(transition==='other-card'){
    assert.equal(await page.locator('#note-share-url').inputValue(),origin+'/world.html?place=park&card='+id(2));
    assert.doesNotMatch(await page.locator('.management-message').textContent(),/링크도 복사했어요/,'the former card cannot overwrite the new dialog');await close();
   }else assert.equal(await page.locator('#management-backdrop').isVisible(),false,transition+' is not reopened by late clipboard completion');
  }
  await page.evaluate(()=>{clipboardOutcome='success';});
  await page.evaluate(()=>{session={user:{id:'share-owner'}};seedShareCards();});
  const captureBeforeEvent=await page.evaluate(()=>captureScopes.length),copiesBeforeEvent=await page.evaluate(()=>copyAttempts.length);await open(4);
  await page.getByRole('button',{name:'다른 앱으로 공유',exact:true}).click();
  assert.equal(await page.evaluate(()=>sharedPayloads.at(-1).files===undefined),true,'events retain link-only sharing');
  assert.equal(await page.evaluate(()=>captureScopes.length),captureBeforeEvent,'event images are never exported');
  assert.equal(await page.evaluate(()=>copyAttempts.length),copiesBeforeEvent,'location-restricted events retain their original link-only behavior');
  assert.match(await page.evaluate(()=>sharedPayloads.at(-1).url),new RegExp('card='+id(4)+'$'));
  await close();

  // Exercise Chromium's real Clipboard API as well as the failure/race fixtures.
  // Only the OS share destination stays mocked, so no message leaves the test.
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin});
  await page.evaluate(()=>{delete navigator.clipboard;});
  await page.bringToFront();
  await page.evaluate(()=>navigator.clipboard.writeText('before-card-share'));
  await open(1);await ready();const beforeRealClipboard=await count();await action('share').click();
  await page.waitForFunction(n=>sharedPayloads.length===n+1,beforeRealClipboard);
  await page.waitForFunction(()=>document.querySelector('.management-message').textContent.includes('링크도 복사했어요'));
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),origin+'/world.html?place=park&card='+id(1),'the actual browser clipboard receives the per-card URL');
  assert.equal(await count(),beforeRealClipboard+1,'real clipboard permission still opens exactly one native share');
  await close();assert.deepEqual(errors,[]);await context.close();
  console.log('PASS: combined card/caption share and automatic link copy at 320/390px; real public-card PNGs exclude private data; slow/failed clipboard and synchronous native errors recover; validated file-only and PNG-save fallbacks; cancel never resends; stale render/clipboard results stay scoped to their card and account; events retain link-only sharing.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
