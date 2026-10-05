const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.MATGO_CHROMIUM,args:['--no-sandbox','--autoplay-policy=user-gesture-required']});
 try{
  for(const mode of ['touch','keyboard','muted','rich']){
   const context=await browser.newContext({viewport:{width:390,height:820},hasTouch:true});
   const errors=[],gold=mode==='rich'?900001:5000;let starts=0;
   await context.exposeBinding('soundFixture',async(_,{action})=>{
    if(action==='start')starts++;
    return {data:{ok:true,gold,coins:20,free_left:2,round:action==='start'?{id:'test-round',seed:10,gold,first:0,carry:1}:null}};
   });
   await context.addInitScript(({mode})=>{
    localStorage.setItem('ojjuda-matgo-sound',mode==='muted'?'off':'on');
    window.audioStarts=[];window.audioContexts=[];
    const NativeAudio=window.AudioContext;
    window.AudioContext=class extends NativeAudio{constructor(...args){super(...args);audioContexts.push(this);}};
    const start=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){audioStarts.push({state:this.context.state,length:this.buffer?.length});return start.apply(this,args);};
    window.OjjudaMatgoAccess={check:async()=>{},allowed:()=>true,subscribe:()=>()=>{},getClient:()=>({functions:{invoke:(_,{body})=>soundFixture(body)}})};
    const timeout=setTimeout;window.setTimeout=(fn,delay,...args)=>timeout(fn,delay<5000?Math.min(delay,30):delay,...args);
    const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){return animate.call(this,frames,typeof options==='object'?{...options,duration:5,delay:0}:5);};
   },{mode});
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!=='https://fixture.test'||['/config.js','/matgo-access.js'].includes(url.pathname))return route.fulfill({contentType:'text/javascript',body:''});
    const file=path.join(root,decodeURIComponent(url.pathname));
    if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
    if(url.pathname==='/games/matgo.html'){
     const html=fs.readFileSync(file,'utf8').replace('startRound();\n})();','window.matgoSoundTest={startRound,ui,game};\nstartRound();\n})();');
     return route.fulfill({contentType:'text/html',body:html});
    }
    return route.fulfill({path:file,contentType:/\.(mjs|js)$/.test(file)?'text/javascript':undefined});
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto('https://fixture.test/games/matgo.html');
   if(mode==='muted'){
    await page.waitForSelector('#handMe');assert.equal(await page.locator('#matgo-start').count(),0);
    assert.equal(await page.evaluate(()=>audioStarts.length),0,'saved mute preference remains silent');
   }else{
    await page.locator('#matgo-start-play').waitFor();assert.equal(starts,0,'no round starts before the audio gesture');
    assert.equal(await page.evaluate(()=>audioContexts.length),0);
    await page.evaluate(()=>document.querySelector('#matgo-start-play').click());assert.equal(starts,0,'synthetic clicks cannot consume the audio gate');
    if(mode==='touch')await page.locator('#matgo-start-play').tap();
    else await page.keyboard.press('Enter');
    await page.waitForFunction(()=>audioStarts.length>=3);
    assert.equal(starts,1);assert.ok(await page.evaluate(()=>audioStarts.every(s=>s.state==='running'&&s.length>0)),'initial deal samples actually start in a running AudioContext');
    await page.waitForFunction(()=>!matgoSoundTest.ui.busy&&!matgoSoundTest.ui.dealing);
    assert.equal(await page.locator('#matgo-start').count(),0);
    await page.evaluate(()=>matgoSoundTest.startRound());assert.equal(starts,2,'later rounds need no extra start prompt');
    await page.reload();await page.locator('#matgo-start-play').waitFor();assert.equal(starts,2,'re-entry gets a new audio gesture before dealing');
   }
   assert.equal(await page.evaluate(()=>matgoSoundTest.game.cpuLevel),mode==='rich'?10:1,'solo browser uses the server balance for the next CPU tier');
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS: cold-start touch/keyboard enables real audio before deal; mute, replay, reload and synthetic-click protection');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
