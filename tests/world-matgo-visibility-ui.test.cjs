const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');

// Exercise the real member forms, World renderer, access gate and Matgo opener.
// Only authentication, database transport and room presence are replaced.
let world = fs.readFileSync(path.join(root, 'world.html'), 'utf8')
  .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '')
  .replace('import { screw3d as screwGame } from "./screw3d.js";', 'const screwGame={};');
const boot = world.indexOf('j1(()=>H());gm(');
assert.ok(boot > 0);
world = world.slice(0, boot) + `
window.memberRecord=null;window.identityError=false;window.saveError=false;
S={auth:{getUser:async()=>({data:{user:D.online?D.user:null}}),
 onAuthStateChange(callback){window.accessAuthEvent=callback;return {data:{subscription:{unsubscribe(){}}}}}},
 rpc:async(name,params)=>{
  if(name==='get_my_member_identity')return window.identityError?{error:{message:'offline'}}:{data:window.memberRecord};
  if(window.saveError)return {error:{message:'offline'}};
  if(name==='complete_my_member_identity'){
   const info=window.OjjudaIdentity.parseBirth(params.p_birth_six,params.p_gender_code,undefined,false);
   window.memberRecord={birth_date:info.birthDate,gender:info.gender,age:info.age,locked:true,phone_number:params.p_phone};
  }else if(name==='update_my_phone_number')window.memberRecord.phone_number=params.p_phone;
  return {data:window.memberRecord};
 }};
Pa=async()=>{};
window.matgoTest={auth:D,state:g,actions:sr,render:H,client:S,rankings:worldRankGames,
 switchUser(id,identity){D.user={id,email:'member@example.invalid'};D.online=true;window.memberRecord=identity;window.accessAuthEvent?.('SIGNED_IN',{user:D.user});}};
D.online=true;D.user={id:'legacy-member',email:'member@example.invalid'};D.doorReady=true;
g.tab='my';H();
` + world.slice(world.indexOf('</script>', boot));

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).pathname === '/world.html'
      ? route.fulfill({ contentType: 'text/html', body: world }) : route.abort());
    await page.goto('https://fixture.test/world.html');
    await page.waitForFunction(() => window.matgoTest);
    for (const file of ['signup-identity.js', 'world-member-info.js', 'matgo-access.js', 'matgo-bridge.js']) {
      await page.addScriptTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
    }
    await page.evaluate(async () => {
      OjjudaMatgoAccess.configure(matgoTest.client);
      await OjjudaMatgoAccess.check().catch(() => {});
      matgoTest.actions['enter-place']({ id: 'arcade' });
    });
    const button = page.locator('[data-act="matgo-open"]');
    assert.equal(await button.count(), 0, 'missing identity initially hides Matgo');
    await page.locator('#pmsg').fill('계속 쓰던 메시지');
    const register = async () => {
      await page.locator('#wm-birth').fill('900101');
      await page.locator('#wm-code').fill('1');
      await page.locator('#wm-phone').fill('01012345678');
      await page.locator('#wm-consent').check();
      await page.getByRole('button', { name: '개인정보 등록', exact: true }).click();
    };
    await page.evaluate(() => matgoTest.actions['member-info-open']());
    await register();
    await page.locator('#wm-birth-date').waitFor();
    await page.waitForFunction(() => OjjudaMatgoAccess.visible(), { timeout: 5000 });
    await page.keyboard.press('Escape');
    await button.waitFor();
    assert.equal(await button.count(), 1);
    assert.equal(await page.locator('#pmsg').inputValue(), '계속 쓰던 메시지', 'button refresh preserves chat draft');
    assert.equal(await page.evaluate(() => matgoTest.rankings().matgo.name), '맞고', 'ranking includes newly eligible game');
    await button.click();
    await page.locator('#matgo-overlay iframe').waitFor();
    await page.getByRole('button', { name: '맞고 닫기', exact: true }).click();

    // Legacy-member entry prompt uses the same save hook, without re-login.
    await page.evaluate(() => {
      matgoTest.switchUser('entry-member', null);
      matgoTest.actions.tab({ tab: 'friends' });
    });
    await page.getByRole('dialog', { name: '기본정보를 입력해 주세요', exact: true }).waitFor();
    await register();
    await page.locator('#world-member-info').waitFor({ state: 'detached' });
    await page.waitForFunction(() => OjjudaMatgoAccess.visible());
    await page.evaluate(() => matgoTest.actions['enter-place']({ id: 'arcade' }));
    await button.waitFor();

    // Re-entry refreshes data changed elsewhere, and recovers from a failed check.
    await page.evaluate(async () => {
      matgoTest.actions.tab({ tab: 'my' });
      matgoTest.switchUser('changed-member', null);
      await OjjudaMatgoAccess.check().catch(() => {});
      window.memberRecord={birth_date:'1990-01-01',gender:'male',phone_number:'01012345678',age:36,locked:true};
      matgoTest.actions['enter-place']({ id: 'arcade' });
    });
    await button.waitFor();
    await page.evaluate(async () => {
      window.identityError=true;
      await OjjudaMatgoAccess.check().catch(() => {});
    });
    assert.equal(await button.count(), 0, 'failed age check hides the game');
    await page.evaluate(() => {
      matgoTest.actions.tab({ tab: 'my' });
      window.identityError=false;
      matgoTest.actions['enter-place']({ id: 'arcade' });
    });
    await button.waitFor();

    // A successful save is required, and the server age restriction remains.
    await page.evaluate(async () => {
      matgoTest.switchUser('minor-member', {age:18,locked:true});
      await OjjudaMatgoAccess.check().catch(() => {});
    });
    assert.equal(await button.count(), 0);
    assert.equal(await page.evaluate(() => !!matgoTest.rankings().matgo), false);
    await page.evaluate(() => {
      matgoTest.switchUser('failed-save-member', null);
      window.saveError=true;
      matgoTest.actions['member-info-open']();
    });
    await register();
    await page.waitForFunction(() => document.querySelector('#wm-message').textContent.includes('저장하지 못했어요'));
    assert.equal(await page.evaluate(() => OjjudaMatgoAccess.visible()), false);
    assert.equal(await button.count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: both identity forms restore Matgo immediately; game opens, chat survives, re-entry recovers, minors and failed saves remain blocked.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
