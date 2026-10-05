const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
(async()=>{
  const {CARDS}=await import('../games/matgo-engine.mjs');
  const browser=await chromium.launch({headless:true,executablePath:process.env.MATGO_CHROMIUM,args:['--no-sandbox','--autoplay-policy=user-gesture-required']});
  const errors=[];
  const initial={id:'12345678-1234-1234-1234-123456789012',round:1,version:1,status:'active',seat:0,names:['나','상대'],bots:[false,false],departed:[false,false],ready:[false,false],gold:[5000,5000],autoCount:0,eventCount:0,events:[],game:{hand:[CARDS[0],CARDS[8]],otherCount:2,floor:[{cards:[CARDS[1]]}],caps:[[],[]],deckCount:20,turn:0,go:[0,0],bomb:[0,0],shake:[0,0],ppukCount:[0,0],firstPpukGold:[0,0],over:false,prompt:{type:'play',p:0}}};
  const stamp=room=>({...structuredClone(room),deadline:new Date(Date.now()+15000).toISOString(),serverTime:Date.now()});
  async function screen({muted=false,reduced=false,resume=initial}={}){
    const context=await browser.newContext({viewport:{width:390,height:820},hasTouch:true,reducedMotion:reduced?'reduce':'no-preference'});
    await context.addInitScript(({muted,room})=>{
      localStorage.setItem('ojjuda-matgo-sound',muted?'off':'on');window.fixtureRoom=room;
      window.audioStarts=[];window.audioContexts=[];window.flights=[];window.eventScreens=[];
      const NativeAudio=window.AudioContext;
      window.AudioContext=class extends NativeAudio{constructor(...args){super(...args);audioContexts.push(this);}};
      const start=AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start=function(...args){const samples=this.buffer?.getChannelData(0);audioStarts.push({state:this.context.state,energy:samples?.some(x=>Math.abs(x)>.001)});return start.apply(this,args);};
      const animate=Element.prototype.animate;
      Element.prototype.animate=function(frames,options){
        const animation=animate.call(this,frames,options);
        if(this.classList.contains('online-flying-card')){const entry={at:performance.now(),duration:options.duration,back:!!this.querySelector('[aria-label="화투 뒷면"]')};flights.push(entry);animation.finished.then(()=>entry.elapsed=performance.now()-entry.at).catch(()=>entry.cancelled=true);}
        return animation;
      };
      window.OjjudaMatgoAccess={check:async()=>{},subscribe:()=>{},getClient:()=>({auth:{getSession:async()=>({})},functions:{invoke:async(_,{body})=>({data:body.action==='status'?{ok:true,gold:5000,coins:0,free_left:2,online_room:room.id}:{ok:true,room:fixtureRoom}})}})};
    },{muted,room:stamp(resume)});
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url()),file=path.join(root,decodeURIComponent(url.pathname));
      if(url.origin!=='https://fixture.test'||['/config.js','/matgo-access.js'].includes(url.pathname))return route.fulfill({contentType:'text/javascript',body:''});
      if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
      if(url.pathname==='/games/matgo-online.mjs')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(file,'utf8')+'\nwindow.effectsTest={accept,cancelPresentation};'});
      return route.fulfill({path:file,contentType:/\.(mjs|js)$/.test(file)?'text/javascript':url.pathname.endsWith('.css')?'text/css':undefined});
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto('https://fixture.test/games/matgo-online.html');await page.locator('#hand').waitFor();
    await page.evaluate(()=>new MutationObserver(()=>{const event=document.querySelector('#event');if(!event.hidden)eventScreens.push({kind:event.dataset.kind,text:event.textContent,at:performance.now()});}).observe(document.querySelector('#event'),{attributes:true,childList:true}));
    return {page,context};
  }
  async function present(page,next){await page.evaluate(next=>{fixtureRoom=next;window.presenting=effectsTest.accept(next);},stamp(next));}
  const played={...structuredClone(initial),version:2,eventCount:4,events:[{id:0,type:'played',p:0,card:CARDS[0],stack:[CARDS[1],CARDS[0]]},{id:1,type:'flip',p:0,card:CARDS[4],stack:[CARDS[4]]},{id:2,type:'take',p:0,cards:[CARDS[1],CARDS[0]]},{id:3,type:'ttadak',p:0}],game:{...structuredClone(initial.game),hand:[CARDS[8]],floor:[{cards:[CARDS[4]]}],caps:[[CARDS[1],CARDS[0]],[]],deckCount:19,turn:1,prompt:{type:'waiting',p:1}}};
  try{
    const {page,context}=await screen();
    assert.equal(await page.evaluate(()=>audioContexts.length),0,'no AudioContext before a trusted gesture');
    await page.locator('#sound-start').tap();
    await page.waitForFunction(()=>audioStarts.some(s=>s.state==='running'&&s.energy),null,{timeout:10000}).catch(async error=>{console.error(await page.evaluate(()=>({contexts:audioContexts.map(c=>c.state),starts:audioStarts})));throw error;});
    assert.equal(await page.locator('#sound-start').isVisible(),false);
    await present(page,played);
    await page.waitForSelector('.online-flying-card');
    assert.equal(await page.locator('#hand button:not(:disabled)').count(),0,'no moves during presentation');
    await page.waitForTimeout(250);assert.ok(await page.locator('.online-flying-card').count(),'cards remain visible in flight');
    await page.evaluate(()=>presenting);
    const flights=await page.evaluate(()=>flights);assert.equal(flights.length,4);assert.ok(flights.every(f=>f.duration>=500&&f.elapsed>=450));
    assert.equal(await page.locator('#hand button').count(),1);assert.equal(await page.locator('.online-flying-card').count(),0);
    await page.locator('#event:not([hidden])').waitFor();assert.match(await page.locator('#event').innerText(),/따닥/);
    await page.waitForTimeout(1100);assert.equal(await page.locator('#event').isVisible(),true,'event screen remains readable beyond one second');
    await page.screenshot({path:'/tmp/matgo-online-event-effects.png'});
    const before=await page.evaluate(()=>({flights:flights.length,sounds:audioStarts.length}));
    await present(page,played);await page.evaluate(()=>presenting);
    assert.deepEqual(await page.evaluate(()=>({flights:flights.length,sounds:audioStarts.length})),before,'same version does not replay sounds or events');
    await page.locator('#event').waitFor({state:'hidden'});
    await page.locator('#menu').click();await page.locator('#sound').tap();
    assert.equal(await page.evaluate(()=>localStorage.getItem('ojjuda-matgo-sound')),'off');
    const count=await page.evaluate(()=>audioStarts.length);
    // A hidden opponent replacement is animated with a back, never a guessed face.
    const draw={...structuredClone(played),version:3,eventCount:5,events:[{id:4,type:'draw',p:1}]};
    await present(page,draw);await page.evaluate(()=>presenting);
    assert.equal(await page.evaluate(()=>flights.at(-1).back),true);
    assert.equal(await page.evaluate(()=>audioStarts.length),count,'muted moves remain silent');
    // Visibility loss cancels moving cards and all stale event screens immediately.
    await present(page,{...played,version:4,eventCount:9,events:played.events.map(e=>({...e,id:e.id+5}))});
    await page.waitForSelector('.online-flying-card');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    await page.evaluate(()=>presenting);assert.equal(await page.locator('.online-flying-card').count(),0);assert.equal(await page.locator('#event').isVisible(),false);
    await context.close();
    const restored=await screen({resume:played});
    assert.equal(await restored.page.evaluate(()=>flights.length+audioStarts.length),0,'resume renders latest board without replaying old events');
    assert.equal(await restored.page.locator('#event').isVisible(),false);await restored.context.close();
    const reduced=await screen({muted:true,reduced:true});
    await present(reduced.page,played);await reduced.page.evaluate(()=>presenting);
    assert.equal(await reduced.page.evaluate(()=>flights.length+audioStarts.length),0);assert.match(await reduced.page.locator('#event').innerText(),/따닥/);
    // Own and opponent banners remain visible above the board in small viewports.
    for(const [width,height] of [[320,568],[568,320]]){await reduced.page.setViewportSize({width,height});const b=await reduced.page.locator('.event-card').boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=width&&b.y+b.height<=height);}
    // An event must be readable before a choice/result modal can cover it.
    await present(reduced.page,{...played,version:3,eventCount:5,events:[{id:4,type:'go',p:1,n:2}],game:{...played.game,prompt:{type:'gostop',p:0,points:7}}});
    assert.equal(await reduced.page.locator('#go').count(),0);
    await reduced.page.locator('#event[data-kind=go]:not([hidden])').waitFor();
    assert.match(await reduced.page.locator('#event').innerText(),/상대 2고/);
    await reduced.page.locator('#go').waitFor();
    const finished={...played,version:4,status:'finished',eventCount:6,events:[{id:5,type:'end',winner:0}],game:{...played.game,over:true,prompt:null},result:{winner:0,type:'end',paidDelta:[100,-100],firstPpukGold:[0,0],total:1}};
    await present(reduced.page,finished);await reduced.page.evaluate(()=>presenting);
    await reduced.page.locator('#event[data-kind=end]:not([hidden])').waitFor();
    assert.equal(await reduced.page.locator('#rematch').count(),0);
    await reduced.page.locator('#rematch').waitFor();
    await reduced.context.close();assert.deepEqual(errors,[]);
    console.log('PASS: measured card flights, real recorded audio after touch, mute, readable events, idempotent polling, private replacement, visibility cancellation, resume and reduced motion');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
