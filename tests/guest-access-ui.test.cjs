const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),origin='https://guest-access.test';
const strip=html=>html.replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'');
let world=strip(read('world.html')).replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
const helpers=['game-session.js', 'guest-access.js','world-park-notes.js','world-mines-game.js','world-saetbyeol-game.js','world-tour-game.js','world-tank-game.js','world-spot-game.js','ttang-bridge.js'].map(read).join('\n');
world=world.replace('<script type="module">',()=>`<script>${helpers}</script><script type="module">`);
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`window.guestFixture={open:Al,close:El,finish:score=>S2(score),board:(kind)=>savePracticeStreak({kind,mode:'local'},'draw'),member:()=>{D.online=true;D.parkGuest=false;D.user={id:'member'};},park:()=>sr.tab({tab:'park'})};
window.OjjudaGuestScores={submit:async()=>({ok:false}),ranking:async()=>[]};
enterWorldGuest(()=>{g.tab='arcade';H()});`+world.slice(world.indexOf('</script>',boot));
const note=read('note/preview.js'),noteBoot=note.lastIndexOf('\nif (client) {\n  client.auth.onAuthStateChange');assert.ok(noteBoot>0);
const portal=read('index.html').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,tag=>/portal\.js|signup-identity\.js|signup-referral\.js|config\.js/.test(tag)?tag:'');
const cardId='00000000-0000-4000-8000-000000000001';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();
   if(u.pathname==='/world.html')return route.fulfill({body:world,contentType:'text/html'});
   if(u.pathname==='/')return route.fulfill({body:portal,contentType:'text/html'});
   if(u.pathname==='/park/')return route.fulfill({body:strip(read('park/index.html')),contentType:'text/html'});
   if(u.pathname.startsWith('/games/'))return route.fulfill({body:`<!doctype html><p>Game transport fixture</p><script>
    const kind=location.pathname.includes('/tank/')?'tank':location.pathname.includes('/ojjuda-tour/')?'tour':null;
    window.transportReady=!kind;
    if(kind){addEventListener('message',event=>{if(event.data?.type===(kind==='tank'?'tank-init':'ojjuda-tour-init'))window.transportReady=true;});parent.postMessage({source:'ojjuda-'+kind,type:kind==='tank'?'ready':'ojjuda-game-ready'},location.origin);}
   </script>`,contentType:'text/html'});
   const file=path.resolve(root,'.'+u.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)?route.fulfill({path:file}):route.abort();
  });
  await context.addInitScript(()=>{
   window.OJJUDA_CONFIG={supabaseUrl:'https://fixture.invalid',supabaseKey:'fixture'};
   const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null}),limit:()=>q,order:()=>q,then:resolve=>Promise.resolve({data:[]}).then(resolve)};
   window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},from:()=>q,rpc(){const p=Promise.resolve({data:[]});p.abortSignal=()=>p;return p;}})};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const enter=async()=>{await page.goto(origin+'/world.html?place=park&guest=1');await page.waitForFunction(()=>window.guestFixture);await page.evaluate(()=>sessionStorage.removeItem('ojjuda.guest-round-completed.v1'));};
  const login=async next=>{await page.locator('#auth-dialog[open]').waitFor();assert.equal(await page.locator('#login-tab').getAttribute('aria-selected'),'true');assert.equal(await page.locator('#signup-tab').getAttribute('aria-selected'),'false');assert.equal(await page.locator('.password-confirm-field').isVisible(),false);assert.equal(new URL(page.url()).searchParams.get('next'),next);};
  await enter();await page.evaluate(()=>guestFixture.open('stacker'));await page.locator('[data-g=start]').click();
  assert.equal(new URL(page.url()).pathname,'/world.html','a guest gets the first round');
  await page.evaluate(()=>guestFixture.finish(0));await login('world');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('ojjuda.guest-round-completed.v1')),'1','zero-score loss consumes the round even when save fails');
  await page.goto(origin+'/world.html?place=park&guest=1');await page.waitForFunction(()=>window.guestFixture);await page.evaluate(()=>guestFixture.open('mole'));await login('world');
  // Closing an unplayed game must not consume the trial.
  await enter();await page.evaluate(()=>{guestFixture.open('stacker');guestFixture.close();});assert.equal(await page.evaluate(()=>sessionStorage.getItem('ojjuda.guest-round-completed.v1')),null);
  for(const kind of ['chess','janggi','carom4','carom3','pool8']){await enter();await page.evaluate(kind=>guestFixture.board(kind),kind);await login('world');}
  const uuid='10000000-0000-4000-8000-000000000001';
  for(const [kind,data] of [
   ['mines',{source:'ojjuda-mines',type:'ojjuda-game-finished',runId:uuid}],
   ['saetbyeol',{source:'ojjuda-saetbyeol',type:'ojjuda-game-finished',runId:uuid,demo:false}],
   ['tank',{source:'ojjuda-tank',type:'finished'}],
   ['spot',{type:'ojjuda:spot-finished'}],
   ['ttang',{type:'ojjuda:ttang:result',round:uuid,mode:'solo',win:false}],
   ['tour',{source:'ojjuda-tour',type:'ojjuda-game-result',game:'ojjuda-tour',runId:uuid,players:2,myRank:2,ranking:[{}, {human:true,assets:0,bankrupt:true}]}]
  ]){
   await enter();await page.evaluate(kind=>guestFixture.open(kind),kind);await page.locator('iframe').waitFor();
   await page.waitForFunction(()=>document.querySelector('iframe')?.contentWindow?.transportReady===true);
   console.log('CHECK guest completion:',kind);
   // Unrelated windows and foreign origins cannot trigger the gate.
   await page.evaluate(data=>{dispatchEvent(new MessageEvent('message',{origin:'https://foreign.invalid',source:document.querySelector('iframe').contentWindow,data}));dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data}));},data);
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('ojjuda.guest-round-completed.v1')),null,kind+' ignores forged sources');
   await page.evaluate(data=>{const source=document.querySelector('iframe').contentWindow;if(data.round)dispatchEvent(new MessageEvent('message',{origin:location.origin,source,data:{type:'ojjuda:ttang:start',round:data.round,mode:'solo'}}));dispatchEvent(new MessageEvent('message',{origin:location.origin,source,data}));},data);
   await login('world').catch(error=>{error.message=kind+' completion: '+error.message;throw error;});
  }
  await enter();await page.evaluate(()=>{guestFixture.member();guestFixture.open('stacker');});await page.locator('[data-g=start]').click();await page.evaluate(()=>guestFixture.finish(0));
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('ojjuda.guest-round-completed.v1')),null,'members never consume a trial');
  await page.locator('[data-g=start]').click();assert.equal(new URL(page.url()).pathname,'/world.html','members can immediately replay');
  // Run the actual card composer and its embedded navigation adapter.
  const preparePark=async frame=>{
   await frame.addScriptTag({content:note.slice(0,noteBoot)});
   await frame.evaluate(()=>{authKnown=ready=true;noteRpc=async()=>[];});
   await frame.addScriptTag({content:read('park/integration.js')});
  };
  await enter();await page.evaluate(()=>guestFixture.park());await page.locator('[data-park-app] iframe').waitFor();
  const frame=page.frames().find(f=>f.url().includes('/park/'));await preparePark(frame);
  await page.locator('[data-park-action=compose]').click();await login('note');
  if(process.env.GUEST_PROOF_DIR){fs.mkdirSync(process.env.GUEST_PROOF_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.GUEST_PROOF_DIR,'guest-login.png')});}
  await page.goto(origin+'/park/?card='+cardId);await preparePark(page);
  await page.evaluate(id=>openComposer('reply',null,id),cardId);await login('note');assert.equal(new URL(page.url()).searchParams.get('card'),cardId);
  // Login is the automatic entry; a guest can still deliberately select signup
  // or password recovery without losing the card they were replying to.
  await page.locator('#signup-tab').click();assert.equal(await page.locator('#signup-tab').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#nickname').isVisible(),true);assert.equal(new URL(page.url()).searchParams.get('card'),cardId);
  await page.locator('#login-tab').click();await login('note');
  await page.locator('#forgot-trigger').click();assert.equal(await page.locator('#auth-title').textContent(),'비밀번호 찾기');
  assert.equal(await page.locator('#recovery-identity-slot').isVisible(),true);assert.equal(new URL(page.url()).searchParams.get('card'),cardId);
  await page.locator('#forgot-trigger').click();await login('note');assert.equal(new URL(page.url()).searchParams.get('card'),cardId);
  assert.deepEqual(errors,[]);
  console.log('PASS: guest card/reply opens real login; first game allowed, completion redirects even at zero/save failure, no repeat trial, six iframe sources and five board games, member replay unaffected; explicit signup/recovery and card return destination preserved');
  await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
