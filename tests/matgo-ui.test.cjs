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
      state.round ||= {id:'00000000-0000-4000-9000-000000000001',seed:state.seed??10,gold:state.gold,first:0,carry:1};return{data:snapshot()};
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
      let html=fs.readFileSync(file,'utf8').replace('startRound();\n})();','window.matgoTest={game,ui,pick:onPick,render,CARDS};\nstartRound();\n})();');
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
  for(const decision of ['win','continue']){
    const f=await fixture({seed:9});await f.page.goto('https://fixture.test/games/matgo.html');
    await f.page.waitForSelector('#chongtong-win');assert.match(await f.page.locator('.modal').textContent(),/총통/);
    assert.equal(await f.page.locator('.chongtong-cards svg').count(),4);
    await f.page.setViewportSize({width:320,height:660});assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await f.page.locator('#chongtong-'+decision).click();
    if(decision==='win'){
      await f.page.waitForSelector('.sc');assert.equal(f.state.gold,5700);assert.match(await f.page.locator('.sc').textContent(),/총통7점/);
      assert.equal(f.state.requests.find(r=>r.action==='settle').rules_version,3);
    }else{
      await f.page.waitForFunction(()=>!matgoTest.ui.busy);assert.equal(f.state.settled,undefined);
      assert.equal(await f.page.evaluate(()=>matgoTest.game.over),false);assert.equal(await f.page.locator('.hand.me .c.ok').count(),10);
    }
    assert.deepEqual(f.errors,[]);await f.context.close();
  }
  {
    const f=await fixture({seed:77});await f.page.goto('https://fixture.test/games/matgo.html');
    await f.page.waitForSelector('.sc');assert.equal(f.state.gold,4300);assert.match(await f.page.locator('.sc').textContent(),/총통7점/);assert.deepEqual(f.errors,[]);await f.context.close();
  }
  for(const [seed,card,delta] of [[11,40,300],[2,37,-300]]){
    const f=await fixture({seed});await f.page.goto('https://fixture.test/games/matgo.html');await f.page.waitForFunction(()=>window.matgoTest&&!matgoTest.ui.busy);
    await f.page.evaluate(()=>{
      window.firstPpukEvents=[];
      new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&node.classList.contains('banner')&&node.textContent.includes('첫뻑'))firstPpukEvents.push(node.textContent);}).observe(document.body,{childList:true});
    });
    await f.page.locator(`#handMe .c[data-id="${card}"]`).click();
    for(let i=0;i<300;i++){
      const ready=await f.page.evaluate(()=>{
        const {ui,game:g}=matgoTest;
        if(ui.resolveChoose){const value=c=>c.k==='gwang'?6:c.k==='yul'?3:c.k==='tti'?3:c.k==='ssang'?3:1;const ids=g.floor.map((s,i)=>[s,i]).filter(([s])=>ui.chooseStacks.has(s)).map(([,i])=>i);ui.resolveChoose(ids.reduce((a,b)=>value(g.floor[a][0])>=value(g.floor[b][0])?a:b));}
        document.querySelector('.modal #y')?.click();
        return !ui.busy&&firstPpukEvents.length>0;
      });
      if(ready)break;await f.page.waitForTimeout(20);
    }
    assert.equal(await f.page.evaluate(()=>!matgoTest.ui.busy&&firstPpukEvents.length>0),true,`opening event completed for seed ${seed}`);
    assert.match(await f.page.locator('#goldPending').textContent(),delta>0?/첫뻑 \+300골드.*판 종료/:/첫뻑 -300골드.*판 종료/);
    assert.match((await f.page.evaluate(()=>firstPpukEvents)).join(' '),/첫뻑!.*300골드.*판 종료 시 정산/);
    assert.match(await f.page.locator('#money').textContent(),/5,000 골드/);assert.equal(f.state.gold,5000);
    assert.equal(f.state.requests.some(r=>r.action==='settle'),false,'opening event never sends a payout');
    await f.page.reload();await f.page.waitForFunction(()=>window.matgoTest&&!matgoTest.ui.busy);
    assert.equal(await f.page.locator('#goldPending').isHidden(),true);assert.equal(f.state.gold,5000);
    assert.equal(f.state.requests.some(r=>r.action==='settle'),false,'leaving an unfinished round does not pay');
    assert.deepEqual(f.errors,[]);await f.context.close();
  }
  {
    const f=await fixture({seed:11});await f.page.goto('https://fixture.test/games/matgo.html');await f.page.waitForFunction(()=>window.matgoTest);
    for(let i=0;i<1200&&!f.state.settled;i++){
      await f.page.evaluate(()=>{
        const modal=document.querySelector('.modal');if(modal){(modal.querySelector('#stop')||modal.querySelector('#n')||modal.querySelector('button'))?.click();return;}
        const t=matgoTest;if(t.ui.resolveChoose){document.querySelector('.stack.pick')?.click();return;}
        if(!t.ui.busy&&!t.game.over&&t.game.turn===0){if(t.game.hand[0][0])void t.pick(t.game.hand[0][0].id);else document.querySelector('#bombFlip')?.click();}
      });
      await f.page.waitForTimeout(20);
    }
    assert.equal(f.state.settled,true);assert.equal(f.state.requests.filter(r=>r.action==='settle').length,1);
    assert.match(await f.page.locator('.gold-breakdown').textContent(),/첫뻑 정산 \+300골드/);
    assert.equal(await f.page.locator('#goldPending').isHidden(),true);
    await f.page.screenshot({path:'/tmp/matgo-first-ppuk-settlement.png'});
    assert.deepEqual(f.errors,[]);await f.context.close();
  }
  {
    const f=await fixture({seed:468});await f.page.goto('https://fixture.test/games/matgo.html');await f.page.waitForFunction(()=>window.matgoTest);
    for(let i=0;i<1500&&!f.state.settled;i++){
      await f.page.evaluate(()=>{
        const modal=document.querySelector('.modal');if(modal){(modal.querySelector('#chongtong-continue')||modal.querySelector('#go')||modal.querySelector('#y')||modal.querySelector('button'))?.click();return;}
        const {game:g,ui,pick}=matgoTest;
        if(ui.resolveChoose){const value=c=>c.k==='gwang'?6:c.k==='yul'?3:c.k==='tti'?3:c.k==='ssang'?3:1;const ids=g.floor.map((s,i)=>[s,i]).filter(([s])=>ui.chooseStacks.has(s)).map(([,i])=>i);ui.resolveChoose(ids.reduce((a,b)=>value(g.floor[a][0])>=value(g.floor[b][0])?a:b));return;}
        if(!ui.busy&&!g.over&&g.turn===0){if(g.hand[0][0])void pick(g.hand[0][0].id);else document.querySelector('#bombFlip')?.click();}
      });
      await f.page.waitForTimeout(20);
    }
    assert.equal(f.state.settled,true,'triple ppuk with gobak settles after a complete legal game');
    assert.equal(f.state.gold,3300,'5000 - 1400 triple ppuk gobak - 300 opening ppuk');assert.match(await f.page.locator('.sc').textContent(),/뻑 3회7점고박×2/);
    assert.match(await f.page.locator('.gold-breakdown').textContent(),/첫뻑 정산 -300골드/);
    await f.page.screenshot({path:'/tmp/matgo-triple-ppuk-gobak.png'});
    assert.deepEqual(f.errors,[]);await f.context.close();
  }
  {
    const f=await fixture();await f.page.goto('https://fixture.test/games/matgo.html');await f.page.waitForFunction(()=>window.matgoTest&&!matgoTest.ui.busy);
    await f.page.evaluate(()=>{
      const {game:g,CARDS,render}=matgoTest,pool=new Map(CARDS.map(c=>[c.id,{...c}]));
      const take=id=>{const c=pool.get(id);pool.delete(id);return c;};
      g.hand=[[1,3,16].map(take),[44].map(take)];g.floor=[0,4].map(id=>[take(id)]);g.caps=[[],[6,7,10,11].map(take)];
      g.deck=[48,2,20].map(take).concat([...pool.values()]);g.ppukCount=[0,0];g.turn=0;g.endTurn=async()=>{};render();
    });
    await f.page.locator('#handMe .c[data-id="1"]').click();await f.page.waitForFunction(()=>!matgoTest.ui.busy);
    assert.equal(await f.page.locator('.stack.ppuk .c[data-id="48"]').count(),1);assert.equal(await f.page.locator('#capsMe .c[data-id="48"]').count(),0);
    assert.match(await f.page.locator('.stack.ppuk').getAttribute('data-ppuk-label'),/보너스 1/);assert.equal(await f.page.locator('#mePpuk').textContent(),'뻑 1/3');
    await f.page.locator('#handMe .c[data-id="3"]').click();await f.page.waitForFunction(()=>!matgoTest.ui.busy);
    assert.equal(await f.page.locator('#capsMe .c[data-id="48"]').count(),1);assert.equal(await f.page.locator('#capsOp .c').count(),1,'self ppuk plus tied bonus steals 3 cards');
    assert.equal(await f.page.locator('.fly.tmp').count(),0);assert.deepEqual(f.errors,[]);await f.context.close();
  }
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
  console.log('PASS: opening-ppuk event, pending-only gold, exit without payment, one final settlement, existing special rules, age gate, refills and logout');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
