const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
let world = fs.readFileSync(path.join(root, 'world.html'), 'utf8')
  .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '')
  .replace('import { screw3d as screwGame } from "./screw3d.js";', 'const screwGame={};');
const boot = world.indexOf('j1(()=>H());gm(');
assert.ok(boot > 0);
world = world.slice(0, boot) + `
window.mediaTest={model:$,auth:D,actions:sr,open:nm,guest:enterWorldGuest,visit:py,render:H,state:g,calls:[],fail:false};
S={from:table=>({select:()=>({eq:()=>({order:async()=>({data:[],error:null})})}),update:changes=>({eq:async(key,id)=>{
 mediaTest.calls.push({table,changes,key,id});
 return {error:mediaTest.fail?new Error('save failed'):null};
}})})};
H();
` + world.slice(world.indexOf('</script>', boot));

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).pathname==='/world.html'
   ?route.fulfill({contentType:'text/html',body:world}):route.abort());
  await page.goto('https://fixture.test/world.html');
  await page.waitForFunction(()=>window.mediaTest);
  const open=async({remote=true,folders=true,folder='old'}={})=>{
   await page.evaluate(({remote,folders,folder})=>{
    const t=mediaTest;t.calls=[];t.fail=false;t.auth.online=true;t.auth.foldersReady=true;t.auth.mediaReady=true;
    t.auth.user={id:'owner'};
    t.model.album=[{id:'media-a',type:'photo',caption:'수정 전',vis:'me',folder,remote,comments:[]}];
    t.model.folders=folders?[{id:'old',name:'이전'},{id:'new',name:'여행'}]:[];
    t.open('media-a');
   },{remote,folders,folder});
   await page.locator('#m-cap').fill('바꾼 설명');
  };
  const save=async()=>{
   await page.locator('[data-act="m-save"]').click();
   await page.waitForFunction(()=>!document.querySelector('[data-act="m-save"]').disabled);
  };
  await open();await page.locator('#m-folder').selectOption('new');await save();
  assert.deepEqual(await page.evaluate(()=>mediaTest.calls),[{table:'media',changes:{caption:'바꾼 설명',folder_id:'new'},key:'id',id:'media-a'}],'caption, visibility and folder persist together once');
  assert.deepEqual(await page.evaluate(()=>{const m=mediaTest.model.album[0];return [m.caption,m.folder,m.vis]}),['바꾼 설명','new','me']);
  await open();await page.locator('#m-folder').selectOption('');await save();
  assert.equal(await page.evaluate(()=>mediaTest.model.album[0].folder),null,'empty selection removes the folder');
  await open({folder:null});await page.locator('#m-vis').selectOption('friends');await save();
  assert.equal(await page.evaluate(()=>mediaTest.model.album[0].vis),'friends','unfiled media visibility is saved');
  await open({folders:false});await save();
  assert.equal(await page.evaluate(()=>mediaTest.model.album[0].folder),'old','an unavailable folder selector does not clear membership');
  assert.equal(await page.evaluate(()=>Object.hasOwn(mediaTest.calls[0].changes,'folder_id')),false);
  await open();await page.locator('#m-folder').selectOption('new');await page.evaluate(()=>mediaTest.fail=true);await save();
  assert.deepEqual(await page.evaluate(()=>{const m=mediaTest.model.album[0];return [m.caption,m.folder]}),['수정 전','old'],'failure retains the saved data');
  assert.equal(await page.locator('#m-cap').inputValue(),'바꾼 설명','failure retains the draft for retry');
  assert.equal(await page.locator('#m-folder').inputValue(),'new');
  await page.evaluate(()=>mediaTest.fail=false);await save();
  assert.equal(await page.evaluate(()=>mediaTest.model.album[0].folder),'new','retry succeeds');
  await open({remote:false});await page.locator('#m-folder').selectOption('new');await save();
  assert.equal(await page.evaluate(()=>mediaTest.calls.length),0,'local media needs no server mutation');
  assert.equal(await page.evaluate(()=>mediaTest.model.album[0].folder),'new');
  await page.evaluate(()=>{mediaTest.model.me.nick='이전 사용자';mediaTest.model.diary=[{id:'private-record'}];mediaTest.model.coins=123;mediaTest.guest(()=>{});mediaTest.visit();mediaTest.state.tab='my';mediaTest.render();});
  assert.deepEqual(await page.evaluate(()=>[mediaTest.model.me.nick,mediaTest.model.coins,mediaTest.model.visits.today,mediaTest.model.visits.total,mediaTest.model.diary,mediaTest.auth.user]),['손님',0,0,0,[],null],'public browsing never presents cached member records, a demo wallet or invented visits');
  assert.equal(await page.getByRole('heading',{name:'손님으로 둘러보기',includeHidden:true}).count(),1);
  assert.equal(await page.locator('[data-act="reset"]').count(),0,'guest browsing uses a login action rather than a demo-data reset');
  assert.deepEqual(errors,[]);
  console.log('PASS: World media caption/folder save, atomic server update, no-folder preservation, failed save retry and local media.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
