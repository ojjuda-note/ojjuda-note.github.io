const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'photo-admin-')),photo=path.join(dir,'photo.jpg');
fs.writeFileSync(photo,Buffer.from(read('games/photo-ttang.html').match(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/)[1],'base64'));
function boot(){
 const actor='11111111-1111-4111-8111-111111111111';
 const fixture=window.fixture={admin:true,calls:[],listeners:[],rows:[
  {id:'pending',nick:'검토할 사진',visibility:'public',status:'pending',image_path:'crop.jpg',full_path:'full.jpg'},
  {id:'broken',nick:'주소 오류 사진',visibility:'public',status:'pending',image_path:'broken.jpg'},
  {id:'friends',nick:'친구공개 사진',visibility:'friends',status:'approved',image_path:'friends.jpg'},
  {id:'private',nick:'비공개 사진',visibility:'private',status:'approved',image_path:'private.jpg'},
  {id:'approved',nick:'공개된 사진',visibility:'public',status:'approved',image_path:'approved.jpg'}
 ].map(r=>({...r,created_at:'2026-10-06T00:00:00Z',report_count:0,clears:0}))};
 S={auth:{onAuthStateChange(fn){fixture.listeners.push(fn);return {data:{subscription:{unsubscribe(){fixture.listeners=fixture.listeners.filter(x=>x!==fn);}}}};}},
  rpc:async(name,args)=>{fixture.calls.push({name,args});if(name==='photo_is_admin')return {data:fixture.admin};if(name==='photo_set_status'){if(!fixture.admin)return{error:{message:'not allowed'}};if(fixture.fail)return{error:{message:'서버 오류 · 다시 시도'}};if(fixture.delay)await new Promise(r=>fixture.resolve=r);const row=fixture.rows.find(r=>r.id===args.p_id);row.status=args.p_status;return{data:null};}return{data:[]};},
  storage:{from:()=>({createSignedUrl:async p=>p==='broken.jpg'?{error:{message:'missing'}}:{data:{signedUrl:'/photo.jpg'}}})},
  from:table=>{assertTable(table);const filters=[];let start=0,end=23;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},order(){return q},range(a,b){start=a;end=b;return q},then(resolve,reject){const rows=fixture.rows.filter(r=>filters.every(f=>f(r))).slice(start,end+1);return Promise.resolve({data:fixture.admin?rows:[],error:null}).then(resolve,reject);}};return q;}};
 function assertTable(t){if(t!=='photo_stages')throw Error('Unexpected table '+t);}
 window.worldTest={state:g,auth:D,admin:L,actions:sr,render:H};
 gm(()=>{g.tab='friends';H();});
 D.online=true;D.user={id:actor};D.isAdmin=true;g.tab='admin';L.area='content';L.tab='photo-stages';H();
}
let world=read('world.html').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'').replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
world=world.replace('<script type="module">',`<script>${read('world-navigation.js')}\n${read('admin/photo-stages.js')}</script><script type="module">`);
const start=world.indexOf('j1(()=>H());gm(');assert.ok(start>0);world=world.slice(0,start)+`(${boot.toString()})();`+world.slice(world.indexOf('</script>',start));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='fixture.test')return r.abort();if(u.pathname==='/world.html')return r.fulfill({contentType:'text/html',body:world});if(u.pathname==='/photo.jpg')return r.fulfill({path:photo,contentType:'image/jpeg'});const p=path.join(root,u.pathname);return p.startsWith(root+path.sep)&&fs.existsSync(p)?r.fulfill({path:p}):r.abort();});
  await page.goto('https://fixture.test/world.html');await page.waitForSelector('.ap-card');
  assert.equal(await page.locator('[data-act="adm-tab"][data-v="photo-stages"]').textContent(),'포토땅따먹기');
  assert.equal(await page.locator('.ap-card').count(),2,'admin initially reviews pending public uploads only');
  await page.waitForSelector('.ap-image');assert.equal(await page.locator('.ap-image').evaluate(im=>getComputedStyle(im).filter),'none','admin can inspect the sharp original before approval');
  await page.getByText('사진을 열지 못했어요. 새로고침해 주세요.',{exact:true}).waitFor();
  for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'admin photo review fits '+width);}
  await page.setViewportSize({width:390,height:844});
  const card=id=>page.locator(`[data-photo-id="${id}"]`);
  await card('pending').getByRole('button',{name:'승인 · 공개',exact:true}).click();await page.waitForFunction(()=>fixture.rows.find(r=>r.id==='pending').status==='approved');await card('pending').waitFor({state:'detached'});
  await page.getByLabel('사진 승인 상태').selectOption('approved');await card('pending').waitFor();assert.equal(await page.locator('.ap-card').count(),2);
  await card('pending').getByRole('button',{name:'숨김',exact:true}).click();await card('pending').waitFor({state:'detached'});
  await page.getByLabel('사진 승인 상태').selectOption('hidden');await card('pending').waitFor();
  await page.evaluate(()=>fixture.fail=true);await card('pending').getByRole('button',{name:'승인 · 공개',exact:true}).click();await page.getByText('서버 오류 · 다시 시도',{exact:true}).waitFor();assert.equal(await card('pending').getByRole('button',{name:'승인 · 공개',exact:true}).isEnabled(),true);
  await page.evaluate(()=>fixture.fail=false);
  await card('pending').getByRole('button',{name:'반려',exact:true}).click();await card('pending').waitFor({state:'detached'});
  await page.getByLabel('사진 승인 상태').selectOption('rejected');await card('pending').waitFor();
  await page.getByLabel('사진 승인 상태').selectOption('all');await page.waitForFunction(()=>document.querySelectorAll('.ap-card').length===3);assert.equal(await page.getByText('친구공개 사진',{exact:true}).count(),0);assert.equal(await page.getByText('비공개 사진',{exact:true}).count(),0);
  await page.evaluate(()=>fixture.rows.push({id:'new',nick:'새 전체공개 사진',status:'pending',visibility:'public',image_path:'new.jpg',created_at:new Date().toISOString()}));
  await page.locator('.ap-stage').getByRole('button',{name:'새로고침',exact:true}).click();await card('new').waitFor();
  await page.evaluate(()=>fixture.delay=true);await card('new').getByRole('button',{name:'승인 · 공개',exact:true}).click();await page.waitForFunction(()=>typeof fixture.resolve==='function');
  await page.locator('[data-act="adm-area"][data-v="account"]').click();assert.equal(await page.locator('#world-admin-photo-stages').count(),1,'navigation is held while photo approval saves');
  await page.evaluate(()=>{fixture.delay=false;fixture.resolve();});await page.waitForFunction(()=>fixture.rows.find(r=>r.id==='new').status==='approved');await page.waitForFunction(()=>!document.querySelector('.ap-head select').disabled);
  await page.evaluate(()=>{fixture.admin=false;fixture.listeners.forEach(fn=>fn('SIGNED_OUT',null));});await page.getByText('관리자 계정으로 다시 열어 주세요.',{exact:true}).waitFor();assert.equal(await page.locator('.ap-image').count(),0,'account changes remove reviewed originals');
  assert.deepEqual(errors,[]);console.log('PASS: World admin entry, pending public photos, sharp moderation preview, approve/reject/hide/retry, newly uploaded photos, save navigation guard and sign-out cleanup');
 }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
