const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');const root=path.join(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 try{
  async function fixture(last=false){
   const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
   let hold=false,release;const waiting=new Promise(resolve=>release=resolve);
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{window.JjudaWallet={getState:()=>({ready:true,userId:null,coins:null}),subscribe:fn=>fn({ready:true,userId:null,coins:null}),refresh:async()=>{},buy:()=>{throw Error('unexpected payment')}};});
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!=='https://fixture.test'||/\/(wallet|supabase)\.js$/.test(url.pathname))return route.fulfill({body:'',contentType:'text/javascript'});
    if(url.pathname==='/korean.ttf'&&fs.existsSync('/tmp/ojjuda-visitor-proof.ttf'))return route.fulfill({path:'/tmp/ojjuda-visitor-proof.ttf'});
    const file=path.join(root,decodeURIComponent(url.pathname));
    if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
    if(last&&url.pathname.endsWith('/game-core.js'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(file,'utf8')+`;{const clean=JjudaGame.cleanProgress;JjudaGame.cleanProgress=(raw,puzzles)=>{const s=clean(raw,puzzles);s.current=s.order.at(-1);for(const i of s.order.slice(0,-1)){s.found[puzzles[i].id]=[0,1,2,3,4,5];s.rounds[puzzles[i].id]={...JjudaGame.freshRound(),status:'won'};}return s;};}`});
    if(hold&&/\.(webp|jpg|png)$/.test(url.pathname))await waiting;
    return route.fulfill({path:file,contentType:/\.js$/.test(file)?'text/javascript':undefined});
   });
   await page.goto('https://fixture.test/games/spot-difference/index.html');
   if(fs.existsSync('/tmp/ojjuda-visitor-proof.ttf'))await page.addStyleTag({content:"@font-face{font-family:ProofKR;src:url('/korean.ttf')}body,button{font-family:ProofKR,sans-serif}"});
   await page.waitForFunction(()=>!document.querySelector('#start').disabled);
   return {page,context,errors,hold:()=>hold=true,release};
  }
  async function solve(page,zoom=false){
   if(await page.locator('#start').isVisible())await page.locator('#start').click();
   if(zoom)await page.locator('#zoom').click();
   const selector=zoom?'#zoom-original':'#original';
   const spots=await page.evaluate(()=>JJUDA_PUZZLES[Number(document.querySelector('#stage-picker').value)].spots);
   for(const spot of spots){
    // Dispatch the same pointer/click coordinates used by the game's hit-test,
    // including offscreen coordinates in the scrollable zoom view.
    await page.locator(selector).evaluate((img,spot)=>{const surface=img.parentElement,r=surface.getBoundingClientRect(),init={bubbles:true,clientX:r.x+r.width*spot.x/100,clientY:r.y+r.height*spot.y/100};surface.dispatchEvent(new PointerEvent('pointerdown',init));surface.dispatchEvent(new MouseEvent('click',init));},spot);
   }
   await page.locator('#celebration[open]').waitFor();
  }
  const f=await fixture(),p=f.page;
  const before=await p.locator('#stage-picker').inputValue();
  await solve(p,true);
  assert.match(await p.locator('#celebration-title').innerText(),/축하/);
  assert.equal(await p.locator('#celebration-confetti i').count(),20);
  assert.equal(await p.locator('#zoom-dialog').evaluate(d=>d.open),false);
  assert.equal(await p.locator('#solved-total').innerText(),'1');
  assert.equal(await p.locator('#found-count').innerText(),'6');
  await p.waitForTimeout(350);
  const box=await p.locator('#celebration').boundingBox();assert.ok(box.height<500,'celebration stays compact on a phone');assert.ok(box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844);
  await p.screenshot({path:'/tmp/spot-celebration-mobile.png'});
  f.hold();
  await p.waitForFunction(before=>document.querySelector('#stage-picker').value!==before,before);
  assert.equal(await p.locator('#start').isDisabled(),true,'wait for the next picture to load');
  assert.equal(await p.locator('#time-left').innerText(),'60','loading does not consume the next round');
  f.release();await p.waitForFunction(()=>document.querySelector('#board-curtain').hidden);
  assert.equal(await p.locator('#found-count').innerText(),'0');
  assert.equal(await p.locator('#hearts .empty').count(),0);
  assert.equal(await p.locator('#celebration').evaluate(d=>d.open),false);
  assert.ok(Number(await p.locator('#time-left').innerText())>=58);
  // Cancelling a celebration must cancel its delayed navigation.
  await solve(p);const current=await p.locator('#stage-picker').inputValue();
  await p.keyboard.press('Escape');await p.waitForTimeout(2600);
  assert.equal(await p.locator('#stage-picker').inputValue(),current);
  assert.deepEqual(f.errors,[]);await f.context.close();
  const final=await fixture(true);await final.page.emulateMedia({reducedMotion:'reduce'});await solve(final.page);
  assert.match(await final.page.locator('#celebration-title').innerText(),/모든 그림/);
  assert.equal(await final.page.locator('#solved-total').innerText(),'48');
  assert.equal(await final.page.locator('#celebration-confetti').isVisible(),false);
  const last=await final.page.locator('#stage-picker').inputValue();await final.page.waitForTimeout(2600);
  assert.equal(await final.page.locator('#stage-picker').inputValue(),last,'last stage has no invalid or repeated next stage');
  await final.page.locator('#celebration-next').click();assert.equal(await final.page.locator('#celebration').evaluate(d=>d.open),false);
  assert.deepEqual(final.errors,[]);await final.context.close();
  console.log('PASS: six matches, celebration graphics, zoom completion, automatic next image, delayed loading/timer, cancellation, 48-stage completion and reduced motion');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
