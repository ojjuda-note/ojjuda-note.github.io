const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),origin='https://guest.test';
let world=fs.readFileSync(path.join(root,'world.html'),'utf8').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,tag=>tag.includes('/guest-game-scores.js')||tag.includes('/ttang-bridge.js')||tag.includes('/world-spot-game.js')?tag:'').replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`window.guestFixture={submit:tf,ranking:ef,open:Al,login:()=>nr('login'),member:()=>{D.online=true;D.user={id:'member-a'};},finish:score=>{R.game={draw(){}};R.running=true;return S2(score)}};enterWorldGuest(()=>{g.tab='friends';H()});`+world.slice(world.indexOf('</script>',boot));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
   if(url.pathname==='/world.html')return route.fulfill({body:world,contentType:'text/html'});
   if(url.pathname==='/games/ttang.html'||url.pathname==='/games/spot-difference/index.html')return route.fulfill({body:'<!doctype html><body>game frame</body>',contentType:'text/html'});
   const file=path.join(root,url.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
  });
  await context.addInitScript(()=>{
   window.OJJUDA_CONFIG={supabaseUrl:'https://fixture.supabase.test',supabaseKey:'fixture-public-key'};
   window.calls=[];window.clientOptions=[];window.failScores=false;
   window.supabase={createClient:(url,key,options)=>{
    const guest=options?.auth?.storageKey==='ojjuda-guest-ranking-api';clientOptions.push(options||null);
    return {auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},rpc(name,args){
     calls.push({name,args,guest});
     const result=name==='submit_guest_game_score'?{data:failScores?{ok:false,reason:'invalid'}:{ok:true,guest:true,best:args.p_score,reward:0,rank:null}}
       :name==='guest_game_ranking'?{data:[{nick:'손님',score:20,me:true,source:'guest_record'}]}
       :name==='submit_score'?{data:{ok:true,best:args.p_score,reward:0}}:{data:[]};
     const promise=Promise.resolve(result);promise.abortSignal=()=>promise;return promise;
    }};
   }};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/world.html?place=park&guest=1');await page.waitForFunction(()=>window.guestFixture);
  await page.evaluate(()=>guestFixture.open('breakout'));
  await page.getByRole('heading',{name:'오늘의 랭킹',exact:true}).waitFor();
  assert.equal((await page.locator('#grank li.me').innerText()).replace(/\s/g,''),'손님20','real World ranking displays and highlights the guest');
  await page.evaluate(()=>guestFixture.finish(20));
  await page.waitForFunction(()=>document.querySelector('#gres')?.textContent.includes('손님으로 기록했어요'));
  const call=await page.evaluate(()=>calls.find(c=>c.name==='submit_guest_game_score'));
  assert.equal(call.args.p_score,20);assert.equal(call.args.p_game,'breakout');assert.match(call.args.p_guest_token,/^[a-f0-9]{64}$/);assert.match(call.args.p_request_id,/^[a-f0-9-]{36}$/);assert.equal(call.guest,true);
  const options=await page.evaluate(()=>clientOptions.find(c=>c?.auth?.storageKey==='ojjuda-guest-ranking-api'));
  assert.deepEqual(options.auth,{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'ojjuda-guest-ranking-api'});
  await page.reload();await page.waitForFunction(()=>window.guestFixture);await page.evaluate(()=>guestFixture.submit('mole',3));
  assert.equal(await page.evaluate(()=>calls.find(c=>c.name==='submit_guest_game_score').args.p_guest_token),call.args.p_guest_token,'guest identity survives reload');
  await page.evaluate(()=>guestFixture.open('ttang'));
  await page.waitForFunction(()=>document.querySelector('#ttang-overlay iframe')?.contentDocument?.body?.textContent.includes('game frame'));
  await page.evaluate(()=>{const frame=document.querySelector('#ttang-overlay iframe');for(const data of [{type:'ojjuda:ttang:start',round:'one'},{type:'ojjuda:ttang:result',mode:'solo',round:'one',score:45}])dispatchEvent(new MessageEvent('message',{origin:location.origin,source:frame.contentWindow,data}));});
  await page.waitForFunction(()=>document.getElementById('ttang-save-status').textContent.includes('손님으로 기록했어요'));
  assert.equal(await page.evaluate(()=>calls.find(c=>c.name==='submit_guest_game_score'&&c.args.p_game==='ttang').args.p_score),45);
  await page.getByRole('button',{name:'월드땅따먹기 닫기',exact:true}).click();
  await page.evaluate(()=>guestFixture.open('spot'));
  await page.waitForFunction(()=>document.querySelector('.spot-game-dialog iframe')?.contentDocument?.body?.textContent.includes('game frame'));
  await page.evaluate(()=>{const frame=document.querySelector('.spot-game-dialog iframe');dispatchEvent(new MessageEvent('message',{origin:location.origin,source:frame.contentWindow,data:{type:'ojjuda:spot-score',score:4,owner:null}}));});
  await page.waitForFunction(()=>calls.some(c=>c.name==='submit_guest_game_score'&&c.args.p_game==='spot'&&c.args.p_score===4));
  await page.getByRole('button',{name:'오락실로 돌아가기',exact:true}).click();
  await page.evaluate(()=>{guestFixture.member();return guestFixture.submit('runner',99)});
  assert.equal(await page.evaluate(()=>calls.at(-1).name),'submit_score','member writes retain the authenticated API');
  assert.equal(await page.evaluate(()=>calls.at(-1).guest),false);
  await page.evaluate(()=>guestFixture.login());
  const browse=page.getByRole('link',{name:'둘러보기',exact:true});assert.equal(await browse.isVisible(),true);
  assert.equal(await browse.getAttribute('href'),'/world.html?place=park&guest=1');
  await browse.click();await page.waitForURL(origin+'/world.html?place=park&guest=1');
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('PASS: real World guest score submission and ranking, persistent browser identity, isolated API session, Ttang/Spot bridges, unchanged member submission and login browse link');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
