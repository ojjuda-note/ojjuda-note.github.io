const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const source=read('note/preview.js'),boot=source.lastIndexOf('\nif (client) {\n  client.auth.onAuthStateChange');assert.ok(boot>0);
const expectBug=process.env.EXPECT_CARD_FONT_BUG==='1',proof=process.env.CARD_FONT_PROOF_DIR;
if(proof)fs.mkdirSync(proof,{recursive:true});
const html=read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
async function checkReplyBrowsing(page) {
 const rail=page.locator('#reply-list'),cards=rail.locator('.reply-card');
 await page.evaluate(async()=>{
  window.replyRequests=[];
  window.testReplies=Array.from({length:32},(_,i)=>({...fontCards.reply,
   id:'00000000-0000-4000-8000-'+String(100-i).padStart(12,'0'),body:'답글 '+(100-i)}));
  await loadReplies(stack.at(-1),detailRun);
 });
 assert.equal(await cards.count(),30);
 await rail.scrollIntoViewIfNeeded();
 const bounds=await rail.boundingBox(),first=await cards.first().boundingBox(),second=await cards.nth(1).boundingBox();
 assert.equal(Math.round(first.x),Math.round(bounds.x));
 assert.equal(first.y,second.y);
 assert.ok(second.x>=first.x+first.width&&second.x<bounds.x+bounds.width,'the next reply peeks in from the right');
 const x=first.x+first.width*.8,y=first.y+first.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-110,y,{steps:8});await page.mouse.up();
 assert.ok(await rail.evaluate(el=>el.scrollLeft)>90,'dragging a photo with the mouse reveals older replies');
 assert.ok(await page.locator('#detail-card-slot .card-quote').textContent().then(text=>text.includes('백수')),'drag does not open a reply');
 await page.mouse.move(x-110,y);await page.mouse.down();await page.mouse.move(x,y,{steps:8});await page.mouse.up();
 assert.ok(await rail.evaluate(el=>el.scrollLeft)<2,'dragging right returns to the newest reply');
 const touch=await page.context().newCDPSession(page);
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let i=1;i<=6;i++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*18,y}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(()=>replies.scrollLeft>30);
 await touch.detach();
 await rail.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
 await page.waitForFunction(()=>replies.querySelectorAll('.reply-card').length===32);
 const requests=await page.evaluate(()=>replyRequests);
 assert.deepEqual(requests.map(r=>r.orders),Array(2).fill([['created_at',false],['id',false]]));
 assert.equal(requests[1].after,'created_at.lt.2026-10-20T22:00:00Z,and(created_at.eq.2026-10-20T22:00:00Z,id.lt.00000000-0000-4000-8000-000000000071)');
 assert.equal(await cards.last().locator('.card-quote').textContent(),'답글 69');
 await page.evaluate(async()=>{delete window.testReplies;await loadReplies(stack.at(-1),detailRun);});
 assert.equal(await rail.evaluate(el=>el.scrollLeft),0);
}
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of expectBug?[390]:[320,390,768,1280]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===390}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='https://card-font.test')return route.abort();if(u.pathname==='/park/')return route.fulfill({contentType:'text/html',body:html});const f=path.join(root,u.pathname);return f.startsWith(root+path.sep)&&fs.existsSync(f)&&fs.statSync(f).isFile()?route.fulfill({path:f}):route.abort();});
  await page.goto('https://card-font.test/park/');
  await page.evaluate(()=>{
   document.documentElement.classList.add('park-embedded');
   window.OJJUDA_CONFIG={supabaseUrl:'https://fixture.invalid',supabaseKey:'synthetic'};
   window.supabase={createClient:()=>({schema:()=>({from:()=>{
    const orders=[];let after;
    const q={select:()=>q,eq:()=>q,not:()=>q,contains:()=>q,lte:()=>q,gte:()=>q,
     order:(key,options)=>{orders.push([key,options.ascending]);return q;},or:value=>{after=value;return q;},
     limit:async size=>{
      if(!window.testReplies)return {data:[window.fontCards.reply],error:null};
      window.replyRequests.push({orders,after,size});
      return {data:after?window.testReplies.slice(size):window.testReplies.slice(0,size),error:null};
     }};return q;
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
  const sizes=()=>page.locator('#feed-list .card-quote').evaluateAll(nodes=>nodes.map(n=>({font:parseFloat(getComputedStyle(n).fontSize),height:n.closest('.photo').getBoundingClientRect().height,width:n.closest('.photo').getBoundingClientRect().width,body:n.textContent})));
  await settle();const before=await sizes();assert.equal(before.length,4);assert.ok(before[0].font>12);
  if(!expectBug)assert.ok(before.every(card=>Math.abs(card.height-card.width*.75)<1&&card.width<=601),width+'px: feed faces have the same 4:3 ratio');
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
   const replyPanel=await page.locator('#detail .replies').evaluate(panel=>({
    background:getComputedStyle(panel).backgroundColor,
    padding:getComputedStyle(panel).paddingInlineStart
   }));
   assert.deepEqual(replyPanel,{background:'rgba(0, 0, 0, 0)',padding:'0px'});
   const faces=await page.locator('#detail article').evaluateAll(cards=>cards.map(card=>{
    const box=selector=>card.querySelector(selector).getBoundingClientRect();
    const photo=box('.photo'),author=box('.card-meta'),quote=box('.card-quote'),tags=box('.card-tags');
    return {
     width:photo.width,height:photo.height,
     footer:card.getBoundingClientRect().bottom-photo.bottom,
     textFits:author.bottom<=quote.top&&quote.bottom<=tags.top,
     buttonsFit:[...card.querySelectorAll('.card-actions button')].every(button=>{
      const rect=button.getBoundingClientRect();
      return rect.width>=44&&rect.height>=44&&rect.left>=photo.left-1&&rect.right<=photo.right+1&&
       rect.top>=photo.top-1&&rect.bottom<=photo.bottom+1&&(rect.bottom<=quote.top||rect.top>=tags.bottom);
     })
    };
   }));
   assert.equal(faces.length,2);
   assert.ok(faces.every(face=>Math.abs(face.height-face.width*.75)<1),width+'px: original and reply are both 4:3');
   assert.ok(faces[0].width<=601&&faces[0].width>=(width>=1280?550:0),'original grows up to the desktop cap');
   assert.ok(Math.abs(faces[1].width-faces[0].width*2/3)<1,`${width}px: replies are two thirds of the parent card width`);
   assert.ok(faces.every(face=>Math.abs(face.footer)<1&&face.buttonsFit&&face.textFits),`${width}px: photo, text and controls fit without a footer`);
   if(width===390)await checkReplyBrowsing(page);
   const full=page.locator('#detail-card-slot .note-full-body');
   await full.evaluate(el=>{el.hidden=false;el.open=true;});
   const actionBottom=await page.locator('#detail-card-slot .card-actions').evaluate(el=>el.getBoundingClientRect().bottom);
   const photoBottom=await page.locator('#detail-card-slot .photo').evaluate(el=>el.getBoundingClientRect().bottom);
   assert.ok(Math.abs(actionBottom-photoBottom)<1,'opening the full text keeps the controls on the photograph');
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
   const longText=Array(60).fill('한 줄').join('\n');
   await page.evaluate(body=>{fontCards.feed[0].body=body;},longText);
   await page.locator('#feed-list .photo-open').first().click();
   const disclosure=page.locator('#detail-card-slot .note-full-body');
   await disclosure.locator('summary').click();
   assert.equal(await disclosure.locator('p').textContent(),longText,'all lines can be read below the fixed face');
   const fixed=await page.locator('#detail-card-slot .photo').boundingBox();
   assert.ok(Math.abs(fixed.height-fixed.width*.75)<1,'opening long text keeps the photograph 4:3');
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 if(!expectBug)console.log('PASS: card Back preserves fonts and heights, repeated button/browser/embedded return, nested replies, late fonts, hidden insertion and responsive sizes at four widths');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
