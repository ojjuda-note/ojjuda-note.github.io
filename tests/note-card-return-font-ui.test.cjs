const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const source=read('note/preview.js'),boot=source.lastIndexOf('\nif (client) {\n  client.auth.onAuthStateChange');assert.ok(boot>0);
const expectBug=process.env.EXPECT_CARD_FONT_BUG==='1',proof=process.env.CARD_FONT_PROOF_DIR;
if(proof)fs.mkdirSync(proof,{recursive:true});
const html=read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of expectBug?[390]:[320,390,768,1280]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='https://card-font.test')return route.abort();if(u.pathname==='/park/')return route.fulfill({contentType:'text/html',body:html});const f=path.join(root,u.pathname);return f.startsWith(root+path.sep)&&fs.existsSync(f)&&fs.statSync(f).isFile()?route.fulfill({path:f}):route.abort();});
  await page.goto('https://card-font.test/park/');
  await page.evaluate(()=>{
   document.documentElement.classList.add('park-embedded');
   window.OJJUDA_CONFIG={supabaseUrl:'https://fixture.invalid',supabaseKey:'synthetic'};
   window.supabase={createClient:()=>({schema:()=>({from:()=>{
    const q={select:()=>q,eq:()=>q,not:()=>q,order:()=>q,contains:()=>q,lte:()=>q,gte:()=>q,or:()=>q,limit:async()=>({data:[window.fontCards.reply],error:null})};return q;
   }})})};
  });
  await page.addScriptTag({content:source.slice(0,boot)});
  await page.evaluate(async()=>{
   const card=(n,body,style={})=>({id:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),kind:'memo',body,style,tags:['오늘','함께'],background_key:'plain',created_at:'2026-10-20T22:00:00Z'});
   window.fontCards={feed:[card(1,'일 가기 싫어\n그런데\n난 백수라는게 문제'),card(2,'친구들과 함께 하루의 이야기를 나눠요. '.repeat(10).slice(0,200)),card(3,'조용한 하루의 작은 행복',{size:'large',font:'handwriting'}),card(4,'가을 산책은 참 좋아요',{size:'small'})],reply:{...card(5,'공감해요. 오늘도 잘 쉬어 가요.'),kind:'comment'}};
   noteRpc=async(name,args)=>name==='list_cards'?fontCards.feed:name==='get_card'?[...fontCards.feed,fontCards.reply].find(c=>c.id===args.p_id):[];
   positionIfAlreadyGranted=async()=>null;authKnown=ready=true;await loadFeed();
  });
  await page.addScriptTag({content:read('park/integration.js')});
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const sizes=()=>page.locator('#feed-list .card-quote').evaluateAll(nodes=>nodes.map(n=>({font:parseFloat(getComputedStyle(n).fontSize),height:n.closest('.photo').getBoundingClientRect().height,body:n.textContent})));
  await settle();const before=await sizes();assert.equal(before.length,4);assert.ok(before[0].font>12);
  if(proof&&width===390)await page.screenshot({path:path.join(proof,expectBug?'before-bug.png':'before-fixed.png'),fullPage:true});
  for(const route of expectBug?['button']:['button','browser','embedded']){
   await page.locator('#feed-list .photo-open').first().click();await page.locator('#detail-card-slot .card-quote').waitFor({state:'visible'});await settle();
   // Late photo/tag/font work must not measure the now-hidden feed as a zero-sized card.
   await page.evaluate(()=>{document.fonts.dispatchEvent(new Event('loadingdone'));window.dispatchEvent(new Event('resize'));requestTagFit();});await settle();
   if(route==='button')await page.locator('.back-button').click();
   else if(route==='browser')await page.goBack();
   else await page.evaluate(()=>OjjudaParkFull.back());
   await page.locator('#feed-list').waitFor({state:'visible'});await settle();const after=await sizes();
   if(expectBug){assert.notDeepEqual(after,before,'baseline must reproduce the reported shrinking');assert.equal(after[0].font,12);console.log('REPRODUCED: card text shrinks from '+before[0].font+'px to '+after[0].font+'px after Back');}
   else assert.deepEqual(after,before,`${width}px ${route}: every card keeps its font and photo height after returning`);
   if(proof&&width===390&&route==='button')await page.screenshot({path:path.join(proof,expectBug?'after-bug.png':'after-fixed.png'),fullPage:true});
  }
  if(!expectBug){
   // A reply opens another detail screen, then returns through the real history stack.
   await page.locator('#feed-list .photo-open').first().click();await page.locator('#reply-list .photo-open').first().waitFor();await settle();
   const parentFont=await page.locator('#detail-card-slot .card-quote').evaluate(n=>getComputedStyle(n).fontSize);
   await page.locator('#reply-list .photo-open').first().click();await page.waitForFunction(()=>document.querySelector('#detail-card-slot .card-quote').textContent.includes('공감해요'));
   await page.locator('.back-button').click();await page.waitForFunction(()=>document.querySelector('#detail-card-slot .card-quote').textContent.includes('백수'));await settle();
   assert.equal(await page.locator('#detail-card-slot .card-quote').evaluate(n=>getComputedStyle(n).fontSize),parentFont);
   await page.locator('.back-button').click();await page.locator('#feed-list').waitFor({state:'visible'});await settle();assert.deepEqual(await sizes(),before);
   // Rotating/unfolding while detail is open must match a freshly rendered list at that width.
   await page.locator('#feed-list .photo-open').first().click();await page.locator('#detail-card-slot .card-quote').waitFor({state:'visible'});
   await page.setViewportSize({width:width<600?900:390,height:900});await settle();await page.locator('.back-button').click();await page.locator('#feed-list').waitFor({state:'visible'});await settle();const resized=await sizes();
   await page.evaluate(()=>{list.replaceChildren(...fontCards.feed.map(c=>cardElement(c)));});await settle();assert.deepEqual(await sizes(),resized,'resized cached cards match fresh responsive layout and authored sizes');
   // A card inserted while hidden must not acquire a shrunken base size.
   await page.evaluate(()=>{feed.hidden=true;list.replaceChildren(...fontCards.feed.map(c=>cardElement(c)));requestTagFit();});await settle();
   await page.evaluate(()=>showFeed(false));await settle();assert.deepEqual(await sizes(),resized,'hidden creation is measured only after returning');
   assert.equal(await page.evaluate(()=>[...list.querySelectorAll('.photo')].every(photo=>!photoQuoteClipped(photo,photo.querySelector('.card-quote'),photo.querySelector('.card-tags')))),true,'all card text remains inside the card');
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 if(!expectBug)console.log('PASS: card Back preserves fonts and heights, repeated button/browser/embedded return, nested replies, late fonts, hidden insertion and responsive sizes at four widths');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
