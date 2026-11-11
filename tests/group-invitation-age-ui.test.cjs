const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.join(__dirname,'..');
test('invitation failures retain age gates and retry controls in Chromium',async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    for(const width of [390,1280])for(const eligible of [false,true])for(const transportFailure of [false,true]){
      const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.abort());
      try{
        await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><main id="app"></main><div id="toast"></div>');
        await page.addStyleTag({path:path.join(root,'groups/style.css')});
        await page.evaluate(({eligible,transportFailure})=>{
          const id='00000000-0000-4000-8000-000000000001',room='10000000-0000-4000-8000-000000000001',invite='20000000-0000-4000-8000-000000000001';
          window.calls=[];window.retry=false;
          window.OJJUDA_CONFIG={supabaseUrl:'https://example.supabase.co',supabaseKey:'public'};
          const invitations=[{id:invite,room_id:room,group_name:'성인 모임',sender_name:'친구',age_policy:'adults',age_eligible:eligible}];
          window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id}}}),onAuthStateChange:()=>{}},rpc:async(name,args)=>{
            const action=name==='group_home'?'home':args.p_action;calls.push(action);
            if(action==='home')return {data:{rooms:[],directory:[],invitations}};
            if(action==='decline'){
              if(window.retry)return {data:{ok:true}};
              return new Promise((resolve,reject)=>{window.failDecline=()=>transportFailure?reject(Error('연결 실패')):resolve({error:{message:'연결 실패'}});});
            }
            if(action==='received')return {data:[]};
            throw Error('Unexpected RPC: '+action);
          }})};
        },{eligible,transportFailure});
        await page.addScriptTag({path:path.join(root,'groups/app.js')});
        const accept=page.locator('[data-accept-invite]'),decline=page.locator('[data-decline-invite]');
        await decline.waitFor();assert.equal(await accept.isDisabled(),!eligible);
        await decline.click();await page.waitForFunction(()=>typeof window.failDecline==='function');
        assert.equal(await accept.isDisabled(),true);assert.equal(await decline.isDisabled(),true);
        await page.evaluate(()=>{document.querySelector('[data-decline-invite]').click();document.querySelector('[data-accept-invite]').click();});
        assert.deepEqual(await page.evaluate(()=>calls),['home','decline'],'pending decisions cannot be duplicated');
        await page.evaluate(()=>failDecline());await page.waitForFunction(()=>!document.querySelector('[data-decline-invite]').disabled);
        assert.equal(await accept.isDisabled(),!eligible,'failure preserves the original admission gate');
        assert.match(await page.locator('#toast').textContent(),/연결 실패/);
        if(!eligible){await accept.evaluate(button=>button.click());assert.equal(await page.evaluate(()=>calls.includes('accept')),false);}
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${width}px has no horizontal overflow`);
        await page.evaluate(()=>window.retry=true);await decline.click();await decline.waitFor({state:'detached'});
        assert.deepEqual(await page.evaluate(()=>calls),['home','decline','decline','received']);assert.deepEqual(errors,[]);
      }finally{await page.close();}
    }
  }finally{await browser.close();}
});
