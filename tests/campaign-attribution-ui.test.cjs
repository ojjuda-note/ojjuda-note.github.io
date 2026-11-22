const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const tags='utm_source=threads&utm_medium=social&utm_campaign=onecard-20261121&utm_content=threads-onecard-20261121';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());if(url.origin!=='https://ojjuda.kr')return route.abort();
      const file=path.resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
      return file.startsWith(root+path.sep)&&fs.existsSync(file)?route.fulfill({path:file}):route.abort();
    });
    await context.addInitScript(()=>{
      const f=window.campaignFixture={calls:[],signups:[],fail:new URL(location.href).searchParams.has('fixture_offline')};
      const client={auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}};},signUp:async args=>{f.signups.push(args);return{data:{session:null}};}},rpc:async(name,args)=>{
        f.calls.push({name,args});if(name==='mask_banned')return{data:args.t};
        if(name==='resolve_signup_referrer')return{data:[{id:args.p_ref,nickname:'초대회원'}]};
        if(name==='record_campaign_event')return f.fail?{error:{message:'fixture offline'}}:{data:{ok:true,accepted:true}};
        return{data:{ok:true,day:new Date(Date.now()+9*3600000).toISOString().slice(0,10),server_now:new Date().toISOString()}};
      }};window.supabase={createClient:()=>client};window.OjjudaGetClient=async()=>client;
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    for(const offline of [false,true]){
      await page.goto('https://ojjuda.kr/?auth=signup&ref=00000000-0000-4000-8000-000000000001&'+tags+(offline?'&fixture_offline=1':''));
      await page.locator('#signup-referrer').waitFor();await page.waitForFunction(()=>document.getElementById('signup-referrer').value==='초대회원');
      for(const [id,value]of Object.entries({email:'campaign-fixture@ojjuda.kr',password:'fixture-password','password-confirm':'fixture-password','signup-birth':'000101','signup-code':'3','signup-phone':'01023456789'}))await page.locator('#'+id).fill(value);
      await page.locator('#age-check').check();await page.locator('#policy-check').check();await page.locator('#auth-submit').click();
      await page.waitForFunction(()=>campaignFixture.signups.length===1);
      const sent=await page.evaluate(()=>campaignFixture.signups[0].options.data);
      assert.equal(sent.referrer_code,'00000000-0000-4000-8000-000000000001','existing invite attribution is preserved');
      assert.equal('campaign_visit_token'in sent,!offline,'measurement failure does not prevent the signup request');
      assert.equal(await page.evaluate(()=>campaignFixture.calls.some(x=>x.args?.p_event==='signup_complete')),false,'no client completion counter');
      await page.evaluate(()=>sessionStorage.removeItem('ojjuda.campaign-session.v1'));
    }
    assert.deepEqual(errors,[]);
    await page.setContent('<link rel="stylesheet" href="https://ojjuda.kr/admin/visitors.css"><main id="host"></main>');
    await page.addScriptTag({content:read('admin/visitors.js')});
    await page.evaluate(()=>{
      const row={source:'threads',medium:'social',campaign:'c'.repeat(64),content:'p'.repeat(64),visits:8,signup_starts:3,confirmed_signups:1};
      const data={model:'session24h-confirm7d',started_at:'2026-11-20T15:00:00Z',date_from:'2026-10-23',date_to:'2026-11-21',totals:{visits:8,signup_starts:3,confirmed_signups:1},rows:[row],truncated:false};
      window.testCampaignOwner='admin';window.testCampaignData=data;
      window.testCampaignControl=OjjudaAdminVisitors.mount({container:document.getElementById('host'),getAdminId:()=>window.testCampaignOwner,
        client:{rpc:async name=>name==='admin_campaign_signup_stats'?{data:window.testCampaignData}:{error:{message:'old graph unavailable'}},auth:{onAuthStateChange(fn){window.testCampaignAuthChange=fn;}}}});
    });
    await page.locator('.visitor-campaigns table').waitFor();
    for(const width of [320,390,750]){
      await page.setViewportSize({width,height:844});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'campaign table stays inside viewport '+width);
      assert.equal(await page.locator('.visitor-campaigns .visitor-table-wrap').evaluate(el=>el.scrollWidth>=el.clientWidth),true);
    }
    await page.evaluate(()=>{testCampaignData.rows[0].content='person@example.com';return testCampaignControl.refresh();});
    assert.match(await page.locator('.visitor-campaigns').innerText(),/확인하지 못했어요/);
    assert.doesNotMatch(await page.locator('.visitor-campaigns').innerText(),/@example/);
    await page.evaluate(()=>{testCampaignOwner=null;testCampaignAuthChange('SIGNED_OUT',null);});
    assert.equal(await page.locator('.visitor-campaigns').evaluate(el=>el.childElementCount),0,'logout clears campaign data');
    await context.close();
  }finally{await browser.close();}
  for(const file of ['index.html','world.html','features/pajang/index.html','features/pajang/station.html','games/onecard/index.html',
    'games/moonlit-tarot/index.html','games/starlit-saju/index.html','features/biorhythm/index.html'])assert.match(read(file),/growth-attribution\.js\?v=/,file);
  console.log('PASS: real signup referral coexistence, measurement failure isolation, responsive admin table and logout');
})().catch(error=>{console.error(error);process.exitCode=1;});
