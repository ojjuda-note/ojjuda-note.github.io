const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');

// Execute the real World shell, renderer and delegated click/input handlers.
// Only the boot/auth transport is replaced; no production account is contacted.
let world = fs.readFileSync(path.join(root, 'world.html'), 'utf8')
  .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '')
  .replace('import { screw3d as screwGame } from "./screw3d.js";', 'const screwGame={};');
const boot = world.indexOf('j1(()=>H());gm(');
assert.ok(boot > 0, 'World boot is available');
world = world.slice(0, boot) + `
window.profileTest={model:$,auth:D,state:g,render:H,actions:sr,resolvePhoto:resolveWorldProfilePhoto,
  setPhotoApi(api){worldPhotoEditor=api;worldPhotoLoad=null;},
  switchAccount(id,profile){D.user={id};D.online=true;Object.assign($.me,profile);g.tab='my';H();}};
S={rpc:async(name,params)=>{window.memberCalls.push({name,params});if(window.memberDeferred)return await new Promise(resolve=>window.finishMember=resolve);if(window.memberError)return {error:{message:window.memberError}};if(name==='get_my_member_identity')return {data:window.memberRecord};window.memberRecord={...window.memberRecord,birth_date:'1990-01-01',gender:'male',phone_number:params.p_phone};return {data:window.memberRecord};}};
window.memberCalls=[];window.memberRecord={birth_date:'1990-01-01',gender:'male',phone_number:'01012345678'};
D.online=true;D.user={id:'profile-owner-a',email:'member@example.invalid'};D.isAdmin=false;D.doorReady=true;
Object.assign($.me,{nick:'저장한 이름',bio:'저장한 소개',moodText:'저장한 기분',mood:'😊'});
g.tab='my';H();
` + world.slice(world.indexOf('</script>', boot));


(async () => {
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}}), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).pathname==='/world.html'?route.fulfill({contentType:'text/html',body:world}):route.abort());
  await page.goto('https://fixture.test/world.html');
  await page.waitForFunction(()=>window.profileTest);
  for(const file of ['signup-identity.js','world-member-info.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  const open=async()=>{const group=page.locator('[data-my-group="profile"]');if(!await group.evaluate(n=>n.open))await group.locator('summary').click();await page.locator('[data-act="member-info-open"]').click();};
  const save=()=>page.getByRole('button',{name:'전화번호 저장',exact:true}).click();
  await open();
  assert.equal(await page.locator('#wm-email').inputValue(),'member@example.invalid');
  assert.equal(await page.locator('#wm-birth-date').getAttribute('readonly'),'');
  await page.locator('#wm-phone').fill('123');await save();
  assert.equal(await page.evaluate(()=>memberCalls.length),1,'invalid number never sent');
  await page.locator('#wm-phone').fill('010-9876-5432');
  await page.evaluate(()=>window.memberError='phone_already_registered');await save();
  assert.match(await page.locator('#wm-message').textContent(),/이미 가입/);
  assert.equal(await page.locator('#wm-phone').inputValue(),'010-9876-5432','failed write retains edit');
  await page.evaluate(()=>window.memberError=null);await save();
  await page.waitForFunction(()=>document.querySelector('#wm-message').textContent==='전화번호를 저장했어요.');
  assert.deepEqual(await page.evaluate(()=>memberCalls.at(-1)),{name:'update_my_phone_number',params:{p_phone:'01098765432'}},'only own phone RPC with no client supplied user id');
  await page.keyboard.press('Escape');await open();
  assert.equal(await page.locator('#wm-phone').inputValue(),'01098765432','reopen loads persisted value');
  await page.evaluate(()=>{window.supportCalls=0;profileTest.actions['support-open']=()=>window.supportCalls++;});
  await page.locator('#wm-correction').click();
  assert.equal(await page.evaluate(()=>supportCalls),1,'correction opens existing support');
  assert.equal(await page.locator('#world-member-info').count(),0);
  await page.evaluate(()=>{window.memberRecord=null;});await open();
  await page.locator('#wm-birth').fill('900101');await page.locator('#wm-code').fill('1');await page.locator('#wm-phone').fill('01011112222');await page.locator('#wm-consent').check();
  await page.getByRole('button',{name:'개인정보 등록',exact:true}).click();
  await page.waitForSelector('#wm-birth-date');
  assert(await page.evaluate(()=>memberCalls.some(c=>c.name==='complete_my_member_identity'&&c.params.p_consent===true)),'unregistered member can complete information');
  await page.keyboard.press('Escape');await page.evaluate(()=>window.memberError='network');await open();
  await page.waitForSelector('#wm-retry');await page.evaluate(()=>window.memberError=null);await page.locator('#wm-retry').click();await page.waitForSelector('#wm-phone');
  await page.keyboard.press('Escape');await page.evaluate(()=>window.memberDeferred=true);await open();
  await page.evaluate(()=>{profileTest.auth.user={id:'other-user'};profileTest.render();});
  await page.evaluate(()=>{window.memberDeferred=false;window.finishMember({data:{phone_number:'01099998888',birth_date:'1990-01-01',gender:'male'}});});
  assert.equal(await page.locator('#world-member-info').count(),0,'account switch removes private fields and ignores stale load');
  await page.evaluate(()=>{profileTest.auth.online=false;profileTest.render();});
  assert.equal(await page.locator('[data-act="member-info-open"]').count(),0,'guests cannot open personal information');
  assert.deepEqual(errors,[]);
  console.log('PASS: unified menu opens real personal editor; validation, save/reopen, duplicate failure, correction, registration, retry and account isolation.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
