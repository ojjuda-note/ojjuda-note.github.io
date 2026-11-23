const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..'),origin='https://referral.test';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 let page;
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
   const file=path.resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
   return file.startsWith(root+path.sep)&&fs.existsSync(file)?route.fulfill({path:file}):route.abort();
  });
  await context.addInitScript(()=>{
   const mode=new URL(location.href).searchParams.get('fixture_referral');
   const f=window.referralFixture={signups:[],signins:[],searches:[],resolutions:[],people:[{id:'00000000-0000-4000-8000-000000000001',nickname:'민준'},{id:'00000000-0000-4000-8000-000000000002',nickname:'민준이'}],pending:[],defer:false,fail:false,
    resolvePending:[],resolveDefer:mode==='pending',resolveFail:mode==='offline',resolveMissing:mode==='missing'};
   const client={auth:{onAuthStateChange(){},async getSession(){return{data:{session:null}};},async getUser(){return{data:{user:null}};},async signUp(args){f.signups.push(args);return{data:{session:null}};},async signInWithPassword(args){f.signins.push(args);return{error:{message:'Invalid login credentials'}};}},async rpc(name,args){
    if(name==='mask_banned')return{data:args.t};
    if(name==='resolve_signup_referrer'){
     f.resolutions.push(args);
     if(f.resolveDefer)return new Promise(resolve=>f.resolvePending.push(resolve));
     if(f.resolveFail)return{error:{message:'Synthetic invitation lookup failure'}};
     return{data:f.resolveMissing?[]:f.people.filter(person=>person.id===args.p_ref)};
    }
    if(name!=='search_signup_referrers')throw Error('Unexpected RPC '+name);
    f.searches.push(args);if(f.defer)return new Promise(resolve=>f.pending.push(resolve));
    return f.fail?{error:{message:'synthetic failure'}}:{data:args.p_query==='없음'?[]:f.people};
   }};window.supabase={createClient:()=>client};window.OjjudaGetClient=async()=>client;
  });
  page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const open=async(query='')=>{await page.goto(origin+'/?auth=signup'+query);await page.locator('#auth-dialog[open]').waitFor();await page.locator('#signup-referrer').waitFor();};
  const fill=async()=>{
   for(const[id,value]of Object.entries({email:'referral-fixture@ojjuda.kr',password:'fixture-password','password-confirm':'fixture-password','signup-birth':'000101','signup-code':'3','signup-phone':'01023456789'}))await page.locator('#'+id).fill(value);
   await page.locator('#age-check').check();await page.locator('#policy-check').check();
  };
  const confirm=async()=>{await page.getByRole('button',{name:'민준 추천인으로 선택',exact:true}).click();await page.getByRole('button',{name:'이 사람이 맞아요',exact:true}).click();};
  await open();
  const initialNickname=await page.locator('#nickname').inputValue();
  assert.ok(initialNickname.length>0&&initialNickname.length<=12,'signup provides a valid-length nickname without input');
  assert.equal(await page.locator('#nickname').evaluate(el=>el.readOnly),false,'signup nickname is suggested automatically and remains editable');
  await fill();assert.equal(await page.locator('#signup-referrer').getAttribute('required'),null);
  await page.locator('#auth-submit').click();await page.waitForFunction(()=>referralFixture.signups.length===1);
  assert.equal(await page.evaluate(()=>referralFixture.signups[0].options.data.nickname),initialNickname,'signup sends the displayed automatic nickname');
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
  const searchButton=page.locator('[data-referral-search]');
  await page.locator('#signup-referrer').press('Enter');
  await searchButton.click();
  assert.equal(await page.evaluate(()=>referralFixture.searches.length),1,'one pending search for automatic lookup, Enter and click');
  await page.evaluate(()=>referralFixture.pending[0]({error:{message:'fixture failure'}}));
  await page.getByRole('status').filter({hasText:'추천인을 찾지 못했어요'}).waitFor();
  await searchButton.click();
  await page.waitForFunction(()=>referralFixture.pending.length===2);
  await page.locator('#signup-referrer').fill('새이름');await page.waitForFunction(()=>referralFixture.pending.length===3);
  await page.evaluate(()=>referralFixture.pending[2]({data:[{id:'00000000-0000-4000-8000-000000000003',nickname:'새이름'}]}));
  await page.getByRole('button',{name:'새이름 추천인으로 선택',exact:true}).waitFor();
  await page.evaluate(()=>referralFixture.pending[1]({data:referralFixture.people}));
  assert.deepEqual(await page.locator('.referral-candidate').allTextContents(),['새이름'],'late search cannot replace current results');
  await page.locator('#login-tab').click();assert.equal(await page.locator('#signup-referral-slot').isVisible(),false);
  await page.locator('#signup-tab').click();
  assert.deepEqual(await page.locator('.referral-candidate').allTextContents(),['새이름']);
  await page.getByRole('button',{name:'새이름 추천인으로 선택',exact:true}).click();
  await page.locator('#login-tab').click();await page.locator('#signup-tab').click();
  await page.getByRole('button',{name:'이 사람이 맞아요',exact:true}).click();
  assert.equal(await page.evaluate(()=>referralFixture.searches.length),3,'switching tabs preserves candidates and confirmation without a new lookup');
  await page.locator('[data-close-dialog]').click();
  await page.locator('#account-actions [data-open-auth="signup"]').click();assert.equal(await page.locator('#signup-referrer').inputValue(),'');

  await page.clock.install({time:new Date('2026-11-16T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-11-16T00:01:00Z'));
  await page.locator('#signup-referrer').fill('민준');
  await page.locator('#login-tab').click();
  await page.clock.runFor(350);
  assert.equal(await page.evaluate(()=>referralFixture.searches.length),3,'an unsent search waits while signup is hidden');
  await page.locator('#signup-tab').click();await page.clock.runFor(350);
  assert.equal(await page.evaluate(()=>referralFixture.pending.length),4,'returning starts the deferred search once');
  await page.locator('#login-tab').click();
  await page.evaluate(()=>referralFixture.pending[3]({data:referralFixture.people}));
  await page.locator('#signup-tab').click();await confirm();
  assert.equal(await page.evaluate(()=>referralFixture.searches.length),4,'a reply received on the login tab can still be selected');
  await page.locator('#signup-referrer').fill('닫기');await page.clock.runFor(350);
  await page.locator('[data-close-dialog]').click();
  await page.locator('#account-actions [data-open-auth="signup"]').click();
  await page.evaluate(()=>referralFixture.pending[4]({data:referralFixture.people}));
  assert.equal(await page.locator('.referral-candidate').count(),0,'a closed form discards its late reply');
  assert.equal(await page.locator('#referral-status').textContent(),'');

  await page.clock.resume();
  const invitation='00000000-0000-4000-8000-000000000001';
  const autoReady=async()=>page.waitForFunction(()=>document.getElementById('signup-referrer')?.value==='민준'&&document.getElementById('referral-status')?.textContent.includes('초대'));
  await open('&ref='+invitation);await autoReady();await fill();
  assert.equal(await page.locator('.referral-confirm').isVisible(),false,'a valid invitation does not require manual confirmation');
  await page.locator('#login-tab').click();await page.locator('#signup-tab').click();await autoReady();
  // Switching authentication tabs intentionally clears both password fields.
  await fill();
  await page.locator('#auth-submit').click();await page.waitForFunction(()=>referralFixture.signups.length===1);
  const automatic=await page.evaluate(()=>referralFixture.signups[0].options.data);
  assert.equal(automatic.referrer_code,invitation);
  assert.equal('referrer_id'in automatic,false);assert.equal('referrer_nickname'in automatic,false,'automatic attribution never mixes manual metadata');
  assert.equal(await page.evaluate(()=>OjjudaInvite.pending()),null,'successful signup consumes the pending invitation');
  assert.equal(new URL(page.url()).searchParams.has('ref'),false);
  assert.equal(await page.locator('#signup-referrer').inputValue(),'');

  await open('&ref='+invitation);await autoReady();await fill();
  await page.evaluate(()=>referralFixture.people[0].nickname='❤️❤️'.repeat(4));
  await page.locator('#auth-submit').click();await page.waitForFunction(()=>referralFixture.signups.length===1);
  assert.equal(await page.evaluate(()=>referralFixture.signups[0].options.data.referrer_code),invitation,'a nickname change does not invalidate the public UUID');
  assert.ok((await page.evaluate(()=>referralFixture.resolutions)).every(args=>args.p_ref===invitation));

  await open('&ref='+invitation);await autoReady();
  await page.locator('#signup-referrer').fill('민준이');
  assert.equal(await page.evaluate(()=>OjjudaInvite.pending()),null,'a deliberate manual edit clears automatic attribution');
  await page.getByRole('button',{name:'민준이 추천인으로 선택',exact:true}).click();
  await page.getByRole('button',{name:'이 사람이 맞아요',exact:true}).click();await fill();
  await page.locator('#auth-submit').click();await page.waitForFunction(()=>referralFixture.signups.length===1);
  const manual=await page.evaluate(()=>referralFixture.signups[0].options.data);
  assert.equal(manual.referrer_id,'00000000-0000-4000-8000-000000000002');assert.equal(manual.referrer_nickname,'민준이');
  assert.equal('referrer_code'in manual,false,'an edited manual choice never retains the received code');

  await open('&ref='+invitation);await autoReady();
  await page.getByRole('button',{name:'추천인 없이 가입',exact:true}).click();await fill();
  assert.equal(await page.evaluate(()=>OjjudaInvite.pending()),null);
  await page.locator('#auth-submit').click();await page.waitForFunction(()=>referralFixture.signups.length===1);
  assert.equal(await page.evaluate(()=>Object.keys(referralFixture.signups[0].options.data).some(key=>key.startsWith('referrer_'))),false);

  for(const mode of ['offline','missing']){
   await open('&ref='+invitation+'&fixture_referral='+mode);await fill();
   await page.getByRole('button',{name:'초대 다시 확인',exact:true}).waitFor();
   await page.locator('#auth-submit').click();
   assert.equal(await page.evaluate(()=>referralFixture.signups.length),0,mode+': unresolved attribution is not silently discarded');
   assert.equal(await page.evaluate(()=>OjjudaInvite.pending()),invitation);
   await page.evaluate(()=>{referralFixture.resolveFail=false;referralFixture.resolveMissing=false;});
   await page.getByRole('button',{name:'초대 다시 확인',exact:true}).click();await autoReady();await fill();
   await page.locator('#auth-submit').click();await page.waitForFunction(()=>referralFixture.signups.length===1);
   assert.equal(await page.evaluate(()=>referralFixture.signups[0].options.data.referrer_code),invitation,mode+': retry keeps the same code');
  }

  await open('&ref='+invitation+'&fixture_referral=pending');await fill();
  await page.waitForFunction(()=>referralFixture.resolvePending.length===1);
  await page.locator('#auth-submit').click();
  assert.equal(await page.evaluate(()=>referralFixture.signups.length),0,'signup waits for a pending invitation lookup');
  await page.getByRole('button',{name:'추천인 없이 가입',exact:true}).click();
  await page.evaluate(()=>{referralFixture.resolveDefer=false;referralFixture.resolvePending[0]({data:referralFixture.people.slice(0,1)});});
  assert.equal(await page.locator('#signup-referrer').inputValue(),'','a late lookup cannot restore a declined invitation');
  assert.equal(await page.evaluate(()=>OjjudaInvite.pending()),null);
  await fill();
  await page.locator('#auth-submit').click();await page.waitForFunction(()=>referralFixture.signups.length===1);
  assert.equal(await page.evaluate(()=>'referrer_code'in referralFixture.signups[0].options.data),false);

  await open('&ref='+invitation+'&fixture_referral=pending');await fill();
  await page.waitForFunction(()=>referralFixture.resolvePending.length===1);
  await page.locator('#login-tab').click();await page.locator('#password').fill('fixture-password');await page.locator('#auth-submit').click();
  await page.waitForFunction(()=>referralFixture.signins.length===1&&!document.getElementById('auth-submit').disabled);
  await page.locator('#signup-tab').click();
  await page.waitForFunction(()=>referralFixture.resolvePending.length===2);
  await page.evaluate(()=>{referralFixture.resolveDefer=false;referralFixture.resolvePending[1]({data:referralFixture.people.slice(0,1)});});
  await autoReady();
  await page.evaluate(()=>referralFixture.resolvePending[0]({data:referralFixture.people.slice(1)}));
  assert.equal(await page.locator('#signup-referrer').inputValue(),'민준','a cancelled lookup cannot replace the retried invitation');
  await fill();
  await page.locator('#auth-submit').click();await page.waitForFunction(()=>referralFixture.signups.length===1);
  assert.equal(await page.evaluate(()=>referralFixture.signups[0].options.data.referrer_code),invitation,'a failed login does not leave automatic signup attribution stuck loading');
  assert.deepEqual(errors,[]);
  console.log('PASS: real signup manual confirmation and automatic invitation attribution, nickname changes, retry/skip/pending state, metadata and responsive widths; no live signup');
 }catch(error){
  if(page&&!page.isClosed()){
   try{
    console.error('Signup referral failure state:',JSON.stringify(await page.evaluate(()=>({
     authFeedback:document.getElementById('auth-feedback')?.textContent||'',
     referralStatus:document.getElementById('referral-status')?.textContent||'',
     signupCount:window.referralFixture?.signups.length||0,
     signinCount:window.referralFixture?.signins.length||0
    }))));
    if(process.env.REFERRAL_PROOF_DIR){fs.mkdirSync(process.env.REFERRAL_PROOF_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.REFERRAL_PROOF_DIR,'signup-failure.png'),fullPage:true});}
   }catch(diagnosticError){console.error('Could not capture referral failure:',diagnosticError.message);}
  }
  throw error;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
