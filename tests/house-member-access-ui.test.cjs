const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const proof=process.env.HOUSE_PUBLIC_PROOF_DIR||path.resolve(root,'../house-public-proof'),proofFont=process.env.HOUSE_PUBLIC_PROOF_FONT;
const fixture=`<!doctype html><html><body><button id="open">우리집</button><button id="default">기본 권한</button><button id="preview">미리보기 위조</button><script type="module">
import{openHouseTest}from'/house-test/host.js?v=20261005-desklamp1';window.auth={id:null,member:false,admin:false};window.studioCalls=0;
const options=()=>{const owner=auth.id;return {owner,authorized:()=>auth.member&&auth.id===owner,studioAuthorized:()=>auth.member&&auth.id===owner&&auth.admin};};
document.querySelector('#open').onclick=()=>openHouseTest(options());
document.querySelector('#default').onclick=()=>{const {studioAuthorized,...rest}=options();openHouseTest({...rest,onStudio:()=>window.studioCalls++});};
document.querySelector('#preview').onclick=()=>openHouseTest({...options(),studioAuthorized:()=>false,preview:{id:'made-forged',runtime:{}}});
</script></body></html>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  fs.mkdirSync(proof,{recursive:true});const context=await browser.newContext({viewport:{width:1280,height:900}}),errors=[];
  await context.addInitScript(()=>window.addEventListener('message',event=>{if(event.data?.type==='ojjuda-house-test-init'&&event.ports[0]){window.testHousePort=event.ports[0];window.initialStudioCapability=event.data.canUseStudio;}}));
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(proofFont&&u.pathname==='/_proof-font/NotoSansCJKkr-Regular.otf')return route.fulfill({contentType:'font/otf',path:proofFont});if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:fixture});const file=path.resolve(root,'.'+u.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();});
  if(proofFont)await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='@font-face{font-family:HouseProof;src:url("/_proof-font/NotoSansCJKkr-Regular.otf") format("opentype");font-display:block}html,body,button,input,textarea,select{font-family:HouseProof,sans-serif!important}';document.head.append(style);},{once:true}));
  const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR:',e.message);});await page.goto('https://fixture.test/fixture');
  const home=()=>page.frames().find(f=>/\/house-test\/index\.html/.test(f.url()));
  const ready=async()=>{await page.frameLocator('iframe[title="우리집"]').locator('#app').waitFor({state:'visible'});await home().evaluate(()=>document.fonts.ready);return home();};
  const open=async(selector='#open')=>{await page.locator(selector).click();return ready();};
  const noFrames=()=>page.waitForFunction(()=>document.querySelectorAll('iframe').length===0);
  const forge=async f=>f.evaluate(async()=>{testHousePort.postMessage({type:'studio'});await new Promise(resolve=>setTimeout(resolve,80));});
  await page.locator('#open').click();assert.equal(await page.locator('iframe').count(),0,'signed-out users cannot open an ownerless room');
  await page.evaluate(()=>Object.assign(auth,{id:'member-a',member:true,admin:false}));let f=await open('#default');
  assert.equal(await f.evaluate(()=>initialStudioCapability),false,'omitting studio authorization grants no studio capability');
  await f.locator('[data-tab="room"]').click();await f.getByRole('button',{name:'방 설정',exact:true}).click();assert.equal(await f.getByRole('button',{name:'가구 제작실',exact:true}).count(),0);
  await forge(f);assert.equal(await page.evaluate(()=>studioCalls),0,'a forged studio-channel request cannot invoke a privileged callback');assert.equal(await page.locator('iframe').count(),1,'denying a studio request keeps the ordinary house open');
  await f.locator('[data-tab="diary"]').click();await f.getByRole('tab',{name:'노트',exact:true}).click();await f.locator('#diary').fill('회원 A의 집 기록');await f.getByRole('button',{name:'기록 저장',exact:true}).click();
  const memberASave=await page.evaluate(()=>localStorage.getItem('ojjuda-house-playtest-v1:member-a'));assert(memberASave);
  await page.evaluate(()=>auth.id='member-b');await noFrames();f=await open();await f.locator('[data-tab="diary"]').click();assert.equal(await f.locator('#diary').inputValue(),'','another member cannot inherit the previous member room');assert.equal(await page.evaluate(()=>localStorage.getItem('ojjuda-house-playtest-v1:member-a')),memberASave);
  await page.evaluate(()=>{auth.member=false;auth.id=null;});await noFrames();
  await page.evaluate(()=>Object.assign(auth,{id:'member-a',member:true,admin:false}));f=await open();await f.locator('[data-tab="room"]').click();await f.getByRole('button',{name:'방 설정',exact:true}).click();assert.equal(await f.getByRole('button',{name:'가구 제작실',exact:true}).count(),0);await page.screenshot({path:path.join(proof,'member-house-settings-desktop.png')});
  await page.setViewportSize({width:390,height:844});await f.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);await f.locator('#overview').click();await page.screenshot({path:path.join(proof,'member-house-settings-mobile.png')});await f.locator('#exit').click();await noFrames();
  await page.locator('#preview').click();assert.equal(await page.locator('iframe').count(),0,'a member cannot request a privileged preview payload');
  await page.evaluate(()=>Object.assign(auth,{id:'admin-a',member:true,admin:true}));f=await open();assert.equal(await f.evaluate(()=>initialStudioCapability),true);await f.locator('[data-tab="room"]').click();await f.getByRole('button',{name:'방 설정',exact:true}).click();assert.equal(await f.getByRole('button',{name:'가구 제작실',exact:true}).count(),1);
  await page.evaluate(()=>auth.admin=false);await f.getByRole('button',{name:'가구 제작실',exact:true}).waitFor({state:'detached'});assert.equal(await page.locator('iframe').count(),1,'losing studio permission does not evict an authorized member from their ordinary home');await forge(f);assert.equal(await page.locator('iframe[title="관리자 가구 제작실"]').count(),0);await f.locator('#exit').click();await noFrames();
  await page.evaluate(()=>auth.admin=true);f=await open('#default');assert.equal(await f.evaluate(()=>initialStudioCapability),false,'even an admin gets no implicit studio grant');await forge(f);assert.equal(await page.evaluate(()=>studioCalls),0);await f.locator('#exit').click();await noFrames();
  f=await open();await f.locator('[data-tab="room"]').click();await f.getByRole('button',{name:'방 설정',exact:true}).click();await f.getByRole('button',{name:'가구 제작실',exact:true}).click();await page.frameLocator('iframe[title="관리자 가구 제작실"]').locator('#studio-editor').waitFor({state:'visible'});await page.screenshot({path:path.join(proof,'authorized-studio.png')});
  await page.evaluate(()=>auth.admin=false);await noFrames();assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(proof,'house-member-access-verification.json'),JSON.stringify({signedOutDenied:true,defaultStudioDenied:true,memberStudioMenuHidden:true,forgedStudioChannelDenied:true,accountIsolationAndChangeClosure:true,logoutClosure:true,previewPayloadDenied:true,studioRevocationRemovesMenu:true,adminHasNoImplicitStudioCapability:true,authorizedStudioOpensAndClosesOnRevocation:true,errors},null,2));
  console.log('HOUSE MEMBER ACCESS PASS: owner access, default-deny studio capability, forged channel/payload denial, account/logout closure and admin capability revocation');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
