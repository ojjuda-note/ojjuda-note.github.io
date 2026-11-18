// Real Park scripts/styles, with identical network delays before and after the change.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),origin='https://park-entry.test';
const baseline='71785aabf407ca239a27b4811e252a962a725717';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const cards=Array.from({length:20},(_,i)=>({id:'12345678-1234-4123-8123-'+String(i+1).padStart(12,'0'),
  kind:'memo',body:'공원 이야기 '+i,background_key:String(10+i),tags:[],created_at:'2026-11-10T00:00:00Z'}));
const sdk=`window.supabase={createClient:()=>{
  const callbacks=new Set(),session={user:{id:'fixture'}};window.top.feedReads??=0;
  const result=value=>{const p=Promise.resolve(value);p.abortSignal=()=>p;return p;};
  const db={auth:{getSession:async()=>({data:{session}}),onAuthStateChange(fn){callbacks.add(fn);return {data:{subscription:{unsubscribe(){callbacks.delete(fn)}}}};}},
    rpc:()=>result({data:{}}),from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})})}),
    schema:()=>({rpc(name){if(name==='list_cards'){window.top.feedReads++;window.top.feedReadAt=performance.timeOrigin+performance.now();const p=new Promise(resolve=>setTimeout(()=>resolve({data:${JSON.stringify(cards)}}),180));p.abortSignal=()=>p;return p;}
      return result({data:name==='get_note_state'?{}:[]});}})};return db;}};
if(parent!==window){
  function firstPaint(){
    const quote=document.querySelector('#feed-list article .card-quote');
    if(quote?.getClientRects().length){window.top.firstCardsAt=performance.timeOrigin+performance.now();return;}
    requestAnimationFrame(firstPaint);
  }
  requestAnimationFrame(firstPaint);
}`;
(async()=>{
  const browser=await chromium.launch();
  try{
    const results={};
    for(const version of ['before','after']){
      const samples=[],readStarts=[];
      for(let attempt=0;attempt<5;attempt++){
        const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,locale:'ko-KR'});
        const errors=[];
        await context.route('**/*',async route=>{
          const url=new URL(route.request().url()),file=url.pathname.slice(1);
          if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:sdk});
          if(url.origin!==origin)return route.abort();
          if(url.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/config.js"></script><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2"></script><script>const hostClient=supabase.createClient();window.OjjudaGetClient=async()=>hostClient;</script><button id="open">공원</button><script>document.getElementById('open').onclick=()=>{window.started=performance.now();const frame=document.createElement('iframe');frame.style='width:100%;height:800px;border:0';frame.src='/park/?embedded=1';document.body.append(frame);};</script>`});
          if(url.pathname==='/config.js')return route.fulfill({contentType:'text/javascript',body:`window.OJJUDA_CONFIG={supabaseUrl:'${origin}',supabaseKey:'fixture'};`});
          const name=url.pathname==='/park/'?'park/index.html':file;
          try{
            let body=version==='before'&&['park/index.html','note/preview.js'].includes(name)
              ?execFileSync('git',['show',baseline+':'+name],{cwd:root,maxBuffer:2e6}):await fs.readFile(path.join(root,name));
            if(name==='note/calligraphy.js')await wait(450); // cold download of optional rendering tools
            else if(name.endsWith('.css')||name.endsWith('.js'))await wait(60);
            if(/\.(?:jpg|webp)$/.test(name))await wait(120);
            return route.fulfill({body,contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':undefined});
          }catch{return route.abort();}
        });
        const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
        await page.goto(origin+'/world.html');await page.locator('#open').click();
        const frame=page.frameLocator('iframe');
        await page.waitForFunction(()=>Number.isFinite(window.firstCardsAt));
        const elapsed=await page.evaluate(()=>window.firstCardsAt-performance.timeOrigin-window.started);
        const inner=page.frames().find(frame=>frame.url().includes('/park/'));
        assert.equal(await page.evaluate(()=>window.feedReads),1,'one initial card request');
        assert.equal(await frame.locator('#feed-list article').count(),20);
        assert.deepEqual(errors,[]);
        samples.push(Math.round(elapsed));readStarts.push(Math.round(await page.evaluate(()=>window.feedReadAt-performance.timeOrigin-window.started)));await context.close();
      }
      results[version]=samples.sort((a,b)=>a-b)[2];
      console.log('PARK_FIRST_CARDS_MS',version,JSON.stringify(samples),'median',results[version],'request starts',JSON.stringify(readStarts));
    }
    assert.ok(results.after<results.before-80,'preparing the feed overlaps dependency downloads');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
