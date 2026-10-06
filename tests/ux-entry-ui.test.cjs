const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),origin='https://entry.test';
let world=fs.readFileSync(path.join(root,'world.html'),'utf8').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,tag=>tag.includes('/world-park-notes.js')?tag:'').replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+'window.entryFixture={tab:()=>g.tab,guest:()=>({guest:D.parkGuest,user:D.user,online:D.online}),start:()=>om(()=>{},H)};H();'+world.slice(world.indexOf('</script>',boot));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 try{
  for(const mode of ['normal','identity-missing','account-slow','portal-missing']){
   const context=await browser.newContext({viewport:{width:390,height:844}}),errors=[];
   await context.route('**/*',route=>{
    const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
    if((mode==='identity-missing'&&url.pathname==='/signup-identity.js')||(mode==='portal-missing'&&url.pathname==='/portal.js'))return route.abort();
    if(url.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});
    const file=path.join(root,url.pathname==='/'?'index.html':url.pathname);
    return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
   });
   await context.addInitScript(mode=>{
    let user=null;const account={id:'fixture-user',user_metadata:{nickname:'테스터'}};
    window.supabase={createClient:()=>({
     auth:{onAuthStateChange(){},getSession:()=>mode==='account-slow'?new Promise(()=>{}):Promise.resolve({data:{session:user?{user}:null}}),getUser:async()=>({data:{user}}),signInWithPassword:async()=>{user=account;return{data:{session:{user}}};}},
     from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:null})})
    })};
   },mode);
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/');
   if(mode==='normal'){
    assert.equal(await page.locator('.world-feature[href*="sitemap"]').count(),0);
    await page.locator('[data-destination=home]').click();await page.locator('#auth-dialog').waitFor({state:'visible'});
    await page.locator('#email').fill('fixture@example.invalid');await page.locator('#password').fill('fixture-password');await page.locator('#auth-submit').click();
    await page.waitForURL(origin+'/world.html?tab=home');await page.waitForFunction(()=>window.entryFixture);assert.equal(await page.evaluate(()=>entryFixture.tab()),'home');
    for(const tab of ['board','my']){await page.goto(origin+'/world.html?tab='+tab);await page.waitForFunction(()=>window.entryFixture);assert.equal(await page.evaluate(()=>entryFixture.tab()),tab);}
   }else{
    await page.locator('#entry-status').waitFor({state:'visible',timeout:12000});
    assert.equal(await page.getByRole('button',{name:'다시 시도',exact:true}).isVisible(),true);
    if(mode==='identity-missing'){
     await page.locator('[data-destination=world]').click();assert.equal(await page.locator('#auth-dialog').isVisible(),true);
     await page.locator('#signup-tab').click();assert.equal(await page.locator('#auth-submit').isDisabled(),true,'missing validation code must fail closed');
     await page.locator('[data-close-dialog]').click();
    }
    await page.getByRole('link',{name:'손님으로 둘러보기',exact:true}).click();await page.waitForURL(origin+'/world.html?place=park&guest=1');
    await page.waitForFunction(()=>window.entryFixture);
    assert.equal(await page.evaluate(()=>Promise.race([entryFixture.start().then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),500))])),true,'guest entry bypasses stalled authentication');
    assert.deepEqual(await page.evaluate(()=>entryFixture.guest()),{guest:true,user:null,online:false});
   }
   assert.deepEqual(errors,[],mode+' has no unhandled runtime failure');await context.close();
  }
  console.log('PASS: direct feature routes, Home after login, missing identity/portal scripts, slow account timeout and guest recovery');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
