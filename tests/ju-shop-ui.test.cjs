const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
try{for(const width of [320,390,1280]){
 const page=await browser.newPage({viewport:{width,height:840}}),errors=[],requests=[];let coins=20,owned=[],selected={},lost=true;
 const products=[{key:'card_stickers',name:'마음 스티커',slot:'sticker',price:5,months:0},{key:'profile_flower',name:'꽃빛 테두리',slot:'frame',price:5,months:1}];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url()==='https://shop.test/'?r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><button data-ju-shop-open>상점</button><div class="field"><select id="compose-effect"></select></div><div id="card" style="position:relative"><p class="card-quote">오늘의 기록</p></div>'}):r.abort());await page.goto('https://shop.test/');
 await page.exposeFunction('shopRpc',async(name,args)=>{
  if(name==='ju_shop_state')return {data:{ok:true,coins,products,owned,selected}};
  if(name==='ju_shop_buy'){requests.push(args);assert.deepEqual(Object.keys(args),['p_product','p_request','p_verify_only']);
   if(!owned.some(x=>x.key===args.p_product)){coins-=5;owned.push({key:args.p_product,expires_at:args.p_product==='profile_flower'?new Date(Date.now()+86400000).toISOString():null});}
   await new Promise(r=>setTimeout(r,40));if(lost){lost=false;return {error:{message:'connection lost'}};}return {data:{ok:true,coins,spent:5}};
  }
  if(name==='ju_shop_equip'){selected[args.p_slot]=args.p_product;return {data:{ok:true}};}throw Error(name);
 });
 await page.addStyleTag({content:read('ju-shop.css').replace(/^@import.*\n/,'')});await page.addScriptTag({content:read('ju-shop.js')});
 await page.evaluate(()=>{
  window.shopOwner='11111111-1111-4111-8111-111111111111';window.confirm=()=>true;
  const client={rpc:(...args)=>({abortSignal:()=>shopRpc(...args)}),auth:{onAuthStateChange(fn){window.shopAuth=fn;return {data:{subscription:{unsubscribe(){}}}};}}};
  OjjudaShop.install({getUserId:()=>shopOwner,client,onUseCardDecoration:(key,owner)=>{window.usedDecoration={key,owner};return OjjudaShop.applyProduct(key);}});OjjudaShop.installComposer();
 });
 await page.locator('[data-ju-shop-open]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-shop-product]').length===2);
 await page.locator('[data-shop-product=card_stickers]').evaluate(b=>{b.click();b.click();});await page.waitForFunction(()=>document.querySelector('[data-shop-message]').textContent.includes('결과를 확인하지'));
 assert.equal(requests.length,1);assert.equal(coins,15);await page.locator('[data-shop-product=card_stickers]').click();await page.waitForFunction(()=>document.querySelector('[data-shop-product=card_stickers]').textContent==='지금 사용하기');assert.equal(requests.length,2);assert.equal(requests[0].p_request,requests[1].p_request);assert.equal(coins,15);
 assert.equal(await page.locator('.ju-shop-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
 await page.locator('[data-shop-product=card_stickers]').click();await page.waitForFunction(()=>window.usedDecoration);assert.equal(await page.locator('.ju-shop-dialog').isVisible(),false);assert.equal(await page.locator('[data-shop-style=Sticker]').inputValue(),'heart');assert.equal(requests.length,2,'using an owned item never buys it again');await page.locator('[data-ju-shop-open]').click();
 await page.locator('[data-shop-product=profile_flower]').click();await page.waitForFunction(()=>document.querySelector('[data-shop-product=profile_flower]').textContent==='사용하기');await page.locator('[data-shop-product=profile_flower]').click();await page.waitForFunction(()=>document.querySelector('[data-shop-product=profile_flower]').textContent==='적용 해제');
 await page.keyboard.press('Escape');assert.equal(await page.locator('.ju-shop-dialog').isVisible(),false);
 await page.evaluate(()=>{OjjudaShop.setStyle({shopSticker:'clover'});OjjudaShop.decorateCard(document.querySelector('#card'),OjjudaShop.styleFields());});assert.equal(await page.locator('.ju-card-sticker').textContent(),'🍀');
 await page.evaluate(()=>{OjjudaShop.decorateCard(document.querySelector('#card'),{shopFont:'book',shopFontUntil:'2000-01-01'});});assert.equal(await page.locator('#card').evaluate(n=>n.classList.contains('ju-font-book')),false);
 await page.evaluate(()=>{shopOwner=null;shopAuth('SIGNED_OUT');});await page.waitForFunction(()=>!OjjudaShop.owned('card_stickers'));await page.locator('[data-ju-shop-open]').click();assert.equal(await page.locator('[data-shop-product]').count(),0);assert.deepEqual(errors,[]);await page.close();
}console.log('PASS: mobile layouts, duplicate clicks, lost-response recovery, equip, composer sticker, expiry and sign-out');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
