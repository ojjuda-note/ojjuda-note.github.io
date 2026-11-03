/* Keep production documents, boot, lazy loading and game/lifecycle handlers
   intact. Only the account/data service boundary is replaced; no live account
   is read and no score or other application data is written. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),origin='https://guest-boot.test';
const trialKey='ojjuda.guest-round-completed.v1';
const sdk=`(()=>{
 let sequence=0;
 const reply=data=>({data,error:null});
 const query=()=>{let single=false;const q={
  select(){return q;},eq(){return q;},in(){return q;},order(){return q;},limit(){return q;},
  maybeSingle(){single=true;return q;},single(){single=true;return q;},
  then(resolve,reject){return Promise.resolve(reply(single?null:[])).then(resolve,reject);}
 };return q;};
 window.supabase={createClient(){const id=++sequence;return {
  auth:{
   onAuthStateChange(callback){let live=true;queueMicrotask(()=>{if(live){console.debug('GUEST_TRACE auth INITIAL_SESSION '+id);callback('INITIAL_SESSION',null);}});return {data:{subscription:{unsubscribe(){live=false;}}}};},
   async getSession(){console.debug('GUEST_TRACE auth getSession null '+id);return reply({session:null});},
   async getUser(){return reply({user:null});},async signOut(){return {error:null};}
  },
  from:query,
  rpc(name,args){console.debug('GUEST_TRACE rpc '+name);const data=name==='submit_guest_game_score'?{ok:true,best:args.p_score,guest:true}:[];
   const request=Promise.resolve(reply(data));request.abortSignal=()=>request;return request;},
  channel(){const channel={on(){return channel;},subscribe(){return channel;},unsubscribe:async()=>{},track:async()=>{},send:async()=>{},presenceState:()=>({})};return channel;},
  removeChannel:async()=>{},removeAllChannels:async()=>{},
  functions:{invoke:async()=>reply(null)},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}})})}
 };}};
})();`;

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const missingScripts=[],errors=[],documents=[],trace=[];
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('@supabase/supabase-js'))return route.fulfill({contentType:'text/javascript',body:sdk});
   if(url.origin!==origin)return route.abort();
   const file=path.resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
    if(route.request().resourceType()==='script')missingScripts.push(url.pathname);
    return route.fulfill({status:404,body:'Missing test resource'});
   }
   // Serve the exact repository bytes, including world.html and index.html.
   return route.fulfill({path:file});
  });
  await context.addInitScript(()=>{
   const emit=(event,detail={})=>console.debug('GUEST_TRACE '+JSON.stringify({event,path:location.pathname+location.search,history:history.state,game:!!document.getElementById('gov'),...detail}));
   for(const type of ['pagehide','pageshow','popstate','beforeunload'])addEventListener(type,event=>emit(type,{persisted:event.persisted}),{capture:true});
   document.addEventListener('visibilitychange',()=>emit('visibilitychange',{hidden:document.hidden}),{capture:true});
   // Observe calls without changing their return values, targets or timing.
   for(const method of ['back','pushState','replaceState']){
    const original=history[method];
    history[method]=function(...args){emit('history.'+method,{target:args[2]});return Reflect.apply(original,this,args);};
   }
   addEventListener('DOMContentLoaded',()=>{
    let last;
    const inspect=()=>{const next=[!!document.getElementById('gov'),document.body.classList.contains('gaming'),!!document.querySelector('#gov .game-result-card')];
     if(String(next)!==String(last)){last=next;emit('game-dom',{overlay:next[0],gaming:next[1],result:next[2]});}};
    new MutationObserver(inspect).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});inspect();
   },{once:true});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('console',message=>{const text=message.text();if(text.startsWith('GUEST_TRACE ')){trace.push(text);console.log(text);}});
  page.on('pageerror',error=>{errors.push(error.message);console.error('GUEST_PAGE_ERROR '+error.message);});
  page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame()){documents.push(request.url());console.log('GUEST_DOCUMENT '+request.url());}});
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())console.log('GUEST_COMMIT '+frame.url());});
  try{
   await page.goto(origin+'/world.html?tab=arcade');
   await page.locator('.arcade-home').waitFor();
   assert.equal(new URL(page.url()).searchParams.has('guest'),false,'production account boot selects guest mode without a forced guest route');
   assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),trialKey),null,'the fresh browser has not used its round');
   assert.equal(await page.locator('[data-arcade-adult]').count(),0,'the actual guest catalog excludes adult games');
   await page.locator('[data-act="game-open"][data-v="runner"]').click();
   await page.locator('#gov[data-game="runner"] .runner-card').waitFor();
   assert.equal(await page.evaluate(()=>typeof window.OjjudaRunnerGame?.create),'function','the production lazy loader loads the real Runner engine');
   await page.locator('#gov [data-g="start"]').click();
   await page.waitForFunction(()=>history.state?.ojjudaWorld==='menu');
   console.log('CHECK: naturally lose Runner; no further user input is sent');
   // No direct end callback, game clock advance, timer replacement, replay,
   // simulated pagehide or manual login navigation is permitted in this path.
   await page.waitForFunction(key=>sessionStorage.getItem(key)==='1',trialKey,{timeout:30000});
   await page.locator('#gov .game-result-card').waitFor();
   await page.locator('#auth-dialog[open]').waitFor({timeout:15000});
   assert.equal(new URL(page.url()).pathname,'/','automatic completion commits the actual portal document');
   assert.equal(new URL(page.url()).searchParams.get('next'),'world','login preserves the arcade return destination');
   assert.equal(await page.locator('#login-tab').getAttribute('aria-selected'),'true');
   assert.equal(await page.locator('#signup-tab').getAttribute('aria-selected'),'false');
   assert.equal(await page.locator('#email').isVisible(),true);
   assert.equal(await page.locator('#password').isVisible(),true);
   assert.equal(await page.locator('.password-confirm-field').isVisible(),false);
   assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),trialKey),'1','page navigation preserves the consumed guest round');
   assert.ok(documents.some(value=>new URL(value).pathname==='/'&&new URL(value).searchParams.get('auth')==='login'),'the timer requests login without a second click');
   assert.ok(trace.some(value=>value.includes('auth INITIAL_SESSION')),'real account initialization notifications are included');
   assert.deepEqual(missingScripts,[],'every production script required by this flow is served');
   assert.deepEqual(errors,[],'the full application boot and portal have no uncaught errors');
   console.log('PASS: untouched World boot at tab=arcade, real lazy Runner and natural loss automatically reach the untouched portal login; no second click.');
  }catch(error){
   console.error('GUEST_FAILURE_STATE '+JSON.stringify(await page.evaluate(key=>({url:location.href,history:history.state,trial:sessionStorage.getItem(key),game:!!document.getElementById('gov'),gaming:document.body.classList.contains('gaming'),login:!!document.querySelector('#auth-dialog[open]'),scripts:[...document.scripts].map(script=>script.src).filter(src=>/guest-access|world-navigation|runner-game|portal\.js/.test(src))}),trialKey).catch(()=>({url:page.url()}))));
   console.error('GUEST_MISSING_SCRIPTS '+JSON.stringify(missingScripts));throw error;
  }finally{await context.close();}
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
