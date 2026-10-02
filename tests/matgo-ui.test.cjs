const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),member='00000000-0000-4000-8000-000000000001';
(async()=>{
 const {verifyRound}=await import('../supabase/functions/matgo/verify.mjs');
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.MATGO_CHROMIUM?{executablePath:process.env.MATGO_CHROMIUM}:{})});
 async function fixture(options={}){
  const state={age:19,gold:5000,freeUsed:0,coins:20,user:member,requests:[],...options};
  const context=await browser.newContext({viewport:{width:390,height:820}});const errors=[];
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await context.exposeBinding('matgoFixture',async(_,body)=>{
    state.requests.push(body);
    if(body.action==='auth')return{data:{user:state.user?{id:state.user}:null}};
    if(body.action==='identity')return{data:state.age===null?null:{age:state.age,locked:true}};
    const snapshot=()=>({ok:true,gold:state.gold,coins:state.coins,free_left:2-state.freeUsed,round:state.round||null});
    if(body.action==='status')return{data:snapshot()};
    if(body.action==='start'){
      if(!state.gold)return{data:{error:'gold_empty'}};
      state.round ||= {id:'00000000-0000-4000-9000-000000000001',seed:9,gold:state.gold,first:0,carry:1};return{data:snapshot()};
    }
    if(body.action==='refill'){
      if(state.freeUsed<2)state.freeUsed++;else{if(!body.paid)return{data:{error:'paid_confirmation_required'}};if(state.coins<5)return{data:{error:'insufficient_zzu'}};state.coins-=5;}
      state.gold=5000;return{data:snapshot()};
    }
    if(body.action==='settle'){
      const result=await verifyRound(state.round,body.actions);state.gold=result.gold;state.settled=true;return{data:snapshot()};
    }
    throw Error('unexpected fixture call');
  });
  await context.addInitScript(()=>{
    try{localStorage.setItem('ojjuda-matgo-sound','off');}catch{}
    window.OJJUDA_CONFIG={supabaseUrl:'https://mock.invalid',supabaseKey:'test-public'};
    const client={auth:{getUser:()=>matgoFixture({action:'auth'}),onAuthStateChange:cb=>{window.authCallback=cb;return{data:{subscription:{unsubscribe(){}}}};}},
      rpc:()=>matgoFixture({action:'identity'}),functions:{invoke:(_name,{body})=>matgoFixture(body)}};
    window.supabase={createClient:()=>client};
    const timeout=window.setTimeout.bind(window);window.setTimeout=(fn,delay,...args)=>timeout(fn,delay<5000?Math.min(delay,15):delay,...args);
    const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){return animate.call(this,frames,typeof options==='object'?{...options,duration:5,delay:0}:5);};
  });
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!=='https://fixture.test')return route.fulfill({status:200,contentType:'text/javascript',body:''});
    let file=path.join(root,decodeURIComponent(url.pathname));
    if(url.pathname==='/world.html'){
      let html=fs.readFileSync(file,'utf8').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'').replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
      html=html.replace('<script type="module">',`<script>${['world-places.js','matgo-access.js','matgo-bridge.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')}</script><script type="module">`);
      const boot=html.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
      html=html.slice(0,boot)+`window.placeTest={enter:xf,render:H,freeze(){clearInterval(g.placeT);g.placeT=null;}};g.tab='home';H();`+html.slice(html.indexOf('</script>',boot));
      return route.fulfill({contentType:'text/html',body:html});
    }
    if(url.pathname==='/games/matgo.html'){
      let html=fs.readFileSync(file,'utf8').replace('startRound();\n})();','window.matgoTest={game,ui,pick:onPick};\nstartRound();\n})();');
      return route.fulfill({contentType:'text/html',body:html});
    }
    if(url.pathname==='/config.js')return route.fulfill({contentType:'text/javascript',body:''});
    if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({path:file,contentType:/\.(mjs|js)$/.test(file)?'text/javascript':undefined});
  });
  return{context,state,errors,page:await context.newPage()};
 }
 try{
  for(const options of [{age:18},{age:null},{user:null}]){
    const f=await fixture(options);await f.page.goto('https://fixture.test/games/matgo.html?adult=true&age=30');
    await f.page.waitForSelector('#matgo-retry:not([hidden])');assert.equal(await f.page.locator('.hand.me').count(),0);
    assert.equal(f.state.requests.some(r=>r.action==='start'||r.action==='status'),false);assert.deepEqual(f.errors,[]);await f.context.close();
  }
  const f=await fixture();await f.page.goto('https://fixture.test/games/matgo.html');
  await f.page.waitForFunction(()=>window.matgoTest&&!matgoTest.ui.busy&&!matgoTest.game.over);
  assert.match(await f.page.locator('#money').textContent(),/5,000 골드/);
  await f.page.locator('#rules').click();assert.match(await f.page.locator('.modal').textContent(),/자뻑.*피 2장/);assert.match(await f.page.locator('.modal').textContent(),/5쭈/);
  await f.page.locator('.modal button').last().click();
  for(const width of [320,390,768]){await f.page.setViewportSize({width,height:820});assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await f.page.setViewportSize({width:390,height:820});
  await f.page.screenshot({path:'/tmp/matgo-gold-verified.png'});
  for(let i=0;i<800&&!f.state.settled;i++){
    await f.page.evaluate(()=>{
      const modal=document.querySelector('.modal');if(modal){(modal.querySelector('#stop')||modal.querySelector('#n')||modal.querySelector('button'))?.click();return;}
      const t=window.matgoTest;if(t.ui.resolveChoose){document.querySelector('.stack.pick')?.click();return;}
      if(!t.ui.busy&&!t.game.over&&t.game.turn===0){const card=t.game.hand[0][0];if(card)void t.pick(card.id);else document.querySelector('#bombFlip')?.click();}
    });
    await f.page.waitForTimeout(20);
  }
  assert.equal(f.state.settled,true,'a real UI round settles against the server replay engine');assert.ok(f.state.gold>=0);assert.deepEqual(f.errors,[]);await f.context.close();
  for(const options of [{gold:0,freeUsed:0},{gold:0,freeUsed:2},{gold:0,freeUsed:2,coins:4}]){
    const f=await fixture(options);await f.page.goto('https://fixture.test/games/matgo.html');await f.page.waitForSelector('#refill-gold');
    assert.match(await f.page.locator('#refill-gold').textContent(),options.freeUsed<2?/무료/:/5쭈/);await f.page.locator('#refill-gold').click();
    if(options.coins===4){await f.page.waitForSelector('#gold-error');assert.match(await f.page.locator('#gold-error').textContent(),/부족/);assert.equal(f.state.gold,0);}
    else{await f.page.waitForFunction(()=>document.querySelector('#money')?.textContent.includes('5,000'));assert.equal(f.state.gold,5000);assert.equal(f.state.coins,options.freeUsed<2?20:15);}
    assert.equal(f.state.requests.filter(r=>r.action==='refill').length,1);assert.deepEqual(f.errors,[]);await f.context.close();
  }
  for(const age of [18,19]){
    const f=await fixture({age});await f.page.goto('https://fixture.test/world.html');await f.page.waitForFunction(()=>window.placeTest);
    await f.page.evaluate(async()=>{try{await OjjudaMatgoAccess.check();}catch{}placeTest.enter('arcade',1);placeTest.freeze();});
    assert.equal(await f.page.locator('[data-act="matgo-open"]').count(),age>=19?1:0);
    if(age<19){await f.page.evaluate(()=>openMatgo());assert.equal(await f.page.locator('#matgo-overlay').count(),0);}
    else{
      await f.page.locator('[data-act="matgo-open"]').click();await f.page.waitForSelector('#matgo-overlay iframe');
      await f.page.frameLocator('#matgo-overlay iframe').locator('#money').waitFor();
      await f.page.evaluate(()=>authCallback('SIGNED_OUT',null));assert.equal(await f.page.locator('#matgo-overlay').count(),0);assert.equal(await f.page.locator('[data-act="matgo-open"]').count(),0);
    }
    assert.deepEqual(f.errors,[]);await f.context.close();
  }
  console.log('PASS: direct-link denial, hidden minor button, adult arcade entry, mobile layout, real game settlement, free/paid refill UI, insufficient 쭈 and logout');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
