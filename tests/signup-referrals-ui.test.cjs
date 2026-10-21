const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..'),origin='https://referral.test';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
   const file=path.resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
   return file.startsWith(root+path.sep)&&fs.existsSync(file)?route.fulfill({path:file}):route.abort();
  });
  await context.addInitScript(()=>{
   const f=window.referralFixture={signups:[],searches:[],people:[{id:'00000000-0000-4000-8000-000000000001',nickname:'민준'},{id:'00000000-0000-4000-8000-000000000002',nickname:'민준이'}],pending:[],defer:false,fail:false};
   const client={auth:{onAuthStateChange(){},async getSession(){return{data:{session:null}};},async getUser(){return{data:{user:null}};},async signUp(args){f.signups.push(args);return{data:{session:null}};}},async rpc(name,args){
    if(name!=='search_signup_referrers')throw Error('Unexpected RPC '+name);
    f.searches.push(args);if(f.defer)return new Promise(resolve=>f.pending.push(resolve));
    return f.fail?{error:{message:'synthetic failure'}}:{data:args.p_query==='없음'?[]:f.people};
   }};window.supabase={createClient:()=>client};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const open=async()=>{await page.goto(origin+'/?auth=signup');await page.locator('#auth-dialog[open]').waitFor();await page.locator('#signup-referrer').waitFor();};
  const fill=async()=>{
   for(const[id,value]of Object.entries({nickname:'합성회원',email:'referral-fixture@example.invalid',password:'fixture-password','password-confirm':'fixture-password','signup-birth':'000101','signup-code':'3','signup-phone':'01012345678'}))await page.locator('#'+id).fill(value);
   await page.locator('#age-check').check();await page.locator('#policy-check').check();
  };
  const confirm=async()=>{await page.getByRole('button',{name:'민준 추천인으로 선택',exact:true}).click();await page.getByRole('button',{name:'이 사람이 맞아요',exact:true}).click();};
  await open();await fill();assert.equal(await page.locator('#signup-referrer').getAttribute('required'),null);
  await page.locator('#auth-submit').click();await page.waitForFunction(()=>referralFixture.signups.length===1);
  assert.equal(await page.evaluate(()=>'referrer_id'in referralFixture.signups[0].options.data),false,'blank referral is optional');
  assert.equal(await page.evaluate(()=>referralFixture.searches.length),0,'blank signup needs no lookup');

  await open();await fill();await page.locator('#signup-referrer').fill('민쥰');
  await page.getByRole('button',{name:'민준 추천인으로 선택',exact:true}).waitFor();
  assert.equal(await page.locator('.referral-candidate').count(),2);
  await page.locator('#auth-submit').click();assert.match(await page.locator('#auth-feedback').textContent(),/선택.*확인/);
  assert.equal(await page.evaluate(()=>referralFixture.signups.length),0);
  await page.getByRole('button',{name:'민준 추천인으로 선택',exact:true}).click();
  assert.match(await page.locator('.referral-confirm').textContent(),/민준.*맞나요/);
  await page.locator('#auth-submit').click();assert.equal(await page.evaluate(()=>referralFixture.signups.length),0,'candidate requires explicit confirmation');
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:844});
   assert.equal(await page.locator('.dialog-shell').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'signup fits '+width);
   if(process.env.REFERRAL_PROOF_DIR){fs.mkdirSync(process.env.REFERRAL_PROOF_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.REFERRAL_PROOF_DIR,`signup-confirm-${width}.png`)});}
  }
  await page.getByRole('button',{name:'이 사람이 맞아요',exact:true}).click();
  await page.locator('#signup-referrer').fill('민준이');await page.locator('#auth-submit').click();
  assert.equal(await page.evaluate(()=>referralFixture.signups.length),0,'editing clears confirmation');
  await page.locator('#signup-referrer').fill('민준');await confirm();
  await page.locator('#auth-submit').click();await page.waitForFunction(()=>referralFixture.signups.length===1);
  const data=await page.evaluate(()=>referralFixture.signups[0].options.data);
  assert.equal(data.referrer_id,'00000000-0000-4000-8000-000000000001');assert.equal(data.referrer_nickname,'민준');
  assert.equal(await page.locator('#signup-referrer').inputValue(),'','success clears selection');

  await open();await fill();await page.locator('#signup-referrer').fill('민준');await confirm();
  await page.evaluate(()=>referralFixture.people=[]);await page.locator('#auth-submit').click();
  await page.waitForFunction(()=>document.querySelector('#auth-feedback').textContent.includes('추천인 정보가 바뀌었어요'));
  assert.equal(await page.evaluate(()=>referralFixture.signups.length),0,'deleted/renamed referrer cannot be submitted');
  await page.getByRole('button',{name:'추천인 없이 가입',exact:true}).click();await fill();
  await page.locator('#auth-submit').click();await page.waitForFunction(()=>referralFixture.signups.length===1);
  assert.equal(await page.evaluate(()=>'referrer_id'in referralFixture.signups[0].options.data),false);

  await open();await page.evaluate(()=>referralFixture.defer=true);
  await page.locator('#signup-referrer').fill('이전');await page.waitForFunction(()=>referralFixture.pending.length===1);
  await page.locator('#signup-referrer').fill('새이름');await page.waitForFunction(()=>referralFixture.pending.length===2);
  await page.evaluate(()=>referralFixture.pending[1]({data:[{id:'00000000-0000-4000-8000-000000000003',nickname:'새이름'}]}));
  await page.getByRole('button',{name:'새이름 추천인으로 선택',exact:true}).waitFor();
  await page.evaluate(()=>referralFixture.pending[0]({data:referralFixture.people}));
  assert.deepEqual(await page.locator('.referral-candidate').allTextContents(),['새이름'],'late search cannot replace current results');
  await page.locator('#login-tab').click();assert.equal(await page.locator('#signup-referral-slot').isVisible(),false);
  await page.locator('#signup-tab').click();await page.locator('[data-close-dialog]').click();
  await page.locator('[data-open-auth=signup]').click();assert.equal(await page.locator('#signup-referrer').inputValue(),'');
  assert.deepEqual(errors,[]);
  console.log('PASS: real signup form optional/explicit referral confirmation, edit invalidation, deleted target, metadata, skip, stale requests, mode/reset and responsive widths; no live signup');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
