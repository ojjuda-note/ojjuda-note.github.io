const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {chromium}=require('playwright'),root=path.join(__dirname,'..'),origin='https://poker-cards.test',read=p=>fs.readFileSync(path.join(root,p),'utf8');
const proof=process.env.GUEST_PROOF_DIR;if(proof)fs.mkdirSync(proof,{recursive:true});
const fixture=`
window.pokerFixture={show(round=1){
 ready=true;lobby=false;onlineLobby=false;mode='online';
 wallet={gold:5000,available:5000,locked:true};
 online={room:{id:'fixture',mode:'solo',round,seat:0,ready:[false,false,false,false],departed:[false,false,false,false]},busy:false,close(){}};
 const hands=[[12,25,11,24,9,22,51],[0,1,2,3,4,5,6],[13,14,15,16,17,18,19],[26,27,28,29,30,31,32]];
 game={_roomId:'fixture',_round:round,phase:'betting',street:7,turn:0,dealer:1,pot:1200,log:['히든 카드 배분'],players:hands.map((cards,i)=>({name:i?'컴퓨터 '+i:'나',cards,up:cards.slice(2,6),stack:4700,total:300,bet:0,folded:false,allIn:false,last:'체크'})),legal:()=>({need:0,call:0,maxTo:4700,minTo:50,mayRaise:true,check:true,allIn:true})};
 render({animateDeal:false});
 },paint(){render({animateDeal:false});},finish(){game.phase='finished';game.result={uncontested:false,pots:[{winners:[0]}],net:[1200,-400,-400,-400]};render({animateDeal:false});},allCards(){document.querySelector('#cards-content').innerHTML=Array.from({length:52},(_,c)=>card(c)).join('');document.querySelector('#cards-dialog').showModal();}}
`;
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 try{
  for(const before of proof?[true,false]:[false]){
   const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
   await context.route('**/*',route=>{
    const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();
    const p=u.pathname.slice(1),file=path.resolve(root,p);
    if(p==='games/poker/app.mjs')return route.fulfill({body:(before?cp.execFileSync('git',['show','HEAD:'+p],{cwd:root,encoding:'utf8'}):read(p))+fixture,contentType:'text/javascript'});
    if(before&&p==='games/poker/table-layout.css')return route.fulfill({body:cp.execFileSync('git',['show','HEAD:'+p],{cwd:root,encoding:'utf8'}),contentType:'text/css'});
    return file.startsWith(root+path.sep)&&fs.existsSync(file)?route.fulfill({path:file}):route.abort();
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/games/poker/index.html');await page.waitForFunction(()=>window.pokerFixture);
   let round=0;
   for(const viewport of before?[{width:390,height:844}]:[{width:320,height:740},{width:390,height:844},{width:844,height:390},{width:1280,height:900}]){
    await page.setViewportSize(viewport);await page.evaluate(round=>pokerFixture.show(round),++round);
    await page.waitForFunction(()=>[...document.images].every(img=>img.complete&&img.naturalWidth>0));
    if(before){await page.screenshot({path:path.join(proof,'poker-before-390.png'),fullPage:true});continue;}
    assert.equal(await page.locator('.card-index').count(),0,'the artwork has no duplicate corner overlays');
    assert.equal(await page.locator('.my-cards .final-covered').count(),1,'only the last own card begins face down');
    assert.equal(await page.locator('.my-cards .card').last().getAttribute('data-card'),'6','the seventh card is the rightmost card');
    assert.equal(await page.locator('.seat-cards .down-cards img').count(),0,'opponents hole cards stay absent');
    assert.equal(await page.locator('.my-cards [data-peek-card]').getAttribute('aria-label'),'마지막 카드 · 아래로 끌어내려 보기','hidden card name is not announced');
    assert.equal(await page.locator('.peek-face').first().evaluate(el=>getComputedStyle(el).clipPath),'inset(0px 0px 100%)');
    const measurements=await page.locator('.my-cards .card').evaluateAll(cards=>cards.map(card=>{const r=card.getBoundingClientRect(),img=card.querySelector('img'),ir=img.getBoundingClientRect();return {w:r.width,h:r.height,iw:ir.width,ih:ir.height};}));
    assert.ok(measurements.every(m=>Math.abs(m.w/m.h-5/7)<.02&&Math.abs(m.w-m.iw)<1&&Math.abs(m.h-m.ih)<1),'SVG fits the card without distortion at '+viewport.width);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal overflow');
    if(proof)await page.screenshot({path:path.join(proof,`poker-covered-${viewport.width}.png`),fullPage:true});
    const last=page.locator('.my-cards [data-peek-card]');await last.scrollIntoViewIfNeeded();
    const rect=await last.boundingBox(),x=rect.x+rect.width*.6,y=rect.y+rect.height*.3;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+8);await page.mouse.up();
    assert.equal(await page.locator('.my-cards [data-peek-card]').count(),1,'short drag stays face down');
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y-30);await page.mouse.up();
    assert.equal(await page.locator('.my-cards [data-peek-card]').count(),1,'upward drag does not open it');
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+35,{steps:6});
    assert.notEqual(await page.locator('.my-cards .peek-face').evaluate(el=>getComputedStyle(el).clipPath),'inset(0px 0px 100%)','drag gradually uncovers the artwork');
    if(proof&&viewport.width===390)await page.screenshot({path:path.join(proof,'poker-dragging-390.png'),fullPage:true});
    await page.mouse.move(x,y+55,{steps:3});await page.mouse.up();
    assert.equal(await page.locator('.my-cards [data-peek-card]').count(),0,'downward drag reveals it');
    assert.equal(await page.locator('.my-cards [data-card="6"]').getAttribute('aria-label'),'A♠');
    assert.equal(await page.locator('.my-cards .final-cards').evaluate(el=>getComputedStyle(el).opacity),'1','the revealed final card stays fully opaque');
    assert.equal(await page.locator('.my-cards .private-cards').evaluate(el=>getComputedStyle(el).opacity),'0.5','opening private cards keep their half opacity');
    await page.evaluate(()=>pokerFixture.paint());assert.equal(await page.locator('.my-cards [data-peek-card]').count(),0,'poll/repaint preserves the reveal');
    await page.evaluate(round=>pokerFixture.show(round),++round);assert.equal(await page.locator('.my-cards [data-peek-card]').count(),1,'next round resets the cover even if the card matches');
    await page.locator('[data-seat="0"]').click();assert.equal(await page.locator('#cards-content [data-peek-card]').count(),1,'zoom does not bypass the cover');
    await page.locator('#cards-content [data-peek-card]').press('ArrowDown');assert.equal(await page.locator('#cards-content [data-peek-card]').count(),0,'keyboard reveal works in zoom');
    await page.locator('#cards-dialog [data-close-dialog]').click();assert.equal(await page.locator('.my-cards [data-peek-card]').count(),0);
    if(viewport.width===390){
     await page.evaluate(round=>pokerFixture.show(round),++round);
     const touchCard=page.locator('.my-cards [data-peek-card]');await touchCard.scrollIntoViewIfNeeded();
     const r=await touchCard.boundingBox(),touch=await context.newCDPSession(page),point={id:1,x:r.x+r.width*.6,y:r.y+r.height*.25},scroll=await page.evaluate(()=>scrollY);
     await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
     await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,y:point.y+60}]});
     await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     assert.equal(await page.locator('.my-cards [data-peek-card]').count(),0,'a real touch drag reveals the seventh card');
     assert.equal(await page.evaluate(()=>scrollY),scroll,'the gesture never scrolls the table');await touch.detach();
    }
    await page.evaluate(round=>pokerFixture.show(round),++round);await page.evaluate(()=>pokerFixture.finish());assert.equal(await page.locator('.my-cards [data-peek-card]').count(),0,'showdown reveals the last card');
   }
   if(!before){
    await page.evaluate(()=>pokerFixture.allCards());await page.waitForFunction(()=>[...document.querySelectorAll('#cards-content img')].every(img=>img.complete&&img.naturalWidth>0));
    assert.equal(await page.locator('#cards-content img').count(),52,'all 52 original SVG faces load');
    await page.locator('#cards-dialog [data-close-dialog]').click();
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(round=>pokerFixture.show(round),++round);
    const movingLast=page.locator('.my-cards [data-peek-card]'),lastBox=await movingLast.boundingBox();
    await page.mouse.move(lastBox.x+lastBox.width*.6,lastBox.y+lastBox.height*.3);
    await page.mouse.down();await page.mouse.move(lastBox.x+lastBox.width*.6,lastBox.y+lastBox.height*.3+55,{steps:6});await page.mouse.up();
    await movingLast.waitFor({state:'detached'});
    assert.equal(await page.locator('.my-cards .card').last().getAttribute('aria-label'),'A♠','animated reveal finishes on the correct rightmost card');
    assert.equal(await page.locator('.my-cards .card').last().evaluate(el=>getComputedStyle(el).transform),'none','revealed cards do not jump up under the pointer');
    assert.deepEqual(errors,[]);
   }
   await context.close();
  }
  console.log('PASS: original SVG faces fit at four viewports; seventh card covered, downward reveal, short/upward cancellation, poll persistence, next-round reset, zoom/keyboard parity, private opponent cards and all 52 artwork assets');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
